import { describe, it, expect } from 'bun:test'
import { checkPermission } from '@worker/middleware/permission-guard'

describe('checkPermission', () => {
  it('returns true for exact match', () => {
    expect(checkPermission(['calls:answer', 'notes:create'], 'calls:answer')).toBe(true)
  })

  it('returns false when permission not granted', () => {
    expect(checkPermission(['calls:answer'], 'audit:read')).toBe(false)
  })

  it('returns true for global wildcard', () => {
    expect(checkPermission(['*'], 'system:manage-roles')).toBe(true)
  })

  it('returns true for domain wildcard', () => {
    expect(checkPermission(['calls:*'], 'calls:debug')).toBe(true)
  })

  it('returns false for empty permissions', () => {
    expect(checkPermission([], 'calls:answer')).toBe(false)
  })

  it('returns false for domain wildcard with wrong domain', () => {
    expect(checkPermission(['calls:*'], 'notes:create')).toBe(false)
  })
})
