# Epic 121: Custom Fields Generalization — Reports, Notes, and Beyond

## Status: PROPOSED (awaiting review)

## Problem Statement

Custom fields are currently implemented only for notes (`context: 'call-notes'`). The type system already supports `context: 'reports'` and `context: 'both'`, but:

1. **Report custom fields are declared but never rendered** — `ReportForm` doesn't show custom fields, and `Conversation.metadata.customFieldValues` is never written
2. **Custom field values in notes are encrypted inside `NotePayload.fields`** — good for notes, but reports store metadata differently
3. **No mechanism to have per-report-type field configurations** — all reports share the same fields
4. **File attachments are a separate system** — they could be modeled as a custom field type (`type: 'file'`)

## Goals

1. Implement custom field rendering in report creation and detail views
2. Support field configurations per record context (notes, reports, or both)
3. Add a `file` field type that integrates with the existing chunked upload system
4. Encrypt custom field values for reports the same way they're encrypted for notes

## Implementation

### Phase 1: Report Custom Fields UI

**`src/client/routes/reports.tsx` — ReportForm component:**

```tsx
// Fetch custom fields with context 'reports' or 'both'
const reportFields = customFields.filter(
  f => f.context === 'reports' || f.context === 'both'
)

// Render in ReportForm alongside title, category, content
{reportFields.map(field => (
  <CustomFieldInput key={field.id} field={field} value={fieldValues[field.id]} onChange={...} />
))}
```

**Encryption approach:**

Report custom field values should be encrypted alongside the message content. Since reports use `EncryptedMessage` with `readerEnvelopes`, the custom field values get encrypted in the first message's content:

```typescript
// The initial report message content becomes:
interface ReportInitialPayload {
  text: string
  fields?: Record<string, string | string[] | boolean>  // same shape as NotePayload.fields
}
// Encrypted as JSON, wrapped with LABEL_MESSAGE envelopes
```

This keeps custom field values E2EE with the same security guarantees as notes.

### Phase 2: Custom Field Display in Report Detail

**`src/client/routes/reports.tsx` — ReportDetail component:**

Show custom field badges on the report card (same as notes):

```tsx
// Decrypt initial message, parse ReportInitialPayload
const payload = JSON.parse(decryptedContent)
if (payload.fields) {
  // Render field badges like notes do
  <CustomFieldBadges fields={reportFields} values={payload.fields} />
}
```

Extract `CustomFieldBadges` from the notes page into a shared component.

### Phase 3: Report Categories as Custom Field

Currently reports have a hardcoded `category` field in metadata. Consider whether this should become a custom field with `type: 'select'` — this would let admins configure report categories instead of using hardcoded values.

**Decision needed:** Should categories be a built-in metadata field (current) or a custom field (configurable)? Trade-off:
- Built-in: Simpler, always present, can be used for server-side filtering without decryption
- Custom field: More flexible, but encrypted (server can't filter by category without decryption)

**Recommendation:** Keep `category` as built-in metadata (server-side filtering is valuable for admins). Custom fields are additional structured data that lives inside the encrypted content.

### Phase 4: File Attachment Custom Field Type

Add a new custom field type `file` that integrates with the existing chunked upload system:

```typescript
interface CustomFieldDefinition {
  // ... existing fields
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'number' | 'file'
  // For file type:
  maxFileSize?: number      // bytes
  allowedMimeTypes?: string[] // e.g., ['image/*', 'application/pdf']
  maxFiles?: number         // for multi-file fields
}
```

The field value would be an array of `fileId` strings (from the existing upload system). The upload flow:
1. User selects file → chunked upload via `/api/uploads/*`
2. Upload returns `fileId`
3. `fileId` stored in the custom field value (encrypted in the payload)
4. On render, fetch file metadata and display download link

**Files to modify:**
- `src/shared/types.ts` — Add `'file'` to `CustomFieldDefinition.type`
- `src/client/components/CustomFieldInput.tsx` — File upload input component
- `src/client/components/CustomFieldBadges.tsx` — File attachment display
- Settings page — Allow creating `file` type fields

## Files Changed

| File | Change |
|------|--------|
| `src/client/routes/reports.tsx` | Add custom field rendering in form and detail |
| `src/client/components/CustomFieldInput.tsx` | **NEW** — Shared custom field input component |
| `src/client/components/CustomFieldBadges.tsx` | **NEW** — Shared field value display badges |
| `src/client/routes/notes.tsx` | Refactor to use shared `CustomFieldInput`/`CustomFieldBadges` |
| `src/shared/types.ts` | Add `'file'` to field type union |
| `src/worker/routes/reports.ts` | Accept `customFieldValues` in encrypted payload |

## Dependencies

- **Epic 119** (Records Domain Consolidation) — shared ConversationThread and utilities
- Should be done after Epic 119 Phase 2 (component extraction)

## Verification

1. Admin can create custom fields with `context: 'reports'`
2. ReportForm renders those fields
3. Field values are encrypted in the initial message payload
4. ReportDetail displays decrypted field values as badges
5. File-type custom fields trigger upload flow and store fileIds
6. Notes custom fields still work (no regression)
7. Fields with `context: 'both'` appear in both notes and reports
