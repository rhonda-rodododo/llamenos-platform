# Spec: Events Architecture Consolidation

**Date:** 2026-03-21
**Branch:** desktop
**Status:** Draft

---

## Goal

Eliminate the split-brain between the backend's dedicated `/events` REST API and the clients that bypass it in favour of the generic `/records` API. All four clients (desktop, iOS, Android, and any future platform) must use `/api/events` for events — not `/api/records` filtered by `entityType.category === 'event'`.

---

## Background

### The backend

`apps/worker/routes/events.ts` exposes a full, purpose-built REST API:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | Paginated list with filters: `eventTypeHash`, `statusHash`, `parentEventId`, `startAfter`, `startBefore` |
| `GET` | `/api/events/:id` | Single event |
| `POST` | `/api/events` | Create event |
| `PATCH` | `/api/events/:id` | Update event |
| `DELETE` | `/api/events/:id` | Delete event |
| `GET` | `/api/events/:id/subevents` | Sub-event hierarchy |
| `POST` | `/api/events/:id/records` | Link a case record |
| `DELETE` | `/api/events/:id/records/:recordId` | Unlink a case record |
| `GET` | `/api/events/:id/records` | List linked records |
| `POST` | `/api/events/:id/reports` | Link a report |
| `DELETE` | `/api/events/:id/reports/:reportId` | Unlink a report |
| `GET` | `/api/events/:id/reports` | List linked reports |

The event schema (`packages/protocol/schemas/events.ts`) is semantically richer than `recordSchema`:

- `startDate` / `endDate` — temporal range (ISO 8601)
- `parentEventId` — sub-event hierarchy
- `locationPrecision` — `'neighborhood' | 'block' | 'exact' | …` (re-exported from geocoding schema)
- `locationApproximate` — cleartext approximate location
- `eventTypeHash` — blind index for filtering by event type
- `caseCount`, `reportCount`, `subEventCount` — denormalised relationship counts
- `encryptedDetails` + `detailEnvelopes` — E2EE content (vs. `encryptedSummary` on records)

### The clients: current state

**Desktop** (`src/client/routes/events.tsx`):

Uses `listRecords()` and `updateRecord()` from `@/lib/api`. Filters entity types client-side with `category === 'event'`, then fetches records for only the first matching entity type. Calls `createRecord()` (via `CreateRecordDialog`). The detail view has stubs for "Cases" and "Reports" tabs whose link dialogs fire but do not call any API — `onSelect` closes the dialog without sending a request.

**iOS** (`apps/ios/Sources/ViewModels/EventsViewModel.swift`):

`loadEvents()` calls `GET /api/events` (correct), returns `EventsListResponse`. Sub-event and link endpoints (`/api/events/:id/records`, `/api/events/:id/reports`, `/api/events/:id/subevents`) are used correctly. `createEvent()` posts to `POST /api/events` with `CreateEventRequest` including `startDate`, `endDate`, `locationApproximate`, `encryptedDetails`, and `detailEnvelopes`. iOS is **already correct**.

**Android** (`apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt`):

`loadEvents()` calls `GET /api/records?entityTypeId=…&limit=50` (wrong). `selectEvent()` calls `GET /api/records/:id` (wrong). `updateStatus()` calls `PATCH /api/records/:id` (wrong). `createEvent()` posts to `POST /api/records` with `encryptedSummary` + `summaryEnvelopes`, hardcodes plaintext summary with no real E2EE, and stores description inline rather than using `eventDetailsSchema`. Android is **fully incorrect** on both the API and the schema.

**Desktop `src/client/lib/api.ts`**:

No event-specific functions exist. The `eventType` parameter in `listCallRecords()` (line ~590) is unrelated. The `events.tsx` route constructs all fetches through the records API path.

---

## The Problem

Two out of four clients (desktop + Android) treat events as records filtered by category. This creates three failure modes:

1. **Temporal data is lost.** The records API has no `startDate`/`endDate`. Events created through desktop or Android cannot be searched by date range, cannot be displayed with date metadata, and cannot participate in sub-event hierarchies.

2. **Structural divergence.** The `eventSchema` uses `encryptedDetails`/`detailEnvelopes` while `recordSchema` uses `encryptedSummary`/`summaryEnvelopes`. Creating an event through the records API produces a record that the events API cannot decrypt (mismatched schema).

3. **Android E2EE regression.** Android's `createEvent()` uses a literal JSON string (`"""{"title":"..."}"""`) instead of actual crypto, and passes `emptyList()` for envelopes. Events created from Android are stored unencrypted.

---

## Proposed Resolution

Consolidate all event CRUD on the `/api/events` endpoints. The generic `/api/records` route stays unchanged — it remains available for case records. `events.tsx` and Android `EventsViewModel` switch to the events API. Desktop adds event-specific client API functions. The `CreateRecordDialog` is not used for events.

---

## Required Changes

### 1. Desktop: add event API functions to `src/client/lib/api.ts`

Add the following exports (following existing patterns in `api.ts`):

```
listEvents(params?: ListEventsQuery): Promise<EventListResponse>
getEvent(id: string): Promise<Event>
createEvent(body: CreateEventBody): Promise<Event>
updateEvent(id: string, body: UpdateEventBody): Promise<Event>
deleteEvent(id: string): Promise<{ ok: boolean }>
listEventRecords(eventId: string): Promise<{ links: CaseEvent[] }>
listEventReports(eventId: string): Promise<{ links: ReportEvent[] }>
linkRecordToEvent(eventId: string, recordId: string): Promise<CaseEvent>
unlinkRecordFromEvent(eventId: string, recordId: string): Promise<{ ok: boolean }>
linkReportToEvent(eventId: string, reportId: string): Promise<ReportEvent>
unlinkReportFromEvent(eventId: string, reportId: string): Promise<{ ok: boolean }>
```

Import types from `@protocol/schemas/events`. Mirror the offline-queue exclusion pattern used for `/api/calls/` — event creation may be queuable but link/unlink should not be (temporal data is stale if replayed offline).

### 2. Desktop: rewrite `src/client/routes/events.tsx`

- Remove imports of `listRecords`, `updateRecord`, `listRecordContacts`, `CaseRecord`.
- State type changes from `CaseRecord[]` to `Event[]`.
- `fetchRecords()` becomes `fetchEvents()` calling `listEvents()` (no entity-type pre-flight needed — entity type is returned on the event object).
- Event list card shows `event.startDate` and `event.locationApproximate` (currently missing entirely).
- Replace `CreateRecordDialog` with a purpose-built `CreateEventDialog` that collects `startDate`, optional `endDate`, `locationApproximate`, `entityTypeId`, and encrypts details through the existing `encryptDraft`/platform pattern before calling `createEvent()`.
- `handleStatusChange` calls `updateEvent(id, { statusHash })`.
- `LinkedCasesTab` calls `listEventRecords(eventId)` and renders actual linked case data — not `listRecordContacts`.
- `LinkedReportsTab` calls `listEventReports(eventId)` and renders actual linked reports.
- `LinkSearchDialog` (currently a no-op stub) connects to `linkRecordToEvent` and `linkReportToEvent` on selection.
- Add a "Sub-events" tab backed by `GET /api/events/:id/subevents`.

### 3. Android: rewrite `EventsViewModel.kt`

- `loadEvents()`: change from `GET /api/records?entityTypeId=…` to `GET /api/events?page=…&limit=50`. Response type changes from `RecordsListResponse` to an events list response.
- `selectEvent()`: change from `GET /api/records/:id` to `GET /api/events/:id`. The selected item type changes from `Record` to an event model.
- `updateStatus()`: change from `PATCH /api/records/:id` to `PATCH /api/events/:id`.
- `createEvent()`: change from `POST /api/records` to `POST /api/events`. Use `CryptoService` for real E2EE via `encryptMessage()` — follow the pattern in `iOS EventsViewModel.createEvent()` (which is correct). Store content in `encryptedDetails`/`detailEnvelopes`, not `encryptedSummary`.
- `EventsUiState`: swap `List<Record>` / `Record?` for `List<AppEvent>` / `AppEvent?`. Define `AppEvent` as a Kotlin data class or generated type mirroring `eventSchema`.
- Add `loadLinkedCases()`, `loadLinkedReports()`, `loadSubEvents()` calling the correct endpoints.
- Remove the `loadEntityTypes()` pre-flight: the events API does not require knowing entity type IDs upfront (entity type metadata is still fetched for label/status display, but it is not needed for the list query).

### 4. Android: update `EventListScreen.kt`, `EventDetailScreen.kt`, `CreateEventScreen.kt`

- `EventListScreen`: row should show `event.startDate` and `event.locationApproximate` (matching iOS `EventRow`). Import is `AppEvent` not `Record`.
- `EventDetailScreen`: display `startDate`/`endDate` range, location, sub-events, linked cases, linked reports.
- `CreateEventScreen`: add date pickers for `startDate`/`endDate` and a location text field. Wire `createEvent()` with the new ViewModel signature.

### 5. iOS: no API changes needed

iOS `EventsViewModel` already uses the events API correctly. Review only:
- Confirm `eventTypeHash` and `statusHash` are derived properly (currently not set in `CreateEventRequest` — the iOS create path passes empty `blindIndexes: [:]` and omits `eventTypeHash`/`statusHash`). These are required fields on `createEventBodySchema`. Add them to `CreateEventRequest` and populate from the selected entity type's default status.

---

## File Map

| File | Change type |
|------|-------------|
| `src/client/lib/api.ts` | Add ~11 event API functions |
| `src/client/routes/events.tsx` | Full rewrite — switch to events API |
| `src/client/components/cases/create-event-dialog.tsx` | New component (replaces CreateRecordDialog for events) |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt` | Full rewrite |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt` | Update for AppEvent type |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventDetailScreen.kt` | Add temporal/location/links sections |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/CreateEventScreen.kt` | Add date pickers, location field |
| `apps/android/app/src/main/java/org/llamenos/hotline/model/AppEvent.kt` | New model (or extend generated types) |
| `apps/ios/Sources/ViewModels/EventsViewModel.swift` | Minor: populate `eventTypeHash`/`statusHash` on create |
| `apps/ios/Sources/Views/Events/CreateEventView.swift` | Minor: pass `eventTypeHash`/`statusHash` |

---

## What Does NOT Change

- `apps/worker/routes/events.ts` — no backend changes needed
- `packages/protocol/schemas/events.ts` — no schema changes needed
- `apps/worker/routes/records.ts` — records API untouched
- iOS `EventListView`, `EventDetailView` — UI is already correct; only ViewModel has the minor fix above
- Entity type settings UI — `category='event'` filtering in admin views stays as-is

---

## Verification Gates

1. `bun run typecheck` passes — no references to `CaseRecord` or `listRecords` in `events.tsx`
2. `bun run test` (Playwright) — events page creates, lists, and updates an event using the events API (not records API) as observable via network logs
3. `cd apps/android && ./gradlew testDebugUnitTest` — `EventsViewModelTest` asserts that `loadEvents()` hits `/api/events`, not `/api/records`
4. `cd apps/android && ./gradlew compileDebugAndroidTestKotlin` — E2E test code compiles
5. iOS: `EventsViewModel` unit tests pass on mac with real XCFramework
6. BDD: `bun run test:backend:bdd` — existing events BDD scenarios green; no scenario uses records API to create an event
7. Manual smoke test: create event on desktop → verify it appears on iOS with `startDate` displayed correctly

---

## Risks

- **Android E2EE gap:** Current Android stores events unencrypted. The new implementation requires `CryptoService.encryptMessage()` to be wired in `EventsViewModel`. This is already done for notes — follow that pattern. Do not ship without it.
- **eventTypeHash/statusHash on iOS create:** These are required fields. Without them the server rejects the request with a 400. Verify the server actually validates or silently allows empty strings — if the schema uses `.min(1)`, empty string will fail validation.
- **Desktop CreateEventDialog crypto:** The desktop currently has no direct event creation UI — it uses `CreateRecordDialog`. The new dialog must call `encryptDraft()` from `platform.ts` to encrypt `eventDetailsSchema` content before submitting. Never pass plaintext to `createEvent()`.
