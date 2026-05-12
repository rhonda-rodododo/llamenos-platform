---
epic: EP01
title: Permission System & Role Management
status: specced
depends-on: []
phase: 1
pr-dependencies: [283, 285]
---

# EP01: Permission System & Role Management

## Summary

This epic completes the permission-based access control (PBAC) system by:

1. Migrating admin nav from dual `requiredRole`/`requiredPermissions` to pure permission checks (building on PR 283's admin shell)
2. Implementing the Platform Roles editor (currently a stub in PR 283)
3. Enhancing the Hub Roles editor with a scope-aware permission picker
4. Adding per-admin HPKE envelope encryption for platform role names/descriptions
5. Supporting multi-role assignment per user (union of permissions)
6. Surfacing template-suggested roles in the hub roles admin section
7. Migrating desktop roles UI to React Query
8. Delivering read-only role views on iOS and Android

The permission catalog, resolution engine, and backend middleware are production-ready. The remaining work is UI completeness, nav config cleanup, encryption for role metadata, and mobile viewers.

## Design Decisions

### D1: Remove `requiredRole` entirely

The `requiredRole: 'role-super-admin'` field on `AdminNavItem` is redundant. Every platform nav item will be gated by a `system:*` permission instead. The field is removed from the type — no deprecation period (pre-production).

New permissions added to the catalog:

| Permission | Gates |
|---|---|
| `system:view-platform` | Platform settings nav item |
| `system:view-bans` | Platform bans nav item |
| `system:view-audit` | Platform audit nav item |
| `system:view-analytics` | Platform analytics nav item |
| `system:view-health` | Platform health nav item |

Existing permissions already cover `hubs` (`system:manage-hubs`), `platform-roles` (`system:manage-roles`), and `gdpr-erasure` (`gdpr:admin`).

All new `system:view-*` permissions are granted to `role-super-admin` (already covered by `*` wildcard) and selectively to `role-hub-admin` where appropriate (e.g., `system:view-health` for operational visibility).

### D2: Multi-role assignment (union model)

Users can hold multiple roles at any scope. Permission resolution unions all granted permissions — this matches v1's model and the existing `resolvePermissions()` / `resolveHubPermissions()` functions.

- **Global roles**: Array of role IDs on the user record. Multiple selections allowed.
- **Hub roles**: Per-hub array of role IDs via `hubRoles` table. Multiple selections per hub.
- **Resolution**: `resolveHubPermissions(globalRoles, hubRoles, allRoleDefs, hubId)` already returns the union. No backend changes to the permission engine.

EP01 ensures the role definitions, resolution engine, and backend endpoints support multi-role. The user-role assignment UI (multi-select picker on user profile) belongs to EP02 (Device & Identity Management).

EP01 deliverable: Add `GET /users/:id/effective-permissions` endpoint for debugging/display, and show "X users assigned" count per role in the roles admin section.

### D3: Platform role encryption (per-admin HPKE envelopes)

Role names and descriptions are strategically sensitive — a role name like "ICE Rapid Response Coordinator" reveals organizational intent and could implicate members. The server is semi-trusted per the threat model and must not see plaintext role metadata.

**Hub roles**: Encrypted with the hub key (shared symmetric key, existing pattern). Domain separation label: `LABEL_HUB_ROLE_ENCRYPT`. AAD binding: `(roleId, fieldName)`.

**Platform roles**: Encrypted with per-admin HPKE envelopes — each super-admin gets their own envelope for each role's name and description fields. This follows the note envelope pattern (per-reader wrapping) and avoids introducing a new key type.

- On platform role create: client encrypts name/description, generates one HPKE envelope per super-admin's X25519 pubkey.
- On super-admin addition: existing platform roles are re-wrapped for the new admin.
- On super-admin departure: their envelopes are simply not renewed (no rotation needed — the data is the same, just fewer readers).

New domain separation labels:
- `LABEL_PLATFORM_ROLE_NAME_ENCRYPT` — platform role name encryption
- `LABEL_PLATFORM_ROLE_DESC_ENCRYPT` — platform role description encryption

Template-suggested roles arrive as plaintext from template JSON. On creation, they are immediately encrypted with the appropriate key (hub key or per-admin HPKE) before storage. The server never persists plaintext role names after the initial encrypt-on-create.

### D4: Scope-aware permission picker

Shared `PermissionPicker` component used by both role editors:

- **Scope permissions** (`read-own`, `read-assigned`, `read-all`, `update-own`, etc.) render as **radio buttons** per action prefix within each domain. Hierarchy: none → own → assigned → all. Selecting a higher scope implicitly includes lower scopes (enforced by the resolution engine).
- **Tier permissions** (e.g., `contacts:envelope-summary`, `contacts:envelope-full`) render as **checkboxes** — independent of scope selection.
- **Action permissions** (e.g., `notes:create`, `notes:reply`) render as **checkboxes**.
- **Domain headers**: Collapsible with indeterminate checkbox showing `X/Y selected`. Click checkbox to toggle all permissions in domain (smart toggle: for scope permissions, selects only `-all`). Click header text to expand/collapse without toggling.
- **Domain labels**: `PERMISSION_GROUP_LABELS` map added to `permissions.ts` for human-readable domain names.

The picker accepts `availablePermissions` as a prop for scope filtering — platform roles see all permissions, hub roles exclude `system:*` permissions.

### D5: Template-suggested roles

Two entry points:

1. **Hub creation wizard** (PR 285): Selected template's `suggestedRoles` presented as a checklist during hub creation. Checked roles created via `POST /settings/roles/from-template` after hub creation. Names encrypted with hub key on create.

2. **Hub Roles admin section**: "Import from template" button shows applicable templates with their suggested roles and permission lists. Admin picks which to create. Duplicates skipped by slug (existing endpoint behavior). Same encrypt-on-create flow.

The hub creation wizard (PR 285) uses the existing `POST /settings/roles/from-template` endpoint which accepts plaintext — this is fine because it runs before the hub key is available. For post-creation import from the admin section, the client creates roles individually via the standard `POST /settings/roles` endpoint with encrypted fields (hub key encryption). No new backend endpoint needed — only UI surfaces.

### D6: React Query migration

Replace hand-managed `useState`/`useEffect` in roles UI with React Query hooks:

- `useRoles(scope: 'hub' | 'platform')` — fetches and decrypts role names client-side, 5min stale time
- `usePermissionsCatalog()` — fetches permission catalog, 5min stale time
- `useCreateRole()` — mutation, invalidates roles query on success
- `useUpdateRole()` — mutation, invalidates roles query on success
- `useDeleteRole()` — mutation, invalidates roles query on success
- `useCreateRolesFromTemplate()` — wraps `/roles/from-template` endpoint, invalidates roles query

### D7: Mobile — read-only role viewers

**iOS (SwiftUI)**: Role list view showing decrypted role names, permission count, system/default badges. Tap to expand and see the full permission list grouped by domain. No CRUD — editing deferred to desktop.

**Android (Compose)**: Same as iOS — Material 3 role viewer with expandable permission lists. No CRUD initially.

Mobile CRUD is deferred to a follow-up — the scope-aware permission picker UX is complex enough to warrant its own mobile design pass.

## Architecture

### Component hierarchy (desktop)

```
AdminShell (PR 283)
├── AdminSidebar
│   ├── hub-roles → HubRolesSection
│   └── platform-roles → PlatformRolesSection
│
├── HubRolesSection
│   ├── RoleList (shared)
│   │   └── RoleCard (name, badges, permission count, actions)
│   ├── RoleEditor (shared)
│   │   ├── RoleForm (name, slug, description)
│   │   └── PermissionPicker (scope-aware)
│   │       ├── DomainSection (collapsible, indeterminate checkbox)
│   │       │   ├── ScopeGroup (radio buttons: none/own/assigned/all)
│   │       │   ├── TierGroup (checkboxes)
│   │       │   └── ActionGroup (checkboxes)
│   │       └── DomainSection...
│   └── ImportFromTemplate (button → template picker dialog)
│
└── PlatformRolesSection
    ├── RoleList (shared)
    └── RoleEditor (shared, same PermissionPicker)
```

### Data flow (platform role create)

```
1. Admin fills RoleEditor form (name, description, permissions)
2. Client generates role ID (UUID)
3. Client fetches all super-admin X25519 pubkeys
4. For each admin pubkey:
   - HPKE-seal(name, label=LABEL_PLATFORM_ROLE_NAME_ENCRYPT, aad=(roleId, 'name'))
   - HPKE-seal(desc, label=LABEL_PLATFORM_ROLE_DESC_ENCRYPT, aad=(roleId, 'description'))
5. POST /settings/roles {
     id, permissions, envelopes: [{ pubkey, encryptedName, encryptedDescription }]
   }
6. Server stores role + envelopes, never sees plaintext name/description
7. On GET /settings/roles: server returns envelopes, client decrypts with own device key
```

### Data flow (hub role create)

```
1. Admin fills RoleEditor form
2. Client generates role ID
3. Client encrypts with hub key:
   - AES-GCM(name, key=hubKey, aad=(roleId, 'name'), label=LABEL_HUB_ROLE_ENCRYPT)
   - AES-GCM(desc, key=hubKey, aad=(roleId, 'description'), label=LABEL_HUB_ROLE_ENCRYPT)
4. POST /settings/roles { id, hubId, permissions, encryptedName, encryptedDescription }
5. Server stores encrypted fields
6. On GET /settings/roles: client decrypts with hub key
```

### Data flow (template role import)

```
1. Admin clicks "Import from template" in HubRolesSection
2. Client fetches applicable templates (already loaded or from catalog)
3. Admin selects roles to import (checklist with permission preview)
4. For each selected role:
   - Generate role ID
   - Encrypt name/description with hub key
   - Call POST /settings/roles (regular create endpoint, one per role)
5. Each role is created individually with encrypted fields
   (existing /roles/from-template endpoint takes plaintext — not suitable for E2EE)
6. Server stores encrypted roles, skips duplicates by slug check client-side
```

Note: The existing `POST /settings/roles/from-template` endpoint accepts plaintext role names and is used during hub creation (PR 285) before hub key is available. For post-creation import where the hub key exists, the client creates roles individually via the standard endpoint with encrypted fields.

### Backend changes

| Change | File | Detail |
|--------|------|--------|
| Add 5 system permissions | `packages/shared/permissions.ts` | `system:view-platform`, `system:view-bans`, `system:view-audit`, `system:view-analytics`, `system:view-health` |
| Add `PERMISSION_GROUP_LABELS` | `packages/shared/permissions.ts` | Human-readable domain labels for permission picker UI |
| Add domain separation labels | `packages/protocol/crypto-labels.json` | `LABEL_PLATFORM_ROLE_NAME_ENCRYPT`, `LABEL_PLATFORM_ROLE_DESC_ENCRYPT`, `LABEL_HUB_ROLE_ENCRYPT` |
| Platform role envelope storage | `apps/worker/db/` | New `platformRoleEnvelopes` table: `(roleId, adminPubkey, encryptedName, encryptedDescription)` |
| Envelope CRUD on role endpoints | `apps/worker/routes/settings.ts` | Accept/return envelopes array on platform role create/update/list |
| Re-wrap on admin addition | `apps/worker/routes/settings.ts` | `POST /settings/roles/:id/envelopes` — accepts new envelopes for a role. Client-initiated: when an existing super-admin promotes a new super-admin, their client decrypts all platform role names and re-encrypts for the new admin's X25519 pubkey, then uploads the new envelopes. Server stores but never sees plaintext. |
| Effective permissions endpoint | `apps/worker/routes/settings.ts` | `GET /users/:id/effective-permissions` — resolves union for display |
| User count per role | `apps/worker/routes/settings.ts` | Include `assignedUserCount` in role list response |

### Nav config changes (building on PR 283)

| Change | File | Detail |
|--------|------|--------|
| Remove `requiredRole` from type | `admin-nav-config.types.ts` | Delete `requiredRole?: 'role-super-admin'` field |
| Update platform items | `admin-nav-config.ts` | Replace `requiredRole` with `requiredPermissions` using new `system:view-*` permissions |
| Simplify `canSeeItem()` | `admin-nav-visibility.ts` | Remove role check branch — permissions only |
| Simplify `canSeeGroup()` | `admin-nav-visibility.ts` | Remove platform scope special case — use same permission check as hub groups |
| Update tests | `admin-nav-visibility.test.ts` | Remove role-based test cases, add permission-based equivalents |

## Scope

### In scope

- Remove `requiredRole` from `AdminNavItem` type and all nav config entries
- Add 5 `system:view-*` permissions to the catalog
- Add `PERMISSION_GROUP_LABELS` to `permissions.ts`
- Add 3 domain separation labels to `crypto-labels.json` + run codegen
- Implement `PlatformRolesSection` (replacing PR 283 stub) with per-admin HPKE envelope encryption
- Implement `platformRoleEnvelopes` DB table and envelope CRUD
- Enhance `HubRolesSection` with scope-aware permission picker
- Build shared `PermissionPicker` component with radio/checkbox/domain UX
- Build shared `RoleList` and `RoleEditor` components
- Migrate roles UI to React Query hooks
- Add "Import from template" button to `HubRolesSection`
- Add `GET /users/:id/effective-permissions` endpoint
- Add `assignedUserCount` to role list response
- Create iOS SwiftUI read-only role list view
- Create Android Compose read-only role list view
- Add `canSeeItem()` / `canSeeGroup()` visibility unit tests (permission-only)
- Re-wrap platform role envelopes on super-admin addition (client-initiated: existing admin decrypts + re-encrypts for new admin's pubkey)
- Ensure all default roles have correct permissions in the catalog

### Out of scope

- User-role assignment UI (multi-select picker on user profile) — EP02
- The `volunteer` → `user` entity rename — covered by PBAC alignment spec
- Custom field visibility migration from boolean to role-based ACL
- MLS group key management for role-encrypted fields
- Audit logging of role changes — already implemented in current backend
- Mobile role CRUD (deferred — read-only viewers only)
- Hub creation wizard template role selection — PR 285
- Admin shell / nav infrastructure — PR 283

## Dependencies

- **Requires (before starting)**: PR 283 merged (admin shell, nav config, section routing)
- **Blocks**: EP02 (User/Device Management) — role assignment UI depends on role definitions being complete
- **Blocks**: Any epic that adds admin nav items — nav config structure must be finalized first
- **Coordinates with**: PR 285 (hub creation) — template role selection in creation wizard
- **Related**: PBAC alignment spec (`2026-03-19-user-pbac-alignment`) — entity rename is orthogonal

## Platform Coverage

| Platform | Work needed |
|----------|-------------|
| **Backend** | Add 5 permissions, 3 crypto labels, `platformRoleEnvelopes` table, envelope CRUD, effective-permissions endpoint, user count per role |
| **Desktop** | Remove `requiredRole` from nav, implement PlatformRolesSection, enhance HubRolesSection, build shared PermissionPicker/RoleEditor/RoleList, React Query hooks, template import UI |
| **iOS** | Read-only SwiftUI role list view with decrypted names and permission expansion |
| **Android** | Read-only Compose role list view with Material 3 and permission expansion |
| **Protocol** | Add domain separation labels to `crypto-labels.json`, run codegen |

## Security Considerations

- **Role names are strategically sensitive**: Names like "ICE Rapid Response Coordinator" or "Copwatch Monitor" could implicate members. The server must never see plaintext role names. This is not PII protection — it is strategic data protection per the threat model.
- **Per-admin HPKE envelopes for platform roles**: Each super-admin gets their own envelope. No shared "platform key" — follows the note envelope pattern. New admins get re-wrapped envelopes. Departed admins simply lose access (no rotation needed).
- **Hub key encryption for hub roles**: Existing hub key pattern. Rotation on member departure excludes departed member from new role name decryption.
- **Template roles arrive as plaintext**: Template JSON files are bundled with the app and contain plaintext role names/descriptions. These are encrypted on creation, not at rest in the template files. Template content is not secret — it describes generic role archetypes.
- **Domain separation labels**: Three new labels prevent cross-context decryption. Labels enforced at decrypt per Albrecht defense.
- **Permission validation**: `isValidPermission()` already validates permission strings on role create/update. Template role creation also validates via the existing endpoint.

## Open Questions (Resolved)

1. **Remove `requiredRole` entirely?** → Yes, remove entirely. Pre-production, no backwards compatibility needed. Pure permission-based gating.
2. **Split sections or filter?** → Two separate components (`PlatformRolesSection`, `HubRolesSection`) sharing common subcomponents (`RoleEditor`, `RoleList`, `PermissionPicker`).
3. **What permission gates platform nav items?** → Five new `system:view-*` permissions. Specific to each item rather than a single catch-all.
4. **Encrypted role names?** → Yes, always. Hub roles with hub key, platform roles with per-admin HPKE envelopes. Role names are strategically implicating data.
5. **Mobile scope?** → Read-only role list viewers initially. CRUD deferred to a follow-up mobile design pass.
6. **Permission picker depth?** → Full scope-aware picker with radio buttons for scope hierarchy, checkboxes for actions/tiers, collapsible domains with indeterminate state.
