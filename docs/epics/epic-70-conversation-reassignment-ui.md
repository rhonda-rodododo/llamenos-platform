# Epic 70: Conversation Reassignment UI

## Overview

Build admin UI for manually reassigning conversations between volunteers. Admins can transfer conversations from one volunteer to another, reassign waiting conversations, and bulk-reassign when volunteers go offline.

## Goals

1. Admin can reassign any conversation to any volunteer
2. Support bulk reassignment of multiple conversations
3. Re-encryption of messages when reassigned to new volunteer
4. Audit logging of all reassignments
5. Real-time notification to affected volunteers

## Technical Design

### Reassignment Flow

```
1. Admin selects conversation(s) to reassign
2. Admin picks target volunteer from dropdown
3. Backend validates target volunteer supports channel
4. Backend re-encrypts messages for new volunteer
5. Update assignedTo, broadcast reassignment event
6. Audit log entry created
```

### Re-encryption Challenge

Messages are dual-encrypted (volunteer copy + admin copy). On reassignment:
- Admin copy remains unchanged (admin can still decrypt)
- Volunteer copy needs re-encryption for new volunteer's pubkey
- Options:
  a. **Admin-mediated**: Admin decrypts and re-encrypts for new volunteer (requires admin nsec)
  b. **Server-mediated**: Store server-encrypted copy for reassignment (breaks E2EE)
  c. **No re-encryption**: New volunteer cannot read old messages (security trade-off)

**Recommended**: Option (c) - new volunteer can only read messages after reassignment. This preserves E2EE and is consistent with Signal's approach.

### Backend Changes

1. **ConversationDO**:
   - `reassignConversation(conversationId, targetPubkey, adminPubkey)` method
   - Validate target volunteer supports channel
   - Update `assignedTo` field
   - Add `reassignedAt` timestamp
   - Clear volunteer message envelopes (optional, for privacy)

2. **API Routes** (`/conversations/:id`):
   - PATCH supports `assignedTo` field update (admin only)
   - Validate target volunteer exists and supports channel

### Frontend Changes

1. **Conversation List (Admin View)**:
   - Checkbox selection for bulk operations
   - "Reassign" button opens volunteer picker dialog
   - Filter by assigned volunteer

2. **Conversation Detail**:
   - "Reassign" action button for admins
   - Shows reassignment history

3. **Volunteer Picker Dialog**:
   - Searchable volunteer list
   - Shows online status and current load
   - Filters by channel capability

## Implementation Steps

1. [ ] Add reassignment validation to ConversationDO
2. [ ] Add `reassignedAt` and `reassignedBy` fields to Conversation type
3. [ ] Create PATCH `/conversations/:id` route for reassignment
4. [ ] Build ReassignDialog component with volunteer picker
5. [ ] Add checkbox selection to admin conversation list
6. [ ] Implement bulk reassignment API
7. [ ] Add reassignment audit events
8. [ ] Broadcast reassignment via WebSocket
9. [ ] Write E2E tests for reassignment flows

## Acceptance Criteria

- [ ] Admins can reassign single conversations
- [ ] Admins can bulk-reassign multiple conversations
- [ ] Reassignment validates channel compatibility
- [ ] Affected volunteers receive real-time notification
- [ ] Reassignment logged in audit log
- [ ] New volunteer sees messages from reassignment point forward
