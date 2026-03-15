# Epic 323: Case Interactions & Unified Timeline

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 319 (Record Entity)
**Blocks**: Epic 325 (Evidence & Chain of Custody), Epic 330 (Desktop Case UI), Epic 332 (Desktop Timeline)
**Branch**: `desktop`

## Summary

Build the `CaseInteraction` model stored in CaseDO that links existing notes, calls, and conversations to case records and supports inline interactions (quick comments, status change logs). Interactions form a chronological timeline per case, providing a unified view of everything that happened -- calls taken, notes written, status changes, referrals made, evidence uploaded. Includes auto-creation of interaction entries when notes are created with a `caseId`, and API routes for reading and creating interactions on a case. ~10 files created/modified.

## Problem Statement

Case records (Epic 319) store the structured data about a case -- status, severity, custom field values. But a case involves many activities over time:
- A hotline volunteer answers a call from a support contact and creates a note about an arrest
- The jail support coordinator changes the case status from "reported" to "confirmed"
- An attorney coordinator leaves an internal comment about attorney assignment
- A legal observer's field report is linked to the case
- Evidence photos are uploaded

Without a unified interaction timeline, a coordinator opening a case sees only the current state (fields, status) with no history of how it got there. They cannot answer "who changed the status to 'released' and when?" or "what notes were written about this case?" without manually searching across notes, calls, and conversations.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Interaction Schemas

**File**: `apps/worker/schemas/interactions.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

export const interactionTypeSchema = z.enum([
  'note',            // Linked existing note from RecordsDO
  'call',            // Linked call record
  'message',         // Linked conversation/message
  'status_change',   // Case status was changed
  'referral',        // Case referred to another role/hub
  'assessment',      // Assessment conducted (lethality, triage, etc.)
  'file_upload',     // Evidence or file attached
  'comment',         // Inline comment on the case timeline
])

export type InteractionType = z.infer<typeof interactionTypeSchema>

export const caseInteractionSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),

  // --- Source link (for linked interactions) ---
  interactionType: interactionTypeSchema,
  sourceId: z.string().optional(),       // ID of the source entity (note ID, call ID, etc.)

  // --- E2EE content (for inline interactions) ---
  encryptedContent: z.string().optional(),
  contentEnvelopes: z.array(recipientEnvelopeSchema).optional(),

  // --- Cleartext metadata ---
  authorPubkey: z.string(),
  interactionTypeHash: z.string(),       // Blind index for filtering by type
  createdAt: z.string(),

  // --- Status change metadata ---
  previousStatusHash: z.string().optional(),
  newStatusHash: z.string().optional(),
})

export type CaseInteraction = z.infer<typeof caseInteractionSchema>

export const createInteractionBodySchema = z.object({
  interactionType: interactionTypeSchema,
  sourceId: z.string().optional(),
  encryptedContent: z.string().optional(),
  contentEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  interactionTypeHash: z.string(),
  previousStatusHash: z.string().optional(),
  newStatusHash: z.string().optional(),
}).refine(
  (data) => {
    // Linked interactions must have sourceId; inline interactions must have content
    if (['note', 'call', 'message'].includes(data.interactionType)) {
      return !!data.sourceId
    }
    if (data.interactionType === 'comment') {
      return !!data.encryptedContent
    }
    return true
  },
  { message: 'Linked interactions require sourceId; comments require encryptedContent' },
)

export const listInteractionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  interactionTypeHash: z.string().optional(),
  after: z.string().optional(),         // ISO 8601 timestamp for pagination
  before: z.string().optional(),        // ISO 8601 timestamp for pagination
})

// --- Encrypted payload (client-side only) ---

export const interactionContentSchema = z.object({
  text: z.string(),
  // For status changes:
  previousStatus: z.string().optional(),
  newStatus: z.string().optional(),
  changeReason: z.string().optional(),
  // For referrals:
  referredTo: z.string().optional(),
  referralNotes: z.string().optional(),
  // For assessments:
  assessmentType: z.string().optional(),
  assessmentResult: z.string().optional(),
})
```

#### Task 2: CaseDO Interaction Storage

**File**: `apps/worker/durable-objects/case-do.ts` (extend)

Add interaction storage handlers. Storage key conventions:

```
interaction:{caseId}:{id}                          -> CaseInteraction
idx:interaction:type:{typeHash}:{caseId}:{id}      -> true (type filter)
idx:interaction:source:{sourceId}                  -> { caseId, interactionId } (reverse lookup by source)
idx:interaction:time:{caseId}:{ISO timestamp}:{id} -> true (chronological index)
```

New DORouter handlers:

```typescript
// List interactions for a case (chronological)
this.router.get('/records/:caseId/interactions', async (req) => {
  const { caseId } = req.params
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
  const typeHash = url.searchParams.get('interactionTypeHash')
  const after = url.searchParams.get('after')
  const before = url.searchParams.get('before')

  // Use time index for chronological ordering
  const prefix = `idx:interaction:time:${caseId}:`
  const startKey = after ? `${prefix}${after}` : prefix
  const endKey = before ? `${prefix}${before}` : undefined

  const timeEntries = await this.ctx.storage.list({
    prefix,
    start: startKey,
    end: endKey,
    limit: 1000,
  })

  // Collect interaction IDs in chronological order
  const interactionKeys: string[] = []
  for (const [key] of timeEntries) {
    const parts = key.split(':')
    const interactionId = parts[parts.length - 1]
    interactionKeys.push(`interaction:${caseId}:${interactionId}`)
  }

  // Fetch interactions
  let interactions: CaseInteraction[] = []
  if (interactionKeys.length > 0) {
    const entries = await this.ctx.storage.get(interactionKeys)
    for (const [, value] of entries) {
      if (value) interactions.push(value as CaseInteraction)
    }
  }

  // Filter by type if specified
  if (typeHash) {
    interactions = interactions.filter(i => i.interactionTypeHash === typeHash)
  }

  // Sort chronologically (newest first by default)
  interactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Paginate
  const start = (page - 1) * limit
  const paged = interactions.slice(start, start + limit)

  return json({
    interactions: paged,
    total: interactions.length,
    page,
    limit,
    hasMore: start + limit < interactions.length,
  })
})

// Create interaction
this.router.post('/records/:caseId/interactions', async (req) => {
  const { caseId } = req.params
  const record = await this.ctx.storage.get(`record:${caseId}`)
  if (!record) return json({ error: 'Record not found' }, { status: 404 })

  const body = await req.json()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const interaction: CaseInteraction = {
    id,
    caseId,
    interactionType: body.interactionType,
    sourceId: body.sourceId,
    encryptedContent: body.encryptedContent,
    contentEnvelopes: body.contentEnvelopes,
    authorPubkey: req.headers.get('x-pubkey') ?? '',
    interactionTypeHash: body.interactionTypeHash,
    createdAt: now,
    previousStatusHash: body.previousStatusHash,
    newStatusHash: body.newStatusHash,
  }

  // Store interaction
  await this.ctx.storage.put(`interaction:${caseId}:${id}`, interaction)

  // Build indexes
  await this.ctx.storage.put(
    `idx:interaction:type:${body.interactionTypeHash}:${caseId}:${id}`,
    true,
  )
  await this.ctx.storage.put(
    `idx:interaction:time:${caseId}:${now}:${id}`,
    true,
  )
  if (body.sourceId) {
    await this.ctx.storage.put(
      `idx:interaction:source:${body.sourceId}`,
      { caseId, interactionId: id },
    )
  }

  // Update record interaction count
  const rec = record as Record<string, unknown>
  rec.interactionCount = ((rec.interactionCount as number) ?? 0) + 1
  rec.updatedAt = now
  await this.ctx.storage.put(`record:${caseId}`, rec)

  return json(interaction, { status: 201 })
})

// Check if a source entity is already linked to a case
this.router.get('/interactions/by-source/:sourceId', async (req) => {
  const { sourceId } = req.params
  const entry = await this.ctx.storage.get(`idx:interaction:source:${sourceId}`)
  if (!entry) return json({ linked: false })
  return json({ linked: true, ...(entry as { caseId: string; interactionId: string }) })
})
```

#### Task 3: Auto-Interaction on Note Creation

**File**: `apps/worker/routes/notes.ts` (extend existing note creation route)

When a note is created with an optional `caseId` parameter, automatically create a `note` interaction on that case:

```typescript
// In the existing POST /api/notes handler, after note creation:
if (body.caseId) {
  const dos = getScopedDOs(c.env, c.get('hubId'))

  // Create interaction linking note to case
  const interactionBody = {
    interactionType: 'note',
    sourceId: noteId,
    interactionTypeHash: await blindIndex('interaction_type', 'note'),
  }

  await dos.caseManager.fetch(new Request(
    `http://do/records/${body.caseId}/interactions`,
    {
      method: 'POST',
      headers: { 'x-pubkey': c.get('pubkey') },
      body: JSON.stringify(interactionBody),
    },
  ))
}
```

#### Task 4: Status Change Interaction Auto-Creation

**File**: `apps/worker/durable-objects/case-do.ts` (extend the PATCH /records/:id handler)

When a record's status changes, automatically create a `status_change` interaction:

```typescript
// In the PATCH /records/:id handler:
if (body.statusHash && body.statusHash !== existing.statusHash) {
  const interactionId = crypto.randomUUID()
  const statusInteraction: CaseInteraction = {
    id: interactionId,
    caseId: id,
    interactionType: 'status_change',
    authorPubkey: req.headers.get('x-pubkey') ?? '',
    interactionTypeHash: body.statusChangeTypeHash ?? '',
    createdAt: now,
    previousStatusHash: existing.statusHash,
    newStatusHash: body.statusHash,
    encryptedContent: body.statusChangeContent,
    contentEnvelopes: body.statusChangeEnvelopes,
  }

  await this.ctx.storage.put(`interaction:${id}:${interactionId}`, statusInteraction)
  await this.ctx.storage.put(
    `idx:interaction:time:${id}:${now}:${interactionId}`,
    true,
  )
  // Increment interaction count
  updated.interactionCount = (updated.interactionCount ?? 0) + 1
}
```

#### Task 5: Interaction API Routes

**File**: `apps/worker/routes/records.ts` (extend)

Add interaction routes to the existing records router:

```typescript
// List interactions for a case
records.get('/:id/interactions',
  requirePermission('cases:read-own'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const qs = buildQueryString(c.req.query())
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/interactions?${qs}`),
    )
    return new Response(res.body, res)
  },
)

// Create interaction on a case
records.post('/:id/interactions',
  requirePermission('cases:update-own'),
  validator('json', createInteractionBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/interactions`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify(body),
      }),
    )
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'interactionCreated', c.get('pubkey'), {
      caseId: id,
      interactionType: body.interactionType,
    })
    return new Response(res.body, { ...res, status: 201 })
  },
)
```

#### Task 6: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "interactions": {
    "title": "Timeline",
    "addComment": "Add Comment",
    "commentPlaceholder": "Write a comment...",
    "noInteractions": "No activity yet.",
    "types": {
      "note": "Note",
      "call": "Call",
      "message": "Message",
      "status_change": "Status Change",
      "referral": "Referral",
      "assessment": "Assessment",
      "file_upload": "File Upload",
      "comment": "Comment"
    },
    "statusChanged": "Status changed from {{previous}} to {{new}}",
    "noteLinked": "Note linked to case",
    "callLinked": "Call linked to case",
    "messageLinked": "Conversation linked to case",
    "referredTo": "Referred to {{target}}",
    "assessmentCompleted": "{{type}} assessment completed",
    "fileUploaded": "File uploaded",
    "filterByType": "Filter by type",
    "showAll": "Show all"
  }
}
```

#### Task 7: BDD Feature File

**File**: `packages/test-specs/features/core/case-interactions.feature`

```gherkin
@backend
Feature: Case Interactions & Unified Timeline
  Interactions link existing notes, calls, and conversations to
  cases and provide a chronological timeline of all case activity.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with category "case"
    And a record "arrest_001" of type "arrest_case"

  @cases @interactions
  Scenario: Link an existing note to a case
    Given a note "note_001" exists in RecordsDO
    When admin "admin1" creates a note interaction on "arrest_001" with sourceId "note_001"
    Then the interaction should exist on "arrest_001"
    And the interaction type should be "note"
    And the interaction's sourceId should be "note_001"
    And the record's interactionCount should be 1

  @cases @interactions
  Scenario: Auto-create interaction when note is created with caseId
    When admin "admin1" creates a note with caseId "arrest_001"
    Then a note should be created in RecordsDO
    And a "note" interaction should be auto-created on "arrest_001"
    And the interaction's sourceId should be the new note ID

  @cases @interactions
  Scenario: Create an inline comment on the case timeline
    When admin "admin1" adds a comment to "arrest_001" with encrypted content
    Then the interaction should have type "comment"
    And the interaction should have encrypted content
    And the record's interactionCount should increase by 1

  @cases @interactions
  Scenario: Status change creates a status_change interaction
    Given record "arrest_001" has status "reported"
    When admin "admin1" updates the status to "confirmed"
    Then a "status_change" interaction should be auto-created
    And the interaction should have previousStatusHash and newStatusHash

  @cases @interactions
  Scenario: List interactions in chronological order
    Given "arrest_001" has interactions created at different times:
      | type           | createdAt                |
      | note           | 2026-03-14T10:00:00Z    |
      | comment        | 2026-03-14T11:00:00Z    |
      | status_change  | 2026-03-14T12:00:00Z    |
    When admin "admin1" lists interactions for "arrest_001"
    Then interactions should be returned in reverse chronological order
    And the first interaction should be the status_change

  @cases @interactions
  Scenario: Filter interactions by type
    Given "arrest_001" has note, comment, and status_change interactions
    When admin "admin1" lists interactions with interactionTypeHash for "comment"
    Then only comment interactions should be returned

  @cases @interactions
  Scenario: Paginate interactions
    Given "arrest_001" has 25 interactions
    When admin "admin1" lists interactions with page 1 and limit 10
    Then 10 interactions should be returned
    And hasMore should be true
    When admin "admin1" lists interactions with page 3 and limit 10
    Then 5 interactions should be returned
    And hasMore should be false

  @cases @interactions
  Scenario: Lookup case by source entity ID
    Given a note "note_001" is linked to "arrest_001"
    When admin "admin1" looks up interactions by sourceId "note_001"
    Then the response should indicate the note is linked to "arrest_001"

  @cases @interactions
  Scenario: Creating interaction on nonexistent record fails
    When admin "admin1" tries to create an interaction on a nonexistent record
    Then the response status should be 404

  @cases @interactions
  Scenario: Linked interaction without sourceId is rejected
    When admin "admin1" tries to create a "note" interaction without sourceId
    Then the response status should be 400
    And the error should mention sourceId
```

#### Task 8: Backend Step Definitions

**File**: `tests/steps/backend/case-interactions.steps.ts`

Implement step definitions for all scenarios.

### Phase 2: Desktop UI

Deferred to Epic 332 (Desktop Case Timeline & Evidence Viewer).

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/interactions.ts` | Zod schemas for interaction types |
| `packages/test-specs/features/core/case-interactions.feature` | BDD scenarios |
| `tests/steps/backend/case-interactions.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/case-do.ts` | Add interaction storage, timeline handlers, status change auto-interaction |
| `apps/worker/routes/records.ts` | Add interaction list/create routes |
| `apps/worker/routes/notes.ts` | Add auto-interaction creation when note has caseId |
| `packages/protocol/tools/schema-registry.ts` | Register interaction schemas |
| `packages/i18n/locales/en.json` | Add interactions i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` -- 10 scenarios in `case-interactions.feature`

### Typecheck

`bun run typecheck` -- all new types must compile

## Acceptance Criteria & Test Scenarios

- [ ] Existing notes can be linked to cases as interactions
  -> `packages/test-specs/features/core/case-interactions.feature: "Link an existing note to a case"`
- [ ] Notes created with caseId auto-create interactions
  -> `packages/test-specs/features/core/case-interactions.feature: "Auto-create interaction when note is created with caseId"`
- [ ] Inline comments can be added to the case timeline
  -> `packages/test-specs/features/core/case-interactions.feature: "Create an inline comment on the case timeline"`
- [ ] Status changes auto-create status_change interactions
  -> `packages/test-specs/features/core/case-interactions.feature: "Status change creates a status_change interaction"`
- [ ] Interactions are listed in chronological order
  -> `packages/test-specs/features/core/case-interactions.feature: "List interactions in chronological order"`
- [ ] Interactions can be filtered by type
  -> `packages/test-specs/features/core/case-interactions.feature: "Filter interactions by type"`
- [ ] Interaction listing supports pagination
  -> `packages/test-specs/features/core/case-interactions.feature: "Paginate interactions"`
- [ ] Reverse lookup by source entity ID works
  -> `packages/test-specs/features/core/case-interactions.feature: "Lookup case by source entity ID"`
- [ ] Interactions on nonexistent records are rejected
  -> `packages/test-specs/features/core/case-interactions.feature: "Creating interaction on nonexistent record fails"`
- [ ] Linked interactions require sourceId
  -> `packages/test-specs/features/core/case-interactions.feature: "Linked interaction without sourceId is rejected"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/case-interactions.feature` | New | 10 scenarios for interactions and timeline |
| `tests/steps/backend/case-interactions.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Medium risk**: Auto-interaction on note creation (Task 3) -- modifies the existing note creation flow. Must ensure the interaction creation does not break note creation if CaseDO is unavailable. Mitigated by making the interaction creation fire-and-forget (non-blocking) with error logging.
- **Medium risk**: Status change auto-interaction (Task 4) -- modifies the PATCH handler for records. Must ensure the interaction is created atomically with the status update (within the same DO handler, this is guaranteed since DO storage writes are serial).
- **Low risk**: Interaction schemas (Task 1) -- standard Zod definitions.
- **Low risk**: Routes (Task 5) -- standard CRUD pattern.
- **Medium risk**: Chronological indexing (Task 2) -- the `idx:interaction:time:` prefix uses ISO 8601 timestamps as part of the key, which sorts correctly lexicographically. Must ensure no timestamp collisions (append interaction ID to key for uniqueness).

## Execution

- **Phase 1**: Schemas -> CaseDO interaction handlers -> Auto-interaction on notes -> Status change auto-interaction -> Routes -> i18n -> BDD -> gate
- **Phase 2**: No dedicated UI (Epic 332 handles desktop case timeline)
- **Phase 3**: `bun run test:all`
