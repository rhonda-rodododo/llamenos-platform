import { describe, test, expect } from 'bun:test'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUP_DOMAINS,
  permissionGranted,
  getPermissionsByDomain,
  isValidPermission,
} from '../permissions'

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


describe('new system:view-* permissions', () => {
  const newPerms: string[] = [
    'system:view-platform',
    'system:view-bans',
    'system:view-audit',
    'system:view-analytics',
    'system:view-health',
  ]

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

describe('PERMISSION_GROUP_DOMAINS', () => {
  test('every domain in catalog is in PERMISSION_GROUP_DOMAINS', () => {
    const domains = Object.keys(getPermissionsByDomain())
    const domainSet = new Set<string>(PERMISSION_GROUP_DOMAINS)
    for (const domain of domains) {
      expect(domainSet.has(domain)).toBe(true)
    }
  })

  test('no domain in PERMISSION_GROUP_DOMAINS is outside the catalog', () => {
    const catalogDomains = new Set(Object.keys(getPermissionsByDomain()))
    for (const domain of PERMISSION_GROUP_DOMAINS) {
      expect(catalogDomains.has(domain)).toBe(true)
    }
  })
})
