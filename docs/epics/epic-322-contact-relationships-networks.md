# Epic 322: Contact Relationships & Support Networks

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 318 (Contact Entity), Epic 321 (CMS Permissions)
**Blocks**: Epic 327 (Support Contact Notifications), Epic 331 (Desktop Contact Directory)
**Branch**: `desktop`

## Summary

Build the `ContactRelationship` and `AffinityGroup` models in `ContactDirectoryDO` to track relationships between contacts (support_contact, attorney, family, interpreter, etc.) and organize contacts into named groups (affinity groups with roles like medic, legal observer, de-escalator). Relationships are bidirectional with directional semantics. Groups store encrypted member details with cleartext member count. Includes CRUD API for relationships and groups with bidirectional query support. ~12 files created/modified.

## Problem Statement

Contacts (Epic 318) exist as isolated profiles. In crisis response, contacts are deeply interconnected:
- An arrested person has a support contact (the person who calls the hotline on their behalf)
- An arrested person has an attorney (linked by an attorney coordinator)
- A family member calls the hotline asking about their relative's status
- An interpreter facilitates communication during intake
- A group of 5 people traveled together to a protest; they should be linked so that if one is arrested, the hotline knows to check on the others

Without contact relationships, a jail support coordinator answering the phone from a support contact has no way to identify which arrested person they are calling about -- they must search by name, hope the match is correct, and manually track the "calling on behalf of" connection.

Affinity groups solve the "traveling together" pattern. An NLG coordinator can create a group "Pine Street Collective" with 5 contacts, each tagged with a role (medic, legal observer, etc.). When one member is arrested, the system surfaces the entire group and their roles.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Relationship & Group Schemas

**File**: `apps/worker/schemas/contact-relationships.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

// --- Contact Relationship ---

export const relationshipDirectionSchema = z.enum(['a_to_b', 'b_to_a', 'bidirectional'])
export type RelationshipDirection = z.infer<typeof relationshipDirectionSchema>

export const contactRelationshipSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  contactIdA: z.uuid(),
  contactIdB: z.uuid(),
  relationshipType: z.string().max(50),
  direction: relationshipDirectionSchema,
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  createdAt: z.string(),
  createdBy: z.string(),
})

export type ContactRelationship = z.infer<typeof contactRelationshipSchema>

export const createRelationshipBodySchema = z.object({
  contactIdB: z.uuid(),
  relationshipType: z.string().max(50),
  direction: relationshipDirectionSchema.default('bidirectional'),
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export const RELATIONSHIP_TYPES = [
  'support_contact',    // Person who calls on behalf of another
  'attorney',           // Legal representation
  'family',             // Family member
  'interpreter',        // Language assistance
  'social_worker',      // Social services
  'medical_contact',    // Medical provider / emergency medical
  'employer',           // Employer (for workplace raids)
  'co_defendant',       // Arrested together, same charges
  'witness',            // Witnessed the incident
  'housing_contact',    // Landlord, shelter coordinator
  'custom',             // Free-form relationship
] as const

// --- Affinity Group ---

export const affinityGroupSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  encryptedDetails: z.string(),
  detailEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  memberCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type AffinityGroup = z.infer<typeof affinityGroupSchema>

export const createAffinityGroupBodySchema = z.object({
  encryptedDetails: z.string().min(1),
  detailEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  members: z.array(z.object({
    contactId: z.uuid(),
    role: z.string().max(50).optional(),
    isPrimary: z.boolean().default(false),
  })).min(1),
})

export const updateAffinityGroupBodySchema = z.object({
  encryptedDetails: z.string().optional(),
  detailEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export const addGroupMemberBodySchema = z.object({
  contactId: z.uuid(),
  role: z.string().max(50).optional(),
  isPrimary: z.boolean().default(false),
})

// --- Encrypted payloads (client-side only) ---

export const affinityGroupDetailsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  members: z.array(z.object({
    contactId: z.uuid(),
    role: z.string().optional(),
    isPrimary: z.boolean(),
  })),
})

export type AffinityGroupDetails = z.infer<typeof affinityGroupDetailsSchema>

export const GROUP_MEMBER_ROLES = [
  'medic',              // Street medic
  'legal_observer',     // NLG legal observer
  'de_escalator',       // Trained de-escalation
  'media',              // Independent media / livestreamer
  'driver',             // Transport
  'coordinator',        // Group coordinator
  'custom',             // Free-form role
] as const
```

#### Task 2: ContactDirectoryDO Relationship Storage

**File**: `apps/worker/durable-objects/contact-directory-do.ts` (extend)

Add relationship and group storage handlers. Storage key conventions:

```
rel:{contactIdA}:{id}                  -> ContactRelationship
relrev:{contactIdB}:{id}              -> ContactRelationship (reverse index)
idx:reltype:{typeHash}:{id}           -> true (relationship type filter)
group:{id}                            -> AffinityGroup
groupmember:{groupId}:{contactId}     -> { role, isPrimary }
contactgroups:{contactId}:{groupId}   -> true (reverse index)
```

New DORouter handlers:

```typescript
// --- Relationships ---

// Create relationship
this.router.post('/contacts/:id/relationships', async (req) => {
  const contactIdA = req.params.id
  const body = await req.json()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Verify both contacts exist
  const contactA = await this.ctx.storage.get(`contact:${contactIdA}`)
  if (!contactA) return json({ error: 'Contact A not found' }, { status: 404 })
  const contactB = await this.ctx.storage.get(`contact:${body.contactIdB}`)
  if (!contactB) return json({ error: 'Contact B not found' }, { status: 404 })

  // Prevent duplicate relationships
  const existingRels = await this.ctx.storage.list({ prefix: `rel:${contactIdA}:` })
  for (const [, rel] of existingRels) {
    const existing = rel as ContactRelationship
    if (existing.contactIdB === body.contactIdB && existing.relationshipType === body.relationshipType) {
      return json({ error: 'Relationship already exists' }, { status: 409 })
    }
  }

  const relationship: ContactRelationship = {
    id,
    hubId: req.headers.get('x-hub-id') ?? '',
    contactIdA,
    contactIdB: body.contactIdB,
    relationshipType: body.relationshipType,
    direction: body.direction ?? 'bidirectional',
    encryptedNotes: body.encryptedNotes,
    notesEnvelopes: body.notesEnvelopes,
    createdAt: now,
    createdBy: req.headers.get('x-pubkey') ?? '',
  }

  await this.ctx.storage.put(`rel:${contactIdA}:${id}`, relationship)
  await this.ctx.storage.put(`relrev:${body.contactIdB}:${id}`, relationship)

  return json(relationship, { status: 201 })
})

// Delete relationship
this.router.delete('/contacts/:id/relationships/:relId', async (req) => {
  const { id: contactId, relId } = req.params
  const rel = await this.ctx.storage.get(`rel:${contactId}:${relId}`) as ContactRelationship | undefined
  if (!rel) {
    // Try reverse index
    const revRel = await this.ctx.storage.get(`relrev:${contactId}:${relId}`) as ContactRelationship | undefined
    if (!revRel) return json({ error: 'Relationship not found' }, { status: 404 })
    await this.ctx.storage.delete(`rel:${revRel.contactIdA}:${relId}`)
    await this.ctx.storage.delete(`relrev:${contactId}:${relId}`)
    return json({ deleted: true })
  }
  await this.ctx.storage.delete(`rel:${contactId}:${relId}`)
  await this.ctx.storage.delete(`relrev:${rel.contactIdB}:${relId}`)
  return json({ deleted: true })
})

// List relationships for a contact (both directions)
this.router.get('/contacts/:id/relationships', async (req) => {
  const contactId = req.params.id
  const outgoing = await this.ctx.storage.list({ prefix: `rel:${contactId}:` })
  const incoming = await this.ctx.storage.list({ prefix: `relrev:${contactId}:` })

  const relationships: ContactRelationship[] = []
  for (const [, value] of outgoing) relationships.push(value as ContactRelationship)
  for (const [, value] of incoming) relationships.push(value as ContactRelationship)

  // Deduplicate (bidirectional relationships appear in both)
  const seen = new Set<string>()
  const deduped = relationships.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  return json({ relationships: deduped })
})

// --- Affinity Groups ---

// Create group
this.router.post('/groups', async (req) => {
  const body = await req.json()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const group: AffinityGroup = {
    id,
    hubId: req.headers.get('x-hub-id') ?? '',
    encryptedDetails: body.encryptedDetails,
    detailEnvelopes: body.detailEnvelopes,
    memberCount: body.members.length,
    createdAt: now,
    updatedAt: now,
    createdBy: req.headers.get('x-pubkey') ?? '',
  }

  await this.ctx.storage.put(`group:${id}`, group)
  for (const member of body.members) {
    await this.ctx.storage.put(`groupmember:${id}:${member.contactId}`, {
      role: member.role,
      isPrimary: member.isPrimary,
    })
    await this.ctx.storage.put(`contactgroups:${member.contactId}:${id}`, true)
  }

  return json(group, { status: 201 })
})

// List groups
this.router.get('/groups', async (req) => {
  const groups: AffinityGroup[] = []
  const entries = await this.ctx.storage.list({ prefix: 'group:' })
  for (const [, value] of entries) groups.push(value as AffinityGroup)
  return json({ groups })
})

// Get group with members
this.router.get('/groups/:id', async (req) => {
  const group = await this.ctx.storage.get(`group:${req.params.id}`)
  if (!group) return json({ error: 'Group not found' }, { status: 404 })
  const memberEntries = await this.ctx.storage.list({ prefix: `groupmember:${req.params.id}:` })
  const members: Array<{ contactId: string; role?: string; isPrimary: boolean }> = []
  for (const [key, value] of memberEntries) {
    const contactId = key.split(':')[2]
    members.push({ contactId, ...(value as { role?: string; isPrimary: boolean }) })
  }
  return json({ ...(group as AffinityGroup), members })
})

// Update group
this.router.patch('/groups/:id', async (req) => {
  const existing = await this.ctx.storage.get(`group:${req.params.id}`) as AffinityGroup | undefined
  if (!existing) return json({ error: 'Group not found' }, { status: 404 })
  const body = await req.json()
  const updated = { ...existing, ...body, updatedAt: new Date().toISOString() }
  await this.ctx.storage.put(`group:${req.params.id}`, updated)
  return json(updated)
})

// Delete group
this.router.delete('/groups/:id', async (req) => {
  const group = await this.ctx.storage.get(`group:${req.params.id}`)
  if (!group) return json({ error: 'Group not found' }, { status: 404 })
  // Clean up member indexes
  const memberEntries = await this.ctx.storage.list({ prefix: `groupmember:${req.params.id}:` })
  for (const [key] of memberEntries) {
    const contactId = key.split(':')[2]
    await this.ctx.storage.delete(`contactgroups:${contactId}:${req.params.id}`)
    await this.ctx.storage.delete(key)
  }
  await this.ctx.storage.delete(`group:${req.params.id}`)
  return json({ deleted: true })
})

// Add member to group
this.router.post('/groups/:id/members', async (req) => {
  const groupId = req.params.id
  const group = await this.ctx.storage.get(`group:${groupId}`) as AffinityGroup | undefined
  if (!group) return json({ error: 'Group not found' }, { status: 404 })
  const body = await req.json()
  const contact = await this.ctx.storage.get(`contact:${body.contactId}`)
  if (!contact) return json({ error: 'Contact not found' }, { status: 404 })

  await this.ctx.storage.put(`groupmember:${groupId}:${body.contactId}`, {
    role: body.role,
    isPrimary: body.isPrimary ?? false,
  })
  await this.ctx.storage.put(`contactgroups:${body.contactId}:${groupId}`, true)
  group.memberCount++
  group.updatedAt = new Date().toISOString()
  await this.ctx.storage.put(`group:${groupId}`, group)

  return json({ added: true, memberCount: group.memberCount }, { status: 201 })
})

// Remove member from group
this.router.delete('/groups/:id/members/:contactId', async (req) => {
  const { id: groupId, contactId } = req.params
  const group = await this.ctx.storage.get(`group:${groupId}`) as AffinityGroup | undefined
  if (!group) return json({ error: 'Group not found' }, { status: 404 })
  await this.ctx.storage.delete(`groupmember:${groupId}:${contactId}`)
  await this.ctx.storage.delete(`contactgroups:${contactId}:${groupId}`)
  group.memberCount = Math.max(0, group.memberCount - 1)
  group.updatedAt = new Date().toISOString()
  await this.ctx.storage.put(`group:${groupId}`, group)
  return json({ removed: true, memberCount: group.memberCount })
})

// List groups a contact belongs to
this.router.get('/contacts/:id/groups', async (req) => {
  const contactId = req.params.id
  const entries = await this.ctx.storage.list({ prefix: `contactgroups:${contactId}:` })
  const groups: AffinityGroup[] = []
  for (const [key] of entries) {
    const groupId = key.split(':')[2]
    const group = await this.ctx.storage.get(`group:${groupId}`)
    if (group) groups.push(group as AffinityGroup)
  }
  return json({ groups })
})
```

#### Task 3: Relationship & Group API Routes

**File**: `apps/worker/routes/contacts-v2.ts` (extend)

Add relationship and group routes to the existing contacts-v2 router:

```typescript
// --- Relationships ---

contactsV2.post('/:id/relationships',
  requirePermission('contacts:manage-relationships'),
  validator('json', createRelationshipBodySchema),
  async (c) => { /* proxy to ContactDirectoryDO, audit: relationshipCreated */ },
)

contactsV2.delete('/:id/relationships/:relId',
  requirePermission('contacts:manage-relationships'),
  async (c) => { /* proxy to ContactDirectoryDO, audit: relationshipDeleted */ },
)

contactsV2.get('/:id/relationships',
  requirePermission('contacts:view'),
  async (c) => { /* proxy to ContactDirectoryDO */ },
)

contactsV2.get('/:id/groups',
  requirePermission('contacts:view'),
  async (c) => { /* proxy to ContactDirectoryDO */ },
)

// --- Affinity Groups (mounted at /api/directory/groups) ---

contactsV2.get('/groups',
  requirePermission('contacts:manage-groups'),
  async (c) => { /* proxy to ContactDirectoryDO GET /groups */ },
)

contactsV2.post('/groups',
  requirePermission('contacts:manage-groups'),
  validator('json', createAffinityGroupBodySchema),
  async (c) => { /* proxy to ContactDirectoryDO POST /groups, audit: groupCreated */ },
)

contactsV2.get('/groups/:id',
  requirePermission('contacts:view'),
  async (c) => { /* proxy to ContactDirectoryDO GET /groups/:id */ },
)

contactsV2.patch('/groups/:id',
  requirePermission('contacts:manage-groups'),
  async (c) => { /* proxy to ContactDirectoryDO PATCH /groups/:id, audit: groupUpdated */ },
)

contactsV2.delete('/groups/:id',
  requirePermission('contacts:manage-groups'),
  async (c) => { /* proxy to ContactDirectoryDO DELETE /groups/:id, audit: groupDeleted */ },
)

contactsV2.post('/groups/:id/members',
  requirePermission('contacts:manage-groups'),
  validator('json', addGroupMemberBodySchema),
  async (c) => { /* proxy to ContactDirectoryDO POST /groups/:id/members */ },
)

contactsV2.delete('/groups/:id/members/:contactId',
  requirePermission('contacts:manage-groups'),
  async (c) => { /* proxy to ContactDirectoryDO DELETE /groups/:id/members/:contactId */ },
)
```

#### Task 4: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "relationships": {
    "title": "Relationships",
    "addRelationship": "Add Relationship",
    "removeRelationship": "Remove Relationship",
    "removeConfirm": "Remove this relationship?",
    "noRelationships": "No relationships.",
    "type": "Relationship Type",
    "direction": "Direction",
    "directionAtoB": "{{contactA}} is {{type}} of {{contactB}}",
    "directionBidirectional": "Mutual relationship",
    "types": {
      "support_contact": "Support Contact",
      "attorney": "Attorney",
      "family": "Family Member",
      "interpreter": "Interpreter",
      "social_worker": "Social Worker",
      "medical_contact": "Medical Contact",
      "employer": "Employer",
      "co_defendant": "Co-Defendant",
      "witness": "Witness",
      "housing_contact": "Housing Contact",
      "custom": "Other"
    }
  },
  "groups": {
    "title": "Affinity Groups",
    "createGroup": "Create Group",
    "editGroup": "Edit Group",
    "deleteGroup": "Delete Group",
    "deleteConfirm": "Delete this group? Contacts will not be deleted.",
    "noGroups": "No affinity groups.",
    "members": "Members",
    "memberCount": "{{count}} members",
    "addMember": "Add Member",
    "removeMember": "Remove Member",
    "primaryContact": "Primary Contact",
    "memberRoles": {
      "medic": "Street Medic",
      "legal_observer": "Legal Observer",
      "de_escalator": "De-Escalator",
      "media": "Media",
      "driver": "Driver",
      "coordinator": "Coordinator",
      "custom": "Other"
    }
  }
}
```

#### Task 5: BDD Feature File

**File**: `packages/test-specs/features/core/contact-relationships.feature`

```gherkin
@backend
Feature: Contact Relationships & Support Networks
  Track relationships between contacts and organize contacts
  into affinity groups with roles.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And contacts "Carlos Martinez" and "Maria Garcia" exist

  @contacts @relationships
  Scenario: Create a bidirectional relationship
    When admin "admin1" creates a relationship:
      | contactA         | Carlos Martinez   |
      | contactB         | Maria Garcia      |
      | relationshipType | family            |
      | direction        | bidirectional     |
    Then a relationship should exist between "Carlos Martinez" and "Maria Garcia"
    And the relationship type should be "family"

  @contacts @relationships
  Scenario: Create a directional relationship (attorney for client)
    When admin "admin1" creates a relationship:
      | contactA         | Maria Garcia      |
      | contactB         | Carlos Martinez   |
      | relationshipType | attorney          |
      | direction        | a_to_b            |
    Then the relationship should indicate "Maria Garcia" is attorney for "Carlos Martinez"

  @contacts @relationships
  Scenario: Query relationships from either contact
    Given a relationship between "Carlos Martinez" and "Maria Garcia" of type "family"
    When admin "admin1" lists relationships for "Carlos Martinez"
    Then the results should include a "family" relationship with "Maria Garcia"
    When admin "admin1" lists relationships for "Maria Garcia"
    Then the results should include a "family" relationship with "Carlos Martinez"

  @contacts @relationships
  Scenario: Delete a relationship
    Given a relationship between "Carlos Martinez" and "Maria Garcia"
    When admin "admin1" deletes the relationship
    Then the relationship should not exist
    And neither contact should be deleted

  @contacts @relationships
  Scenario: Duplicate relationship is rejected
    Given a "family" relationship between "Carlos Martinez" and "Maria Garcia"
    When admin "admin1" tries to create another "family" relationship between them
    Then the response status should be 409

  @contacts @relationships
  Scenario: Relationship with nonexistent contact fails
    When admin "admin1" tries to create a relationship with a nonexistent contact
    Then the response status should be 404

  @contacts @groups
  Scenario: Create an affinity group with members
    Given contacts "Ana Lopez" and "Pedro Ruiz" also exist
    When admin "admin1" creates an affinity group "Pine Street Collective" with:
      | contact          | role             | isPrimary |
      | Carlos Martinez  | medic            | true      |
      | Maria Garcia     | legal_observer   | false     |
      | Ana Lopez        | de_escalator     | false     |
    Then the group "Pine Street Collective" should exist
    And it should have 3 members
    And "Carlos Martinez" should be the primary contact

  @contacts @groups
  Scenario: Add a member to an existing group
    Given an affinity group "Pine Street Collective" with 2 members
    When admin "admin1" adds "Pedro Ruiz" as "driver" to the group
    Then the group should have 3 members

  @contacts @groups
  Scenario: Remove a member from a group
    Given an affinity group with 3 members including "Pedro Ruiz"
    When admin "admin1" removes "Pedro Ruiz" from the group
    Then the group should have 2 members
    And "Pedro Ruiz" should still exist as a contact

  @contacts @groups
  Scenario: List groups a contact belongs to
    Given "Carlos Martinez" is a member of groups "Pine Street" and "Medic Team"
    When admin "admin1" lists groups for "Carlos Martinez"
    Then 2 groups should be returned

  @contacts @groups
  Scenario: Delete a group removes member indexes
    Given an affinity group "Temp Group" with 2 members
    When admin "admin1" deletes the group
    Then the group should not exist
    And the contacts should no longer reference the group

  @contacts @groups @permissions
  Scenario: Volunteer without manage-groups cannot create groups
    Given a registered volunteer "vol1" with permission "contacts:view"
    When volunteer "vol1" tries to create an affinity group
    Then the response status should be 403
```

#### Task 6: Backend Step Definitions

**File**: `tests/steps/backend/contact-relationships.steps.ts`

Implement step definitions for all scenarios.

### Phase 2: Desktop UI

Deferred to Epic 331 (Desktop Contact Directory).

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/contact-relationships.ts` | Zod schemas for relationships and groups |
| `packages/test-specs/features/core/contact-relationships.feature` | BDD scenarios |
| `tests/steps/backend/contact-relationships.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/contact-directory-do.ts` | Add relationship and group storage handlers |
| `apps/worker/routes/contacts-v2.ts` | Add relationship and group routes |
| `packages/protocol/tools/schema-registry.ts` | Register relationship and group schemas |
| `packages/i18n/locales/en.json` | Add relationships and groups i18n sections |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` -- 12 scenarios in `contact-relationships.feature`

### Typecheck

`bun run typecheck` -- all new types must compile

## Acceptance Criteria & Test Scenarios

- [ ] Bidirectional relationships can be created between contacts
  -> `packages/test-specs/features/core/contact-relationships.feature: "Create a bidirectional relationship"`
- [ ] Directional relationships track who is what for whom
  -> `packages/test-specs/features/core/contact-relationships.feature: "Create a directional relationship"`
- [ ] Relationships queryable from either contact
  -> `packages/test-specs/features/core/contact-relationships.feature: "Query relationships from either contact"`
- [ ] Relationships can be deleted without deleting contacts
  -> `packages/test-specs/features/core/contact-relationships.feature: "Delete a relationship"`
- [ ] Duplicate relationships are rejected
  -> `packages/test-specs/features/core/contact-relationships.feature: "Duplicate relationship is rejected"`
- [ ] Relationship with nonexistent contact fails
  -> `packages/test-specs/features/core/contact-relationships.feature: "Relationship with nonexistent contact fails"`
- [ ] Affinity groups can be created with members and roles
  -> `packages/test-specs/features/core/contact-relationships.feature: "Create an affinity group with members"`
- [ ] Members can be added to existing groups
  -> `packages/test-specs/features/core/contact-relationships.feature: "Add a member to an existing group"`
- [ ] Members can be removed from groups
  -> `packages/test-specs/features/core/contact-relationships.feature: "Remove a member from a group"`
- [ ] Groups a contact belongs to can be listed
  -> `packages/test-specs/features/core/contact-relationships.feature: "List groups a contact belongs to"`
- [ ] Deleting a group cleans up member indexes
  -> `packages/test-specs/features/core/contact-relationships.feature: "Delete a group removes member indexes"`
- [ ] Permission enforcement for group management
  -> `packages/test-specs/features/core/contact-relationships.feature: "Volunteer without manage-groups cannot create groups"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/contact-relationships.feature` | New | 12 scenarios for relationships and groups |
| `tests/steps/backend/contact-relationships.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Medium risk**: Bidirectional storage (Task 2) -- relationships are stored in two keys (`rel:` and `relrev:`). Must ensure both are always created/deleted atomically. DO storage batching (`storage.put()` multiple keys) is not transactional but is sequential within a single DO invocation, so this is safe within a single request handler.
- **Low risk**: Affinity group storage (Task 2) -- straightforward key-value pattern following established conventions.
- **Low risk**: Routes (Task 3) -- standard CRUD proxying to ContactDirectoryDO.
- **Medium risk**: Index cleanup on group/contact deletion (Tasks 2-3) -- must clean up `groupmember:`, `contactgroups:`, `rel:`, `relrev:` keys when a contact or group is deleted. Must also update `memberCount`. Risk mitigated by prefix scan cleanup.
- **Low risk**: Schemas and i18n (Tasks 1, 4) -- additive, no existing changes.

## Execution

- **Phase 1**: Schemas -> ContactDirectoryDO handlers -> Routes -> Codegen -> i18n -> BDD -> gate
- **Phase 2**: No dedicated UI (Epic 331 handles desktop contact directory with relationship views)
- **Phase 3**: `bun run test:all`
