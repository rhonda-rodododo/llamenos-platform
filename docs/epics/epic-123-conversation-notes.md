# Epic 123: Threaded Notes & Contact View

## Status: APPROVED

## Problem Statement

Currently, notes are single-author documents exclusively tied to voice calls via `callId`. This creates several gaps:

1. **No discussion on notes** — Volunteers write a note, but admins can't ask follow-up questions or add context. There's no way to discuss outcomes of a call or conversation.
2. **No notes on messaging conversations** — When a volunteer handles an SMS/WhatsApp/Signal conversation, they have no way to write structured notes about it.
3. **No contact-level view** — All incoming communications (calls, SMS, WhatsApp, Signal, reports) for a specific phone number are siloed in separate pages with no unified timeline.

## Design

### Threaded Notes

Notes become **threaded discussions**, structurally identical to how reports work:

1. **Initial note entry** — Volunteer creates a note with custom fields + text (same as today)
2. **Reply messages** — Admin and volunteer can exchange replies on the note (NEW)
3. **Same ConversationThread component** renders the note thread (reuse from Epic 119)
4. **Same E2EE envelope pattern** — replies use `RecipientEnvelope` with `LABEL_NOTE_KEY` domain separation

This applies to both **call notes** (linked to `callId`) and **conversation notes** (linked to `conversationId`).

### Note Storage Architecture

Notes and their replies live in `RecordsDO` (the note storage authority):

```
note:${id}           → EncryptedNote        (existing per-note key storage)
note-replies:${id}   → EncryptedMessage[]    (NEW: replies on this note)
```

The initial note remains an `EncryptedNote` with `NotePayload` (text + custom fields). Replies are `EncryptedMessage` objects using the same envelope pattern — this reuses the `ConversationThread` component directly.

### Conversation Notes

Notes can now be attached to conversations (not just calls):

```typescript
interface EncryptedNote {
  id: string
  callId?: string           // links to a voice call
  conversationId?: string   // links to a conversation/report
  contactHash?: string      // links to a contact (for contact-level view)
  authorPubkey: string
  encryptedContent: string
  envelopes: RecipientEnvelope[]  // unified envelope (from Epic 120)
  replyCount: number        // cached count of replies
  createdAt: string
  updatedAt?: string
}
```

At least one of `callId` or `conversationId` must be set. `contactHash` is derived from the call's caller hash or the conversation's contact hash — enables contact-level queries.

### Contact-Level Unified View

A new `/contacts` page that aggregates all interactions for a specific phone number:

```
┌──────────────────────────────────────────────┐
│ Contact: ***-3456                             │
│ First seen: Jan 15, 2026                     │
├──────────────────────────────────────────────┤
│ Timeline                                     │
│                                              │
│ Feb 27 · Voice Call (3 min)                  │
│   Answered by: Volunteer A                   │
│   📝 Call Note: "Caller distressed..."       │
│     └─ 2 replies                             │
│                                              │
│ Feb 25 · SMS Conversation (12 messages)      │
│   Assigned to: Volunteer B                   │
│   📝 Conversation Note: "Follow-up needed"  │
│     └─ 1 reply                               │
│                                              │
│ Feb 20 · WhatsApp Conversation (5 messages)  │
│   Assigned to: Volunteer A                   │
│                                              │
│ Feb 18 · Report: "Safety concern"            │
│   Category: Safety · Status: Resolved        │
│                                              │
└──────────────────────────────────────────────┘
```

**Data sources:**
- Voice calls: RecordsDO call records filtered by `callerHash`
- Conversations: ConversationDO conversations filtered by `contactIdentifierHash`
- Notes: RecordsDO notes filtered by `contactHash`
- Reports: ConversationDO conversations filtered by `contactIdentifierHash` + `type=report`

### Contact History Permissions

The contact view introduces a new permission model for viewing past interaction history:

**New permissions:**
- `contacts:view` — Can see the contacts page and contact timelines
- `contacts:view-history` — Can see past interactions from other volunteers for a contact (calls, conversations, notes, reports)

**Default role permissions:**

| Permission | Admin | Volunteer | Reporter |
|---|---|---|---|
| `contacts:view` | yes | **no** | no |
| `contacts:view-history` | yes | **no** | no |

**Key design decisions:**
1. **Admin always has full access** — admins see the complete contact timeline by default
2. **Volunteer access is opt-in** — disabled by default, but hotline admins can enable per role
3. **Highlighted during onboarding** — the setup wizard mentions this as a suggestion: *"Would you like volunteers to see a caller's past interaction history when handling calls? This can help with continuity of care."*
4. **Surfaced in role management UI** — the Roles settings section has a "Contact History" permission group with a brief explanation of the privacy trade-off
5. **Granular per-role** — an admin could create a "Senior Volunteer" role with `contacts:view-history` while keeping regular volunteers without it

**When a volunteer answers a call with `contacts:view-history` enabled:**
- The call detail view shows a "Contact History" section with past interactions for that caller
- Past notes from other volunteers are visible (decryptable because admin envelopes are present)
- Past conversations assigned to other volunteers are visible
- This helps with continuity of care across shifts

**Privacy consideration:** This permission is sensitive because it exposes past interaction details across volunteers. The UI should clearly indicate when history is being shown, and the permission description should explain the trade-off between continuity and privacy.

## Implementation

### Phase 1: Extend Note Linking

**`src/shared/types.ts` / `src/worker/types.ts`:**

Add `conversationId`, `contactHash`, and `replyCount` to `EncryptedNote`.

### Phase 2: Note Replies API

**`src/worker/routes/notes.ts`:**

```typescript
// GET /api/notes/:id/replies — list replies on a note
// POST /api/notes/:id/replies — add a reply to a note
```

**`src/worker/durable-objects/records-do.ts`:**

Add `note-replies:${noteId}` storage key. Reply is an `EncryptedMessage` — same envelope pattern as conversation messages, but stored in RecordsDO and uses `LABEL_NOTE_KEY` for domain separation.

### Phase 3: Frontend — Note Threading

**Extract `NoteEditor` and `NoteCard` from notes page:**

```tsx
// src/client/components/NoteEditor.tsx
interface NoteEditorProps {
  callId?: string
  conversationId?: string
  onSave: (note: EncryptedNote) => void
  onCancel: () => void
  customFields: CustomFieldDefinition[]  // filtered by context
}

// src/client/components/NoteCard.tsx
interface NoteCardProps {
  note: EncryptedNote
  decryptedContent?: NotePayload
  customFields: CustomFieldDefinition[]
  onReply?: () => void  // opens reply composer
  replies?: EncryptedMessage[]
}
```

**Note detail view with thread:**

When a note is expanded, show the initial note entry + `ConversationThread` for replies:

```tsx
<NoteCard note={note} decryptedContent={payload} customFields={callNoteFields}>
  {note.replyCount > 0 && (
    <ConversationThread
      conversationId={note.id}  // note ID as thread ID
      messages={replies}
      onSend={handleReply}
      canSend={canReply}
      compact  // smaller bubbles for note replies
    />
  )}
  <Button variant="ghost" size="sm" onClick={() => setShowReplyComposer(true)}>
    Reply
  </Button>
</NoteCard>
```

### Phase 4: Conversation Notes in Detail Views

**`src/client/routes/conversations.tsx`:**

Add a "Call Notes" section below the message thread (for conversation notes):

```tsx
{conversationNotes.map(note => (
  <NoteCard key={note.id} note={note} ... />
))}
<Button onClick={() => setShowNoteEditor(true)}>Add Note</Button>
```

Same for `reports.tsx` — the ReportDetail (which uses ConversationThread after Epic 119) also shows associated notes.

### Phase 5: Contact History Permissions

**Add new permissions to the permission system:**

```typescript
// src/shared/permissions.ts (or wherever permissions are defined)
'contacts:view'          // Can access the contacts page
'contacts:view-history'  // Can see past interactions from other volunteers
```

**Update default role permissions:**
- Admin roles: both enabled by default
- Volunteer roles: both disabled by default
- Reporter role: neither

**Update onboarding wizard** to mention contact history as a suggested option for volunteer roles.

**Update role management UI** to surface these permissions with a "Contact History" group and privacy explanation.

### Phase 6: Contact View

**New route: `/contacts`**

Page showing contacts (identified by last-4 digits) with interaction counts. Accessible to anyone with `contacts:view` permission.

**`/contacts/:hash`** — Contact detail page with unified timeline.

**API endpoints:**
```typescript
// GET /api/contacts — list contacts with interaction counts
// GET /api/contacts/:hash — get all interactions for a contact
```

These aggregate across RecordsDO (calls, notes) and ConversationDO (conversations, reports). Since we can't do cross-DO joins, the worker route handler makes parallel requests to both DOs and merges the results.

**Contact history in call/conversation detail views:**

When a volunteer with `contacts:view-history` answers a call or opens a conversation, the detail view shows a collapsible "Contact History" section with past interactions for that caller/contact.

### Phase 7: Notes Page Updates

Update the notes page (now "Call Notes" page) to:
- Show reply count on each note card
- Allow expanding a note to see its thread
- Show conversation-linked notes with a link to the conversation
- Filter by `callId` or `conversationId`

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `conversationId`, `contactHash`, `replyCount` to note types |
| `src/worker/types.ts` | Update `EncryptedNote` |
| `src/worker/routes/notes.ts` | Add reply endpoints, accept `conversationId`, add `contactHash` filter |
| `src/worker/durable-objects/records-do.ts` | Add `note-replies:${id}` storage, contact-based note listing |
| `src/worker/routes/contacts.ts` | **NEW** — Contact aggregation API |
| `src/client/components/NoteEditor.tsx` | **NEW** — Extracted from notes page |
| `src/client/components/NoteCard.tsx` | **NEW** — Extracted from notes page, with reply support |
| `src/client/routes/notes.tsx` | Refactor to use shared components, add threading |
| `src/client/routes/conversations.tsx` | Add note section in detail view |
| `src/client/routes/reports.tsx` | Add note section in detail view |
| `src/client/routes/contacts.tsx` | **NEW** — Contact list and detail pages |
| `src/shared/permissions.ts` (or equivalent) | Add `contacts:view`, `contacts:view-history` permissions |
| Role defaults / onboarding | Update default permissions, wizard suggestion |
| Role management UI | Add "Contact History" permission group |
| `src/client/locales/*.json` | Add i18n for contact view, note replies, permissions |

## Dependencies

- **Epic 119** (Records Domain Consolidation) — shared ConversationThread component
- **Epic 120** (Unified Envelope Types) — `RecipientEnvelope` used for note replies
- **Epic 121** (Custom Fields) — `conversation-notes` context for custom fields

## Security Considerations

- Note replies use the same E2EE as notes — per-reply key, ECIES envelopes for author + admins
- The `conversationId` and `contactHash` are stored as cleartext metadata (same as `callId`) — allows server-side filtering without decryption
- Permission model extended: `notes:create` to write, `notes:read-own` or `notes:read-all` to read, `contacts:view` and `contacts:view-history` for contact timeline
- Contact view respects granular permissions — admins always see everything, volunteers only with `contacts:view-history` enabled
- Reply domain separation: uses `LABEL_NOTE_KEY` (same as notes, not `LABEL_MESSAGE`)

## Verification

1. Volunteer can create a call note (threaded)
2. Admin can reply to a call note
3. Volunteer can reply back on the same note
4. Volunteer can create a note linked to a conversation
5. Conversation notes appear in the conversation detail view
6. Custom fields work in conversation notes (using `conversation-notes` context)
7. Note replies are encrypted (author + admins can decrypt)
8. Contact view shows unified timeline for a phone number
9. Contact view requires `contacts:view` permission
10. Volunteer without `contacts:view-history` cannot see other volunteers' interactions
11. Volunteer with `contacts:view-history` can see past interactions in call/conversation detail
12. Onboarding wizard mentions contact history as a suggestion
13. Role management UI surfaces contact history permissions with privacy explanation
14. Notes page shows reply counts and expandable threads
15. Clicking a conversation-linked note navigates to the conversation
