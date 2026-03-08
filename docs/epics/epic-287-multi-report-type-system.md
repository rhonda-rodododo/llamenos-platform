# Epic 287: Multi-Report-Type System

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 286
**Blocks**: None
**Branch**: `desktop`

## Summary

Replace the flat `reportCategories[]` string array and global `customFields[]` with context-filtered reports with a first-class `ReportType` model. Each report type defines its own set of custom fields, so "Incident Report" can have location + severity + witnesses while "Welfare Check" has contact-info + followup-date. This is a schema evolution that requires a data migration (Epic 286) to convert existing data.

## Problem Statement

Currently, report "categories" and custom fields are decoupled:

1. **`reportCategories`** in SettingsDO is a `string[]` of display labels (e.g., `['Incident Report', 'Field Observation', 'Evidence', 'Other']`) — purely cosmetic, not tied to any data structure
2. **`customFields`** in SettingsDO is a flat `CustomFieldDefinition[]` where fields with `context: 'reports'` appear on ALL reports regardless of category
3. **No per-category field configuration** — an admin who wants different fields for "Incident Report" vs "Welfare Check" cannot achieve this
4. **Report category is stored as a plain string** in the conversation's `metadata.reportCategory` field, not as a foreign key to any structured object
5. **No report type management UI** — categories are just a string list with add/remove

This means:
- Every report shows the same custom fields, which is wrong for diverse report types
- Field requirements cannot vary by type (e.g., "location" required for incidents but not welfare checks)
- No description or documentation per report type
- Mobile clients cannot display type-specific field sets

## Implementation

### Step 1: Data Model — ReportType

**File: `packages/shared/types.ts`**

```typescript
/** A report type with its own custom field definitions */
export interface ReportType {
  /** Unique UUID */
  id: string
  /** Display name (e.g., "Incident Report") */
  name: string
  /** URL-safe identifier (e.g., "incident-report") */
  slug: string
  /** Description shown to reporters when selecting this type */
  description: string
  /** Custom fields specific to this report type */
  customFields: CustomFieldDefinition[]
  /** Whether this is the default type for new reports */
  isDefault: boolean
  /** Display order */
  order: number
  /** Soft-delete — archived types are hidden from creation but existing reports retain their type */
  archived: boolean
  createdAt: string
  updatedAt: string
}

export const MAX_REPORT_TYPES = 20
export const MAX_FIELDS_PER_REPORT_TYPE = 30
export const REPORT_TYPE_SLUG_REGEX = /^[a-z0-9-]+$/
```

### Step 2: Protocol Schema — report-types.json

**File: `packages/protocol/schemas/report-types.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://llamenos.org/schemas/report-types.json",
  "title": "Report Type Definitions",
  "description": "Report types with per-type custom field configurations",
  "$defs": {
    "ReportType": {
      "type": "object",
      "required": ["id", "name", "slug", "description", "customFields", "isDefault", "order", "archived", "createdAt", "updatedAt"],
      "properties": {
        "id": { "type": "string", "description": "Unique UUID" },
        "name": { "type": "string", "description": "Display name", "minLength": 1, "maxLength": 100 },
        "slug": { "type": "string", "description": "URL-safe identifier", "pattern": "^[a-z0-9-]+$", "minLength": 1, "maxLength": 50 },
        "description": { "type": "string", "description": "Description for reporters", "maxLength": 500 },
        "customFields": {
          "type": "array",
          "items": { "$ref": "notes.json#/$defs/CustomFieldDefinition" },
          "maxItems": 30,
          "description": "Custom fields specific to this report type"
        },
        "isDefault": { "type": "boolean", "description": "Whether this is the default type" },
        "order": { "type": "integer", "minimum": 0 },
        "archived": { "type": "boolean", "description": "Soft-deleted — hidden from creation" },
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" }
      },
      "additionalProperties": false
    }
  }
}
```

Run `bun run codegen` after adding this schema to generate TypeScript, Swift, and Kotlin types.

### Step 3: Data Migration (v2)

**File: `packages/shared/migrations/index.ts`** — append migration v2

```typescript
{
  version: 2,
  name: 'convert-report-categories-to-report-types',
  description: 'Converts the flat reportCategories[] string array and context:reports custom fields into structured ReportType[] objects. Each existing category becomes a ReportType; all existing reports custom fields are copied to every type.',
  async run(storage, options) {
    const reportCategories = await storage.get<string[]>('reportCategories')
    const customFields = await storage.get<CustomFieldDefinition[]>('customFields')

    // Only run in settings namespace — other DOs have nothing to migrate
    if (!reportCategories && !customFields) {
      options?.onProgress?.({ step: 1, totalSteps: 1, message: 'No report data to migrate — skipping' })
      return
    }

    const categories = reportCategories ?? ['Incident Report', 'Field Observation', 'Evidence', 'Other']
    const allFields = customFields ?? []
    const reportFields = allFields.filter(f => f.context === 'reports' || f.context === 'all')

    // For fields with context 'all', we copy them into each report type
    // but leave the original in customFields for call-notes/conversation-notes
    const reportOnlyFields = allFields.filter(f => f.context === 'reports')

    options?.onProgress?.({ step: 1, totalSteps: 3, message: `Converting ${categories.length} categories to report types` })

    const now = new Date().toISOString()
    const reportTypes: ReportType[] = categories.map((cat, i) => {
      const slug = cat
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        || `type-${i}`

      return {
        id: crypto.randomUUID(),
        name: cat,
        slug,
        description: '',
        // Each type gets a COPY of all report-context fields
        customFields: reportFields.map(f => ({ ...f })),
        isDefault: i === 0,
        order: i,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }
    })

    if (options?.dryRun) {
      options?.onProgress?.({ step: 3, totalSteps: 3, message: `Would create ${reportTypes.length} report types` })
      return
    }

    // Store the new report types
    options?.onProgress?.({ step: 2, totalSteps: 3, message: 'Writing report types' })
    await storage.put('reportTypes', reportTypes)

    // Remove reports-only custom fields from the global list (keep 'all' and other contexts)
    const remainingFields = allFields.filter(f => f.context !== 'reports')
    remainingFields.forEach((f, i) => f.order = i)
    await storage.put('customFields', remainingFields)

    // Keep reportCategories for backward compatibility reads (marked deprecated)
    // DO NOT delete it — old mobile clients may still read it until they update

    options?.onProgress?.({ step: 3, totalSteps: 3, message: `Created ${reportTypes.length} report types` })
  },

  async down(storage) {
    const reportTypes = await storage.get<ReportType[]>('reportTypes')
    if (!reportTypes || reportTypes.length === 0) return

    // Reconstruct reportCategories from report type names
    const categories = reportTypes.filter(rt => !rt.archived).map(rt => rt.name)
    await storage.put('reportCategories', categories)

    // Merge report type fields back into global custom fields with context:'reports'
    const existingFields = await storage.get<CustomFieldDefinition[]>('customFields') ?? []

    // Take fields from the first (default) report type to restore
    const defaultType = reportTypes.find(rt => rt.isDefault) ?? reportTypes[0]
    const restoredFields = defaultType.customFields.map(f => ({
      ...f,
      context: 'reports' as const,
    }))

    // De-duplicate by field name
    const existingNames = new Set(existingFields.map(f => f.name))
    const newFields = restoredFields.filter(f => !existingNames.has(f.name))
    const combined = [...existingFields, ...newFields]
    combined.forEach((f, i) => f.order = i)
    await storage.put('customFields', combined)

    // Remove report types
    await storage.delete('reportTypes')
  },
},
```

### Step 4: SettingsDO — Report Types CRUD

Replace the simple `reportCategories` routes with full `reportTypes` CRUD.

**File: `apps/worker/durable-objects/settings-do.ts`**

Remove the old routes:
```typescript
// REMOVE:
// this.router.get('/settings/report-categories', ...)
// this.router.put('/settings/report-categories', ...)
```

Add new routes:
```typescript
// --- Report Types ---
this.router.get('/settings/report-types', () => this.getReportTypes())
this.router.post('/settings/report-types', async (req) => this.createReportType(await req.json()))
this.router.patch('/settings/report-types/:id', async (req, { id }) => this.updateReportType(id, await req.json()))
this.router.delete('/settings/report-types/:id', (_req, { id }) => this.archiveReportType(id))
this.router.put('/settings/report-types/reorder', async (req) => this.reorderReportTypes(await req.json()))

// Backward-compatible: report-categories returns names derived from report types
this.router.get('/settings/report-categories', () => this.getReportCategoriesCompat())
```

Implement the methods:

```typescript
private async getReportTypes(): Promise<Response> {
  const types = await this.ctx.storage.get<ReportType[]>('reportTypes') ?? []
  return Response.json({ reportTypes: types })
}

private async createReportType(data: unknown): Promise<Response> {
  if (!data || typeof data !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 })
  }
  const { name, slug, description, customFields: fields } = data as Partial<ReportType>
  if (!name || !slug) {
    return new Response(JSON.stringify({ error: 'name and slug are required' }), { status: 400 })
  }
  if (!REPORT_TYPE_SLUG_REGEX.test(slug)) {
    return new Response(JSON.stringify({ error: 'slug must be lowercase alphanumeric with hyphens' }), { status: 400 })
  }

  const existing = await this.ctx.storage.get<ReportType[]>('reportTypes') ?? []
  if (existing.length >= MAX_REPORT_TYPES) {
    return new Response(JSON.stringify({ error: `Maximum ${MAX_REPORT_TYPES} report types` }), { status: 400 })
  }
  if (existing.some(rt => rt.slug === slug)) {
    return new Response(JSON.stringify({ error: `Report type slug "${slug}" already exists` }), { status: 409 })
  }

  // Validate custom fields within this type
  const typeFields = fields ?? []
  if (typeFields.length > MAX_FIELDS_PER_REPORT_TYPE) {
    return new Response(JSON.stringify({ error: `Maximum ${MAX_FIELDS_PER_REPORT_TYPE} fields per report type` }), { status: 400 })
  }
  // Validate each field (reuse existing validation logic)
  const fieldError = this.validateCustomFieldList(typeFields)
  if (fieldError) return fieldError

  const now = new Date().toISOString()
  const reportType: ReportType = {
    id: crypto.randomUUID(),
    name,
    slug,
    description: description ?? '',
    customFields: typeFields.map((f, i) => ({ ...f, order: i, context: 'reports' as const })),
    isDefault: existing.length === 0, // first type is default
    order: existing.length,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }

  existing.push(reportType)
  await this.ctx.storage.put('reportTypes', existing)
  return Response.json({ reportType }, { status: 201 })
}

private async updateReportType(id: string, data: unknown): Promise<Response> {
  const types = await this.ctx.storage.get<ReportType[]>('reportTypes') ?? []
  const idx = types.findIndex(rt => rt.id === id)
  if (idx === -1) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

  const updates = data as Partial<ReportType>
  const rt = types[idx]

  if (updates.name !== undefined) rt.name = updates.name
  if (updates.description !== undefined) rt.description = updates.description
  if (updates.isDefault === true) {
    // Only one default — unset others
    types.forEach(t => t.isDefault = false)
    rt.isDefault = true
  }
  if (updates.customFields !== undefined) {
    if (updates.customFields.length > MAX_FIELDS_PER_REPORT_TYPE) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_FIELDS_PER_REPORT_TYPE} fields` }), { status: 400 })
    }
    const fieldError = this.validateCustomFieldList(updates.customFields)
    if (fieldError) return fieldError
    rt.customFields = updates.customFields.map((f, i) => ({ ...f, order: i, context: 'reports' as const }))
  }

  rt.updatedAt = new Date().toISOString()
  types[idx] = rt
  await this.ctx.storage.put('reportTypes', types)
  return Response.json({ reportType: rt })
}

private async archiveReportType(id: string): Promise<Response> {
  const types = await this.ctx.storage.get<ReportType[]>('reportTypes') ?? []
  const idx = types.findIndex(rt => rt.id === id)
  if (idx === -1) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

  // Cannot archive the last non-archived type
  const activeCount = types.filter(rt => !rt.archived).length
  if (activeCount <= 1) {
    return new Response(JSON.stringify({ error: 'Cannot archive the last active report type' }), { status: 400 })
  }

  types[idx].archived = true
  types[idx].updatedAt = new Date().toISOString()

  // If archiving the default, promote the next active type
  if (types[idx].isDefault) {
    types[idx].isDefault = false
    const nextActive = types.find(rt => !rt.archived)
    if (nextActive) nextActive.isDefault = true
  }

  await this.ctx.storage.put('reportTypes', types)
  return Response.json({ ok: true })
}

private async reorderReportTypes(data: { ids: string[] }): Promise<Response> {
  const types = await this.ctx.storage.get<ReportType[]>('reportTypes') ?? []
  const byId = new Map(types.map(rt => [rt.id, rt]))
  const reordered = data.ids
    .map(id => byId.get(id))
    .filter((rt): rt is ReportType => rt !== undefined)
  reordered.forEach((rt, i) => { rt.order = i; rt.updatedAt = new Date().toISOString() })
  // Append any types not in the reorder list (shouldn't happen, but defensive)
  const reorderedIds = new Set(data.ids)
  const remaining = types.filter(rt => !reorderedIds.has(rt.id))
  remaining.forEach((rt, i) => rt.order = reordered.length + i)
  await this.ctx.storage.put('reportTypes', [...reordered, ...remaining])
  return Response.json({ ok: true })
}

// Backward-compatible endpoint for old mobile clients
private async getReportCategoriesCompat(): Promise<Response> {
  const types = await this.ctx.storage.get<ReportType[]>('reportTypes')
  if (types && types.length > 0) {
    const categories = types.filter(rt => !rt.archived).sort((a, b) => a.order - b.order).map(rt => rt.name)
    return Response.json({ categories })
  }
  // Fallback to legacy data if migration hasn't run yet
  const categories = await this.ctx.storage.get<string[]>('reportCategories') ?? ['Incident Report', 'Field Observation', 'Evidence', 'Other']
  return Response.json({ categories })
}

// Extract field validation into reusable method
private validateCustomFieldList(fields: CustomFieldDefinition[]): Response | null {
  const names = new Set<string>()
  for (const field of fields) {
    if (!field.name || !field.label || !field.type) {
      return new Response(JSON.stringify({ error: 'Each field must have name, label, and type' }), { status: 400 })
    }
    if (!FIELD_NAME_REGEX.test(field.name)) {
      return new Response(JSON.stringify({ error: `Invalid field name: ${field.name}` }), { status: 400 })
    }
    if (field.name.length > MAX_FIELD_NAME_LENGTH) {
      return new Response(JSON.stringify({ error: `Field name too long: ${field.name}` }), { status: 400 })
    }
    if (field.label.length > MAX_FIELD_LABEL_LENGTH) {
      return new Response(JSON.stringify({ error: `Field label too long` }), { status: 400 })
    }
    if (names.has(field.name)) {
      return new Response(JSON.stringify({ error: `Duplicate field name: ${field.name}` }), { status: 400 })
    }
    names.add(field.name)
    if (!['text', 'number', 'select', 'checkbox', 'textarea', 'file'].includes(field.type)) {
      return new Response(JSON.stringify({ error: `Invalid field type: ${field.type}` }), { status: 400 })
    }
    if (field.type === 'select') {
      if (!field.options || field.options.length === 0) {
        return new Response(JSON.stringify({ error: `Select field "${field.name}" must have options` }), { status: 400 })
      }
      if (field.options.length > MAX_SELECT_OPTIONS) {
        return new Response(JSON.stringify({ error: `Too many options for "${field.name}"` }), { status: 400 })
      }
    }
  }
  return null
}
```

### Step 5: API Client Updates

**File: `src/client/lib/api.ts`**

```typescript
// --- Report Types ---

export async function getReportTypes() {
  return request<{ reportTypes: ReportType[] }>(hp('/settings/report-types'))
}

export async function createReportType(data: { name: string; slug: string; description?: string; customFields?: CustomFieldDefinition[] }) {
  return request<{ reportType: ReportType }>(hp('/settings/report-types'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateReportType(id: string, data: Partial<ReportType>) {
  return request<{ reportType: ReportType }>(hp(`/settings/report-types/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function archiveReportType(id: string) {
  return request<{ ok: boolean }>(hp(`/settings/report-types/${id}`), {
    method: 'DELETE',
  })
}

export async function reorderReportTypes(ids: string[]) {
  return request<{ ok: boolean }>(hp('/settings/report-types/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })
}
```

### Step 6: ReportForm — Type Selector with Dynamic Fields

Replace the category dropdown with a report type selector that loads the type's custom fields.

**File: `src/client/components/ReportForm.tsx`**

Key changes:
1. Replace `categories` state with `reportTypes` state
2. When a type is selected, display that type's `customFields` instead of the global fields filtered by `context: 'reports'`
3. Pre-select the default type on open
4. Store `reportTypeId` and `reportTypeSlug` in the conversation metadata instead of `reportCategory`

```typescript
// Replace:
const [categories, setCategories] = useState<string[]>([])
const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
const [category, setCategory] = useState('')

// With:
const [reportTypes, setReportTypes] = useState<ReportType[]>([])
const [selectedTypeId, setSelectedTypeId] = useState('')
const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])

// On type change, update visible fields:
useEffect(() => {
  const type = reportTypes.find(rt => rt.id === selectedTypeId)
  if (type) {
    const fields = type.customFields.filter(f => isAdmin || f.visibleToVolunteers)
    setCustomFields(fields)
    // Reset field values when type changes
    setFieldValues({})
    setValidationErrors({})
  }
}, [selectedTypeId, reportTypes, isAdmin])

// On open, load types and pre-select default:
useEffect(() => {
  if (!open) return
  getReportTypes()
    .then(({ reportTypes: types }) => {
      const active = types.filter(rt => !rt.archived).sort((a, b) => a.order - b.order)
      setReportTypes(active)
      const defaultType = active.find(rt => rt.isDefault) ?? active[0]
      if (defaultType) setSelectedTypeId(defaultType.id)
    })
    .catch(() => {
      // Fallback to legacy categories
      getReportCategories()
        .then(({ categories: cats }) => setReportTypes(cats.map((name, i) => ({
          id: `legacy-${i}`,
          name,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          description: '',
          customFields: [],
          isDefault: i === 0,
          order: i,
          archived: false,
          createdAt: '',
          updatedAt: '',
        }))))
        .catch(() => setReportTypes([]))
    })
}, [open])

// In handleSubmit, pass reportTypeId + reportTypeSlug instead of category:
const selectedType = reportTypes.find(rt => rt.id === selectedTypeId)
const report = await createReport({
  title: title.trim(),
  reportTypeId: selectedType?.id,
  reportTypeSlug: selectedType?.slug,
  category: selectedType?.name, // backward compat for old readers
  encryptedContent: encrypted.encryptedContent,
  readerEnvelopes: encrypted.readerEnvelopes,
})
```

### Step 7: Admin Report Type Manager

**File: `src/client/components/admin-settings/report-types-section.tsx`**

A new admin settings section that replaces the simple category list. Features:
1. List all report types with drag-to-reorder
2. Create new report type (name, slug, description)
3. Edit report type — inline custom field editor (reuse `CustomFieldInputs` pattern)
4. Archive report type (soft delete)
5. Set default type
6. Show field count badge per type

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { getReportTypes, createReportType, updateReportType, archiveReportType, reorderReportTypes } from '@/lib/api'
import type { ReportType, CustomFieldDefinition } from '@shared/types'
import { SettingsSection } from '@/components/settings-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, ChevronUp, ChevronDown, Star, Edit2 } from 'lucide-react'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
}

export function ReportTypesSection({ expanded, onToggle }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [types, setTypes] = useState<ReportType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!expanded) return
    getReportTypes()
      .then(r => setTypes(r.reportTypes.sort((a, b) => a.order - b.order)))
      .catch(() => toast(t('common.error'), 'error'))
  }, [expanded])

  // ... CRUD handlers, inline field editor, reorder handlers
  // Renders a list of ReportType cards, each expandable to show/edit its custom fields
}
```

### Step 8: Wire into Admin Settings Page

**File: `src/client/routes/admin/settings.tsx`**

Replace the report categories section with `ReportTypesSection`:

```typescript
// Remove: import for report categories section (if any)
// Add:
import { ReportTypesSection } from '@/components/admin-settings/report-types-section'

// In the settings page JSX, replace the report categories section:
<ReportTypesSection
  expanded={expandedSection === 'report-types'}
  onToggle={(open) => setExpandedSection(open ? 'report-types' : null)}
/>
```

### Step 9: Route — Report Types API

**File: `apps/worker/routes/settings.ts`** (or new `apps/worker/routes/report-types.ts`)

```typescript
// GET /settings/report-types — all users can read (needed for ReportForm type selector)
settings.get('/report-types', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.settings.fetch(new Request('http://do/settings/report-types'))
  return c.json(await res.json())
})

// POST/PATCH/DELETE — admin only
settings.post('/report-types', requirePermission('settings:manage'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.settings.fetch(new Request('http://do/settings/report-types', {
    method: 'POST',
    body: JSON.stringify(await c.req.json()),
  }))
  const data = await res.json()
  return c.json(data, res.status as 200 | 201 | 400 | 409)
})

// ... PATCH, DELETE, PUT /reorder similarly
```

### Step 10: Report Route — Store Type Reference

**File: `apps/worker/routes/reports.ts`**

Update the `POST /` handler to store `reportTypeId` and `reportTypeSlug` in conversation metadata:

```typescript
const conversationData = {
  channelType: 'web',
  createdBy: pubkey,
  status: 'waiting',
  metadata: {
    type: 'report',
    reportTitle: body.title,
    reportCategory: body.category, // backward compat
    reportTypeId: body.reportTypeId,
    reportTypeSlug: body.reportTypeSlug,
  },
}
```

### Step 11: i18n Strings

**File: `packages/i18n/locales/en.json`**

```json
{
  "reportTypes": {
    "title": "Report Types",
    "description": "Configure different report types with custom fields",
    "create": "Create Report Type",
    "name": "Type Name",
    "slug": "URL Slug",
    "slugHint": "Lowercase letters, numbers, and hyphens only",
    "typeDescription": "Description",
    "fields": "Custom Fields",
    "fieldCount": "{{count}} field(s)",
    "noFields": "No custom fields",
    "default": "Default",
    "setDefault": "Set as Default",
    "archive": "Archive",
    "archiveConfirm": "Archive this report type? Existing reports will keep their type.",
    "cannotArchiveLast": "Cannot archive the last active report type",
    "selectType": "Select report type",
    "editFields": "Edit Fields"
  }
}
```

Run `bun run i18n:codegen` after adding strings.

### Step 12: Protocol Codegen

After adding `packages/protocol/schemas/report-types.json`, run:

```bash
bun run codegen
```

This generates:
- `packages/protocol/generated/typescript/ReportType.ts`
- `packages/protocol/generated/swift/ReportType.swift`
- `packages/protocol/generated/kotlin/ReportType.kt`

### Step 13: Mobile — Read-Only Type Support

**iOS — add to existing `apps/ios/Sources/Models/Report.swift`:**

```swift
struct ReportType: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
    let description: String
    let customFields: [CustomField]
    let isDefault: Bool
    let order: Int
    let archived: Bool
    let createdAt: String
    let updatedAt: String
}
```

Update `NoteCreateView` (report mode) to fetch report types and show a type picker. When a type is selected, display that type's custom fields.

**Android — add to existing `apps/android/app/src/main/java/org/llamenos/hotline/model/ReportModels.kt`:**

```kotlin
@Serializable
data class ReportType(
    val id: String,
    val name: String,
    val slug: String,
    val description: String,
    val customFields: List<CustomFieldDefinition>,
    val isDefault: Boolean,
    val order: Int,
    val archived: Boolean,
    val createdAt: String,
    val updatedAt: String,
)
```

Update `NoteCreateScreen` to show a report type dropdown when creating reports.

Both mobile platforms: read-only for report type definitions (admin CRUD is desktop-only initially).

## Files to Modify

| File | Change |
|------|--------|
| `packages/shared/types.ts` | Add `ReportType`, `MAX_REPORT_TYPES`, `MAX_FIELDS_PER_REPORT_TYPE`, `REPORT_TYPE_SLUG_REGEX` |
| `packages/protocol/schemas/report-types.json` | New schema file |
| `packages/shared/migrations/index.ts` | Add migration v2: `convert-report-categories-to-report-types` |
| `apps/worker/durable-objects/settings-do.ts` | Replace `reportCategories` routes with `reportTypes` CRUD; extract `validateCustomFieldList()`; add backward-compat `report-categories` endpoint |
| `apps/worker/routes/settings.ts` | Add report-types proxy routes |
| `apps/worker/routes/reports.ts` | Store `reportTypeId`/`reportTypeSlug` in conversation metadata |
| `src/client/lib/api.ts` | Add `getReportTypes`, `createReportType`, `updateReportType`, `archiveReportType`, `reorderReportTypes` |
| `src/client/components/ReportForm.tsx` | Replace category dropdown with type selector; load type-specific fields |
| `src/client/components/admin-settings/report-types-section.tsx` | New component — admin CRUD for report types with inline field editor |
| `src/client/routes/admin/settings.tsx` | Wire up `ReportTypesSection`, remove old report categories section |
| `packages/i18n/locales/en.json` | Add `reportTypes.*` strings |
| `packages/i18n/locales/*.json` | Propagate new strings to all 12 non-English locales |
| `apps/ios/Sources/Models/Report.swift` | Add `ReportType` struct to existing file |
| `apps/ios/Sources/Views/Notes/NoteCreateView.swift` | Add type picker for report creation |
| `apps/ios/Sources/ViewModels/NotesViewModel.swift` | Fetch report types |
| `apps/android/app/src/main/java/org/llamenos/hotline/model/ReportModels.kt` | Add `ReportType` data class to existing file |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/notes/NoteCreateScreen.kt` | Add type dropdown for report creation |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/notes/NotesViewModel.kt` | Fetch report types |

## Testing

### Migration Tests

**File: `packages/shared/migrations/__tests__/report-type-migration.test.ts`**

1. **Fresh install**: No `reportCategories` or `customFields` — migration is a no-op
2. **Default categories**: Default `['Incident Report', 'Field Observation', 'Evidence', 'Other']` converted to 4 `ReportType` objects with correct slugs
3. **Custom fields migrated**: Fields with `context: 'reports'` are copied into each report type's `customFields`
4. **Fields with context 'all' preserved**: Global custom fields with `context: 'all'` remain in the flat `customFields` array AND are copied into report types
5. **Reports-only fields removed from global**: Fields with `context: 'reports'` are removed from the global `customFields` array
6. **First type is default**: `isDefault: true` on the first report type
7. **Slug generation**: "Incident Report" becomes `incident-report`, "Other" becomes `other`
8. **Dry-run**: No storage writes in dry-run mode
9. **Rollback**: After rollback, `reportCategories` is restored, `reportTypes` is deleted, report-context fields are merged back
10. **Idempotency**: Running migration twice does not create duplicate types

### Playwright E2E Tests

**File: `tests/report-types.spec.ts`**

1. **Admin sees report types section**: Navigate to Settings, verify "Report Types" section exists
2. **Default types after migration**: After migration runs, 4 default types are visible
3. **Create report type**: Admin creates "Welfare Check" with slug `welfare-check` and 2 custom fields
4. **Edit report type**: Admin edits "Welfare Check" to add a third field
5. **Archive report type**: Admin archives "Other", verify it disappears from creation form
6. **Cannot archive last type**: Archiving all but one returns error
7. **ReportForm type selector**: Open ReportForm, verify type dropdown with active types; selecting a type updates the visible custom fields
8. **Report with type-specific fields**: Create a report with "Incident Report" type, fill type-specific fields, submit, verify report metadata includes `reportTypeId`
9. **Slug uniqueness**: Creating two types with the same slug returns 409
10. **Reorder types**: Drag-reorder types, verify new order persists on reload

### iOS Tests

1. **Report type picker visible**: In report creation view, type picker shows available types
2. **Type-specific fields render**: Selecting a type loads its custom fields

### Android Tests

1. **Report type dropdown visible**: In NoteCreateScreen (report mode), type dropdown appears
2. **Type-specific fields render**: Selecting a type shows its fields

## Acceptance Criteria

- [ ] `ReportType` type defined in `packages/shared/types.ts` with id, name, slug, description, customFields, isDefault, order, archived
- [ ] JSON Schema `report-types.json` added to `packages/protocol/schemas/` and codegen produces TS/Swift/Kotlin types
- [ ] Migration v2 converts existing `reportCategories[]` + `context:'reports'` custom fields into `ReportType[]`
- [ ] Migration v2 has working `down()` rollback
- [ ] Migration v2 is idempotent
- [ ] SettingsDO exposes full CRUD for report types: GET, POST, PATCH, DELETE, PUT (reorder)
- [ ] Backward-compatible `GET /settings/report-categories` still works (derives from report types)
- [ ] `GET /settings/report-types` returns all types (including archived, for admin view)
- [ ] Slug uniqueness enforced (409 on duplicate)
- [ ] Cannot archive the last active report type (400)
- [ ] Only one type can be `isDefault: true` at a time
- [ ] `ReportForm` shows type selector; selecting a type loads that type's custom fields
- [ ] Reports store `reportTypeId` and `reportTypeSlug` in conversation metadata
- [ ] Admin settings page has `ReportTypesSection` with inline field editor per type
- [ ] i18n strings added and codegen run
- [ ] iOS: report creation shows type picker with type-specific fields (read-only admin)
- [ ] Android: report creation shows type dropdown with type-specific fields (read-only admin)
- [ ] All Playwright E2E tests pass
- [ ] `bun run codegen:check` passes
- [ ] `bun run i18n:validate:all` passes

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Migration corrupts existing report data | High | Low | Migration only adds `reportTypes` key; does not delete `reportCategories` (kept for backward compat); rollback function restores original state |
| Old mobile clients break after migration | Medium | Medium | `GET /settings/report-categories` backward-compat endpoint derives categories from report types; old clients continue to work with string categories |
| Custom field duplication during migration | Low | Medium | Fields with `context: 'all'` are intentionally in both global list and report types; `context: 'reports'` fields are removed from global after copying to types |
| Slug collision from auto-generation | Low | Low | Migration generates slugs from category names with fallback to `type-N`; admin UI validates uniqueness on create |
| Large number of report types impacts DO storage | Low | Very Low | Max 20 types, max 30 fields each; well within DO storage limits |
| Cross-platform type mismatch | Medium | Low | Protocol codegen generates matching types from single JSON Schema source of truth |
| Admin creates type then removes all fields | Low | Medium | Allowed — a type with zero custom fields is valid (just title + body); no field minimum enforced |
