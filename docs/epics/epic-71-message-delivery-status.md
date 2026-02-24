# Epic 71: Message Delivery Status Tracking

## Overview

Track and display delivery status for outbound messages (pending → sent → delivered → failed). Provides volunteers with confidence their messages reached recipients and surfaces delivery failures for troubleshooting.

## Goals

1. Track message delivery status per message
2. Display status indicators in conversation UI
3. Handle delivery callbacks from messaging providers
4. Surface failed messages with retry option
5. Store provider's external message ID for reference

## Technical Design

### Message Status States

```typescript
type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

interface ConversationMessage {
  // ... existing fields
  status: MessageStatus
  externalId?: string          // Provider's message ID
  deliveredAt?: string         // ISO timestamp
  readAt?: string              // ISO timestamp (if supported)
  failureReason?: string       // Error message for failed
  retryCount?: number          // Number of retry attempts
}
```

### Provider Status Mapping

| Provider | Sent | Delivered | Read | Failed |
|----------|------|-----------|------|--------|
| **Twilio SMS** | queued/sent | delivered | - | failed/undelivered |
| **WhatsApp** | sent | delivered | read | failed |
| **Signal** | - | delivered | - | - |
| **RCS** | sent | delivered | read | failed |

### Backend Changes

1. **MessagingAdapter Interface**:
   - Add `parseStatusWebhook(request)` method
   - Return normalized `MessageStatusUpdate` object

2. **ConversationDO**:
   - `updateMessageStatus(messageId, status, metadata)` method
   - Storage for external ID mapping: `external-id:{providerId}` → `messageId`

3. **Webhook Router**:
   - Add status callback routes per provider
   - `/api/messaging/{channel}/status` endpoint

4. **Adapter Implementations**:
   - Twilio: Parse StatusCallback parameters
   - WhatsApp: Parse message status updates
   - Signal: Parse delivery receipts
   - RCS: Parse RBM status events

### Frontend Changes

1. **Message Bubble**:
   - Status icon (checkmark, double-check, clock, X)
   - Tooltip with status details and timestamp

2. **Failed Message Handling**:
   - Error badge with reason
   - "Retry" button for failed messages
   - Automatic retry for transient failures

## Implementation Steps

1. [ ] Add status fields to ConversationMessage type
2. [ ] Implement status webhook parsing in each adapter
3. [ ] Add status callback routes to messaging router
4. [ ] Create `updateMessageStatus()` in ConversationDO
5. [ ] Store external ID mapping on message send
6. [ ] Add status icons to message bubbles
7. [ ] Implement retry mechanism for failed messages
8. [ ] Broadcast status updates via WebSocket
9. [ ] Write E2E tests for status display

## Acceptance Criteria

- [ ] Outbound messages show pending status immediately
- [ ] Status updates to sent/delivered when provider confirms
- [ ] Failed messages show error reason
- [ ] Retry button re-sends failed messages
- [ ] Status updates arrive in real-time via WebSocket
- [ ] All provider adapters handle status callbacks
