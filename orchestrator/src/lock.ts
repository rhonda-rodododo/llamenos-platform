import { openSync, writeSync, closeSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { FLEET_DIR, LOCK_FILE } from './paths.js'

export type Lock = { held: true; release(): void } | { held: false; heldByPid: number }

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e
}

/**
 * A pidfile with an explicit liveness probe, not flock(2): a stale lock must be
 * recoverable by looking at it, not by guessing which process died.
 */
export function acquire(): Lock {
  mkdirSync(FLEET_DIR, { recursive: true })
  return attempt(true)
}

/**
 * `allowReap` bounds recursion to a single reap-and-retry. Two processes that
 * both reap the same stale lock at once must not send each other into mutual
 * recursion — the second attempt either succeeds, finds a now-live holder, or
 * gives up and reports `held: false` rather than trying a third time.
 */
function attempt(allowReap: boolean): Lock {
  try {
    const fd = openSync(LOCK_FILE, 'wx')      // O_CREAT | O_EXCL
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return { held: true, release: releaseIfMine }
  } catch (e) {
    // Only EEXIST means contention — the lock file was not created and the
    // reap/retry path applies. Anything else (EACCES, EROFS, ENOSPC, ...)
    // means the lock could never be taken at all; recursing on that turns a
    // full disk or a permissions change into an unbounded stack-overflow
    // crash loop instead of a clean, reportable failure.
    if (!isErrnoException(e) || e.code !== 'EEXIST') {
      const code = isErrnoException(e) ? e.code : 'unknown'
      throw new Error(`cannot acquire lock at ${LOCK_FILE}: ${code}`, { cause: e })
    }
    const holder = Number.parseInt(safeRead(LOCK_FILE), 10)
    if (Number.isFinite(holder) && isAlive(holder)) return { held: false, heldByPid: holder }
    if (!allowReap) return { held: false, heldByPid: Number.isFinite(holder) ? holder : -1 }
    rmSync(LOCK_FILE, { force: true })        // stale — reap and retry once
    return attempt(false)
  }
}

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8').trim() } catch { return '' }
}

/** Re-reads the pid before deleting: never remove a lock someone else now holds. */
function releaseIfMine(): void {
  if (!existsSync(LOCK_FILE)) return
  if (safeRead(LOCK_FILE) !== String(process.pid)) return
  rmSync(LOCK_FILE, { force: true })
}
