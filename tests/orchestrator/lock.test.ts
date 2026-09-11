import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { acquire } from '../../orchestrator/src/lock.js'
import { LOCK_FILE, FLEET_DIR } from '../../orchestrator/src/paths.js'

afterEach(() => { try { rmSync(LOCK_FILE) } catch { /* absent */ } })

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
})
