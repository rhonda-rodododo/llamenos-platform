# EP03: Teams & Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver team and tag management infrastructure — four new DB tables, full CRUD APIs, hub-key encrypted fields, HMAC blind indexes for tag-contact associations, desktop admin UI replacing stubs, user-facing TagInput/TagBadge components, and mobile tag pickers.

**Architecture:** Teams use a many-to-many junction table (`teamMembers`) replacing `users.team_id`. Tags are first-class records with encrypted labels and plaintext slugs; contact associations use HMAC blind indexes in the existing `contacts.tagHashes` column. All team names/descriptions and tag labels/categories are hub-key encrypted with domain separation labels. Permission-gated tag creation replaces the v1 `strictTags` boolean.

**Tech Stack:** TypeScript (React, TanStack Query), Hono (backend routes), Drizzle ORM (PostgreSQL), Zod (protocol schemas), SwiftUI (iOS), Kotlin/Compose (Android), packages/protocol codegen, packages/i18n.

**Prerequisite:** EP01 must be merged before starting.

---

## Phase 1: Permission Catalog & Crypto Labels

### Task 1: Add teams and tags permissions to the permission catalog

**Files:**
- Modify: `packages/shared/permissions.ts`
- Test: `packages/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: Write test for new permissions**

In `packages/shared/__tests__/permissions.test.ts`, add a new describe block:

```typescript
describe('EP03: teams and tags permissions', () => {
  const teamPerms = ['teams:read', 'teams:manage'] as const
  const tagPerms = ['tags:view', 'tags:create', 'tags:manage'] as const

  test.each([...teamPerms, ...tagPerms])('%s exists in PERMISSION_CATALOG', (perm) => {
    expect(perm in PERMISSION_CATALOG).toBe(true)
  })

  test.each([...teamPerms, ...tagPerms])('%s is a valid permission', (perm) => {
    expect(isValidPermission(perm)).toBe(true)
  })

  test('super-admin wildcard grants all team/tag permissions', () => {
    for (const perm of [...teamPerms, ...tagPerms]) {
      expect(permissionGranted(['*'], perm)).toBe(true)
    }
  })

  test('teams:* wildcard grants all team permissions', () => {
    for (const perm of teamPerms) {
      expect(permissionGranted(['teams:*'], perm)).toBe(true)
    }
  })

  test('tags:* wildcard grants all tag permissions', () => {
    for (const perm of tagPerms) {
      expect(permissionGranted(['tags:*'], perm)).toBe(true)
    }
  })

  test('hub-admin default role includes teams and tags permissions', () => {
    const hubAdmin = DEFAULT_ROLES.find(r => r.slug === 'hub-admin')!
    expect(permissionGranted(hubAdmin.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'teams:manage')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:create')).toBe(true)
    expect(permissionGranted(hubAdmin.permissions, 'tags:manage')).toBe(true)
  })

  test('volunteer default role has teams:read and tags:view', () => {
    const volunteer = DEFAULT_ROLES.find(r => r.slug === 'volunteer')!
    expect(permissionGranted(volunteer.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'tags:view')).toBe(true)
    expect(permissionGranted(volunteer.permissions, 'teams:manage')).toBe(false)
    expect(permissionGranted(volunteer.permissions, 'tags:create')).toBe(false)
  })

  test('reviewer default role has teams:read and tags:view', () => {
    const reviewer = DEFAULT_ROLES.find(r => r.slug === 'reviewer')!
    expect(permissionGranted(reviewer.permissions, 'teams:read')).toBe(true)
    expect(permissionGranted(reviewer.permissions, 'tags:view')).toBe(true)
  })
})

describe('PERMISSION_GROUP_LABELS includes teams and tags', () => {
  test('teams domain has a label', () => {
    expect(PERMISSION_GROUP_LABELS['teams']).toBe('Teams')
  })

  test('tags domain has a label', () => {
    expect(PERMISSION_GROUP_LABELS['tags']).toBe('Tags')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/shared/__tests__/permissions.test.ts
```

Expected: FAIL — new permissions not in catalog, default roles not updated.

- [ ] **Step 3: Add team and tag permissions to PERMISSION_CATALOG**

In `packages/shared/permissions.ts`, add these entries to `PERMISSION_CATALOG` (after the `hubs:configure` section, before `system:`):

```typescript
  // Teams
  'teams:read': 'View teams and membership',
  'teams:manage': 'Create, edit, delete teams and manage membership',

  // Tags
  'tags:view': 'View tags in picker and on contacts',
  'tags:create': 'Create new tags (inline or via admin UI)',
  'tags:manage': 'Edit and delete existing tags',
```

- [ ] **Step 4: Update default roles with team/tag permissions**

In `packages/shared/permissions.ts`, update the `DEFAULT_ROLES` array:

For `role-hub-admin`, add to the permissions array:

```typescript
'teams:*', 'tags:*',
```

For `role-reviewer`, add:

```typescript
'teams:read', 'tags:view',
```

For `role-volunteer`, add:

```typescript
'teams:read', 'tags:view',
```

- [ ] **Step 5: Add PERMISSION_GROUP_LABELS entries**

In `packages/shared/permissions.ts`, add to the `PERMISSION_GROUP_LABELS` object (EP01 creates this):

```typescript
  teams: 'Teams',
  tags: 'Tags',
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun test packages/shared/__tests__/permissions.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/permissions.ts packages/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add teams:read, teams:manage, tags:view, tags:create, tags:manage"
```

---

### Task 2: Add crypto domain separation labels for teams and tags

**Files:**
- Modify: `packages/protocol/crypto-labels.json`

- [ ] **Step 1: Add two new labels to crypto-labels.json**

Add these entries to the `"labels"` object in `packages/protocol/crypto-labels.json`:

```json
    "LABEL_TEAM_ENCRYPT": "llamenos:team-field:v1",
    "LABEL_TAG_ENCRYPT": "llamenos:tag-field:v1"
```

- [ ] **Step 2: Run codegen to generate TS/Swift/Kotlin constants**

```bash
bun run codegen
```

Expected: Updated constants in `packages/protocol/generated/` for all platforms.

- [ ] **Step 3: Verify the new labels appear in generated TypeScript**

```bash
grep -r 'LABEL_TEAM_ENCRYPT\|LABEL_TAG_ENCRYPT' packages/protocol/generated/
```

Expected: Both labels appear in the generated output.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/crypto-labels.json
git commit -m "feat(crypto): add LABEL_TEAM_ENCRYPT and LABEL_TAG_ENCRYPT domain separation labels"
```

---

## Phase 2: DB Schema

### Task 3: Create teams and teamMembers tables

**Files:**
- Create: `apps/worker/db/schema/teams.ts`

- [ ] **Step 1: Create the teams schema file**

Create `apps/worker/db/schema/teams.ts`:

```typescript
/**
 * Teams domain tables: teams, team members, and contact-team assignments.
 * Teams are hub-scoped organizational groups with encrypted names/descriptions.
 */
import { relations, sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// ---------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id').notNull(),
    encryptedName: text('encrypted_name').notNull(),
    encryptedDescription: text('encrypted_description'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('teams_hub_idx').on(table.hubId),
  ],
)

// ---------------------------------------------------------------------------
// team_members
// ---------------------------------------------------------------------------

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userPubkey: text('user_pubkey')
      .notNull()
      .references(() => users.pubkey, { onDelete: 'cascade' }),
    addedBy: text('added_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userPubkey] }),
    index('team_members_user_idx').on(table.userPubkey),
  ],
)

// ---------------------------------------------------------------------------
// contact_team_assignments
// ---------------------------------------------------------------------------

export const contactTeamAssignments = pgTable(
  'contact_team_assignments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text('contact_id').notNull(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    hubId: text('hub_id').notNull(),
    assignedBy: text('assigned_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('contact_team_unique').on(table.contactId, table.teamId),
    index('contact_team_contact_idx').on(table.contactId),
    index('contact_team_team_idx').on(table.teamId),
    index('contact_team_hub_idx').on(table.hubId),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  contactAssignments: many(contactTeamAssignments),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userPubkey],
    references: [users.pubkey],
  }),
}))

export const contactTeamAssignmentsRelations = relations(
  contactTeamAssignments,
  ({ one }) => ({
    team: one(teams, {
      fields: [contactTeamAssignments.teamId],
      references: [teams.id],
    }),
  }),
)
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/db/schema/teams.ts
git commit -m "feat(db): add teams, teamMembers, contactTeamAssignments tables"
```

---

### Task 4: Create tags table

**Files:**
- Create: `apps/worker/db/schema/tags.ts`

- [ ] **Step 1: Create the tags schema file**

Create `apps/worker/db/schema/tags.ts`:

```typescript
/**
 * Tags domain table: hub-scoped tags with encrypted labels and plaintext slugs.
 * Tag-contact associations are stored as HMAC blind indexes in contacts.tagHashes.
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id').notNull(),
    name: text('name').notNull(),
    encryptedLabel: text('encrypted_label').notNull(),
    color: text('color').notNull().default('#6b7280'),
    encryptedCategory: text('encrypted_category'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('tags_hub_name_unique').on(table.hubId, table.name),
    index('tags_hub_idx').on(table.hubId),
  ],
)
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/db/schema/tags.ts
git commit -m "feat(db): add tags table with encrypted label and plaintext slug"
```

---

### Task 5: Drop users.team_id column

**Files:**
- Modify: `apps/worker/db/schema/users.ts`

- [ ] **Step 1: Remove teamId from users table**

In `apps/worker/db/schema/users.ts`, delete the line:

```typescript
  teamId: text('team_id'),
```

- [ ] **Step 2: Search for references to teamId in the codebase**

```bash
grep -r 'teamId\|team_id' apps/worker/ --include='*.ts' | grep -v node_modules | grep -v '__tests__'
```

Fix any compile errors from removed column references. Replace with team membership queries via the `teamMembers` junction table.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors (after fixing any references).

- [ ] **Step 4: Commit**

```bash
git add apps/worker/db/schema/users.ts
git commit -m "refactor(db): remove users.team_id column, replaced by teamMembers junction table"
```

---

### Task 6: Export new tables and generate migration

**Files:**
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Add exports for teams and tags schemas**

In `apps/worker/db/schema/index.ts`, add:

```typescript
export * from './teams'
export * from './tags'
```

- [ ] **Step 2: Generate migration**

```bash
bunx drizzle-kit generate
```

Expected: A new migration file in `apps/worker/db/migrations/`.

- [ ] **Step 3: Apply migration locally**

```bash
bunx drizzle-kit push
```

Expected: Tables created/modified in local PostgreSQL.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/db/
git commit -m "feat(db): export teams/tags schemas, generate migration"
```

---

## Phase 3: Protocol Schemas

### Task 7: Create team Zod schemas

**Files:**
- Create: `packages/protocol/schemas/team.ts`
- Modify: `packages/protocol/schemas/index.ts`

- [ ] **Step 1: Create team protocol schemas**

Create `packages/protocol/schemas/team.ts`:

```typescript
import { z } from 'zod'

// --- Response schemas ---

export const teamResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  encryptedName: z.string(),
  encryptedDescription: z.string().nullable(),
  createdBy: z.string(),
  memberCount: z.number(),
  contactCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type TeamResponse = z.infer<typeof teamResponseSchema>

export const teamListResponseSchema = z.object({
  teams: z.array(teamResponseSchema),
})

export const teamMemberResponseSchema = z.object({
  teamId: z.string(),
  userPubkey: z.string(),
  addedBy: z.string(),
  createdAt: z.string(),
})

export type TeamMemberResponse = z.infer<typeof teamMemberResponseSchema>

export const teamMemberListResponseSchema = z.object({
  members: z.array(teamMemberResponseSchema),
})

export const contactTeamAssignmentResponseSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  teamId: z.string(),
  hubId: z.string(),
  assignedBy: z.string(),
  createdAt: z.string(),
})

export type ContactTeamAssignmentResponse = z.infer<typeof contactTeamAssignmentResponseSchema>

export const contactTeamAssignmentListResponseSchema = z.object({
  assignments: z.array(contactTeamAssignmentResponseSchema),
})

// --- Input schemas ---

export const createTeamBodySchema = z.looseObject({
  id: z.string().uuid(),
  encryptedName: z.string().min(1),
  encryptedDescription: z.string().optional(),
})

export const updateTeamBodySchema = z.looseObject({
  encryptedName: z.string().min(1).optional(),
  encryptedDescription: z.string().nullable().optional(),
})

export const addTeamMembersBodySchema = z.looseObject({
  pubkeys: z.array(z.string()).min(1),
})

export const assignTeamContactsBodySchema = z.looseObject({
  contactIds: z.array(z.string()).min(1),
})
```

- [ ] **Step 2: Add export to schemas/index.ts**

In `packages/protocol/schemas/index.ts`, add:

```typescript
export * from './team'
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/schemas/team.ts packages/protocol/schemas/index.ts
git commit -m "feat(protocol): add team Zod schemas for API request/response types"
```

---

### Task 8: Create tag Zod schemas

**Files:**
- Create: `packages/protocol/schemas/tag.ts`
- Modify: `packages/protocol/schemas/index.ts`

- [ ] **Step 1: Create tag protocol schemas**

Create `packages/protocol/schemas/tag.ts`:

```typescript
import { z } from 'zod'

// --- Response schemas ---

export const tagResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  name: z.string(),
  encryptedLabel: z.string(),
  color: z.string(),
  encryptedCategory: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export type TagResponse = z.infer<typeof tagResponseSchema>

export const tagListResponseSchema = z.object({
  tags: z.array(tagResponseSchema),
})

export const tagDeleteResponseSchema = z.object({
  removedFromContacts: z.number(),
})

// --- Input schemas ---

export const createTagBodySchema = z.looseObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  encryptedLabel: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6b7280'),
  encryptedCategory: z.string().optional(),
})

export const updateTagBodySchema = z.looseObject({
  encryptedLabel: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  encryptedCategory: z.string().nullable().optional(),
})
```

- [ ] **Step 2: Add export to schemas/index.ts**

In `packages/protocol/schemas/index.ts`, add:

```typescript
export * from './tag'
```

- [ ] **Step 3: Run codegen to generate Swift/Kotlin types**

```bash
bun run codegen
```

Expected: Generates updated types including Team and Tag types in all platforms.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/schemas/tag.ts packages/protocol/schemas/index.ts
git commit -m "feat(protocol): add tag Zod schemas for API request/response types"
```

---

## Phase 4: Backend Services

### Task 9: Teams service

**Files:**
- Create: `apps/worker/services/teams.ts`
- Test: `apps/worker/__tests__/unit/teams.test.ts` (create)

- [ ] **Step 1: Write unit tests for teams service**

Create `apps/worker/__tests__/unit/teams.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test'
import { TeamsService } from '../../services/teams'

// Test structure — actual test DB setup follows project patterns
// (per-test schema isolation via test helpers)

describe('TeamsService', () => {
  describe('create', () => {
    test('creates a team with encrypted name and returns it with counts', async () => {
      // Arrange: fresh DB, hubId, actorPubkey
      // Act: service.create({ id, hubId, encryptedName, encryptedDescription, createdBy })
      // Assert: returned team has id, memberCount: 0, contactCount: 0
    })
  })

  describe('list', () => {
    test('lists teams for a hub with member and contact counts', async () => {
      // Arrange: create 2 teams, add members to one
      // Act: service.list(hubId)
      // Assert: both teams returned, counts correct
    })

    test('does not return teams from other hubs', async () => {
      // Arrange: create team in hub-a and hub-b
      // Act: service.list('hub-a')
      // Assert: only hub-a team returned
    })
  })

  describe('addMembers', () => {
    test('adds multiple members to a team', async () => {
      // Arrange: create team, create users
      // Act: service.addMembers(teamId, ['pubkey1', 'pubkey2'], addedBy)
      // Assert: getMembers returns both
    })

    test('adding duplicate member is idempotent', async () => {
      // Arrange: add member once
      // Act: add same member again
      // Assert: no error, still 1 member
    })
  })

  describe('removeMember', () => {
    test('removes a member from a team', async () => {
      // Arrange: team with 2 members
      // Act: service.removeMember(teamId, pubkey)
      // Assert: getMembers returns 1
    })
  })

  describe('delete', () => {
    test('deletes team and cascades members and contact assignments', async () => {
      // Arrange: team with members and contact assignments
      // Act: service.delete(teamId)
      // Assert: team, members, assignments all gone
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test apps/worker/__tests__/unit/teams.test.ts
```

Expected: FAIL — `TeamsService` does not exist.

- [ ] **Step 3: Implement TeamsService**

Create `apps/worker/services/teams.ts`:

```typescript
import { eq, and, sql, count } from 'drizzle-orm'
import type { Database } from '../db'
import { teams, teamMembers, contactTeamAssignments } from '../db/schema'
import { ServiceError } from './settings'

export class TeamsService {
  constructor(private db: Database) {}

  async create(data: {
    id: string
    hubId: string
    encryptedName: string
    encryptedDescription?: string
    createdBy: string
  }) {
    const [team] = await this.db
      .insert(teams)
      .values({
        id: data.id,
        hubId: data.hubId,
        encryptedName: data.encryptedName,
        encryptedDescription: data.encryptedDescription ?? null,
        createdBy: data.createdBy,
      })
      .returning()

    return { ...team, memberCount: 0, contactCount: 0 }
  }

  async list(hubId: string) {
    const rows = await this.db
      .select({
        id: teams.id,
        hubId: teams.hubId,
        encryptedName: teams.encryptedName,
        encryptedDescription: teams.encryptedDescription,
        createdBy: teams.createdBy,
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
        memberCount: sql<number>`(
          SELECT count(*)::int FROM team_members
          WHERE team_members.team_id = ${teams.id}
        )`,
        contactCount: sql<number>`(
          SELECT count(*)::int FROM contact_team_assignments
          WHERE contact_team_assignments.team_id = ${teams.id}
        )`,
      })
      .from(teams)
      .where(eq(teams.hubId, hubId))

    return rows
  }

  async getById(teamId: string) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1)

    return team ?? null
  }

  async update(teamId: string, data: {
    encryptedName?: string
    encryptedDescription?: string | null
  }) {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (data.encryptedName !== undefined) updates.encryptedName = data.encryptedName
    if (data.encryptedDescription !== undefined) updates.encryptedDescription = data.encryptedDescription

    const [updated] = await this.db
      .update(teams)
      .set(updates)
      .where(eq(teams.id, teamId))
      .returning()

    if (!updated) throw new ServiceError(404, 'Team not found')
    return updated
  }

  async delete(teamId: string) {
    const [deleted] = await this.db
      .delete(teams)
      .where(eq(teams.id, teamId))
      .returning()

    if (!deleted) throw new ServiceError(404, 'Team not found')
    // Members and contact assignments cascade-deleted by FK
    return deleted
  }

  // --- Members ---

  async getMembers(teamId: string) {
    return this.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
  }

  async addMembers(teamId: string, pubkeys: string[], addedBy: string) {
    const values = pubkeys.map((pubkey) => ({
      teamId,
      userPubkey: pubkey,
      addedBy,
    }))

    await this.db
      .insert(teamMembers)
      .values(values)
      .onConflictDoNothing()
  }

  async removeMember(teamId: string, pubkey: string) {
    const [removed] = await this.db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userPubkey, pubkey),
        ),
      )
      .returning()

    if (!removed) throw new ServiceError(404, 'Member not found in team')
    return removed
  }

  // --- Contact Assignments ---

  async getContactAssignments(teamId: string) {
    return this.db
      .select()
      .from(contactTeamAssignments)
      .where(eq(contactTeamAssignments.teamId, teamId))
  }

  async assignContacts(teamId: string, hubId: string, contactIds: string[], assignedBy: string) {
    const values = contactIds.map((contactId) => ({
      contactId,
      teamId,
      hubId,
      assignedBy,
    }))

    await this.db
      .insert(contactTeamAssignments)
      .values(values)
      .onConflictDoNothing()
  }

  async unassignContact(teamId: string, contactId: string) {
    const [removed] = await this.db
      .delete(contactTeamAssignments)
      .where(
        and(
          eq(contactTeamAssignments.teamId, teamId),
          eq(contactTeamAssignments.contactId, contactId),
        ),
      )
      .returning()

    if (!removed) throw new ServiceError(404, 'Contact not assigned to team')
    return removed
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test apps/worker/__tests__/unit/teams.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/services/teams.ts apps/worker/__tests__/unit/teams.test.ts
git commit -m "feat(api): TeamsService with CRUD, membership, and contact assignment"
```

---

### Task 10: Tags service

**Files:**
- Create: `apps/worker/services/tags.ts`
- Test: `apps/worker/__tests__/unit/tags.test.ts` (create)

- [ ] **Step 1: Write unit tests for tags service**

Create `apps/worker/__tests__/unit/tags.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test'
import { TagsService } from '../../services/tags'

describe('TagsService', () => {
  describe('create', () => {
    test('creates a tag with encrypted label and slug', async () => {
      // Arrange: fresh DB, hubId
      // Act: service.create({ id, hubId, name: 'urgent', encryptedLabel, color, createdBy })
      // Assert: returned tag has all fields
    })

    test('returns 409 on duplicate slug within same hub', async () => {
      // Arrange: create tag with name 'urgent' in hub-a
      // Act: create another tag with name 'urgent' in hub-a
      // Assert: throws ServiceError(409)
    })

    test('allows same slug in different hubs', async () => {
      // Arrange: create tag 'urgent' in hub-a
      // Act: create tag 'urgent' in hub-b
      // Assert: succeeds
    })
  })

  describe('list', () => {
    test('lists tags for a hub', async () => {
      // Arrange: create 3 tags in hub-a, 1 in hub-b
      // Act: service.list('hub-a')
      // Assert: 3 tags returned
    })
  })

  describe('update', () => {
    test('updates tag label and color', async () => {
      // Arrange: create tag
      // Act: service.update(tagId, { encryptedLabel: 'new', color: '#ff0000' })
      // Assert: fields updated
    })
  })

  describe('delete', () => {
    test('deletes tag and removes matching HMAC hashes from contacts', async () => {
      // Arrange: create tag, add HMAC hash to a contact's tagHashes
      // Act: service.delete(tagId, hubBlindIndexKey)
      // Assert: tag gone, contact tagHashes no longer contains the hash, removedFromContacts: 1
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test apps/worker/__tests__/unit/tags.test.ts
```

Expected: FAIL — `TagsService` does not exist.

- [ ] **Step 3: Implement TagsService**

Create `apps/worker/services/tags.ts`:

```typescript
import { eq, and, sql, arrayOverlaps } from 'drizzle-orm'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import type { Database } from '../db'
import { tags } from '../db/schema'
import { contacts } from '../db/schema'
import { ServiceError } from './settings'

export class TagsService {
  constructor(private db: Database) {}

  async create(data: {
    id: string
    hubId: string
    name: string
    encryptedLabel: string
    color?: string
    encryptedCategory?: string
    createdBy: string
  }) {
    try {
      const [tag] = await this.db
        .insert(tags)
        .values({
          id: data.id,
          hubId: data.hubId,
          name: data.name,
          encryptedLabel: data.encryptedLabel,
          color: data.color ?? '#6b7280',
          encryptedCategory: data.encryptedCategory ?? null,
          createdBy: data.createdBy,
        })
        .returning()

      return tag
    } catch (err: unknown) {
      // Check for unique constraint violation (slug conflict within hub)
      if (err instanceof Error && err.message.includes('tags_hub_name_unique')) {
        throw new ServiceError(409, `Tag slug '${data.name}' already exists in this hub`)
      }
      throw err
    }
  }

  async list(hubId: string) {
    return this.db
      .select()
      .from(tags)
      .where(eq(tags.hubId, hubId))
  }

  async getById(tagId: string) {
    const [tag] = await this.db
      .select()
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1)

    return tag ?? null
  }

  async update(tagId: string, data: {
    encryptedLabel?: string
    color?: string
    encryptedCategory?: string | null
  }) {
    const updates: Record<string, unknown> = {}
    if (data.encryptedLabel !== undefined) updates.encryptedLabel = data.encryptedLabel
    if (data.color !== undefined) updates.color = data.color
    if (data.encryptedCategory !== undefined) updates.encryptedCategory = data.encryptedCategory

    if (Object.keys(updates).length === 0) {
      throw new ServiceError(400, 'No fields to update')
    }

    const [updated] = await this.db
      .update(tags)
      .set(updates)
      .where(eq(tags.id, tagId))
      .returning()

    if (!updated) throw new ServiceError(404, 'Tag not found')
    return updated
  }

  /**
   * Delete a tag and remove its HMAC blind index from all contacts in the hub.
   * Returns the count of contacts that were modified.
   */
  async delete(tagId: string, hubBlindIndexKey: string): Promise<{ removedFromContacts: number }> {
    // Look up the tag to get its slug and hubId
    const tag = await this.getById(tagId)
    if (!tag) throw new ServiceError(404, 'Tag not found')

    // Compute the HMAC of the slug using the hub blind index key
    const tagHash = bytesToHex(
      hmac(sha256, hexToBytes(hubBlindIndexKey), utf8ToBytes(tag.name)),
    )

    // Remove the hash from all contacts' tagHashes arrays in this hub
    const result = await this.db.execute(sql`
      UPDATE contacts
      SET tag_hashes = array_remove(tag_hashes, ${tagHash}),
          updated_at = now()
      WHERE hub_id = ${tag.hubId}
        AND ${tagHash} = ANY(tag_hashes)
    `)

    const removedFromContacts = Number(result.rowCount ?? 0)

    // Delete the tag record
    await this.db
      .delete(tags)
      .where(eq(tags.id, tagId))

    return { removedFromContacts }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test apps/worker/__tests__/unit/tags.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/services/tags.ts apps/worker/__tests__/unit/tags.test.ts
git commit -m "feat(api): TagsService with CRUD and HMAC blind index cleanup on delete"
```

---

## Phase 5: Backend Routes

### Task 11: Teams routes

**Files:**
- Create: `apps/worker/routes/teams.ts`

- [ ] **Step 1: Implement all 10 team endpoints**

Create `apps/worker/routes/teams.ts`:

```typescript
import { Hono } from 'hono'
import { validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import {
  createTeamBodySchema,
  updateTeamBodySchema,
  addTeamMembersBodySchema,
  assignTeamContactsBodySchema,
} from '@protocol/schemas/team'
import { audit } from '../services/audit'

const teams = new Hono<AppEnv>()

// GET /teams — list teams for current hub
teams.get('/',
  requirePermission('teams:read'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    if (!hubId) return c.json({ error: 'Hub context required' }, 400)

    const result = await services.teams.list(hubId)
    return c.json({ teams: result })
  },
)

// POST /teams — create team
teams.post('/',
  requirePermission('teams:manage'),
  validator('json', createTeamBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    if (!hubId) return c.json({ error: 'Hub context required' }, 400)

    const body = c.req.valid('json')
    const team = await services.teams.create({
      id: body.id,
      hubId,
      encryptedName: body.encryptedName,
      encryptedDescription: body.encryptedDescription,
      createdBy: pubkey,
    })

    await audit(services.audit, 'teamCreated', pubkey, { teamId: team.id }, undefined, hubId)
    return c.json(team, 201)
  },
)

// PATCH /teams/:id — update team
teams.patch('/:id',
  requirePermission('teams:manage'),
  validator('json', updateTeamBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()

    const body = c.req.valid('json')
    const team = await services.teams.update(id, body)

    await audit(services.audit, 'teamUpdated', pubkey, { teamId: id }, undefined, hubId)
    return c.json(team)
  },
)

// DELETE /teams/:id — delete team
teams.delete('/:id',
  requirePermission('teams:manage'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()

    await services.teams.delete(id)

    await audit(services.audit, 'teamDeleted', pubkey, { teamId: id }, undefined, hubId)
    return c.json({ ok: true })
  },
)

// GET /teams/:id/members — list team members
teams.get('/:id/members',
  requirePermission('teams:read'),
  async (c) => {
    const services = c.get('services')
    const { id } = c.req.param()

    const members = await services.teams.getMembers(id)
    return c.json({ members })
  },
)

// POST /teams/:id/members — add members
teams.post('/:id/members',
  requirePermission('teams:manage'),
  validator('json', addTeamMembersBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()
    const { pubkeys } = c.req.valid('json')

    await services.teams.addMembers(id, pubkeys, pubkey)

    for (const memberPubkey of pubkeys) {
      await audit(services.audit, 'teamMemberAdded', pubkey, {
        teamId: id,
        memberPubkey,
      }, undefined, hubId)
    }

    return c.json({ ok: true })
  },
)

// DELETE /teams/:id/members/:pubkey — remove member
teams.delete('/:id/members/:pubkey',
  requirePermission('teams:manage'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const actorPubkey = c.get('pubkey')
    const { id, pubkey: memberPubkey } = c.req.param()

    await services.teams.removeMember(id, memberPubkey)

    await audit(services.audit, 'teamMemberRemoved', actorPubkey, {
      teamId: id,
      memberPubkey,
    }, undefined, hubId)

    return c.json({ ok: true })
  },
)

// GET /teams/:id/contacts — list contact assignments
teams.get('/:id/contacts',
  requirePermission('teams:read'),
  async (c) => {
    const services = c.get('services')
    const { id } = c.req.param()

    const assignments = await services.teams.getContactAssignments(id)
    return c.json({ assignments })
  },
)

// POST /teams/:id/contacts — assign contacts
teams.post('/:id/contacts',
  requirePermission('teams:manage'),
  validator('json', assignTeamContactsBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()
    const { contactIds } = c.req.valid('json')
    if (!hubId) return c.json({ error: 'Hub context required' }, 400)

    await services.teams.assignContacts(id, hubId, contactIds, pubkey)

    for (const contactId of contactIds) {
      await audit(services.audit, 'teamContactAssigned', pubkey, {
        teamId: id,
        contactId,
      }, undefined, hubId)
    }

    return c.json({ ok: true })
  },
)

// DELETE /teams/:id/contacts/:contactId — unassign contact
teams.delete('/:id/contacts/:contactId',
  requirePermission('teams:manage'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id, contactId } = c.req.param()

    await services.teams.unassignContact(id, contactId)

    await audit(services.audit, 'teamContactUnassigned', pubkey, {
      teamId: id,
      contactId,
    }, undefined, hubId)

    return c.json({ ok: true })
  },
)

export default teams
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/routes/teams.ts
git commit -m "feat(api): teams routes — 10 endpoints with permission guards and audit logging"
```

---

### Task 12: Tags routes

**Files:**
- Create: `apps/worker/routes/tags.ts`

- [ ] **Step 1: Implement all 4 tag endpoints**

Create `apps/worker/routes/tags.ts`:

```typescript
import { Hono } from 'hono'
import { validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import {
  createTagBodySchema,
  updateTagBodySchema,
} from '@protocol/schemas/tag'
import { audit } from '../services/audit'

const tagsRouter = new Hono<AppEnv>()

// GET /tags — list tags for current hub
tagsRouter.get('/',
  requirePermission('tags:view'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    if (!hubId) return c.json({ error: 'Hub context required' }, 400)

    const result = await services.tags.list(hubId)
    return c.json({ tags: result })
  },
)

// POST /tags — create tag (returns 409 if slug conflicts)
tagsRouter.post('/',
  requirePermission('tags:create'),
  validator('json', createTagBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    if (!hubId) return c.json({ error: 'Hub context required' }, 400)

    const body = c.req.valid('json')
    const tag = await services.tags.create({
      id: body.id,
      hubId,
      name: body.name,
      encryptedLabel: body.encryptedLabel,
      color: body.color,
      encryptedCategory: body.encryptedCategory,
      createdBy: pubkey,
    })

    await audit(services.audit, 'tagCreated', pubkey, {
      tagId: tag.id,
      slug: tag.name,
    }, undefined, hubId)

    return c.json(tag, 201)
  },
)

// PATCH /tags/:id — update tag (label, color, category; slug is immutable)
tagsRouter.patch('/:id',
  requirePermission('tags:manage'),
  validator('json', updateTagBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()

    const body = c.req.valid('json')
    const tag = await services.tags.update(id, body)

    await audit(services.audit, 'tagUpdated', pubkey, {
      tagId: id,
    }, undefined, hubId)

    return c.json(tag)
  },
)

// DELETE /tags/:id — delete tag + remove from contacts
tagsRouter.delete('/:id',
  requirePermission('tags:manage'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const pubkey = c.get('pubkey')
    const { id } = c.req.param()

    // The hub's blind index key is needed to compute the HMAC hash for cleanup.
    // This is stored in settings or derived from hub config.
    const settings = await services.settings.getAll()
    const blindIndexKey = settings.blindIndexKey
    if (!blindIndexKey) {
      return c.json({ error: 'Hub blind index key not configured' }, 500)
    }

    const result = await services.tags.delete(id, blindIndexKey)

    await audit(services.audit, 'tagDeleted', pubkey, {
      tagId: id,
      removedFromContacts: result.removedFromContacts,
    }, undefined, hubId)

    return c.json(result)
  },
)

export default tagsRouter
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/routes/tags.ts
git commit -m "feat(api): tags routes — 4 endpoints with 409 slug conflict and HMAC cleanup on delete"
```

---

### Task 13: Mount routes and register services

**Files:**
- Modify: `apps/worker/app.ts`
- Modify: service registry (wherever services are constructed)

- [ ] **Step 1: Import and mount team/tag routes in app.ts**

In `apps/worker/app.ts`, add imports:

```typescript
import teamsRoutes from './routes/teams'
import tagsRoutes from './routes/tags'
```

Mount on both authenticated and hub-scoped routers (after existing route registrations):

```typescript
// In the authenticated block:
authenticated.route('/teams', teamsRoutes)
authenticated.route('/tags', tagsRoutes)

// In the hubScoped block:
hubScoped.route('/teams', teamsRoutes)
hubScoped.route('/tags', tagsRoutes)
```

- [ ] **Step 2: Register TeamsService and TagsService in the service container**

Find the service construction file (check the pattern used by other services like `services.settings`, `services.audit`). Add:

```typescript
import { TeamsService } from './services/teams'
import { TagsService } from './services/tags'

// In the services object:
teams: new TeamsService(db),
tags: new TagsService(db),
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/app.ts apps/worker/types.ts
git commit -m "feat(api): mount teams and tags routes, register services"
```

---

### Task 14: Add audit event types for teams and tags

**Files:**
- Modify: `apps/worker/services/audit.ts`

- [ ] **Step 1: Add teams and tags categories to EVENT_CATEGORIES**

In `apps/worker/services/audit.ts`, add to the `EVENT_CATEGORIES` object:

```typescript
  teams: [
    'teamCreated', 'teamUpdated', 'teamDeleted',
    'teamMemberAdded', 'teamMemberRemoved',
    'teamContactAssigned', 'teamContactUnassigned',
  ],
  tags: ['tagCreated', 'tagUpdated', 'tagDeleted'],
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/services/audit.ts
git commit -m "feat(audit): add teams and tags event categories for hash-chained audit log"
```

---

## Phase 6: Desktop — React Query Hooks & API

### Task 15: API client functions for teams and tags

**Files:**
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add teams API functions**

In `src/client/lib/api.ts`, add:

```typescript
// --- Teams ---

export async function listTeams(hubId: string) {
  return apiFetch<{ teams: TeamResponse[] }>(`/hubs/${hubId}/teams`)
}

export async function createTeam(hubId: string, body: CreateTeamBody) {
  return apiFetch<TeamResponse>(`/hubs/${hubId}/teams`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTeam(hubId: string, teamId: string, body: UpdateTeamBody) {
  return apiFetch<TeamResponse>(`/hubs/${hubId}/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTeam(hubId: string, teamId: string) {
  return apiFetch<{ ok: true }>(`/hubs/${hubId}/teams/${teamId}`, {
    method: 'DELETE',
  })
}

export async function listTeamMembers(hubId: string, teamId: string) {
  return apiFetch<{ members: TeamMemberResponse[] }>(`/hubs/${hubId}/teams/${teamId}/members`)
}

export async function addTeamMembers(hubId: string, teamId: string, pubkeys: string[]) {
  return apiFetch<{ ok: true }>(`/hubs/${hubId}/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ pubkeys }),
  })
}

export async function removeTeamMember(hubId: string, teamId: string, pubkey: string) {
  return apiFetch<{ ok: true }>(`/hubs/${hubId}/teams/${teamId}/members/${pubkey}`, {
    method: 'DELETE',
  })
}

export async function listTeamContacts(hubId: string, teamId: string) {
  return apiFetch<{ assignments: ContactTeamAssignmentResponse[] }>(`/hubs/${hubId}/teams/${teamId}/contacts`)
}

export async function assignTeamContacts(hubId: string, teamId: string, contactIds: string[]) {
  return apiFetch<{ ok: true }>(`/hubs/${hubId}/teams/${teamId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({ contactIds }),
  })
}

export async function unassignTeamContact(hubId: string, teamId: string, contactId: string) {
  return apiFetch<{ ok: true }>(`/hubs/${hubId}/teams/${teamId}/contacts/${contactId}`, {
    method: 'DELETE',
  })
}
```

- [ ] **Step 2: Add tags API functions**

```typescript
// --- Tags ---

export async function listTags(hubId: string) {
  return apiFetch<{ tags: TagResponse[] }>(`/hubs/${hubId}/tags`)
}

export async function createTag(hubId: string, body: CreateTagBody) {
  return apiFetch<TagResponse>(`/hubs/${hubId}/tags`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTag(hubId: string, tagId: string, body: UpdateTagBody) {
  return apiFetch<TagResponse>(`/hubs/${hubId}/tags/${tagId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTag(hubId: string, tagId: string) {
  return apiFetch<{ removedFromContacts: number }>(`/hubs/${hubId}/tags/${tagId}`, {
    method: 'DELETE',
  })
}
```

- [ ] **Step 3: Add type imports from protocol schemas**

At the top of `api.ts`, add to the existing protocol imports:

```typescript
import type {
  TeamResponse,
  TeamMemberResponse,
  ContactTeamAssignmentResponse,
} from '@protocol/schemas/team'
import type {
  TagResponse,
} from '@protocol/schemas/tag'
import type { CreateTeamBody, UpdateTeamBody } from '@protocol/schemas/team'
import type { CreateTagBody, UpdateTagBody } from '@protocol/schemas/tag'
```

Note: `CreateTeamBody` and `UpdateTeamBody` are inferred types — add `export type` declarations to the protocol schemas if not already exported:

```typescript
// In packages/protocol/schemas/team.ts:
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>
export type UpdateTeamBody = z.infer<typeof updateTeamBodySchema>

// In packages/protocol/schemas/tag.ts:
export type CreateTagBody = z.infer<typeof createTagBodySchema>
export type UpdateTagBody = z.infer<typeof updateTagBodySchema>
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/api.ts packages/protocol/schemas/team.ts packages/protocol/schemas/tag.ts
git commit -m "feat(client): API client functions for teams and tags"
```

---

### Task 16: React Query hooks for teams and tags

**Files:**
- Create: `src/client/lib/queries/teams.ts`
- Create: `src/client/lib/queries/tags.ts`

- [ ] **Step 1: Create team query hooks**

Create `src/client/lib/queries/teams.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMembers,
  removeTeamMember,
  listTeamContacts,
  assignTeamContacts,
  unassignTeamContact,
} from '@/lib/api'

export const teamKeys = {
  all: ['teams'] as const,
  list: (hubId: string) => [...teamKeys.all, 'list', hubId] as const,
  members: (teamId: string) => [...teamKeys.all, 'members', teamId] as const,
  contacts: (teamId: string) => [...teamKeys.all, 'contacts', teamId] as const,
}

export function useTeams(hubId: string) {
  return useQuery({
    queryKey: teamKeys.list(hubId),
    queryFn: () => listTeams(hubId),
    staleTime: 5 * 60 * 1000,
    enabled: !!hubId,
  })
}

export function useTeamMembers(hubId: string, teamId: string) {
  return useQuery({
    queryKey: teamKeys.members(teamId),
    queryFn: () => listTeamMembers(hubId, teamId),
    staleTime: 2 * 60 * 1000,
    enabled: !!teamId,
  })
}

export function useTeamContacts(hubId: string, teamId: string) {
  return useQuery({
    queryKey: teamKeys.contacts(teamId),
    queryFn: () => listTeamContacts(hubId, teamId),
    staleTime: 2 * 60 * 1000,
    enabled: !!teamId,
  })
}

export function useCreateTeam(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof createTeam>[1]) => createTeam(hubId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list(hubId) })
    },
  })
}

export function useUpdateTeam(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, body }: { teamId: string; body: Parameters<typeof updateTeam>[2] }) =>
      updateTeam(hubId, teamId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

export function useDeleteTeam(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (teamId: string) => deleteTeam(hubId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

export function useAddTeamMembers(hubId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pubkeys: string[]) => addTeamMembers(hubId, teamId, pubkeys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.list(hubId) })
    },
  })
}

export function useRemoveTeamMember(hubId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pubkey: string) => removeTeamMember(hubId, teamId, pubkey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.list(hubId) })
    },
  })
}

export function useAssignTeamContacts(hubId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (contactIds: string[]) => assignTeamContacts(hubId, teamId, contactIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.contacts(teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.list(hubId) })
    },
  })
}

export function useUnassignTeamContact(hubId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (contactId: string) => unassignTeamContact(hubId, teamId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.contacts(teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.list(hubId) })
    },
  })
}
```

- [ ] **Step 2: Create tag query hooks**

Create `src/client/lib/queries/tags.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
} from '@/lib/api'

export const tagKeys = {
  all: ['tags'] as const,
  list: (hubId: string) => [...tagKeys.all, 'list', hubId] as const,
}

export function useTags(hubId: string) {
  return useQuery({
    queryKey: tagKeys.list(hubId),
    queryFn: () => listTags(hubId),
    staleTime: 5 * 60 * 1000,
    enabled: !!hubId,
  })
}

export function useCreateTag(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof createTag>[1]) => createTag(hubId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(hubId) })
    },
  })
}

export function useUpdateTag(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, body }: { tagId: string; body: Parameters<typeof updateTag>[2] }) =>
      updateTag(hubId, tagId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(hubId) })
    },
  })
}

export function useDeleteTag(hubId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => deleteTag(hubId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(hubId) })
    },
  })
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/lib/queries/teams.ts src/client/lib/queries/tags.ts
git commit -m "feat(client): React Query hooks for teams and tags with invalidation"
```

---

## Phase 7: Desktop — Admin UI

### Task 17: TeamsSection admin component

**Files:**
- Create: `src/client/components/admin-settings/teams-section.tsx`

- [ ] **Step 1: Implement TeamsSection**

Create `src/client/components/admin-settings/teams-section.tsx`:

```typescript
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Plus,
  Save,
  X,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Contact,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMembers,
  useRemoveTeamMember,
  useTeamContacts,
  useAssignTeamContacts,
  useUnassignTeamContact,
} from '@/lib/queries/teams'
import { encryptField, decryptField } from '@/lib/platform'
import { useActiveHub } from '@/lib/hooks/use-active-hub'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function TeamsSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { activeHub, hubKey } = useActiveHub()
  const hubId = activeHub?.id ?? ''

  const { data: teamsData, isLoading } = useTeams(hubId)
  const createTeam = useCreateTeam(hubId)
  const updateTeam = useUpdateTeam(hubId)
  const deleteTeam = useDeleteTeam(hubId)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })

  // Decrypted team names (client-side)
  const [decryptedNames, setDecryptedNames] = useState<Record<string, string>>({})
  const [decryptedDescs, setDecryptedDescs] = useState<Record<string, string>>({})

  // Decrypt team names when data changes
  // (In production, use a useEffect with hubKey dependency)

  async function handleCreate() {
    if (!hubKey) return
    const teamId = crypto.randomUUID()
    const encryptedName = await encryptField(
      form.name, hubKey, 'LABEL_TEAM_ENCRYPT', `${teamId}:name`,
    )
    const encryptedDescription = form.description
      ? await encryptField(form.description, hubKey, 'LABEL_TEAM_ENCRYPT', `${teamId}:description`)
      : undefined

    try {
      await createTeam.mutateAsync({
        id: teamId,
        encryptedName,
        encryptedDescription,
      })
      setShowCreate(false)
      setForm({ name: '', description: '' })
      toast({ title: t('teams.created') })
    } catch (err) {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  async function handleUpdate(teamId: string) {
    if (!hubKey) return
    const encryptedName = await encryptField(
      form.name, hubKey, 'LABEL_TEAM_ENCRYPT', `${teamId}:name`,
    )
    const encryptedDescription = form.description
      ? await encryptField(form.description, hubKey, 'LABEL_TEAM_ENCRYPT', `${teamId}:description`)
      : null

    try {
      await updateTeam.mutateAsync({
        teamId,
        body: { encryptedName, encryptedDescription },
      })
      setEditingId(null)
      toast({ title: t('teams.updated') })
    } catch (err) {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTeam.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      toast({ title: t('teams.deleted') })
    } catch (err) {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  const teams = teamsData?.teams ?? []

  return (
    <SettingsSection
      icon={Users}
      title={t('teams.title')}
      description={t('teams.description')}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary ?? `${teams.length} teams`}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} disabled={showCreate || editingId !== null}>
            <Plus className="h-4 w-4 mr-1" />
            {t('teams.create')}
          </Button>
        </div>

        {showCreate && (
          <div className="border rounded-md p-4 bg-muted/20 space-y-3">
            <div>
              <Label>{t('teams.name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('teams.namePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('teams.descriptionLabel')}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!form.name.trim() || createTeam.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                {t('teams.create')}
              </Button>
              <Button variant="ghost" onClick={() => { setShowCreate(false); setForm({ name: '', description: '' }) }}>
                <X className="h-4 w-4 mr-1" />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* Team list */}
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  onClick={() => setExpandedTeamId(
                    expandedTeamId === team.id ? null : team.id,
                  )}
                >
                  {expandedTeamId === team.id
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium text-sm">
                    {decryptedNames[team.id] ?? '(encrypted)'}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {team.memberCount} members
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {team.contactCount} contacts
                  </Badge>
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => {
                    setEditingId(team.id)
                    setForm({
                      name: decryptedNames[team.id] ?? '',
                      description: decryptedDescs[team.id] ?? '',
                    })
                  }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setDeleteTarget({
                      id: team.id,
                      name: decryptedNames[team.id] ?? team.id,
                    })
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {editingId === team.id && (
                <div className="mt-3 border-t pt-3 space-y-3">
                  <div>
                    <Label>{t('teams.name')}</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t('teams.descriptionLabel')}</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleUpdate(team.id)} disabled={updateTeam.isPending}>
                      <Save className="h-4 w-4 mr-1" />
                      {t('common.save')}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4 mr-1" />
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}

              {expandedTeamId === team.id && editingId !== team.id && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  {/* TeamMembersPanel and TeamContactsPanel inline */}
                  <div className="text-xs text-muted-foreground">
                    {t('teams.membersPanelHint')}
                  </div>
                  {/* Full member/contact management panels go here — 
                      implemented as child components using useTeamMembers/useTeamContacts */}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('teams.deleteConfirm.title')}
        description={t('teams.deleteConfirm.description', { name: deleteTarget?.name })}
        onConfirm={handleDelete}
        destructive
      />
    </SettingsSection>
  )
}
```

- [ ] **Step 2: Register in section registry or admin settings page**

Find where admin sections are registered (check `src/client/routes/admin/settings.tsx` or the admin shell section registry) and add `TeamsSection`.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/admin-settings/teams-section.tsx
git commit -m "feat(ui): TeamsSection admin component with encrypted name CRUD"
```

---

### Task 18: TagsSection admin component with color picker

**Files:**
- Create: `src/client/components/admin-settings/tags-section.tsx`

- [ ] **Step 1: Implement TagsSection**

Create `src/client/components/admin-settings/tags-section.tsx`:

```typescript
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tag, Plus, Save, X, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/lib/queries/tags'
import { encryptField } from '@/lib/platform'
import { useActiveHub } from '@/lib/hooks/use-active-hub'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
]

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export function TagsSection({ expanded, onToggle, statusSummary }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { activeHub, hubKey } = useActiveHub()
  const hubId = activeHub?.id ?? ''

  const { data: tagsData, isLoading } = useTags(hubId)
  const createTag = useCreateTag(hubId)
  const updateTag = useUpdateTag(hubId)
  const deleteTag = useDeleteTag(hubId)

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [form, setForm] = useState({ label: '', slug: '', color: '#6b7280', category: '' })
  const [autoSlug, setAutoSlug] = useState(true)
  const [deleteResult, setDeleteResult] = useState<number | null>(null)

  function handleLabelChange(label: string) {
    setForm((f) => ({
      ...f,
      label,
      slug: autoSlug ? slugify(label) : f.slug,
    }))
  }

  async function handleCreate() {
    if (!hubKey || !form.label.trim() || !form.slug.trim()) return

    const tagId = crypto.randomUUID()
    const encryptedLabel = await encryptField(
      form.label, hubKey, 'LABEL_TAG_ENCRYPT', `${tagId}:label`,
    )
    const encryptedCategory = form.category.trim()
      ? await encryptField(form.category, hubKey, 'LABEL_TAG_ENCRYPT', `${tagId}:category`)
      : undefined

    try {
      await createTag.mutateAsync({
        id: tagId,
        name: form.slug,
        encryptedLabel,
        color: form.color,
        encryptedCategory,
      })
      setShowCreate(false)
      resetForm()
      toast({ title: t('tags.created') })
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        toast({ title: t('tags.slugConflict'), variant: 'destructive' })
      } else {
        toast({ title: t('common.error'), variant: 'destructive' })
      }
    }
  }

  async function handleUpdate(tagId: string) {
    if (!hubKey) return

    const encryptedLabel = form.label.trim()
      ? await encryptField(form.label, hubKey, 'LABEL_TAG_ENCRYPT', `${tagId}:label`)
      : undefined
    const encryptedCategory = form.category.trim()
      ? await encryptField(form.category, hubKey, 'LABEL_TAG_ENCRYPT', `${tagId}:category`)
      : null

    try {
      await updateTag.mutateAsync({
        tagId,
        body: {
          encryptedLabel,
          color: form.color,
          encryptedCategory,
        },
      })
      setEditingId(null)
      resetForm()
      toast({ title: t('tags.updated') })
    } catch (err) {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const result = await deleteTag.mutateAsync(deleteTarget.id)
      setDeleteResult(result.removedFromContacts)
      setDeleteTarget(null)
      toast({
        title: t('tags.deleted'),
        description: t('tags.removedFromContacts', { count: result.removedFromContacts }),
      })
    } catch (err) {
      toast({ title: t('common.error'), variant: 'destructive' })
    }
  }

  function resetForm() {
    setForm({ label: '', slug: '', color: '#6b7280', category: '' })
    setAutoSlug(true)
  }

  const tagList = tagsData?.tags ?? []

  return (
    <SettingsSection
      icon={Tag}
      title={t('tags.title')}
      description={t('tags.description')}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary ?? `${tagList.length} tags`}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} disabled={showCreate || editingId !== null}>
            <Plus className="h-4 w-4 mr-1" />
            {t('tags.create')}
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="border rounded-md p-4 bg-muted/20 space-y-3">
            <div>
              <Label>{t('tags.label')}</Label>
              <Input
                value={form.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder={t('tags.labelPlaceholder')}
              />
            </div>
            <div>
              <Label>{t('tags.slug')}</Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setAutoSlug(false)
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }}
                placeholder="auto-generated-from-label"
              />
            </div>
            <div>
              <Label>{t('tags.color')}</Label>
              <div className="flex gap-2 mt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-all',
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                  />
                ))}
                <Input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-24 h-6 text-xs"
                  placeholder="#hex"
                />
              </div>
            </div>
            <div>
              <Label>{t('tags.category')}</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t('tags.categoryPlaceholder')}
              />
            </div>
            {/* Live preview */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('tags.preview')}:</Label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                style={{ backgroundColor: form.color }}>
                {form.label || t('tags.previewPlaceholder')}
              </span>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!form.label.trim() || !form.slug.trim() || createTag.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                {t('tags.create')}
              </Button>
              <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm() }}>
                <X className="h-4 w-4 mr-1" />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

        {/* Tag list */}
        <div className="space-y-2">
          {tagList.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between p-2 border rounded-md">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm font-medium">(encrypted)</span>
                <span className="text-xs text-muted-foreground">{tag.name}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => {
                  setEditingId(tag.id)
                  setForm({ label: '', slug: tag.name, color: tag.color, category: '' })
                }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                  setDeleteTarget({ id: tag.id, name: tag.name })
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('tags.deleteConfirm.title')}
        description={t('tags.deleteConfirm.description', { name: deleteTarget?.name })}
        onConfirm={handleDelete}
        destructive
      />
    </SettingsSection>
  )
}
```

- [ ] **Step 2: Register in admin settings / section registry**

Add `TagsSection` to the admin settings page alongside `TeamsSection`.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/admin-settings/tags-section.tsx
git commit -m "feat(ui): TagsSection admin component with color picker and live preview"
```

---

## Phase 8: Desktop — User-Facing Components

### Task 19: TagBadge component

**Files:**
- Create: `src/client/components/tag-badge.tsx`

- [ ] **Step 1: Create TagBadge**

Create `src/client/components/tag-badge.tsx`:

```typescript
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  label: string
  color: string
  onRemove?: () => void
  className?: string
}

export function TagBadge({ label, color, onRemove, className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        className,
      )}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70"
          aria-label={`Remove ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/tag-badge.tsx
git commit -m "feat(ui): reusable TagBadge component with colored dot and optional remove"
```

---

### Task 20: TagInput component (Command+Popover multi-select)

**Files:**
- Create: `src/client/components/tag-input.tsx`

- [ ] **Step 1: Create TagInput**

Create `src/client/components/tag-input.tsx`:

```typescript
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { TagBadge } from '@/components/tag-badge'
import { ChevronsUpDown, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DecryptedTag {
  id: string
  name: string
  label: string
  color: string
  category: string | null
}

interface TagInputProps {
  tags: DecryptedTag[]
  selected: string[]
  onChange: (tagIds: string[]) => void
  allowCreate: boolean
  onCreateTag?: (label: string) => Promise<void>
  className?: string
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function TagInput({
  tags,
  selected,
  onChange,
  allowCreate,
  onCreateTag,
  className,
}: TagInputProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedSet.has(tag.id)),
    [tags, selectedSet],
  )

  const filteredTags = useMemo(
    () => tags.filter((tag) =>
      tag.label.toLowerCase().includes(search.toLowerCase()) ||
      tag.name.toLowerCase().includes(search.toLowerCase()),
    ),
    [tags, search],
  )

  // Group by decrypted category
  const grouped = useMemo(() => {
    const groups: Record<string, DecryptedTag[]> = {}
    for (const tag of filteredTags) {
      const key = tag.category ?? ''
      if (!groups[key]) groups[key] = []
      groups[key].push(tag)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredTags])

  const showCreateOption = allowCreate
    && search.trim().length > 0
    && !tags.some((t) => t.name === slugify(search) || t.label.toLowerCase() === search.toLowerCase())

  function toggleTag(tagId: string) {
    if (selectedSet.has(tagId)) {
      onChange(selected.filter((id) => id !== tagId))
    } else {
      onChange([...selected, tagId])
    }
  }

  async function handleCreate() {
    if (onCreateTag) {
      await onCreateTag(search.trim())
      setSearch('')
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              label={tag.label}
              color={tag.color}
              onRemove={() => toggleTag(tag.id)}
            />
          ))}
        </div>
      )}

      {/* Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            {t('tags.selectTags')}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('tags.searchPlaceholder')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{t('tags.noResults')}</CommandEmpty>

              {grouped.map(([category, categoryTags]) => (
                <CommandGroup
                  key={category}
                  heading={category || undefined}
                >
                  {categoryTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.label}
                      onSelect={() => toggleTag(tag.id)}
                    >
                      <span
                        className="w-3 h-3 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.label}
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          selectedSet.has(tag.id) ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {showCreateOption && (
                <CommandGroup heading={t('tags.createGroup')}>
                  <CommandItem onSelect={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('tags.createInline', { name: search.trim() })}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/tag-input.tsx
git commit -m "feat(ui): TagInput component with Command+Popover multi-select and inline create"
```

---

### Task 21: Contact detail page tag and team integration

**Files:**
- Modify: `src/client/components/contacts/` (contact detail component)
- Modify: Contact list component (add tag/team filters)

- [ ] **Step 1: Add TagInput to contact detail page**

Find the contact detail component (check `src/client/components/contacts/` or route files). Add a `TagInput` section that:

1. Fetches tags via `useTags(hubId)`
2. Decrypts tag labels client-side using hub key
3. Shows currently applied tags (from `tagHashes` resolved against decrypted tag list)
4. Allows adding/removing tags (writes HMAC to `contacts.tagHashes`)
5. Checks `tags:create` permission for inline creation

- [ ] **Step 2: Add team assignment display to contact detail**

Show which teams the contact is assigned to. Use the `contactTeamAssignments` data to display team names (decrypted).

- [ ] **Step 3: Add tag and team filters to contact list**

In the contact list component, add filter controls:
- Tag filter: dropdown of available tags (decrypted), filters by matching `tagHashes`
- Team filter: dropdown of teams, filters by `contactTeamAssignments`

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/contacts/
git commit -m "feat(ui): contact detail tag integration and contact list tag/team filtering"
```

---

## Phase 9: Mobile

### Task 22: iOS SwiftUI tag picker and display

**Files:**
- Create: `apps/ios/Sources/Views/Components/TagBadgeView.swift`
- Create: `apps/ios/Sources/Views/Components/TagPickerView.swift`
- Modify: `apps/ios/Sources/Views/Contacts/ContactDetailView.swift`

- [ ] **Step 1: Create TagBadgeView**

Create `apps/ios/Sources/Views/Components/TagBadgeView.swift`:

```swift
import SwiftUI

struct TagBadgeView: View {
    let label: String
    let color: Color
    var onRemove: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption2)
                .fontWeight(.medium)
            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .foregroundStyle(color)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(color.opacity(0.25), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tag: \(label)")
    }
}
```

- [ ] **Step 2: Create TagPickerView**

Create `apps/ios/Sources/Views/Components/TagPickerView.swift`:

```swift
import SwiftUI

struct DecryptedTag: Identifiable {
    let id: String
    let name: String
    let label: String
    let color: Color
    let category: String?
}

struct TagPickerView: View {
    let tags: [DecryptedTag]
    @Binding var selectedIds: Set<String>
    let allowCreate: Bool
    var onCreateTag: ((String) async -> Void)? = nil

    @State private var searchText = ""
    @State private var showPicker = false

    private var filteredTags: [DecryptedTag] {
        if searchText.isEmpty { return tags }
        return tags.filter {
            $0.label.localizedCaseInsensitiveContains(searchText) ||
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var grouped: [(String, [DecryptedTag])] {
        Dictionary(grouping: filteredTags) { $0.category ?? "" }
            .sorted { $0.key < $1.key }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Selected tags
            if !selectedIds.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(tags.filter { selectedIds.contains($0.id) }) { tag in
                            TagBadgeView(
                                label: tag.label,
                                color: tag.color,
                                onRemove: { selectedIds.remove(tag.id) }
                            )
                        }
                    }
                }
            }

            // Picker button
            Button {
                showPicker = true
            } label: {
                Label(
                    String(localized: "tags.selectTags"),
                    systemImage: "tag"
                )
                .font(.subheadline)
            }
            .sheet(isPresented: $showPicker) {
                NavigationStack {
                    List {
                        ForEach(grouped, id: \.0) { category, categoryTags in
                            Section(category.isEmpty ? String(localized: "tags.uncategorized") : category) {
                                ForEach(categoryTags) { tag in
                                    Button {
                                        if selectedIds.contains(tag.id) {
                                            selectedIds.remove(tag.id)
                                        } else {
                                            selectedIds.insert(tag.id)
                                        }
                                    } label: {
                                        HStack {
                                            Circle()
                                                .fill(tag.color)
                                                .frame(width: 12, height: 12)
                                            Text(tag.label)
                                            Spacer()
                                            if selectedIds.contains(tag.id) {
                                                Image(systemName: "checkmark")
                                                    .foregroundStyle(.blue)
                                            }
                                        }
                                    }
                                    .accessibilityIdentifier("tag-\(tag.name)")
                                }
                            }
                        }
                    }
                    .searchable(text: $searchText)
                    .navigationTitle(String(localized: "tags.selectTags"))
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(String(localized: "common.done")) {
                                showPicker = false
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Integrate into ContactDetailView**

In `apps/ios/Sources/Views/Contacts/ContactDetailView.swift`, add a section showing tag badges for the contact's applied tags and a tag picker for modification.

- [ ] **Step 4: Build and test**

```bash
bun run ios:build && bun run ios:test
```

Expected: Builds and existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Sources/
git commit -m "feat(ios): TagBadgeView, TagPickerView, and contact detail tag integration"
```

---

### Task 23: Android Compose tag picker and display

**Files:**
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagBadge.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagPicker.kt`
- Modify: Contact detail screen

- [ ] **Step 1: Create TagBadge composable**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagBadge.kt`:

```kotlin
package org.llamenos.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun TagBadge(
    label: String,
    color: Color,
    onRemove: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.25f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .testTag("tag-badge-$label"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
        if (onRemove != null) {
            IconButton(
                onClick = onRemove,
                modifier = Modifier.size(14.dp),
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Remove $label",
                    modifier = Modifier.size(10.dp),
                    tint = color,
                )
            }
        }
    }
}
```

- [ ] **Step 2: Create TagPicker composable**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagPicker.kt`:

```kotlin
package org.llamenos.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

data class DecryptedTag(
    val id: String,
    val name: String,
    val label: String,
    val color: Color,
    val category: String?,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TagPicker(
    tags: List<DecryptedTag>,
    selectedIds: Set<String>,
    onSelectionChange: (Set<String>) -> Unit,
    allowCreate: Boolean = false,
    onCreateTag: (suspend (String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var showSheet by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    Column(modifier = modifier) {
        // Selected tags
        if (selectedIds.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                tags.filter { it.id in selectedIds }.forEach { tag ->
                    TagBadge(
                        label = tag.label,
                        color = tag.color,
                        onRemove = { onSelectionChange(selectedIds - tag.id) },
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Picker trigger
        OutlinedButton(
            onClick = { showSheet = true },
            modifier = Modifier.testTag("tag-picker-trigger"),
        ) {
            Icon(Icons.Default.Tag, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Select tags")
        }

        if (showSheet) {
            ModalBottomSheet(onDismissRequest = { showSheet = false }) {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        label = { Text("Search tags") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    val filtered = tags.filter {
                        searchQuery.isBlank() ||
                        it.label.contains(searchQuery, ignoreCase = true) ||
                        it.name.contains(searchQuery, ignoreCase = true)
                    }

                    val grouped = filtered.groupBy { it.category ?: "" }.toSortedMap()

                    LazyColumn {
                        grouped.forEach { (category, categoryTags) ->
                            if (category.isNotEmpty()) {
                                item {
                                    Text(
                                        category,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.padding(vertical = 4.dp),
                                    )
                                }
                            }
                            items(categoryTags, key = { it.id }) { tag ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            onSelectionChange(
                                                if (tag.id in selectedIds) selectedIds - tag.id
                                                else selectedIds + tag.id
                                            )
                                        }
                                        .padding(vertical = 8.dp, horizontal = 4.dp)
                                        .testTag("tag-option-${tag.name}"),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(12.dp)
                                            .padding(end = 8.dp),
                                    ) {
                                        // Color dot would use Canvas, simplified here
                                    }
                                    Text(tag.label, modifier = Modifier.weight(1f))
                                    if (tag.id in selectedIds) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = "Selected",
                                            tint = MaterialTheme.colorScheme.primary,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Integrate into contact detail screen**

Add `TagPicker` and `TagBadge` to the Android contact detail screen.

- [ ] **Step 4: Build and test**

```bash
bun run test:android
```

Expected: Builds and existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/android/
git commit -m "feat(android): TagBadge, TagPicker composables, and contact detail tag integration"
```

---

## Phase 10: i18n

### Task 24: Add team and tag i18n strings

**Files:**
- Modify: `packages/i18n/locales/en.json`

- [ ] **Step 1: Add team strings to en.json**

Add a `teams` namespace:

```json
{
  "teams": {
    "title": "Teams",
    "description": "Organize volunteers into teams for routing and management",
    "create": "Create team",
    "created": "Team created",
    "updated": "Team updated",
    "deleted": "Team deleted",
    "name": "Team name",
    "namePlaceholder": "e.g. Night Shift Responders",
    "descriptionLabel": "Description",
    "membersPanelHint": "Expand to manage members and contact assignments",
    "members": "Members",
    "contacts": "Assigned contacts",
    "addMembers": "Add members",
    "removeFromTeam": "Remove from team",
    "assignContacts": "Assign contacts",
    "unassignContact": "Unassign contact",
    "deleteConfirm": {
      "title": "Delete team",
      "description": "Are you sure you want to delete \"{{name}}\"? All member and contact assignments will be removed."
    }
  }
}
```

- [ ] **Step 2: Add tag strings to en.json**

Add a `tags` namespace:

```json
{
  "tags": {
    "title": "Tags",
    "description": "Label and categorize contacts with colored tags",
    "create": "Create tag",
    "created": "Tag created",
    "updated": "Tag updated",
    "deleted": "Tag deleted",
    "label": "Display label",
    "labelPlaceholder": "e.g. Urgent Response",
    "slug": "Slug (identifier)",
    "color": "Color",
    "category": "Category",
    "categoryPlaceholder": "e.g. Priority, Status, Region",
    "preview": "Preview",
    "previewPlaceholder": "Tag preview",
    "selectTags": "Select tags",
    "searchPlaceholder": "Search tags...",
    "noResults": "No tags found",
    "createGroup": "Create",
    "createInline": "Create \"{{name}}\"",
    "slugConflict": "A tag with this slug already exists. Try selecting the existing tag.",
    "removedFromContacts": "Removed from {{count}} contacts",
    "removedFromContacts_one": "Removed from 1 contact",
    "uncategorized": "Uncategorized",
    "deleteConfirm": {
      "title": "Delete tag",
      "description": "Are you sure you want to delete the tag \"{{name}}\"? It will be removed from all contacts that use it."
    }
  }
}
```

- [ ] **Step 3: Run i18n codegen**

```bash
bun run i18n:codegen
```

Expected: Generates iOS `.strings` and Android `strings.xml`.

- [ ] **Step 4: Validate i18n completeness**

```bash
bun run i18n:validate:all
```

Expected: No validation errors for new keys.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add team and tag management strings across all locales"
```

---

## Phase 11: Integration Testing & Final Verification

### Task 25: Backend integration tests

**Files:**
- Test via BDD or unit test files

- [ ] **Step 1: Run backend BDD tests**

```bash
bun run test:backend:bdd
```

Expected: All existing tests pass, new team/tag routes work correctly.

- [ ] **Step 2: Run full typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Run desktop tests**

```bash
bun run test
```

Expected: All Playwright E2E tests pass.

- [ ] **Step 4: Run crypto tests**

```bash
bun run crypto:test
```

Expected: All pass (verify domain label codegen works).

- [ ] **Step 5: Run i18n validation**

```bash
bun run i18n:validate:all
```

Expected: All pass.

- [ ] **Step 6: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues from final EP03 verification pass"
```
