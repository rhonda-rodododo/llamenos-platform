# Spec: Blast/Broadcast Delivery Service

## Summary

Implement a PostgreSQL-backed job queue for reliable blast message delivery. When a blast is sent, matching subscribers are expanded into individual `blast_deliveries` rows. A background poller picks up pending deliveries in batches and sends them through MessagingAdapter, with per-channel token bucket rate limiting, exponential backoff retries, mid-flight opt-out checks, per-language content selection, and real-time stats broadcast via Nostr events.

## Current State

- `BlastsService` has subscriber CRUD, keyword handling, blast CRUD, settings, and a stub `processActiveBlasts()` that just marks all sending blasts as "sent" without actually delivering anything
- Schema has `subscribers`, `blasts`, `blastSettings` tables but no delivery tracking
- `MessagingAdapter` interface provides `sendMessage()` and `sendMediaMessage()`
- `TaskScheduler` is an empty stub class with `start()`/`stop()` methods
- Outbox poller pattern (interval + batch drain) already proven in `nostr-outbox-poller.ts`
- v1 reference has a `blast_deliveries` table and delivery CRUD but no rate limiter or retry logic

## Architecture

### Component Diagram

```
[BlastsService.send()] 
    → expandBlast() → INSERT blast_deliveries (one per subscriber×channel)
    → update blast status → 'sending'

[BlastDeliveryPoller] (setInterval, 5s for active, 60s for scheduled check)
    → SELECT pending/retrying deliveries WHERE nextAttemptAt <= NOW() (batch of 50)
    → for each delivery:
        1. Mid-flight opt-out check (subscriber still active?)
        2. Rate limiter check (token bucket per channel type)
        3. Resolve localized content for subscriber language
        4. Send via MessagingAdapter
        5. Update delivery status (sent/failed/opted_out)
        6. Increment blast stats
    → when all deliveries complete → blast status → 'sent'

[Scheduled Blast Check] (60s interval)
    → SELECT blasts WHERE status='scheduled' AND scheduledAt <= NOW()
    → trigger expandBlast() for each → sets status to 'sending'
```

### Schema: `blast_deliveries` Table

```sql
CREATE TABLE blast_deliveries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id TEXT NOT NULL REFERENCES blasts(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,              -- 'sms' | 'whatsapp' | 'signal' | 'rcs'
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sending | sent | delivered | failed | opted_out | cancelled
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT,
  external_id TEXT,                        -- provider message ID for delivery tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX blast_deliveries_pending_idx ON blast_deliveries (next_attempt_at) WHERE status IN ('pending', 'sending');
CREATE INDEX blast_deliveries_blast_id_idx ON blast_deliveries (blast_id);
```

### Schema Additions to `subscribers` Table

Add `encryptedIdentifier` column (already exists in v1):
```sql
ALTER TABLE subscribers ADD COLUMN encrypted_identifier TEXT;
```

The `encryptedIdentifier` stores the ECIES-wrapped PII (phone number / identifier) encrypted with the hub key. The server needs to decrypt this at send time to pass to the messaging adapter. This means the hub key must be available to the server during blast delivery (it already is for messaging — the server holds a copy of the hub key for webhook processing).

### Schema Addition to `blasts` Table

Add `localizedContent` column:
```sql
ALTER TABLE blasts ADD COLUMN localized_content JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Structure: `Record<string, BlastContent>` keyed by language code. The `content` field remains as the default/fallback. Example:
```json
{
  "es": { "text": "Hola mundo" },
  "zh": { "text": "你好世界" }
}
```

### Rate Limiting Strategy

Token bucket rate limiter, one bucket per channel type per hub:

| Channel | Default Rate | Burst |
|---------|-------------|-------|
| SMS (Twilio) | 1 msg/sec | 5 |
| SMS (SignalWire) | 5 msg/sec | 10 |
| WhatsApp | 10 msg/sec | 20 |
| Signal | 5 msg/sec | 10 |
| RCS | 3 msg/sec | 6 |

Implementation: In-memory token bucket (no Redis needed for single-server). Refills at the configured rate. If a bucket is empty, the delivery stays in `pending` and the poller moves on. Deliveries that couldn't send due to rate limiting are NOT counted as attempts — they remain pending with an unchanged `nextAttemptAt`. The poller naturally re-picks them on the next cycle (5s).

Configurable per-hub via `blastSettings.rateLimits: Record<MessagingChannelType, { rate: number, burst: number }>`.

### Retry / Backoff Logic

- Max attempts: 3 (configurable per delivery, defaulting from blast settings)
- Backoff formula: `nextAttemptAt = NOW() + min(baseDelay * 2^(attempts-1), maxDelay)`
- Base delay: 30 seconds
- Max delay: 15 minutes
- Terminal states: `sent`, `delivered`, `failed` (after max attempts), `opted_out`, `cancelled`
- On failure: increment `attempts`, set `error` to failure reason, compute `nextAttemptAt`
- After max attempts exceeded: set status to `failed`, leave in place for reporting

### Blast Expansion (Send Trigger)

When `BlastsService.send(id)` is called:

1. Validate blast is in `draft` or `scheduled` state
2. Enforce `maxBlastsPerDay` rate limit
3. Query matching subscribers (active, verified channel matching target, tags overlap, language match)
4. For each matching subscriber × each target channel they have verified:
   - INSERT into `blast_deliveries` with status `pending`, `nextAttemptAt = NOW()`
5. Update blast `status` to `sending`, `sentAt` to now, `stats.totalRecipients` to count
6. Return immediately (actual sending is async via poller)

For large subscriber lists, expansion happens in batches of 500 to avoid transaction timeouts.

### Mid-Flight Opt-Out Check

Before sending each delivery:
1. Re-query the subscriber's current status
2. If `status !== 'active'` or `doubleOptInConfirmed === false`: mark delivery as `opted_out`, skip send
3. This catches opt-outs that happen between expansion and delivery (important for slow-draining large blasts)

### Scheduled Sends

- Blast with `scheduledAt` in the future transitions to `status: 'scheduled'`
- Scheduled check runs every 60 seconds
- When `scheduledAt <= NOW()` for a scheduled blast: call `expandBlast()` → status becomes `sending`
- Cancellation: set status to `cancelled`, also UPDATE all pending deliveries to `cancelled`

### Hub Key Rotation Interaction

The blast content is stored in plaintext in the `content`/`localizedContent` fields (not E2EE at rest in the current schema). This is acceptable because:
1. The server already processes plaintext content during messaging (it must pass body text to Twilio/Signal/etc.)
2. The security model protects subscriber PII (encrypted identifiers), not blast content from the server

If future requirements demand E2EE blast content:
- Content would be encrypted with hub key at creation time
- On hub key rotation, active/scheduled blasts would need re-encryption or cancellation
- For now, this is deferred — the server must read content to send it anyway

### Real-Time Stats via Nostr Events

Define a new ephemeral Nostr event kind:
```typescript
export const KIND_BLAST_PROGRESS = 20010  // ephemeral, not persisted
```

Event payload (encrypted with hub key for relay privacy):
```json
{
  "blastId": "uuid",
  "stats": {
    "totalRecipients": 500,
    "sent": 123,
    "delivered": 98,
    "failed": 3,
    "optedOut": 2,
    "pending": 374
  }
}
```

Published every N deliveries (configurable, default every 10) and on blast completion.

### Blast Completion Detection

After each delivery batch, check:
```sql
SELECT COUNT(*) FROM blast_deliveries 
WHERE blast_id = ? AND status IN ('pending', 'sending')
```

If zero remaining: update blast status to `sent`, publish final stats event.

### Cancellation

`BlastsService.cancel(id)`:
1. Set blast `status` to `cancelled`, `cancelledAt` to now
2. UPDATE all `blast_deliveries` WHERE `blast_id = id AND status IN ('pending', 'sending')` SET `status = 'cancelled'`
3. In-flight deliveries (already picked up by poller) check blast status before sending

### Delivery Status Webhooks

When a messaging provider sends a delivery receipt (via `parseStatusWebhook()`):
1. Match the `external_id` on `blast_deliveries`
2. If matched: update status to `delivered`, set `deliveredAt`
3. Update blast stats (increment `delivered`, decrement `sent` if tracking separately)

### API Endpoints (already partially exist)

New/modified:
- `POST /api/blasts/:id/send` — trigger expansion + delivery (exists, needs wiring)
- `GET /api/blasts/:id/deliveries` — paginated delivery list with status breakdown
- `GET /api/blasts/:id/stats` — real-time delivery stats
- `POST /api/blasts/:id/cancel` — cancel (exists, needs delivery cancellation)

## Files to Modify/Create

| File | Action |
|------|--------|
| `apps/worker/db/schema/blasts.ts` | Add `blastDeliveries` table, add columns to `subscribers` and `blasts` |
| `apps/worker/services/blasts.ts` | Implement `expandBlast()`, `processDeliveryBatch()`, delivery CRUD |
| `apps/worker/services/blast-delivery-poller.ts` | New: background poller (modeled on outbox-poller) |
| `apps/worker/services/blast-rate-limiter.ts` | New: token bucket rate limiter |
| `apps/worker/services/scheduler.ts` | Wire up the blast poller start/stop |
| `packages/shared/types.ts` | Extend `BlastContent` with localized content, add delivery types |
| `packages/shared/nostr-events.ts` | Add `KIND_BLAST_PROGRESS` |
| `apps/worker/services/index.ts` | Export new services |
| `apps/worker/routes/blasts.ts` | Add delivery listing and stats endpoints |

## Decisions to Review

### 1. Job Queue Implementation: PostgreSQL Table vs External Queue

**Chosen**: PostgreSQL `blast_deliveries` table as the job queue  
**Alternatives considered**:
- **Redis/BullMQ**: More features (priority, delayed jobs, dashboard) but adds infrastructure dependency and doesn't persist in the same transaction as subscriber expansion
- **In-memory queue**: Simpler but lost on restart, no crash recovery
- **External queue service (SQS, CloudEvents)**: Over-engineered for self-hosted single-server deployment

**Rationale**: PostgreSQL is already the primary store. Transactional expansion (insert deliveries in same tx as blast status change) guarantees consistency. The poller pattern is already proven with `nostr-outbox-poller.ts`. No additional infrastructure.

### 2. Rate Limiting: In-Memory Token Bucket vs Database-Based

**Chosen**: In-memory token bucket per channel type  
**Alternatives considered**:
- **Database-based sliding window**: Survives restarts but adds queries per delivery
- **Redis token bucket**: Standard for distributed systems but adds Redis dependency
- **Fixed delay between sends**: Simple but doesn't allow burst capability

**Rationale**: Single-server deployment means in-memory state is fine. Token bucket naturally handles bursty patterns and recovers gracefully on restart (buckets just refill). Provider rate limits are the real constraint.

### 3. Subscriber PII at Send Time: Decrypt from Hub Key vs Store Plaintext Server-Side

**Chosen**: `encryptedIdentifier` field decrypted at send time using hub key held by server  
**Alternatives considered**:
- **Plaintext identifier stored permanently**: Simpler but violates privacy principles
- **Client-side decryption + server relay**: Would require client to be online during blast send — unacceptable for scheduled/automated sends
- **One-time decryption at expansion into delivery row**: Stores plaintext in delivery rows temporarily

**Rationale**: The server already holds the hub key for messaging operations (webhook processing requires decrypting incoming messages). Decrypt-on-demand from `encryptedIdentifier` means plaintext is only in memory during the send call, never persisted.

### 4. Localized Content: Per-Language Map in Blast vs Separate Content Table

**Chosen**: `localizedContent: Record<string, BlastContent>` JSONB field on the blast  
**Alternatives considered**:
- **Separate `blast_content_translations` table**: Normalized but adds joins for every delivery
- **Array of `{ lang, content }` objects**: Less ergonomic for lookup
- **Template engine with interpolation**: Over-engineered for static translated text

**Rationale**: Blasts typically target 2-5 languages max. A flat JSON map is simple, fast to look up, and keeps all blast data in one row.

### 5. Blast Content Security: Plaintext vs E2EE at Rest

**Chosen**: Plaintext content in database (server must read it to send)  
**Alternatives considered**:
- **E2EE content encrypted with hub key**: Adds complexity around key rotation and scheduled sends
- **Client-side send orchestration**: Client decrypts and relays each message — unscalable, requires client online

**Rationale**: The server must know the message text to call Twilio/Signal APIs. Encrypting at rest only to decrypt immediately before sending adds complexity without security benefit. The threat model already accepts that the server processes message content for messaging operations. Subscriber PII (the sensitive part) IS encrypted.

### 6. Poller Interval Strategy: Fixed vs Adaptive

**Chosen**: Dual-interval — 5s for active delivery processing, 60s for scheduled blast checks  
**Alternatives considered**:
- **Single interval (e.g., 10s)**: Simpler but either too slow for active deliveries or too frequent for scheduled checks
- **Event-driven (LISTEN/NOTIFY)**: More responsive but adds pg_notify complexity
- **Exponential backoff when idle**: Saves cycles but adds complexity

**Rationale**: Active blasts need fast processing (5s gives <10s latency to first delivery). Scheduled checks are inherently low-frequency (minute-level accuracy is fine for "send at 9am" use cases). Two intervals match the two concerns cleanly.

### 7. Delivery Status Tracking: Fire-and-Forget vs Webhook Correlation

**Chosen**: Store `external_id` on delivery, correlate via status webhooks  
**Alternatives considered**:
- **Fire-and-forget (mark sent immediately)**: Simpler but no delivery confirmation
- **Polling provider status API**: Adds API calls and rate limit concerns
- **Treat adapter `sendMessage()` success as final**: Miss transient provider failures

**Rationale**: Most providers (Twilio, Meta, Signal) send delivery receipts via webhooks. Storing the `external_id` enables correlation. The messaging router already handles status webhooks — just needs to check `blast_deliveries` in addition to conversations.

### 8. Expansion Strategy: Eager (All at Once) vs Lazy (On-Demand)

**Chosen**: Eager batch expansion — all matching subscribers get delivery rows immediately on send  
**Alternatives considered**:
- **Lazy/streaming**: Query subscribers as needed during delivery — risks subscriber list changing mid-blast
- **Cursor-based pagination during expansion**: Handles very large lists but complicates resumability

**Rationale**: Eagerly creating delivery rows provides: (a) accurate recipient count immediately, (b) resumability on crash, (c) per-delivery status tracking, (d) immutable snapshot of who was targeted. Batched INSERT (500 at a time) handles large lists without transaction timeouts.
