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

/**
 * Returns `undefined` on ANY failure — never an empty array or null. Callers
 * must be able to tell "nothing there" from "could not look". Collapsing those
 * two is how a fleet reports a quiet night over a full backlog.
 */
export async function ghJson<T>(args: string[], timeoutMs = 60_000): Promise<T | undefined> {
  try {
    const out = await gh(args, timeoutMs)
    return JSON.parse(out) as T
  } catch {
    return undefined
  }
}
