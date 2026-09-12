import { checkBreakers, inQuotaCooldown } from './circuit.js'
import { LIMITS, MAX_ATTEMPTS_PER_ITEM, type Lane } from './config.js'
import { failedAttemptsIn, type Outcome, type RunRecord } from './ledger.js'
import { mayAutoMerge } from './merge.js'
import { runReviewLoop, type SecondOpinionInput, type SecondOpinionResult } from './review.js'
import { judge, selectForLane, type Rejection } from './select.js'
import type { WorkItem } from './source.js'
import type { VerifyInput, VerifyReport } from './verify.js'

export interface DispatchOutcome {
  outcome: Outcome
  note?: string
  pr?: string
  branch?: string
  worktree?: string
}

/**
 * The single exit for a dispatched item, whatever happened to it. Runs on
 * every outcome — success, a rejection at any gate, a thrown exception — and
 * must not itself throw (callers wrap it defensively regardless, but a real
 * implementation that can fail loudly during its own cleanup defeats the
 * point). Responsible for: stopping the worker's session, killing anything
 * still alive inside its worktree, salvaging any uncommitted work to a
 * pushed branch BEFORE the worktree is destroyed, destroying the worktree,
 * and labelling the issue with the outcome.
 *
 * Salvage-before-destroy is not a style preference: Atlas lost 1,070 correct
 * lines to a 61-minute timeout whose worktree was deleted out from under it.
 * The work existed and was right; the cleanup path threw it away. `settle`
 * exists so that can't happen here.
 */
export interface SettleInput {
  item: WorkItem
  lane: Lane
  outcome: Outcome
  worktree?: string
  branch?: string
  pr?: string
}

export interface TickDeps {
  lanes: Lane[]
  now(): number
  acquireLock(): { held: true; release(): void } | { held: false; heldByPid: number }
  checkHalt(): Promise<{ halted: boolean; reason?: string }>
  readLedger(): RunRecord[]
  resumedAt(): number
  listItems(lane: Lane): Promise<WorkItem[] | undefined>
  readLabels(id: string): Promise<string[] | undefined>
  dispatch(item: WorkItem, lane: Lane): Promise<DispatchOutcome>
  /** Mechanical gates: scope, never-write, diff-targeted tests. Injected so
   *  `tick` stays testable without a real worktree or a real `bunx vitest`. */
  verifyMechanical(input: VerifyInput): Promise<VerifyReport>
  /** The PR's diff text, handed to the non-author reviewer alongside the
   *  mechanical report. */
  prDiff(pr: string): Promise<string>
  /** The non-author engine's verdict. Only ever called after `verifyMechanical`
   *  has passed — never to rescue a mechanical failure. */
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
  postReview(pr: string, verdict: SecondOpinionResult['verdict'], body: string): Promise<void>
  /**
   * Sends a FAIL/UNREADABLE verdict back to the SAME worker session that
   * opened the PR, its worktree left intact, and resolves once it has
   * revised — see `runReviewLoop`'s own doc comment (review.ts) for why
   * this is safe (engines.ts's `dispatch` deliberately never tears the
   * session down on return) and why it is bounded at
   * `MAX_REVIEW_ROUNDS` rounds regardless of what this returns. Takes the
   * item and lane (rather than just the verdict text) because the caller
   * needs both to address the correct worker session by name.
   */
  reviseWithWorker(item: WorkItem, lane: Lane, verdictText: string): Promise<void>
  /** Trips the kill switch fleet-wide. Only ever invoked by `runReviewLoop`
   *  for a `VerifierTamperedWorktreeError` — a trust failure in the
   *  non-author verification rail itself, never for an ordinary
   *  FAIL/UNREADABLE review verdict. */
  haltFleet(reason: string): void
  ciStatusFor(pr: string): Promise<boolean | undefined>
  /** The PR's CURRENT head commit, read immediately before the merge decision
   *  — never the commit `verifyMechanical` examined, which is a separate,
   *  frozen record on `VerifyReport.verifiedCommit`. */
  prHeadSha(pr: string): Promise<string | undefined>
  mergePr(pr: string, expectedHeadSha: string): Promise<void>
  commentOnIssue(itemId: string, body: string): Promise<void>
  settle(input: SettleInput): Promise<void>
  record(r: RunRecord): void
  log(msg: string): void
}

export interface TickResult {
  ran: boolean
  halted?: boolean
  haltReason?: string
  aborted?: 'source-unreadable' | 'breaker' | 'error'
  breakerReason?: string
  errorMessage?: string
  /** Every dispatch() call made, whether it succeeded or threw. Not a count
   *  of successes — see `failed` for the subset that threw. */
  attempted: number
  /** Of `attempted`, the count that threw and were recorded FAILED. */
  failed: number
  shadowed: number
  rejections: { id: string; reason: Rejection }[]
}

const empty = (over: Partial<TickResult> = {}): TickResult =>
  ({ ran: false, attempted: 0, failed: 0, shadowed: 0, rejections: [], ...over })

let counter = 0
function runId(now: number): string {
  counter = (counter + 1) % 0xffff
  return `${now.toString(36)}${counter.toString(36).padStart(3, '0')}`
}

const NOTE_MAX_CHARS = 300

function truncateNote(s: string): string {
  return s.length > NOTE_MAX_CHARS ? s.slice(0, NOTE_MAX_CHARS) : s
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return truncateNote(msg)
}

/**
 * Lane order is claim priority. The first lane able to claim an item owns it,
 * so two workers never race the same issue — concurrency is prevented here
 * rather than coordinated later.
 */
export function claimAcrossLanes(lanes: Lane[], itemsByLane: Map<string, WorkItem[]>): Map<string, string> {
  const owned = new Map<string, string>()
  for (const lane of lanes) {
    for (const item of itemsByLane.get(lane.id) ?? []) {
      if (!owned.has(item.id)) owned.set(item.id, lane.id)
    }
  }
  return owned
}

type BaseRecord = Pick<RunRecord, 'ts' | 'runId' | 'lane' | 'itemId' | 'itemName' | 'engine'>

/**
 * The live-dispatch pipeline for exactly one item. Order is the safety
 * property, not a style choice:
 *
 * 1. A `DISPATCHED` ledger row, written BEFORE the worker runs — this is
 *    what `rateBreaker` counts (issue #638). Nothing wrote this row before;
 *    the dispatch-rate ceiling was permanently unreachable as a result.
 * 2. `deps.dispatch(...)` — the worker's own session, worktree, PR.
 * 3. `verifyMechanical(...)`. A failure here is immediate and terminal:
 *    REJECTED, with the reasons commented on the issue. No review is ever
 *    requested for a diff that failed mechanically — a second opinion may
 *    only downgrade a pass, never rescue a failure.
 * 4. `secondOpinion(...)`, posted as a PR review, only reached once
 *    mechanical verification has passed.
 * 5. `mayAutoMerge(...)`, called unconditionally once a review verdict
 *    exists (PASS, FAIL, or UNREADABLE) so it remains the single place that
 *    decision is made — `tick` never second-guesses it by branching around
 *    it. A refusal reads as BLOCKED when the review itself passed (a human
 *    gate — CI, high impact, a branch that moved), or REJECTED when the
 *    review did not.
 * 6. Exactly one terminal ledger row, whatever the outcome.
 * 7. `settle()` — unconditionally, even when something above threw.
 */
async function runLiveDispatch(
  deps: TickDeps,
  item: WorkItem,
  lane: Lane,
  base: BaseRecord,
): Promise<{ outcome: Outcome; threw: boolean }> {
  deps.record({ ...base, outcome: 'DISPATCHED' })

  let worktree: string | undefined
  let branch: string | undefined
  let pr: string | undefined
  let final: RunRecord
  let threw = false

  try {
    const result = await deps.dispatch(item, lane)
    worktree = result.worktree
    branch = result.branch
    pr = result.pr

    if (result.outcome === 'SUCCESS' && branch !== undefined && pr !== undefined && worktree !== undefined) {
      // The bounded mechanical-verify -> second-opinion -> (on FAIL) revise
      // -> re-verify loop (task 13, review.ts). Mechanical failure is
      // terminal on whatever round it happens (no review is ever requested
      // for it); a tamper detection trips the kill switch via `haltFleet`
      // and is never retried — both handled entirely inside the loop, not
      // here.
      const loop = await runReviewLoop(
        { authorEngine: lane.engine, pr, worktree, branch, lane },
        {
          verifyMechanical: deps.verifyMechanical,
          prDiff: deps.prDiff,
          secondOpinion: deps.secondOpinion,
          postReview: deps.postReview,
          reviseWithWorker: ({ verdictText }) => deps.reviseWithWorker(item, lane, verdictText),
          haltFleet: deps.haltFleet,
          log: deps.log,
        },
      )
      const verifyReport = loop.lastReport

      if (verifyReport === undefined || !verifyReport.passed) {
        const reasons = verifyReport?.reasons ?? []
        await deps.commentOnIssue(
          item.id,
          `Mechanical verification failed after ${loop.rounds} round(s):\n- ${reasons.join('\n- ')}`,
        )
        final = {
          ...base, outcome: 'REJECTED', branch, pr,
          note: truncateNote(reasons.join('; ') || 'mechanical verification failed'),
        }
      } else if (loop.finalVerdict !== 'PASS') {
        await deps.commentOnIssue(
          item.id,
          `Review did not pass after ${loop.rounds} round(s) (final verdict: ${loop.finalVerdict}) — needs a human.`,
        )
        final = {
          ...base, outcome: 'REJECTED', branch, pr,
          note: truncateNote(`review ${loop.finalVerdict} after ${loop.rounds} round(s)`),
        }
      } else {
        const [ciGreen, headSha] = await Promise.all([deps.ciStatusFor(pr), deps.prHeadSha(pr)])
        const decision = mayAutoMerge(verifyReport, ciGreen === true, loop.finalVerdict, headSha ?? '')

        if (decision.merge) {
          await deps.mergePr(pr, verifyReport.verifiedCommit ?? '')
          final = { ...base, outcome: 'SUCCESS', branch, pr, note: truncateNote(decision.reason) }
        } else {
          await deps.commentOnIssue(item.id, `Auto-merge withheld: ${decision.reason}`)
          // A review that PASSED but was still refused a merge is a human
          // gate (CI red, high impact, a branch that moved) — BLOCKED, not a
          // rejection of the work.
          final = { ...base, outcome: 'BLOCKED', branch, pr, note: truncateNote(decision.reason) }
        }
      }
    } else {
      // The worker itself did not reach a mergeable state (BLOCKED, FAILED,
      // TIMEOUT, QUOTA — or claimed SUCCESS without the fields that would
      // make it verifiable, which is recorded as-is rather than guessed at).
      //
      // QUOTA specifically: this plumbing (the ledger outcome, the
      // consecutive-failure breaker excluding it, `inQuotaCooldown`'s
      // per-lane backoff above) is correct but currently UNREACHABLE against
      // a real worker — `engines.ts`'s `statusToOutcome` has no status
      // string that maps to `'QUOTA'`, because `dispatch-one.sh` has no
      // quota-detection of its own yet. A real provider rate limit today
      // surfaces as a plain `FAILED`, which feeds the failure-streak breaker
      // and halts the fleet — safe, just less efficient than the per-lane
      // cooldown this exists for. Do not assume QUOTA is live end-to-end
      // until the engine side actually detects a quota condition and reports
      // it through the status file.
      final = { ...base, ...result }
    }
  } catch (e) {
    threw = true
    final = { ...base, outcome: 'FAILED', note: errorMessage(e), branch, pr }
  }

  deps.record(final)

  try {
    await deps.settle({ item, lane, outcome: final.outcome, worktree, branch, pr })
  } catch (e) {
    // settle() failing must not abort the pass or hide the outcome already
    // recorded above — it is logged and the loop continues.
    deps.log(`settle failed for item ${item.id}: ${errorMessage(e)}`)
  }

  return { outcome: final.outcome, threw }
}

/**
 * `tick()` always returns; it never throws. Every abnormal exit — a halted
 * fleet, a tripped breaker, an unreadable source, or an unexpected rejection
 * anywhere in this pass — comes back as a `TickResult` a human can read, not
 * an uncaught rejection that crashes the scheduler process and leaves no
 * ledger row explaining why. A single failed `dispatch()` is handled closer
 * to its source (recorded FAILED, loop continues); this catch is the backstop
 * for everything else that can reject: `checkHalt`, `listItems`,
 * `readLabels`, or a `readLedger`/`now` that throws synchronously.
 */
export async function tick(deps: TickDeps): Promise<TickResult> {
  let lock: ReturnType<TickDeps['acquireLock']> | undefined

  try {
    lock = deps.acquireLock()
    if (!lock.held) {
      deps.log(`another scheduler holds the lock (pid ${lock.heldByPid})`)
      return empty()
    }

    const halt = await deps.checkHalt()
    if (halt.halted) {
      deps.log(`halted: ${halt.reason ?? 'unknown'}`)
      return empty({ ran: true, halted: true, haltReason: halt.reason })
    }

    const rows = deps.readLedger()
    const now = deps.now()
    const tripped = checkBreakers(rows, LIMITS, now, deps.resumedAt())
    if (tripped) {
      // checkBreakers() itself writes the halt file — see circuit.ts — so by
      // the time this line runs the fleet is already halted for real, not
      // merely aborted for this one pass.
      deps.log(`breaker tripped: ${tripped} — halted`)
      return empty({ ran: true, aborted: 'breaker', breakerReason: tripped })
    }

    const active = deps.lanes.filter((l) => l.mode !== 'off')
    const itemsByLane = new Map<string, WorkItem[]>()
    const allRejections: { id: string; reason: Rejection }[] = []
    const labelCache = new Map<string, string[] | undefined>()

    for (const lane of active) {
      const items = await deps.listItems(lane)
      // An unreadable source is NOT an empty one. Aborting the whole pass is
      // the only way a credential failure cannot masquerade as a quiet night.
      if (items === undefined) {
        deps.log(`source unreadable for lane ${lane.id} — aborting pass`)
        return empty({ ran: true, aborted: 'source-unreadable' })
      }
      for (const item of items) {
        if (!labelCache.has(item.id)) labelCache.set(item.id, await deps.readLabels(item.id))
      }
      const { candidates, rejections } = selectForLane(items, labelCache, lane)
      itemsByLane.set(lane.id, candidates)
      allRejections.push(...rejections)
    }

    const owned = claimAcrossLanes(active, itemsByLane)
    let attempted = 0
    let failed = 0
    let shadowed = 0

    for (const lane of active) {
      let taken = 0

      // Lane-level backoff: one provider's quota should not stop every other
      // lane. Checked once per lane, not per item — the cooldown does not
      // depend on which item is up next.
      const cooling = lane.mode === 'live' && inQuotaCooldown(rows, lane.id, now, LIMITS)
      if (cooling) {
        deps.log(`lane ${lane.id} is in quota cooldown — skipping this pass`)
      }

      for (const item of itemsByLane.get(lane.id) ?? []) {
        if (owned.get(item.id) !== lane.id) continue
        if (taken >= lane.cap) break

        if (failedAttemptsIn(rows, item.id) >= MAX_ATTEMPTS_PER_ITEM) {
          deps.log(`item ${item.id} has exhausted ${MAX_ATTEMPTS_PER_ITEM} attempts — leaving for a human`)
          continue
        }

        // Re-checked between EVERY dispatch: a stop lands within one worker,
        // not within one pass.
        const mid = await deps.checkHalt()
        if (mid.halted) {
          deps.log(`halted mid-pass: ${mid.reason ?? 'unknown'}`)
          return { ran: true, halted: true, haltReason: mid.reason, attempted, failed, shadowed, rejections: allRejections }
        }

        if (cooling) continue

        const base: BaseRecord = { ts: deps.now(), runId: runId(deps.now()), lane: lane.id, itemId: item.id, itemName: item.title, engine: lane.engine }

        if (lane.mode === 'shadow') {
          deps.record({ ...base, outcome: 'SHADOW', note: `would dispatch to ${lane.id}; scope=${lane.scope.owned.join(',')}` })
          shadowed++
          taken++
          continue
        }

        // Issue #639: labels are read fresh here, immediately before
        // dispatch — never from the selection-time cache above, which can
        // already be minutes stale by the time a lane's cap allows this item
        // through. "Someone added needs-human while we were deciding" is
        // exactly the case this re-check exists for. `judge()` is re-applied
        // in full (not just the veto check) so a label read that fails
        // outright is treated the same as a fresh veto: skipped, not
        // dispatched on stale data.
        const freshLabels = await deps.readLabels(item.id)
        const verdict = judge(item, freshLabels, lane)
        if (!verdict.ok) {
          deps.log(`item ${item.id} rejected at dispatch time: ${verdict.reason}`)
          allRejections.push({ id: item.id, reason: verdict.reason })
          continue
        }

        const { threw } = await runLiveDispatch(deps, item, lane, base)
        if (threw) failed++
        attempted++
        taken++
      }
    }

    return { ran: true, attempted, failed, shadowed, rejections: allRejections }
  } catch (e) {
    const msg = errorMessage(e)
    deps.log(`tick failed: ${msg}`)
    return empty({ ran: true, aborted: 'error', errorMessage: msg })
  } finally {
    // `acquireLock()` itself may have thrown before `lock` was assigned (e.g.
    // an unwritable $HOME, a full disk, a read-only remount surfacing as a
    // non-EEXIST errno) — guard against releasing a lock we never held.
    if (lock?.held) lock.release()
  }
}
