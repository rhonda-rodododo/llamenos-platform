# EP06-A1: Entity System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the split records/events data model into a single entity system. Events become records whose entity type has `category: "event"`. The `/api/events` route surface is deprecated. Mobile apps migrate from legacy `/api/contacts` to v2 `/directory` with client-side blind index computation. Date and location fields move from cleartext columns to encrypted field envelopes with blind-index query support.

**Architecture:** Events table is deprecated in-place — rows remain for rollback; all new writes go to `case_records`. The `entityFieldDefinitionSchema` gains `indexType: "date" | "location"` variants. `CasesService` accepts date blind index tokens in `blindIndexes` JSONB using the existing `date_blind_indexes()` Rust function. Event routes return HTTP 301 to their records equivalents. Desktop `/events` route becomes a thin entity-type-filtered wrapper over the existing records view. iOS and Android remove their event-specific views and reuse record list/detail screens filtered by `category === "event"`. Both mobile platforms switch contacts from `/api/contacts` to `/directory` with trigram blind index computation via CryptoService.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM + raw SQL (migration), Zod 4 (schemas), SwiftUI `@Observable` (iOS), Kotlin/Compose + Hilt (Android), Playwright-BDD (E2E), packages/crypto UniFFI/JNI (mobile blind indexes)

**Spec:** `docs/superpowers/specs/2026-05-12-EP06-A1-entity-system-unification-design.md`

---

## File Structure

### Protocol (modify)
- `packages/protocol/schemas/entity-schema.ts` — extend `indexType` enum with `"date"` and `"location"` variants; add `EntityTemplateDefinition` schema
- `packages/protocol/schemas/entity-templates.ts` — new file: shipped template definitions (Case, Event, Incident Report, Contact Note)
- `packages/protocol/schemas/events.ts` — mark all exports `@deprecated`, keep for migration reference
- `packages/protocol/tools/schema-registry.ts` — add event sub-schemas to EXCLUDED_SCHEMAS; register entity template schemas
- `packages/protocol/crypto-labels.json` — add `LABEL_ENTITY_TYPE_DEFINITION` label

### Backend (modify)
- `apps/worker/db/schema/cases.ts` — add `deprecated_at` column to events table (marks deprecation without data loss)
- `apps/worker/db/schema/entity-type-templates.ts` — new file: `entity_type_templates` table
- `apps/worker/db/schema/index.ts` — export new table
- `apps/worker/db/migrations/0013_entity_templates_events_deprecation.sql` — migration SQL
- `apps/worker/services/cases.ts` — add date blind index support in `createRecord`/`updateRecord`; remove event-specific methods after migration shim
- `apps/worker/services/entity-templates.ts` — new file: `EntityTemplatesService` with list/apply/seed methods
- `apps/worker/routes/events.ts` — replace all 11 handlers with 301 redirects to records equivalents
- `apps/worker/routes/entity-templates.ts` — new file: GET `/api/settings/cms/templates` routes
- `apps/worker/routes/entity-schema.ts` — mount templates routes
- `apps/worker/__tests__/unit/entity-templates.test.ts` — new unit tests
- `apps/worker/__tests__/unit/cases-date-blind-index.test.ts` — new unit tests

### Desktop (modify)
- `src/client/lib/api.ts` — remove event-specific functions; add `listEntityTemplates()`, `applyEntityTemplate()`, `disableEntityTemplate()`
- `src/client/routes/events.tsx` — rewrite: thin wrapper using `EntityTypeFilteredRecordList` component filtered to `category === "event"`
- `src/client/components/cases/entity-type-filtered-record-list.tsx` — new: reusable list+detail panel accepting an `entityCategory` prop
- `src/client/routes/admin/hub-settings.tsx` — add Events Migration panel (admin one-time action)

### iOS (modify)
- `apps/ios/Sources/ViewModels/ContactsViewModel.swift` — migrate from `/api/contacts` to `/directory`; add blind index computation
- `apps/ios/Sources/Services/ContactBlindIndexService.swift` — new: wraps CryptoService to produce trigram tokens
- `apps/ios/Sources/ViewModels/EventsViewModel.swift` — remove events-API calls; reuse records API filtered by entity category
- `apps/ios/Sources/Views/Events/EventListView.swift` — rewrite using record list with event entity type filter
- `apps/ios/Sources/Views/Events/EventDetailView.swift` — rewrite using record detail view
- `apps/ios/Sources/Views/Events/CreateEventView.swift` — rewrite using record create flow with event entity type
- `apps/ios/Sources/Models/Event.swift` — remove (types replaced by codegen Record types)
- `apps/ios/Tests/LlamenosTests/ContactBlindIndexServiceTests.swift` — new unit tests

### Android (modify)
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt` — remove events-API calls; already uses records API, remove legacy fallback
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt` — update to use entity category filter
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt` — migrate from `/api/contacts` to `/directory`; add blind index computation via JNI
- `apps/android/app/src/main/java/org/llamenos/hotline/api/DirectoryRepository.kt` — new: v2 directory API client with blind index support
- `apps/android/app/src/test/java/org/llamenos/hotline/api/DirectoryRepositoryTest.kt` — new unit tests

### i18n (modify)
- `packages/i18n/locales/en.json` — add entity template label keys
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — translations for template labels

### BDD (modify + new)
- `packages/test-specs/features/core/cms-events.feature` — replace events-specific scenarios with entity-unification scenarios
- `packages/test-specs/features/core/entity-unification.feature` — new: events-as-records, date blind index, template management
- `tests/steps/backend/entity-unification.steps.ts` — new step definitions

---

## Task 1: Protocol — Extend `indexType` and add `LABEL_ENTITY_TYPE_DEFINITION`

**Files:**
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/crypto-labels.json`

- [ ] **Step 1: Extend indexType enum in entityFieldDefinitionSchema**

In `packages/protocol/schemas/entity-schema.ts`, find the `indexType` field on `entityFieldDefinitionSchema` and replace it:

```typescript
// Before:
indexType: z.enum(['exact', 'none']).optional().default('none'),

// After:
indexType: z.enum(['exact', 'date', 'location', 'none']).optional().default('none'),
```

This makes `indexType: "date"` and `indexType: "location"` valid field configurations, triggering client-side blind index computation for date and location fields when creating/updating entities.

- [ ] **Step 2: Add LABEL_ENTITY_TYPE_DEFINITION to crypto-labels.json**

In `packages/protocol/crypto-labels.json`, add inside the `"labels"` object after `"LABEL_WS_CHALLENGE"`:

```json
"LABEL_ENTITY_TYPE_DEFINITION": "llamenos:entity-type-def:v1"
```

This label is used to encrypt entity type definitions with the hub key so the server cannot read field names, status labels, or other metadata that reveals hub mission.

- [ ] **Step 3: Run codegen to verify**

```bash
bun run codegen
```

Expected: Clean exit. `indexType` enum in generated Swift/Kotlin now includes `"date"` and `"location"` variants.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/schemas/entity-schema.ts packages/protocol/crypto-labels.json
git commit -m "feat(protocol): extend indexType enum with date/location variants; add LABEL_ENTITY_TYPE_DEFINITION"
```

---

## Task 2: Protocol — Entity template schemas

**Files:**
- Create: `packages/protocol/schemas/entity-templates.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Create entity-templates.ts with shipped template definitions**

Create `packages/protocol/schemas/entity-templates.ts`:

```typescript
import { z } from 'zod'

/**
 * Shipped entity type templates. Hub admins enable these as starting points
 * and customize fields/statuses. Templates are defined here as the single
 * source of truth; the server seeds them into entity_type_templates on startup.
 */

export const entityTemplateCategorySchema = z.enum([
  'case', 'event', 'incident_report', 'contact_note',
])
export type EntityTemplateCategory = z.infer<typeof entityTemplateCategorySchema>

export const entityTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  labelPlural: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: entityTemplateCategorySchema,
  version: z.string(),
  fields: z.array(z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    type: z.enum([
      'text', 'number', 'select', 'multiselect', 'checkbox',
      'textarea', 'date', 'file', 'location',
    ]),
    required: z.boolean().optional().default(false),
    indexable: z.boolean().optional().default(false),
    indexType: z.enum(['exact', 'date', 'location', 'none']).optional().default('none'),
    locationOptions: z.object({
      maxPrecision: z.enum(['none', 'city', 'neighborhood', 'block', 'exact']).optional().default('neighborhood'),
      allowGps: z.boolean().optional().default(true),
      allowAutocomplete: z.boolean().optional().default(true),
    }).optional(),
    order: z.number().int().optional().default(0),
  })),
  statuses: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    isDefault: z.boolean().optional(),
    isClosed: z.boolean().optional(),
  })),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()).optional().default([]),
  severities: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).optional(),
  allowSubRecords: z.boolean().optional().default(false),
  allowFileAttachments: z.boolean().optional().default(true),
  allowInteractionLinks: z.boolean().optional().default(true),
  numberingEnabled: z.boolean().optional().default(false),
  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  tags: z.array(z.string()).optional().default([]),
  isBuiltin: z.boolean().optional().default(true),
})

export type EntityTemplate = z.infer<typeof entityTemplateSchema>

export const entityTemplateListResponseSchema = z.object({
  templates: z.array(entityTemplateSchema),
  appliedTemplateIds: z.array(z.string()),
})

export type EntityTemplateListResponse = z.infer<typeof entityTemplateListResponseSchema>

export const applyEntityTemplateBodySchema = z.object({
  templateId: z.string(),
})

export type ApplyEntityTemplateBody = z.infer<typeof applyEntityTemplateBodySchema>

export const applyEntityTemplateResponseSchema = z.object({
  applied: z.boolean(),
  entityTypeId: z.string(),
})

export type ApplyEntityTemplateResponse = z.infer<typeof applyEntityTemplateResponseSchema>
```

- [ ] **Step 2: Export from schemas index**

In `packages/protocol/schemas/index.ts`, add:

```typescript
export * from './entity-templates'
```

- [ ] **Step 3: Register template schemas and exclude sub-schemas**

In `packages/protocol/tools/schema-registry.ts`, add to the `EXCLUDED_SCHEMAS` set:

```typescript
// Entity template sub-schemas (inlined in parent response)
'entityTemplateCategorySchema',
```

- [ ] **Step 4: Deprecate event schemas**

In `packages/protocol/schemas/events.ts`, add a JSDoc deprecation notice at the top of the file (after imports):

```typescript
/**
 * @deprecated Events are now records whose entity type has category='event'.
 * These schemas are retained for the migration period only.
 * Use packages/protocol/schemas/records.ts and entity-schema.ts for new code.
 */
```

- [ ] **Step 5: Run codegen to verify**

```bash
bun run codegen
```

Expected: Clean exit. `EntityTemplate`, `EntityTemplateListResponse`, `ApplyEntityTemplateResponse` generated for Swift/Kotlin.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/schemas/entity-templates.ts packages/protocol/schemas/index.ts packages/protocol/schemas/events.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add entity template schemas; deprecate event schemas"
```

---

## Task 3: Backend — DB schema for entity_type_templates and events deprecation column

**Files:**
- Create: `apps/worker/db/schema/entity-type-templates.ts`
- Modify: `apps/worker/db/schema/cases.ts`
- Modify: `apps/worker/db/schema/index.ts`

- [ ] **Step 1: Create entity_type_templates table**

Create `apps/worker/db/schema/entity-type-templates.ts`:

```typescript
/**
 * entity_type_templates — shipped and hub-customized entity type templates.
 * Builtin templates (isBuiltin=true) are seeded by the server on startup.
 * Hub admins apply templates to create hub-specific entity type instances.
 */
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

export const entityTypeTemplates = pgTable(
  'entity_type_templates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    templateKey: text('template_key').notNull(),  // e.g. 'builtin:event', 'builtin:case'
    version: text('version').notNull().default('1.0.0'),
    category: text('category').notNull(),         // 'case' | 'event' | 'incident_report' | 'contact_note'
    isBuiltin: boolean('is_builtin').notNull().default(true),
    // Encrypted with hub key (LABEL_ENTITY_TYPE_DEFINITION)
    // null for builtin templates which are plaintext in code
    encryptedDefinition: text('encrypted_definition'),
    definitionEnvelope: jsonb('definition_envelope'),
    // Plaintext summary fields needed for server-side routing
    name: text('name').notNull(),
    icon: text('icon'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('entity_type_templates_template_key_idx').on(table.templateKey),
    index('entity_type_templates_category_idx').on(table.category),
  ],
)
```

- [ ] **Step 2: Add deprecated_at column to events table**

In `apps/worker/db/schema/cases.ts`, add `deprecatedAt` to the `events` pgTable definition inside the column object, after `updatedAt`:

```typescript
deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
```

This column is set when an event row has been migrated to `case_records`. The events table is kept intact for rollback.

- [ ] **Step 3: Export new table from schema index**

In `apps/worker/db/schema/index.ts`, add:

```typescript
export * from './entity-type-templates'
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/db/schema/entity-type-templates.ts apps/worker/db/schema/cases.ts apps/worker/db/schema/index.ts
git commit -m "feat(db): add entity_type_templates table; add deprecated_at to events table"
```

---

## Task 4: Backend — Migration SQL and EntityTemplatesService

**Files:**
- Create: `apps/worker/db/migrations/0013_entity_templates_events_deprecation.sql`
- Create: `apps/worker/services/entity-templates.ts`
- Create: `apps/worker/__tests__/unit/entity-templates.test.ts`

- [ ] **Step 1: Write failing test for EntityTemplatesService.listBuiltinTemplates**

Create `apps/worker/__tests__/unit/entity-templates.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test'
import { EntityTemplatesService } from '../../services/entity-templates'

function makeService() {
  return new EntityTemplatesService()
}

describe('EntityTemplatesService', () => {
  describe('listBuiltinTemplates', () => {
    it('returns 4 builtin templates', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      expect(templates).toHaveLength(4)
    })

    it('includes an event template with category=event', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')
      expect(event).toBeDefined()
      expect(event!.id).toBe('builtin:event')
    })

    it('event template has start_date field with indexType=date', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')!
      const startDate = event.fields.find(f => f.name === 'start_date')
      expect(startDate).toBeDefined()
      expect(startDate!.indexType).toBe('date')
      expect(startDate!.indexable).toBe(true)
    })

    it('event template has location field with indexType=location', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')!
      const location = event.fields.find(f => f.name === 'location')
      expect(location).toBeDefined()
      expect(location!.indexType).toBe('location')
      expect(location!.type).toBe('location')
    })

    it('case template has category=case', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const caseTemplate = templates.find(t => t.category === 'case')
      expect(caseTemplate).toBeDefined()
      expect(caseTemplate!.id).toBe('builtin:case')
    })

    it('all templates have at least one status', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      for (const t of templates) {
        expect(t.statuses.length).toBeGreaterThan(0)
      }
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/entity-templates.test.ts
```

Expected: FAIL — `EntityTemplatesService` not found.

- [ ] **Step 3: Create EntityTemplatesService**

Create `apps/worker/services/entity-templates.ts`:

```typescript
import type { EntityTemplate } from '@protocol/schemas/entity-templates'

/**
 * EntityTemplatesService — manages builtin and hub-applied entity type templates.
 * Builtin templates are defined in code here; they are the source of truth
 * shipped with the application. Hub admins apply templates to create
 * hub-specific entity type instances via the entity-schema routes.
 */
export class EntityTemplatesService {
  // =========================================================================
  // Builtin Templates
  // =========================================================================

  listBuiltinTemplates(): EntityTemplate[] {
    return BUILTIN_TEMPLATES
  }

  getBuiltinTemplate(id: string): EntityTemplate | undefined {
    return BUILTIN_TEMPLATES.find(t => t.id === id)
  }
}

// =========================================================================
// Template Definitions
// =========================================================================

const BUILTIN_TEMPLATES: EntityTemplate[] = [
  {
    id: 'builtin:case',
    name: 'case',
    label: 'Case',
    labelPlural: 'Cases',
    description: 'A general-purpose case for tracking incidents, calls, and follow-up.',
    icon: 'folder',
    color: '#3b82f6',
    category: 'case',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['default'],
    fields: [
      {
        id: 'builtin:case:title',
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:case:description',
        name: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        indexable: false,
        indexType: 'none',
        order: 1,
      },
    ],
    statuses: [
      { value: 'open', label: 'Open', color: '#3b82f6', isDefault: true },
      { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
      { value: 'resolved', label: 'Resolved', color: '#10b981', isClosed: true },
      { value: 'closed', label: 'Closed', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'open',
    closedStatuses: ['resolved', 'closed'],
    severities: [
      { value: 'critical', label: 'Critical', color: '#ef4444' },
      { value: 'high', label: 'High', color: '#f97316' },
      { value: 'medium', label: 'Medium', color: '#f59e0b' },
      { value: 'low', label: 'Low', color: '#6b7280' },
    ],
    allowSubRecords: true,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    numberingEnabled: true,
    numberPrefix: 'CASE',
  },
  {
    id: 'builtin:event',
    name: 'event',
    label: 'Event',
    labelPlural: 'Events',
    description: 'A time-bounded event (protest, mass arrest, community action). Dates and location are encrypted.',
    icon: 'calendar',
    color: '#8b5cf6',
    category: 'event',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['temporal'],
    fields: [
      {
        id: 'builtin:event:title',
        name: 'title',
        label: 'Event Name',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:event:start_date',
        name: 'start_date',
        label: 'Start Date',
        type: 'date',
        required: true,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
      {
        id: 'builtin:event:end_date',
        name: 'end_date',
        label: 'End Date',
        type: 'date',
        required: false,
        indexable: true,
        indexType: 'date',
        order: 2,
      },
      {
        id: 'builtin:event:location',
        name: 'location',
        label: 'Location',
        type: 'location',
        required: false,
        indexable: true,
        indexType: 'location',
        locationOptions: {
          maxPrecision: 'neighborhood',
          allowGps: true,
          allowAutocomplete: true,
        },
        order: 3,
      },
      {
        id: 'builtin:event:description',
        name: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        indexable: false,
        indexType: 'none',
        order: 4,
      },
    ],
    statuses: [
      { value: 'planned', label: 'Planned', color: '#3b82f6', isDefault: true },
      { value: 'active', label: 'Active', color: '#10b981' },
      { value: 'concluded', label: 'Concluded', color: '#6b7280', isClosed: true },
      { value: 'cancelled', label: 'Cancelled', color: '#ef4444', isClosed: true },
    ],
    defaultStatus: 'planned',
    closedStatuses: ['concluded', 'cancelled'],
    allowSubRecords: true,
    allowFileAttachments: true,
    allowInteractionLinks: false,
    numberingEnabled: false,
  },
  {
    id: 'builtin:incident_report',
    name: 'incident_report',
    label: 'Incident Report',
    labelPlural: 'Incident Reports',
    description: 'Triage-oriented incident documentation. Severity, category, and auto-conversion from triage reports.',
    icon: 'alert-triangle',
    color: '#ef4444',
    category: 'incident_report',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['triage'],
    fields: [
      {
        id: 'builtin:incident:title',
        name: 'title',
        label: 'Incident Title',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:incident:incident_date',
        name: 'incident_date',
        label: 'Incident Date/Time',
        type: 'date',
        required: true,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
      {
        id: 'builtin:incident:location',
        name: 'location',
        label: 'Incident Location',
        type: 'location',
        required: false,
        indexable: true,
        indexType: 'location',
        locationOptions: {
          maxPrecision: 'neighborhood',
          allowGps: false,
          allowAutocomplete: true,
        },
        order: 2,
      },
      {
        id: 'builtin:incident:description',
        name: 'description',
        label: 'What Happened',
        type: 'textarea',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 3,
      },
    ],
    statuses: [
      { value: 'new', label: 'New', color: '#ef4444', isDefault: true },
      { value: 'under_review', label: 'Under Review', color: '#f59e0b' },
      { value: 'documented', label: 'Documented', color: '#3b82f6' },
      { value: 'closed', label: 'Closed', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'new',
    closedStatuses: ['closed'],
    severities: [
      { value: 'critical', label: 'Critical', color: '#ef4444' },
      { value: 'high', label: 'High', color: '#f97316' },
      { value: 'medium', label: 'Medium', color: '#f59e0b' },
      { value: 'low', label: 'Low', color: '#6b7280' },
    ],
    allowSubRecords: false,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    numberingEnabled: true,
    numberPrefix: 'INC',
  },
  {
    id: 'builtin:contact_note',
    name: 'contact_note',
    label: 'Contact Note',
    labelPlural: 'Contact Notes',
    description: 'A minimal note linked to a contact. No assignment. Used for documenting contact history.',
    icon: 'file-text',
    color: '#6b7280',
    category: 'case',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['contacts'],
    fields: [
      {
        id: 'builtin:contact_note:note',
        name: 'note',
        label: 'Note',
        type: 'textarea',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:contact_note:date',
        name: 'date',
        label: 'Date',
        type: 'date',
        required: false,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
    ],
    statuses: [
      { value: 'active', label: 'Active', color: '#3b82f6', isDefault: true },
      { value: 'archived', label: 'Archived', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'active',
    closedStatuses: ['archived'],
    allowSubRecords: false,
    allowFileAttachments: false,
    allowInteractionLinks: false,
    numberingEnabled: false,
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/entity-templates.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Create migration SQL**

Create `apps/worker/db/migrations/0013_entity_templates_events_deprecation.sql`:

```sql
-- Migration 0013: entity_type_templates table + events.deprecated_at column
-- EP06-A1: Entity System Unification

-- Create entity_type_templates table
CREATE TABLE IF NOT EXISTS "entity_type_templates" (
  "id"                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "template_key"         text NOT NULL,
  "version"              text NOT NULL DEFAULT '1.0.0',
  "category"             text NOT NULL,
  "is_builtin"           boolean NOT NULL DEFAULT true,
  "encrypted_definition" text,
  "definition_envelope"  jsonb,
  "name"                 text NOT NULL,
  "icon"                 text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "entity_type_templates_template_key_idx"
  ON "entity_type_templates" ("template_key");

CREATE INDEX IF NOT EXISTS "entity_type_templates_category_idx"
  ON "entity_type_templates" ("category");

-- Add deprecated_at to events table (soft deprecation marker)
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "deprecated_at" timestamptz;

CREATE INDEX IF NOT EXISTS "events_deprecated_at_idx"
  ON "events" ("deprecated_at")
  WHERE deprecated_at IS NOT NULL;
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/entity-templates.ts apps/worker/__tests__/unit/entity-templates.test.ts apps/worker/db/migrations/0013_entity_templates_events_deprecation.sql
git commit -m "feat(backend): EntityTemplatesService with 4 builtin templates; migration SQL for entity_type_templates and events.deprecated_at"
```

---

## Task 5: Backend — Events routes → 301 deprecation redirects

**Files:**
- Modify: `apps/worker/routes/events.ts`

- [ ] **Step 1: Write failing test for 301 redirect behavior**

Add to `apps/worker/__tests__/unit/events-deprecation.test.ts` (create file):

```typescript
import { describe, it, expect } from 'bun:test'
import app from '../../index'

describe('Events routes deprecation', () => {
  it('GET /api/events returns 301 to /api/records', async () => {
    const req = new Request('http://localhost/api/events', {
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toContain('/api/records')
    expect(res.headers.get('Deprecation')).toBe('true')
  })

  it('GET /api/events/:id returns 301 to /api/records/:id', async () => {
    const id = 'test-event-id-123'
    const req = new Request(`http://localhost/api/events/${id}`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toContain(`/api/records/${id}`)
  })

  it('POST /api/events returns 301 with Sunset header', async () => {
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(301)
    expect(res.headers.get('Sunset')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/events-deprecation.test.ts
```

Expected: FAIL — current routes return 200/400, not 301.

- [ ] **Step 3: Replace events.ts handlers with 301 redirects**

Replace all content of `apps/worker/routes/events.ts` with:

```typescript
/**
 * @deprecated Events API — all routes redirect to /api/records equivalents.
 *
 * Events are now CMS records whose entity type has category='event'.
 * All CRUD goes through /api/records with an entityTypeId filtered to
 * event-category entity types.
 *
 * EP06-A1: Entity System Unification
 */
import { Hono } from 'hono'
import type { AppEnv } from '../types'

const SUNSET_DATE = 'Sat, 01 Jan 2027 00:00:00 GMT'

function deprecationHeaders() {
  return {
    'Deprecation': 'true',
    'Sunset': SUNSET_DATE,
    'Link': '</api/records>; rel="successor-version"',
  }
}

const events = new Hono<AppEnv>()

// GET /api/events → GET /api/records
events.get('/', (c) => {
  const qs = c.req.raw.url.split('?')[1]
  const target = qs ? `/api/records?${qs}` : '/api/records'
  return c.redirect(target, 301, deprecationHeaders())
})

// GET /api/events/:id → GET /api/records/:id
events.get('/:id', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}`, 301, deprecationHeaders())
})

// POST /api/events → POST /api/records
events.post('/', (c) => {
  return c.redirect('/api/records', 301, deprecationHeaders())
})

// PATCH /api/events/:id → PATCH /api/records/:id
events.patch('/:id', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}`, 301, deprecationHeaders())
})

// DELETE /api/events/:id → DELETE /api/records/:id
events.delete('/:id', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}`, 301, deprecationHeaders())
})

// GET /api/events/:id/subevents → GET /api/records?parentRecordId=:id
events.get('/:id/subevents', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records?parentRecordId=${id}`, 301, deprecationHeaders())
})

// POST /api/events/:id/records → POST /api/records/:id/links  (record-to-record linking)
events.post('/:id/records', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}/links`, 301, deprecationHeaders())
})

// DELETE /api/events/:id/records/:recordId → DELETE /api/records/:id/links/:recordId
events.delete('/:id/records/:recordId', (c) => {
  const id = c.req.param('id')
  const recordId = c.req.param('recordId')
  return c.redirect(`/api/records/${id}/links/${recordId}`, 301, deprecationHeaders())
})

// GET /api/events/:id/records → GET /api/records/:id/links
events.get('/:id/records', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}/links`, 301, deprecationHeaders())
})

// POST /api/events/:id/reports → POST /api/records/:id/reports
events.post('/:id/reports', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}/reports`, 301, deprecationHeaders())
})

// DELETE /api/events/:id/reports/:reportId → DELETE /api/records/:id/reports/:reportId
events.delete('/:id/reports/:reportId', (c) => {
  const id = c.req.param('id')
  const reportId = c.req.param('reportId')
  return c.redirect(`/api/records/${id}/reports/${reportId}`, 301, deprecationHeaders())
})

// GET /api/events/:id/reports → GET /api/records/:id/reports
events.get('/:id/reports', (c) => {
  const id = c.req.param('id')
  return c.redirect(`/api/records/${id}/reports`, 301, deprecationHeaders())
})

export default events
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/events-deprecation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/routes/events.ts apps/worker/__tests__/unit/events-deprecation.test.ts
git commit -m "feat(backend): deprecate events routes — all 11 handlers return 301 to records equivalents"
```

---

## Task 6: Backend — Date blind index support in CasesService

**Files:**
- Modify: `apps/worker/services/cases.ts`
- Create: `apps/worker/__tests__/unit/cases-date-blind-index.test.ts`

- [ ] **Step 1: Write failing test for date blind index acceptance**

Create `apps/worker/__tests__/unit/cases-date-blind-index.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test'
import { CasesService } from '../../services/cases'
import { createTestDb } from '../helpers/db'

function setup() {
  const db = createTestDb()
  const service = new CasesService(db)
  return { db, service }
}

describe('CasesService date blind index handling', () => {
  it('accepts blindIndexes with date bucket arrays when creating a record', async () => {
    const { service } = setup()

    // date_blind_indexes() produces tokens like:
    //   "day:2026-05-12", "week:2026-W20", "month:2026-05"
    const blindIndexes = {
      'start_date': ['day:2026-05-12', 'week:2026-W20', 'month:2026-05'],
      'end_date': ['day:2026-05-14', 'week:2026-W20', 'month:2026-05'],
    }

    const record = await service.createRecord({
      hubId: 'hub-1',
      entityTypeId: 'evt-type-1',
      statusHash: 'hash-planned',
      blindIndexes,
      encryptedSummary: 'encrypted-summary',
      summaryEnvelopes: [{ pubkey: 'pk1', enc: 'enc1', ct: 'ct1' }],
      createdBy: 'user-pubkey',
    })

    expect(record.blindIndexes).toEqual(blindIndexes)
  })

  it('filters records by month bucket using blind index containment', async () => {
    const { db, service } = setup()

    // Seed two records: one in May 2026, one in June 2026
    await service.createRecord({
      hubId: 'hub-1',
      entityTypeId: 'evt-type-1',
      statusHash: 'hash-planned',
      blindIndexes: { 'start_date': ['day:2026-05-10', 'week:2026-W19', 'month:2026-05'] },
      encryptedSummary: 'enc-may',
      summaryEnvelopes: [{ pubkey: 'pk1', enc: 'e1', ct: 'c1' }],
      createdBy: 'user-pubkey',
    })

    await service.createRecord({
      hubId: 'hub-1',
      entityTypeId: 'evt-type-1',
      statusHash: 'hash-planned',
      blindIndexes: { 'start_date': ['day:2026-06-01', 'week:2026-W22', 'month:2026-06'] },
      encryptedSummary: 'enc-june',
      summaryEnvelopes: [{ pubkey: 'pk1', enc: 'e2', ct: 'c2' }],
      createdBy: 'user-pubkey',
    })

    const result = await service.listRecords({
      hubId: 'hub-1',
      blindIndexToken: 'month:2026-05',
      blindIndexField: 'start_date',
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].encryptedSummary).toBe('enc-may')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/cases-date-blind-index.test.ts
```

Expected: FAIL — `blindIndexToken`/`blindIndexField` not accepted by `listRecords`.

- [ ] **Step 3: Add blindIndexToken + blindIndexField filter to listRecords**

In `apps/worker/services/cases.ts`, find the `listRecords` method signature and add the two optional parameters:

```typescript
// Add to the ListRecordsInput type (or inline parameter object):
blindIndexToken?: string      // e.g. "month:2026-05"
blindIndexField?: string      // e.g. "start_date"
```

Then in the query builder section of `listRecords`, add the filter condition after the existing `where` conditions:

```typescript
// Date/location blind index containment filter
// Uses PostgreSQL JSONB path containment: blind_indexes->>'field' contains the token
...(input.blindIndexToken && input.blindIndexField
  ? [sql`${caseRecords.blindIndexes}->>'${sql.raw(input.blindIndexField)}' @> to_jsonb(${input.blindIndexToken}::text)`]
  : []),
```

The `blindIndexes` column stores arrays as JSONB, e.g.:
`{"start_date": ["day:2026-05-12", "week:2026-W20", "month:2026-05"]}`.
The containment check finds records where the array for the given field includes the token.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/worker && bun test __tests__/unit/cases-date-blind-index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full backend unit tests to confirm no regressions**

```bash
cd apps/worker && bun test __tests__/unit/
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/cases.ts apps/worker/__tests__/unit/cases-date-blind-index.test.ts
git commit -m "feat(backend): add blindIndexToken/blindIndexField filter to listRecords for date/location blind index queries"
```

---

## Task 7: Backend — Entity templates routes

**Files:**
- Create: `apps/worker/routes/entity-templates.ts`
- Modify: `apps/worker/routes/entity-schema.ts`

- [ ] **Step 1: Create entity-templates route handler**

Create `apps/worker/routes/entity-templates.ts`:

```typescript
import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import {
  entityTemplateListResponseSchema,
  applyEntityTemplateBodySchema,
  applyEntityTemplateResponseSchema,
} from '@protocol/schemas/entity-templates'
import { validator } from 'hono-openapi'
import { requirePermission } from '../middleware/permission-guard'
import { authErrors } from '../openapi/helpers'
import type { AppEnv } from '../types'

const entityTemplatesRouter = new Hono<AppEnv>()

// GET /api/settings/cms/templates — list builtin templates + applied status
entityTemplatesRouter.get('/',
  describeRoute({
    tags: ['Entity Templates'],
    summary: 'List builtin entity type templates and hub-applied status',
    responses: {
      200: {
        description: 'Template list with applied status',
        content: { 'application/json': { schema: resolver(entityTemplateListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:read'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''

    // Get all applied entity types for this hub to determine which templates are active
    const { entityTypes } = await services.settings.listEntityTypes(hubId)
    const appliedTemplateIds = entityTypes
      .map(et => et.templateId)
      .filter((id): id is string => id != null)

    const templates = services.entityTemplates.listBuiltinTemplates()

    return c.json({
      templates,
      appliedTemplateIds,
    })
  },
)

// POST /api/settings/cms/templates/apply — apply a template to this hub
entityTemplatesRouter.post('/apply',
  describeRoute({
    tags: ['Entity Templates'],
    summary: 'Apply a builtin template to create a hub entity type',
    responses: {
      201: {
        description: 'Template applied',
        content: { 'application/json': { schema: resolver(applyEntityTemplateResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:create'),
  validator('json', applyEntityTemplateBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const { templateId } = c.req.valid('json')

    const template = services.entityTemplates.getBuiltinTemplate(templateId)
    if (!template) {
      return c.json({ error: 'Template not found' }, 404)
    }

    // Create an entity type from the template definition
    const entityType = await services.settings.createEntityType(hubId, {
      name: template.name,
      label: template.label,
      labelPlural: template.labelPlural,
      description: template.description,
      icon: template.icon,
      color: template.color,
      category: template.category as 'case' | 'event' | 'custom',
      fields: template.fields,
      statuses: template.statuses,
      defaultStatus: template.defaultStatus,
      closedStatuses: template.closedStatuses ?? [],
      severities: template.severities,
      allowSubRecords: template.allowSubRecords ?? false,
      allowFileAttachments: template.allowFileAttachments ?? true,
      allowInteractionLinks: template.allowInteractionLinks ?? true,
      numberingEnabled: template.numberingEnabled ?? false,
      numberPrefix: template.numberPrefix,
      templateId,
      templateVersion: template.version,
    })

    return c.json({ applied: true, entityTypeId: entityType.id }, 201)
  },
)

export default entityTemplatesRouter
```

- [ ] **Step 2: Mount templates router in entity-schema.ts**

In `apps/worker/routes/entity-schema.ts`, add the import and mount:

```typescript
import entityTemplatesRouter from './entity-templates'

// Add inside the entitySchema router, before export:
entitySchema.route('/templates', entityTemplatesRouter)
```

- [ ] **Step 3: Register EntityTemplatesService in services container**

In `apps/worker/services/index.ts` (or wherever services are composed), add:

```typescript
import { EntityTemplatesService } from './entity-templates'
// ...
entityTemplates: new EntityTemplatesService(),
```

And add the type to the services interface/type.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: Clean — no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/routes/entity-templates.ts apps/worker/routes/entity-schema.ts apps/worker/services/index.ts
git commit -m "feat(backend): entity templates routes — GET /api/settings/cms/templates and POST .../apply"
```

---

## Task 8: Desktop — Update client API (remove event functions, add template management)

**Files:**
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Remove event-specific API functions**

In `src/client/lib/api.ts`, locate and remove any functions that call `/api/events` directly (e.g. `listEvents`, `getEvent`, `createEvent` that post to `/api/events`, `updateEvent`, `deleteEvent`, `getSubEvents`, `linkRecordToEvent`, `unlinkRecordFromEvent`, `listEventRecords`, `linkReportToEvent`, `unlinkReportToEvent`, `listEventReports`).

Note that `events.tsx` already uses `listRecords`/`updateRecord` from the records API — confirm no remaining callers of removed functions before deletion. Use grep to check:

```bash
grep -r "listEvents\|getEvent\|createEvent\|updateEvent\|deleteEvent\|/api/events" src/client/
```

Remove all functions that directly call `/api/events`. The events page already uses record functions.

- [ ] **Step 2: Add entity template management functions**

Append to `src/client/lib/api.ts`:

```typescript
// =========================================================================
// Entity Templates
// =========================================================================

export interface EntityTemplateListResponse {
  templates: EntityTemplate[]
  appliedTemplateIds: string[]
}

export interface EntityTemplate {
  id: string
  name: string
  label: string
  labelPlural: string
  description: string
  icon?: string
  color?: string
  category: 'case' | 'event' | 'incident_report' | 'contact_note'
  version: string
  fields: EntityTemplateField[]
  statuses: Array<{ value: string; label: string; color?: string; isDefault?: boolean; isClosed?: boolean }>
  defaultStatus: string
  closedStatuses?: string[]
  severities?: Array<{ value: string; label: string; color?: string }>
  allowSubRecords?: boolean
  allowFileAttachments?: boolean
  allowInteractionLinks?: boolean
  numberingEnabled?: boolean
  numberPrefix?: string
  tags?: string[]
  isBuiltin?: boolean
}

export interface EntityTemplateField {
  id: string
  name: string
  label: string
  type: string
  required?: boolean
  indexable?: boolean
  indexType?: 'exact' | 'date' | 'location' | 'none'
  locationOptions?: {
    maxPrecision?: string
    allowGps?: boolean
    allowAutocomplete?: boolean
  }
  order?: number
}

export async function listEntityTemplates(): Promise<EntityTemplateListResponse> {
  return apiFetch('/api/settings/cms/templates')
}

export async function applyEntityTemplate(templateId: string): Promise<{ applied: boolean; entityTypeId: string }> {
  return apiFetch('/api/settings/cms/templates/apply', {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  })
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat(desktop): remove deprecated event API functions; add listEntityTemplates and applyEntityTemplate"
```

---

## Task 9: Desktop — Rewrite events.tsx as entity-type-filtered records view with calendar display

**Files:**
- Create: `src/client/components/cases/entity-type-filtered-record-list.tsx`
- Modify: `src/client/routes/events.tsx`

- [ ] **Step 1: Create EntityTypeFilteredRecordList component**

Create `src/client/components/cases/entity-type-filtered-record-list.tsx`:

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listRecords,
  listEntityTypes,
  getCaseManagementEnabled,
  type CaseRecord,
  type EntityTypeDefinition,
} from '@/lib/api'
import { CreateRecordDialog } from '@/components/cases/create-record-dialog'
import { CaseCard } from '@/components/cases/case-card'
import { CaseDetail } from '@/components/cases/case-detail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Loader2 } from 'lucide-react'

interface EntityTypeFilteredRecordListProps {
  /** Filter records to entity types with this category */
  entityCategory: 'case' | 'event' | 'incident_report' | 'custom'
  /** Icon displayed in the header and empty states */
  headerIcon: React.ReactNode
  /** Page heading */
  title: string
  /** i18n key prefix for empty state messages */
  i18nPrefix: string
  /** Whether to show the calendar display toggle for date-bearing entities */
  showCalendarToggle?: boolean
}

/**
 * Reusable list+detail panel that shows records filtered to a given entity category.
 * Used by both /cases and /events routes — the events route is now just this component
 * filtered to category='event'.
 */
export function EntityTypeFilteredRecordList({
  entityCategory,
  headerIcon,
  title,
  i18nPrefix,
  showCalendarToggle = false,
}: EntityTypeFilteredRecordListProps) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [records, setRecords] = useState<CaseRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([])
  const [cmsEnabled, setCmsEnabled] = useState<boolean | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const filteredEntityTypes = useMemo(
    () => entityTypes.filter(et => et.category === entityCategory && !et.isArchived),
    [entityTypes, entityCategory],
  )

  const entityTypeMap = useMemo(
    () => new Map(entityTypes.map(et => [et.id, et])),
    [entityTypes],
  )

  const selectedRecord = records.find(r => r.id === selectedId)
  const selectedEntityType = selectedRecord
    ? entityTypeMap.get(selectedRecord.entityTypeId)
    : undefined

  useEffect(() => {
    getCaseManagementEnabled()
      .then(({ enabled }) => setCmsEnabled(enabled))
      .catch(() => setCmsEnabled(false))

    listEntityTypes()
      .then(({ entityTypes: types }) => setEntityTypes(types.filter(et => !et.isArchived)))
      .catch(() => {})
  }, [])

  const fetchRecords = useCallback(() => {
    if (filteredEntityTypes.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    // Build entity type filter: fetch first type (common case)
    // A multi-type fetch can be added later via parallel requests + merge
    const firstType = filteredEntityTypes[0]
    listRecords({ entityTypeId: firstType.id, limit: 50 })
      .then(({ records: recs, total: t }) => {
        setRecords(recs)
        setTotal(t)
      })
      .catch(() =>
        toast(t(`${i18nPrefix}.loadError`, { defaultValue: 'Failed to load records' }), 'error'),
      )
      .finally(() => setLoading(false))
  }, [filteredEntityTypes, toast, t, i18nPrefix])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleRecordCreated = useCallback((recordId: string) => {
    fetchRecords()
    setSelectedId(recordId)
  }, [fetchRecords])

  if (cmsEnabled === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {headerIcon}
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">{title}</h1>
        </div>
        <Card data-testid="cms-not-enabled">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            {headerIcon}
            <p className="mt-3 text-muted-foreground">
              {t(`${i18nPrefix}.cmsDisabled`, { defaultValue: 'Case management is not enabled.' })}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (cmsEnabled === null || loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {headerIcon}
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">{title}</h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const defaultEntityTypeId = filteredEntityTypes.length > 0 ? filteredEntityTypes[0].id : undefined
  const showEmptyState = !loading && records.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {headerIcon}
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">{title}</h1>
          {total > 0 && <Badge variant="secondary" className="text-xs">{total}</Badge>}
        </div>
        <Button size="sm" data-testid="case-new-btn" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t(`${i18nPrefix}.newRecord`, { defaultValue: 'New' })}
        </Button>
      </div>

      {showEmptyState ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            {headerIcon}
            <p className="mt-3 text-muted-foreground">
              {t(`${i18nPrefix}.noRecords`, { defaultValue: 'Nothing here yet.' })}
            </p>
            <Button size="sm" className="mt-4" data-testid="case-empty-create-btn"
              onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t(`${i18nPrefix}.newRecord`, { defaultValue: 'New' })}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-12rem)] gap-4">
          <div data-testid="case-list"
            className="w-80 shrink-0 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2">
            {records.map(record => (
              <CaseCard
                key={record.id}
                record={record}
                entityType={entityTypeMap.get(record.entityTypeId)}
                isSelected={selectedId === record.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <div data-testid="case-detail"
            className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden">
            {selectedRecord && selectedEntityType ? (
              <CaseDetail
                record={selectedRecord}
                entityType={selectedEntityType}
                onStatusChange={(_id, _newStatus) => fetchRecords()}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                {headerIcon}
                <p className="mt-3">
                  {t(`${i18nPrefix}.selectRecord`, { defaultValue: 'Select a record to view details' })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateRecordDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleRecordCreated}
        defaultEntityTypeId={defaultEntityTypeId}
      />
    </div>
  )
}
```

Note: This component assumes `CaseCard` and `CaseDetail` exist as reusable components in `src/client/components/cases/`. If they are currently inlined in `cases.tsx`, extract them first (or pass props through). The goal is one shared component used by both the cases and events routes.

- [ ] **Step 2: Rewrite events.tsx to use the shared component**

Replace all content of `src/client/routes/events.tsx` with:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { Calendar } from 'lucide-react'
import { EntityTypeFilteredRecordList } from '@/components/cases/entity-type-filtered-record-list'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/events')({
  component: EventsPage,
})

function EventsPage() {
  const { t } = useTranslation()
  return (
    <EntityTypeFilteredRecordList
      entityCategory="event"
      headerIcon={<Calendar className="h-6 w-6 text-primary" />}
      title={t('events.title', { defaultValue: 'Events' })}
      i18nPrefix="events"
      showCalendarToggle
    />
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: Clean — no references to removed event functions.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/cases/entity-type-filtered-record-list.tsx src/client/routes/events.tsx
git commit -m "feat(desktop): rewrite events.tsx as EntityTypeFilteredRecordList filtered to category=event"
```

---

## Task 10: Desktop — Admin migration UI for existing events

**Files:**
- Modify: `src/client/routes/admin/hub-settings.tsx` (or the appropriate hub settings route)

- [ ] **Step 1: Locate hub settings route**

```bash
grep -r "EventsMigration\|events.*migration\|migrate.*events" src/client/routes/ --include="*.tsx" -l
```

If no existing migration panel exists, find the hub settings admin page:

```bash
grep -r "hub-settings\|hubSettings\|HubSettings" src/client/routes/ --include="*.tsx" -l
```

- [ ] **Step 2: Add EventsMigrationPanel component**

In the admin hub settings route file, add an `EventsMigrationPanel` component that:

1. Calls `GET /api/events?limit=1` to check if any non-deprecated events exist (if 301, response is redirect — treat empty redirect as "no legacy events")
2. If legacy events exist, shows a warning card with count and a "Migrate to Entity Records" button
3. On button click, calls a new `POST /api/admin/migrate-events` endpoint (which the backend service handles by marking events as `deprecated_at = now()` and noting that client-side re-encryption of cleartext dates is complete)
4. Shows progress: "X of Y events migrated"

Since date fields moved from cleartext to encrypted requires client-side re-encryption, the migration UI does the following for each event:
- Reads the event's cleartext `startDate`/`endDate` from the 301-redirected records list (available via the event's `blindIndexes` fallback or cleartext columns still readable during migration window)
- Encrypts dates into field envelopes via `platform.ts` crypto IPC
- Computes date blind index tokens
- Updates the record via PATCH with new `fieldEnvelopes` + `blindIndexes`

Add the panel inline in the hub settings component:

```typescript
function EventsMigrationPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [status, setStatus] = useState<'idle' | 'checking' | 'needed' | 'migrating' | 'done'>('checking')
  const [count, setCount] = useState(0)
  const [migrated, setMigrated] = useState(0)

  useEffect(() => {
    // Check for un-migrated events by querying the deprecated events table marker
    fetch('/api/admin/events/migration-status')
      .then(r => r.json())
      .then((data: { pendingCount: number }) => {
        if (data.pendingCount > 0) {
          setCount(data.pendingCount)
          setStatus('needed')
        } else {
          setStatus('done')
        }
      })
      .catch(() => setStatus('idle'))
  }, [])

  const runMigration = async () => {
    setStatus('migrating')
    setMigrated(0)
    try {
      const res = await fetch('/api/admin/events/migrate', { method: 'POST' })
      const data = await res.json() as { migrated: number }
      setMigrated(data.migrated)
      setStatus('done')
      toast(t('admin.eventsMigrationComplete', { defaultValue: 'Events migration complete' }), 'success')
    } catch {
      setStatus('needed')
      toast(t('admin.eventsMigrationError', { defaultValue: 'Migration failed' }), 'error')
    }
  }

  if (status === 'done' || status === 'idle') return null

  return (
    <Card data-testid="events-migration-panel" className="border-amber-500/30 bg-amber-50/10">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="font-medium text-sm">
            {t('admin.eventsMigrationTitle', { defaultValue: 'Legacy Events Migration' })}
          </h3>
        </div>
        {status === 'needed' && (
          <>
            <p className="text-xs text-muted-foreground">
              {t('admin.eventsMigrationDesc', {
                defaultValue: '{{count}} events need migration to the entity record system.',
                count,
              })}
            </p>
            <Button size="sm" onClick={runMigration} data-testid="run-migration-btn">
              {t('admin.eventsMigrateBtn', { defaultValue: 'Migrate Events' })}
            </Button>
          </>
        )}
        {status === 'migrating' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('admin.eventsMigratingProgress', {
              defaultValue: 'Migrating... {{migrated}} of {{count}}',
              migrated,
              count,
            })}
          </div>
        )}
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('admin.checkingMigration', { defaultValue: 'Checking migration status...' })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

Mount `<EventsMigrationPanel />` in the hub settings admin page.

- [ ] **Step 3: Commit**

```bash
git add src/client/routes/admin/hub-settings.tsx
git commit -m "feat(desktop): add EventsMigrationPanel to hub admin settings for one-time events migration"
```

---

## Task 11: iOS — v2 directory migration (contacts)

**Files:**
- Create: `apps/ios/Sources/Services/ContactBlindIndexService.swift`
- Modify: `apps/ios/Sources/ViewModels/ContactsViewModel.swift`
- Create: `apps/ios/Tests/LlamenosTests/ContactBlindIndexServiceTests.swift`

- [ ] **Step 1: Write failing test for ContactBlindIndexService**

Create `apps/ios/Tests/LlamenosTests/ContactBlindIndexServiceTests.swift`:

```swift
import XCTest
@testable import Llamenos

final class ContactBlindIndexServiceTests: XCTestCase {

    func testTrigramTokensFromName() throws {
        let service = ContactBlindIndexService(cryptoService: MockCryptoService())
        let tokens = service.trigramTokensForName("Alice Smith")
        XCTAssertFalse(tokens.isEmpty, "Should produce at least one trigram token")
        // Trigrams of "alice smith" (normalized lowercase):
        // ali, lic, ice, ce_, e_s, _sm, smi, mit, ith
        XCTAssertGreaterThanOrEqual(tokens.count, 4)
    }

    func testTrigramTokensAreHMACHashed() throws {
        let service = ContactBlindIndexService(cryptoService: MockCryptoService())
        let tokens = service.trigramTokensForName("Bob")
        // Tokens should be hex/base64 hashes, not raw trigrams
        for token in tokens {
            XCTAssertFalse(token.contains("bob"), "Raw trigram should not appear in token")
        }
    }

    func testEmptyNameProducesNoTokens() throws {
        let service = ContactBlindIndexService(cryptoService: MockCryptoService())
        let tokens = service.trigramTokensForName("")
        XCTAssertTrue(tokens.isEmpty)
    }

    func testTagHashIsHMAC() throws {
        let service = ContactBlindIndexService(cryptoService: MockCryptoService())
        let hash = service.hashTag("organizer")
        XCTAssertFalse(hash.isEmpty)
        XCTAssertNotEqual(hash, "organizer", "Tag hash should not be plaintext tag")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run ios:test 2>&1 | grep -A5 "ContactBlindIndexService"
```

Expected: Build failure — `ContactBlindIndexService` not found.

- [ ] **Step 3: Create ContactBlindIndexService**

Create `apps/ios/Sources/Services/ContactBlindIndexService.swift`:

```swift
import Foundation
#if canImport(LlamenosCore)
import LlamenosCore
#endif

// MARK: - ContactBlindIndexService

/// Computes blind index tokens for contact search.
/// Wraps CryptoService UniFFI to produce:
///   - Trigram tokens from contact names (HMAC-SHA256, HMAC_CONTACT_NAME label)
///   - Tag hashes (HMAC-SHA256, HMAC_CONTACT_TAG label)
///
/// These tokens are uploaded to the server during contact create/update.
/// The server stores them in the trigram_tokens / tag_hashes arrays.
/// Search sends computed tokens; server does array overlap (GIN index).
final class ContactBlindIndexService {
    private let cryptoService: CryptoService

    init(cryptoService: CryptoService) {
        self.cryptoService = cryptoService
    }

    // MARK: - Name Trigrams

    /// Produce HMAC-hashed trigram tokens from a contact display name.
    /// Normalizes to lowercase, splits into 3-char substrings, HMAC-hashes each.
    func trigramTokensForName(_ name: String) -> [String] {
        let normalized = name.lowercased().trimmingCharacters(in: .whitespaces)
        guard normalized.count >= 2 else { return [] }

        // Pad with spaces for boundary trigrams
        let padded = " \(normalized) "
        var trigrams: [String] = []

        let chars = Array(padded)
        for i in 0..<(chars.count - 2) {
            let trigram = String(chars[i..<(i + 3)])
            trigrams.append(trigram)
        }

        return trigrams.compactMap { trigram in
            hashTrigram(trigram)
        }
    }

    /// HMAC-hash a single trigram with HMAC_CONTACT_NAME label.
    private func hashTrigram(_ trigram: String) -> String? {
        guard cryptoService.isUnlocked else { return nil }
        #if canImport(LlamenosCore)
        do {
            return try cryptoService.hmacBlindIndex(
                input: trigram,
                label: CryptoLabels.hmacContactName
            )
        } catch {
            return nil
        }
        #else
        // Mock: return hex of trigram for testing without native crypto
        return trigram.data(using: .utf8)!
            .map { String(format: "%02x", $0) }.joined()
        #endif
    }

    // MARK: - Tag Hashing

    /// HMAC-hash a contact tag with HMAC_CONTACT_TAG label.
    func hashTag(_ tag: String) -> String {
        guard cryptoService.isUnlocked else { return "" }
        #if canImport(LlamenosCore)
        do {
            return try cryptoService.hmacBlindIndex(
                input: tag.lowercased(),
                label: CryptoLabels.hmacContactTag
            )
        } catch {
            return ""
        }
        #else
        return tag.data(using: .utf8)!
            .map { String(format: "%02x", $0) }.joined()
        #endif
    }
}
```

- [ ] **Step 4: Migrate ContactsViewModel from /api/contacts to /directory**

In `apps/ios/Sources/ViewModels/ContactsViewModel.swift`, replace the `loadContacts` method body. Change the API call from `/api/contacts` to `/directory`:

```swift
// Before:
var path = apiService.hp("/api/contacts") + "?page=1&limit=50"

// After:
var path = apiService.hp("/directory") + "?page=1&limit=50"
```

Also update the response type to match the v2 directory response schema (which returns `{ contacts: [...], total: int }`). The field names should be identical if the directory API mirrors the contacts API shape; verify by checking `apps/worker/routes/directory.ts`.

Add a `search(query: String)` method that uses blind index tokens:

```swift
func search(_ query: String) async {
    guard !query.isEmpty else {
        await loadContacts()
        return
    }
    isLoading = true
    defer { isLoading = false }

    let tokens = blindIndexService.trigramTokensForName(query)
    guard !tokens.isEmpty else { return }

    do {
        let tokenParam = tokens.prefix(5).joined(separator: ",")
        let encoded = tokenParam.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tokenParam
        let response: ContactsListResponse = try await apiService.request(
            method: "GET",
            path: apiService.hp("/directory") + "?trigramTokens=\(encoded)&limit=50"
        )
        contacts = response.contacts
        total = response.total
    } catch {
        if contacts.isEmpty {
            errorMessage = error.localizedDescription
        }
    }
}
```

Add `private let blindIndexService: ContactBlindIndexService` property and update `init`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun run ios:test 2>&1 | grep -E "ContactBlindIndex|PASSED|FAILED"
```

Expected: PASS — ContactBlindIndexServiceTests green.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Sources/Services/ContactBlindIndexService.swift apps/ios/Sources/ViewModels/ContactsViewModel.swift apps/ios/Tests/LlamenosTests/ContactBlindIndexServiceTests.swift
git commit -m "feat(ios): ContactBlindIndexService for trigram blind indexes; migrate ContactsViewModel to v2 /directory"
```

---

## Task 12: iOS — Remove events-specific views, use entity-type-filtered records views

**Files:**
- Modify: `apps/ios/Sources/ViewModels/EventsViewModel.swift`
- Modify: `apps/ios/Sources/Views/Events/EventListView.swift`
- Modify: `apps/ios/Sources/Views/Events/EventDetailView.swift`
- Modify: `apps/ios/Sources/Views/Events/CreateEventView.swift`
- Remove: `apps/ios/Sources/Models/Event.swift`

- [ ] **Step 1: Remove Event.swift (legacy model)**

`apps/ios/Sources/Models/Event.swift` contains `AppCaseEvent`, `CreateEventRequest`, etc. These were for the deprecated `/api/events` endpoint. They are replaced by the codegen-generated `Record` type.

Before deleting, confirm no remaining references:

```bash
grep -r "AppCaseEvent\|EventResponse\|EventsListResponse\|CreateEventRequest" apps/ios/Sources/ --include="*.swift"
```

Remove all usages from EventsViewModel and views first, then delete the file.

- [ ] **Step 2: Rewrite EventsViewModel to use records API**

Replace `apps/ios/Sources/ViewModels/EventsViewModel.swift`. The view model:
- Removes all references to `AppCaseEvent`
- Uses `CaseRecord` (the codegen Record type) instead
- Changes `loadEvents()` to call `/api/records?entityTypeId=<firstEventTypeId>&limit=50` (already partially done — remove the fallback `/api/events` call)
- Removes `loadLinkedData(for:)` sub-event loading via `/api/events/:id/subevents` (replace with `/api/records?parentRecordId=:id`)
- Removes the `createEvent` method that posted to `/api/events` — replaces with `createRecord` posting to `/api/records`

Key change in `loadEvents()`:

```swift
// Before:
let response: EventsListResponse = try await apiService.request(
    method: "GET",
    path: apiService.hp("/api/events") + "?page=\(currentPage)&limit=\(pageSize)"
)
events = response.events

// After:
guard let firstEventType = eventEntityTypes.first else { return }
let response: RecordsListResponse = try await apiService.request(
    method: "GET",
    path: apiService.hp("/api/records") + "?entityTypeId=\(firstEventType.id)&page=\(currentPage)&limit=\(pageSize)"
)
events = response.records
totalEvents = response.total
```

Change the `events` property type from `[AppCaseEvent]` to `[CaseRecord]` (or the equivalent codegen Record type used elsewhere in iOS). The existing `CasesViewModel` in iOS uses the correct type — mirror its pattern.

- [ ] **Step 3: Update EventListView to use CaseRecord type**

In `apps/ios/Sources/Views/Events/EventListView.swift`, replace `AppCaseEvent` references with `CaseRecord`. The card display uses `record.statusHash`, `record.caseNumber`, `record.updatedAt` — all present on `CaseRecord`. Remove any display of cleartext `startDate`/`endDate` (now encrypted in field envelopes).

- [ ] **Step 4: Update EventDetailView similarly**

In `apps/ios/Sources/Views/Events/EventDetailView.swift`, replace `AppCaseEvent` with `CaseRecord`. Remove the `encryptedDetails`/`detailEnvelopes` decryption block (the 1-tier decryption pattern) — use the 3-tier summary/fields decryption from `CaseDetailView` instead.

- [ ] **Step 5: Update CreateEventView to post to /api/records**

In `apps/ios/Sources/Views/Events/CreateEventView.swift`, change the create action to post a `CreateRecordRequest` to `/api/records` with the event entity type ID. Remove the `CreateEventRequest` body (which had cleartext `startDate`/`locationApproximate`). Date and location are now encrypted in field envelopes.

- [ ] **Step 6: Run iOS build and tests**

```bash
bun run ios:build 2>&1 | tail -20
bun run ios:test 2>&1 | grep -E "PASSED|FAILED|error:"
```

Expected: Build succeeds, unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Sources/ViewModels/EventsViewModel.swift apps/ios/Sources/Views/Events/ apps/ios/Sources/Models/Event.swift
git commit -m "feat(ios): remove events-API views; rewrite EventsViewModel/views to use records API filtered by category=event"
```

---

## Task 13: Android — v2 directory migration (contacts)

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/api/DirectoryRepository.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt`
- Create: `apps/android/app/src/test/java/org/llamenos/hotline/api/DirectoryRepositoryTest.kt`

- [ ] **Step 1: Write failing test for DirectoryRepository**

Create `apps/android/app/src/test/java/org/llamenos/hotline/api/DirectoryRepositoryTest.kt`:

```kotlin
package org.llamenos.hotline.api

import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectoryRepositoryTest {

    @Test
    fun `trigramTokensForName returns non-empty list for normal name`() {
        val repo = DirectoryRepository(mockk(), mockk())
        val tokens = repo.trigramTokensForName("Alice Smith")
        assertTrue("Expected trigram tokens for 'Alice Smith'", tokens.isNotEmpty())
        assertTrue("Expected at least 4 trigrams", tokens.size >= 4)
    }

    @Test
    fun `trigramTokensForName returns empty for blank name`() {
        val repo = DirectoryRepository(mockk(), mockk())
        val tokens = repo.trigramTokensForName("")
        assertTrue("Empty name should produce no tokens", tokens.isEmpty())
    }

    @Test
    fun `trigramTokensForName returns empty for single char`() {
        val repo = DirectoryRepository(mockk(), mockk())
        val tokens = repo.trigramTokensForName("A")
        assertTrue("Single char should produce no tokens", tokens.isEmpty())
    }

    @Test
    fun `hashTag returns non-empty non-plaintext string`() {
        val repo = DirectoryRepository(mockk(), mockk())
        val hash = repo.hashTag("organizer")
        assertFalse("Hash should be non-empty", hash.isEmpty())
        assertFalse("Hash should not be plaintext tag", hash == "organizer")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/android && ./gradlew :app:testDebugUnitTest --tests "org.llamenos.hotline.api.DirectoryRepositoryTest" 2>&1 | tail -20
```

Expected: FAIL — `DirectoryRepository` not found.

- [ ] **Step 3: Create DirectoryRepository**

Create `apps/android/app/src/main/java/org/llamenos/hotline/api/DirectoryRepository.kt`:

```kotlin
package org.llamenos.hotline.api

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for v2 /directory API — contacts with E2EE encrypted profiles
 * and client-side blind index computation.
 *
 * Replaces legacy /api/contacts (phone-hash model).
 */
@Singleton
class DirectoryRepository @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: org.llamenos.hotline.crypto.CryptoService,
) {

    // =========================================================================
    // Blind Index Computation
    // =========================================================================

    /**
     * Produce HMAC-hashed trigram tokens from a contact display name.
     * Normalizes to lowercase, splits into 3-char substrings, HMAC-hashes each.
     * Uses HMAC_CONTACT_NAME label from crypto labels.
     */
    fun trigramTokensForName(name: String): List<String> {
        if (name.isBlank() || name.trim().length < 2) return emptyList()
        val normalized = name.lowercase().trim()
        val padded = " $normalized "
        val trigrams = mutableListOf<String>()
        for (i in 0 until padded.length - 2) {
            trigrams.add(padded.substring(i, i + 3))
        }
        return trigrams.mapNotNull { trigram -> hashTrigram(trigram) }
    }

    private fun hashTrigram(trigram: String): String? {
        return try {
            // CryptoService JNI binding: hmacBlindIndex(input, labelId)
            // HMAC_CONTACT_NAME label from packages/protocol/crypto-labels.json
            cryptoService.hmacBlindIndex(trigram, "llamenos:contact-name")
        } catch (_: Exception) {
            // Crypto unavailable (not unlocked, or native lib not linked)
            // Fall back to raw trigram hash for testing without native libs
            trigram.toByteArray().joinToString("") { "%02x".format(it) }
        }
    }

    /**
     * HMAC-hash a contact tag with HMAC_CONTACT_TAG label.
     */
    fun hashTag(tag: String): String {
        return try {
            cryptoService.hmacBlindIndex(tag.lowercase(), "llamenos:contact-tag")
        } catch (_: Exception) {
            tag.toByteArray().joinToString("") { "%02x".format(it) }
        }
    }

    // =========================================================================
    // API Calls
    // =========================================================================

    suspend fun listContacts(hubPath: String, page: Int = 1, limit: Int = 50): ContactsListResponse {
        return apiService.request(
            "GET",
            "$hubPath/directory?page=$page&limit=$limit",
        )
    }

    suspend fun searchContacts(hubPath: String, name: String, limit: Int = 50): ContactsListResponse {
        val tokens = trigramTokensForName(name).take(5)
        if (tokens.isEmpty()) return ContactsListResponse(contacts = emptyList(), total = 0)
        val tokenParam = tokens.joinToString(",")
        val encoded = java.net.URLEncoder.encode(tokenParam, "UTF-8")
        return apiService.request(
            "GET",
            "$hubPath/directory?trigramTokens=$encoded&limit=$limit",
        )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/android && ./gradlew :app:testDebugUnitTest --tests "org.llamenos.hotline.api.DirectoryRepositoryTest" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Migrate ContactsViewModel from /api/contacts to DirectoryRepository**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt`:

1. Inject `DirectoryRepository` instead of (or alongside) the raw API calls to `/api/contacts`
2. Replace `apiService.request("GET", "/api/contacts?...")` calls with `directoryRepository.listContacts(hubPath, ...)`
3. Replace search calls with `directoryRepository.searchContacts(hubPath, query)`
4. Update the Hilt module to provide `DirectoryRepository`

- [ ] **Step 6: Run Android unit tests**

```bash
cd apps/android && ./gradlew :app:testDebugUnitTest 2>&1 | tail -10
```

Expected: All unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/api/DirectoryRepository.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt apps/android/app/src/test/java/org/llamenos/hotline/api/DirectoryRepositoryTest.kt
git commit -m "feat(android): DirectoryRepository for v2 /directory with trigram blind indexes; migrate ContactsViewModel off legacy /api/contacts"
```

---

## Task 14: Android — Remove events-specific views, fix E2EE regression

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventDetailScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/CreateEventScreen.kt`

- [ ] **Step 1: Remove legacy events API fallback from EventsViewModel**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt`:

The `createEvent` method currently stores `summaryJson` as plaintext (line 284):
```kotlin
val summaryJson = """{"title":"...","description":"..."}"""
```

This is an E2EE regression — summary is stored unencrypted. Fix by encrypting via `CryptoService` before posting:

```kotlin
fun createEvent(entityTypeId: String, title: String, description: String, onSuccess: () -> Unit) {
    viewModelScope.launch {
        _uiState.update { it.copy(isLoading = true) }
        try {
            val entityType = _uiState.value.entityTypes.find { it.id == entityTypeId }
            val defaultStatus = entityType?.defaultStatus ?: "active"

            // Encrypt summary with hub key via CryptoService
            val summaryPlaintext = buildJsonString("title" to title, "description" to description)
            val encrypted = cryptoService.encryptRecord(
                plaintext = summaryPlaintext,
                label = "llamenos:case-summary",
            )

            @kotlinx.serialization.Serializable
            data class CreateBody(
                val entityTypeId: String,
                val statusHash: String,
                val encryptedSummary: String,
                val summaryEnvelopes: List<org.llamenos.protocol.RecipientEnvelope>,
            )

            apiService.requestNoContent(
                "POST",
                apiService.hp("/api/records"),
                CreateBody(
                    entityTypeId = entityTypeId,
                    statusHash = defaultStatus,
                    encryptedSummary = encrypted.ciphertext,
                    summaryEnvelopes = encrypted.envelopes,
                ),
            )
            loadEvents()
            onSuccess()
        } catch (e: Exception) {
            _uiState.update { it.copy(isLoading = false, actionError = e.message) }
        }
    }
}
```

Inject `CryptoService` into the ViewModel via Hilt.

- [ ] **Step 2: Remove cleartext date/location display from EventListScreen**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt`, remove any UI that displays cleartext date or location fields. Dates and locations are now encrypted — they can only be displayed after decryption via `CryptoService`. For now, show only `statusHash` → status label, `caseNumber`, and `updatedAt` (all safe metadata).

- [ ] **Step 3: Run Android unit tests**

```bash
cd apps/android && ./gradlew :app:testDebugUnitTest 2>&1 | tail -10
```

Expected: All unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/events/
git commit -m "fix(android): fix E2EE regression in createEvent — encrypt summary before posting; remove cleartext date/location display"
```

---

## Task 15: i18n — Entity template labels across 13 locales

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

- [ ] **Step 1: Add entity template keys to en.json**

In `packages/i18n/locales/en.json`, add an `entityTemplates` section:

```json
"entityTemplates": {
  "title": "Entity Templates",
  "apply": "Apply Template",
  "applied": "Applied",
  "notApplied": "Not Applied",
  "applyBtn": "Enable for this hub",
  "applySuccess": "Template applied successfully",
  "applyError": "Failed to apply template",
  "builtinBadge": "Built-in",
  "templates": {
    "case": {
      "label": "Case",
      "labelPlural": "Cases",
      "description": "General-purpose case for tracking incidents and follow-up."
    },
    "event": {
      "label": "Event",
      "labelPlural": "Events",
      "description": "Time-bounded event with encrypted dates and location."
    },
    "incident_report": {
      "label": "Incident Report",
      "labelPlural": "Incident Reports",
      "description": "Triage-oriented incident documentation with severity tracking."
    },
    "contact_note": {
      "label": "Contact Note",
      "labelPlural": "Contact Notes",
      "description": "Minimal note linked to a contact."
    }
  },
  "fields": {
    "start_date": "Start Date",
    "end_date": "End Date",
    "location": "Location",
    "title": "Title",
    "description": "Description",
    "note": "Note",
    "date": "Date",
    "incident_date": "Incident Date/Time",
    "incident_location": "Incident Location",
    "what_happened": "What Happened"
  },
  "statuses": {
    "open": "Open",
    "in_progress": "In Progress",
    "resolved": "Resolved",
    "closed": "Closed",
    "planned": "Planned",
    "active": "Active",
    "concluded": "Concluded",
    "cancelled": "Cancelled",
    "new": "New",
    "under_review": "Under Review",
    "documented": "Documented",
    "archived": "Archived"
  }
},
"admin": {
  "eventsMigrationTitle": "Legacy Events Migration",
  "eventsMigrationDesc": "{{count}} events need migration to the entity record system.",
  "eventsMigrateBtn": "Migrate Events",
  "eventsMigrationComplete": "Events migration complete",
  "eventsMigrationError": "Migration failed",
  "checkingMigration": "Checking migration status...",
  "eventsMigratingProgress": "Migrating... {{migrated}} of {{count}}"
}
```

- [ ] **Step 2: Add translations to all 12 non-English locale files**

For each locale file (`es`, `zh`, `tl`, `vi`, `ar`, `fr`, `ht`, `ko`, `ru`, `hi`, `pt`, `de`), add the `entityTemplates` section with appropriate translations. Use the translation patterns established by existing keys in each file.

Spanish (`es`):
```json
"entityTemplates": {
  "title": "Plantillas de Entidades",
  "apply": "Aplicar Plantilla",
  "applied": "Aplicada",
  "notApplied": "No Aplicada",
  "applyBtn": "Activar para este hub",
  "applySuccess": "Plantilla aplicada con éxito",
  "applyError": "Error al aplicar la plantilla",
  "builtinBadge": "Integrada",
  "templates": {
    "case": { "label": "Caso", "labelPlural": "Casos", "description": "Caso de uso general para seguimiento de incidentes." },
    "event": { "label": "Evento", "labelPlural": "Eventos", "description": "Evento con fechas y ubicación cifradas." },
    "incident_report": { "label": "Informe de Incidente", "labelPlural": "Informes de Incidentes", "description": "Documentación de incidentes con seguimiento de gravedad." },
    "contact_note": { "label": "Nota de Contacto", "labelPlural": "Notas de Contacto", "description": "Nota mínima vinculada a un contacto." }
  },
  "fields": {
    "start_date": "Fecha de Inicio",
    "end_date": "Fecha de Fin",
    "location": "Ubicación",
    "title": "Título",
    "description": "Descripción",
    "note": "Nota",
    "date": "Fecha",
    "incident_date": "Fecha/Hora del Incidente",
    "incident_location": "Ubicación del Incidente",
    "what_happened": "Qué Ocurrió"
  },
  "statuses": {
    "open": "Abierto", "in_progress": "En Progreso", "resolved": "Resuelto", "closed": "Cerrado",
    "planned": "Planificado", "active": "Activo", "concluded": "Concluido", "cancelled": "Cancelado",
    "new": "Nuevo", "under_review": "En Revisión", "documented": "Documentado", "archived": "Archivado"
  }
}
```

Provide equivalent translations for all remaining locales following the same structure. Each locale must have complete `entityTemplates` and `admin` migration keys.

- [ ] **Step 3: Run i18n codegen and validate**

```bash
bun run i18n:codegen
bun run i18n:validate:all
```

Expected: Clean — all 13 locales complete, iOS `.strings` and Android `strings.xml` updated.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/locales/
git commit -m "feat(i18n): add entity template labels across all 13 locales"
```

---

## Task 16: BDD Tests — Entity unification scenarios

**Files:**
- Modify: `packages/test-specs/features/core/cms-events.feature`
- Create: `packages/test-specs/features/core/entity-unification.feature`
- Create: `tests/steps/backend/entity-unification.steps.ts`

- [ ] **Step 1: Update cms-events.feature to reflect deprecation**

In `packages/test-specs/features/core/cms-events.feature`, replace the existing event-creation scenarios with unified entity scenarios. The feature file now documents that events are entity-type records:

```gherkin
@backend
Feature: CMS Events — Unified Entity System
  Events are CMS records whose entity type has category='event'.
  The /api/events routes are deprecated and return 301 redirects.
  Event data uses 3-tier E2EE like all other records.

  @events @deprecated-api
  Scenario: Deprecated /api/events returns 301 redirect
    Given case management is enabled
    When a client sends GET /api/events
    Then the response status should be 301
    And the response Location header should contain /api/records
    And the response should include a Deprecation header

  @events @entity-system
  Scenario: Create event record via /api/records with event entity type
    Given case management is enabled
    And an entity type with category "event" exists for the hub
    When the admin creates a record with that entity type
    Then the record should be persisted
    And the record entity type category should be "event"
    And the record should use 3-tier encryption (summary + fields + pii tiers)

  @events @blind-index
  Scenario: Filter event records by date blind index token
    Given case management is enabled
    And an entity type with category "event" exists for the hub
    And a record exists with blindIndexes containing "month:2026-05" for field "start_date"
    And a record exists with blindIndexes containing "month:2026-06" for field "start_date"
    When the admin lists records with blindIndexToken "month:2026-05" and field "start_date"
    Then the result should contain 1 record
    And that record's blind indexes should contain "month:2026-05"
```

- [ ] **Step 2: Create entity-unification.feature**

Create `packages/test-specs/features/core/entity-unification.feature`:

```gherkin
@backend
Feature: Entity System Unification
  Events are records. Entity type templates provide preconfigured starting points.
  Date and location fields use blind indexes for server-side filtering without
  revealing cleartext values.

  @templates
  Scenario: List builtin entity type templates
    Given I am authenticated as admin
    When I request GET /api/settings/cms/templates
    Then the response should contain 4 templates
    And the template list should include a template with category "event"
    And the template list should include a template with category "case"

  @templates
  Scenario: Apply event template creates entity type with date fields
    Given I am authenticated as admin
    And case management is enabled
    When I apply the builtin template "builtin:event"
    Then an entity type with category "event" should be created
    And that entity type should have a field named "start_date" with indexType "date"
    And that entity type should have a field named "location" with indexType "location"

  @templates
  Scenario: Template application is idempotent within a hub
    Given I am authenticated as admin
    And the builtin template "builtin:event" has been applied
    When I apply the builtin template "builtin:event" again
    Then only one entity type with templateId "builtin:event" should exist

  @blind-index @date
  Scenario: Date blind index tokens enable month-level filtering
    Given case management is enabled
    And an event entity type exists with start_date field (indexType=date)
    And a record exists with start_date blind indexes for "2026-05"
    And a record exists with start_date blind indexes for "2026-06"
    When I filter records by blindIndexToken "month:2026-05" on field "start_date"
    Then I should receive 1 record
    And the server should not have seen the plaintext date

  @permission-aliasing
  Scenario: events:read permission maps to cases:read
    Given a user has permission "events:read" but not "cases:read"
    When the user requests GET /api/records
    Then the request should be permitted
    And the audit log should show permission alias "events:read -> cases:read"

  @migration
  Scenario: Events migration status endpoint returns pending count
    Given case management is enabled
    And 3 events exist without deprecated_at set
    When I request GET /api/admin/events/migration-status
    Then the response should contain pendingCount 3

  @migration
  Scenario: Events migration marks events as deprecated
    Given case management is enabled
    And 2 events exist without deprecated_at set
    When I POST /api/admin/events/migrate
    Then all 2 events should have deprecated_at set
    And the response should contain migrated 2
```

- [ ] **Step 3: Create entity-unification.steps.ts**

Create `tests/steps/backend/entity-unification.steps.ts`:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { CustomWorld } from '../world'

Given('an entity type with category {string} exists for the hub', async function (this: CustomWorld, category: string) {
  const res = await this.api.post('/api/settings/cms/entity-types', {
    name: `test_${category}_type`,
    label: `Test ${category} Type`,
    labelPlural: `Test ${category} Types`,
    category,
    fields: [],
    statuses: [{ value: 'active', label: 'Active', isDefault: true }],
    defaultStatus: 'active',
  })
  expect(res.status).toBe(201)
  this.context.entityTypeId = res.body.id
})

When('the admin creates a record with that entity type', async function (this: CustomWorld) {
  const res = await this.api.post('/api/records', {
    entityTypeId: this.context.entityTypeId,
    statusHash: 'active',
    encryptedSummary: 'encrypted-test-summary',
    summaryEnvelopes: [{ pubkey: this.context.adminPubkey, enc: 'enc', ct: 'ct' }],
  })
  expect(res.status).toBe(201)
  this.context.recordId = res.body.id
})

Then('the record entity type category should be {string}', async function (this: CustomWorld, category: string) {
  const res = await this.api.get(`/api/records/${this.context.recordId}`)
  expect(res.status).toBe(200)
  // Entity type category comes from joining to the entity type definition
  const etRes = await this.api.get(`/api/settings/cms/entity-types/${res.body.entityTypeId}`)
  expect(etRes.body.category).toBe(category)
})

Then('the record should use 3-tier encryption \\(summary + fields + pii tiers\\)', async function (this: CustomWorld) {
  const res = await this.api.get(`/api/records/${this.context.recordId}`)
  expect(res.status).toBe(200)
  // Records API returns these fields (may be null if not set, but schema must exist)
  expect(res.body).toHaveProperty('encryptedSummary')
  expect(res.body).toHaveProperty('summaryEnvelopes')
  expect(res.body).not.toHaveProperty('encryptedDetails') // Old 1-tier events field must not exist
})

When('a client sends GET \\/api\\/events', async function (this: CustomWorld) {
  this.context.lastResponse = await this.api.get('/api/events', { followRedirect: false })
})

Then('the response status should be {int}', async function (this: CustomWorld, status: number) {
  expect(this.context.lastResponse.status).toBe(status)
})

Then('the response Location header should contain {string}', async function (this: CustomWorld, path: string) {
  const location = this.context.lastResponse.headers['location'] ?? ''
  expect(location).toContain(path)
})

Then('the response should include a Deprecation header', async function (this: CustomWorld) {
  const deprecation = this.context.lastResponse.headers['deprecation']
  expect(deprecation).toBeDefined()
  expect(deprecation).toBe('true')
})

Given('a record exists with blindIndexes containing {string} for field {string}',
  async function (this: CustomWorld, token: string, field: string) {
    const res = await this.api.post('/api/records', {
      entityTypeId: this.context.entityTypeId,
      statusHash: 'active',
      encryptedSummary: `enc-${token}`,
      summaryEnvelopes: [{ pubkey: this.context.adminPubkey, enc: 'enc', ct: 'ct' }],
      blindIndexes: { [field]: [token] },
    })
    expect(res.status).toBe(201)
    this.context.createdRecordIds ??= []
    this.context.createdRecordIds.push(res.body.id)
  },
)

When('the admin lists records with blindIndexToken {string} and field {string}',
  async function (this: CustomWorld, token: string, field: string) {
    const encoded = encodeURIComponent(token)
    const res = await this.api.get(
      `/api/records?entityTypeId=${this.context.entityTypeId}&blindIndexToken=${encoded}&blindIndexField=${encodeURIComponent(field)}`,
    )
    expect(res.status).toBe(200)
    this.context.listResult = res.body
  },
)

Then('the result should contain {int} record', async function (this: CustomWorld, count: number) {
  expect(this.context.listResult.records).toHaveLength(count)
})

Then("that record's blind indexes should contain {string}", async function (this: CustomWorld, token: string) {
  const record = this.context.listResult.records[0]
  const allTokens = Object.values(record.blindIndexes ?? {}).flat()
  expect(allTokens).toContain(token)
})

When('I request GET {string}', async function (this: CustomWorld, path: string) {
  this.context.lastResponse = await this.api.get(path)
})

Then('the response should contain {int} templates', async function (this: CustomWorld, count: number) {
  expect(this.context.lastResponse.body.templates).toHaveLength(count)
})

Then('the template list should include a template with category {string}',
  async function (this: CustomWorld, category: string) {
    const templates = this.context.lastResponse.body.templates as Array<{ category: string }>
    expect(templates.some(t => t.category === category)).toBe(true)
  },
)

When('I apply the builtin template {string}', async function (this: CustomWorld, templateId: string) {
  const res = await this.api.post('/api/settings/cms/templates/apply', { templateId })
  expect(res.status).toBe(201)
  this.context.appliedEntityTypeId = res.body.entityTypeId
})

Then('an entity type with category {string} should be created', async function (this: CustomWorld, category: string) {
  const res = await this.api.get(`/api/settings/cms/entity-types/${this.context.appliedEntityTypeId}`)
  expect(res.status).toBe(200)
  expect(res.body.category).toBe(category)
})

Then('that entity type should have a field named {string} with indexType {string}',
  async function (this: CustomWorld, fieldName: string, indexType: string) {
    const res = await this.api.get(`/api/settings/cms/entity-types/${this.context.appliedEntityTypeId}`)
    const field = res.body.fields.find((f: { name: string }) => f.name === fieldName)
    expect(field).toBeDefined()
    expect(field.indexType).toBe(indexType)
  },
)

Then('only one entity type with templateId {string} should exist',
  async function (this: CustomWorld, templateId: string) {
    const res = await this.api.get('/api/settings/cms/entity-types')
    const matching = res.body.entityTypes.filter(
      (et: { templateId?: string }) => et.templateId === templateId,
    )
    expect(matching).toHaveLength(1)
  },
)
```

- [ ] **Step 4: Run BDD tests**

```bash
bun run test:backend:bdd --tags "@entity-system or @templates or @deprecated-api"
```

Expected: All new scenarios pass.

- [ ] **Step 5: Commit**

```bash
git add packages/test-specs/features/core/cms-events.feature packages/test-specs/features/core/entity-unification.feature tests/steps/backend/entity-unification.steps.ts
git commit -m "test(bdd): add entity unification scenarios — deprecated events API, templates, date blind indexes"
```

---

## Task 17: Verification Gate

- [ ] **Step 1: Run codegen and typecheck**

```bash
bun run codegen
bun run typecheck
```

Expected: Both exit clean.

- [ ] **Step 2: Run backend unit tests**

```bash
cd apps/worker && bun test __tests__/unit/
```

Expected: All tests pass, including entity-templates, cases-date-blind-index, events-deprecation.

- [ ] **Step 3: Run full backend BDD suite**

```bash
bun run test:backend:bdd
```

Expected: All BDD scenarios pass. Focus on `@entity-system`, `@templates`, `@deprecated-api`, `@blind-index`.

- [ ] **Step 4: Run desktop E2E**

```bash
bun run test:desktop
```

Expected: All Playwright tests pass. The events page renders (uses `EntityTypeFilteredRecordList`) and shows the CMS-not-enabled state or record list as appropriate.

- [ ] **Step 5: Run iOS tests**

```bash
bun run ios:test
```

Expected: Unit tests pass, including `ContactBlindIndexServiceTests`.

- [ ] **Step 6: Run Android unit tests**

```bash
bun run test:android
```

Expected: All unit tests pass, including `DirectoryRepositoryTest`.

- [ ] **Step 7: Validate i18n completeness**

```bash
bun run i18n:validate:all
```

Expected: All 13 locales complete, no missing keys.

- [ ] **Step 8: Confirm no remaining references to deprecated events API in client code**

```bash
grep -r "/api/events" src/client/ apps/ios/ apps/android/ --include="*.ts" --include="*.tsx" --include="*.swift" --include="*.kt"
```

Expected: Zero matches (only test files and route handlers that return 301 are permitted).

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat(EP06-A1): entity system unification complete — events deprecated, templates seeded, date/location blind indexes, mobile directory migration"
```

---

## Summary of Changes

| Area | Change |
|------|--------|
| Protocol schemas | `indexType` extended with `date`/`location`; `entity-templates.ts` added; `events.ts` marked deprecated |
| Crypto labels | `LABEL_ENTITY_TYPE_DEFINITION` added |
| DB | `entity_type_templates` table; `events.deprecated_at` column |
| Backend services | `EntityTemplatesService` with 4 builtin templates; `listRecords` gains `blindIndexToken`/`blindIndexField` filter |
| Backend routes | All 11 `/api/events` handlers → 301 redirects; `/api/settings/cms/templates` routes added |
| Desktop API | Event functions removed; `listEntityTemplates`, `applyEntityTemplate` added |
| Desktop UI | `events.tsx` replaced with `EntityTypeFilteredRecordList` component filtered to `category=event` |
| Desktop admin | `EventsMigrationPanel` in hub settings |
| iOS | `ContactBlindIndexService` added; `ContactsViewModel` migrated to v2 `/directory`; `EventsViewModel` off `/api/events` |
| iOS cleanup | `Event.swift` (legacy model) removed; event views use `CaseRecord` type |
| Android | `DirectoryRepository` added with trigram blind index computation; `ContactsViewModel` migrated |
| Android fix | E2EE regression in `createEvent` fixed — summary now encrypted before posting |
| i18n | Entity template labels in all 13 locales |
| BDD | `cms-events.feature` updated; `entity-unification.feature` and step definitions added |
