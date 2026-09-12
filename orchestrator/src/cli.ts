import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { acquire } from './lock.js'
import { checkHalt, halt, resume, haltedLocally } from './killswitch.js'
import { readAll, append, since, type RunRecord } from './ledger.js'
import { readResumedAt } from './circuit.js'
import { loadLanes, LIMITS, LANE_MODES_FILE, type Lane } from './config.js'
import { checkDispatchDependency, type DependencyReport } from './dependency.js'
import { buildBrief, renderBrief } from './brief.js'
import { loadContracts, contractsFor, buildMemoryContext, augmentBrief } from './memory.js'
import { dispatch as dispatchWorker, type EffortLevel } from './engines.js'
import { verifyMechanical } from './verify.js'
import { secondOpinion, postReview } from './review.js'
import { ciStatusFor, mergePr } from './merge.js'
import {
  settle as settleWorktree,
  destroyWorktree,
  findWorktreeForBranch,
  deleteLocalBranch,
} from './worktree.js'
import { GitHubSource, toWorkItem, type RawIssue } from './source.js'
import { tick, type TickDeps, type TickResult, type SettleInput, type DispatchOutcome } from './tick.js'
import type { WorkItem } from './source.js'
import { renderDigest, resumeCommand, type DigestInput, type LaneStatus } from './digest.js'
import { notify } from './notify.js'
import { FLEET_DIR, LOG_FILE, HALT_REASON_FILE, DISPATCH_SCRIPT } from './paths.js'
import { REPO, gh, ghJson } from './gh.js'
import { proposeIssues, buildIssueCreateArgs, type ProposedIssue } from './roles/planner.js'
import { updateBranchFromMain, type UpdateBranchInput, type UpdateBranchResult } from './roles/integrator.js'

const execFileAsync = promisify(execFile)

const REPO_ROOT = process.env['FLEET_REPO_ROOT'] ?? process.cwd()

function log(msg: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  const line = `${new Date().toISOString()} ${msg}\n`
  appendFileSync(LOG_FILE, line)
  process.stdout.write(line)
}

/**
 * The fleet log is a plain append-only stream of `<timestamp> <message>`
 * lines, and one message per tick is the JSON-encoded TickResult. Reading it
 * back lets `doctor` and `status` — neither of which calls `tick()` — report
 * whether the *last* pass ended in `aborted: 'error'` without needing a
 * second, separate "last result" file to keep in sync with the log.
 */
function lastTickResult(): TickResult | undefined {
  if (!existsSync(LOG_FILE)) return undefined
  const lines = readFileSync(LOG_FILE, 'utf8').split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const spaceIdx = line.indexOf(' ')
    const rest = spaceIdx >= 0 ? line.slice(spaceIdx + 1) : line
    try {
      const parsed: unknown = JSON.parse(rest)
      if (parsed !== null && typeof parsed === 'object' && 'ran' in parsed) return parsed as TickResult
    } catch {
      continue // not a TickResult line — an ordinary log message
    }
  }
  return undefined
}

export async function doctor(): Promise<number> {
  const checks: [string, boolean, string][] = []
  let ghOk = false
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' }); ghOk = true } catch { /* not authed */ }
  checks.push(['gh authenticated', ghOk, 'run: gh auth login'])

  // `gh repo view` takes its target as a bare positional argument, unlike
  // most other `gh` subcommands — it does not accept `-R`/`--repo` at all
  // ("unknown shorthand flag: 'R' in -R"). The shared `gh()` wrapper always
  // appends `-R <REPO>` for exactly the reason documented in gh.ts (pin the
  // repo, never infer it), so it cannot be used for this one command; call
  // the CLI directly instead, the same way the git-remote check below does.
  let repoOk = false
  try { execFileSync('gh', ['repo', 'view', REPO, '--json', 'name'], { stdio: 'pipe' }); repoOk = true } catch { /* unreadable */ }
  checks.push([`repo ${REPO} readable`, repoOk, 'check gh auth and network'])

  // Exactly one remote is an invariant, not a preference: a second remote
  // breaks bare `gh` and makes it possible to push fleet work to the wrong
  // repository. Asserted here so drift surfaces as a failed check.
  const remotes = execFileSync('git', ['remote'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').map((r) => r.trim()).filter(Boolean)
  checks.push([`exactly one git remote (found: ${remotes.join(', ') || 'none'})`,
    remotes.length === 1 && remotes[0] === 'origin',
    'git remote remove <name> — this repo must only ever have origin -> llamenos-platform'])

  const lanes = await loadLanes(REPO_ROOT)
  for (const l of lanes) {
    checks.push([`lane ${l.id} has scope paths`, l.scope.owned.length > 0,
      `check .claude/agents/fragments/${l.id}-supervisor.md "**Owned paths:**" section`])
  }
  checks.push(['not halted', !haltedLocally(),
    existsSync(HALT_REASON_FILE) ? `halted: ${readFileSync(HALT_REASON_FILE, 'utf8').trim()} — clear with: llamenos-fleet resume` : ''])
  checks.push(['command on PATH', existsSync(`${process.env['HOME']}/.local/bin/llamenos-fleet`),
    `ln -sf ${REPO_ROOT}/orchestrator/bin/llamenos-fleet ~/.local/bin/llamenos-fleet`])

  // R3: tick() never throws — every abnormal exit, including an unexpected
  // one, comes back as `aborted: 'error'`. doctor is a health check, so a
  // pass that errored last time must show up here even though doctor never
  // calls tick() itself.
  const last = lastTickResult()
  checks.push(['last tick pass did not error', last?.aborted !== 'error',
    last?.aborted === 'error' ? `${last.errorMessage ?? '(no message)'} — see ${LOG_FILE}` : ''])

  // The dispatch dependency lives outside this repo (a symlink into the
  // claude-skills git repo, see paths.ts) and cannot be pinned by a llamenos
  // commit, so doctor is the only place its state is ever surfaced. A dirty
  // dependency repo is reported as a WARNING below, not a hard check here —
  // it is normal while iterating on the skill — but every other problem
  // (missing/non-executable script, not a git repo, dead-command rules) is a
  // hard failure: those make dispatch behave in a way this repo cannot trace
  // or trust.
  const dep = checkDispatchDependency()
  const depHardProblems = dep.problems.filter((p) => !/uncommitted/i.test(p))
  checks.push([`dispatch dependency ok (${DISPATCH_SCRIPT})`, depHardProblems.length === 0,
    depHardProblems.join('; ')])

  let bad = 0
  for (const [name, ok, fix] of checks) {
    process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !fix ? '' : `\n        ${fix}`}\n`)
    if (!ok) bad++
  }

  // F7: a lane's owned list being non-empty (checked above) says nothing
  // about whether the paths in it actually exist. A fragment can drift from
  // the real tree (e.g. declaring `apps/sip-bridge/` when the directory is
  // actually `sip-bridge/` at the repo root) and the scope checker will
  // silently never match anything under it — the lane is not scoped down,
  // it is scoped to nothing. This is a WARNING, not a hard failure: it is
  // expected to fire for real drift already present on this branch (see
  // backend's fragment), and doctor must stay usable while that is fixed
  // separately rather than refusing to run at all.
  let warnings = 0
  for (const l of lanes) {
    const missing = l.scope.owned.filter((p) => !p.includes('*') && !existsSync(join(REPO_ROOT, p)))
    if (missing.length > 0) {
      warnings++
      process.stdout.write(` WARN  lane ${l.id} owns path(s) that do not exist on disk: ${missing.join(', ')}\n`)
      process.stdout.write(`        check .claude/agents/fragments/${l.id}-supervisor.md "**Owned paths:**" section\n`)
    }
  }

  const modes = lanes.map((l) => `${l.id}=${l.mode}`).join(' ')
  process.stdout.write(`\nlanes: ${modes}\n`)
  process.stdout.write(`lane modes file: ${LANE_MODES_FILE}${existsSync(LANE_MODES_FILE) ? '' : ' (absent — all lanes off)'}\n`)
  if (warnings > 0) {
    process.stdout.write(`\n${warnings} lane(s) with owned paths that do not exist on disk (warning only — see above)\n`)
  }

  process.stdout.write(`\ndispatch dependency: ${DISPATCH_SCRIPT}\n`)
  process.stdout.write(`dispatch dependency commit: ${dep.commit ?? '(unknown — not a readable git repo)'}\n`)
  if (dep.problems.length > 0) {
    for (const p of dep.problems) {
      const isWarning = /uncommitted/i.test(p)
      process.stdout.write(`${isWarning ? ' WARN ' : ' FAIL '} dispatch dependency: ${p}\n`)
    }
  }

  return bad === 0 ? 0 : 1
}

const BRIEFS_DIR = join(FLEET_DIR, 'briefs')

// dispatch-one.sh's own launcher grace beyond a worker's own timeout is 30s
// (engines.ts's POLL_GRACE_MS); 90 minutes is the worker budget itself — long
// enough for a real implementer pass, short enough that a wedged worker does
// not sit a lane's cap out for the rest of a shift.
const DEFAULT_TIMEOUT_SEC = 90 * 60
const DEFAULT_EFFORT: EffortLevel = 'high'
const DEFAULT_MODEL = 'sonnet'

/** One name identifies a dispatched item everywhere: the tmux session
 *  dispatch-one.sh starts, the status file it polls, and the handle `settle`
 *  uses to stop that same session and find its worktree. Lane + item id is
 *  unique by construction (`claimAcrossLanes` gives an item to exactly one
 *  lane), so this never collides across a concurrent pass. */
function nameFor(lane: Lane, item: WorkItem): string {
  return `fleet-${lane.id}-${item.id}`
}

async function realDispatch(item: WorkItem, lane: Lane): Promise<DispatchOutcome> {
  const branch = `fleet/${lane.id}/${item.id}`
  const baseBrief = buildBrief(item, lane, branch)
  // Prior-attempt history and governing contracts are memory.ts's sole
  // concern (see brief.ts's own comment on why: a caller rendering both
  // would duplicate the same failure history under two headings). Contracts
  // are scoped to this lane's owned paths — the same scope the worker's
  // brief already tells it not to leave.
  const contracts = contractsFor(lane.scope.owned, await loadContracts(REPO_ROOT))
  const memoryCtx = buildMemoryContext(item.id, readAll(), contracts)
  const brief = augmentBrief(baseBrief, memoryCtx)
  mkdirSync(BRIEFS_DIR, { recursive: true })
  const briefPath = join(BRIEFS_DIR, `${nameFor(lane, item)}.md`)
  writeFileSync(briefPath, renderBrief(brief))
  return dispatchWorker({
    name: nameFor(lane, item),
    item,
    lane,
    briefPath,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    model: lane.model ?? DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
  })
}

async function prDiff(pr: string): Promise<string> {
  return gh(['pr', 'diff', pr])
}

async function prHeadSha(pr: string): Promise<string | undefined> {
  const view = await ghJson<{ headRefOid: string }>(['pr', 'view', pr, '--json', 'headRefOid'])
  return view?.headRefOid
}

async function commentOnIssue(itemId: string, body: string): Promise<void> {
  await gh(['issue', 'comment', itemId, '--body', body])
}

async function settleItem(input: SettleInput): Promise<void> {
  await settleWorktree(
    { name: nameFor(input.lane, input.item), itemId: input.item.id, outcome: input.outcome, worktree: input.worktree, branch: input.branch },
    log,
  )
}

/**
 * Sends the reviewer's verdict back into the SAME tmux session
 * `dispatch-one.sh` started for this item (see `nameFor`) — the session
 * `dispatch()` (engines.ts) deliberately never tears down on a terminal
 * status, exactly so this call can still reach it with its worktree
 * intact. `tmux send-keys` types the text into the session's own stdin as
 * if a human had, then presses Enter; this is a best-effort mechanism, not
 * a guaranteed one — it depends on the worker's own CLI still being ready
 * to accept another turn of input at this point, which this repo has not
 * yet exercised end-to-end against a live worker. `runReviewLoop`'s bound
 * of `MAX_REVIEW_ROUNDS` (review.ts) limits the blast radius of that being
 * wrong to two rounds, never an unbounded retry.
 */
async function reviseWithWorker(item: WorkItem, lane: Lane, verdictText: string): Promise<void> {
  const name = nameFor(lane, item)
  const message = `The non-author reviewer requested changes on this PR:\n\n${verdictText}\n\nPlease revise.`
  await execFileAsync('tmux', ['send-keys', '-t', name, message, 'Enter'], { timeout: 10_000 })
}

async function runTick(): Promise<number> {
  const lanes = await loadLanes(REPO_ROOT)

  const deps: TickDeps = {
    lanes,
    now: () => Date.now(),
    acquireLock: acquire,
    checkHalt,
    readLedger: readAll,
    resumedAt: readResumedAt,
    listItems: (lane) => new GitHubSource(lane.requireLabel).list(),
    readLabels: (id) => new GitHubSource('').labels(id),
    dispatch: realDispatch,
    verifyMechanical,
    prDiff,
    secondOpinion,
    postReview,
    reviseWithWorker,
    haltFleet: halt,
    ciStatusFor,
    prHeadSha,
    mergePr,
    commentOnIssue,
    settle: settleItem,
    record: append,
    log,
  }
  const r = await tick(deps)
  log(JSON.stringify(r))

  // R1: `attempted` counts every dispatch() call, success or failure; `failed`
  // is the subset that threw. Printing both means "N attempted" never reads
  // as "N succeeded".
  process.stdout.write(
    `ran: ${r.ran} attempted: ${r.attempted} failed: ${r.failed} shadowed: ${r.shadowed} rejections: ${r.rejections.length}\n`,
  )

  // R3: tick() never throws — an aborted: 'error' pass is the CLI's first and
  // only chance to make an operator-visible distinction between "a quiet
  // night" and "something broke".
  if (r.aborted === 'error') {
    process.stderr.write(`ERROR: tick pass aborted with an error: ${r.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  if (r.aborted !== undefined) {
    process.stdout.write(`aborted: ${r.aborted}${r.breakerReason ? ` (${r.breakerReason})` : ''}\n`)
  }
  if (r.halted) {
    process.stdout.write(`halted: ${r.haltReason ?? 'unknown'}\n`)
  }
  return 0
}

function status(): number {
  const recent = since(24 * 3_600_000)
  const byOutcome = new Map<string, number>()
  for (const r of recent) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1)
  process.stdout.write(`halted: ${haltedLocally() ? 'YES' : 'no'}\n`)
  process.stdout.write(`runs (24h): ${recent.length}\n`)
  for (const [k, v] of [...byOutcome].sort()) process.stdout.write(`  ${k}: ${v}\n`)
  process.stdout.write(`limits: ${LIMITS.maxDispatchesPerHour}/h, halt after ${LIMITS.consecutiveFailuresToHalt} consecutive failures\n`)

  // R3: surface the last tick's error state here too — status is the command
  // an operator runs to ask "is this thing OK", and an errored pass must be
  // impossible to mistake for a quiet one.
  const last = lastTickResult()
  if (last?.aborted === 'error') {
    process.stdout.write(`last tick: ERROR — ${last.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  process.stdout.write(`last tick: ${last ? `ok (attempted ${last.attempted}, failed ${last.failed}, shadowed ${last.shadowed})` : 'none recorded yet'}\n`)
  return 0
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * The comment posted on the PR being reverted. Merges land `--squash`
 * specifically so a revert is always exactly one commit on `main` to undo —
 * this says so on the PR itself, for whoever finds it later wondering what
 * happened. `revert` does not touch the linked issue's labels: a human
 * decides what state the work should be in after a revert, not the fleet —
 * the fleet's job here is to undo its own artifact, not to render a
 * judgement about the work.
 */
const REVERT_COMMENT =
  'Reverted by `llamenos-fleet revert`. Merges land `--squash`, so this PR was exactly one ' +
  "commit on main — that commit is being undone. This does not relabel the linked issue: a " +
  'human decides what state the work should be in after a revert, not the fleet.'

export interface RevertDeps {
  findRecord(runId: string): RunRecord | undefined
  findWorktreeForBranch(branch: string): Promise<string | undefined>
  destroyWorktree(worktree: string): Promise<void>
  closePr(pr: string, comment: string): Promise<void>
  deleteBranch(branch: string): Promise<void>
  log(msg: string): void
}

/**
 * Undoes exactly one dispatched run's own artifact: the PR (closed, with the
 * branch deleted) and, since a squashed PR merge and a still-open PR both
 * leave a branch behind, the worktree and local branch too. Order matters —
 * git refuses to delete a branch that is checked out in any worktree — so
 * the worktree is torn down FIRST, freeing the branch, before either the PR
 * close or the explicit local branch delete run.
 *
 * A run with no `pr` (dispatch failed before one ever opened) still gets its
 * worktree and branch cleaned up; a run with no `branch` at all (dispatch
 * failed before even that) has nothing left to clean up beyond the ledger
 * lookup itself.
 */
export async function revert(runId: string, deps: RevertDeps): Promise<number> {
  const record = deps.findRecord(runId)
  if (record === undefined) {
    process.stderr.write(`revert: no ledger record found for runId "${runId}"\n`)
    return 1
  }

  if (record.branch !== undefined) {
    const worktree = await deps.findWorktreeForBranch(record.branch)
    if (worktree !== undefined) {
      try {
        await deps.destroyWorktree(worktree)
      } catch (e) {
        deps.log(`revert ${runId}: failed to remove worktree ${worktree}: ${errMsg(e)}`)
      }
    }
  }

  if (record.pr !== undefined) {
    try {
      await deps.closePr(record.pr, REVERT_COMMENT)
    } catch (e) {
      deps.log(`revert ${runId}: failed to close PR ${record.pr}: ${errMsg(e)}`)
    }
  }

  if (record.branch !== undefined) {
    try {
      await deps.deleteBranch(record.branch)
    } catch (e) {
      deps.log(`revert ${runId}: failed to delete branch ${record.branch}: ${errMsg(e)}`)
    }
  }

  deps.log(`REVERTED ${runId} (lane=${record.lane} item=${record.itemId})`)
  process.stdout.write(`reverted ${runId} (lane=${record.lane} item=${record.itemId})\n`)
  return 0
}

function defaultRevertDeps(): RevertDeps {
  return {
    findRecord: (runId) => readAll().find((r) => r.runId === runId),
    findWorktreeForBranch: (branch) => findWorktreeForBranch(REPO_ROOT, branch),
    destroyWorktree,
    closePr: async (pr, comment) => {
      await gh(['pr', 'close', pr, '--delete-branch', '--comment', comment])
    },
    deleteBranch: (branch) => deleteLocalBranch(REPO_ROOT, branch),
    log,
  }
}

const DEFAULT_DIGEST_HOURS = 12

/**
 * Pure assembly of `digest.ts`'s `DigestInput` from already-gathered facts —
 * split out from `runDigest` so the one property that matters most (a
 * source-unreadable last pass produces a degraded banner) is testable
 * without a filesystem or a `gh` call in sight.
 *
 * `lastTick` comes from the fleet log's own JSON-encoded `TickResult` lines
 * (`lastTickResult`, above) — `digest` is a separate process invocation from
 * `tick`, so this is the only channel carrying a pass's `rejections` and
 * `aborted` state forward to it.
 */
export function digestInputFrom(
  lastTick: TickResult | undefined,
  halted: boolean,
  haltReason: string | undefined,
  lanes: LaneStatus[],
  recentRuns: RunRecord[],
  dependency: DependencyReport,
  repoRoot: string,
): DigestInput {
  return {
    halted,
    haltReason,
    resumeCommand: resumeCommand(repoRoot),
    lanes,
    recentRuns,
    rejections: lastTick?.rejections ?? [],
    dependency,
    // R3/digest hardening: tick() reports `aborted: 'source-unreadable'`
    // when a lane's board could not be read, running zero dispatches without
    // halting the fleet. That is exactly the reference system's original
    // failure mode (a credential problem made every read fail, and the
    // digest reported a quiet night over a 98-card backlog) — this is the
    // one line that keeps a source-read failure from rendering identically
    // to a healthy, quiet one.
    sourceUnreadable: lastTick?.aborted === 'source-unreadable',
  }
}

async function runDigest(hoursArg?: string): Promise<number> {
  let hours = DEFAULT_DIGEST_HOURS
  if (hoursArg !== undefined) {
    const parsed = Number(hoursArg)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`digest: invalid hours "${hoursArg}"\n`)
      return 1
    }
    hours = parsed
  }

  const lanes = await loadLanes(REPO_ROOT)
  const haltedNow = haltedLocally()
  const haltReason = haltedNow && existsSync(HALT_REASON_FILE)
    ? readFileSync(HALT_REASON_FILE, 'utf8').trim()
    : undefined
  const dependency = checkDispatchDependency()

  const input = digestInputFrom(
    lastTickResult(),
    haltedNow,
    haltReason,
    lanes.map((l) => ({ id: l.id, mode: l.mode })),
    since(hours * 3_600_000),
    dependency,
    REPO_ROOT,
  )
  const body = renderDigest(input)
  process.stdout.write(body + '\n')

  // Best-effort, per notify.ts's own contract: a webhook or command sink
  // being unreachable must never fail this command — the digest was still
  // printed above (and to LOG_FILE via `log`), which is the fallback
  // delivery a fresh checkout with nothing configured relies on.
  const result = await notify('Llámenos fleet digest', body)
  if (!result.ok) {
    for (const e of result.errors) log(`digest notify sink failed: ${e}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// plan — the Planner role, wired to the only sanctioned issue-creation path
// ---------------------------------------------------------------------------

/** The document the Planner reads to decide what to propose next. Missing
 *  entirely is not an error here — the Planner still runs, just with less
 *  context, and its own near-duplicate check and `needs-human` gate are
 *  unaffected either way. */
const GOAL_DOCUMENT_PATH = process.env['FLEET_GOAL_DOCUMENT']
  ?? join(REPO_ROOT, 'docs', 'superpowers', 'plans', '2026-09-12-fleet-live-dispatch.md')

const PLANNER_MODEL = 'opus' // "the most capable model at high effort" per the design spec
const PLANNER_MAX_TURNS = 4
const PLANNER_TIMEOUT_MS = 15 * 60_000

/**
 * One-shot, read-only model invocation — the Planner's ENTIRE effectful
 * surface (see `proposeIssues`'s own boundary comment in roles/planner.ts).
 * `--permission-mode plan` is the same enforcement `review.ts` uses for the
 * non-author verifier: the model can reason over the prompt handed to it,
 * but cannot edit a file or run a destructive command even if it tried.
 */
async function invokePlannerModel(prompt: string): Promise<string> {
  const call = execFileAsync('claude', [
    '--print', '--permission-mode', 'plan', '--model', PLANNER_MODEL, '--max-turns', String(PLANNER_MAX_TURNS),
  ], { timeout: PLANNER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })
  call.child?.stdin?.end(prompt)
  const { stdout } = await call
  return stdout
}

/** The FULL open backlog, unfiltered by any lane's `requireLabel` — the
 *  Planner's near-duplicate check (`isNearDuplicate` in roles/planner.ts)
 *  needs every open issue, not just the subset already admitted to a lane's
 *  dispatch queue. `GitHubSource` is deliberately not reused here: its
 *  `list()` always filters by a required label, which is exactly what this
 *  read must NOT do. */
async function listOpenBacklog(): Promise<WorkItem[]> {
  const raw = await ghJson<RawIssue[]>([
    'issue', 'list', '--state', 'open', '--limit', '200',
    '--json', 'number,title,body,url,state,labels',
  ])
  return raw === undefined ? [] : raw.map(toWorkItem)
}

export interface PlanDeps {
  listOpenBacklog(): Promise<WorkItem[]>
  readRecentRuns(): RunRecord[]
  readGoalDocument(): string
  invoke(prompt: string): Promise<string>
  /**
   * The ONLY function in this file allowed to actually create a GitHub
   * issue for a plan proposal, and it is typed to accept nothing but the
   * argv `buildIssueCreateArgs` itself produces — there is no other
   * parameter shape a caller could construct issue-create argv from, so
   * this path cannot be bypassed by handing it a hand-assembled arg list
   * that "forgot" a label.
   */
  createIssue(args: ReturnType<typeof buildIssueCreateArgs>): Promise<string>
  log(msg: string): void
}

/**
 * Turns each of the Planner's proposals into a real GitHub issue through
 * `buildIssueCreateArgs` — the only sanctioned path, per roles/planner.ts's
 * own module comment — so `needs-human` is attached unconditionally on
 * every issue this command creates, with no parameter anywhere in this
 * function that could suppress it.
 */
export async function runPlanWith(deps: PlanDeps): Promise<number> {
  const [openBacklog, recentRuns, goalDocument] = [
    await deps.listOpenBacklog(), deps.readRecentRuns(), deps.readGoalDocument(),
  ]
  const proposals: ProposedIssue[] = await proposeIssues({
    goalDocument, openBacklog, recentRuns, invoke: deps.invoke,
  })
  for (const proposal of proposals) {
    const args = buildIssueCreateArgs(proposal)
    const out = await deps.createIssue(args)
    deps.log(`plan: created issue for lane ${proposal.lane} (needs-human): ${out.trim()}`)
  }
  process.stdout.write(`plan: proposed ${proposals.length} issue(s), each created with needs-human attached\n`)
  return 0
}

function defaultPlanDeps(): PlanDeps {
  return {
    listOpenBacklog,
    readRecentRuns: () => readAll(),
    readGoalDocument: () => (existsSync(GOAL_DOCUMENT_PATH) ? readFileSync(GOAL_DOCUMENT_PATH, 'utf8') : ''),
    invoke: invokePlannerModel,
    createIssue: (args) => gh(args),
    log,
  }
}

async function runPlan(): Promise<number> {
  return runPlanWith(defaultPlanDeps())
}

// ---------------------------------------------------------------------------
// integrate — the Integrator role's DIRTY-PR update sweep
// ---------------------------------------------------------------------------

/**
 * The fleet's own branch-naming convention (`realDispatch` above builds
 * branches shaped `fleet/${lane.id}/${item.id}`). This is a SCOPE decision
 * for `integrate` only — which PRs it bothers to update — not a security
 * guard: `updateBranchFromMain` (integrator.ts) never force-pushes anything
 * for any branch, fleet-owned or not, so there is no destructive capability
 * here left to gate. It exists purely so `integrate` does not spend its
 * sweep updating a human's own open PR from `main` uninvited.
 */
function isFleetDispatchedBranch(branch: string): boolean {
  return /^fleet\/[^/]+\/[^/]+$/.test(branch)
}

export interface DirtyFleetPr { pr: string; branch: string }

export interface IntegrateDeps {
  /** Every OPEN pull request whose merge state is `DIRTY` and whose branch
   *  the fleet itself dispatched (`isFleetDispatchedBranch`) — a human's
   *  own dirty PR is never in this list, purely so `integrate` doesn't
   *  touch a PR it didn't open. */
  listDirtyFleetPrs(): Promise<DirtyFleetPr[]>
  findWorktreeForBranch(branch: string): Promise<string | undefined>
  updateBranch(input: UpdateBranchInput): Promise<UpdateBranchResult>
  commentOnPr(pr: string, body: string): Promise<void>
  log(msg: string): void
}

/**
 * Sweeps every DIRTY PR the fleet itself dispatched and brings it up to
 * date with `main` via `updateBranchFromMain` (integrator.ts) — a merge
 * plus an ordinary, non-force push, never a rebase. A branch with no
 * worktree left (already cleaned up by `settle`) is skipped rather than
 * guessed at; a merge conflict is commented on the PR naming the
 * conflicting paths, never resolved automatically.
 */
export async function runIntegrateWith(deps: IntegrateDeps): Promise<number> {
  const dirty = await deps.listDirtyFleetPrs()
  let updated = 0
  let needsHuman = 0

  for (const { pr, branch } of dirty) {
    const worktree = await deps.findWorktreeForBranch(branch)
    if (worktree === undefined) {
      deps.log(`integrate: no worktree found for dirty branch "${branch}" (pr ${pr}) — skipping`)
      continue
    }
    const result = await deps.updateBranch({ worktree, branch })
    if (result.pushed) {
      updated++
      deps.log(`integrate: updated and re-pushed "${branch}" (pr ${pr})`)
    } else {
      needsHuman++
      await deps.commentOnPr(pr, `Integrator: ${result.reason}`)
      deps.log(`integrate: did not update "${branch}" (pr ${pr}): ${result.reason}`)
    }
  }

  process.stdout.write(`integrate: ${updated} updated, ${needsHuman} need a human, out of ${dirty.length} dirty PR(s)\n`)
  return 0
}

async function defaultListDirtyFleetPrs(): Promise<DirtyFleetPr[]> {
  const prs = await ghJson<{ number: number; headRefName: string; mergeStateStatus: string }[]>([
    'pr', 'list', '--state', 'open', '--limit', '100',
    '--json', 'number,headRefName,mergeStateStatus',
  ])
  if (prs === undefined) return []
  return prs
    .filter((p) => p.mergeStateStatus === 'DIRTY' && isFleetDispatchedBranch(p.headRefName))
    .map((p) => ({ pr: String(p.number), branch: p.headRefName }))
}

function defaultIntegrateDeps(): IntegrateDeps {
  return {
    listDirtyFleetPrs: defaultListDirtyFleetPrs,
    findWorktreeForBranch: (branch) => findWorktreeForBranch(REPO_ROOT, branch),
    updateBranch: updateBranchFromMain,
    commentOnPr: async (pr, body) => { await gh(['pr', 'comment', pr, '--body', body]) },
    log,
  }
}

async function runIntegrate(): Promise<number> {
  return runIntegrateWith(defaultIntegrateDeps())
}

type CommandHandler = (rest: string[]) => Promise<number> | number

/**
 * One dispatch table, not a `switch` plus a hand-maintained list of valid
 * names: `COMMANDS` (used by the systemd cross-check test) is derived from
 * this object's own keys, so a command that exists here is by construction
 * a command the CLI can run, and there is no second list that can drift out
 * of sync with it. This is exactly the bug this replaces: the digest timer's
 * `ExecStart=... llamenos-fleet digest` pointed at a subcommand that did not
 * exist in the old `switch`, with nothing to catch it before the timer fired
 * for real.
 */
const HANDLERS: Record<string, CommandHandler> = {
  doctor: () => doctor(),
  tick: () => runTick(),
  status: () => status(),
  halt: (rest) => { halt(rest.join(' ') || 'halted by hand'); log('HALTED'); return 0 },
  resume: () => { resume(); log('RESUMED'); return 0 },
  revert: (rest) => {
    const runId = rest[0]
    if (runId === undefined) {
      process.stderr.write('usage: llamenos-fleet revert <runId>\n')
      return 2
    }
    return revert(runId, defaultRevertDeps())
  },
  digest: (rest) => runDigest(rest[0]),
  plan: () => runPlan(),
  integrate: () => runIntegrate(),
}

/** Every subcommand name this CLI actually implements — see `HANDLERS`. */
export const COMMANDS = Object.keys(HANDLERS)

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)
  const handler = cmd !== undefined ? HANDLERS[cmd] : undefined
  if (handler === undefined) {
    process.stderr.write(`usage: llamenos-fleet <${COMMANDS.join('|')}>\n`)
    process.exit(2)
  }
  process.exit(await handler(rest))
}

// Guarded so this module can be `import`ed (as tests do, to exercise `doctor`
// and friends directly) without also running the CLI's argv-parsing entry
// point — `import.meta.main` is true only when this file is the process's
// own entry point (`bun orchestrator/src/cli.ts ...` or the `llamenos-fleet`
// wrapper), never when another module imports it.
if (import.meta.main) {
  void main().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(`FATAL: unhandled error in fleet CLI: ${msg}\n`)
    process.exit(1)
  })
}
