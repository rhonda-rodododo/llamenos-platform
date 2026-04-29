# CMS Advanced UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface three fully-implemented backend features in UI: evidence custody chain, report-type field customization, and cross-hub case visibility for super-admins.

**Architecture:** Gap 1 is purely a desktop UI change — `EvidenceDetailDialog` already imports all required API functions and the custody data, but renders them inline (no tab structure needed since the dialog is single-panel). Gap 2 requires extracting a shared `FieldsEditor` component from `case-management-section.tsx` and wiring it into `report-types-section.tsx`, which already has a `ReportTypeFieldsEditor` stub that must be replaced. Gap 3 requires a new `cases:read-cross-hub` permission added to the super-admin role, a backend cross-hub query path (schema + service method + route handler), envelope recipient augmentation, and a desktop "All Hubs" toggle in the cases route.

**Tech Stack:** TypeScript/React/shadcn/ui (desktop), Hono/Bun/Drizzle (backend), Zod (schema), Playwright + BDD (testing), packages/protocol/schemas (schema source of truth).

---

## File Map

| File | Change |
|------|--------|
| `src/client/components/cases/evidence-detail-dialog.tsx` | Reorganize existing custody content into a tabbed layout (Details / Custody Chain), add per-row `data-testid`, add permission gate |
| `src/client/components/admin-settings/fields-editor.tsx` | **New file** — shared field editor extracted from `case-management-section.tsx` |
| `src/client/components/admin-settings/case-management-section.tsx` | Replace inline field editor with `<FieldsEditor>` import |
| `src/client/components/admin-settings/report-types-section.tsx` | Replace `ReportTypeFieldsEditor` stub with `<FieldsEditor renderExtraConfig>` |
| `packages/shared/permissions.ts` | Add `'cases:read-cross-hub'` to `PERMISSION_CATALOG`, add to `DEFAULT_ROLES['role-super-admin']` (already has `'*'` so no list change needed — just catalog) |
| `packages/protocol/schemas/records.ts` | Add `allHubs: z.boolean().optional().default(false)` to `listRecordsQuerySchema` |
| `apps/worker/routes/records.ts` | Handle `allHubs` query param: permission check + `listAcrossHubs` dispatch |
| `apps/worker/services/cases.ts` | Add `listAcrossHubs(input)` method |
| `apps/worker/lib/envelope-recipients.ts` | Accept and merge `superAdminPubkeys` parameter into all three tiers |
| `apps/worker/routes/records.ts` | Pass super-admin pubkeys to `determineEnvelopeRecipients` on record creation |
| `apps/worker/services/identity.ts` | Add `getNetworkSuperAdminPubkeys(): Promise<string[]>` |
| `src/client/lib/api.ts` | Add `allHubs?: boolean` to `listRecords()` params; when true call `/records?allHubs=true` without hub prefix |
| `src/client/routes/cases.tsx` | Add "All Hubs" toggle (super-admin only); hub badge per row; cross-hub navigation |
| `packages/test-specs/features/core/cms-evidence.feature` | Add BDD scenario: custody chain permission gate (non-admin cannot access custody) |
| `packages/test-specs/features/core/cms-cross-hub.feature` | Replace current toggle-only scenarios with full super-admin cross-hub query scenarios |
| `tests/steps/backend/cross-hub.steps.ts` | Add step implementations for new BDD scenarios |
| `tests/api-helpers.ts` | Add `listRecordsAllHubsViaApi`, `createSuperAdminViaApi` helpers |

---

## Task 1: Evidence detail dialog — custody chain tab

The dialog already loads custody data and renders it below metadata. The spec asks for a tab layout (Details / Custody Chain) that is gated on `evidence:manage-custody`. The existing content, state, handlers, and `data-testid` values are already correct — we are restructuring layout only.

**Files:**
- Modify: `src/client/components/cases/evidence-detail-dialog.tsx`

- [ ] **Step 1.1: Add tab state and Tabs UI wrapper**

The dialog currently renders metadata → actions → custody chain vertically. Add a `activeTab` state and wrap the two sections in shadcn `Tabs`. Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`.

Change the props type to accept an optional `canManageCustody: boolean` (already computable from `hasPermission` at the call site). Default to `false` when not provided.

```tsx
// At the top of EvidenceDetailDialogProps:
canManageCustody?: boolean  // controls whether Custody Chain tab is shown
```

Inside the JSX, replace the flat vertical layout with:

```tsx
<Tabs defaultValue="details">
  <TabsList>
    <TabsTrigger value="details">{t('cases.evidence.tabDetails', { defaultValue: 'Details' })}</TabsTrigger>
    {canManageCustody && (
      <TabsTrigger value="custody" data-testid="evidence-custody-tab">
        {t('cases.evidence.tabCustody', { defaultValue: 'Custody Chain' })}
      </TabsTrigger>
    )}
  </TabsList>
  <TabsContent value="details">
    {/* file preview + metadata table + actions (download + verify buttons) */}
  </TabsContent>
  {canManageCustody && (
    <TabsContent value="custody" data-testid="evidence-custody-chain">
      {/* loading spinner / empty state / custody table */}
      {/* keep existing custodyChain rendering, but update row testid */}
    </TabsContent>
  )}
</Tabs>
```

The "Verify Integrity" button and `data-testid="evidence-verify-btn"` / `data-testid="evidence-verify-result"` should stay in the Details tab actions row for discoverability (verify result is a file integrity check, not an admin-only operation). The custody entry table with `data-testid="custody-chain-row"` becomes `data-testid="evidence-custody-entry"` to match the spec.

- [ ] **Step 1.2: Update call sites to pass `canManageCustody`**

Search for all usages of `<EvidenceDetailDialog` in the codebase.

```bash
grep -r "EvidenceDetailDialog" ~/projects/llamenos/src --include="*.tsx" -l
```

In each call site (likely `evidence-tab.tsx`), pass:
```tsx
canManageCustody={hasPermission('evidence:manage-custody')}
```
Import `useAuth` in the call site if not already present.

- [ ] **Step 1.3: Run typecheck and build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: exits 0 with no errors.

- [ ] **Step 1.4: Commit**

```bash
cd ~/projects/llamenos
git add src/client/components/cases/evidence-detail-dialog.tsx src/client/components/cases/evidence-tab.tsx
git commit -m "$(cat <<'EOF'
feat(cases): tabbed evidence detail dialog with admin-gated custody chain

Add Details / Custody Chain tab layout to EvidenceDetailDialog.
Custody Chain tab only visible to users with evidence:manage-custody
permission. data-testid attributes aligned with spec.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract shared FieldsEditor component

The field-editing logic currently lives in `case-management-section.tsx` as an inline component (`EntityTypeFieldsEditor` or similar). We need to extract it into a shared `FieldsEditor` component that both entity types and report types can use. The report-types section already has a `ReportTypeFieldsEditor` stub that needs to be replaced.

**Files:**
- Create: `src/client/components/admin-settings/fields-editor.tsx`
- Modify: `src/client/components/admin-settings/case-management-section.tsx`
- Modify: `src/client/components/admin-settings/report-types-section.tsx`

### Step 2a: Read and understand the existing field editor in case-management-section.tsx

- [ ] **Step 2a.1: Find the existing entity type field editor**

Read `src/client/components/admin-settings/case-management-section.tsx` in full (use offset/limit to page through it). Find the component that renders field add/edit/remove/reorder (look for `ChevronUp`, `ChevronDown`, `Trash2` usage in the fields context). Understand the exact state shape and props.

- [ ] **Step 2a.2: Identify the field type used for entity types vs report types**

In `case-management-section.tsx`, fields are typed as `EntityFieldDefinition[]` from `@shared/types`.
In `report-types-section.tsx`, fields are typed as `CustomFieldDefinition[]` from `@shared/types`.

Check whether `EntityFieldDefinition` and `CustomFieldDefinition` share enough structure to be handled by a generic component. Run:

```bash
grep -n "EntityFieldDefinition\|CustomFieldDefinition\|ReportFieldDefinition" ~/projects/llamenos/packages/shared/types.ts | head -40
grep -n "EntityFieldDefinition\|CustomFieldDefinition\|ReportFieldDefinition" ~/projects/llamenos/packages/protocol/schemas/*.ts | head -40
```

The report-types section currently uses `CustomFieldDefinition` with fields: `id`, `name`, `label`, `type`, `required`, `options`, `validation`, `visibleToUsers`, `editableByUsers`, `context`, `order`, `createdAt`. The entity type section uses `EntityFieldDefinition` with a compatible subset. The spec asks for a `FieldsEditor<T extends EntityFieldDefinition>` generic. Use the shared base type as the type constraint.

### Step 2b: Create the shared FieldsEditor component

- [ ] **Step 2b.1: Create `src/client/components/admin-settings/fields-editor.tsx`**

This component should replicate the existing field editing behaviour from `report-types-section.tsx`'s `ReportTypeFieldsEditor` (which is already more complete than the entity-type version — it has label auto-name generation, select options editing, required toggle, up/down reordering). The entity-type version uses the same UI; the report-type version adds a `renderExtraConfig` slot for the "Audio input" toggle.

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Save, Plus, Trash2, ChevronUp, ChevronDown, FileText } from 'lucide-react'
import type { CustomFieldDefinition } from '@shared/types'
import { MAX_CUSTOM_FIELDS } from '@shared/types'

/**
 * Generic field list editor.
 *
 * T must be assignable to CustomFieldDefinition. Use `renderExtraConfig`
 * to inject extra field-type-specific controls (e.g. "Audio input" toggle
 * for report fields).
 */
export interface FieldsEditorProps<T extends CustomFieldDefinition> {
  fields: T[]
  onChange: (fields: T[]) => void
  /** Called inside the field edit form to render extra controls */
  renderExtraConfig?: (field: Partial<T>, onChange: (updated: Partial<T>) => void) => React.ReactNode
  maxFields?: number
  /** data-testid prefix for test selectors (e.g. "report-field" or "entity-field") */
  testIdPrefix?: string
}

export function FieldsEditor<T extends CustomFieldDefinition>({
  fields,
  onChange,
  renderExtraConfig,
  maxFields = MAX_CUSTOM_FIELDS,
  testIdPrefix = 'field',
}: FieldsEditorProps<T>) {
  // ... (extract the existing implementation from ReportTypeFieldsEditor in
  //      report-types-section.tsx, adapted to the generic type)
}
```

**Implementation details to carry over from the existing `ReportTypeFieldsEditor` in `report-types-section.tsx`:**
- `editingField` state as `Partial<T> | null`
- `handleAddField()` — creates a new field with defaults
- `handleSaveField()` — upserts field, reassigns `order` on all fields
- `handleDeleteField(id)` — removes field, reassigns `order`
- `handleReorder(index, direction)` — swaps fields, reassigns `order`
- Label input with auto-`name` generation on create (lowercase, underscores)
- Field type select: text | number | select | checkbox | textarea
- Required toggle
- Options editor (for `type === 'select'`)
- Up/down reorder buttons (disabled at boundaries)
- `data-testid` on each row: `{testIdPrefix}-{index}`, label input: `{testIdPrefix}-label-{index}`, type select: `{testIdPrefix}-type-{index}`, remove button: `{testIdPrefix}-remove-{index}`

The `renderExtraConfig` callback is rendered inside the field edit form, below the Required toggle.

- [ ] **Step 2b.2: Run typecheck to verify the new component**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "fields-editor"
```

Fix any type errors before proceeding.

### Step 2c: Refactor case-management-section.tsx to use FieldsEditor

- [ ] **Step 2c.1: Replace the inline field editor in case-management-section.tsx**

Find the "Fields" tab rendering in `case-management-section.tsx`. It renders field rows with up/down buttons and an edit/delete action. Replace the entire inline field editor UI with:

```tsx
import { FieldsEditor } from './fields-editor'
// ...
// In the 'fields' TabsContent:
<FieldsEditor
  fields={(editing.fields || []) as EntityFieldDefinition[]}
  onChange={fields => setEditing(prev => ({ ...prev!, fields: fields as EntityFieldDefinition[] }))}
  testIdPrefix="entity-field"
/>
```

`EntityFieldDefinition` from `@shared/types` must be compatible with `CustomFieldDefinition`. If not (missing `context`, `visibleToUsers`, etc.), adapt `FieldsEditor` to use `EntityFieldDefinition` as the base type constraint instead of `CustomFieldDefinition`, or create a minimal shared interface. Check `packages/shared/types.ts` and use the common base type.

- [ ] **Step 2c.2: Run typecheck after refactor**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep -E "case-management|fields-editor"
```

### Step 2d: Wire FieldsEditor into report-types-section.tsx

- [ ] **Step 2d.1: Replace the existing ReportTypeFieldsEditor stub**

In `report-types-section.tsx`, remove the existing `ReportTypeFieldsEditor` function (lines 300–500 approximately). Replace the JSX usage at line ~255 with:

```tsx
import { FieldsEditor } from './fields-editor'
// ...
<FieldsEditor
  fields={editing.fields || []}
  onChange={fields => setEditing(prev => ({ ...prev!, fields }))}
  testIdPrefix="report-field"
  renderExtraConfig={(field, onFieldChange) =>
    field.type === 'textarea' ? (
      <div className="flex items-center gap-2">
        <Switch
          checked={(field as { supportAudioInput?: boolean }).supportAudioInput ?? false}
          onCheckedChange={checked =>
            onFieldChange({ ...field, supportAudioInput: checked } as typeof field)
          }
        />
        <Label className="text-xs">
          {t('reportTypes.audioInput', { defaultValue: 'Support audio input' })}
        </Label>
      </div>
    ) : null
  }
/>
```

The `supportAudioInput` field is part of `ReportFieldDefinition` (extends `EntityFieldDefinition` or `CustomFieldDefinition` with that extra property). Use a type assertion if needed, but verify the type actually exists first:

```bash
grep -n "supportAudioInput" ~/projects/llamenos/packages/shared/types.ts ~/projects/llamenos/packages/protocol/schemas/*.ts
```

If `supportAudioInput` is on the protocol schema type but not `CustomFieldDefinition`, cast appropriately and document why.

- [ ] **Step 2d.2: Run typecheck and build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: exits 0.

- [ ] **Step 2d.3: Run BDD tests to confirm no schema regressions**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -30
```

Expected: same pass count as before this task (no new failures).

- [ ] **Step 2d.4: Commit**

```bash
cd ~/projects/llamenos
git add \
  src/client/components/admin-settings/fields-editor.tsx \
  src/client/components/admin-settings/case-management-section.tsx \
  src/client/components/admin-settings/report-types-section.tsx
git commit -m "$(cat <<'EOF'
feat(settings): shared FieldsEditor component for entity types and report types

Extract field editing UI into FieldsEditor<T> from case-management-section
and wire it into ReportTypeFieldsEditor with renderExtraConfig for the
audio input toggle. Both editors now share identical field management UX.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add cases:read-cross-hub permission

**Files:**
- Modify: `packages/shared/permissions.ts`

- [ ] **Step 3.1: Add the permission to PERMISSION_CATALOG**

In `packages/shared/permissions.ts`, find the `// System (super-admin only)` block (around line 170). Add before that block, in the Cases section:

```typescript
// (add after the last cases: permission, before the Evidence section)
'cases:read-cross-hub': 'Read case records across all hubs (super-admin only)',
```

The `super-admin` role already has `permissions: ['*']` so it automatically gets this permission via wildcard. No role array change needed.

- [ ] **Step 3.2: Verify typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "permissions"
```

Expected: no new errors.

- [ ] **Step 3.3: Commit**

```bash
cd ~/projects/llamenos
git add packages/shared/permissions.ts
git commit -m "$(cat <<'EOF'
feat(permissions): add cases:read-cross-hub permission to catalog

Super-admin role inherits this via wildcard. Used to gate the
cross-hub case list endpoint and UI toggle.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend — cross-hub query schema + service method

**Files:**
- Modify: `packages/protocol/schemas/records.ts`
- Modify: `apps/worker/services/cases.ts`

### Step 4a: Add allHubs to listRecordsQuerySchema

- [ ] **Step 4a.1: Update the schema**

In `packages/protocol/schemas/records.ts`, find `listRecordsQuerySchema` (around line 88). Add `allHubs`:

```typescript
export const listRecordsQuerySchema = paginationSchema.extend({
  entityTypeId: z.string().optional(),
  statusHash: z.string().optional(),
  severityHash: z.string().optional(),
  assignedTo: z.string().optional(),
  parentRecordId: z.string().optional(),
  allHubs: z.boolean().optional().default(false),  // add this line
})
```

Note: use `.optional().default(false)` per the project convention (bare `.default()` produces wrong JSON Schema).

- [ ] **Step 4a.2: Run codegen to propagate to Swift/Kotlin**

```bash
cd ~/projects/llamenos && bun run codegen
```

Expected: exits 0, updated generated Swift/Kotlin types.

- [ ] **Step 4a.3: Run typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | tail -20
```

### Step 4b: Add ListAcrossHubsInput + listAcrossHubs service method

- [ ] **Step 4b.1: Add the input type in cases.ts**

In `apps/worker/services/cases.ts`, after `ListCasesInput` (around line 57), add:

```typescript
export interface ListAcrossHubsInput {
  requestingPubkey: string
  page?: number
  limit?: number
  entityTypeId?: string
  statusHash?: string
  severityHash?: string
}
```

- [ ] **Step 4b.2: Implement listAcrossHubs in CasesService**

Read how `list()` works in `CasesService` first (read `apps/worker/services/cases.ts` offset 140, limit 100 to find the list method). Then add `listAcrossHubs` as a method.

The method queries `case_records` without a `hubId` filter, but only returns records where `requestingPubkey` appears in any of the three envelope recipient arrays (`summaryEnvelopes`, `fieldEnvelopes`, `piiEnvelopes`). In PostgreSQL/Drizzle, this is a JSONB array-contains check. Use a raw SQL `WHERE` clause since Drizzle may not have a high-level helper for this:

```typescript
async listAcrossHubs(input: ListAcrossHubsInput): Promise<{
  records: CaseRecord[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}> {
  const page = input.page ?? 1
  const limit = Math.min(input.limit ?? 50, 200)
  const offset = (page - 1) * limit

  // Build WHERE conditions
  const conditions = [
    // Requesting pubkey is a recipient in summary, fields, or pii envelopes
    sql`(
      summary_envelopes @> ${JSON.stringify([{ recipientPubkey: input.requestingPubkey }])}::jsonb
      OR field_envelopes @> ${JSON.stringify([{ recipientPubkey: input.requestingPubkey }])}::jsonb
      OR pii_envelopes @> ${JSON.stringify([{ recipientPubkey: input.requestingPubkey }])}::jsonb
    )`,
  ]

  if (input.entityTypeId) {
    conditions.push(eq(caseRecords.entityTypeId, input.entityTypeId))
  }
  if (input.statusHash) {
    conditions.push(eq(caseRecords.statusHash, input.statusHash))
  }
  if (input.severityHash) {
    conditions.push(eq(caseRecords.severityHash, input.severityHash))
  }

  const whereClause = and(...conditions)

  const [rows, countResult] = await Promise.all([
    this.db
      .select()
      .from(caseRecords)
      .where(whereClause)
      .orderBy(desc(caseRecords.createdAt))
      .limit(limit)
      .offset(offset),
    this.db.select({ count: count() }).from(caseRecords).where(whereClause),
  ])

  const total = Number(countResult[0]?.count ?? 0)
  return {
    records: rows.map(r => this.rowToRecord(r)),
    total,
    page,
    limit,
    hasMore: offset + rows.length < total,
  }
}
```

**Note:** Check whether a `rowToRecord` private method exists in the service by reading the existing `list()` implementation. Use the same row-to-record mapping pattern. The JSONB path structure depends on what `summaryEnvelopes` actually stores — check:

```bash
grep -n "summaryEnvelopes\|recipientPubkey\|EnvelopeEntry\|RecipientEnvelope" \
  ~/projects/llamenos/packages/protocol/schemas/records.ts \
  ~/projects/llamenos/packages/protocol/schemas/common.ts \
  ~/projects/llamenos/apps/worker/db/schema/*.ts \
  2>/dev/null | head -30
```

Adjust the JSONB contains expression to match the actual envelope shape. If the envelope is `{ pubkey: string, encryptedKey: string }` rather than `{ recipientPubkey: string, ... }`, adjust accordingly.

- [ ] **Step 4b.3: Run typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep -E "cases\.ts|listAcrossHubs"
```

Fix any type errors. The most likely issue is that `rowToRecord` may be private or named differently.

- [ ] **Step 4b.4: Commit schema + service**

```bash
cd ~/projects/llamenos
git add packages/protocol/schemas/records.ts apps/worker/services/cases.ts
git commit -m "$(cat <<'EOF'
feat(cases): add allHubs query param schema and listAcrossHubs service method

Schema: allHubs boolean in listRecordsQuerySchema (defaults false).
Service: CasesService.listAcrossHubs() — cross-hub query filtered by
envelope recipient pubkey membership via JSONB containment.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend — super-admin pubkeys in envelope recipients

**Files:**
- Modify: `apps/worker/services/identity.ts`
- Modify: `apps/worker/lib/envelope-recipients.ts`
- Modify: `apps/worker/routes/records.ts`

### Step 5a: getNetworkSuperAdminPubkeys in IdentityService

- [ ] **Step 5a.1: Add the method**

Read `apps/worker/services/identity.ts` (offset 80, limit 100) to find where `getUsers()` is implemented and understand the user/hubRoles schema. Then add:

```typescript
/**
 * Return pubkeys of all active users who have the super-admin role
 * (role-super-admin). Used to include super-admins in envelope recipient
 * lists so they can decrypt records cross-hub.
 *
 * Note: super-admin has permissions: ['*'] — we identify by role id, not
 * by permission, to avoid iterating the entire permissions catalog.
 */
async getNetworkSuperAdminPubkeys(): Promise<string[]> {
  const rows = await this.db
    .select({ pubkey: users.pubkey })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        sql`${users.roles} @> '["role-super-admin"]'::jsonb`,
      ),
    )
  return rows.map(r => r.pubkey)
}
```

`users.roles` is a JSONB array of role IDs. Verify the column name by grepping the schema:

```bash
grep -n '"roles"\|roles:' ~/projects/llamenos/apps/worker/db/schema/*.ts | head -10
```

Adjust the column reference if needed.

- [ ] **Step 5a.2: Verify typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "identity"
```

### Step 5b: Accept superAdminPubkeys in determineEnvelopeRecipients

- [ ] **Step 5b.1: Update envelope-recipients.ts**

`determineEnvelopeRecipients` currently takes `(entityType, assignedTo, hubMembers)`. Add a fourth parameter:

```typescript
export function determineEnvelopeRecipients(
  entityType: EntityTypeDefinition,
  assignedTo: string[],
  hubMembers: HubMemberInfo[],
  superAdminPubkeys: string[] = [],   // add this
): EnvelopeRecipients {
  return {
    summary: [...new Set([...getSummaryRecipients(entityType, hubMembers), ...superAdminPubkeys])],
    fields:  [...new Set([...getFieldRecipients(entityType, assignedTo, hubMembers), ...superAdminPubkeys])],
    pii:     [...new Set([...getPIIRecipients(entityType, hubMembers), ...superAdminPubkeys])],
  }
}
```

The default `[]` means existing callers don't need to change — but the record creation path will pass real super-admin pubkeys.

- [ ] **Step 5b.2: Update the record creation path in records.ts**

In `apps/worker/routes/records.ts`, find the `POST /` handler where `determineEnvelopeRecipients` is called. Currently it calls:

```typescript
const recipients = determineEnvelopeRecipients(entityType, assignedPubkeys, hubMembers)
```

Change to:

```typescript
const superAdminPubkeys = await services.identity.getNetworkSuperAdminPubkeys()
const recipients = determineEnvelopeRecipients(entityType, assignedPubkeys, hubMembers, superAdminPubkeys)
```

`services.identity` is available via `c.get('services').identity`. Verify the exact services access pattern by reading the existing handler:

```bash
grep -n "services.identity\|c.get('services')" ~/projects/llamenos/apps/worker/routes/records.ts | head -10
```

- [ ] **Step 5b.3: Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep -E "envelope-recipients|records\.ts"
```

- [ ] **Step 5b.4: Commit**

```bash
cd ~/projects/llamenos
git add \
  apps/worker/services/identity.ts \
  apps/worker/lib/envelope-recipients.ts \
  apps/worker/routes/records.ts
git commit -m "$(cat <<'EOF'
feat(e2ee): include super-admin pubkeys in all new record envelopes

getNetworkSuperAdminPubkeys() queries active users with role-super-admin.
determineEnvelopeRecipients() accepts optional superAdminPubkeys and
merges them into all three tiers (summary, fields, pii).
Record creation route fetches super-admin pubkeys and passes them through.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Backend — allHubs route handler

**Files:**
- Modify: `apps/worker/routes/records.ts`

- [ ] **Step 6.1: Handle allHubs in the GET / handler**

In the `records.get('/', ...)` handler (around line 91), after `const accessLevel = ...`, add the cross-hub branch before the hub-scoped branch:

```typescript
// Cross-hub super-admin path
if (query.allHubs) {
  if (!checkPermission(permissions, 'cases:read-cross-hub')) {
    return c.json({ error: 'Forbidden', required: 'cases:read-cross-hub' }, 403)
  }
  const result = await services.cases.listAcrossHubs({
    requestingPubkey: pubkey,
    page: query.page,
    limit: query.limit,
    entityTypeId: query.entityTypeId,
    statusHash: query.statusHash,
    severityHash: query.severityHash,
  })
  return c.json(result)
}
```

This must come before the existing `listInput` construction so the two paths are mutually exclusive.

- [ ] **Step 6.2: Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "records\.ts"
```

- [ ] **Step 6.3: Commit**

```bash
cd ~/projects/llamenos
git add apps/worker/routes/records.ts
git commit -m "$(cat <<'EOF'
feat(records): cross-hub list endpoint for super-admins

GET /hubs/:id/records?allHubs=true bypasses hub scope and calls
listAcrossHubs(). Returns 403 for callers without cases:read-cross-hub.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: BDD tests for cross-hub cases

Update the BDD feature file and step definitions BEFORE running them. The current `cms-cross-hub.feature` only tests the cross-hub sharing toggle setting — it needs new scenarios for the super-admin query path.

**Files:**
- Modify: `packages/test-specs/features/core/cms-cross-hub.feature`
- Modify: `tests/steps/backend/cross-hub.steps.ts`
- Modify: `tests/api-helpers.ts`

- [ ] **Step 7.1: Add API helpers for cross-hub record listing**

In `tests/api-helpers.ts`, add:

```typescript
/**
 * List records across all hubs (requires cases:read-cross-hub permission).
 * Uses the admin nsec by default (super-admin role).
 */
export async function listRecordsAllHubsViaApi(
  request: APIRequestContext,
  hubId: string,
  nsec = ADMIN_NSEC,
): Promise<{ records: unknown[]; total: number; hasMore: boolean }> {
  const skHex = nsecToSkHex(nsec)
  const pubkey = skHexToPubkey(skHex)
  const path = `/hubs/${hubId}/records?allHubs=true&limit=50`
  const token = createSchnorrAuthToken(nsec, 'GET', path)
  const res = await request.get(`http://localhost:8080${path}`, {
    headers: {
      'x-nostr-pubkey': pubkey,
      'x-nostr-token': token.token,
      'x-nostr-timestamp': String(token.timestamp),
    },
  })
  if (!res.ok()) throw new Error(`listRecordsAllHubs: ${res.status()} ${await res.text()}`)
  return res.json()
}
```

- [ ] **Step 7.2: Add BDD scenarios for cross-hub query**

Append to `packages/test-specs/features/core/cms-cross-hub.feature`:

```gherkin
  @cases @super-admin
  Scenario: Super-admin can list records across all hubs
    Given case management is enabled
    And a record exists in the current hub
    When the super-admin lists records across all hubs
    Then the cross-hub record list should include the record from the current hub
    And each record in the cross-hub list should include a hubId field

  @cases @super-admin
  Scenario: Non-super-admin gets 403 when requesting allHubs
    Given case management is enabled
    When a regular admin requests records with allHubs=true
    Then the response should be 403 Forbidden
```

- [ ] **Step 7.3: Implement the new step definitions**

In `tests/steps/backend/cross-hub.steps.ts`, add:

```typescript
import { createRecordViaApi, listRecordsAllHubsViaApi, createVolunteerViaApi } from '../../api-helpers'

interface CrossHubState {
  crossHubEnabled?: boolean
  testRecord?: { id: string; hubId: string }
  crossHubRecords?: unknown[]
  crossHubForbiddenStatus?: number
}

When('the super-admin lists records across all hubs', async ({ request, world }) => {
  const state = getCrossHubState(world)
  // Use the test hub ID from shared test state
  const hubId = getState<{ hubId?: string }>(world, 'hub').hubId
    ?? state.testRecord?.hubId
    ?? 'default'
  const result = await listRecordsAllHubsViaApi(request, hubId)
  state.crossHubRecords = result.records
})

Given('a record exists in the current hub', async ({ request, world }) => {
  // Use existing createRecord API helper — check api-helpers.ts for the right function name
  // Store the created record's id and hubId in cross-hub state
  const state = getCrossHubState(world)
  const hubId = getState<{ hubId?: string }>(world, 'hub').hubId ?? 'default'
  // The record creation helper may need entity type — check how cms-records steps do it
  // Reuse the entity type created by the existing "case management is enabled" setup if present
  // Fallback: call the API directly to create a minimal record
  state.testRecord = { id: 'placeholder', hubId }
})

Then('the cross-hub record list should include the record from the current hub', ({ world }) => {
  const state = getCrossHubState(world)
  expect(state.crossHubRecords?.length).toBeGreaterThan(0)
})

Then('each record in the cross-hub list should include a hubId field', ({ world }) => {
  const state = getCrossHubState(world)
  for (const record of state.crossHubRecords ?? []) {
    expect((record as Record<string, unknown>).hubId).toBeTruthy()
  }
})

When('a regular admin requests records with allHubs=true', async ({ request, world }) => {
  // Create a volunteer with hub-admin (not super-admin) role, attempt cross-hub call
  // The simplest approach: call listRecordsAllHubs with a non-super-admin nsec
  // and capture the HTTP status. We need a volunteer nsec — check how permission.steps.ts does it
  // or use a hardcoded test volunteer nsec from api-helpers.
  const state = getCrossHubState(world)
  const hubId = getState<{ hubId?: string }>(world, 'hub').hubId ?? 'default'
  try {
    await listRecordsAllHubsViaApi(request, hubId, 'VOLUNTEER_NSEC_HERE')
    state.crossHubForbiddenStatus = 200 // should not reach here
  } catch (e: unknown) {
    // listRecordsAllHubsViaApi throws on non-ok; capture status from error message
    state.crossHubForbiddenStatus = 403
  }
})

Then('the response should be 403 Forbidden', ({ world }) => {
  const state = getCrossHubState(world)
  expect(state.crossHubForbiddenStatus).toBe(403)
})
```

**Note:** The "regular admin requests" scenario needs a non-super-admin nsec. Check `tests/api-helpers.ts` for an existing volunteer nsec or how `createVolunteerViaApi` works. A simple approach: create a hub-admin volunteer and use their nsec. Look at how `permission.steps.ts` or other test files handle role-scoped API calls.

- [ ] **Step 7.4: Run BDD tests — expect new scenarios to fail (RED)**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | grep -E "cross-hub|FAILED|PASSED" | tail -20
```

Expected: the two new cross-hub scenarios fail; existing scenarios pass.

- [ ] **Step 7.5: Run BDD tests after all backend changes — verify GREEN**

After Tasks 4–6 are implemented, re-run:

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -30
```

Expected: all scenarios pass. Fix any implementation gaps revealed by failures.

- [ ] **Step 7.6: Commit BDD tests**

```bash
cd ~/projects/llamenos
git add \
  packages/test-specs/features/core/cms-cross-hub.feature \
  tests/steps/backend/cross-hub.steps.ts \
  tests/api-helpers.ts
git commit -m "$(cat <<'EOF'
test(bdd): cross-hub case visibility scenarios for super-admin

Add BDD scenarios: super-admin lists cross-hub records, non-super-admin
gets 403. Add listRecordsAllHubsViaApi helper. Existing toggle scenarios
are preserved.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Client API — allHubs param in listRecords

**Files:**
- Modify: `src/client/lib/api.ts`

- [ ] **Step 8.1: Add allHubs param**

In `src/client/lib/api.ts`, find `listRecords` (around line 1620). Update:

```typescript
export async function listRecords(params?: {
  entityTypeId?: string
  statusHash?: string
  severityHash?: string
  assignedTo?: string
  page?: number
  limit?: number
  allHubs?: boolean  // super-admin only — bypasses hub scope
}) {
  const qs = new URLSearchParams()
  if (params?.entityTypeId) qs.set('entityTypeId', params.entityTypeId)
  if (params?.statusHash) qs.set('statusHash', params.statusHash)
  if (params?.severityHash) qs.set('severityHash', params.severityHash)
  if (params?.assignedTo) qs.set('assignedTo', params.assignedTo)
  if (params?.page) qs.set('page', String(params.page))
  qs.set('limit', String(params?.limit ?? 50))
  if (params?.allHubs) qs.set('allHubs', 'true')

  // When allHubs=true, we still send to the active hub's records endpoint.
  // The backend ignores hub scope for super-admin cross-hub queries.
  return request<{ records: CaseRecord[]; total: number; page: number; limit: number; hasMore: boolean }>(
    hp(`/records?${qs}`)
  )
}
```

Note: `hp()` is correct here — the backend route is mounted under `/hubs/:hubId/records`. The backend's `allHubs` handler ignores the `hubId` filter for the query.

- [ ] **Step 8.2: Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "api\.ts"
```

- [ ] **Step 8.3: Commit**

```bash
cd ~/projects/llamenos
git add src/client/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(api): add allHubs param to listRecords client function

When allHubs=true, appends allHubs=true to the query string.
The backend returns records from all hubs where the caller is
an envelope recipient.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Desktop UI — All Hubs toggle in cases route

**Files:**
- Modify: `src/client/routes/cases.tsx`

- [ ] **Step 9.1: Read the cases route to understand the list layout**

Read `src/client/routes/cases.tsx` fully (use offset/limit to page through the full file). Find:
- Where records are fetched (the `loadRecords` or equivalent function)
- Where entity type filter + pagination controls are rendered
- Where the record list rows are rendered (look for `data-testid` or `map()` over `records`)

- [ ] **Step 9.2: Add allHubs state and toggle**

Add state:
```typescript
const [allHubs, setAllHubs] = useState(false)
```

The toggle is only rendered for users with `cases:read-cross-hub`:
```tsx
{hasPermission('cases:read-cross-hub') && (
  <div className="flex items-center gap-2">
    <Switch
      checked={allHubs}
      onCheckedChange={setAllHubs}
      data-testid="cases-all-hubs-toggle"
    />
    <Label className="text-sm">
      {t('cases.allHubs', { defaultValue: 'All Hubs' })}
    </Label>
  </div>
)}
```

Place this alongside the existing entity type filter and pagination controls (in the filter/toolbar row).

- [ ] **Step 9.3: Pass allHubs to listRecords and reset on toggle change**

In the `loadRecords` useCallback (or equivalent), pass `allHubs`:

```typescript
const result = await listRecords({
  entityTypeId: entityTypeFilter !== 'all' ? entityTypeFilter : undefined,
  statusHash: statusFilter !== 'all' ? statusFilter : undefined,
  assignedTo: allHubs ? undefined : undefined, // assignedTo filter hidden in allHubs mode
  page,
  limit: pageSize,
  allHubs: allHubs || undefined,
})
```

Add `allHubs` to the `useEffect` dependency array so the list reloads when the toggle changes. Also reset `page` to 1 when `allHubs` changes:

```typescript
useEffect(() => {
  setPage(1)
}, [allHubs])
```

Hide the `assignedTo` filter select when `allHubs` is true (it is not meaningful cross-hub).

- [ ] **Step 9.4: Add hub badge to each record row**

In the record list row rendering, when `allHubs` is active, show a hub badge:

```tsx
{allHubs && record.hubId && (
  <Badge variant="outline" data-testid="cases-hub-badge" className="text-[10px] font-mono">
    {record.hubId.slice(0, 8)}
  </Badge>
)}
```

Check that `CaseRecord` from `@/lib/api` has a `hubId` field. If not, look at what `listAcrossHubs` returns — the service method maps DB rows to `CaseRecord`. The DB `case_records` table has `hubId`. Verify:

```bash
grep -n "hubId\|hub_id" ~/projects/llamenos/packages/protocol/schemas/records.ts | head -10
```

If `hubId` is not on the `CaseRecord` type, add it to `recordSchema` in `packages/protocol/schemas/records.ts` as `z.string().optional()`.

- [ ] **Step 9.5: Cross-hub case navigation**

When a user clicks a case row that comes from a different hub (i.e., `record.hubId !== activeHubId`), the existing navigation sends `setSelectedId(record.id)` and loads the record detail inline. The detail panel calls `getRecord(id)` which uses `hp()` — this will use the wrong hub prefix.

The spec recommends option A: URL-based cross-hub routing (`/hubs/:hubId/cases/:caseId`). However, this requires a new TanStack Router route. For MVP simplicity, use a targeted fix: when opening a cross-hub record, temporarily set the active hub to `record.hubId` for the duration of the detail view, and restore on close.

Add a helper:

```typescript
import { setActiveHub, getActiveHub } from '@/lib/api'

// When selecting a cross-hub record:
const prevHub = getActiveHub()
if (allHubs && record.hubId && record.hubId !== getActiveHub()) {
  setActiveHub(record.hubId)
  // Store prevHub in state for restoration on close
  setPrevHubId(prevHub)
}
setSelectedId(record.id)
```

Add `prevHubId` state and restore on detail close:

```typescript
const [prevHubId, setPrevHubId] = useState<string | null>(null)

// In the close/deselect handler:
if (prevHubId !== null) {
  setActiveHub(prevHubId)
  setPrevHubId(null)
}
setSelectedId(null)
```

This is a minimal, correct implementation that avoids a full router refactor. Document in a comment that a future URL-based approach (option A from spec) should replace this when the router is refactored.

- [ ] **Step 9.6: Typecheck and build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: exits 0. Fix any type errors (most likely `hubId` not on `CaseRecord` — see step 9.4).

- [ ] **Step 9.7: Commit**

```bash
cd ~/projects/llamenos
git add src/client/routes/cases.tsx packages/protocol/schemas/records.ts
git commit -m "$(cat <<'EOF'
feat(cases): All Hubs toggle for super-admins with cross-hub navigation

Super-admins see an All Hubs toggle in the cases list. When active,
listRecords({allHubs: true}) is called and each row shows a hub badge.
Cross-hub case detail temporarily switches hub context for API calls.
recordSchema now includes optional hubId field.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification

- [ ] **Step 10.1: Full typecheck + build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: exits 0.

- [ ] **Step 10.2: Full BDD test suite**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -40
```

Expected: all scenarios pass. Any new failures must be investigated and fixed — do not commit with failures.

- [ ] **Step 10.3: Android compile check**

```bash
cd ~/projects/llamenos/apps/android && \
  ./gradlew testDebugUnitTest && \
  ./gradlew lintDebug && \
  ./gradlew compileDebugAndroidTestKotlin
```

Expected: exits 0. The Android changes are schema-only (via codegen) — if any compilation error appears, it is from a codegen schema change, not from this plan's features.

- [ ] **Step 10.4: Verify all data-testid values are present**

Grep to confirm the required `data-testid` attributes are in place:

```bash
grep -rn \
  "evidence-custody-tab\|evidence-custody-chain\|evidence-custody-entry\|evidence-verify-btn\|evidence-verify-result\|cases-all-hubs-toggle\|cases-hub-badge\|report-field-[0-9]\|report-field-label\|report-field-type\|report-field-remove" \
  ~/projects/llamenos/src/client \
  --include="*.tsx"
```

All must appear.

- [ ] **Step 10.5: Final commit (if any cleanup needed)**

```bash
cd ~/projects/llamenos
git add -p  # stage only intentional remaining changes
git commit -m "$(cat <<'EOF'
chore(cms-advanced-ui): final cleanup and verification

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Gates Summary

### Gap 1: Evidence custody chain

1. An admin (`evidence:manage-custody`) opens evidence detail and sees a "Custody Chain" tab.
2. A volunteer (without the permission) does not see the Custody Chain tab.
3. Custody tab shows entries in chronological order with actor, action, timestamp.
4. `data-testid="evidence-verify-btn"` present in Details tab.
5. `data-testid="evidence-custody-entry"` present on each row.
6. `bun run typecheck` passes.

### Gap 2: Report type field customization

1. Clicking Edit on a report type shows a "Custom Fields" sub-section within the form.
2. Admin can add a field, set type to `select`, add options, mark required — save succeeds and field count badge updates.
3. Admin can reorder fields with up/down buttons.
4. Admin can add a `textarea` field and enable "Support audio input" — `supportAudioInput: true` saved in backend.
5. Admin can remove a field.
6. `FieldsEditor` is used by both entity type editor and report type editor — no duplicated field-editing logic.
7. `bun run typecheck && bun run build` passes.
8. `bun run test:backend:bdd` passes.

### Gap 3: Cross-hub case visibility

1. `cases:read-cross-hub` permission present in `PERMISSION_CATALOG`.
2. Super-admin user sees "All Hubs" toggle in cases list route.
3. Non-super-admin users do not see the toggle.
4. With "All Hubs" active, `GET /hubs/:id/records?allHubs=true` returns records from all hubs where the super-admin is an envelope recipient.
5. A non-super-admin calling `GET /records?allHubs=true` receives 403.
6. New records created after this change include super-admin pubkeys in envelope recipients.
7. Records from a different hub display a hub badge identifying their hubId.
8. Clicking a cross-hub case opens its detail using the correct hub API path.
9. `bun run typecheck && bun run build` passes.
10. `bun run test:backend:bdd` passes with new cross-hub scenarios green.
11. `./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin` passes.
