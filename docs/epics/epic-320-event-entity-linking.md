# Epic 320: Event Entity & Linking

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 315 (Schema Engine), Epic 316 (Blind Indexes), Epic 319 (Record Entity)
**Blocks**: Epic 324 (Report-Record-Event Linking), Epic 332 (Desktop Timeline)
**Branch**: `desktop`

## Summary

Build event entity support within CaseDO -- events are records with `category='event'` that add time range tracking (startDate/endDate), configurable location privacy (none/city/neighborhood/block/exact), sub-event hierarchies (parentEventId), and M:N linking between records and events and between reports and events. Events represent time-bounded occurrences (protests, ICE raids, mass arrests, disasters) that group related cases and reports into shared context. ~15 files created/modified.

## Problem Statement

The record entity (Epic 319) provides generic CRUD for any entity type, but events have domain-specific needs that records alone do not cover:
- Events have time ranges (start/end), not just a creation timestamp
- Events need location tracking with configurable privacy (GPS coordinates of an ICE sighting are a surveillance risk; disaster response needs exact coordinates)
- Events form hierarchies (a 3-day protest is a parent event; each day is a sub-event; a mass arrest within Day 2 is a further sub-event)
- Cases must link to events M:N (one arrest case relates to one mass arrest event; that event relates to many arrest cases)
- Reports (existing conversations with `metadata.type='report'`) must link to events (a legal observer field report links to the protest event)

Without event linking, cases exist in isolation -- an admin cannot view "all 47 arrest cases from the March 14th protest" or "all reports filed during the ICE operation on Oak Street."

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Event Schemas

**File**: `apps/worker/schemas/events.ts` (new)

Define Zod schemas for event-specific data, extending the record model:

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

export const locationPrecisionSchema = z.enum([
  'none', 'city', 'neighborhood', 'block', 'exact',
])

export type LocationPrecision = z.infer<typeof locationPrecisionSchema>

export const eventSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  entityTypeId: z.uuid(),
  caseNumber: z.string().optional(),

  // --- Event-specific cleartext metadata ---
  startDate: z.string(),                        // ISO 8601
  endDate: z.string().optional(),               // ISO 8601
  parentEventId: z.uuid().optional(),   // Sub-event hierarchy
  locationPrecision: locationPrecisionSchema.default('neighborhood'),
  locationApproximate: z.string().optional(),    // Cleartext approximate location

  // --- Blind indexes ---
  eventTypeHash: z.string(),
  statusHash: z.string(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),

  // --- E2EE ---
  encryptedDetails: z.string(),
  detailEnvelopes: z.array(recipientEnvelopeSchema).min(1),

  // --- Counts ---
  caseCount: z.number(),
  reportCount: z.number(),
  subEventCount: z.number(),

  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type Event = z.infer<typeof eventSchema>

export const createEventBodySchema = z.object({
  entityTypeId: z.uuid(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  parentEventId: z.uuid().optional(),
  locationPrecision: locationPrecisionSchema.default('neighborhood'),
  locationApproximate: z.string().optional(),
  eventTypeHash: z.string(),
  statusHash: z.string(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  encryptedDetails: z.string().min(1),
  detailEnvelopes: z.array(recipientEnvelopeSchema).min(1),
})

export const updateEventBodySchema = createEventBodySchema.partial()

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventTypeHash: z.string().optional(),
  statusHash: z.string().optional(),
  parentEventId: z.string().optional(),
  startAfter: z.string().optional(),
  startBefore: z.string().optional(),
})

// --- Join schemas ---

export const caseEventSchema = z.object({
  recordId: z.uuid(),
  eventId: z.uuid(),
  linkedAt: z.string(),
  linkedBy: z.string(),
})

export type CaseEvent = z.infer<typeof caseEventSchema>

export const reportEventSchema = z.object({
  reportId: z.string(),             // Conversation ID of the report
  eventId: z.uuid(),
  linkedAt: z.string(),
  linkedBy: z.string(),
})

export type ReportEvent = z.infer<typeof reportEventSchema>

export const linkRecordToEventBodySchema = z.object({
  recordId: z.uuid(),
})

export const linkReportToEventBodySchema = z.object({
  reportId: z.string(),
})

// --- Encrypted payload (client-side only) ---

export const eventDetailsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  eventType: z.string(),
  status: z.string(),
  location: z.object({
    name: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    area: z.string().optional(),
    jurisdiction: z.string().optional(),
  }).optional(),
  organizers: z.array(z.string()).optional(),
  expectedAttendance: z.number().optional(),
  policePresence: z.string().optional(),
  legalHotlineNumber: z.string().optional(),
  medicalTeamPresent: z.boolean().optional(),
  subEventLabels: z.array(z.string()).optional(),
  notes: z.string().optional(),
})
```

#### Task 2: CaseDO Event Storage

**File**: `apps/worker/durable-objects/case-do.ts` (extend)

Add event storage and handlers to CaseDO. Storage key conventions:

```
event:{id}                             -> Event record
caseevent:{recordId}:{eventId}         -> CaseEvent join
eventcases:{eventId}:{recordId}        -> CaseEvent reverse index
reportevent:{reportId}:{eventId}       -> ReportEvent join
eventreports:{eventId}:{reportId}      -> ReportEvent reverse index
idx:eventtype:{typeHash}:{eventId}     -> true (event type filter)
idx:eventstatus:{statusHash}:{eventId} -> true (event status filter)
idx:eventparent:{parentId}:{eventId}   -> true (sub-event index)
```

New DORouter handlers:
- `GET /events` -- list with pagination + blind index filters + date range + parent filter
- `GET /events/:id` -- get single event
- `POST /events` -- create event
- `PATCH /events/:id` -- update event
- `DELETE /events/:id` -- soft-delete (archive)
- `POST /events/:id/records` -- link record to event (creates CaseEvent join)
- `DELETE /events/:id/records/:recordId` -- unlink record from event
- `GET /events/:id/records` -- list records linked to event
- `POST /events/:id/reports` -- link report to event (creates ReportEvent join)
- `DELETE /events/:id/reports/:reportId` -- unlink report from event
- `GET /events/:id/reports` -- list reports linked to event
- `GET /events/:id/subevents` -- list child events

Key logic for linking:
```typescript
// POST /events/:id/records
this.router.post('/events/:id/records', async (req) => {
  const { id: eventId } = req.params
  const { recordId } = await req.json()
  const event = await this.ctx.storage.get(`event:${eventId}`)
  if (!event) return json({ error: 'Event not found' }, { status: 404 })
  const record = await this.ctx.storage.get(`record:${recordId}`)
  if (!record) return json({ error: 'Record not found' }, { status: 404 })

  const now = new Date().toISOString()
  const link: CaseEvent = { recordId, eventId, linkedAt: now, linkedBy: req.headers.get('x-pubkey') ?? '' }

  await this.ctx.storage.put(`caseevent:${recordId}:${eventId}`, link)
  await this.ctx.storage.put(`eventcases:${eventId}:${recordId}`, link)

  // Update counts
  event.caseCount = (event.caseCount ?? 0) + 1
  await this.ctx.storage.put(`event:${eventId}`, event)
  // Also update record.eventIds array
  record.eventIds = [...(record.eventIds ?? []), eventId]
  await this.ctx.storage.put(`record:${recordId}`, record)

  return json(link, { status: 201 })
})
```

#### Task 3: Event API Routes

**File**: `apps/worker/routes/events.ts` (new)

Hono routes proxying to CaseDO:

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'

const events = new Hono<AppEnv>()

// List events
events.get('/',
  requirePermission('events:read'),
  async (c) => { /* proxy to CaseDO GET /events with query params */ },
)

// Get event
events.get('/:id',
  requirePermission('events:read'),
  async (c) => { /* proxy to CaseDO GET /events/:id */ },
)

// Create event
events.post('/',
  requirePermission('events:create'),
  async (c) => {
    /* validate with createEventBodySchema, proxy to CaseDO POST /events */
    /* audit: eventCreated */
  },
)

// Update event
events.patch('/:id',
  requirePermission('events:update'),
  async (c) => { /* proxy to CaseDO PATCH /events/:id, audit: eventUpdated */ },
)

// Delete event
events.delete('/:id',
  requirePermission('events:delete'),
  async (c) => { /* proxy to CaseDO DELETE /events/:id, audit: eventDeleted */ },
)

// Link record to event
events.post('/:id/records',
  requirePermission('events:link'),
  async (c) => { /* proxy to CaseDO POST /events/:id/records, audit: recordLinkedToEvent */ },
)

// Unlink record from event
events.delete('/:id/records/:recordId',
  requirePermission('events:link'),
  async (c) => { /* proxy to CaseDO DELETE /events/:id/records/:recordId */ },
)

// List records linked to event
events.get('/:id/records',
  requirePermission('events:read'),
  async (c) => { /* proxy to CaseDO GET /events/:id/records */ },
)

// Link report to event
events.post('/:id/reports',
  requirePermission('events:link'),
  async (c) => { /* proxy to CaseDO POST /events/:id/reports, audit: reportLinkedToEvent */ },
)

// Unlink report from event
events.delete('/:id/reports/:reportId',
  requirePermission('events:link'),
  async (c) => { /* proxy to CaseDO DELETE /events/:id/reports/:reportId */ },
)

// List reports linked to event
events.get('/:id/reports',
  requirePermission('events:read'),
  async (c) => { /* proxy to CaseDO GET /events/:id/reports */ },
)

export default events
```

#### Task 4: Mount Routes

**File**: `apps/worker/app.ts`

```typescript
import events from './routes/events'
app.route('/api/events', events)
```

#### Task 5: Register Schemas for Codegen

**File**: `packages/protocol/tools/schema-registry.ts`

```typescript
import { eventSchema, eventDetailsSchema, caseEventSchema, reportEventSchema } from '@worker/schemas/events'

// Add to registry:
Event: toJSONSchema(eventSchema),
EventDetails: toJSONSchema(eventDetailsSchema),
CaseEvent: toJSONSchema(caseEventSchema),
ReportEvent: toJSONSchema(reportEventSchema),
```

#### Task 6: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "events": {
    "title": "Events",
    "createEvent": "Create Event",
    "editEvent": "Edit Event",
    "deleteEvent": "Delete Event",
    "deleteConfirm": "Delete this event? Linked records and reports will be unlinked.",
    "noEvents": "No events yet.",
    "startDate": "Start Date",
    "endDate": "End Date",
    "location": "Location",
    "locationPrecision": "Location Precision",
    "locationNone": "No location shared",
    "locationCity": "City level",
    "locationNeighborhood": "Neighborhood level",
    "locationBlock": "Block level",
    "locationExact": "Exact coordinates",
    "linkedRecords": "Linked Records",
    "linkedReports": "Linked Reports",
    "subEvents": "Sub-Events",
    "addSubEvent": "Add Sub-Event",
    "linkRecord": "Link Record",
    "linkReport": "Link Report",
    "unlinkRecord": "Unlink Record",
    "unlinkReport": "Unlink Report",
    "parentEvent": "Parent Event",
    "caseCount": "{{count}} cases",
    "reportCount": "{{count}} reports"
  }
}
```

#### Task 7: BDD Feature File

**File**: `packages/test-specs/features/core/events.feature`

```gherkin
@backend
Feature: Event Entity & Linking
  Events are time-bounded occurrences (protests, raids, disasters) that
  group related case records and reports into shared context.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "mass_arrest_event" with category "event"
    And an entity type "arrest_case" with category "case"

  @events
  Scenario: Create an event with encrypted details
    When admin "admin1" creates an event of type "mass_arrest_event" with:
      | name       | March for Justice 2026              |
      | startDate  | 2026-03-14T10:00:00Z                |
      | endDate    | 2026-03-14T18:00:00Z                |
      | eventType  | protest                             |
      | status     | active                              |
    Then the event should exist with a generated UUID
    And the event should have encrypted details
    And the event should have startDate "2026-03-14T10:00:00Z"
    And the event should have eventTypeHash blind index

  @events
  Scenario: Create a sub-event under a parent event
    Given an event "March for Justice" exists
    When admin "admin1" creates an event with parentEventId referencing "March for Justice"
    Then the sub-event should reference the parent event
    And the parent event's subEventCount should be 1

  @events
  Scenario: List events filtered by type
    Given events of type "protest" and "ice_operation" exist
    When admin "admin1" lists events with eventTypeHash for "protest"
    Then only events with eventType "protest" should be returned

  @events
  Scenario: List events filtered by date range
    Given events with start dates "2026-03-01", "2026-03-14", "2026-04-01"
    When admin "admin1" lists events with startAfter "2026-03-10" and startBefore "2026-03-20"
    Then only the event starting on "2026-03-14" should be returned

  @events
  Scenario: Link a record to an event
    Given an event "March for Justice" exists
    And a record "arrest_001" of type "arrest_case" exists
    When admin "admin1" links record "arrest_001" to event "March for Justice"
    Then the event should have 1 linked record
    And the record should have the event in its eventIds

  @events
  Scenario: Link a report to an event
    Given an event "March for Justice" exists
    And a report "observer_report_1" exists
    When admin "admin1" links report "observer_report_1" to event "March for Justice"
    Then the event should have 1 linked report

  @events
  Scenario: List records linked to an event
    Given an event with 3 linked arrest case records
    When admin "admin1" lists records for the event
    Then 3 records should be returned

  @events
  Scenario: Unlink a record from an event
    Given a record linked to an event
    When admin "admin1" unlinks the record from the event
    Then the event's caseCount should be 0
    And the record's eventIds should not include the event

  @events
  Scenario: Location precision defaults to neighborhood
    When admin "admin1" creates an event without specifying locationPrecision
    Then the event's locationPrecision should be "neighborhood"

  @events
  Scenario: Set location precision to exact for disaster response
    When admin "admin1" creates an event with locationPrecision "exact" and:
      | locationApproximate | 1200 SE Morrison St, Portland |
    Then the event should store the approximate location in cleartext
    And the exact coordinates should be in the encrypted details only

  @events @permissions
  Scenario: Volunteer without events:create cannot create events
    Given a registered volunteer "vol1"
    When volunteer "vol1" tries to create an event
    Then the response status should be 403

  @events
  Scenario: Deleting a parent event does not delete sub-events
    Given a parent event with 2 sub-events
    When admin "admin1" deletes the parent event
    Then the sub-events should still exist
    And the sub-events' parentEventId should be cleared
```

#### Task 8: Backend Step Definitions

**File**: `tests/steps/backend/events.steps.ts`

Implement step definitions using the simulation framework and API helpers for all scenarios in `events.feature`.

### Phase 2: Desktop UI

Deferred to Epic 330 (Desktop Case Management UI) and Epic 332 (Desktop Timeline).

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/events.ts` | Zod schemas for event types and join models |
| `apps/worker/routes/events.ts` | API routes for event CRUD and linking |
| `packages/test-specs/features/core/events.feature` | BDD scenarios |
| `tests/steps/backend/events.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/case-do.ts` | Add event storage, CaseEvent/ReportEvent joins, linking handlers |
| `apps/worker/app.ts` | Mount events routes at `/api/events` |
| `packages/protocol/tools/schema-registry.ts` | Register event schemas for codegen |
| `packages/i18n/locales/en.json` | Add events i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` -- 12 scenarios in `events.feature`

### Typecheck

`bun run typecheck` -- all new types must compile

### Codegen

`bun run codegen` -- event schemas generated to TS/Swift/Kotlin

## Acceptance Criteria & Test Scenarios

- [ ] Events can be created with encrypted details, time range, and location precision
  -> `packages/test-specs/features/core/events.feature: "Create an event with encrypted details"`
- [ ] Sub-events can reference a parent event
  -> `packages/test-specs/features/core/events.feature: "Create a sub-event under a parent event"`
- [ ] Events filterable by type blind index
  -> `packages/test-specs/features/core/events.feature: "List events filtered by type"`
- [ ] Events filterable by date range
  -> `packages/test-specs/features/core/events.feature: "List events filtered by date range"`
- [ ] Records can be linked to events M:N
  -> `packages/test-specs/features/core/events.feature: "Link a record to an event"`
- [ ] Reports can be linked to events M:N
  -> `packages/test-specs/features/core/events.feature: "Link a report to an event"`
- [ ] Linked records can be listed per event
  -> `packages/test-specs/features/core/events.feature: "List records linked to an event"`
- [ ] Records can be unlinked from events
  -> `packages/test-specs/features/core/events.feature: "Unlink a record from an event"`
- [ ] Location precision defaults to neighborhood
  -> `packages/test-specs/features/core/events.feature: "Location precision defaults to neighborhood"`
- [ ] Exact location only stored in encrypted details
  -> `packages/test-specs/features/core/events.feature: "Set location precision to exact for disaster response"`
- [ ] Permission enforcement for event operations
  -> `packages/test-specs/features/core/events.feature: "Volunteer without events:create cannot create events"`
- [ ] Deleting parent preserves sub-events
  -> `packages/test-specs/features/core/events.feature: "Deleting a parent event does not delete sub-events"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/events.feature` | New | 12 scenarios for event CRUD and linking |
| `tests/steps/backend/events.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Low risk**: Event schemas (Task 1) -- standard Zod definitions extending existing patterns
- **Medium risk**: CaseDO event storage (Task 2) -- adds significant new key prefixes to CaseDO. Risk mitigated by using distinct prefixes (`event:`, `caseevent:`, `eventcases:`, `reportevent:`, `eventreports:`) that do not collide with record storage.
- **Low risk**: Routes (Task 3) -- standard CRUD pattern following records.ts
- **Medium risk**: Location privacy (Tasks 1-2) -- the `locationPrecision` setting determines what appears in cleartext versus encrypted. Must ensure that exact coordinates never leak to the `locationApproximate` field when precision is `none` or `city`. This is a client-side responsibility but the schema must enforce the boundary.
- **Low risk**: Sub-event hierarchy (Task 2) -- simple `parentEventId` reference. No deep tree operations needed in Phase 1; sub-event queries use a single `idx:eventparent:` prefix scan.

## Execution

- **Phase 1**: Schemas -> CaseDO event handlers -> Routes -> Mount -> Codegen -> i18n -> BDD -> gate
- **Phase 2**: No dedicated UI (Epic 330/332 handle desktop event views)
- **Phase 3**: `bun run test:all`
