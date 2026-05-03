# Nostr Security Hardening Spec

## Current State

Llamenos uses the Nostr protocol (NIP-01/NIP-42) as its real-time event bus. All call notifications, presence updates, messaging alerts, case record changes, and typing indicators flow through a self-hosted strfry relay (or Nosflare on CF).

### Server-Side Publishing

- **`apps/worker/lib/nostr-publisher.ts`**: Three publisher implementations — `NodeNostrPublisher` (WebSocket to strfry), `CFNostrPublisher` (service binding to Nosflare), `NoopNostrPublisher` (no relay configured).
- **`apps/worker/lib/nostr-events.ts`**: `publishNostrEvent()` constructs events, encrypts content with a server-derived event key (`deriveServerEventKey` via HKDF from `SERVER_NOSTR_SECRET`), then publishes via the publisher.
- **`apps/worker/lib/hub-event-crypto.ts`**: XChaCha20-Poly1305 encryption with 24-byte random nonce. Key derived via `HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=empty, info="llamenos:hub-event", 32)`.
- **`apps/worker/lib/nostr-outbox.ts`** + **`nostr-outbox-poller.ts`**: PostgreSQL-backed persistent outbox with `FOR UPDATE SKIP LOCKED` for reliable delivery across replicas. Exponential backoff retry (30s–480s). Validation at enqueue and drain.
- **`packages/shared/nostr-events.ts`**: 16 event kind constants — 12 regular (persisted, kinds 1000–1032), 2 ephemeral (kinds 20000–20001), 1 NIP-42 auth (22242).
- Events are signed with the server's Nostr keypair derived via `HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=LABEL_SERVER_NOSTR_KEY, info=LABEL_SERVER_NOSTR_KEY_INFO, 32)`.
- All events use tags `[["d", "global"], ["t", "llamenos:event"]]` — the relay cannot distinguish event types.

### Client-Side Consumption

- **`src/client/lib/nostr/relay.ts`**: `RelayManager` handles WebSocket, NIP-42 auth (via Rust CryptoState — nsec never in webview), subscriptions, deduplication, reconnection with exponential backoff + jitter.
- **`src/client/lib/nostr/events.ts`**: `verifyEvent()` validates Nostr signatures. `validateLlamenosEvent()` checks for `d` and `t` tags. `EventDeduplicator` uses time-bucketed sets (5-minute window).
- **`src/client/lib/hub-key-manager.ts`**: Hub symmetric key management — random 32-byte key, ECIES-wrapped per member, XChaCha20-Poly1305 for hub-scoped encrypt/decrypt.
- **`src/client/lib/nostr/context.tsx`**: React context managing RelayManager lifecycle — connects on auth, disconnects on logout, handles visibility change reconnection.
- Server event key (`serverEventKeyHex`) delivered to authenticated users via `GET /api/auth/me` (`apps/worker/routes/auth.ts:153–154`). Key is derived from `SERVER_NOSTR_SECRET` and allows clients to decrypt server-published relay events.

### Relay Configuration

- **`deploy/docker/strfry-dev.conf`**: Open relay, no write policy. Accepts events up to 15 minutes in the future and up to 3 years old.
- **`deploy/docker/strfry-prod.conf`**: Tighter limits (60s future, 24h old), but **write policy plugin is configured as empty string** — no actual enforcement. Comment says "configure write-policy plugin to whitelist server pubkey" but it's not implemented.

### Event Flow Summary

1. Server business logic calls `publishNostrEvent(env, kind, content)`
2. Content encrypted with server-derived event key (XChaCha20-Poly1305)
3. Event signed with server's Nostr keypair (Schnorr/BIP-340)
4. Published to strfry via WebSocket (with outbox persistence for reliability)
5. strfry broadcasts to subscribed clients
6. Client `RelayManager` receives event, verifies signature, decrypts with server event key
7. Decrypted content routed to matching subscription handlers

---

## Threat Model

### Adversaries

| Adversary | Capability | Goal |
|-----------|-----------|------|
| **Nation state** | Full network visibility, legal compulsion (subpoenas), hardware seizure, zero-day exploits | Identify crisis hotline volunteers, surveil callers, disrupt operations |
| **ISP / network operator** | Traffic analysis, DNS interception, TLS termination (if cert compromised) | Passive metadata collection, targeted interception on court order |
| **Compromised relay** | Full access to relay process memory, storage, logs, all passing events | Read event metadata, inject fake events, selectively drop events, correlate users |
| **Rogue admin** | Valid admin credentials, access to hub keys, server configuration | Exfiltrate data, plant surveillance, compromise other users |
| **Compromised server** | Full access to server process, `SERVER_NOSTR_SECRET`, database | Decrypt all relay events, impersonate server, read outbox contents |
| **External attacker** | Network access, public endpoints, CVE exploitation | Inject events, DoS the relay, enumerate users via timing |

### Trust Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│  Client (Tauri desktop / mobile)                             │
│  - Device private key in Rust CryptoState (never in JS)      │
│  - Hub key in JS memory (symmetric, shared)                  │
│  - Server event key in JS memory (from /api/auth/me)         │
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocket (ws:// or wss://)
                       │ NIP-42 auth challenge/response
┌──────────────────────▼───────────────────────────────────────┐
│  strfry relay                                                │
│  - Sees: encrypted content, tags, pubkeys, timestamps, IPs   │
│  - Cannot: read content, distinguish event types              │
│  - Can: correlate publishers/subscribers, timing analysis     │
│  - TRUST LEVEL: Untrusted infrastructure                     │
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocket (internal Docker network)
┌──────────────────────▼───────────────────────────────────────┐
│  App server (Bun + Hono)                                     │
│  - Holds SERVER_NOSTR_SECRET (derives signing key + event key)│
│  - Signs all events, encrypts content                        │
│  - Distributes server event key to authenticated clients      │
│  - TRUST LEVEL: Trusted (but compromise = catastrophic)      │
└──────────────────────────────────────────────────────────────┘
```

---

## Findings

### Critical

#### C1: Server event key shared with ALL authenticated users — no per-hub scoping

**Location**: `apps/worker/routes/auth.ts:153–154`, `apps/worker/lib/hub-event-crypto.ts:30–31`

The server derives a **single** event encryption key from `SERVER_NOSTR_SECRET` and distributes it to every authenticated user via `/api/auth/me`. This key decrypts ALL server-published relay events across ALL hubs:

```typescript
// auth.ts:153 — same key for every user
const serverEventKeyHex = c.env.SERVER_NOSTR_SECRET
  ? bytesToHex(deriveServerEventKey(c.env.SERVER_NOSTR_SECRET))
  : undefined
```

**Impact**: A user with access to any hub can decrypt events for ALL hubs. A compromised or revoked user retains the ability to passively decrypt all relay traffic until `SERVER_NOSTR_SECRET` is rotated. There is no forward secrecy — rotating the secret requires restarting the server and all clients lose their cached key.

**Recommendation**: Derive per-hub event keys: `HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=hubId, info="llamenos:hub-event", 32)`. Distribute only the keys for hubs the user is a member of.

#### C2: Client does not verify event publisher identity — server pubkey unused

**Location**: `src/client/lib/nostr/relay.ts:275–278`

The `RelayManager` stores the `serverPubkey` (line 40) and exposes it via `getServerPubkey()` (line 70), but `handleEvent()` **never checks** that `event.pubkey === this.serverPubkey`:

```typescript
private handleEvent(_subId: string, event: NostrEvent): void {
    if (!verifyEvent(event)) return        // verifies sig matches event.pubkey
    if (!validateLlamenosEvent(event)) return  // checks tags only
    // ❌ MISSING: if (event.pubkey !== this.serverPubkey) return
```

**Impact**: A compromised relay, or any entity that can publish to the relay, can inject events with any valid Nostr keypair. If the attacker also knows the server event key (C1), they can forge fully valid events — fake call:ring, call:answered, presence updates, etc. Even without the event key, the client will attempt decryption (returning null) and silently drop, but this opens a pathway: if combined with C1 (key leaked to a revoked user), forged events would be accepted.

**Recommendation**: Add publisher verification in `handleEvent()`: reject events where `event.pubkey !== this.serverPubkey` for server-authoritative event kinds. For future client-published events (presence, typing), maintain a local allowlist of hub member pubkeys.

#### C3: Production strfry write policy is not enforced

**Location**: `deploy/docker/strfry-prod.conf:46–49`

The production config has an empty write policy:

```
writePolicy {
    # Production: configure write-policy plugin to whitelist server pubkey
    plugin = ""
}
```

**Impact**: Any client (or attacker) that connects to the relay can publish arbitrary events. Combined with C2 (no pubkey verification on client), injected events with the right tags would reach all subscribers. The relay is intended to accept events only from the server, but this is not enforced.

**Recommendation**: Implement a strfry write-policy plugin that whitelists only the server's pubkey. Ship a `write-policy.lua` (or compiled plugin) in `deploy/docker/` and reference it in `strfry-prod.conf`. The plugin should reject any event where `event.pubkey != SERVER_PUBKEY`, except for NIP-42 auth events.

### High

#### H1: `SERVER_NOSTR_SECRET` is a single point of catastrophic failure

**Location**: `apps/worker/lib/nostr-publisher.ts:59–70`, `apps/worker/lib/hub-event-crypto.ts:30–31`

A single 32-byte hex secret derives:
1. The server's Nostr signing keypair (via HKDF with `LABEL_SERVER_NOSTR_KEY`)
2. The event encryption key (via HKDF with `LABEL_HUB_EVENT`)

If this secret leaks:
- Attacker can sign events as the server (impersonation)
- Attacker can decrypt all relay event content (past and future — no forward secrecy)
- Attacker can forge NIP-42 auth responses

**Recommendation**: 
1. Separate signing key from encryption key derivation — use independent secrets or at minimum different HKDF contexts with longer chains.
2. Implement secret rotation procedure: new secret → re-derive keys → push new event key to clients → invalidate old relay sessions.
3. Consider ephemeral per-session encryption keys (ratcheted) for forward secrecy.

#### H2: Hub key used for relay event decryption stays in JavaScript memory

**Location**: `src/client/lib/hub-key-manager.ts:87–99`, `src/client/lib/nostr/relay.ts:284–289`

While device private keys correctly stay in Rust CryptoState (never in webview), the hub symmetric key lives in JavaScript memory and is passed to `RelayManager` via a callback:

```typescript
const hubKey = this.getHubKey()
const decrypted = decryptFromHub(event.content, hubKey)
```

**Impact**: A webview exploit (XSS, Tauri IPC bypass) could extract the hub key, enabling decryption of all relay events for that hub. The server event key (from `/api/auth/me`) is also in JS memory.

**Recommendation**: Move symmetric decrypt operations to Rust CryptoState. The webview should pass encrypted ciphertext to Rust and receive plaintext back, without ever holding the key directly. This aligns with the existing pattern for asymmetric operations.

#### H3: No replay protection beyond 5-minute deduplication window

**Location**: `src/client/lib/nostr/events.ts:11–59`

The `EventDeduplicator` rejects events older than 5 minutes and deduplicates by event ID within that window. After 5 minutes, a previously seen event with the same ID would be accepted again:

```typescript
const age = Date.now() - eventTimeMs
if (age > MAX_EVENT_AGE) return false  // but also means it's rejected as "too old"
```

The current logic actually rejects events older than 5 minutes (line 33), which provides some protection. However, the strfry production config accepts events up to 24 hours old (`rejectEventsOlderThanSeconds = 86400`), and the dev config accepts events up to 3 years old. A stored event could be replayed within the 24-hour window with a fresh timestamp if the attacker can modify the `created_at` field — but that would invalidate the Nostr signature. So the real risk is relay-level replay of legitimately signed events.

**Impact**: If the relay stores events (regular kinds 1000–1032), those events can be re-delivered to reconnecting clients. The `since` filter on reconnect (relay.ts:326–334) limits this, but a malicious relay could ignore `since` and replay historical events.

**Recommendation**: 
1. Tighten `rejectEventsOlderThanSeconds` in production to match the application's actual needs (e.g., 300s for most events).
2. Add sequence numbers or monotonic counters to event content that clients can verify.
3. Consider making all events ephemeral (kind 20000+) since the app has the PostgreSQL outbox for persistence.

#### H4: NIP-42 authentication does not wait for relay confirmation

**Location**: `apps/worker/lib/nostr-publisher.ts:387–403`, `src/client/lib/nostr/relay.ts:249–273`

Both server and client set `authenticated = true` immediately after sending the NIP-42 auth event, without waiting for an `OK` response from the relay:

```typescript
// nostr-publisher.ts:401-402
this.ws.send(JSON.stringify(['AUTH', authEvent]))
this.authenticated = true  // ❌ No confirmation from relay

// relay.ts:264-267
this.ws.send(JSON.stringify(['AUTH', authEvent]))
this.authenticated = true  // ❌ Same issue
```

**Impact**: If the relay rejects the auth (wrong key, malformed event), the client/server will attempt to publish/subscribe believing they're authenticated, leading to silent failures. More critically, the 2-second fallback timer (nostr-publisher.ts:378–384, relay.ts:237–243) assumes the relay is "open" if no AUTH challenge arrives — but a slow network or relay could cause a race condition where the client starts publishing before auth completes.

**Recommendation**: Track AUTH state as a three-state machine: `unauthenticated → authenticating → authenticated`. Wait for relay `OK` on the auth event before flushing pending events. Add explicit timeout handling for failed auth.

#### H5: Server event key cached globally with no rotation mechanism

**Location**: `apps/worker/lib/nostr-events.ts:6–8`

```typescript
let cachedEventKey: Uint8Array | null = null
```

The server-derived event encryption key is cached in a module-level variable for the lifetime of the process. There is no mechanism to rotate this key without restarting the server:

**Impact**: Forward secrecy is impossible — all events encrypted with this key can be decrypted if the key is ever compromised, including historical events stored in the relay or captured in transit.

**Recommendation**: Implement key epochs: derive event keys with a time-based component (e.g., daily epoch). Include the epoch identifier in event tags so clients know which key to use. Old keys expire after a configurable window.

### Medium

#### M1: Metadata leakage through relay — timing, frequency, connection patterns

**Locations**: relay connection handling throughout

While event content is encrypted and types are hidden behind generic tags, significant metadata is visible to the relay and any network observer:

1. **Connection patterns**: When clients connect/disconnect reveals shift schedules
2. **Event frequency**: Bursts of events correlate with incoming calls (ring → answered → ended)
3. **Subscription filters**: `#d: [hubId]` reveals which hub a client belongs to (relay.ts:320–323)
4. **NIP-42 auth**: Reveals client identity (pubkey) to the relay
5. **`d` tag value**: Currently hardcoded to `"global"` in server events (nostr-events.ts:24), but subscription filters use `hubId` — this mismatch means the relay sees hub membership from subscription filters

**Impact**: A compromised relay or network observer can determine: how many volunteers are on shift, when calls come in, which hub each volunteer belongs to, and broad operational tempo.

**Recommendation**:
1. Add dummy/cover traffic during quiet periods to mask operational tempo
2. Use shared subscription filters that don't reveal per-hub membership
3. Consider connecting via Tor or Cloudflare Tunnel to hide client IPs from the relay
4. Evaluate padding encrypted content to uniform sizes to prevent content-type inference from length

#### M2: WebSocket connection to relay may use `ws://` (unencrypted)

**Location**: `src/client/lib/nostr/context.tsx:65–69`, `deploy/docker/docker-compose.yml:63`

The relay URL defaults to `ws://strfry:7777` (unencrypted WebSocket) in Docker Compose. The client constructs the WebSocket URL from the config, falling back to protocol-relative construction:

```typescript
if (relayUrl.startsWith('ws://') || relayUrl.startsWith('wss://')) {
  wsUrl = relayUrl
} else {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
```

In production, Caddy proxies `/nostr` to strfry, so external traffic is TLS-protected. But internal Docker network traffic between the app server and strfry is unencrypted (`ws://`).

**Impact**: On shared hosting or if the Docker network is compromised, internal relay traffic (including encrypted events with their metadata) is visible. The server's NIP-42 auth events (containing the server's pubkey and signature) are also exposed.

**Recommendation**: 
1. Enforce `wss://` for all client-facing relay connections
2. For internal server-to-relay communication, consider mTLS or running strfry with TLS enabled
3. Add a startup check that rejects `ws://` relay URLs in production mode

#### M3: Outbox events stored in plaintext event JSON in PostgreSQL

**Location**: `apps/worker/lib/nostr-outbox.ts:77–91`, `apps/worker/db/schema.ts` (nostrEventOutbox table)

The outbox stores fully signed, encrypted events as JSONB. While the event content is encrypted (XChaCha20-Poly1305), the event metadata (pubkey, kind, tags, timestamp, signature) is stored in plaintext. These events persist for up to 24 hours (cleanup threshold):

```typescript
DELETE FROM nostr_event_outbox
WHERE (status = 'delivered' AND created_at < NOW() - INTERVAL '1 hour')
   OR (attempts > 20 AND created_at < NOW() - INTERVAL '24 hours')
```

**Impact**: A database compromise reveals event metadata: when events were published, what kind they were, which server pubkey signed them. This is a lesser risk since the server is trusted and the database is on the same trust boundary, but it expands the attack surface for "smash and grab" scenarios where the database is dumped.

**Recommendation**: 
1. Reduce cleanup intervals (delivered events: 5 minutes instead of 1 hour)
2. Consider encrypting the stored event JSON with a database-at-rest key
3. Ensure PostgreSQL's `pgcrypto` or filesystem-level encryption is enabled

#### M4: `d` tag mismatch — server publishes `"global"`, clients filter by `hubId`

**Location**: `apps/worker/lib/nostr-events.ts:24` vs `src/client/lib/nostr/relay.ts:320–322`

Server events use `["d", "global"]`:
```typescript
tags: [['d', 'global'], ['t', 'llamenos:event']],
```

But client subscriptions filter by hub ID:
```typescript
const filter = { kinds: sub.kinds, '#d': [sub.hubId], '#t': ['llamenos:event'] }
```

**Impact**: This means client subscription filters would never match server events (they're looking for `d=hubId` but events have `d=global`). This suggests either (a) events are being matched differently than the code suggests, (b) strfry's subscription matching is more permissive, or (c) this is a latent bug where real-time events might not be delivered correctly in multi-hub scenarios.

**Recommendation**: Investigate and fix the tag mismatch. Server events should use `["d", hubId]` to enable proper per-hub routing. This is also a security concern: if all events use `d=global`, a user subscribed to one hub receives events for all hubs (and can attempt decryption of all of them).

#### M5: Event deduplication uses only event ID — no nonce or counter

**Location**: `src/client/lib/nostr/events.ts:31–44`

Deduplication relies solely on Nostr event IDs (SHA-256 of serialized event). This is cryptographically strong for preventing accidental duplicates, but:

1. If two events have different content but collide on the same ID (computationally infeasible with SHA-256, but worth noting), one would be silently dropped
2. The 5-minute TTL means memory is bounded but events older than 5 minutes cannot be deduplicated

**Impact**: Low — SHA-256 collision is infeasible. But the pattern doesn't defend against a malicious relay that modifies non-signed fields (there aren't any in NIP-01 — the entire event is signed).

**Recommendation**: No immediate action needed. The current implementation is sound for its purpose.

### Low

#### L1: No certificate pinning for relay connection

**Location**: Client WebSocket connections throughout

The client connects to the relay via WebSocket without certificate pinning. In Tauri, this could be hardened:

**Impact**: A sophisticated attacker with a valid TLS certificate (e.g., via compromised CA) could MITM the relay connection. Events are encrypted, so content is protected, but metadata (connection patterns, subscription filters) would be exposed.

**Recommendation**: Implement certificate pinning for the relay endpoint in Tauri's Rust backend. For mobile, use platform-specific certificate pinning (iOS: `URLSession` delegate, Android: `network-security-config.xml`).

#### L2: No event sequence verification for server-authoritative events

Server events (call:ring, call:answered, etc.) have no sequence number or causal ordering. A malicious relay could reorder events (delivering call:ended before call:answered).

**Impact**: UI inconsistency — but application state is primarily driven by API responses, not relay events. Relay events are notifications/hints.

**Recommendation**: Add monotonic sequence numbers to server-published events per hub. Clients can detect and warn about out-of-order delivery.

#### L3: `handleNIP42Auth` in server publisher doesn't verify the challenge

**Location**: `apps/worker/lib/nostr-publisher.ts:387–403`

The server's `handleNIP42Auth` signs and returns whatever challenge string the relay sends, without validating it:

```typescript
private handleNIP42Auth(challenge: string): void {
    // Signs the challenge without any validation
    const authEvent = finalizeEvent({ kind: KIND_NIP42_AUTH, ... })
```

**Impact**: A malicious relay could send crafted challenge strings. Per NIP-42, the challenge is opaque, so this is by design. But if the challenge were somehow reusable across relays, it could be a relay-to-relay auth forwarding attack. NIP-42 mitigates this with the `relay` tag in the auth event.

**Recommendation**: No immediate action — NIP-42's `relay` tag prevents cross-relay auth forwarding. Document this as a known trust assumption.

#### L4: `NoopNostrPublisher` silently drops all events

**Location**: `apps/worker/lib/nostr-publisher.ts:445–455`

When `SERVER_NOSTR_SECRET` is not configured, the `NoopNostrPublisher` silently discards all events:

```typescript
async publish(_template: EventTemplate): Promise<void> {
    // No relay configured — silently drop events
}
```

**Impact**: In misconfigured deployments, all real-time functionality fails silently. No warning is logged.

**Recommendation**: Log a warning on first publish attempt. Add a health check that reports real-time as degraded when using `NoopNostrPublisher`.

---

## Recommendations

| # | What | Why | Effort | Priority |
|---|------|-----|--------|----------|
| 1 | **Per-hub event key derivation** — `HKDF(secret, salt=hubId, info=label)` | C1: Single key decrypts all hubs; revoked users retain access | M | P0 |
| 2 | **Verify event publisher pubkey** — reject events not from server pubkey in `handleEvent()` | C2: Any valid Nostr keypair can inject events clients accept | S | P0 |
| 3 | **Ship strfry write-policy plugin** — whitelist server pubkey only | C3: Open relay accepts events from anyone | S | P0 |
| 4 | **Separate signing and encryption secrets** — or at minimum derive from independent HKDF paths | H1: Single secret compromise is total compromise | M | P1 |
| 5 | **Move hub key decrypt to Rust** — symmetric decrypt in CryptoState, not JS | H2: Webview exploit extracts hub key from JS memory | L | P1 |
| 6 | **Tighten event age limits** — 300s for regular events in production, consider all-ephemeral | H3: Relay can replay events within 24-hour window | S | P1 |
| 7 | **Fix NIP-42 auth state machine** — wait for relay OK before publishing | H4: Race condition on auth; silent failures | S | P1 |
| 8 | **Event key rotation epochs** — time-based key derivation with epoch in tags | H5: No forward secrecy for event encryption | L | P1 |
| 9 | **Fix `d` tag mismatch** — server events should use `hubId` not `"global"` | M4: Events may not route correctly in multi-hub; leaks cross-hub events | S | P1 |
| 10 | **Enforce `wss://` in production** — reject `ws://` relay URLs outside dev | M2: Unencrypted internal traffic exposes metadata | S | P2 |
| 11 | **Reduce outbox retention** — 5-minute cleanup for delivered events | M3: Metadata persists in DB longer than necessary | S | P2 |
| 12 | **Cover traffic for metadata protection** — dummy events during quiet periods | M1: Timing analysis reveals operational patterns | L | P2 |
| 13 | **Certificate pinning for relay** — Tauri + mobile platforms | L1: MITM with valid cert exposes metadata | M | P2 |
| 14 | **Event sequence numbers** — monotonic counter per hub per publisher | L2: Out-of-order delivery detection | S | P2 |
| 15 | **Log warning on NoopPublisher first use** | L4: Silent real-time failure in misconfigured deployments | S | P2 |

---

## Decisions to Review

### D1: Per-hub event keys vs. hub-key-encrypted events

**Chosen**: Per-hub event key derivation from server secret (Recommendation #1)
**Alternative A**: Use actual hub keys (client-side random 32 bytes) for relay event encryption instead of server-derived keys. This would mean the server cannot decrypt relay events at all.
**Alternative B**: Keep single server event key but rotate on member departure.
**Tradeoff**: Per-hub derivation is the minimum viable fix. Alternative A provides stronger zero-knowledge but requires the server to delegate event construction to clients (breaking the current architecture where the server publishes events on behalf of business logic). Alternative B doesn't solve the cross-hub leak.

### D2: All-ephemeral events vs. mixed persistent/ephemeral

**Chosen**: Keep mixed (current architecture) but tighten age limits
**Alternative**: Move all 12 regular event kinds (1000–1032) to ephemeral range (20000+)
**Tradeoff**: Ephemeral events are never persisted by the relay, eliminating the replay surface entirely. But the current architecture uses the PostgreSQL outbox for reliability — if the relay never stores events, clients that disconnect for more than 5 minutes miss events permanently. The outbox provides server-side reliability, but ephemeral-only would require clients to fetch missed events via REST API on reconnect (which already partially exists via `since` filters).

### D3: Server as sole publisher vs. client publishing

**Chosen**: Maintain server as sole event publisher (current architecture)
**Alternative**: Allow clients to publish directly to relay (presence, typing) signed with device keys
**Tradeoff**: Server-as-publisher is simpler and means only one key (server pubkey) needs to be whitelisted. But it means the server sees all event content before encryption (it constructs the events). Client publishing would enable true zero-knowledge for presence/typing, but requires a more complex write policy (maintain member pubkey allowlist) and clients need the hub key for encryption (which they already have).

### D4: Cover traffic complexity vs. metadata exposure

**Chosen**: Defer cover traffic to P2 (Recommendation #12)
**Alternative**: Implement immediately with constant-rate event publishing
**Tradeoff**: Cover traffic is the strongest defense against timing analysis but adds significant complexity (dummy event generation, bandwidth cost, client-side filtering). For pre-production, fixing C1–C3 provides much higher ROI. Cover traffic becomes more important post-launch when real adversaries are observing.

### D5: Move symmetric decrypt to Rust vs. keep in JS

**Chosen**: Recommend moving to Rust (Recommendation #5)
**Alternative**: Keep symmetric decrypt in JS, add memory scrubbing
**Tradeoff**: Moving to Rust aligns with the existing security model (device keys in Rust, hub keys in Rust), but requires a new Tauri IPC command and increases IPC call frequency (every received event triggers an IPC call). For mobile (UniFFI), this means every event goes through the FFI boundary. Performance testing needed. Memory scrubbing in JS is unreliable due to GC non-determinism.

---

## Implementation Plan Outline

### Phase 1: Critical fixes (P0) — Estimated 1–2 days

1. **Write-policy plugin** (Rec #3): Create `deploy/docker/write-policy.lua` that whitelists the server pubkey. Update `strfry-prod.conf` to reference it. Test with a second keypair being rejected.
2. **Publisher verification** (Rec #2): Add `event.pubkey !== this.serverPubkey` check in `RelayManager.handleEvent()`. One-line fix with test.
3. **Per-hub event keys** (Rec #1): Modify `deriveServerEventKey()` to accept `hubId` parameter. Update `publishNostrEvent()` to pass hub context. Update `/api/auth/me` to return per-hub keys. Update client `RelayManager` to use hub-specific keys.

### Phase 2: High-priority hardening (P1) — Estimated 3–5 days

4. **Fix `d` tag mismatch** (Rec #9): Update `publishNostrEvent()` to use hub-specific `d` tags. Update subscription filters to match. Ensure multi-hub routing works correctly.
5. **NIP-42 auth state machine** (Rec #7): Refactor auth handling in both `NodeNostrPublisher` and `RelayManager` to three-state: `unauthenticated → authenticating → authenticated`. Buffer events until relay confirms auth.
6. **Tighten event age limits** (Rec #6): Update `strfry-prod.conf` with 300s limits. Evaluate moving all kinds to ephemeral range.
7. **Event key rotation epochs** (Rec #8): Add epoch-based key derivation. Include epoch tag in events. Client maintains a small window of recent epoch keys.
8. **Separate signing/encryption derivation** (Rec #4): Use independent HKDF domains with proper separation. Consider splitting into two env vars.
9. **Hub key decrypt in Rust** (Rec #5): New Tauri IPC command `decrypt_hub_event(ciphertext, hub_id) -> plaintext`. Move XChaCha20-Poly1305 decrypt to CryptoState.

### Phase 3: Defense in depth (P2) — Estimated 2–3 days

10. **Enforce wss:// in production** (Rec #10)
11. **Reduce outbox retention** (Rec #11)
12. **NoopPublisher warning** (Rec #15)
13. **Event sequence numbers** (Rec #14)

### Phase 4: Advanced (future)

14. **Cover traffic** (Rec #12) — requires performance profiling
15. **Certificate pinning** (Rec #13) — platform-specific implementation
16. **Client-side publishing** (D3) — architectural shift, separate epic
