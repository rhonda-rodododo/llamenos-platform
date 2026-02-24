# Epic 68: Messaging Channel Permissions

## Overview

Extend the volunteer permission system to support channel-specific messaging assignments. Volunteers can be assigned to handle specific messaging channels (SMS, WhatsApp, Signal, RCS, Web), enabling targeted routing and workload distribution.

## Goals

1. Add `supportedMessagingChannels` field to Volunteer schema
2. Create channel-specific permissions for conversations
3. Update ConversationDO to validate channel compatibility during assignment
4. Add UI for managing volunteer channel assignments
5. Filter available-to-claim conversations by volunteer's supported channels

## Technical Design

### Schema Changes

**Volunteer Type** (`src/worker/types.ts`):
```typescript
interface Volunteer {
  // ... existing fields
  supportedMessagingChannels?: MessagingChannelType[]  // SMS, WhatsApp, Signal, RCS, Web
}
```

### Permission Extensions

**New Permissions** (`src/shared/permissions.ts`):
- `conversations:claim-sms` - Claim SMS conversations
- `conversations:claim-whatsapp` - Claim WhatsApp conversations
- `conversations:claim-signal` - Claim Signal conversations
- `conversations:claim-rcs` - Claim RCS conversations
- `conversations:claim-web` - Claim web conversations
- `conversations:claim-any` - Claim any channel (admin override)

### Backend Changes

1. **IdentityDO**: Add `supportedMessagingChannels` to volunteer CRUD
2. **ConversationDO**:
   - `claimConversation()` validates channel compatibility
   - `listConversations()` filters by volunteer's supported channels for non-admins
3. **Permission Guard**: Check channel-specific claim permissions

### Frontend Changes

1. **Volunteer Edit Form**: Multi-select for supported channels
2. **Volunteer List**: Display supported channels as badges
3. **Conversation List**: Only show claimable conversations matching volunteer's channels

## Implementation Steps

1. [ ] Update Volunteer type with `supportedMessagingChannels` field
2. [ ] Add channel-specific permissions to permission catalog
3. [ ] Update default volunteer role to include all channel claim permissions
4. [ ] Add channel capability validation in ConversationDO.claimConversation()
5. [ ] Filter conversation list based on volunteer's channel capabilities
6. [ ] Add channel multi-select to volunteer create/edit forms
7. [ ] Display channel badges in volunteer list
8. [ ] Write E2E tests for channel-based filtering

## Acceptance Criteria

- [ ] Volunteers can only claim conversations for their assigned channels
- [ ] Admins can assign messaging channels to volunteers
- [ ] Conversation list filters based on volunteer's capabilities
- [ ] Admins with `conversations:claim-any` bypass channel restrictions
- [ ] All changes pass typecheck and build
