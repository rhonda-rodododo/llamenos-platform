import { openSync, writeSync, closeSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { FLEET_DIR, LOCK_FILE } from './paths.js'

export type Lock = { held: true; release(): void } | { held: false; heldByPid: number }

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * A pidfile with an explicit liveness probe, not flock(2): a stale lock must be
 * recoverable by looking at it, not by guessing which process died.
 */
export function acquire(): Lock {
  mkdirSync(FLEET_DIR, { recursive: true })
  try {
    const fd = openSync(LOCK_FILE, 'wx')      // O_CREAT | O_EXCL
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return { held: true, release: releaseIfMine }
  } catch {
    const holder = Number.parseInt(safeRead(LOCK_FILE), 10)
    if (Number.isFinite(holder) && isAlive(holder)) return { held: false, heldByPid: holder }
    rmSync(LOCK_FILE, { force: true })        // stale — reap and retry once
    return acquire()
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
