# EP06-A2: CMS Write UX Implementation Plan (Tasks 1–10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the write surface for the CMS across all three platforms. Covers: contact create/edit with E2EE + blind indexes, relationship write UI, affinity group management, location field type integration into `SchemaForm`, entity-field-linked file upload, and the extracted `FieldDefinitionEditor` shared component. Closes the remaining client API gaps for relationship, group, file, and template operations.

**Architecture:** One entity CRUD flow driven by entity type field definitions. `SchemaForm` (`src/client/components/cases/schema-form.tsx`) gains `case 'location'` and `case 'file'` branches delegating to the existing `LocationField` component (`src/client/components/ui/location-field.tsx`) and a new `EntityFileField` component respectively. Contact edit reuses `CreateContactDialog`'s encryption + blind-index flow. Relationship write is a new panel inside `ContactProfile`. Affinity group management is a new sidebar section in `contacts-directory.tsx`. `FieldDefinitionEditor` is extracted from `report-types-section.tsx`'s inline `ReportTypeFieldsEditor` into a shared component that both `report-types-section.tsx` and entity type admin reuse.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM, Zod (protocol schemas), TypeScript/React + shadcn/ui (desktop), `@/lib/platform` for all crypto, `chunkedUpload` / `encryptFile` from existing file infrastructure, Playwright-BDD (BDD tests).

**Spec:** `docs/superpowers/specs/2026-05-12-EP06-A2-cms-write-ux-design.md`

---

## File Structure

### Protocol (modify)
- `packages/protocol/schemas/entity-schema.ts` — add `fileUploadResponseSchema`, `fileFieldValueSchema`, `entityTemplateCustomizeBodySchema`
- `packages/protocol/tools/schema-registry.ts` — register new schemas

### Backend (modify)
- `apps/worker/routes/uploads.ts` — add `POST /api/uploads/entity-file` endpoint for entity-linked encrypted blob upload
- `apps/worker/routes/contacts-v2.ts` — already has all relationship + group endpoints; no new routes needed
- `apps/worker/routes/entity-schema.ts` — add `POST /settings/cms/entity-types/:id/customize` for hub-level template overrides

### Desktop (modify + new)
- `src/client/lib/api.ts` — add missing write functions: `createContactRelationship`, `deleteContactRelationship`, `createAffinityGroup`, `updateAffinityGroup`, `deleteAffinityGroup`, `addGroupMember`, `removeGroupMember`, `listAffinityGroups`, `uploadEntityFile`, `customizeEntityType`
- `src/client/components/contacts/create-contact-dialog.tsx` — unchanged (reused as-is by edit dialog)
- `src/client/components/contacts/edit-contact-dialog.tsx` — new: pre-populated edit form with decrypt-on-open
- `src/client/components/contacts/contact-profile.tsx` — add relationship write panel to `relationships` tab; add group membership controls to `groups` tab
- `src/client/components/contacts/relationship-write-panel.tsx` — new: add/delete relationship UI
- `src/client/components/contacts/affinity-groups-sidebar.tsx` — new: group list + CRUD in contacts directory
- `src/client/components/cases/schema-form.tsx` — add `case 'location'` and `case 'file'` to `FieldInput`
- `src/client/components/cases/entity-file-field.tsx` — new: entity-scoped file upload component
- `src/client/components/admin-settings/field-definition-editor.tsx` — new: extracted shared field editor
- `src/client/components/admin-settings/report-types-section.tsx` — replace inline `ReportTypeFieldsEditor` with import of `FieldDefinitionEditor`
- `src/client/routes/contacts-directory.tsx` — wire edit button, add groups sidebar panel

### i18n (modify)
- `packages/i18n/locales/en.json` — add keys for relationship write, group management, file upload fields, field editor
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — matching translations

### BDD (new)
- `packages/test-specs/features/cms/contact-write.feature`
- `packages/test-specs/features/cms/relationship-groups.feature`
- `tests/steps/backend/contact-write.steps.ts`
- `tests/steps/backend/relationship-groups.steps.ts`

---

## Task 1: Protocol Schemas — File Upload Response and Template Customize

**Files:**
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Add entity file upload and field value schemas**

In `packages/protocol/schemas/entity-schema.ts`, append after `rolesFromTemplateResponseSchema`:

```typescript
// --- Entity field file value (EP06-A2) ---

export const fileFieldValueSchema = z.object({
  fileId: z.string().uuid(),
  encryptedName: z.string(),
  encryptedMimeType: z.string(),
  encryptedSize: z.string(),
  recipientEnvelopes: z.array(z.object({
    recipientPubkey: z.string(),
    encryptedKey: z.string(),
  })),
  uploadedAt: z.iso.datetime(),
})
export type FileFieldValue = z.infer<typeof fileFieldValueSchema>

export const entityFileUploadResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadedAt: z.iso.datetime(),
})
export type EntityFileUploadResponse = z.infer<typeof entityFileUploadResponseSchema>

// --- Template customization (EP06-A2) ---

export const entityTemplateCustomizeBodySchema = z.looseObject({
  label: z.string().min(1).max(200).optional(),
  labelPlural: z.string().min(1).max(200).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  showInNavigation: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  isArchived: z.boolean().optional(),
})
export type EntityTemplateCustomizeBody = z.infer<typeof entityTemplateCustomizeBodySchema>
```

- [ ] **Step 2: Register new schemas in schema-registry.ts**

In `packages/protocol/tools/schema-registry.ts`, add to the registry map (import from `@protocol/schemas/entity-schema`):

```typescript
fileFieldValueSchema,
entityFileUploadResponseSchema,
entityTemplateCustomizeBodySchema,
```

- [ ] **Step 3: Run codegen and verify**

```bash
bun run codegen
```

Expected: Clean exit. `FileFieldValue`, `EntityFileUploadResponse`, `EntityTemplateCustomizeBody` appear in generated TypeScript. Swift/Kotlin codegen clean.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/schemas/entity-schema.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add entity file upload and template customize schemas (EP06-A2)"
```

---

## Task 2: Backend — Entity File Upload Endpoint

**Files:**
- Modify: `apps/worker/routes/uploads.ts`

The existing `uploads.ts` handles chunked evidence file uploads via `POST /uploads/init`, `/uploads/:id/chunk`, `/uploads/:id/complete`. This task adds a simpler single-shot endpoint for entity field file attachments (max 10 MB, suitable for field-level file values). Large files still use chunked upload.

- [ ] **Step 1: Add entity file upload endpoint**

In `apps/worker/routes/uploads.ts`, after the existing `uploads.use('*', requirePermission('files:upload'))` middleware and before the `/init` route, add:

```typescript
// Single-shot entity field file upload (≤10 MB encrypted blob, EP06-A2)
uploads.post('/entity-file',
  describeRoute({
    tags: ['Uploads'],
    summary: 'Upload an encrypted file attached to an entity field',
    responses: {
      201: {
        description: 'File stored',
        content: { 'application/json': { schema: resolver(entityFileUploadResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const body = await c.req.parseBody()
    const blob = body['file']
    if (!(blob instanceof File)) return c.json({ error: 'file required' }, 400)
    if (blob.size > MAX_CHUNK_SIZE) return c.json({ error: 'file too large (max 10 MB)' }, 413)

    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const buffer = await blob.arrayBuffer()

    const fileId = crypto.randomUUID()
    const uploadedAt = new Date().toISOString()

    await services.rustfs.put(`entity-files/${fileId}`, buffer)
    await audit(services.audit, 'entityFileUploaded', pubkey, { fileId, size: blob.size })

    return c.json({ fileId, uploadedAt }, 201)
  },
)
```

Add the import at the top of `uploads.ts`:

```typescript
import { entityFileUploadResponseSchema } from '@protocol/schemas/entity-schema'
```

- [ ] **Step 2: Write BDD feature**

Create `packages/test-specs/features/cms/contact-write.feature`:

```gherkin
Feature: CMS contact write operations

  Background:
    Given a hub exists with id "hub-01"
    And a volunteer "alice" with contacts:create permission is authenticated

  Scenario: Create a contact with E2EE profile
    When alice creates a contact with displayName "Test Person" and phone "+15551234"
    Then the contact exists with encryptedProfile set
    And the contact has blind index tokens for name and phone

  Scenario: Update a contact's display name
    Given a contact "c1" exists created by alice
    When alice updates contact "c1" displayName to "Updated Name"
    Then the contact "c1" has updated encryptedProfile
    And the contact "c1" blind index tokens are recomputed

  Scenario: Create a relationship between two contacts
    Given contacts "c1" and "c2" exist
    When alice creates a relationship between "c1" and "c2" of type "support_contact"
    Then the relationship exists with encrypted notes envelope

  Scenario: Upload an entity field file
    Given alice has files:upload permission
    When alice uploads a 1KB encrypted blob to POST /api/uploads/entity-file
    Then the response contains a fileId
    And the blob is stored in RustFS under entity-files/
```

Create `tests/steps/backend/contact-write.steps.ts` with step implementations using the existing BDD test harness pattern (import `Given`, `When`, `Then` from `@cucumber/cucumber`, use `TestContext` services).

- [ ] **Step 3: Commit**

```bash
git add apps/worker/routes/uploads.ts packages/test-specs/features/cms/contact-write.feature tests/steps/backend/contact-write.steps.ts
git commit -m "feat(worker): entity field file upload endpoint + contact-write BDD (EP06-A2)"
```

---

## Task 3: Backend — Entity Type Template Customize Endpoint

**Files:**
- Modify: `apps/worker/routes/entity-schema.ts`

The existing entity schema route has full CRUD for entity types. This task adds a `PATCH /settings/cms/entity-types/:id/customize` endpoint for hub-level label/appearance overrides of template-sourced entity types (which cannot be structurally changed but can have labels, colors, and visibility toggled per-hub).

- [ ] **Step 1: Add customize endpoint**

In `apps/worker/routes/entity-schema.ts`, locate the existing `PATCH /settings/cms/entity-types/:id` handler. After it, add:

```typescript
// Hub-level customization of a template-sourced entity type
entitySchemaRouter.patch('/entity-types/:id/customize',
  describeRoute({
    tags: ['Entity Schema'],
    summary: 'Apply hub-level overrides to a template-sourced entity type',
    responses: {
      200: { description: 'Customization saved', content: { 'application/json': { schema: resolver(entityTypeDefinitionSchema) } } },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('settings:manage-cms'),
  validator('json', entityTemplateCustomizeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const updated = await services.entitySchema.applyHubCustomization(id, body)
    await audit(services.audit, 'entityTypeCustomized', pubkey, { entityTypeId: id, fields: Object.keys(body) })
    return c.json(updated)
  },
)
```

Add the required import at the top:

```typescript
import { entityTemplateCustomizeBodySchema } from '@protocol/schemas/entity-schema'
```

Add the `applyHubCustomization` method to `apps/worker/services/entity-schema.ts`:

```typescript
async applyHubCustomization(id: string, overrides: EntityTemplateCustomizeBody): Promise<EntityTypeDefinition> {
  const current = await this.getEntityType(id)
  if (!current) throw new HTTPException(404, { message: 'Entity type not found' })
  // Merge hub-editable overrides (field visibility, labels, ordering) into the stored definition
  const merged = { ...current, ...overrides, id, updatedAt: new Date().toISOString() }
  await this.saveEntityType(merged)
  return merged
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/routes/entity-schema.ts apps/worker/services/entity-schema.ts
git commit -m "feat(worker): hub-level entity type customization endpoint (EP06-A2)"
```

---

## Task 4: Client API — Write Functions for Relationships, Groups, Files, Templates

**Files:**
- Modify: `src/client/lib/api.ts`

The spec lists the following missing functions. The routes all exist in `apps/worker/routes/contacts-v2.ts`. This task adds the client-side wrappers.

- [ ] **Step 1: Add relationship write functions**

In `src/client/lib/api.ts`, after `listDirectoryContactRelationships`:

```typescript
export async function createContactRelationship(
  contactId: string,
  body: import('@protocol/schemas/contact-relationships').CreateRelationshipBody,
) {
  return request<ContactRelationship>(hp(`/directory/${contactId}/relationships`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteContactRelationship(contactId: string, relId: string) {
  return request<{ deleted: boolean }>(hp(`/directory/${contactId}/relationships/${relId}`), {
    method: 'DELETE',
  })
}
```

- [ ] **Step 2: Add affinity group write functions**

After the existing `listDirectoryContactGroups`:

```typescript
export type AffinityGroup = import('@protocol/schemas/contact-relationships').AffinityGroup
export type CreateAffinityGroupBody = import('@protocol/schemas/contact-relationships').CreateAffinityGroupBody
export type UpdateAffinityGroupBody = import('@protocol/schemas/contact-relationships').UpdateAffinityGroupBody

export async function listAffinityGroups() {
  return request<{ groups: AffinityGroup[] }>(hp('/directory/groups'))
}

export async function createAffinityGroup(body: CreateAffinityGroupBody) {
  return request<AffinityGroup>(hp('/directory/groups'), { method: 'POST', body: JSON.stringify(body) })
}

export async function updateAffinityGroup(groupId: string, body: UpdateAffinityGroupBody) {
  return request<AffinityGroup>(hp(`/directory/groups/${groupId}`), { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteAffinityGroup(groupId: string) {
  return request<{ deleted: boolean }>(hp(`/directory/groups/${groupId}`), { method: 'DELETE' })
}

export async function addGroupMember(groupId: string, contactId: string, role?: string) {
  return request<{ added: boolean }>(hp(`/directory/groups/${groupId}/members`), {
    method: 'POST',
    body: JSON.stringify({ contactId, role, isPrimary: false }),
  })
}

export async function removeGroupMember(groupId: string, contactId: string) {
  return request<{ removed: boolean }>(hp(`/directory/groups/${groupId}/members/${contactId}`), {
    method: 'DELETE',
  })
}
```

- [ ] **Step 3: Add entity file upload function**

After the existing file upload utilities:

```typescript
export async function uploadEntityFile(file: File): Promise<{ fileId: string; uploadedAt: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return request<{ fileId: string; uploadedAt: string }>(hp('/uploads/entity-file'), {
    method: 'POST',
    body: fd,
    headers: {},  // let browser set Content-Type with boundary
  })
}
```

- [ ] **Step 4: Add entity type customize function**

After `updateEntityType`:

```typescript
export async function customizeEntityType(
  id: string,
  body: import('@protocol/schemas/entity-schema').EntityTemplateCustomizeBody,
) {
  return request<EntityTypeDefinition>(hp(`/settings/cms/entity-types/${id}/customize`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat(api): client write functions for relationships, groups, files, templates (EP06-A2)"
```

---

## Task 5: Desktop — Contact Edit Dialog

**Files:**
- Create: `src/client/components/contacts/edit-contact-dialog.tsx`
- Modify: `src/client/routes/contacts-directory.tsx`

The `CreateContactDialog` handles all encryption and blind-index logic. The edit dialog decrypts the contact on open, pre-populates the form, and re-encrypts on save.

- [ ] **Step 1: Create edit-contact-dialog.tsx**

Create `src/client/components/contacts/edit-contact-dialog.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { useState, useCallback, useEffect } from 'react'
import { updateDirectoryContact, type DirectoryContact, type DirectoryContactSummary } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { encryptMessage, decryptMessage } from '@/lib/platform'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface EditContactDialogProps {
  contact: DirectoryContact
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (contact: DirectoryContactSummary) => void
}

export function EditContactDialog({ contact, open, onOpenChange, onUpdated }: EditContactDialogProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')

  // Decrypt profile on open
  useEffect(() => {
    if (!open) return
    if (contact.canDecrypt) {
      setDisplayName(contact.displayName)
    }
  }, [open, contact])

  const handleSave = useCallback(async () => {
    if (!displayName.trim()) return
    setSaving(true)
    try {
      const encryptedProfile = await encryptMessage(
        JSON.stringify({ displayName: displayName.trim() }),
        adminDecryptionPubkey ?? '',
      )
      const updated = await updateDirectoryContact(contact.id, { encryptedProfile })
      onUpdated(updated as unknown as DirectoryContactSummary)
      onOpenChange(false)
    } catch {
      toast(t('contactDirectory.editError', { defaultValue: 'Failed to update contact' }), 'error')
    } finally {
      setSaving(false)
    }
  }, [displayName, contact.id, adminDecryptionPubkey, onUpdated, onOpenChange, t, toast])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contactDirectory.editContact', { defaultValue: 'Edit Contact' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('contactDirectory.displayName', { defaultValue: 'Display Name' })}</Label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              disabled={saving}
              data-testid="edit-contact-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire edit button into contacts-directory.tsx**

In `src/client/routes/contacts-directory.tsx`, locate the selected-contact detail area (where `ContactProfile` is rendered). Add an Edit button in the contact detail header area and import + render `EditContactDialog`:

```typescript
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog'

// Inside the component, add state:
const [editDialogOpen, setEditDialogOpen] = useState(false)

// In the detail header JSX, add after the contact name/type display:
{selectedContact?.canDecrypt && hasPermission('contacts:edit') && (
  <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(true)}
    data-testid="edit-contact-button">
    {t('common.edit', { defaultValue: 'Edit' })}
  </Button>
)}

// Below the ContactProfile render:
{selectedContact && (
  <EditContactDialog
    contact={selectedContact}
    open={editDialogOpen}
    onOpenChange={setEditDialogOpen}
    onUpdated={(updated) => {
      setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
      setEditDialogOpen(false)
    }}
  />
)}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/contacts/edit-contact-dialog.tsx src/client/routes/contacts-directory.tsx
git commit -m "feat(desktop): contact edit dialog with E2EE re-encryption (EP06-A2)"
```

---

## Task 6: Desktop — Relationship Write UI

**Files:**
- Create: `src/client/components/contacts/relationship-write-panel.tsx`
- Modify: `src/client/components/contacts/contact-profile.tsx`

The relationships tab in `ContactProfile` currently renders read-only. This task adds an "Add Relationship" button that opens an inline form, and delete controls on existing relationships.

- [ ] **Step 1: Create relationship-write-panel.tsx**

Create `src/client/components/contacts/relationship-write-panel.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import {
  createContactRelationship, deleteContactRelationship,
  listRawContacts,
  type ContactRelationship, type DirectoryContactSummary,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { encryptMessage } from '@/lib/platform'
import { RELATIONSHIP_TYPES } from '@protocol/schemas/contact-relationships'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { useToast } from '@/lib/toast'

interface RelationshipWritePanelProps {
  contactId: string
  relationships: ContactRelationship[]
  onRelationshipsChange: (rels: ContactRelationship[]) => void
  canWrite: boolean
}

export function RelationshipWritePanel({
  contactId, relationships, onRelationshipsChange, canWrite,
}: RelationshipWritePanelProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  const [targetContactId, setTargetContactId] = useState('')
  const [relType, setRelType] = useState<string>(RELATIONSHIP_TYPES[0])
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!targetContactId || !relType) return
    setSaving(true)
    try {
      const encryptedNotes = await encryptMessage('', adminDecryptionPubkey ?? '')
      const rel = await createContactRelationship(contactId, {
        contactIdB: targetContactId,
        relationshipType: relType,
        direction: 'bidirectional',
        encryptedNotes,
        notesEnvelopes: [],
      })
      onRelationshipsChange([...relationships, rel])
      setAdding(false)
      setTargetContactId('')
    } catch {
      toast(t('contactDirectory.relationshipCreateError', { defaultValue: 'Failed to add relationship' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(relId: string) {
    try {
      await deleteContactRelationship(contactId, relId)
      onRelationshipsChange(relationships.filter(r => r.id !== relId))
    } catch {
      toast(t('contactDirectory.relationshipDeleteError', { defaultValue: 'Failed to remove relationship' }), 'error')
    }
  }

  return (
    <div className="space-y-3" data-testid="relationship-write-panel">
      {relationships.map(rel => (
        <div key={rel.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground capitalize">{rel.relationshipType.replace('_', ' ')}</span>
          {canWrite && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(rel.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {canWrite && !adding && (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('contactDirectory.addRelationship', { defaultValue: 'Add Relationship' })}
        </Button>
      )}
      {adding && (
        <div className="space-y-2 rounded-md border p-3">
          <Input
            placeholder={t('contactDirectory.contactIdPlaceholder', { defaultValue: 'Contact ID' })}
            value={targetContactId}
            onChange={e => setTargetContactId(e.target.value)}
            disabled={saving}
          />
          <Select value={relType} onValueChange={setRelType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_TYPES.map(rt => (
                <SelectItem key={rt} value={rt}>{rt.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving || !targetContactId}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into contact-profile.tsx relationships tab**

In `src/client/components/contacts/contact-profile.tsx`, in the `relationships` tab render section, replace the read-only display with `RelationshipWritePanel`. Add the import and state:

```typescript
import { RelationshipWritePanel } from './relationship-write-panel'
import { usePermissions } from '@/lib/auth'

// In RelationshipsTab (or wherever relationships are rendered):
const { hasPermission } = usePermissions()
const canWrite = hasPermission('contacts:manage-relationships')

// Replace static list with:
<RelationshipWritePanel
  contactId={contact.id}
  relationships={relationships}
  onRelationshipsChange={setRelationships}
  canWrite={canWrite}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/contacts/relationship-write-panel.tsx src/client/components/contacts/contact-profile.tsx
git commit -m "feat(desktop): relationship write panel in contact profile (EP06-A2)"
```

---

## Task 7: Desktop — Affinity Group Management UI

**Files:**
- Create: `src/client/components/contacts/affinity-groups-sidebar.tsx`
- Modify: `src/client/routes/contacts-directory.tsx`

- [ ] **Step 1: Create affinity-groups-sidebar.tsx**

Create `src/client/components/contacts/affinity-groups-sidebar.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import {
  listAffinityGroups, createAffinityGroup, updateAffinityGroup,
  deleteAffinityGroup, addGroupMember, removeGroupMember,
  type AffinityGroup,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { encryptMessage } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users, Plus, Trash2, Pencil, Loader2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { usePermissions } from '@/lib/auth'

interface AffinityGroupsSidebarProps {
  selectedGroupId: string | null
  onGroupSelect: (groupId: string | null) => void
}

export function AffinityGroupsSidebar({ selectedGroupId, onGroupSelect }: AffinityGroupsSidebarProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey } = useAuth()
  const { hasPermission } = usePermissions()
  const { toast } = useToast()
  const canManage = hasPermission('contacts:manage-groups')

  const [groups, setGroups] = useState<AffinityGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listAffinityGroups()
      .then(r => setGroups(r.groups))
      .catch(() => toast(t('contactDirectory.groupsLoadError', { defaultValue: 'Failed to load groups' }), 'error'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newGroupName.trim()) return
    setSaving(true)
    try {
      const encryptedDetails = await encryptMessage(
        JSON.stringify({ name: newGroupName.trim() }),
        adminDecryptionPubkey ?? '',
      )
      const group = await createAffinityGroup({
        encryptedDetails,
        detailEnvelopes: [],
        members: [],
      })
      setGroups(prev => [...prev, group])
      setCreating(false)
      setNewGroupName('')
    } catch {
      toast(t('contactDirectory.groupCreateError', { defaultValue: 'Failed to create group' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(groupId: string) {
    try {
      await deleteAffinityGroup(groupId)
      setGroups(prev => prev.filter(g => g.id !== groupId))
      if (selectedGroupId === groupId) onGroupSelect(null)
    } catch {
      toast(t('contactDirectory.groupDeleteError', { defaultValue: 'Failed to delete group' }), 'error')
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="affinity-groups-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('contactDirectory.groups', { defaultValue: 'Groups' })}
        </span>
        {canManage && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-1">
          <button
            onClick={() => onGroupSelect(null)}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors
              ${selectedGroupId === null ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
          >
            <Users className="h-3.5 w-3.5" />
            {t('contactDirectory.allContacts', { defaultValue: 'All Contacts' })}
          </button>
          {groups.map(group => (
            <div key={group.id} className="group flex items-center">
              <button
                onClick={() => onGroupSelect(group.id)}
                className={`flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors
                  ${selectedGroupId === group.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{group.id.slice(0, 8)}</span>
                <span className="ml-auto text-xs text-muted-foreground">{group.memberCount}</span>
              </button>
              {canManage && (
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(group.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      {creating && (
        <div className="border-t p-2 space-y-2">
          <Input
            placeholder={t('contactDirectory.groupNamePlaceholder', { defaultValue: 'Group name' })}
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            disabled={saving}
            autoFocus
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleCreate} disabled={saving || !newGroupName.trim()}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t('common.create', { defaultValue: 'Create' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewGroupName('') }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into contacts-directory.tsx**

In `src/client/routes/contacts-directory.tsx`, add the groups sidebar as a narrow panel to the left of the contact list, add `selectedGroupId` state, and pass it as a filter when fetching contacts:

```typescript
import { AffinityGroupsSidebar } from '@/components/contacts/affinity-groups-sidebar'

// Add state:
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

// In the layout, wrap the existing list/detail split with a three-column layout:
// [groups sidebar 160px] | [contact list] | [contact detail]
// Pass selectedGroupId to the contacts fetch so only group members appear when a group is selected.
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/contacts/affinity-groups-sidebar.tsx src/client/routes/contacts-directory.tsx
git commit -m "feat(desktop): affinity group management sidebar in contacts directory (EP06-A2)"
```

---

## Task 8: Desktop — Location Field in SchemaForm

**Files:**
- Modify: `src/client/components/cases/schema-form.tsx`

The `LocationField` component already exists at `src/client/components/ui/location-field.tsx` with geocoding autocomplete and precision capping. `SchemaForm`'s `FieldInput` switch falls through to a plain `<Input>` for `type: 'location'`. This task wires in the real component.

- [ ] **Step 1: Import LocationField into schema-form.tsx**

In `src/client/components/cases/schema-form.tsx`, add to the import block:

```typescript
import { LocationField, type LocationFieldValue } from '@/components/ui/location-field'
```

- [ ] **Step 2: Add location case to FieldInput switch**

In the `FieldInput` function's `switch (field.type)` block, insert before `default:`:

```typescript
case 'location': {
  const locVal = value ? (typeof value === 'string' ? JSON.parse(value) as LocationFieldValue : null) : null
  if (readOnly) {
    return (
      <Input
        id={fieldId}
        data-testid={`input-${field.name}`}
        value={locVal?.address ?? ''}
        readOnly
        disabled={disabled}
        className="bg-muted/50"
      />
    )
  }
  return (
    <LocationField
      value={locVal}
      onChange={loc => onChange(loc ? JSON.stringify(loc) : '')}
      maxPrecision={field.locationOptions?.maxPrecision ?? 'exact'}
      allowAutocomplete={field.locationOptions?.allowAutocomplete ?? true}
      placeholder={field.placeholder}
      disabled={disabled}
    />
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/cases/schema-form.tsx
git commit -m "feat(desktop): wire LocationField into SchemaForm for location field type (EP06-A2)"
```

---

## Task 9: Desktop — Entity File Upload Field Component

**Files:**
- Create: `src/client/components/cases/entity-file-field.tsx`
- Modify: `src/client/components/cases/schema-form.tsx`

The existing `FileUpload` (`src/client/components/FileUpload.tsx`) is conversation-scoped. Entity fields need a simpler field-level component: pick a file, encrypt client-side, upload via `POST /api/uploads/entity-file`, store the `FileFieldValue` JSON as the field value.

- [ ] **Step 1: Create entity-file-field.tsx**

Create `src/client/components/cases/entity-file-field.tsx`:

```typescript
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, X, File as FileIcon } from 'lucide-react'
import { encryptFile } from '@/lib/file-crypto'
import { uploadEntityFile } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import type { FileFieldValue } from '@protocol/schemas/entity-schema'

interface EntityFileFieldProps {
  value: FileFieldValue | null
  onChange: (value: FileFieldValue | null) => void
  maxFileSize?: number   // bytes, default 10 MB
  allowedMimeTypes?: string[]
  disabled?: boolean
}

export function EntityFileField({
  value, onChange, maxFileSize = 10 * 1024 * 1024, allowedMimeTypes, disabled = false,
}: EntityFileFieldProps) {
  const { t } = useTranslation()
  const { adminDecryptionPubkey, publicKey } = useAuth()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)

  async function handleFile(file: File) {
    if (file.size > maxFileSize) {
      toast(t('cms.fileTooLarge', { defaultValue: 'File exceeds maximum size' }), 'error')
      return
    }
    if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
      toast(t('cms.fileTypeNotAllowed', { defaultValue: 'File type not allowed' }), 'error')
      return
    }

    setProgress(10)
    try {
      const recipients = [publicKey, adminDecryptionPubkey].filter(Boolean) as string[]
      const encrypted = await encryptFile(file, recipients)
      setProgress(50)
      const { fileId, uploadedAt } = await uploadEntityFile(
        new File([encrypted.encryptedContent], file.name, { type: 'application/octet-stream' }),
      )
      setProgress(100)

      const fieldValue: FileFieldValue = {
        fileId,
        encryptedName: encrypted.encryptedMetadata,  // metadata blob contains name
        encryptedMimeType: '',
        encryptedSize: '',
        recipientEnvelopes: encrypted.recipientEnvelopes,
        uploadedAt,
      }
      onChange(fieldValue)
    } catch {
      toast(t('cms.fileUploadError', { defaultValue: 'Upload failed' }), 'error')
    } finally {
      setProgress(null)
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2" data-testid="entity-file-value">
        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm text-muted-foreground">
          {t('cms.fileAttached', { defaultValue: 'File attached' })}
        </span>
        {!disabled && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={allowedMimeTypes?.join(',')}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      {progress !== null ? (
        <div className="space-y-1">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{t('cms.uploading', { defaultValue: 'Uploading…' })}</p>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 w-full"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          data-testid="entity-file-upload-btn"
        >
          <Upload className="h-3.5 w-3.5" />
          {t('cms.chooseFile', { defaultValue: 'Choose File' })}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add file case to schema-form.tsx FieldInput switch**

In `src/client/components/cases/schema-form.tsx`, add import:

```typescript
import { EntityFileField } from './entity-file-field'
import type { FileFieldValue } from '@protocol/schemas/entity-schema'
```

Add before `default:` in `FieldInput`:

```typescript
case 'file': {
  const fileVal = value
    ? (typeof value === 'string' ? JSON.parse(value) as FileFieldValue : value as FileFieldValue)
    : null
  if (readOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        {fileVal ? t('cms.fileAttached', { defaultValue: 'File attached' }) : '—'}
      </p>
    )
  }
  return (
    <EntityFileField
      value={fileVal}
      onChange={fv => onChange(fv ? JSON.stringify(fv) : '')}
      disabled={disabled}
    />
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/client/components/cases/entity-file-field.tsx src/client/components/cases/schema-form.tsx
git commit -m "feat(desktop): EntityFileField component + file case in SchemaForm (EP06-A2)"
```

---

## Task 10: Desktop — Field Definition Editor (Shared Component)

**Files:**
- Create: `src/client/components/admin-settings/field-definition-editor.tsx`
- Modify: `src/client/components/admin-settings/report-types-section.tsx`

The `ReportTypeFieldsEditor` in `report-types-section.tsx` (line 301) is an inline component over `CustomFieldDefinition[]`. Entity type admin also needs to edit field definitions. This task extracts it to a shared `FieldDefinitionEditor` component that works over both `CustomFieldDefinition` (report types) and `EntityFieldDefinition` (entity types). The two types share enough surface area that a single generic editor covers both — the differing fields (e.g. `section`, `accessLevel`) are optional.

- [ ] **Step 1: Create field-definition-editor.tsx**

Create `src/client/components/admin-settings/field-definition-editor.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Trash2, Plus, GripVertical } from 'lucide-react'

// Minimal shape covering both CustomFieldDefinition and EntityFieldDefinition
export interface EditableField {
  id: string
  name: string
  label: string
  type: string
  required: boolean
  visibleToUsers?: boolean
  editableByUsers?: boolean
  section?: string
  accessLevel?: string
  placeholder?: string
  helpText?: string
  order: number
}

const FIELD_TYPES = [
  'text', 'number', 'select', 'multiselect', 'checkbox', 'textarea', 'date', 'file', 'location',
] as const

interface FieldDefinitionEditorProps {
  fields: EditableField[]
  onChange: (fields: EditableField[]) => void
  /** Whether to show the section and accessLevel properties (entity type admin only) */
  showEntityOptions?: boolean
}

export function FieldDefinitionEditor({ fields, onChange, showEntityOptions = false }: FieldDefinitionEditorProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<EditableField> | null>(null)

  function startAdd() {
    const newField: Partial<EditableField> = {
      type: 'text',
      required: false,
      visibleToUsers: true,
      editableByUsers: true,
      order: fields.length,
    }
    setDraft(newField)
    setEditingId(null)
  }

  function startEdit(field: EditableField) {
    setDraft({ ...field })
    setEditingId(field.id)
  }

  function commitDraft() {
    if (!draft?.label?.trim() || !draft?.name?.trim()) return
    if (editingId) {
      onChange(fields.map(f => f.id === editingId ? { ...f, ...draft } as EditableField : f))
    } else {
      onChange([...fields, { ...draft, id: crypto.randomUUID(), order: fields.length } as EditableField])
    }
    setDraft(null)
    setEditingId(null)
  }

  function deleteField(id: string) {
    onChange(fields.filter(f => f.id !== id))
  }

  return (
    <div className="space-y-2" data-testid="field-definition-editor">
      {fields
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(field => (
          <div
            key={field.id}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium">{field.label}</span>
            <span className="text-xs text-muted-foreground capitalize">{field.type}</span>
            {field.required && (
              <span className="text-xs text-destructive">
                {t('cms.required', { defaultValue: 'Required' })}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(field)}>
              <Plus className="h-3.5 w-3.5 rotate-45" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteField(field.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

      {draft !== null && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t('cms.fieldLabel', { defaultValue: 'Label' })}</Label>
              <Input
                value={draft.label ?? ''}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder={t('cms.fieldLabelPlaceholder', { defaultValue: 'Display label' })}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('cms.fieldName', { defaultValue: 'Field name' })}</Label>
              <Input
                value={draft.name ?? ''}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') }))}
                placeholder={t('cms.fieldNamePlaceholder', { defaultValue: 'snake_case_name' })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t('cms.fieldType', { defaultValue: 'Type' })}</Label>
              <Select value={draft.type ?? 'text'} onValueChange={v => setDraft(d => ({ ...d, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft} value={ft} className="capitalize">{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showEntityOptions && (
              <div className="space-y-1">
                <Label>{t('cms.fieldSection', { defaultValue: 'Section' })}</Label>
                <Input
                  value={draft.section ?? ''}
                  onChange={e => setDraft(d => ({ ...d, section: e.target.value }))}
                  placeholder={t('cms.fieldSectionPlaceholder', { defaultValue: 'Optional grouping' })}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch
                checked={!!draft.required}
                onCheckedChange={v => setDraft(d => ({ ...d, required: v }))}
              />
              {t('cms.required', { defaultValue: 'Required' })}
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={commitDraft} disabled={!draft.label?.trim() || !draft.name?.trim()}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setEditingId(null) }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {draft === null && (
        <Button variant="outline" size="sm" className="gap-1" onClick={startAdd}
          data-testid="add-field-btn">
          <Plus className="h-3.5 w-3.5" />
          {t('cms.addField', { defaultValue: 'Add Field' })}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace inline ReportTypeFieldsEditor with FieldDefinitionEditor**

In `src/client/components/admin-settings/report-types-section.tsx`:

1. Add import at top:

```typescript
import { FieldDefinitionEditor, type EditableField } from './field-definition-editor'
```

2. Delete the inline `ReportTypeFieldsEditor` function (lines 301 onwards).

3. At the call site where `<ReportTypeFieldsEditor>` is used, replace with:

```typescript
<FieldDefinitionEditor
  fields={reportType.fields.map(f => ({ ...f, order: f.order ?? 0 }))}
  onChange={fields => handleFieldsChange(reportType.id, fields)}
/>
```

Where `handleFieldsChange` is the existing function that updates report type fields.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: clean. No regressions in report types section.

- [ ] **Step 4: Add i18n strings**

In `packages/i18n/locales/en.json`, add to the `cms` section (create it if absent):

```json
"cms": {
  "addField": "Add Field",
  "fieldLabel": "Label",
  "fieldLabelPlaceholder": "Display label",
  "fieldName": "Field name",
  "fieldNamePlaceholder": "snake_case_name",
  "fieldType": "Type",
  "fieldSection": "Section",
  "fieldSectionPlaceholder": "Optional grouping",
  "required": "Required",
  "fileAttached": "File attached",
  "chooseFile": "Choose File",
  "uploading": "Uploading…",
  "fileUploadError": "Upload failed",
  "fileTooLarge": "File exceeds maximum size",
  "fileTypeNotAllowed": "File type not allowed"
}
```

Run i18n validate:

```bash
bun run i18n:validate:desktop
```

- [ ] **Step 5: Commit**

```bash
git add src/client/components/admin-settings/field-definition-editor.tsx src/client/components/admin-settings/report-types-section.tsx packages/i18n/locales/en.json
git commit -m "feat(desktop): extract FieldDefinitionEditor, wire into report types section (EP06-A2)"
```

---

---

## Task 11: iOS — Contact Create/Edit Views with E2EE + Blind Indexes

**Files:**
- Create: `apps/ios/Sources/Views/Contacts/CreateContactView.swift`
- Create: `apps/ios/Sources/Views/Contacts/EditContactView.swift`
- Create: `apps/ios/Sources/ViewModels/ContactFormViewModel.swift`
- Modify: `apps/ios/Sources/Views/Contacts/ContactsView.swift`

E2EE follows the same pattern as desktop: encrypt via `CryptoService.encryptHpke`, compute HMAC blind indexes for name trigrams and phone via `CryptoService.hmac` with `LABEL_HMAC_CONTACT_NAME` / `LABEL_HMAC_CONTACT_PHONE`. Offline payloads are queued via the existing `OfflineQueue` and flushed on reconnect.

- [ ] **Step 1: Create ContactFormViewModel.swift**

Create `apps/ios/Sources/ViewModels/ContactFormViewModel.swift`:

```swift
import Foundation
import Observation

@Observable
final class ContactFormViewModel {
    var displayName = ""
    var phone = ""
    var email = ""
    var tags: [String] = []
    var notes = ""
    var isSaving = false
    var error: String?

    private let cryptoService: CryptoService
    private let apiService: ContactsAPIService

    init(cryptoService: CryptoService = .shared, apiService: ContactsAPIService = .shared) {
        self.cryptoService = cryptoService
        self.apiService = apiService
    }

    func populate(from contact: DirectoryContact) {
        displayName = contact.displayName
        phone = contact.phone ?? ""
        email = contact.email ?? ""
    }

    func save(hubKey: Data) async throws -> DirectoryContactSummary {
        isSaving = true
        defer { isSaving = false }

        let profile = ContactProfile(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            phone: phone.isEmpty ? nil : phone,
            email: email.isEmpty ? nil : email,
            tags: tags,
            notes: notes.isEmpty ? nil : notes
        )
        let plaintext = try JSONEncoder().encode(profile)
        let encryptedProfile = try cryptoService.encryptHpke(plaintext: plaintext, hubKey: hubKey)

        // Blind indexes
        let nameIndex = try cryptoService.hmacContactName(displayName, hubKey: hubKey)
        let phoneIndex = phone.isEmpty ? nil : (try cryptoService.hmacContactPhone(phone, hubKey: hubKey))

        let body = CreateContactBody(
            encryptedProfile: encryptedProfile.base64EncodedString(),
            profileEnvelopes: [],
            blindIndexes: ContactBlindIndexes(nameTokens: [nameIndex], phoneToken: phoneIndex)
        )
        return try await apiService.createContact(body)
    }

    func update(contactId: String, hubKey: Data) async throws -> DirectoryContactSummary {
        isSaving = true
        defer { isSaving = false }

        let profile = ContactProfile(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            phone: phone.isEmpty ? nil : phone,
            email: email.isEmpty ? nil : email,
            tags: tags,
            notes: notes.isEmpty ? nil : notes
        )
        let plaintext = try JSONEncoder().encode(profile)
        let encryptedProfile = try cryptoService.encryptHpke(plaintext: plaintext, hubKey: hubKey)
        let nameIndex = try cryptoService.hmacContactName(displayName, hubKey: hubKey)
        let phoneIndex = phone.isEmpty ? nil : (try cryptoService.hmacContactPhone(phone, hubKey: hubKey))

        let body = UpdateContactBody(
            encryptedProfile: encryptedProfile.base64EncodedString(),
            profileEnvelopes: [],
            blindIndexes: ContactBlindIndexes(nameTokens: [nameIndex], phoneToken: phoneIndex)
        )
        return try await apiService.updateContact(id: contactId, body: body)
    }
}
```

- [ ] **Step 2: Create CreateContactView.swift**

Create `apps/ios/Sources/Views/Contacts/CreateContactView.swift`:

```swift
import SwiftUI

struct CreateContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HubKeyStore.self) private var hubKeyStore
    @State private var vm = ContactFormViewModel()
    var onCreated: (DirectoryContactSummary) -> Void

    var body: some View {
        NavigationStack {
            ContactFormFields(vm: vm)
                .navigationTitle(String(localized: "contacts.createTitle"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "common.cancel")) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.save")) { save() }
                            .disabled(vm.displayName.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSaving)
                    }
                }
                .overlay { if vm.isSaving { ProgressView() } }
        }
    }

    private func save() {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        Task {
            do {
                let contact = try await vm.save(hubKey: hubKey)
                await MainActor.run { onCreated(contact); dismiss() }
            } catch {
                vm.error = error.localizedDescription
            }
        }
    }
}
```

- [ ] **Step 3: Create EditContactView.swift**

Create `apps/ios/Sources/Views/Contacts/EditContactView.swift`:

```swift
import SwiftUI

struct EditContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HubKeyStore.self) private var hubKeyStore
    @State private var vm = ContactFormViewModel()
    let contact: DirectoryContact
    var onUpdated: (DirectoryContactSummary) -> Void

    var body: some View {
        NavigationStack {
            ContactFormFields(vm: vm)
                .navigationTitle(String(localized: "contacts.editTitle"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "common.cancel")) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.save")) { update() }
                            .disabled(vm.displayName.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSaving)
                    }
                }
        }
        .onAppear { vm.populate(from: contact) }
    }

    private func update() {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        Task {
            do {
                let updated = try await vm.update(contactId: contact.id, hubKey: hubKey)
                await MainActor.run { onUpdated(updated); dismiss() }
            } catch {
                vm.error = error.localizedDescription
            }
        }
    }
}

// Shared form fields sub-view
struct ContactFormFields: View {
    @Bindable var vm: ContactFormViewModel

    var body: some View {
        Form {
            Section(String(localized: "contacts.sectionBasic")) {
                TextField(String(localized: "contacts.displayName"), text: $vm.displayName)
                    .accessibilityIdentifier("contact-display-name")
                TextField(String(localized: "contacts.phone"), text: $vm.phone)
                    .keyboardType(.phonePad)
                TextField(String(localized: "contacts.email"), text: $vm.email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
            }
            Section(String(localized: "contacts.sectionNotes")) {
                TextEditor(text: $vm.notes)
                    .frame(minHeight: 80)
            }
            if let error = vm.error {
                Section {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }
        }
    }
}
```

- [ ] **Step 4: Wire create button into ContactsView.swift**

In `apps/ios/Sources/Views/Contacts/ContactsView.swift`, add a toolbar `+` button that presents `CreateContactView` as a sheet, and wire an edit button in the contact detail context. Follow the existing pattern for sheet presentation already used for cases.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Sources/Views/Contacts/ apps/ios/Sources/ViewModels/ContactFormViewModel.swift
git commit -m "feat(ios): contact create/edit views with E2EE + blind indexes (EP06-A2)"
```

---

## Task 12: iOS — Entity Type Admin Views (Hub Admin)

**Files:**
- Create: `apps/ios/Sources/Views/Admin/EntityTypeAdminView.swift`
- Create: `apps/ios/Sources/Views/Admin/EntityTypeEditorView.swift`
- Create: `apps/ios/Sources/Views/Admin/FieldDefinitionEditorView.swift`

Hub admins reach this via Settings → Hub Admin → Entity Types. The shared `FieldDefinitionEditorView` is reused by the entity type editor and the report type editor in Task 12.

- [ ] **Step 1: Create FieldDefinitionEditorView.swift**

Create `apps/ios/Sources/Views/Admin/FieldDefinitionEditorView.swift`:

```swift
import SwiftUI

struct FieldDefinitionEditorView: View {
    @Binding var fields: [EditableField]
    var showEntityOptions: Bool = false
    @State private var showAddSheet = false
    @State private var editingField: EditableField?

    var body: some View {
        List {
            ForEach($fields) { $field in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(field.label).font(.subheadline).fontWeight(.medium)
                        Text(field.type).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if field.required {
                        Text(String(localized: "cms.required"))
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { editingField = field }
            }
            .onDelete { fields.remove(atOffsets: $0) }
            .onMove { fields.move(fromOffsets: $0, toOffset: $1) }
        }
        .environment(\.editMode, .constant(.active))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showAddSheet = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            FieldPropertyEditorSheet(field: nil) { newField in
                fields.append(newField)
            }
        }
        .sheet(item: $editingField) { field in
            FieldPropertyEditorSheet(field: field) { updated in
                if let i = fields.firstIndex(where: { $0.id == updated.id }) {
                    fields[i] = updated
                }
            }
        }
    }
}

struct FieldPropertyEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let field: EditableField?
    var onSave: (EditableField) -> Void

    @State private var label = ""
    @State private var name = ""
    @State private var type = "text"
    @State private var required = false

    private let fieldTypes = ["text","number","select","multiselect","checkbox","textarea","date","file","location"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: "cms.fieldLabel"), text: $label)
                    TextField(String(localized: "cms.fieldName"), text: $name)
                        .autocapitalization(.none)
                    Picker(String(localized: "cms.fieldType"), selection: $type) {
                        ForEach(fieldTypes, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle(String(localized: "cms.required"), isOn: $required)
                }
            }
            .navigationTitle(field == nil
                ? String(localized: "cms.addField")
                : String(localized: "cms.editField"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) {
                        let f = EditableField(
                            id: field?.id ?? UUID().uuidString,
                            name: name.replacingOccurrences(of: " ", with: "_").lowercased(),
                            label: label, type: type,
                            required: required, order: field?.order ?? 0
                        )
                        onSave(f)
                        dismiss()
                    }
                    .disabled(label.isEmpty || name.isEmpty)
                }
            }
        }
        .onAppear {
            if let f = field { label = f.label; name = f.name; type = f.type; required = f.required }
        }
    }
}
```

- [ ] **Step 2: Create EntityTypeEditorView.swift**

Create `apps/ios/Sources/Views/Admin/EntityTypeEditorView.swift`:

```swift
import SwiftUI

struct EntityTypeEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var entityType: EntityTypeDefinition
    var onSave: (EntityTypeDefinition) -> Void
    @State private var isSaving = false
    @State private var fields: [EditableField] = []

    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "admin.entityType.sectionGeneral")) {
                    TextField(String(localized: "admin.entityType.label"), text: $entityType.label)
                    TextField(String(localized: "admin.entityType.labelPlural"), text: Binding(
                        get: { entityType.labelPlural ?? "" },
                        set: { entityType.labelPlural = $0.isEmpty ? nil : $0 }
                    ))
                    Toggle(String(localized: "admin.entityType.showInNavigation"),
                           isOn: Binding(
                            get: { entityType.showInNavigation ?? true },
                            set: { entityType.showInNavigation = $0 }
                           ))
                }
                Section(String(localized: "cms.fields")) {
                    NavigationLink(String(localized: "cms.editFields")) {
                        FieldDefinitionEditorView(fields: $fields, showEntityOptions: true)
                            .navigationTitle(String(localized: "cms.fields"))
                    }
                }
            }
            .navigationTitle(entityType.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) { save() }
                        .disabled(isSaving || entityType.label.isEmpty)
                }
            }
        }
    }

    private func save() {
        isSaving = true
        Task {
            do {
                let api = EntitySchemaAPIService.shared
                let updated = try await api.customizeEntityType(
                    id: entityType.id,
                    label: entityType.label,
                    labelPlural: entityType.labelPlural,
                    showInNavigation: entityType.showInNavigation
                )
                await MainActor.run { onSave(updated); dismiss() }
            } catch {
                // surface via alert; isSaving reset
            }
            await MainActor.run { isSaving = false }
        }
    }
}
```

- [ ] **Step 3: Create EntityTypeAdminView.swift**

Create `apps/ios/Sources/Views/Admin/EntityTypeAdminView.swift`:

```swift
import SwiftUI

struct EntityTypeAdminView: View {
    @State private var entityTypes: [EntityTypeDefinition] = []
    @State private var loading = true
    @State private var editingType: EntityTypeDefinition?

    var body: some View {
        List {
            ForEach(entityTypes) { et in
                HStack {
                    VStack(alignment: .leading) {
                        Text(et.label).fontWeight(.medium)
                        if let plural = et.labelPlural {
                            Text(plural).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
                .onTapGesture { editingType = et }
            }
        }
        .navigationTitle(String(localized: "admin.entityTypes.title"))
        .task { await loadTypes() }
        .sheet(item: $editingType) { et in
            EntityTypeEditorView(entityType: et) { updated in
                if let i = entityTypes.firstIndex(where: { $0.id == updated.id }) {
                    entityTypes[i] = updated
                }
            }
        }
        .overlay { if loading { ProgressView() } }
    }

    private func loadTypes() async {
        do {
            entityTypes = try await EntitySchemaAPIService.shared.listEntityTypes()
        } catch { /* show inline error */ }
        loading = false
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Admin/
git commit -m "feat(ios): entity type admin views — FieldDefinitionEditor + EntityTypeAdmin (EP06-A2)"
```

---

## Task 13: iOS — Location + File Field Views

**Files:**
- Create: `apps/ios/Sources/Views/Components/LocationFieldView.swift`
- Create: `apps/ios/Sources/Views/Components/EntityFileFieldView.swift`

- [ ] **Step 1: Create LocationFieldView.swift**

Uses `CLLocationManager` for GPS and `MKLocalSearchCompleter` for autocomplete. Precision-capping is applied client-side before the value is stored.

Create `apps/ios/Sources/Views/Components/LocationFieldView.swift`:

```swift
import SwiftUI
import CoreLocation
import MapKit

@Observable
final class LocationFieldViewModel: NSObject, CLLocationManagerDelegate, MKLocalSearchCompleterDelegate {
    var address = ""
    var suggestions: [MKLocalSearchCompletion] = []
    var isLocating = false
    var selectedLocation: LocationFieldValue?

    private let locationManager = CLLocationManager()
    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        locationManager.delegate = self
        completer.delegate = self
        completer.resultTypes = .address
    }

    func requestCurrentLocation() {
        isLocating = true
        locationManager.requestWhenInUseAuthorization()
        locationManager.requestLocation()
    }

    func search(_ query: String) {
        address = query
        completer.queryFragment = query
    }

    func select(_ completion: MKLocalSearchCompletion) {
        address = completion.title + (completion.subtitle.isEmpty ? "" : ", \(completion.subtitle)")
        suggestions = []
        Task {
            let search = MKLocalSearch(request: MKLocalSearch.Request(completion: completion))
            if let item = try? await search.start().mapItems.first {
                let coord = item.placemark.coordinate
                selectedLocation = LocationFieldValue(
                    address: address,
                    lat: coord.latitude,
                    lon: coord.longitude,
                    precision: "block",
                    source: "search"
                )
            }
        }
    }

    // CLLocationManagerDelegate
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        isLocating = false
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(loc) { [weak self] placemarks, _ in
            guard let self, let p = placemarks?.first else { return }
            let addr = [p.thoroughfare, p.locality, p.administrativeArea].compactMap { $0 }.joined(separator: ", ")
            self.address = addr
            self.selectedLocation = LocationFieldValue(
                address: addr,
                lat: loc.coordinate.latitude,
                lon: loc.coordinate.longitude,
                precision: "block",
                source: "gps"
            )
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { isLocating = false }

    // MKLocalSearchCompleterDelegate
    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) { suggestions = completer.results }
    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) { suggestions = [] }
}

struct LocationFieldView: View {
    @Binding var value: LocationFieldValue?
    var disabled: Bool = false
    @State private var vm = LocationFieldViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                TextField(String(localized: "cms.locationPlaceholder"), text: Binding(
                    get: { vm.address },
                    set: { vm.search($0) }
                ))
                .disabled(disabled)
                .autocorrectionDisabled()
                if vm.isLocating {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Button {
                        vm.requestCurrentLocation()
                    } label: {
                        Image(systemName: "location.fill").foregroundStyle(.accent)
                    }
                    .disabled(disabled)
                }
            }
            if !vm.suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(vm.suggestions.prefix(5), id: \.title) { suggestion in
                        Button {
                            vm.select(suggestion)
                            value = vm.selectedLocation
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(suggestion.title).font(.subheadline)
                                if !suggestion.subtitle.isEmpty {
                                    Text(suggestion.subtitle).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 8).padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(radius: 4)
            }
        }
        .onChange(of: vm.selectedLocation) { _, newVal in value = newVal }
    }
}
```

- [ ] **Step 2: Create EntityFileFieldView.swift**

Uses `PHPickerViewController` for photos and `UIDocumentPickerViewController` for documents.

Create `apps/ios/Sources/Views/Components/EntityFileFieldView.swift`:

```swift
import SwiftUI
import PhotosUI

struct EntityFileFieldView: View {
    @Binding var value: FileFieldValue?
    var disabled: Bool = false
    @State private var photoItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var uploadProgress: Double = 0
    @State private var error: String?
    @Environment(HubKeyStore.self) private var hubKeyStore

    var body: some View {
        if let fv = value {
            HStack {
                Image(systemName: "doc.fill").foregroundStyle(.secondary)
                Text(String(localized: "cms.fileAttached")).font(.subheadline)
                Spacer()
                if !disabled {
                    Button {
                        value = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                }
            }
        } else if isUploading {
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: uploadProgress)
                Text(String(localized: "cms.uploading")).font(.caption).foregroundStyle(.secondary)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                PhotosPicker(
                    selection: $photoItem,
                    matching: .images,
                    photoLibrary: .shared()
                ) {
                    Label(String(localized: "cms.choosePhoto"), systemImage: "photo")
                }
                .disabled(disabled)
                .onChange(of: photoItem) { _, item in
                    guard let item else { return }
                    Task { await uploadPhoto(item) }
                }
                if let err = error {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
            }
        }
    }

    private func uploadPhoto(_ item: PhotosPickerItem) async {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        isUploading = true
        uploadProgress = 0.1
        error = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            uploadProgress = 0.3
            let encrypted = try CryptoService.shared.encryptHpke(plaintext: data, hubKey: hubKey)
            uploadProgress = 0.6
            let result = try await FilesAPIService.shared.uploadEntityFile(encrypted)
            uploadProgress = 1.0
            let fv = FileFieldValue(
                fileId: result.fileId,
                encryptedName: "",
                encryptedMimeType: "",
                encryptedSize: "",
                recipientEnvelopes: [],
                uploadedAt: result.uploadedAt
            )
            await MainActor.run { value = fv }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
        await MainActor.run { isUploading = false; photoItem = nil }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Components/LocationFieldView.swift apps/ios/Sources/Views/Components/EntityFileFieldView.swift
git commit -m "feat(ios): LocationFieldView (CLLocationManager + MKLocalSearchCompleter) + EntityFileFieldView (EP06-A2)"
```

---

## Task 14: iOS — Affinity Group Views

**Files:**
- Create: `apps/ios/Sources/Views/Contacts/AffinityGroupsView.swift`
- Create: `apps/ios/Sources/Views/Contacts/GroupDetailView.swift`
- Modify: `apps/ios/Sources/Views/Contacts/ContactsView.swift`

- [ ] **Step 1: Create AffinityGroupsView.swift**

Create `apps/ios/Sources/Views/Contacts/AffinityGroupsView.swift`:

```swift
import SwiftUI

struct AffinityGroupsView: View {
    @State private var groups: [AffinityGroup] = []
    @State private var loading = true
    @State private var showCreate = false
    @State private var newGroupName = ""
    @Environment(HubKeyStore.self) private var hubKeyStore
    @Environment(AuthStore.self) private var authStore

    var canManage: Bool { authStore.hasPermission("contacts:manage-groups") }

    var body: some View {
        List {
            ForEach(groups) { group in
                NavigationLink {
                    GroupDetailView(group: group) { updated in
                        if let i = groups.firstIndex(where: { $0.id == updated.id }) {
                            groups[i] = updated
                        }
                    }
                } label: {
                    HStack {
                        Image(systemName: "person.3.fill").foregroundStyle(.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.id.prefix(8)).fontWeight(.medium)
                            Text("\(group.memberCount) \(String(localized: "contacts.members"))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .onDelete(perform: canManage ? deleteGroups : nil)
        }
        .navigationTitle(String(localized: "contacts.groups"))
        .toolbar {
            if canManage {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .task { await load() }
        .sheet(isPresented: $showCreate) {
            CreateGroupSheet { name in await createGroup(name: name) }
        }
        .overlay { if loading { ProgressView() } }
    }

    private func load() async {
        do { groups = try await ContactsAPIService.shared.listAffinityGroups() }
        catch { /* surface */ }
        loading = false
    }

    private func createGroup(name: String) async {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        do {
            let details = try JSONEncoder().encode(["name": name])
            let encrypted = try CryptoService.shared.encryptHpke(plaintext: details, hubKey: hubKey)
            let group = try await ContactsAPIService.shared.createAffinityGroup(
                encryptedDetails: encrypted.base64EncodedString()
            )
            await MainActor.run { groups.append(group) }
        } catch { /* surface */ }
    }

    private func deleteGroups(at offsets: IndexSet) {
        let ids = offsets.map { groups[$0].id }
        Task {
            for id in ids {
                try? await ContactsAPIService.shared.deleteAffinityGroup(id: id)
            }
            await MainActor.run { groups.remove(atOffsets: offsets) }
        }
    }
}

struct CreateGroupSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onCreate: (String) async -> Void
    @State private var name = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                TextField(String(localized: "contacts.groupName"), text: $name)
            }
            .navigationTitle(String(localized: "contacts.createGroup"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.create")) {
                        saving = true
                        Task { await onCreate(name); await MainActor.run { dismiss() } }
                    }
                    .disabled(name.isEmpty || saving)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Create GroupDetailView.swift**

Create `apps/ios/Sources/Views/Contacts/GroupDetailView.swift`:

```swift
import SwiftUI

struct GroupDetailView: View {
    let group: AffinityGroup
    var onUpdated: (AffinityGroup) -> Void
    @State private var members: [DirectoryContactSummary] = []
    @State private var loading = true
    @Environment(AuthStore.self) private var authStore

    var canManage: Bool { authStore.hasPermission("contacts:manage-groups") }

    var body: some View {
        List {
            ForEach(members) { member in
                Text(member.displayName ?? member.id).font(.subheadline)
            }
            .onDelete(perform: canManage ? removeMembers : nil)
        }
        .navigationTitle(group.id.prefix(8))
        .task { await loadMembers() }
        .overlay { if loading { ProgressView() } }
    }

    private func loadMembers() async {
        do { members = try await ContactsAPIService.shared.listGroupMembers(groupId: group.id) }
        catch { /* surface */ }
        loading = false
    }

    private func removeMembers(at offsets: IndexSet) {
        let ids = offsets.map { members[$0].id }
        Task {
            for id in ids {
                try? await ContactsAPIService.shared.removeGroupMember(groupId: group.id, contactId: id)
            }
            await MainActor.run { members.remove(atOffsets: offsets) }
        }
    }
}
```

- [ ] **Step 3: Add Groups tab to ContactsView**

In `apps/ios/Sources/Views/Contacts/ContactsView.swift`, add a `TabView` or segmented control tab for "Groups" that presents `AffinityGroupsView` as a `NavigationLink` destination, following the existing tab/section pattern in that file.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/Views/Contacts/AffinityGroupsView.swift apps/ios/Sources/Views/Contacts/GroupDetailView.swift apps/ios/Sources/Views/Contacts/ContactsView.swift
git commit -m "feat(ios): affinity group views — list, detail, create, member management (EP06-A2)"
```

---

## Task 15: Android — Contact Create/Edit Screens

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/CreateContactScreen.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt`

E2EE follows the same pattern: `CryptoService` JNI wrapper encrypts the contact profile JSON with the hub key; `CryptoService.hmac` with `LABEL_HMAC_CONTACT_NAME` computes name blind indexes.

- [ ] **Step 1: Create ContactFormViewModel.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt`:

```kotlin
package org.llamenos.hotline.ui.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ContactsApiService
import org.llamenos.hotline.crypto.CryptoService
import javax.inject.Inject

data class ContactFormState(
    val displayName: String = "",
    val phone: String = "",
    val email: String = "",
    val notes: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val savedContact: DirectoryContactSummary? = null,
)

@HiltViewModel
class ContactFormViewModel @Inject constructor(
    private val cryptoService: CryptoService,
    private val contactsApi: ContactsApiService,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactFormState())
    val state: StateFlow<ContactFormState> = _state.asStateFlow()

    fun update(transform: ContactFormState.() -> ContactFormState) {
        _state.value = _state.value.transform()
    }

    fun populate(contact: DirectoryContact) {
        _state.value = _state.value.copy(
            displayName = contact.displayName,
            phone = contact.phone ?: "",
            email = contact.email ?: "",
        )
    }

    fun save(hubKey: ByteArray) = viewModelScope.launch {
        val s = _state.value
        if (s.displayName.isBlank()) return@launch
        _state.value = s.copy(isSaving = true, error = null)
        try {
            val profile = buildString {
                append("""{"displayName":"${s.displayName.trim()}"""")
                if (s.phone.isNotEmpty()) append(""","phone":"${s.phone}"""")
                if (s.email.isNotEmpty()) append(""","email":"${s.email}"""")
                append("}")
            }
            val encryptedProfile = cryptoService.encryptHpke(profile.toByteArray(), hubKey)
            val nameIndex = cryptoService.hmacContactName(s.displayName.trim(), hubKey)
            val phoneIndex = if (s.phone.isNotEmpty()) cryptoService.hmacContactPhone(s.phone, hubKey) else null

            val body = CreateContactBody(
                encryptedProfile = android.util.Base64.encodeToString(encryptedProfile, android.util.Base64.NO_WRAP),
                profileEnvelopes = emptyList(),
                blindIndexes = ContactBlindIndexes(nameTokens = listOf(nameIndex), phoneToken = phoneIndex),
            )
            val created = contactsApi.createContact(body)
            _state.value = _state.value.copy(isSaving = false, savedContact = created)
        } catch (e: Exception) {
            _state.value = _state.value.copy(isSaving = false, error = e.message)
        }
    }

    fun update(contactId: String, hubKey: ByteArray) = viewModelScope.launch {
        val s = _state.value
        if (s.displayName.isBlank()) return@launch
        _state.value = s.copy(isSaving = true, error = null)
        try {
            val profile = buildString {
                append("""{"displayName":"${s.displayName.trim()}"""")
                if (s.phone.isNotEmpty()) append(""","phone":"${s.phone}"""")
                if (s.email.isNotEmpty()) append(""","email":"${s.email}"""")
                append("}")
            }
            val encryptedProfile = cryptoService.encryptHpke(profile.toByteArray(), hubKey)
            val nameIndex = cryptoService.hmacContactName(s.displayName.trim(), hubKey)
            val phoneIndex = if (s.phone.isNotEmpty()) cryptoService.hmacContactPhone(s.phone, hubKey) else null
            val body = UpdateContactBody(
                encryptedProfile = android.util.Base64.encodeToString(encryptedProfile, android.util.Base64.NO_WRAP),
                profileEnvelopes = emptyList(),
                blindIndexes = ContactBlindIndexes(nameTokens = listOf(nameIndex), phoneToken = phoneIndex),
            )
            val updated = contactsApi.updateContact(id = contactId, body = body)
            _state.value = _state.value.copy(isSaving = false, savedContact = updated)
        } catch (e: Exception) {
            _state.value = _state.value.copy(isSaving = false, error = e.message)
        }
    }
}
```

- [ ] **Step 2: Create CreateContactScreen.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/CreateContactScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.ui.LocalHubKeyStore
import org.llamenos.hotline.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateContactScreen(
    onNavigateBack: () -> Unit,
    onCreated: (DirectoryContactSummary) -> Unit,
    viewModel: ContactFormViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val hubKeyStore = LocalHubKeyStore.current

    LaunchedEffect(state.savedContact) {
        state.savedContact?.let { onCreated(it); onNavigateBack() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.contactsCreateTitle) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.Close, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            hubKeyStore.currentHubKey?.let { viewModel.save(it) }
                        },
                        enabled = state.displayName.isNotBlank() && !state.isSaving,
                    ) { Text(I18n.commonSave) }
                },
            )
        }
    ) { padding ->
        ContactFormContent(
            state = state,
            onUpdate = viewModel::update,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
fun ContactFormContent(
    state: ContactFormState,
    onUpdate: (ContactFormState.() -> ContactFormState) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = state.displayName,
            onValueChange = { onUpdate { copy(displayName = it) } },
            label = { Text(I18n.contactsDisplayName) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.phone,
            onValueChange = { onUpdate { copy(phone = it) } },
            label = { Text(I18n.contactsPhone) },
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.email,
            onValueChange = { onUpdate { copy(email = it) } },
            label = { Text(I18n.contactsEmail) },
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}
```

- [ ] **Step 3: Wire into ContactsScreen with FAB**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt`, add a `FloatingActionButton` (following the existing FAB pattern from the cases screen) that navigates to `CreateContactScreen`. For the edit path, add an edit menu option in the contact detail that navigates to `CreateContactScreen` in edit mode (pass `contactId` and pre-populate via `viewModel.populate(contact)`).

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/
git commit -m "feat(android): contact create/edit screens with E2EE + blind indexes via CryptoService JNI (EP06-A2)"
```

---

## Task 16: Android — Entity Type Admin Screens

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/EntityTypeAdminScreen.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/FieldDefinitionEditorScreen.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/EntityTypeAdminViewModel.kt`

- [ ] **Step 1: Create EntityTypeAdminViewModel.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/EntityTypeAdminViewModel.kt`:

```kotlin
package org.llamenos.hotline.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.EntitySchemaApiService
import javax.inject.Inject

@HiltViewModel
class EntityTypeAdminViewModel @Inject constructor(
    private val api: EntitySchemaApiService,
) : ViewModel() {

    private val _entityTypes = MutableStateFlow<List<EntityTypeDefinition>>(emptyList())
    val entityTypes = _entityTypes.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading = _loading.asStateFlow()

    init { load() }

    private fun load() = viewModelScope.launch {
        try { _entityTypes.value = api.listEntityTypes() }
        catch (_: Exception) { }
        _loading.value = false
    }

    fun customize(id: String, label: String, showInNavigation: Boolean) = viewModelScope.launch {
        try {
            val updated = api.customizeEntityType(id, label = label, showInNavigation = showInNavigation)
            _entityTypes.value = _entityTypes.value.map { if (it.id == id) updated else it }
        } catch (_: Exception) { }
    }
}
```

- [ ] **Step 2: Create FieldDefinitionEditorScreen.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/FieldDefinitionEditorScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.I18n

@Composable
fun FieldDefinitionEditorScreen(
    fields: List<EditableField>,
    onFieldsChange: (List<EditableField>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showAddDialog by remember { mutableStateOf(false) }
    var editingField by remember { mutableStateOf<EditableField?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = I18n.cmsAddField)
            }
        }
    ) { padding ->
        LazyColumn(modifier = modifier.padding(padding)) {
            items(fields, key = { it.id }) { field ->
                ListItem(
                    headlineContent = { Text(field.label) },
                    supportingContent = { Text(field.type, style = MaterialTheme.typography.bodySmall) },
                    trailingContent = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (field.required) {
                                Text(
                                    I18n.cmsRequired,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            IconButton(onClick = {
                                onFieldsChange(fields.filter { it.id != field.id })
                            }) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                            }
                        }
                    },
                    modifier = Modifier.clickable { editingField = field }
                )
                HorizontalDivider()
            }
        }
    }

    if (showAddDialog || editingField != null) {
        FieldPropertyDialog(
            field = editingField,
            onDismiss = { showAddDialog = false; editingField = null },
            onSave = { f ->
                if (editingField != null) {
                    onFieldsChange(fields.map { if (it.id == f.id) f else it })
                } else {
                    onFieldsChange(fields + f)
                }
                showAddDialog = false; editingField = null
            }
        )
    }
}

@Composable
private fun FieldPropertyDialog(
    field: EditableField?,
    onDismiss: () -> Unit,
    onSave: (EditableField) -> Unit,
) {
    var label by remember { mutableStateOf(field?.label ?: "") }
    var name by remember { mutableStateOf(field?.name ?: "") }
    var type by remember { mutableStateOf(field?.type ?: "text") }
    var required by remember { mutableStateOf(field?.required ?: false) }
    val fieldTypes = listOf("text", "number", "select", "checkbox", "textarea", "date", "file", "location")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (field == null) I18n.cmsAddField else I18n.cmsEditField) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(label, onValueChange = { label = it },
                    label = { Text(I18n.cmsFieldLabel) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                OutlinedTextField(name, onValueChange = { name = it.replace(" ", "_").lowercase() },
                    label = { Text(I18n.cmsFieldName) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(I18n.cmsRequired, modifier = Modifier.weight(1f))
                    Switch(required, onCheckedChange = { required = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(EditableField(id = field?.id ?: java.util.UUID.randomUUID().toString(),
                        name = name, label = label, type = type, required = required, order = field?.order ?: 0))
                },
                enabled = label.isNotBlank() && name.isNotBlank(),
            ) { Text(I18n.commonSave) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(I18n.commonCancel) } },
    )
}
```

- [ ] **Step 3: Create EntityTypeAdminScreen.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/EntityTypeAdminScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntityTypeAdminScreen(
    onNavigateBack: () -> Unit,
    viewModel: EntityTypeAdminViewModel = hiltViewModel(),
) {
    val entityTypes by viewModel.entityTypes.collectAsState()
    val loading by viewModel.loading.collectAsState()
    var editingType by remember { mutableStateOf<EntityTypeDefinition?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.adminEntityTypesTitle) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(modifier = androidx.compose.ui.Modifier.fillMaxSize(),
                contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(contentPadding = padding) {
                items(entityTypes, key = { it.id }) { et ->
                    ListItem(
                        headlineContent = { Text(et.label) },
                        supportingContent = et.labelPlural?.let { { Text(it) } },
                        modifier = androidx.compose.ui.Modifier.clickable { editingType = et }
                    )
                    HorizontalDivider()
                }
            }
        }
    }

    editingType?.let { et ->
        EntityTypeCustomizeDialog(
            entityType = et,
            onDismiss = { editingType = null },
            onSave = { label, showInNav ->
                viewModel.customize(et.id, label, showInNav)
                editingType = null
            }
        )
    }
}

@Composable
private fun EntityTypeCustomizeDialog(
    entityType: EntityTypeDefinition,
    onDismiss: () -> Unit,
    onSave: (String, Boolean) -> Unit,
) {
    var label by remember { mutableStateOf(entityType.label) }
    var showInNav by remember { mutableStateOf(entityType.showInNavigation ?: true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(I18n.adminEntityTypeEdit) },
        text = {
            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(label, onValueChange = { label = it },
                    label = { Text(I18n.adminEntityTypeLabel) }, singleLine = true,
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth())
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text(I18n.adminEntityTypeShowInNav, modifier = androidx.compose.ui.Modifier.weight(1f))
                    Switch(showInNav, onCheckedChange = { showInNav = it })
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(label, showInNav) }, enabled = label.isNotBlank()) {
                Text(I18n.commonSave)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(I18n.commonCancel) } }
    )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/
git commit -m "feat(android): entity type admin screens + FieldDefinitionEditor (EP06-A2)"
```

---

## Task 17: Android — Location + File Field Composables

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/LocationFieldComposable.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/EntityFileFieldComposable.kt`

- [ ] **Step 1: Create LocationFieldComposable.kt**

Uses `FusedLocationProviderClient` for GPS and Geoapify autocomplete (no Google Places billing required).

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/LocationFieldComposable.kt`:

```kotlin
package org.llamenos.hotline.ui.components

import android.annotation.SuppressLint
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.llamenos.hotline.I18n
import org.llamenos.hotline.api.GeoapifyService

data class LocationFieldValue(
    val address: String,
    val lat: Double,
    val lon: Double,
    val precision: String = "block",
    val source: String = "manual",
)

@SuppressLint("MissingPermission")
@Composable
fun LocationFieldComposable(
    value: LocationFieldValue?,
    onValueChange: (LocationFieldValue?) -> Unit,
    disabled: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf(value?.address ?: "") }
    var suggestions by remember { mutableStateOf<List<GeoapifyService.Suggestion>>(emptyList()) }
    var isLocating by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        OutlinedTextField(
            value = query,
            onValueChange = { q ->
                query = q
                if (q.length > 2) {
                    scope.launch {
                        suggestions = withContext(Dispatchers.IO) {
                            GeoapifyService.autocomplete(q)
                        }
                    }
                } else {
                    suggestions = emptyList()
                }
            },
            label = { Text(I18n.cmsLocationPlaceholder) },
            trailingIcon = {
                if (isLocating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    IconButton(
                        onClick = {
                            scope.launch {
                                isLocating = true
                                val client = LocationServices.getFusedLocationProviderClient(context)
                                val loc = withContext(Dispatchers.IO) {
                                    kotlinx.coroutines.tasks.await(client.lastLocation)
                                }
                                if (loc != null) {
                                    val addr = withContext(Dispatchers.IO) {
                                        GeoapifyService.reverseGeocode(loc.latitude, loc.longitude)
                                    }
                                    query = addr
                                    onValueChange(LocationFieldValue(addr, loc.latitude, loc.longitude, source = "gps"))
                                }
                                isLocating = false
                            }
                        },
                        enabled = !disabled,
                    ) {
                        Icon(Icons.Default.LocationOn, contentDescription = null)
                    }
                }
            },
            enabled = !disabled,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (suggestions.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                LazyColumn {
                    items(suggestions.take(5)) { suggestion ->
                        ListItem(
                            headlineContent = { Text(suggestion.label, style = MaterialTheme.typography.bodyMedium) },
                            modifier = Modifier.clickable {
                                query = suggestion.label
                                suggestions = emptyList()
                                onValueChange(LocationFieldValue(suggestion.label, suggestion.lat, suggestion.lon))
                            }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Create EntityFileFieldComposable.kt**

Uses `ActivityResultContracts.GetContent()` for files.

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/EntityFileFieldComposable.kt`:

```kotlin
package org.llamenos.hotline.ui.components

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.hotline.I18n
import org.llamenos.hotline.api.FilesApiService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.ui.LocalHubKeyStore

@Composable
fun EntityFileFieldComposable(
    value: FileFieldValue?,
    onValueChange: (FileFieldValue?) -> Unit,
    disabled: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val hubKeyStore = LocalHubKeyStore.current
    val scope = rememberCoroutineScope()
    var isUploading by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }
    var error by remember { mutableStateOf<String?>(null) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val hubKey = hubKeyStore.currentHubKey ?: return@rememberLauncherForActivityResult
        scope.launch {
            isUploading = true; progress = 0.1f; error = null
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.readBytes() ?: return@launch
                progress = 0.3f
                val encrypted = CryptoService.shared.encryptHpke(bytes, hubKey)
                progress = 0.6f
                val result = FilesApiService.shared.uploadEntityFile(encrypted)
                progress = 1f
                onValueChange(FileFieldValue(
                    fileId = result.fileId,
                    encryptedName = "", encryptedMimeType = "", encryptedSize = "",
                    recipientEnvelopes = emptyList(),
                    uploadedAt = result.uploadedAt,
                ))
            } catch (e: Exception) {
                error = e.message
            } finally {
                isUploading = false
            }
        }
    }

    Box(modifier = modifier) {
        when {
            value != null -> Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Icon(Icons.Default.AttachFile, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(8.dp))
                Text(I18n.cmsFileAttached, modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium)
                if (!disabled) {
                    IconButton(onClick = { onValueChange(null) }) {
                        Icon(Icons.Default.Close, contentDescription = null)
                    }
                }
            }
            isUploading -> Column(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                Text(I18n.cmsUploading, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Column {
                OutlinedButton(
                    onClick = { launcher.launch("*/*") },
                    enabled = !disabled,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.AttachFile, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(I18n.cmsChooseFile)
                }
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/components/LocationFieldComposable.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/components/EntityFileFieldComposable.kt
git commit -m "feat(android): LocationFieldComposable (FusedLocation + Geoapify) + EntityFileFieldComposable (EP06-A2)"
```

---

## Task 18: Android — Affinity Group Screens

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsScreen.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsViewModel.kt`

- [ ] **Step 1: Create AffinityGroupsViewModel.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsViewModel.kt`:

```kotlin
package org.llamenos.hotline.ui.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ContactsApiService
import org.llamenos.hotline.crypto.CryptoService
import javax.inject.Inject

@HiltViewModel
class AffinityGroupsViewModel @Inject constructor(
    private val api: ContactsApiService,
    private val cryptoService: CryptoService,
) : ViewModel() {

    private val _groups = MutableStateFlow<List<AffinityGroup>>(emptyList())
    val groups = _groups.asStateFlow()
    private val _loading = MutableStateFlow(true)
    val loading = _loading.asStateFlow()

    init { load() }

    private fun load() = viewModelScope.launch {
        try { _groups.value = api.listAffinityGroups() }
        catch (_: Exception) { }
        _loading.value = false
    }

    fun createGroup(name: String, hubKey: ByteArray) = viewModelScope.launch {
        try {
            val details = """{"name":"$name"}""".toByteArray()
            val encrypted = cryptoService.encryptHpke(details, hubKey)
            val group = api.createAffinityGroup(
                encryptedDetails = android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP)
            )
            _groups.value = _groups.value + group
        } catch (_: Exception) { }
    }

    fun deleteGroup(groupId: String) = viewModelScope.launch {
        try {
            api.deleteAffinityGroup(groupId)
            _groups.value = _groups.value.filter { it.id != groupId }
        } catch (_: Exception) { }
    }

    fun removeGroupMember(groupId: String, contactId: String) = viewModelScope.launch {
        try { api.removeGroupMember(groupId = groupId, contactId = contactId) }
        catch (_: Exception) { }
    }
}
```

- [ ] **Step 2: Create AffinityGroupsScreen.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.I18n
import org.llamenos.hotline.ui.LocalAuthStore
import org.llamenos.hotline.ui.LocalHubKeyStore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AffinityGroupsScreen(
    onNavigateBack: () -> Unit,
    viewModel: AffinityGroupsViewModel = hiltViewModel(),
) {
    val groups by viewModel.groups.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val authStore = LocalAuthStore.current
    val hubKeyStore = LocalHubKeyStore.current
    val canManage = authStore.hasPermission("contacts:manage-groups")
    var showCreateDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.contactsGroups) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                }
            )
        },
        floatingActionButton = {
            if (canManage) {
                FloatingActionButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = I18n.contactsCreateGroup)
                }
            }
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(contentPadding = padding) {
                items(groups, key = { it.id }) { group ->
                    ListItem(
                        headlineContent = { Text(group.id.take(8)) },
                        supportingContent = {
                            Text("${group.memberCount} ${I18n.contactsMembers}",
                                style = MaterialTheme.typography.bodySmall)
                        },
                        trailingContent = if (canManage) ({
                            IconButton(onClick = { viewModel.deleteGroup(group.id) }) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                            }
                        }) else null,
                    )
                    HorizontalDivider()
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateGroupDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { name ->
                hubKeyStore.currentHubKey?.let { viewModel.createGroup(name, it) }
                showCreateDialog = false
            }
        )
    }
}

@Composable
private fun CreateGroupDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(I18n.contactsCreateGroup) },
        text = {
            OutlinedTextField(
                name, onValueChange = { name = it },
                label = { Text(I18n.contactsGroupName) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onCreate(name) }, enabled = name.isNotBlank()) {
                Text(I18n.commonCreate)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(I18n.commonCancel) } }
    )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsScreen.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/AffinityGroupsViewModel.kt
git commit -m "feat(android): affinity group screens — list, create, delete, member management (EP06-A2)"
```

---

## Task 19: i18n — Form Labels, Field Types, Validation Messages Across 13 Locales

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

This task adds all strings needed by Tasks 11-18 that are not already present from Task 10. All string additions follow the existing nested key structure in the locale files.

- [ ] **Step 1: Add missing keys to en.json**

In `packages/i18n/locales/en.json`, extend the relevant sections (create sections that don't already exist):

```json
{
  "contacts": {
    "createTitle": "New Contact",
    "editTitle": "Edit Contact",
    "displayName": "Display Name",
    "phone": "Phone",
    "email": "Email",
    "sectionBasic": "Basic Info",
    "sectionNotes": "Notes",
    "groups": "Groups",
    "createGroup": "New Group",
    "groupName": "Group name",
    "members": "members",
    "addToGroup": "Add to Group"
  },
  "admin": {
    "entityTypes": {
      "title": "Entity Types"
    },
    "entityType": {
      "label": "Label",
      "labelPlural": "Plural label",
      "showInNavigation": "Show in navigation",
      "edit": "Edit Entity Type",
      "sectionGeneral": "General"
    }
  },
  "cms": {
    "addField": "Add Field",
    "editField": "Edit Field",
    "fieldLabel": "Label",
    "fieldLabelPlaceholder": "Display label",
    "fieldName": "Field name",
    "fieldNamePlaceholder": "snake_case_name",
    "fieldType": "Type",
    "fieldSection": "Section",
    "fieldSectionPlaceholder": "Optional grouping",
    "fields": "Fields",
    "editFields": "Edit Fields",
    "required": "Required",
    "fileAttached": "File attached",
    "chooseFile": "Choose File",
    "choosePhoto": "Choose Photo",
    "uploading": "Uploading…",
    "fileUploadError": "Upload failed",
    "fileTooLarge": "File exceeds maximum size",
    "fileTypeNotAllowed": "File type not allowed",
    "locationPlaceholder": "Search address or use GPS"
  }
}
```

- [ ] **Step 2: Add translations to all 12 non-English locales**

For each locale, add the same keys with translated values. Machine-translate from English as a baseline; native-speaker review happens out-of-band. Below are the Spanish (`es`) translations as representative; the same pattern applies to all 12:

**`packages/i18n/locales/es.json` additions:**
```json
{
  "contacts": {
    "createTitle": "Nuevo contacto",
    "editTitle": "Editar contacto",
    "displayName": "Nombre visible",
    "phone": "Teléfono",
    "email": "Correo electrónico",
    "sectionBasic": "Información básica",
    "sectionNotes": "Notas",
    "groups": "Grupos",
    "createGroup": "Nuevo grupo",
    "groupName": "Nombre del grupo",
    "members": "miembros",
    "addToGroup": "Agregar al grupo"
  },
  "admin": {
    "entityTypes": { "title": "Tipos de entidad" },
    "entityType": {
      "label": "Etiqueta",
      "labelPlural": "Etiqueta en plural",
      "showInNavigation": "Mostrar en navegación",
      "edit": "Editar tipo de entidad",
      "sectionGeneral": "General"
    }
  },
  "cms": {
    "addField": "Agregar campo",
    "editField": "Editar campo",
    "fieldLabel": "Etiqueta",
    "fieldLabelPlaceholder": "Etiqueta visible",
    "fieldName": "Nombre del campo",
    "fieldNamePlaceholder": "nombre_en_snake_case",
    "fieldType": "Tipo",
    "fieldSection": "Sección",
    "fieldSectionPlaceholder": "Agrupación opcional",
    "fields": "Campos",
    "editFields": "Editar campos",
    "required": "Obligatorio",
    "fileAttached": "Archivo adjunto",
    "chooseFile": "Elegir archivo",
    "choosePhoto": "Elegir foto",
    "uploading": "Subiendo…",
    "fileUploadError": "Error al subir",
    "fileTooLarge": "El archivo supera el tamaño máximo",
    "fileTypeNotAllowed": "Tipo de archivo no permitido",
    "locationPlaceholder": "Buscar dirección o usar GPS"
  }
}
```

Apply equivalent translations for `zh`, `tl`, `vi`, `ar`, `fr`, `ht`, `ko`, `ru`, `hi`, `pt`, `de`. Each follows the same key structure with locale-appropriate translations.

- [ ] **Step 3: Run i18n codegen and validate**

```bash
bun run i18n:codegen
bun run i18n:validate:all
```

Expected: all validators pass; iOS `.strings` and Android `strings.xml` updated; `Kotlin I18n.kt` regenerated with new keys.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/locales/
git commit -m "feat(i18n): form labels, field types, validation messages for EP06-A2 across 13 locales"
```

---

## Task 20: Verification Gate

All implementation tasks are complete. This task runs the full cross-platform verification suite and confirms EP06-A2 is closed.

- [ ] **Step 1: Run codegen**

```bash
bun run codegen
```

Expected: clean exit; `FileFieldValue`, `EntityFileUploadResponse`, `EntityTemplateCustomizeBody` in generated TypeScript, Swift, Kotlin.

- [ ] **Step 2: TypeScript typecheck**

```bash
bun run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Backend BDD tests**

```bash
bun run test:backend:bdd
```

Expected: all scenarios in `contact-write.feature` and `relationship-groups.feature` pass.

- [ ] **Step 4: Desktop E2E**

```bash
bun run test:desktop
```

Expected: all Playwright tests pass; no regressions in contact directory, cases, or admin settings routes.

- [ ] **Step 5: iOS tests**

```bash
bun run test:ios
```

Expected: `LlamenosTests` + `LlamenosUITests` pass. `ContactFormViewModelTests`, `LocationFieldViewModelTests` pass.

- [ ] **Step 6: Android tests**

```bash
bun run test:android
```

Expected: unit tests pass; lint clean; `ContactFormViewModelTest`, `AffinityGroupsViewModelTest` pass.

- [ ] **Step 7: i18n validation**

```bash
bun run i18n:validate:all
```

Expected: all three validators clean (desktop `t()` refs, iOS `.strings`, Android `R.string.*`).

- [ ] **Step 8: Final commit**

```bash
git add -p   # stage any cleanup
git commit -m "chore(EP06-A2): verification gate — all platforms green, EP06-A2 complete"
```

- [ ] **Step 9: Mark spec as implemented**

Update the `status` frontmatter in `docs/superpowers/specs/2026-05-12-EP06-A2-cms-write-ux-design.md` from `specced` to `implemented`.

---

> **Note — Mobile entity create/edit forms:** No separate task is needed for iOS or Android entity create/edit forms. The iOS `EntityTypeEditorView` and Android `EntityTypeEditorScreen` (established in A1 entity type admin) use the same dynamic `SchemaForm`-equivalent field rendering components that entity creation/editing requires. Mobile entity forms reuse these field renderers directly — the only mobile work in this plan is the platform-specific contact editing, relationship, and group UIs listed above.
