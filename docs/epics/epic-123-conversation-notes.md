# Epic 123: Conversation Notes — Per-Thread Note Attachments

## Status: PROPOSED (awaiting review)

## Problem Statement

Currently, notes are exclusively tied to voice calls via `callId`. Volunteers cannot attach structured notes (with custom fields) to conversations or reports. When a volunteer handles an SMS conversation, they have no way to:

1. Write a structured note about the conversation (with custom fields like "severity", "follow-up needed")
2. Associate that note with the specific conversation thread
3. Have that note appear in the conversation's context

This creates a gap where voice call interactions have rich documentation (notes with custom fields, transcriptions) but text-based interactions (SMS, WhatsApp, Signal, reports) have no equivalent.

## Goals

1. Allow notes to be attached to conversations (not just calls)
2. Notes on conversations use the same E2EE, custom fields, and permissions as call notes
3. Conversation notes appear in the conversation detail view
4. Notes remain in `RecordsDO` (the note storage authority) — conversations don't store notes

## Implementation

### Phase 1: Extend Note Linking

Update `EncryptedNote` to support either `callId` or `conversationId`:

```typescript
// src/worker/types.ts
interface EncryptedNote {
  id: string
  callId?: string           // links to a voice call (existing)
  conversationId?: string   // links to a conversation/report (new)
  authorPubkey: string
  encryptedContent: string
  envelopes: RecipientEnvelope[]
  createdAt: string
  updatedAt?: string
}
```

At least one of `callId` or `conversationId` must be set (validated server-side).

### Phase 2: API Changes

**`POST /api/notes`** — Accept `conversationId` as alternative to `callId`:

```typescript
// src/worker/routes/notes.ts
const { callId, conversationId, encryptedContent, envelopes } = body
if (!callId && !conversationId) {
  return json({ error: 'callId or conversationId is required' }, 400)
}
```

**`GET /api/notes?conversationId=...`** — Filter notes by conversation:

```typescript
// Already supports ?callId=..., add ?conversationId=...
const convId = url.searchParams.get('conversationId')
if (convId) {
  notes = notes.filter(n => n.conversationId === convId)
}
```

### Phase 3: Frontend — Note Button in Conversation Detail

Add a "Add Note" button to the conversation detail view:

```tsx
// src/client/routes/conversations.tsx — ConversationDetail
<Button variant="outline" size="sm" onClick={() => setShowNoteEditor(true)}>
  <FileText className="h-4 w-4 mr-1" />
  Add Note
</Button>

{showNoteEditor && (
  <NoteEditor
    conversationId={conversation.id}
    onSave={handleNoteSave}
    onCancel={() => setShowNoteEditor(false)}
  />
)}
```

Extract `NoteEditor` from the notes page into a shared component that accepts either `callId` or `conversationId`.

### Phase 4: Display Conversation Notes

In the conversation detail, show associated notes below the message thread:

```tsx
// Fetch notes for this conversation
const { data: notes } = useQuery({
  queryKey: ['notes', { conversationId: conversation.id }],
  queryFn: () => api.listNotes({ conversationId: conversation.id }),
})

// Render below the thread
{notes?.length > 0 && (
  <section className="mt-4 border-t pt-4">
    <h3 className="text-sm font-medium text-fg-muted mb-2">Notes</h3>
    {notes.map(note => <NoteCard key={note.id} note={note} />)}
  </section>
)}
```

Same for reports — the `ReportDetail` (which uses `ConversationThread` after Epic 119) also shows associated notes.

### Phase 5: Note Search Integration

The existing note search should include conversation-linked notes:

```typescript
// Notes page search already lists all notes
// Just ensure conversationId is displayed in the note card alongside callId
```

Add a link back to the conversation from the note card (just as call notes link to the call).

## UI Mockup

```
┌─────────────────────────────────┐
│ Conversation: +1 (555) 012-3456 │
│ Channel: SMS · Status: Active    │
├─────────────────────────────────┤
│                                   │
│  [inbound] Hey I need help...     │
│                                   │
│        [outbound] Hi, how can...  │
│                                   │
│  [inbound] I'm in a situation...  │
│                                   │
├─────────────────────────────────┤
│  📝 Notes (1)                     │
│  ┌─────────────────────────────┐ │
│  │ Severity: High               │ │
│  │ Follow-up: Yes               │ │
│  │ Caller was distressed, ...   │ │
│  │ — volunteer · 2 min ago      │ │
│  └─────────────────────────────┘ │
│                                   │
│  [+ Add Note]                     │
├─────────────────────────────────┤
│  Type a message...    [Send]      │
└─────────────────────────────────┘
```

## Files Changed

| File | Change |
|------|--------|
| `src/worker/types.ts` | Add `conversationId` to `EncryptedNote` |
| `src/worker/routes/notes.ts` | Accept `conversationId`, add filter |
| `src/worker/durable-objects/records-do.ts` | Support `conversationId` filter in listing |
| `src/client/routes/conversations.tsx` | Add note editor button and notes display |
| `src/client/routes/reports.tsx` | Add note editor button and notes display |
| `src/client/components/NoteEditor.tsx` | **NEW** — Extracted from notes page |
| `src/client/components/NoteCard.tsx` | **NEW** — Extracted from notes page |
| `src/client/routes/notes.tsx` | Refactor to use shared `NoteEditor`/`NoteCard` |
| `src/shared/types.ts` | Update NotePayload type |
| `tests/*.spec.ts` | E2E tests for conversation notes |

## Dependencies

- **Epic 119** (Records Domain Consolidation) — shared components
- **Epic 121** (Custom Fields) — custom fields work in both notes and reports
- Can be done in parallel with **Epic 122** (storage scaling)

## Security Considerations

- Conversation notes use the same E2EE as call notes (per-note key, ECIES envelopes for author + admins)
- The `conversationId` is stored as cleartext metadata (same as `callId`) — this allows server-side filtering without decryption
- Permission model unchanged: `notes:create` to write, `notes:read-own` or `notes:read-all` to read

## Verification

1. Volunteer can create a note linked to a conversation
2. Note appears in the conversation detail view
3. Custom fields work in conversation notes
4. Note search shows conversation-linked notes
5. E2E encryption works correctly (volunteer + admins can decrypt)
6. Notes page shows conversation-linked notes alongside call notes
7. Clicking a conversation-linked note navigates to the conversation
