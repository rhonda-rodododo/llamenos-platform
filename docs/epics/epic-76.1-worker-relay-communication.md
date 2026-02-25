# Epic 76.1: Worker-to-Relay Communication Architecture

## Problem Statement

The security audit identified the MOST fundamental unresolved problem in the Epic 76 Nostr relay architecture: **Cloudflare Workers cannot maintain persistent WebSocket connections to external services.**

Epic 76 describes migrating all real-time events (call notifications, presence, messages) from the Llamenos server WebSocket to a Nostr relay. This requires the server (Cloudflare Worker or Durable Object) to **publish events to the relay**. However:

- CF Workers are stateless request/response handlers — they cannot hold a persistent WebSocket
- Durable Objects can hold outbound WebSockets, but lose them on hibernation (which happens after ~10 seconds of inactivity)
- NIP-42 authentication requires a round-trip handshake before publishing
- A new WebSocket + NIP-42 auth per event could add 200-500ms latency
- Call ring notifications must reach clients within 1 second of the telephony webhook

Without solving this, the entire Nostr relay architecture for Cloudflare deployments is blocked.

**Clean Rewrite Context:** Llamenos is pre-production with no deployed users. We can choose the optimal architecture without migration concerns. The solution must work for both deployment targets: Cloudflare Workers (cloud/demo) and Docker/Node.js (self-hosted).

## Goals

1. Determine the optimal architecture for server-to-relay event publishing on each deployment platform
2. Build proof-of-concept implementations measuring real-world latency
3. Meet the 1-second latency budget for call ring notifications
4. Document the chosen approach with rationale for both CF and Docker/Node deployments
5. If CF requires Nosflare modifications, fork and implement the necessary changes

## Architecture Options

### Option A: Per-Event WebSocket (Simple, Slow)

```
Telephony webhook → CF Worker → CallRouterDO
    │
    └─► Open new WebSocket to relay
        ├─► Complete NIP-42 auth handshake
        ├─► Publish signed Nostr event
        └─► Close connection
```

**Estimated latency:** 200-500ms per event

| Component | Estimated Time |
|-----------|---------------|
| TCP + TLS handshake | 50-150ms (depends on relay location) |
| WebSocket upgrade | 10-20ms |
| NIP-42 challenge + response | 50-100ms (round trip) |
| Event publish + OK response | 20-50ms |
| **Total** | **130-320ms** |

**Pros:**
- Simplest implementation — no infrastructure changes
- Works with any standard Nostr relay
- No state to manage between requests

**Cons:**
- High latency per event (may exceed budget for call notifications)
- Connection churn on the relay (hundreds of short-lived connections)
- TLS handshake overhead repeated for every event
- NIP-42 auth repeated for every event

**Verdict:** Viable as a fallback but unlikely to meet the 1-second end-to-end latency budget when combined with telephony webhook latency (~200-400ms from Twilio).

### Option B: DO Service Binding to Nosflare (Cloudflare-Specific) — RECOMMENDED FOR CF

```
Telephony webhook → CF Worker → CallRouterDO
    │
    └─► Service binding RPC call to Nosflare DO
        └─► Nosflare stores and broadcasts event internally
            └─► Connected clients receive event via existing WebSocket
```

**Estimated latency:** <10ms (internal RPC, no network)

Nosflare already runs as a Cloudflare Worker with Durable Objects in the same CF account. Service bindings allow Workers/DOs to call each other via internal RPC — no network round trip, no TLS, no WebSocket.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Account                         │
│                                                              │
│  ┌──────────────────┐  Service Binding   ┌───────────────┐  │
│  │ Llamenos Worker   │──────────────────►│ Nosflare       │  │
│  │ + DOs             │  (internal RPC)   │ Worker + DO    │  │
│  │                   │                   │                │  │
│  │ CallRouterDO      │                   │ Stores event   │  │
│  │ IdentityDO        │                   │ Broadcasts to  │  │
│  │ ConversationDO    │                   │ subscribers    │  │
│  └──────────────────┘                   └───────┬────────┘  │
│                                                  │           │
│                                          WebSocket│           │
│                                                  ▼           │
│                                          ┌───────────────┐  │
│                                          │ Clients        │  │
│                                          │ (volunteers)   │  │
│                                          └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation requirements:**

1. **Fork Nosflare** — add a DO service binding API alongside the existing WebSocket interface
2. **New Nosflare endpoint:** `RelayDO.publishEvent(signedEvent: NostrEvent): Promise<void>`
   - Validates event (signature, kind, etc.)
   - Stores in DO storage
   - Broadcasts to all connected subscribers matching the event's tags
   - Performs NIP-42 auth check against the event's pubkey (not via WebSocket challenge, but by verifying the event signature + checking the pubkey is authorized)
3. **Wrangler service binding config:**
   ```jsonc
   // wrangler.jsonc
   {
     "services": [
       {
         "binding": "NOSFLARE",
         "service": "llamenos-relay"
       }
     ]
   }
   ```
4. **Server-side publisher:**
   ```typescript
   // src/worker/lib/nostr-publisher.ts
   export class NostrPublisher {
     constructor(private env: Env) {}

     async publish(event: SignedNostrEvent): Promise<void> {
       // CF deployment: service binding
       if (this.env.NOSFLARE) {
         const relay = this.env.NOSFLARE.get(
           this.env.NOSFLARE.idFromName('relay')
         );
         await relay.publishEvent(event);
         return;
       }

       // Node deployment: persistent WebSocket (see Docker/Node section)
       await this.nodePublisher.publish(event);
     }
   }
   ```

**Pros:**
- Near-zero latency (internal RPC within CF)
- No WebSocket management on the publishing side
- No NIP-42 round-trip (auth via event signature verification)
- Same trust boundary (both Workers in same CF account)
- Most reliable option for CF deployments

**Cons:**
- Requires forking Nosflare and maintaining the fork
- CF-specific solution (Node.js deployment needs a different path)
- Adds coupling between Llamenos Worker and Nosflare Worker

**Verdict:** Recommended for Cloudflare deployments. The near-zero latency and elimination of WebSocket management make this the clear winner.

### Option C: HTTP Event Submission Bridge

```
Telephony webhook → CF Worker → CallRouterDO
    │
    └─► HTTP POST to bridge service
        └─► Bridge maintains persistent WebSocket to relay
            └─► Bridge publishes event via WebSocket
```

**Estimated latency:** 50-150ms (HTTP to bridge + bridge-to-relay publish)

**Architecture:**

A thin HTTP-to-WebSocket bridge deployed as either:
- Another CF Worker (same account) — but has the same WebSocket limitation
- A standalone sidecar service (e.g., on the same VPS for Docker deployments)
- A Cloudflare Durable Object that stays warm (possible but requires keep-alive)

**Pros:**
- Works with any Nostr relay (no relay modifications needed)
- Decoupled from relay implementation
- Bridge can be shared across multiple Workers

**Cons:**
- Additional infrastructure component to deploy and maintain
- HTTP round-trip latency (not zero like service binding)
- Bridge must maintain WebSocket health (reconnection, NIP-42 re-auth)
- If bridge is a CF Worker, same WebSocket limitation applies

**Verdict:** Viable for Node.js deployments where the bridge runs as a sidecar. For CF, Option B is strictly better.

### Option D: Relay HTTP API (NIP-86)

```
Telephony webhook → CF Worker → CallRouterDO
    │
    └─► HTTP POST to relay's HTTP event endpoint
        └─► Relay stores and broadcasts event
```

**Estimated latency:** 20-100ms (single HTTP request)

Some relays support HTTP event submission:
- **strfry** supports `strfry import` CLI and could be extended with an HTTP endpoint
- **Nosflare** could be extended to accept HTTP POST for event submission
- **NIP-86** defines a relay management API (not widely implemented)

**Pros:**
- No WebSocket from Worker at all
- Simple HTTP request (CF Workers excel at this)
- No connection management

**Cons:**
- Non-standard — most relays don't support HTTP submission
- Requires relay modifications (same effort as Option B for Nosflare)
- No real advantage over Option B for CF (service binding is faster than HTTP)
- For strfry: would require building an HTTP submission endpoint

**Verdict:** Not recommended as primary approach. For CF, Option B is faster. For Docker/Node, persistent WebSocket is simpler and more standard.

## Chosen Architecture

### Cloudflare Deployments: Option B (DO Service Binding)

**Rationale:**
- Near-zero latency meets the 1-second budget with headroom
- No WebSocket lifecycle management
- Same trust boundary (both in same CF account)
- Event authentication via signature verification (no NIP-42 round-trip)

### Docker/Node.js Deployments: Persistent WebSocket

Node.js processes CAN maintain persistent WebSocket connections. This is the standard approach for any server interacting with a Nostr relay.

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose / VPS                       │
│                                                              │
│  ┌──────────────────┐  Persistent WS   ┌────────────────┐  │
│  │ Llamenos Node.js  │────────────────►│ strfry relay    │  │
│  │ server            │  (maintained    │                 │  │
│  │                   │   connection)   │ SQLite/LMDB     │  │
│  └──────────────────┘                 └────────┬────────┘  │
│                                                 │           │
│                                         WebSocket│           │
│                                                 ▼           │
│                                         ┌───────────────┐  │
│                                         │ Clients        │  │
│                                         │ (volunteers)   │  │
│                                         └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// src/platform/node/nostr-publisher.ts
export class NodeNostrPublisher {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private reconnectAttempts = 0;
  private pendingEvents: SignedNostrEvent[] = [];
  private relayUrl: string;
  private serverSecretKey: Uint8Array;

  constructor(relayUrl: string, serverSecretKey: Uint8Array) {
    this.relayUrl = relayUrl;
    this.serverSecretKey = serverSecretKey;
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.relayUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // NIP-42 auth handled in onmessage
    };

    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data[0] === 'AUTH') {
        this.handleNIP42Auth(data[1]);
      } else if (data[0] === 'OK') {
        // Event accepted
      }
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.scheduleReconnect();
    };
  }

  private handleNIP42Auth(challenge: string): void {
    const authEvent = finalizeEvent({
      kind: 22242,
      tags: [
        ['relay', this.relayUrl],
        ['challenge', challenge],
      ],
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    }, this.serverSecretKey);

    this.ws!.send(JSON.stringify(['AUTH', authEvent]));
    this.authenticated = true;
    this.flushPendingEvents();
  }

  async publish(event: SignedNostrEvent): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      this.pendingEvents.push(event);
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        await this.connect();
      }
      return;
    }

    this.ws.send(JSON.stringify(['EVENT', event]));
  }

  private flushPendingEvents(): void {
    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()!;
      this.ws!.send(JSON.stringify(['EVENT', event]));
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      30000
    );
    setTimeout(() => this.connect(), delay);
  }
}
```

**Key design decisions:**
- Reconnection with exponential backoff (max 30 seconds)
- Event queue for events published during reconnection
- NIP-42 auth completes automatically on connect
- Single persistent connection (no connection-per-event overhead)

## Technical Design

### Nosflare Fork Requirements (CF Path)

The Nosflare fork needs minimal changes — add a DO method that accepts a pre-signed event:

```typescript
// In Nosflare's RelayDO (forked)
export class RelayDO extends DurableObject {
  // Existing WebSocket-based event handling...

  // NEW: Service binding entry point
  async publishEvent(event: NostrEvent): Promise<{ ok: boolean; message?: string }> {
    // 1. Verify event signature
    if (!verifyEvent(event)) {
      return { ok: false, message: 'invalid: signature verification failed' };
    }

    // 2. Check pubkey authorization (same logic as NIP-42)
    if (!this.isAuthorizedPubkey(event.pubkey)) {
      return { ok: false, message: 'restricted: unauthorized pubkey' };
    }

    // 3. Validate event kind and tags
    if (!this.validateEvent(event)) {
      return { ok: false, message: 'invalid: event validation failed' };
    }

    // 4. Store event
    await this.storeEvent(event);

    // 5. Broadcast to matching subscribers
    await this.broadcastToSubscribers(event);

    return { ok: true };
  }
}
```

**What stays the same in Nosflare:**
- WebSocket handling for client connections
- NIP-42 authentication for clients
- Event storage and retrieval
- Subscription management
- Rate limiting

**What changes:**
- New `publishEvent()` DO method (service binding entry point)
- Authorization check extracted to shared function (used by both WS and service binding paths)

### Unified NostrPublisher Interface

```typescript
// src/worker/lib/nostr-publisher.ts
export interface NostrPublisher {
  publish(event: SignedNostrEvent): Promise<void>;
}

// CF implementation
export class CFNostrPublisher implements NostrPublisher {
  constructor(private nosflareBinding: DurableObjectNamespace) {}

  async publish(event: SignedNostrEvent): Promise<void> {
    const stub = this.nosflareBinding.get(
      this.nosflareBinding.idFromName('relay')
    );
    const result = await stub.publishEvent(event);
    if (!result.ok) {
      throw new Error(`Relay rejected event: ${result.message}`);
    }
  }
}

// Node implementation
export class NodeNostrPublisher implements NostrPublisher {
  // ... persistent WebSocket implementation (see above)
}
```

### Server Event Signing

The server needs a Nostr keypair to sign events it publishes (call notifications, message assignments, etc.). This is separate from the admin keypair.

```typescript
// Server keypair derivation
// Deterministic from a secret — same server key across restarts
const serverSecretKey = hkdf(
  sha256,
  env.SERVER_SECRET, // New env var (32 bytes, generated once)
  'llamenos:server-nostr-key',
  'llamenos:server-nostr-key:v1',
  32
);
const serverPubkey = schnorr.getPublicKey(serverSecretKey);
```

The server pubkey must be:
1. Registered as an authorized publisher on the relay
2. Known to clients (fetched via `/api/config` or embedded in client build)
3. Clients verify event signatures — events from unknown pubkeys are rejected

### Latency Budget Analysis

End-to-end latency for a call ring notification:

```
Twilio webhook → CF Worker:          100-300ms (Twilio's webhook delivery)
CF Worker → CallRouterDO:             1-5ms   (DO routing)
CallRouterDO → sign Nostr event:      1-2ms   (Schnorr signature)
CallRouterDO → Nosflare DO:           1-5ms   (service binding RPC)
Nosflare → broadcast to subscribers:  1-5ms   (DO internal broadcast)
WebSocket → client:                   10-50ms (network, varies by client location)
Client event processing:              5-10ms  (decrypt + render notification)
─────────────────────────────────────────────
TOTAL (CF, Option B):                119-377ms ✅ (well within 1s budget)
TOTAL (CF, Option A per-event WS):   319-697ms ⚠️ (tight, may exceed with Twilio variance)
TOTAL (Node, persistent WS):         125-385ms ✅ (comparable to CF Option B)
```

Option B for CF and persistent WebSocket for Node both comfortably meet the 1-second budget.

## Nosflare Hardening Notes

### Cloudflare Trust Assessment

Even with all application logging removed from Nosflare, Cloudflare's infrastructure can still observe:

| Observable | Mitigation | Residual Risk |
|------------|------------|---------------|
| WebSocket connections (IP, timing) | Clients connect via Cloudflare proxy (IPs hidden from relay code) | CF itself sees connection metadata |
| Request/response metadata in Workers runtime | Remove all `console.log`, disable Workers analytics | CF runtime can still inspect |
| DO storage contents | Event content is E2EE (encrypted before publishing) | CF holds DO storage encryption keys |
| Worker execution timing | None — inherent to the platform | Activity pattern analysis possible |

**Key insight:** Nosflare provides protection against a **database-only subpoena** — if law enforcement obtains only the DO storage dump, events are encrypted blobs. However, Nosflare does NOT protect against Cloudflare itself as a cooperating adversary.

**Required Nosflare hardening:**
1. Remove ALL `console.log` / `console.error` statements
2. Disable Cloudflare Workers analytics (Logpush, tail)
3. Set event retention TTL (24 hours for ephemeral events)
4. Ensure no plaintext metadata in DO storage keys (use event IDs, not semantic names)
5. Rate limit per pubkey to prevent relay abuse

**For maximum privacy:** Operators should use self-hosted strfry, not Nosflare. Document this clearly.

## Implementation Phases

### Phase 1: Proof of Concept (1 week)

**Tasks:**

1. **PoC A: Per-event WebSocket from DO** — measure actual latency from a CF DO opening a WebSocket to a test Nostr relay, completing NIP-42, and publishing an event. Run 100 iterations, record p50/p95/p99.

2. **PoC B: Nosflare service binding** — fork Nosflare, add `publishEvent()` method, configure service binding, measure latency from a test Worker calling the method. Run 100 iterations.

3. **PoC Node: Persistent WebSocket** — connect a Node.js process to a strfry instance, measure publish latency under steady-state (connection already established). Run 100 iterations. Also measure reconnection time after forced disconnect.

4. **Document results** in `docs/architecture/relay-communication-poc.md`

**Deliverables:**
- Latency measurements for each approach
- Decision document with chosen approach per platform
- PoC code in a `scripts/relay-poc/` directory

### Phase 2: Nosflare Fork (1 week)

**Tasks (assuming PoC confirms Option B is best for CF):**

1. Fork Nosflare repository
2. Add `publishEvent()` DO method with signature verification
3. Extract authorization check to shared function
4. Remove all application logging
5. Configure event retention TTL
6. Add rate limiting per pubkey
7. Add health check endpoint
8. Deploy to test CF account
9. E2E test: Worker publishes event via service binding, client receives via WebSocket

**Deliverables:**
- Forked Nosflare with service binding API
- Deployed and tested on CF
- Documentation of changes from upstream

### Phase 3: Unified Publisher (0.5 weeks)

**Tasks:**

1. Implement `NostrPublisher` interface
2. Implement `CFNostrPublisher` (service binding)
3. Implement `NodeNostrPublisher` (persistent WebSocket)
4. Add server keypair generation and management
5. Wire publisher into platform abstraction layer
6. Add publisher to DO constructors (CallRouterDO, IdentityDO, ConversationDO, ShiftManagerDO, SettingsDO)

**Deliverables:**
- Publisher interface working on both platforms
- Server keypair configured and authorized on relay
- All DOs can publish events

### Phase 4: Docker/Node Integration (0.5 weeks)

**Tasks:**

1. Add strfry to `docker-compose.yml` with auth plugin
2. Implement Node.js persistent WebSocket publisher
3. Configure reconnection and event queuing
4. NIP-42 authentication on connect
5. Add server pubkey to strfry authorized pubkeys
6. E2E test: Node server publishes event, client receives via WebSocket

**Deliverables:**
- strfry running in Docker compose
- Node server publishing events via persistent WebSocket
- Reconnection and error handling tested

## Server Keypair Management

### Why the Server Needs Its Own Keypair

The server publishes events that originate from server-side logic:
- `call:ring` — triggered by telephony webhook (no human initiator)
- `message:new` — triggered by inbound SMS/WhatsApp webhook
- `settings:changed` — server confirms setting was stored
- `shift:update` — server confirms schedule change

These events cannot be signed by a volunteer or admin (they're server-initiated). The server needs its own Nostr identity.

### Server Key Is NOT the Admin Key

The server keypair is separate from the admin keypair:
- **Admin key:** Identity + decryption. Used for signing admin actions, decrypting admin envelopes.
- **Server key:** Event publishing only. Used for signing Nostr events that originate from server logic.

The server key can decrypt hub-encrypted event content (server needs to include call details in ring events). The server key is included in the hub's authorized publishers list.

### Key Storage

| Platform | Storage | Notes |
|----------|---------|-------|
| Cloudflare | Wrangler secret (`SERVER_NOSTR_SECRET`) | Set via `wrangler secret put` |
| Docker/Node | Environment variable or `.env` file | Set in `docker-compose.yml` |

## Dependencies

- **Blocked by:** Epic 76.0 (security foundations — domain labels needed for event encryption)
- **Blocks:** Epic 76 (Nostr relay sync — cannot proceed without server-to-relay communication)

## Success Criteria

1. **Latency**
   - [ ] CF (Option B): event publish latency <10ms p95
   - [ ] Node (persistent WS): event publish latency <50ms p95
   - [ ] End-to-end call ring notification: <1 second from telephony webhook to client

2. **Reliability**
   - [ ] Node publisher reconnects automatically after disconnection
   - [ ] Event queue drains after reconnection (no lost events)
   - [ ] CF service binding handles Nosflare DO errors gracefully

3. **Infrastructure**
   - [ ] Nosflare fork deployed with service binding API
   - [ ] strfry integrated into Docker compose with auth plugin
   - [ ] Server keypair generated and authorized on both relay types

4. **Documentation**
   - [ ] PoC results documented with latency measurements
   - [ ] Architecture decision record explaining chosen approach
   - [ ] Nosflare fork changes documented
   - [ ] Honest Cloudflare trust assessment documented

## Open Questions

1. **Nosflare upstream**: Should we attempt to contribute the service binding API upstream, or maintain a permanent fork? Recommendation: Maintain fork — the service binding API is specific to our use case, and upstream may not want to support it.

2. **Server key rotation**: How often should the server Nostr keypair be rotated? Recommendation: On each deployment (derived deterministically from `SERVER_NOSTR_SECRET`). If the secret rotates, the key rotates. Clients must accept events from the server's current pubkey (fetched from `/api/config`).

3. **Relay redundancy**: Should we support publishing to multiple relays for redundancy? Recommendation: Not initially. Single relay per deployment. Add redundancy in a future epic if needed.

4. **Event delivery guarantees**: What happens if the relay is down when the server tries to publish a critical event (e.g., `call:ring`)? Recommendation: For CF, the service binding will fail with an error — retry with exponential backoff (up to 3 retries over 2 seconds). For Node, the event queue handles this. If relay is down for extended period, fall back to REST API notification (degraded mode).

5. **DO hibernation and outbound WebSocket (Option A fallback)**: If Option B proves impractical for some reason, can a DO keep an outbound WebSocket alive? DOs hibernate after ~10s of inactivity and drop outbound connections. A keep-alive alarm every 9 seconds could prevent this but costs money (alarm invocations). This is why Option B is preferred — no outbound WebSocket needed.

## Estimated Effort

Medium — 3 weeks total. The Nosflare fork is the largest piece of work. PoC scripts and Node publisher are straightforward.
