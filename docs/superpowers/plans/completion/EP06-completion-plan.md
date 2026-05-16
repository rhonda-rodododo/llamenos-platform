# EP06 — CMS/CRM — Unified Entity System — Completion Plan

## Scope

### Already Done (~75%)
- Records API full CRUD (1200+ lines)
- Records service, Contacts v2 API, Contacts service
- Records schema, Contacts schema
- Entity type configuration routes
- Cross-hub queries with `cases:read-cross-hub` permission
- Contact merge dialog, contact import dialog, contacts directory
- Contact CRUD (create, edit, profile, card)
- Relationship write panel
- Case/record management (create, detail, timeline, card)
- Schema-driven forms
- Smart assignment dialog
- Triage case creation panel
- Evidence management (detail dialog, tab, upload dialog)
- Entity type filtering
- Contact notification dialog
- BDD: `cms-advanced.feature` (9 scenarios passing), `cms-events.feature` (5 @wip), `cms-contacts.feature` (2 @wip)

### Remaining Work
- Events API not yet deprecated (still operational with migration endpoints)
- Evidence custody chain audit trail (who accessed/modified evidence and when)
- Cases "Related" tab (placeholder instead of real linked-record functionality)
- Entity type template management UI
- Custom report display types (table/calendar/timeline) not confirmed
- 7 @wip BDD scenarios
- iOS entity type admin screen missing
- iOS triage + assignment UI missing
- Android entity type admin screen missing
- Android triage + assignment UI missing

## Tasks (ordered by dependency)

### Task 1: Deprecate events API
- **Platform**: backend
- **Files**:
  - `apps/worker/routes/events.ts` — add deprecation headers, redirect to records
  - `apps/worker/routes/` — route mounting
- **What**: Add `Deprecation` and `Sunset` HTTP headers to all `/api/events/*` endpoints. Add a redirect/alias layer so event operations transparently route to the records API with `category: "event"` entity type filter. Remove the migration endpoints (`/admin/events/migration-status`, `/admin/events/migrate`) after confirming all events are accessible as records. Update any remaining event-specific queries to use the records model.
- **Spec reference**: Phase A1 — Entity System Unification, Gap 5
- **Acceptance**: Events accessible via records API; `/api/events/*` returns deprecation headers; migration endpoints removed

### Task 2: Cases "Related" tab — implement linked records
- **Platform**: desktop
- **Files**:
  - `src/client/routes/cases.tsx` — replace `RelatedPlaceholder()` at lines 1177-1185
- **What**: Replace the placeholder with a working "Related" tab that shows: (1) parent/child record hierarchy (`parentRecordId` relationships), (2) linked contacts associated with this record, (3) related records that share contacts or tags. Query the records API with appropriate filters. Show each related item as a clickable card with type badge, title, status, and last updated.
- **Spec reference**: Gap 12 (Cross-hub visibility), EP06 A4 spec
- **Acceptance**: Related tab shows actual linked records; navigation to related items works; no placeholder text

### Task 3: Evidence custody chain audit trail
- **Platform**: backend + desktop
- **Files**:
  - `apps/worker/routes/records.ts` — add evidence access logging
  - `src/client/components/evidence-detail-dialog.tsx` — add custody chain display
  - `apps/worker/db/schema/` — evidence access log table if needed
- **What**: Track who accessed, uploaded, modified, or downloaded evidence and when. Create an `evidence_access_log` table (recordId, evidenceId, actorPubkey, action, timestamp). Log access on evidence view, upload, and modification. Display the custody chain in the evidence detail dialog as a timeline. This is critical for legal proceedings.
- **Spec reference**: Gap 6 (Evidence custody chain UI), EP06 A4 spec
- **Acceptance**: Evidence access creates audit entries; custody chain timeline visible in evidence detail; tamper-evident via hash chain

### Task 4: Entity type template management UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/` — entity type template management
  - `src/client/routes/admin/` — entity type admin
- **What**: Build UI for managing entity type templates. Admin can: view available templates (shipped preconfigured types), create new entity types from templates, customize fields and display configuration. Templates define default fields (e.g., event template includes date and location fields). Uses the existing entity type configuration backend routes.
- **Spec reference**: Gap NEW (Entity type templates), Phase A2
- **Acceptance**: Template list renders; creating entity type from template works; field customization saves

### Task 5: Fix @wip BDD scenarios
- **Platform**: backend
- **Files**:
  - `packages/test-specs/features/platform/desktop/cases/cms-events.feature` — 5 @wip (event-case linking)
  - `packages/test-specs/features/platform/desktop/cases/cms-contacts.feature` — 2 @wip (contact relationships)
  - Related step definitions
- **What**: Fix the 5 event-case linking scenarios (likely need to use records API instead of deprecated events API) and 2 contact relationship scenarios. These may require updating step definitions to work with the unified entity system. Remove @wip tags.
- **Spec reference**: BDD test plan
- **Acceptance**: All 7 scenarios pass; @wip removed

### Task 6: iOS entity type admin screen
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Admin/EntityTypeConfigView.swift` (new)
  - `apps/ios/Sources/Views/Admin/EntityFieldEditorView.swift` (new)
  - `apps/ios/Sources/Services/EntityTypeService.swift` (new)
- **What**: SwiftUI admin screen for managing entity types (cases, events, incidents, etc.). List entity types with field counts. Tap to view/edit: field list, display configuration, template source. Field editor for adding/removing/reordering fields. Gated by admin permissions. Uses codegen'd types from protocol.
- **Spec reference**: Gap NEW (Mobile entity type admin), Phase A2
- **Acceptance**: Entity type CRUD works on iOS; field editing functional; permission-gated

### Task 7: iOS triage + assignment UI
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Cases/TriageView.swift` (new)
  - `apps/ios/Sources/Views/Cases/AssignmentView.swift` (new)
- **What**: SwiftUI triage view showing incoming/unassigned cases with priority indicators. Assignment view with smart assignment suggestions (based on availability, workload, skills). Both views use existing backend APIs. Navigation from case list to triage, and from triage to assignment.
- **Spec reference**: Gap NEW (Mobile triage + assignment), Phase A3
- **Acceptance**: Triage view shows unassigned cases; assignment suggestions render; assignment workflow works

### Task 8: Android entity type admin screen
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/admin/EntityTypeConfigScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/admin/EntityFieldEditorScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/EntityTypeRepository.kt` (new)
- **What**: Material 3 Compose entity type admin. Same functionality as iOS: list types, edit fields, manage display config. Hilt-injected ViewModel + Repository. Permission-gated.
- **Spec reference**: Gap NEW (Mobile entity type admin), Phase A2
- **Acceptance**: Entity type CRUD works on Android; Material 3 design

### Task 9: Android triage + assignment UI
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/cases/TriageScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/cases/AssignmentScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/cases/TriageViewModel.kt` (new)
- **What**: Material 3 triage and assignment screens mirroring iOS functionality.
- **Spec reference**: Gap NEW (Mobile triage + assignment), Phase A3
- **Acceptance**: Triage and assignment work on Android
