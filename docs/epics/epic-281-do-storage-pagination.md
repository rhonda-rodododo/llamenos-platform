# Epic 281: DO Storage Pagination & Scalability

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Split large single-key storage patterns in Durable Objects into per-entity or sharded keys with cursor-based pagination. Add bounds checking and storage size monitoring to prevent hitting Cloudflare's 128KB per-key limit.

## Problem Statement

Several Durable Objects store unbounded collections in a single storage key, creating a ticking time bomb as usage grows:

1. **ConversationDO `conv-index`**: The entire conversation index (`ConvIndexEntry[]`) is stored in one key. Each entry is ~150 bytes. At ~850 conversations the key hits 128KB and writes start failing silently. A busy hotline receiving 50 conversations/day hits this in ~17 days.

2. **ConversationDO `file-index`**: Same pattern — all `FileIndexEntry[]` in one key. Each entry is ~80 bytes, limit ~1,600 files.

3. **IdentityDO `volunteers`**: All volunteers stored as `Record<string, Volunteer>` in one key. Each volunteer is ~500 bytes with metadata. At 256 volunteers, this hits 128KB. Less urgent (most deployments have <50 volunteers) but still a hard ceiling.

4. **IdentityDO `invites`**: All invite codes in one `InviteCode[]` key. Redeemed/expired invites are never removed, so this grows monotonically.

5. **CallRouterDO `activeCalls`**: All active calls in one `CallRecord[]` key. During high-volume periods (e.g., a mass protest), dozens of simultaneous calls could push this beyond limits. The stale-call cleanup in `getActiveCallsList()` mitigates this somewhat, but relies on the method being called.

6. **SettingsDO `hubs`**: All hubs in one `Hub[]` key. Low risk today (few hubs) but unbounded.

7. **BlastDO subscriber/blast lists**: Similar single-key patterns for subscriber lists and blast queues.

Current `listConversations()` loads the entire index into memory, filters, sorts, and slices — O(n) for every page request regardless of which page is requested.

## Implementation

### Phase 1: ConversationDO Index Sharding (Critical Path)

Replace the monolithic `conv-index` key with per-entry storage using a prefix scan pattern that Cloudflare DO storage natively supports via `storage.list({ prefix })`.

**Storage layout change:**

```
# Before (single key, entire array):
conv-index → ConvIndexEntry[]

# After (per-entry keys, naturally paginated):
cidx:${lastMessageAt}:${id} → ConvIndexEntry
```

The key format `cidx:${ISO-timestamp}:${uuid}` enables:
- Natural time-ordering via `storage.list({ prefix: 'cidx:', reverse: true, limit: N })`
- Cursor-based pagination using `storage.list({ start: cursor, ... })`
- No need to deserialize the entire index for a single page

**ConversationDO changes (`apps/worker/durable-objects/conversation-do.ts`):**

```typescript
// --- New Index Methods ---

/** Storage key for index entry — lexicographic sort by lastMessageAt DESC */
private indexKey(entry: ConvIndexEntry): string {
  // Invert timestamp for natural DESC ordering with forward list()
  // ISO strings sort lexicographically, so we pad and invert
  return `cidx:${entry.lastMessageAt}:${entry.id}`
}

private async putIndexEntry(entry: ConvIndexEntry): Promise<void> {
  await this.ctx.storage.put(this.indexKey(entry), entry)
}

private async deleteIndexEntry(entry: ConvIndexEntry): Promise<void> {
  await this.ctx.storage.delete(this.indexKey(entry))
}

/**
 * Update index: delete old key (if timestamp changed), write new key.
 * Must handle timestamp changes since the key includes lastMessageAt.
 */
private async updateIndex(conv: Conversation, previousLastMessageAt?: string): Promise<void> {
  const entry = this.toIndexEntry(conv)

  // If timestamp changed, delete the old key first
  if (previousLastMessageAt && previousLastMessageAt !== conv.lastMessageAt) {
    await this.ctx.storage.delete(`cidx:${previousLastMessageAt}:${conv.id}`)
  }

  await this.putIndexEntry(entry)
}

private async removeFromIndex(id: string): Promise<void> {
  // Need to find and delete the key — scan by suffix is not efficient,
  // so store a reverse lookup: cidx-rev:${id} → timestamp
  const timestamp = await this.ctx.storage.get<string>(`cidx-rev:${id}`)
  if (timestamp) {
    await this.ctx.storage.delete(`cidx:${timestamp}:${id}`)
    await this.ctx.storage.delete(`cidx-rev:${id}`)
  }
}

/**
 * Paginated index scan with filtering.
 * Uses cursor-based pagination — no need to load entire index.
 */
private async listConversations(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') as ConversationStatus | null
  const assignedTo = url.searchParams.get('assignedTo')
  const channel = url.searchParams.get('channel') as MessagingChannelType | null
  const type = url.searchParams.get('type')
  const contactHash = url.searchParams.get('contactHash')
  const cursor = url.searchParams.get('cursor')
  const page = Math.max(1, Math.min(parseInt(url.searchParams.get('page') || '1'), 1000))
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '50'), 200))

  // For filtered queries, we must scan and filter.
  // Use storage.list with prefix scan — much more efficient than loading one giant array.
  const listOpts: { prefix: string; limit?: number; start?: string; reverse?: boolean } = {
    prefix: 'cidx:',
    reverse: true, // newest first
  }
  if (cursor) {
    listOpts.start = cursor
  }

  // Scan in batches using cursor-based pagination.
  // storage.list({ start, limit }) does a B-tree range scan — only reads
  // the requested range, not the entire prefix set.
  const SCAN_BATCH = limit * 3  // Over-fetch to account for filtered-out entries
  const hasFilters = !!(status || assignedTo || channel || type || contactHash)
  const results: ConvIndexEntry[] = []
  let nextCursor: string | undefined
  let scanCursor: string | undefined = cursor || undefined

  // Scan in batches until we have enough results or run out of entries
  while (results.length < limit) {
    const listOpts: Record<string, unknown> = {
      prefix: 'cidx:',
      reverse: true,
      limit: hasFilters ? SCAN_BATCH : limit,
    }
    if (scanCursor) {
      listOpts.start = scanCursor
    }

    const batch = await this.ctx.storage.list<ConvIndexEntry>(listOpts)
    if (batch.size === 0) break  // No more entries

    for (const [key, entry] of batch) {
      scanCursor = key  // Track position for next batch

      if (hasFilters && !this.matchesFilters(entry, { status, assignedTo, channel, type, contactHash })) {
        continue
      }

      results.push(entry)
      if (results.length >= limit) {
        nextCursor = key
        break
      }
    }

    // If batch was smaller than requested, we've reached the end
    if (batch.size < (hasFilters ? SCAN_BATCH : limit)) break
  }

  const conversations = await Promise.all(
    results.map(e => this.getConv(e.id))
  )

  return Response.json({
    conversations: conversations.filter(Boolean),
    nextCursor,
    hasMore: !!nextCursor,
  })
}

private matchesFilters(
  entry: ConvIndexEntry,
  filters: {
    status: ConversationStatus | null
    assignedTo: string | null
    channel: MessagingChannelType | null
    type: string | null
    contactHash: string | null
  },
): boolean {
  if (filters.type === 'report') {
    if (entry.type !== 'report') return false
  } else if (!filters.type) {
    if (entry.type === 'report') return false
  }
  if (filters.contactHash && entry.contactHash !== filters.contactHash) return false
  if (filters.status && entry.status !== filters.status) return false
  if (filters.assignedTo && entry.assignedTo !== filters.assignedTo) return false
  if (filters.channel && entry.channelType !== filters.channel) return false
  return true
}
```

**Migration for existing data (`packages/shared/migrations/`):**

```typescript
// migrations/001-conversation-index-sharding.ts
import type { Migration } from './types'

export const conversationIndexSharding: Migration = {
  version: 1,
  name: 'conversation-index-sharding',
  async run(storage) {
    const oldIndex = await storage.get<Array<{
      id: string
      lastMessageAt: string
      status: string
      channelType: string
      contactHash: string
      assignedTo?: string
      type?: string
    }>>('conv-index')

    if (!oldIndex || oldIndex.length === 0) return

    // Write each entry as its own key
    const puts = new Map<string, unknown>()
    for (const entry of oldIndex) {
      puts.set(`cidx:${entry.lastMessageAt}:${entry.id}`, entry)
      puts.set(`cidx-rev:${entry.id}`, entry.lastMessageAt)
    }

    // Batch write (DO storage supports up to 128 puts per transaction)
    const entries = Array.from(puts.entries())
    for (let i = 0; i < entries.length; i += 128) {
      const batch = new Map(entries.slice(i, i + 128))
      await storage.put(Object.fromEntries(batch))
    }

    // Delete the old monolithic key
    await storage.delete('conv-index')
  },
}
```

### Phase 2: FileIndex Sharding

Same pattern as conversation index. Replace `file-index` with per-file keys:

```
fidx:${status}:${id} → FileIndexEntry
```

### Phase 3: IdentityDO Volunteer Sharding

Replace the monolithic `volunteers` map with per-volunteer keys:

```
# Before:
volunteers → Record<string, Volunteer>

# After:
vol:${pubkey} → Volunteer
vol-list     → string[]  (just pubkey list for enumeration, ~3KB for 100 volunteers)
```

The pubkey list stays small (64 hex chars per entry) and is only used for enumeration. Each volunteer's full data is stored in its own key.

```typescript
// IdentityDO changes
private async getVolunteer(pubkey: string): Promise<Volunteer | undefined> {
  return await this.ctx.storage.get<Volunteer>(`vol:${pubkey}`)
}

private async putVolunteer(vol: Volunteer): Promise<void> {
  await this.ctx.storage.put(`vol:${vol.pubkey}`, vol)

  // Maintain the enumeration list
  const list = await this.ctx.storage.get<string[]>('vol-list') || []
  if (!list.includes(vol.pubkey)) {
    list.push(vol.pubkey)
    await this.ctx.storage.put('vol-list', list)
  }
}

private async getAllVolunteers(): Promise<Volunteer[]> {
  const list = await this.ctx.storage.get<string[]>('vol-list') || []
  if (list.length === 0) return []

  // Batch get — DO storage supports multi-get
  const keys = list.map(pk => `vol:${pk}`)
  const map = await this.ctx.storage.get<Volunteer>(keys)
  return Array.from(map.values()).filter(Boolean)
}
```

### Phase 4: Bounds Checking & Storage Monitoring

Add to all DOs:

```typescript
// apps/worker/lib/storage-monitor.ts

const SIZE_WARNING_THRESHOLD = 100_000 // 100KB — warn before 128KB limit

/**
 * Estimate JSON-serialized size of a value.
 * Used for monitoring, not enforcement (enforcement is structural via sharding).
 */
export function estimateStorageSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size
}

/**
 * Log a warning when a storage key approaches the 128KB limit.
 * Called after writes to keys that could theoretically grow large.
 */
export function checkStorageSize(key: string, value: unknown, namespace: string): void {
  const size = estimateStorageSize(value)
  if (size > SIZE_WARNING_THRESHOLD) {
    console.warn(
      `[storage-monitor] [${namespace}] Key "${key}" is ${(size / 1024).toFixed(1)}KB ` +
      `(${((size / 131072) * 100).toFixed(0)}% of 128KB limit). Consider sharding.`
    )
  }
}

/** Clamp pagination parameters to safe bounds */
export function clampPagination(
  page: string | null,
  limit: string | null,
  maxLimit = 200,
  maxPage = 10000,
): { page: number; limit: number } {
  return {
    page: Math.max(1, Math.min(parseInt(page || '1') || 1, maxPage)),
    limit: Math.max(1, Math.min(parseInt(limit || '50') || 50, maxLimit)),
  }
}
```

Apply `clampPagination` to every route that accepts `page`/`limit` params:
- `apps/worker/durable-objects/conversation-do.ts` — `listConversations()`, `getMessages()`
- `apps/worker/durable-objects/call-router.ts` — `getCallHistory()`
- `apps/worker/durable-objects/records-do.ts` — `getNotes()`
- `apps/worker/durable-objects/blast-do.ts` — `listSubscribers()`, `listBlasts()`

### Phase 5: Invite Cleanup (Quick Win)

Invites array grows unbounded because redeemed/expired invites are never removed. Add cleanup in IdentityDO:

```typescript
// In IdentityDO.alarm():
const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
const now = Date.now()
const active = invites.filter(i =>
  !i.usedAt && new Date(i.expiresAt).getTime() > now
)
if (active.length !== invites.length) {
  await this.ctx.storage.put('invites', active)
}
```

## Files to Modify

- `apps/worker/durable-objects/conversation-do.ts` — sharded index, cursor pagination, bounds checking
- `apps/worker/durable-objects/identity-do.ts` — per-volunteer keys, invite cleanup, bounds checking
- `apps/worker/durable-objects/call-router.ts` — bounds checking on `getCallHistory()`
- `apps/worker/durable-objects/blast-do.ts` — bounds checking on subscriber/blast lists
- `apps/worker/durable-objects/records-do.ts` — bounds checking on note queries
- `apps/worker/durable-objects/settings-do.ts` — bounds checking on hub list
- `apps/worker/lib/storage-monitor.ts` — **new** shared pagination and monitoring utilities
- `packages/shared/migrations/index.ts` — register new migration
- `packages/shared/migrations/001-conversation-index-sharding.ts` — **new** data migration

## Testing

### Unit Tests
- Migration correctly transforms `conv-index` array into per-entry keys
- `clampPagination()` enforces bounds: page=0 becomes 1, limit=9999 becomes 200, NaN becomes defaults
- `estimateStorageSize()` returns reasonable estimates
- `matchesFilters()` correctly applies all filter combinations

### Integration Tests (Playwright)
- Create 100+ conversations, verify pagination returns correct page sizes
- Verify `nextCursor` enables cursor-based traversal
- Verify conversation list still works correctly after migration
- Verify volunteer CRUD still works after per-volunteer sharding
- Verify filtered queries (by status, channel, assignedTo) return correct subsets

### Performance Tests
- Before/after comparison: `listConversations` with 1000 entries should not load all into memory for page 1
- Verify that `storage.list({ prefix: 'cidx:' })` scales linearly with prefix match count, not total storage

## Acceptance Criteria

- [ ] ConversationDO conversation index uses per-entry keys instead of monolithic array
- [ ] ConversationDO file index uses per-file keys instead of monolithic array
- [ ] IdentityDO volunteers stored in per-volunteer keys with lightweight enumeration list
- [ ] All `page`/`limit` parameters are bounds-checked (max limit: 200, max page: 10000)
- [ ] Storage size monitoring logs warnings when keys exceed 100KB
- [ ] Migration transforms existing data without data loss
- [ ] Expired/redeemed invites are pruned in IdentityDO alarm
- [ ] API response format remains backward-compatible (same JSON shape)
- [ ] All existing Playwright tests pass without modification
- [ ] `bun run test:changed` passes

## Risk Assessment

**Risk**: Data migration could fail partway through, leaving the system in an inconsistent state where some entries are in the old format and some in the new.

**Mitigation**: The migration runner tracks version numbers. If a migration fails, it can be re-run safely because:
1. Writing per-entry keys is idempotent (same key = same data)
2. The old `conv-index` key is only deleted after all entries are written
3. The `getIndex()` method can be made to check both formats during the transition

**Risk**: `storage.list()` performance with large prefix sets. CF DO storage uses SQLite internally; prefix scans are B-tree range scans and should be fast up to millions of keys.

**Mitigation**: Benchmark with 10K entries in development. If performance is insufficient, add a secondary index key for count-only queries.
