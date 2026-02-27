# Epic 121: Custom Fields Generalization — All Record Types

## Status: APPROVED

## Problem Statement

Custom fields are currently implemented only for notes (`context: 'call-notes'`). The type system already supports `context: 'reports'` and `context: 'both'`, but:

1. **Report custom fields are declared but never rendered** — `ReportForm` doesn't show custom fields, and `Conversation.metadata.customFieldValues` is never written
2. **No `conversation-notes` context** — with threaded notes on conversations (Epic 123), conversation notes need their own custom field context
3. **The `both` context is too limited** — with three record types, we need an `all` context
4. **File attachments are a separate system** — they could be modeled as a custom field type (`type: 'file'`)
5. **Custom field input and display components are embedded in notes.tsx** — not reusable for reports or conversation notes

## Goals

1. Expand custom field contexts: `'call-notes' | 'conversation-notes' | 'reports' | 'all'`
2. Extract `CustomFieldInput` and `CustomFieldBadges` as shared components
3. Implement custom field rendering in report creation and detail views
4. Add a `file` field type that integrates with the existing chunked upload system
5. Encrypt custom field values for reports the same way they're encrypted for notes

## Implementation

### Phase 1: Expand Context Enum

**`src/shared/types.ts`:**

```typescript
interface CustomFieldDefinition {
  // ... existing fields
  context: 'call-notes' | 'conversation-notes' | 'reports' | 'all'
  // 'all' replaces 'both' — appears in all three record types
}
```

Migrate existing `'both'` values to `'all'` (pre-production, no migration needed — just update the type and any seed data).

### Phase 2: Extract Shared Custom Field Components

**`src/client/components/CustomFieldInput.tsx`** (extracted from notes page):

```tsx
interface CustomFieldInputProps {
  field: CustomFieldDefinition
  value: string | number | boolean | undefined
  onChange: (name: string, value: string | number | boolean) => void
}
export function CustomFieldInput({ field, value, onChange }: CustomFieldInputProps) { ... }
```

**`src/client/components/CustomFieldBadges.tsx`** (extracted from notes page):

```tsx
interface CustomFieldBadgesProps {
  fields: CustomFieldDefinition[]
  values: Record<string, string | number | boolean>
}
export function CustomFieldBadges({ fields, values }: CustomFieldBadgesProps) { ... }
```

Refactor `src/client/routes/notes.tsx` to use these shared components instead of inline implementations.

### Phase 3: Report Custom Fields UI

**`src/client/routes/reports.tsx` — ReportForm component:**

```tsx
// Fetch custom fields with context 'reports' or 'all'
const reportFields = customFields.filter(
  f => f.context === 'reports' || f.context === 'all'
)

// Render in ReportForm alongside title, category, content
{reportFields.map(field => (
  <CustomFieldInput key={field.id} field={field} value={fieldValues[field.id]} onChange={...} />
))}
```

**Encryption approach:**

Report custom field values are encrypted alongside the message content. Since reports use `EncryptedMessage` with envelopes, the custom field values get encrypted in the first message's content:

```typescript
interface ReportInitialPayload {
  text: string
  fields?: Record<string, string | number | boolean>  // same shape as NotePayload.fields
}
// Encrypted as JSON, wrapped with LABEL_MESSAGE envelopes
```

### Phase 4: Custom Field Display in Report Detail

Show custom field badges on the report detail (same as notes):

```tsx
// Decrypt initial message, parse ReportInitialPayload
const payload = JSON.parse(decryptedContent)
if (payload.fields) {
  <CustomFieldBadges fields={reportFields} values={payload.fields} />
}
```

### Phase 5: Report Categories

Keep `category` as built-in metadata (server-side filtering is valuable for admins). Custom fields are additional structured data that lives inside the encrypted content. Multiple report types are supported via the category system, and each can have its own set of custom fields displayed via the `reports` context.

### Phase 6: File Attachment Custom Field Type

Add a new custom field type `file` that integrates with the existing chunked upload system:

```typescript
interface CustomFieldDefinition {
  // ... existing fields
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'number' | 'file'
  maxFileSize?: number        // bytes, for file type
  allowedMimeTypes?: string[] // e.g., ['image/*', 'application/pdf']
  maxFiles?: number           // for multi-file fields
}
```

The field value is an array of `fileId` strings (from the existing upload system). The upload flow:
1. User selects file -> chunked upload via `/api/uploads/*`
2. Upload returns `fileId`
3. `fileId` stored in the custom field value (encrypted in the payload)
4. On render, fetch file metadata and display download link

### Phase 7: Settings UI for New Contexts

Update the custom fields settings section to allow:
- Creating fields with `context: 'conversation-notes'`
- The context dropdown shows all four options with descriptions
- Fields with `context: 'all'` clearly labeled as appearing everywhere

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Expand context enum, add `'file'` field type, add `'conversation-notes'` |
| `src/client/components/CustomFieldInput.tsx` | **NEW** — Shared custom field input component |
| `src/client/components/CustomFieldBadges.tsx` | **NEW** — Shared field value display badges |
| `src/client/routes/notes.tsx` | Refactor to use shared components |
| `src/client/routes/reports.tsx` | Add custom field rendering in form and detail |
| `src/worker/routes/reports.ts` | Accept `customFieldValues` in encrypted payload |
| Settings page component | Add `conversation-notes` option, rename `both` → `all` |
| `src/client/locales/*.json` | Add i18n for new contexts |

## Dependencies

- **Epic 119** (Records Domain Consolidation) — shared ConversationThread and utilities
- Should be done after Epic 119 Phase 2 (component extraction)

## Verification

1. Admin can create custom fields with `context: 'reports'`
2. Admin can create custom fields with `context: 'conversation-notes'`
3. Admin can create custom fields with `context: 'all'`
4. ReportForm renders report-context custom fields
5. Field values are encrypted in the initial message payload
6. ReportDetail displays decrypted field values as badges
7. File-type custom fields trigger upload flow and store fileIds
8. Notes custom fields still work (no regression)
9. Fields with `context: 'all'` appear in call notes, conversation notes, and reports
