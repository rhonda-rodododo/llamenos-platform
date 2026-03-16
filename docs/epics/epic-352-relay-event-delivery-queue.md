# Epic 352: Persistent Relay Event Delivery Queue

**Status**: TODO
**Priority**: High
**Depends on**: Epic 310 (publisher reliability cleanup — completed)
**Blocks**: None (but improves reliability for all downstream features using Nostr events)
**Branch**: `desktop`

## Summary

Add persistent event queuing to the Nostr relay publishing pipeline so that events survive relay outages, process restarts, and circuit breaker trips. Currently, relay events are best-effort: the Node.js publisher holds events in an in-memory `pendingEvents` array during short reconnections, but events are lost on process restart or if the relay is down longer than ~17 minutes (10 reconnect attempts with exponential backoff capped at 30s). The CF publisher drops all events immediately when the circuit breaker opens (5 failures in 60s triggers a 30s open window). This epic adds a PostgreSQL-backed outbox table (Node.js) and Cloudflare Queue / DO storage fallback (CF) to guarantee eventual delivery.

## Problem Statement

### Current Behavior

**Node.js platform** (`NodeNostrPublisher` in `apps/worker/lib/nostr-publisher.ts:142-358`):
- In-memory `pendingEvents: VerifiedEvent[]` array holds events during WebSocket reconnection
- Exponential backoff reconnection: 2s, 4s, 8s, ... capped at 30s
- Hard cap: `MAX_RECONNECT_ATTEMPTS = 10` — after ~17 minutes of downtime, the publisher gives up permanently
- Events in `pendingEvents` are lost on process restart (no persistence)
- Events published after the publisher gives up are silently dropped (no error to caller since `publish()` just pushes to the array)

**CF platform** (`CFNostrPublisher` in `apps/worker/lib/nostr-publisher.ts:74-130`):
- Circuit breaker: 5 failures in 60s opens the circuit for 30s
- While open, ALL events are immediately rejected (circuit breaker throws)
- 3 retries with 200ms-2s backoff per attempt, but no queuing between attempts
- Events published during the open window are lost — no retry after circuit closes

### Impact

There are **18 `publishNostrEvent()` call sites** across the codebase:

| File | Count | Has `.catch()` | Event Types |
|------|-------|----------------|-------------|
| `apps/worker/routes/conversations.ts` | 3 | Yes | `message:new`, `conversation:assigned/closed` |
| `apps/worker/routes/records.ts` | 4 | Yes | `record:created`, `record:updated`, `record:assigned/unassigned` |
| `apps/worker/routes/reports.ts` | 3 | Yes | `report:new`, `message:new`, `conversation:assigned` |
| `apps/worker/routes/events.ts` | 2 | Yes | `event:created`, `event:updated` |
| `apps/worker/messaging/router.ts` | 2 | Yes | `message:status`, `conversation:assigned` |
| `apps/worker/durable-objects/call-router.ts` | 6 (via `publishEvent()`) | Yes (wrapper) | `call:ring`, `call:update`, `voicemail:new`, `presence:summary`, `contact:identified` |
| `apps/worker/routes/dev.ts` | 2 | Yes (silent) | Test simulation events |

All call sites have `.catch()` handlers (added in Epic 310), so failures are logged. But logging is not delivery — a missed `call:ring` event means a volunteer never sees an incoming call. A missed `record:created` event means a case record silently fails to appear in real-time views until the next poll/refresh.

### Root Cause

The publisher was designed for best-effort notification delivery. Epic 282 explicitly deferred queuing: "relay events are best-effort; queuing is not implemented — events that fail all retries are logged and dropped." Now that the relay pipeline is stable (Epics 306, 307, 310), persistent queuing is the natural next step.

## Architecture

### Node.js: PostgreSQL Outbox Pattern

```
publish() → INSERT into outbox → attempt WebSocket send
                                    ↓ success → UPDATE status='delivered'
                                    ↓ failure → UPDATE attempts++, next_retry_at

AlarmPoller (30s) → SELECT pending WHERE next_retry_at <= NOW()
                     → attempt delivery for each
                     → mark delivered/failed

Startup → drain outbox (pending events from previous process life)
```

### CF: Cloudflare Queues with DO Storage Fallback

```
publish() → if RELAY_QUEUE binding → enqueue (Queue handles retries)
          → else → insert into SettingsDO storage (mini-outbox)
          → fallback → current behavior (circuit breaker, best-effort)
```

## Implementation

### Phase 1: PostgreSQL Outbox Table

**File**: `src/platform/node/storage/postgres-pool.ts`

Add the outbox table creation alongside existing `kv_store` and `alarms` tables in `initPostgresPool()`:

```typescript
await pool`
  CREATE TABLE IF NOT EXISTS nostr_event_outbox (
    id          SERIAL PRIMARY KEY,
    event_json  JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts    INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      TEXT NOT NULL DEFAULT 'pending',
    last_error  TEXT
  )
`
await pool`
  CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON nostr_event_outbox (next_retry_at)
  WHERE status = 'pending'
`
await pool`
  CREATE INDEX IF NOT EXISTS idx_outbox_ttl
  ON nostr_event_outbox (status, created_at)
  WHERE status IN ('delivered', 'failed')
`
```

**Design decisions**:
- `event_json` stores the fully signed `VerifiedEvent` (already encrypted via `encryptHubEvent`). The outbox just persists and retries — no re-signing or re-encryption needed.
- `last_error` stores the most recent failure message for debugging.
- Partial indexes on `status` keep the index small — most rows will be `delivered` or cleaned up.
- No separate migration file — this follows the existing pattern of table creation in `initPostgresPool()` with `CREATE TABLE IF NOT EXISTS`. The `kv_store` and `alarms` tables use the same pattern.

### Phase 2: Outbox Service

**File**: `src/platform/node/storage/outbox.ts` (new)

```typescript
import { getPool } from '../../../src/platform/node/storage/postgres-pool'

export interface OutboxConfig {
  maxAttempts: number        // Default: 10
  deliveredTtlMs: number     // Default: 1 hour
  failedTtlMs: number        // Default: 24 hours
  batchSize: number          // Default: 50
}

const DEFAULT_CONFIG: OutboxConfig = {
  maxAttempts: 10,
  deliveredTtlMs: 60 * 60 * 1000,         // 1 hour
  failedTtlMs: 24 * 60 * 60 * 1000,       // 24 hours
  batchSize: 50,
}

export class EventOutbox {
  private config: OutboxConfig

  constructor(config?: Partial<OutboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Insert a signed event into the outbox. Returns the outbox row ID. */
  async enqueue(event: VerifiedEvent): Promise<number> {
    const sql = getPool()
    const [row] = await sql`
      INSERT INTO nostr_event_outbox (event_json)
      VALUES (${sql.json(event)})
      RETURNING id
    `
    return row.id
  }

  /** Mark an event as successfully delivered. */
  async markDelivered(id: number): Promise<void> {
    const sql = getPool()
    await sql`
      UPDATE nostr_event_outbox
      SET status = 'delivered'
      WHERE id = ${id}
    `
  }

  /** Record a delivery failure. Calculates next retry with exponential backoff. */
  async markFailed(id: number, error: string): Promise<void> {
    const sql = getPool()
    // Exponential backoff: 2^attempts * 1000ms, capped at 5 minutes
    await sql`
      UPDATE nostr_event_outbox
      SET
        attempts = attempts + 1,
        last_error = ${error},
        status = CASE
          WHEN attempts + 1 >= ${this.config.maxAttempts} THEN 'failed'
          ELSE 'pending'
        END,
        next_retry_at = NOW() + (LEAST(POWER(2, attempts + 1), 300) || ' seconds')::interval
      WHERE id = ${id}
    `
  }

  /** Fetch pending events ready for retry, oldest first. Uses FOR UPDATE SKIP LOCKED for concurrency. */
  async drainBatch(): Promise<Array<{ id: number; event: VerifiedEvent }>> {
    const sql = getPool()
    const rows = await sql.begin(async (tx: any) => {
      return await tx`
        SELECT id, event_json
        FROM nostr_event_outbox
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY created_at ASC
        LIMIT ${this.config.batchSize}
        FOR UPDATE SKIP LOCKED
      `
    })
    return rows.map((r: any) => ({ id: r.id, event: r.event_json as VerifiedEvent }))
  }

  /** Delete delivered events older than TTL and failed events older than their TTL. */
  async cleanup(): Promise<number> {
    const sql = getPool()
    const deliveredCutoff = new Date(Date.now() - this.config.deliveredTtlMs)
    const failedCutoff = new Date(Date.now() - this.config.failedTtlMs)
    const result = await sql`
      DELETE FROM nostr_event_outbox
      WHERE
        (status = 'delivered' AND created_at < ${deliveredCutoff})
        OR (status = 'failed' AND created_at < ${failedCutoff})
    `
    return result.count
  }

  /** Get outbox statistics for metrics/monitoring. */
  async stats(): Promise<{ pending: number; delivered: number; failed: number }> {
    const sql = getPool()
    const rows = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM nostr_event_outbox
      GROUP BY status
    `
    const result = { pending: 0, delivered: 0, failed: 0 }
    for (const row of rows) {
      if (row.status in result) {
        result[row.status as keyof typeof result] = row.count
      }
    }
    return result
  }
}
```

**Design decisions**:
- `FOR UPDATE SKIP LOCKED` prevents duplicate delivery across replicas (same pattern as alarm poller).
- Exponential backoff capped at 5 minutes: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s, 300s.
- 10 attempts = ~20 minutes of retries before marking `failed`. This covers relay restarts, brief network partitions, and strfry reindexing.
- `sql.json(event)` for JSONB insertion — per MEMORY.md, never use `JSON.stringify()` with postgres.js.

### Phase 3: NodeNostrPublisher Outbox Integration

**File**: `apps/worker/lib/nostr-publisher.ts`

Modify `NodeNostrPublisher` to accept an optional `EventOutbox` and use it for persistence:

```typescript
export class NodeNostrPublisher implements NostrPublisher {
  // ... existing fields ...
  private outbox: EventOutbox | null = null

  constructor(
    private readonly relayUrl: string,
    serverSecret: string,
  ) {
    // ... existing keypair derivation ...
  }

  /** Attach a persistent outbox. Call after construction, before publishing. */
  setOutbox(outbox: EventOutbox): void {
    this.outbox = outbox
  }

  async publish(template: EventTemplate): Promise<void> {
    const event = signServerEvent(template, this.secretKey)

    if (this.outbox) {
      // Persistent path: insert into outbox, attempt immediate delivery
      const outboxId = await this.outbox.enqueue(event)
      try {
        if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
          await this.sendAndAwaitOk(event)
          await this.outbox.markDelivered(outboxId)
          return
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await this.outbox.markFailed(outboxId, message)
      }
      // Event is persisted in outbox — will be retried by drain loop
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch(() => {})
      }
      return
    }

    // Non-persistent fallback (original behavior)
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      return this.sendAndAwaitOk(event)
    }
    this.pendingEvents.push(event)
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect().catch(() => {})
    }
  }

  /** Drain outbox: attempt delivery for all pending events. Called by poller. */
  async drainOutbox(): Promise<void> {
    if (!this.outbox) return
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) return

    const batch = await this.outbox.drainBatch()
    for (const { id, event } of batch) {
      try {
        await this.sendAndAwaitOk(event)
        await this.outbox.markDelivered(id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await this.outbox.markFailed(id, message)
      }
    }
  }
}
```

**Key changes**:
- `publish()` with outbox: INSERT first, attempt send, mark result. Event is persisted regardless of send outcome.
- `publish()` without outbox: unchanged behavior (in-memory `pendingEvents`). This keeps CF platform and test scenarios working identically.
- `drainOutbox()` is the public method called by the poller.
- Remove `MAX_RECONNECT_ATTEMPTS` cap when outbox is present — the outbox handles persistence, so the publisher should always try to reconnect. The cap remains when no outbox is configured.

### Phase 4: Outbox Drain Poller

**File**: `src/platform/node/storage/outbox-poller.ts` (new)

```typescript
import type { NodeNostrPublisher } from '../../../apps/worker/lib/nostr-publisher'
import type { EventOutbox } from '../../../apps/worker/lib/outbox'

const DRAIN_INTERVAL_MS = 30_000
const CLEANUP_INTERVAL_MS = 300_000  // 5 minutes

let drainTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null

export function startOutboxPoller(publisher: NodeNostrPublisher, outbox: EventOutbox): void {
  if (drainTimer) return

  // Initial drain after 3s (pick up events from previous process life)
  setTimeout(() => drainOutbox(publisher, outbox), 3000)

  drainTimer = setInterval(() => drainOutbox(publisher, outbox), DRAIN_INTERVAL_MS)
  cleanupTimer = setInterval(() => cleanupOutbox(outbox), CLEANUP_INTERVAL_MS)

  console.log(`[outbox-poller] Started (drain: ${DRAIN_INTERVAL_MS / 1000}s, cleanup: ${CLEANUP_INTERVAL_MS / 1000}s)`)
}

export function stopOutboxPoller(): void {
  if (drainTimer) {
    clearInterval(drainTimer)
    drainTimer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  console.log('[outbox-poller] Stopped')
}

async function drainOutbox(publisher: NodeNostrPublisher, outbox: EventOutbox): Promise<void> {
  try {
    await publisher.drainOutbox()
  } catch (err) {
    console.error('[outbox-poller] Drain error:', err)
  }
}

async function cleanupOutbox(outbox: EventOutbox): Promise<void> {
  try {
    const deleted = await outbox.cleanup()
    if (deleted > 0) {
      console.log(`[outbox-poller] Cleaned up ${deleted} expired events`)
    }
  } catch (err) {
    console.error('[outbox-poller] Cleanup error:', err)
  }
}
```

### Phase 5: Wire Outbox into Node.js Startup

**File**: `src/platform/node/env.ts`

After the Nostr publisher is created, attach the outbox:

```typescript
import { EventOutbox } from '../../../apps/worker/lib/outbox'
import { startOutboxPoller } from './storage/outbox-poller'

// In createNodeEnv(), after env is created and publisher is cached:
export async function createNodeEnv(): Promise<Record<string, unknown>> {
  // ... existing setup ...

  // Start alarm poller
  startAlarmPoller(storageInstances)

  // Wire outbox to Nostr publisher if relay is configured
  if (env.SERVER_NOSTR_SECRET && env.NOSTR_RELAY_URL) {
    const { createNostrPublisher } = await import('../../../apps/worker/lib/nostr-publisher')
    const { NodeNostrPublisher } = await import('../../../apps/worker/lib/nostr-publisher')
    const publisher = createNostrPublisher(env)
    if (publisher instanceof NodeNostrPublisher) {
      const outbox = new EventOutbox()
      publisher.setOutbox(outbox)
      startOutboxPoller(publisher, outbox)
    }
  }

  return env
}
```

**Note**: Uses `createNostrPublisher(env)` directly instead of `getNostrPublisher()` to avoid `as any` type cast. The `env` object from `createNodeEnv()` is already properly typed for `createNostrPublisher`.

### Phase 6: Outbox Metrics

**File**: `apps/worker/routes/metrics.ts`

Add outbox metrics to the existing Prometheus-format metrics endpoint:

```typescript
// In the metrics handler, after circuit breaker metrics:
if (isNodePlatform) {
  try {
    const { EventOutbox } = await import('../lib/outbox')
    const outbox = new EventOutbox()
    const stats = await outbox.stats()
    lines.push('# HELP llamenos_outbox_events Nostr event outbox queue depth')
    lines.push('# TYPE llamenos_outbox_events gauge')
    lines.push(`llamenos_outbox_events{status="pending"} ${stats.pending}`)
    lines.push(`llamenos_outbox_events{status="delivered"} ${stats.delivered}`)
    lines.push(`llamenos_outbox_events{status="failed"} ${stats.failed}`)
  } catch {
    // Outbox not available (CF platform)
  }
}
```

### Phase 7: CF Platform Queue (Optional Enhancement)

**File**: `apps/worker/lib/nostr-publisher.ts`

If `RELAY_QUEUE` binding exists (Cloudflare Queues), use it as a persistent outbox for the CF platform:

```typescript
export class CFNostrPublisher implements NostrPublisher {
  constructor(
    private readonly relayBinding: { fetch(request: Request): Promise<Response> },
    serverSecret: string,
    private readonly relayQueue?: Queue,
  ) {
    // ... existing keypair derivation ...
  }

  async publish(template: EventTemplate): Promise<void> {
    const event = signServerEvent(template, this.secretKey)

    const breaker = getCircuitBreaker({
      name: 'nostr:relay',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    })

    try {
      await breaker.execute(() =>
        withRetry(/* ... existing retry logic ... */)
      )
    } catch (err) {
      // Circuit open or retries exhausted — fall back to queue
      if (this.relayQueue) {
        await this.relayQueue.send({
          event: JSON.stringify(event),
          enqueuedAt: Date.now(),
        })
        return  // Queued for later delivery
      }
      throw err  // No queue — propagate failure
    }
  }
}
```

**Queue consumer** (new file `apps/worker/queue-consumer.ts`):

```typescript
export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const publisher = getNostrPublisher(env)
    for (const message of batch.messages) {
      try {
        const { event } = message.body as { event: string }
        const parsed = JSON.parse(event) as VerifiedEvent
        // Direct relay publish — bypasses circuit breaker since Queue already handles retries
        await directRelayPublish(env.NOSFLARE, parsed)
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
}
```

**Wrangler config** (`apps/worker/wrangler.jsonc`):

```jsonc
{
  "queues": {
    "producers": [{ "queue": "relay-events", "binding": "RELAY_QUEUE" }],
    "consumers": [{ "queue": "relay-events", "max_retries": 10, "max_batch_size": 50 }]
  }
}
```

**Note**: This phase is optional. If Cloudflare Queues are not available (cost, region, plan limitations), the CF publisher keeps its current best-effort behavior with circuit breaker. The queue is a "nice to have" that can be enabled by adding the binding.

### Phase 8: Remove Reconnect Cap When Outbox Present

**File**: `apps/worker/lib/nostr-publisher.ts`

```typescript
private scheduleReconnect(): void {
  if (this.closed || this.reconnectTimer) return

  this.reconnectAttempts++

  // With outbox persistence, always try to reconnect — events are safe in PG.
  // Without outbox, keep the cap to avoid infinite retry on dead relays.
  if (!this.outbox && this.reconnectAttempts > NodeNostrPublisher.MAX_RECONNECT_ATTEMPTS) {
    console.error(`[nostr-publisher] Max reconnect attempts (${NodeNostrPublisher.MAX_RECONNECT_ATTEMPTS}) reached, giving up`)
    return
  }

  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000)
  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null
    this.connect().catch((err) => {
      console.error('[nostr-publisher] Reconnect failed:', err)
    })
  }, delay)
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/platform/node/storage/outbox.ts` | EventOutbox service — PostgreSQL-backed persistent event queue |
| `src/platform/node/storage/outbox-poller.ts` | Background poller for outbox drain + TTL cleanup |
| `apps/worker/queue-consumer.ts` | CF Queue consumer for relay event delivery (Phase 7, optional) |

## Files to Modify

| File | Change |
|------|--------|
| `src/platform/node/storage/postgres-pool.ts` | Add `nostr_event_outbox` table + indexes in `initPostgresPool()` |
| `apps/worker/lib/nostr-publisher.ts` | Add `setOutbox()`, modify `publish()` for persistent path, add `drainOutbox()`, conditionally remove reconnect cap |
| `src/platform/node/env.ts` | Wire `EventOutbox` to `NodeNostrPublisher`, start outbox poller |
| `apps/worker/routes/metrics.ts` | Add outbox queue depth metrics |
| `apps/worker/wrangler.jsonc` | (Optional Phase 7) Add Queue producer/consumer bindings |

## Security Considerations

- **Outbox events are already encrypted**: `publishNostrEvent()` encrypts content with XChaCha20-Poly1305 via `encryptHubEvent()` before the signed event reaches the publisher. The outbox stores the fully signed, encrypted `VerifiedEvent`. No plaintext PII is persisted.
- **PostgreSQL at-rest encryption**: The outbox table benefits from the same disk encryption as `kv_store`.
- **TTL prevents unbounded growth**: Delivered events are cleaned up after 1 hour, failed events after 24 hours. An attacker who DoS's the relay cannot fill the database — the outbox is capped at ~50 events per drain batch, and the 10-attempt limit ensures rows transition to `failed` within ~20 minutes.
- **`FOR UPDATE SKIP LOCKED`**: Prevents double-delivery in multi-replica deployments (same pattern as alarm poller).
- **No new secrets or credentials**: The outbox uses the existing PostgreSQL connection pool.

## Testing

### Unit Tests

**File**: `apps/worker/__tests__/unit/outbox.test.ts` (new)

- `enqueue inserts event with pending status`
- `markDelivered updates status to delivered`
- `markFailed increments attempts and sets next_retry_at`
- `markFailed marks as failed after maxAttempts`
- `drainBatch returns only pending events where next_retry_at <= NOW()`
- `drainBatch respects batch size limit`
- `cleanup deletes expired delivered and failed events`
- `cleanup does not delete pending events`

**File**: `apps/worker/__tests__/unit/nostr-publisher.test.ts` (modified)

- `publish with outbox persists event before attempting send`
- `publish with outbox marks delivered on success`
- `publish with outbox marks failed on send error`
- `publish with outbox queues event when disconnected (no exception)`
- `drainOutbox delivers pending events from outbox`
- `drainOutbox marks failed events on relay rejection`
- `scheduleReconnect does not cap attempts when outbox is present`
- `scheduleReconnect caps attempts when no outbox`

### BDD Scenarios

**File**: `packages/test-specs/features/core/relay-event-outbox.feature` (new)

```gherkin
Feature: Relay Event Delivery Queue
  As an admin
  I want relay events to survive outages
  So that volunteers never miss call notifications

  Background:
    Given a running backend with relay configured

  Scenario: Events are delivered after relay outage
    Given the relay is unreachable
    When a new record is created via the API
    Then the event is persisted in the outbox with status "pending"
    When the relay becomes reachable
    And the outbox poller runs
    Then the event is delivered to the relay
    And the outbox entry status is "delivered"

  Scenario: Outbox survives process restart
    Given the relay is unreachable
    When a new record is created via the API
    Then the event is persisted in the outbox with status "pending"
    When the server process restarts
    And the relay is reachable
    And the outbox poller runs
    Then the event is delivered to the relay

  Scenario: Failed events are cleaned up after TTL
    Given an outbox event with status "delivered" created 2 hours ago
    And an outbox event with status "failed" created 25 hours ago
    And an outbox event with status "pending" created 1 hour ago
    When the outbox cleanup runs
    Then the delivered event is deleted
    And the failed event is deleted
    And the pending event is retained

  Scenario: Events exhaust retry attempts
    Given the relay rejects all events
    When a new record is created via the API
    And the outbox poller runs 10 times
    Then the outbox entry status is "failed"
    And the last_error contains the rejection reason

  Scenario: Outbox metrics are reported
    Given 3 pending events and 5 delivered events in the outbox
    When I request GET /metrics
    Then the response contains 'llamenos_outbox_events{status="pending"} 3'
    And the response contains 'llamenos_outbox_events{status="delivered"} 5'
```

**File**: `tests/steps/backend/relay-event-outbox.steps.ts` (new)

Backend step definitions using the Node.js test backend (Docker Compose), with direct PostgreSQL access to verify outbox state and a mock relay (WebSocket server) to simulate outages.

### Integration Test Strategy

The BDD tests require:
1. **Mock relay**: A simple WebSocket server that can be started/stopped to simulate outages. Use the existing `WebSocketServer` from the `ws` package (already a dev dependency for publisher tests).
2. **Direct PostgreSQL access**: Query `nostr_event_outbox` table to verify persistence. The test backend already has `DATABASE_URL` configured.
3. **Process restart simulation**: For the "survives restart" scenario, insert an event via direct SQL, then verify the outbox poller picks it up after the server starts.

## Acceptance Criteria

- [ ] `nostr_event_outbox` table is created automatically on Node.js startup
  -> `src/platform/node/storage/postgres-pool.ts` contains `CREATE TABLE IF NOT EXISTS nostr_event_outbox`
- [ ] Events are persisted to outbox before WebSocket send attempt
  -> Unit test: `publish with outbox persists event before attempting send`
- [ ] Successful delivery marks event as `delivered`
  -> Unit test: `publish with outbox marks delivered on success`
- [ ] Failed delivery increments `attempts` and sets `next_retry_at` with exponential backoff
  -> Unit test: `markFailed increments attempts and sets next_retry_at`
- [ ] Events marked `failed` after 10 unsuccessful attempts
  -> Unit test: `markFailed marks as failed after maxAttempts`
- [ ] Outbox poller drains pending events every 30 seconds
  -> BDD: "Events are delivered after relay outage"
- [ ] Outbox cleanup deletes delivered events after 1 hour and failed events after 24 hours
  -> BDD: "Failed events are cleaned up after TTL"
- [ ] Startup drains outbox events from previous process life
  -> BDD: "Outbox survives process restart"
- [ ] Reconnect cap removed when outbox is present (always reconnects)
  -> Unit test: `scheduleReconnect does not cap attempts when outbox is present`
- [ ] Outbox queue depth exposed in Prometheus metrics
  -> BDD: "Outbox metrics are reported"
- [ ] CF Queue integration works when `RELAY_QUEUE` binding exists (optional)
  -> Manual verification or staging test
- [ ] No behavior change when outbox is not configured (CF platform, tests)
  -> Existing publisher tests continue to pass unchanged
- [ ] All existing BDD suites pass (`bun run test:all`)

## Execution Order

1. **Phase 1**: PostgreSQL table creation (foundation — everything depends on this)
2. **Phase 2**: EventOutbox service (pure data access, no side effects — easy to unit test)
3. **Phase 3**: NodeNostrPublisher integration (core behavior change — needs Phase 2)
4. **Phase 4**: Outbox poller (needs Phase 2 + 3)
5. **Phase 5**: Wire into env.ts (needs Phase 3 + 4)
6. **Phase 6**: Metrics (needs Phase 2, can be parallel with 3-5)
7. **Phase 7**: CF Queue (independent of 1-6, optional)
8. **Phase 8**: Reconnect cap conditional (needs Phase 3)

Phases 1-5 are sequential. Phase 6 can be done in parallel with 3-5. Phase 7 is independent. Phase 8 is a small change that goes with Phase 3.

## Risk Assessment

- **Low risk**: Phases 1, 2, 6 — table creation, pure data service, metrics. No behavior change.
- **Medium risk**: Phase 3 — modifying `publish()` behavior. Mitigated by: outbox is opt-in (`setOutbox()`), non-outbox path is unchanged, comprehensive unit tests.
- **Low risk**: Phases 4, 5 — poller and wiring. Follows the exact same pattern as the existing alarm poller.
- **Low risk**: Phase 7 — CF Queue is additive and behind a feature flag (binding existence check).
- **Low risk**: Phase 8 — reconnect cap removal is conditional on outbox presence.
- **Data growth**: Outbox table could grow if relay is down for extended periods. Mitigated by: 10-attempt cap (rows transition to `failed` in ~20 minutes), TTL cleanup every 5 minutes. Worst case with 100 events/minute relay downtime: 2,000 pending rows after 20 minutes, all transitioning to `failed` and cleaned up within 24 hours.
