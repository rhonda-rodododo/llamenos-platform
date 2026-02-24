# Epic 72: Volunteer Load Balancing

## Overview

Track and limit concurrent conversations per volunteer to prevent overload. Implements the `maxConcurrentPerVolunteer` setting and provides admin visibility into volunteer workload.

## Goals

1. Track active conversation count per volunteer
2. Enforce maximum concurrent conversation limit
3. Display volunteer load in admin dashboard
4. Automatic load rebalancing when volunteers go on-break
5. Fair distribution algorithm for new assignments

## Technical Design

### Load Counter Storage

```typescript
// ConversationDO storage
// Key: `volunteer-load:{pubkey}`
// Value: number (count of active conversations)

// Key: `volunteer-conversations:{pubkey}`
// Value: string[] (array of active conversation IDs)
```

### Load Management Operations

```typescript
interface LoadManager {
  getVolunteerLoad(pubkey: string): Promise<number>
  incrementLoad(pubkey: string, conversationId: string): Promise<void>
  decrementLoad(pubkey: string, conversationId: string): Promise<void>
  getAvailableVolunteers(maxLoad: number): Promise<string[]>
  getLeastLoadedVolunteer(candidates: string[]): Promise<string | null>
}
```

### Load Enforcement Points

1. **Claim**: Check load before allowing volunteer to claim
2. **Auto-assign**: Skip volunteers at max capacity
3. **Reassign**: Validate target volunteer has capacity

### Admin Dashboard Metrics

- Per-volunteer conversation count
- Total active conversations
- Average conversations per volunteer
- Volunteers at capacity warning

### Backend Changes

1. **ConversationDO**:
   - Load counter management methods
   - Capacity check in `claimConversation()`
   - Load-aware auto-assignment

2. **API Routes**:
   - GET `/conversations/stats` includes volunteer load data
   - GET `/volunteers/load` returns load per volunteer

3. **WebSocket Events**:
   - `load:updated` when volunteer load changes

### Frontend Changes

1. **Admin Dashboard**:
   - Volunteer workload panel
   - Visual load indicator (bar or badge)
   - Warning when volunteers at capacity

2. **Conversation Claim**:
   - Error message when at capacity
   - Show current load before claiming

## Implementation Steps

1. [ ] Add load counter storage to ConversationDO
2. [ ] Implement increment/decrement on assign/close
3. [ ] Add capacity check to claim validation
4. [ ] Create volunteer load API endpoint
5. [ ] Add load stats to conversations/stats endpoint
6. [ ] Build volunteer workload dashboard component
7. [ ] Add capacity error handling in claim UI
8. [ ] Broadcast load updates via WebSocket
9. [ ] Write E2E tests for capacity enforcement

## Acceptance Criteria

- [ ] Volunteers cannot claim beyond max concurrent limit
- [ ] Auto-assignment skips volunteers at capacity
- [ ] Admin dashboard shows per-volunteer load
- [ ] Load counters update in real-time
- [ ] Closing conversations decrements load correctly
- [ ] Reassignment respects capacity limits
