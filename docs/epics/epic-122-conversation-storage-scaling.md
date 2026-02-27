# Epic 122: Conversation Storage Scaling & DO Decomposition

## Status: PROPOSED (awaiting review)

## Problem Statement

`ConversationDO` is the most overloaded Durable Object in the system. It holds six logically separate concerns in a single DO singleton:

1. **Conversations** — `conversations` (single array, will hit 128KB limit)
2. **Messages** — `messages:${convId}` (per-conversation, scales OK)
3. **Files** — `fileRecords` (single array)
4. **Subscribers** — `subscribers:*`, `subscriber-index:*` (per-subscriber keys, scales OK)
5. **Blasts** — `blasts:*`, `blast-active:*`, `blast-queue:*`, `blast-settings` (per-blast keys)
6. **Load counters** — `load:${pubkey}` (per-volunteer keys)

Problems:
- **`conversations` array won't scale** — Cloudflare DO storage has a 128KB per-key limit. At ~500 bytes per conversation, this caps at ~250 conversations before hitting the limit.
- **Blast alarm scheduling** shares the same DO alarm as conversation cleanup — only one alarm per DO
- **Testing and reasoning** is harder when one DO handles six concerns
- **RecordsDO** has the same multi-concern issue (bans + notes + audit log), but notes already use per-record keys

## Goals

1. Migrate conversations from single-array to per-record key storage
2. Split blast/subscriber concerns into a separate `BlastDO`
3. Migrate file records to per-record keys
4. Add proper pagination over per-record storage
5. Evaluate whether bans should move out of RecordsDO (probably not — small dataset, frequently checked)

## Implementation

### Phase 1: Per-Record Conversation Storage

Replace the `conversations` single-array with per-record keys:

```
// Before:
conversations → Conversation[]  (single array, 128KB limit)

// After:
conv:${id}    → Conversation     (one key per conversation)
conv:_index   → string[]         (ordered list of IDs for pagination)
conv:_counts  → { total, active, waiting, closed }  (cached counters)
```

**Migration approach (ConversationDO):**

```typescript
// On first access, check for legacy 'conversations' key
const legacy = await this.state.storage.get<Conversation[]>('conversations')
if (legacy) {
  // Migrate to per-record keys
  const puts: Record<string, unknown> = {}
  const index: string[] = []
  for (const conv of legacy) {
    puts[`conv:${conv.id}`] = conv
    index.push(conv.id)
  }
  puts['conv:_index'] = index
  await this.state.storage.put(puts)
  await this.state.storage.delete('conversations')
}
```

**Listing with pagination:**

```typescript
async listConversations(params: { page: number; limit: number; status?: string; type?: string }) {
  const index = await this.state.storage.get<string[]>('conv:_index') ?? []

  // For filtered queries, we need to load conversations
  // Use storage.get() with batch of IDs
  const ids = index.slice((params.page - 1) * params.limit, params.page * params.limit)
  const convs = await this.state.storage.get<Conversation>(ids.map(id => `conv:${id}`))

  // Apply filters
  return Array.from(convs.values()).filter(c => {
    if (params.status && c.status !== params.status) return false
    if (params.type === 'report' && c.metadata?.type !== 'report') return false
    if (!params.type && c.metadata?.type === 'report') return false
    return true
  })
}
```

**Note:** For filtered pagination, we may need to over-fetch and filter. For production scale, consider maintaining per-status indexes:
```
conv:_index:active   → string[]
conv:_index:waiting  → string[]
conv:_index:closed   → string[]
conv:_index:report   → string[]
```

### Phase 2: Split BlastDO

Extract subscriber management and blast broadcasting into `BlastDO`.

**New file: `src/worker/durable-objects/blast-do.ts`**

Moves these storage keys out of ConversationDO:
- `subscribers:${idHash}` → `Subscriber`
- `subscriber-index:channel:${ch}` → `string[]`
- `blasts:${id}` → `Blast`
- `blast-active:${id}` → `boolean`
- `blast-queue:${id}` → `BlastQueueItem[]`
- `blast-settings` → `BlastSettings`

BlastDO gets its own alarm handler for scheduled blast execution.

**Route changes:**

`src/worker/routes/blasts.ts` — Change DO reference from `env.CONVERSATION_DO` to `env.BLAST_DO`:

```typescript
// Before:
const convDo = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(hubId))

// After:
const blastDo = env.BLAST_DO.get(env.BLAST_DO.idFromName(hubId))
```

**Wrangler config:**

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      // ... existing bindings
      { "name": "BLAST_DO", "class_name": "BlastDO" }
    ]
  }
}
```

**Node.js platform:**

`src/platform/node/` — Add `BlastDO` PostgreSQL-backed implementation.

### Phase 3: Per-Record File Storage

Replace `fileRecords` single array with per-record keys:

```
// Before:
fileRecords → FileRecord[]

// After:
file:${id}     → FileRecord
file:_index    → string[]
```

Same pattern as conversations.

### Phase 4: Load Counter Optimization

Load counters (`load:${pubkey}`) already use per-key storage, which is fine. But they're coupled to ConversationDO. Consider whether they should be:

1. **Keep in ConversationDO** — Load is directly related to conversation assignment
2. **Move to ShiftManagerDO** — Load is a shift-scheduling concern

**Recommendation:** Keep in ConversationDO — the load changes atomically with conversation claim/close operations. Moving to a separate DO would require cross-DO coordination.

## Files Changed

| File | Change |
|------|--------|
| `src/worker/durable-objects/conversation-do.ts` | Per-record storage, remove blasts |
| `src/worker/durable-objects/blast-do.ts` | **NEW** — extracted blast DO |
| `src/worker/routes/blasts.ts` | Route to BlastDO |
| `src/worker/index.ts` | Register BlastDO |
| `wrangler.jsonc` | Add BLAST_DO binding |
| `src/platform/node/durable-objects.ts` | Add BlastDO PostgreSQL implementation |
| `docker-compose.yml` | No change (PostgreSQL handles all DOs) |
| `tests/*.spec.ts` | Update blast tests for new DO routing |

## Performance Considerations

- **Per-record storage trades list speed for write speed**: Writing one conversation no longer serializes the entire array. But listing requires loading individual keys.
- **CF DO `storage.list()`** with prefix is efficient for scanning: `storage.list({ prefix: 'conv:', limit: 50 })` returns up to 50 matching keys.
- **Batch get** is more efficient than individual gets: `storage.get(['conv:a', 'conv:b', 'conv:c'])` is a single round-trip.
- **Index maintenance** adds complexity but is necessary for ordered pagination.

## Dependencies

- **Epic 119** must be done first (report filtering fix, shared components)
- Can be done in parallel with **Epic 120** (envelope types) and **Epic 121** (custom fields)

## Verification

1. Conversations CRUD works with per-record storage
2. Pagination returns correct results with per-record keys
3. Report filtering works (from Epic 119)
4. Blast routes work against new BlastDO
5. Scheduled blasts fire correctly (BlastDO alarm)
6. File upload/download works with per-record file storage
7. Load counters still work for conversation assignment
8. Legacy single-array data is auto-migrated on first access
9. No 128KB limit errors with 500+ conversations
