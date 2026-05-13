import { describe, test, expect } from 'bun:test'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUP_LABELS,
  Permission,
  permissionGranted,
  getPermissionsByDomain,
  isValidPermission,
} from '../permissions'

describe('new system:view-* permissions', () => {
  const newPerms = [
    'system:view-platform',
    'system:view-bans',
    'system:view-audit',
    'system:view-analytics',
    'system:view-health',
  ] as const

  test.each(newPerms)('%s exists in PERMISSION_CATALOG', (perm) => {
    expect(perm in PERMISSION_CATALOG).toBe(true)
  })

  test.each(newPerms)('%s is a valid permission', (perm) => {
    expect(isValidPermission(perm)).toBe(true)
  })

  test('super-admin wildcard grants all new permissions', () => {
    for (const perm of newPerms) {
      expect(permissionGranted(['*'], perm)).toBe(true)
    }
  })

  test('system:* wildcard grants all new permissions', () => {
    for (const perm of newPerms) {
      expect(permissionGranted(['system:*'], perm)).toBe(true)
    }
  })
})

describe('PERMISSION_GROUP_LABELS', () => {
  test('every domain in catalog has a label', () => {
    const domains = Object.keys(getPermissionsByDomain())
    for (const domain of domains) {
      expect(PERMISSION_GROUP_LABELS[domain]).toBeDefined()
      expect(typeof PERMISSION_GROUP_LABELS[domain]).toBe('string')
    }
  })

  test('no label exists for a non-existent domain', () => {
    const domains = new Set(Object.keys(getPermissionsByDomain()))
    for (const labelDomain of Object.keys(PERMISSION_GROUP_LABELS)) {
      expect(domains.has(labelDomain)).toBe(true)
    }
  })
})
