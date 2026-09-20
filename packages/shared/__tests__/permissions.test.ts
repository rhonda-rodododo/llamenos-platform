import { describe, test, expect } from 'bun:test'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUP_DOMAINS,
  DEFAULT_ROLES,
  permissionGranted,
  getPermissionsByDomain,
  isValidPermission,
  PERMISSION_GROUP_LABELS,
} from '../permissions'

/** Look up a default role by slug, failing loudly (rather than via a non-null assertion) if it's missing. */
function getDefaultRole(slug: string) {
  const role = DEFAULT_ROLES.find(r => r.slug === slug)
  if (!role) throw new Error(`Default role not found: ${slug}`)
  return role
}

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

describe('EP03: teams and tags permissions', () => {
  const teamPerms = ['teams:read', 'teams:manage'] as const
  const tagPerms = ['tags:view', 'tags:create', 'tags:manage'] as const

  test.each([...teamPerms, ...tagPerms])('%s exists in PERMISSION_CATALOG', (perm) => {
    expect(perm in PERMISSION_CATALOG).toBe(true)
  })

  test.each([...teamPerms, ...tagPerms])('%s is a valid permission', (perm) => {
    expect(isValidPermission(perm)).toBe(true)
  })

  test('super-admin wildcard grants all team/tag permissions', () => {
    for (const perm of [...teamPerms, ...tagPerms]) {
      expect(permissionGranted(['*'], perm)).toBe(true)
    }
  })

  test('teams:* wildcard grants all team permissions', () => {
    for (const perm of teamPerms) {
      expect(permissionGranted(['teams:*'], perm)).toBe(true)
    }
  })

  test('tags:* wildcard grants all tag permissions', () => {
    for (const perm of tagPerms) {
      expect(permissionGranted(['tags:*'], perm)).toBe(true)
    }
  })

  test('hub-admin default role includes teams and tags permissions', () => {
    const hubAdmin = getDefaultRole('hub-admin')
    expect(permissionGranted(hubAdmin.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'teams:manage')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:create')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:manage')).toBe(true)
  })

  test('volunteer default role has teams:read and tags:view', () => {
    const volunteer = getDefaultRole('volunteer')
    expect(permissionGranted(volunteer.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'teams:manage')).toBe(false)
    expect(permissionGranted(volunteer.permissions, 'tags:create')).toBe(false)
  })

  test('reviewer default role has teams:read and tags:view', () => {
    const reviewer = getDefaultRole('reviewer')
    expect(permissionGranted(reviewer.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(reviewer.permissions, 'tags:view')).toBe(true)
  })
})

describe('PERMISSION_GROUP_LABELS includes teams and tags', () => {
  test('teams domain has a label', () => {
    expect(PERMISSION_GROUP_LABELS['teams']).toBe('Teams')
  })

  test('tags domain has a label', () => {
    expect(PERMISSION_GROUP_LABELS['tags']).toBe('Tags')
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
