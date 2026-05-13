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
  it('returns true when no permissions required', () => {
    const item = makeItem({ requiredPermissions: [] })
    const auth = makeAuth()
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

  it('shows platform item to user with matching permission (not role)', () => {
    const item = makeItem({
      requiredPermissions: ['system:manage-hubs'],
    })
    const auth = makeAuth({ roles: ['role-admin'], hasPermission: (p) => p === 'system:manage-hubs' })
    expect(canSeeItem(item, auth)).toBe(true)
  })

  it('hides platform item from user without matching permission', () => {
    const item = makeItem({
      requiredPermissions: ['system:manage-hubs'],
    })
    const auth = makeAuth({ roles: ['role-admin'], hasPermission: () => false })
    expect(canSeeItem(item, auth)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canSeeGroup
// ---------------------------------------------------------------------------

describe('canSeeGroup', () => {
  it('shows platform groups when any item is visible via permissions', () => {
    const group = makeGroup({
      scope: 'platform',
      items: [makeItem({ requiredPermissions: ['system:manage-hubs'] })],
    })
    const auth = makeAuth({ hasPermission: (p) => p === 'system:manage-hubs' })
    expect(canSeeGroup(group, auth)).toBe(true)
  })

  it('hides platform groups when no items are visible', () => {
    const group = makeGroup({
      scope: 'platform',
      items: [makeItem({ requiredPermissions: ['system:manage-hubs'] })],
    })
    const auth = makeAuth({ hasPermission: () => false })
    expect(canSeeGroup(group, auth)).toBe(false)
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
  it('filters correctly based on permissions only', () => {
    const groups = [
      makeGroup({ groupSlug: 'hub-ops', scope: 'this-hub', items: [makeItem({ requiredPermissions: [] })] }),
      makeGroup({ groupSlug: 'platform-ops', scope: 'platform', items: [makeItem({ requiredPermissions: ['system:manage-hubs'] })] }),
    ]

    const noPlatform = makeAuth({ hasPermission: () => false })
    const withPlatform = makeAuth({ hasPermission: (p) => p === 'system:manage-hubs' })

    const hubResult = getVisibleGroups(groups, noPlatform)
    expect(hubResult).toHaveLength(1)
    expect(hubResult[0].groupSlug).toBe('hub-ops')

    const superResult = getVisibleGroups(groups, withPlatform)
    expect(superResult).toHaveLength(2)
  })

  it('works with the real adminNavConfig for a user with all permissions', () => {
    const superAdmin = makeAuth({
      hasPermission: () => true,
    })
    const visible = getVisibleGroups(adminNavConfig.groups, superAdmin)
    expect(visible.length).toBe(adminNavConfig.groups.length)
  })

  it('hides platform group from user without platform permissions using real config', () => {
    const hubAdmin = makeAuth({
      hasPermission: (p) => !p.startsWith('system:'),
    })
    const visible = getVisibleGroups(adminNavConfig.groups, hubAdmin)
    const platformGroups = visible.filter((g) => g.scope === 'platform')
    expect(platformGroups).toHaveLength(0)
  })

  it('shows platform items to user with specific system permissions', () => {
    const admin = makeAuth({
      hasPermission: (p) => p === 'system:view-platform',
    })
    const visible = getVisibleGroups(adminNavConfig.groups, admin)
    const platformGroup = visible.find((g) => g.scope === 'platform')
    expect(platformGroup).toBeDefined()
    expect(platformGroup?.items.some((i) => i.slug === 'platform-settings')).toBe(true)
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

  it('skips platform groups when user lacks platform permissions', () => {
    const groups = [
      makeGroup({
        scope: 'platform',
        items: [makeItem({ slug: 'platform-item', requiredPermissions: ['system:manage-hubs'] })],
      }),
    ]
    const auth = makeAuth({ hasPermission: () => false })
    expect(getFirstAccessibleSlug(groups, auth)).toBeNull()
  })

  it('returns first slug from real config for a hub admin', () => {
    const hubAdmin = makeAuth({
      hasPermission: () => true,
    })
    const slug = getFirstAccessibleSlug(adminNavConfig.groups, hubAdmin)
    expect(slug).toBe('location-lookup')
  })
})
