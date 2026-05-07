# WebSocket Relay (Replacing Nostr/strfry)

**Date:** 2026-05-05
**Status:** Draft
**Depends on:** Rust FFI Server Crypto Bridge, Ed25519 Auth Purge, HPKE Envelope Encryption
**Depended on by:** Dependency & Infrastructure Cleanup

## Context

Llamenos uses a self-hosted Nostr relay (strfry) as a real-time pub/sub broker. The server signs Nostr events with Schnorr (secp256k1), encrypts content with XChaCha20-Poly1305, and publishes to strfry. Clients connect to strfry via WebSocket, authenticate with NIP-42, and subscribe with NIP-01 filters. strfry enforces write-policy (server-only publishing) via a bash plugin.

This is massive overkill. We're using Nostr as a dumb encrypted pipe with generic tags specifically to hide our event semantics from the relay. The relay can't distinguish event types, can't read content, and only accepts events from one pubkey. A WebSocket on our own Hono server does the same thing with less code, no Schnorr dependency, and no extra infrastructure.

**Goal:** Replace strfry with an authenticated WebSocket endpoint on the existing Hono server. Same real-time features, same encryption, no Nostr protocol.

## Architecture

### Connection Flow

```
Client                          Server (Hono)
  |                                |
  |── GET /ws?auth=<signed_payload> ──>|
  |                                |  Verify Ed25519 signature
  |                                |  Look up user, get hub memberships
  |<── 101 Switching Protocols ────|
  |                                |  Register connection in ConnectionManager
  |                                |
  |── {"type":"subscribe",         |
  |    "hubId":"abc",              |
  |    "kinds":[1000,1001,20000]} ──>|  Validate hub membership, register subscription
  |                                |
  |<── {"type":"event",            |
  |     "hubId":"abc",             |
  |     "kind":1000,               |
  |     "payload":"<encrypted>",   |
  |     "ts":1717000000,           |
  |     "sig":"<ed25519_sig>"} ────|  Server signs + pushes
  |                                |
  |── {"type":"replay",            |
  |    "hubId":"abc",              |
  |    "since":1716999990} ────────>|  Replay missed events from ring buffer
  |                                |
  |── {"type":"ping"} ─────────────>|
  |<── {"type":"pong"} ────────────|
```

### Auth on Upgrade

The WebSocket upgrade request includes an Ed25519 signed auth payload in the query string:

```
GET /ws?auth=<base64url(JSON)>

{
  "pubkey": "<ed25519_hex_64>",
  "timestamp": <unix_ms>,
  "sig": "<ed25519_sig_hex_128>"
}
```

Signed message: `llamenos:ws-auth:<pubkey>:<timestamp>`

Server verifies via `ed25519Verify()` from Rust FFI. Token freshness: 30-second window (tighter than API auth's 5 minutes since WebSocket upgrade is a one-time operation). On failure, server responds with HTTP 401 before upgrade.

### Message Protocol

All messages are JSON. No binary framing (events are small, JSON overhead is negligible).

**Client → Server:**

```typescript
// Subscribe to events for a hub
{ type: 'subscribe', hubId: string, kinds: number[] }

// Unsubscribe from a hub
{ type: 'unsubscribe', hubId: string }

// Request replay of missed events
{ type: 'replay', hubId: string, since: number }

// Keepalive
{ type: 'ping' }
```

**Server → Client:**

```typescript
// Real-time event
{
  type: 'event',
  hubId: string,
  kind: number,
  payload: string,   // hex: AES-256-GCM encrypted event content
  epoch: number,      // encryption epoch for key derivation
  ts: number,         // unix milliseconds
  sig: string,        // hex: Ed25519 signature over (hubId + kind + payload + ts)
}

// Subscription confirmed
{ type: 'subscribed', hubId: string, kinds: number[] }

// Keepalive response
{ type: 'pong' }

// Error
{ type: 'error', code: string, message: string }
```

### Event Kinds (Unchanged Semantics)

Event kinds keep the same numbers for wire compatibility with existing client code that switches on kind:

| Kind | Name | Durability | Purpose |
|------|------|------------|---------|
| 1000 | CALL_RING | Durable | Incoming call alert |
| 1001 | CALL_UPDATE | Durable | Call state change (answered/completed) |
| 1002 | CALL_VOICEMAIL | Durable | Voicemail received |
| 1010 | MESSAGE_NEW | Durable | New conversation message |
| 1011 | CONVERSATION_ASSIGNED | Durable | Assignment changed |
| 1012 | MESSAGE_REACTION | Durable | Emoji reaction |
| 1020 | RECORD_CREATED | Durable | Case record created |
| 1021 | RECORD_UPDATED | Durable | Case record updated |
| 1022 | RECORD_ASSIGNED | Durable | Record assignment changed |
| 1023 | CONTACT_IDENTIFIED | Durable | Caller ID match |
| 1030 | BLAST_PROGRESS | Durable | Blast delivery progress |
| 1031 | BLAST_STATUS | Durable | Blast status change |
| 1032 | FIREHOSE_REPORT | Durable | Firehose structured report |
| 20000 | PRESENCE_UPDATE | Ephemeral | Volunteer online/availability |
| 20001 | TYPING_INDICATOR | Ephemeral | External channel typing |

### Server-Side Implementation

**New files:**

`apps/worker/lib/ws-manager.ts`:
```typescript
export class ConnectionManager {
  private connections = new Map<string, Set<WebSocket>>()  // pubkey → connections
  private hubSubscriptions = new Map<string, Map<string, Set<number>>>()  // hubId → Map<pubkey, Set<kinds>>
  private eventBuffer = new Map<string, RingBuffer<ServerEvent>>()  // hubId → recent events

  register(pubkey: string, ws: WebSocket): void
  unregister(pubkey: string, ws: WebSocket): void
  subscribe(pubkey: string, ws: WebSocket, hubId: string, kinds: number[]): void
  unsubscribe(pubkey: string, hubId: string): void
  publishToHub(hubId: string, event: ServerEvent): void   // fan-out to all subscribers
  replay(ws: WebSocket, hubId: string, since: number): void
}
```

`apps/worker/routes/ws.ts`:
```typescript
// Hono WebSocket upgrade route
app.get('/ws', async (c) => {
  // 1. Parse auth from query
  // 2. Verify Ed25519 signature via FFI
  // 3. Look up user via IdentityService
  // 4. Upgrade to WebSocket
  // 5. Register in ConnectionManager
  // 6. Handle messages in onMessage
  // 7. Cleanup in onClose
})
```

**Ring buffer:** In-memory per-hub, bounded to 1000 events or 5 minutes (whichever fills first). Only durable events (kinds < 20000) are buffered. Ephemeral events (presence, typing) are fire-and-forget — if you're disconnected, you miss them. This matches the current Nostr behavior.

### Event Encryption (Same Scheme, Different Primitives)

**Encryption:**
- AEAD: AES-256-GCM (was XChaCha20-Poly1305)
- Key derivation: HKDF(SERVER_SECRET, salt=LABEL_HUB_EVENT, info=LABEL_HUB_EVENT_EPOCH:{N}, len=32)
- Epoch: rotates every 24 hours (forward secrecy)
- Padding: power-of-2 bucket (min 512B) with 4-byte LE length prefix (traffic analysis resistance)
- All via Rust FFI

**Signing:**
- Ed25519 signature over `hubId:kind:payload:ts` (was Schnorr over Nostr event serialization)
- Server key derived from `SERVER_SECRET` via HKDF with `LABEL_SERVER_SIGNING_KEY`
- Client verifies via Rust CryptoState

### Client-Side Implementation

**New directory:** `src/client/lib/relay/`

`connection.ts`:
```typescript
export class RelayConnection {
  private ws: WebSocket | null = null
  private state: RelayState = 'disconnected'
  private subscriptions = new Map<string, Set<number>>()  // hubId → kinds
  private reconnectAttempts = 0
  private handlers = new Map<string, Map<number, EventHandler>>()  // hubId → kind → handler

  connect(serverUrl: string, authPayload: AuthPayload): void
  subscribe(hubId: string, kinds: number[]): void
  unsubscribe(hubId: string): void
  replay(hubId: string, since: number): void
  disconnect(): void
}
```

`types.ts`:
```typescript
export type RelayState = 'disconnected' | 'connecting' | 'connected'
// No more 'authenticating' state — auth happens at upgrade time

export interface RelayEvent {
  type: string
  hubId: string
  kind: number
  payload: string  // encrypted hex
  epoch: number
  ts: number
  sig: string
}

// Event content types — same interfaces, just moved from nostr/types.ts
export interface CallRingEvent { type: 'call:ring'; callId: string; callerLast4?: string; startedAt: string }
export interface CallAnsweredEvent { type: 'call:answered'; callId: string; volunteerPubkey: string }
// All event content types from nostr/types.ts are moved here verbatim
```

`hooks.ts`:
```typescript
export function useRelaySubscription(hubId: string, kinds: number[], handler: EventHandler): void
```

`context.tsx`:
```typescript
// RelayProvider — same lifecycle as NostrProvider
// Connect on auth, disconnect on sign-out, reconnect on tab visibility change
```

**Reconnection:** Same exponential backoff with jitter (1s → 30s, max 20 attempts). On reconnect, send `replay` message with `since = lastEventTimestamp - 1000` to catch missed durable events.

**Deduplication:** Same time-bucketed deduplication (1-minute buckets, 5-minute window). Events deduped by a composite key of `hubId:kind:ts:payloadHash` (SHA-256 of first 32 bytes of payload, computed via FFI) instead of Nostr event ID. The deduplicator class is ported directly from `nostr/events.ts` with the key computation changed.

### Publishing Events (Server-Side)

Current code calls `nostrPublisher.publish(event)` in services. Replace with `wsManager.publishToHub(hubId, event)`:

```typescript
// Before (nostr-publisher.ts)
await this.nostrPublisher.publish({
  kind: KIND_CALL_RING,
  content: encryptedContent,
  tags: [['d', hubId], ['t', 'llamenos:event']],
})

// After (ws-manager.ts)
wsManager.publishToHub(hubId, {
  kind: KIND_CALL_RING,
  payload: encryptedContent,
  epoch: currentEpoch(),
})
```

Direct. No Nostr event serialization, no tag arrays, no event ID computation, no outbox persistence. The server holds the WebSocket connections directly — no intermediary relay.

### Outbox Removal

The `nostr_event_outbox` PostgreSQL table and `nostr-outbox-poller.ts` background process are deleted. The in-memory ring buffer handles replay for short disconnections. For longer outages, clients poll the API (which they already do as fallback).

If durable delivery guarantees become important later, a PostgreSQL-backed event log can be added — but as a Llamenos-native feature, not a Nostr outbox.

## Files Deleted

| File/Directory | Reason |
|----------------|--------|
| `src/client/lib/nostr/` | Entire directory — replaced by `src/client/lib/relay/` |
| `apps/worker/lib/nostr-publisher.ts` | Replaced by `ws-manager.ts` |
| `apps/worker/lib/nostr-outbox.ts` | Replaced by in-memory ring buffer |
| `apps/worker/lib/nostr-outbox-poller.ts` | Deleted with outbox |
| `apps/worker/lib/hub-event-crypto.ts` | Logic moves to Rust FFI wrapper |
| `apps/worker/lib/agent-identity.ts` | Agent keypair derivation moves to `server-identity.ts` using Ed25519 |
| `deploy/docker/strfry-dev.conf` | strfry removed |
| `deploy/docker/write-policy.sh` | strfry write policy removed |

## Files Created

| File | Purpose |
|------|---------|
| `apps/worker/lib/ws-manager.ts` | Connection + subscription + ring buffer manager |
| `apps/worker/routes/ws.ts` | Hono WebSocket upgrade route |
| `src/client/lib/relay/connection.ts` | WebSocket client connection manager |
| `src/client/lib/relay/types.ts` | Event types + relay state |
| `src/client/lib/relay/hooks.ts` | React hooks for relay subscription |
| `src/client/lib/relay/context.tsx` | React context provider |
| `src/client/lib/relay/index.ts` | Public API exports |

## Infrastructure Changes

- Remove `strfry` service from `deploy/docker/docker-compose.dev.yml`
- Remove `strfry` service from `deploy/docker/docker-compose.yml`
- Remove `strfry` service from `deploy/docker/docker-compose.production.yml`
- Remove `strfrydata` volume from all compose files
- Remove strfry StatefulSet + Service from `deploy/helm/llamenos/templates/`
- Remove `/nostr` proxy route from `deploy/docker/Caddyfile` and production Caddyfile
- Add `/ws` WebSocket upgrade route to Caddyfile (proxied to Hono server)
- Remove `SERVER_NOSTR_SECRET` from env templates, Helm values, CI secrets
- Remove `NOSTR_RELAY_URL` and `NOSTR_RELAY_PUBLIC_URL` env vars

## Decisions to Review

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| In-memory ring buffer | Yes, bounded 1000 events / 5 min | PostgreSQL event log | Simpler. No production scale yet. Polling fallback exists. Can add persistent log later |
| Auth in query param | `?auth=<base64url>` | Custom header / subprotocol | WebSocket API doesn't support custom headers from browser. Query param is standard practice |
| JSON messages | JSON text frames | Binary protocol (protobuf, msgpack) | Events are small. JSON is debuggable. Binary optimization is premature |
| Single WebSocket per client | One connection, multiple hub subscriptions | One WebSocket per hub | Less overhead, simpler connection management, matches multi-hub axiom |
| 30-second auth window | Tighter than API (5 min) | Same 5-minute window | Upgrade is one-time — tighter window reduces replay attack surface |
| No persistent outbox | Delete PostgreSQL outbox | Keep as durable event log | YAGNI. Polling fallback covers reconnection. Add if needed later |
