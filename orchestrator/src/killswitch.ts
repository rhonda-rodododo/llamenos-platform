import { existsSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { FLEET_DIR, HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE } from './paths.js'
import { ghJson } from './gh.js'
import { ensureDigestIssue, postBlockedPing, postResumedPing } from './digest-issue.js'
import { resumeCommand } from './digest.js'
import { GitHubSink, type WorkSink } from './sink.js'

const REPO_ROOT = process.env['FLEET_REPO_ROOT'] ?? process.cwd()

export const HALT_LABEL = 'halt'

export interface GhIssue {
  number: number
  title: string
  state: string
  labels: { name: string }[]
}

/** Fails CLOSED: a file that exists stops the fleet, and needs no network. */
export function haltedLocally(): boolean {
  return existsSync(HALT_FILE)
}

/**
 * Fails OPEN, deliberately. `undefined` means we could not read GitHub, and
 * treating that as a halt would make any API outage an invisible full stop
 * indistinguishable from a quiet night. The local file is the switch that
 * fails closed; this one is the switch that works from a phone.
 */
export function haltedOnGitHubFrom(issues: GhIssue[] | undefined): boolean {
  if (issues === undefined) return false
  return issues.some((i) => i.state === 'OPEN' && i.labels.some((l) => l.name === HALT_LABEL))
}

export async function haltedOnGitHub(): Promise<boolean> {
  const issues = await ghJson<GhIssue[]>([
    'issue', 'list', '--label', HALT_LABEL, '--state', 'open',
    '--json', 'number,title,state,labels',
  ])
  return haltedOnGitHubFrom(issues)
}

export async function checkHalt(): Promise<{ halted: boolean; reason?: string }> {
  if (haltedLocally()) {
    const reason = existsSync(HALT_REASON_FILE) ? readFileSync(HALT_REASON_FILE, 'utf8').trim() : 'halt file present'
    return { halted: true, reason }
  }
  if (await haltedOnGitHub()) return { halted: true, reason: `open issue labelled "${HALT_LABEL}"` }
  return { halted: false }
}

/**
 * Issue #838's "extra requirement": the fleet must be legible with no Claude
 * session running, which means a halt/resume cannot rely on a human reading
 * the systemd journal — it needs its own DI seam so `halt()`/`resume()` (the
 * single choke point every breaker and the manual kill switch already share,
 * per the comment above) can ping the dedicated GitHub issue without every
 * caller needing to know that. Defaulted to the real `ensureDigestIssue` +
 * `GitHubSink` in production; tests inject a fake so this module never makes
 * a real network call — see killswitch.test.ts.
 */
export interface HaltNotifyDeps {
  resolveDigestIssue(): Promise<string | undefined>
  sink: WorkSink
}

export const defaultHaltNotifyDeps = (): HaltNotifyDeps => ({
  resolveDigestIssue: ensureDigestIssue,
  sink: new GitHubSink(),
})

/**
 * Best-effort, exactly like `notify.ts`'s own sinks: a GitHub outage, a
 * missing `gh` binary, or the issue never having existed must never turn a
 * halt/resume — a file-based, network-free operation by design — into a
 * failure. Every branch that can throw is caught here; `halt()`/`resume()`
 * below awaits this so the ping is actually sent before a one-shot CLI
 * process exits (see cli.ts's `main()`: `process.exit(await handler(...))`
 * kills anything still in flight the instant the handler resolves), while
 * still never letting a rejection from here propagate to the caller.
 */
async function pingBlocked(reason: string, deps: HaltNotifyDeps): Promise<void> {
  try {
    const issueId = await deps.resolveDigestIssue()
    if (issueId === undefined) return
    await postBlockedPing(deps.sink, issueId, reason, resumeCommand(REPO_ROOT))
  } catch { /* best-effort — see the comment above */ }
}

async function pingResumed(deps: HaltNotifyDeps): Promise<void> {
  try {
    const issueId = await deps.resolveDigestIssue()
    if (issueId === undefined) return
    await postResumedPing(deps.sink, issueId)
  } catch { /* best-effort — see pingBlocked's comment */ }
}

/**
 * Breakers call this too: one halted state, one recovery path, no second
 * "soft halt" that a human cannot clear the same way.
 *
 * Deliberately NOT declared `async function`: the three synchronous
 * filesystem writes below happen unconditionally and IMMEDIATELY when this
 * is called, even if the caller never awaits the returned promise — only the
 * best-effort GitHub ping is asynchronous. A caller that does not need to
 * guarantee the ping was sent before it exits (nothing in this codebase
 * currently fits that description — see `pingBlocked`'s comment on why
 * `cli.ts`'s handlers DO await this) can safely ignore the return value: the
 * returned promise never rejects.
 */
export function halt(reason: string, deps: HaltNotifyDeps = defaultHaltNotifyDeps()): Promise<void> {
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(HALT_FILE, '')
  writeFileSync(HALT_REASON_FILE, reason)
  return pingBlocked(reason, deps)
}

/** Same synchronous-first shape as `halt()` above, for the same reason. */
export function resume(deps: HaltNotifyDeps = defaultHaltNotifyDeps()): Promise<void> {
  rmSync(HALT_FILE, { force: true })
  rmSync(HALT_REASON_FILE, { force: true })
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(RESUMED_AT_FILE, String(Date.now()))
  return pingResumed(deps)
}
