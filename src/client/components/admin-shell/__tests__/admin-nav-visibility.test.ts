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

  it('returns true for platform item when user has the specific system permission', () => {
    const item = makeItem({ requiredPermissions: ['system:manage-hubs'] })
    const auth = makeAuth({ hasPermission: (p) => p === 'system:manage-hubs' })
    expect(canSeeItem(item, auth)).toBe(true)
  })

  it('returns false for platform item when user lacks the system permission', () => {
    const item = makeItem({ requiredPermissions: ['system:manage-hubs'] })
    const auth = makeAuth({ hasPermission: () => false })
    expect(canSeeItem(item, auth)).toBe(false)
  })

  it('returns true for platform-settings when user has system:view-platform', () => {
    const item = makeItem({ requiredPermissions: ['system:view-platform'] })
    const auth = makeAuth({ hasPermission: (p) => p === 'system:view-platform' })
    expect(canSeeItem(item, auth)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// canSeeGroup
// ---------------------------------------------------------------------------

describe('canSeeGroup', () => {
  it('shows platform groups when at least one item is visible', () => {
    const group = makeGroup({
      scope: 'platform',
      items: [makeItem({ requiredPermissions: [] })],
    })
    const auth = makeAuth()
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
  it('filters platform groups based on item permissions, not role', () => {
    const groups = [
      makeGroup({ groupSlug: 'hub-ops', scope: 'this-hub', items: [makeItem({ requiredPermissions: [] })] }),
      makeGroup({
        groupSlug: 'platform-ops',
        scope: 'platform',
        items: [makeItem({ requiredPermissions: ['system:manage-hubs'] })],
      }),
    ]

    const noPerms = makeAuth({ hasPermission: () => false })
    const withPerms = makeAuth({ hasPermission: (p) => p === 'system:manage-hubs' })

    const noPermsResult = getVisibleGroups(groups, noPerms)
    expect(noPermsResult).toHaveLength(1)
    expect(noPermsResult[0].groupSlug).toBe('hub-ops')

    const withPermsResult = getVisibleGroups(groups, withPerms)
    expect(withPermsResult).toHaveLength(2)
  })

  it('works with the real adminNavConfig for a user with all permissions', () => {
    const allPerms = makeAuth({
      hasPermission: () => true,
    })
    const visible = getVisibleGroups(adminNavConfig.groups, allPerms)
    expect(visible.length).toBe(adminNavConfig.groups.length)
  })

  it('hides platform group from user with no system permissions using real config', () => {
    const hubAdmin = makeAuth({
      hasPermission: (p) => !p.startsWith('system:') && p !== 'gdpr:admin',
    })
    const visible = getVisibleGroups(adminNavConfig.groups, hubAdmin)
    const platformGroups = visible.filter((g) => g.scope === 'platform')
    expect(platformGroups).toHaveLength(0)
  })

  it('shows specific platform items when user has matching system permissions', () => {
    const hubsAdmin = makeAuth({
      hasPermission: (p) => p === 'system:manage-hubs',
    })
    const visible = getVisibleGroups(adminNavConfig.groups, hubsAdmin)
    const platformGroup = visible.find((g) => g.scope === 'platform')
    expect(platformGroup).toBeDefined()
    expect(platformGroup!.items.some((i) => i.slug === 'hubs')).toBe(true)
    expect(canSeeItem(platformGroup!.items.find((i) => i.slug === 'platform-settings')!, hubsAdmin)).toBe(false)
    expect(canSeeItem(platformGroup!.items.find((i) => i.slug === 'platform-bans')!, hubsAdmin)).toBe(false)
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

  it('skips platform groups when no platform permissions are held', () => {
    const groups = [
      makeGroup({
        scope: 'platform',
        items: [makeItem({ slug: 'platform-item', requiredPermissions: ['system:manage-hubs'] })],
      }),
    ]
    const auth = makeAuth({ hasPermission: () => false })
    expect(getFirstAccessibleSlug(groups, auth)).toBeNull()
  })

  it('returns first slug from real config for a user with hub permissions', () => {
    const hubAdmin = makeAuth({
      hasPermission: (p) => p === 'settings:read',
    })
    const slug = getFirstAccessibleSlug(adminNavConfig.groups, hubAdmin)
    expect(slug).toBe('location-lookup')
  })
})
