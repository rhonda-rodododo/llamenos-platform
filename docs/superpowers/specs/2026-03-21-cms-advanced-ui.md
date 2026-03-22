# Spec: cms-advanced-ui

**Date:** 2026-03-21
**Branch:** desktop (or feature branch)
**Status:** Draft

---

## Goal

Three UI gaps in the CMS that have full backend implementations but no user-facing UI: evidence custody chain display, report type field customization, and cross-hub case visibility for super-admins.

---

## Current State

### Gap 1: Evidence custody chain

**Backend (apps/worker/routes/evidence.ts):**
- `GET /evidence/:evidenceId/custody` → `requirePermission('evidence:manage-custody')` → returns `custodyChainResponseSchema`
- `POST /evidence/:evidenceId/access` → logs a custody entry (action: view/download/share, integrityHash, notes)
- `POST /evidence/:evidenceId/verify` → verifies current file hash against stored hash, returns `{ valid: boolean, storedHash, currentHash, verifiedAt }`

**Client API (src/client/lib/api.ts):**
- `getEvidenceCustody(evidenceId)` — exists, calls `GET /evidence/:id/custody`
- `logEvidenceAccess(evidenceId, body)` — exists, calls `POST /evidence/:id/access`
- `verifyEvidenceIntegrity(evidenceId, currentHash)` — exists, calls `POST /evidence/:id/verify`

**Desktop UI:**
- `src/client/components/cases/evidence-tab.tsx` — lists evidence items (grid/list), opens `EvidenceDetailDialog`
- `src/client/components/cases/evidence-detail-dialog.tsx` — shows filename, classification, uploader, upload time; has download button
- **No custody chain tab in either component.** `getEvidenceCustody()` is never called anywhere in the UI.

**iOS (apps/ios/Sources/Views/Cases/):**
- No evidence-specific detail view exists yet. Cases are shown via `CaseDetailView.swift`.
- No custody chain view.

**Android (apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/):**
- No evidence-specific detail view. Cases shown via `CaseDetailScreen.kt`.
- No custody chain view.

---

### Gap 2: Report type field customization

**Backend:**
- `PATCH /settings/cms/report-types/:id` accepts `fields: ReportFieldDefinition[]` in the request body (from `updateCmsReportTypeBodySchema`)
- `reportFieldDefinitionSchema` extends `entityFieldDefinitionSchema` with `supportAudioInput: boolean`
- `entityFieldDefinitionSchema` supports: `fieldType` (text | textarea | number | select | multiselect | date | datetime | location | file | boolean), `label`, `placeholder`, `required`, `maxLength`, `min`, `max`, `options` (for select), `conditionalOn` (for conditional visibility), `displayOrder`

**Client API:**
- `updateReportType(id, body)` exists and accepts `fields` in the body

**Desktop UI (src/client/components/admin-settings/report-types-section.tsx):**
- Existing form: name, icon, description, isDefault toggle
- `editing.fields` is passed to `createReportType()` / `updateReportType()` — the field is wired through but there is **no field editor UI rendered in the form**
- The component shows a `ReportTypeFieldsEditor` component in the JSX at line 255 — but this component is referenced but **not defined in the file** (it is either imported from elsewhere or is a stub that needs implementation)
- Current state: the row shows a badge counting fields (`{rt.fields.length} fields`) but clicking Edit does not present any way to add, remove, or reorder fields

**iOS:**
- `TypedReportCreateView.swift` exists — renders fields dynamically from `reportType.fields`
- Already supports rendering all field types

**Android:**
- `TypedReportCreateScreen.kt` exists — renders fields dynamically from `reportType.fields`
- Already supports rendering all field types

---

### Gap 3: Cross-hub case visibility for super-admins

**Backend (apps/worker/routes/records.ts):**
- `GET /records` (via `GET /hubs/:hubId/records`) — scoped to a single hub
- `listRecordsQuerySchema` does not include an `allHubs` parameter
- No cross-hub query path exists

**Client API:**
- `listRecords()` has no `allHubs` param

**Desktop UI:**
- Cases route is hub-scoped; no toggle for super-admins to see across hubs

**Permissions:**
- No `cases:read-cross-hub` permission defined yet
- Super-admin role (if exists) would need this permission

**E2EE consideration:**
- Case records have encrypted `summaryEnvelope`, `fieldsEnvelope`, `piiEnvelope`
- Envelopes are ECIES-wrapped for each recipient's pubkey
- For a super-admin to decrypt records from another hub, their pubkey must be in the envelope recipients list
- **Recommendation (option a):** At record creation time, include super-admin pubkeys in all envelope recipient lists. This is the correct approach — no re-encryption on demand, no key escrow.
- Backend needs to identify super-admins across all hubs when resolving envelope recipients

---

## Required Changes

### Gap 1: Evidence custody chain UI

#### Desktop — `EvidenceDetailDialog`

**File:** `src/client/components/cases/evidence-detail-dialog.tsx`

Add a "Custody Chain" tab to the evidence detail dialog (alongside any existing tabs, or replace the single-panel view with a tabbed layout if none exist):

**Tab 1: Details** (existing content)

**Tab 2: Custody Chain** (new, admin-only — only render if user has `evidence:manage-custody` permission)

Content:
- "Verify Integrity" button at the top of the custody tab
  - Calls `verifyEvidenceIntegrity(evidenceId)` — the desktop calls `POST /evidence/:id/verify` WITHOUT a `currentHash` body. The server computes the hash of the stored file from MinIO and compares against the stored `fileHash`. The response includes `{ verified: boolean, storedHash: string, computedHash: string }`. The desktop displays a green checkmark or a red "Hash mismatch — file may have been tampered" message. No client-side hashing required.
  - Show result as a green "Integrity verified" badge or red "Hash mismatch — file may have been tampered" badge with timestamps
  - `data-testid="evidence-verify-btn"`, `data-testid="evidence-verify-result"`
- Chronological list of custody entries from `getEvidenceCustody(evidenceId)`
- Each entry shows:
  - Actor: truncated pubkey or display name (resolve from `volunteerNames` prop if available)
  - Action badge: `view` / `download` / `share` / `created` / `verified`
  - Timestamp: formatted relative time
  - Notes (if present)
  - Integrity hash: truncated (first 16 chars + `...`), tooltip shows full hash
- Empty state: "No custody entries yet"
- Loading state: spinner while fetching
- `data-testid="evidence-custody-chain"`, `data-testid="evidence-custody-entry"` (per row)

The custody tab is only visible to users with `evidence:manage-custody` permission. If the current user lacks this permission, the tab is hidden entirely.

**File:** `src/client/lib/api.ts`
- `getEvidenceCustody()` already exists — no changes needed

#### iOS — evidence detail in `CaseDetailView`

Add custody chain view as a sheet or navigation destination when tapping an evidence item in the case detail.

**New file:** `apps/ios/Sources/Views/Cases/EvidenceCustodyView.swift`

```swift
// Displays the custody chain for a single piece of evidence
struct EvidenceCustodyView: View {
    let evidenceId: String
    let evidenceFilename: String
    // ...
}
```

Content (admin-only — check `appState.permissions.contains("evidence:manage-custody")`):
- "Verify Integrity" button → calls API, shows pass/fail
- `List` of custody entries in chronological order
- Each row: actor (truncated pubkey), action badge, timestamp, optional notes
- Empty + error states

`accessibilityIdentifier("evidence-custody-view")`, `accessibilityIdentifier("evidence-verify-btn")`, `accessibilityIdentifier("evidence-custody-entry-{i}")`

Navigation: from the evidence list in `CaseDetailView.swift`, tapping evidence detail navigation link should show a tab picker: Details | Custody Chain (if admin).

**Note for implementer:** First determine how evidence items are currently rendered in `CaseDetailView.swift`. If evidence items are in a list but not tappable, add `NavigationLink` wrappers first. The custody chain tab is added inside the evidence detail destination view (new `EvidenceDetailView` if it doesn't exist).

#### Android — evidence detail in `CaseDetailScreen`

**New file:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EvidenceCustodyScreen.kt`

Equivalent to iOS: lists custody entries, verify button. Admin-only.

`testTag("evidence-custody-screen")`, `testTag("evidence-verify-btn")`, `testTag("evidence-custody-entry-{index}")`

---

### Gap 2: Report type field customization

**File:** `src/client/components/admin-settings/report-types-section.tsx`

Search `src/client/routes/settings/report-types-section.tsx` for the `ReportTypeFieldsEditor` reference — it is currently a stub/placeholder. Replace it with the actual implementation. (Do not rely on line numbers; find it by searching for the identifier.) Implement it in the same file or extract to `src/client/components/admin-settings/report-type-fields-editor.tsx` and import it.

`ReportTypeFieldsEditor` props:
```typescript
interface ReportTypeFieldsEditorProps {
  fields: ReportFieldDefinition[]
  onChange: (fields: ReportFieldDefinition[]) => void
}
```

The component must mirror the existing entity type field editor in `src/client/components/admin-settings/case-management-section.tsx`. Do not duplicate the logic — extract a shared `FieldsEditor` component and use it from both `ReportTypeFieldsEditor` and the entity type fields editor.

**Refactor scope for `case-management-section.tsx`:** The current `case-management-section.tsx` renders field definitions as an inline list with add/remove buttons and individual field property inputs. The refactor extracts this into the shared `FieldsEditor` component (from the `fields-editor.tsx` file described below) so both entity types and report types use the same editor UI. The existing behavior must be preserved exactly.

**Extracted shared component:** `src/client/components/admin-settings/fields-editor.tsx`

```typescript
interface FieldsEditorProps<T extends EntityFieldDefinition> {
  fields: T[]
  onChange: (fields: T[]) => void
  // Optional: extra field properties beyond EntityFieldDefinition
  renderExtraConfig?: (field: T, onChange: (updated: T) => void) => React.ReactNode
  maxFields?: number
}
```

For `ReportTypeFieldsEditor`, `renderExtraConfig` adds a "Support audio input" toggle (`supportAudioInput: boolean`) for `textarea` field types.

Each field in the editor:
- Field label (text input)
- Field type selector: text | textarea | number | select | multiselect | date | datetime | location | file | boolean
- Required toggle
- Max length (for text/textarea)
- Min/max (for number)
- Options list (for select/multiselect) — add/remove option rows
- Conditional visibility: optional "only show when [field] = [value]" selector
- Display order: drag-to-reorder (use `@dnd-kit/sortable`) OR up/down arrow buttons
- For report fields only: "Audio input" toggle (visible when field type = textarea)
- Remove field button (trash icon)
- `data-testid="report-field-{index}"`, `data-testid="report-field-label-{index}"`, `data-testid="report-field-type-{index}"`, `data-testid="report-field-remove-{index}"`

"Add field" button at bottom: appends a new field with defaults (`fieldType: 'text'`, empty label, `required: false`).

The field editor content is shown inline within the report type create/edit form, collapsible to save vertical space, labelled "Custom Fields".

**No protocol schema changes required** — `reportFieldDefinitionSchema` and `updateCmsReportTypeBodySchema` already accept `fields`.

---

### Gap 3: Cross-hub case visibility for super-admins

#### Permission

**File:** `packages/shared/permissions.ts` (or wherever permissions are defined)

Add new permission: `cases:read-cross-hub`

Add it to the super-admin role definition.

#### Backend — `listRecordsQuerySchema` and handler

**File:** `packages/protocol/schemas/records.ts`

Add `allHubs` to `listRecordsQuerySchema`:
```typescript
allHubs: z.boolean().optional().default(false),
```

**File:** `apps/worker/routes/records.ts`

In the `GET /` handler:
1. If `query.allHubs === true`, check `checkPermission(permissions, 'cases:read-cross-hub')`. If lacking permission, return 403.
2. When `allHubs` is true:
   - Query `services.cases.listAcrossHubs({ ...listInput, requestingPubkey: pubkey })` (new service method)
   - This method queries the `case_records` table without a `hubId` filter, but only returns records where the requesting pubkey is in the envelope recipient list (ensuring they can decrypt)
   - Results are ordered by `createdAt DESC`, include `hubId` in the response so the UI can label which hub each case belongs to
3. The standard (hub-scoped) code path is unchanged.

**New service method:** `services.cases.listAcrossHubs(input)` in `apps/worker/services/cases.ts`

The method signature:
```typescript
async listAcrossHubs(input: {
  requestingPubkey: string
  page?: number
  limit?: number
  entityTypeId?: string
  statusHash?: string
  severityHash?: string
}): Promise<{ records: CaseRecord[]; total: number; page: number; limit: number; hasMore: boolean }>
```

Implementation: join `case_records` with `case_envelopes` (or equivalent), filter by `requestingPubkey` in the recipient list, across all hubs.

#### Envelope recipient inclusion for super-admins

**File:** `apps/worker/lib/envelope-recipients.ts`

In `determineEnvelopeRecipients()`, include super-admin pubkeys (users with `cases:read-cross-hub` permission) in the `summary`, `fields`, and `pii` recipient tiers for every new record creation, regardless of hub.

To identify super-admins at record creation time, `determineEnvelopeRecipients()` queries for users with the `cases:read-cross-hub` permission in `user_hub_roles`. This is an additional DB query per record creation. Cache the result for the duration of the request (not across requests). Implement as `getNetworkSuperAdminPubkeys(db): Promise<string[]>` in `apps/worker/services/identity.ts`. New records cannot be retroactively accessed by super-admins added after record creation — this is an accepted limitation.

This ensures super-admins can always decrypt records they later retrieve via cross-hub queries. Records created before this change will not be decryptable — this is acceptable (no retroactive re-encryption; the spec covers forward-only).

#### Client API

**File:** `src/client/lib/api.ts`

```typescript
export async function listRecords(params?: {
  entityTypeId?: string
  statusHash?: string
  severityHash?: string
  assignedTo?: string
  page?: number
  limit?: number
  allHubs?: boolean  // super-admin only
}) { ... }
```

When `allHubs` is true, do NOT use the `hp()` prefix (hub-scoped path prefix). Instead call `/records?allHubs=true&...` directly (or use a dedicated super-admin path if the backend mounts it differently).

#### Desktop UI

**File:** `src/client/routes/cases/index.tsx` (or equivalent cases list route)

For users with `cases:read-cross-hub` permission:
- Add a view mode toggle: "This Hub" (default) / "All Hubs"
- When "All Hubs" is active: calls `listRecords({ allHubs: true, ... })`
- Each record row in the list shows a hub badge (`hubId` → look up hub name from config) so the admin knows which hub a case belongs to
- Filtering still works (entityType, status, etc.) but the assignedTo filter is hidden in all-hubs mode (not meaningful cross-hub)
- Clicking a case navigates to the standard case detail — but the detail route must handle cross-hub cases (the `hp()` prefix must resolve to the correct hub's path, not the currently active hub)

**Cross-hub navigation:** Use option A: cases accessed via cross-hub endpoint are rendered using a special hub prefix in the URL (`/hubs/:hubId/cases/:caseId`). The router handles this by extracting `hubId` from the URL and loading hub context before rendering `CaseDetailView`. Do not use option B (hub context switch on navigation) as it disrupts the user's browsing context.

`data-testid="cases-all-hubs-toggle"`, `data-testid="cases-hub-badge"` (per row)

---

## File Map

| File | Change |
|------|--------|
| `src/client/components/cases/evidence-detail-dialog.tsx` | Add custody chain tab, verify integrity button |
| `apps/ios/Sources/Views/Cases/EvidenceCustodyView.swift` | New file — iOS custody chain view |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/EvidenceCustodyScreen.kt` | New file — Android custody chain screen |
| `src/client/components/admin-settings/report-types-section.tsx` | Implement `ReportTypeFieldsEditor` (or import from extracted file) |
| `src/client/components/admin-settings/fields-editor.tsx` | New file — shared field editor extracted from case-management-section.tsx |
| `src/client/components/admin-settings/case-management-section.tsx` | Refactor to use shared `FieldsEditor` component |
| `packages/shared/permissions.ts` | Add `cases:read-cross-hub` permission, add to super-admin role |
| `packages/protocol/schemas/records.ts` | Add `allHubs` to `listRecordsQuerySchema` |
| `apps/worker/routes/records.ts` | Handle `allHubs` query param, enforce permission |
| `apps/worker/services/cases.ts` | Add `listAcrossHubs()` method |
| `apps/worker/lib/envelope-recipients.ts` | Include super-admin pubkeys in all new record envelopes |
| `src/client/lib/api.ts` | Add `allHubs` param to `listRecords()` |
| `src/client/routes/cases/index.tsx` | Add all-hubs toggle for super-admins, hub badge per row |

---

## Verification Gates

### Gap 1: Evidence custody chain

1. An admin user who opens evidence detail sees a "Custody Chain" tab.
2. Non-admin users (lacking `evidence:manage-custody`) do not see the custody chain tab.
3. Custody tab displays all entries in chronological order: actor, action, timestamp, hash.
4. "Verify Integrity" button calls `verifyEvidenceIntegrity()` and shows a clear pass/fail result with `data-testid="evidence-verify-result"`.
5. iOS `EvidenceCustodyView` renders custody entries correctly and is only accessible to admins.
6. Android `EvidenceCustodyScreen` same as iOS.
7. `bun run typecheck` passes.

### Gap 2: Report type field customization

1. Clicking "Edit" on a report type opens the form with a "Custom Fields" section.
2. Admin can add a new field, set its type to `select`, add options, mark it required — save succeeds and the field count badge updates.
3. Admin can reorder fields.
4. Admin can add a `textarea` field and enable "Audio input" — saved `supportAudioInput: true` in the backend.
5. Admin can remove a field.
6. `TypedReportCreateView.swift` (iOS) and `TypedReportCreateScreen.kt` (Android) render the custom fields when creating a report of that type — no new changes needed, confirmed by checking the dynamic field rendering already present.
7. Shared `FieldsEditor` component is used by both `ReportTypeFieldsEditor` and the entity type field editor — no duplicated field-editing logic.
8. `bun run typecheck` passes.
9. `bun run test:backend:bdd` passes (no schema breakage).

### Gap 3: Cross-hub case visibility

1. `cases:read-cross-hub` permission is defined and assigned to super-admin role.
2. A super-admin user sees an "All Hubs" toggle in the cases list route.
3. Non-super-admin users do not see the toggle.
4. With "All Hubs" active, `GET /records?allHubs=true` returns records from all hubs where the super-admin is an envelope recipient.
5. A regular admin calling `GET /records?allHubs=true` receives 403.
6. New records created after this change include super-admin pubkeys in envelope recipients — super-admin can decrypt them client-side.
7. Records from a different hub display a hub badge identifying their origin.
8. Clicking a cross-hub case navigates to its detail, using the correct hub-scoped API path.
9. `bun run typecheck` passes.
10. `bun run test:backend:bdd` passes (cross-hub query behavior tested).
11. Android: `./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin` pass.
