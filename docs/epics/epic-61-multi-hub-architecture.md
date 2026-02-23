# Epic 61: Multi-Hub Architecture

## Summary

Transform the single-instance model into a multi-hub architecture where each hub operates as an independent organizational unit with its own hotline, messaging channels, report types, volunteers, shifts, and blast subscriber lists. Users exist at the instance level and can be assigned hub-scoped roles across multiple hubs.

## Current State

- Single instance: one hotline, one set of shifts, one ban list, one pool of custom fields
- 6 Durable Objects all operate as singletons via `idFromName()` with fixed string IDs
- No concept of organizational units or hub isolation
- All volunteers share a single pool

## Design

### Hub Model

```typescript
interface Hub {
  id: string                          // UUID
  name: string                        // Display name (e.g., "NYC Hotline", "LA Rapid Response")
  slug: string                        // URL-safe identifier
  description?: string
  status: 'active' | 'suspended' | 'archived'
  createdBy: string                   // Super admin pubkey
  createdAt: string
  updatedAt: string
  settings: HubSettings
}

interface HubSettings {
  hotlineName: string                 // Display name for callers (TwiML <Say>)
  hotlineNumber?: string              // Primary phone number
  telephonyProvider?: TelephonyProviderConfig
  messagingConfig?: MessagingConfig
  spamConfig?: SpamConfig
  callConfig?: CallConfig
  ivrLanguages?: string[]
  customFields?: CustomFieldDefinition[]
  reportCategories?: string[]
  transcriptionConfig?: TranscriptionConfig
}
```

### Hub-Scoped Role Assignments

Users exist globally (IdentityDO) but roles are assigned per-hub:

```typescript
interface Volunteer {
  pubkey: string
  name: string
  phone: string
  globalRoles: string[]              // Instance-level roles (super-admin)
  hubRoles: HubRoleAssignment[]      // Per-hub role assignments
  active: boolean
  // ... existing fields
}

interface HubRoleAssignment {
  hubId: string
  roleIds: string[]                  // Roles in this hub
}
```

A user can be:
- Super Admin globally + Hub Admin in Hub A + Volunteer in Hub B
- Reviewer in Hub A + Volunteer in Hub B
- Volunteer in Hub A, B, and C simultaneously

### Permission Resolution with Hubs

```typescript
function hasHubPermission(
  volunteer: Volunteer,
  roles: Role[],
  hubId: string,
  permission: string
): boolean {
  // Super-admin bypasses all hub checks
  const globalPerms = resolvePermissions(volunteer.globalRoles, roles)
  if (globalPerms.includes('*')) return true

  // Check hub-specific roles
  const hubAssignment = volunteer.hubRoles.find(hr => hr.hubId === hubId)
  if (!hubAssignment) return false

  return hasPermission(hubAssignment.roleIds, roles, permission)
}
```

### Durable Object Architecture

**Option: Per-Hub DO Instances** (recommended for isolation + scaling)

Each hub gets its own set of DOs via `idFromName(hubId)`:

| DO | Scope | Key Strategy |
|----|-------|-------------|
| **IdentityDO** | Global (singleton) | `idFromName('global-identity')` — user accounts + hub memberships |
| **SettingsDO** | Global (singleton) | `idFromName('global-settings')` — instance config, role definitions, hub registry |
| **RecordsDO** | Per-hub | `idFromName(hubId)` — notes, audit logs, bans scoped to hub |
| **ShiftManagerDO** | Per-hub | `idFromName(hubId)` — shifts for this hub |
| **CallRouterDO** | Per-hub | `idFromName(hubId)` — active calls, WebSocket hub for this hub |
| **ConversationDO** | Per-hub | `idFromName(hubId)` — conversations, messages scoped to hub |

**Hub registry** stored in SettingsDO: `settings:hubs` → `Hub[]`

**Routing**: API requests include hub context via URL prefix or header:
```
/api/hubs/:hubId/shifts
/api/hubs/:hubId/calls/active
/api/hubs/:hubId/notes
/api/hubs/:hubId/conversations
```

Global endpoints remain unprefixed:
```
/api/auth/me
/api/roles
/api/hubs          (list/create/manage hubs)
/api/volunteers    (global user management)
```

### Telephony Routing

Each hub has its own phone number(s). Incoming calls are routed to the correct hub based on the called number:

```
Incoming call → Worker
  → lookup called number in hub registry
  → route to hub's CallRouterDO instance
  → parallel ring hub's on-shift volunteers
```

Webhook URLs include hub context:
```
/api/telephony/incoming?hub={hubId}
/api/telephony/volunteer-answer?hub={hubId}&callId={callId}
```

### Messaging Routing

Same pattern — inbound webhooks include hub context:
```
/api/messaging/sms/webhook?hub={hubId}
/api/messaging/whatsapp/webhook?hub={hubId}
/api/messaging/signal/webhook?hub={hubId}
```

Each hub configures its own messaging channels independently.

### WebSocket Changes

Volunteers connect to a specific hub's WebSocket:
```
/api/ws?hub={hubId}
```

Or a global WebSocket that multiplexes hub events:
```
/api/ws   (receives events tagged with hubId)
```

Frontend displays events from all hubs the user belongs to, organized by hub in the sidebar.

### Frontend Architecture

**Hub Switcher**: Sidebar component showing all hubs the user belongs to. Current hub selection drives all data views.

**URL Structure**:
```
/hubs/:hubId/dashboard
/hubs/:hubId/calls
/hubs/:hubId/notes
/hubs/:hubId/conversations
/hubs/:hubId/reports
/hubs/:hubId/shifts
/hubs/:hubId/volunteers
/hubs/:hubId/settings
/hubs/:hubId/blasts          (Epic 62)
/admin/hubs                  (super admin: hub management)
/admin/roles                 (super admin: role management)
/admin/users                 (super admin: global user management)
```

**Hub Context Provider**: React context providing current hub ID, hub settings, and hub-scoped permission checks.

### Default Hub

On fresh install (setup wizard), the first hub is created automatically. Single-hub deployments work seamlessly — the hub switcher is hidden when only one hub exists.

### Migration

- All existing data migrates into a default hub (auto-generated UUID)
- Existing `admin` users become super admins + hub admins of the default hub
- Existing `volunteer` users become volunteers in the default hub
- Existing `reporter` users become reporters in the default hub
- Existing DO data re-keyed under the default hub's namespace

### Hub Admin Capabilities

Hub admins can:
- Manage volunteers within their hub (invite, assign roles, deactivate)
- Configure hub-specific settings (telephony, messaging, spam, custom fields)
- Manage shifts and shift assignments
- View hub-specific audit logs
- Send blasts to hub subscribers (Epic 62)
- Cannot create new hubs (super admin only)
- Cannot modify global roles or instance settings

### API Changes

**New endpoints:**
- `GET /api/hubs` — list hubs (filtered by membership)
- `POST /api/hubs` — create hub (requires `system:manage-hubs`)
- `GET /api/hubs/:id` — get hub details
- `PATCH /api/hubs/:id` — update hub settings (requires `settings:manage` in hub)
- `DELETE /api/hubs/:id` — archive hub (requires `system:manage-hubs`)
- `POST /api/hubs/:id/members` — add user to hub with role(s)
- `DELETE /api/hubs/:id/members/:pubkey` — remove user from hub

**Modified endpoints:**
All existing `/api/...` routes for hub-scoped resources get prefixed with `/api/hubs/:hubId/...`

## Acceptance Criteria

- [x] Hub model defined in shared types
- [x] Hub registry in SettingsDO with CRUD API
- [x] Per-hub DO instances for RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO
- [x] Hub-scoped role assignments on users (`hubRoles` array)
- [x] `hasHubPermission()` checks in all hub-scoped middleware
- [x] Telephony routing: incoming call → hub lookup by called number → hub's CallRouterDO
- [x] Messaging routing: inbound webhooks → hub lookup → hub's ConversationDO
- [x] Frontend hub switcher (hidden for single-hub instances)
- [x] URL structure: `/api/hubs/:hubId/...` for all hub-scoped API routes
- [x] Hub context provider for frontend (activeHubId in api.ts, hp() path helper)
- [x] Super admin UI: hub CRUD at /admin/hubs (create, edit, list)
- [x] Default hub created on fresh install; seamless single-hub UX
- [x] Setup wizard creates first hub
- [x] WebSocket routed to hub's CallRouterDO via `?hub=` param
- [x] E2E tests for hub creation, hub switching, hub-scoped access control, cross-hub isolation (8 tests)

## Dependencies

- **Requires** Epic 60 (PBAC) — hub-scoped roles depend on the permission system
- **Requires** Epic 59 (Storage Migrations) — data migration to default hub
- **Blocks** Epic 62 (Message Blasts) — blasts are per-hub

## Estimated Scope

~60 files modified/created. Major refactor touching all routes, DOs, and frontend views.
