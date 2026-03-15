# Epic 315: Entity Schema Engine

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: Epic 316, 317, 318, 319, 320, 321, 329
**Branch**: `desktop`

## Background Documents

- [Data Model Reference](../plans/2026-03-14-case-management-data-model.md) — entity schemas, encryption strategy, blind indexes, telephony-CRM integration
- [Use Case Catalog](../plans/2026-03-14-case-management-use-cases.md) — 12 organization types with field definitions
- [RBAC Matrix](../plans/2026-03-14-case-management-rbac-matrix.md) — 3-layer access control, envelope decision matrix
- [Template Catalog](../plans/2026-03-14-case-management-templates.md) — pre-built template definitions
- [Epic Plan](../plans/2026-03-14-case-management-epic-plan.md) — 18-epic dependency graph

## Summary

Build the core schema system that powers the entire case management feature — `EntityTypeDefinition`, `RelationshipTypeDefinition`, `EnumDefinition`, and `EntityFieldDefinition`. These JSON-based schema definitions, stored in SettingsDO, define what entity types exist in a hub, what fields they have, how they relate to each other, and who can access them. This is the equivalent of SugarCRM's module/vardef system or Primero's form/field system, but designed for E2EE. Includes the `caseManagementEnabled` feature toggle, new permission domains, new crypto labels, and CRUD API for managing schemas. ~15 files modified/created.

## Problem Statement

Llamenos currently tracks hotline interactions via Notes (call notes), Conversations (messaging), and Reports (incident reports). There is no way to:
- Track a person through a multi-step process (arrest → arraignment → release)
- Organize interactions into cases with lifecycle states
- Define custom entity types with domain-specific fields (jail support, street medic, immigration)
- Link contacts to cases with role metadata (arrestee, attorney, support contact)
- Configure the system for different organization types without code changes

The existing `CustomFieldDefinition` and `ReportType` systems prove the pattern works — they just need to be generalized into a universal entity schema engine that supports arbitrary entity types, relationships, and field configurations.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: New Crypto Labels

**File**: `packages/protocol/crypto-labels.json`

Add 12 new domain separation labels for case management:

```json
{
  "LABEL_CONTACT_PROFILE": "llamenos:contact-profile",
  "LABEL_CASE_SUMMARY": "llamenos:case-summary",
  "LABEL_CASE_FIELDS": "llamenos:case-fields",
  "LABEL_EVENT_DETAILS": "llamenos:event-details",
  "LABEL_BLIND_INDEX_KEY": "llamenos:blind-index-key",
  "LABEL_CROSS_HUB_SHARE": "llamenos:cross-hub-share",
  "HMAC_CONTACT_NAME": "llamenos:contact-name",
  "HMAC_CONTACT_TAG": "llamenos:contact-tag",
  "HMAC_CASE_STATUS": "llamenos:case-status",
  "HMAC_CASE_SEVERITY": "llamenos:case-severity",
  "HMAC_CASE_CATEGORY": "llamenos:case-category",
  "HMAC_EVENT_TYPE": "llamenos:event-type"
}
```

Run `bun run codegen` to generate TS/Swift/Kotlin constants.

#### Task 2: New Permission Domains

**File**: `packages/shared/permissions.ts`

Add case management permissions to `PERMISSION_CATALOG`:

```typescript
// Cases / Records
'cases:create': 'Create new cases/records',
'cases:read-own': 'Read records assigned to self',
'cases:read-assigned': 'Read records assigned to self or team',
'cases:read-all': 'Read all records in hub',
'cases:update-own': 'Update records assigned to self',
'cases:update': 'Update any record',
'cases:close': 'Close/resolve records',
'cases:delete': 'Delete records',
'cases:assign': 'Assign records to volunteers',
'cases:link': 'Link records to reports/events/contacts',
'cases:manage-types': 'Create/edit entity type definitions',
'cases:import': 'Bulk import records',
'cases:export': 'Bulk export records',

// Contacts (extend existing contacts:view, contacts:view-history)
'contacts:create': 'Create new contacts',
'contacts:edit': 'Edit contact profiles',
'contacts:delete': 'Delete contacts',
'contacts:merge': 'Merge duplicate contacts',
'contacts:view-pii': 'View contact PII (name, phone, demographics)',
'contacts:manage-relationships': 'Manage contact relationships',
'contacts:manage-groups': 'Manage affinity groups',

// Events
'events:create': 'Create events',
'events:read': 'View events',
'events:update': 'Update events',
'events:delete': 'Delete events',
'events:link': 'Link events to records/reports',

// Evidence
'evidence:upload': 'Upload evidence files to records',
'evidence:download': 'Download evidence from records',
'evidence:manage-custody': 'Manage chain of custody records',
'evidence:delete': 'Delete evidence files',
```

Update default roles:
- `role-hub-admin`: add `cases:*`, `contacts:*`, `events:*`, `evidence:*`
- `role-volunteer`: add `cases:create`, `cases:read-own`, `cases:update-own`, `contacts:view`, `events:read`, `evidence:upload`
- `role-reviewer`: add `cases:read-assigned`, `cases:update`, `contacts:view`, `contacts:view-pii`, `events:read`, `evidence:download`

#### Task 3: Schema Definition Types (Zod Schemas)

**File**: `apps/worker/schemas/entity-schema.ts` (new)

Define Zod schemas for all schema definition types. These are the types that describe the STRUCTURE of entities, not the entity data itself.

```typescript
import { z } from 'zod'

// --- Reusable building blocks ---

export const enumOptionSchema = z.object({
  value: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(50),
  label: z.string().max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  order: z.number().int().min(0),
  isDefault: z.boolean().optional(),
  isClosed: z.boolean().optional(),
  isDeprecated: z.boolean().optional(),
})

export type EnumOption = z.infer<typeof enumOptionSchema>

// --- Entity Field Definition ---

export const entityFieldDefinitionSchema = z.object({
  id: z.uuid(),
  name: z.string().regex(/^[a-zA-Z0-9_]+$/).max(50),
  label: z.string().max(200),
  type: z.enum([
    'text', 'number', 'select', 'multiselect', 'checkbox',
    'textarea', 'date', 'file',
  ]),
  required: z.boolean().default(false),
  options: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    label: z.string().max(200),
  })).optional(),
  lookupId: z.string().optional(),
  validation: z.object({
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional(),
  section: z.string().max(100).optional(),
  helpText: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  order: z.number().int().min(0),

  // Blind index configuration
  indexable: z.boolean().default(false),
  indexType: z.enum(['exact', 'none']).default('none'),

  // Access control
  accessLevel: z.enum(['all', 'admin', 'assigned', 'custom']).default('all'),
  accessRoles: z.array(z.string()).optional(),

  // Visibility rules
  visibleToVolunteers: z.boolean().default(true),
  editableByVolunteers: z.boolean().default(true),

  // Conditional display
  showWhen: z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'is_set']),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }).optional(),

  // Template tracking
  templateId: z.string().optional(),
  hubEditable: z.boolean().default(true),
})

export type EntityFieldDefinition = z.infer<typeof entityFieldDefinitionSchema>

// --- Entity Type Definition ---

export const entityTypeDefinitionSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),

  name: z.string().regex(/^[a-zA-Z0-9_]+$/).max(100),
  label: z.string().max(200),
  labelPlural: z.string().max(200),
  description: z.string().max(1000),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  category: z.enum(['contact', 'case', 'event', 'custom']),

  templateId: z.string().optional(),
  templateVersion: z.string().optional(),

  fields: z.array(entityFieldDefinitionSchema).max(100),

  statuses: z.array(enumOptionSchema).min(1).max(50),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()),

  severities: z.array(enumOptionSchema).max(20).optional(),
  defaultSeverity: z.string().optional(),

  categories: z.array(enumOptionSchema).max(50).optional(),

  contactRoles: z.array(enumOptionSchema).max(20).optional(),

  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  numberingEnabled: z.boolean().default(false),

  defaultAccessLevel: z.enum(['assigned', 'team', 'hub']).default('assigned'),
  piiFields: z.array(z.string()).default([]),

  allowSubRecords: z.boolean().default(false),
  allowFileAttachments: z.boolean().default(true),
  allowInteractionLinks: z.boolean().default(true),
  showInNavigation: z.boolean().default(true),
  showInDashboard: z.boolean().default(false),

  accessRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),

  isArchived: z.boolean().default(false),
  isSystem: z.boolean().default(false),

  createdAt: z.string(),
  updatedAt: z.string(),
})

export type EntityTypeDefinition = z.infer<typeof entityTypeDefinitionSchema>

// --- Relationship Type Definition ---

export const relationshipTypeDefinitionSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),

  sourceEntityTypeId: z.string(),
  targetEntityTypeId: z.string(),

  cardinality: z.enum(['1:1', '1:N', 'M:N']),

  label: z.string().max(200),
  reverseLabel: z.string().max(200),
  sourceLabel: z.string().max(200),
  targetLabel: z.string().max(200),

  roles: z.array(enumOptionSchema).max(20).optional(),
  defaultRole: z.string().optional(),

  joinFields: z.array(entityFieldDefinitionSchema).max(20).optional(),

  cascadeDelete: z.boolean().default(false),
  required: z.boolean().default(false),

  templateId: z.string().optional(),
  isSystem: z.boolean().default(false),

  createdAt: z.string(),
  updatedAt: z.string(),
})

export type RelationshipTypeDefinition = z.infer<typeof relationshipTypeDefinitionSchema>

// --- Input schemas for CRUD ---

export const createEntityTypeBodySchema = entityTypeDefinitionSchema.omit({
  id: true,
  hubId: true,
  createdAt: true,
  updatedAt: true,
})

export const updateEntityTypeBodySchema = createEntityTypeBodySchema.partial()

export const createRelationshipTypeBodySchema = relationshipTypeDefinitionSchema.omit({
  id: true,
  hubId: true,
  createdAt: true,
  updatedAt: true,
})

export const updateRelationshipTypeBodySchema = createRelationshipTypeBodySchema.partial()
```

#### Task 4: SettingsDO Entity Schema Storage

**File**: `apps/worker/durable-objects/settings-do.ts`

Add storage and methods for entity type definitions and relationship types:

```typescript
// New storage keys:
// caseManagementEnabled → boolean
// entityTypes → EntityTypeDefinition[]
// relationshipTypes → RelationshipTypeDefinition[]
// caseNumberSeq:{prefix}:{year} → number (monotonic counter)

// New DORouter routes:
router.get('/settings/case-management', async () => {
  const enabled = await storage.get('caseManagementEnabled') ?? false
  return json({ enabled })
})

router.put('/settings/case-management', async (req) => {
  const { enabled } = await req.json()
  await storage.put('caseManagementEnabled', enabled)
  return json({ enabled })
})

// Entity Type CRUD
router.get('/settings/entity-types', async () => {
  const types = await storage.get('entityTypes') ?? []
  return json({ entityTypes: types })
})

router.post('/settings/entity-types', async (req) => {
  const body = await req.json()
  const types = await storage.get('entityTypes') ?? []
  const newType = {
    ...body,
    id: crypto.randomUUID(),
    hubId: '<from context>',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  types.push(newType)
  await storage.put('entityTypes', types)
  return json(newType, { status: 201 })
})

router.patch('/settings/entity-types/:id', async (req) => {
  const { id } = req.params
  const body = await req.json()
  const types = await storage.get('entityTypes') ?? []
  const idx = types.findIndex(t => t.id === id)
  if (idx === -1) return json({ error: 'Not found' }, { status: 404 })
  types[idx] = { ...types[idx], ...body, updatedAt: new Date().toISOString() }
  await storage.put('entityTypes', types)
  return json(types[idx])
})

router.delete('/settings/entity-types/:id', async (req) => {
  const { id } = req.params
  const types = await storage.get('entityTypes') ?? []
  const filtered = types.filter(t => t.id !== id)
  if (filtered.length === types.length) return json({ error: 'Not found' }, { status: 404 })
  await storage.put('entityTypes', filtered)
  return json({ deleted: true })
})

// Relationship Type CRUD (same pattern)
router.get('/settings/relationship-types', ...)
router.post('/settings/relationship-types', ...)
router.patch('/settings/relationship-types/:id', ...)
router.delete('/settings/relationship-types/:id', ...)

// Case number sequence
router.post('/settings/case-number', async (req) => {
  const { prefix, year } = await req.json()
  const key = `caseNumberSeq:${prefix}:${year}`
  const current = (await storage.get(key) ?? 0) as number
  const next = current + 1
  await storage.put(key, next)
  return json({ number: `${prefix}-${year}-${String(next).padStart(4, '0')}` })
})
```

#### Task 5: API Routes for Entity Schema Management

**File**: `apps/worker/routes/entity-schema.ts` (new)

Hono routes proxying to SettingsDO:

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { validator } from 'hono-openapi'
import {
  createEntityTypeBodySchema,
  updateEntityTypeBodySchema,
  createRelationshipTypeBodySchema,
  updateRelationshipTypeBodySchema,
} from '../schemas/entity-schema'
import { audit } from '../services/audit'

const entitySchema = new Hono<AppEnv>()

// Feature toggle
entitySchema.get('/case-management',
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.settings.fetch(new Request('http://do/settings/case-management'))
    return new Response(res.body, res)
  },
)

entitySchema.put('/case-management',
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = await c.req.json()
    const res = await dos.settings.fetch(new Request('http://do/settings/case-management', {
      method: 'PUT',
      body: JSON.stringify(body),
    }))
    await audit(dos.records, 'caseManagementToggled', c.get('pubkey'), body)
    return new Response(res.body, res)
  },
)

// Entity types
entitySchema.get('/entity-types',
  requirePermission('settings:read'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.settings.fetch(new Request('http://do/settings/entity-types'))
    return new Response(res.body, res)
  },
)

entitySchema.post('/entity-types',
  requirePermission('cases:manage-types'),
  validator('json', createEntityTypeBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/entity-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
    const created = await res.json()
    await audit(dos.records, 'entityTypeCreated', c.get('pubkey'), { entityTypeId: created.id, name: created.name })
    return c.json(created, 201)
  },
)

entitySchema.patch('/entity-types/:id',
  requirePermission('cases:manage-types'),
  validator('json', updateEntityTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request(`http://do/settings/entity-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (!res.ok) return c.json({ error: 'Entity type not found' }, 404)
    await audit(dos.records, 'entityTypeUpdated', c.get('pubkey'), { entityTypeId: id })
    return new Response(res.body, res)
  },
)

entitySchema.delete('/entity-types/:id',
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.settings.fetch(new Request(`http://do/settings/entity-types/${id}`, {
      method: 'DELETE',
    }))
    if (!res.ok) return c.json({ error: 'Entity type not found' }, 404)
    await audit(dos.records, 'entityTypeDeleted', c.get('pubkey'), { entityTypeId: id })
    return new Response(res.body, res)
  },
)

// Relationship types (same CRUD pattern)
entitySchema.get('/relationship-types', requirePermission('settings:read'), ...)
entitySchema.post('/relationship-types', requirePermission('cases:manage-types'), ...)
entitySchema.patch('/relationship-types/:id', requirePermission('cases:manage-types'), ...)
entitySchema.delete('/relationship-types/:id', requirePermission('cases:manage-types'), ...)

// Case number generation
entitySchema.post('/case-number',
  requirePermission('cases:create'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = await c.req.json()
    const res = await dos.settings.fetch(new Request('http://do/settings/case-number', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
    return new Response(res.body, res)
  },
)

export default entitySchema
```

#### Task 6: Mount Routes in App

**File**: `apps/worker/app.ts`

```typescript
import entitySchema from './routes/entity-schema'

// Inside the authenticated route group:
app.route('/api/settings', entitySchema)
```

#### Task 7: Register Schemas for Protocol Codegen

**File**: `packages/protocol/tools/schema-registry.ts`

Add entity schema types to the codegen registry:

```typescript
import {
  entityTypeDefinitionSchema,
  entityFieldDefinitionSchema,
  relationshipTypeDefinitionSchema,
  enumOptionSchema,
  createEntityTypeBodySchema,
} from '@worker/schemas/entity-schema'

// Add to schema registry:
EntityTypeDefinition: toJSONSchema(entityTypeDefinitionSchema),
EntityFieldDefinition: toJSONSchema(entityFieldDefinitionSchema),
RelationshipTypeDefinition: toJSONSchema(relationshipTypeDefinitionSchema),
EnumOption: toJSONSchema(enumOptionSchema),
CreateEntityTypeBody: toJSONSchema(createEntityTypeBodySchema),
```

#### Task 8: Shared Types Export

**File**: `packages/shared/types.ts`

Re-export key types and add constants:

```typescript
export type { EntityTypeDefinition, EntityFieldDefinition, RelationshipTypeDefinition, EnumOption } from '@worker/schemas/entity-schema'

export const MAX_ENTITY_TYPES = 50
export const MAX_ENTITY_FIELDS = 100
export const MAX_RELATIONSHIP_TYPES = 100
export const MAX_ENUM_OPTIONS = 50
export const MAX_FIELD_SECTIONS = 20

export type EntityCategory = 'contact' | 'case' | 'event' | 'custom'

export const ENTITY_CATEGORY_LABELS: Record<EntityCategory, string> = {
  contact: 'Contact',
  case: 'Case',
  event: 'Event',
  custom: 'Custom Record',
}
```

#### Task 9: i18n Strings

**File**: `packages/i18n/locales/en.json` (+ propagate to all 13 locales)

```json
{
  "caseManagement": {
    "title": "Case Management",
    "enabled": "Case management enabled",
    "disabled": "Case management disabled",
    "enableDescription": "Enable case management to track contacts, cases, and events.",
    "entityTypes": "Entity Types",
    "entityTypeEditor": "Entity Type Editor",
    "createEntityType": "Create Entity Type",
    "editEntityType": "Edit Entity Type",
    "deleteEntityType": "Delete Entity Type",
    "deleteConfirm": "Delete this entity type? Existing records will be preserved.",
    "relationshipTypes": "Relationship Types",
    "createRelationshipType": "Create Relationship Type",
    "fields": "Fields",
    "addField": "Add Field",
    "editField": "Edit Field",
    "statuses": "Statuses",
    "severities": "Severities",
    "categories": "Categories",
    "contactRoles": "Contact Roles",
    "numbering": "Case Numbering",
    "numberPrefix": "Number Prefix",
    "accessControl": "Access Control",
    "templates": "Templates",
    "applyTemplate": "Apply Template",
    "noEntityTypes": "No entity types configured. Apply a template or create one manually."
  }
}
```

#### Task 10: BDD Feature File

**File**: `packages/test-specs/features/core/entity-schema.feature`

```gherkin
@backend
Feature: Entity Schema Management
  Admins configure entity types and relationship types that define
  the hub's case management structure.

  Background:
    Given a registered admin "admin1"

  @cases
  Scenario: Enable case management for a hub
    When admin "admin1" enables case management
    Then the hub should have case management enabled
    And the response should include "enabled": true

  @cases
  Scenario: Create an entity type
    Given case management is enabled
    When admin "admin1" creates an entity type with:
      | name          | arrest_case              |
      | label         | Arrest Case              |
      | labelPlural   | Arrest Cases             |
      | category      | case                     |
      | numberPrefix  | JS                       |
    Then the entity type "arrest_case" should exist
    And it should have a generated UUID id
    And it should have category "case"

  @cases
  Scenario: Create entity type with statuses and fields
    Given case management is enabled
    When admin "admin1" creates an entity type with statuses:
      | value     | label      | order |
      | reported  | Reported   | 1     |
      | confirmed | Confirmed  | 2     |
      | released  | Released   | 3     |
    And custom fields:
      | name              | type    | required |
      | arrest_location   | text    | true     |
      | charges           | textarea| false    |
      | bail_amount       | number  | false    |
    Then the entity type should have 3 statuses
    And the entity type should have 3 fields

  @cases
  Scenario: Update entity type fields
    Given an entity type "arrest_case" exists
    When admin "admin1" adds a field "court_date" of type "text"
    Then the entity type should have the field "court_date"

  @cases
  Scenario: Delete entity type
    Given an entity type "test_type" exists with no records
    When admin "admin1" deletes the entity type "test_type"
    Then the entity type "test_type" should not exist

  @cases
  Scenario: Create a relationship type
    Given entity types "contact" and "arrest_case" exist
    When admin "admin1" creates a relationship type:
      | sourceEntityTypeId | contact       |
      | targetEntityTypeId | arrest_case   |
      | cardinality        | M:N           |
      | label              | Cases         |
      | reverseLabel       | Contacts      |
    Then the relationship type should exist linking "contact" to "arrest_case"

  @cases @permissions
  Scenario: Volunteer cannot manage entity types
    Given a registered volunteer "vol1"
    When volunteer "vol1" tries to create an entity type
    Then the response status should be 403

  @cases @permissions
  Scenario: New CMS permissions are available
    When admin "admin1" fetches the permission catalog
    Then the catalog should include "cases:create"
    And the catalog should include "contacts:create"
    And the catalog should include "events:create"
    And the catalog should include "evidence:upload"

  @cases
  Scenario: Generate case number
    Given an entity type "arrest_case" with numberPrefix "JS"
    When a case number is generated for "arrest_case"
    Then the case number should match pattern "JS-{year}-0001"
    When another case number is generated
    Then the case number should be "JS-{year}-0002"
```

#### Task 11: Backend Step Definitions

**File**: `tests/steps/backend/entity-schema.steps.ts`

Implement step definitions using the simulation framework and API helpers.

### Phase 2: Desktop UI

#### Desktop Entity Type Viewer

A simple read-only view in Settings that shows configured entity types. The full editor UI comes in Epic 329.

**File**: `src/client/components/admin-settings/entity-types-section.tsx` (new)

Renders the list of entity types with name, category icon, field count, and status count. "Enable Case Management" toggle at the top.

### Phase 3: Integration Gate

`bun run test:backend:bdd`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/schemas/entity-schema.ts` | Zod schemas for all schema definition types |
| `apps/worker/routes/entity-schema.ts` | Hono routes for entity schema CRUD |
| `packages/test-specs/features/core/entity-schema.feature` | BDD scenarios |
| `tests/steps/backend/entity-schema.steps.ts` | Backend step definitions |
| `src/client/components/admin-settings/entity-types-section.tsx` | Entity type list in settings |

## Files to Modify

| File | Change |
|------|--------|
| `packages/protocol/crypto-labels.json` | Add 12 new domain separation labels |
| `packages/shared/permissions.ts` | Add ~30 new CMS permissions, update default roles |
| `packages/shared/types.ts` | Re-export schema types, add constants |
| `packages/protocol/tools/schema-registry.ts` | Register new schemas for codegen |
| `apps/worker/durable-objects/settings-do.ts` | Add entity type/relationship type storage + case numbering |
| `apps/worker/app.ts` | Mount entity-schema routes |
| `packages/i18n/locales/en.json` | Add caseManagement i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |

## Testing

### Backend BDD (Phase 1 gate)

`bun run test:backend:bdd` — 10 scenarios in `entity-schema.feature`

### Typecheck

`bun run typecheck` — all new types must compile

### Codegen

`bun run codegen` — new crypto labels and schema types generated to TS/Swift/Kotlin

## Acceptance Criteria & Test Scenarios

- [ ] Case management can be enabled/disabled per hub
  -> `packages/test-specs/features/core/entity-schema.feature: "Enable case management for a hub"`
- [ ] Entity types can be created with name, category, statuses, and fields
  -> `packages/test-specs/features/core/entity-schema.feature: "Create entity type with statuses and fields"`
- [ ] Entity type fields can be added after creation
  -> `packages/test-specs/features/core/entity-schema.feature: "Update entity type fields"`
- [ ] Entity types can be deleted
  -> `packages/test-specs/features/core/entity-schema.feature: "Delete entity type"`
- [ ] Relationship types can be created between entity types
  -> `packages/test-specs/features/core/entity-schema.feature: "Create a relationship type"`
- [ ] Case numbers are generated with sequential numbering
  -> `packages/test-specs/features/core/entity-schema.feature: "Generate case number"`
- [ ] Only admins with `cases:manage-types` can modify schemas
  -> `packages/test-specs/features/core/entity-schema.feature: "Volunteer cannot manage entity types"`
- [ ] New CMS permissions exist in the catalog
  -> `packages/test-specs/features/core/entity-schema.feature: "New CMS permissions are available"`
- [ ] 12 new crypto labels generated via codegen
  -> `bun run codegen` succeeds
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/entity-schema.feature` | New | 10 scenarios for schema CRUD |
| `tests/steps/backend/entity-schema.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Low risk**: Crypto labels (Task 1) — additive, no existing code changes
- **Low risk**: Permissions (Task 2) — additive, extends existing catalog
- **Low risk**: Zod schemas (Task 3) — new types, no existing type changes
- **Medium risk**: SettingsDO changes (Task 4) — extends existing DO with new storage keys. Risk mitigated by using separate storage keys (no collision with existing data).
- **Low risk**: Routes (Task 5) — new route file, no existing route changes

## Execution

- **Phase 1**: Sequential (crypto labels → permissions → schemas → DO storage → routes → mount → codegen → i18n → BDD specs → step defs → gate)
- **Phase 2**: Desktop UI (entity type list in settings)
- **Phase 3**: `bun run test:backend:bdd`
