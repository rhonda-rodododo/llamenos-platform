# Epic 324: Report-Record-Event Linking

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 319 (Record Entity), Epic 320 (Event Entity)
**Blocks**: None (enables richer data relationships for Epic 330, 332)
**Branch**: `desktop`

## Summary

Build M:N linking between reports (existing conversations with `metadata.type='report'`) and case records via `ReportCaseLink` joins in CaseDO, and extend the report-event linking from Epic 320 with reverse-direction routes. Reports filed by legal observers, community reporters, or hotline callers become evidence and context for case records. Includes bidirectional query routes (records-to-reports and reports-to-records) and evidence association when a report's file attachments become relevant to a case. ~8 files created/modified.

## Problem Statement

Reports and cases exist in separate storage systems: reports are conversations in ConversationDO, cases are records in CaseDO. There is no structural link between them. In practice:

- A legal observer files a field report documenting police use of force at a protest (report). That report is critical evidence for the arrest case of the person who was subjected to that force.
- A community member calls the ICE hotline to report a sighting (report). That report triggers the creation of an ICE operation event and individual cases for affected people. The report should link to both the event and the resulting cases.
- Multiple reports may reference the same case (three witnesses report the same incident), and a single report may be relevant to multiple cases (a report about a mass arrest event is relevant to all 47 arrest cases).

Epic 320 implemented report-to-event linking. This epic adds report-to-case linking and provides the reverse-direction query routes for both.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Report-Case Link Schemas

**File**: `apps/worker/schemas/report-links.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

export const reportCaseLinkSchema = z.object({
  reportId: z.string(),              // Conversation ID
  caseId: z.uuid(),
  linkedAt: z.string(),
  linkedBy: z.string(),              // Pubkey
  encryptedNotes: z.string().optional(),  // Why this report is linked
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export type ReportCaseLink = z.infer<typeof reportCaseLinkSchema>

export const linkReportToCaseBodySchema = z.object({
  reportId: z.string().min(1),
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export const linkCaseToReportBodySchema = z.object({
  caseId: z.uuid(),
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})
```

#### Task 2: CaseDO Report-Case Link Storage

**File**: `apps/worker/durable-objects/case-do.ts` (extend)

Add ReportCaseLink storage. Storage key conventions:

```
reportcase:{reportId}:{caseId}     -> ReportCaseLink
casereports:{caseId}:{reportId}    -> ReportCaseLink (reverse index)
```

New DORouter handlers:

```typescript
// Link a report to a case
this.router.post('/records/:caseId/reports', async (req) => {
  const { caseId } = req.params
  const record = await this.ctx.storage.get(`record:${caseId}`)
  if (!record) return json({ error: 'Record not found' }, { status: 404 })

  const body = await req.json()
  const now = new Date().toISOString()

  // Check for duplicate link
  const existingLink = await this.ctx.storage.get(`reportcase:${body.reportId}:${caseId}`)
  if (existingLink) return json({ error: 'Report already linked to this case' }, { status: 409 })

  const link: ReportCaseLink = {
    reportId: body.reportId,
    caseId,
    linkedAt: now,
    linkedBy: req.headers.get('x-pubkey') ?? '',
    encryptedNotes: body.encryptedNotes,
    notesEnvelopes: body.notesEnvelopes,
  }

  await this.ctx.storage.put(`reportcase:${body.reportId}:${caseId}`, link)
  await this.ctx.storage.put(`casereports:${caseId}:${body.reportId}`, link)

  return json(link, { status: 201 })
})

// Unlink a report from a case
this.router.delete('/records/:caseId/reports/:reportId', async (req) => {
  const { caseId, reportId } = req.params
  const link = await this.ctx.storage.get(`reportcase:${reportId}:${caseId}`)
  if (!link) return json({ error: 'Link not found' }, { status: 404 })

  await this.ctx.storage.delete(`reportcase:${reportId}:${caseId}`)
  await this.ctx.storage.delete(`casereports:${caseId}:${reportId}`)

  return json({ deleted: true })
})

// List reports linked to a case
this.router.get('/records/:caseId/reports', async (req) => {
  const { caseId } = req.params
  const entries = await this.ctx.storage.list({ prefix: `casereports:${caseId}:` })
  const links: ReportCaseLink[] = []
  for (const [, value] of entries) links.push(value as ReportCaseLink)
  links.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))
  return json({ reports: links, total: links.length })
})

// List cases linked to a report (reverse direction)
this.router.get('/reports/:reportId/records', async (req) => {
  const { reportId } = req.params
  const entries = await this.ctx.storage.list({ prefix: `reportcase:${reportId}:` })
  const links: ReportCaseLink[] = []
  for (const [, value] of entries) links.push(value as ReportCaseLink)
  links.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))
  return json({ records: links, total: links.length })
})
```

#### Task 3: Report-Case API Routes

**File**: `apps/worker/routes/records.ts` (extend)

Add report linking routes to the records router:

```typescript
// Link report to record
records.post('/:id/reports',
  requirePermission('cases:link'),
  validator('json', linkReportToCaseBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify(body),
      }),
    )
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'reportLinkedToCase', c.get('pubkey'), {
      caseId: id,
      reportId: body.reportId,
    })
    return new Response(res.body, { ...res, status: 201 })
  },
)

// Unlink report from record
records.delete('/:id/reports/:reportId',
  requirePermission('cases:link'),
  async (c) => {
    const id = c.req.param('id')
    const reportId = c.req.param('reportId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports/${reportId}`, { method: 'DELETE' }),
    )
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'reportUnlinkedFromCase', c.get('pubkey'), {
      caseId: id,
      reportId,
    })
    return new Response(res.body, res)
  },
)

// List reports linked to a record
records.get('/:id/reports',
  requirePermission('cases:read-own'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports`),
    )
    return new Response(res.body, res)
  },
)
```

#### Task 4: Reverse-Direction Report Routes

**File**: `apps/worker/routes/reports.ts` (extend existing report routes)

Add reverse-direction routes so you can start from a report and find linked records:

```typescript
// List records linked to a report
reports.get('/:id/records',
  requirePermission('cases:read-own'),
  async (c) => {
    const reportId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/reports/${reportId}/records`),
    )
    return new Response(res.body, res)
  },
)

// Link case to report (reverse direction entry point)
reports.post('/:id/records',
  requirePermission('cases:link'),
  validator('json', linkCaseToReportBodySchema),
  async (c) => {
    const reportId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${body.caseId}/reports`, {
        method: 'POST',
        headers: { 'x-pubkey': c.get('pubkey') },
        body: JSON.stringify({ reportId }),
      }),
    )
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'caseLinkedToReport', c.get('pubkey'), {
      reportId,
      caseId: body.caseId,
    })
    return new Response(res.body, { ...res, status: 201 })
  },
)

// Unlink case from report (reverse direction)
reports.delete('/:id/records/:caseId',
  requirePermission('cases:link'),
  async (c) => {
    const reportId = c.req.param('id')
    const caseId = c.req.param('caseId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/reports/${reportId}`, { method: 'DELETE' }),
    )
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'caseUnlinkedFromReport', c.get('pubkey'), {
      reportId,
      caseId,
    })
    return new Response(res.body, res)
  },
)
```

#### Task 5: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "reportLinks": {
    "linkReport": "Link Report",
    "unlinkReport": "Unlink Report",
    "linkedReports": "Linked Reports",
    "linkedCases": "Linked Cases",
    "noLinkedReports": "No reports linked to this case.",
    "noLinkedCases": "No cases linked to this report.",
    "linkNotes": "Link Notes (optional)",
    "linkNotesPlaceholder": "Why is this report relevant to this case?",
    "alreadyLinked": "This report is already linked to this case.",
    "linkCreated": "Report linked to case",
    "linkRemoved": "Report unlinked from case"
  }
}
```

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/report-record-linking.feature`

```gherkin
@backend
Feature: Report-Record-Event Linking
  Many-to-many linking between reports, case records, and events
  enables reports to serve as evidence and context for cases.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with category "case"
    And a record "arrest_001" of type "arrest_case"
    And a report "observer_report_1" exists

  @cases @reports
  Scenario: Link a report to a case record
    When admin "admin1" links report "observer_report_1" to record "arrest_001"
    Then the link should exist
    And listing reports for "arrest_001" should include "observer_report_1"

  @cases @reports
  Scenario: Link a report to a case with notes
    When admin "admin1" links report "observer_report_1" to record "arrest_001" with encrypted notes
    Then the link should have encrypted notes and envelopes

  @cases @reports
  Scenario: List reports linked to a case
    Given reports "report_A", "report_B", "report_C" linked to "arrest_001"
    When admin "admin1" lists reports for "arrest_001"
    Then 3 reports should be returned
    And they should be sorted by linkedAt descending

  @cases @reports
  Scenario: Reverse lookup - list cases linked to a report
    Given "observer_report_1" is linked to records "arrest_001" and "arrest_002"
    When admin "admin1" lists records for report "observer_report_1"
    Then 2 records should be returned

  @cases @reports
  Scenario: Link a case to a report from the report side
    When admin "admin1" links case "arrest_001" to report "observer_report_1" from the report route
    Then listing reports for "arrest_001" should include "observer_report_1"
    And listing records for "observer_report_1" should include "arrest_001"

  @cases @reports
  Scenario: Unlink a report from a case
    Given report "observer_report_1" is linked to record "arrest_001"
    When admin "admin1" unlinks "observer_report_1" from "arrest_001"
    Then listing reports for "arrest_001" should be empty
    And the report should still exist

  @cases @reports
  Scenario: Duplicate report-case link is rejected
    Given report "observer_report_1" is already linked to "arrest_001"
    When admin "admin1" tries to link "observer_report_1" to "arrest_001" again
    Then the response status should be 409

  @cases @reports
  Scenario: Linking to nonexistent record fails
    When admin "admin1" tries to link "observer_report_1" to a nonexistent record
    Then the response status should be 404

  @cases @reports @permissions
  Scenario: Volunteer without cases:link cannot link reports
    Given a registered volunteer "vol1" without "cases:link" permission
    When volunteer "vol1" tries to link a report to a record
    Then the response status should be 403
```

#### Task 7: Backend Step Definitions

**File**: `tests/steps/backend/report-record-linking.steps.ts`

Implement step definitions for all scenarios.

### Phase 2: Desktop UI

Deferred to Epic 330 (Desktop Case UI) which adds "Link Report" dialogs on record detail views.

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/report-links.ts` | Zod schemas for report-case link types |
| `packages/test-specs/features/core/report-record-linking.feature` | BDD scenarios |
| `tests/steps/backend/report-record-linking.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/case-do.ts` | Add ReportCaseLink storage and handlers |
| `apps/worker/routes/records.ts` | Add report linking routes (link/unlink/list) |
| `apps/worker/routes/reports.ts` | Add reverse-direction routes (records for report) |
| `packages/protocol/tools/schema-registry.ts` | Register report-link schemas |
| `packages/i18n/locales/en.json` | Add reportLinks i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` -- 9 scenarios in `report-record-linking.feature`

### Typecheck

`bun run typecheck` -- all new types must compile

## Acceptance Criteria & Test Scenarios

- [ ] Reports can be linked to case records M:N
  -> `packages/test-specs/features/core/report-record-linking.feature: "Link a report to a case record"`
- [ ] Links can include encrypted notes
  -> `packages/test-specs/features/core/report-record-linking.feature: "Link a report to a case with notes"`
- [ ] Reports linked to a case can be listed
  -> `packages/test-specs/features/core/report-record-linking.feature: "List reports linked to a case"`
- [ ] Reverse lookup (cases for a report) works
  -> `packages/test-specs/features/core/report-record-linking.feature: "Reverse lookup - list cases linked to a report"`
- [ ] Linking from report side creates the same link
  -> `packages/test-specs/features/core/report-record-linking.feature: "Link a case to a report from the report side"`
- [ ] Reports can be unlinked from cases
  -> `packages/test-specs/features/core/report-record-linking.feature: "Unlink a report from a case"`
- [ ] Duplicate links are rejected
  -> `packages/test-specs/features/core/report-record-linking.feature: "Duplicate report-case link is rejected"`
- [ ] Linking to nonexistent records fails
  -> `packages/test-specs/features/core/report-record-linking.feature: "Linking to nonexistent record fails"`
- [ ] Permission enforcement for linking operations
  -> `packages/test-specs/features/core/report-record-linking.feature: "Volunteer without cases:link cannot link reports"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/report-record-linking.feature` | New | 9 scenarios for report-case linking |
| `tests/steps/backend/report-record-linking.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Low risk**: Schemas (Task 1) -- simple join model, no complex types.
- **Low risk**: CaseDO storage (Task 2) -- follows the exact same pattern as CaseEvent and RecordContact joins already in CaseDO. Two storage keys per link (forward + reverse), prefix scan for listing.
- **Low risk**: Routes (Tasks 3-4) -- standard CRUD proxying. The reverse-direction routes add entries to the report router but do not modify existing report behavior.
- **Low risk**: Duplicate detection (Task 2) -- simple existence check before creating the link.

## Execution

- **Phase 1**: Schemas -> CaseDO handlers -> Record routes -> Report reverse routes -> Codegen -> i18n -> BDD -> gate
- **Phase 2**: No dedicated UI (Epic 330 integrates linking into case detail views)
- **Phase 3**: `bun run test:all`
