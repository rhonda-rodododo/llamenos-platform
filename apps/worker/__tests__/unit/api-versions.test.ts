/**
 * Unit tests for apps/worker/lib/api-versions.ts
 *
 * Tests version constants and checkClientVersion logic.
 */
import { describe, it, expect } from 'vitest'
import { CURRENT_API_VERSION, MIN_API_VERSION, checkClientVersion } from '@worker/lib/api-versions'

describe('api-versions', () => {
  describe('constants', () => {
    it('CURRENT_API_VERSION is at least 1', () => {
      expect(CURRENT_API_VERSION).toBeGreaterThanOrEqual(1)
    })

    it('MIN_API_VERSION is at least 1', () => {
      expect(MIN_API_VERSION).toBeGreaterThanOrEqual(1)
    })

    it('CURRENT_API_VERSION >= MIN_API_VERSION', () => {
      expect(CURRENT_API_VERSION).toBeGreaterThanOrEqual(MIN_API_VERSION)
    })
  })

  describe('checkClientVersion', () => {
    it('returns null when client version equals MIN_API_VERSION', () => {
      const result = checkClientVersion(MIN_API_VERSION)
      expect(result).toBeNull()
    })

    it('returns null when client version exceeds MIN_API_VERSION', () => {
      const result = checkClientVersion(MIN_API_VERSION + 1)
      expect(result).toBeNull()
    })

    it('returns null when client version equals CURRENT_API_VERSION', () => {
      const result = checkClientVersion(CURRENT_API_VERSION)
      expect(result).toBeNull()
    })

    it('returns upgrade descriptor when client version is below MIN_API_VERSION', () => {
      const result = checkClientVersion(MIN_API_VERSION - 1)
      expect(result).toEqual({
        upgrade: true,
        minVersion: MIN_API_VERSION,
        currentVersion: CURRENT_API_VERSION,
      })
    })

    it('returns upgrade descriptor for version 0', () => {
      // version 0 should always require upgrade since MIN is at least 1
      const result = checkClientVersion(0)
      expect(result).toEqual({
        upgrade: true,
        minVersion: MIN_API_VERSION,
        currentVersion: CURRENT_API_VERSION,
      })
    })

    it('returns upgrade descriptor for negative version', () => {
      const result = checkClientVersion(-1)
      expect(result).toEqual({
        upgrade: true,
        minVersion: MIN_API_VERSION,
        currentVersion: CURRENT_API_VERSION,
      })
    })
  })
})
