import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { checkHalt, halt, haltedLocally, haltedOnGitHubFrom, resume } from '../../orchestrator/src/killswitch.js'
import { FLEET_DIR, HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE } from '../../orchestrator/src/paths.js'
import { failureBreaker, readResumedAt, type Limits } from '../../orchestrator/src/circuit.js'
import type { RunRecord } from '../../orchestrator/src/ledger.js'

const LIMITS: Limits = { maxDispatchesPerHour: 6, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }
const failedAt = (ts: number): RunRecord =>
  ({ ts, runId: 'r', lane: 'backend', itemId: '1', itemName: 'n', engine: 'claude', outcome: 'FAILED' })

afterEach(() => {
  for (const f of [HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE]) {
    try { rmSync(f) } catch { /* absent */ }
  }
})

describe('haltedOnGitHubFrom', () => {
  it('halts when an open issue carries the halt label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'OPEN' }])).toBe(true)
  })

  it('does not halt on a closed halt issue', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'CLOSED' }])).toBe(false)
  })

  it('does not halt on the title alone without the label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [], state: 'OPEN' }])).toBe(false)
  })

  it('fails OPEN on an unreadable response', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

describe('halt / resume', () => {
  it('halt() makes haltedLocally true and leaves a readable reason', () => {
    halt('test halt reason')
    expect(haltedLocally()).toBe(true)
    expect(readFileSync(HALT_REASON_FILE, 'utf8').trim()).toBe('test halt reason')
  })

  it('resume() makes haltedLocally false', () => {
    halt('will be cleared')
    resume()
    expect(haltedLocally()).toBe(false)
  })

  it('resume() writes a resumedAt within a second or two of Date.now()', () => {
    const before = Date.now()
    resume()
    const resumedAt = readResumedAt()
    const after = Date.now()
    expect(resumedAt).toBeGreaterThanOrEqual(before)
    expect(resumedAt).toBeLessThanOrEqual(after + 2000)
  })

  it('resume() actually clears a tripped failure streak — the guard this whole marker exists for', () => {
    // Three failures old enough to predate the resume marker: without the
    // marker, these are still the newest records and the very next pass
    // would re-trip the breaker immediately. This is the assertion that
    // would catch resume() being a no-op that only looks like it worked.
    const rows = [failedAt(1), failedAt(2), failedAt(3)]
    resume()
    const resumedAt = readResumedAt()
    expect(failureBreaker(rows, LIMITS, resumedAt)).toBeUndefined()
  })

  it('checkHalt() reports halted with a reason when the local file is present', async () => {
    halt('local halt reason')
    const result = await checkHalt()
    expect(result.halted).toBe(true)
    expect(result.reason).toBe('local halt reason')
  })
})

describe('readResumedAt', () => {
  it('returns 0 when the file is absent', () => {
    expect(readResumedAt()).toBe(0)
  })

  it('returns 0 when the file contains garbage', () => {
    mkdirSync(FLEET_DIR, { recursive: true })
    writeFileSync(RESUMED_AT_FILE, 'not-a-number')
    expect(readResumedAt()).toBe(0)
  })
})
