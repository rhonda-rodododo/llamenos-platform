# Spec: CMS Automation — Contact Notifications, Case Assignment Push, Report-to-Case Conversion

**Date:** 2026-03-21
**Status:** Draft
**Branch target:** desktop

---

## Goal

Implement three CMS automation features that have route scaffolding, schema definitions, or partial UI already in place but lack complete logic:

1. **Support contact notifications** — route exists and dispatches via MessagingAdapter, but the client has no API function and there is no triggering logic tied to case status changes.
2. **Case assignment push notifications** — `POST /records/:id/assign` publishes a Nostr event but never dispatches a push notification to the newly assigned user(s).
3. **Report-to-case auto-conversion** — `ReportTypeDefinition.allowCaseConversion` and a triage UI exist; what's missing is the actual conversion endpoint and the desktop "Convert to Case" button on the report detail view.

---

## Current State

### Feature 1: Support Contact Notifications

**What exists:**
- `POST /records/:id/notify-contacts` in `apps/worker/routes/records.ts` (lines 1062–1149). The route is fully implemented: it verifies the record, iterates recipients, dispatches via `getMessagingAdapterFromService`, collects results, audits, and returns `NotifyContactsResponse`.
- Protocol schema in `packages/protocol/schemas/notifications.ts`: `notifyContactsBodySchema`, `notifyContactsResponseSchema`, `NotifyContactsBody`, `NotifyContactsResponse`, `NotificationResultItem`.
- The schema design is intentionally client-side rendering: the client decrypts contact profiles (E2EE constraint), renders per-recipient messages, and POSTs pre-rendered plaintext to the server. The server is a dumb dispatch pipe.

**What is missing:**
- No client API function in `src/client/lib/api.ts` for this endpoint.
- No trigger in the desktop UI. When a user changes a case status or adds an interaction, there is no prompt to notify linked contacts.
- No client-side message rendering logic (the message template — "Case #X has been updated to status Y" — must be composed client-side before POSTing).

**Contact notification preference discovery:**
- Contacts are stored as encrypted records in the CMS. The `notifyContactsBodySchema.recipients` array takes `{ identifier: string, channel: 'sms'|'signal'|'whatsapp', message: string }`. The client is responsible for decrypting the contact profile to extract the phone/identifier and preferred channel.
- There is no `notificationChannel` field codified in the protocol schema for contacts — this is determined by decrypting the contact's encrypted field data client-side.

---

### Feature 2: Case Assignment Push Notifications

**What exists:**
- `POST /records/:id/assign` in `apps/worker/routes/records.ts` (lines 721–763) calls `services.cases.assign()`, publishes a Nostr event (`KIND_RECORD_ASSIGNED`), and audits. No push dispatch.
- `createPushDispatcherFromService` in `apps/worker/lib/push-dispatch.ts` — the same function used by `routes/conversations.ts` and `messaging/router.ts` to send push to specific users.
- `WakePayload` interface in `apps/worker/types/infra.ts`: `{ hubId, type: PushNotificationType, conversationId?, channelType?, callId?, shiftId?, startsAt? }`. `PushNotificationType = 'message' | 'voicemail' | 'shift_reminder' | 'assignment'`.
- `FullPushPayload extends WakePayload` with `previewText?`, `role?`, etc.

**What is missing:**
- The assign route does not call `createPushDispatcherFromService(...).sendToVolunteer(...)` for each newly assigned pubkey.
- `WakePayload` (and `FullPushPayload`) do not have a `recordId` field — mobile clients need this to navigate to the assigned case on notification tap.
- No Nostr relay event specifically notifying the user of the case assignment (distinct from the broadcast `KIND_RECORD_ASSIGNED` which goes to all hub members). The distinction: the push notification targets specific devices of the assigned user only.

---

### Feature 3: Report-to-Case Auto-Conversion

**What exists:**
- `ReportTypeDefinition.allowCaseConversion: boolean` in `packages/protocol/schemas/report-types.ts`.
- `conversionStatus` tracked in conversation metadata (`pending | in_progress | completed`) — `PATCH /reports/:id` accepts `conversionStatus`.
- Triage queue page at `src/client/routes/triage.tsx`: lists reports with `allowCaseConversion=true` types, shows status tabs, and renders `TriageCaseCreationPanel` (which already exists as a component).
- `GET /reports?conversionEnabled=true&conversionStatus=...` in `apps/worker/routes/reports.ts` (lines 75–103) — server-side filtering for the triage queue.
- Report-case linking already exists: `POST /records/:id/reports` and `POST /reports/:id/records` in their respective route files, backed by `services.cases.linkReportCase()`.

**What is missing:**
- No dedicated conversion endpoint (`POST /reports/:id/convert-to-case`). The `TriageCaseCreationPanel` component creates a case independently and then calls link — it does not pre-populate the new case with the report's field values.
- No protocol schema for a conversion request/response.
- No "Convert to Case" button on the standalone report detail view (`src/client/routes/reports.tsx` or equivalent) — it only exists in the triage queue.
- No auto-trigger on report submission when `allowCaseConversion=true` and `mobileOptimized=true` — the current flow always goes to manual triage.

---

## Required Changes

### Feature 1: Support Contact Notifications

#### Backend (no changes needed)
The route `POST /records/:id/notify-contacts` is already fully implemented. No backend work required.

#### Protocol Schema (no changes needed)
`packages/protocol/schemas/notifications.ts` already defines all required types.

#### Desktop Client — new API function
**File:** `src/client/lib/api.ts`

Add:
```typescript
export async function notifyContacts(
  recordId: string,
  body: NotifyContactsBody,
): Promise<NotifyContactsResponse>
```
This calls `POST /api/records/:recordId/notify-contacts` with `body`.

Import `NotifyContactsBody` and `NotifyContactsResponse` from `@protocol/schemas/notifications` (via the api module's existing import structure).

#### Desktop Client — trigger from case detail
**File:** `src/client/components/cases/case-detail.tsx` (or the file containing the status mutation)

> **Implementation note:** grep for `status` update calls in `src/client/routes/cases/` (or `case-detail.tsx`) to find the exact mutation. Look for the `PATCH /api/cms/records/:id` call that sets status. This is the trigger point.

After a status change is successfully saved (via `PATCH /records/:id`), if the case has linked contacts, show a toast-anchored prompt: "Notify linked contacts about this status change?" with a "Notify" button.

The notification flow:
1. Fetch linked contacts for the case via `GET /records/:id/contacts`.
2. For each contact, decrypt the contact's field data client-side to extract `identifier` (phone/handle) and `channel` preference.
3. Render a message template client-side. **V1 uses a static template only:** `'Case #[caseNumber] has been updated: [statusLabel]'`. Hub-configurable templates are out of scope for this spec.
4. Batch into `notifyContactsBodySchema.recipients` and call `notifyContacts(recordId, body)`.
5. Show results toast: "X contacts notified, Y failed."

**File:** `src/client/components/cases/notify-contacts-dialog.tsx` (new)

A dialog component that:
- Shows the list of linked contacts (name + channel icon) with per-contact opt-out checkboxes.
- Shows the pre-rendered message (editable by the user before sending).
- Calls `notifyContacts()` on confirm.
- Reports per-contact success/failure from `NotifyContactsResponse.results`.

**Out of scope:** Mobile contact notification UI is not part of this spec. The Nostr `KIND_RECORD_ASSIGNED` event is a separate mechanism (broadcast to hub members) and is not related to contact notifications — do not conflate the two.

#### i18n keys to add
```json
"cases.notifyContacts": "Notify Contacts",
"cases.notifyContactsPrompt": "Notify linked contacts about this status change?",
"cases.notifyContactsSent": "{{count}} contacts notified",
"cases.notifyContactsFailed": "{{count}} failed",
"cases.notifyContactsMessage": "Case #{{caseNumber}} has been updated: {{status}}"
```

---

### Feature 2: Case Assignment Push Notifications

#### Backend — push dispatch in assign route
**File:** `apps/worker/routes/records.ts`

In the `POST /:id/assign` handler, after `services.cases.assign(id, body.pubkeys)` succeeds and before the audit call, add push dispatch:

```typescript
import { createPushDispatcherFromService } from '../lib/push-dispatch'

// After assign succeeds:
const dispatcher = createPushDispatcherFromService(c.env, services.identity, services.shifts)
const hubId = c.get('hubId') ?? ''
const wakePayload: WakePayload = {
  hubId,
  type: 'assignment',
  recordId: result.id,   // mobile clients navigate to this case on tap
}
const fullPayload: FullPushPayload = {
  ...wakePayload,
  previewText: `You have been assigned to case ${result.caseNumber ?? result.id.slice(0, 8)}`,
  recordId: result.id,
}

// Dispatch to each newly assigned user — fire-and-forget, never block
for (const assignedPubkey of body.pubkeys) {
  dispatcher.sendToVolunteer(assignedPubkey, wakePayload, fullPayload)
    .catch((e) => { console.error('[records] Push dispatch for assignment failed:', e) })
}
```

**Critical constraint:** Push must route to the correct hub. `hubId` is already available in the request context (`c.get('hubId')`). The user may be offline or on a different hub — push reaches their device regardless of which hub they currently have active. This is already handled by `sendToVolunteer`, which looks up all registered devices for the pubkey across all platforms.

**Import to add:** `import type { WakePayload, FullPushPayload } from '../types/infra'` (match existing pattern from `routes/conversations.ts`).

**Required schema change:** Add `recordId?: string` to `WakePayload` in `apps/worker/types/infra.ts`. `FullPushPayload` inherits the field via `extends WakePayload`. Mobile clients use `recordId` to navigate directly to the assigned case when the notification is tapped. This field is optional so that all existing push payloads (message, voicemail, shift_reminder) remain valid without change.

#### Desktop Client — receive assignment notification
**File:** `src/client/lib/ws.ts` or the Nostr event listener

When a `KIND_RECORD_ASSIGNED` Nostr event arrives with the current user's pubkey in `pubkeys`, navigate to or highlight the record in the case list. This is already partially handled by the existing Nostr event subscription — verify that the event payload contains enough for the client to route the user to the correct case.

#### iOS — receive `'assignment'` push type
**File:** `apps/ios/Sources/Services/PushService.swift` (or equivalent notification handler)

The `WakePayload.type = 'assignment'` is a new case for the mobile push handler. On iOS, when the wake payload type is `'assignment'`, navigate the user to the cases tab and surface the assigned case.

Add `assignment` to the `PushNotificationType` enum handling in the iOS push handler.

#### Android — receive `'assignment'` push type
**File:** `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` (or equivalent)

Same as iOS: handle `type = "assignment"` in the wake payload dispatcher. Navigate to cases and surface the assigned case.

---

### Feature 3: Report-to-Case Auto-Conversion

#### Protocol schema — conversion endpoint
**File:** `packages/protocol/schemas/report-links.ts` (add alongside existing link schemas)

```typescript
export const convertReportToCaseBodySchema = z.object({
  entityTypeId: z.string().uuid(),      // target entity type for the new case
  encryptedContent: z.string(),         // E2EE encrypted initial note (from report content)
  readerEnvelopes: z.array(z.object({   // per-reader ECIES envelopes
    pubkey: z.string(),
    encryptedKey: z.string(),
  })),
  caseFieldValues: z.record(z.string(), z.unknown()).optional(), // pre-populated field values from report
})

export const convertReportToCaseResponseSchema = z.object({
  reportId: z.string().uuid(),
  caseId: z.string().uuid(),
  caseNumber: z.string().optional(),
  linkId: z.string().uuid(),
})

export type ConvertReportToCaseBody = z.infer<typeof convertReportToCaseBodySchema>
export type ConvertReportToCaseResponse = z.infer<typeof convertReportToCaseResponseSchema>
```

#### Backend — conversion endpoint
**File:** `apps/worker/routes/reports.ts`

Add `POST /reports/:id/convert-to-case`:

```
POST /reports/:id/convert-to-case
Permission: cases:create + cases:link
Body: ConvertReportToCaseBody
Response: ConvertReportToCaseResponse
```

Handler logic:
1. Fetch the report (conversation) — verify it is type `'report'` and its `reportTypeId` maps to a `ReportTypeDefinition` with `allowCaseConversion=true`. If not, return 422 with error `'Report type does not allow case conversion'` before opening a transaction.
2. Generate a case number if the entity type has numbering enabled (this can be done outside the transaction).
3. Wrap steps 3–5 in a single database transaction using `db.transaction(async (tx) => { ... })`. If any step fails, all changes are rolled back:
   - Call `services.cases.create(...)` passing `tx`.
   - Call `services.cases.linkReportCase(newCase.id, reportId, pubkey)` passing `tx`.
   - Update `conversionStatus` to `'completed'` via `services.conversations.update(reportId, { metadata: { conversionStatus: 'completed' } })` passing `tx`.
4. Audit: `'reportConvertedToCase'` with `{ reportId, caseId: newCase.id, caseNumber }` (outside the transaction, after commit).
5. Return `ConvertReportToCaseResponse`.

**Field mapping rule (V1):** name-based matching only. If a report field's `name` exactly matches an entity type field's `name` and their types are compatible (same type or both text-like), copy the value into `fieldValues`. Non-matching fields are silently skipped. Document this rule in a comment at the top of the handler. No fuzzy matching.

If the report type does not have `allowCaseConversion=true`, return 422 with error `'Report type does not allow case conversion'`.

#### Client API function
**File:** `src/client/lib/api.ts`

```typescript
export async function convertReportToCase(
  reportId: string,
  body: ConvertReportToCaseBody,
): Promise<ConvertReportToCaseResponse>
```

#### Desktop — "Convert to Case" button on report detail
**File:** `src/client/routes/reports/$reportId.tsx` (or equivalent report detail view)

When the report's `reportTypeId` maps to a type with `allowCaseConversion=true` AND the report has no linked cases yet AND the user has `cases:create`, show a "Convert to Case" button in the report action bar.

Clicking it opens a `ConvertToCaseDialog` component:
- Entity type selector (dropdown of available entity types for the hub).
- The report content is pre-populated into the case's initial note (encrypted client-side).
- Report field values are pre-populated as `caseFieldValues` using **name-based matching only**: if a report field's `name` exactly matches an entity type field's `name`, and their `type` is compatible (same type, or both text-like), copy the value. Non-matching fields are silently skipped. No fuzzy matching.
- "Create Case" button calls `convertReportToCase(reportId, body)`.
- On success: navigate to the new case at `/cases/:caseId`, show toast "Case #X created from report."

**File:** `src/client/components/cases/convert-to-case-dialog.tsx` (new)

#### Desktop — triage queue "Convert to Case" button
**File:** `src/client/components/cases/triage-case-creation-panel.tsx`

The existing `TriageCaseCreationPanel` should call `convertReportToCase()` instead of creating a case independently and then linking. This ensures `conversionStatus` is atomically set to `'completed'` and the report fields are pre-populated in the case.

#### i18n keys to add
```json
"triage.convertToCase": "Convert to Case",
"triage.convertSuccess": "Case #{{caseNumber}} created from report",
"triage.convertError": "Failed to convert report to case",
"triage.selectEntityType": "Select case type",
"reports.convertToCase": "Convert to Case",
"reports.noCaseConversionAllowed": "This report type does not support case conversion"
```

---

## File Map

### Feature 1: Contact Notifications

| File | Change |
|------|--------|
| `src/client/lib/api.ts` | Add `notifyContacts()` API function |
| `src/client/components/cases/notify-contacts-dialog.tsx` | New component: per-contact opt-out + message preview |
| `src/client/components/cases/case-detail.tsx` | Add post-status-change "Notify contacts?" prompt |
| `packages/i18n/locales/en.json` | Add notification i18n keys |

### Feature 2: Case Assignment Push

| File | Change |
|------|--------|
| `apps/worker/routes/records.ts` | Add `createPushDispatcherFromService` call in `POST /:id/assign` |
| `apps/ios/Sources/Services/PushService.swift` | Handle `type='assignment'` wake payload |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` | Handle `type="assignment"` wake payload |

### Feature 3: Report-to-Case Conversion

| File | Change |
|------|--------|
| `packages/protocol/schemas/report-links.ts` | Add `convertReportToCaseBodySchema`, `convertReportToCaseResponseSchema` |
| `packages/protocol/tools/schema-registry.ts` | Register new conversion schemas |
| `apps/worker/routes/reports.ts` | Add `POST /:id/convert-to-case` handler |
| `src/client/lib/api.ts` | Add `convertReportToCase()` API function |
| `src/client/components/cases/convert-to-case-dialog.tsx` | New dialog: entity type picker + pre-populated fields |
| `src/client/components/cases/triage-case-creation-panel.tsx` | Migrate to call `convertReportToCase()` |
| `src/client/routes/reports/$reportId.tsx` | Add "Convert to Case" button when type allows it |
| `packages/i18n/locales/en.json` | Add conversion i18n keys |

---

## Verification Gates

### Feature 1: Contact Notifications

- [ ] `notifyContacts()` function exists in `src/client/lib/api.ts` and is type-safe against `NotifyContactsBody`/`NotifyContactsResponse`.
- [ ] `NotifyContactsDialog` renders per-recipient checkboxes with channel icons and an editable message body.
- [ ] After a case status change, the "Notify contacts?" prompt appears only when the case has linked contacts.
- [ ] Sending notifications shows per-contact success/failure from the API response.
- [ ] No contact's identifier or message is sent to the server before the user confirms in the dialog.
- [ ] BDD test: create a case, link a contact with a phone number, change case status, trigger notification, verify `MessagingAdapter.sendMessage` was called with the correct identifier and message body.
- [ ] `bun run typecheck && bun run build` passes.

### Feature 2: Case Assignment Push

- [ ] `POST /records/:id/assign` calls `dispatcher.sendToVolunteer(pubkey, wakePayload, fullPayload)` for each assigned pubkey.
- [ ] `wakePayload.type` is `'assignment'`.
- [ ] `wakePayload.hubId` matches the hub from the request context — not empty string.
- [ ] Push dispatch failures are caught and logged — never block the HTTP response.
- [ ] BDD test: assign a user to a case, call `GET /api/test-push-log`, verify the logged wake payload has `type: 'assignment'` and the correct `hubId`.
- [ ] iOS: `PushNotificationType.assignment` case is handled in the push handler and navigates to cases tab.
- [ ] Android: `"assignment"` type is handled in `PushService` and navigates to cases.
- [ ] `cargo test --manifest-path packages/crypto/Cargo.toml` unaffected.
- [ ] `cd apps/android && ./gradlew testDebugUnitTest` passes.

### Feature 3: Report-to-Case Conversion

- [ ] `POST /reports/:id/convert-to-case` returns 422 when the report's type has `allowCaseConversion=false`.
- [ ] Conversion atomically: creates case, links report to case, sets `conversionStatus='completed'`.
- [ ] `ConvertReportToCaseResponse` includes `caseId`, `caseNumber`, `linkId`.
- [ ] Desktop: "Convert to Case" button is only visible when `reportType.allowCaseConversion=true` AND user has `cases:create`.
- [ ] `TriageCaseCreationPanel` calls `convertReportToCase()` — not independent case creation + link.
- [ ] BDD test: create a report with a conversion-enabled report type, call `POST /reports/:id/convert-to-case`, verify the case exists, the report is linked, and `conversionStatus='completed'`.
- [ ] BDD test: attempt conversion on a report with `allowCaseConversion=false` type — expect 422.
- [ ] BDD regression test: existing triage queue listing still works after `TriageCaseCreationPanel` is migrated to `convertReportToCase()` — reports appear in the queue, conversion still creates a linked case with `status='in_progress'`, and `conversionStatus` is set to `'completed'`. This guards against the migration accidentally breaking the triage flow.
- [ ] `bun run typecheck && bun run build` passes.
- [ ] `bun run codegen` succeeds after schema additions.
