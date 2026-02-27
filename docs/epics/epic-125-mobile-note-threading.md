# Epic 125: Mobile Note Threading

## Summary

Port the note threading feature (Epics 119/123) to the React Native mobile app. This includes updating shared types and API client to match the desktop's records architecture, then adding reply buttons, thread expansion, and encrypted reply sending to the notes UI.

**Prerequisites**: Epics 119-124 (desktop records architecture) — all complete.

## Current State

### Mobile types are out of date

`llamenos-mobile/src/lib/types.ts` has stale definitions:

- **`EncryptedNote`** (line 108): Missing `conversationId`, `contactHash`, `replyCount` fields that were added in Epic 119/123.
- **`ConversationMessage`** (line 174): Missing `readerEnvelopes`, `authorPubkey`, `hasAttachments`, `attachmentIds`, `deliveredAt`, `readAt`, `failureReason`, `retryCount`, `externalId` fields.
- **`CustomFieldDefinition`** (line 33): Uses wrong context values (`'note' | 'report' | 'both'`) — desktop uses `'call-notes' | 'conversation-notes' | 'reports' | 'all'` per Epic 121.
- **Missing types**: `ContactSummary`, `ContactTimeline`, `RecipientEnvelope` (mobile uses `RecipientKeyEnvelope` which maps to `RecipientEnvelope` on desktop).

### Mobile API client is missing endpoints

`llamenos-mobile/src/lib/api-client.ts` is missing:

- `listNoteReplies(noteId)` — `GET /api/notes/:id/replies`
- `createNoteReply(noteId, data)` — `POST /api/notes/:id/replies`
- `listContacts(params)` — `GET /api/contacts`
- `getContactTimeline(hash)` — `GET /api/contacts/:hash`
- `createNote` (line 181) only accepts `callId`, not `conversationId`

### Mobile NoteCard assumes callId exists

`llamenos-mobile/src/components/NoteCard.tsx` line 73: `note.callId.slice(0, 8)` — will crash on conversation-linked notes where `callId` may be undefined.

### No reply UI exists

Neither the NoteCard component nor the note detail screen has any reply/threading capability.

## Implementation Plan

### Phase 1: Type & API Alignment

**File: `src/lib/types.ts`**

Update `EncryptedNote`:
```typescript
export interface EncryptedNote {
  id: string
  callId?: string              // ← optional now (may be conversation-linked)
  conversationId?: string      // ← NEW
  contactHash?: string         // ← NEW
  authorPubkey: string
  createdAt: string
  updatedAt: string
  encryptedContent: string
  authorEnvelope?: KeyEnvelope
  adminEnvelopes?: RecipientKeyEnvelope[]
  ephemeralPubkey?: string
  replyCount?: number          // ← NEW
}
```

Update `ConversationMessage`:
```typescript
export interface ConversationMessage {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  authorPubkey: string         // ← NEW
  encryptedContent: string
  readerEnvelopes: RecipientKeyEnvelope[]  // ← replaces authorEnvelope/adminEnvelopes
  hasAttachments: boolean      // ← NEW
  attachmentIds?: string[]     // ← NEW
  status?: string
  deliveredAt?: string         // ← NEW
  readAt?: string              // ← NEW
  failureReason?: string       // ← NEW
  retryCount?: number          // ← NEW
  createdAt: string
  externalId?: string          // ← NEW
}
```

Update `CustomFieldDefinition`:
```typescript
export interface CustomFieldDefinition {
  id: string
  name: string                 // ← NEW (machine key)
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'file'
  required: boolean            // ← not optional
  options?: string[]
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number }
  visibleToVolunteers: boolean
  editableByVolunteers: boolean
  context: 'call-notes' | 'conversation-notes' | 'reports' | 'all'  // ← updated
  order: number                // ← NEW
  createdAt: string            // ← NEW
}
```

Add missing types:
```typescript
export interface ContactSummary {
  contactHash: string
  last4?: string
  firstSeen: string
  lastSeen: string
  callCount: number
  conversationCount: number
  noteCount: number
  reportCount: number
}

export type CustomFieldContext = 'call-notes' | 'conversation-notes' | 'reports' | 'all'

export function fieldMatchesContext(
  field: CustomFieldDefinition,
  context: CustomFieldContext,
): boolean {
  return field.context === context || field.context === 'all'
}
```

**File: `src/lib/api-client.ts`**

Add note reply endpoints:
```typescript
export function listNoteReplies(noteId: string) {
  return api.get<{ replies: ConversationMessage[] }>(`/api/notes/${noteId}/replies`)
}

export function createNoteReply(noteId: string, data: {
  encryptedContent: string
  readerEnvelopes: RecipientKeyEnvelope[]
}) {
  return api.post<{ reply: ConversationMessage }>(`/api/notes/${noteId}/replies`, data)
}
```

Update `createNote` to accept `conversationId`:
```typescript
export function createNote(data: {
  callId?: string              // ← optional now
  conversationId?: string      // ← NEW
  encryptedContent: string
  authorEnvelope: KeyEnvelope
  adminEnvelopes?: RecipientKeyEnvelope[]
}) {
  return api.post<{ id: string }>('/api/notes', data)
}
```

Add contacts endpoints:
```typescript
export function listContacts(params?: { page?: number; limit?: number }) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit ?? 50))
  const qs = searchParams.toString()
  return api.get<{ contacts: ContactSummary[]; total: number }>(`/api/contacts${qs ? `?${qs}` : ''}`)
}

export function getContactTimeline(hash: string) {
  return api.get<{ notes: EncryptedNote[]; conversations: Conversation[] }>(`/api/contacts/${hash}`)
}
```

**File: `src/components/NoteCard.tsx`**

Fix the `callId` crash — line 73 should handle missing `callId`:
```typescript
<Text className="text-xs text-muted-foreground">
  {note.callId ? note.callId.slice(0, 8) + '...' : note.conversationId?.slice(0, 8) + '...'}
</Text>
```

**File: `src/components/MessageBubble.tsx`**

Update decryption to use `readerEnvelopes` instead of `adminEnvelopes` (lines 33-44):
```typescript
const envelopes = message.readerEnvelopes ?? message.adminEnvelopes ?? []
const result = decryptMessage(
  message.encryptedContent,
  envelopes,
  sk,
  myPubkey,
)
```

### Phase 2: NoteCard Reply Button

Add a reply button to `NoteCard` that shows the reply count:

```typescript
// In NoteCard.tsx — add after EncryptedContent
{note.replyCount != null && note.replyCount > 0 ? (
  <Pressable
    className="mt-2 flex-row items-center gap-1"
    onPress={() => onReplyPress?.(note.id)}
    testID="note-reply-btn"
  >
    <Text className="text-xs text-primary">
      {t('notes.repliesCount', '{{count}} replies', { count: note.replyCount })}
    </Text>
  </Pressable>
) : (
  <Pressable
    className="mt-2"
    onPress={() => onReplyPress?.(note.id)}
    testID="note-reply-btn"
  >
    <Text className="text-xs text-primary">{t('notes.reply', 'Reply')}</Text>
  </Pressable>
)}
```

Add `onReplyPress?: (noteId: string) => void` to `NoteCardProps`.

### Phase 3: Thread Expansion on Notes Screen

Add thread state to `NotesScreen`:

```typescript
const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)
const [threadReplies, setThreadReplies] = useState<ConversationMessage[]>([])
const [threadLoading, setThreadLoading] = useState(false)
```

When a reply button is tapped:
1. If same note is expanded → collapse (`setExpandedThreadId(null)`)
2. Otherwise → fetch replies via `listNoteReplies(noteId)`, store in `threadReplies`
3. Render a thread section below the NoteCard using `MessageBubble` components
4. Include a `TextInput` + Send button for composing replies

The thread section renders inline within the `FlatList` — when `expandedThreadId === note.id`, render the thread component after the `NoteCard`.

### Phase 4: Reply Composer

Add reply sending:

```typescript
async function handleSendReply(noteId: string) {
  if (!replyText.trim()) return
  setSendingReply(true)
  try {
    const pk = keyManager.getPublicKeyHex()
    if (!pk) throw new Error('No public key')

    const readerPubkeys = [pk]
    // Add admin pubkey if available and different
    const adminPub = getAdminDecryptionPubkey()
    if (adminPub && adminPub !== pk) readerPubkeys.push(adminPub)

    const encrypted = encryptMessage(replyText.trim(), readerPubkeys)
    const result = await createNoteReply(noteId, {
      encryptedContent: encrypted.encryptedContent,
      readerEnvelopes: encrypted.readerEnvelopes,
    })

    // Append to local state
    setThreadReplies(prev => [...prev, result.reply])
    setReplyText('')
    haptic.success()

    // Increment replyCount in query cache
    queryClient.setQueryData(['notes', page], (old: any) => {
      if (!old) return old
      return {
        ...old,
        notes: old.notes.map((n: EncryptedNote) =>
          n.id === noteId ? { ...n, replyCount: (n.replyCount ?? 0) + 1 } : n
        ),
      }
    })
  } catch {
    toast.error(t('common.error'))
  } finally {
    setSendingReply(false)
  }
}
```

### Phase 5: Note Detail Thread

Add threading to `app/note/[id].tsx` as well:
- Show reply count badge in metadata section
- Add "View Replies" button that expands the thread inline
- Include reply composer at the bottom
- Reuse the same `MessageBubble` component for rendering replies

## Files Changed

| File | Action |
|------|--------|
| `src/lib/types.ts` | Update `EncryptedNote`, `ConversationMessage`, `CustomFieldDefinition`; add `ContactSummary`, `fieldMatchesContext` |
| `src/lib/api-client.ts` | Add `listNoteReplies`, `createNoteReply`, `listContacts`, `getContactTimeline`; update `createNote` |
| `src/components/NoteCard.tsx` | Fix `callId` crash; add reply button + `onReplyPress` prop |
| `src/components/MessageBubble.tsx` | Update decryption to use `readerEnvelopes` |
| `app/(tabs)/notes.tsx` | Add thread expansion, reply list, reply composer |
| `app/note/[id].tsx` | Add thread section + reply composer |

## Security Considerations

- Reply encryption uses `encryptMessage` (per-reader ECIES envelopes), matching the desktop exactly
- Volunteers can only decrypt their own replies (via `readerEnvelopes` matching their pubkey)
- Admin pubkey is included in `readerPubkeys` so admins can read all replies
- `readerEnvelopes` (not `adminEnvelopes`) is the correct field for reply decryption — this is a `ConversationMessage`, not an `EncryptedNote`

## Testing

- Detox tests in Epic 128
- Manual verification: create note → tap reply → expand thread → send reply → verify reply appears → collapse/re-expand → verify count persists
