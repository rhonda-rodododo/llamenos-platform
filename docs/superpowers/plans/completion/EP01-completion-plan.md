# EP01 — Permission System & Role Management — Completion Plan

## Scope

### Already Done (~90%)
- `requiredRole` removed from `AdminNavItem` type
- All 5 `system:view-*` permissions in catalog and gated in nav config
- Hub Roles Section with full CRUD
- PermissionPicker with scope-aware radio buttons
- RoleEditor with auto-slug generation
- RoleList with edit/delete
- RolesSection full CRUD
- React Query hooks (`useRoles`, `usePermissionsCatalog`, `useCreateRole`, etc.)
- Crypto labels: `LABEL_PLATFORM_ROLE_NAME_ENCRYPT`, `LABEL_PLATFORM_ROLE_DESC_ENCRYPT`, `LABEL_HUB_ROLE_ENCRYPT`
- Backend role CRUD endpoints
- Permission-based nav visibility tests
- BDD scenarios (2 @wip)

### Remaining Work
- Platform Roles editor UI (currently "Coming Soon" stub)
- HPKE envelope encryption for platform role names/descriptions (frontend wiring)
- `platformRoleEnvelopes` DB table and backend envelope CRUD
- `GET /users/:id/effective-permissions` endpoint
- `assignedUserCount` in role list response
- Template role import UI in hub roles section
- iOS read-only role viewer
- Android read-only role viewer
- 2 @wip BDD scenarios

## Tasks (ordered by dependency)

### Task 1: Platform role envelope DB table and backend endpoints
- **Platform**: backend
- **Files**:
  - `apps/worker/db/schema/` — new `platformRoleEnvelopes` table: `(roleId, adminPubkey, encryptedName, encryptedDescription)`
  - `apps/worker/routes/settings.ts` — accept/return envelopes on platform role create/update/list; add `POST /settings/roles/:id/envelopes` for re-wrap
  - `apps/worker/routes/settings.ts` — add `GET /users/:id/effective-permissions` endpoint
  - `apps/worker/routes/settings.ts` — include `assignedUserCount` in role list response
- **What**: Create the `platformRoleEnvelopes` DB table. Modify the platform role CRUD endpoints to accept an `envelopes` array on create/update. Return envelopes in the role list response. Add the re-wrap endpoint for when a new super-admin is promoted. Implement the effective-permissions endpoint that resolves the union of all a user's roles. Add `assignedUserCount` (COUNT of users with this role ID) to each role in the list response.
- **Spec reference**: D3 (Platform role encryption), D1 (effective permissions endpoint)
- **Acceptance**: `bun run test:backend:bdd` passes; new endpoints return correct data; envelopes stored without plaintext

### Task 2: Platform Roles Section — desktop UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/platform-roles-section.tsx` — replace "Coming Soon" with full CRUD
- **What**: Replace the stub with a working `PlatformRolesSection` that reuses the shared `RoleList`, `RoleEditor`, and `PermissionPicker` components. On create/update, fetch all super-admin X25519 pubkeys via `platform.ts`, generate HPKE envelopes for each admin's pubkey using `LABEL_PLATFORM_ROLE_NAME_ENCRYPT` and `LABEL_PLATFORM_ROLE_DESC_ENCRYPT`, and submit envelopes alongside the role data. On list, decrypt the envelope for the current device key. Show `assignedUserCount` per role.
- **Spec reference**: D3, Architecture section (component hierarchy), Data flow (platform role create)
- **Acceptance**: Platform roles CRUD works end-to-end; role names never sent as plaintext; user count displayed; `bun run test` passes

### Task 3: Template role import UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-settings/roles-section.tsx` or `hub-roles-section.tsx` — add "Import from template" button
- **What**: Add an "Import from template" button to the Hub Roles section. Opens a dialog showing applicable templates with their suggested roles and permission lists. Admin selects which to import. For each selected role, generate UUID, encrypt name/description with hub key using `LABEL_HUB_ROLE_ENCRYPT`, and create via `POST /settings/roles`. Skip duplicates by checking existing slugs client-side.
- **Spec reference**: D5 (Template-suggested roles)
- **Acceptance**: Template roles can be imported; encrypted on creation; duplicates skipped gracefully

### Task 4: Fix @wip BDD scenarios
- **Platform**: backend
- **Files**:
  - `packages/test-specs/features/core/volunteer-lifecycle.feature` — 1 @wip scenario
  - `packages/test-specs/features/platform/desktop/admin/admin-flow.feature` — 1 @wip scenario
  - Related step definitions in `tests/steps/`
- **What**: Investigate and fix the 2 @wip BDD scenarios related to access control and toggle functionality. Remove @wip tags once passing.
- **Spec reference**: EP01 BDD test plan
- **Acceptance**: `bun run test:backend:bdd` — both scenarios pass without @wip

### Task 5: iOS read-only role viewer
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Settings/RoleListView.swift` (new)
  - `apps/ios/Sources/Services/RolesService.swift` (new or extend existing)
- **What**: SwiftUI view showing a list of hub roles with decrypted names (via `CryptoService.decryptHubField`), permission counts, and system/default badges. Tap to expand shows permissions grouped by domain. Uses codegen'd types from `packages/protocol`. Read-only — no CRUD. Gated by `roles:read` or hub membership.
- **Spec reference**: D7 (Mobile — read-only role viewers)
- **Acceptance**: Role list renders with decrypted names; permissions expandable; no CRUD actions available

### Task 6: Android read-only role viewer
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/RoleListScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/RolesRepository.kt` (new or extend existing)
- **What**: Material 3 Compose screen showing hub roles with decrypted names (via `CryptoService.decryptHubField`), permission counts, expandable permission lists grouped by domain. Uses codegen'd `@Serializable` types. Read-only. Gated by permission check.
- **Spec reference**: D7 (Mobile — read-only role viewers)
- **Acceptance**: Role list renders with decrypted names; permissions expandable; matches Material 3 design

### Task 7: i18n validation
- **Platform**: all
- **Files**:
  - `packages/i18n/locales/*.json` — verify role/permission strings present
- **What**: Verify all EP01-related i18n keys exist across 13 locales. Add any missing keys for platform roles UI, template import dialog, effective permissions display. Run `bun run i18n:codegen` and `bun run i18n:validate:all`.
- **Spec reference**: Platform Coverage table
- **Acceptance**: `bun run i18n:validate:all` passes; no missing keys for EP01 features
