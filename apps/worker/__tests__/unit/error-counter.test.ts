import { describe, it, expect, beforeEach } from 'vitest'
import {
  incError,
  incRequests,
  getErrorSummary,
  resetErrorCounters,
  type ErrorCategory,
} from '@worker/lib/error-counter'

const ALL_CATEGORIES: ErrorCategory[] = [
  'auth',
  'validation',
  'storage',
  'telephony',
  'crypto',
  'alarm',
  'unknown',
]

describe('error-counter', () => {
  beforeEach(() => {
    resetErrorCounters()
  })

  describe('incError', () => {
    it('increments the specified category by one', () => {
      incError('auth')
      const summary = getErrorSummary()
      expect(summary.errors.auth).toBe(1)
    })

    it('increments multiple categories independently', () => {
      incError('auth')
      incError('auth')
      incError('telephony')
      incError('crypto')

      const summary = getErrorSummary()
      expect(summary.errors.auth).toBe(2)
      expect(summary.errors.telephony).toBe(1)
      expect(summary.errors.crypto).toBe(1)
      expect(summary.errors.validation).toBe(0)
    })

    it('increments all categories', () => {
      for (const cat of ALL_CATEGORIES) {
        incError(cat)
      }
      const summary = getErrorSummary()
      for (const cat of ALL_CATEGORIES) {
        expect(summary.errors[cat]).toBe(1)
      }
      expect(summary.totalErrors).toBe(ALL_CATEGORIES.length)
    })
  })

  describe('incRequests', () => {
    it('increments total request count', () => {
      incRequests()
      incRequests()
      expect(getErrorSummary().totalRequests).toBe(2)
    })

    it('does not affect error counters', () => {
      incRequests()
      expect(getErrorSummary().totalErrors).toBe(0)
      expect(getErrorSummary().errors.auth).toBe(0)
    })
  })

  describe('getErrorSummary', () => {
    it('returns zeroed state initially', () => {
      const summary = getErrorSummary()
      expect(summary.totalErrors).toBe(0)
      expect(summary.totalRequests).toBe(0)
      for (const cat of ALL_CATEGORIES) {
        expect(summary.errors[cat]).toBe(0)
      }
    })

    it('returns a snapshot copy (mutating returned errors does not affect counters)', () => {
      incError('auth')
      const summary = getErrorSummary()
      summary.errors.auth = 999
      expect(getErrorSummary().errors.auth).toBe(1)
    })

    it('computes totalErrors as sum of all categories', () => {
      incError('auth')
      incError('auth')
      incError('validation')
      incError('storage')
      expect(getErrorSummary().totalErrors).toBe(4)
    })

    it('reports uptimeMs greater than or equal to zero', () => {
      const summary = getErrorSummary()
      expect(summary.uptimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('resetErrorCounters', () => {
    it('resets all error categories to zero', () => {
      incError('auth')
      incError('telephony')
      resetErrorCounters()
      const summary = getErrorSummary()
      for (const cat of ALL_CATEGORIES) {
        expect(summary.errors[cat]).toBe(0)
      }
    })

    it('resets totalRequests to zero', () => {
      incRequests()
      incRequests()
      resetErrorCounters()
      expect(getErrorSummary().totalRequests).toBe(0)
    })

    it('resets totalErrors to zero', () => {
      incError('unknown')
      resetErrorCounters()
      expect(getErrorSummary().totalErrors).toBe(0)
    })
  })
})
