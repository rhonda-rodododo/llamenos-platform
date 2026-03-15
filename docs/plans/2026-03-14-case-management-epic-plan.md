# Case Management System — Epic Decomposition Plan

**Date**: 2026-03-14
**Status**: DRAFT — finalize after research agents complete
**Purpose**: Ordered list of epics with dependency graph. Each epic is a complete
vertical slice (API + specs + desktop UI where applicable).

---

## Epic Summary

| # | Title | Depends On | Category | Phase |
|---|-------|-----------|----------|-------|
| 315 | Entity Schema Engine | None | Infrastructure | 1 |
| 316 | Blind Index Infrastructure | 315 | Infrastructure | 1 |
| 317 | Template System & Catalog | 315 | Infrastructure | 1 |
| 318 | Contact Entity & E2EE Profiles | 315, 316 | Core Entity | 2 |
| 319 | Record Entity & Core CRUD | 315, 316, 318 | Core Entity | 2 |
| 320 | Event Entity & Linking | 315, 316, 319 | Core Entity | 2 |
| 321 | CMS Permissions & RBAC | 315, 319 | Access Control | 2 |
| 322 | Contact Relationships & Networks | 318, 321 | Relationships | 3 |
| 323 | Case Interactions & Timeline | 319 | Integration | 3 |
| 324 | Report-Record-Event Linking | 319, 320 | Integration | 3 |
| 325 | Evidence & Chain of Custody | 319, 323 | Integration | 3 |
| 326 | Telephony-CRM: Screen Pop & Auto-Link | 318, 319 | Telephony | 4 |
| 327 | Support Contact Notifications | 322 | Communication | 4 |
| 328 | Cross-Hub Case Visibility | 318, 319, 321 | Cross-Hub | 4 |
| 329 | Desktop: Schema Editor & Template Browser | 315, 317 | Desktop UI | 3 |
| 330 | Desktop: Case Management UI | 319, 321, 323 | Desktop UI | 4 |
| 331 | Desktop: Contact Directory | 318, 322 | Desktop UI | 4 |
| 332 | Desktop: Case Timeline & Evidence | 323, 325 | Desktop UI | 4 |

---

## Dependency Graph

```
Phase 1: Infrastructure (sequential — each builds on previous)
  315 Entity Schema Engine
   ├─► 316 Blind Index Infrastructure
   ├─► 317 Template System & Catalog
   └─► 329 Desktop Schema Editor (Phase 3, but only depends on 315+317)

Phase 2: Core Entities + RBAC (mostly sequential)
  318 Contact Entity ──────► 322 Relationships (Phase 3)
   │                          └─► 331 Desktop Contact Directory (Phase 4)
   ▼
  319 Record Entity ──────► 321 CMS RBAC
   │                  │      └─► 328 Cross-Hub (Phase 4)
   │                  ▼
   │                 323 Interactions ──► 325 Evidence
   │                  │                    └─► 332 Desktop Timeline (Phase 4)
   │                  └──────────────────► 330 Desktop Case UI (Phase 4)
   ▼
  320 Event Entity ──────► 324 Report-Record-Event Linking (Phase 3)

Phase 4: Integration Features (parallelizable)
  326 Screen Pop (318 + 319)
  327 Support Notifications (322)
  328 Cross-Hub (318 + 319 + 321)
  330 Desktop Case UI (319 + 321 + 323)
  331 Desktop Contact Dir (318 + 322)
  332 Desktop Timeline (323 + 325)
```

---

## Phase 1: Infrastructure (Epics 315-317)

These are backend-only — no user-facing UI. They establish the foundation.

### Epic 315: Entity Schema Engine

**What**: The core schema system — `EntityTypeDefinition`, `RelationshipTypeDefinition`,
`EnumDefinition`, `EntityFieldDefinition`. CRUD API for managing entity type schemas.
Feature toggle: `caseManagementEnabled` hub setting.

**Key deliverables**:
- Zod schemas for all schema definition types
- SettingsDO methods for entity type CRUD
- Routes: `GET/POST/PATCH/DELETE /api/settings/entity-types`
- Routes: `GET/POST/PATCH/DELETE /api/settings/relationship-types`
- New crypto labels for CMS domain separation
- New permission domains (`cases:*`, `contacts:*`, `events:*`, `evidence:*`)
- Protocol codegen for TS/Swift/Kotlin types
- BDD scenarios for schema CRUD operations

**Size estimate**: Medium — mostly schema definitions and settings storage

### Epic 316: Blind Index Infrastructure

**What**: Hub-key-derived HMAC blind index system for server-side filtering of encrypted
enum values. Client-side index generation, server-side query matching.

**Key deliverables**:
- `blindIndex(hubKey, domain, value)` utility (client-side, all platforms)
- Server-side query parameter parsing for hash-based filtering
- Integration with entity field definitions (`indexable: true`, `indexType: 'exact'`)
- BDD scenarios for blind index creation and query matching

**Size estimate**: Small-medium — focused utility with clear contracts

### Epic 317: Template System & Catalog

**What**: Template loading, validation, application, composition, and update detection.
Ships with 13 pre-built templates as JSON in `packages/protocol/templates/`.

**Key deliverables**:
- `CaseManagementTemplate` type definition
- Template JSON Schema for validation
- Template application API: `POST /api/settings/templates/apply`
- Template composition logic (extends, merge)
- Template update detection and diff
- 13 pre-built template JSON files
- `bun run templates:validate` script
- BDD scenarios for template application and composition

**Size estimate**: Large — template authoring is substantial

---

## Phase 2: Core Entities + RBAC (Epics 318-321)

### Epic 318: Contact Entity & E2EE Profiles

**What**: New `ContactDirectoryDO` (per-hub). E2EE contact profiles with configurable
identifiers (phone, Signal, name/nickname). Blind indexes for contact lookup/dedup.

**Key deliverables**:
- `ContactDirectoryDO` class with storage schema
- Wrangler binding: `CONTACT_DIRECTORY`
- Routes: `GET/POST/PATCH/DELETE /api/contacts`
- Contact profile encryption (3-tier: summary, profile, PII)
- Identifier hash lookup (blind index)
- Contact deduplication detection
- Desktop UI: contact list, profile view, create/edit forms
- BDD scenarios for contact CRUD, search, dedup

**Size estimate**: Large — new DO + encryption model + full CRUD + UI

### Epic 319: Record Entity & Core CRUD

**What**: New `CaseDO` (per-hub). Generic record storage for any entity type.
Record creation/update/close, case numbering, contact linking (M:N with roles).

**Key deliverables**:
- `CaseDO` class with storage schema
- Wrangler binding: `CASE_MANAGER`
- Routes: `GET/POST/PATCH/DELETE /api/records`
- Routes: `POST /api/records/:id/contacts` (link contact)
- Record encryption (3-tier based on entity type definition)
- Case numbering (prefix-year-sequence)
- Contact-record M:N join with role metadata
- Blind index filtering for status, severity, category
- Desktop UI: record list (schema-driven), detail view, create form
- BDD scenarios for record CRUD, linking, filtering

**Size estimate**: Very large — core of the entire system

### Epic 320: Event Entity & Linking

**What**: Event entity type (category: 'event') with time/location, sub-events,
record-event and report-event linking.

**Key deliverables**:
- Event storage in CaseDO (events are records with category='event')
- Sub-event support (parentEventId)
- Record-event M:N linking
- Report-event M:N linking (existing reports → events)
- Event detail encryption (location privacy considerations)
- Desktop UI: event list, detail, linking
- BDD scenarios for event CRUD, linking

**Size estimate**: Medium — builds on record infrastructure

### Epic 321: CMS Permissions & RBAC

**What**: Extend permission system with CMS domains. Entity-type-level access via
`EntityTypeDefinition.accessRoles`. Three-tier envelope strategy enforcement.

**Key deliverables**:
- New permissions in `PERMISSION_CATALOG`
- Entity-type-level access enforcement in routes
- Envelope recipient determination logic (summary/fields/PII tiers)
- Updated default roles with CMS permissions
- Template-suggested role creation
- BDD scenarios for permission enforcement

**Size estimate**: Medium — extends existing patterns

---

## Phase 3: Relationships, Interactions, UI (Epics 322-325, 329)

### Epic 322: Contact Relationships & Support Networks

**What**: Relationship types between contacts (support contact, attorney, family, etc.).
Affinity groups as named contact groups. Contact lists per person.

**Key deliverables**:
- ContactRelationship model and storage
- AffinityGroup model and storage
- Routes: `POST/DELETE /api/contacts/:id/relationships`
- Routes: `GET/POST/PATCH/DELETE /api/contacts/groups`
- Desktop UI: relationship editor, affinity group manager
- BDD scenarios

**Size estimate**: Medium

### Epic 323: Case Interactions & Timeline

**What**: Link existing notes, calls, and conversations to cases as interactions.
Unified chronological timeline view per case.

**Key deliverables**:
- CaseInteraction model (links to existing entities by sourceId)
- Inline interactions (status changes, comments created directly on case)
- Routes: `GET/POST /api/records/:id/interactions`
- Auto-interaction: when a note is created with caseId, create interaction
- Desktop UI: case timeline component
- BDD scenarios

**Size estimate**: Medium

### Epic 324: Report-Record-Event Linking

**What**: Many-to-many linking between existing reports, case records, and events.
Reports can become evidence for cases; cases can be grouped by events.

**Key deliverables**:
- ReportCaseLink and CaseEvent join models
- Routes: `POST/DELETE /api/records/:id/reports`, `/api/records/:id/events`
- Desktop UI: "Link Report" / "Link Event" dialogs on record detail
- BDD scenarios

**Size estimate**: Small — join tables + UI dialogs

### Epic 325: Evidence & Chain of Custody

**What**: File attachments on case records with chain-of-custody metadata,
integrity hashes, and audit trail. Large file support (streaming upload).

**Key deliverables**:
- Evidence metadata model (custody chain, integrity hash, classification)
- Routes: `POST /api/records/:id/evidence`, `GET /api/evidence/:id/custody`
- Custody log entries in audit trail
- Desktop UI: evidence tab on record detail, custody viewer
- BDD scenarios

**Size estimate**: Medium — extends existing file upload system

### Epic 329: Desktop: Schema Editor & Template Browser

**What**: Admin UI for managing entity type definitions, fields, enums, relationships.
Template browser for discovering and applying templates.

**Key deliverables**:
- Entity type editor (add/edit/archive entity types)
- Field editor (drag-and-drop reorder, add/edit fields, conditional logic)
- Enum editor (statuses, severities, categories)
- Relationship type editor
- Template browser (grid of available templates with descriptions)
- Template application wizard
- Template update diff viewer

**Size estimate**: Large — significant UI work

---

## Phase 4: Integration Features (Epics 326-328, 330-332)

### Epic 326: Telephony-CRM: Screen Pop & Auto-Link

**What**: Caller identification via contact hash during incoming calls. Case history
display on ring screen. Auto-link notes to contact/case.

**Key deliverables**:
- Contact hash lookup during call routing
- New Nostr event: `KIND_CONTACT_IDENTIFIED`
- Screen pop component on call ring screen
- Auto-link logic: note → contact → case
- "Link to case" UI when creating notes during calls
- BDD scenarios

**Size estimate**: Medium — integration between telephony and CMS

### Epic 327: Support Contact Notifications

**What**: Send case status updates to support contacts via their preferred messaging
channel (Signal, SMS, WhatsApp). Opt-in notification preferences.

**Key deliverables**:
- Notification trigger on case status change
- Per-contact communication preferences
- Message template system for notifications
- Opt-in/out management
- BDD scenarios

**Size estimate**: Medium — builds on existing messaging infrastructure

### Epic 328: Cross-Hub Case Visibility

**What**: Opt-in sharing of case summaries with super-admins. Cross-hub contact
correlation via blind indexes.

**Key deliverables**:
- Hub setting: `shareWithSuperAdmins: boolean`
- Selective envelope creation for super-admin pubkeys
- Cross-hub contact search (query other hubs' ContactDirectoryDOs)
- Cross-hub case summary view
- BDD scenarios

**Size estimate**: Medium — envelope management + UI

### Epic 330: Desktop: Case Management UI

**What**: Full case management interface — record list with filters, detail view with
schema-driven forms, assignment, status management.

**Key deliverables**:
- Record list page (filterable by entity type, status, severity, assignee)
- Record detail page (schema-driven form rendering)
- Record creation wizard
- Assignment management (assign/unassign volunteers)
- Status change with confirmation
- Bulk operations (assign, close, change status)
- BDD scenarios for all UI flows

**Size estimate**: Very large — primary user interface

### Epic 331: Desktop: Contact Directory

**What**: Contact list, profile viewer, relationship graph visualization, affinity
group management, search.

**Key deliverables**:
- Contact list page (search, filter by type/tag)
- Contact profile page (encrypted profile display)
- Relationship graph visualization
- Affinity group list and detail
- Contact merge tool (dedup)
- BDD scenarios

**Size estimate**: Large

### Epic 332: Desktop: Case Timeline & Evidence Viewer

**What**: Chronological case timeline showing all interactions (notes, calls, messages,
status changes, evidence uploads). Evidence viewer with chain of custody display.

**Key deliverables**:
- Timeline component (ordered list of interactions with type icons)
- Interaction detail modal
- Evidence gallery (files attached to case)
- Chain of custody display per evidence item
- Evidence upload from within case
- BDD scenarios

**Size estimate**: Medium

---

## Implementation Timeline

**Phase 1** (Epics 315-317): ~1 week — schema engine + blind indexes + templates
**Phase 2** (Epics 318-321): ~2 weeks — contacts + records + events + RBAC
**Phase 3** (Epics 322-325, 329): ~2 weeks — relationships + interactions + evidence + schema UI
**Phase 4** (Epics 326-328, 330-332): ~2-3 weeks — telephony integration + cross-hub + full desktop UI

**Total**: ~7-8 weeks, 18 epics

---

## Post-Phase 4: CMS Polish & Extension (Epics 335-343)

| # | Title | Status | Category |
|---|-------|--------|----------|
| 335 | Desktop BDD CMS Test Execution | In Progress | Testing |
| 336 | BDD Serial Execution Fixes | Completed | Testing |
| 337 | Mobile CMS Views + Field Reports | Pending | Mobile |
| 338 | Template Translations | In Progress | i18n |
| 339 | CMS Docs & Operator Guide | Pending | Docs |
| 340 | Volunteer Profiles + Workload | Completed | Desktop UI |
| 341 | Hub Context & Multi-Hub UX | Completed | Desktop UI |
| 342 | Smart Assignment + Report Triage | In Progress | Desktop UI |
| 343 | Template-Defined Report Types | Pending | Infrastructure |

**Epic 343** adds `reportTypes[]` to the template system — templates can define custom report types with fields, statuses, file attachment support, case conversion flags, and mobile-optimization hints. Report types support `allowCaseConversion: true` (enables the triage queue in Epic 342) and audio input on textarea fields (for field workers dictating reports). This is the foundation for Epic 337's mobile report submission and Epic 342's report-to-case conversion.

**Epic 337** updated to include field report submission from mobile (SubmitReport + MyReports views), audio input via platform speech-to-text, media attachments (photos/video), and offline queue for reports.

**Epic 342** expanded to include report-to-case conversion: a generic triage queue for report types with `allowCaseConversion: true`, split-panel triage view, LLM-assisted parsing of freeform text into structured case entries (prompt generated from entity type field definitions), and conversion progress tracking.

## What's NOT in Scope (Future Phases)

- **Activity timelines** (CiviCRM-style required activity schedules) — Phase 2 feature
- **Computed fields** (auto-calculated from other fields) — Phase 2
- **Conditional workflows** (if status=X, require field Y) — Phase 2
- **Custom list views** (saved filter configurations) — Phase 2
- **Report builder** (aggregate analytics across cases) — Phase 2
- **Import/Export** (CSV, CiviCRM migration) — separate epic
- **Print/PDF generation** (case summaries for courts) — separate epic
- **Offline case access** (mobile field work) — separate epic
