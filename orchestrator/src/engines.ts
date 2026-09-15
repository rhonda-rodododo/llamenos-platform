import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DISPATCH_SCRIPT } from './paths.js'
import { checkDispatchDependency } from './dependency.js'
import { fleetBranchFor } from './ci.js'
import type { Lane } from './config.js'
import type { WorkItem } from './source.js'
import type { Outcome } from './ledger.js'

const execFileAsync = promisify(execFile)

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface DispatchRequest {
  name: string
  item: WorkItem
  lane: Lane
  briefPath: string
  timeoutSec: number
  model: string
  effort: EffortLevel
}

export interface DispatchResult {
  outcome: Outcome
  branch?: string
  pr?: string
  note?: string
  worktree?: string
}

/**
 * `~/tier-overnight-status/<name>.status`, written by dispatch-one.sh. Not in
 * paths.ts because it is a property of the dispatch dependency's contract
 * (STATUS_DIR, overridable in the shell via `STATUS_DIR=`), not of this
 * fleet's own state — same reasoning that keeps DISPATCH_SCRIPT out of
 * FLEET_DIR.
 */
const STATUS_DIR = join(homedir(), 'tier-overnight-status')

function statusFilePath(name: string): string {
  return join(STATUS_DIR, `${name}.status`)
}

/**
 * dispatch-one.sh writes `key: value\n` lines. Values can themselves contain
 * a colon (e.g. `notes: fixed a: b mapping`), so only the FIRST colon on a
 * line splits key from value — splitting on every colon would truncate any
 * note that mentions a ratio, a URL, or a time. A line with no colon at all
 * (a truncated final write, mid-flush) is skipped rather than throwing: a
 * concurrently-written status file must never crash the poller reading it.
 */
export function parseStatusFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) out[key] = value
  }
  return out
}

/**
 * The full status vocabulary `dispatch-one.sh` can produce, audited directly
 * against the script (re-check there if this ever needs revisiting):
 *   - `DISPATCHED` — the initial seed written at launch, before the worker
 *     (or the launcher footer) has written anything of its own. Non-terminal.
 *   - `IN_PROGRESS` — the worker's own first write, per its prompt
 *     instructions ("write status: IN_PROGRESS as one of your first
 *     actions"). Non-terminal.
 *   - `SUCCESS` / `BLOCKED` / `FAILED` / `PARTIAL` / `NEEDS_CONTEXT` — the
 *     worker's own terminal statuses, per its prompt instructions.
 *   - `UNCONFIRMED` — written by the launcher footer (`_launcher_footer`,
 *     around dispatch-one.sh:1063-1072) when the runtime process exits
 *     without the worker ever having written a terminal status itself, but
 *     its last recorded turn looks like a clean, non-error finish. The
 *     footer's own comment calls this "a machine-readable UNCONFIRMED/FAILED
 *     row instead of silence" — it is written ONCE, after the process has
 *     already exited, so nothing can come after it. Terminal: leaving it out
 *     of this set is what let a lane with cap=1 sit idle for a full
 *     `timeoutSec + 30s` behind a worker that had already died, believing it
 *     was still being polled for progress that would never arrive.
 *   - `FAILED` is also written by that same footer when the last turn looks
 *     like an error or there is no result at all — already covered above.
 */
const TERMINAL_STATUSES: ReadonlySet<string> =
  new Set(['SUCCESS', 'BLOCKED', 'FAILED', 'NEEDS_CONTEXT', 'PARTIAL', 'UNCONFIRMED'])

/**
 * Exported as its own pure predicate — rather than left as a private detail
 * of the poll loop below — specifically so the vocabulary itself is directly
 * unit-testable. A gap here (a real terminal status this fleet doesn't
 * recognize as terminal) is invisible to every other test: it only manifests
 * as a poll loop that keeps running for a worker that has already finished,
 * which no unit test in this suite can observe (dispatch()'s I/O is not
 * mocked). Testing this function directly is the only way a regression here
 * gets caught before it costs a lane its full timeout.
 */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

/**
 * NEEDS_CONTEXT and PARTIAL both fold into BLOCKED: both mean a human has to
 * look, and the ledger's breaker logic only distinguishes SUCCESS from
 * everything else that is terminal-but-not-success.
 *
 * A NON-terminal status (IN_PROGRESS, DISPATCHED) — and anything this fleet
 * does not recognize — maps to FAILED, never to SUCCESS. A worker that never
 * wrote a terminal status is a worker that died (crashed, was killed, ran out
 * of budget mid-flight); calling that success is how a fleet reports work it
 * never actually did. Silence must be indistinguishable from failure, never
 * from success.
 *
 * `UNCONFIRMED` gets its own case rather than falling through to `default`
 * even though both produce FAILED: it is a KNOWN bad status (the launcher
 * footer's fallback when a worker's runtime exited without writing one of
 * its own — see the comment on `TERMINAL_STATUSES`), and should read in the
 * code as a recognized, named failure mode, distinct from a genuinely
 * unrecognized string this fleet has never seen before.
 */
export function statusToOutcome(status: string): Outcome {
  switch (status) {
    case 'SUCCESS': return 'SUCCESS'
    case 'FAILED': return 'FAILED'
    case 'BLOCKED': return 'BLOCKED'
    case 'NEEDS_CONTEXT': return 'BLOCKED'
    case 'PARTIAL': return 'BLOCKED'
    case 'UNCONFIRMED': return 'FAILED'
    default: return 'FAILED'
  }
}

export function readStatus(name: string): Record<string, string> | undefined {
  const path = statusFilePath(name)
  if (!existsSync(path)) return undefined
  try {
    return parseStatusFile(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

interface BuildArgsInput {
  name: string
  /** The work item's id — with the lane, the only input to the branch name. */
  itemId: string
  briefPath: string
  lane: Lane
  timeoutSec: number
  model: string
  effort: EffortLevel
}

/**
 * `--owns` is the ONLY thing standing between two concurrent workers and the
 * same file — it is rendered into the worker's prompt as the FILE OWNERSHIP
 * block that the scope checker later verifies the diff against. A lane with
 * an empty owned list has nothing to render, which is not "wide permissions",
 * it is "no permission check at all": the worker would receive no ownership
 * block and could write anywhere. Refusing to build args at all (rather than
 * passing `--owns ''` or omitting the flag) makes that failure loud instead
 * of quietly unscoped — the same reasoning `assertLiveLanesHaveScope` applies
 * at lane-load time, repeated here because a lane could in principle reach
 * this call with a scope that changed (or failed to load) since.
 */
export function buildArgs(req: BuildArgsInput): string[] {
  if (req.lane.scope.owned.length === 0) {
    throw new Error(
      `refusing to dispatch lane "${req.lane.id}" with an empty owned scope — ` +
      '--owns is the only thing standing between two workers and the same file',
    )
  }
  // `--branch` on EVERY dispatch: without it dispatch-one.sh cuts the
  // worktree on the worker NAME (`fleet-<lane>-<item>`), which is a tmux
  // session name, not the `fleet/<lane>/<item>` grammar everything
  // downstream derives lane, item and worktree from (issue #812).
  return [
    '--branch', fleetBranchFor(req.lane.id, req.itemId),
    '--agent', `${req.lane.id}-supervisor`,
    '--owns', req.lane.scope.owned.join(','),
    '--effort', req.effort,
    '--rules', 'llamenos',
    req.name,
    req.briefPath,
    String(req.timeoutSec),
    req.model,
  ]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const POLL_INTERVAL_MS = 5_000
/** Grace beyond the worker's own timeout for dispatch-one.sh's launcher to
 *  notice the timeout, write a terminal status, and flush it to disk. */
const POLL_GRACE_MS = 30_000

/**
 * Spawns the worker via `dispatch-one.sh` and waits for it to reach a
 * terminal status.
 *
 * Spawned by argv via `execFile`, never through a shell: `req.name` and
 * `req.briefPath` both ultimately derive from worker-authored GitHub content
 * (an issue title, a branch name) by the time later tasks build them, and a
 * `bash -c` string assembled from that content is exactly how the reference
 * system's dispatcher could be made to execute arbitrary commands with every
 * credential the orchestrator process holds — e.g. a committed file named
 * `$(...)`.
 *
 * Deliberately does NOT tear down the worktree or stop the tmux session on
 * return, terminal outcome or not. A later review loop sends the reviewer's
 * verdict back to this SAME session with its worktree intact so the worker
 * can revise; if dispatch tore things down here, that loop would be
 * impossible and the fleet would silently degrade to one-shot dispatch — the
 * exact limitation this system exists to remove. Teardown is `tick`'s job,
 * once, after the review loop for an item has actually ended.
 */
export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  const args = buildArgs({
    name: req.name, itemId: req.item.id, briefPath: req.briefPath, lane: req.lane,
    timeoutSec: req.timeoutSec, model: req.model, effort: req.effort,
  })

  // dispatch-one.sh itself returns almost immediately — it starts the worker
  // in a DETACHED tmux session (`tmux new-session -d`) and does not wait for
  // it. This execFile call is therefore bounded by a short timeout of its
  // own; the long wait below is for the worker's actual progress, tracked
  // through the status file, not through this child process.
  await execFileAsync(DISPATCH_SCRIPT, args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })

  // The launcher's DISPATCHED seed is the one status write that carries
  // `branch` and `worktree` — the worker's own terminal write never does
  // (issue #660). Read it NOW, before the worker overwrites it, so the
  // worktree dispatch-one.sh actually cut is known without reconstructing
  // its path convention. Best-effort: if the worker already overwrote it,
  // cli.ts's `resolveDispatchResult` falls back to asking git.
  const seed = readStatus(req.name)

  const deadline = Date.now() + req.timeoutSec * 1000 + POLL_GRACE_MS
  let status = readStatus(req.name)
  while (Date.now() < deadline) {
    status = readStatus(req.name)
    const raw = status?.['status']
    if (raw !== undefined && isTerminalStatus(raw)) break
    await sleep(POLL_INTERVAL_MS)
  }

  const rawStatus = status?.['status'] ?? 'DISPATCHED' // never observed a status file: treat as never-started
  const outcome = statusToOutcome(rawStatus)

  // Record the dependency's HEAD commit in the note so a run's behaviour can
  // always be traced back to the exact version of dispatch-one.sh that
  // produced it — the version pin this repo cannot otherwise express for a
  // dependency it does not vendor (see dependency.ts).
  const dep = checkDispatchDependency()
  const workerNote = status?.['notes']
  const note = `dep:${dep.commit ?? 'unknown'}${workerNote ? ` ${workerNote}` : ''}`

  const pr = status?.['pr']
  return {
    outcome,
    branch: status?.['branch'] ?? seed?.['branch'],
    pr: pr !== undefined && pr !== 'none' ? pr : undefined,
    note,
    worktree: status?.['worktree'] ?? seed?.['worktree'],
  }
}
