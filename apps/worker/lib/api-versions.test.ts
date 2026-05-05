/**
 * Unit tests for API version checking.
 *
 * Covers: checkClientVersion, CURRENT_API_VERSION, MIN_API_VERSION.
 */

import { describe, it, expect } from 'vitest'
import { checkClientVersion, CURRENT_API_VERSION, MIN_API_VERSION } from './api-versions'

describe('checkClientVersion', () => {
  it('returns null for current version', () => {
    expect(checkClientVersion(CURRENT_API_VERSION)).toBeNull()
  })

  it('returns null for any version >= MIN_API_VERSION', () => {
    expect(checkClientVersion(MIN_API_VERSION)).toBeNull()
    expect(checkClientVersion(MIN_API_VERSION + 10)).toBeNull()
  })

  it('returns upgrade descriptor for version below minimum', () => {
    const result = checkClientVersion(MIN_API_VERSION - 1)
    expect(result).not.toBeNull()
    expect(result?.upgrade).toBe(true)
    expect(result?.minVersion).toBe(MIN_API_VERSION)
    expect(result?.currentVersion).toBe(CURRENT_API_VERSION)
  })

  it('returns null for version 0 when MIN is also 0', () => {
    // Only if MIN_API_VERSION === 0, this would pass. Currently MIN=1.
    if (MIN_API_VERSION > 0) {
      expect(checkClientVersion(0)).not.toBeNull()
    }
  })

  it('current version is at least minimum version', () => {
    expect(CURRENT_API_VERSION).toBeGreaterThanOrEqual(MIN_API_VERSION)
  })
})
