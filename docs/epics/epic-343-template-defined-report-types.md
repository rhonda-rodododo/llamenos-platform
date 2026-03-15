# Epic 343: Template-Defined Report Types

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 317 (Template System), Epic 324 (Report-Record-Event Linking)
**Blocks**: Epic 337 (Mobile CMS Views — LO field reports), Epic 342 (report-to-case conversion)
**Branch**: `desktop`

## Summary

Extend the template system to support `reportTypes[]` — custom report schemas defined in template JSON, alongside the existing `entityTypes[]`. Report types define fields, statuses, file attachment support, and mobile-optimization hints. This enables templates like `jail-support` to ship with `lo_arrest_report` and `lo_misconduct_report` as first-class report types that the system renders dynamically, just like it renders case forms from entity type definitions.

## Problem Statement

The existing report system (`RecordsDO` / `ConversationDO`) handles generic reports with freeform notes. But different use cases need **structured report types with template-defined fields**:

- **NLG Legal Observers** need two report types:
  1. **Arrest reports** — a single freeform textarea where the LO lists all arrestee names and details (LOs are in the field, no time for structured per-person forms). Supports photo/video attachments. Jail support volunteers later create individual cases from this report.
  2. **Misconduct reports** — police abuse documentation with badge numbers, force types, and evidence media for lawsuits.

- **ICE Rapid Response** needs sighting reports with operation type, agent count, vehicle descriptions.
- **Copwatch** needs field observation reports with badge numbers, force type, evidence.

These report types should be **template-driven** — same architecture as entity types. The mobile app reads the report type definition and renders the appropriate form. The desktop app shows incoming reports in a queue for triage.

## Key Design Decisions

### Report Types Live in Templates

```json
{
  "id": "jail-support",
  "entityTypes": [...],
  "reportTypes": [
    {
      "name": "lo_arrest_report",
      "label": "lo_arrest_report.label",
      "category": "report",
      "allowFileAttachments": true,
      "allowCaseConversion": true,
      "mobileOptimized": true,
      "fields": [
        { "name": "location", "type": "text", "required": true },
        { "name": "arrestee_details", "type": "textarea", "required": true },
        ...
      ]
    }
  ]
}
```

### `allowCaseConversion` Flag

When `true`, reports of this type appear in a "Report Triage" queue on the desktop. The jail support coordinator can read the freeform arrestee details and create individual cases, automatically linking each case back to the source report via Epic 324's `ReportCaseLink`.

### `mobileOptimized` Flag

When `true`, this report type appears prominently in the mobile app's "Submit Report" action. The mobile form is stripped to essential fields only — location, time, the big textarea, and a media attach button.

### Audio Input on Textarea Fields

Textarea fields on report types should support **audio input** — the LO taps a microphone button and dictates their report. On mobile this uses the platform's native speech-to-text (iOS Speech framework / Android SpeechRecognizer). On desktop this uses the existing WASM Whisper infrastructure (already in the codebase for call transcription). The audio is transcribed client-side and appended to the textarea. Audio never leaves the device — same privacy model as call transcription.

This is especially important for LOs who may be running, in a crowd, or unable to type. A `supportAudioInput: true` flag on textarea field definitions enables this. Templates control which fields support audio.

### Reports Are NOT Records

Reports remain in the existing report system (conversations with `metadata.type='report'`). They are NOT records in `CaseDO`. The link between reports and cases is the M:N `ReportCaseLink` from Epic 324. This keeps the architecture clean — reports flow in from the field, cases are created by coordinators.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: ReportTypeDefinition Schema

**File**: `apps/worker/schemas/report-types.ts` (new)

```typescript
import { z } from 'zod'
import { entityFieldDefinitionSchema } from './entity-types'

export const reportTypeDefinitionSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  labelPlural: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: z.literal('report'),
  numberPrefix: z.string().max(4).optional(),
  numberingEnabled: z.boolean().default(true),

  allowFileAttachments: z.boolean().default(true),
  allowCaseConversion: z.boolean().default(false),
  mobileOptimized: z.boolean().default(false),

  statuses: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().optional(),
    order: z.number(),
    isClosed: z.boolean().optional(),
  })).min(1),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()).default([]),

  fields: z.array(entityFieldDefinitionSchema).default([]),
})

export type ReportTypeDefinition = z.infer<typeof reportTypeDefinitionSchema>
```

#### Task 2: Extend SettingsDO for Report Types

**File**: `apps/worker/durable-objects/settings-do.ts` (extend)

Add CRUD for report type definitions, mirroring the entity type pattern:

```
Storage keys:
  reporttype:{id}  -> ReportTypeDefinition
```

New DORouter handlers:
- `GET /report-types` — list all report types
- `GET /report-types/:id` — get one
- `POST /report-types` — create
- `PATCH /report-types/:id` — update
- `DELETE /report-types/:id` — archive (soft delete)

#### Task 3: Extend Template Application

**File**: `apps/worker/routes/settings.ts` (extend template apply handler)

When applying a template that includes `reportTypes[]`, create the report type definitions in SettingsDO alongside entity types. Template composition merges report types the same way it merges entity types.

#### Task 4: API Routes

**File**: `apps/worker/routes/settings.ts` (extend)

```
GET    /api/settings/cms/report-types
GET    /api/settings/cms/report-types/:id
POST   /api/settings/cms/report-types
PATCH  /api/settings/cms/report-types/:id
DELETE /api/settings/cms/report-types/:id
```

Permission: `cases:manage-types` (same as entity types — they're both schema definitions).

#### Task 5: Report Creation with Type

Extend the existing report creation flow to accept a `reportTypeId`. When present:
- Validate submitted fields against the report type's field definitions
- Store the report type ID in report metadata
- Apply the report type's default status

**File**: `apps/worker/routes/reports.ts` (extend)

#### Task 6: i18n Strings

Add report type management strings to all 13 locales.

#### Task 7: BDD Feature File

**File**: `packages/test-specs/features/core/template-report-types.feature`

```gherkin
@backend
Feature: Template-Defined Report Types
  Templates can define custom report types with fields, statuses,
  and configuration. Reports submitted against a type are validated
  against the type's schema.

  Background:
    Given a registered admin "admin1"
    And case management is enabled

  @cms @templates
  Scenario: Apply template with report types
    When admin "admin1" applies the "jail-support" template
    Then report type "lo_arrest_report" should be created
    And report type "lo_misconduct_report" should be created
    And report type "lo_arrest_report" should have "allowCaseConversion" enabled
    And report type "lo_arrest_report" should have "mobileOptimized" enabled

  @cms @reports
  Scenario: Create report with template-defined type
    Given report type "lo_arrest_report" exists
    When a legal observer submits a report of type "lo_arrest_report" with fields:
      | location  | Broadway & 4th St |
      | time      | 2:30 PM           |
      | arrestee_details | Maria Garcia - red jacket\nJohn Doe - glasses, needs insulin |
    Then the report should be created with status "submitted"
    And the report should have type "lo_arrest_report"

  @cms @reports
  Scenario: Report type validation rejects missing required fields
    Given report type "lo_arrest_report" exists
    When a legal observer submits a report of type "lo_arrest_report" without "location"
    Then the response status should be 400

  @cms @reports
  Scenario: List report types
    Given report types "lo_arrest_report" and "lo_misconduct_report" exist
    When admin "admin1" lists report types
    Then 2 report types should be returned

  @cms @reports
  Scenario: Report with file attachments
    Given report type "lo_arrest_report" with allowFileAttachments enabled
    When a legal observer submits a report with 3 photo attachments
    Then the report should have 3 file attachments

  @cms @reports
  Scenario: Report type CRUD operations
    When admin "admin1" creates a custom report type "incident_report"
    Then the report type should be retrievable
    When admin "admin1" updates the report type label
    Then the update should be reflected
    When admin "admin1" archives the report type
    Then the report type should be marked as archived
```

### Phase 2: Desktop UI

#### Desktop Schema Editor Extension

Extend Epic 329's schema editor (already completed) to also manage report types:
- Report type list in the CMS settings
- Report type field editor (same component as entity type field editor)
- Report type preview

#### Report Queue Component

New component: incoming reports dashboard filtered by report type. Shows submitted reports awaiting triage. Jail support coordinators see LO arrest reports here with a "Create Cases" action.

### Phase 3: Integration Gate

`bun run test:backend:bdd` + `bun run test:all`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/report-types.ts` | ReportTypeDefinition Zod schema |
| `packages/test-specs/features/core/template-report-types.feature` | BDD scenarios |
| `tests/steps/backend/template-report-types.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/settings-do.ts` | Report type CRUD storage and handlers |
| `apps/worker/routes/settings.ts` | Report type API routes, template apply extension |
| `apps/worker/routes/reports.ts` | Accept reportTypeId, validate against type schema |
| `packages/protocol/tools/schema-registry.ts` | Register ReportTypeDefinition schema |
| `packages/i18n/locales/en.json` | Report type management strings |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Acceptance Criteria & Test Scenarios

- [ ] Templates can define `reportTypes[]` alongside `entityTypes[]`
  -> `template-report-types.feature: "Apply template with report types"`
- [ ] Report types are stored and retrievable via API
  -> `template-report-types.feature: "Report type CRUD operations"`
- [ ] Reports can be created against a specific report type
  -> `template-report-types.feature: "Create report with template-defined type"`
- [ ] Required field validation enforced for typed reports
  -> `template-report-types.feature: "Report type validation rejects missing required fields"`
- [ ] File attachments work on typed reports
  -> `template-report-types.feature: "Report with file attachments"`
- [ ] Template application creates report types
  -> `template-report-types.feature: "Apply template with report types"`
- [ ] Desktop schema editor can manage report types
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated
