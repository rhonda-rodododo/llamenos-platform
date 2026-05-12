---
epic: EP01
title: Permission System & Role Management
status: stub
depends-on: []
phase: 1
---

# EP01: Permission System & Role Management

## Summary

This epic completes the permission-based access control (PBAC) system by migrating the admin nav from dual `requiredRole`/`requiredPermissions` to pure permission checks, building the Platform Roles editor UI (currently a stub), enhancing the Hub Roles editor with v1-parity permission picker UX, and delivering role management views on iOS and Android. The permission catalog, resolution engine, and backend middleware are already production-ready -- the remaining work is UI completeness and nav config cleanup.

## Existing v2 Implementation

### Permission infrastructure (complete)
- **Permission catalog**: 69 permissions across 19 domains -- `/media/rikki/recover/projects/llamenos/packages/shared/permissions.ts`
- **Hub-scoped resolution**: `hasHubPermission()`, `resolveHubPermissions()`, `permissionGranted()` -- same file
- **5 default roles**: Super Admin, Hub Admin, Reviewer, Volunteer, Reporter with `DEFAULT_ROLES` -- same file
- **Backend middleware**: `requirePermission()` -- `/media/rikki/recover/projects/llamenos/apps/worker/middleware/permission-guard.ts`
- **Role CRUD routes**: POST/PATCH/DELETE `/settings/roles` gated by `system:manage-roles` -- `/media/rikki/recover/projects/llamenos/apps/worker/routes/settings.ts`
- **Role service**: Create/update/delete/list roles with DB persistence -- `/media/rikki/recover/projects/llamenos/apps/worker/services/settings.ts`
- **Permission catalog API**: `GET /settings/permissions-catalog` endpoint returns permissions grouped by domain

### Desktop admin UI (partially complete)
- **Roles section**: Full CRUD with domain-grouped permission picker -- `/media/rikki/recover/projects/llamenos/src/client/components/admin-settings/roles-section.tsx`
- **Admin settings page**: Renders RolesSection -- `/media/rikki/recover/projects/llamenos/src/client/routes/admin/settings.tsx`
- **No admin nav sidebar yet**: v2 does not have the admin-shell nav infrastructure (sidebar, nav config, nav visibility) that v1 has -- admin routes are accessed directly

### Nav config (v1, needs migration)
- **Nav config with dual auth**: `requiredPermissions` + `requiredRole: 'role-super-admin'` on 5 platform-scope items -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-config.ts` (lines 196-225)
- **Nav visibility**: `canSee()` checks `requiredRole` first, then `requiredPermissions` -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-visibility.ts`
- **Nav config types**: `requiredRole?: 'role-super-admin'` optional field on `AdminNavItem` -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-config.types.ts`

## Existing v2 Specs & Plans

- **Spec**: `docs/superpowers/specs/2026-03-19-user-pbac-alignment.md` -- covers renaming `volunteer` entity type to `user` across the entire codebase (DB, backend, protocol, client, mobile, tests). This is a naming alignment spec, not a permission system design. It identifies the `volunteers:*` -> `users:*` permission domain rename (already done in v2) but does not address nav migration or role editor UI gaps.
- **Plan**: `docs/superpowers/plans/2026-03-19-user-pbac-alignment.md` -- 14-phase implementation plan for the entity rename. The permission domain rename from `volunteers:*` to `users:*` is already reflected in the current v2 `PERMISSION_CATALOG`.

## v1 Reference Implementation

### Admin nav infrastructure
- **Nav config**: Pure permission-based with `requiredRole` only on platform-scope items -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-config.ts`
- **Nav config types**: `AdminNavItem`, `AdminNavGroup`, `AdminNavConfig` -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-config.types.ts`
- **Nav visibility**: `canSee()`, `canSeeGroup()` with `NavAuthContext` interface -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-visibility.ts`
- **Nav visibility tests**: Validates hub-admin vs super-admin visibility -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-shell/admin-nav-visibility.test.ts`

### Platform Roles editor
- **Full CRUD with permission picker**: Domain-grouped checkboxes, system role locking, encrypted name/description fields, hub-key fallback for platform scope -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/platform-roles-section.tsx`
- **React Query hooks**: `useRoles()`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()`, `usePermissionsCatalog()` -- `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/roles.ts`

### Hub Roles editor
- **Scope-aware permission picker**: Groups permissions by own/assigned/all scope levels, domain collapsible sections, select-all per domain -- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/hub-roles-section.tsx`
- **Permission group labels**: `PERMISSION_GROUP_LABELS` for human-readable domain names -- `/home/rikki/projects/llamenos-hotline/src/shared/permissions.ts`

### Backend role management
- **Role management service**: CRUD with permission validation -- `/home/rikki/projects/llamenos-hotline/src/server/services/settings/role-management.ts`

## Gap Analysis

### 1. Admin nav config (desktop)
- v2 has **no admin shell nav infrastructure** -- no sidebar, no nav config, no nav visibility checks
- v1's nav config uses both `requiredRole` and `requiredPermissions` on platform items -- the design goal is to migrate to permissions-only
- The 5 platform-scope items in v1 (`hubs`, `platform-roles`, `platform`, `gdpr-erasure`, `retention`) use `requiredRole: 'role-super-admin'` as a belt-and-suspenders check. These should be replaceable with `system:*` permissions (e.g., `system:manage-hubs`, `system:manage-roles`, `gdpr:admin`)
- The `platform` item has `requiredPermissions: []` with only `requiredRole` -- needs a proper system-level permission

### 2. Platform Roles editor (desktop)
- v2's `roles-section.tsx` is a combined roles editor -- no separate platform vs hub distinction
- v1 has separate `platform-roles-section.tsx` and `hub-roles-section.tsx` components
- v2 is missing the platform-scope vs hub-scope role separation in the UI

### 3. Hub Roles editor (desktop)
- v2's `roles-section.tsx` has a basic permission picker (domain collapsible, per-permission checkboxes)
- v1's `hub-roles-section.tsx` has a more sophisticated scope-aware picker (`ScopeGroup` with own/assigned/all levels)
- v2 is missing: scope-level grouping, `PERMISSION_GROUP_LABELS` integration, select-all per domain with indeterminate state

### 4. Permission catalog completeness
- v2 has 69 permissions across 19 domains -- needs audit against v1 to ensure coverage
- The `platform` nav item has no associated permission (`requiredPermissions: []`) -- needs a `system:view-platform` or similar permission

### 5. Mobile role management
- **iOS**: No role editor views exist. Need SwiftUI views for listing, creating, editing roles with permission picker
- **Android**: No role editor views exist. Need Compose views with Material 3 for the same

### 6. React Query integration (desktop)
- v1 uses React Query hooks (`useRoles()`, `useCreateRole()`, etc.) for role management
- v2's `roles-section.tsx` uses raw `useState` + manual API calls -- should be migrated to React Query for cache coherence

## Scope

### In scope
- Remove `requiredRole` from `AdminNavItem` type and all nav config entries
- Add missing system-level permissions to cover platform nav items (e.g., `system:view-platform`)
- Port admin nav sidebar infrastructure from v1 (config, types, visibility, tests) if not already landed via another epic
- Split `roles-section.tsx` into separate Platform Roles and Hub Roles sections, or add scope filtering within the existing component
- Enhance permission picker with scope-level grouping (own/assigned/all) matching v1's `ScopeGroup`
- Migrate role management API calls to React Query hooks
- Create iOS SwiftUI views: role list, role editor with permission picker
- Create Android Compose views: role list, role editor with permission picker
- Add `canSee()` / `canSeeGroup()` visibility functions with unit tests
- Ensure all 5 default roles have correct permissions in the catalog

### Out of scope
- The `volunteer` -> `user` entity rename (covered by the PBAC alignment spec/plan)
- Custom field visibility migration from boolean to role-based ACL
- Role assignment to users (covered by user management epic)
- MLS group key management for role-encrypted fields
- Audit logging of role changes (covered by audit epic)

## Dependencies

- **Blocks**: EP02 (User Management) -- role assignment UI depends on role definitions being complete
- **Blocks**: Any epic that adds admin nav items -- nav config structure must be finalized first
- **Blocked by**: None -- the permission catalog and backend CRUD are already complete
- **Related**: PBAC alignment spec (`2026-03-19-user-pbac-alignment`) -- the entity rename is orthogonal but should be coordinated if both execute concurrently

## Platform Coverage

| Platform | Work needed |
|----------|-------------|
| **Backend** | Add missing `system:view-platform` permission to catalog; verify role CRUD endpoints handle platform vs hub scope correctly |
| **Desktop** | Port admin nav infrastructure; split/enhance roles sections; migrate to React Query; remove `requiredRole` from nav |
| **iOS** | New SwiftUI views for role list + editor with permission picker (codegen types from protocol) |
| **Android** | New Compose views for role list + editor with permission picker (codegen types from protocol) |

## Open Questions

1. **Remove `requiredRole` entirely or keep as deprecated?** The `requiredRole` field on nav items is redundant if every platform item has correct `system:*` permissions. Should it be removed from the type, or kept as an optional override for defense-in-depth?

2. **Split sections or filter?** Should Platform Roles and Hub Roles be two separate components (as in v1) or a single component with a scope filter toggle? The v1 approach of separate components is cleaner for super-admin-only gating.

3. **What permission gates `system:view-platform`?** The `platform` nav item currently has `requiredPermissions: []` -- meaning anyone with `role-super-admin` can see it regardless of permissions. What permission should replace this? Options: `system:view-platform`, `system:manage-settings`, or just `system:*` wildcard.

4. **Encrypted role names?** v1's `PlatformRolesSection` uses `encryptHubField()` for role name/description fields. Should v2 encrypt role metadata at rest, or is this unnecessary given roles are not PII?

5. **Mobile scope**: Should the first mobile release include full role CRUD, or start with read-only role listing with editing deferred to desktop?

6. **Permission picker depth**: v1's hub roles section has scope-level grouping (own/assigned/all) as a subgroup within each domain. How important is this UX for the initial release vs a flat list of permissions per domain?
