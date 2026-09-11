import { describe, it, expect } from 'vitest'
import { rateBreaker, failureBreaker, inQuotaCooldown } from '../../orchestrator/src/circuit.js'
import type { RunRecord, Outcome } from '../../orchestrator/src/ledger.js'

const LIMITS = { maxDispatchesPerHour: 6, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }
const r = (outcome: Outcome, ts: number, lane = 'backend'): RunRecord =>
  ({ ts, runId: 'x', lane, itemId: '1', itemName: 'n', engine: 'claude', outcome })

describe('rateBreaker', () => {
  it('trips above the hourly dispatch ceiling', () => {
    const rows = Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i))
    expect(rateBreaker(rows, LIMITS, 2000)).toMatch(/dispatch rate/i)
  })
  it('does not trip at the ceiling', () => {
    const rows = Array.from({ length: 6 }, (_, i) => r('DISPATCHED', 1000 + i))
    expect(rateBreaker(rows, LIMITS, 2000)).toBeUndefined()
  })
  it('ignores dispatches older than the window', () => {
    const rows = Array.from({ length: 20 }, (_, i) => r('DISPATCHED', i))
    expect(rateBreaker(rows, LIMITS, 10_000_000)).toBeUndefined()
  })
})

describe('failureBreaker', () => {
  it('trips on three consecutive terminal failures', () => {
    const rows = [r('FAILED', 1), r('TIMEOUT', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 0)).toMatch(/consecutive/i)
  })
  it('does not count QUOTA toward the failure streak', () => {
    const rows = [r('FAILED', 1), r('QUOTA', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 0)).toBeUndefined()
  })
  it('resets the streak on a success', () => {
    const rows = [r('FAILED', 1), r('FAILED', 2), r('SUCCESS', 3), r('FAILED', 4)]
    expect(failureBreaker(rows, LIMITS, 0)).toBeUndefined()
  })
  it('ignores failures recorded before the resume marker', () => {
    const rows = [r('FAILED', 1), r('FAILED', 2), r('FAILED', 3)]
    expect(failureBreaker(rows, LIMITS, 100)).toBeUndefined()
  })
})

describe('inQuotaCooldown', () => {
  it('sits the lane out after a quota outcome', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'ios', 1000 + 60_000, LIMITS)).toBe(true)
  })
  it('releases the lane after the cooldown', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'ios', 1000 + 3_700_000, LIMITS)).toBe(false)
  })
  it('is per-lane, not global', () => {
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'backend', 1000 + 60_000, LIMITS)).toBe(false)
  })
  it('honours a non-default cooldown value from limits', () => {
    const shortCooldown = { ...LIMITS, quotaCooldownMs: 30_000 }
    // 60s after the QUOTA outcome: still inside the default 1h cooldown, but
    // past this limits object's 30s cooldown — proves the value actually read
    // is limits.quotaCooldownMs, not a hardcoded default.
    expect(inQuotaCooldown([r('QUOTA', 1000, 'ios')], 'ios', 1000 + 60_000, shortCooldown)).toBe(false)
  })
})
