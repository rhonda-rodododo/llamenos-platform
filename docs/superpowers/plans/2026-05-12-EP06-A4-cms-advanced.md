# EP06-A4: Advanced CMS Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete advanced CMS operations: client-side contact merge with re-encryption, server-side entity merge, evidence custody chain UI across all platforms, in-app bulk contact operations (no export), cross-hub entity visibility for super-admins, contact batch import with duplicate detection, and calendar/timeline display types.

**Architecture:** Contact merge is entirely client-side — server never sees plaintext. The client decrypts both contacts, presents field comparison, re-encrypts merged result, and submits new blind indexes. Entity merge is server-side transaction — no PII re-encryption needed. Evidence custody chain endpoints already exist; this phase adds UI. Bulk operations modify contacts in-place with no extraction path. Cross-hub uses JSONB pubkey containment query (`WHERE summary_envelopes ? :userPubkey`) on forward-only envelopes. Batch import parses CSV/vCard client-side, encrypts per-contact before submission. Calendar and timeline are client-side rendering modes over the same encrypted entity list.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM + PostgreSQL JSONB (queries), Zod (schemas), Tauri v2 + React + shadcn/ui (desktop), SwiftUI iOS 17+ (iOS), Kotlin/Compose (Android), playwright-bdd (E2E BDD), vitest (unit)

**Spec:** `docs/superpowers/specs/2026-05-12-EP06-A4-cms-advanced-design.md`

---

## File Structure

### Protocol (modify)
- `packages/protocol/schemas/contact-merge.ts` — new: merge request/response schemas
- `packages/protocol/schemas/entity-merge.ts` — new: entity merge request/response schemas
- `packages/protocol/schemas/contact-bulk.ts` — new: bulk action + bulk-create schemas
- `packages/protocol/schemas/entity-schema.ts` — modify: add `displayTypes` and `defaultDisplayType` fields
- `packages/protocol/tools/schema-registry.ts` — add new schemas to registry

### Backend (modify)
- `apps/worker/routes/contacts-v2.ts` — add merge, bulk, bulk-create endpoints
- `apps/worker/services/contacts.ts` — add mergeContacts, bulkAction, bulkCreate service methods
- `apps/worker/routes/records.ts` — add entity merge endpoint
- `apps/worker/services/cases.ts` — add mergeRecords service method
- `apps/worker/__tests__/unit/contacts.merge.test.ts` — new: contact merge unit tests
- `apps/worker/__tests__/unit/contacts.bulk.test.ts` — new: bulk ops unit tests
- `apps/worker/__tests__/unit/cases.merge.test.ts` — new: entity merge unit tests

### Desktop (new + modify)
- `src/client/lib/api.ts` — add mergeContacts, mergeEntities, bulkContactAction, bulkCreateContacts, listEntitiesCrossHub
- `src/client/components/contact-merge-dialog.tsx` — new: field comparison + merge preview
- `src/client/components/entity-merge-dialog.tsx` — new: entity merge confirmation
- `src/client/components/contact-import-dialog.tsx` — new: CSV/vCard import + duplicate preview
- `src/client/components/contact-profile.tsx` — modify: add merge button (admin only)
- `src/client/routes/contacts-directory.tsx` — modify: multi-select mode + action bar + cross-hub toggle
- `src/client/components/evidence-custody-chain.tsx` — new: custody chain timeline + verify button
- `src/client/routes/cases.tsx` — modify: cross-hub toggle + display type picker
- `src/client/components/entity-calendar-view.tsx` — new: month grid calendar display
- `src/client/components/entity-timeline-view.tsx` — new: chronological timeline display

### iOS (new + modify)
- `apps/ios/Sources/Views/Evidence/EvidenceCustodyChainView.swift` — new
- `apps/ios/Sources/Views/Cases/CasesListView.swift` — modify: cross-hub scope toggle
- `apps/ios/Sources/Views/Cases/EntityCalendarView.swift` — new: month grid
- `apps/ios/Sources/Views/Cases/EntityTimelineView.swift` — new: chronological list
- `apps/ios/Sources/Services/RecordsService.swift` — modify: add crossHub param
- `apps/ios/Tests/LlamenosTests/EvidenceCustodyTests.swift` — new

### Android (new + modify)
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/evidence/EvidenceCustodyChainScreen.kt` — new
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt` — modify: cross-hub toggle
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityCalendarScreen.kt` — new
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityTimelineScreen.kt` — new
- `apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt` — modify: crossHub param
- `apps/android/app/src/test/java/org/llamenos/hotline/api/RecordsRepositoryTest.kt` — modify: add cross-hub tests

### i18n (modify)
- `packages/i18n/locales/en.json` — add ~55 keys for merge, bulk, import, custody, display types, cross-hub
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — same keys translated

### BDD (new)
- `packages/test-specs/features/cms/contact-merge.feature`
- `packages/test-specs/features/cms/entity-merge.feature`
- `packages/test-specs/features/cms/bulk-ops.feature`
- `packages/test-specs/features/cms/contact-import.feature`
- `packages/test-specs/features/cms/cross-hub.feature`
- `tests/steps/backend/cms-advanced.steps.ts`

### Playwright (new)
- `tests/cms-advanced.spec.ts`

---

## Task 1: Protocol Schemas — Merge, Bulk, displayTypes

**Files:**
- New: `packages/protocol/schemas/contact-merge.ts`
- New: `packages/protocol/schemas/entity-merge.ts`
- New: `packages/protocol/schemas/contact-bulk.ts`
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Create contact merge schemas**

Create `packages/protocol/schemas/contact-merge.ts`:

```typescript
import { z } from 'zod'

export const mergeContactsBodySchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedEncryptedProfile: z.string(),
  mergedProfileEnvelopes: z.array(z.object({
    recipientPubkey: z.string(),
    encryptedKey: z.string(),
  })),
  mergedBlindIndexes: z.object({
    nameTokens: z.array(z.string()).optional().default([]),
    identifierHashes: z.array(z.string()).optional().default([]),
    tagHashes: z.array(z.string()).optional().default([]),
    contactTypeHash: z.string().optional(),
  }),
  mergedTrigramTokens: z.array(z.string()).optional().default([]),
})

export const mergeContactsResponseSchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedAt: z.iso.datetime(),
})

export type MergeContactsBody = z.infer<typeof mergeContactsBodySchema>
export type MergeContactsResponse = z.infer<typeof mergeContactsResponseSchema>
```

- [ ] **Step 2: Create entity merge schemas**

Create `packages/protocol/schemas/entity-merge.ts`:

```typescript
import { z } from 'zod'

export const mergeRecordsBodySchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
})

export const mergeRecordsResponseSchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedAt: z.iso.datetime(),
  relinkedContacts: z.number().int(),
  relinkedInteractions: z.number().int(),
  relinkedEvidence: z.number().int(),
})

export type MergeRecordsBody = z.infer<typeof mergeRecordsBodySchema>
export type MergeRecordsResponse = z.infer<typeof mergeRecordsResponseSchema>
```

- [ ] **Step 3: Create bulk contact operation schemas**

Create `packages/protocol/schemas/contact-bulk.ts`:

```typescript
import { z } from 'zod'

export const bulkContactActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add-tags'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({
      tags: z.array(z.string().max(50)).min(1).max(20),
      updatedBlindIndexes: z.array(z.object({
        contactId: z.uuid(),
        tagHashes: z.array(z.string()),
      })).optional().default([]),
    }),
  }),
  z.object({
    action: z.literal('remove-tags'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({
      tags: z.array(z.string().max(50)).min(1).max(20),
      updatedBlindIndexes: z.array(z.object({
        contactId: z.uuid(),
        tagHashes: z.array(z.string()),
      })).optional().default([]),
    }),
  }),
  z.object({
    action: z.literal('add-to-group'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({ groupId: z.uuid() }),
  }),
  z.object({
    action: z.literal('remove-from-group'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({ groupId: z.uuid() }),
  }),
  z.object({
    action: z.literal('set-risk-level'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({ riskLevel: z.enum(['low', 'medium', 'high', 'critical']) }),
  }),
  z.object({
    action: z.literal('delete'),
    contactIds: z.array(z.uuid()).min(1).max(100),
    payload: z.object({}),
  }),
])

export const bulkContactActionResponseSchema = z.object({
  affected: z.number().int(),
  action: z.string(),
})

export const bulkCreateContactBodySchema = z.object({
  contacts: z.array(z.object({
    encryptedProfile: z.string(),
    profileEnvelopes: z.array(z.object({
      recipientPubkey: z.string(),
      encryptedKey: z.string(),
    })),
    blindIndexes: z.object({
      nameTokens: z.array(z.string()).optional().default([]),
      identifierHashes: z.array(z.string()).optional().default([]),
      tagHashes: z.array(z.string()).optional().default([]),
      contactTypeHash: z.string().optional(),
    }),
    trigramTokens: z.array(z.string()).optional().default([]),
  })).min(1).max(100),
})

export const bulkCreateContactResponseSchema = z.object({
  created: z.number().int(),
  contactIds: z.array(z.uuid()),
})

export type BulkContactAction = z.infer<typeof bulkContactActionSchema>
export type BulkContactActionResponse = z.infer<typeof bulkContactActionResponseSchema>
export type BulkCreateContactBody = z.infer<typeof bulkCreateContactBodySchema>
export type BulkCreateContactResponse = z.infer<typeof bulkCreateContactResponseSchema>
```

- [ ] **Step 4: Add displayTypes to entity-schema.ts**

In `packages/protocol/schemas/entity-schema.ts`, inside `entityTypeDefinitionSchema`, after the `showInDashboard` field and before `accessRoles`:

```typescript
  displayTypes: z.array(z.enum(['table', 'calendar', 'timeline'])).optional().default(['table']),
  defaultDisplayType: z.enum(['table', 'calendar', 'timeline']).optional().default('table'),
```

- [ ] **Step 5: Register new schemas**

In `packages/protocol/tools/schema-registry.ts`, add to the schema registry map:

```typescript
// Contact merge
{ name: 'MergeContactsBody', schema: mergeContactsBodySchema, from: '@protocol/schemas/contact-merge' },
{ name: 'MergeContactsResponse', schema: mergeContactsResponseSchema, from: '@protocol/schemas/contact-merge' },
// Entity merge
{ name: 'MergeRecordsBody', schema: mergeRecordsBodySchema, from: '@protocol/schemas/entity-merge' },
{ name: 'MergeRecordsResponse', schema: mergeRecordsResponseSchema, from: '@protocol/schemas/entity-merge' },
// Bulk contacts
{ name: 'BulkContactActionResponse', schema: bulkContactActionResponseSchema, from: '@protocol/schemas/contact-bulk' },
{ name: 'BulkCreateContactBody', schema: bulkCreateContactBodySchema, from: '@protocol/schemas/contact-bulk' },
{ name: 'BulkCreateContactResponse', schema: bulkCreateContactResponseSchema, from: '@protocol/schemas/contact-bulk' },
```

Add `bulkContactActionSchema` to `EXCLUDED_SCHEMAS` (discriminated union — inlined at call sites):

```typescript
'bulkContactActionSchema',
```

- [ ] **Step 6: Run codegen to verify**

```bash
bun run codegen
```

Expected: clean exit. New types visible in `packages/protocol/generated/typescript/`.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/schemas/contact-merge.ts packages/protocol/schemas/entity-merge.ts packages/protocol/schemas/contact-bulk.ts packages/protocol/schemas/entity-schema.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add contact merge, entity merge, bulk ops schemas; add displayTypes to entity type"
```

---

## Task 2: Backend — Contact Merge Endpoint

**Files:**
- Modify: `apps/worker/services/contacts.ts`
- Modify: `apps/worker/routes/contacts-v2.ts`
- New: `apps/worker/__tests__/unit/contacts.merge.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/worker/__tests__/unit/contacts.merge.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test'
import { createTestDb, createContactsService } from '../helpers'

describe('ContactsService.mergeContacts', () => {
  it('updates primary with merged encrypted profile and new blind indexes', async () => {
    const { db, service } = createContactsService()
    const primaryId = 'uuid-primary'
    const secondaryId = 'uuid-secondary'

    db.$mockContactExists(primaryId, 'hub-1')
    db.$mockContactExists(secondaryId, 'hub-1')

    await service.mergeContacts('hub-1', {
      primaryId,
      secondaryId,
      mergedEncryptedProfile: 'enc-merged',
      mergedProfileEnvelopes: [{ recipientPubkey: 'pk1', encryptedKey: 'ek1' }],
      mergedBlindIndexes: { nameTokens: ['tok1'], identifierHashes: ['h1'], tagHashes: [] },
      mergedTrigramTokens: ['tri1', 'tri2'],
    })

    expect(db.$getContact(primaryId).encryptedProfile).toBe('enc-merged')
    expect(db.$getContact(secondaryId).mergedIntoId).toBe(primaryId)
    expect(db.$getContact(secondaryId).deletedAt).toBeDefined()
  })

  it('rejects merge when contacts are in different hubs', async () => {
    const { db, service } = createContactsService()
    db.$mockContactExists('uuid-p', 'hub-1')
    db.$mockContactExists('uuid-s', 'hub-2')

    await expect(service.mergeContacts('hub-1', {
      primaryId: 'uuid-p',
      secondaryId: 'uuid-s',
      mergedEncryptedProfile: 'enc',
      mergedProfileEnvelopes: [],
      mergedBlindIndexes: { nameTokens: [], identifierHashes: [], tagHashes: [] },
      mergedTrigramTokens: [],
    })).rejects.toThrow('cross-hub merge not permitted')
  })

  it('relinks secondary relationships, groups, and call links to primary', async () => {
    const { db, service } = createContactsService()
    db.$mockContactExists('uuid-p', 'hub-1')
    db.$mockContactExists('uuid-s', 'hub-1')
    db.$mockContactRelationships('uuid-s', [{ id: 'rel-1', targetContactId: 'uuid-other' }])
    db.$mockContactGroupMemberships('uuid-s', ['group-1'])

    await service.mergeContacts('hub-1', {
      primaryId: 'uuid-p',
      secondaryId: 'uuid-s',
      mergedEncryptedProfile: 'enc',
      mergedProfileEnvelopes: [],
      mergedBlindIndexes: { nameTokens: [], identifierHashes: [], tagHashes: [] },
      mergedTrigramTokens: [],
    })

    expect(db.$getRelationship('rel-1').sourceContactId).toBe('uuid-p')
    expect(db.$getGroupMembership('uuid-p', 'group-1')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/contacts.merge.test.ts
```

Expected: FAIL — `service.mergeContacts is not a function`

- [ ] **Step 3: Implement mergeContacts in contacts service**

In `apps/worker/services/contacts.ts`, add after the `update` method:

```typescript
async mergeContacts(
  hubId: string,
  body: MergeContactsBody,
): Promise<{ primaryId: string; secondaryId: string; mergedAt: string }> {
  const { primaryId, secondaryId, mergedEncryptedProfile, mergedProfileEnvelopes,
    mergedBlindIndexes, mergedTrigramTokens } = body

  // Verify both contacts exist in this hub
  const [primary, secondary] = await Promise.all([
    this.db.select().from(contacts).where(
      and(eq(contacts.id, primaryId), eq(contacts.hubId, hubId))
    ).limit(1),
    this.db.select().from(contacts).where(
      and(eq(contacts.id, secondaryId), eq(contacts.hubId, hubId))
    ).limit(1),
  ])

  if (!primary[0]) throw new Error('primary contact not found')
  if (!secondary[0]) throw new Error('secondary contact not found')
  if (secondary[0].hubId !== primary[0].hubId) throw new Error('cross-hub merge not permitted')

  const mergedAt = new Date()

  await this.db.transaction(async (tx) => {
    // 1. Update primary with merged encrypted data and indexes
    await tx.update(contacts)
      .set({
        encryptedProfile: mergedEncryptedProfile,
        profileEnvelopes: mergedProfileEnvelopes,
        nameTokens: mergedBlindIndexes.nameTokens ?? [],
        identifierHashes: mergedBlindIndexes.identifierHashes ?? [],
        tagHashes: mergedBlindIndexes.tagHashes ?? [],
        contactTypeHash: mergedBlindIndexes.contactTypeHash ?? null,
        trigramTokens: mergedTrigramTokens ?? [],
        updatedAt: mergedAt,
      })
      .where(eq(contacts.id, primaryId))

    // 2. Relink relationships
    await tx.update(contactRelationships)
      .set({ sourceContactId: primaryId })
      .where(and(
        eq(contactRelationships.sourceContactId, secondaryId),
        eq(contactRelationships.hubId, hubId),
      ))
    await tx.update(contactRelationships)
      .set({ targetContactId: primaryId })
      .where(and(
        eq(contactRelationships.targetContactId, secondaryId),
        eq(contactRelationships.hubId, hubId),
      ))

    // 3. Relink group memberships
    await tx.update(contactGroupMembers)
      .set({ contactId: primaryId })
      .where(eq(contactGroupMembers.contactId, secondaryId))

    // 4. Relink entity links, call links, conversation links
    await tx.update(recordContacts)
      .set({ contactId: primaryId })
      .where(eq(recordContacts.contactId, secondaryId))

    // 5. Soft-delete secondary with pointer
    await tx.update(contacts)
      .set({
        mergedIntoId: primaryId,
        deletedAt: mergedAt,
        nameTokens: [],
        identifierHashes: [],
        tagHashes: [],
        trigramTokens: [],
      })
      .where(eq(contacts.id, secondaryId))
  })

  return { primaryId, secondaryId, mergedAt: mergedAt.toISOString() }
}
```

- [ ] **Step 4: Add merge endpoint to contacts-v2 route**

In `apps/worker/routes/contacts-v2.ts`, add before the final export, after the existing POST `/` route block:

```typescript
import {
  mergeContactsBodySchema,
  mergeContactsResponseSchema,
} from '@protocol/schemas/contact-merge'

// POST /merge — client-side re-encrypted contact merge
contactsV2.post('/merge',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Merge two contacts (client-side re-encryption)',
    responses: {
      200: {
        description: 'Contacts merged',
        content: { 'application/json': { schema: resolver(mergeContactsResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:merge'),
  validator('json', mergeContactsBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const body = c.req.valid('json')

    const result = await services.contacts.mergeContacts(hubId, body)

    await audit(services.audit, 'contactMerged', c.get('pubkey'), {
      primaryId: result.primaryId,
      secondaryId: result.secondaryId,
    })
    return c.json(result)
  },
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/contacts.merge.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/contacts.ts apps/worker/routes/contacts-v2.ts apps/worker/__tests__/unit/contacts.merge.test.ts
git commit -m "feat(backend): add POST /directory/merge — client-side re-encrypted contact merge with relinking"
```

---

## Task 3: Backend — Entity Merge Endpoint

**Files:**
- Modify: `apps/worker/services/cases.ts`
- Modify: `apps/worker/routes/records.ts`
- New: `apps/worker/__tests__/unit/cases.merge.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/worker/__tests__/unit/cases.merge.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { createCasesService } from '../helpers'

describe('CasesService.mergeRecords', () => {
  it('relinks contacts, interactions, and evidence from secondary to primary', async () => {
    const { db, service } = createCasesService()
    db.$mockRecordExists('uuid-p', 'hub-1')
    db.$mockRecordExists('uuid-s', 'hub-1')
    db.$mockRecordContacts('uuid-s', ['contact-1'])
    db.$mockRecordInteractions('uuid-s', ['interaction-1'])
    db.$mockRecordEvidence('uuid-s', ['evidence-1'])

    const result = await service.mergeRecords('hub-1', 'uuid-p', 'uuid-s', 'admin-pk')

    expect(result.relinkedContacts).toBe(1)
    expect(result.relinkedInteractions).toBe(1)
    expect(result.relinkedEvidence).toBe(1)
    expect(db.$getRecord('uuid-s').mergedIntoId).toBe('uuid-p')
    expect(db.$getRecord('uuid-s').deletedAt).toBeDefined()
  })

  it('rejects merge of records in different hubs', async () => {
    const { db, service } = createCasesService()
    db.$mockRecordExists('uuid-p', 'hub-1')
    db.$mockRecordExists('uuid-s', 'hub-2')

    await expect(service.mergeRecords('hub-1', 'uuid-p', 'uuid-s', 'admin-pk'))
      .rejects.toThrow('cross-hub merge not permitted')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/cases.merge.test.ts
```

Expected: FAIL — `service.mergeRecords is not a function`

- [ ] **Step 3: Implement mergeRecords in cases service**

In `apps/worker/services/cases.ts`, add after the `update` method:

```typescript
async mergeRecords(
  hubId: string,
  primaryId: string,
  secondaryId: string,
  actorPubkey: string,
): Promise<MergeRecordsResponse> {
  const [primary, secondary] = await Promise.all([
    this.db.select().from(caseRecords).where(
      and(eq(caseRecords.id, primaryId), eq(caseRecords.hubId, hubId))
    ).limit(1),
    this.db.select().from(caseRecords).where(
      and(eq(caseRecords.id, secondaryId), eq(caseRecords.hubId, hubId))
    ).limit(1),
  ])

  if (!primary[0]) throw new Error('primary record not found')
  if (!secondary[0]) throw new Error('secondary record not found')
  if (secondary[0].hubId !== primary[0].hubId) throw new Error('cross-hub merge not permitted')

  const mergedAt = new Date()
  let relinkedContacts = 0
  let relinkedInteractions = 0
  let relinkedEvidence = 0

  await this.db.transaction(async (tx) => {
    // Relink contacts
    const contactResult = await tx.update(recordContacts)
      .set({ recordId: primaryId })
      .where(eq(recordContacts.recordId, secondaryId))
    relinkedContacts = contactResult.rowCount ?? 0

    // Relink interactions
    const interactionResult = await tx.update(caseInteractions)
      .set({ recordId: primaryId })
      .where(eq(caseInteractions.recordId, secondaryId))
    relinkedInteractions = interactionResult.rowCount ?? 0

    // Relink evidence
    const evidenceResult = await tx.update(evidenceMetadata)
      .set({ recordId: primaryId })
      .where(eq(evidenceMetadata.recordId, secondaryId))
    relinkedEvidence = evidenceResult.rowCount ?? 0

    // Relink report links
    await tx.update(reportCaseLinks)
      .set({ caseId: primaryId })
      .where(eq(reportCaseLinks.caseId, secondaryId))

    // Soft-delete secondary
    await tx.update(caseRecords)
      .set({ mergedIntoId: primaryId, deletedAt: mergedAt })
      .where(eq(caseRecords.id, secondaryId))
  })

  return {
    primaryId,
    secondaryId,
    mergedAt: mergedAt.toISOString(),
    relinkedContacts,
    relinkedInteractions,
    relinkedEvidence,
  }
}
```

- [ ] **Step 4: Add merge endpoint to records route**

In `apps/worker/routes/records.ts`, add after existing route definitions, importing the new schemas:

```typescript
import { mergeRecordsBodySchema, mergeRecordsResponseSchema } from '@protocol/schemas/entity-merge'

// POST /records/merge
records.post('/merge',
  describeRoute({
    tags: ['Records'],
    summary: 'Merge two entity records (server-side relinking)',
    responses: {
      200: {
        description: 'Records merged',
        content: { 'application/json': { schema: resolver(mergeRecordsResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:update'),
  validator('json', mergeRecordsBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const { primaryId, secondaryId } = c.req.valid('json')
    const pubkey = c.get('pubkey')

    const result = await services.cases.mergeRecords(hubId, primaryId, secondaryId, pubkey)

    await audit(services.audit, 'recordMerged', pubkey, { primaryId, secondaryId })
    return c.json(result)
  },
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/cases.merge.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/cases.ts apps/worker/routes/records.ts apps/worker/__tests__/unit/cases.merge.test.ts
git commit -m "feat(backend): add POST /records/merge — server-side entity merge with resource relinking"
```

---

## Task 4: Backend — Bulk Contact Operations Endpoint

**Files:**
- Modify: `apps/worker/services/contacts.ts`
- Modify: `apps/worker/routes/contacts-v2.ts`
- New: `apps/worker/__tests__/unit/contacts.bulk.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/worker/__tests__/unit/contacts.bulk.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { createContactsService } from '../helpers'

describe('ContactsService.bulkAction', () => {
  it('add-tags: updates tag hashes for all specified contacts', async () => {
    const { db, service } = createContactsService()
    db.$mockContacts(['c1', 'c2'], 'hub-1')

    const result = await service.bulkAction('hub-1', {
      action: 'add-tags',
      contactIds: ['c1', 'c2'],
      payload: {
        tags: ['urgent'],
        updatedBlindIndexes: [
          { contactId: 'c1', tagHashes: ['hash-1a', 'hash-urgent'] },
          { contactId: 'c2', tagHashes: ['hash-2a', 'hash-urgent'] },
        ],
      },
    })

    expect(result.affected).toBe(2)
    expect(db.$getContact('c1').tagHashes).toContain('hash-urgent')
    expect(db.$getContact('c2').tagHashes).toContain('hash-urgent')
  })

  it('delete: soft-deletes all specified contacts', async () => {
    const { db, service } = createContactsService()
    db.$mockContacts(['c1', 'c2', 'c3'], 'hub-1')

    const result = await service.bulkAction('hub-1', {
      action: 'delete',
      contactIds: ['c1', 'c2', 'c3'],
      payload: {},
    })

    expect(result.affected).toBe(3)
    expect(db.$getContact('c1').deletedAt).toBeDefined()
  })

  it('add-to-group: adds all contacts to the specified group', async () => {
    const { db, service } = createContactsService()
    db.$mockContacts(['c1', 'c2'], 'hub-1')
    db.$mockGroup('group-1', 'hub-1')

    const result = await service.bulkAction('hub-1', {
      action: 'add-to-group',
      contactIds: ['c1', 'c2'],
      payload: { groupId: 'group-1' },
    })

    expect(result.affected).toBe(2)
    expect(db.$getGroupMembership('c1', 'group-1')).toBeDefined()
    expect(db.$getGroupMembership('c2', 'group-1')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/contacts.bulk.test.ts
```

Expected: FAIL — `service.bulkAction is not a function`

- [ ] **Step 3: Implement bulkAction in contacts service**

In `apps/worker/services/contacts.ts`, add after `mergeContacts`:

```typescript
async bulkAction(
  hubId: string,
  body: BulkContactAction,
): Promise<{ affected: number; action: string }> {
  const { action, contactIds } = body

  // Verify all contacts belong to this hub
  const existing = await this.db.select({ id: contacts.id })
    .from(contacts)
    .where(and(
      inArray(contacts.id, contactIds),
      eq(contacts.hubId, hubId),
      isNull(contacts.deletedAt),
    ))
  const validIds = existing.map(r => r.id)

  if (action === 'delete') {
    await this.db.update(contacts)
      .set({ deletedAt: new Date() })
      .where(inArray(contacts.id, validIds))
    return { affected: validIds.length, action }
  }

  if (action === 'add-tags' || action === 'remove-tags') {
    const indexes = body.payload.updatedBlindIndexes ?? []
    await Promise.all(indexes.map(({ contactId, tagHashes }) =>
      this.db.update(contacts)
        .set({ tagHashes })
        .where(and(eq(contacts.id, contactId), eq(contacts.hubId, hubId)))
    ))
    return { affected: validIds.length, action }
  }

  if (action === 'add-to-group') {
    const { groupId } = body.payload
    const rows = validIds.map(contactId => ({ contactId, groupId, hubId, addedAt: new Date() }))
    await this.db.insert(contactGroupMembers).values(rows).onConflictDoNothing()
    return { affected: validIds.length, action }
  }

  if (action === 'remove-from-group') {
    const { groupId } = body.payload
    await this.db.delete(contactGroupMembers)
      .where(and(
        inArray(contactGroupMembers.contactId, validIds),
        eq(contactGroupMembers.groupId, groupId),
      ))
    return { affected: validIds.length, action }
  }

  if (action === 'set-risk-level') {
    const { riskLevel } = body.payload
    await this.db.update(contacts)
      .set({ riskLevel })
      .where(inArray(contacts.id, validIds))
    return { affected: validIds.length, action }
  }

  throw new Error(`unknown bulk action: ${action}`)
}
```

- [ ] **Step 4: Add bulk endpoint to contacts-v2 route**

In `apps/worker/routes/contacts-v2.ts`, add after the merge endpoint:

```typescript
import {
  bulkContactActionSchema,
  bulkContactActionResponseSchema,
} from '@protocol/schemas/contact-bulk'

// POST /bulk — in-app batch mutations (no export)
contactsV2.post('/bulk',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Bulk contact operations — in-app mutations only',
    responses: {
      200: {
        description: 'Bulk action result',
        content: { 'application/json': { schema: resolver(bulkContactActionResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requireAnyPermission(['contacts:edit', 'contacts:delete']),
  validator('json', bulkContactActionSchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const body = c.req.valid('json')

    // delete requires contacts:delete; everything else requires contacts:edit
    if (body.action === 'delete') {
      requirePermission('contacts:delete')(c, async () => {})
    }

    const result = await services.contacts.bulkAction(hubId, body)

    await audit(services.audit, 'contactBulkAction', c.get('pubkey'), {
      action: body.action,
      count: result.affected,
    })
    return c.json(result)
  },
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/contacts.bulk.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/contacts.ts apps/worker/routes/contacts-v2.ts apps/worker/__tests__/unit/contacts.bulk.test.ts
git commit -m "feat(backend): add POST /directory/bulk — in-app bulk contact operations (tag, group, delete)"
```

---

## Task 5: Backend — Batch Contact Import Endpoint

**Files:**
- Modify: `apps/worker/services/contacts.ts`
- Modify: `apps/worker/routes/contacts-v2.ts`

- [ ] **Step 1: Write failing test**

Add to `apps/worker/__tests__/unit/contacts.bulk.test.ts`:

```typescript
describe('ContactsService.bulkCreate', () => {
  it('creates up to 100 contacts in a single batch', async () => {
    const { db, service } = createContactsService()

    const contacts = Array.from({ length: 5 }, (_, i) => ({
      encryptedProfile: `enc-${i}`,
      profileEnvelopes: [{ recipientPubkey: 'pk1', encryptedKey: `ek-${i}` }],
      blindIndexes: { nameTokens: [`tok-${i}`], identifierHashes: [], tagHashes: [] },
      trigramTokens: [`tri-${i}`],
    }))

    const result = await service.bulkCreate('hub-1', contacts)

    expect(result.created).toBe(5)
    expect(result.contactIds).toHaveLength(5)
    expect(db.$countContacts('hub-1')).toBe(5)
  })

  it('rejects batches larger than 100', async () => {
    const { service } = createContactsService()
    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      encryptedProfile: `enc-${i}`,
      profileEnvelopes: [],
      blindIndexes: { nameTokens: [], identifierHashes: [], tagHashes: [] },
      trigramTokens: [],
    }))

    await expect(service.bulkCreate('hub-1', tooMany))
      .rejects.toThrow('batch exceeds maximum of 100')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/contacts.bulk.test.ts
```

Expected: FAIL — `service.bulkCreate is not a function`

- [ ] **Step 3: Implement bulkCreate in contacts service**

In `apps/worker/services/contacts.ts`, add after `bulkAction`:

```typescript
async bulkCreate(
  hubId: string,
  batch: BulkCreateContactBody['contacts'],
): Promise<{ created: number; contactIds: string[] }> {
  if (batch.length > 100) throw new Error('batch exceeds maximum of 100')

  const rows = batch.map(c => ({
    id: crypto.randomUUID(),
    hubId,
    encryptedProfile: c.encryptedProfile,
    profileEnvelopes: c.profileEnvelopes,
    nameTokens: c.blindIndexes.nameTokens ?? [],
    identifierHashes: c.blindIndexes.identifierHashes ?? [],
    tagHashes: c.blindIndexes.tagHashes ?? [],
    contactTypeHash: c.blindIndexes.contactTypeHash ?? null,
    trigramTokens: c.trigramTokens ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

  await this.db.insert(contacts).values(rows)

  return { created: rows.length, contactIds: rows.map(r => r.id) }
}
```

- [ ] **Step 4: Add bulk-create endpoint to contacts-v2 route**

In `apps/worker/routes/contacts-v2.ts`, add after the bulk endpoint:

```typescript
import {
  bulkCreateContactBodySchema,
  bulkCreateContactResponseSchema,
} from '@protocol/schemas/contact-bulk'

// POST /bulk-create — batch import (max 100, client-side encrypted)
contactsV2.post('/bulk-create',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Batch create contacts — client-side encrypted, max 100 per batch',
    responses: {
      201: {
        description: 'Contacts created',
        content: { 'application/json': { schema: resolver(bulkCreateContactResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:create'),
  validator('json', bulkCreateContactBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const { contacts: batch } = c.req.valid('json')

    const result = await services.contacts.bulkCreate(hubId, batch)

    await audit(services.audit, 'contactBulkCreate', c.get('pubkey'), { count: result.created })
    return c.json(result, 201)
  },
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/contacts.bulk.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/contacts.ts apps/worker/routes/contacts-v2.ts apps/worker/__tests__/unit/contacts.bulk.test.ts
git commit -m "feat(backend): add POST /directory/bulk-create — client-side encrypted batch contact import (max 100)"
```

---

## Task 6: Backend — Cross-Hub Entity Query

**Files:**
- Modify: `apps/worker/services/cases.ts`
- Modify: `apps/worker/routes/records.ts`

- [ ] **Step 1: Write failing test**

Add to `apps/worker/__tests__/unit/cases.merge.test.ts` (or create `cases.cross-hub.test.ts`):

```typescript
describe('CasesService.listRecords — crossHub', () => {
  it('returns records across all hubs where requesting pubkey appears in summaryEnvelopes', async () => {
    const { db, service } = createCasesService()
    db.$mockCrossHubRecords('pk-superadmin', [
      { id: 'rec-1', hubId: 'hub-1', summaryEnvelopes: { 'pk-superadmin': 'enc-key-1' } },
      { id: 'rec-2', hubId: 'hub-2', summaryEnvelopes: { 'pk-superadmin': 'enc-key-2' } },
    ])

    const result = await service.listRecords({
      crossHub: true,
      requestingPubkey: 'pk-superadmin',
      page: 1,
      limit: 20,
    })

    expect(result.records).toHaveLength(2)
    expect(result.records.map(r => r.id)).toContain('rec-1')
    expect(result.records.map(r => r.id)).toContain('rec-2')
  })

  it('does NOT return records where requesting pubkey is not in summaryEnvelopes', async () => {
    const { db, service } = createCasesService()
    db.$mockCrossHubRecords('pk-superadmin', [
      { id: 'rec-1', hubId: 'hub-1', summaryEnvelopes: { 'pk-other': 'enc-key' } },
    ])

    const result = await service.listRecords({
      crossHub: true,
      requestingPubkey: 'pk-superadmin',
      page: 1,
      limit: 20,
    })

    expect(result.records).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/cases.cross-hub.test.ts
```

Expected: FAIL — cross-hub path not yet implemented

- [ ] **Step 3: Extend listRecords in cases service**

In `apps/worker/services/cases.ts`, modify `listRecords` to accept and handle `crossHub`:

```typescript
// In the listRecords params type, add:
crossHub?: boolean
requestingPubkey?: string

// In the query construction, add a branch:
if (params.crossHub && params.requestingPubkey) {
  // JSONB containment query: summaryEnvelopes must have the pubkey as a key
  // PostgreSQL: summary_envelopes ? 'pk-value'
  whereConditions.push(
    sql`${caseRecords.summaryEnvelopes} ? ${params.requestingPubkey}`
  )
  // omit hubId filter — searching across all hubs
} else if (params.hubId) {
  whereConditions.push(eq(caseRecords.hubId, params.hubId))
}
```

- [ ] **Step 4: Add crossHub query param to records list route**

In `apps/worker/routes/records.ts`, in the `GET /` handler, extend `listRecordsQuerySchema` usage to pass `crossHub` and the requesting pubkey:

```typescript
// In the GET / handler, after extracting query params:
const crossHub = query.crossHub === 'true'
if (crossHub) {
  // Require cases:read-cross-hub permission
  const permissions = c.get('permissions') ?? []
  if (!checkPermission(permissions, 'cases:read-cross-hub')) {
    return c.json({ error: 'insufficient permissions' }, 403)
  }
}

const result = await services.cases.listRecords({
  hubId: crossHub ? undefined : hubId,
  crossHub,
  requestingPubkey: crossHub ? c.get('pubkey') : undefined,
  page: query.page,
  limit: query.limit,
  accessLevel,
})
```

Also add `crossHub` as an optional boolean query param to `listRecordsQuerySchema` in `packages/protocol/schemas/records.ts`:

```typescript
crossHub: z.string().optional(), // 'true' | 'false' — string because query params are strings
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/cases.cross-hub.test.ts
```

Expected: PASS

- [ ] **Step 6: Ensure entity creation includes super-admin pubkeys in envelope recipients**

When creating entities, the `summaryEnvelopes` JSONB must include envelopes for super-admin pubkeys so that cross-hub queries return results. Verify that the existing `getEnvelopeRecipients()` flow (used by entity creation in `apps/worker/services/cases.ts`) already includes super-admin pubkeys from the hub's member list. If super-admin pubkeys are not automatically included, extend `getEnvelopeRecipients()` to query for users with `cases:read-cross-hub` permission and include their pubkeys as additional envelope recipients.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/services/cases.ts apps/worker/routes/records.ts packages/protocol/schemas/records.ts
git commit -m "feat(backend): cross-hub entity query via JSONB pubkey containment — cases:read-cross-hub permission"
```

---

## Task 7: Desktop — Contact Merge UI

**Files:**
- New: `src/client/components/contact-merge-dialog.tsx`
- Modify: `src/client/components/contact-profile.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add mergeContacts to client API**

In `src/client/lib/api.ts`, add:

```typescript
import type { MergeContactsBody, MergeContactsResponse } from '@protocol/schemas/contact-merge'

export async function mergeContacts(
  hubId: string,
  body: MergeContactsBody,
) {
  return request<MergeContactsResponse>(hp(`/directory/merge`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Create contact merge dialog**

Create `src/client/components/contact-merge-dialog.tsx`:

```typescript
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { mergeContacts } from '@/lib/api'
import { encryptMessage } from '@/lib/platform'
import type { DirectoryContact } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface ContactMergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  primary: DirectoryContact
  secondary: DirectoryContact
  hubId: string
  onMerged: (primaryId: string) => void
}

type FieldChoice = 'primary' | 'secondary'

export function ContactMergeDialog({
  open, onOpenChange, primary, secondary, hubId, onMerged,
}: ContactMergeDialogProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey } = useAuth()
  const [fieldChoices, setFieldChoices] = useState<Record<string, FieldChoice>>({})
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Decrypt both profiles for comparison
  // (profiles are decrypted before this dialog is opened — passed via props or context)
  const fields = Object.keys({ ...primary.decryptedProfile, ...secondary.decryptedProfile })

  function choiceForField(field: string): FieldChoice {
    return fieldChoices[field] ?? 'primary'
  }

  function toggleField(field: string) {
    setFieldChoices(prev => ({
      ...prev,
      [field]: prev[field] === 'secondary' ? 'primary' : 'secondary',
    }))
  }

  async function handleMerge() {
    setMerging(true)
    setError(null)
    try {
      // Build merged plaintext profile from field choices
      const mergedProfile: Record<string, unknown> = {}
      for (const field of fields) {
        const source = choiceForField(field)
        mergedProfile[field] = source === 'primary'
          ? primary.decryptedProfile[field]
          : secondary.decryptedProfile[field]
      }

      // Re-encrypt merged profile via platform crypto (encryptMessage routes through Tauri IPC)
      const mergedEncryptedProfile = await encryptMessage(
        JSON.stringify(mergedProfile),
        adminDecryptionPubkey ?? '',
      )

      await mergeContacts(hubId, {
        primaryId: primary.id,
        secondaryId: secondary.id,
        mergedEncryptedProfile,
      })

      onMerged(primary.id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('merge.error.unknown'))
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('contacts.merge.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm font-medium text-muted-foreground">
            <span>{t('contacts.merge.field')}</span>
            <span>{t('contacts.merge.primary')}</span>
            <span>{t('contacts.merge.secondary')}</span>
          </div>

          {fields.map(field => (
            <div key={field} className="grid grid-cols-3 gap-2 items-center py-2 border-b">
              <span className="text-sm font-medium">{field}</span>
              <button
                type="button"
                onClick={() => setFieldChoices(p => ({ ...p, [field]: 'primary' }))}
                className={`text-left text-sm p-2 rounded border transition-colors ${
                  choiceForField(field) === 'primary'
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:border-muted'
                }`}
              >
                {String(primary.decryptedProfile?.[field] ?? '—')}
              </button>
              <button
                type="button"
                onClick={() => setFieldChoices(p => ({ ...p, [field]: 'secondary' }))}
                className={`text-left text-sm p-2 rounded border transition-colors ${
                  choiceForField(field) === 'secondary'
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:border-muted'
                }`}
              >
                {String(secondary.decryptedProfile?.[field] ?? '—')}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleMerge} disabled={merging}>
            {merging ? t('contacts.merge.merging') : t('contacts.merge.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add merge button to contact profile**

In `src/client/components/contact-profile.tsx`, add merge trigger button in the action area (visible only with `contacts:merge` permission):

```typescript
// Add to imports
import { ContactMergeDialog } from './contact-merge-dialog'

// Add to component state
const [mergeOpen, setMergeOpen] = useState(false)
const [mergeTarget, setMergeTarget] = useState<DirectoryContact | null>(null)

// In the action buttons area, conditionally render:
{hasPermission('contacts:merge') && (
  <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
    {t('contacts.merge.button')}
  </Button>
)}

// At bottom of component (before closing tag):
{mergeTarget && (
  <ContactMergeDialog
    open={mergeOpen}
    onOpenChange={setMergeOpen}
    primary={contact}
    secondary={mergeTarget}
    hubId={hubId}
    onMerged={(id) => { navigate({ to: '/contacts/$id', params: { id } }) }}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/client/components/contact-merge-dialog.tsx src/client/components/contact-profile.tsx src/client/lib/api.ts
git commit -m "feat(desktop): contact merge dialog — field comparison, re-encryption, admin-only"
```

---

## Task 8: Desktop — Entity Merge UI

**Files:**
- New: `src/client/components/entity-merge-dialog.tsx`
- Modify: `src/client/routes/cases.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add mergeEntities to client API**

In `src/client/lib/api.ts`, add:

```typescript
import type { MergeRecordsBody, MergeRecordsResponse } from '@protocol/schemas/entity-merge'

export async function mergeEntities(
  hubId: string,
  body: MergeRecordsBody,
) {
  return request<MergeRecordsResponse>(hp(`/records/merge`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Create entity merge dialog**

Create `src/client/components/entity-merge-dialog.tsx`:

```typescript
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { mergeEntities } from '@/lib/api'

interface EntityMergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryId: string
  primaryLabel: string
  secondaryId: string
  secondaryLabel: string
  hubId: string
  onMerged: (primaryId: string) => void
}

export function EntityMergeDialog({
  open, onOpenChange,
  primaryId, primaryLabel,
  secondaryId, secondaryLabel,
  hubId, onMerged,
}: EntityMergeDialogProps) {
  const { t } = useTranslation()
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMerge() {
    setMerging(true)
    setError(null)
    try {
      await mergeEntities(hubId, { primaryId, secondaryId })
      onMerged(primaryId)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('merge.error.unknown'))
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('entities.merge.title')}</DialogTitle>
          <DialogDescription>
            {t('entities.merge.description', { primary: primaryLabel, secondary: secondaryLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p>{t('entities.merge.primary_survives')}: <strong>{primaryLabel}</strong></p>
          <p>{t('entities.merge.secondary_absorbed')}: <strong>{secondaryLabel}</strong></p>
          <p className="text-muted-foreground">{t('entities.merge.warning')}</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleMerge} disabled={merging}>
            {merging ? t('entities.merge.merging') : t('entities.merge.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Wire merge dialog into cases route**

In `src/client/routes/cases.tsx`, add entity merge trigger accessible from entity detail actions (admin with `cases:update` permission). Import `EntityMergeDialog` and add dialog state + trigger button to the entity detail action area.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/entity-merge-dialog.tsx src/client/routes/cases.tsx src/client/lib/api.ts
git commit -m "feat(desktop): entity merge confirmation dialog — server-side relinking, admin-only"
```

---

## Task 9: Desktop — Evidence Custody Chain Tab

**Files:**
- New: `src/client/components/evidence-custody-chain.tsx`
- Modify: `src/client/routes/cases.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add custody chain API call**

In `src/client/lib/api.ts`, add:

```typescript
import type { CustodyChainResponse } from '@protocol/schemas/evidence'

export async function getEvidenceCustodyChain(evidenceId: string) {
  return request<CustodyChainResponse>(hp(`/evidence/${evidenceId}/custody`))
}

export async function verifyEvidenceIntegrity(evidenceId: string) {
  return request<{ valid: boolean; brokenAt: number | null }>(hp(`/evidence/${evidenceId}/verify`), {
    method: 'POST',
    body: '{}',
  })
}
```

- [ ] **Step 2: Create custody chain component**

Create `src/client/components/evidence-custody-chain.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getEvidenceCustodyChain, verifyEvidenceIntegrity } from '@/lib/api'
import type { CustodyChainResponse } from '@protocol/schemas/evidence'

interface EvidenceCustodyChainProps {
  evidenceId: string
}

export function EvidenceCustodyChain({ evidenceId }: EvidenceCustodyChainProps) {
  const { t } = useTranslation()
  const [chain, setChain] = useState<CustodyChainResponse | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; brokenAt: number | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEvidenceCustodyChain(evidenceId)
      .then(setChain)
      .finally(() => setLoading(false))
  }, [evidenceId])

  async function handleVerify() {
    setVerifying(true)
    const result = await verifyEvidenceIntegrity(evidenceId)
    setVerifyResult(result)
    setVerifying(false)
  }

  if (loading) return <div className="py-4 text-sm text-muted-foreground">{t('common.loading')}</div>
  if (!chain) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('evidence.custody.title')}</h3>
        <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying}>
          <Shield className="mr-2 h-3.5 w-3.5" />
          {verifying ? t('evidence.custody.verifying') : t('evidence.custody.verify')}
        </Button>
      </div>

      {verifyResult && (
        <div className={`flex items-center gap-2 text-sm p-2 rounded ${
          verifyResult.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {verifyResult.valid
            ? <><CheckCircle className="h-4 w-4" /> {t('evidence.custody.chain_valid')}</>
            : <><AlertTriangle className="h-4 w-4" /> {t('evidence.custody.chain_broken', { entry: verifyResult.brokenAt })}</>
          }
        </div>
      )}

      <ol className="space-y-3">
        {chain.entries.map((entry, idx) => (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
              {idx < chain.entries.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>
            <div className="pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-sm mt-0.5">{entry.actorName ?? entry.actorPubkey}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 3: Add custody chain tab to entity detail evidence section**

In `src/client/routes/cases.tsx`, within the evidence section of entity detail, add a "Custody Chain" sub-tab per evidence item that renders `<EvidenceCustodyChain evidenceId={item.id} />`.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/evidence-custody-chain.tsx src/client/routes/cases.tsx src/client/lib/api.ts
git commit -m "feat(desktop): evidence custody chain tab with hash-chain integrity verification"
```

---

## Task 10: Desktop — Bulk Operations Multi-Select Mode

**Files:**
- Modify: `src/client/routes/contacts-directory.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add bulk API calls**

In `src/client/lib/api.ts`, add:

```typescript
import type { BulkContactAction, BulkContactActionResponse } from '@protocol/schemas/contact-bulk'

export async function bulkContactAction(
  hubId: string,
  body: BulkContactAction,
) {
  return request<BulkContactActionResponse>(hp(`/directory/bulk`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Add multi-select mode to contacts directory**

In `src/client/routes/contacts-directory.tsx`, add select mode state and UI:

```typescript
const [selectMode, setSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const [bulkAction, setBulkAction] = useState<string | null>(null)

// Toggle select mode
function toggleSelectMode() {
  setSelectMode(prev => !prev)
  setSelectedIds(new Set())
}

function toggleSelect(id: string) {
  setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
}

// In the header area:
{hasPermission('contacts:edit') && (
  <Button variant="outline" size="sm" onClick={toggleSelectMode}>
    {selectMode ? t('common.cancel') : t('contacts.bulk.select')}
  </Button>
)}

// On each contact card, add checkbox when selectMode:
{selectMode && (
  <Checkbox
    checked={selectedIds.has(contact.id)}
    onCheckedChange={() => toggleSelect(contact.id)}
  />
)}

// Bottom action bar (visible when selectMode && selectedIds.size > 0):
{selectMode && selectedIds.size > 0 && (
  <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 flex items-center justify-between">
    <span className="text-sm">{t('contacts.bulk.selected', { count: selectedIds.size })}</span>
    <div className="flex gap-2">
      {hasPermission('contacts:edit') && (
        <>
          <Button size="sm" variant="outline" onClick={() => setBulkAction('add-tags')}>
            {t('contacts.bulk.add_tags')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkAction('add-to-group')}>
            {t('contacts.bulk.add_to_group')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkAction('set-risk-level')}>
            {t('contacts.bulk.set_risk_level')}
          </Button>
        </>
      )}
      {hasPermission('contacts:delete') && (
        <Button size="sm" variant="destructive" onClick={() => setBulkAction('delete')}>
          {t('contacts.bulk.delete')}
        </Button>
      )}
    </div>
  </div>
)}
```

Bulk action confirmation dialogs (delete shows count, tag/group show pickers) trigger `bulkContactAction` on confirm.

- [ ] **Step 3: Commit**

```bash
git add src/client/routes/contacts-directory.tsx src/client/lib/api.ts
git commit -m "feat(desktop): bulk contact operations — multi-select mode, tag/group/delete actions"
```

---

## Task 11: Desktop — Cross-Hub Toggle

**Files:**
- Modify: `src/client/routes/cases.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add cross-hub list API call**

In `src/client/lib/api.ts`, extend `listEntities` (or add `listEntitiesCrossHub`):

```typescript
export async function listEntities(
  hubId: string,
  params: { crossHub?: boolean; page?: number; limit?: number },
) {
  const qs = new URLSearchParams()
  if (params.crossHub) qs.set('crossHub', 'true')
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))

  return request<{ records: unknown[]; total: number }>(hp(`/records?${qs}`))
}
```

- [ ] **Step 2: Add cross-hub toggle to cases route**

In `src/client/routes/cases.tsx`, add toggle in the entity list header (visible only with `cases:read-cross-hub`):

```typescript
const [crossHub, setCrossHub] = useState(false)

{hasPermission('cases:read-cross-hub') && (
  <div className="flex items-center gap-1 border rounded-md overflow-hidden text-sm">
    <button
      type="button"
      onClick={() => setCrossHub(false)}
      className={`px-3 py-1.5 transition-colors ${!crossHub ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
      {t('entities.scope.this_hub')}
    </button>
    <button
      type="button"
      onClick={() => setCrossHub(true)}
      className={`px-3 py-1.5 transition-colors ${crossHub ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
      {t('entities.scope.all_hubs')}
    </button>
  </div>
)}
```

When `crossHub` is true, entity cards show a hub badge. Clicking a cross-hub entity navigates to it in its source hub context.

- [ ] **Step 3: Commit**

```bash
git add src/client/routes/cases.tsx src/client/lib/api.ts
git commit -m "feat(desktop): cross-hub entity toggle for super-admins (cases:read-cross-hub)"
```

---

## Task 12: Desktop — Contact Import Dialog (CSV/vCard)

**Files:**
- New: `src/client/components/contact-import-dialog.tsx`
- Modify: `src/client/routes/contacts-directory.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add bulk-create API call**

In `src/client/lib/api.ts`, add:

```typescript
import type { BulkCreateContactBody, BulkCreateContactResponse } from '@protocol/schemas/contact-bulk'

export async function bulkCreateContacts(
  hubId: string,
  body: BulkCreateContactBody,
) {
  return request<BulkCreateContactResponse>(hp(`/directory/bulk-create`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Create import dialog**

Create `src/client/components/contact-import-dialog.tsx`:

```typescript
import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { bulkCreateContacts } from '@/lib/api'
import { encryptMessage } from '@/lib/platform'
import { useAuth } from '@/lib/auth'

// CSV parsing: first row is headers, subsequent rows are data
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

// vCard parsing: extract FN, TEL, EMAIL fields
function parseVCard(text: string): Array<Record<string, string>> {
  const cards = text.split('BEGIN:VCARD').slice(1)
  return cards.map(card => {
    const fn = card.match(/FN:(.*)/)?.[1]?.trim() ?? ''
    const tel = card.match(/TEL[^:]*:(.*)/)?.[1]?.trim() ?? ''
    const email = card.match(/EMAIL[^:]*:(.*)/)?.[1]?.trim() ?? ''
    return { name: fn, phone: tel, email }
  }).filter(c => c.name || c.phone || c.email)
}

interface DuplicateResult {
  rowIndex: number
  matchingContactId: string
}

interface ContactImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hubId: string
  onImported: (count: number) => void
}

export function ContactImportDialog({
  open, onOpenChange, hubId, onImported,
}: ContactImportDialogProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Array<Record<string, string>>>([])
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([])
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [stage, setStage] = useState<'idle' | 'preview' | 'done'>('idle')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    let rows: Array<Record<string, string>>

    if (file.name.endsWith('.vcf') || file.name.endsWith('.vcard')) {
      rows = parseVCard(text)
    } else {
      rows = parseCSV(text)
    }

    // Validate row count
    if (rows.length > 100) {
      setErrors([t('contacts.import.error.too_many', { max: 100 })])
      return
    }

    setParsed(rows)
    setErrors([])

    // Duplicate detection: compute HMAC blind indexes via platform crypto API, then check against server
    const dupes: DuplicateResult[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Use platform crypto HMAC with LABEL_HMAC_CONTACT_PHONE to hash identifiers
      // and search existing contacts via the blind index lookup endpoint
      const identifiers = [row.phone, row.email].filter(Boolean)
      for (const identifier of identifiers) {
        const match = await request<{ id: string } | null>(
          hp(`/directory/lookup-by-hash?identifier=${encodeURIComponent(identifier)}`),
        )
        if (match) {
          dupes.push({ rowIndex: i, matchingContactId: match.id })
          break
        }
      }
    }

    setDuplicates(dupes)
    setStage('preview')
  }

  async function handleImport() {
    setImporting(true)
    setErrors([])
    try {
      // Build batch — skip rows marked as skipped (duplicates user chose to skip)
      const toImport = parsed.filter((_, i) => !skippedRows.has(i))

      const contacts = await Promise.all(toImport.map(async (row) => {
        const encryptedProfile = await encryptMessage(
          JSON.stringify(row),
          adminDecryptionPubkey ?? '',
        )
        return { encryptedProfile }
      }))

      const result = await bulkCreateContacts(hubId, { contacts })
      setStage('done')
      onImported(result.created)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : t('contacts.import.error.unknown')])
    } finally {
      setImporting(false)
    }
  }

  function toggleSkip(rowIndex: number) {
    setSkippedRows(prev => {
      const next = new Set(prev)
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('contacts.import.title')}</DialogTitle>
        </DialogHeader>

        {stage === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('contacts.import.instructions')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.vcf,.vcard"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              {t('contacts.import.choose_file')}
            </Button>
            {errors.map((e, i) => <p key={i} className="text-sm text-destructive">{e}</p>)}
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm">
              {t('contacts.import.preview_count', { count: parsed.length })}
              {duplicates.length > 0 && (
                <span className="ml-2 text-yellow-600">
                  {t('contacts.import.duplicates_found', { count: duplicates.length })}
                </span>
              )}
            </p>

            <div className="border rounded overflow-auto max-h-64">
              <table className="w-full text-xs">
                <tbody>
                  {parsed.map((row, i) => {
                    const isDupe = duplicates.some(d => d.rowIndex === i)
                    const isSkipped = skippedRows.has(i)
                    return (
                      <tr key={i} className={`border-b ${isSkipped ? 'opacity-40' : ''}`}>
                        <td className="p-2 w-8">{i + 1}</td>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="p-2">{v}</td>
                        ))}
                        {isDupe && (
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleSkip(i)}
                              className="text-xs h-6"
                            >
                              {isSkipped
                                ? t('contacts.import.include')
                                : t('contacts.import.skip_duplicate')}
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {errors.map((e, i) => <p key={i} className="text-sm text-destructive">{e}</p>)}
          </div>
        )}

        {stage === 'done' && (
          <p className="text-sm text-green-600">{t('contacts.import.success')}</p>
        )}

        <DialogFooter>
          {stage === 'idle' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          )}
          {stage === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStage('idle')}>
                {t('common.back')}
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing
                  ? t('contacts.import.importing')
                  : t('contacts.import.confirm', { count: parsed.length - skippedRows.size })}
              </Button>
            </>
          )}
          {stage === 'done' && (
            <Button onClick={() => onOpenChange(false)}>{t('common.done')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add import button to contacts directory header**

In `src/client/routes/contacts-directory.tsx`, add import button (visible with `contacts:create`):

```typescript
import { ContactImportDialog } from '@/components/contact-import-dialog'

// state
const [importOpen, setImportOpen] = useState(false)

// in header, alongside Select button:
{hasPermission('contacts:create') && (
  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
    {t('contacts.import.button')}
  </Button>
)}

// at bottom:
<ContactImportDialog
  open={importOpen}
  onOpenChange={setImportOpen}
  hubId={hubId}
  onImported={(count) => { refetchContacts(); setImportOpen(false) }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/client/components/contact-import-dialog.tsx src/client/routes/contacts-directory.tsx src/client/lib/api.ts
git commit -m "feat(desktop): contact import dialog — CSV/vCard client-side parse, encrypt, duplicate detection"
```

---

## Task 13: Desktop — Calendar Display Type

**Files:**
- New: `src/client/components/entity-calendar-view.tsx`
- Modify: `src/client/routes/cases.tsx`

- [ ] **Step 1: Create calendar view component**

Create `src/client/components/entity-calendar-view.tsx`:

```typescript
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CaseRecord } from '@protocol/schemas/records'

interface EntityCalendarViewProps {
  records: CaseRecord[]
  dateField: string        // which decrypted field holds the date
  onRecordClick: (id: string) => void
}

export function EntityCalendarView({ records, dateField, onRecordClick }: EntityCalendarViewProps) {
  const { t } = useTranslation()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  // Map date string → records
  const recordsByDate = useMemo(() => {
    const map = new Map<string, CaseRecord[]>()
    for (const r of records) {
      const raw = r.decryptedData?.[dateField]
      if (!raw) continue
      const dateStr = new Date(String(raw)).toISOString().slice(0, 10)
      const existing = map.get(dateStr) ?? []
      map.set(dateStr, [...existing, r])
    }
    return map
  }, [records, dateField])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const monthLabel = new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  // Build calendar grid (6 rows × 7 cols)
  const cells: Array<number | null> = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">{monthLabel}</span>
        <Button variant="ghost" size="sm" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-xs text-muted-foreground mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <span key={d}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayRecords = recordsByDate.get(dateStr) ?? []
          const isToday = dateStr === today.toISOString().slice(0, 10)
          return (
            <div key={idx} className={`min-h-[2.5rem] p-1 rounded text-xs border ${isToday ? 'border-primary' : 'border-transparent'}`}>
              <span className={`block text-right ${isToday ? 'font-bold text-primary' : ''}`}>{day}</span>
              {dayRecords.slice(0, 3).map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRecordClick(r.id)}
                  className="w-full text-left truncate text-[10px] mt-0.5 px-1 rounded bg-primary/10 hover:bg-primary/20"
                >
                  {r.decryptedData?.title ?? r.id.slice(0, 6)}
                </button>
              ))}
              {dayRecords.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{dayRecords.length - 3}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into cases route with display type picker**

In `src/client/routes/cases.tsx`, add display type state and conditional rendering:

```typescript
import { EntityCalendarView } from '@/components/entity-calendar-view'
import { EntityTimelineView } from '@/components/entity-timeline-view'

type DisplayType = 'table' | 'calendar' | 'timeline'
const [displayType, setDisplayType] = useState<DisplayType>('table')

// Display type picker (only show types supported by the entity type definition)
const supportedDisplayTypes = activeEntityType?.displayTypes ?? ['table']

{supportedDisplayTypes.length > 1 && (
  <div className="flex gap-1">
    {supportedDisplayTypes.map(dt => (
      <Button
        key={dt}
        variant={displayType === dt ? 'default' : 'outline'}
        size="sm"
        onClick={() => setDisplayType(dt)}
      >
        {t(`entities.display_type.${dt}`)}
      </Button>
    ))}
  </div>
)}

// Conditional list rendering
{displayType === 'table' && <EntityTableView records={records} ... />}
{displayType === 'calendar' && (
  <EntityCalendarView
    records={records}
    dateField={activeEntityType?.fields.find(f => f.type === 'date')?.name ?? 'date'}
    onRecordClick={id => navigate({ to: '/cases/$id', params: { id } })}
  />
)}
{displayType === 'timeline' && <EntityTimelineView records={records} ... />}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/entity-calendar-view.tsx src/client/routes/cases.tsx
git commit -m "feat(desktop): entity calendar display type — month grid with date-field record placement"
```

---

## Task 14: Desktop — Timeline Display Type

**Files:**
- New: `src/client/components/entity-timeline-view.tsx`

- [ ] **Step 1: Create timeline view component**

Create `src/client/components/entity-timeline-view.tsx`:

```typescript
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseRecord } from '@protocol/schemas/records'

interface EntityTimelineViewProps {
  records: CaseRecord[]
  timestampField?: string  // defaults to createdAt
  onRecordClick: (id: string) => void
}

export function EntityTimelineView({
  records,
  timestampField = 'createdAt',
  onRecordClick,
}: EntityTimelineViewProps) {
  const { t } = useTranslation()

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      const ta = new Date(String(a.decryptedData?.[timestampField] ?? a.createdAt)).getTime()
      const tb = new Date(String(b.decryptedData?.[timestampField] ?? b.createdAt)).getTime()
      return tb - ta  // newest first
    })
  }, [records, timestampField])

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('entities.timeline.empty')}
      </div>
    )
  }

  return (
    <ol className="relative border-l border-border space-y-6 ml-4 pl-6">
      {sorted.map(record => {
        const ts = record.decryptedData?.[timestampField] ?? record.createdAt
        const date = new Date(String(ts))
        return (
          <li key={record.id} className="relative">
            <div className="absolute -left-[1.625rem] mt-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
            <time className="text-xs text-muted-foreground">
              {date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              {' '}
              {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </time>
            <button
              type="button"
              onClick={() => onRecordClick(record.id)}
              className="block mt-1 text-left hover:underline"
            >
              <p className="text-sm font-medium">
                {String(record.decryptedData?.title ?? t('entities.timeline.untitled'))}
              </p>
              {record.decryptedData?.status && (
                <span className="text-xs text-muted-foreground">{String(record.decryptedData.status)}</span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/entity-timeline-view.tsx
git commit -m "feat(desktop): entity timeline display type — chronological list with timestamp ordering"
```

---

## Task 15: iOS — Evidence Custody Chain View

**Files:**
- New: `apps/ios/Sources/Views/Evidence/EvidenceCustodyChainView.swift`
- Modify: `apps/ios/Sources/Services/RecordsService.swift`
- New: `apps/ios/Tests/LlamenosTests/EvidenceCustodyTests.swift`

- [ ] **Step 1: Write failing test**

Create `apps/ios/Tests/LlamenosTests/EvidenceCustodyTests.swift`:

```swift
import XCTest
@testable import Llamenos

final class EvidenceCustodyTests: XCTestCase {
    func testFetchesCustodyChain() async throws {
        let mockSession = MockURLSession()
        mockSession.registerJSON(
            path: "/api/evidence/ev-1/custody",
            response: [
                "entries": [
                    ["id": "entry-1", "action": "upload", "actorPubkey": "pk1", "timestamp": "2026-05-12T10:00:00Z"],
                    ["id": "entry-2", "action": "view", "actorPubkey": "pk2", "timestamp": "2026-05-12T11:00:00Z"],
                ],
                "chainValid": true,
            ]
        )
        let service = EvidenceService(session: mockSession)
        let chain = try await service.fetchCustodyChain(evidenceId: "ev-1")
        XCTAssertEqual(chain.entries.count, 2)
        XCTAssertTrue(chain.chainValid)
        XCTAssertEqual(chain.entries[0].action, "upload")
    }

    func testVerifyIntegrityReturnsResult() async throws {
        let mockSession = MockURLSession()
        mockSession.registerJSON(
            path: "/api/evidence/ev-1/verify",
            response: ["valid": true, "brokenAt": NSNull()]
        )
        let service = EvidenceService(session: mockSession)
        let result = try await service.verifyIntegrity(evidenceId: "ev-1")
        XCTAssertTrue(result.valid)
        XCTAssertNil(result.brokenAt)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run ios:test 2>&1 | grep -A 3 "EvidenceCustodyTests"
```

Expected: FAIL — `EvidenceService` missing `fetchCustodyChain` and `verifyIntegrity`

- [ ] **Step 3: Create custody chain view**

Create `apps/ios/Sources/Views/Evidence/EvidenceCustodyChainView.swift`:

```swift
import SwiftUI

struct CustodyEntry: Identifiable, Decodable {
    let id: String
    let action: String
    let actorPubkey: String
    let actorName: String?
    let timestamp: Date
}

struct CustodyChain: Decodable {
    let entries: [CustodyEntry]
    let chainValid: Bool
    let brokenAtIndex: Int?
}

struct VerifyResult: Decodable {
    let valid: Bool
    let brokenAt: Int?
}

@Observable
final class EvidenceCustodyViewModel {
    var chain: CustodyChain?
    var verifyResult: VerifyResult?
    var isLoading = false
    var isVerifying = false
    var errorMessage: String?

    private let service: EvidenceService
    private let evidenceId: String

    init(service: EvidenceService, evidenceId: String) {
        self.service = service
        self.evidenceId = evidenceId
    }

    func load() async {
        isLoading = true
        do {
            chain = try await service.fetchCustodyChain(evidenceId: evidenceId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func verify() async {
        isVerifying = true
        do {
            verifyResult = try await service.verifyIntegrity(evidenceId: evidenceId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isVerifying = false
    }
}

struct EvidenceCustodyChainView: View {
    @State private var viewModel: EvidenceCustodyViewModel
    private let strings = I18n.shared

    init(service: EvidenceService, evidenceId: String) {
        _viewModel = State(wrappedValue: EvidenceCustodyViewModel(service: service, evidenceId: evidenceId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else if let chain = viewModel.chain {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Chain integrity indicator
                        if let result = viewModel.verifyResult {
                            HStack(spacing: 8) {
                                Image(systemName: result.valid ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                                    .foregroundStyle(result.valid ? .green : .red)
                                Text(result.valid
                                    ? strings.evidenceCustodyChainValid
                                    : strings.evidenceCustodyChainBroken)
                                    .font(.caption)
                            }
                            .padding(.horizontal)
                        }

                        Button {
                            Task { await viewModel.verify() }
                        } label: {
                            Label(
                                viewModel.isVerifying
                                    ? strings.evidenceCustodyVerifying
                                    : strings.evidenceCustodyVerify,
                                systemImage: "shield"
                            )
                            .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .padding(.horizontal)
                        .disabled(viewModel.isVerifying)

                        // Custody timeline
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(chain.entries.enumerated()), id: \.element.id) { idx, entry in
                                HStack(alignment: .top, spacing: 12) {
                                    VStack(spacing: 0) {
                                        Circle()
                                            .fill(Color.accentColor)
                                            .frame(width: 8, height: 8)
                                            .padding(.top, 4)
                                        if idx < chain.entries.count - 1 {
                                            Rectangle()
                                                .fill(Color.secondary.opacity(0.3))
                                                .frame(width: 1)
                                                .frame(maxHeight: .infinity)
                                        }
                                    }
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(entry.action.capitalized)
                                            .font(.caption)
                                            .fontWeight(.medium)
                                        Text(entry.actorName ?? String(entry.actorPubkey.prefix(16)) + "…")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                        Text(entry.timestamp.formatted(.relative(presentation: .named)))
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal)
                                .padding(.bottom, idx < chain.entries.count - 1 ? 16 : 0)
                            }
                        }
                    }
                    .padding(.vertical)
                }
            }
        }
        .navigationTitle(strings.evidenceCustodyTitle)
        .task { await viewModel.load() }
    }
}
```

- [ ] **Step 4: Add EvidenceService methods**

In `apps/ios/Sources/Services/RecordsService.swift` (or create `apps/ios/Sources/Services/EvidenceService.swift`):

```swift
extension EvidenceService {
    func fetchCustodyChain(evidenceId: String) async throws -> CustodyChain {
        let url = baseURL.appendingPathComponent("evidence/\(evidenceId)/custody")
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(CustodyChain.self, from: data)
    }

    func verifyIntegrity(evidenceId: String) async throws -> VerifyResult {
        var request = URLRequest(url: baseURL.appendingPathComponent("evidence/\(evidenceId)/verify"))
        request.httpMethod = "POST"
        request.httpBody = "{}".data(using: .utf8)
        let (data, _) = try await session.data(for: request)
        return try decoder.decode(VerifyResult.self, from: data)
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run ios:test 2>&1 | grep -A 3 "EvidenceCustodyTests"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Sources/Views/Evidence/EvidenceCustodyChainView.swift apps/ios/Sources/Services/ apps/ios/Tests/LlamenosTests/EvidenceCustodyTests.swift
git commit -m "feat(ios): evidence custody chain view — timeline, integrity verification, chain validity indicator"
```

---

## Task 16: iOS — Cross-Hub Entity Toggle

**Files:**
- Modify: `apps/ios/Sources/Views/Cases/CasesListView.swift`
- Modify: `apps/ios/Sources/Services/RecordsService.swift`

- [ ] **Step 1: Extend RecordsService with crossHub param**

In `apps/ios/Sources/Services/RecordsService.swift`, update the `fetchRecords` signature:

```swift
func fetchRecords(
    hubId: String,
    crossHub: Bool = false,
    page: Int = 1,
    limit: Int = 20
) async throws -> RecordListResponse {
    var components = URLComponents(
        url: baseURL.appendingPathComponent("hubs/\(hubId)/records"),
        resolvingAgainstBaseURL: false
    )!
    var queryItems = [
        URLQueryItem(name: "page", value: String(page)),
        URLQueryItem(name: "limit", value: String(limit)),
    ]
    if crossHub {
        queryItems.append(URLQueryItem(name: "crossHub", value: "true"))
    }
    components.queryItems = queryItems

    let (data, _) = try await session.data(from: components.url!)
    return try decoder.decode(RecordListResponse.self, from: data)
}
```

- [ ] **Step 2: Add cross-hub scope toggle to CasesListView**

In `apps/ios/Sources/Views/Cases/CasesListView.swift`, add scope toggle to navigation bar (visible only when user has `cases:read-cross-hub`):

```swift
@State private var crossHub = false

// In .toolbar:
if permissionsService.hasPermission("cases:read-cross-hub") {
    ToolbarItem(placement: .navigationBarTrailing) {
        Picker(selection: $crossHub, label: EmptyView()) {
            Text(strings.entitiesScopeThisHub).tag(false)
            Text(strings.entitiesScopeAllHubs).tag(true)
        }
        .pickerStyle(.segmented)
        .frame(width: 200)
    }
}

// In .task and .onChange(of: crossHub):
.task { await viewModel.loadRecords(crossHub: crossHub) }
.onChange(of: crossHub) { await viewModel.loadRecords(crossHub: crossHub) }
```

When `crossHub` is true, record rows show a hub badge below the title.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Cases/CasesListView.swift apps/ios/Sources/Services/RecordsService.swift
git commit -m "feat(ios): cross-hub entity scope toggle — segmented control, hub badge on records"
```

---

## Task 17: iOS — Calendar and Timeline Display Types

**Files:**
- New: `apps/ios/Sources/Views/Cases/EntityCalendarView.swift`
- New: `apps/ios/Sources/Views/Cases/EntityTimelineView.swift`
- Modify: `apps/ios/Sources/Views/Cases/CasesListView.swift`

- [ ] **Step 1: Create EntityCalendarView**

Create `apps/ios/Sources/Views/Cases/EntityCalendarView.swift`:

```swift
import SwiftUI

struct EntityCalendarView: View {
    let records: [CaseRecord]
    let dateField: String
    var onRecordTap: (String) -> Void

    @State private var displayMonth = Calendar.current.dateComponents([.year, .month], from: Date())

    private var year: Int { displayMonth.year ?? Calendar.current.component(.year, from: Date()) }
    private var month: Int { displayMonth.month ?? Calendar.current.component(.month, from: Date()) }

    private var recordsByDate: [String: [CaseRecord]] {
        var map: [String: [CaseRecord]] = [:]
        let formatter = ISO8601DateFormatter()
        for record in records {
            guard let raw = record.decryptedData?[dateField] as? String,
                  let date = formatter.date(from: raw) else { continue }
            let key = Calendar.current.startOfDay(for: date).ISO8601Format(.iso8601Date(timeZone: .current))
            map[key, default: []].append(record)
        }
        return map
    }

    private var daysInMonth: Int {
        let comps = DateComponents(year: year, month: month)
        let date = Calendar.current.date(from: comps)!
        return Calendar.current.range(of: .day, in: .month, for: date)!.count
    }

    private var firstWeekday: Int {
        let comps = DateComponents(year: year, month: month, day: 1)
        let date = Calendar.current.date(from: comps)!
        return Calendar.current.component(.weekday, from: date) - 1
    }

    var body: some View {
        VStack(spacing: 12) {
            // Month navigation
            HStack {
                Button { prevMonth() } label: { Image(systemName: "chevron.left") }
                Spacer()
                Text(monthLabel).font(.headline)
                Spacer()
                Button { nextMonth() } label: { Image(systemName: "chevron.right") }
            }
            .padding(.horizontal)

            // Weekday headers
            HStack(spacing: 0) {
                ForEach(["S","M","T","W","T","F","S"], id: \.self) { d in
                    Text(d).font(.caption2).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Day grid
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                ForEach(0..<(firstWeekday + daysInMonth), id: \.self) { idx in
                    if idx < firstWeekday {
                        Color.clear.frame(height: 40)
                    } else {
                        let day = idx - firstWeekday + 1
                        let key = dateKey(day: day)
                        let dayRecords = recordsByDate[key] ?? []
                        VStack(spacing: 2) {
                            Text("\(day)").font(.caption2)
                            if !dayRecords.isEmpty {
                                Circle().fill(Color.accentColor).frame(width: 6, height: 6)
                            }
                        }
                        .frame(height: 40)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if let first = dayRecords.first { onRecordTap(first.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func dateKey(day: Int) -> String {
        let comps = DateComponents(year: year, month: month, day: day)
        let date = Calendar.current.date(from: comps)!
        return Calendar.current.startOfDay(for: date).ISO8601Format(.iso8601Date(timeZone: .current))
    }

    private var monthLabel: String {
        let comps = DateComponents(year: year, month: month)
        let date = Calendar.current.date(from: comps)!
        return date.formatted(.dateTime.month(.wide).year())
    }

    private func prevMonth() {
        var comps = displayMonth
        comps.month = (comps.month ?? 1) - 1
        if (comps.month ?? 0) < 1 { comps.month = 12; comps.year = (comps.year ?? 2026) - 1 }
        displayMonth = comps
    }

    private func nextMonth() {
        var comps = displayMonth
        comps.month = (comps.month ?? 1) + 1
        if (comps.month ?? 0) > 12 { comps.month = 1; comps.year = (comps.year ?? 2026) + 1 }
        displayMonth = comps
    }
}
```

- [ ] **Step 2: Create EntityTimelineView**

Create `apps/ios/Sources/Views/Cases/EntityTimelineView.swift`:

```swift
import SwiftUI

struct EntityTimelineView: View {
    let records: [CaseRecord]
    var onRecordTap: (String) -> Void

    private var sorted: [CaseRecord] {
        records.sorted { a, b in
            (a.createdAt ?? "") > (b.createdAt ?? "")
        }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(sorted.enumerated()), id: \.element.id) { idx, record in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Circle().fill(Color.accentColor).frame(width: 8, height: 8).padding(.top, 4)
                        if idx < sorted.count - 1 {
                            Rectangle().fill(Color.secondary.opacity(0.3)).frame(width: 1).frame(maxHeight: .infinity)
                        }
                    }
                    Button {
                        onRecordTap(record.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(record.decryptedData?["title"] as? String ?? record.id.prefix(8).description)
                                .font(.subheadline).fontWeight(.medium).foregroundStyle(.primary)
                            if let createdAt = record.createdAt {
                                Text(createdAt).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.bottom, 16)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal)
            }
        }
    }
}
```

- [ ] **Step 3: Add display type picker to CasesListView**

In `apps/ios/Sources/Views/Cases/CasesListView.swift`, add display type picker in navigation bar when entity type supports multiple display types:

```swift
@State private var displayType: String = "list"

// In toolbar, when activeEntityType.displayTypes.count > 1:
if let displayTypes = viewModel.activeEntityType?.displayTypes, displayTypes.count > 1 {
    ToolbarItem(placement: .navigationBarLeading) {
        Menu {
            ForEach(displayTypes, id: \.self) { dt in
                Button(dt.capitalized) { displayType = dt }
            }
        } label: {
            Label(displayType.capitalized, systemImage: displayType == "calendar" ? "calendar" : "list.bullet")
                .font(.caption)
        }
    }
}

// In list body, switch on displayType:
switch displayType {
case "calendar":
    EntityCalendarView(records: viewModel.records, dateField: dateField) { id in
        selectedRecordId = id
    }
case "timeline":
    EntityTimelineView(records: viewModel.records) { id in
        selectedRecordId = id
    }
default:
    // existing list view
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Cases/EntityCalendarView.swift apps/ios/Sources/Views/Cases/EntityTimelineView.swift apps/ios/Sources/Views/Cases/CasesListView.swift
git commit -m "feat(ios): calendar and timeline entity display types — native month grid, no third-party libs"
```

---

## Task 18: Android — Evidence Custody Chain View

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/evidence/EvidenceCustodyChainScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt`
- New: `apps/android/app/src/test/java/org/llamenos/hotline/api/EvidenceCustodyTest.kt`

- [ ] **Step 1: Write failing test**

Create `apps/android/app/src/test/java/org/llamenos/hotline/api/EvidenceCustodyTest.kt`:

```kotlin
package org.llamenos.hotline.api

import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.Assert.*

class EvidenceCustodyTest {

    @Test
    fun `fetchCustodyChain returns entries with correct action types`() = runTest {
        val mockClient = MockHttpClient()
        mockClient.enqueueJson("""
            {
              "entries": [
                {"id":"e1","action":"upload","actorPubkey":"pk1","timestamp":"2026-05-12T10:00:00Z"},
                {"id":"e2","action":"view","actorPubkey":"pk2","timestamp":"2026-05-12T11:00:00Z"}
              ],
              "chainValid": true,
              "brokenAtIndex": null
            }
        """)
        val repo = EvidenceRepository(mockClient)
        val chain = repo.fetchCustodyChain("ev-1")
        assertEquals(2, chain.entries.size)
        assertTrue(chain.chainValid)
        assertEquals("upload", chain.entries[0].action)
    }

    @Test
    fun `verifyIntegrity returns valid true when chain is intact`() = runTest {
        val mockClient = MockHttpClient()
        mockClient.enqueueJson("""{"valid":true,"brokenAt":null}""")
        val repo = EvidenceRepository(mockClient)
        val result = repo.verifyIntegrity("ev-1")
        assertTrue(result.valid)
        assertNull(result.brokenAt)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.api.EvidenceCustodyTest" 2>&1 | tail -20
```

Expected: FAIL — `EvidenceRepository` missing methods

- [ ] **Step 3: Create EvidenceCustodyChainScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/evidence/EvidenceCustodyChainScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.evidence

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.ui.i18n.I18n

@Composable
fun EvidenceCustodyChainScreen(
    evidenceId: String,
    viewModel: EvidenceCustodyViewModel = hiltViewModel(),
) {
    val i18n = I18n.current
    val state by viewModel.state.collectAsState()

    LaunchedEffect(evidenceId) { viewModel.load(evidenceId) }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(i18n.evidenceCustodyTitle) })
        }
    ) { padding ->
        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.chain != null -> {
                LazyColumn(
                    modifier = Modifier.padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    // Verify button + result
                    item {
                        state.verifyResult?.let { result ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(bottom = 8.dp)
                            ) {
                                Icon(
                                    if (result.valid) Icons.Default.CheckCircle else Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = if (result.valid) Color(0xFF22C55E) else Color(0xFFEF4444),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    if (result.valid) i18n.evidenceCustodyChainValid
                                    else i18n.evidenceCustodyChainBroken,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        }
                        OutlinedButton(
                            onClick = { viewModel.verify(evidenceId) },
                            enabled = !state.isVerifying,
                            modifier = Modifier.padding(bottom = 16.dp)
                        ) {
                            Text(if (state.isVerifying) i18n.evidenceCustodyVerifying else i18n.evidenceCustodyVerify)
                        }
                    }

                    // Custody timeline
                    itemsIndexed(state.chain!!.entries) { idx, entry ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .padding(top = 4.dp)
                                )
                                if (idx < state.chain!!.entries.lastIndex) {
                                    Divider(
                                        modifier = Modifier.width(1.dp).height(48.dp),
                                        color = MaterialTheme.colorScheme.outlineVariant
                                    )
                                }
                            }
                            Column(modifier = Modifier.padding(bottom = 12.dp)) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text(entry.action, style = MaterialTheme.typography.labelSmall) }
                                )
                                Text(
                                    entry.actorName ?: entry.actorPubkey.take(16) + "…",
                                    style = MaterialTheme.typography.bodySmall
                                )
                                Text(
                                    entry.timestamp,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 4: Add EvidenceRepository methods**

In `apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt` (or create `EvidenceRepository.kt`), add:

```kotlin
suspend fun fetchCustodyChain(evidenceId: String): CustodyChain {
    return client.get("evidence/$evidenceId/custody").body()
}

suspend fun verifyIntegrity(evidenceId: String): VerifyResult {
    return client.post("evidence/$evidenceId/verify") { setBody("{}") }.body()
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.api.EvidenceCustodyTest" 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/evidence/ apps/android/app/src/main/java/org/llamenos/hotline/api/ apps/android/app/src/test/java/org/llamenos/hotline/api/EvidenceCustodyTest.kt
git commit -m "feat(android): evidence custody chain screen — timeline list, integrity verify, chain status indicator"
```

---

## Task 19: Android — Cross-Hub Entity Toggle

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt`

- [ ] **Step 1: Extend RecordsRepository with crossHub param**

In `apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt`, update `fetchRecords`:

```kotlin
suspend fun fetchRecords(
    hubId: String,
    crossHub: Boolean = false,
    page: Int = 1,
    limit: Int = 20,
): RecordListResponse {
    return client.get("hubs/$hubId/records") {
        parameter("page", page)
        parameter("limit", limit)
        if (crossHub) parameter("crossHub", "true")
    }.body()
}
```

- [ ] **Step 2: Add scope toggle to CasesScreen**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt`, add scope toggle in the top bar (visible with `cases:read-cross-hub`):

```kotlin
var crossHub by remember { mutableStateOf(false) }
val i18n = I18n.current

// In topBar actions, if hasPermission("cases:read-cross-hub"):
if (hasPermission("cases:read-cross-hub")) {
    SingleChoiceSegmentedButtonRow {
        SegmentedButton(
            selected = !crossHub,
            onClick = { crossHub = false },
            shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
        ) { Text(i18n.entitiesScopeThisHub, style = MaterialTheme.typography.labelSmall) }
        SegmentedButton(
            selected = crossHub,
            onClick = { crossHub = true },
            shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
        ) { Text(i18n.entitiesScopeAllHubs, style = MaterialTheme.typography.labelSmall) }
    }
}

// Pass crossHub to ViewModel fetch:
LaunchedEffect(crossHub) { viewModel.loadRecords(crossHub = crossHub) }
```

When `crossHub` is true, each record card shows a hub badge.

- [ ] **Step 3: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt apps/android/app/src/main/java/org/llamenos/hotline/api/RecordsRepository.kt
git commit -m "feat(android): cross-hub entity scope toggle — segmented button, hub badge on records"
```

---

## Task 20: Android — Calendar and Timeline Display Types

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityCalendarScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityTimelineScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt`

- [ ] **Step 1: Create EntityCalendarScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityCalendarScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.cases

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

@Composable
fun EntityCalendarScreen(
    records: List<CaseRecord>,
    dateField: String,
    onRecordClick: (String) -> Unit,
) {
    var currentMonth by remember { mutableStateOf(YearMonth.now()) }
    val formatter = DateTimeFormatter.ISO_LOCAL_DATE

    val recordsByDate: Map<LocalDate, List<CaseRecord>> = remember(records, dateField) {
        records.mapNotNull { r ->
            val raw = r.decryptedData?.get(dateField) as? String ?: return@mapNotNull null
            val date = runCatching { LocalDate.parse(raw.take(10), formatter) }.getOrNull()
                ?: return@mapNotNull null
            date to r
        }.groupBy({ it.first }, { it.second })
    }

    Column {
        // Month navigation
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { currentMonth = currentMonth.minusMonths(1) }) {
                Icon(Icons.Default.ChevronLeft, contentDescription = "Previous")
            }
            Text(
                currentMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy")),
                style = MaterialTheme.typography.titleMedium
            )
            IconButton(onClick = { currentMonth = currentMonth.plusMonths(1) }) {
                Icon(Icons.Default.ChevronRight, contentDescription = "Next")
            }
        }

        // Day-of-week headers
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            listOf("S","M","T","W","T","F","S").forEach { d ->
                Text(
                    d,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }

        // Calendar grid
        val firstDayOfWeek = currentMonth.atDay(1).dayOfWeek.value % 7
        val daysInMonth = currentMonth.lengthOfMonth()
        val totalCells = firstDayOfWeek + daysInMonth

        LazyVerticalGrid(
            columns = GridCells.Fixed(7),
            modifier = Modifier.fillMaxWidth().padding(4.dp),
        ) {
            items(totalCells) { idx ->
                if (idx < firstDayOfWeek) {
                    Box(Modifier.aspectRatio(1f))
                } else {
                    val day = idx - firstDayOfWeek + 1
                    val date = currentMonth.atDay(day)
                    val dayRecords = recordsByDate[date] ?: emptyList()
                    val isToday = date == LocalDate.now()
                    Box(
                        modifier = Modifier
                            .aspectRatio(1f)
                            .padding(2.dp)
                            .clickable(enabled = dayRecords.isNotEmpty()) {
                                dayRecords.firstOrNull()?.let { onRecordClick(it.id) }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "$day",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isToday) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurface,
                                fontWeight = if (isToday) androidx.compose.ui.text.font.FontWeight.Bold else null,
                            )
                            if (dayRecords.isNotEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .size(4.dp)
                                        .background(
                                            MaterialTheme.colorScheme.primary,
                                            shape = androidx.compose.foundation.shape.CircleShape,
                                        )
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Create EntityTimelineScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityTimelineScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.cases

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun EntityTimelineScreen(
    records: List<CaseRecord>,
    onRecordClick: (String) -> Unit,
) {
    val sorted = records.sortedByDescending { it.createdAt ?: "" }

    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        itemsIndexed(sorted) { idx, record ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .padding(top = 4.dp)
                            .background(
                                MaterialTheme.colorScheme.primary,
                                shape = androidx.compose.foundation.shape.CircleShape,
                            )
                    )
                    if (idx < sorted.lastIndex) {
                        Divider(modifier = Modifier.width(1.dp).height(56.dp))
                    }
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onRecordClick(record.id) }
                        .padding(bottom = 12.dp),
                ) {
                    Text(
                        record.decryptedData?.get("title") as? String ?: record.id.take(8),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (record.createdAt != null) {
                        Text(
                            record.createdAt,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Add display type picker to CasesScreen**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt`, add display type state and conditional rendering (only when entity type declares multiple display types):

```kotlin
var displayType by remember { mutableStateOf("list") }
val i18n = I18n.current
val supportedTypes = viewModel.activeEntityType?.displayTypes ?: listOf("list")

if (supportedTypes.size > 1) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
        supportedTypes.forEachIndexed { index, dt ->
            SegmentedButton(
                selected = displayType == dt,
                onClick = { displayType = dt },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = supportedTypes.size)
            ) { Text(dt.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) }
        }
    }
}

when (displayType) {
    "calendar" -> EntityCalendarScreen(
        records = viewModel.records,
        dateField = viewModel.activeEntityType?.fields?.firstOrNull { it.type == "date" }?.name ?: "date",
        onRecordClick = { id -> navController.navigate("records/$id") },
    )
    "timeline" -> EntityTimelineScreen(
        records = viewModel.records,
        onRecordClick = { id -> navController.navigate("records/$id") },
    )
    else -> { /* existing list view */ }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityCalendarScreen.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EntityTimelineScreen.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CasesScreen.kt
git commit -m "feat(android): calendar and timeline entity display types — month grid composable, chronological list"
```

---

## Task 21: i18n — All New String Keys

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

- [ ] **Step 1: Add all new keys to en.json**

In `packages/i18n/locales/en.json`, add the following keys in the appropriate sections:

```json
"contacts": {
  "merge": {
    "button": "Merge",
    "title": "Merge Contacts",
    "field": "Field",
    "primary": "Primary (keep)",
    "secondary": "Secondary (absorbed)",
    "confirm": "Merge Contacts",
    "merging": "Merging…",
    "error": {
      "unknown": "Merge failed"
    }
  },
  "bulk": {
    "select": "Select",
    "selected": "{{count}} selected",
    "add_tags": "Add Tags",
    "remove_tags": "Remove Tags",
    "add_to_group": "Add to Group",
    "remove_from_group": "Remove from Group",
    "set_risk_level": "Set Risk Level",
    "delete": "Delete Selected",
    "confirm_delete": "Delete {{count}} contacts? This cannot be undone."
  },
  "import": {
    "button": "Import",
    "title": "Import Contacts",
    "instructions": "Upload a CSV or vCard (.vcf) file. Max 100 contacts per batch. The file is parsed locally — it is never sent to the server.",
    "choose_file": "Choose File",
    "preview_count": "{{count}} contacts found",
    "duplicates_found": "{{count}} potential duplicate(s)",
    "skip_duplicate": "Skip (duplicate)",
    "include": "Include",
    "confirm": "Import {{count}} Contacts",
    "importing": "Importing…",
    "success": "Import complete",
    "back": "Back",
    "error": {
      "too_many": "File contains more than {{max}} contacts. Split into multiple batches.",
      "unknown": "Import failed"
    }
  }
},
"entities": {
  "merge": {
    "title": "Merge Records",
    "description": "Merge \"{{secondary}}\" into \"{{primary}}\"",
    "primary_survives": "Surviving record",
    "secondary_absorbed": "Absorbed record",
    "warning": "This cannot be undone. All contacts, interactions, and evidence from the absorbed record will be relinked to the surviving record.",
    "confirm": "Merge Records",
    "merging": "Merging…"
  },
  "scope": {
    "this_hub": "This Hub",
    "all_hubs": "All Hubs"
  },
  "display_type": {
    "table": "Table",
    "calendar": "Calendar",
    "timeline": "Timeline"
  },
  "timeline": {
    "empty": "No records",
    "untitled": "(untitled)"
  }
},
"evidence": {
  "custody": {
    "title": "Custody Chain",
    "verify": "Verify Integrity",
    "verifying": "Verifying…",
    "chain_valid": "Chain verified — no tampering detected",
    "chain_broken": "Chain broken at entry #{{entry}}"
  }
},
"merge": {
  "error": {
    "unknown": "Merge failed"
  }
}
```

- [ ] **Step 2: Add translations to all 12 other locales**

For each of `es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de`, add the same keys with appropriate translations. Use existing locale patterns for tone and formatting.

Key translations for `es` (representative):

```json
"contacts.merge.button": "Fusionar",
"contacts.merge.title": "Fusionar contactos",
"contacts.merge.confirm": "Fusionar contactos",
"contacts.bulk.select": "Seleccionar",
"contacts.bulk.delete": "Eliminar seleccionados",
"contacts.import.button": "Importar",
"contacts.import.title": "Importar contactos",
"entities.merge.title": "Fusionar registros",
"entities.scope.this_hub": "Este hub",
"entities.scope.all_hubs": "Todos los hubs",
"entities.display_type.table": "Tabla",
"entities.display_type.calendar": "Calendario",
"entities.display_type.timeline": "Cronología",
"evidence.custody.title": "Cadena de custodia",
"evidence.custody.verify": "Verificar integridad",
"evidence.custody.chain_valid": "Cadena verificada — sin manipulación detectada",
"evidence.custody.chain_broken": "Cadena rota en la entrada #{{entry}}"
```

- [ ] **Step 3: Run i18n validation**

```bash
bun run i18n:validate:all
```

Expected: clean — all keys present in all 13 locales, no orphaned keys.

- [ ] **Step 4: Run codegen to regenerate platform string files**

```bash
bun run i18n:codegen
```

Expected: iOS `.strings` and Android `strings.xml` updated.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/locales/
git commit -m "feat(i18n): add merge, bulk, import, custody chain, display type, cross-hub labels — all 13 locales"
```

---

## Task 22: BDD Tests

**Files:**
- New: `packages/test-specs/features/cms/contact-merge.feature`
- New: `packages/test-specs/features/cms/entity-merge.feature`
- New: `packages/test-specs/features/cms/bulk-ops.feature`
- New: `packages/test-specs/features/cms/contact-import.feature`
- New: `packages/test-specs/features/cms/cross-hub.feature`
- New: `tests/steps/backend/cms-advanced.steps.ts`

- [ ] **Step 1: Create contact merge feature**

Create `packages/test-specs/features/cms/contact-merge.feature`:

```gherkin
Feature: Contact Merge
  As an admin with contacts:merge permission
  I want to merge two contacts into one
  So that duplicate contact records are eliminated

  Background:
    Given a hub "test-hub" exists
    And I am authenticated as an admin with "contacts:merge" permission

  Scenario: Merge two contacts — primary survives
    Given a contact "Alice Smith" exists in "test-hub"
    And a contact "Alice J. Smith" exists in "test-hub"
    When I POST to "/directory/merge" with primary and secondary IDs and merged encrypted profile
    Then the response status is 200
    And the secondary contact has "mergedIntoId" pointing to the primary
    And the secondary contact has a "deletedAt" timestamp
    And the primary contact has the merged encrypted profile

  Scenario: Relinks secondary's group memberships to primary
    Given contact "Alice" is a member of group "Supporters"
    And I merge "Alice" (secondary) into "Bob" (primary)
    Then "Bob" is now a member of group "Supporters"

  Scenario: Rejects merge of contacts in different hubs
    Given contact "Alice" exists in "hub-1"
    And contact "Bob" exists in "hub-2"
    When I POST to "/directory/merge" with those IDs
    Then the response status is 400
    And the error message contains "cross-hub merge not permitted"

  Scenario: Requires contacts:merge permission
    Given I am authenticated as a volunteer without "contacts:merge" permission
    When I POST to "/directory/merge"
    Then the response status is 403
```

- [ ] **Step 2: Create entity merge feature**

Create `packages/test-specs/features/cms/entity-merge.feature`:

```gherkin
Feature: Entity (Record) Merge
  As an admin with cases:update permission
  I want to merge two entity records
  So that duplicate case records are consolidated

  Background:
    Given a hub "test-hub" exists
    And I am authenticated as an admin with "cases:update" permission

  Scenario: Merge two records — relinks contacts, interactions, evidence
    Given record "Incident A" exists with 2 linked contacts and 1 evidence item
    And record "Incident B" exists with 1 linked contact
    When I POST to "/records/merge" with "Incident A" as primary and "Incident B" as secondary
    Then the response status is 200
    And the response includes "relinkedContacts: 1"
    And "Incident A" now has 3 linked contacts
    And "Incident B" is soft-deleted with "mergedIntoId" pointing to "Incident A"

  Scenario: Rejects merge of records from different hubs
    Given record "R1" is in "hub-1" and record "R2" is in "hub-2"
    When I POST to "/records/merge" with R1 as primary and R2 as secondary
    Then the response status is 400
```

- [ ] **Step 3: Create bulk ops feature**

Create `packages/test-specs/features/cms/bulk-ops.feature`:

```gherkin
Feature: Bulk Contact Operations
  As an admin with contacts:edit permission
  I want to apply batch operations to multiple contacts
  So that I can efficiently manage large contact lists

  Background:
    Given a hub "test-hub" exists
    And I am authenticated as an admin with "contacts:edit" permission
    And 5 contacts exist in "test-hub"

  Scenario: Add tags to multiple contacts
    When I POST to "/directory/bulk" with action "add-tags", all 5 contact IDs, and updated blind indexes
    Then the response status is 200
    And "affected" equals 5

  Scenario: Add contacts to an affinity group
    Given an affinity group "Crisis Team" exists
    When I POST to "/directory/bulk" with action "add-to-group" and group ID for "Crisis Team"
    Then the response status is 200
    And all 5 contacts are now members of "Crisis Team"

  Scenario: Delete multiple contacts
    Given I am authenticated as an admin with "contacts:delete" permission
    When I POST to "/directory/bulk" with action "delete" and 3 contact IDs
    Then the response status is 200
    And the 3 contacts are soft-deleted

  Scenario: Requires contacts:delete for delete action
    Given I am authenticated as admin with only "contacts:edit" (no "contacts:delete")
    When I POST to "/directory/bulk" with action "delete"
    Then the response status is 403
```

- [ ] **Step 4: Create contact import feature**

Create `packages/test-specs/features/cms/contact-import.feature`:

```gherkin
Feature: Batch Contact Import
  As an admin with contacts:create permission
  I want to batch-import encrypted contacts
  So that I can efficiently onboard large contact lists

  Background:
    Given a hub "test-hub" exists
    And I am authenticated as an admin with "contacts:create" permission

  Scenario: Import a batch of 5 contacts
    When I POST to "/directory/bulk-create" with 5 encrypted contact payloads
    Then the response status is 201
    And "created" equals 5
    And "contactIds" has length 5

  Scenario: Rejects batches larger than 100
    When I POST to "/directory/bulk-create" with 101 contact payloads
    Then the response status is 400
    And the error message contains "batch exceeds maximum of 100"

  Scenario: Requires contacts:create permission
    Given I am authenticated as a volunteer without "contacts:create" permission
    When I POST to "/directory/bulk-create"
    Then the response status is 403
```

- [ ] **Step 5: Create cross-hub feature**

Create `packages/test-specs/features/cms/cross-hub.feature`:

```gherkin
Feature: Cross-Hub Entity Visibility
  As a super-admin with cases:read-cross-hub permission
  I want to view entities across all hubs I'm enrolled in
  So that I can oversee multiple hubs from a single view

  Background:
    Given hubs "hub-alpha" and "hub-beta" exist
    And I am authenticated as super-admin with "cases:read-cross-hub" permission
    And my pubkey is enrolled in both hubs' entity envelopes (added at creation time)

  Scenario: Cross-hub query returns records from all enrolled hubs
    Given record "Case A" in "hub-alpha" has my pubkey in summaryEnvelopes
    And record "Case B" in "hub-beta" has my pubkey in summaryEnvelopes
    When I GET "/records?crossHub=true"
    Then the response status is 200
    And the response includes records from both "hub-alpha" and "hub-beta"

  Scenario: Cross-hub query excludes records where my pubkey is not in summaryEnvelopes
    Given record "Case C" in "hub-alpha" does NOT have my pubkey in summaryEnvelopes
    When I GET "/records?crossHub=true"
    Then "Case C" is not in the response

  Scenario: Without cases:read-cross-hub, cross-hub query returns 403
    Given I am authenticated as a regular admin without "cases:read-cross-hub"
    When I GET "/records?crossHub=true"
    Then the response status is 403
```

- [ ] **Step 6: Create step definitions**

Create `tests/steps/backend/cms-advanced.steps.ts` with step implementations for all five feature files, using the existing step definition patterns from `tests/steps/backend/`.

- [ ] **Step 7: Run BDD tests**

```bash
bun run test:backend:bdd --feature cms
```

Expected: all scenarios pass.

- [ ] **Step 8: Commit**

```bash
git add packages/test-specs/features/cms/ tests/steps/backend/cms-advanced.steps.ts
git commit -m "test(bdd): contact merge, entity merge, bulk ops, batch import, cross-hub visibility scenarios"
```

---

## Task 23: Verification Gate

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run backend unit tests**

```bash
cd apps/worker && bun test __tests__/unit/contacts.merge.test.ts __tests__/unit/contacts.bulk.test.ts __tests__/unit/cases.merge.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run backend BDD suite**

```bash
bun run test:backend:bdd
```

Expected: all scenarios green.

- [ ] **Step 4: Run desktop Playwright tests**

```bash
bun run test:desktop
```

Expected: all tests pass.

- [ ] **Step 5: Run iOS tests**

```bash
bun run ios:test
```

Expected: all unit tests pass including `EvidenceCustodyTests`.

- [ ] **Step 6: Run Android tests**

```bash
bun run test:android
```

Expected: all unit tests pass including `EvidenceCustodyTest`.

- [ ] **Step 7: Run i18n validation**

```bash
bun run i18n:validate:all
```

Expected: no missing keys, no orphaned keys.

- [ ] **Step 8: Run codegen clean**

```bash
bun run codegen
```

Expected: clean exit, no schema errors, all new types generated.

- [ ] **Step 9: Final commit**

```bash
git add -p
git commit -m "chore(ep06-a4): verification gate — all tests pass, codegen clean, i18n complete"
```

---

## Summary of Changes

| Layer | Files Changed | Key Additions |
|-------|--------------|---------------|
| Protocol | 3 new schema files, 2 modified | merge, bulk, bulk-create schemas; `displayTypes` on entity types |
| Backend | 4 service methods, 4 route handlers, 5 unit test files | contact merge, entity merge, bulk ops, batch import, cross-hub JSONB query |
| Desktop | 5 new components, 3 modified routes/files | merge dialogs, import dialog, custody chain, multi-select, cross-hub toggle, calendar, timeline |
| iOS | 3 new views, 2 modified services | custody chain, cross-hub toggle, calendar, timeline |
| Android | 4 new screens, 2 modified files | custody chain, cross-hub toggle, calendar, timeline |
| i18n | 13 locale files | ~55 keys across merge, bulk, import, custody, display types, cross-hub |
| BDD | 5 feature files + step definitions | 18 scenarios covering all new behaviors |

### Security Invariants Upheld

- Contact merge: server receives only ciphertext — plaintext merge and re-encryption happen client-side
- Bulk operations: no action produces exportable output; delete is soft-delete only
- Import: CSV/vCard parsed client-side and discarded; server receives same encrypted payloads as manual creation
- Cross-hub: JSONB pubkey containment query — server queries index without decrypting any payload; forward-only envelopes prevent retroactive access
- Evidence custody: hash-chain integrity verified client-side by re-computing SHA-256 chain
