/**
 * Permission-Based Access Control (PBAC)
 *
 * Permissions are colon-separated strings: "domain:action"
 * Roles are named bundles of permissions.
 * Users can have multiple roles — effective permissions = union of all.
 * Wildcard "*" grants all permissions; "domain:*" grants all within domain.
 */

// --- Permission Catalog ---

export const PERMISSION_CATALOG = {
  // Calls
  'calls:answer': 'Answer incoming calls',
  'calls:read-active': 'See active calls (caller info redacted)',
  'calls:read-active-full': 'See active calls with full caller info',
  'calls:read-history': 'View call history',
  'calls:read-presence': 'View volunteer presence',
  'calls:debug': 'Debug call state',

  // Notes
  'notes:create': 'Create call notes',
  'notes:read-own': 'Read own notes',
  'notes:read-all': 'Read all notes',
  'notes:read-assigned': 'Read notes from assigned volunteers',
  'notes:update-own': 'Update own notes',

  // Reports
  'reports:create': 'Submit reports',
  'reports:read-own': 'Read own reports',
  'reports:read-all': 'Read all reports',
  'reports:read-assigned': 'Read assigned reports',
  'reports:assign': 'Assign reports to reviewers/volunteers',
  'reports:update': 'Update report status',
  'reports:send-message-own': 'Send messages in own reports',
  'reports:send-message': 'Send messages in any report',

  // Conversations
  'conversations:read-assigned': 'Read assigned + waiting conversations',
  'conversations:read-all': 'Read all conversations',
  'conversations:claim': 'Claim a waiting conversation',
  'conversations:send': 'Send messages in assigned conversations',
  'conversations:send-any': 'Send messages in any conversation',
  'conversations:update': 'Reassign/close/reopen conversations',

  // Volunteers
  'volunteers:read': 'List/view volunteer profiles',
  'volunteers:create': 'Create new volunteers',
  'volunteers:update': 'Update volunteer profiles',
  'volunteers:delete': 'Deactivate/delete volunteers',
  'volunteers:manage-roles': 'Assign/change volunteer roles',

  // Shifts
  'shifts:read-own': 'Check own shift status',
  'shifts:read': 'View all shifts',
  'shifts:create': 'Create shifts',
  'shifts:update': 'Modify shifts',
  'shifts:delete': 'Delete shifts',
  'shifts:manage-fallback': 'Manage fallback ring group',

  // Bans
  'bans:report': 'Report/flag a number',
  'bans:read': 'View ban list',
  'bans:create': 'Ban numbers',
  'bans:bulk-create': 'Bulk ban import',
  'bans:delete': 'Remove bans',

  // Invites
  'invites:read': 'View pending invites',
  'invites:create': 'Create invite codes',
  'invites:revoke': 'Revoke invite codes',

  // Settings
  'settings:read': 'View settings',
  'settings:manage': 'Modify all settings',
  'settings:manage-telephony': 'Modify telephony provider',
  'settings:manage-messaging': 'Modify messaging channels',
  'settings:manage-spam': 'Modify spam settings',
  'settings:manage-ivr': 'Modify IVR/language settings',
  'settings:manage-fields': 'Modify custom fields',
  'settings:manage-transcription': 'Modify transcription settings',

  // Audit
  'audit:read': 'View audit log',

  // Blasts (future — Epic 62)
  'blasts:read': 'View blast history',
  'blasts:send': 'Send blasts',
  'blasts:manage': 'Manage subscriber lists and templates',
  'blasts:schedule': 'Schedule future blasts',

  // Files
  'files:upload': 'Upload files',
  'files:download-own': 'Download own/authorized files',
  'files:download-all': 'Download any file',
  'files:share': 'Re-encrypt/share files with others',

  // System (super-admin only)
  'system:manage-roles': 'Create/edit/delete custom roles',
  'system:manage-hubs': 'Create/manage hubs',
  'system:manage-instance': 'Instance-level settings',
} as const

export type Permission = keyof typeof PERMISSION_CATALOG

/** All permission domains (first part before the colon) */
export type PermissionDomain = Permission extends `${infer D}:${string}` ? D : never

/** Group permissions by domain for the role editor UI */
export function getPermissionsByDomain(): Record<string, { key: Permission; label: string }[]> {
  const result: Record<string, { key: Permission; label: string }[]> = {}
  for (const [key, label] of Object.entries(PERMISSION_CATALOG)) {
    const domain = key.split(':')[0]
    if (!result[domain]) result[domain] = []
    result[domain].push({ key: key as Permission, label })
  }
  return result
}

// --- Role Definition ---

export interface Role {
  id: string
  name: string
  slug: string
  permissions: string[]
  isDefault: boolean   // ships with system
  isSystem: boolean    // can't be modified at all (super-admin)
  description: string
  createdAt: string
  updatedAt: string
}

// --- Default Role Definitions ---

export const DEFAULT_ROLES: Omit<Role, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'role-super-admin',
    name: 'Super Admin',
    slug: 'super-admin',
    permissions: ['*'],
    isDefault: true,
    isSystem: true,
    description: 'Full system access — creates hubs, manages all settings and users',
  },
  {
    id: 'role-hub-admin',
    name: 'Hub Admin',
    slug: 'hub-admin',
    permissions: [
      'volunteers:*', 'shifts:*', 'settings:*', 'audit:read',
      'bans:*', 'invites:*', 'notes:read-all', 'notes:create', 'notes:update-own',
      'reports:*', 'conversations:*', 'calls:*', 'blasts:*', 'files:*',
    ],
    isDefault: true,
    isSystem: false,
    description: 'Full control within assigned hub(s) — manages volunteers, shifts, settings',
  },
  {
    id: 'role-reviewer',
    name: 'Reviewer',
    slug: 'reviewer',
    permissions: [
      'notes:read-assigned', 'reports:read-assigned', 'reports:assign',
      'reports:update', 'reports:send-message',
      'conversations:read-assigned', 'conversations:send',
      'shifts:read-own', 'files:download-own', 'files:upload',
    ],
    isDefault: true,
    isSystem: false,
    description: 'Reviews notes and reports from assigned volunteers or shifts',
  },
  {
    id: 'role-volunteer',
    name: 'Volunteer',
    slug: 'volunteer',
    permissions: [
      'calls:answer', 'calls:read-active',
      'notes:create', 'notes:read-own', 'notes:update-own',
      'conversations:claim', 'conversations:send', 'conversations:read-assigned',
      'shifts:read-own', 'bans:report',
      'reports:read-assigned', 'reports:send-message',
      'files:upload', 'files:download-own',
    ],
    isDefault: true,
    isSystem: false,
    description: 'Answers calls, writes notes, handles assigned conversations',
  },
  {
    id: 'role-reporter',
    name: 'Reporter',
    slug: 'reporter',
    permissions: [
      'reports:create', 'reports:read-own', 'reports:send-message-own',
      'files:upload', 'files:download-own',
    ],
    isDefault: true,
    isSystem: false,
    description: 'Submits reports and tracks their own submissions',
  },
]

// --- Permission Resolution ---

/**
 * Check if a set of permissions grants a specific permission.
 * Supports exact match, domain wildcards (e.g. "calls:*"), and global wildcard "*".
 */
export function permissionGranted(grantedPermissions: string[], required: string): boolean {
  // Global wildcard
  if (grantedPermissions.includes('*')) return true
  // Exact match
  if (grantedPermissions.includes(required)) return true
  // Domain wildcard (e.g. "calls:*" matches "calls:answer")
  const domain = required.split(':')[0]
  if (grantedPermissions.includes(`${domain}:*`)) return true
  return false
}

/**
 * Resolve effective permissions from multiple role IDs.
 * Returns the union of all permissions from all roles.
 */
export function resolvePermissions(roleIds: string[], roles: Role[]): string[] {
  const perms = new Set<string>()
  for (const roleId of roleIds) {
    const role = roles.find(r => r.id === roleId)
    if (role) {
      for (const p of role.permissions) perms.add(p)
    }
  }
  return Array.from(perms)
}

/**
 * Check if a user with given role IDs has a specific permission.
 */
export function hasPermission(roleIds: string[], roles: Role[], permission: string): boolean {
  const perms = resolvePermissions(roleIds, roles)
  return permissionGranted(perms, permission)
}

/**
 * Get the "primary" role for display purposes — the highest-privilege role.
 * Order: super-admin > hub-admin > reviewer > volunteer > reporter > custom
 */
const ROLE_PRIORITY: Record<string, number> = {
  'role-super-admin': 0,
  'role-hub-admin': 1,
  'role-reviewer': 2,
  'role-volunteer': 3,
  'role-reporter': 4,
}

export function getPrimaryRole(roleIds: string[], roles: Role[]): Role | undefined {
  const userRoles = roleIds
    .map(id => roles.find(r => r.id === id))
    .filter((r): r is Role => !!r)
    .sort((a, b) => {
      const pa = ROLE_PRIORITY[a.id] ?? 99
      const pb = ROLE_PRIORITY[b.id] ?? 99
      return pa - pb
    })
  return userRoles[0]
}

// --- Hub-Scoped Permission Resolution ---

/**
 * Check if a user has a specific permission within a hub.
 * Super-admin (global '*' permission) bypasses hub checks.
 * Otherwise, checks hub-specific role assignments.
 */
export function hasHubPermission(
  globalRoles: string[],
  hubRoles: { hubId: string; roleIds: string[] }[],
  allRoleDefs: Role[],
  hubId: string,
  permission: string,
): boolean {
  // Super-admin bypasses all hub checks
  const globalPerms = resolvePermissions(globalRoles, allRoleDefs)
  if (permissionGranted(globalPerms, permission)) return true

  // Check hub-specific roles
  const assignment = hubRoles.find(hr => hr.hubId === hubId)
  if (!assignment) return false

  const hubPerms = resolvePermissions(assignment.roleIds, allRoleDefs)
  return permissionGranted(hubPerms, permission)
}

/**
 * Resolve all effective permissions for a user within a specific hub.
 * Includes global permissions (from globalRoles) plus hub-specific permissions.
 */
export function resolveHubPermissions(
  globalRoles: string[],
  hubRoles: { hubId: string; roleIds: string[] }[],
  allRoleDefs: Role[],
  hubId: string,
): string[] {
  const perms = new Set<string>()
  // Global permissions always apply
  for (const p of resolvePermissions(globalRoles, allRoleDefs)) {
    perms.add(p)
  }
  // Hub-specific permissions
  const assignment = hubRoles.find(hr => hr.hubId === hubId)
  if (assignment) {
    for (const p of resolvePermissions(assignment.roleIds, allRoleDefs)) {
      perms.add(p)
    }
  }
  return Array.from(perms)
}

/**
 * Get all hub IDs a user has access to (any role assignment).
 * Super-admin has access to all hubs (returns null = all).
 */
export function getUserHubIds(
  globalRoles: string[],
  hubRoles: { hubId: string; roleIds: string[] }[],
  allRoleDefs: Role[],
): string[] | null {
  const globalPerms = resolvePermissions(globalRoles, allRoleDefs)
  if (permissionGranted(globalPerms, '*')) return null // all hubs
  return hubRoles.map(hr => hr.hubId)
}
