import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { acquire } from '../../orchestrator/src/lock.js'
import { LOCK_FILE, FLEET_DIR } from '../../orchestrator/src/paths.js'

// Mocked with a passthrough to the real module so every test but the two that
// override openSync below still hit the real filesystem — this only exists to
// give those two tests a seam to induce specific openSync failures.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual }
})

afterEach(() => {
  vi.restoreAllMocks()
  try { rmSync(LOCK_FILE) } catch { /* absent */ }
})

describe('lock', () => {
  it('acquires when free and releases', () => {
    const l = acquire()
    expect(l.held).toBe(true)
    expect(existsSync(LOCK_FILE)).toBe(true)
    if (l.held) l.release()
    expect(existsSync(LOCK_FILE)).toBe(false)
  })

  it('refuses when a live process holds it', () => {
    const first = acquire()
    expect(first.held).toBe(true)
    const second = acquire()
    expect(second.held).toBe(false)
    if (first.held) first.release()
  })

  it('reaps a lock held by a dead pid', () => {
    mkdirSync(FLEET_DIR, { recursive: true })
    writeFileSync(LOCK_FILE, '999999')   // pid that cannot exist
    const l = acquire()
    expect(l.held).toBe(true)
    if (l.held) l.release()
  })

  it('does not release a lock another process now owns', () => {
    const l = acquire()
    writeFileSync(LOCK_FILE, '999999')   // someone else took over
    if (l.held) l.release()
    expect(existsSync(LOCK_FILE)).toBe(true)
    rmSync(LOCK_FILE)
  })

  it('surfaces a non-EEXIST openSync failure as a thrown error, not recursion', async () => {
    const fs = await import('node:fs')
    const enospc: NodeJS.ErrnoException = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' })
    const spy = vi.spyOn(fs, 'openSync').mockImplementation(() => { throw enospc })
    expect(() => acquire()).toThrow(/ENOSPC/)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not recurse when a reaped lock is immediately re-contended', async () => {
    mkdirSync(FLEET_DIR, { recursive: true })
    writeFileSync(LOCK_FILE, '999999')   // dead pid — looks stale, triggers a reap
    const fs = await import('node:fs')
    const eexist: NodeJS.ErrnoException = Object.assign(new Error('file already exists'), { code: 'EEXIST' })
    const spy = vi.spyOn(fs, 'openSync').mockImplementation(() => { throw eexist })
    const result = acquire()
    expect(result.held).toBe(false)
    // Exactly two attempts: the initial EEXIST, one reap, then the retry's
    // EEXIST — never a third. This is the assertion that would catch mutual
    // recursion between two processes reaping the same stale lock at once.
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
