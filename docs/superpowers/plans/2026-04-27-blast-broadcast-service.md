# Plan: Blast/Broadcast Delivery Service

**Spec**: `docs/superpowers/specs/2026-04-27-blast-broadcast-service.md`

## Prerequisites

- Existing `BlastsService` with subscriber CRUD, blast CRUD, keyword handling
- `MessagingAdapter` interface with `sendMessage()`/`sendMediaMessage()`
- `nostr-outbox-poller.ts` as reference for background poller pattern
- `TaskScheduler` stub ready to wire up

## Implementation Steps

### Step 1: Schema — Add `blast_deliveries` Table and Column Extensions

**Files**:
- `apps/worker/db/schema/blasts.ts`

**Changes**:
1. Add `blastDeliveries` pgTable with columns: id, blastId, subscriberId, channelType, status, attempts, maxAttempts, nextAttemptAt, error, externalId, sentAt, deliveredAt, createdAt
2. Add `encryptedIdentifier` column to `subscribers` table
3. Add `localizedContent` JSONB column to `blasts` table (defaults to `'{}'::jsonb`)
4. Add relations: `blastDeliveries` → `blasts`, `blastDeliveries` → `subscribers`
5. Add indexes: `blast_deliveries_pending_idx` (nextAttemptAt WHERE status IN pending/sending), `blast_deliveries_blast_id_idx`

**Verification**: `bun run typecheck` passes

---

### Step 2: Shared Types — Extend Blast Types

**Files**:
- `packages/shared/types.ts`
- `packages/shared/nostr-events.ts`

**Changes**:
1. Add `LocalizedBlastContent` type: `Record<string, BlastContent>`
2. Add `BlastDelivery` interface: `{ id, blastId, subscriberId, channelType, status, attempts, maxAttempts, nextAttemptAt, error?, externalId?, sentAt?, deliveredAt?, createdAt }`
3. Add `BlastDeliveryStatus` type: `'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'opted_out' | 'cancelled'`
4. Extend `BlastSettings` with `rateLimits?: Record<MessagingChannelType, { rate: number; burst: number }>`
5. Extend `BlastStats` with `pending?: number`
6. Add `KIND_BLAST_PROGRESS = 20010` to nostr-events.ts

**Verification**: `bun run typecheck` passes

---

### Step 3: Token Bucket Rate Limiter

**Files**:
- `apps/worker/services/blast-rate-limiter.ts` (new)

**Changes**:
1. Implement `TokenBucket` class: `{ tokens: number, lastRefill: number, rate: number, burst: number }`
2. Method `tryConsume(): boolean` — refill based on elapsed time, consume 1 token if available
3. Implement `BlastRateLimiter` class with a `Map<string, TokenBucket>` keyed by `${hubId}:${channelType}`
4. Method `canSend(hubId: string, channelType: MessagingChannelType): boolean`
5. Method `consume(hubId: string, channelType: MessagingChannelType): boolean`
6. Method `configure(hubId: string, channelType: MessagingChannelType, rate: number, burst: number): void`
7. Default rates: SMS=1/s burst 5, WhatsApp=10/s burst 20, Signal=5/s burst 10, RCS=3/s burst 6

**Verification**: Unit-testable in isolation. `bun run typecheck` passes.

---

### Step 4: Blast Expansion Logic

**Files**:
- `apps/worker/services/blasts.ts`

**Changes**:
1. Add `expandBlast(blastId: string, hubId: string): Promise<number>` method
   - Query matching subscribers (active, verified channel, tag/language overlap) in batches of 500
   - For each subscriber, determine target channel via `selectChannel()` logic
   - Batch INSERT into `blast_deliveries` with status `pending`, `nextAttemptAt = NOW()`
   - Return total delivery count
2. Modify `send()` to call `expandBlast()` after validation and before returning
3. Add `getDeliveryStats(blastId: string): Promise<BlastStats & { pending: number }>` — aggregate counts by status from `blast_deliveries`
4. Add `cancelDeliveries(blastId: string): Promise<number>` — UPDATE pending/sending deliveries to cancelled
5. Modify `cancel()` to call `cancelDeliveries()`
6. Add `getDeliveries(blastId: string, options: { status?: string, limit?: number, offset?: number }): Promise<BlastDelivery[]>`

**Verification**: `bun run typecheck` passes

---

### Step 5: Delivery Poller

**Files**:
- `apps/worker/services/blast-delivery-poller.ts` (new)

**Changes**:
1. Implement `BlastDeliveryPoller` class (following `nostr-outbox-poller.ts` pattern)
2. Constructor takes: `db: Database`, `messagingAdapters: Map<MessagingChannelType, MessagingAdapter>`, `rateLimiter: BlastRateLimiter`, `blastsService: BlastsService`, `nostrPublisher?`
3. `start()`: set up two intervals:
   - Active delivery drain: every 5 seconds
   - Scheduled blast check: every 60 seconds
4. `stop()`: clear intervals
5. `drainDeliveries()`:
   - SELECT from `blast_deliveries` WHERE `status IN ('pending')` AND `nextAttemptAt <= NOW()` ORDER BY `nextAttemptAt` LIMIT 50
   - For each delivery:
     a. Check blast status (if cancelled, mark delivery cancelled, skip)
     b. Mid-flight opt-out check: query subscriber status
     c. Rate limiter check: `rateLimiter.canSend()` — if false, skip (leave pending)
     d. Consume rate limit token
     e. Resolve content: check `localizedContent[subscriber.language]` falling back to `content`
     f. Decrypt subscriber identifier (from `encryptedIdentifier` using hub key)
     g. Update delivery status to `sending`
     h. Call `adapter.sendMessage({ recipientIdentifier, body, conversationId: blastId })`
     i. On success: update delivery to `sent`, set `externalId`, `sentAt`, increment blast stats
     j. On failure: increment attempts, compute `nextAttemptAt` with exponential backoff, set error
     k. If attempts >= maxAttempts: mark `failed`
   - After batch: check if blast is complete (no pending deliveries remaining)
   - If complete: update blast status to `sent`
   - Publish `KIND_BLAST_PROGRESS` event every 10 deliveries and on completion
6. `checkScheduledBlasts()`:
   - SELECT blasts WHERE `status = 'scheduled'` AND `scheduledAt <= NOW()`
   - For each: call `blastsService.expandBlast()` and update status to `sending`

**Verification**: `bun run typecheck` passes

---

### Step 6: Wire Up TaskScheduler

**Files**:
- `apps/worker/services/scheduler.ts`

**Changes**:
1. Add constructor params: `BlastDeliveryPoller` instance
2. `start()`: call `blastDeliveryPoller.start()`
3. `stop()`: call `blastDeliveryPoller.stop()`

**Verification**: `bun run typecheck` passes

---

### Step 7: Service Factory Wiring

**Files**:
- `apps/worker/services/index.ts`
- `apps/worker/lib/service-factories.ts` (if poller/rate limiter need factory registration)

**Changes**:
1. Export `BlastDeliveryPoller` and `BlastRateLimiter` from services index
2. Instantiate `BlastRateLimiter` in the service initialization
3. Instantiate `BlastDeliveryPoller` with dependencies
4. Pass poller to `TaskScheduler`
5. Ensure `TaskScheduler.start()` is called on server boot

**Verification**: `bun run typecheck` passes, server starts without errors

---

### Step 8: Delivery Status Webhook Correlation

**Files**:
- `apps/worker/messaging/router.ts`

**Changes**:
1. In the status webhook handler path (where `parseStatusWebhook()` is called):
   - After updating conversation message status, also check `blast_deliveries` by `externalId`
   - If found: update delivery status to `delivered`, set `deliveredAt`
   - Update blast stats (`delivered++`)
2. Add helper function `correlateBlastDeliveryStatus(externalId: string, status: MessageDeliveryStatus)`

**Verification**: `bun run typecheck` passes

---

### Step 9: API Route Additions

**Files**:
- `apps/worker/routes/blasts.ts` (existing blast routes file)

**Changes**:
1. `GET /api/blasts/:id/deliveries` — paginated delivery list with optional status filter
2. `GET /api/blasts/:id/stats` — real-time stats (calls `getDeliveryStats()`)
3. Ensure existing `POST /api/blasts/:id/send` wires through to the new `expandBlast()` flow
4. Ensure `POST /api/blasts/:id/cancel` wires through delivery cancellation

**Verification**: `bun run typecheck` passes

---

### Step 10: Database Migration

**Files**:
- `apps/worker/db/migrations/` (new migration file via `drizzle-kit generate`)

**Changes**:
1. Run `bunx drizzle-kit generate` to create migration for:
   - `blast_deliveries` table creation
   - `subscribers.encrypted_identifier` column addition
   - `blasts.localized_content` column addition
2. Verify migration SQL is correct
3. Run migration locally: `bunx drizzle-kit push` or `bun run db:migrate`

**Verification**: Migration applies cleanly against local dev database

---

### Step 11: Integration Testing

**Files**:
- `apps/worker/services/__tests__/blast-delivery.test.ts` (new, if test dir exists) or verify via BDD

**Verification**:
1. `bun run typecheck` — full type check passes
2. `bun run dev:server` — server starts, poller initializes
3. Manual/BDD test: create blast → send → verify deliveries expand → verify poller picks them up
4. `bun run test:backend:bdd` — existing blast BDD tests still pass (regression check)

---

## Dependency Order

```
Step 1 (schema) 
  → Step 2 (types) — can run in parallel with Step 1
  → Step 3 (rate limiter) — no deps on 1/2
  → Step 4 (expansion) — depends on 1, 2
  → Step 5 (poller) — depends on 1, 2, 3, 4
  → Step 6 (scheduler) — depends on 5
  → Step 7 (wiring) — depends on 3, 5, 6
  → Step 8 (webhooks) — depends on 1
  → Step 9 (routes) — depends on 4
  → Step 10 (migration) — depends on 1
  → Step 11 (testing) — depends on all
```

Parallelizable: Steps 1+2+3 can all proceed simultaneously. Steps 8+9 can proceed in parallel after Step 4.

## Risk Mitigations

- **Large subscriber lists**: Batch expansion (500/batch) prevents transaction timeouts
- **Server restart during blast**: Poller resumes from `blast_deliveries` — pending rows with `nextAttemptAt <= NOW()` are immediately re-picked
- **Provider outage**: Exponential backoff + max attempts prevents infinite retry loops; blast stays in `sending` until manually cancelled or all deliveries resolve
- **Race condition on cancellation**: Poller checks blast status before each send; cancelled blast's deliveries are bulk-updated to `cancelled`
- **Memory pressure from rate limiter maps**: Buckets are lightweight (3 numbers each); even 100 hubs × 4 channels = 400 buckets = negligible
