# Spec: User/PBAC Naming Alignment

**Date**: 2026-03-19
**Status**: Ready for implementation
**Scope**: Full codebase rename — DB, backend, protocol, client, mobile, tests, docs

---

## Problem Statement

The codebase hardcodes "volunteer" as a fixed entity type throughout. This predates the PBAC
(Permission-Based Access Control) system, which models all actors as generic users with dynamic
roles. The legacy binary admin/volunteer mental model is gone — but the naming has not caught up.

Concretely:
- The DB table is named `volunteers`. It stores all authenticated users, including admins.
- The API endpoint is `/api/volunteers`. The route handler, Drizzle ORM variable, service methods,
  and audit events all use the `volunteer` noun for what is fundamentally a user entity.
- The TypeScript interface is `Volunteer` (in `apps/worker/types.ts:129`).
- The deprecated `UserRole = 'volunteer' | 'admin' | 'reporter'` union type persists in
  `apps/worker/types.ts:127`.
- Protocol schemas live in `packages/protocol/schemas/volunteers.ts` and export
  `volunteerResponseSchema`, `volunteerListResponseSchema`, `createVolunteerBodySchema`, etc.
- The `AppEnv.Variables` context key `volunteer: Volunteer` (types.ts:382) is set in every
  authenticated request (auth middleware line 65) and read in ~15 route files.
- The permission domain is named `volunteers:*` (permissions.ts:64–72).
- `customFieldDefinitions` table has `visibleToVolunteers` / `editableByVolunteers` columns
  (settings.ts:144–145).
- `systemSettings` has `allowVolunteerTranscriptionOptOut` (settings.ts:27).
- `WebAuthnSettings` interface has `requireForVolunteers` (types.ts:286).
- Shifts table has `volunteerPubkeys` column (shifts.ts:29).
- Android references `/api/admin/volunteers` (different path variant — unclear if live or legacy).
- iOS calls `POST /api/volunteers` for user creation (AppState.swift:243).
- i18n locale strings use "Volunteers" as a UI label (~25 keys in en.json).
- 66 test files reference volunteer in some form.

The word "volunteer" is a **role name** ("Volunteer", `role-volunteer`) in the PBAC system —
this is correct and must remain. The problem is using it as an **entity type**.

---

## Current State Analysis

### PBAC System (Already Correct)

`packages/shared/permissions.ts` implements a complete PBAC system:

- **Permission catalog**: 90+ granular permissions like `calls:answer`, `notes:create`,
  `volunteers:read`, `system:manage-roles`.
- **Role interface**: `{ id, name, slug, permissions[], isDefault, isSystem }`.
- **DEFAULT_ROLES** (5 system roles seeded at startup):
  - `role-super-admin` — permissions: `['*']`, isSystem: true
  - `role-hub-admin` — hub-scoped admin capabilities
  - `role-reviewer` — supervisor/reviewer access
  - `role-volunteer` — call answering, notes, conversations, cases
  - `role-reporter` — report submission only
- **Resolution**: `resolvePermissions(roleIds, allRoles)` returns union of permissions from all roles.
- **Hub scoping**: `hasHubPermission()` and `resolveHubPermissions()` for per-hub role assignments.
- `roles` table in DB (`settings.ts:113`) stores dynamic role definitions (admin-created, from templates).
- Auth middleware (`middleware/auth.ts`) loads all roles from `SettingsService` per request and
  resolves permissions via `resolvePermissions()`.

This system is correct. The `role-volunteer` role is properly a **role name**, not an entity type.
No changes needed to the PBAC logic itself.

### Where "Volunteer" Is Hardcoded as an Entity Type

#### 1. Database layer

| Location | Hardcoding |
|----------|-----------|
| `apps/worker/db/schema/volunteers.ts:20` | `pgTable('volunteers', ...)` — table name |
| `apps/worker/db/schema/volunteers.ts:20` | Drizzle ORM variable `volunteers` used in all queries |
| `apps/worker/db/schema/volunteers.ts:25` | Default roles array: `'{"volunteer"}'::text[]` |
| `apps/worker/db/schema/volunteers.ts:67` | `sessions.pubkey` FK references `volunteers.pubkey` |
| `apps/worker/db/schema/volunteers.ts:112` | `webauthnCredentials.pubkey` FK references `volunteers.pubkey` |
| `apps/worker/db/schema/volunteers.ts:150` | `devices.pubkey` FK references `volunteers.pubkey` |
| `apps/worker/db/schema/volunteers.ts:184` | `volunteersRelations`, `sessionsRelations`, etc. |
| `apps/worker/db/schema/settings.ts:27` | `allowVolunteerTranscriptionOptOut` column |
| `apps/worker/db/schema/settings.ts:144–145` | `visibleToVolunteers`, `editableByVolunteers` columns |
| `apps/worker/db/schema/shifts.ts:29` | `volunteerPubkeys` column (`volunteer_pubkeys`) |
| `drizzle/migrations/0000_bouncy_morlocks.sql` | Initial migration creating `volunteers` table |

#### 2. Service layer

| Location | Hardcoding |
|----------|-----------|
| `apps/worker/services/identity.ts` | Entire file: `getVolunteers()`, `getVolunteer()`, `createVolunteer()`, `updateVolunteer()`, `deleteVolunteer()`, `getVolunteerInternal()`, `rowToVolunteer()`, `sanitizeVolunteer()`, `VOLUNTEER_SAFE_FIELDS` |
| `apps/worker/services/identity.ts:61` | `function rowToVolunteer(row: ...)` |
| `apps/worker/services/identity.ts:43` | `VOLUNTEER_SAFE_FIELDS` set |
| `apps/worker/services/identity.ts:241` | `getVolunteers(): Promise<{ volunteers: ... }>` |
| `apps/worker/services/settings.ts:304` | `allowVolunteerOptOut` mapping |
| `apps/worker/services/settings.ts:479` | `r.visibleToVolunteers` filter |
| `apps/worker/services/audit.ts:29–30` | Audit event types: `volunteerAdded`, `volunteerRemoved`, `volunteerRoleChanged`, `volunteerActivated`, `volunteerDeactivated`, `volunteerOnBreak` |

#### 3. API routes

| Location | Hardcoding |
|----------|-----------|
| `apps/worker/app.ts:141` | `authenticated.route('/volunteers', volunteersRoutes)` |
| `apps/worker/routes/volunteers.ts` | Entire file: route handlers under `/volunteers` path |
| `apps/worker/routes/volunteers.ts:10` | `const volunteers = new Hono<AppEnv>()` |
| Many route files | `c.get('volunteer')` — reading the context variable |
| `apps/worker/middleware/auth.ts:65` | `c.set('volunteer', authResult.volunteer)` |
| `apps/worker/middleware/auth.ts:29` | `services.identity.getVolunteerInternal(...)` |
| `apps/worker/middleware/permission-guard.ts:78` | `c.get('volunteer')` |

#### 4. Type system

| Location | Hardcoding |
|----------|-----------|
| `apps/worker/types.ts:127` | `type UserRole = 'volunteer' \| 'admin' \| 'reporter'` (already `@deprecated`) |
| `apps/worker/types.ts:129` | `interface Volunteer { ... }` |
| `apps/worker/types.ts:382` | `AppEnv.Variables.volunteer: Volunteer` |
| `apps/worker/types.ts:116` | Comment: "decryptable only with volunteer's nsec" |
| `apps/worker/types.ts:284–286` | `WebAuthnSettings.requireForVolunteers` |

#### 5. Protocol schemas

| Location | Hardcoding |
|----------|-----------|
| `packages/protocol/schemas/volunteers.ts` | Entire file: `volunteerResponseSchema`, `volunteerListResponseSchema`, `createVolunteerBodySchema`, `updateVolunteerBodySchema`, `adminUpdateVolunteerBodySchema`, `volunteerMetricsResponseSchema` |
| `packages/protocol/schemas/settings.ts:39,65` | `visibleToVolunteers`, `editableByVolunteers` in schema |
| `packages/protocol/schemas/settings.ts:105` | `maxConcurrentPerVolunteer` |
| `packages/protocol/schemas/settings.ts:147,152` | `requireForVolunteers`, `allowVolunteerOptOut` |
| `packages/protocol/schemas/entity-schema.ts:68–69` | `visibleToVolunteers`, `editableByVolunteers` |
| `packages/protocol/schemas/calls.ts` | `volunteerPubkeys` in shift/ring schemas |

#### 6. Permissions domain

The permission catalog in `packages/shared/permissions.ts:64–72` uses `volunteers:*` as the
domain prefix:
```
'volunteers:read', 'volunteers:read-cases', 'volunteers:read-metrics',
'volunteers:create', 'volunteers:update', 'volunteers:delete', 'volunteers:manage-roles'
```

This is a judgment call: these permission strings are already stable API surface used in role
definitions stored in the DB. However, they describe operations on user records, not volunteer-
specific operations. They should be renamed to `users:*` to match the target naming.

**Note**: Renaming permission strings requires migrating stored role records in the DB to update
the `permissions` array values. The `DEFAULT_ROLES` in `permissions.ts` and any admin-created
roles stored in the `roles` table need their `volunteers:*` permissions updated to `users:*`.

#### 7. Client (desktop)

| Location | Hardcoding |
|----------|-----------|
| `src/client/lib/api.ts:10` | `import { volunteerResponseSchema }` |
| `src/client/lib/api.ts:300` | `request<{ volunteers: Volunteer[] }>('/volunteers')` |
| `src/client/lib/api.ts:304,318,325` | `/volunteers` endpoint paths |
| `src/client/lib/api.ts:906` | `export type Volunteer = z.infer<typeof volunteerResponseSchema> & {...}` |
| `src/client/lib/api.ts:904` | `export type UserRole = 'volunteer' \| 'admin' \| 'reporter'` |
| `src/client/lib/api.ts:959` | `VolunteerPresence` type |
| `src/client/routes/volunteers.tsx` | Route file |
| `src/client/routes/volunteers_.$pubkey.tsx` | Route file |
| `src/client/components/volunteer-multi-select.tsx` | Component file |
| 40+ additional client files | Import/use of `Volunteer` type or `/volunteers` path |

#### 8. Mobile clients

**iOS** (42 files):
- `apps/ios/Sources/App/AppState.swift:240,243` — hardcoded `POST /api/volunteers` path
- `apps/ios/Sources/Views/Admin/VolunteersView.swift` — view file named for volunteers
- `apps/ios/Tests/UI/Helpers/BaseUITest.swift:66` — test helper uses `/api/volunteers`

**Android** (64 files):
- `apps/android/.../AdminViewModel.kt:204,438,462` — `/api/admin/volunteers` endpoint calls
- `apps/android/.../VolunteerDetailViewModel.kt` — ViewModel named for volunteers
- `apps/android/.../model/AdminModels.kt:99,210` — model comments referencing `/api/admin/volunteers`
- Multiple step definition files in `steps/auth/VolunteerSteps.kt`, `steps/admin/VolunteerDetailSteps.kt`

Note: Android references `/api/admin/volunteers` which is a different path variant not seen in
the current worker routes. This may be a legacy path or an Android-specific abstraction. Needs
investigation before the Android rename step.

#### 9. i18n

`packages/i18n/locales/en.json` contains ~25+ keys with "volunteer"/"Volunteers" in both
the key name and string value. The **string values** (user-facing labels like "Volunteers",
"Search volunteers…") may be correct to keep as-is since the "Volunteer" role name is
intentionally visible to users. The **key names** may need renaming to `users.*` for
internal consistency, but this requires regenerating iOS `.strings` and Android `strings.xml`.

**Key question**: UI labels like "Volunteers" may legitimately stay if that is the role name
displayed. The i18n keys `healthVolunteers`, `loadingVolunteers`, etc., refer to the admin
section for managing users — these should eventually be `healthUsers`, `loadingUsers`. But
this is lower priority and partially deferred (see Migration Strategy below).

#### 10. Tests (66 Playwright + Android step files, plus iOS)

- 66 Playwright/TypeScript test files with `volunteer` references
- 64 Android Kotlin test files
- 42 iOS Swift test files
- Helper utilities like `createVolunteerAndGetNsec()` in test helpers

#### 11. CLAUDE.md and docs

- `CLAUDE.md` architecture table: "Volunteer | Own notes only | Answer calls..."
- `CLAUDE.md` roles section uses volunteer as entity type in multiple places
- Various epic files in `docs/epics/` reference volunteers as entity type

---

## Target State

### Core Principle

The word "volunteer" is a **role display name** only. All actors are **users**. A user's
capabilities come from their roles, not from what table they are stored in.

| Concept | Before | After |
|---------|--------|-------|
| DB table | `volunteers` | `users` |
| Drizzle ORM var | `volunteers` | `users` |
| FK references | `volunteers.pubkey` | `users.pubkey` |
| Service methods | `getVolunteers()`, `getVolunteer()`, etc. | `getUsers()`, `getUser()`, etc. |
| Identity service internal | `getVolunteerInternal()` | `getUserInternal()` |
| TypeScript interface | `Volunteer` | `User` |
| AppEnv context variable | `volunteer: Volunteer` | `user: User` |
| `c.get('volunteer')` | all route files | `c.get('user')` |
| API endpoint | `/api/volunteers` | `/api/users` |
| Schema file | `schemas/volunteers.ts` | `schemas/users.ts` |
| Schema exports | `volunteerResponseSchema` | `userResponseSchema` |
| Hono route var | `const volunteers = new Hono()` | `const users = new Hono()` |
| Audit events | `volunteerAdded`, `volunteerRemoved` | `userAdded`, `userRemoved` |
| Permission domain | `volunteers:*` | `users:*` |
| Safe fields set | `VOLUNTEER_SAFE_FIELDS` | `USER_SAFE_FIELDS` |
| Client type | `Volunteer` | `User` |
| Client endpoint calls | `'/volunteers'` | `'/users'` |
| i18n key prefix | `loadingVolunteers` | `loadingUsers` |
| DB column | `visibleToVolunteers` | `visibleToUsers` |
| DB column | `editableByVolunteers` | `editableByUsers` |
| DB column | `allowVolunteerTranscriptionOptOut` | `allowUserTranscriptionOptOut` |
| DB column | `volunteer_pubkeys` (shifts) | `user_pubkeys` |
| WebAuthn setting | `requireForVolunteers` | `requireForUsers` |
| iOS view | `VolunteersView.swift` | `UsersView.swift` |
| iOS API path | `POST /api/volunteers` | `POST /api/users` |
| Android ViewModel | `VolunteerDetailViewModel.kt` | `UserDetailViewModel.kt` |
| Android API path | `/api/admin/volunteers` | `/api/users` |
| Test helper | `createVolunteerAndGetNsec()` | `createUserAndGetNsec()` |
| CLAUDE.md role table | "Volunteer \| ..." | "User with role Volunteer \| ..." |

### What Stays as "Volunteer"

- `role-volunteer` — the role ID string is stable API surface, kept as a role identifier
- `DEFAULT_ROLES` entry with `name: 'Volunteer'` — this is a display name for the role
- i18n string values "Volunteer" / "Volunteers" when labeling the **role** in UI (e.g., the
  role selector, the default role name in invite creation)
- `packages/shared/permissions.ts` display string: `description: 'Answers calls, writes notes...'`

---

## Migration Strategy

This is a large but mechanical rename. The TypeScript compiler catches every missed reference
at compile time — `bun run typecheck` is the verification gate at each step.

### Phase 0: Verify scope (pre-work)

Run `bun run typecheck` to establish a baseline. Note any pre-existing errors.

### Phase 1: DB migration (single SQL migration, irreversible)

Create a new Drizzle migration `0001_rename_volunteers_to_users.sql`:

```sql
-- Rename volunteers table
ALTER TABLE "volunteers" RENAME TO "users";

-- Rename FK constraints (PostgreSQL renames them automatically with the table in some versions,
-- but explicit renaming prevents confusion)
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_pubkey_volunteers_pubkey_fk"
  TO "sessions_pubkey_users_pubkey_fk";
ALTER TABLE "webauthn_credentials" RENAME CONSTRAINT "webauthn_credentials_pubkey_volunteers_pubkey_fk"
  TO "webauthn_credentials_pubkey_users_pubkey_fk";
ALTER TABLE "devices" RENAME CONSTRAINT "devices_pubkey_volunteers_pubkey_fk"
  TO "devices_pubkey_users_pubkey_fk";

-- Rename columns with "volunteer" in the name
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "visible_to_volunteers" TO "visible_to_users";
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "editable_by_volunteers" TO "editable_by_users";

ALTER TABLE "system_settings"
  RENAME COLUMN "allow_volunteer_transcription_opt_out" TO "allow_user_transcription_opt_out";

ALTER TABLE "shifts"
  RENAME COLUMN "volunteer_pubkeys" TO "user_pubkeys";
```

**Gates before applying**: backup DB, confirm schema changes match Drizzle schema update.
**Irreversibility**: This migration cannot be rolled back without data loss. Apply only after
Drizzle schema (Step 2) is updated and `drizzle-kit generate` has been run to confirm the
generated SQL matches this manual migration.

**Permission string migration**: The `roles` table stores `permissions` as `text[]`. After
renaming the permission domain to `users:*`, existing stored roles need their `volunteers:*`
permission strings updated:

```sql
-- Update stored role permissions: volunteers:* → users:*
UPDATE "roles"
SET permissions = array_replace(permissions, 'volunteers:read', 'users:read')
WHERE 'volunteers:read' = ANY(permissions);
-- (repeat for each permission or use a more general UPDATE with regexp_replace)
```

A more robust approach uses a function to batch-replace all `volunteers:` prefixes:

```sql
UPDATE "roles"
SET permissions = ARRAY(
  SELECT CASE
    WHEN unnest LIKE 'volunteers:%'
    THEN 'users:' || substring(unnest FROM 12)
    ELSE unnest
  END
  FROM unnest(permissions)
)
WHERE permissions && ARRAY['volunteers:read','volunteers:create','volunteers:update',
  'volunteers:delete','volunteers:manage-roles','volunteers:read-cases',
  'volunteers:read-metrics'];
```

### Phase 2: Drizzle schema update

Update `apps/worker/db/schema/volunteers.ts`:
- Rename file to `apps/worker/db/schema/users.ts`
- Rename `pgTable('volunteers', ...)` → `pgTable('users', ...)`
- Rename exported variable `volunteers` → `users`
- Rename relation exports: `volunteersRelations` → `usersRelations`, etc.
- Update column names: `visible_to_volunteers` → `visible_to_users`, etc.
- Update FK references in sessions, webauthnCredentials, devices tables
- Update default roles string: `'{"volunteer"}'::text[]` → `'{"role-volunteer"}'::text[]`
  (this is also a semantic fix — the default should reference the role ID, not a bare string)
- Update `apps/worker/db/schema/shifts.ts:29`: rename column and property

Update `apps/worker/db/schema/index.ts` to export from `users.ts` instead of `volunteers.ts`.

Run `bun x drizzle-kit generate` and verify the output matches the manual Phase 1 migration.

### Phase 3: TypeScript type system

Update `apps/worker/types.ts`:
- Remove `export type UserRole = 'volunteer' | 'admin' | 'reporter'` (deprecated since PBAC)
- Rename `interface Volunteer` → `interface User`
- Rename `AppEnv.Variables.volunteer: Volunteer` → `user: User`
- Rename `WebAuthnSettings.requireForVolunteers` → `requireForUsers`
- Update comments referencing volunteer as entity type

Update `packages/shared/permissions.ts`:
- Rename `volunteers:*` permission keys to `users:*` throughout PERMISSION_CATALOG
- Update `DEFAULT_ROLES` to use `users:*` permission strings
- Update `ROLE_PRIORITY` key `'role-volunteer'` (this is a role ID — keep it)

### Phase 4: Identity service

Update `apps/worker/services/identity.ts`:
- Rename all imports from `volunteers` → `users` (Drizzle schema import)
- Rename `rowToVolunteer()` → `rowToUser()`
- Rename `sanitizeVolunteer()` → `sanitizeUser()`
- Rename `VOLUNTEER_SAFE_FIELDS` → `USER_SAFE_FIELDS`
- Rename `getVolunteers()` → `getUsers()`, `getVolunteer()` → `getUser()`,
  `createVolunteer()` → `createUser()`, `updateVolunteer()` → `updateUser()`,
  `deleteVolunteer()` → `deleteUser()`, `getVolunteerInternal()` → `getUserInternal()`
- Rename `setHubRole()` / `removeHubRole()` — method names don't contain "volunteer", keep
- Rename `MAX_DEVICES_PER_VOLUNTEER` → `MAX_DEVICES_PER_USER`
- Comment: update "Create volunteer" and similar doc comments
- Return shapes: `{ volunteers: [...] }` → `{ users: [...] }`

### Phase 5: Auth middleware + guards

Update `apps/worker/middleware/auth.ts`:
- `c.set('volunteer', ...)` → `c.set('user', ...)`
- `services.identity.getVolunteerInternal(...)` → `services.identity.getUserInternal(...)`

Update `apps/worker/middleware/permission-guard.ts`:
- `c.get('volunteer')` → `c.get('user')`

Update `apps/worker/middleware/hub.ts`:
- `c.get('volunteer')` → `c.get('user')`

### Phase 6: Worker routes

Rename `apps/worker/routes/volunteers.ts` → `apps/worker/routes/users.ts`:
- `const volunteers = new Hono<AppEnv>()` → `const users = new Hono<AppEnv>()`
- Update all import references
- Update `describeRoute` tags from `'Volunteers'` → `'Users'`
- Update audit event calls: `volunteerAdded` → `userAdded`, etc.
- Update `services.identity.getVolunteers()` → `services.identity.getUsers()`, etc.

Update `apps/worker/app.ts`:
- `import volunteersRoutes from './routes/volunteers'` → `import usersRoutes from './routes/users'`
- `authenticated.route('/volunteers', volunteersRoutes)` → `authenticated.route('/users', usersRoutes)`

Update all other route files that call `c.get('volunteer')`:
- `apps/worker/routes/auth.ts`
- `apps/worker/routes/webrtc.ts`
- `apps/worker/routes/hubs.ts`
- `apps/worker/routes/webauthn.ts`
- `apps/worker/routes/conversations.ts`
- `apps/worker/routes/calls.ts`
- `apps/worker/routes/settings.ts`
- `apps/worker/routes/shifts.ts`
- `apps/worker/routes/telephony.ts`
- `apps/worker/routes/records.ts`
- `apps/worker/routes/reports.ts`
- `apps/worker/routes/files.ts`
- `apps/worker/routes/devices.ts`
- Any other routes using `c.get('volunteer')`

Update `apps/worker/services/settings.ts`:
- `visibleToVolunteers` → `visibleToUsers`
- `editableByVolunteers` → `editableByUsers`
- `allowVolunteerOptOut` → `allowUserOptOut`
- `allowVolunteerTranscriptionOptOut` → `allowUserTranscriptionOptOut`

Update `apps/worker/services/audit.ts`:
- Rename audit event types: `volunteerAdded` → `userAdded`, `volunteerRemoved` → `userRemoved`,
  `volunteerRoleChanged` → `userRoleChanged`, `volunteerActivated` → `userActivated`,
  `volunteerDeactivated` → `userDeactivated`, `volunteerOnBreak` → `userOnBreak`

### Phase 7: Protocol schemas

Rename `packages/protocol/schemas/volunteers.ts` → `packages/protocol/schemas/users.ts`:
- `volunteerResponseSchema` → `userResponseSchema`
- `volunteerListResponseSchema` → `userListResponseSchema`
- `createVolunteerBodySchema` → `createUserBodySchema`
- `updateVolunteerBodySchema` → `updateUserBodySchema`
- `adminUpdateVolunteerBodySchema` → `adminUpdateUserBodySchema`
- `volunteerMetricsResponseSchema` → `userMetricsResponseSchema`

Update `packages/protocol/schemas/index.ts` to export from `users.ts`.

Update `packages/protocol/schemas/settings.ts`:
- `visibleToVolunteers` → `visibleToUsers`
- `editableByVolunteers` → `editableByUsers`
- `maxConcurrentPerVolunteer` → `maxConcurrentPerUser`
- `requireForVolunteers` → `requireForUsers`
- `allowVolunteerOptOut` → `allowUserOptOut`

Update `packages/protocol/schemas/entity-schema.ts`:
- `visibleToVolunteers` → `visibleToUsers`
- `editableByVolunteers` → `editableByUsers`

Update `packages/protocol/schemas/calls.ts`:
- `volunteerPubkeys` → `userPubkeys` (check if in Zod schema or just in calls type)

Update `packages/protocol/tools/schema-registry.ts` to reference the new schema names.

Run `bun run codegen` to regenerate TypeScript, Swift, and Kotlin types.

### Phase 8: Shared types

Update `packages/shared/types.ts`:
- `visibleToVolunteers` / `editableByVolunteers` on `CustomFieldDefinition` → `visibleToUsers` / `editableByUsers`
- `maxConcurrentPerVolunteer` on messaging config → `maxConcurrentPerUser`
- Update comments

Update `packages/shared/nostr-events.ts`:
- Update comments referencing "volunteer ringing", "volunteer presence"

### Phase 9: Client (desktop)

Update `src/client/lib/api.ts`:
- Update import: `volunteerResponseSchema` → `userResponseSchema`
- Rename type: `Volunteer` → `User`
- Rename type: `UserRole` (remove the deprecated union type)
- Update API call paths: `'/volunteers'` → `'/users'`
- Rename `VolunteerPresence` → `UserPresence`
- Update all function signatures and return types

Update route files:
- Rename `src/client/routes/volunteers.tsx` → `src/client/routes/users.tsx`
- Rename `src/client/routes/volunteers_.$pubkey.tsx` → `src/client/routes/users_.$pubkey.tsx`
- Update route paths (TanStack Router derives paths from filenames)

Update component files:
- Rename `src/client/components/volunteer-multi-select.tsx` → `src/client/components/user-multi-select.tsx`
- Update all ~40 component/route files that import `Volunteer` type or reference `/volunteers`

Regenerate `src/client/routeTree.gen.ts` (run `bun run dev` or the route gen command).

### Phase 10: i18n

Update `packages/i18n/locales/en.json`:
- Rename keys: `loadingVolunteers` → `loadingUsers`, `noVolunteers` → `noUsers`,
  `searchVolunteers` → `searchUsers`, `healthVolunteers` → `healthUsers`, etc.
- String **values** like "Volunteers" in section headings may be kept if the section
  is specifically about the Volunteer role, or updated to "Users" for generic user management.
  Decision: rename heading labels to "Users" since the section manages all users, not just
  volunteers. The Volunteer role is managed via the roles subsection.
- Audit event i18n keys: `volunteerAdded` → `userAdded`, etc.
- Update all 12 other locale files to match (or mark them for translator review)

Run `bun run i18n:codegen` to regenerate iOS `.strings`, Android `strings.xml`, Kotlin `I18n.kt`.

### Phase 11: iOS client

Run codegen first (Phase 7, 10) — generated types in `apps/ios/Sources/Generated/` are auto-updated.

Manual updates:
- Rename `apps/ios/Sources/Views/Admin/VolunteersView.swift` → `UsersView.swift`
- Update `apps/ios/Sources/App/AppState.swift:240,243` — path `POST /api/volunteers` → `/api/users`
- Update `apps/ios/Tests/UI/Helpers/BaseUITest.swift:66`
- Update remaining files that reference `Volunteer` as an entity type (keeping `role-volunteer`
  as a role string constant where needed)
- Update the Xcode project references via `xcodegen generate`

### Phase 12: Android client

- Rename `VolunteerDetailViewModel.kt` → `UserDetailViewModel.kt`
- Rename `steps/auth/VolunteerSteps.kt` → `steps/auth/UserSteps.kt`
- Rename `steps/admin/VolunteerDetailSteps.kt` → `steps/admin/UserDetailSteps.kt`
- Update all API paths: `/api/admin/volunteers` → `/api/users`
  (Investigate the `/api/admin/` prefix — the current worker mounts routes at `/api/volunteers`
  without an `/admin/` prefix. Clarify if Android has a compatibility shim or if this is a bug.)
- Update model classes in `AdminModels.kt` and similar files
- Run codegen to update generated types from `packages/protocol/`
- Run `./gradlew compileDebugKotlin` to verify

### Phase 13: Tests

Update `tests/` (66 Playwright step files):
- Rename `createVolunteerAndGetNsec()` → `createUserAndGetNsec()` in helpers
- Update all step files that call `/volunteers` endpoints
- Update `data-testid` values that include "volunteer" in the name (if any)
- Run `bun run test` to verify

### Phase 14: CLAUDE.md and docs

Update `CLAUDE.md`:
- Architecture Roles table: change "Volunteer | Own notes only | Answer calls, write notes" to
  "User with Volunteer role | Own notes only | Answer calls, write notes, handle conversations"
- "Volunteer identity protection" → "User identity protection"
- Any place "volunteer" is used as an entity type rather than a role name

Update `~/.claude/projects/-home-rikki-projects-llamenos/memory/MEMORY.md`:
- "E2E Testing Conventions": `createVolunteerAndGetNsec()` → `createUserAndGetNsec()`
- Update any memory entries using "volunteer" as entity type

---

## Risks and Mitigations

### DB migration is irreversible

**Risk**: `ALTER TABLE volunteers RENAME TO users` cannot be undone without restoring from backup.
**Mitigation**: This is a pre-production codebase with no live users. Run on a dev DB first.
Verify the Drizzle schema and generated SQL match before applying. Take a `pg_dump` before running.

### External webhooks referencing route paths

**Risk**: Twilio webhooks are configured with absolute callback URLs (e.g., `https://api.example.com/api/telephony/...`). These do not reference `/volunteers` so they are unaffected.
**Mitigation**: Check all Twilio callback URL configurations. The `/volunteers` endpoint is an
authenticated internal endpoint and is not a Twilio webhook target.

### Android `/api/admin/volunteers` vs `/api/volunteers`

**Risk**: Android calls `/api/admin/volunteers` but the worker mounts the route at `/volunteers`
(under the authenticated group which is already at `/api`). This mismatch suggests Android either
has a bug or there is a proxy rewrite not visible in the codebase.
**Mitigation**: Investigate before changing Android code. Grep for the `/api/admin/` prefix in
the worker to check if there is a legacy route at that path. Update Android to the correct path
as part of this rename regardless.

### Permission string migration in DB

**Risk**: After renaming `volunteers:*` → `users:*` in `DEFAULT_ROLES` and seeding, any custom
roles stored in the `roles` table that reference `volunteers:*` permissions will silently lose
those permissions (the strings no longer match any catalog entry, and `isValidPermission()` will
return false for them).
**Mitigation**: Apply the SQL `UPDATE roles SET permissions = ...` migration (see Phase 1) to
batch-rename stored permission strings before or simultaneously with the code deploy.

### TypeScript compiler as the verification gate

**Risk**: The rename touches ~100+ files. Missed references compile silently if they are in
string literals (like hardcoded API path strings `'/volunteers'`).
**Mitigation**: After each phase, run `bun run typecheck`. For string literals, use
`grep -r 'volunteers' --include="*.ts" --include="*.tsx"` to find any remaining occurrences
that the type checker cannot catch. A post-rename grep audit is required.

### Mobile platform codegen dependency

**Risk**: iOS and Android use generated types from `packages/protocol/`. If codegen is run
before mobile files are updated, the generated types will break mobile compilation immediately.
**Mitigation**: Update protocol schemas and run codegen early (Phase 7). Mobile clients then
update to match the new generated type names.

---

## Success Criteria

The rename is complete when ALL of the following are true:

1. `grep -rn "'volunteers'\|\"volunteers\"" apps/worker/ --include="*.ts"` returns only:
   - The `pgTable('users', ...)` line (changed to `users`)
   - No remaining `volunteers` table name references
2. `grep -rn "interface Volunteer\b\|: Volunteer\b\|Volunteer\b" apps/worker/ --include="*.ts"` returns zero results
3. `grep -rn "/volunteers" src/client/ --include="*.ts" --include="*.tsx"` returns zero results
4. `grep -rn "/volunteers" apps/ios/ --include="*.swift"` returns zero results
5. `grep -rn "/volunteers" apps/android/ --include="*.kt"` returns zero results
6. `bun run typecheck && bun run build` passes with zero errors
7. `bun run test` (Playwright) passes
8. `cd apps/android && ./gradlew compileDebugKotlin && ./gradlew compileDebugAndroidTestKotlin` passes
9. The DB schema shows `users` table (not `volunteers`) in `psql \dt`
10. `GET /api/users` returns the user list; `GET /api/volunteers` returns 404
11. The word "volunteer" appears in the codebase only as:
    - The role ID string `role-volunteer`
    - The role name display string `"Volunteer"`
    - i18n string values labeling the Volunteer role
    - Code comments (non-normative)
12. CLAUDE.md architecture table describes actors as "User with role X"

---

## Deferred / Out of Scope

- **Renaming the `volunteers:*` permission strings in the PERMISSION_CATALOG**: This is
  included in Phase 3 above and is in-scope. It requires DB data migration (Phase 1).
- **Renaming `visibleToVolunteers`/`editableByVolunteers` in the `customFieldDefinitions`
  table**: These are DB column renames — included in Phase 1. The semantic question of whether
  these should be role-based (e.g., `visibleToRoles: string[]`) is a separate architectural
  decision and is out of scope for this rename.
- **`packages/shared/migrations/index.ts:86–99`**: Contains a legacy DO migration named
  `shard-identity-volunteers` that migrated from a `volunteers` storage key. This is historical
  migration code; it does not need to be renamed as it is an idempotent migration record.
- **`packages/shared/voice-prompts.ts:128`**: The IVR string "connect you with a volunteer"
  is user-facing audio that intentionally uses the role label. Keep as-is.
- **Semantic changes to the custom field visibility model**: `visibleToUsers: boolean` still
  uses a boolean rather than a role-based ACL. This is a pre-existing architectural limitation
  noted for future improvement, separate from this rename.
