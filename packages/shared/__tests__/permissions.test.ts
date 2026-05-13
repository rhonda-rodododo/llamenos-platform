import { describe, test, expect } from 'bun:test'
import { PERMISSION_CATALOG, isValidPermission, permissionGranted } from '../permissions'

describe('users:manage-devices permission', () => {
  test('exists in PERMISSION_CATALOG', () => {
    expect('users:manage-devices' in PERMISSION_CATALOG).toBe(true)
  })

  test('is a valid permission', () => {
    expect(isValidPermission('users:manage-devices')).toBe(true)
  })

  test('super-admin wildcard grants it', () => {
    expect(permissionGranted(['*'], 'users:manage-devices')).toBe(true)
  })

  test('users:* wildcard grants it', () => {
    expect(permissionGranted(['users:*'], 'users:manage-devices')).toBe(true)
  })
})
