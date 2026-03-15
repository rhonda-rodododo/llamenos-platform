# Epic 325: Evidence & Chain of Custody

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 319 (Record Entity), Epic 323 (Case Interactions)
**Blocks**: Epic 332 (Desktop Case Timeline & Evidence Viewer)
**Branch**: `desktop`

## Summary

Extend the existing file upload system with evidence-specific metadata, chain of custody tracking, and integrity verification for files attached to case records. Every evidence file gets a SHA-256 integrity hash at upload, a classification (photo, video, document, audio), and a custody chain that logs every access (upload, view, download, share, export). Evidence uploads create `file_upload` interactions on the case timeline (from Epic 323). Large file support uses existing R2 chunked upload infrastructure enhanced with custody metadata. This makes file attachments court-admissible by providing an auditable chain of custody. ~12 files created/modified.

## Problem Statement

The existing file upload system stores files in R2 with basic metadata (filename, MIME type, size). For case management, files become evidence -- and evidence requires:

1. **Integrity verification**: A photo of police brutality is useless as evidence if there is no proof it has not been tampered with. A SHA-256 hash of the encrypted file stored at upload and verified on download provides this guarantee.
2. **Classification**: Is this a photo, video, document, or audio recording? Classification enables the UI to render appropriate viewers and filters.
3. **Chain of custody**: Every access to the file must be logged -- who uploaded it, who viewed it, who downloaded it, when, and what the integrity hash was at each step. This is critical for court proceedings (copwatch, police accountability, DV cases).
4. **Source tracking**: Where did this evidence come from? A volunteer's phone? A legal observer's body camera? A community member's report submission?

Without chain of custody, a defense attorney can challenge evidence by arguing it may have been altered after upload. With it, there is a cryptographic proof chain from upload to courtroom.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Evidence Schemas

**File**: `apps/worker/schemas/evidence.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

export const evidenceClassificationSchema = z.enum([
  'photo', 'video', 'document', 'audio', 'other',
])

export type EvidenceClassification = z.infer<typeof evidenceClassificationSchema>

export const custodyActionSchema = z.enum([
  'uploaded', 'viewed', 'downloaded', 'shared', 'exported', 'integrity_verified',
])

export type CustodyAction = z.infer<typeof custodyActionSchema>

export const custodyEntrySchema = z.object({
  id: z.uuid(),
  action: custodyActionSchema,
  actorPubkey: z.string(),
  timestamp: z.string(),               // ISO 8601
  integrityHash: z.string(),           // SHA-256 of the file at time of action
  ipHash: z.string().optional(),       // Blind index of IP (for audit, not tracking)
  userAgent: z.string().optional(),    // Browser/client identifier
  notes: z.string().optional(),        // Optional reason (e.g., "downloaded for court filing")
})

export type CustodyEntry = z.infer<typeof custodyEntrySchema>

export const evidenceMetadataSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  fileId: z.string(),                   // Reference to the R2 file
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  classification: evidenceClassificationSchema,

  // --- Integrity ---
  integrityHash: z.string(),           // SHA-256 of encrypted file at upload
  hashAlgorithm: z.literal('sha256'),

  // --- Source ---
  source: z.string().optional(),        // "volunteer_upload", "report_attachment", "observer_camera"
  sourceDescription: z.string().optional(),

  // --- E2EE metadata ---
  encryptedDescription: z.string().optional(),
  descriptionEnvelopes: z.array(recipientEnvelopeSchema).optional(),

  // --- Timestamps ---
  uploadedAt: z.string(),
  uploadedBy: z.string(),              // Pubkey

  // --- Custody chain ---
  custodyEntryCount: z.number(),
})

export type EvidenceMetadata = z.infer<typeof evidenceMetadataSchema>

export const uploadEvidenceBodySchema = z.object({
  caseId: z.uuid(),
  classification: evidenceClassificationSchema,
  source: z.string().optional(),
  sourceDescription: z.string().optional(),
  encryptedDescription: z.string().optional(),
  descriptionEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  integrityHash: z.string().min(64).max(64),  // Client-computed SHA-256 hex
})

export const listEvidenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  classification: evidenceClassificationSchema.optional(),
})
```

#### Task 2: CaseDO Evidence Storage

**File**: `apps/worker/durable-objects/case-do.ts` (extend)

Add evidence metadata and custody chain storage. Storage key conventions:

```
evidence:{caseId}:{id}                             -> EvidenceMetadata
custody:{evidenceId}:{entryId}                     -> CustodyEntry
idx:evidence:class:{classHash}:{caseId}:{id}       -> true (classification filter)
idx:evidence:case:{caseId}:{id}                    -> true (case index)
```

New DORouter handlers:

```typescript
// Upload evidence metadata (file is uploaded separately to R2)
this.router.post('/records/:caseId/evidence', async (req) => {
  const { caseId } = req.params
  const record = await this.ctx.storage.get(`record:${caseId}`)
  if (!record) return json({ error: 'Record not found' }, { status: 404 })

  const body = await req.json()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const evidence: EvidenceMetadata = {
    id,
    caseId,
    fileId: body.fileId,
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    classification: body.classification,
    integrityHash: body.integrityHash,
    hashAlgorithm: 'sha256',
    source: body.source,
    sourceDescription: body.sourceDescription,
    encryptedDescription: body.encryptedDescription,
    descriptionEnvelopes: body.descriptionEnvelopes,
    uploadedAt: now,
    uploadedBy: req.headers.get('x-pubkey') ?? '',
    custodyEntryCount: 1,
  }

  // Store evidence metadata
  await this.ctx.storage.put(`evidence:${caseId}:${id}`, evidence)
  await this.ctx.storage.put(
    `idx:evidence:case:${caseId}:${id}`,
    true,
  )

  // Create initial custody entry (uploaded)
  const custodyId = crypto.randomUUID()
  const uploadEntry: CustodyEntry = {
    id: custodyId,
    action: 'uploaded',
    actorPubkey: req.headers.get('x-pubkey') ?? '',
    timestamp: now,
    integrityHash: body.integrityHash,
  }
  await this.ctx.storage.put(`custody:${id}:${custodyId}`, uploadEntry)

  // Update record file count
  const rec = record as Record<string, unknown>
  rec.fileCount = ((rec.fileCount as number) ?? 0) + 1
  rec.updatedAt = now
  await this.ctx.storage.put(`record:${caseId}`, rec)

  return json(evidence, { status: 201 })
})

// List evidence for a case
this.router.get('/records/:caseId/evidence', async (req) => {
  const { caseId } = req.params
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
  const classification = url.searchParams.get('classification')

  const entries = await this.ctx.storage.list({ prefix: `evidence:${caseId}:` })
  let evidenceList: EvidenceMetadata[] = []
  for (const [, value] of entries) evidenceList.push(value as EvidenceMetadata)

  if (classification) {
    evidenceList = evidenceList.filter(e => e.classification === classification)
  }

  evidenceList.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const start = (page - 1) * limit
  const paged = evidenceList.slice(start, start + limit)

  return json({
    evidence: paged,
    total: evidenceList.length,
    page,
    limit,
    hasMore: start + limit < evidenceList.length,
  })
})

// Get evidence metadata
this.router.get('/evidence/:id', async (req) => {
  // Scan for evidence by ID across cases
  const allEvidence = await this.ctx.storage.list({ prefix: 'evidence:' })
  for (const [key, value] of allEvidence) {
    const ev = value as EvidenceMetadata
    if (ev.id === req.params.id) return json(ev)
  }
  return json({ error: 'Evidence not found' }, { status: 404 })
})

// Get custody chain for evidence
this.router.get('/evidence/:id/custody', async (req) => {
  const entries = await this.ctx.storage.list({ prefix: `custody:${req.params.id}:` })
  const chain: CustodyEntry[] = []
  for (const [, value] of entries) chain.push(value as CustodyEntry)
  chain.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) // Chronological
  return json({ custodyChain: chain, total: chain.length })
})

// Add custody entry (called when evidence is accessed)
this.router.post('/evidence/:id/custody', async (req) => {
  const { id: evidenceId } = req.params
  const body = await req.json()
  const custodyId = crypto.randomUUID()
  const now = new Date().toISOString()

  const entry: CustodyEntry = {
    id: custodyId,
    action: body.action,
    actorPubkey: req.headers.get('x-pubkey') ?? '',
    timestamp: now,
    integrityHash: body.integrityHash,
    ipHash: body.ipHash,
    userAgent: body.userAgent,
    notes: body.notes,
  }

  await this.ctx.storage.put(`custody:${evidenceId}:${custodyId}`, entry)

  // Update custody entry count on evidence metadata
  const allEvidence = await this.ctx.storage.list({ prefix: 'evidence:' })
  for (const [key, value] of allEvidence) {
    const ev = value as EvidenceMetadata
    if (ev.id === evidenceId) {
      ev.custodyEntryCount++
      await this.ctx.storage.put(key, ev)
      break
    }
  }

  return json(entry, { status: 201 })
})

// Verify evidence integrity
this.router.post('/evidence/:id/verify', async (req) => {
  const { id: evidenceId } = req.params
  const { currentHash } = await req.json()

  // Find the evidence metadata
  const allEvidence = await this.ctx.storage.list({ prefix: 'evidence:' })
  let evidence: EvidenceMetadata | null = null
  for (const [, value] of allEvidence) {
    const ev = value as EvidenceMetadata
    if (ev.id === evidenceId) { evidence = ev; break }
  }
  if (!evidence) return json({ error: 'Evidence not found' }, { status: 404 })

  const isValid = currentHash === evidence.integrityHash
  const now = new Date().toISOString()

  // Log the verification as a custody entry
  const custodyId = crypto.randomUUID()
  const verifyEntry: CustodyEntry = {
    id: custodyId,
    action: 'integrity_verified',
    actorPubkey: req.headers.get('x-pubkey') ?? '',
    timestamp: now,
    integrityHash: currentHash,
    notes: isValid ? 'Integrity verified: hash matches' : 'INTEGRITY MISMATCH: hash does not match original',
  }
  await this.ctx.storage.put(`custody:${evidenceId}:${custodyId}`, verifyEntry)

  return json({ valid: isValid, originalHash: evidence.integrityHash, currentHash })
})
```

#### Task 3: Evidence API Routes

**File**: `apps/worker/routes/evidence.ts` (new)

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'

const evidence = new Hono<AppEnv>()

// Upload evidence to a case record
// The actual file is uploaded to R2 via the existing file upload route.
// This route creates the evidence metadata and initial custody entry.
evidence.post('/records/:id/evidence',
  requirePermission('evidence:upload'),
  async (c) => {
    const caseId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = await c.req.json()

    // Upload file to R2 first via existing infrastructure
    // (The client uploads the encrypted file, gets back a fileId)

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/evidence`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify({
          ...body,
          fileId: body.fileId,
          filename: body.filename,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
        }),
      }),
    )
    if (!res.ok) return new Response(res.body, res)

    const created = await res.json() as EvidenceMetadata

    // Auto-create a file_upload interaction on the case timeline
    await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/interactions`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify({
          interactionType: 'file_upload',
          sourceId: created.id,
          interactionTypeHash: body.interactionTypeHash ?? '',
        }),
      }),
    )

    await audit(dos.records, 'evidenceUploaded', c.get('pubkey'), {
      caseId,
      evidenceId: created.id,
      classification: body.classification,
    })

    return c.json(created, 201)
  },
)

// List evidence for a case
evidence.get('/records/:id/evidence',
  requirePermission('evidence:download'),
  async (c) => {
    const caseId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const qs = new URLSearchParams()
    if (c.req.query('page')) qs.set('page', c.req.query('page')!)
    if (c.req.query('limit')) qs.set('limit', c.req.query('limit')!)
    if (c.req.query('classification')) qs.set('classification', c.req.query('classification')!)

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/evidence?${qs}`),
    )
    return new Response(res.body, res)
  },
)

// Get custody chain for evidence
evidence.get('/evidence/:id/custody',
  requirePermission('evidence:manage-custody'),
  async (c) => {
    const evidenceId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/custody`),
    )
    return new Response(res.body, res)
  },
)

// Log evidence access (called automatically when evidence is viewed/downloaded)
evidence.post('/evidence/:id/access',
  requirePermission('evidence:download'),
  async (c) => {
    const evidenceId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = await c.req.json()

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/custody`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify({
          action: body.action ?? 'viewed',
          integrityHash: body.integrityHash,
          userAgent: c.req.header('user-agent'),
        }),
      }),
    )

    await audit(dos.records, 'evidenceAccessed', c.get('pubkey'), {
      evidenceId,
      action: body.action ?? 'viewed',
    })

    return new Response(res.body, res)
  },
)

// Verify evidence integrity
evidence.post('/evidence/:id/verify',
  requirePermission('evidence:download'),
  async (c) => {
    const evidenceId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = await c.req.json()

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/verify`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify(body),
      }),
    )
    return new Response(res.body, res)
  },
)

export default evidence
```

#### Task 4: Mount Routes

**File**: `apps/worker/app.ts`

```typescript
import evidence from './routes/evidence'
app.route('/api', evidence)
```

#### Task 5: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "evidence": {
    "title": "Evidence",
    "upload": "Upload Evidence",
    "noEvidence": "No evidence files.",
    "classification": "Classification",
    "classifications": {
      "photo": "Photo",
      "video": "Video",
      "document": "Document",
      "audio": "Audio Recording",
      "other": "Other"
    },
    "source": "Source",
    "integrityHash": "Integrity Hash",
    "integrityVerified": "Integrity Verified",
    "integrityFailed": "INTEGRITY MISMATCH",
    "verifyIntegrity": "Verify Integrity",
    "custodyChain": "Chain of Custody",
    "custodyActions": {
      "uploaded": "Uploaded",
      "viewed": "Viewed",
      "downloaded": "Downloaded",
      "shared": "Shared",
      "exported": "Exported",
      "integrity_verified": "Integrity Verified"
    },
    "custodyEntries": "{{count}} custody entries",
    "uploadedBy": "Uploaded by",
    "uploadedAt": "Uploaded at",
    "fileSize": "File Size",
    "downloadEvidence": "Download",
    "filterByType": "Filter by type"
  }
}
```

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/evidence.feature`

```gherkin
@backend
Feature: Evidence & Chain of Custody
  Files attached to case records are tracked as evidence with
  integrity hashes, classification, and an auditable custody chain.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with category "case"
    And a record "arrest_001" of type "arrest_case"

  @cases @evidence
  Scenario: Upload evidence with integrity hash
    When admin "admin1" uploads evidence to "arrest_001" with:
      | classification | photo                                    |
      | filename       | protest_photo_001.jpg.enc                |
      | integrityHash  | a1b2c3d4e5f6...                          |
      | source         | legal_observer_camera                     |
    Then the evidence should exist with a generated UUID
    And it should have classification "photo"
    And it should have integrityHash "a1b2c3d4e5f6..."
    And a custody entry of action "uploaded" should be created
    And the record's fileCount should increase by 1
    And a "file_upload" interaction should be created on the case timeline

  @cases @evidence
  Scenario: List evidence for a case
    Given "arrest_001" has evidence:
      | classification | filename         |
      | photo          | photo_001.enc    |
      | video          | video_001.enc    |
      | document       | report.pdf.enc   |
    When admin "admin1" lists evidence for "arrest_001"
    Then 3 evidence items should be returned

  @cases @evidence
  Scenario: Filter evidence by classification
    Given "arrest_001" has photo and video evidence
    When admin "admin1" lists evidence with classification "photo"
    Then only photo evidence should be returned

  @cases @evidence
  Scenario: Viewing evidence creates a custody entry
    Given evidence "evidence_001" exists on "arrest_001"
    When admin "admin1" views evidence "evidence_001"
    Then a custody entry of action "viewed" should be created
    And the custody entry should record the admin's pubkey
    And the custody entry should record the timestamp

  @cases @evidence
  Scenario: Downloading evidence creates a custody entry
    Given evidence "evidence_001" exists on "arrest_001"
    When admin "admin1" downloads evidence "evidence_001"
    Then a custody entry of action "downloaded" should be created

  @cases @evidence
  Scenario: Get full custody chain for evidence
    Given evidence "evidence_001" with 5 custody entries
    When admin "admin1" requests the custody chain for "evidence_001"
    Then 5 custody entries should be returned in chronological order
    And the first entry should be action "uploaded"

  @cases @evidence
  Scenario: Verify evidence integrity - hash matches
    Given evidence "evidence_001" with integrityHash "abc123def456"
    When admin "admin1" verifies integrity with hash "abc123def456"
    Then the verification should succeed
    And a custody entry of action "integrity_verified" should be created

  @cases @evidence
  Scenario: Verify evidence integrity - hash mismatch
    Given evidence "evidence_001" with integrityHash "abc123def456"
    When admin "admin1" verifies integrity with hash "TAMPERED_HASH"
    Then the verification should fail
    And the response should include the original and current hashes
    And a custody entry should note the integrity mismatch

  @cases @evidence @permissions
  Scenario: Volunteer without evidence:upload cannot upload
    Given a registered volunteer "vol1" without "evidence:upload" permission
    When volunteer "vol1" tries to upload evidence to "arrest_001"
    Then the response status should be 403

  @cases @evidence @permissions
  Scenario: Volunteer without evidence:manage-custody cannot view custody chain
    Given a registered volunteer "vol1" with "evidence:download" but not "evidence:manage-custody"
    When volunteer "vol1" tries to get the custody chain for evidence
    Then the response status should be 403
```

#### Task 7: Backend Step Definitions

**File**: `tests/steps/backend/evidence.steps.ts`

Implement step definitions for all scenarios.

### Phase 2: Desktop UI

Deferred to Epic 332 (Desktop Case Timeline & Evidence Viewer).

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/evidence.ts` | Zod schemas for evidence metadata and custody chain |
| `apps/worker/routes/evidence.ts` | API routes for evidence upload, listing, custody, verification |
| `packages/test-specs/features/core/evidence.feature` | BDD scenarios |
| `tests/steps/backend/evidence.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/case-do.ts` | Add evidence metadata storage, custody chain handlers, integrity verification |
| `apps/worker/app.ts` | Mount evidence routes |
| `packages/protocol/tools/schema-registry.ts` | Register evidence schemas |
| `packages/i18n/locales/en.json` | Add evidence i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` -- 10 scenarios in `evidence.feature`

### Typecheck

`bun run typecheck` -- all new types must compile

## Acceptance Criteria & Test Scenarios

- [ ] Evidence can be uploaded with integrity hash and classification
  -> `packages/test-specs/features/core/evidence.feature: "Upload evidence with integrity hash"`
- [ ] Evidence can be listed per case record
  -> `packages/test-specs/features/core/evidence.feature: "List evidence for a case"`
- [ ] Evidence can be filtered by classification
  -> `packages/test-specs/features/core/evidence.feature: "Filter evidence by classification"`
- [ ] Viewing evidence creates a custody entry
  -> `packages/test-specs/features/core/evidence.feature: "Viewing evidence creates a custody entry"`
- [ ] Downloading evidence creates a custody entry
  -> `packages/test-specs/features/core/evidence.feature: "Downloading evidence creates a custody entry"`
- [ ] Full custody chain can be retrieved in chronological order
  -> `packages/test-specs/features/core/evidence.feature: "Get full custody chain for evidence"`
- [ ] Integrity verification succeeds when hashes match
  -> `packages/test-specs/features/core/evidence.feature: "Verify evidence integrity - hash matches"`
- [ ] Integrity verification fails and logs mismatch when hashes differ
  -> `packages/test-specs/features/core/evidence.feature: "Verify evidence integrity - hash mismatch"`
- [ ] Permission enforcement for evidence upload
  -> `packages/test-specs/features/core/evidence.feature: "Volunteer without evidence:upload cannot upload"`
- [ ] Permission enforcement for custody chain access
  -> `packages/test-specs/features/core/evidence.feature: "Volunteer without evidence:manage-custody cannot view custody chain"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/evidence.feature` | New | 10 scenarios for evidence and custody chain |
| `tests/steps/backend/evidence.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **High risk**: Integrity verification (Task 2, verify handler) -- the SHA-256 hash is computed client-side on the encrypted file before upload. The server stores this hash and verifies it on download. The critical assumption is that the client honestly computes the hash. In a compromised client, the hash could be falsified. Mitigated by: (a) the hash is of the encrypted file, so even a compromised server cannot alter the plaintext; (b) the client code is reproducible-build verified (Epic 79); (c) the custody chain records the actor who performed verification.
- **Medium risk**: CaseDO evidence storage (Task 2) -- adds more key prefixes to an already complex DO. Risk mitigated by distinct prefixes (`evidence:`, `custody:`, `idx:evidence:`) that do not collide with records, events, or interactions.
- **Medium risk**: Custody chain growth (Task 2) -- a frequently viewed evidence file could accumulate many custody entries. Mitigated by pagination on the custody chain endpoint and the fact that custody entries are small (< 500 bytes each).
- **Low risk**: Routes (Task 3) -- standard CRUD pattern, no complex logic.
- **Low risk**: Interaction auto-creation (Task 3, evidence route) -- uses the same interaction creation mechanism from Epic 323.

## Execution

- **Phase 1**: Schemas -> CaseDO evidence/custody handlers -> Evidence routes -> Mount -> Codegen -> i18n -> BDD -> gate
- **Phase 2**: No dedicated UI (Epic 332 handles desktop evidence viewer)
- **Phase 3**: `bun run test:all`
