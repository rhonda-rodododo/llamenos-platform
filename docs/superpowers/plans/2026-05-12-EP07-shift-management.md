# EP07: Shift Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete shift management: ring groups, shift overrides, server-side clock-in with heartbeat liveness, user availability blocks, shift join/leave requests with approval, routing pipeline evolution, React Query migration, and cross-platform shift views (desktop, iOS, Android).

**Architecture:** Six new DB tables + shift table modifications. Ring groups are independent of EP03 teams. Routing pipeline evolves from simple schedule lookup to a 6-step pipeline (schedule → overrides → resolve ring groups → clock-in filter → availability filter → fallback). All sensitive names encrypted with hub key using domain separation labels. WebSocket heartbeat confirms user liveness; HTTP clock-in/out controls routing eligibility.

**Tech Stack:** TypeScript (React, TanStack Query, Hono), Drizzle ORM (PostgreSQL), Zod (protocol schemas → codegen to Swift/Kotlin), SwiftUI (iOS), Kotlin/Compose (Android), packages/i18n (13 locales), Playwright BDD (desktop E2E), Cucumber BDD (Android E2E), XCUITest (iOS).

**Prerequisite:** EP01 (permissions) must be merged. EP03 (teams) is not a runtime dependency — ring groups are independent — but should be planned first since the spec references the team/ring-group independence decision.

**Spec:** `docs/superpowers/specs/2026-05-11-EP07-shift-management-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/worker/db/schema/ring-groups.ts` | Drizzle schema: ring_groups, ring_group_members |
| `apps/worker/db/schema/shift-overrides.ts` | Drizzle schema: shift_overrides |
| `apps/worker/db/schema/active-shifts.ts` | Drizzle schema: active_shifts |
| `apps/worker/db/schema/shift-availability.ts` | Drizzle schema: user_availability_blocks |
| `apps/worker/db/schema/shift-requests.ts` | Drizzle schema: shift_join_requests |
| `apps/worker/services/ring-groups.ts` | Ring group CRUD + member management |
| `apps/worker/services/shift-overrides.ts` | Override CRUD |
| `apps/worker/services/active-shifts.ts` | Clock-in/out, heartbeat, cleanup |
| `apps/worker/services/shift-availability.ts` | Availability block CRUD |
| `apps/worker/services/shift-requests.ts` | Join/leave request CRUD + approval |
| `apps/worker/routes/ring-groups.ts` | Ring group API endpoints |
| `packages/protocol/schemas/ring-group.ts` | Zod schemas for ring groups |
| `packages/protocol/schemas/shift-override.ts` | Zod schemas for overrides |
| `packages/protocol/schemas/shift-availability.ts` | Zod schemas for availability blocks |
| `packages/protocol/schemas/shift-request.ts` | Zod schemas for join/leave requests |
| `src/client/lib/queries/shifts.ts` | React Query hooks (all shift-domain queries + mutations) |
| `src/client/lib/api/shifts.ts` | API client functions for shift domain |
| `packages/test-specs/features/shifts/ring-groups.feature` | BDD: ring group CRUD |
| `packages/test-specs/features/shifts/overrides.feature` | BDD: shift overrides |
| `packages/test-specs/features/shifts/clock-in.feature` | BDD: clock-in/out + heartbeat |
| `packages/test-specs/features/shifts/availability.feature` | BDD: availability blocks |
| `packages/test-specs/features/shifts/requests.feature` | BDD: join/leave requests |
| `packages/test-specs/features/shifts/routing-pipeline.feature` | BDD: routing pipeline integration |
| `tests/steps/backend/shifts.steps.ts` | Backend BDD step definitions |
| `tests/api-helpers/shifts.ts` | API helper functions for shift tests |

### Modified files

| File | Change |
|------|--------|
| `packages/shared/permissions.ts` | Add 5 new shift permissions |
| `packages/protocol/crypto-labels.json` | Add 4 new domain separation labels |
| `packages/protocol/schemas/shifts.ts` | Add ringGroupId, rename name→encryptedName, add clock status schema |
| `packages/protocol/tools/schema-registry.ts` | Register new schemas |
| `apps/worker/db/schema/index.ts` | Export new schema tables |
| `apps/worker/db/schema/shifts.ts` | Add ringGroupId FK, rename name→encryptedName |
| `apps/worker/services/index.ts` | Register new services in Services interface + createServices() |
| `apps/worker/services/shifts.ts` | Evolve getCurrentVolunteers() to 6-step routing pipeline |
| `apps/worker/services/audit.ts` | Add new audit event categories |
| `apps/worker/routes/shifts.ts` | Add override, clock, availability, request sub-routes |
| `apps/worker/app.ts` | Register ring-groups route |
| `apps/worker/db/schema/settings.ts` | Add heartbeatTimeout to ALLOWED_HUB_SETTINGS |
| `src/client/routes/shifts.tsx` | Full rewrite: tabbed layout, React Query, encryption |
| `src/client/lib/hooks.ts` | Remove old useShiftStatus (replaced by React Query) |
| `tests/test-ids.ts` | Add new test IDs for ring groups, overrides, clock, availability, requests |
| `tests/pages/index.ts` | Add page objects for new shift UI |
| `packages/i18n/locales/en.json` | Add ring group, override, availability, request strings |
| `packages/test-specs/features/admin/shift-management.feature` | Update existing scenarios for encrypted names + new features |

---

## Phase 1: Foundation — Permissions, Crypto Labels, Protocol Schemas

### Task 1: Add new shift permissions to the permission catalog

**Files:**
- Modify: `packages/shared/permissions.ts`

- [ ] **Step 1: Add the 5 new permissions after the existing shifts block**

In `packages/shared/permissions.ts`, after `'shifts:manage-fallback': 'Manage fallback ring group',` (line 79), add:

```typescript
  'shifts:manage-overrides': 'Manage shift overrides',
  'shifts:manage-ring-groups': 'Manage ring groups and membership',
  'shifts:approve-requests': 'Approve/deny shift join/leave requests',
  'shifts:request-join': 'Submit shift join/leave requests',
  'shifts:set-availability': 'Set own availability blocks',
```

- [ ] **Step 2: Verify permission catalog loads**

Run: `bun run typecheck`
Expected: PASS (permissions.ts is imported by many files — typecheck validates the shape)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/permissions.ts
git commit -m "feat(EP07): add shift override, ring group, availability, and request permissions"
```

### Task 2: Add crypto domain separation labels

**Files:**
- Modify: `packages/protocol/crypto-labels.json`

- [ ] **Step 1: Add 4 new labels**

Add to `packages/protocol/crypto-labels.json` (alphabetical order within the file):

```json
"LABEL_AVAILABILITY_REASON": "llamenos:availability-reason",
"LABEL_RING_GROUP_NAME": "llamenos:ring-group-name",
"LABEL_SHIFT_OVERRIDE_NOTE": "llamenos:shift-override-note",
"LABEL_SHIFT_NAME": "llamenos:shift-name",
```

Note: `LABEL_SHIFT_SCHEDULE` already exists — `LABEL_SHIFT_NAME` is specifically for the encrypted name field. Keep both.

- [ ] **Step 2: Run codegen to regenerate TS/Swift/Kotlin constants**

Run: `bun run codegen`
Expected: Regenerates `packages/protocol/generated/` with new label constants.

- [ ] **Step 3: Verify labels appear in generated output**

Run: `grep LABEL_SHIFT_NAME packages/protocol/generated/typescript/index.ts`
Expected: Shows the label constant.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/crypto-labels.json
git commit -m "feat(EP07): add domain separation labels for shift names, ring groups, overrides, availability"
```

### Task 3: Create ring group protocol schemas

**Files:**
- Create: `packages/protocol/schemas/ring-group.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Create the ring group schemas**

Create `packages/protocol/schemas/ring-group.ts`:

```typescript
import { z } from 'zod/v4'
import { pubkeySchema } from './common'

export const ringGroupMemberSchema = z.object({
  pubkey: z.string(),
  addedBy: z.string(),
  createdAt: z.string(),
})

export const ringGroupResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  encryptedName: z.string(),
  memberCount: z.number().int(),
  createdAt: z.string(),
})

export const ringGroupDetailResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  encryptedName: z.string(),
  members: z.array(ringGroupMemberSchema),
  createdAt: z.string(),
})

export const ringGroupListResponseSchema = z.object({
  ringGroups: z.array(ringGroupResponseSchema),
})

export const createRingGroupBodySchema = z.object({
  id: z.string().uuid(),
  encryptedName: z.string().min(1),
})

export const updateRingGroupBodySchema = z.object({
  encryptedName: z.string().min(1),
})

export const ringGroupMembersBodySchema = z.object({
  pubkeys: z.array(pubkeySchema).min(1),
})
```

- [ ] **Step 2: Register in schema registry**

In `packages/protocol/tools/schema-registry.ts`, the auto-discovery should pick these up since they end in `Schema`. Verify by checking the `EXCLUDED_SCHEMAS` set doesn't include any of them. If the file uses manual registration, add imports.

- [ ] **Step 3: Run codegen**

Run: `bun run codegen`
Expected: Swift and Kotlin types generated for RingGroupResponse, CreateRingGroupBody, etc.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/schemas/ring-group.ts
git commit -m "feat(EP07): add ring group protocol schemas"
```

### Task 4: Create shift override protocol schemas

**Files:**
- Create: `packages/protocol/schemas/shift-override.ts`

- [ ] **Step 1: Create the override schemas**

Create `packages/protocol/schemas/shift-override.ts`:

```typescript
import { z } from 'zod/v4'
import { pubkeySchema } from './common'

const overrideTypeSchema = z.enum(['cancel', 'substitute'])

export const shiftOverrideResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  shiftId: z.string().nullable(),
  date: z.string(),
  type: overrideTypeSchema,
  userPubkeys: z.array(z.string()).nullable(),
  encryptedNote: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export const shiftOverrideListResponseSchema = z.object({
  overrides: z.array(shiftOverrideResponseSchema),
})

export const createShiftOverrideBodySchema = z.object({
  id: z.string().uuid(),
  shiftId: z.string().nullable().optional().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: overrideTypeSchema,
  userPubkeys: z.array(pubkeySchema).nullable().optional().default(null),
  encryptedNote: z.string().nullable().optional().default(null),
})

export const overrideQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
```

- [ ] **Step 2: Run codegen**

Run: `bun run codegen`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/schemas/shift-override.ts
git commit -m "feat(EP07): add shift override protocol schemas"
```

### Task 5: Create availability block protocol schemas

**Files:**
- Create: `packages/protocol/schemas/shift-availability.ts`

- [ ] **Step 1: Create the availability schemas**

Create `packages/protocol/schemas/shift-availability.ts`:

```typescript
import { z } from 'zod/v4'

export const availabilityBlockResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  userPubkey: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  encryptedReason: z.string().nullable(),
  createdAt: z.string(),
})

export const availabilityBlockListResponseSchema = z.object({
  blocks: z.array(availabilityBlockResponseSchema),
})

export const createAvailabilityBlockBodySchema = z.object({
  id: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  encryptedReason: z.string().nullable().optional().default(null),
})
```

- [ ] **Step 2: Run codegen and commit**

```bash
bun run codegen
git add packages/protocol/schemas/shift-availability.ts
git commit -m "feat(EP07): add availability block protocol schemas"
```

### Task 6: Create shift join/leave request protocol schemas

**Files:**
- Create: `packages/protocol/schemas/shift-request.ts`

- [ ] **Step 1: Create the request schemas**

Create `packages/protocol/schemas/shift-request.ts`:

```typescript
import { z } from 'zod/v4'

const requestTypeSchema = z.enum(['join', 'leave'])
const requestStatusSchema = z.enum(['pending', 'approved', 'denied'])

export const shiftJoinRequestResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  shiftId: z.string(),
  userPubkey: z.string(),
  type: requestTypeSchema,
  status: requestStatusSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const shiftJoinRequestListResponseSchema = z.object({
  requests: z.array(shiftJoinRequestResponseSchema),
})

export const createShiftJoinRequestBodySchema = z.object({
  shiftId: z.string(),
  type: requestTypeSchema,
})

export const reviewShiftJoinRequestBodySchema = z.object({
  status: z.enum(['approved', 'denied']),
})
```

- [ ] **Step 2: Run codegen and commit**

```bash
bun run codegen
git add packages/protocol/schemas/shift-request.ts
git commit -m "feat(EP07): add shift join/leave request protocol schemas"
```

### Task 7: Modify existing shifts protocol schemas

**Files:**
- Modify: `packages/protocol/schemas/shifts.ts`

- [ ] **Step 1: Update shiftResponseSchema**

In `packages/protocol/schemas/shifts.ts`, modify the schemas:

- `shiftResponseSchema`: rename `name` → `encryptedName`, add `ringGroupId: z.string().nullable()`
- `createShiftBodySchema`: add `id: z.string().uuid()`, rename `name` → `encryptedName`, add `ringGroupId: z.string().nullable().optional().default(null)`
- `updateShiftBodySchema`: rename `name` → `encryptedName` (optional), add `ringGroupId: z.string().nullable().optional()`
- `myStatusResponseSchema`: update currentShift/nextShift to include `id` and `encryptedName` instead of plaintext `name`

Add new schema:
```typescript
export const clockStatusResponseSchema = z.object({
  users: z.array(z.object({
    pubkey: z.string(),
    startedAt: z.string(),
    lastHeartbeat: z.string(),
  })),
})
```

- [ ] **Step 2: Run codegen to verify no breaks**

Run: `bun run codegen && bun run typecheck`
Expected: May show type errors in consumers — these will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/schemas/shifts.ts
git commit -m "feat(EP07): update shifts schemas — encrypted names, ring group refs, clock status"
```

---

## Phase 2: Database Schema

### Task 8: Create ring groups DB schema

**Files:**
- Create: `apps/worker/db/schema/ring-groups.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Define ring_groups and ring_group_members tables**

Create `apps/worker/db/schema/ring-groups.ts`:

```typescript
import { pgTable, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'

export const ringGroups = pgTable('ring_groups', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  encryptedName: text('encrypted_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ring_groups_hub_idx').on(table.hubId),
])

// NOTE: shifts.ringGroupId FK uses onDelete: 'restrict' — defined in shifts.ts (Task 12).
// This prevents deletion of ring groups that are assigned to shifts.

export const ringGroupMembers = pgTable('ring_group_members', {
  ringGroupId: text('ring_group_id').notNull().references(() => ringGroups.id, { onDelete: 'cascade' }),
  userPubkey: text('user_pubkey').notNull(),
  addedBy: text('added_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.ringGroupId, table.userPubkey] }),
  index('ring_group_members_user_idx').on(table.userPubkey),
])
```

- [ ] **Step 2: Export from index**

In `apps/worker/db/schema/index.ts`, add:

```typescript
export * from './ring-groups'
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/db/schema/ring-groups.ts apps/worker/db/schema/index.ts
git commit -m "feat(EP07): add ring_groups and ring_group_members DB schema"
```

### Task 9: Create shift overrides DB schema

**Files:**
- Create: `apps/worker/db/schema/shift-overrides.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Define shift_overrides table**

Create `apps/worker/db/schema/shift-overrides.ts`:

```typescript
import { pgTable, text, timestamp, index, unique, sql } from 'drizzle-orm/pg-core'
import { shifts } from './shifts'

export const shiftOverrides = pgTable('shift_overrides', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type').notNull(), // 'cancel' | 'substitute'
  userPubkeys: text('user_pubkeys').array(),
  encryptedNote: text('encrypted_note'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('shift_overrides_hub_shift_date').on(table.hubId, table.shiftId, table.date),
  index('shift_overrides_hub_date_idx').on(table.hubId, table.date),
])

// Note: partial unique index for global overrides (shiftId IS NULL) needs raw SQL migration:
// CREATE UNIQUE INDEX shift_overrides_hub_global_date ON shift_overrides (hub_id, date) WHERE shift_id IS NULL;
```

- [ ] **Step 2: Export from index and commit**

```typescript
// In apps/worker/db/schema/index.ts:
export * from './shift-overrides'
```

```bash
git add apps/worker/db/schema/shift-overrides.ts apps/worker/db/schema/index.ts
git commit -m "feat(EP07): add shift_overrides DB schema"
```

### Task 10: Create active shifts DB schema

**Files:**
- Create: `apps/worker/db/schema/active-shifts.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Define active_shifts table**

Create `apps/worker/db/schema/active-shifts.ts`:

```typescript
import { pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'

export const activeShifts = pgTable('active_shifts', {
  pubkey: text('pubkey').notNull(),
  hubId: text('hub_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.pubkey, table.hubId] }),
])
```

- [ ] **Step 2: Export from index and commit**

```bash
git add apps/worker/db/schema/active-shifts.ts apps/worker/db/schema/index.ts
git commit -m "feat(EP07): add active_shifts DB schema"
```

### Task 11: Create availability blocks and shift requests DB schemas

**Files:**
- Create: `apps/worker/db/schema/shift-availability.ts`
- Create: `apps/worker/db/schema/shift-requests.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Define user_availability_blocks table**

Create `apps/worker/db/schema/shift-availability.ts`:

```typescript
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const userAvailabilityBlocks = pgTable('user_availability_blocks', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  userPubkey: text('user_pubkey').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  encryptedReason: text('encrypted_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('availability_blocks_hub_user_idx').on(table.hubId, table.userPubkey),
  index('availability_blocks_hub_date_idx').on(table.hubId, table.startDate, table.endDate),
])
```

- [ ] **Step 2: Define shift_join_requests table**

Create `apps/worker/db/schema/shift-requests.ts`:

```typescript
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { shifts } from './shifts'

export const shiftJoinRequests = pgTable('shift_join_requests', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull(),
  shiftId: text('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  userPubkey: text('user_pubkey').notNull(),
  type: text('type').notNull(), // 'join' | 'leave'
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied'
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('shift_join_requests_hub_idx').on(table.hubId, table.status),
])
```

- [ ] **Step 3: Export both from index and commit**

```bash
git add apps/worker/db/schema/shift-availability.ts apps/worker/db/schema/shift-requests.ts apps/worker/db/schema/index.ts
git commit -m "feat(EP07): add availability blocks and shift join requests DB schemas"
```

### Task 12: Modify shifts table — add ringGroupId, rename name to encryptedName

**Files:**
- Modify: `apps/worker/db/schema/shifts.ts`

- [ ] **Step 1: Update shifts table definition**

In `apps/worker/db/schema/shifts.ts`:

1. Add import: `import { ringGroups } from './ring-groups'`
2. Rename `name` column to `encryptedName`:
   - `name: text('name').notNull()` → `encryptedName: text('encrypted_name').notNull()`
3. Add `ringGroupId` column after `encryptedName`:
   - `ringGroupId: text('ring_group_id').references(() => ringGroups.id, { onDelete: 'restrict' }),`
   This prevents deletion of ring groups assigned to shifts (returns 500/constraint violation; service layer catches this in Task 14).

- [ ] **Step 2: Run typecheck to find all consumers that reference `name`**

Run: `bun run typecheck 2>&1 | head -50`
Expected: Type errors in shifts service, routes, and client code referencing `.name`. These are fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/db/schema/shifts.ts
git commit -m "feat(EP07): modify shifts table — encryptedName, ringGroupId FK"
```

### Task 13: Generate and apply Drizzle migration

- [ ] **Step 1: Generate migration**

Run: `cd apps/worker && bunx drizzle-kit generate`
Expected: Creates a new SQL migration file in `drizzle/migrations/` with the new tables and column changes.

- [ ] **Step 2: Review the migration SQL**

Read the generated migration file. Verify it includes:
- CREATE TABLE ring_groups, ring_group_members, shift_overrides, active_shifts, user_availability_blocks, shift_join_requests
- ALTER TABLE shifts: rename name → encrypted_name, add ring_group_id FK
- All indexes and constraints

- [ ] **Step 3: Add partial unique index for global overrides**

Append to the generated migration file:

```sql
CREATE UNIQUE INDEX shift_overrides_hub_global_date ON shift_overrides (hub_id, date) WHERE shift_id IS NULL;
```

- [ ] **Step 4: Apply migration to dev database**

Run: `cd apps/worker && bunx drizzle-kit push`
Expected: Migration applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "feat(EP07): add database migration for ring groups, overrides, clock-in, availability, requests"
```

---

## Phase 3: Backend Services

### Task 14: Ring groups service

**Files:**
- Create: `apps/worker/services/ring-groups.ts`
- Modify: `apps/worker/services/index.ts`

- [ ] **Step 1: Create the ring groups service**

Create `apps/worker/services/ring-groups.ts`:

```typescript
import { eq, and, count, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { ringGroups, ringGroupMembers } from '../db/schema'
import { ServiceError } from './settings'

export class RingGroupsService {
  constructor(private db: Database) {}

  async list(hubId: string) {
    const rows = await this.db
      .select({
        id: ringGroups.id,
        hubId: ringGroups.hubId,
        encryptedName: ringGroups.encryptedName,
        createdAt: ringGroups.createdAt,
        memberCount: count(ringGroupMembers.userPubkey),
      })
      .from(ringGroups)
      .leftJoin(ringGroupMembers, eq(ringGroups.id, ringGroupMembers.ringGroupId))
      .where(eq(ringGroups.hubId, hubId))
      .groupBy(ringGroups.id)

    return {
      ringGroups: rows.map((r) => ({
        ...r,
        memberCount: Number(r.memberCount),
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  async create(hubId: string, data: { id: string; encryptedName: string }) {
    const [row] = await this.db
      .insert(ringGroups)
      .values({ id: data.id, hubId, encryptedName: data.encryptedName })
      .returning()
    return { ...row, createdAt: row.createdAt.toISOString() }
  }

  async update(hubId: string, id: string, data: { encryptedName: string }) {
    const [row] = await this.db
      .update(ringGroups)
      .set({ encryptedName: data.encryptedName })
      .where(and(eq(ringGroups.id, id), eq(ringGroups.hubId, hubId)))
      .returning()
    if (!row) throw new ServiceError(404, 'Ring group not found')
    return { ...row, createdAt: row.createdAt.toISOString() }
  }

  async delete(hubId: string, id: string) {
    // onDelete: restrict on shifts.ringGroupId will throw if referenced
    const [row] = await this.db
      .delete(ringGroups)
      .where(and(eq(ringGroups.id, id), eq(ringGroups.hubId, hubId)))
      .returning()
    if (!row) throw new ServiceError(404, 'Ring group not found')
    return { ok: true as const }
  }

  async getMembers(hubId: string, ringGroupId: string) {
    // Verify ring group belongs to hub
    const rg = await this.db.select().from(ringGroups)
      .where(and(eq(ringGroups.id, ringGroupId), eq(ringGroups.hubId, hubId)))
    if (!rg.length) throw new ServiceError(404, 'Ring group not found')

    const members = await this.db
      .select()
      .from(ringGroupMembers)
      .where(eq(ringGroupMembers.ringGroupId, ringGroupId))

    return {
      members: members.map((m) => ({
        pubkey: m.userPubkey,
        addedBy: m.addedBy,
        createdAt: m.createdAt.toISOString(),
      })),
    }
  }

  async addMembers(hubId: string, ringGroupId: string, pubkeys: string[], addedBy: string) {
    // Verify ring group belongs to hub
    const rg = await this.db.select().from(ringGroups)
      .where(and(eq(ringGroups.id, ringGroupId), eq(ringGroups.hubId, hubId)))
    if (!rg.length) throw new ServiceError(404, 'Ring group not found')

    const values = pubkeys.map((pk) => ({
      ringGroupId,
      userPubkey: pk,
      addedBy,
    }))

    await this.db
      .insert(ringGroupMembers)
      .values(values)
      .onConflictDoNothing()

    return { ok: true as const }
  }

  async removeMember(hubId: string, ringGroupId: string, pubkey: string) {
    const rg = await this.db.select().from(ringGroups)
      .where(and(eq(ringGroups.id, ringGroupId), eq(ringGroups.hubId, hubId)))
    if (!rg.length) throw new ServiceError(404, 'Ring group not found')

    await this.db
      .delete(ringGroupMembers)
      .where(and(
        eq(ringGroupMembers.ringGroupId, ringGroupId),
        eq(ringGroupMembers.userPubkey, pubkey),
      ))

    return { ok: true as const }
  }

  /** Resolve ring group ID to member pubkeys — used by routing pipeline */
  async resolvePubkeys(ringGroupId: string): Promise<string[]> {
    const members = await this.db
      .select({ pubkey: ringGroupMembers.userPubkey })
      .from(ringGroupMembers)
      .where(eq(ringGroupMembers.ringGroupId, ringGroupId))
    return members.map((m) => m.pubkey)
  }
}
```

- [ ] **Step 2: Register in services index**

In `apps/worker/services/index.ts`:
1. Add import: `import { RingGroupsService } from './ring-groups'`
2. Add to `Services` interface: `ringGroups: RingGroupsService`
3. Add to `createServices()`: `ringGroups: new RingGroupsService(db),`

- [ ] **Step 3: Commit**

```bash
git add apps/worker/services/ring-groups.ts apps/worker/services/index.ts
git commit -m "feat(EP07): add ring groups service with CRUD and member management"
```

### Task 15: Shift overrides service

**Files:**
- Create: `apps/worker/services/shift-overrides.ts`
- Modify: `apps/worker/services/index.ts`

- [ ] **Step 1: Create the overrides service**

Create `apps/worker/services/shift-overrides.ts`:

```typescript
import { eq, and, between } from 'drizzle-orm'
import type { Database } from '../db'
import { shiftOverrides } from '../db/schema'
import { ServiceError } from './settings'

export class ShiftOverridesService {
  constructor(private db: Database) {}

  async list(hubId: string, from: string, to: string) {
    const rows = await this.db
      .select()
      .from(shiftOverrides)
      .where(and(
        eq(shiftOverrides.hubId, hubId),
        between(shiftOverrides.date, from, to),
      ))

    return {
      overrides: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  async create(hubId: string, data: {
    id: string
    shiftId: string | null
    date: string
    type: 'cancel' | 'substitute'
    userPubkeys: string[] | null
    encryptedNote: string | null
  }, createdBy: string) {
    if (data.type === 'substitute' && (!data.userPubkeys || data.userPubkeys.length === 0)) {
      throw new ServiceError(400, 'Substitute overrides must include replacement users')
    }

    const [row] = await this.db
      .insert(shiftOverrides)
      .values({
        id: data.id,
        hubId,
        shiftId: data.shiftId,
        date: data.date,
        type: data.type,
        userPubkeys: data.userPubkeys,
        encryptedNote: data.encryptedNote,
        createdBy,
      })
      .returning()

    return { ...row, createdAt: row.createdAt.toISOString() }
  }

  async delete(hubId: string, id: string) {
    const [row] = await this.db
      .delete(shiftOverrides)
      .where(and(eq(shiftOverrides.id, id), eq(shiftOverrides.hubId, hubId)))
      .returning()
    if (!row) throw new ServiceError(404, 'Override not found')
    return { ok: true as const }
  }

  /** Get all overrides for a specific date — used by routing pipeline */
  async getForDate(hubId: string, date: string) {
    return this.db
      .select()
      .from(shiftOverrides)
      .where(and(eq(shiftOverrides.hubId, hubId), eq(shiftOverrides.date, date)))
  }
}
```

- [ ] **Step 2: Register in services index**

Add `ShiftOverridesService` to `Services` interface and `createServices()` — same pattern as Task 14.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/services/shift-overrides.ts apps/worker/services/index.ts
git commit -m "feat(EP07): add shift overrides service"
```

### Task 16: Active shifts service (clock-in/out + heartbeat)

**Files:**
- Create: `apps/worker/services/active-shifts.ts`
- Modify: `apps/worker/services/index.ts`

- [ ] **Step 1: Create the active shifts service**

Create `apps/worker/services/active-shifts.ts`:

```typescript
import { eq, and, gt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { activeShifts } from '../db/schema'

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 90_000 // 90 seconds

export class ActiveShiftsService {
  constructor(private db: Database) {}

  async clockIn(hubId: string, pubkey: string) {
    const now = new Date()
    await this.db
      .insert(activeShifts)
      .values({ pubkey, hubId, startedAt: now, lastHeartbeat: now })
      .onConflictDoUpdate({
        target: [activeShifts.pubkey, activeShifts.hubId],
        set: { startedAt: now, lastHeartbeat: now },
      })
    return { ok: true as const }
  }

  async clockOut(hubId: string, pubkey: string) {
    await this.db
      .delete(activeShifts)
      .where(and(eq(activeShifts.pubkey, pubkey), eq(activeShifts.hubId, hubId)))
    return { ok: true as const }
  }

  async forceClockOut(hubId: string, pubkey: string) {
    await this.db
      .delete(activeShifts)
      .where(and(eq(activeShifts.pubkey, pubkey), eq(activeShifts.hubId, hubId)))
    return { ok: true as const }
  }

  async heartbeat(hubId: string, pubkey: string) {
    await this.db
      .update(activeShifts)
      .set({ lastHeartbeat: new Date() })
      .where(and(eq(activeShifts.pubkey, pubkey), eq(activeShifts.hubId, hubId)))
  }

  async getStatus(hubId: string) {
    const rows = await this.db
      .select()
      .from(activeShifts)
      .where(eq(activeShifts.hubId, hubId))

    return {
      users: rows.map((r) => ({
        pubkey: r.pubkey,
        startedAt: r.startedAt.toISOString(),
        lastHeartbeat: r.lastHeartbeat.toISOString(),
      })),
    }
  }

  /** Get pubkeys of users clocked in with fresh heartbeat — used by routing pipeline */
  async getLivePubkeys(hubId: string, timeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS): Promise<string[]> {
    const threshold = new Date(Date.now() - timeoutMs)
    const rows = await this.db
      .select({ pubkey: activeShifts.pubkey })
      .from(activeShifts)
      .where(and(
        eq(activeShifts.hubId, hubId),
        gt(activeShifts.lastHeartbeat, threshold),
      ))
    return rows.map((r) => r.pubkey)
  }

  /** Cleanup stale records — called by periodic job */
  async cleanupStale(timeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS) {
    const threshold = new Date(Date.now() - timeoutMs)
    const deleted = await this.db
      .delete(activeShifts)
      .where(sql`${activeShifts.lastHeartbeat} < ${threshold}`)
      .returning()
    return { cleaned: deleted.length }
  }
}
```

- [ ] **Step 2: Register in services index**

Add `ActiveShiftsService` to `Services` interface and `createServices()`.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/services/active-shifts.ts apps/worker/services/index.ts
git commit -m "feat(EP07): add active shifts service — clock-in/out, heartbeat, cleanup"
```

### Task 17: Availability blocks service

**Files:**
- Create: `apps/worker/services/shift-availability.ts`
- Modify: `apps/worker/services/index.ts`

- [ ] **Step 1: Create the availability service**

Create `apps/worker/services/shift-availability.ts`:

```typescript
import { eq, and, lte, gte } from 'drizzle-orm'
import type { Database } from '../db'
import { userAvailabilityBlocks } from '../db/schema'
import { ServiceError } from './settings'

export class ShiftAvailabilityService {
  constructor(private db: Database) {}

  async listMine(hubId: string, pubkey: string) {
    const rows = await this.db
      .select()
      .from(userAvailabilityBlocks)
      .where(and(
        eq(userAvailabilityBlocks.hubId, hubId),
        eq(userAvailabilityBlocks.userPubkey, pubkey),
      ))

    return {
      blocks: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    }
  }

  async listAll(hubId: string) {
    const rows = await this.db
      .select()
      .from(userAvailabilityBlocks)
      .where(eq(userAvailabilityBlocks.hubId, hubId))

    return {
      blocks: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    }
  }

  async create(hubId: string, pubkey: string, data: {
    id: string
    startDate: string
    endDate: string
    encryptedReason: string | null
  }) {
    if (data.startDate > data.endDate) {
      throw new ServiceError(400, 'startDate must be before or equal to endDate')
    }

    const [row] = await this.db
      .insert(userAvailabilityBlocks)
      .values({
        id: data.id,
        hubId,
        userPubkey: pubkey,
        startDate: data.startDate,
        endDate: data.endDate,
        encryptedReason: data.encryptedReason,
      })
      .returning()

    return { ...row, createdAt: row.createdAt.toISOString() }
  }

  async delete(hubId: string, id: string, pubkey: string) {
    const [row] = await this.db
      .delete(userAvailabilityBlocks)
      .where(and(
        eq(userAvailabilityBlocks.id, id),
        eq(userAvailabilityBlocks.hubId, hubId),
        eq(userAvailabilityBlocks.userPubkey, pubkey),
      ))
      .returning()
    if (!row) throw new ServiceError(404, 'Availability block not found')
    return { ok: true as const }
  }

  /** Get pubkeys with availability blocks covering a date — used by routing pipeline */
  async getUnavailablePubkeys(hubId: string, date: string): Promise<string[]> {
    const rows = await this.db
      .select({ pubkey: userAvailabilityBlocks.userPubkey })
      .from(userAvailabilityBlocks)
      .where(and(
        eq(userAvailabilityBlocks.hubId, hubId),
        lte(userAvailabilityBlocks.startDate, date),
        gte(userAvailabilityBlocks.endDate, date),
      ))
    return [...new Set(rows.map((r) => r.pubkey))]
  }
}
```

- [ ] **Step 2: Register in services index and commit**

```bash
git add apps/worker/services/shift-availability.ts apps/worker/services/index.ts
git commit -m "feat(EP07): add shift availability blocks service"
```

### Task 18: Shift join/leave requests service

**Files:**
- Create: `apps/worker/services/shift-requests.ts`
- Modify: `apps/worker/services/index.ts`

- [ ] **Step 1: Create the shift requests service**

Create `apps/worker/services/shift-requests.ts`:

```typescript
import { eq, and } from 'drizzle-orm'
import type { Database } from '../db'
import { shiftJoinRequests, shifts, ringGroupMembers } from '../db/schema'
import { ServiceError } from './settings'

export class ShiftRequestsService {
  constructor(private db: Database) {}

  async submit(hubId: string, pubkey: string, data: { shiftId: string; type: 'join' | 'leave' }) {
    const id = crypto.randomUUID()
    const [row] = await this.db
      .insert(shiftJoinRequests)
      .values({
        id,
        hubId,
        shiftId: data.shiftId,
        userPubkey: pubkey,
        type: data.type,
      })
      .returning()

    return { ...row, reviewedAt: null, createdAt: row.createdAt.toISOString() }
  }

  async listPending(hubId: string) {
    const rows = await this.db
      .select()
      .from(shiftJoinRequests)
      .where(and(
        eq(shiftJoinRequests.hubId, hubId),
        eq(shiftJoinRequests.status, 'pending'),
      ))

    return {
      requests: rows.map((r) => ({
        ...r,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  async listMine(hubId: string, pubkey: string) {
    const rows = await this.db
      .select()
      .from(shiftJoinRequests)
      .where(and(
        eq(shiftJoinRequests.hubId, hubId),
        eq(shiftJoinRequests.userPubkey, pubkey),
      ))

    return {
      requests: rows.map((r) => ({
        ...r,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  async review(hubId: string, requestId: string, status: 'approved' | 'denied', reviewerPubkey: string) {
    const [req] = await this.db
      .select()
      .from(shiftJoinRequests)
      .where(and(eq(shiftJoinRequests.id, requestId), eq(shiftJoinRequests.hubId, hubId)))

    if (!req) throw new ServiceError(404, 'Request not found')
    if (req.status !== 'pending') throw new ServiceError(400, 'Request already reviewed')

    // Update request status
    const [updated] = await this.db
      .update(shiftJoinRequests)
      .set({ status, reviewedBy: reviewerPubkey, reviewedAt: new Date() })
      .where(eq(shiftJoinRequests.id, requestId))
      .returning()

    // If approved, apply the change to the shift or ring group
    if (status === 'approved') {
      await this.applyApproval(req)
    }

    return {
      ...updated,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    }
  }

  private async applyApproval(req: typeof shiftJoinRequests.$inferSelect) {
    // Get the shift to check if it uses ring group or direct pubkeys
    const [shift] = await this.db
      .select()
      .from(shifts)
      .where(eq(shifts.id, req.shiftId))

    if (!shift) return // shift was deleted between request and approval

    if (shift.ringGroupId) {
      // Modify ring group membership
      if (req.type === 'join') {
        await this.db
          .insert(ringGroupMembers)
          .values({
            ringGroupId: shift.ringGroupId,
            userPubkey: req.userPubkey,
            addedBy: req.userPubkey, // self-added via approved request
          })
          .onConflictDoNothing()
      } else {
        await this.db
          .delete(ringGroupMembers)
          .where(and(
            eq(ringGroupMembers.ringGroupId, shift.ringGroupId),
            eq(ringGroupMembers.userPubkey, req.userPubkey),
          ))
      }
    } else {
      // Modify shift.userPubkeys directly
      const currentPubkeys = shift.userPubkeys ?? []
      const newPubkeys = req.type === 'join'
        ? [...new Set([...currentPubkeys, req.userPubkey])]
        : currentPubkeys.filter((pk) => pk !== req.userPubkey)

      await this.db
        .update(shifts)
        .set({ userPubkeys: newPubkeys })
        .where(eq(shifts.id, req.shiftId))
    }
  }
}
```

- [ ] **Step 2: Register in services index and commit**

```bash
git add apps/worker/services/shift-requests.ts apps/worker/services/index.ts
git commit -m "feat(EP07): add shift join/leave requests service with approval workflow"
```

### Task 19: Evolve routing pipeline in shifts service

**Files:**
- Modify: `apps/worker/services/shifts.ts`

- [ ] **Step 1: Update ShiftsService constructor to accept new service dependencies**

Update the constructor to accept ring groups, active shifts, overrides, and availability services. Update `getCurrentVolunteers()` to the 6-step pipeline:

```typescript
async getCurrentVolunteers(hubId: string): Promise<string[]> {
  const now = new Date()
  const currentDay = now.getUTCDay()
  const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const todayDate = now.toISOString().split('T')[0]

  // Step 1: Find active shifts for current day/time
  const allShifts = await this.db.select().from(shifts).where(eq(shifts.hubId, hubId))
  let activeShiftRows = allShifts.filter((s) => this.isShiftActive(s, currentDay, currentTime))

  // Step 2: Apply overrides
  if (this.overridesService) {
    const overrides = await this.overridesService.getForDate(hubId, todayDate)
    activeShiftRows = this.applyOverrides(activeShiftRows, overrides)
  }

  // Step 3: Resolve volunteers (ring group or direct pubkeys)
  let pubkeys: string[] = []
  for (const shift of activeShiftRows) {
    if (shift.ringGroupId && this.ringGroupsService) {
      const members = await this.ringGroupsService.resolvePubkeys(shift.ringGroupId)
      pubkeys.push(...members)
    } else {
      pubkeys.push(...(shift.userPubkeys ?? []))
    }
  }
  pubkeys = [...new Set(pubkeys)]

  // Step 4: Filter to clocked-in users with fresh heartbeat
  if (this.activeShiftsService) {
    const livePubkeys = await this.activeShiftsService.getLivePubkeys(hubId)
    pubkeys = pubkeys.filter((pk) => livePubkeys.includes(pk))
  }

  // Step 5: Exclude unavailable users
  if (this.availabilityService) {
    const unavailable = await this.availabilityService.getUnavailablePubkeys(hubId, todayDate)
    pubkeys = pubkeys.filter((pk) => !unavailable.includes(pk))
  }

  // Step 6: Fallback
  if (pubkeys.length === 0 && this.settingsService) {
    const fallback = await this.settingsService.getFallbackGroup(hubId)
    pubkeys = fallback.userPubkeys ?? []
  }

  return pubkeys
}

private applyOverrides(
  activeShifts: (typeof shifts.$inferSelect)[],
  overrides: (typeof shiftOverrides.$inferSelect)[],
): (typeof shifts.$inferSelect)[] {
  const result: (typeof shifts.$inferSelect)[] = []

  for (const shift of activeShifts) {
    // Check for global cancel (shiftId is null)
    const globalCancel = overrides.find((o) => o.shiftId === null && o.type === 'cancel')
    if (globalCancel) continue

    // Check for shift-specific override
    const override = overrides.find((o) => o.shiftId === shift.id)
    if (!override) {
      result.push(shift)
      continue
    }

    if (override.type === 'cancel') continue // skip cancelled shift
    if (override.type === 'substitute' && override.userPubkeys) {
      // Replace shift's users with substitute users
      result.push({ ...shift, userPubkeys: override.userPubkeys, ringGroupId: null })
    }
  }

  return result
}
```

- [ ] **Step 2: Update ShiftsService constructor and createServices() wiring**

In `createServices()`, pass the new services to ShiftsService:

```typescript
const ringGroups = new RingGroupsService(db)
const shiftOverrides = new ShiftOverridesService(db)
const activeShiftsService = new ActiveShiftsService(db)
const shiftAvailability = new ShiftAvailabilityService(db)

const shiftsService = new ShiftsService(db, settings, ringGroups, shiftOverrides, activeShiftsService, shiftAvailability)
```

- [ ] **Step 3: Fix existing shift CRUD methods for encryptedName column rename**

Update `list()`, `create()`, `update()` methods to use `encryptedName` instead of `name`.

- [ ] **Step 4: Update getMyStatus() to return encryptedName + id**

The `getMyStatus()` method should return `id` and `encryptedName` fields instead of plaintext `name`.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: Should resolve most type errors from the column rename.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/shifts.ts apps/worker/services/index.ts
git commit -m "feat(EP07): evolve routing pipeline — overrides, ring groups, clock-in, availability"
```

### Task 20: Add audit event categories

**Files:**
- Modify: `apps/worker/services/audit.ts`

- [ ] **Step 1: Register new audit events**

In `apps/worker/services/audit.ts`, add to `EVENT_CATEGORIES`:

```typescript
shifts: [
  'shiftCreated', 'shiftEdited', 'shiftDeleted',  // existing
  'shiftClockIn', 'shiftClockOut', 'shiftForceClockOut',
  'shiftOverrideCreated', 'shiftOverrideDeleted',
  'shiftJoinRequested', 'shiftJoinApproved', 'shiftJoinDenied',
  'availabilityBlockCreated', 'availabilityBlockDeleted',
  'ringGroupCreated', 'ringGroupUpdated', 'ringGroupDeleted',
  'ringGroupMemberAdded', 'ringGroupMemberRemoved',
],
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/services/audit.ts
git commit -m "feat(EP07): register shift audit events — clock, overrides, requests, ring groups"
```

### Task 21: Add heartbeatTimeout to hub settings

**Files:**
- Modify: `apps/worker/db/schema/settings.ts`

- [ ] **Step 1: Add heartbeatTimeout to ALLOWED_HUB_SETTINGS**

In `apps/worker/db/schema/settings.ts`, add `'heartbeatTimeout'` to the `ALLOWED_HUB_SETTINGS` set.

- [ ] **Step 2: Commit**

```bash
git add apps/worker/db/schema/settings.ts
git commit -m "feat(EP07): add heartbeatTimeout to allowed hub settings"
```

---

## Phase 4: Backend Routes

### Task 22: Ring groups routes

**Files:**
- Create: `apps/worker/routes/ring-groups.ts`
- Modify: `apps/worker/app.ts`

- [ ] **Step 1: Create the ring groups route file**

Create `apps/worker/routes/ring-groups.ts`:

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import {
  ringGroupListResponseSchema,
  ringGroupDetailResponseSchema,
  createRingGroupBodySchema,
  updateRingGroupBodySchema,
  ringGroupMembersBodySchema,
} from '@protocol/schemas/ring-group'
import { okResponseSchema } from '@protocol/schemas/common'

const ringGroups = new Hono<AppEnv>()

// GET / — list ring groups
ringGroups.get('/',
  requirePermission('shifts:manage-ring-groups'),
  describeRoute({ tags: ['Ring Groups'], responses: { 200: { content: { 'application/json': { schema: ringGroupListResponseSchema } } } } }),
  async (c) => {
    const hubId = c.get('hubId')
    const services = c.get('services')
    const result = await services.ringGroups.list(hubId)
    return c.json(result)
  },
)

// POST / — create ring group
ringGroups.post('/',
  requirePermission('shifts:manage-ring-groups'),
  validator('json', createRingGroupBodySchema),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.ringGroups.create(hubId, body)
    await audit(services.audit, 'ringGroupCreated', pubkey, { ringGroupId: result.id }, undefined, hubId)
    return c.json(result, 201)
  },
)

// PATCH /:id — update ring group
ringGroups.patch('/:id',
  requirePermission('shifts:manage-ring-groups'),
  validator('json', updateRingGroupBodySchema),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await services.ringGroups.update(hubId, id, body)
    await audit(services.audit, 'ringGroupUpdated', pubkey, { ringGroupId: id }, undefined, hubId)
    return c.json(result)
  },
)

// DELETE /:id — delete ring group
ringGroups.delete('/:id',
  requirePermission('shifts:manage-ring-groups'),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const result = await services.ringGroups.delete(hubId, id)
    await audit(services.audit, 'ringGroupDeleted', pubkey, { ringGroupId: id }, undefined, hubId)
    return c.json(result)
  },
)

// GET /:id/members — list members
ringGroups.get('/:id/members',
  requirePermission('shifts:manage-ring-groups'),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const services = c.get('services')
    const id = c.req.param('id')
    const result = await services.ringGroups.getMembers(hubId, id)
    return c.json(result)
  },
)

// POST /:id/members — add members
ringGroups.post('/:id/members',
  requirePermission('shifts:manage-ring-groups'),
  validator('json', ringGroupMembersBodySchema),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await services.ringGroups.addMembers(hubId, id, body.pubkeys, pubkey)
    await audit(services.audit, 'ringGroupMemberAdded', pubkey, { ringGroupId: id, added: body.pubkeys }, undefined, hubId)
    return c.json(result)
  },
)

// DELETE /:id/members/:pubkey — remove member
ringGroups.delete('/:id/members/:pubkey',
  requirePermission('shifts:manage-ring-groups'),
  describeRoute({ tags: ['Ring Groups'] }),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const memberPubkey = c.req.param('pubkey')
    const result = await services.ringGroups.removeMember(hubId, id, memberPubkey)
    await audit(services.audit, 'ringGroupMemberRemoved', pubkey, { ringGroupId: id, removed: memberPubkey }, undefined, hubId)
    return c.json(result)
  },
)

export default ringGroups
```

- [ ] **Step 2: Register in app.ts**

In `apps/worker/app.ts`:
1. Add import: `import ringGroupsRoutes from './routes/ring-groups'`
2. Add to both `authenticated` and `hubScoped` sections:
   ```typescript
   authenticated.route('/ring-groups', ringGroupsRoutes)
   hubScoped.route('/ring-groups', ringGroupsRoutes)
   ```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/routes/ring-groups.ts apps/worker/app.ts
git commit -m "feat(EP07): add ring groups API routes"
```

### Task 23: Shift sub-routes — overrides, clock, availability, requests

**Files:**
- Modify: `apps/worker/routes/shifts.ts`

- [ ] **Step 1: Add override routes**

In `apps/worker/routes/shifts.ts`, add after the existing fallback routes:

```typescript
// --- Shift Overrides ---
import {
  shiftOverrideListResponseSchema,
  shiftOverrideResponseSchema,
  createShiftOverrideBodySchema,
  overrideQuerySchema,
} from '@protocol/schemas/shift-override'

shifts.get('/overrides',
  requirePermission('shifts:manage-overrides'),
  validator('query', overrideQuerySchema),
  async (c) => {
    const hubId = c.get('hubId')
    const { from, to } = c.req.valid('query')
    const result = await c.get('services').shiftOverrides.list(hubId, from, to)
    return c.json(result)
  },
)

shifts.post('/overrides',
  requirePermission('shifts:manage-overrides'),
  validator('json', createShiftOverrideBodySchema),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.shiftOverrides.create(hubId, body, pubkey)
    await audit(services.audit, 'shiftOverrideCreated', pubkey, { overrideId: result.id }, undefined, hubId)
    return c.json(result, 201)
  },
)

shifts.delete('/overrides/:id',
  requirePermission('shifts:manage-overrides'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const result = await services.shiftOverrides.delete(hubId, id)
    await audit(services.audit, 'shiftOverrideDeleted', pubkey, { overrideId: id }, undefined, hubId)
    return c.json(result)
  },
)
```

- [ ] **Step 2: Add clock-in/out routes**

```typescript
// --- Clock In/Out ---
import { clockStatusResponseSchema } from '@protocol/schemas/shifts'

shifts.post('/clock/in',
  requirePermission('shifts:read-own'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const result = await services.activeShifts.clockIn(hubId, pubkey)
    await audit(services.audit, 'shiftClockIn', pubkey, {}, undefined, hubId)
    return c.json(result)
  },
)

shifts.post('/clock/out',
  requirePermission('shifts:read-own'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const result = await services.activeShifts.clockOut(hubId, pubkey)
    await audit(services.audit, 'shiftClockOut', pubkey, {}, undefined, hubId)
    return c.json(result)
  },
)

shifts.get('/clock/status',
  requirePermission('shifts:read'),
  async (c) => {
    const hubId = c.get('hubId')
    const result = await c.get('services').activeShifts.getStatus(hubId)
    return c.json(result)
  },
)

shifts.delete('/clock/:pubkey',
  requirePermission('shifts:update'),
  async (c) => {
    const hubId = c.get('hubId')
    const actorPubkey = c.get('pubkey')
    const services = c.get('services')
    const targetPubkey = c.req.param('pubkey')
    const result = await services.activeShifts.forceClockOut(hubId, targetPubkey)
    await audit(services.audit, 'shiftForceClockOut', actorPubkey, { targetPubkey }, undefined, hubId)
    return c.json(result)
  },
)
```

- [ ] **Step 3: Add availability routes**

```typescript
// --- Availability Blocks ---
import {
  availabilityBlockListResponseSchema,
  availabilityBlockResponseSchema,
  createAvailabilityBlockBodySchema,
} from '@protocol/schemas/shift-availability'

shifts.get('/availability',
  requirePermission('shifts:set-availability'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const result = await c.get('services').shiftAvailability.listMine(hubId, pubkey)
    return c.json(result)
  },
)

shifts.get('/availability/all',
  requirePermission('shifts:read'),
  async (c) => {
    const hubId = c.get('hubId')
    const result = await c.get('services').shiftAvailability.listAll(hubId)
    return c.json(result)
  },
)

shifts.post('/availability',
  requirePermission('shifts:set-availability'),
  validator('json', createAvailabilityBlockBodySchema),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.shiftAvailability.create(hubId, pubkey, body)
    await audit(services.audit, 'availabilityBlockCreated', pubkey, { blockId: result.id }, undefined, hubId)
    return c.json(result, 201)
  },
)

shifts.delete('/availability/:id',
  requirePermission('shifts:set-availability'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const result = await services.shiftAvailability.delete(hubId, id, pubkey)
    await audit(services.audit, 'availabilityBlockDeleted', pubkey, { blockId: id }, undefined, hubId)
    return c.json(result)
  },
)
```

- [ ] **Step 4: Add join/leave request routes**

```typescript
// --- Shift Join/Leave Requests ---
import {
  shiftJoinRequestListResponseSchema,
  shiftJoinRequestResponseSchema,
  createShiftJoinRequestBodySchema,
  reviewShiftJoinRequestBodySchema,
} from '@protocol/schemas/shift-request'

shifts.post('/requests',
  requirePermission('shifts:request-join'),
  validator('json', createShiftJoinRequestBodySchema),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.shiftRequests.submit(hubId, pubkey, body)
    await audit(services.audit, 'shiftJoinRequested', pubkey, { requestId: result.id, type: body.type }, undefined, hubId)
    return c.json(result, 201)
  },
)

shifts.get('/requests',
  requirePermission('shifts:approve-requests'),
  async (c) => {
    const hubId = c.get('hubId')
    const result = await c.get('services').shiftRequests.listPending(hubId)
    return c.json(result)
  },
)

shifts.get('/requests/mine',
  requirePermission('shifts:request-join'),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const result = await c.get('services').shiftRequests.listMine(hubId, pubkey)
    return c.json(result)
  },
)

shifts.patch('/requests/:id',
  requirePermission('shifts:approve-requests'),
  validator('json', reviewShiftJoinRequestBodySchema),
  async (c) => {
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await services.shiftRequests.review(hubId, id, body.status, pubkey)
    const eventName = body.status === 'approved' ? 'shiftJoinApproved' : 'shiftJoinDenied'
    await audit(services.audit, eventName, pubkey, { requestId: id }, undefined, hubId)
    return c.json(result)
  },
)
```

- [ ] **Step 5: Fix existing my-status and CRUD routes for encryptedName**

In the `createEntityRouter` config at the bottom of shifts.ts:
- `createShiftBodySchema` and `updateShiftBodySchema` already updated in Task 7 to use `encryptedName`
- Verify the entity router config still works with the renamed field

In the `GET /my-status` handler:
- Replace `name: shift.name` with `encryptedName: shift.encryptedName` in the response construction
- Add `id: shift.id` to both `currentShift` and `nextShift` objects
- The client decrypts `encryptedName` using hub key

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/worker/routes/shifts.ts
git commit -m "feat(EP07): add override, clock, availability, and request routes to shifts"
```

### Task 24: WebSocket heartbeat handler

**Files:**
- Modify: WebSocket handler file (find via `grep -r 'shift:heartbeat\|onMessage\|ws.*event' apps/worker/lib/`)

- [ ] **Step 1: Add shift:heartbeat handler to the WebSocket message dispatcher**

In the WebSocket message handler, add a case for `shift:heartbeat`:

```typescript
case 'shift:heartbeat': {
  const services = getServices() // however services are accessed in the WS context
  await services.activeShifts.heartbeat(hubId, pubkey)
  break
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(EP07): add WebSocket shift:heartbeat handler"
```

### Task 24b: Schedule periodic heartbeat cleanup job

**Files:**
- Modify: `apps/worker/services/scheduler.ts` (or wherever periodic jobs are registered)

- [ ] **Step 1: Register a periodic cleanup job**

In the task scheduler or server startup, add a 5-minute interval job that calls `services.activeShifts.cleanupStale()`:

```typescript
// In server startup or scheduler initialization:
setInterval(async () => {
  try {
    const { cleaned } = await services.activeShifts.cleanupStale()
    if (cleaned > 0) {
      console.log(`[heartbeat-cleanup] Removed ${cleaned} stale active shift records`)
    }
  } catch (err) {
    console.error('[heartbeat-cleanup] Failed:', err)
  }
}, 5 * 60 * 1000) // 5 minutes
```

The cleanup timeout should read from hub settings (`heartbeatTimeout`) if available, falling back to the 90s default. Since cleanup is cross-hub, use the default timeout — per-hub timeouts are applied at routing time by `getLivePubkeys()`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(EP07): schedule periodic heartbeat cleanup job (every 5 minutes)"
```

### Task 24c: Add WebSocket event publishing for shift state changes

**Files:**
- Modify: `apps/worker/routes/shifts.ts`
- Modify: `apps/worker/routes/ring-groups.ts`

- [ ] **Step 1: Publish WebSocket events from shift route handlers**

After audit logging in each mutation handler, publish a WebSocket event to the hub's connected clients. Use the existing WS event publishing pattern (e.g., `encryptEventContent` or direct relay push):

In clock-in/out handlers (Task 23):
```typescript
// After clockIn audit:
await publishHubEvent(hubId, { type: 'shift:clockIn', pubkey })
// After clockOut audit:
await publishHubEvent(hubId, { type: 'shift:clockOut', pubkey })
```

In override handlers:
```typescript
await publishHubEvent(hubId, { type: 'shift:overrideCreated', overrideId: result.id })
```

In request handlers:
```typescript
// On submit:
await publishHubEvent(hubId, { type: 'shift:requestReceived', requestId: result.id })
// On review:
await publishHubEvent(hubId, { type: 'shift:requestReviewed', requestId: id, status: body.status })
```

The exact publishing mechanism depends on how other WS events are published — check the existing `publishHubEvent` or equivalent function in `apps/worker/lib/ws-events.ts`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(EP07): publish WebSocket events for shift state changes"
```

---

## Phase 5: Backend BDD Tests

### Task 25: Write BDD feature files for new shift features

**Files:**
- Create: `packages/test-specs/features/shifts/ring-groups.feature`
- Create: `packages/test-specs/features/shifts/clock-in.feature`
- Create: `packages/test-specs/features/shifts/overrides.feature`
- Create: `packages/test-specs/features/shifts/availability.feature`
- Create: `packages/test-specs/features/shifts/requests.feature`
- Create: `packages/test-specs/features/shifts/routing-pipeline.feature`

- [ ] **Step 1: Write ring group BDD scenarios**

Create `packages/test-specs/features/shifts/ring-groups.feature`:

```gherkin
@backend
Feature: Ring Group Management

  Background:
    Given an authenticated admin user

  Scenario: Create a ring group
    When I create a ring group with an encrypted name
    Then the ring group should appear in the list
    And it should have 0 members

  Scenario: Add members to a ring group
    Given a ring group exists
    When I add 3 members to the ring group
    Then the ring group should have 3 members

  Scenario: Remove a member from a ring group
    Given a ring group exists with 3 members
    When I remove one member
    Then the ring group should have 2 members

  Scenario: Delete a ring group
    Given a ring group exists
    When I delete the ring group
    Then the ring group should not appear in the list

  Scenario: Cannot delete a ring group referenced by a shift
    Given a ring group exists
    And a shift references that ring group
    When I try to delete the ring group
    Then I should receive a 409 conflict error
```

- [ ] **Step 2: Write clock-in BDD scenarios**

Create `packages/test-specs/features/shifts/clock-in.feature`:

```gherkin
@backend
Feature: Clock In/Out

  Background:
    Given an authenticated volunteer user

  Scenario: Clock in
    When I clock in
    Then I should appear in the clock status list

  Scenario: Clock out
    Given I am clocked in
    When I clock out
    Then I should not appear in the clock status list

  Scenario: Admin force clock out
    Given a volunteer is clocked in
    When an admin force clocks out the volunteer
    Then the volunteer should not appear in the clock status list
```

- [ ] **Step 3: Write override, availability, request, and routing pipeline BDD scenarios**

Follow the same pattern for each feature file. Key scenarios:

**overrides.feature**: Create cancel override, create substitute override, delete override, global cancel (null shiftId)

**availability.feature**: Create availability block, list own blocks, admin sees all blocks, delete own block

**requests.feature**: Submit join request, submit leave request, approve request adds user to shift, deny request, cannot review already-reviewed request

**routing-pipeline.feature**: Integration test — create shift, create override, clock in, verify getCurrentVolunteers returns correct users through each pipeline step

- [ ] **Step 4: Commit**

```bash
git add packages/test-specs/features/shifts/
git commit -m "test(EP07): add BDD feature files for ring groups, clock-in, overrides, availability, requests, routing"
```

### Task 26: Write backend BDD step definitions

**Files:**
- Create: `tests/steps/backend/shifts.steps.ts`
- Create: `tests/api-helpers/shifts.ts`

- [ ] **Step 1: Create API helper functions**

Create `tests/api-helpers/shifts.ts` with typed helpers for all new endpoints:

```typescript
import type { APIRequestContext } from '@playwright/test'

export async function createRingGroupViaApi(request: APIRequestContext, data: { id: string; encryptedName: string; hubId: string }) {
  const res = await request.post(`/api/hubs/${data.hubId}/ring-groups`, {
    data: { id: data.id, encryptedName: data.encryptedName },
  })
  return { status: res.status(), body: await res.json() }
}

export async function listRingGroupsViaApi(request: APIRequestContext, hubId: string) {
  const res = await request.get(`/api/hubs/${hubId}/ring-groups`)
  return { status: res.status(), body: await res.json() }
}

export async function deleteRingGroupViaApi(request: APIRequestContext, hubId: string, id: string) {
  const res = await request.delete(`/api/hubs/${hubId}/ring-groups/${id}`)
  return { status: res.status(), body: await res.json() }
}

export async function addRingGroupMembersViaApi(request: APIRequestContext, hubId: string, ringGroupId: string, pubkeys: string[]) {
  const res = await request.post(`/api/hubs/${hubId}/ring-groups/${ringGroupId}/members`, {
    data: { pubkeys },
  })
  return { status: res.status(), body: await res.json() }
}

export async function clockInViaApi(request: APIRequestContext, hubId: string) {
  const res = await request.post(`/api/hubs/${hubId}/shifts/clock/in`)
  return { status: res.status(), body: await res.json() }
}

export async function clockOutViaApi(request: APIRequestContext, hubId: string) {
  const res = await request.post(`/api/hubs/${hubId}/shifts/clock/out`)
  return { status: res.status(), body: await res.json() }
}

export async function getClockStatusViaApi(request: APIRequestContext, hubId: string) {
  const res = await request.get(`/api/hubs/${hubId}/shifts/clock/status`)
  return { status: res.status(), body: await res.json() }
}

// ... similar helpers for overrides, availability, requests
```

- [ ] **Step 2: Create step definitions**

Create `tests/steps/backend/shifts.steps.ts` implementing all the Given/When/Then steps from the feature files. Follow the pattern in `tests/steps/backend/admin.steps.ts` — use the fixture `world` for scenario state, `request` for API calls.

- [ ] **Step 3: Run backend BDD tests**

Run: `bun run test:backend:bdd -- --grep "Ring Group\|Clock In\|Override\|Availability\|Request\|Routing"`
Expected: All new scenarios PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/steps/backend/shifts.steps.ts tests/api-helpers/shifts.ts
git commit -m "test(EP07): add backend BDD step definitions and API helpers"
```

---

## Phase 6: i18n Strings

### Task 27: Add i18n keys for new shift features

**Files:**
- Modify: `packages/i18n/locales/en.json`

- [ ] **Step 1: Add new string keys**

In `packages/i18n/locales/en.json`, add under appropriate sections:

```json
"ringGroups": {
  "title": "Ring Groups",
  "create": "Create Ring Group",
  "edit": "Edit Ring Group",
  "delete": "Delete Ring Group",
  "name": "Group Name",
  "members": "Members",
  "memberCount": "{{count}} members",
  "addMembers": "Add Members",
  "removeMember": "Remove Member",
  "deleteConfirm": "Delete this ring group? This cannot be undone.",
  "deleteBlocked": "Cannot delete ring group while it is assigned to a shift.",
  "empty": "No ring groups yet"
},
"shiftOverrides": {
  "title": "Overrides",
  "create": "Create Override",
  "cancel": "Cancel Shift",
  "substitute": "Substitute Volunteers",
  "allShifts": "All Shifts",
  "date": "Date",
  "type": "Override Type",
  "note": "Note (optional)",
  "replacementVolunteers": "Replacement Volunteers",
  "deleteConfirm": "Remove this override?",
  "empty": "No overrides in this date range"
},
"availability": {
  "title": "Availability",
  "markUnavailable": "Mark Unavailable",
  "startDate": "Start Date",
  "endDate": "End Date",
  "reason": "Reason (optional)",
  "myBlocks": "My Unavailable Dates",
  "allBlocks": "All Availability",
  "deleteConfirm": "Remove this availability block?",
  "empty": "No availability blocks"
},
"shiftRequests": {
  "title": "Requests",
  "requestJoin": "Request to Join",
  "requestLeave": "Request to Leave",
  "pending": "Pending",
  "approved": "Approved",
  "denied": "Denied",
  "approve": "Approve",
  "deny": "Deny",
  "myRequests": "My Requests",
  "pendingRequests": "Pending Requests",
  "empty": "No pending requests"
},
"shifts": {
  ... // existing keys stay, add:
  "clockIn": "Go Online",
  "clockOut": "Go Offline",
  "online": "Online",
  "offline": "Offline",
  "onlineStatus": "Online — {{shiftName}}",
  "clockedInUsers": "Clocked In",
  "forceClockOut": "Force Offline",
  "schedule": "Schedule",
  "mySchedule": "My Schedule",
  "nextDays": "Next 7 Days",
  "weeklyView": "Weekly View",
  "ringGroup": "Ring Group",
  "assignRingGroup": "Assign Ring Group",
  "directAssignment": "Direct Assignment"
}
```

- [ ] **Step 2: Run i18n codegen**

Run: `bun run i18n:codegen`
Expected: Generates iOS `.strings` and Android `strings.xml` + `I18n.kt`.

- [ ] **Step 3: Run i18n validation**

Run: `bun run i18n:validate:all`
Expected: PASS (new keys exist in en.json, other locales will need translations later).

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(EP07): add i18n keys for ring groups, overrides, availability, requests, clock-in/out"
```

---

## Phase 7: Desktop — API Client & React Query

### Task 28: Desktop API client functions

**Files:**
- Create: `src/client/lib/api/shifts.ts`

- [ ] **Step 1: Create typed API functions**

Create `src/client/lib/api/shifts.ts` with all shift-domain API functions:

```typescript
import { request } from '../api'
import type { z } from 'zod/v4'
import type {
  shiftResponseSchema,
  shiftListResponseSchema,
  myStatusResponseSchema,
  clockStatusResponseSchema,
} from '@protocol/schemas/shifts'
import type { ringGroupListResponseSchema, ringGroupDetailResponseSchema } from '@protocol/schemas/ring-group'
import type { shiftOverrideListResponseSchema, shiftOverrideResponseSchema } from '@protocol/schemas/shift-override'
import type { availabilityBlockListResponseSchema, availabilityBlockResponseSchema } from '@protocol/schemas/shift-availability'
import type { shiftJoinRequestListResponseSchema, shiftJoinRequestResponseSchema } from '@protocol/schemas/shift-request'

type ShiftListResponse = z.infer<typeof shiftListResponseSchema>
type ShiftResponse = z.infer<typeof shiftResponseSchema>
type MyStatusResponse = z.infer<typeof myStatusResponseSchema>
type ClockStatusResponse = z.infer<typeof clockStatusResponseSchema>
type RingGroupListResponse = z.infer<typeof ringGroupListResponseSchema>
type RingGroupDetailResponse = z.infer<typeof ringGroupDetailResponseSchema>
type OverrideListResponse = z.infer<typeof shiftOverrideListResponseSchema>
type OverrideResponse = z.infer<typeof shiftOverrideResponseSchema>
type AvailabilityListResponse = z.infer<typeof availabilityBlockListResponseSchema>
type AvailabilityResponse = z.infer<typeof availabilityBlockResponseSchema>
type RequestListResponse = z.infer<typeof shiftJoinRequestListResponseSchema>
type RequestResponse = z.infer<typeof shiftJoinRequestResponseSchema>

// Shifts
export const listShifts = () => request<ShiftListResponse>('/shifts')
export const createShift = (data: Record<string, unknown>) =>
  request<ShiftResponse>('/shifts', { method: 'POST', body: JSON.stringify(data) })
export const updateShift = (id: string, data: Record<string, unknown>) =>
  request<ShiftResponse>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteShift = (id: string) =>
  request<{ ok: true }>(`/shifts/${id}`, { method: 'DELETE' })
export const getMyShiftStatus = () => request<MyStatusResponse>('/shifts/my-status')
export const getFallbackGroup = () => request<{ userPubkeys: string[] }>('/shifts/fallback')
export const setFallbackGroup = (userPubkeys: string[]) =>
  request<{ ok: true }>('/shifts/fallback', { method: 'PUT', body: JSON.stringify({ userPubkeys }) })

// Ring Groups
export const listRingGroups = () => request<RingGroupListResponse>('/ring-groups')
export const createRingGroup = (data: { id: string; encryptedName: string }) =>
  request<Record<string, unknown>>('/ring-groups', { method: 'POST', body: JSON.stringify(data) })
export const updateRingGroup = (id: string, data: { encryptedName: string }) =>
  request<Record<string, unknown>>(`/ring-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRingGroup = (id: string) =>
  request<{ ok: true }>(`/ring-groups/${id}`, { method: 'DELETE' })
export const getRingGroupMembers = (id: string) =>
  request<RingGroupDetailResponse>(`/ring-groups/${id}/members`)
export const addRingGroupMembers = (id: string, pubkeys: string[]) =>
  request<{ ok: true }>(`/ring-groups/${id}/members`, { method: 'POST', body: JSON.stringify({ pubkeys }) })
export const removeRingGroupMember = (id: string, pubkey: string) =>
  request<{ ok: true }>(`/ring-groups/${id}/members/${pubkey}`, { method: 'DELETE' })

// Overrides
export const listOverrides = (from: string, to: string) =>
  request<OverrideListResponse>(`/shifts/overrides?from=${from}&to=${to}`)
export const createOverride = (data: Record<string, unknown>) =>
  request<OverrideResponse>('/shifts/overrides', { method: 'POST', body: JSON.stringify(data) })
export const deleteOverride = (id: string) =>
  request<{ ok: true }>(`/shifts/overrides/${id}`, { method: 'DELETE' })

// Clock
export const clockIn = () => request<{ ok: true }>('/shifts/clock/in', { method: 'POST' })
export const clockOut = () => request<{ ok: true }>('/shifts/clock/out', { method: 'POST' })
export const getClockStatus = () => request<ClockStatusResponse>('/shifts/clock/status')
export const forceClockOut = (pubkey: string) =>
  request<{ ok: true }>(`/shifts/clock/${pubkey}`, { method: 'DELETE' })

// Availability
export const listMyAvailability = () => request<AvailabilityListResponse>('/shifts/availability')
export const listAllAvailability = () => request<AvailabilityListResponse>('/shifts/availability/all')
export const createAvailabilityBlock = (data: Record<string, unknown>) =>
  request<AvailabilityResponse>('/shifts/availability', { method: 'POST', body: JSON.stringify(data) })
export const deleteAvailabilityBlock = (id: string) =>
  request<{ ok: true }>(`/shifts/availability/${id}`, { method: 'DELETE' })

// Requests
export const submitShiftRequest = (data: { shiftId: string; type: 'join' | 'leave' }) =>
  request<RequestResponse>('/shifts/requests', { method: 'POST', body: JSON.stringify(data) })
export const listPendingRequests = () => request<RequestListResponse>('/shifts/requests')
export const listMyRequests = () => request<RequestListResponse>('/shifts/requests/mine')
export const reviewShiftRequest = (id: string, status: 'approved' | 'denied') =>
  request<RequestResponse>(`/shifts/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
```

- [ ] **Step 2: Commit**

```bash
git add src/client/lib/api/shifts.ts
git commit -m "feat(EP07): add desktop API client functions for all shift endpoints"
```

### Task 29: React Query hooks

**Files:**
- Create: `src/client/lib/queries/shifts.ts`
- Modify: `src/client/lib/hooks.ts` (remove old useShiftStatus)

- [ ] **Step 1: Create comprehensive React Query hooks file**

Create `src/client/lib/queries/shifts.ts` with all query and mutation hooks. Follow the pattern established in v1 (`/home/rikki/projects/llamenos-hotline/src/client/lib/queries/shifts.ts`).

Include:
- All 11 query hooks from the spec (useShifts, useShiftStatus, useFallbackGroup, useRingGroups, useRingGroupMembers, useShiftOverrides, useAvailabilityBlocks, useAllAvailabilityBlocks, useShiftJoinRequests, useMyShiftJoinRequests, useClockStatus)
- All mutation hooks with proper cache invalidation
- Hub-key decryption in query hooks for encrypted fields (shift names, ring group names, override notes, availability reasons)
- Optimistic updates for clock in/out, availability block delete, request approve/deny
- Query key factory for structured key management

Key structure:

```typescript
export const shiftKeys = {
  all: (hubId: string) => ['shifts', hubId] as const,
  list: (hubId: string) => ['shifts', hubId, 'list'] as const,
  myStatus: (hubId: string) => ['shifts', hubId, 'my-status'] as const,
  fallback: (hubId: string) => ['shifts', hubId, 'fallback'] as const,
  overrides: (hubId: string, from: string, to: string) => ['shifts', hubId, 'overrides', { from, to }] as const,
  clockStatus: (hubId: string) => ['shifts', hubId, 'clock-status'] as const,
}

export const ringGroupKeys = {
  all: (hubId: string) => ['ring-groups', hubId] as const,
  list: (hubId: string) => ['ring-groups', hubId, 'list'] as const,
  members: (hubId: string, rgId: string) => ['ring-groups', hubId, rgId, 'members'] as const,
}

export const availabilityKeys = {
  mine: (hubId: string) => ['availability', hubId, 'mine'] as const,
  all: (hubId: string) => ['availability', hubId, 'all'] as const,
}

export const requestKeys = {
  pending: (hubId: string) => ['shift-requests', hubId, 'pending'] as const,
  mine: (hubId: string) => ['shift-requests', hubId, 'mine'] as const,
}
```

Each query hook calls the corresponding API function, applies decryption where needed, and sets the appropriate stale time per the spec.

Each mutation hook calls `queryClient.invalidateQueries()` on success per the invalidation map in the spec.

Add a `useShiftWebSocketEvents(hubId)` hook that subscribes to WebSocket events and invalidates the appropriate query keys:

```typescript
export function useShiftWebSocketEvents(hubId: string) {
  const queryClient = useQueryClient()

  useRelaySubscription(hubId, SHIFT_EVENT_KINDS, (_kind, content) => {
    switch (content.type) {
      case 'shift:clockIn':
      case 'shift:clockOut':
        queryClient.invalidateQueries({ queryKey: shiftKeys.clockStatus(hubId) })
        queryClient.invalidateQueries({ queryKey: shiftKeys.myStatus(hubId) })
        break
      case 'shift:overrideCreated':
        queryClient.invalidateQueries({ queryKey: ['shifts', hubId, 'overrides'] })
        queryClient.invalidateQueries({ queryKey: shiftKeys.myStatus(hubId) })
        break
      case 'shift:requestReceived':
        queryClient.invalidateQueries({ queryKey: requestKeys.pending(hubId) })
        break
      case 'shift:requestReviewed':
        queryClient.invalidateQueries({ queryKey: requestKeys.mine(hubId) })
        queryClient.invalidateQueries({ queryKey: shiftKeys.list(hubId) })
        break
    }
  })
}
```

This hook should be called in the shifts page component so WS-driven invalidation is active while viewing shifts.

- [ ] **Step 2: Remove old useShiftStatus from hooks.ts**

In `src/client/lib/hooks.ts`, remove the imperative `useShiftStatus()` hook (it's replaced by the React Query version in `queries/shifts.ts`).

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: May show errors in shifts.tsx (consuming the old hook) — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add src/client/lib/queries/shifts.ts src/client/lib/hooks.ts
git commit -m "feat(EP07): add React Query hooks for shifts — queries, mutations, cache invalidation"
```

---

## Phase 8: Desktop UI

### Task 30: Rewrite shifts page with tabbed layout

**Files:**
- Modify: `src/client/routes/shifts.tsx`

- [ ] **Step 1: Replace the current shifts page with the tabbed layout**

Rewrite `src/client/routes/shifts.tsx` to use Tabs (shadcn) with 4 tabs:
1. **Schedule** — weekly calendar + shift cards + create button
2. **Ring Groups** — list, expand for members, CRUD
3. **Overrides** — date range filter, create/delete
4. **Requests** — pending list with approve/deny, badge count

Plus volunteer-facing elements visible to all:
- Clock in/out toggle in header
- My Schedule card
- Availability block management

Port from the v1 patterns in `/home/rikki/projects/llamenos-hotline/src/client/routes/shifts.tsx`, adapting to use:
- React Query hooks from `src/client/lib/queries/shifts.ts`
- Hub-key encryption via `platform.ts` (encryptHubField/decryptHubField)
- Client UUID pre-generation for AAD binding
- i18n via `useTranslation()` for all strings
- Test IDs for Playwright (data-testid attributes)

The page should be permission-aware:
- Volunteer-facing elements (clock, my schedule, availability, join requests) visible to all
- Admin tabs (schedule management, ring groups, overrides, request approval) gated by appropriate permissions

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Test manually with dev server**

Run: `bun run dev`
Navigate to shifts page, verify tabbed layout renders.

- [ ] **Step 4: Commit**

```bash
git add src/client/routes/shifts.tsx
git commit -m "feat(EP07): rewrite shifts page — tabbed admin, clock-in, availability, React Query"
```

### Task 31: Add test IDs and page objects for new shift UI

**Files:**
- Modify: `tests/test-ids.ts`
- Modify: `tests/pages/index.ts`

- [ ] **Step 1: Add new test IDs**

In `tests/test-ids.ts`, add:

```typescript
// Ring Groups
RING_GROUP_LIST: 'ring-group-list',
RING_GROUP_CARD: 'ring-group-card',
RING_GROUP_CREATE_BTN: 'ring-group-create-btn',
RING_GROUP_NAME_INPUT: 'ring-group-name-input',
RING_GROUP_DELETE_BTN: 'ring-group-delete-btn',
RING_GROUP_MEMBERS: 'ring-group-members',

// Overrides
OVERRIDE_LIST: 'override-list',
OVERRIDE_CREATE_BTN: 'override-create-btn',
OVERRIDE_TYPE_SELECT: 'override-type-select',
OVERRIDE_DATE_INPUT: 'override-date-input',
OVERRIDE_DELETE_BTN: 'override-delete-btn',

// Clock
CLOCK_TOGGLE_BTN: 'clock-toggle-btn',
CLOCK_STATUS_INDICATOR: 'clock-status-indicator',
CLOCK_STATUS_LIST: 'clock-status-list',

// Availability
AVAILABILITY_LIST: 'availability-list',
AVAILABILITY_CREATE_BTN: 'availability-create-btn',
AVAILABILITY_START_DATE: 'availability-start-date',
AVAILABILITY_END_DATE: 'availability-end-date',
AVAILABILITY_DELETE_BTN: 'availability-delete-btn',

// Requests
REQUEST_LIST: 'request-list',
REQUEST_JOIN_BTN: 'request-join-btn',
REQUEST_LEAVE_BTN: 'request-leave-btn',
REQUEST_APPROVE_BTN: 'request-approve-btn',
REQUEST_DENY_BTN: 'request-deny-btn',
REQUEST_BADGE: 'request-badge',

// Shift tabs
SHIFT_TAB_SCHEDULE: 'shift-tab-schedule',
SHIFT_TAB_RING_GROUPS: 'shift-tab-ring-groups',
SHIFT_TAB_OVERRIDES: 'shift-tab-overrides',
SHIFT_TAB_REQUESTS: 'shift-tab-requests',
```

- [ ] **Step 2: Add page objects**

In `tests/pages/index.ts`, add `RingGroupPage`, `OverridePage`, `ClockPage`, `AvailabilityPage`, `RequestPage` objects with methods for common test actions.

- [ ] **Step 3: Commit**

```bash
git add tests/test-ids.ts tests/pages/index.ts
git commit -m "test(EP07): add test IDs and page objects for shift management UI"
```

### Task 32: Desktop E2E tests for new shift features

**Files:**
- Modify: `packages/test-specs/features/admin/shift-management.feature`
- Modify: `tests/steps/shifts/shift-steps.ts`

- [ ] **Step 1: Add desktop BDD scenarios for new features**

Add `@desktop` tagged scenarios to the shift management feature file for:
- Ring group CRUD via UI
- Override creation (cancel, substitute) via UI
- Clock in/out toggle
- Availability block creation and deletion
- Shift join request submission

- [ ] **Step 2: Implement desktop step definitions**

Add step implementations in `tests/steps/shifts/shift-steps.ts` using page objects and test IDs.

- [ ] **Step 3: Run desktop E2E tests**

Run: `bun run test -- --grep "shift"`
Expected: All scenarios PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/test-specs/features/admin/shift-management.feature tests/steps/shifts/
git commit -m "test(EP07): add desktop E2E tests for ring groups, overrides, clock-in, availability, requests"
```

---

## Phase 9: iOS

### Task 33: iOS shift schedule and clock-in views

**Files:**
- Create: `apps/ios/Sources/Views/Shifts/ShiftScheduleView.swift`
- Create: `apps/ios/Sources/Views/Shifts/ShiftDetailView.swift`
- Create: `apps/ios/Sources/Views/Shifts/AvailabilityBlockSheet.swift`
- Create: `apps/ios/Sources/Views/Shifts/ShiftStatusCard.swift`

- [ ] **Step 1: Create ShiftScheduleView**

SwiftUI view showing:
- Clock in/out button (prominent, top)
- Status banner (online/offline + current shift name)
- Next 7 days with assigned shifts as cards
- Availability section with blocks list + "Add" button
- My pending requests

Uses codegen'd types from `packages/protocol/generated/swift/`.
Decrypts shift names via `CryptoService.decryptHubField()`.
All strings from i18n codegen.

- [ ] **Step 2: Create ShiftDetailView**

Shows shift info, volunteers/ring group, join/leave request button.

- [ ] **Step 3: Create AvailabilityBlockSheet**

Date range picker + optional encrypted reason.

- [ ] **Step 4: Create ShiftStatusCard for dashboard**

Shows current/next shift and online status on the hub dashboard.

- [ ] **Step 5: Run iOS build**

Run: `bun run ios:build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Shifts/
git commit -m "feat(EP07): add iOS shift schedule, detail, availability, and status card views"
```

### Task 34: iOS admin shift views

**Files:**
- Create: `apps/ios/Sources/Views/Shifts/ShiftAdminView.swift`
- Create: `apps/ios/Sources/Views/Shifts/RingGroupAdminView.swift`
- Create: `apps/ios/Sources/Views/Shifts/OverrideAdminView.swift`
- Create: `apps/ios/Sources/Views/Shifts/RequestApprovalView.swift`

- [ ] **Step 1: Create ShiftAdminView with NavigationStack tabs**

Tabbed admin view: Shifts / Ring Groups / Overrides / Requests.
Shift CRUD with encrypted names.
Permission-gated (only visible to users with admin shift permissions).

- [ ] **Step 2: Create RingGroupAdminView, OverrideAdminView, RequestApprovalView**

Each view implements full CRUD for its domain.

- [ ] **Step 3: Run iOS tests**

Run: `bun run ios:test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Shifts/
git commit -m "feat(EP07): add iOS admin shift views — ring groups, overrides, request approval"
```

---

## Phase 10: Android

### Task 35: Android shift schedule and clock-in screens

**Files:**
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftScheduleScreen.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftDetailScreen.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/AvailabilityBlockDialog.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftStatusCard.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftScheduleViewModel.kt`

- [ ] **Step 1: Create ShiftScheduleScreen**

`@Composable` with Hilt-injected ViewModel. Shows:
- Clock in/out button (Material 3 FAB or prominent button)
- Status banner
- Next 7 days shift cards
- Availability section
- My pending requests

Uses codegen'd `@Serializable` data classes.
Decrypts via `CryptoService.decryptHubField()` through JNI.
All strings from `I18n.kt` codegen.

- [ ] **Step 2: Create ShiftDetailScreen, AvailabilityBlockDialog, ShiftStatusCard**

Follow Compose patterns established in the Android codebase.

- [ ] **Step 3: Create ShiftScheduleViewModel**

Hilt-injected ViewModel managing shift list, status, clock state, availability blocks.

- [ ] **Step 4: Run Android tests**

Run: `bun run test:android`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/
git commit -m "feat(EP07): add Android shift schedule, detail, availability, and status card screens"
```

### Task 36: Android admin shift screens

**Files:**
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftAdminScreen.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/RingGroupViewModel.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftOverrideViewModel.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftRequestViewModel.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/ShiftAdminViewModel.kt`

- [ ] **Step 1: Create ShiftAdminScreen with TabRow + HorizontalPager**

Four tabs: Shifts, Ring Groups, Overrides, Requests.
Each tab delegates to its own composable with ViewModel.

- [ ] **Step 2: Create ViewModels**

One ViewModel per admin domain (ring groups, overrides, requests).

- [ ] **Step 3: Run Android tests**

Run: `bun run test:android`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/kotlin/org/llamenos/hotline/ui/shifts/
git commit -m "feat(EP07): add Android admin shift screens — ring groups, overrides, request approval"
```

---

## Phase 11: Update Epic Index

### Task 37: Update the v1→v2 epic index

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-v1-port-epic-index.md`

- [ ] **Step 1: Update EP07 status**

Change EP07 row from `Stub` to `Implemented`:

```markdown
| EP07 | [Shift Management](2026-05-11-EP07-shift-management-design.md) | 2 | EP01, EP03 | Implemented |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-11-v1-port-epic-index.md
git commit -m "docs(EP07): mark shift management as implemented in epic index"
```

---

## Dependency Graph

```
Task 1 (permissions)  ──┐
Task 2 (crypto labels) ─┤
                        ├─→ Tasks 3-7 (protocol schemas) ──→ Tasks 8-13 (DB schema) ──→ Tasks 14-21 (services)
                        │                                                                       │
                        │                                                                       ▼
                        │                                                              Tasks 22-24 (routes + WS heartbeat)
                        │                                                                       │
                        │                                                                       ▼
                        │                                                              Task 24b (cleanup job) + 24c (WS events)
                        │                                                                       │
                        │                                                                       ▼
                        │                                                              Tasks 25-26 (BDD tests)
                        │                                                                       │
Task 27 (i18n) ────────┼───────────────────────────────────────────────────────────────────────┤
                        │                                                                       ▼
                        │                                                              Tasks 28-29 (API + RQ hooks + WS invalidation)
                        │                                                                       │
                        │                                                                       ▼
                        │                                                              Tasks 30-32 (desktop UI + E2E)
                        │                                                                       │
                        │                                                               ┌───────┴───────┐
                        │                                                               ▼               ▼
                        │                                                      Tasks 33-34 (iOS)  Tasks 35-36 (Android)
                        │                                                               │               │
                        └───────────────────────────────────────────────────────────────┴───────┬───────┘
                                                                                                ▼
                                                                                        Task 37 (epic index)
```

**Parallelization opportunities:**
- iOS (Tasks 33-34) and Android (Tasks 35-36) can run in parallel
- i18n (Task 27) can run anytime before desktop UI (Task 30)
- Backend BDD tests (Tasks 25-26) can run immediately after routes + WS events (Tasks 22-24c)
- Desktop E2E (Task 32) depends on UI (Task 30-31) completing
- Tasks 24b (cleanup job) and 24c (WS events) can run in parallel
