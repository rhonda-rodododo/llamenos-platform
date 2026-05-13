import { describe, test, expect } from 'bun:test'
import {
  PERMISSION_CATALOG,
  DEFAULT_ROLES,
  permissionGranted,
  isValidPermission,
  PERMISSION_GROUP_LABELS,
} from '../permissions'

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
    const hubAdmin = DEFAULT_ROLES.find(r => r.slug === 'hub-admin')!
    expect(permissionGranted(hubAdmin.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'teams:manage')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:create')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:manage')).toBe(true)
  })

  test('volunteer default role has teams:read and tags:view', () => {
    const volunteer = DEFAULT_ROLES.find(r => r.slug === 'volunteer')!
    expect(permissionGranted(volunteer.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'teams:manage')).toBe(false)
    expect(permissionGranted(volunteer.permissions, 'tags:create')).toBe(false)
  })

  test('reviewer default role has teams:read and tags:view', () => {
    const reviewer = DEFAULT_ROLES.find(r => r.slug === 'reviewer')!
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
