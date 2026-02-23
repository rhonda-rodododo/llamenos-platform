# Epic 60: Permission-Based Access Control (PBAC)

## Summary

Replace the hard-coded 3-role system (`admin`, `volunteer`, `reporter`) with a dynamic, permission-based access control system. Roles become named bundles of permissions. Users can hold multiple roles. Default roles ship with the system but admins can create custom roles. This is foundational for multi-hub (Epic 61), where roles become hub-scoped.

## Current State

- `UserRole = 'volunteer' | 'admin' | 'reporter'` — mutually exclusive, one per user
- ~50+ hard-coded role checks across API routes and frontend (`isAdmin`, `role === 'admin'`, role guards)
- `adminGuard` middleware blocks non-admins; `roleGuard(...allowedRoles)` for mixed access
- Frontend uses `isAdmin` boolean and `role` string for conditional rendering and route protection
- Invites created with a fixed role; volunteers assigned that role on redemption

## Design

### Permission Model

Permissions are colon-separated strings in `domain:action` format:

```typescript
// Permission catalog — grows as features are added
type Permission = string // e.g., 'calls:answer', 'notes:read-all', 'settings:manage'

interface Role {
  id: string                    // UUID
  name: string                  // Display name (e.g., "Hub Admin")
  slug: string                  // Machine name (e.g., "hub-admin")
  permissions: Permission[]     // Granted permissions
  isDefault: boolean            // Ships with system, can't be deleted
  isSystem: boolean             // Can't be modified (super-admin only)
  description: string           // Human-readable explanation
  createdAt: string
  updatedAt: string
}
```

### Default Roles

| Role | Slug | Key Permissions | System? |
|------|------|----------------|---------|
| **Super Admin** | `super-admin` | `*` (wildcard — all permissions) | Yes |
| **Hub Admin** | `hub-admin` | `volunteers:*`, `shifts:*`, `settings:*`, `audit:read`, `bans:*`, `invites:*`, `notes:read-all`, `reports:*`, `conversations:*`, `calls:*`, `blasts:*`, `files:*` | Yes |
| **Reviewer** | `reviewer` | `notes:read-assigned`, `reports:read-assigned`, `reports:assign`, `conversations:read-assigned`, `shifts:read-own` | Yes |
| **Volunteer** | `volunteer` | `calls:answer`, `notes:create`, `notes:read-own`, `notes:update-own`, `conversations:claim`, `conversations:send`, `conversations:read-assigned`, `shifts:read-own`, `bans:report`, `reports:read-assigned`, `reports:send-message`, `files:upload`, `files:download-own` | Yes |
| **Reporter** | `reporter` | `reports:create`, `reports:read-own`, `reports:send-message-own`, `files:upload`, `files:download-own` | Yes |

### Permission Catalog (Initial)

```
# Calls
calls:answer              # Answer incoming calls
calls:read-active         # See active calls (redacted caller info)
calls:read-active-full    # See active calls with full caller info
calls:read-history        # View call history
calls:read-presence       # View volunteer presence
calls:debug               # Debug call state

# Notes
notes:create              # Create call notes
notes:read-own            # Read own notes
notes:read-all            # Read all notes
notes:read-assigned       # Read notes from assigned volunteers
notes:update-own          # Update own notes

# Reports
reports:create            # Submit reports
reports:read-own          # Read own reports
reports:read-all          # Read all reports
reports:read-assigned     # Read assigned reports
reports:assign            # Assign reports to reviewers/volunteers
reports:update            # Update report status
reports:send-message-own  # Send messages in own reports
reports:send-message      # Send messages in any report

# Conversations
conversations:read-assigned  # Read assigned + waiting conversations
conversations:read-all       # Read all conversations
conversations:claim          # Claim a waiting conversation
conversations:send           # Send messages in assigned conversations
conversations:send-any       # Send messages in any conversation
conversations:update         # Reassign/close/reopen conversations

# Volunteers
volunteers:read           # List/view volunteer profiles
volunteers:create         # Create new volunteers
volunteers:update         # Update volunteer profiles
volunteers:delete         # Deactivate/delete volunteers
volunteers:manage-roles   # Assign/change volunteer roles

# Shifts
shifts:read-own           # Check own shift status
shifts:read               # View all shifts
shifts:create             # Create shifts
shifts:update             # Modify shifts
shifts:delete             # Delete shifts
shifts:manage-fallback    # Manage fallback ring group

# Bans
bans:report               # Report/flag a number
bans:read                 # View ban list
bans:create               # Ban numbers
bans:bulk-create          # Bulk ban import
bans:delete               # Remove bans

# Invites
invites:read              # View pending invites
invites:create            # Create invite codes
invites:revoke            # Revoke invite codes

# Settings
settings:read             # View settings
settings:manage           # Modify all settings
settings:manage-telephony # Modify telephony provider
settings:manage-messaging # Modify messaging channels
settings:manage-spam      # Modify spam settings
settings:manage-ivr       # Modify IVR/language settings
settings:manage-fields    # Modify custom fields
settings:manage-transcription # Modify transcription settings

# Audit
audit:read                # View audit log

# Blasts (Epic 62)
blasts:read               # View blast history
blasts:send               # Send blasts
blasts:manage             # Manage subscriber lists, templates
blasts:schedule           # Schedule future blasts

# Files
files:upload              # Upload files
files:download-own        # Download own/authorized files
files:download-all        # Download any file
files:share               # Re-encrypt/share files with others

# System (super-admin only)
system:manage-roles       # Create/edit/delete custom roles
system:manage-hubs        # Create/manage hubs (Epic 61)
system:manage-instance    # Instance-level settings
```

### Multi-Role User Model

```typescript
interface Volunteer {
  pubkey: string
  name: string
  phone: string
  roles: string[]                    // Role IDs (replaces single `role` field)
  active: boolean
  // ... existing fields unchanged
}
```

Effective permissions = union of all assigned role permissions. Wildcard `*` grants everything.

Permission resolution:

```typescript
function hasPermission(volunteer: Volunteer, roles: Role[], permission: string): boolean {
  const allPermissions = volunteer.roles
    .flatMap(roleId => roles.find(r => r.id === roleId)?.permissions ?? [])

  // Check wildcard
  if (allPermissions.includes('*')) return true

  // Check exact match
  if (allPermissions.includes(permission)) return true

  // Check domain wildcard (e.g., 'calls:*' matches 'calls:answer')
  const [domain] = permission.split(':')
  if (allPermissions.includes(`${domain}:*`)) return true

  return false
}
```

### Storage

Roles stored in **SettingsDO** under `settings:roles` key (array of `Role` objects). Default roles seeded on first access.

### Migration

- Existing `role: 'admin'` → `roles: ['<super-admin-role-id>']`
- Existing `role: 'volunteer'` → `roles: ['<volunteer-role-id>']`
- Existing `role: 'reporter'` → `roles: ['<reporter-role-id>']`
- Migration runs via Epic 59's migration framework, or inline on first IdentityDO access

### API Changes

**New endpoints:**
- `GET /api/roles` — list all roles (authenticated, returns subset based on own permissions)
- `POST /api/roles` — create custom role (requires `system:manage-roles`)
- `PATCH /api/roles/:id` — update custom role (requires `system:manage-roles`)
- `DELETE /api/roles/:id` — delete custom role (requires `system:manage-roles`, can't delete default roles)
- `GET /api/permissions` — list full permission catalog (requires `system:manage-roles`)

**Modified endpoints:**
- `POST /api/invites` — accepts `roleIds: string[]` instead of `role: UserRole`
- `PATCH /api/volunteers/:pubkey` — accepts `roles: string[]` instead of `role: UserRole`
- `GET /api/auth/me` — returns `roles: Role[]` with resolved permissions

### Middleware Refactor

Replace `adminGuard` and `roleGuard` with a permission-based middleware:

```typescript
// New permission middleware
export function requirePermission(...permissions: Permission[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const volunteer = c.get('volunteer')
    const roles = c.get('allRoles') // loaded once per request

    for (const perm of permissions) {
      if (!hasPermission(volunteer, roles, perm)) {
        return c.json({ error: 'Forbidden', required: perm }, 403)
      }
    }
    await next()
  })
}

// Usage:
app.get('/api/audit', requirePermission('audit:read'), auditHandler)
app.post('/api/shifts', requirePermission('shifts:create'), createShiftHandler)
```

### Frontend Changes

Replace `isAdmin` / `role` checks with a permission-checking hook:

```typescript
function usePermission(permission: string): boolean
function useAnyPermission(...permissions: string[]): boolean
function useAllPermissions(...permissions: string[]): boolean

// Usage:
const canManageVolunteers = usePermission('volunteers:read')
const canViewAudit = usePermission('audit:read')
```

Sidebar navigation, route guards, and conditional UI all switch from role checks to permission checks.

### Admin UI: Role Manager

New section in Admin Settings for managing roles:
- List all roles (default + custom)
- Create custom role: name, description, permission picker (grouped by domain)
- Edit custom role permissions
- Delete custom role (with confirmation, shows affected users)
- Cannot modify or delete system roles

### Invite Flow Changes

When creating an invite, admin selects one or more roles to assign (from roles they have permission to grant). On redemption, the new user receives those roles.

## Acceptance Criteria

- [ ] Permission model defined in `src/shared/types.ts`
- [ ] Roles stored in SettingsDO with default role seeding
- [ ] `requirePermission()` middleware replaces `adminGuard` and `roleGuard` across all API routes
- [ ] `hasPermission()` utility with wildcard and domain-wildcard support
- [ ] Users can have multiple roles; effective permissions = union
- [ ] Frontend `usePermission()` hook replaces all `isAdmin` / `role` checks
- [ ] Role Manager UI in admin settings (CRUD for custom roles, permission picker)
- [ ] Invite creation accepts role IDs instead of role string
- [ ] Migration: existing `role` field → `roles` array with matching default role ID
- [ ] Roles loaded once per request via middleware (cached in Hono context)
- [ ] `GET /api/auth/me` returns resolved roles with permissions
- [ ] `GET /api/permissions` returns the permission catalog
- [ ] Role labels updated: "Admin" → "Super Admin" throughout UI
- [ ] E2E tests for role creation, assignment, permission checks, and access denial

## Dependencies

- Epic 59 (Storage Migrations) — for migrating `role` → `roles`
- Blocks Epic 61 (Multi-Hub) — hub-scoped roles depend on this

## Estimated Scope

~40 files modified (all route handlers, middleware, frontend routes, auth context, shared types)
