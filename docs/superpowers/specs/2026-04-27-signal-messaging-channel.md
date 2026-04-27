# Signal Messaging Channel — Complete & Harden

**Date**: 2026-04-27
**Status**: Draft
**Scope**: Complete the Signal messaging adapter to production quality

## Current State

The v2 codebase has a working Signal adapter at `apps/worker/messaging/signal/` with:

- **SignalAdapter** implementing the `MessagingAdapter` interface (send text, send media, parse incoming, validate webhook, get status)
- **Types** for signal-cli-rest-api webhook payloads (already includes `receiptMessage`, `typingMessage`, and `reaction` fields in the schema but they are not handled in adapter logic)
- **Factory** for validated adapter creation
- **Health check** module with bridge health + registration status queries
- **Docker Compose** service (`signal-cli` profile, `bbernhard/signal-cli-rest-api:0.92`, JSON-RPC mode)
- **Messaging router** at `/api/messaging/signal/webhook?hub={hubId}` with hub-scoped routing, E2EE envelope encryption on inbound, blast keyword interception, auto-assignment, and push dispatch

What is **not** implemented:
1. Registration/verification flow (no admin routes to register a number)
2. Receipt handling (`receiptMessage` in webhook payload is ignored)
3. Reaction handling (`reaction` in `dataMessage` is ignored)
4. Typing indicators (not forwarded to clients)
5. Identity/safety number trust management
6. Retry logic for failed sends
7. Multi-hub Signal number management (config is single-number)
8. Admin UI for Signal configuration
9. Rate limiting on outbound
10. Number rotation/failover

## Architecture: Shared Bridge, Per-Hub Account

A single `signal-cli-rest-api` instance manages multiple registered Signal numbers. Each hub configures its own Signal number. The adapter routes sends/receives to the correct account based on hub config.

signal-cli-rest-api supports multiple accounts natively:
- Register via `POST /v1/register/{number}`
- Verify via `POST /v1/register/{number}/verify/{code}`
- Send from specific number via `number` field in send request
- Webhooks include the receiving account in the payload

### Per-Hub Config Model

```typescript
// Extends existing SignalConfig
interface SignalConfig {
  bridgeUrl: string              // shared across all hubs
  bridgeApiKey: string           // shared API key for the bridge
  webhookSecret: string          // shared webhook auth token
  registeredNumber: string       // THIS hub's Signal number
  trustMode: 'auto' | 'tofu' | 'manual'  // identity verification strategy
  autoResponse?: string
  afterHoursResponse?: string
}
```

Hub admins configure their own number. The bridge URL and API key may come from a global/deployment-level config, while the registered number is per-hub.

## Registration & Provisioning Lifecycle

### Flow

1. Admin enters phone number in Signal settings UI
2. Backend calls `POST /v1/register/{number}` on the bridge (optionally with `voice: true` for voice verification)
3. Bridge initiates Signal registration; Signal sends SMS/voice code to the number
4. Admin enters the 6-digit code in the UI
5. Backend calls `POST /v1/register/{number}/verify/{code}` on the bridge
6. On success: persist `registeredNumber` in hub's `SignalConfig`, enable the `signal` channel
7. On failure: surface error to admin, allow retry

### Alternative: Link as Secondary Device

For numbers already registered on a primary device:
1. Admin selects "Link Device" in settings
2. Backend calls `GET /v1/qrcodelink?device_name=Llamenos` on the bridge
3. Bridge returns a `tsdevice:` URI (rendered as QR code in admin UI)
4. Admin scans QR from primary Signal app
5. Bridge receives linking confirmation; backend persists config

### Unregistration

Admin can unregister via `POST /v1/unregister/{number}`. This clears the Signal session from the bridge and removes the number from hub config.

## Receipt Handling

signal-cli-rest-api delivers receipts as webhook payloads with `envelope.receiptMessage`:

```json
{
  "envelope": {
    "source": "+1234567890",
    "timestamp": 1234567890000,
    "receiptMessage": {
      "type": "DELIVERY" | "READ",
      "timestamps": [1234567890000, 1234567890001]
    }
  }
}
```

### Implementation

Add `parseStatusWebhook` to `SignalAdapter`:
- Detect `receiptMessage` presence in webhook payload
- Map `type: "DELIVERY"` to `MessageDeliveryStatus.delivered`
- Map `type: "READ"` to `MessageDeliveryStatus.read`
- Look up messages by timestamp (used as `externalId` in send results)
- Return `MessageStatusUpdate` for the router's existing status handling flow

The messaging router already calls `adapter.parseStatusWebhook` if it exists and routes the result through `services.conversations.updateMessageStatus`.

## Reaction Handling

Inbound reactions arrive in `envelope.dataMessage.reaction`:

```json
{
  "envelope": {
    "source": "+1234567890",
    "dataMessage": {
      "reaction": {
        "emoji": "...",
        "targetAuthor": "+0987654321",
        "targetTimestamp": 1234567890000
      }
    }
  }
}
```

### Inbound

- In `parseIncomingMessage`, detect `reaction` field
- Return an `IncomingMessage` with special metadata: `{ type: 'reaction', emoji, targetTimestamp }`
- ConversationsService stores reactions as a lightweight annotation on the target message (matched by externalId = targetTimestamp)

### Outbound

signal-cli-rest-api supports sending reactions:
```
POST /v2/send
{ "number": "+sender", "recipients": ["+target"], "reaction": { "emoji": "...", "target_author": "+...", "target_timestamp": 123 } }
```

Expose via a new `sendReaction` method on `SignalAdapter` (not part of the base `MessagingAdapter` interface — Signal-specific extension).

## Typing Indicators

signal-cli-rest-api delivers typing indicators:

```json
{
  "envelope": {
    "source": "+1234567890",
    "typingMessage": { "action": "STARTED" | "STOPPED", "timestamp": 123 }
  }
}
```

### Strategy

- Parse typing webhooks in the adapter (new method: `parseTypingWebhook`)
- Publish ephemeral Nostr events (kind 20001) to subscribed clients with `{ type: 'typing', conversationId, action }`
- Do NOT persist typing state — purely real-time ephemeral signal
- Outbound typing indicators: call `PUT /v1/typing-indicator/{number}` on bridge when volunteer starts/stops typing in the UI

## Identity & Safety Number Trust Management

Signal has safety number verification. When a contact's identity key changes, signal-cli can either auto-trust or require manual verification.

### Trust Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `auto` | Always trust new identity keys | Convenience; appropriate for hotline use where callers may reinstall Signal |
| `tofu` | Trust on first use, alert on change | Balanced — flags potential MITM but allows first contact |
| `manual` | Block messages until admin verifies safety number | Maximum security; impractical for most hotline scenarios |

### Implementation

- Store `trustMode` in `SignalConfig` (default: `tofu`)
- On identity key change events from bridge, either:
  - `auto`: Call `PUT /v1/identities/{number}/trust/{recipient}` automatically
  - `tofu`: If first contact, auto-trust. If key changed, queue for admin review (store in `signal_trust_decisions` table)
  - `manual`: Always queue for admin review
- Admin UI shows pending trust decisions with safety number comparison
- signal-cli-rest-api exposes `GET /v1/identities/{number}` to list known identities

## Retry Logic for Failed Sends

### Exponential Backoff

When `sendMessage` or `sendMediaMessage` returns `{ success: false }`:

1. Record failure in message status (status = `retry_pending`)
2. Schedule retry with exponential backoff: 5s, 30s, 2m, 10m, 30m
3. Max 5 retries before marking as `dead_letter`
4. Retry is driven by a PostgreSQL-backed job queue (same pattern as blast delivery)

### Transient vs Permanent Failures

- **Transient** (retry): bridge timeout, 5xx from bridge, network errors
- **Permanent** (no retry): 400 from bridge (invalid number), 404 (number not on Signal), rate limit (429 — retry after delay)
- **Identity key mismatch** (conditional): retry only after trust decision resolves

### Dead Letter

Messages that exhaust retries are marked `dead_letter` with the last error. Admin can view dead letter queue and manually retry or dismiss.

## Rate Limiting

### Outbound Rate Limits

Signal has undocumented rate limits. Conservative defaults:
- **Per-number**: 60 messages/minute, 1000 messages/hour
- **Burst**: Allow up to 10 messages in 1 second, then throttle
- Implementation: Token bucket per registered number, checked before each send
- On rate limit (429 from bridge): back off entire number for `Retry-After` duration

### Configuration

Rate limits stored in `SignalConfig`:
```typescript
rateLimits?: {
  messagesPerMinute: number   // default: 60
  messagesPerHour: number     // default: 1000
  burstLimit: number          // default: 10
}
```

Admin can tune per hub based on observed Signal behavior.

## Number Rotation & Failover

### Motivation

If a Signal number is banned or rate-limited, the hub needs a backup.

### Design

- `SignalConfig` gains optional `fallbackNumbers: string[]`
- If primary number hits persistent errors (banned, rate limited for extended period), adapter falls over to first available fallback
- Failover is automatic but generates an admin alert (push notification + audit log entry)
- Admin can manually switch primary via settings UI

### Rotation (Optional, Phase 2)

- For high-volume hubs, round-robin across multiple numbers
- Each number has its own rate limit bucket
- Conversations stick to the number they started on (for safety number continuity)

## Admin UI Requirements

### Signal Settings Panel (Desktop)

Located in Settings > Messaging > Signal:

1. **Connection Status**: Bridge health indicator (green/red), version info
2. **Register Number**: Phone input + "Register" button, verification code input, link-as-device QR flow
3. **Registered Number**: Display current number, "Unregister" button
4. **Trust Mode**: Radio selector (auto / tofu / manual)
5. **Pending Trust Decisions**: List of contacts with changed identity keys (when mode != auto)
6. **Rate Limit Config**: Editable thresholds
7. **Fallback Numbers**: List management
8. **Dead Letter Queue**: Table of failed messages with retry/dismiss actions
9. **Webhook URL**: Read-only display of the hub's Signal webhook URL (for bridge configuration)

### Existing Integration Points

- Settings page already has messaging channel configuration
- MessagingConfig update routes exist at `PUT /api/settings/messaging`
- Health check utilities exist in `health.ts`

## Security Considerations

### Signal Bridge Threat Model

The signal-cli-rest-api instance has access to:
- Signal session keys (can decrypt all messages in transit)
- Registered phone numbers and their identity keys
- Message content in plaintext (before our E2EE envelope wrap)

**Mitigations**:
- Bridge runs on internal network only (Docker `internal` network, no port exposure)
- Bridge API key required for all requests (Bearer token auth)
- Webhook secret validates inbound webhooks (prevents external injection)
- Persistent volume (`signal-data`) contains session keys — treat as secret (encrypted volume in production)
- Bridge should be pinned to a specific image digest (already done: `@sha256:702db...`)
- No multi-tenant access: each deployment has its own bridge instance

### E2EE Integration

- Inbound messages are encrypted into envelopes immediately upon receipt in the webhook handler (existing flow)
- Bridge sees plaintext only during transit — our server discards plaintext after envelope encryption
- Outbound messages: server decrypts the E2EE envelope to send via bridge, then discards plaintext
- Signal's own E2EE protects the hop between bridge and recipient

### Registration Security

- Registration endpoints (register, verify, link) are admin-only (permission-gated)
- Verification codes are time-limited by Signal (5 minutes)
- No verification codes are stored in our database — only passed through to bridge
- Failed verification attempts are audit-logged

## Decisions to Review

| # | Decision | Chosen Option | Alternatives Considered |
|---|----------|---------------|------------------------|
| 1 | Bridge architecture | Shared bridge, per-hub account | Per-hub bridge instance (more isolation but heavier ops); Dedicated bridge per number (overkill for Signal's model) |
| 2 | Trust mode default | TOFU (trust on first use) | Auto-trust (simpler but no MITM detection); Manual (too restrictive for hotline) |
| 3 | Retry strategy | PostgreSQL job queue with exponential backoff | In-memory retry (lost on restart); Redis-backed (adds dependency); setTimeout chains (fragile) |
| 4 | Rate limit implementation | Token bucket per number (in-memory with PostgreSQL persistence) | Sliding window (more memory); External rate limiter service (overkill) |
| 5 | Failover trigger | Persistent errors (>5 consecutive failures or 429 extended) | Manual-only switchover (slower response); Immediate on first failure (too aggressive) |
| 6 | Typing indicators | Ephemeral Nostr events (not persisted) | WebSocket direct (already have Nostr relay for real-time); Database polling (too slow) |
| 7 | Reaction storage | Annotation on target message (externalId lookup) | Separate reactions table (over-engineered); Embedded in message metadata (harder to query) |
| 8 | Registration flow | Both SMS/voice verify AND device linking | SMS-only (some numbers can't receive SMS); Device-link only (requires existing primary device) |
| 9 | Dead letter visibility | Admin-only dashboard with manual retry | Auto-notify assigned volunteer (leaks delivery infra); Discard silently (loses messages) |
| 10 | Number rotation | Phase 2 (optional) — conversations pinned to number | Immediate round-robin (breaks safety number continuity); No rotation (single point of failure) |
