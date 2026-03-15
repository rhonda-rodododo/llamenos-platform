# Epic 319: Record Entity & Core CRUD

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 315 (Schema Engine), Epic 316 (Blind Indexes), Epic 318 (Contact Entity)
**Blocks**: Epic 320, 321, 323, 324, 326, 328, 330
**Branch**: `desktop`

## Summary

Build `CaseDO` — a new per-hub Durable Object that stores case/record data for any entity type defined in the schema engine. Records are E2EE with 3-tier encryption (summary/fields/PII), blind-indexed for server-side filtering, and linked to contacts via M:N join with role metadata. Includes case numbering (`JS-2026-0042`), assignment management, status tracking, and CRUD API. This is the core data store for the entire case management system. ~25 files created/modified.

## Problem Statement

The schema engine (Epic 315) defines what entity types exist and what fields they have. The contact entity (Epic 318) stores people. This epic provides the storage and API layer for the actual case/record data — the instances of those entity types. Without this, there are definitions but no data.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: CaseDO

**File**: `apps/worker/durable-objects/case-do.ts` (new)

Per-hub Durable Object for case/record storage. Storage key conventions:

```
record:{id}                           → Record (the case/record data)
recordcontact:{recordId}:{contactId}  → RecordContact (M:N join with role)
contactrecords:{contactId}:{recordId} → RecordContact (reverse index)
idx:status:{statusHash}:{recordId}    → true (status filter index)
idx:severity:{severityHash}:{recordId}→ true (severity filter index)
idx:assigned:{pubkey}:{recordId}      → true (assignment index)
idx:type:{entityTypeId}:{recordId}    → true (entity type index)
idx:number:{caseNumber}               → recordId (case number lookup)
```

Core record type:

```typescript
interface Record {
  id: string
  hubId: string
  entityTypeId: string              // References EntityTypeDefinition.id
  caseNumber?: string               // "JS-2026-0042" (if numbering enabled)

  // --- Blind indexes (server-filterable) ---
  statusHash: string
  severityHash?: string
  categoryHash?: string
  assignedTo: string[]              // Pubkeys of assigned volunteers
  blindIndexes: Record<string, string | string[]>

  // --- E2EE 3-tier content ---
  encryptedSummary: string          // Tier 1: title, status text, category
  summaryEnvelopes: RecipientEnvelope[]

  encryptedFields?: string          // Tier 2: all custom field values
  fieldEnvelopes?: RecipientEnvelope[]

  encryptedPII?: string             // Tier 3: sensitive fields (names, phones)
  piiEnvelopes?: RecipientEnvelope[]

  // --- Relationships ---
  contactCount: number
  interactionCount: number
  fileCount: number
  eventIds: string[]
  parentRecordId?: string           // For sub-records

  // --- Timestamps ---
  createdAt: string
  updatedAt: string
  closedAt?: string
  createdBy: string                 // Author pubkey
}
```

DORouter handlers for:
- `GET /records` — list with pagination + blind index filters + entity type filter
- `GET /records/:id` — get single record
- `POST /records` — create record (generates case number if applicable)
- `PATCH /records/:id` — update record (re-encrypt, update blind indexes)
- `DELETE /records/:id` — soft-delete (archive)
- `POST /records/:id/contacts` — link contact to record with role
- `DELETE /records/:id/contacts/:contactId` — unlink contact
- `GET /records/:id/contacts` — list contacts linked to record
- `POST /records/:id/assign` — assign volunteer(s)
- `POST /records/:id/unassign` — unassign volunteer
- `GET /records/by-number/:number` — lookup by case number

#### Task 2: Record Schemas

**File**: `apps/worker/schemas/records.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema, paginationSchema } from './common'

export const recordSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  entityTypeId: z.uuid(),
  caseNumber: z.string().optional(),
  statusHash: z.string(),
  severityHash: z.string().optional(),
  categoryHash: z.string().optional(),
  assignedTo: z.array(z.string()),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  encryptedFields: z.string().optional(),
  fieldEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  contactCount: z.number(),
  interactionCount: z.number(),
  fileCount: z.number(),
  eventIds: z.array(z.string()),
  parentRecordId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
  createdBy: z.string(),
})

export const createRecordBodySchema = z.object({
  entityTypeId: z.uuid(),
  statusHash: z.string(),
  severityHash: z.string().optional(),
  categoryHash: z.string().optional(),
  assignedTo: z.array(z.string()).default([]),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  encryptedSummary: z.string().min(1),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  encryptedFields: z.string().optional(),
  fieldEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  parentRecordId: z.uuid().optional(),
  contactLinks: z.array(z.object({
    contactId: z.uuid(),
    role: z.string(),
  })).optional(),
})

export const updateRecordBodySchema = createRecordBodySchema.partial()

export const listRecordsQuerySchema = paginationSchema.extend({
  entityTypeId: z.string().optional(),
  statusHash: z.string().optional(),
  severityHash: z.string().optional(),
  assignedTo: z.string().optional(),
  parentRecordId: z.string().optional(),
})

export const recordContactSchema = z.object({
  recordId: z.uuid(),
  contactId: z.uuid(),
  role: z.string(),
  addedAt: z.string(),
  addedBy: z.string(),
})

export const linkContactBodySchema = z.object({
  contactId: z.uuid(),
  role: z.string(),
})

export const assignBodySchema = z.object({
  pubkeys: z.array(z.string()).min(1),
})

// Encrypted payloads (client-side only)
export const recordSummarySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  severity: z.string().optional(),
  category: z.string().optional(),
})

export const recordFieldValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
)
```

#### Task 3: Wrangler Binding + DO Access

**File**: `apps/worker/wrangler.jsonc`

```jsonc
{ "name": "CASE_MANAGER", "class_name": "CaseDO" }
// Both ContactDirectoryDO (Epic 318) and CaseDO ship in the same deployment.
// Add to migration tag v6 alongside ContactDirectoryDO:
// { "tag": "v6", "new_classes": ["ContactDirectoryDO", "CaseDO"] }
```

**File**: `apps/worker/lib/do-access.ts`

```typescript
caseManager: env.CASE_MANAGER.get(
  env.CASE_MANAGER.idFromName(hubId ?? 'global-cases')
),
```

#### Task 4: Record API Routes

**File**: `apps/worker/routes/records.ts` (new)

Full CRUD routes following the same patterns as contacts-v2.ts. Key routes:

- `GET /api/records` — list with entity type + blind index filters
- `GET /api/records/:id` — get single record
- `POST /api/records` — create (generates case number via SettingsDO)
- `PATCH /api/records/:id` — update (re-indexes blind indexes)
- `DELETE /api/records/:id` — archive
- `POST /api/records/:id/contacts` — link contact with role
- `DELETE /api/records/:id/contacts/:contactId` — unlink
- `GET /api/records/:id/contacts` — list linked contacts
- `POST /api/records/:id/assign` — assign volunteers
- `POST /api/records/:id/unassign` — unassign
- `GET /api/records/by-number/:number` — lookup by case number

Permission enforcement:
- `cases:create` for POST
- `cases:read-own` / `cases:read-assigned` / `cases:read-all` for GET (filtered by assignment)
- `cases:update-own` / `cases:update` for PATCH
- `cases:assign` for assign/unassign
- `cases:delete` for DELETE

#### Task 5: Nostr Event Kinds

**File**: `packages/shared/nostr-events.ts`

```typescript
export const KIND_RECORD_CREATED = 1020
export const KIND_RECORD_UPDATED = 1021
export const KIND_RECORD_ASSIGNED = 1022
```

Publish on record create, update, and assignment changes.

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/records.feature`

```gherkin
@backend
Feature: Case/Record Management
  Create, read, update, and manage case records with E2EE content,
  blind index filtering, case numbering, and contact linking.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with numberPrefix "JS"

  @cases
  Scenario: Create a record with encrypted content
    When admin "admin1" creates a record of type "arrest_case" with:
      | title    | John Doe arrest at Main & 5th |
      | status   | reported                       |
      | severity | standard                       |
    Then the record should exist with a generated UUID
    And the record should have a case number matching "JS-{year}-0001"
    And the record should have encrypted summary content
    And the record should have status blind index

  @cases
  Scenario: List records filtered by entity type
    Given records of type "arrest_case" and "medical_encounter" exist
    When admin "admin1" lists records with entityTypeId for "arrest_case"
    Then only "arrest_case" records should be returned

  @cases
  Scenario: Filter records by status blind index
    Given arrest cases with statuses "reported", "confirmed", "released"
    When admin "admin1" filters by statusHash for "reported"
    Then only records with status "reported" should be returned

  @cases
  Scenario: Link contact to record with role
    Given an arrest case record exists
    And a contact "Carlos Martinez" exists
    When admin "admin1" links "Carlos Martinez" to the record as "arrestee"
    Then the record should have 1 linked contact
    And the contact role should be "arrestee"

  @cases
  Scenario: Assign volunteer to record
    Given a registered volunteer "vol1"
    And an arrest case record exists
    When admin "admin1" assigns "vol1" to the record
    Then the record's assignedTo should include "vol1"
    And a record assignment event should be published

  @cases
  Scenario: Volunteer reads only assigned records
    Given a registered volunteer "vol1"
    And record "A" assigned to "vol1"
    And record "B" not assigned to "vol1"
    When volunteer "vol1" lists records
    Then only record "A" should be returned

  @cases
  Scenario: Case number auto-increments
    When admin "admin1" creates 3 records of type "arrest_case"
    Then case numbers should be "JS-{year}-0001", "JS-{year}-0002", "JS-{year}-0003"

  @cases
  Scenario: Update record re-encrypts and re-indexes
    Given a record with status "reported"
    When admin "admin1" updates the status to "confirmed"
    Then the record should have new encrypted summary
    And the status blind index should be updated

  @cases
  Scenario: Lookup record by case number
    Given a record with case number "JS-2026-0042"
    When admin "admin1" looks up "JS-2026-0042"
    Then the correct record should be returned

  @cases @permissions
  Scenario: Reporter cannot create records
    Given a registered reporter "rep1"
    When reporter "rep1" tries to create a record
    Then the response status should be 403
```

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/durable-objects/case-do.ts` | CaseDO with full CRUD + indexes |
| `apps/worker/schemas/records.ts` | Zod schemas for record types |
| `apps/worker/routes/records.ts` | API routes for record management |
| `packages/test-specs/features/core/records.feature` | BDD scenarios |
| `tests/steps/backend/records.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/wrangler.jsonc` | Add CASE_MANAGER binding |
| `apps/worker/lib/do-access.ts` | Add caseManager to getScopedDOs |
| `apps/worker/app.ts` | Mount records routes |
| `packages/shared/nostr-events.ts` | Add KIND_RECORD_CREATED/UPDATED/ASSIGNED |
| `packages/protocol/tools/schema-registry.ts` | Register record schemas |
| `packages/i18n/locales/en.json` | Add records i18n section |

## Acceptance Criteria & Test Scenarios

- [ ] Records can be created with E2EE 3-tier content -> `"Create a record with encrypted content"`
- [ ] Records filterable by entity type -> `"List records filtered by entity type"`
- [ ] Status blind index filtering works -> `"Filter records by status blind index"`
- [ ] Contacts linkable to records with roles -> `"Link contact to record with role"`
- [ ] Assignment management works -> `"Assign volunteer to record"`
- [ ] Volunteers see only assigned records -> `"Volunteer reads only assigned records"`
- [ ] Case numbering auto-increments -> `"Case number auto-increments"`
- [ ] Updates re-encrypt and re-index -> `"Update record re-encrypts and re-indexes"`
- [ ] Case number lookup works -> `"Lookup record by case number"`
- [ ] Permission enforcement -> `"Reporter cannot create records"`
- [ ] All platform BDD suites pass
- [ ] Backlog files updated

## Risk Assessment

- **High risk**: CaseDO (Task 1) — the most complex DO in the system. Must handle 1000+ records during mass arrests. Mitigated by per-record storage keys (no array bottleneck) and prefix-scan indexes.
- **Medium risk**: 3-tier encryption (Tasks 1-2) — three encrypted blobs per record with different envelope sets. Must correctly determine who gets which tier's envelopes.
- **Low risk**: Routes (Task 4) — standard pattern, follows contacts-v2 and reports

## Execution

- **Phase 1**: CaseDO → Schemas → Wrangler → DO access → Routes → Nostr events → BDD → gate
- **Phase 2**: No dedicated UI (Epic 330 handles desktop case management UI)
- **Phase 3**: `bun run test:all`
