# Spec: cms-smart-assignment
**Date**: 2026-03-21
**Status**: Draft

---

## Goal

Complete the smart case assignment system. The current implementation has three connected gaps:

1. **Specialization scoring is a stub** — the route handler in `records.ts` adds +5 for any user who has specializations, regardless of whether they match the case's entity type.
2. **Auto-assignment is not wired to record creation** — the toggle exists, the DB column exists, but `CasesService.create()` never calls any assignment logic.
3. **User profiles lack `languagePreferences`** — the schema has `spokenLanguages` for call routing but no BCP-47 language preference array for case assignment scoring.

This spec closes all three gaps with minimal surface area and no breaking changes to existing APIs.

---

## Current State (from code audit)

### Scoring (apps/worker/routes/records.ts ~line 683)

The actual scoring logic lives in `routes/records.ts` `GET /:id/suggestions`, NOT in `CasesService.getAssigneeSuggestions()` (which is a vestigial stub that returns only `{ currentAssignees, entityTypeId, hubId }`). The route handler implements real scoring:

- Base score: 50
- Workload score: `(1 - utilization) * 30` capped at current/effectiveMax (30 max points) — CORRECT
- Language match: `+15` if user's `spokenLanguages` includes the `?language` query param — CORRECT, but uses `spokenLanguages` (call-language field), not a dedicated case-assignment preference
- Specialization match: `+5` if user has ANY specializations — STUB (no entity-type comparison)
- Capacity gate: skips user if `activeCaseCount >= maxCaseAssignments` (when maxCaseAssignments > 0) — CORRECT

### Auto-assignment (apps/worker/services/cases.ts ~line 100)

`CasesService.create()` inserts the record and creates contact links. It does NOT read the hub's `autoAssignment` setting. It does NOT call `getAssigneeSuggestions`, the suggestions route, or any assignment service.

The hub settings `autoAssignment` boolean is stored in `hub_settings.settings` JSONB (exposed via `GET/PUT /api/cms/auto-assignment`) and read by `services.settings.getHubSettings(hubId)`.

The vestigial `CasesService.getAssigneeSuggestions(caseId)` (lines 1503–1526) only fetches the record header — it does not perform scoring. The real scoring is in the route handler.

### Volunteer profile schema

**DB** (`apps/worker/db/schema/users.ts`):
- `specializations: text[].default('{}')` — exists
- `maxCaseAssignments: integer` — exists (nullable, no default; treated as unlimited when null/0)
- `spokenLanguages: text[].default('{}')` — exists (used for both call routing and case assignment language scoring)
- No `languagePreferences` column (the spec requested this as a separate field from `spokenLanguages`)

**Protocol schema** (`packages/protocol/schemas/users.ts`):
- `specializations: z.array(z.string()).optional()` — in `userResponseSchema`, `createUserBodySchema`, `updateUserBodySchema`, `adminUpdateUserBodySchema`
- `maxCaseAssignments: z.number().optional()` — in response and admin-update schemas

**Identity service** (`apps/worker/services/identity.ts`):
- `rowToUser` maps `specializations` and `maxCaseAssignments` — exists
- `updateUser` handles `specializations` and `maxCaseAssignments` — exists

**Entity type definitions** (`apps/worker/db/schema/settings.ts`, `entityTypeDefinitions` table):
- No `requiredSpecializations` column — the field does NOT exist yet.

**Conclusion on `languagePreferences`**: `spokenLanguages` already covers call routing AND is used in the suggestions scorer. Adding a separate `languagePreferences` field would introduce confusion about which field governs what. The correct approach is to reuse `spokenLanguages` for case assignment language matching (it already works) and document this clearly. No new DB column is needed.

---

## Required Changes

### 1. Add `requiredSpecializations` to entity type definitions

Entity types need to declare which specializations are preferred for cases of that type. This enables real specialization scoring.

**DB migration** — add column to `entityTypeDefinitions` table:
```sql
ALTER TABLE entity_type_definitions
  ADD COLUMN required_specializations text[] DEFAULT '{}';
```

**Drizzle schema** (`apps/worker/db/schema/settings.ts`):
```ts
requiredSpecializations: text('required_specializations')
  .array()
  .default(sql`'{}'::text[]`),
```

**Protocol schema** — The entity type schema is at `packages/protocol/schemas/cms/entity-type.ts` — verify this path in the filesystem before writing the implementation:
- Add `requiredSpecializations: z.array(z.string()).optional().default([])` to the entity type definition schema.

**Entity schema service / routes** — expose `requiredSpecializations` in the entity type CRUD response and update input schemas.

### 2. Fix specialization scoring in the suggestions route

**File**: `apps/worker/routes/records.ts`, in the `GET /:id/suggestions` handler.

**Current stub (lines ~700–703)**:
```ts
if (vol.specializations?.length) {
  score += 5
  reasons.push('Has specializations')
}
```

**Required scoring logic**:

```ts
// Specialization match: +10 per matching tag
if (record.entityTypeId) {
  const entityTypeDef = await services.entitySchema.getEntityType(record.entityTypeId)
  const required = entityTypeDef?.requiredSpecializations ?? []
  if (required.length > 0 && vol.specializations?.length) {
    const matches = (vol.specializations as string[]).filter(s => required.includes(s))
    if (matches.length > 0) {
      score += matches.length * 10
      reasons.push(`Specialization match: ${matches.join(', ')}`)
    }
  }
}
```

Note: avoid fetching the entity type definition inside the per-user loop. Fetch it once before the loop and cache it in a local variable.

**Language match — keep using `spokenLanguages`**:

The current scoring uses `?language` query parameter and `vol.spokenLanguages`. This is correct. The only change needed is to also check the entity type's preferred languages if the entity type schema gains a `preferredLanguages` field in the future. No change needed now.

### 3. Wire auto-assignment to record creation

**File**: `apps/worker/routes/records.ts` — `POST /` route handler.

Auto-assignment is implemented entirely in the route handler, after `services.cases.create()` returns. Do NOT add callback parameters to `CasesService.create()` — keep the service lean.

**Route handler changes** (`apps/worker/routes/records.ts`, `POST /`):

After `services.cases.create(input)` returns `record`:

```ts
// Step 1: create the record
const record = await services.cases.create(input)

// Step 2: attempt auto-assignment (pickBestAssignee returns null if disabled or no eligible user)
if (record.assignedTo.length === 0) {
  const assignee = await pickBestAssignee(services, hubId, record)
  if (assignee) {
    // Step 3: assign to best candidate
    await services.cases.assign(record.id, [assignee])
    record.assignedTo = [assignee]
    // Emit Nostr event to notify the assigned user
    // NOTE: publishNostrEvent and KIND_RECORD_ASSIGNED are already imported in this file
    // for the existing assign route — copy the import pattern from there.
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:assigned',
      recordId: record.id,
      assignedTo: assignee,
      autoAssigned: true,
    }).catch(e => console.error('[records] Auto-assignment Nostr publish failed:', e))
  }
}
```

Extract `pickBestAssignee` as a private helper that:
1. Reads `autoAssignment` from hub settings — returns `null` immediately if disabled. This guard lives INSIDE `pickBestAssignee`, not in the route handler. The route handler always calls `pickBestAssignee()` unconditionally.
2. Calls the appropriate method on `services.shifts` to get currently on-shift user pubkeys — check `apps/worker/services/shifts.ts` for the actual method name (e.g. `getOnShiftUsers(hubId)` or equivalent) before writing the code. Do not assume a specific method name.
2.5. Fetches active case counts per user — use the same query as the suggestions route: count of records where `assignedTo @> ARRAY[pubkey]` and `status != 'closed'`. Without this, the capacity gate in step 6 can never work.
3. Loads user profiles.
4. Loads entity type `requiredSpecializations` if `record.entityTypeId` is set.
5. Scores each user (same algorithm as the suggestions route — extract into a shared `scoreVolunteer()` utility to avoid duplication).
6. Skips users at capacity.
7. Returns the pubkey of the top-scoring eligible user, or `null` if none available.

When `null` is returned (all off-shift, all at capacity, or auto-assignment disabled), the record is created unassigned. Set a `flags` field or log an audit entry. No error should be thrown — unassigned records are valid.

### 4. Extract scoring into a shared utility

The scoring logic currently duplicated across `routes/records.ts` suggestions handler and the new `pickBestAssignee` helper must be extracted.

**New file**: `apps/worker/lib/assignment-scorer.ts`

```ts
export interface VolunteerScore {
  pubkey: string
  score: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
}

export function scoreVolunteer(
  vol: User,
  activeCaseCount: number,
  entityTypeRequiredSpecializations: string[],
  languageNeed: string | undefined,
): VolunteerScore | null
```

Returns `null` if the user should be excluded (at capacity, on break, inactive). Otherwise returns the score breakdown. The suggestions route and `pickBestAssignee` both call this function.

### 5. Volunteer profile UI (desktop admin)

**File**: `src/client/routes/admin/users/$pubkey.tsx` (or equivalent user detail route — verify exact path).

Add to the admin user edit form:
- `specializations` — tag input (comma-separated or multi-select), max 100 chars per tag
- `maxCaseAssignments` — number input, min 0, default empty (unlimited), label: "Max concurrent cases (0 = unlimited)"

These fields are already in `adminUpdateUserBodySchema` and the API endpoint. The UI gap is only in the frontend form.

**Mobile (iOS / Android)**:
- Read-only display of `specializations` on the user's own profile page.
- No editing from mobile — admin-only write path is acceptable for V1.

---

## File Map

| File | Change type | Description |
|------|-------------|-------------|
| `apps/worker/db/schema/settings.ts` | Edit | Add `requiredSpecializations text[]` to `entityTypeDefinitions` |
| `apps/worker/db/migrations/NNNN_add_entity_type_specializations.sql` | New | ALTER TABLE migration |
| `packages/protocol/schemas/cms/entity-type.ts` (verify path in filesystem) | Edit | Add `requiredSpecializations` to entity type schema |
| `apps/worker/lib/assignment-scorer.ts` | New | Shared scoring utility |
| `apps/worker/routes/records.ts` | Edit | Fix suggestions scoring; `pickBestAssignee` helper + auto-assign wiring on POST |
| `src/client/routes/admin/users/$pubkey.tsx` (verify path) | Edit | Add specializations + maxCaseAssignments fields |
| `apps/ios/Sources/Views/Profile/` (verify path) | Edit | Read-only specializations display |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/profile/` (verify path) | Edit | Read-only specializations display |

---

## Platform Scope

| Platform | Work |
|----------|------|
| Worker (TypeScript) | DB migration, scoring fix, `pickBestAssignee` helper + auto-assign wiring in route handler, shared scorer utility |
| Protocol (TypeScript) | `requiredSpecializations` added to entity type schema; run `bun run codegen` |
| Desktop frontend | Admin user edit form fields |
| iOS (Swift) | Read-only profile display of specializations |
| Android (Kotlin) | Read-only profile display of specializations |

---

## What is NOT in scope

- Adding `languagePreferences` as a separate DB column. `spokenLanguages` already covers the case assignment language scoring. Adding a second similar field creates confusion. Document that `spokenLanguages` is used for both call routing and case assignment.
- Changing `maxCaseAssignments` default. It is currently nullable/zero-means-unlimited. This is correct behavior — do not add a hard default of 5 as suggested in the brief; it would silently cap existing users.
- Mobile editing of `specializations` or `maxCaseAssignments` (admin-only write path is sufficient for V1).
- Bulk auto-assignment of existing unassigned records (out of scope — this is only for new record creation).

---

## Verification Gates

### Scoring

- [ ] BDD test: `GET /api/cms/records/:id/suggestions` returns user with matching specializations ranked above user with no specializations for the same entity type
- [ ] BDD test: two users, same specializations, different workload — lower workload user ranked first
- [ ] BDD test: user at `maxCaseAssignments` capacity excluded from suggestions
- [ ] BDD test: `requiredSpecializations` empty on entity type → specialization scoring contributes 0 (not negative)
- [ ] BDD test: user with specializations that do NOT match the entity type's `requiredSpecializations` scores NO specialization points — same score as a user with no specializations at all (confirms the stub is fully removed)
- [ ] Unit test: `scoreVolunteer()` in `assignment-scorer.ts` covers all score components

### Auto-assignment

- [ ] BDD test: `POST /api/cms/records/` with `autoAssignment = true` on hub → record has `assignedTo` set to the top-scored on-shift user
- [ ] BDD test: `POST /api/cms/records/` with no on-shift users → record created unassigned, no error
- [ ] BDD test: `POST /api/cms/records/` with `autoAssignment = false` → record created unassigned regardless of eligible users
- [ ] BDD test: `POST /api/cms/records/` with only at-capacity users → record created unassigned

### Volunteer profile

- [ ] `PATCH /api/users/:pubkey` with `specializations: ["legal-observer"]` → user response includes the tag
- [ ] `GET /api/users/:pubkey` includes `specializations` field in response
- [ ] Desktop admin UI: specializations field saves and displays correctly
- [ ] Desktop admin UI: `maxCaseAssignments = 0` displays as "unlimited"

### Codegen

- [ ] `bun run codegen` succeeds after adding `requiredSpecializations` to entity type schema
- [ ] `bun run codegen:check` passes (no drift)
- [ ] `bun run typecheck` passes

### Regression

- [ ] Existing BDD test suite (`bun run test:backend:bdd`) passes — no regressions in record creation or user management
- [ ] `cd apps/android && ./gradlew testDebugUnitTest` passes
- [ ] iOS `xcodebuild build -scheme Llamenos-Package` succeeds on mac
