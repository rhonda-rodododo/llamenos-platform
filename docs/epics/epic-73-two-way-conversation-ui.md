# Epic 73: Enhanced Two-Way Conversation UI

## Overview

Polish the conversation UI for full two-way messaging experience. Improve message display, add typing indicators, implement quick replies, and enhance the overall volunteer experience.

## Goals

1. Clear visual distinction between inbound and outbound messages
2. Message timestamps and delivery status indicators
3. Typing indicators (when supported by channel)
4. Quick reply templates
5. Message search within conversation
6. Conversation notes (internal, not sent to contact)

## Technical Design

### Message Display Enhancements

```typescript
interface MessageBubbleProps {
  message: DecryptedMessage
  direction: 'inbound' | 'outbound'
  status?: MessageStatus
  isDecrypting?: boolean
  showTimestamp?: boolean
}
```

### Quick Replies

```typescript
interface QuickReply {
  id: string
  label: string          // Short button text
  content: string        // Full message content
  category?: string      // Grouping
  hubId?: string         // Hub-specific or global
}
```

### Typing Indicators

- WhatsApp: Supported via read receipt webhooks
- Signal: Not supported by signal-cli
- SMS: Not supported
- RCS: Supported via isTyping events

### Conversation Notes

Internal notes visible only to volunteers/admins, not sent to contact:

```typescript
interface ConversationNote {
  id: string
  conversationId: string
  authorPubkey: string
  encryptedContent: string
  ephemeralPubkey: string
  encryptedContentAdmin: string
  ephemeralPubkeyAdmin: string
  createdAt: string
}
```

### Backend Changes

1. **ConversationDO**:
   - Quick replies CRUD
   - Conversation notes CRUD
   - Typing indicator relay (for supported channels)

2. **API Routes**:
   - GET/POST `/conversations/:id/notes`
   - GET/POST/DELETE `/settings/quick-replies`

### Frontend Changes

1. **MessageBubble Component**:
   - Direction-based styling (left/right alignment)
   - Status icons
   - Timestamp display

2. **MessageComposer**:
   - Quick reply buttons
   - Character count
   - Send on Enter (configurable)

3. **ConversationThread**:
   - Auto-scroll on new messages
   - Load more (pagination)
   - Search within conversation

4. **ConversationNotes Panel**:
   - Collapsible sidebar or tab
   - Encrypted note creation
   - Note history

## Implementation Steps

1. [ ] Enhance MessageBubble with direction styling
2. [ ] Add status indicators to messages
3. [ ] Implement quick reply CRUD and UI
4. [ ] Add conversation notes storage and API
5. [ ] Build conversation notes panel
6. [ ] Add message search within conversation
7. [ ] Implement auto-scroll behavior
8. [ ] Add typing indicator display (where supported)
9. [ ] Write E2E tests for conversation UI

## Acceptance Criteria

- [ ] Messages clearly show direction (inbound vs outbound)
- [ ] Delivery status visible on outbound messages
- [ ] Quick replies speed up common responses
- [ ] Conversation notes stay internal (not sent)
- [ ] Search finds messages within conversation
- [ ] UI auto-scrolls on new messages
