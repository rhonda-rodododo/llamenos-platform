import type { AdminNavGroup, AdminNavItem } from './admin-nav-config.types'

export interface NavAuthContext {
  roles: string[]
  hasPermission: (p: string) => boolean
}

export function canSeeItem(item: AdminNavItem, auth: NavAuthContext): boolean {
  if (item.requiredRole && !auth.roles.includes(item.requiredRole)) return false
  if (item.requiredPermissions.length === 0) return true
  return item.requiredPermissions.every((p) => auth.hasPermission(p))
}

export function canSeeGroup(group: AdminNavGroup, auth: NavAuthContext): boolean {
  if (group.scope === 'platform' && !auth.roles.includes('role-super-admin')) return false
  return group.items.some((item) => canSeeItem(item, auth))
}

export function getVisibleGroups(groups: AdminNavGroup[], auth: NavAuthContext): AdminNavGroup[] {
  return groups.filter((g) => canSeeGroup(g, auth))
}

export function getFirstAccessibleSlug(groups: AdminNavGroup[], auth: NavAuthContext): string | null {
  for (const group of groups) {
    if (!canSeeGroup(group, auth)) continue
    for (const item of group.items) {
      if (canSeeItem(item, auth)) return item.slug
    }
  }
  return null
}
