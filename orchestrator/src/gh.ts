import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * The repo is pinned rather than inferred. A second git remote makes every `gh`
 * invocation exit with "multiple remotes detected", which reads at a call site
 * like an auth or network failure rather than a configuration one. This repo is
 * meant to have exactly one remote (asserted by `doctor`); the pin means a
 * violation cannot silently retarget the fleet at another repository.
 */
export const REPO = 'rhonda-rodododo/llamenos-platform'

export function ghArgs(args: string[]): string[] {
  return args.includes('-R') || args.includes('--repo') ? args : [...args, '-R', REPO]
}

/** Runs gh by argv — never through a shell. Returns stdout. Throws on non-zero exit. */
export async function gh(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync('gh', ghArgs(args), {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout
}

const STDERR_SNIPPET_CHARS = 200

/**
 * A `gh` failure rendered for a human, in one line. Exit code first because
 * it separates the classes at a glance — a non-zero code is gh refusing
 * (auth, 404, rate limit), a signal is a timeout, and neither is a JSON
 * parse error. The stderr snippet is bounded because this goes in a log
 * line, and `gh` can emit a great deal of it.
 */
export function describeGhFailure(e: unknown): string {
  const err = e as { code?: unknown; signal?: unknown; killed?: boolean; stderr?: string; message?: string }
  const how = typeof err.code === 'number' ? `exit ${err.code}`
    : err.killed === true || err.signal != null ? `killed (${String(err.signal ?? 'timeout')})`
    : err.code != null ? `error ${String(err.code)}`
    : 'threw'
  const detail = (err.stderr ?? '').trim() || (err.message ?? String(e)).trim()
  return `${how}: ${detail.replace(/\s+/g, ' ').slice(0, STDERR_SNIPPET_CHARS)}`
}

/**
 * Returns `undefined` on ANY failure — never an empty array or null. Callers
 * must be able to tell "nothing there" from "could not look". Collapsing those
 * two is how a fleet reports a quiet night over a full backlog.
 *
 * `onFailure` exists because returning `undefined` alone destroys the one
 * thing needed to diagnose the failure. The fleet's first scheduled tick
 * after going live aborted with `source unreadable for lane backend` and
 * nothing else — no exit code, no stderr, no error class — so a credential
 * problem, a rate limit, a network blip and a real outage were
 * indistinguishable, and the pass that fails closed also failed silently.
 */
export async function ghJson<T>(
  args: string[],
  timeoutMs = 60_000,
  onFailure?: (detail: string) => void,
): Promise<T | undefined> {
  try {
    const out = await gh(args, timeoutMs)
    return JSON.parse(out) as T
  } catch (e) {
    onFailure?.(describeGhFailure(e))
    return undefined
  }
}
