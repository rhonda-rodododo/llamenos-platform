# Epic 342: Smart Case Assignment & Report-to-Case Conversion

**Status**: IN PROGRESS
**Priority**: High
**Depends on**: Epic 340 (Volunteer Profiles), Epic 319 (Record Entity), Epic 343 (Template-Defined Report Types), Epic 324 (Report-Record-Event Linking)
**Branch**: `desktop`

## Summary

Two related workflows for high-volume case management, both fully template-driven:

1. **Smart assignment** — suggest volunteers for case assignment based on availability, workload, specialization, and language match.
2. **Report-to-case conversion** — coordinators triage incoming field reports into individual cases, with optional LLM assistance to parse freeform text into structured case data.

Nothing in this epic is specific to legal observers, jail support, or any use case. The report triage queue shows reports whose **template-defined report type** has `allowCaseConversion: true`. The case creation form is driven by the **template-defined entity type**. The assignment suggestions are driven by **template-suggested roles**. The NLG/jail-support workflow is just one configuration of these generic capabilities.

## Implementation

### Part 1: Smart Assignment

1. **Assignment suggestion API** — `GET /api/records/:id/suggest-assignees`
   - Filters: on-shift, not on break, under maxCaseAssignments
   - Scores: specialization match, current workload, language match
   - Returns ranked list of suggested volunteers with scores

2. **Assignment UI enhancement** — the "Assign" dialog shows:
   - Suggested volunteers at top with match reasons ("Spanish speaker, 3/10 cases")
   - All other available volunteers below
   - Workload bar next to each name

3. **Auto-assignment option** — for high-volume scenarios:
   - Toggle: "Auto-assign new cases"
   - Round-robin among available volunteers with capacity
   - Respects specialization preferences

### Part 2: Report Triage & Case Conversion

For **any** report type with `allowCaseConversion: true`, the desktop UI provides a generic triage workflow.

#### Report Triage Queue

Dashboard section: **"Incoming Reports"** — shows reports whose type has `allowCaseConversion: true`:
- Table columns: Report #, Type, Submitter, Time, Status, Cases Created
- Filterable by: status, report type, date range
- Type label and status colors come from the template's report type definition

#### Report Triage View

Split-panel layout, all field rendering driven by template definitions:

**Left panel: Report Content (read-only)**
- Report metadata fields rendered from the report type's field definitions
- The freeform text field (the primary content for most field report types)
- Media attachments (photos, video) — viewable/expandable

**Right panel: Case Creation**
- "Create Case" button → opens the case creation form rendered from the **target entity type's** field definitions
- Pre-fills overlapping fields from the report (location, time, etc. — matched by field name)
- On save: case is created AND automatically linked to this report via `ReportCaseLink` (Epic 324)

**Bottom panel: Cases Created**
- List of cases already created from this report
- Shows conversion progress

#### LLM-Assisted Parsing (Optional)

"Parse Report" button — **template-driven, not hardcoded**:

1. Sends the freeform text to an on-device or configured LLM
2. The extraction prompt is **generated from the target entity type's field definitions**:
   ```
   "Extract each person/entity mentioned. For each, extract:
   [field names and types from entity type definition]"
   ```
3. LLM returns suggestions as pre-filled case creation forms
4. Coordinator reviews, edits, confirms each
5. **Privacy**: Processed locally (WASM LLM) or org-configured endpoint. E2EE text never touches Llamenos servers.

This works for ANY template — the prompt adapts to whatever entity type the cases will be created as.

#### Conversion Tracking

Report metadata extensions:
- `conversionStatus: 'pending' | 'in_progress' | 'completed'`
- `casesCreated: string[]` — IDs of cases created from this report
- API: `PATCH /api/reports/:id/conversion-status`, `GET /api/reports/:id/cases`

## Acceptance Criteria

### Smart Assignment
- [ ] Assignment dialog shows suggested volunteers with match reasons
- [ ] Suggestions consider: availability, workload, specialization, language
- [ ] Auto-assignment distributes evenly among available volunteers
- [ ] Workload visible in assignment UI (X/Y cases)

### Report-to-Case Conversion
- [ ] Reports with `allowCaseConversion: true` appear in the triage queue (any template)
- [ ] Coordinator can create cases from the triage view
- [ ] Case creation form is rendered from the target entity type's field definitions
- [ ] Created cases are automatically linked to the source report
- [ ] Report tracks how many cases have been created from it
- [ ] LLM parsing prompt is generated from entity type definitions (not hardcoded)
- [ ] Manual case creation always works regardless of LLM availability
- [ ] Permission-gated: `reports:read-all` + `cases:create`
