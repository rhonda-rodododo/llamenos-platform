# Epic 122: Conversation Storage Scaling & DO Decomposition

## Status: APPROVED

## Problem Statement

`ConversationDO` is the most overloaded Durable Object in the system. After Epic 119 splits out BlastDO, it still holds conversations, reports, messages, files, and load counters with a single-array storage pattern that won't scale.

Problems:
- **`conversations` array won't scale** — Cloudflare DO storage has a 128KB per-key limit. At ~500 bytes per conversation, this caps at ~250 conversations before hitting the limit.
- **`fileRecords` has the same problem** — single array will hit the limit
- **No proper pagination** — listing loads the entire array into memory
- **No per-status indexes** — every listing operation scans all conversations

## Goals

1. Migrate conversations from single-array to per-record key storage
2. Migrate file records to per-record keys
3. Add proper pagination over per-record storage with per-status indexes
4. Add `contactIdentifierHash` index for contact-level queries (Epic 123)
5. Evaluate load counter placement (keep in ConversationDO)

## Implementation

### Phase 1: Per-Record Conversation Storage

Replace the `conversations` single-array with per-record keys:

```
// Before:
conversations → Conversation[]  (single array, 128KB limit)

// After:
conv:${id}              → Conversation     (one key per conversation)
conv:_index             → string[]         (ordered list of IDs)
conv:_counts            → { total, active, waiting, closed }
conv:_index:active      → string[]         (per-status index)
conv:_index:waiting     → string[]
conv:_index:closed      → string[]
conv:_index:report      → string[]         (type index)
conv:_contact:${hash}   → string[]         (per-contact index for contact view)
```

**Migration approach:** Pre-production, so clean rewrite. On first access, check for legacy `conversations` key and auto-migrate.

**Listing with pagination:**

```typescript
async listConversations(params: { page: number; limit: number; status?: string; type?: string; contactHash?: string }) {
  // Use the most specific index available
  let index: string[]
  if (params.contactHash) {
    index = await this.state.storage.get(`conv:_contact:${params.contactHash}`) ?? []
  } else if (params.type === 'report') {
    index = await this.state.storage.get('conv:_index:report') ?? []
  } else if (params.status) {
    index = await this.state.storage.get(`conv:_index:${params.status}`) ?? []
  } else {
    index = await this.state.storage.get('conv:_index') ?? []
  }

  // Paginate over the index
  const start = (params.page - 1) * params.limit
  const ids = index.slice(start, start + params.limit)
  const convs = await this.state.storage.get(ids.map(id => `conv:${id}`))
  return { items: Array.from(convs.values()), total: index.length }
}
```

### Phase 2: Per-Record File Storage

Replace `fileRecords` single array with per-record keys:

```
// Before:
fileRecords → FileRecord[]

// After:
file:${id}     → FileRecord
file:_index    → string[]
```

### Phase 3: Index Maintenance

Every conversation create/update/delete must maintain all relevant indexes:

```typescript
async updateIndexes(conv: Conversation, oldStatus?: string) {
  // Remove from old status index
  if (oldStatus && oldStatus !== conv.status) {
    await this.removeFromIndex(`conv:_index:${oldStatus}`, conv.id)
  }
  // Add to new status index
  await this.addToIndex(`conv:_index:${conv.status}`, conv.id)
  // Maintain type index
  if (conv.metadata?.type === 'report') {
    await this.addToIndex('conv:_index:report', conv.id)
  }
  // Maintain contact index
  if (conv.contactIdentifierHash) {
    await this.addToIndex(`conv:_contact:${conv.contactIdentifierHash}`, conv.id)
  }
}
```

### Phase 4: Load Counter Optimization

Keep load counters in ConversationDO — the load changes atomically with conversation claim/close operations. Moving to a separate DO would require cross-DO coordination.

### Phase 5: Node.js Platform

Update the PostgreSQL-backed ConversationDO implementation to use the same per-record patterns. PostgreSQL naturally handles per-record storage via rows, so the migration is mainly about matching the API surface.

## Performance Considerations

- **Per-record storage trades list speed for write speed**: Writing one conversation no longer serializes the entire array. But listing requires loading individual keys.
- **CF DO `storage.list()`** with prefix is efficient for scanning: `storage.list({ prefix: 'conv:', limit: 50 })` returns up to 50 matching keys.
- **Batch get** is more efficient than individual gets: `storage.get(['conv:a', 'conv:b', 'conv:c'])` is a single round-trip.
- **Per-status indexes** avoid full scans for filtered queries.
- **Per-contact indexes** enable the contact view (Epic 123) without full-table scans.

## Files Changed

| File | Change |
|------|--------|
| `src/worker/durable-objects/conversation-do.ts` | Per-record storage for conversations and files |
| `src/platform/node/durable-objects.ts` | Update PostgreSQL implementation |
| `tests/*.spec.ts` | Update for new storage patterns |

## Dependencies

- **Epic 119** must be done first (BlastDO extraction, report filtering)
- Can be done in parallel with **Epic 120** (envelope types) and **Epic 121** (custom fields)

## Verification

1. Conversations CRUD works with per-record storage
2. Pagination returns correct results with per-record keys
3. Per-status indexes are maintained correctly
4. Per-contact indexes support contact-level queries
5. Report filtering works (from Epic 119)
6. File upload/download works with per-record file storage
7. Load counters still work for conversation assignment
8. Legacy single-array data is auto-migrated on first access
9. No 128KB limit errors with 500+ conversations
