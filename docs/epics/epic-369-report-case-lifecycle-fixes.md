# Epic 369: Report-Case Lifecycle Fixes

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 365 (surfaces the bugs)
**Blocks**: None
**Branch**: `desktop`

## Summary

Three scenarios in `report-case-lifecycle.feature` fail. (1) The full report-to-case conversion
workflow fails because `createCaseFromReportViaApi` in `tests/api-helpers.ts` uses `POST /reports/:id/records`
(passing `caseId` in the body) but this route may return non-2xx or the response shape doesn't
match what's expected. (2) Reporter isolation fails because `createReportViaApi` always uses
`ADMIN_NSEC` — reports are admin-owned, so when R1 lists reports using their own nsec (reporter role),
they find none of the "their" reports because the server filters by creator. (3) The idempotency
test passes (409 on duplicate link), but the `linkedRecords` field doesn't exist on `GET /reports/:id`
so the assertion hits the fallback path — needs verification.

## Problem Statement

### Bug 1: Full lifecycle conversion workflow

`createCaseFromReportViaApi` in `tests/api-helpers.ts:1712`:
```typescript
const { status, data } = await apiPost<{ reportId: string; caseId: string }>(
  request,
  `/reports/${reportId}/records`,  // POST to /reports/:id/records
  { caseId: recordId, ... },
)
if (status !== 201 && status !== 200) throw new Error(...)
```

The route `POST /reports/:id/records` lives in `apps/worker/routes/reports.ts:563` and requires
permission `cases:link`. The response shape from that route is the `reportCases` join row, not
`{ reportId, caseId }`. The `linkId` returned to the step is `data.id` which may be undefined
if the response shape doesn't match.

Additionally, the lifecycle test uses `enableCaseManagementViaApi` + `createEntityTypeViaApi`
before the conversion, but the report may not exist or the entity type `slug` collides on reset.

### Bug 2: Reporter isolation — `createReportViaApi` always uses `ADMIN_NSEC`

`tests/api-helpers.ts:519` — `createReportViaApi` hardcodes `ADMIN_NSEC`:
```typescript
const skHex = nsecToSkHex(ADMIN_NSEC)
const pubkey = skHexToPubkey(skHex)
// ...
const { status, data } = await apiPost<ReportRecord>(request, '/reports', body)
// ← no nsec argument: always authenticated as admin
```

So when R1 and R2 each "create" reports via `createReportViaApi`, both reports are actually
owned by the admin. When R1 lists reports using `reporter!.nsec`, the server filters by the
requesting user's pubkey (for reporters who don't have `reports:read-all`). R1 sees zero reports
because none were created by their pubkey.

Fix: `createReportViaApi` must accept an optional `nsec` parameter, and the step definitions
must pass each reporter's `nsec` when creating their report.

### Bug 3: Step uses wrong field name for linked case ID

`Then 'listing the report should show the linked case ID'` in `report-case-lifecycle.steps.ts`:
```typescript
const linkedIds = res.data.records.map(r => r.id)   // ← WRONG: no `id` field
expect(linkedIds).toContain(lc.caseRecordId)
```

`GET /reports/:id/records` → `services.cases.listReportCases(reportId)` returns
`{ records: ReportCaseRow[], total: number }` where each row is the `report_cases` join table:
`{ reportId, caseId, linkedAt, linkedBy, ... }`. There is **no `id` field** — the correct
field is `caseId`. So `linkedIds` becomes `[undefined, ...]` and `toContain` always fails.

Additionally, `reportLinkedCasesResponseSchema` in `packages/protocol/schemas/reports.ts` uses
the key `cases` with field `id`, but the actual route response uses `records` with field `caseId`.
This OpenAPI schema mismatch should be fixed alongside the step.

Fix the step:
```typescript
const linkedIds = res.data.records.map((r: Record<string, unknown>) => r.caseId)
expect(linkedIds).toContain(lc.caseRecordId)
```

Fix the schema:
```typescript
// packages/protocol/schemas/reports.ts — match actual response shape
export const reportLinkedCasesResponseSchema = z.object({
  records: z.array(z.object({
    reportId: z.string(),
    caseId: z.string(),
    linkedAt: z.string(),
    linkedBy: z.string(),
    encryptedNotes: z.string().optional(),
  })),
  total: z.number(),
})
```

## Implementation

### Fix 1: `tests/api-helpers.ts` — fix `createReportViaApi` signature

```typescript
export async function createReportViaApi(
  request: APIRequestContext,
  options?: {
    title?: string
    category?: string
    status?: string
    reportTypeId?: string
    nsec?: string          // ← add optional nsec param
  },
): Promise<ReportRecord> {
  const nsec = options?.nsec ?? ADMIN_NSEC   // ← default to admin if not provided
  const skHex = nsecToSkHex(nsec)
  const pubkey = skHexToPubkey(skHex)
  // ...
  const { status, data } = await apiPost<ReportRecord>(request, '/reports', body, nsec)
  // ...
}
```

### Fix 2: `tests/steps/backend/report-case-lifecycle.steps.ts` — pass reporter nsec

In the `reporter {string} creates a report` step:
```typescript
// BEFORE:
const report = await createReportViaApi(request, { title })

// AFTER:
const reporterEntry = lc.reporters.get(reporterName)
const report = await createReportViaApi(request, {
  title,
  nsec: reporterEntry?.nsec,  // ← create report as the reporter
})
```

### Fix 3: `tests/api-helpers.ts` — fix `createCaseFromReportViaApi` response parsing

The existing implementation:
```typescript
const { status, data } = await apiPost<{ reportId: string; caseId: string }>(
  request,
  `/reports/${reportId}/records`,
  { caseId: recordId, ... },
  nsec,
)
```

The route `POST /reports/:id/records` at `routes/reports.ts:563` calls
`services.cases.linkReportCase(body.caseId, reportId, pubkey)` and returns the `reportCases` join row:
```typescript
return c.json(result, 201)
// result shape: { id, reportId, caseId, linkedBy, linkedAt, ... }
```

Update the type and `linkId` extraction:
```typescript
const { status, data } = await apiPost<{
  id?: string; reportId?: string; caseId?: string
}>(
  request,
  `/reports/${reportId}/records`,
  { caseId: recordId, encryptedNotes: '...', notesEnvelopes: [...] },
  nsec,
)
if (status !== 201 && status !== 200) throw new Error(`Failed to link case: ${status}`)
const linkData = data as Record<string, unknown>
return {
  recordId,
  linkId: (linkData.id ?? linkData.caseId ?? recordId) as string,
}
```

### Fix 4: Check `POST /reports/:id/records` body schema

The route uses `validator('json', linkReportBodySchema)`. Verify `linkReportBodySchema` in
`packages/protocol/schemas/reports.ts` includes `caseId`:

```typescript
// Check if the field is 'caseId' or 'recordId' or 'caseRecordId'
grep -n "linkReport\|caseId\|recordId" packages/protocol/schemas/reports.ts
```

If the schema uses a different field name than `caseId`, update the helper to match.

### Fix 5: Reporter isolation — access control model (already implemented)

The `GET /reports` route (`apps/worker/routes/reports.ts:59`) already filters correctly:
```typescript
const canReadAll = checkPermission(permissions, 'reports:read-all')
const canReadAssigned = checkPermission(permissions, 'reports:read-assigned')
authorPubkey: (!canReadAll && !canReadAssigned) ? pubkey : undefined,
```

And `conversations.ts:176` applies the filter via:
```typescript
conditions.push(eq(conversations.contactIdentifierHash, filters.authorPubkey))
```

When `POST /reports` creates a report, it stores `contactIdentifierHash: pubkey` where `pubkey`
is the authenticated user's key. So if reports are created with the REPORTER's nsec, the
filter works correctly and R1 only sees their own reports. No backend changes needed — only
the test helper fix (Fix 1+2 above) is required.

### Fix 6: Verify metadata persistence scenario

The "Report metadata persists through updates" scenario:
- Creates a report with `category: 'urgent'`
- Updates status to 'active' (via assign)
- Fetches the report
- Checks `metadata.reportCategory` persists

This should work if `createReportViaApi` correctly stores `category` in `metadata`. Verify the
`POST /reports` handler stores `category` in the conversation's `metadata` JSONB field.

## Files to Modify

| File | Change |
|------|--------|
| `tests/api-helpers.ts` | Add `nsec` param to `createReportViaApi`; fix response parsing in `createCaseFromReportViaApi` |
| `tests/steps/backend/report-case-lifecycle.steps.ts` | Pass reporter nsec; fix `r.id → r.caseId` in linked case assertion |
| `packages/protocol/schemas/reports.ts` | Fix `reportLinkedCasesResponseSchema`: `cases` → `records`, `id` → `caseId` |
| `apps/worker/routes/reports.ts` | Reporter isolation filter already exists (`authorPubkey` → `contactIdentifierHash`) — no change needed here |

## Testing

```bash
bun run test:backend:bdd -- --grep "Report-to-Case Lifecycle"
```

All 3 scenarios must pass:
- Full report-to-case conversion workflow
- Reporter can only see their own reports
- Report metadata persists through updates

## Acceptance Criteria & Test Scenarios

- [ ] `createCaseFromReportViaApi` succeeds: record created, linked to report, returns `{ recordId, linkId }`
  → `packages/test-specs/features/core/report-case-lifecycle.feature: "Full report-to-case conversion workflow"`
- [ ] Linked case ID appears when listing `/reports/:id/records`
  → `packages/test-specs/features/core/report-case-lifecycle.feature: "Full report-to-case conversion workflow"`
- [ ] Reports created with reporter's nsec are visible to that reporter via `GET /reports`
  → `packages/test-specs/features/core/report-case-lifecycle.feature: "Reporter can only see their own reports"`
- [ ] Reporter R1 does NOT see R2's reports
  → `packages/test-specs/features/core/report-case-lifecycle.feature: "Reporter can only see their own reports"`
- [ ] Report metadata `category` persists after status update
  → `packages/test-specs/features/core/report-case-lifecycle.feature: "Report metadata persists through updates"`
- [ ] All BDD tests pass; 0 regressions

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/report-case-lifecycle.feature` | Existing | No change needed |
| `tests/steps/backend/report-case-lifecycle.steps.ts` | Modify | Pass reporter nsec in isolation step |

## Risk Assessment

- **Low risk**: Adding optional `nsec` to `createReportViaApi` — defaults to `ADMIN_NSEC`,
  backward-compatible with all other callers
- **Medium risk**: If `GET /reports` doesn't filter by creator pubkey for reporters, adding
  that filter is a backend behavior change — verify it doesn't break other tests
- **Medium risk**: `linkReportBodySchema` field naming — verify `caseId` matches what the route
  expects before the fix
