import { describe, it, expect } from 'vitest'
import type { AdminNavGroup, AdminNavItem } from '../admin-nav-config.types'
import type { NavAuthContext } from '../admin-nav-visibility'
import { canSeeItem, canSeeGroup, getVisibleGroups, getFirstAccessibleSlug } from '../admin-nav-visibility'
import { adminNavConfig } from '../admin-nav-config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<AdminNavItem> = {}): AdminNavItem {
  return {
    slug: 'test-item',
    labelKey: 'test.label',
    requiredPermissions: [],
    testid: 'test-item',
    ...overrides,
  }
}

function makeGroup(overrides: Partial<AdminNavGroup> & { items?: AdminNavItem[] } = {}): AdminNavGroup {
  return {
    groupSlug: 'test-group',
    scope: 'this-hub',
    labelKey: 'test.group',
    items: [makeItem()],
    ...overrides,
  }
}

function makeAuth(overrides: Partial<NavAuthContext> = {}): NavAuthContext {
  return {
    roles: [],
    hasPermission: () => false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// canSeeItem
// ---------------------------------------------------------------------------

describe('canSeeItem', () => {
  it('returns true when no permissions or role required', () => {
    const item = makeItem({ requiredPermissions: [] })
    const auth = makeAuth()
    expect(canSeeItem(item, auth)).toBe(true)
  })

  it('returns false when required role is missing', () => {
    const item = makeItem({ requiredRole: 'role-super-admin', requiredPermissions: [] })
    const auth = makeAuth({ roles: ['role-admin'] })
    expect(canSeeItem(item, auth)).toBe(false)
  })

  it('returns true when required role is present and no permissions needed', () => {
    const item = makeItem({ requiredRole: 'role-super-admin', requiredPermissions: [] })
    const auth = makeAuth({ roles: ['role-super-admin'] })
    expect(canSeeItem(item, auth)).toBe(true)
  })

  it('returns true when all required permissions are met', () => {
    const item = makeItem({ requiredPermissions: ['settings:read', 'audit:read'] })
    const auth = makeAuth({ hasPermission: (p) => ['settings:read', 'audit:read'].includes(p) })
    expect(canSeeItem(item, auth)).toBe(true)
  })

  it('returns false when any required permission is missing', () => {
    const item = makeItem({ requiredPermissions: ['settings:read', 'audit:read'] })
    const auth = makeAuth({ hasPermission: (p) => p === 'settings:read' })
    expect(canSeeItem(item, auth)).toBe(false)
  })

  it('returns false when role matches but permissions do not', () => {
    const item = makeItem({
      requiredRole: 'role-super-admin',
      requiredPermissions: ['system:manage-hubs'],
    })
    const auth = makeAuth({ roles: ['role-super-admin'], hasPermission: () => false })
    expect(canSeeItem(item, auth)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canSeeGroup
// ---------------------------------------------------------------------------

describe('canSeeGroup', () => {
  it('hides platform groups from non-super-admins', () => {
    const group = makeGroup({ scope: 'platform' })
    const auth = makeAuth({ roles: ['role-admin'] })
    expect(canSeeGroup(group, auth)).toBe(false)
  })

  it('shows platform groups to super-admins when items are visible', () => {
    const group = makeGroup({
      scope: 'platform',
      items: [makeItem({ requiredPermissions: [] })],
    })
    const auth = makeAuth({ roles: ['role-super-admin'] })
    expect(canSeeGroup(group, auth)).toBe(true)
  })

  it('hides groups where no items are visible', () => {
    const group = makeGroup({
      scope: 'this-hub',
      items: [makeItem({ requiredPermissions: ['secret:read'] })],
    })
    const auth = makeAuth({ hasPermission: () => false })
    expect(canSeeGroup(group, auth)).toBe(false)
  })

  it('shows this-hub group when at least one item is visible', () => {
    const group = makeGroup({
      scope: 'this-hub',
      items: [
        makeItem({ slug: 'hidden', requiredPermissions: ['secret:read'] }),
        makeItem({ slug: 'visible', requiredPermissions: [] }),
      ],
    })
    const auth = makeAuth({ hasPermission: () => false })
    expect(canSeeGroup(group, auth)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getVisibleGroups
// ---------------------------------------------------------------------------

describe('getVisibleGroups', () => {
  it('filters correctly for hub-admin vs super-admin', () => {
    const groups = [
      makeGroup({ groupSlug: 'hub-ops', scope: 'this-hub', items: [makeItem({ requiredPermissions: [] })] }),
      makeGroup({ groupSlug: 'platform-ops', scope: 'platform', items: [makeItem({ requiredPermissions: [] })] }),
    ]

    const hubAdmin = makeAuth({ roles: ['role-admin'] })
    const superAdmin = makeAuth({ roles: ['role-super-admin'] })

    const hubResult = getVisibleGroups(groups, hubAdmin)
    expect(hubResult).toHaveLength(1)
    expect(hubResult[0].groupSlug).toBe('hub-ops')

    const superResult = getVisibleGroups(groups, superAdmin)
    expect(superResult).toHaveLength(2)
  })

  it('works with the real adminNavConfig for a super-admin with all permissions', () => {
    const superAdmin = makeAuth({
      roles: ['role-super-admin'],
      hasPermission: () => true,
    })
    const visible = getVisibleGroups(adminNavConfig.groups, superAdmin)
    expect(visible.length).toBe(adminNavConfig.groups.length)
  })

  it('hides platform group from hub admin using real config', () => {
    const hubAdmin = makeAuth({
      roles: ['role-admin'],
      hasPermission: () => true,
    })
    const visible = getVisibleGroups(adminNavConfig.groups, hubAdmin)
    const platformGroups = visible.filter((g) => g.scope === 'platform')
    expect(platformGroups).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getFirstAccessibleSlug
// ---------------------------------------------------------------------------

describe('getFirstAccessibleSlug', () => {
  it('returns first accessible slug', () => {
    const groups = [
      makeGroup({
        groupSlug: 'g1',
        scope: 'this-hub',
        items: [
          makeItem({ slug: 'hidden', requiredPermissions: ['secret:read'] }),
          makeItem({ slug: 'visible', requiredPermissions: [] }),
        ],
      }),
    ]
    const auth = makeAuth({ hasPermission: () => false })
    expect(getFirstAccessibleSlug(groups, auth)).toBe('visible')
  })

  it('returns null when nothing is accessible', () => {
    const groups = [
      makeGroup({
        scope: 'this-hub',
        items: [makeItem({ requiredPermissions: ['secret:read'] })],
      }),
    ]
    const auth = makeAuth({ hasPermission: () => false })
    expect(getFirstAccessibleSlug(groups, auth)).toBeNull()
  })

  it('skips platform groups for non-super-admins', () => {
    const groups = [
      makeGroup({
        scope: 'platform',
        items: [makeItem({ slug: 'platform-item', requiredPermissions: [] })],
      }),
    ]
    const auth = makeAuth({ roles: ['role-admin'] })
    expect(getFirstAccessibleSlug(groups, auth)).toBeNull()
  })

  it('returns first slug from real config for a hub admin', () => {
    const hubAdmin = makeAuth({
      roles: ['role-admin'],
      hasPermission: () => true,
    })
    const slug = getFirstAccessibleSlug(adminNavConfig.groups, hubAdmin)
    expect(slug).toBe('location-lookup')
  })
})
