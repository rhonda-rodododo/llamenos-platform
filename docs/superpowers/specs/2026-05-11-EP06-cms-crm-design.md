---
epic: EP06
title: "CMS/CRM -- Contacts, Cases, Events, Evidence"
status: stub
depends-on: [EP01, EP03]
phase: 4
---

# EP06: CMS/CRM -- Contacts, Cases, Events, Evidence

## Scope

Contact management, case/record management, events, evidence chain of custody, triage/intake workflows, and entity type configuration. These are primarily user-facing features (not admin-only) -- users with appropriate permissions do the actual contact/case/event work. The admin surface is entity type configuration.

## What Has Been Specced

Six detailed CMS specs already exist covering every major subsystem:

| Spec | Status | Covers |
|------|--------|--------|
| `2026-03-21-cms-contact-management.md` | Draft | Client API write functions (relationships, groups), mobile contact create/edit (iOS + Android), desktop relationship/group management UI, contact merge backend + UI, case merge backend + UI. Includes v2 directory migration prereq for mobile. |
| `2026-03-21-cms-advanced-ui.md` | Draft | Evidence custody chain display (desktop), report type field editor (desktop), cross-hub case visibility for super-admins |
| `2026-03-21-cms-automation.md` | Draft | Support contact notifications (client API + trigger UI), case assignment push notifications, report-to-case auto-conversion endpoint + UI |
| `2026-03-21-cms-field-types.md` | Draft | Location field type (geocoding autocomplete), file field type (upload integration), report type field editor UI |
| `2026-03-21-cms-smart-assignment.md` | Draft | Specialization scoring fix, auto-assignment wiring to record creation, language preference alignment |
| `2026-03-21-events-architecture.md` | Draft | Desktop + Android event API consolidation (switch from records API to events API), event-specific create dialog, sub-event hierarchy |

Corresponding implementation plans exist in `docs/superpowers/plans/` for each spec.

## What Has Been Built (v2)

### Backend -- Fully Implemented

**Contacts v2 (`apps/worker/routes/contacts-v2.ts`):**
- Full CRUD: `POST /directory`, `PATCH /directory/:id`, `DELETE /directory/:id`, `GET /directory`, `GET /directory/:id`, `GET /directory/search`, `GET /directory/lookup/:identifierHash`
- Relationships: `POST /directory/:id/relationships`, `DELETE /directory/:id/relationships/:relId`, `GET /directory/:id/relationships`
- Affinity groups: full CRUD + member management (6 endpoints)
- Permission guards: `contacts:create`, `contacts:edit`, `contacts:delete`, `contacts:manage-groups`, `contacts:manage-relationships`, `contacts:view`

**Legacy contacts (`apps/worker/routes/contacts.ts`):**
- Phone-hash based contact timeline: `GET /contacts`, `GET /contacts/:hash` (aggregates calls, conversations, notes, reports by contactHash)
- Still used by iOS and Android mobile apps

**Records/Cases (`apps/worker/routes/records.ts`):**
- Full CRUD with E2EE envelopes: create, update, delete, list (paginated with entity type filters)
- Contact linking: `POST /records/:id/contacts`, `DELETE /records/:id/contacts/:contactId`, `GET /records/:id/contacts`
- Assignment: `POST /records/:id/assign`, `POST /records/:id/unassign`
- Assignment suggestions (scoring): `GET /records/:id/suggestions` (workload + language + specialization scoring)
- Interactions (timeline): `POST /records/:id/interactions`, `GET /records/:id/interactions`
- Report linking: `POST /records/:id/reports`, `DELETE /records/:id/reports/:reportId`, `GET /records/:id/reports`
- Contact notification dispatch: `POST /records/:id/notify-contacts`
- Envelope recipients: `GET /records/envelope-recipients`

**Events (`apps/worker/routes/events.ts`):**
- Full CRUD: create, update, delete, list (paginated with temporal + type filters)
- Sub-event hierarchy: `GET /events/:id/subevents`
- Record linking: `POST /events/:id/records`, `DELETE /events/:id/records/:recordId`, `GET /events/:id/records`
- Report linking: `POST /events/:id/reports`, `DELETE /events/:id/reports/:reportId`, `GET /events/:id/reports`
- Semantically richer than records: `startDate`/`endDate`, `parentEventId`, `locationPrecision`, `locationApproximate`

**Evidence (`apps/worker/routes/evidence.ts`):**
- Upload metadata: `POST /records/:id/evidence`
- List evidence: `GET /records/:id/evidence`
- Custody chain: `GET /evidence/:id/custody`
- Access logging: `POST /evidence/:id/access`
- Integrity verification: `POST /evidence/:id/verify`

**Entity type definitions (`apps/worker/routes/entity-schema.ts`):**
- Admin config for case/event entity types with custom field schemas

### Desktop -- Partially Implemented

**Contact Directory (`src/client/routes/contacts-directory.tsx`):**
- List view with search, type filtering, decryption of E2EE profiles
- Detail view via `ContactProfile` component
- `CreateContactDialog` component exists
- Components: `contact-card.tsx`, `contact-profile.tsx`, `create-contact-dialog.tsx`

**Cases (`src/client/routes/cases.tsx`):**
- List view with entity type filters, pagination
- Detail view with status management, assignment
- `CreateRecordDialog`, `CaseTimeline`, `EvidenceTab`, `AssignmentDialog`, `SchemaForm`
- Evidence upload via `EvidenceUploadDialog`

**Events (`src/client/routes/events.tsx`):**
- **Uses records API instead of events API** (known bug documented in events spec)
- No `startDate`/`endDate` display, no sub-event hierarchy, no proper event create dialog

**Triage (`src/client/routes/triage.tsx`):**
- Queue with status tabs (pending/in_progress/completed)
- Report content display, case creation panel, linked cases view

**Client API (`src/client/lib/api.ts`):**
- Contacts: `listRawContacts()`, `searchRawContacts()`, `getRawContact()`, `createRawContact()`, `updateDirectoryContact()`, `deleteDirectoryContact()`, `listDirectoryContactRelationships()`, `listDirectoryContactGroups()`, `listDirectoryContactCases()`
- Records: `listRecords()`, `getRecord()`, `createRecord()`, `updateRecord()`, `listRecordContacts()`, `assignRecord()`, `unassignRecord()`, `listEntityTypes()`
- Evidence: `getEvidenceCustody()`, `logEvidenceAccess()`, `verifyEvidenceIntegrity()`
- Missing: relationship write functions, affinity group write functions, event API functions, merge functions, contact notification API

### iOS -- Partially Implemented

**Contacts:**
- `ContactsView.swift` -- list view (read-only)
- `ContactDetailView.swift` -- detail with identifiers, interactions, linked cases, relationships (read-only)
- `ContactTimelineView.swift` -- call/conversation/note history
- Still uses legacy `/api/contacts` (phone-hash model), not v2 `/directory`
- No create/edit views

**Events:**
- Uses correct `/api/events` endpoint (correct)
- `EventsViewModel.swift` has proper create/list via events API
- Missing: `eventTypeHash`/`statusHash` population on create (minor bug)

**Cases:**
- Case detail and list views exist
- No evidence-specific detail view or custody chain

### Android -- Partially Implemented

**Contacts:**
- `ContactsScreen.kt` -- list view (read-only)
- `ContactDetailScreen.kt` -- detail (read-only)
- `ContactTimelineScreen.kt` -- history
- Still uses legacy `/api/contacts`, not v2 `/directory`
- No create/edit screens

**Events:**
- **Uses records API instead of events API** (known bug documented in events spec)
- Creates events unencrypted (E2EE regression)
- No date pickers, no location field

**Cases:**
- Case detail and list views exist
- No evidence-specific UI or custody chain

### Permissions -- Fully Implemented

All permission constants defined in `packages/shared/permissions.ts`:
- `contacts:*` (10 permissions): view, view-history, search, export, create, edit, delete, merge, view-pii, manage-relationships, manage-groups
- `cases:*` (14 permissions): create, read-own, read-assigned, read-all, update-own, update, close, delete, assign, link, unlink, manage, manage-types, import, export
- `events:*` (5 permissions): create, read, update, delete, link
- `evidence:*` (4 permissions): upload, download, manage-custody, delete

Role defaults wired for admin, case-manager, volunteer, and basic-volunteer roles.

## Gaps Remaining

### Gap 1: Mobile v2 Directory Migration (iOS + Android)
Both mobile apps use the legacy `/api/contacts` phone-hash model. Must migrate to v2 `/directory` endpoint with E2EE encrypted profiles before any write UI can be added. Covered in `cms-contact-management` spec.

### Gap 2: Contact Write UI (All Platforms)
- Desktop: relationship write UI missing, affinity group management UI missing (backend fully supports both)
- iOS: no contact create/edit views, no groups tab
- Android: no contact create/edit screens, no groups tab
- All platforms: no contact merge UI
- Covered in `cms-contact-management` spec.

### Gap 3: Contact Merge Backend
No `POST /directory/merge` endpoint exists. Client-side merge with re-encryption needed (E2EE constraint). Covered in `cms-contact-management` spec.

### Gap 4: Case Merge Backend
No `POST /records/merge` endpoint exists. Covered in `cms-contact-management` spec.

### Gap 5: Events API Consolidation (Desktop + Android)
Desktop and Android treat events as records filtered by category. Must switch to `/api/events` endpoints. Covered in `events-architecture` spec.

### Gap 6: Evidence Custody Chain UI
Backend fully implemented. Desktop `EvidenceDetailDialog` has no custody chain tab. iOS and Android have no evidence detail views. Covered in `cms-advanced-ui` spec.

### Gap 7: Report Type Field Editor UI
Backend supports field definitions but desktop admin UI has a stub `ReportTypeFieldsEditor`. Covered in `cms-field-types` spec.

### Gap 8: Location and File Field Types
`schema-form.tsx` falls through to plain `<Input>` for location fields (no geocoding autocomplete). File fields have no upload UI. Covered in `cms-field-types` spec.

### Gap 9: Smart Assignment Wiring
Specialization scoring is a stub (+5 for any specialization, not matched to entity type). Auto-assignment not wired to record creation. Covered in `cms-smart-assignment` spec.

### Gap 10: CMS Automation
- Contact notification: route exists but no client API function or trigger UI
- Case assignment push notifications: assign route publishes Nostr event but no push dispatch
- Report-to-case conversion: triage UI exists but no conversion endpoint or "Convert to Case" button
- Covered in `cms-automation` spec.

### Gap 11: Contact Bulk Operations
v1 had `/api/contacts/bulk` and `/api/contacts/outreach` endpoints. No equivalent in v2. Not yet specced.

### Gap 12: Cross-Hub Case Visibility
Super-admin cross-hub case query requires new permission, backend query path, and desktop toggle. Covered in `cms-advanced-ui` spec.

### Gap 13: Client API Gaps
Missing functions in `src/client/lib/api.ts`:
- Relationship write: `createContactRelationship()`, `deleteContactRelationship()`
- Group write: `createAffinityGroup()`, `updateAffinityGroup()`, `deleteAffinityGroup()`, `addGroupMember()`, `removeGroupMember()`, `listAffinityGroups()`
- Events: `listEvents()`, `getEvent()`, `createEvent()`, `updateEvent()`, `deleteEvent()`, `listEventRecords()`, `linkRecordToEvent()`, `unlinkRecordFromEvent()`, `listEventReports()`, `linkReportToEvent()`, `unlinkReportFromEvent()`
- Merge: `mergeContacts()`, `mergeCases()`
- Notification: `notifyContacts()`

## Implementation Priority (Suggested)

1. **Mobile v2 directory migration** (Gap 1) -- prerequisite for all mobile contact work
2. **Client API write functions** (Gap 13) -- prerequisite for all UI gaps
3. **Events API consolidation** (Gap 5) -- fixes data integrity issues (temporal data loss, E2EE regression on Android)
4. **Contact write UI** (Gap 2) -- highest user-facing value
5. **Merge backends + UI** (Gaps 3, 4) -- admin workflow
6. **Evidence custody chain UI** (Gap 6) -- surfacing existing backend
7. **Field types + editor** (Gaps 7, 8) -- completing form infrastructure
8. **Smart assignment wiring** (Gap 9) -- automation
9. **CMS automation** (Gap 10) -- notifications, conversions
10. **Bulk operations** (Gap 11) -- needs spec
11. **Cross-hub visibility** (Gap 12) -- super-admin feature

## V1 Features to Port

| v1 Feature | v2 Status |
|------------|-----------|
| Contact CRUD with ECIES envelopes | Backend done (HPKE), desktop partial, mobile missing |
| `contact_relationships` table | Backend done, UI read-only |
| `contact_call_links` (auto-link) | Not verified -- needs audit |
| `contact_team_assignments` | Replaced by affinity groups (backend done) |
| Contact discovery (`/api/contacts/discovery`) | Not ported -- needs spec if needed |
| Contact bulk operations (`/api/contacts/bulk`) | Not ported (Gap 11) |
| Contact outreach (`/api/contacts/outreach`) | Not ported -- needs spec if needed |
| Intake/triage system | Backend + triage UI exist, conversion endpoint missing |
| Notes as case documentation (MLS) | Records + interactions system replaces this |
| Multi-channel conversations | Conversation routes fully built |

## Notes

- All existing specs have corresponding implementation plans in `docs/superpowers/plans/`
- E2EE constraint: contact PII encrypted on-device with hub key; server never sees plaintext
- Contact merge re-encryption is entirely client-side (server receives pre-merged encrypted blob)
- Events use `encryptedDetails`/`detailEnvelopes` (not `encryptedSummary`/`summaryEnvelopes`)
- Settings permission `settings:manage-cms` gates the CMS feature toggle in admin settings
- Geocoding infrastructure exists (OpenCage, Geoapify adapters) but location field type not wired into forms
