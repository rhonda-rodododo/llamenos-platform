# User/PBAC Naming Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every use of "volunteer" as an entity type to "user" across the entire codebase — DB, backend, protocol, client, mobile, and tests — while preserving `role-volunteer` and "Volunteer" as the role display name.
**Architecture:** This is a mechanical rename executed in strict dependency order: DB migration first, then Drizzle schema, then shared types/permissions, then service layer, then middleware, then routes, then protocol codegen, then client, then mobile, then tests and docs. Each task leaves the system in a compilable, consistent state and is committed atomically.
**Tech Stack:** PostgreSQL (Drizzle ORM migrations), Bun, TypeScript, Hono, Zod, TanStack Router, SwiftUI (iOS), Kotlin/Compose (Android), Playwright

---

## Pre-work: Establish baseline

**Files:**
- Read-only (no edits)

- [ ] Run `bun run typecheck 2>&1 | tail -20` and note any pre-existing errors (so they are not confused with regressions later).
- [ ] Run `grep -rn "volunteer" apps/worker/ --include="*.ts" | wc -l` to record baseline count.
- [ ] Commit: (no commit — baseline only)

---

### Task 1: DB Migration — rename table and columns

**Files:**
- Create: `drizzle/migrations/0001_rename_volunteers_to_users.sql`

This is the irreversible step. It must be written manually (not via drizzle-kit generate, which cannot produce a standalone rename migration for an already-existing table without a full schema diff). After the Drizzle schema is updated in Task 2, `drizzle-kit generate` will be used to verify the diff is clean.

- [ ] Create `drizzle/migrations/0001_rename_volunteers_to_users.sql` with the following SQL (copy exactly):

```sql
-- Rename volunteers table to users
ALTER TABLE "volunteers" RENAME TO "users";
--> statement-breakpoint

-- Rename FK constraints (prevents confusion; PostgreSQL may auto-rename on table rename,
-- but explicit renaming is more portable and clear)
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_pubkey_volunteers_pubkey_fk"
  TO "sessions_pubkey_users_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "webauthn_credentials" RENAME CONSTRAINT "webauthn_credentials_pubkey_volunteers_pubkey_fk"
  TO "webauthn_credentials_pubkey_users_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "devices" RENAME CONSTRAINT "devices_pubkey_volunteers_pubkey_fk"
  TO "devices_pubkey_users_pubkey_fk";
--> statement-breakpoint

-- Rename columns in custom_field_definitions
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "visible_to_volunteers" TO "visible_to_users";
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "editable_by_volunteers" TO "editable_by_users";
--> statement-breakpoint

-- Rename column in system_settings
ALTER TABLE "system_settings"
  RENAME COLUMN "allow_volunteer_transcription_opt_out" TO "allow_user_transcription_opt_out";
--> statement-breakpoint

-- Rename column in shifts
ALTER TABLE "shifts"
  RENAME COLUMN "volunteer_pubkeys" TO "user_pubkeys";
--> statement-breakpoint

-- Migrate stored permission strings: volunteers:* → users:*
-- This updates any admin-created roles whose permissions array references the old domain.
UPDATE "roles"
SET permissions = ARRAY(
  SELECT CASE
    WHEN unnest LIKE 'volunteers:%'
    THEN 'users:' || substring(unnest FROM 12)
    ELSE unnest
  END
  FROM unnest(permissions)
)
WHERE permissions && ARRAY[
  'volunteers:read', 'volunteers:create', 'volunteers:update',
  'volunteers:delete', 'volunteers:manage-roles',
  'volunteers:read-cases', 'volunteers:read-metrics',
  'volunteers:*'
];
```

- [ ] Apply migration to the local dev database: `docker compose -f deploy/docker/docker-compose.dev.yml up -d` (if not running), then `bun x drizzle-kit migrate --config drizzle.config.ts`.
- [ ] Verify: `psql $DATABASE_URL -c "\dt"` shows `users` table, not `volunteers`. Also confirm `custom_field_definitions`, `system_settings`, and `shifts` have the renamed columns.
- [ ] Commit: `git commit -m "db: rename volunteers table to users, rename FK constraints and columns"`

---

### Task 2: Drizzle schema — rename schema file, exports, and column references

**Files:**
- Rename: `apps/worker/db/schema/volunteers.ts` → `apps/worker/db/schema/users.ts`
- Modify: `apps/worker/db/schema/settings.ts`
- Modify: `apps/worker/db/schema/shifts.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] Rename the file: `mv apps/worker/db/schema/volunteers.ts apps/worker/db/schema/users.ts`

- [ ] In `apps/worker/db/schema/users.ts`, make these exact changes:
  - Line 17 comment: `// volunteers` → `// users`
  - Line 20: `export const volunteers = pgTable('volunteers', {` → `export const users = pgTable('users', {`
  - Line 25: `.default(sql\`'{"volunteer"}'::text[]\`)` → `.default(sql\`'{"role-volunteer"}'::text[]\`)` (semantic fix: role ID, not bare string)
  - Line 67: `.references(() => volunteers.pubkey` → `.references(() => users.pubkey`
  - Line 112: `.references(() => volunteers.pubkey` → `.references(() => users.pubkey`
  - Line 150: `.references(() => volunteers.pubkey` → `.references(() => users.pubkey`
  - Line 184: `export const volunteersRelations = relations(volunteers,` → `export const usersRelations = relations(users,`
  - Line 191: `export const sessionsRelations = relations(sessions, ({ one }) => ({` → keep outer, but change inner:
    - `volunteer: one(volunteers,` → `user: one(users,`
  - Line 198: `export const webauthnCredentialsRelations = relations(` → keep outer, change inner:
    - `volunteer: one(volunteers,` → `user: one(users,`
  - Line 207: `export const devicesRelations = relations(devices, ({ one }) => ({` → keep outer, change inner:
    - `volunteer: one(volunteers,` → `user: one(users,`

- [ ] In `apps/worker/db/schema/settings.ts`, rename:
  - `allowVolunteerTranscriptionOptOut: boolean('allow_volunteer_transcription_opt_out')` → `allowUserTranscriptionOptOut: boolean('allow_user_transcription_opt_out')`
  - `visibleToVolunteers: boolean('visible_to_volunteers')` → `visibleToUsers: boolean('visible_to_users')`
  - `editableByVolunteers: boolean('editable_by_volunteers')` → `editableByUsers: boolean('editable_by_users')`

- [ ] In `apps/worker/db/schema/shifts.ts`:
  - `volunteerPubkeys: text('volunteer_pubkeys')` → `userPubkeys: text('user_pubkeys')`

- [ ] In `apps/worker/db/schema/index.ts`:
  - `export * from './volunteers'` → `export * from './users'`

- [ ] Run `bun x drizzle-kit generate --config drizzle.config.ts` to verify the generated migration is empty (all changes were already applied manually in Task 1). If it generates SQL, inspect and reconcile.
- [ ] Run `bun run typecheck 2>&1 | grep -c "error TS"` — expect a non-zero count at this stage (services still reference old names); this is expected. Just verify the count is bounded (< 100).
- [ ] Commit: `git commit -m "db(schema): rename volunteers.ts to users.ts, rename ORM vars and column mappings"`

---

### Task 3: TypeScript types and PBAC permissions

**Files:**
- Modify: `apps/worker/types.ts`
- Modify: `packages/shared/permissions.ts`

#### `apps/worker/types.ts`

- [ ] Remove the deprecated `UserRole` type (lines ~127):
  - Delete: `/** @deprecated Use roles array + permission system instead */`
  - Delete: `export type UserRole = 'volunteer' | 'admin' | 'reporter'`

- [ ] Rename `interface Volunteer` → `interface User` (line ~129). Update all fields and comments within that interface:
  - Comment on `encryptedSecretKey`: `// Admin-encrypted copy of the volunteer's nsec` → `// Admin-encrypted copy of the user's nsec`
  - Comment on `specializations`: `// e.g., ["immigration", ...]` (keep as-is; not entity-type usage)
  - Field `onBreak` comment: keep

- [ ] Rename in `interface Shift` (line ~154):
  - `volunteerPubkeys: string[]` → `userPubkeys: string[]`

- [ ] Rename in `interface WebAuthnSettings` (line ~284):
  - `requireForVolunteers: boolean` → `requireForUsers: boolean`

- [ ] Rename in `AppEnv.Variables` (line ~382):
  - `volunteer: Volunteer` → `user: User`

- [ ] Update comment at line ~116:
  - `/** Full-tier payload — decryptable only with volunteer's nsec */` → `/** Full-tier payload — decryptable only with user's nsec */`

#### `packages/shared/permissions.ts`

- [ ] In `PERMISSION_CATALOG`, rename the `Volunteers` section (lines 64-72):
  ```typescript
  // Users (formerly Volunteers)
  'users:read': 'List/view user profiles',
  'users:read-cases': 'View case records assigned to a user',
  'users:read-metrics': 'View user workload metrics',
  'users:create': 'Create new users',
  'users:update': 'Update user profiles',
  'users:delete': 'Deactivate/delete users',
  'users:manage-roles': 'Assign/change user roles',
  ```

- [ ] In `DEFAULT_ROLES`, update `role-hub-admin` permissions array:
  - `'volunteers:*'` → `'users:*'`

- [ ] In `DEFAULT_ROLES`, update `role-reviewer` permissions array:
  - `'volunteers:read-cases'` → `'users:read-cases'`
  - `'volunteers:read-metrics'` → `'users:read-metrics'`

- [ ] The `role-volunteer` id, slug, name, and description stay as-is (role identity, not entity type). The `calls:read-presence` permission description `'View volunteer presence'` can stay — it describes what is seen in the UI.

- [ ] Run `bun run typecheck 2>&1 | grep "error TS" | head -30` — errors should now be in the service and route layers (not in types or permissions). Verify no new unknown errors.
- [ ] Commit: `git commit -m "types: rename Volunteer interface to User, rename UserRole deprecated type, update PBAC permission domain volunteers:* → users:*"`

---

### Task 4: Identity service

**Files:**
- Modify: `apps/worker/services/identity.ts`

This is the most change-dense file. All occurrences of "volunteer" as entity type are renamed to "user".

- [ ] Update the import from Drizzle schema:
  - `import { volunteers, sessions, ... }` → `import { users, sessions, ...}` (rename `volunteers` to `users` in the import destructure)

- [ ] Update the import from types:
  - `import type { Volunteer, ... }` → `import type { User, ... }` (rename `Volunteer` to `User`)

- [ ] Rename constants and helpers:
  - `const MAX_DEVICES_PER_VOLUNTEER = 5` → `const MAX_DEVICES_PER_USER = 5`
  - `const VOLUNTEER_SAFE_FIELDS` → `const USER_SAFE_FIELDS`
  - Update all usages of `VOLUNTEER_SAFE_FIELDS` → `USER_SAFE_FIELDS` (check all references in the file)

- [ ] Rename `function rowToVolunteer(row: typeof volunteers.$inferSelect): Volunteer` → `function rowToUser(row: typeof users.$inferSelect): User`
  - Inside the function body, update the type assertion: `(row.hubRoles as Volunteer['hubRoles'])` → `(row.hubRoles as User['hubRoles'])`
  - Update the cast: `(row.callPreference as Volunteer['callPreference'])` → `(row.callPreference as User['callPreference'])`
  - Update: `(row.supportedMessagingChannels as Volunteer['supportedMessagingChannels'])` → `(row.supportedMessagingChannels as User['supportedMessagingChannels'])`

- [ ] Rename public service methods (update signatures, bodies, and all internal callers):
  - `getVolunteers()` → `getUsers()` — update return shape: `{ volunteers: [...] }` → `{ users: [...] }`
  - `getVolunteer()` → `getUser()`
  - `createVolunteer()` → `createUser()`
  - `updateVolunteer()` → `updateUser()`
  - `deleteVolunteer()` → `deleteUser()`
  - `getVolunteerInternal()` → `getUserInternal()`
  - `sanitizeVolunteer()` → `sanitizeUser()` (if it exists as a separate function)

- [ ] Update all Drizzle query references throughout the file:
  - Every `volunteers` ORM reference (e.g., `db.select().from(volunteers)`, `eq(volunteers.pubkey, ...)`) → `users`
  - Column references: `volunteers.pubkey` → `users.pubkey`, `volunteers.roles` → `users.roles`, etc.

- [ ] Update internal doc comments:
  - `/** Create volunteer */` → `/** Create user */`
  - `/** Get volunteer */` → `/** Get user */`
  - Any `volunteers` doc string → `users`

- [ ] Update references to `MAX_DEVICES_PER_VOLUNTEER` → `MAX_DEVICES_PER_USER` throughout the file.

- [ ] Run `bun run typecheck 2>&1 | grep "services/identity" | head -20` — expect zero errors in identity.ts.
- [ ] Commit: `git commit -m "feat: rename identity service methods from volunteer to user"`

---

### Task 5: Auth middleware and permission guard

**Files:**
- Modify: `apps/worker/middleware/auth.ts`
- Modify: `apps/worker/middleware/permission-guard.ts`
- Modify: `apps/worker/middleware/hub.ts`
- Modify: `apps/worker/lib/auth.ts` (if `authenticateRequest` returns `{ pubkey, volunteer }`)

#### `apps/worker/middleware/auth.ts`

- [ ] Update import: `import type { AppEnv, Volunteer } from '../types'` → `import type { AppEnv, User } from '../types'`
- [ ] Line 19 comment: `// Dev-mode signature bypass: ... for REGISTERED volunteers only` → `// Dev-mode signature bypass: ... for REGISTERED users only`
- [ ] Line 29: `const volunteer = await services.identity.getVolunteerInternal(...)` → `const user = await services.identity.getUserInternal(...)`
- [ ] Line 31: `authResult = { pubkey: authPayload.pubkey, volunteer }` — the shape of `authResult` depends on `authenticateRequest` return type in `lib/auth.ts`; update as needed to use `user` key.
- [ ] Line 62: `const permissions = resolvePermissions(authResult.volunteer.roles, allRoles)` → `resolvePermissions(authResult.user.roles, allRoles)`
- [ ] Line 65: `c.set('volunteer', authResult.volunteer)` → `c.set('user', authResult.user)`

- [ ] Check `apps/worker/lib/auth.ts` — if `authenticateRequest` returns `{ pubkey, volunteer }`, update it to return `{ pubkey, user }` and update the `User` type import there.

#### `apps/worker/middleware/permission-guard.ts`

- [ ] All occurrences of `c.get('volunteer')` → `c.get('user')`
- [ ] Update any `Volunteer` type references → `User`

#### `apps/worker/middleware/hub.ts`

- [ ] All occurrences of `c.get('volunteer')` → `c.get('user')`

- [ ] Run `bun run typecheck 2>&1 | grep "middleware/" | head -20` — expect zero errors.
- [ ] Commit: `git commit -m "feat: rename volunteer context variable to user in auth and permission middleware"`

---

### Task 6: Worker routes — rename volunteers route and update all routes

**Files:**
- Rename: `apps/worker/routes/volunteers.ts` → `apps/worker/routes/users.ts`
- Modify: `apps/worker/app.ts`
- Modify: `apps/worker/routes/auth.ts`
- Modify: `apps/worker/routes/webrtc.ts`
- Modify: `apps/worker/routes/hubs.ts`
- Modify: `apps/worker/routes/webauthn.ts`
- Modify: `apps/worker/routes/conversations.ts`
- Modify: `apps/worker/routes/calls.ts` (if applicable)
- Modify: `apps/worker/routes/settings.ts`
- Modify: `apps/worker/routes/shifts.ts`
- Modify: `apps/worker/routes/config.ts` (if applicable)
- Modify: `apps/worker/services/settings.ts`
- Modify: `apps/worker/services/audit.ts`

#### Rename and update the volunteers route file

- [ ] `mv apps/worker/routes/volunteers.ts apps/worker/routes/users.ts`
- [ ] In `apps/worker/routes/users.ts`:
  - Update import: `import { createVolunteerBodySchema, adminUpdateVolunteerBodySchema, volunteerResponseSchema, volunteerListResponseSchema, volunteerMetricsResponseSchema } from '@protocol/schemas/volunteers'` → import from `@protocol/schemas/users` with renamed exports (`createUserBodySchema`, `adminUpdateUserBodySchema`, `userResponseSchema`, `userListResponseSchema`, `userMetricsResponseSchema`) — note: schema file is renamed in Task 7; do this step after Task 7, or temporarily keep old import paths and update after Task 7.

  **Implementation order note:** Tasks 6 and 7 have a mutual dependency. Do Task 7 (protocol schemas) first, then come back to update the route imports. Skip the protocol import lines in this task and mark them with a `// TODO Task 7` comment. Complete those lines after Task 7 is done.

  - `const volunteers = new Hono<AppEnv>()` → `const users = new Hono<AppEnv>()`
  - `volunteers.use(...)` → `users.use(...)`
  - `volunteers.get(...)` → `users.get(...)`  (all method calls)
  - Update `describeRoute` tags: `tags: ['Volunteers']` → `tags: ['Users']`
  - Update `summary` strings: `'List all volunteers'` → `'List all users'`, `'Get a single volunteer'` → `'Get a single user'`, etc.
  - `services.identity.getVolunteers()` → `services.identity.getUsers()`
  - `services.identity.getVolunteer(...)` → `services.identity.getUser(...)`
  - `services.identity.createVolunteer(...)` → `services.identity.createUser(...)`
  - `services.identity.updateVolunteer(...)` → `services.identity.updateUser(...)`
  - `services.identity.deleteVolunteer(...)` → `services.identity.deleteUser(...)`
  - Audit event calls: `'volunteerAdded'` → `'userAdded'`, `'volunteerRemoved'` → `'userRemoved'`, `'volunteerRoleChanged'` → `'userRoleChanged'`, `'volunteerActivated'` → `'userActivated'`, `'volunteerDeactivated'` → `'userDeactivated'`
  - `export default volunteers` → `export default users`

#### Update `apps/worker/app.ts`

- [ ] `import volunteersRoutes from './routes/volunteers'` → `import usersRoutes from './routes/users'`
- [ ] `authenticated.route('/volunteers', volunteersRoutes)` → `authenticated.route('/users', usersRoutes)`

#### Update all routes that call `c.get('volunteer')`

Run: `grep -rn "c\.get('volunteer')" apps/worker/routes/ --include="*.ts"` to find every occurrence.

- [ ] In each file found, replace all `c.get('volunteer')` with `c.get('user')` and update any local variable names derived from it (e.g., `const volunteer = c.get('volunteer')` → `const user = c.get('user')`, and then rename all usages of `volunteer` in that scope to `user`).
- [ ] Also update `c.get('volunteer')` in `apps/worker/middleware/permission-guard.ts` and `apps/worker/middleware/hub.ts` (already covered in Task 5 but double-check).

#### Update `apps/worker/services/settings.ts`

- [ ] `allowVolunteerTranscriptionOptOut` → `allowUserTranscriptionOptOut` (schema column rename from Task 2 propagates here)
- [ ] `visibleToVolunteers` → `visibleToUsers` (all query/filter references)
- [ ] `editableByVolunteers` → `editableByUsers`
- [ ] `allowVolunteerOptOut` → `allowUserOptOut` (any mapping variable names)

#### Update `apps/worker/services/audit.ts`

- [ ] Rename the `volunteers` EVENT_CATEGORIES key to `users`:
  ```typescript
  users: [
    'userAdded', 'userRemoved', 'userRoleChanged',
    'userActivated', 'userDeactivated', 'userOnBreak',
    'userOffBreak', 'inviteCreated', 'inviteRedeemed',
  ],
  ```

- [ ] Run `bun run typecheck 2>&1 | grep "routes/\|services/" | head -30` — expect zero errors.
- [ ] Run `grep -rn "c\.get('volunteer')" apps/worker/ --include="*.ts"` — expect zero results.
- [ ] Commit: `git commit -m "feat: rename /volunteers route to /users, update all c.get('volunteer') to c.get('user'), rename audit events"`

---

### Task 7: Protocol schemas — rename file and all schema exports

**Files:**
- Rename: `packages/protocol/schemas/volunteers.ts` → `packages/protocol/schemas/users.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/schemas/settings.ts`
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/schemas/calls.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

#### Rename schema file

- [ ] `mv packages/protocol/schemas/volunteers.ts packages/protocol/schemas/users.ts`
- [ ] In `packages/protocol/schemas/users.ts`:
  - `export const volunteerResponseSchema` → `export const userResponseSchema`
  - `export const volunteerListResponseSchema` → `export const userListResponseSchema`
    - Update inner field: `volunteers: z.array(volunteerResponseSchema)` → `users: z.array(userResponseSchema)`
  - `export const volunteerMetricsResponseSchema` → `export const userMetricsResponseSchema`
  - `export const createVolunteerBodySchema` → `export const createUserBodySchema`
  - `export const updateVolunteerBodySchema` → `export const updateUserBodySchema`
  - `export const adminUpdateVolunteerBodySchema` → `export const adminUpdateUserBodySchema`
    - Update: `.extend({...})` still chains from `updateUserBodySchema` — update the call.
  - Update all internal cross-references (e.g., `adminUpdateVolunteerBodySchema = updateVolunteerBodySchema.extend(...)` → `adminUpdateUserBodySchema = updateUserBodySchema.extend(...)`)
  - Update any Epic comments referencing "volunteers" as entity type

#### Update `packages/protocol/schemas/index.ts`

- [ ] `export * from './volunteers'` → `export * from './users'`

#### Update `packages/protocol/schemas/settings.ts`

- [ ] `visibleToVolunteers: z.boolean().optional()` → `visibleToUsers: z.boolean().optional()` (in `customFieldResponseSchema`, line ~39)
- [ ] `visibleToVolunteers: z.boolean().optional()` in `customFieldsBodySchema` (line ~65) → `visibleToUsers: z.boolean().optional()`
- [ ] `editableByVolunteers: z.boolean().optional()` → `editableByUsers: z.boolean().optional()` in `customFieldsBodySchema` (the spec lists both at lines 39 and 65 of settings.ts)
- [ ] `maxConcurrentPerVolunteer: z.number()...optional()` → `maxConcurrentPerUser: z.number()...optional()` (in `messagingConfigSchema`, line ~105)
- [ ] `requireForVolunteers: z.boolean().optional()` → `requireForUsers: z.boolean().optional()` (in `webauthnSettingsSchema`, line ~147)
- [ ] `allowVolunteerOptOut: z.boolean().optional()` → `allowUserOptOut: z.boolean().optional()` (in `transcriptionSettingsSchema`, line ~152)

#### Update `packages/protocol/schemas/entity-schema.ts`

- [ ] `visibleToVolunteers: z.boolean().optional().default(true)` → `visibleToUsers: z.boolean().optional().default(true)` (line ~68)
- [ ] `editableByVolunteers: z.boolean().optional().default(true)` → `editableByUsers: z.boolean().optional().default(true)` (line ~69)

#### Update `packages/protocol/schemas/calls.ts`

- [ ] In `callPresenceResponseSchema`: `volunteers: z.array(...)` → `users: z.array(...)` (line ~20)
  Note: This changes the wire format of the presence endpoint — client code consuming `callPresenceResponseSchema` must be updated in Task 9.

#### Update `packages/protocol/tools/schema-registry.ts`

- [ ] Update all imports from `volunteers` schema:
  - `import { volunteerResponseSchema, volunteerListResponseSchema, volunteerMetricsResponseSchema, ... } from '../schemas/volunteers'` → import from `'../schemas/users'` with renamed exports
- [ ] Update the registry entries that map these schemas to PascalCase type names:
  - `VolunteerResponse`, `VolunteerListResponse`, `CreateVolunteerBody`, `UpdateVolunteerBody`, `AdminUpdateVolunteerBody`, `VolunteerMetricsResponse` → `UserResponse`, `UserListResponse`, `CreateUserBody`, `UpdateUserBody`, `AdminUpdateUserBody`, `UserMetricsResponse`

#### Go back and complete Task 6 route import updates

- [ ] In `apps/worker/routes/users.ts`, replace the `// TODO Task 7` import lines with the correct imports from `@protocol/schemas/users`.

#### Run codegen

- [ ] Run `bun run codegen` to regenerate TypeScript, Swift, and Kotlin types from the updated Zod schemas.
- [ ] Verify `packages/protocol/generated/typescript/` contains `UserResponse`, `UserListResponse`, etc. (not `VolunteerResponse`)
- [ ] Run `bun run typecheck 2>&1 | grep "protocol/" | head -20` — expect zero errors.
- [ ] Commit: `git commit -m "feat: rename protocol schemas volunteers → users, update codegen registry, run codegen"`

---

### Task 8: Shared types

**Files:**
- Modify: `packages/shared/types.ts`
- Modify: `packages/shared/nostr-events.ts` (if applicable)

- [ ] In `packages/shared/types.ts`:
  - `maxConcurrentPerVolunteer: number` → `maxConcurrentPerUser: number` (line ~247, in `MessagingConfig` interface)
  - Update the comment: `// conversation limit per volunteer` → `// conversation limit per user`
  - Update the comment: `// auto-assign to on-shift volunteers` → `// auto-assign to on-shift users` (line ~245)
  - `visibleToVolunteers: boolean` → `visibleToUsers: boolean` on `CustomFieldDefinition` interface
  - `editableByVolunteers: boolean` → `editableByUsers: boolean` on `CustomFieldDefinition` interface

- [ ] In `packages/shared/nostr-events.ts`: update any comments that say "volunteer ringing", "volunteer presence" to "user ringing", "user presence". (These are comments, not normative code.)

- [ ] Run `bun run typecheck 2>&1 | grep "shared/" | head -10` — expect zero errors.
- [ ] Commit: `git commit -m "chore: update shared types to use user entity naming"`

---

### Task 9: Client (desktop) — routes, components, and API layer

**Files:**
- Modify: `src/client/lib/api.ts`
- Rename: `src/client/routes/volunteers.tsx` → `src/client/routes/users.tsx`
- Rename: `src/client/routes/volunteers_.$pubkey.tsx` → `src/client/routes/users_.$pubkey.tsx`
- Rename: `src/client/components/volunteer-multi-select.tsx` → `src/client/components/user-multi-select.tsx`
- Modify: All client files importing `Volunteer` type or calling `/volunteers` endpoints

#### Update `src/client/lib/api.ts`

- [ ] Update schema import: `import { volunteerResponseSchema } from '@protocol/schemas/volunteers'` → `import { userResponseSchema } from '@protocol/schemas/users'`
- [ ] Remove the deprecated `export type UserRole = 'volunteer' | 'admin' | 'reporter'` export (line ~904)
- [ ] Rename `export type Volunteer = z.infer<typeof volunteerResponseSchema> & {...}` → `export type User = z.infer<typeof userResponseSchema> & {...}`
- [ ] Rename `export type VolunteerPresence` → `export type UserPresence`, update internal fields if the schema field changed (`volunteers` → `users` in `callPresenceResponseSchema`)
- [ ] Update all API call paths:
  - `request<{ volunteers: Volunteer[] }>('/volunteers')` → `request<{ users: User[] }>('/users')`
  - `'/volunteers'` path strings → `'/users'` in `fetchVolunteers()`, `createVolunteer()`, `updateVolunteer()`, `deleteVolunteer()` — rename these functions too:
    - `fetchVolunteers()` → `fetchUsers()`
    - `createVolunteer()` → `createUser()`
    - `updateVolunteer()` → `updateUser()`
    - `deleteVolunteer()` → `deleteUser()`
  - `fetchVolunteerMetrics()` → `fetchUserMetrics()`, path `'/volunteers/:pubkey/metrics'` → `'/users/:pubkey/metrics'`

#### Rename route files

- [ ] `mv src/client/routes/volunteers.tsx src/client/routes/users.tsx`
- [ ] `mv src/client/routes/volunteers_.\$pubkey.tsx src/client/routes/users_.\$pubkey.tsx`
- [ ] TanStack Router derives route paths from filenames — the route path changes automatically from `/volunteers` to `/users` and `/volunteers/$pubkey` to `/users/$pubkey`. Update any internal navigation links (e.g., `navigate({ to: '/volunteers' })` → `navigate({ to: '/users' })`).

#### Rename component

- [ ] `mv src/client/components/volunteer-multi-select.tsx src/client/components/user-multi-select.tsx`
- [ ] Update the component's internal type references: `Volunteer` → `User`
- [ ] Update all imports of `volunteer-multi-select` across the codebase.

#### Update all remaining client files

- [ ] Run: `grep -rn "Volunteer\b\|volunteer\b\|/volunteers" src/client/ --include="*.ts" --include="*.tsx"` to find remaining references.
- [ ] For each file found, update:
  - `import type { Volunteer }` → `import type { User }`
  - `import { fetchVolunteers, createVolunteer, ... }` → `import { fetchUsers, createUser, ... }`
  - `Volunteer` type usages → `User`
  - `volunteer` variable names → `user` (where they refer to the entity, not the role)
  - Keep `role-volunteer` string literals as-is.

#### Regenerate route tree

- [ ] Run `bun run dev` briefly (or the Vite build) to regenerate `src/client/routeTree.gen.ts` with the new route names.
- [ ] Alternatively run the TanStack Router CLI directly if a standalone codegen command exists: check `package.json` for a `routes:gen` or similar script.

- [ ] Run `bun run typecheck && bun run build` — expect zero errors.
- [ ] Run `grep -rn "/volunteers" src/client/ --include="*.ts" --include="*.tsx"` — expect zero results.
- [ ] Commit: `git commit -m "feat(client): rename Volunteer type to User, /volunteers routes to /users, update all API calls"`

---

### Task 10: i18n — rename keys

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: all other 12 locale files (`es.json`, `zh.json`, `tl.json`, `vi.json`, `ar.json`, `fr.json`, `ht.json`, `ko.json`, `ru.json`, `hi.json`, `pt.json`, `de.json`)

- [ ] In `packages/i18n/locales/en.json`, identify all keys with "volunteer"/"Volunteer" in the key name:
  Run: `grep -n "volunteer\|Volunteer" packages/i18n/locales/en.json`

  For each key:
  - Rename i18n **key** (not value) using the mapping below:
    - `loadingVolunteers` → `loadingUsers`
    - `noVolunteers` → `noUsers`
    - `searchVolunteers` → `searchUsers`
    - `healthVolunteers` → `healthUsers`
    - `volunteerAdded` → `userAdded`
    - `volunteerRemoved` → `userRemoved`
    - `volunteerRoleChanged` → `userRoleChanged`
    - `volunteerActivated` → `userActivated`
    - `volunteerDeactivated` → `userDeactivated`
    - `volunteerOnBreak` → `userOnBreak`
    - `volunteerOffBreak` → `userOffBreak`
    - (rename any other `volunteer*` keys similarly)
  - **String values**: Update section headings from "Volunteers" to "Users" since the section manages all users regardless of role. Keep values like "Volunteer" only where they label the specific `role-volunteer` role in UI (e.g., in a role selector dropdown). Make this determination on a case-by-case basis for each key.

- [ ] Apply the same key renames to all 12 other locale files. The values in non-English locales may be marked for translator review (add a `// REVIEW:` comment or use a `_review` suffix) but the keys must be updated.

- [ ] Run `bun run i18n:codegen` to regenerate iOS `.strings`, Android `strings.xml`, and `Kotlin I18n.kt`.
- [ ] Run `bun run i18n:validate:all` to verify no broken references.
- [ ] Update any client code that uses the old i18n keys (e.g., `t('loadingVolunteers')` → `t('loadingUsers')`).
  Run: `grep -rn "loadingVolunteers\|noVolunteers\|searchVolunteers\|healthVolunteers" src/ --include="*.tsx" --include="*.ts"` to find usages.
- [ ] Commit: `git commit -m "i18n: rename volunteer entity keys to user, run codegen"`

---

### Task 11: iOS client

**Files:**
- Rename: `apps/ios/Sources/Views/Admin/VolunteersView.swift` → `UsersView.swift`
- Modify: `apps/ios/Sources/App/AppState.swift`
- Modify: `apps/ios/Tests/UI/Helpers/BaseUITest.swift`
- Modify: All other iOS files referencing `Volunteer` as entity type

- [ ] Run codegen (if not already done in Task 7): `bun run codegen` — generated Swift types in `apps/ios/Sources/Generated/` are auto-updated to use `UserResponse`, `UserListResponse`, etc.

- [ ] Run on Mac: `ssh mac "cd ~/projects/llamenos && grep -rn 'Volunteer\|/api/volunteers' apps/ios/Sources/ --include='*.swift' | grep -v 'role-volunteer\|role_volunteer\|\"Volunteer\"' | head -40"` to identify files needing changes.

- [ ] Rename view file:
  ```
  ssh mac "mv ~/projects/llamenos/apps/ios/Sources/Views/Admin/VolunteersView.swift \
    ~/projects/llamenos/apps/ios/Sources/Views/Admin/UsersView.swift"
  ```
  Update the struct name inside: `struct VolunteersView: View` → `struct UsersView: View`

- [ ] In `apps/ios/Sources/App/AppState.swift` (lines ~240, 243):
  - `POST /api/volunteers` → `POST /api/users`
  - `GET /api/volunteers` → `GET /api/users`
  - Update any `Volunteer` type → `User` (from generated types)
  - Update any `volunteerResponse` variable → `userResponse`

- [ ] In `apps/ios/Tests/UI/Helpers/BaseUITest.swift` (line ~66):
  - `/api/volunteers` → `/api/users`

- [ ] For remaining files found by grep: update `Volunteer` entity references to `User`, keeping `role-volunteer` string constants as-is.

- [ ] Regenerate the Xcode project: `ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate"`

- [ ] Verify build: `ssh mac "cd ~/projects/llamenos/apps/ios && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"`
- [ ] Commit: `git commit -m "feat(ios): rename VolunteersView to UsersView, update API paths to /users"`

---

### Task 12: Android client

**Files:**
- Rename: `apps/android/.../VolunteerDetailViewModel.kt` → `UserDetailViewModel.kt`
- Rename: `apps/android/.../steps/auth/VolunteerSteps.kt` → `UserSteps.kt`
- Rename: `apps/android/.../steps/admin/VolunteerDetailSteps.kt` → `UserDetailSteps.kt`
- Modify: `apps/android/.../AdminViewModel.kt`
- Modify: `apps/android/.../model/AdminModels.kt`
- Modify: All other Android files referencing `Volunteer` as entity type

**Pre-step: Investigate the `/api/admin/volunteers` path**
- [ ] Run: `grep -rn "/api/admin/volunteers" apps/android/ --include="*.kt"` to confirm presence.
- [ ] Run: `grep -rn "admin/volunteers\|admin.*volunteers" apps/worker/ --include="*.ts"` to check if a corresponding backend route exists.
  - If no backend route at `/api/admin/volunteers` exists: this is an Android bug. The correct path was always `/api/volunteers`. Update Android to `/api/users`.
  - If a backend route does exist at `/api/admin/volunteers`: investigate and trace it; update that route to `/api/admin/users` as well (add to `apps/worker/app.ts`).

- [ ] Run codegen (already done in Task 7) — `apps/android/app/src/main/java/.../Generated/` or equivalent Kotlin files are auto-updated with `UserResponse`, etc.

- [ ] Find all files to rename:
  ```
  find apps/android/ -name "Volunteer*.kt" -o -name "*Volunteer*.kt"
  ```
  Rename each: `VolunteerDetailViewModel.kt` → `UserDetailViewModel.kt`, `VolunteerSteps.kt` → `UserSteps.kt`, `VolunteerDetailSteps.kt` → `UserDetailSteps.kt`
  Update class/object names inside each file to match.

- [ ] In `apps/android/.../AdminViewModel.kt` (lines ~204, 438, 462):
  - Update API endpoint strings: `/api/admin/volunteers` or `/api/volunteers` → `/api/users`
  - Update model type: `VolunteerDetail` or equivalent → `UserDetail` (from generated types or AdminModels)

- [ ] In `apps/android/.../model/AdminModels.kt`:
  - Update data class names that contain `Volunteer` as entity type
  - Update comments referencing the old path

- [ ] Run: `grep -rn "volunteer\|Volunteer" apps/android/ --include="*.kt" | grep -v "role-volunteer\|role_volunteer\|\"Volunteer\"" | head -30` to find remaining references.
- [ ] Update all remaining references.

- [ ] Verify compilation:
  ```
  cd apps/android && ./gradlew compileDebugKotlin && ./gradlew compileDebugAndroidTestKotlin
  ```
- [ ] Commit: `git commit -m "feat(android): rename Volunteer entity types to User, update API paths to /users"`

---

### Task 13: Tests — Playwright step files and helpers

**Files:**
- Modify: `tests/helpers.ts`
- Modify: `tests/steps/auth/volunteer-steps.ts`
- Modify: All test files using `createVolunteerAndGetNsec` or referencing `/volunteers`
- Modify: `tests/records-architecture.spec.ts`
- Modify: `tests/simulation.spec.ts`

- [ ] In `tests/helpers.ts` (line ~278): rename `createVolunteerAndGetNsec()` → `createUserAndGetNsec()`. Update the function body if it calls `/api/volunteers` internally.

- [ ] Find all test files using the old function name:
  ```
  grep -rn "createVolunteerAndGetNsec" tests/ --include="*.ts"
  ```
  Update every call site: `createVolunteerAndGetNsec(...)` → `createUserAndGetNsec(...)`

- [ ] Rename `tests/steps/auth/volunteer-steps.ts` → `tests/steps/auth/user-steps.ts`
  - Update the file header comment
  - Update any `Volunteer` type references → `User`
  - Update any `/volunteers` endpoint references → `/users`

- [ ] Run: `grep -rn "'/volunteers'\|\"\/volunteers\"\|\/api\/volunteers" tests/ --include="*.ts"` to find remaining endpoint references. Update each.

- [ ] Run: `grep -rn "interface Volunteer\|: Volunteer\|Volunteer\[\]" tests/ --include="*.ts"` to find type references. Update each.

- [ ] Check `data-testid` values: `grep -rn "volunteer" tests/ --include="*.ts"` — update any `data-testid` containing "volunteer" (if any). Cross-check with the component files updated in Task 9.

- [ ] Update test fixture imports if `volunteer-steps.ts` was imported elsewhere:
  ```
  grep -rn "volunteer-steps" tests/ --include="*.ts"
  ```
  Update each import to `user-steps`.

- [ ] Run `bun run test:build` (Vite build with mocks) to verify there are no compile errors in test code.
- [ ] Run `bun run test` (Playwright E2E) to verify tests pass.
- [ ] Commit: `git commit -m "test: rename createVolunteerAndGetNsec to createUserAndGetNsec, update all volunteer → user references in tests"`

---

### Task 14: CLAUDE.md and docs

**Files:**
- Modify: `~/projects/llamenos/CLAUDE.md`
- Modify: `~/.claude/projects/-home-rikki-projects-llamenos/memory/MEMORY.md`

#### `CLAUDE.md`

- [ ] In the Architecture Roles table, update the row:
  - Before: `| **Volunteer** | Own notes only | Answer calls, write notes |`
  - After: `| **User with Volunteer role** | Own notes only | Answer calls, write notes, handle conversations |`
- [ ] "Volunteer identity protection" → "User identity protection"
- [ ] Any other use of "volunteer" as an entity type rather than a role name.
- [ ] Keep `role-volunteer` and "Volunteer role" references intact.

#### `MEMORY.md`

- [ ] Update "E2E Testing Conventions": `createVolunteerAndGetNsec()` → `createUserAndGetNsec()`
- [ ] Update any memory entries using "volunteer" as entity type.

- [ ] Commit: `git commit -m "docs: update CLAUDE.md and memory to reflect user/PBAC naming alignment"`

---

## Post-rename verification checklist

Run ALL of the following to verify success criteria from the spec:

- [ ] `grep -rn "'volunteers'\|\"volunteers\"" apps/worker/ --include="*.ts"` → zero results (except any in migration SQL comments)
- [ ] `grep -rn "interface Volunteer\b\|: Volunteer\b\|Volunteer\b" apps/worker/ --include="*.ts"` → zero results
- [ ] `grep -rn "/volunteers" src/client/ --include="*.ts" --include="*.tsx"` → zero results
- [ ] `grep -rn "/volunteers" apps/ios/ --include="*.swift"` → zero results
- [ ] `grep -rn "/volunteers" apps/android/ --include="*.kt"` → zero results
- [ ] `bun run typecheck && bun run build` → zero errors
- [ ] `bun run test` → all Playwright tests pass
- [ ] `cd apps/android && ./gradlew compileDebugKotlin && ./gradlew compileDebugAndroidTestKotlin` → passes
- [ ] `psql $DATABASE_URL -c "\dt"` → shows `users` table, no `volunteers` table
- [ ] `curl -H "Authorization: ..." http://localhost:3000/api/users` → returns user list
- [ ] `curl -H "Authorization: ..." http://localhost:3000/api/volunteers` → returns 404
- [ ] `grep -rn "volunteer" apps/worker/ packages/protocol/ packages/shared/ src/client/ --include="*.ts" --include="*.tsx" | grep -v "role-volunteer\|role_volunteer\|\"Volunteer\"\|'Volunteer'\|# volunteer\|// volunteer\|migration\|MEMORY"` → review any remaining hits

---

## Summary of renames

| Before | After |
|--------|-------|
| `volunteers` table | `users` table |
| `volunteers.ts` (schema) | `users.ts` |
| `volunteers` Drizzle ORM var | `users` |
| `interface Volunteer` | `interface User` |
| `AppEnv.Variables.volunteer` | `AppEnv.Variables.user` |
| `c.get('volunteer')` | `c.get('user')` |
| `getVolunteerInternal()` | `getUserInternal()` |
| `getVolunteers()` / `getVolunteer()` | `getUsers()` / `getUser()` |
| `createVolunteer()` / `updateVolunteer()` / `deleteVolunteer()` | `createUser()` / `updateUser()` / `deleteUser()` |
| `VOLUNTEER_SAFE_FIELDS` | `USER_SAFE_FIELDS` |
| `MAX_DEVICES_PER_VOLUNTEER` | `MAX_DEVICES_PER_USER` |
| `rowToVolunteer()` | `rowToUser()` |
| `/api/volunteers` route | `/api/users` route |
| `routes/volunteers.ts` | `routes/users.ts` |
| `schemas/volunteers.ts` | `schemas/users.ts` |
| `volunteerResponseSchema` | `userResponseSchema` |
| `volunteerListResponseSchema` | `userListResponseSchema` |
| `createVolunteerBodySchema` | `createUserBodySchema` |
| `updateVolunteerBodySchema` | `updateUserBodySchema` |
| `adminUpdateVolunteerBodySchema` | `adminUpdateUserBodySchema` |
| `volunteerMetricsResponseSchema` | `userMetricsResponseSchema` |
| `volunteers:*` permissions | `users:*` permissions |
| `volunteers` audit category | `users` audit category |
| `volunteerAdded`, `volunteerRemoved`, etc. | `userAdded`, `userRemoved`, etc. |
| `visibleToVolunteers` (DB col + schema) | `visibleToUsers` |
| `editableByVolunteers` (DB col + schema) | `editableByUsers` |
| `allowVolunteerTranscriptionOptOut` (DB col) | `allowUserTranscriptionOptOut` |
| `volunteer_pubkeys` (shifts col) | `user_pubkeys` |
| `WebAuthnSettings.requireForVolunteers` | `WebAuthnSettings.requireForUsers` |
| `maxConcurrentPerVolunteer` | `maxConcurrentPerUser` |
| `src/client/routes/volunteers.tsx` | `src/client/routes/users.tsx` |
| `volunteer-multi-select.tsx` | `user-multi-select.tsx` |
| `VolunteersView.swift` | `UsersView.swift` |
| `VolunteerDetailViewModel.kt` | `UserDetailViewModel.kt` |
| `createVolunteerAndGetNsec()` | `createUserAndGetNsec()` |

**Preserved as-is:**
- `role-volunteer` — role ID string (stable API surface)
- `DEFAULT_ROLES[].name: 'Volunteer'` — role display name
- i18n string values labeling the Volunteer role in UI
- `packages/shared/voice-prompts.ts` IVR string "connect you with a volunteer"
- `packages/shared/migrations/index.ts` legacy DO migration named `shard-identity-volunteers`
- `calls:read-presence` description "View volunteer presence"
