# Plan: WebSocket Relay (Replacing Nostr/strfry)

**Spec**: `docs/superpowers/specs/2026-05-05-websocket-relay-design.md`

## Prerequisites

- **Rust FFI Server Crypto Bridge** (Plan 1) — FFI available for signing/encryption
- **Ed25519 Auth Purge** (Plan 2) — Ed25519-only verification, `server-identity.ts` exists
- **HPKE Envelope Encryption** (Plan 3) — AES-256-GCM via FFI for event encryption
- No production users or stored Nostr events

## Implementation Steps

### Step 1: WebSocket Message Types — Protocol Schema

**Files**:
- `packages/protocol/schemas/ws-messages.ts` (new)

**Changes**:
1. Define Zod schemas for all client→server messages:
   - `WsAuthMessage` — `{ type: 'auth', pubkey: string, nonce: string, ts: number, sig: string }`
   - `WsSubscribeMessage` — `{ type: 'subscribe', hubId: string, kinds: z.array(z.number()) }`
   - `WsUnsubscribeMessage` — `{ type: 'unsubscribe', hubId: string }`
   - `WsReplayMessage` — `{ type: 'replay', hubId: string, since: number }`
   - `WsPingMessage` — `{ type: 'ping' }`
   - `WsClientMessage` — discriminated union of above
2. Define Zod schemas for all server→client messages:
   - `WsChallengeMessage` — `{ type: 'challenge', nonce: string }`
   - `WsAuthenticatedMessage` — `{ type: 'authenticated', hubs: z.array(z.string()) }`
   - `WsEventMessage` — `{ type: 'event', v: 1, hubId, kind, payload, epoch, ts, sig }`
   - `WsSubscribedMessage` — `{ type: 'subscribed', hubId, kinds }`
   - `WsPongMessage` — `{ type: 'pong' }`
   - `WsErrorMessage` — `{ type: 'error', code: string, message: string }`
   - `WsUnsubscribedMessage` — `{ type: 'unsubscribed', hubId, reason?: string }`
3. Register schemas in `packages/protocol/tools/schema-registry.ts`
4. Run `bun run codegen` to generate Swift/Kotlin types

**Verification**: `bun run codegen` succeeds. `bun run typecheck` passes.

---

### Step 2: Add WebSocket Crypto Labels

**Files**:
- `packages/protocol/crypto-labels.json`

**Changes**:
1. Add `LABEL_WS_CHALLENGE` (`llamenos:ws-auth:v1`) — WebSocket auth challenge signed message prefix
2. Run `bun run codegen` to regenerate label constants in TS/Swift/Kotlin

**Verification**: `bun run codegen` succeeds

---

### Step 3: Ring Buffer Implementation

**Files**:
- `apps/worker/lib/ring-buffer.ts` (new)

**Changes**:
1. Implement generic `RingBuffer<T>` class:
   - Constructor: `capacity: number`, `maxAgeMs: number`
   - `push(item: T, timestamp: number): void` — add item, evict oldest if at capacity or expired
   - `since(timestamp: number): T[]` — return items newer than timestamp
   - `size: number` — current item count
2. Add priority reservation support:
   - Constructor accepts `reservedCapacity: number` and `isReserved: (item: T) => boolean`
   - Reserved slots (100) can only be used by items passing `isReserved` check
   - Non-reserved items evict from the general pool only
3. Time-based eviction: items older than `maxAgeMs` are evicted on every `push()` and `since()` call

**Verification**: Unit tests for capacity bounds, time eviction, priority reservation, `since()` filtering

---

### Step 4: Connection Manager

**Files**:
- `apps/worker/lib/ws-manager.ts` (new)

**Changes**:
1. `ConnectionManager` class:
   - `connections: Map<string, Set<WebSocket>>` — pubkey → active connections
   - `hubSubscriptions: Map<string, Map<string, Set<number>>>` — hubId → Map<pubkey, Set<kinds>>
   - `eventBuffers: Map<string, RingBuffer<WsEventMessage>>` — hubId → ring buffer
2. Methods:
   - `register(pubkey, ws)` — add connection
   - `unregister(pubkey, ws)` — remove connection, clean up empty entries
   - `subscribe(pubkey, ws, hubId, kinds)` — validate hub membership, register subscription
   - `unsubscribe(pubkey, hubId)` — remove subscription
   - `publishToHub(hubId, event)` — sign event via FFI, fan-out to all subscribers matching kind, buffer durable events
   - `replay(ws, hubId, since)` — clamp `since` to max 5 min ago, send buffered events
   - `evictMember(pubkey, hubId)` — unsubscribe + notify + stop delivery
3. Ring buffer config: capacity 1000, maxAge 5 min, 100 reserved for kinds 1000-1001 (call events)
4. Rate limiting per hub per event kind (configurable limits from spec)
5. Event signing: `ed25519Sign(serverSecretKey, utf8ToBytes(`${v}:${hubId}:${kind}:${epoch}:${payload}:${ts}`))`
6. Maximum message size: 64 KiB for client messages

**Verification**: `bun run typecheck` passes

---

### Step 5: WebSocket Route — Hono Upgrade + Challenge-Response Auth

**Files**:
- `apps/worker/routes/ws.ts` (new)

**Changes**:
1. `GET /ws` route with Hono WebSocket upgrade (using `Bun.serve` WebSocket or Hono's `upgradeWebSocket`)
2. Connection lifecycle:
   - On upgrade: accept unconditionally, generate 32-byte random nonce, store with 10s TTL, send `challenge` message
   - On `auth` message: verify nonce matches stored nonce (delete after use), check timestamp freshness (10s window), verify Ed25519 signature over `llamenos:ws-auth:{pubkey}:{nonce}:{timestamp}` via FFI, look up user via IdentityService, send `authenticated` with hub list
   - On `subscribe` message: validate authenticated, validate hub membership, register in ConnectionManager, send `subscribed`
   - On `unsubscribe` message: unregister from ConnectionManager
   - On `replay` message: rate-limit (1/connection/10s), delegate to ConnectionManager
   - On `ping`: respond with `pong`
   - Auth timeout: if not authenticated within 10s, close with code 4001
3. On close: unregister from ConnectionManager, clean up nonce
4. Parse all messages through Zod schemas from Step 1
5. Register route in main Hono app

**Verification**: `bun run typecheck` passes

---

### Step 6: Server-Side Event Publishing — Replace Nostr Publisher

**Files**:
- `apps/worker/services/calls.ts`
- `apps/worker/services/conversations.ts`
- `apps/worker/services/blasts.ts`
- `apps/worker/services/records.ts`
- `apps/worker/services/firehose-agent.ts`
- All services that call `nostrPublisher.publish()`

**Changes**:
1. In each service, replace `this.nostrPublisher.publish({ kind, content, tags })` with:
   ```typescript
   this.wsManager.publishToHub(hubId, {
     kind: KIND_CALL_RING,
     payload: encryptedContent,
     epoch: currentEpoch(),
   })
   ```
2. Remove tag construction (`['d', hubId]`, `['t', 'llamenos:event']`) — no longer needed
3. Remove Nostr event ID computation
4. Inject `ConnectionManager` via dependency injection (constructor parameter) in place of `NostrPublisher`
5. `currentEpoch()` helper: `Math.floor(Date.now() / 1000 / 86400)` — UTC day number

**Verification**: `bun run typecheck` passes

---

### Step 7: Client-Side Relay — Connection + Auth

**Files**:
- `src/client/lib/relay/connection.ts` (new)
- `src/client/lib/relay/types.ts` (new)
- `src/client/lib/relay/index.ts` (new)

**Changes**:
1. `types.ts`: Move event content interfaces from `src/client/lib/nostr/types.ts` verbatim (CallRingEvent, CallAnsweredEvent, etc.). Define `RelayState`, `RelayEvent`, `EventHandler` types.
2. `connection.ts` — `RelayConnection` class:
   - `connect(serverUrl)`: open WebSocket to `/ws`, wait for `challenge`, sign via platform.ts IPC (`createAuthToken` adapted for WS challenge format), send `auth`, wait for `authenticated`
   - `subscribe(hubId, kinds)`: send subscribe message, register handler
   - `unsubscribe(hubId)`: send unsubscribe
   - `replay(hubId, since)`: send replay
   - `disconnect()`: close WebSocket
   - Event dispatch: on `event` message, verify Ed25519 signature via platform.ts, decrypt payload via platform.ts, dispatch to registered handler by hubId + kind
   - Reconnection: exponential backoff with jitter (1s→30s, max 20 attempts). On reconnect, replay from `lastEventTimestamp - 1000`
   - Deduplication: time-bucketed (1-min buckets, 5-min window), key = `hubId:kind:ts:payloadHash`
3. `index.ts`: export public API

**Verification**: `bun run typecheck && bun run build` passes

---

### Step 8: Client-Side Relay — React Integration

**Files**:
- `src/client/lib/relay/hooks.ts` (new)
- `src/client/lib/relay/context.tsx` (new)

**Changes**:
1. `context.tsx` — `RelayProvider`:
   - Connect on auth (device key available), disconnect on sign-out
   - Reconnect on tab visibility change (`document.visibilitychange`)
   - Store `RelayConnection` instance in context
   - Same lifecycle as current `NostrProvider`
2. `hooks.ts` — `useRelaySubscription(hubId, kinds, handler)`:
   - Subscribe on mount, unsubscribe on unmount
   - Memoize handler to prevent re-subscription
3. Update app root to replace `NostrProvider` with `RelayProvider`

**Verification**: `bun run typecheck && bun run build` passes

---

### Step 9: Delete Nostr Client Code

**Files**:
- `src/client/lib/nostr/` (delete entire directory — 7 files)

**Changes**:
1. Delete `context.tsx`, `hooks.ts`, `types.ts`, `events.ts`, `relay.ts`, `relay.test.ts`, `index.ts`
2. Update all imports throughout `src/client/` that reference `@/lib/nostr` → `@/lib/relay`
3. Search for any remaining `nostr` references in client code and update

**Verification**: `bun run typecheck && bun run build` passes. `grep -r "nostr" src/client/` returns zero results (except maybe comments).

---

### Step 10: Delete Server Nostr Code

**Files**:
- `apps/worker/lib/nostr-publisher.ts` (delete)
- `apps/worker/lib/nostr-outbox.ts` (delete)
- `apps/worker/lib/nostr-outbox-poller.ts` (delete)
- `apps/worker/lib/hub-event-crypto.ts` (delete)
- `apps/worker/lib/agent-identity.ts` (delete)
- `packages/shared/nostr-events.ts` (delete or rename)

**Changes**:
1. Delete all 5 Nostr-specific server files
2. `packages/shared/nostr-events.ts` → keep event kind constants but move them to `packages/shared/event-kinds.ts` (rename, same content minus Nostr-specific kinds like `KIND_NIP42_AUTH`)
3. Update all imports referencing deleted files
4. Remove `NostrPublisher` from service constructors / DI
5. Remove outbox poller from server startup

**Verification**: `bun run typecheck` passes

---

### Step 11: Mobile Client — WebSocket Relay

**Files**:
- `apps/ios/Sources/Services/RelayService.swift` (new, replacing NostrService if it exists)
- `apps/android/app/src/main/kotlin/.../service/RelayService.kt` (new, replacing NostrService if it exists)

**Changes**:
1. **iOS**: Implement `RelayService` using `URLSessionWebSocketTask`:
   - Challenge-response auth using CryptoService Ed25519 signing
   - Subscribe per hub membership
   - Decrypt events using CryptoService AES-256-GCM
   - Verify Ed25519 event signatures
   - Reconnection with exponential backoff
2. **Android**: Implement `RelayService` using OkHttp WebSocket:
   - Same protocol as iOS
   - Inject via Hilt
3. Delete any existing Nostr service files on both platforms
4. Update ViewModels / @Observable classes to use new relay

**Verification**: iOS unit tests pass. Android `./gradlew testDebugUnitTest` passes.

---

### Step 12: Database Migration — Drop Outbox Table

**Files**:
- `apps/worker/db/migrations/XXXX_drop_nostr_outbox.ts` (new)

**Changes**:
1. Create Drizzle migration: `DROP TABLE IF EXISTS nostr_event_outbox;`
2. Remove `nostrEventOutbox` table definition from Drizzle schema files

**Verification**: `bun run typecheck` passes. Migration runs cleanly against dev DB.

---

### Step 13: E2E Tests — WebSocket Relay

**Files**:
- `tests/steps/backend/websocket.steps.ts` (new or update existing)
- Existing call/message/record E2E tests

**Changes**:
1. Write BDD scenarios for WebSocket lifecycle:
   - Connect → receive challenge → auth → authenticated
   - Subscribe to hub → receive events
   - Replay missed events
   - Auth timeout (no auth within 10s → disconnect)
   - Invalid signature → auth_failed
   - Non-member hub subscription → rejected
2. Update existing E2E tests that relied on Nostr relay behavior to use WebSocket assertions
3. Remove any test setup that starts/configures strfry

**Verification**: `bun run test:backend:bdd` passes. `bun run test` (Playwright) passes.

---

## Dependency Chain

- **Depends on**: Rust FFI Server Crypto Bridge (Plan 1), Ed25519 Auth Purge (Plan 2), HPKE Envelope Encryption (Plan 3)
- **Depended on by**: Dependency & Infrastructure Cleanup (Plan 5) — for strfry removal from infra

## Risk Notes

- Service constructors change (NostrPublisher → ConnectionManager) — affects DI wiring across many services
- In-memory ring buffer is per-process — document multi-server limitation and sticky session requirement
- Replay rate limiting (1/connection/10s) prevents abuse but may frustrate legitimately reconnecting clients — monitor
- Mobile relay implementation is significant work — may need parallel agents for iOS + Android
