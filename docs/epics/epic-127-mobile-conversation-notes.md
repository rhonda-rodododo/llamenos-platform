# Epic 127: Mobile Conversation Notes & Custom Field Context

## Summary

Add the ability to create notes from within a conversation thread on mobile, and implement custom field context filtering so that note forms show the appropriate fields based on whether the note is linked to a call or a conversation. This mirrors the desktop's NoteSheet (Epic 123) and custom field generalization (Epic 121).

**Prerequisites**: Epic 125 (type alignment — `createNote` must accept `conversationId`, `CustomFieldDefinition.context` must be updated).

## Current State

### No conversation-linked note creation

The mobile `app/conversation/[id].tsx` has a message composer but no way to add a structured note to a conversation. On desktop, the "Add Note" button in the conversation detail opens a `NoteSheet` panel.

### Custom field context filtering not implemented

The mobile `CustomFieldDefinition.context` type is stale (`'note' | 'report' | 'both'` — will be updated in Epic 125 to match desktop's `'call-notes' | 'conversation-notes' | 'reports' | 'all'`). No `fieldMatchesContext()` filtering is applied anywhere in the mobile app.

### Note creation is call-only

The mobile `createNote` API function only accepts `callId`. After Epic 125's type update, it will accept `conversationId` as well, but the UI still needs to expose this flow.

## Implementation Plan

### Phase 1: Note Bottom Sheet Component

React Native doesn't have a `<Sheet>` component like shadcn. Use `@gorhom/bottom-sheet` which is already a common pattern in Expo apps, or a simpler `Modal` approach.

**Decision**: Use a `Modal` with `presentationStyle="pageSheet"` (iOS native sheet) for simplicity. This gives iOS users the native drag-to-dismiss gesture and Android users a full-screen modal.

**New file: `src/components/NoteFormModal.tsx`**

```typescript
interface NoteFormModalProps {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  // Pre-fill context
  callId?: string
  conversationId?: string
  // Edit mode
  editNoteId?: string
  initialText?: string
  initialFields?: Record<string, string | number | boolean>
}
```

The modal contains:
1. **Header**: "New Note" or "Edit Note" with Close button
2. **Context badge**: Shows "Call XXXX" or "Conversation XXXX" depending on context
3. **TextInput** (multiline): Note content
4. **Custom fields section**: Context-filtered fields (see Phase 2)
5. **Save button**: Encrypts and saves

Save flow:
```typescript
async function handleSave() {
  const payload: NotePayload = { text: noteText }
  if (fieldValues && Object.keys(fieldValues).length > 0) {
    payload.fields = fieldValues
  }

  const sk = keyManager.getSecretKey()
  const pk = keyManager.getPublicKeyHex()
  const adminPub = getAdminDecryptionPubkey()

  // Encrypt using the mobile crypto module
  const encrypted = encryptNote(JSON.stringify(payload), pk, adminPub ? [adminPub] : [])

  if (editNoteId) {
    await updateNote(editNoteId, {
      encryptedContent: encrypted.encryptedContent,
      authorEnvelope: encrypted.authorEnvelope,
      adminEnvelopes: encrypted.adminEnvelopes,
    })
  } else {
    await createNote({
      callId: callId || undefined,
      conversationId: conversationId || undefined,
      encryptedContent: encrypted.encryptedContent,
      authorEnvelope: encrypted.authorEnvelope,
      adminEnvelopes: encrypted.adminEnvelopes,
    })
  }

  haptic.success()
  toast.success(t('notes.saved', 'Note saved'))
  onSaved()
  onClose()
}
```

### Phase 2: Custom Field Context Filtering

Use `fieldMatchesContext()` (added in Epic 125) to filter custom fields:

```typescript
const fieldContext: CustomFieldContext = conversationId ? 'conversation-notes' : 'call-notes'

const { data: fieldsData } = useQuery({
  queryKey: ['custom-fields'],
  queryFn: () => apiClient.getCustomFields(),
})

const visibleFields = (fieldsData?.fields ?? [])
  .filter(f => fieldMatchesContext(f, fieldContext))
  .filter(f => isAdmin || f.visibleToVolunteers)
  .sort((a, b) => a.order - b.order)
```

Render custom fields using React Native form components:
- `text` / `textarea` → `TextInput` (single-line vs multiline)
- `number` → `TextInput` with `keyboardType="numeric"`
- `select` → `Pressable` that opens an `ActionSheet` or picker
- `checkbox` → `Switch`

**New file: `src/components/CustomFieldInputs.tsx`**

```typescript
interface CustomFieldInputsProps {
  fields: CustomFieldDefinition[]
  values: Record<string, string | number | boolean>
  onChange: (key: string, value: string | number | boolean) => void
  isAdmin: boolean
}
```

### Phase 3: Conversation Thread Integration

**File: `app/conversation/[id].tsx`**

Add an "Add Note" button to the conversation thread screen header:

```typescript
<Stack.Screen
  options={{
    headerRight: () => (
      <Pressable
        onPress={() => setNoteModalVisible(true)}
        testID="conv-add-note-btn"
      >
        <Text className="text-sm font-semibold text-primary">
          {t('notes.addNote', 'Add Note')}
        </Text>
      </Pressable>
    ),
  }}
/>

{/* Note form modal */}
<NoteFormModal
  visible={noteModalVisible}
  onClose={() => setNoteModalVisible(false)}
  onSaved={() => {
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    setNoteModalVisible(false)
  }}
  conversationId={id}
/>
```

### Phase 4: Active Call Note Integration

**File: `app/call/[id].tsx`**

The active call screen already has a note editor inline. After Epic 125's type alignment, the existing `createNote` call will continue to work since it passes `callId`. However, the custom field context filtering should be applied here too:

```typescript
const visibleFields = customFields
  .filter(f => fieldMatchesContext(f, 'call-notes'))
  .filter(f => isAdmin || f.visibleToVolunteers)
```

If the call screen doesn't currently render custom fields in the note editor, add them using the same `CustomFieldInputs` component.

### Phase 5: NoteFormModal Context (Optional)

Create a simple context/hook for opening the note modal from anywhere in the app:

```typescript
// src/lib/note-form-context.tsx
interface NoteFormState {
  visible: boolean
  callId?: string
  conversationId?: string
  editNoteId?: string
  initialText?: string
  initialFields?: Record<string, string | number | boolean>
}

export function useNoteForm() {
  // Returns { openNewNote, openConversationNote, openEditNote, close, state }
}
```

This mirrors the desktop's `NoteSheetContext` pattern. Wrap at root layout level.

## Files Changed

| File | Action |
|------|--------|
| `src/components/NoteFormModal.tsx` | NEW — modal for creating/editing notes |
| `src/components/CustomFieldInputs.tsx` | NEW — custom field form inputs for RN |
| `src/lib/note-form-context.tsx` | NEW — singleton context for note form (optional) |
| `app/conversation/[id].tsx` | Add "Add Note" header button + NoteFormModal |
| `app/call/[id].tsx` | Apply custom field context filtering |

## Security Considerations

- Note encryption uses `encryptNote()` from `@/lib/crypto` — same per-note forward secrecy as desktop
- `authorEnvelope` is always created for the volunteer; `adminEnvelopes` for each admin
- Custom field values are included in the `NotePayload` JSON before encryption — never sent to server in plaintext
- `conversationId` is set by the UI context, not user input — prevents linking notes to arbitrary conversations

## UX Notes

- iOS: Native `.pageSheet` presentation with drag-to-dismiss gesture
- Android: Full-screen modal with explicit close button
- Haptic feedback on save (`haptic.success()`)
- Keyboard avoiding behavior for the TextInput
- Custom fields scroll within the modal if many fields are defined

## Testing

- Detox tests in Epic 128
- Manual: Open conversation → tap "Add Note" → fill text + custom fields → save → verify note appears in notes list with conversation link badge
