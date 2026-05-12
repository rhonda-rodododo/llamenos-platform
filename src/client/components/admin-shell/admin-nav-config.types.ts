/**
 * Nav config types. Defines the shape of the admin sidebar structure.
 */

export type AdminNavScope = 'this-hub' | 'platform'

export interface AdminNavItem {
  /** URL slug — appears in /admin/{slug}. Must be unique across all items. */
  slug: string
  /** i18n key for the sidebar label, under the adminNav namespace. */
  labelKey: string
  /** Permission strings the user must hold (ALL must match). Empty = no permission gate. */
  requiredPermissions: string[]
  /** Role gate — if set, user must have this role in auth.roles. */
  requiredRole?: 'role-super-admin'
  /** data-testid applied to the sidebar link element. */
  testid: string
}

export interface AdminNavGroup {
  /** Stable identifier for the group, used in testids. */
  groupSlug: string
  /** Which sidebar scope this group belongs to. */
  scope: AdminNavScope
  /** i18n key for the group header label. */
  labelKey: string
  items: AdminNavItem[]
}

export interface AdminNavConfig {
  groups: AdminNavGroup[]
}
