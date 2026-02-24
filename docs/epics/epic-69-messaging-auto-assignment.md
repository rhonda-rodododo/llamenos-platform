# Epic 69: Messaging Auto-Assignment

## Overview

Implement automatic routing of incoming messages to on-shift volunteers. When a new conversation starts, the system automatically assigns it to an available volunteer based on shift schedule, channel capability, language preferences, and current workload.

## Goals

1. Automatic assignment of new conversations to on-shift volunteers
2. Respect volunteer channel capabilities from Epic 68
3. Consider volunteer language preferences for language-based routing
4. Load balancing based on concurrent conversation count
5. Fallback to waiting queue when no volunteers available

## Technical Design

### Assignment Algorithm

```
1. New message arrives → ConversationDO.handleIncoming()
2. Query ShiftManagerDO.getCurrentVolunteers() for on-shift pubkeys
3. For each volunteer, check:
   a. Not on-break (volunteer.onBreak === false)
   b. Supports conversation's channel type
   c. Speaks caller's detected language (if language detection enabled)
   d. Under maxConcurrentPerVolunteer limit
4. If multiple candidates: select least-loaded (fewest active conversations)
5. If no candidates: leave in 'waiting' status for manual claim
6. Broadcast assignment via WebSocket
```

### Data Structures

**Volunteer Load Tracking** (ConversationDO):
```typescript
// Storage key pattern: `volunteer-load:{pubkey}`
// Value: number of active conversations
```

**Assignment Config** (MessagingConfig):
```typescript
{
  autoAssign: boolean              // Enable auto-assignment (default: true)
  preferLanguageMatch: boolean     // Prioritize language-matching volunteers
  maxConcurrentPerVolunteer: number // Max active conversations (default: 3)
}
```

### Backend Changes

1. **ConversationDO**:
   - Add `assignConversation()` method with assignment algorithm
   - Track volunteer load counters (increment on assign, decrement on close)
   - Call assignment logic from `handleIncoming()` when `autoAssign: true`

2. **ShiftManagerDO**:
   - Add `getOnShiftVolunteersWithDetails()` returning full volunteer data

3. **IdentityDO**:
   - Add `getVolunteersByPubkeys()` for batch volunteer lookup

### Frontend Changes

1. **Admin Settings**: Toggle for auto-assignment
2. **Dashboard**: Show assignment statistics (auto-assigned vs manual claims)

## Implementation Steps

1. [ ] Add volunteer load counter storage to ConversationDO
2. [ ] Implement `getOnShiftVolunteersWithDetails()` in ShiftManagerDO
3. [ ] Implement `getVolunteersByPubkeys()` in IdentityDO
4. [ ] Create assignment algorithm in ConversationDO
5. [ ] Wire assignment into `handleIncoming()` flow
6. [ ] Add auto-assignment toggle to admin messaging settings
7. [ ] Increment/decrement load counters on assign/close
8. [ ] Add assignment audit log entries
9. [ ] Write E2E tests for auto-assignment scenarios

## Acceptance Criteria

- [ ] New conversations auto-assigned when volunteers are on-shift
- [ ] Assignment respects channel capabilities
- [ ] Load balancing distributes conversations evenly
- [ ] Conversations queue in 'waiting' when no volunteers available
- [ ] Admins can toggle auto-assignment on/off
- [ ] Assignment events logged in audit log
