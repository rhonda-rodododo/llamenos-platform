/**
 * Unit tests for in-memory error counters.
 *
 * Covers: incError, incRequests, getErrorSummary, resetErrorCounters.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { incError, incRequests, getErrorSummary, resetErrorCounters } from './error-counter'

beforeEach(() => {
  resetErrorCounters()
})

// ---------------------------------------------------------------------------
// incError / getErrorSummary
// ---------------------------------------------------------------------------

describe('incError', () => {
  it('increments the correct category', () => {
    incError('auth')
    incError('auth')
    const summary = getErrorSummary()
    expect(summary.errors.auth).toBe(2)
  })

  it('does not affect other categories', () => {
    incError('crypto')
    const summary = getErrorSummary()
    expect(summary.errors.auth).toBe(0)
    expect(summary.errors.validation).toBe(0)
    expect(summary.errors.telephony).toBe(0)
  })

  it('increments all error categories independently', () => {
    incError('auth')
    incError('validation')
    incError('storage')
    incError('telephony')
    incError('crypto')
    incError('alarm')
    incError('unknown')
    const s = getErrorSummary()
    expect(s.errors.auth).toBe(1)
    expect(s.errors.validation).toBe(1)
    expect(s.errors.storage).toBe(1)
    expect(s.errors.telephony).toBe(1)
    expect(s.errors.crypto).toBe(1)
    expect(s.errors.alarm).toBe(1)
    expect(s.errors.unknown).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// incRequests
// ---------------------------------------------------------------------------

describe('incRequests', () => {
  it('increments totalRequests', () => {
    incRequests()
    incRequests()
    expect(getErrorSummary().totalRequests).toBe(2)
  })

  it('does not affect error counters', () => {
    incRequests()
    const s = getErrorSummary()
    expect(s.totalErrors).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getErrorSummary
// ---------------------------------------------------------------------------

describe('getErrorSummary', () => {
  it('totalErrors sums all category counts', () => {
    incError('auth')
    incError('crypto')
    incError('crypto')
    expect(getErrorSummary().totalErrors).toBe(3)
  })

  it('returns 0 totalErrors when no errors', () => {
    expect(getErrorSummary().totalErrors).toBe(0)
  })

  it('includes uptimeMs as a positive number', () => {
    expect(getErrorSummary().uptimeMs).toBeGreaterThan(0)
  })

  it('errors snapshot is a copy (mutations do not affect counters)', () => {
    incError('auth')
    const snapshot = getErrorSummary()
    snapshot.errors.auth = 999
    expect(getErrorSummary().errors.auth).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// resetErrorCounters
// ---------------------------------------------------------------------------

describe('resetErrorCounters', () => {
  it('resets all counters to 0', () => {
    incError('auth')
    incError('crypto')
    incRequests()
    resetErrorCounters()
    const s = getErrorSummary()
    expect(s.totalErrors).toBe(0)
    expect(s.totalRequests).toBe(0)
    expect(s.errors.auth).toBe(0)
  })

  it('allows re-incrementing after reset', () => {
    incError('auth')
    resetErrorCounters()
    incError('auth')
    expect(getErrorSummary().errors.auth).toBe(1)
  })
})
