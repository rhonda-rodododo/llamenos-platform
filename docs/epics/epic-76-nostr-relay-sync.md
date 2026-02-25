# Epic 76: Nostr Relay-Based Real-Time Sync

**Status:** Draft (rewritten 2026-02-25 after security audit)
**Dependencies:** Epic 76.0 (Relay Infrastructure) -> Epic 76.1 (Worker-to-Relay Bridge) -> Epic 76.2 (Hub Key Management) -> **This epic**

## Problem Statement

Currently, all real-time events (call notifications, presence updates, message events) flow through the Llamenos server via WebSocket (`/api/ws`). This means:

1. **Server sees all metadata**: Who is online, when calls happen, which volunteer answers
2. **Single point of failure**: Server downtime = no real-time updates
3. **Subpoena exposure**: Server logs contain activity patterns even if content is E2EE

By moving real-time sync to Nostr relays, we can:

- Reduce server-side metadata exposure to near-zero
- Enable true end-to-end encrypted event delivery
- Decouple real-time event propagation from server availability
- Leverage existing Nostr infrastructure

## Scope

**This epic rewrites the client-side real-time architecture.** It assumes:

- Epic 76.0 deployed the relay infrastructure (Nosflare or strfry)
- Epic 76.1 deployed the Worker-to-Relay bridge (server can publish events)
- Epic 76.2 deployed hub key management (random hub keys, REST distribution, rotation)

This epic covers:

- Client Nostr library (relay connection, subscriptions, event handling)
- Migrating all WebSocket event consumers to Nostr subscriptions
- Removing the WebSocket code entirely
- E2E tests for the new real-time architecture

## Architecture

### Design Principles

Two rules govern the entire architecture:

1. **REST for state mutations, Nostr for event propagation.** The server remains the authority for all state changes (call answered, call ended, conversation assigned). Clients POST to REST endpoints; the server publishes authoritative events to the relay after the DO confirms the mutation.

2. **REST for current state, Nostr for deltas.** On connect/reconnect, clients poll REST for the current snapshot (`GET /api/calls/active`, `GET /api/conversations`). Nostr events represent only changes after that snapshot.

```
┌──────────┐   REST (state mutations)   ┌──────────────┐
│  Client  │───────────────────────────►│   Server     │
│          │◄──────────────────────────│  (DO authority)│
│          │   REST (state snapshots)   │              │
└────┬─────┘                            └──────┬───────┘
     │                                          │
     │ Nostr subscriptions (E2EE deltas)        │ Nostr publish (authoritative events)
     │                                          │
     ▼                                          ▼
┌──────────────────────────────────────────────────────────┐
│                    Nostr Relay                             │
│  • Nosflare (CF Workers) or strfry (self-hosted)          │
│  • NIP-42 auth: only known hub members                    │
│  • Sees: encrypted blobs, pubkeys, timestamps             │
│  • Cannot see: event content, event types                 │
└──────────────────────────────────────────────────────────┘
```

### Server Identity

The server signs all Nostr events it publishes. Clients trust events from the server pubkey for authoritative state changes (call:answered, call:ended, shift:update).

- **Cloudflare deployment:** Server keypair stored as CF secret (`NOSTR_SERVER_NSEC`)
- **Docker/Node.js deployment:** Server keypair stored as env variable in `.env`
- **Client discovery:** Server pubkey returned via `GET /api/config` response (`nostrServerPubkey` field)
- **Trust model:** Clients verify `event.pubkey === serverPubkey` for all authoritative events. A forged `call:answered` from a non-server pubkey is ignored.

### Event Type and Kind Selection

**Rationale for kind selection:** Nostr event kinds have specific semantics that affect relay storage behavior. Using the wrong kind causes silent data loss.

| Kind Range | Behavior | Use In Llamenos |
|------------|----------|-----------------|
| 0-9999 (regular) | Relay stores indefinitely, returned on query | Persistent events: shift:update, settings:changed, volunteer:updated |
| 20000-29999 (ephemeral) | Relay forwards to subscribers but NEVER stores | Real-time signals: call:ring, call:answered, call:ended, presence, typing |
| 30000-39999 (parameterized replaceable) | Relay keeps only MOST RECENT per (pubkey, kind, d-tag) | **NOT USED** -- would drop simultaneous events |

**Why kind 30078 is wrong for real-time:** Kind 30078 is parameterized replaceable. If two calls ring simultaneously, the relay keeps only the latest `call:ring` event per server pubkey -- the first call notification is silently dropped. Volunteers miss calls. This is a critical correctness bug.

### Event Tag Design: Eliminating Metadata Leakage

**Problem:** Tags like `["t", "llamenos:call:ring"]` in plaintext tell the relay exactly what is happening -- call volume, answer rate, shift changes. This is operational metadata that aids traffic analysis.

**Solution:** All events use a single generic tag. The actual event type is inside the encrypted content.

```json
{
  "kind": 20001,
  "pubkey": "<server or volunteer pubkey>",
  "created_at": 1709000000,
  "tags": [
    ["d", "<hub_id>"],
    ["t", "llamenos:event"]
  ],
  "content": "<encrypted JSON including { type: 'call:ring', ... }>",
  "sig": "<signature>"
}
```

The relay sees only `llamenos:event` for every event. Clients decrypt the content, then route by the `type` field inside.

### Complete Event Inventory

Every event type, its kind, publisher, encryption, and recipients:

| Event Type | Kind | Publisher | Encryption | Recipients | Notes |
|------------|------|-----------|------------|------------|-------|
| `call:ring` | 20001 (ephemeral) | Server | Hub key (XChaCha20) | All hub members | All on-shift ring simultaneously |
| `call:answered` | 20001 (ephemeral) | **Server only** | Hub key (XChaCha20) | All hub members | Server publishes AFTER DO confirms; clients never publish this |
| `call:ended` | 20001 (ephemeral) | **Server only** | Hub key (XChaCha20) | All hub members | Same authority model as call:answered |
| `call:spam` | N/A | N/A | N/A | N/A | REST only: `POST /api/calls/{callId}/spam` (no relay event needed) |
| `presence:update` | 20001 (ephemeral) | Volunteer | See RBAC section below | Hub members / admins | Two separate events for RBAC |
| `voicemail:new` | 20001 (ephemeral) | Server | Hub key (XChaCha20) | All hub members | New voicemail notification |
| `message:new` | 20001 (ephemeral) | Server | NIP-44 per-recipient | Assigned volunteer | ECIES for specific volunteer |
| `message:assigned` | 20001 (ephemeral) | Server | NIP-44 per-recipient | Assigned volunteer + admins | Two events: one per-volunteer, one per-admin |
| `message:typing` | 20001 (ephemeral) | Volunteer | Hub key (XChaCha20) | Hub members | 2000ms debounce; see typing section |
| `shift:update` | 1 (regular) | Server | Hub key (XChaCha20) | All hub members | Persistent -- needs queryability on reconnect |
| `settings:changed` | 1 (regular) | Server | Hub key (XChaCha20) | All hub members | Persistent |
| `volunteer:updated` | 1 (regular) | Server | Per-admin ECIES | Admins only | Admin-targeted events |
| `note:saved` | 20001 (ephemeral) | Volunteer | Hub key (XChaCha20) | All hub members | Notification only; actual note via REST |

**Missing from original epic, now documented:**
- `voicemail:new` -- added to inventory
- `calls:sync` -- handled by REST on reconnect (`GET /api/calls/active`), no Nostr equivalent needed
- `conversations:sync` -- handled by REST on reconnect (`GET /api/conversations`), no Nostr equivalent needed

### Presence RBAC

The current WebSocket deliberately sends different data to admins vs volunteers:
- **Volunteers** see: `{ hasAvailable: boolean }` (someone is online, but not who or how many)
- **Admins** see: `{ available: number, onCall: number, total: number }`

With a shared hub key, everyone can decrypt the same content. To preserve RBAC, presence publishes **two separate events**:

1. **Hub-key encrypted** (all members can read):
   ```json
   {
     "type": "presence:summary",
     "hasAvailable": true
   }
   ```

2. **Per-admin ECIES encrypted** (only admins can read):
   ```json
   {
     "type": "presence:detail",
     "available": 3,
     "onCall": 1,
     "total": 7
   }
   ```

The server aggregates presence and publishes both events. Individual volunteers publish their own status updates; the server collects these and re-publishes the aggregated summaries.

**Security reasoning:** If a volunteer nsec is compromised, the attacker learns only "someone is available" -- not the count, not who. Admin operational data (staffing levels) requires admin key compromise.

### Call Answer Authority

**Problem:** In the current DO, answering a call is atomically serialized -- the first `answer` message wins, and the DO rejects subsequent attempts. With Nostr, two volunteers could both publish `call:answered` simultaneously. There is no canonical truth.

**Solution:** The server is the sole authority for call state mutations. The flow:

```
1. Volunteer clicks "Answer"
   │
   ▼
2. Client POSTs to: POST /api/calls/{callId}/answer
   │
   ▼
3. CallRouterDO atomically:
   - Checks call is still ringing
   - Assigns volunteer
   - Connects telephony
   │
   ▼
4. IF successful: Server publishes authoritative call:answered to relay
   IF rejected (already answered): Returns 409 to client
   │
   ▼
5. All clients receive call:answered from server pubkey
   - Verify event.pubkey === serverPubkey
   - Remove call from ringing list
   - Show "answered by {volunteer}" UI
```

**Clients NEVER publish `call:answered` or `call:ended` events.** Only the server does, after the DO confirms the state change. Any `call:answered` event from a non-server pubkey is silently ignored.

### State Sync on Reconnect

**Problem:** The current WebSocket pushes `calls:sync` and `conversations:sync` immediately on connect. Nostr ephemeral events are not stored -- if the client was offline when `call:ring` was published, the event is lost.

**Solution:** On connect/reconnect, clients poll REST for current state:

```
1. Client connects to relay (NIP-42 auth)
   │
   ▼
2. Client immediately polls REST:
   - GET /api/calls/active      → current ringing/active calls
   - GET /api/conversations      → current conversation list
   - GET /api/shifts/current     → current shift info
   │
   ▼
3. Client subscribes to Nostr relay for delta events
   │
   ▼
4. From this point, only NEW events arrive via Nostr
   - New call:ring, call:answered, etc.
   - State mutations still go through REST
```

For persistent events (kind 1: shift:update, settings:changed), the client can also query the relay for recent events since last seen timestamp using a `since` filter.

### Content Encryption

Hub key management is defined in Epic 76.2. This section covers how encryption is applied to events.

**Hub broadcast events** (call:ring, presence:summary, shift:update, etc.):
- Encrypt with XChaCha20-Poly1305 using hub key + random 24-byte nonce
- Nonce prepended to ciphertext
- All hub members hold the hub key and can decrypt

```typescript
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

function encryptForHub(content: object, hubKey: Uint8Array): string {
  const plaintext = utf8ToBytes(JSON.stringify(content))
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(hubKey, nonce)
  const ciphertext = cipher.encrypt(plaintext)
  // Prepend nonce to ciphertext, encode as base64
  const combined = new Uint8Array(nonce.length + ciphertext.length)
  combined.set(nonce)
  combined.set(ciphertext, nonce.length)
  return btoa(String.fromCharCode(...combined))
}

function decryptFromHub(encrypted: string, hubKey: Uint8Array): object {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const nonce = combined.slice(0, 24)
  const ciphertext = combined.slice(24)
  const cipher = xchacha20poly1305(hubKey, nonce)
  const plaintext = cipher.decrypt(ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}
```

**Targeted events** (message:new, message:assigned to specific volunteer, volunteer:updated to admins):
- Use NIP-44 properly via `nip44.getConversationKey(senderSK, recipientPK)`
- This derives a shared secret correctly per the NIP-44 spec

```typescript
import { nip44 } from 'nostr-tools/nip44'

function encryptForRecipient(
  content: object,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
): string {
  const conversationKey = nip44.getConversationKey(senderSecretKey, recipientPubkey)
  return nip44.encrypt(JSON.stringify(content), conversationKey)
}

function decryptFromSender(
  encrypted: string,
  recipientSecretKey: Uint8Array,
  senderPubkey: string,
): object {
  const conversationKey = nip44.getConversationKey(recipientSecretKey, senderPubkey)
  return JSON.parse(nip44.decrypt(encrypted, conversationKey))
}
```

**What changed from original epic:**
- Removed NIP-44 misuse (raw symmetric key). NIP-44's `encrypt`/`decrypt` expect a conversation key derived from an ECDH, not a raw symmetric key.
- Hub broadcast uses XChaCha20-Poly1305 directly with the hub symmetric key.
- Targeted messages use NIP-44 properly via `getConversationKey()`.

### Hub Key Distribution

Hub key management (generation, distribution, rotation, versioning) is defined in Epic 76.2. The key points relevant to this epic:

- **Hub key is random** (not derived from admin nsec). Epic 76.2 replaced the HKDF-from-admin-secret design.
- **Distribution via REST:** New volunteer fetches their ECIES-wrapped hub key from `GET /api/hub/key` after invite acceptance.
- **Ordering for new volunteers:** Invite -> relay ACL updated -> volunteer fetches hub key via REST -> volunteer subscribes to relay.
- **Key version included in events:** Each encrypted event includes the key version in a prefix byte so recipients know which key to use for decryption.
- **Rotation on member removal:** Admin removes volunteer -> server generates new hub key -> distributes to remaining members via REST -> relay ACL removes old pubkey.

## Implementation

### Phase 1: Client Nostr Library (2 weeks)

#### 1.1 Core Relay Connection

**New files:**

```
src/client/lib/nostr/
  index.ts           # Public API
  relay.ts           # Connection management
  events.ts          # Event creation, validation, routing
  subscriptions.ts   # Subscription lifecycle
  encryption.ts      # Hub key + NIP-44 encryption
  types.ts           # TypeScript types
```

**RelayManager -- correct NIP-42 auth and iterative reconnection:**

```typescript
// src/client/lib/nostr/relay.ts
import { Relay } from 'nostr-tools/relay'
import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import type { Event as NostrEvent, Filter } from 'nostr-tools/core'

interface RelayManagerOptions {
  relayUrl: string
  serverPubkey: string
  getSecretKey: () => Uint8Array | null
}

export class RelayManager {
  private relay: Relay | null = null
  private relayUrl: string
  private serverPubkey: string
  private getSecretKey: () => Uint8Array | null
  private subscriptions = new Map<string, { close: () => void }>()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  private static readonly MAX_RECONNECT_DELAY = 30_000
  private static readonly BASE_RECONNECT_DELAY = 1_000
  private static readonly MAX_RECONNECT_ATTEMPTS = 20

  constructor(options: RelayManagerOptions) {
    this.relayUrl = options.relayUrl
    this.serverPubkey = options.serverPubkey
    this.getSecretKey = options.getSecretKey
  }

  async connect(): Promise<void> {
    if (this.destroyed) return

    try {
      this.relay = await Relay.connect(this.relayUrl)

      // Wire up NIP-42 auth BEFORE any subscriptions
      this.relay.onauth = async (challenge: string) => {
        const sk = this.getSecretKey()
        if (!sk) throw new Error('Key manager locked')

        const authEvent = finalizeEvent({
          kind: 22242,
          tags: [
            ['relay', this.relayUrl],
            ['challenge', challenge],
          ],
          content: '',
          created_at: Math.floor(Date.now() / 1000),
        }, sk)

        // Send auth event back to relay
        await this.relay!.auth(authEvent)
      }

      // Handle CLOSED messages with auth-required
      this.relay.onclose = () => {
        if (!this.destroyed) {
          this.scheduleReconnect()
        }
      }

      this.reconnectAttempts = 0
    } catch {
      this.scheduleReconnect()
    }
  }

  /**
   * Subscribe to hub events. Returns a subscription ID for cleanup.
   * Synchronous return -- handles async relay internals.
   */
  subscribe(
    hubId: string,
    filters: Partial<Filter>,
    handler: (event: NostrEvent) => void,
  ): string {
    const subId = crypto.randomUUID()

    if (!this.relay) {
      // Queue subscription for when relay connects
      return subId
    }

    const sub = this.relay.subscribe(
      [{
        ...filters,
        '#d': [hubId],
        '#t': ['llamenos:event'],
      }],
      {
        onevent: (event: NostrEvent) => {
          if (verifyEvent(event)) {
            handler(event)
          }
        },
        onclosed: (reason: string) => {
          if (reason.startsWith('auth-required:')) {
            // Re-authenticate and resubscribe
            this.relay?.onauth?.('')
          }
        },
      },
    )

    this.subscriptions.set(subId, sub)
    return subId
  }

  async publish(event: NostrEvent): Promise<void> {
    if (!this.relay) throw new Error('Relay not connected')
    await this.relay.publish(event)
  }

  unsubscribe(subId: string): void {
    const sub = this.subscriptions.get(subId)
    if (sub) {
      sub.close()
      this.subscriptions.delete(subId)
    }
  }

  /**
   * Iterative reconnection with exponential backoff + jitter.
   * NOT recursive -- uses setTimeout, matching existing ws.ts pattern.
   */
  private scheduleReconnect(): void {
    if (this.destroyed) return
    if (this.reconnectAttempts >= RelayManager.MAX_RECONNECT_ATTEMPTS) return

    const delay = Math.min(
      RelayManager.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      RelayManager.MAX_RECONNECT_DELAY,
    )
    const jitter = Math.random() * 500

    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay + jitter)
  }

  close(): void {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    for (const sub of this.subscriptions.values()) {
      sub.close()
    }
    this.subscriptions.clear()
    this.relay?.close()
    this.relay = null
  }
}
```

**Key differences from original epic:**
- Uses `Relay` class (not `SimplePool`) for proper NIP-42 `onauth` support
- `scheduleReconnect()` is iterative (setTimeout), not recursive
- `subscribe()` returns synchronously -- no async leak in useEffect
- `onauth` wired up before first subscription
- Handles `CLOSED auth-required` by re-authenticating

#### 1.2 Event Replay Protection

```typescript
// src/client/lib/nostr/events.ts

const MAX_EVENT_AGE = 5 * 60 * 1000 // 5 minutes

/**
 * Time-bucketed deduplication. Events are stored in 1-minute buckets.
 * Every minute, buckets older than MAX_EVENT_AGE are pruned.
 * Memory is bounded to ~5 minutes worth of event IDs.
 */
class EventDeduplicator {
  private buckets = new Map<number, Set<string>>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    // Prune expired buckets every 60 seconds
    this.cleanupTimer = setInterval(() => this.prune(), 60_000)
  }

  private getBucketKey(timestampMs: number): number {
    return Math.floor(timestampMs / 60_000) // 1-minute buckets
  }

  isNew(event: { id: string; created_at: number }): boolean {
    const eventTimeMs = event.created_at * 1000
    const age = Date.now() - eventTimeMs

    // Reject events older than MAX_EVENT_AGE
    if (age > MAX_EVENT_AGE) return false

    const bucketKey = this.getBucketKey(eventTimeMs)
    let bucket = this.buckets.get(bucketKey)

    if (bucket?.has(event.id)) return false

    if (!bucket) {
      bucket = new Set()
      this.buckets.set(bucketKey, bucket)
    }
    bucket.add(event.id)
    return true
  }

  private prune(): void {
    const cutoff = this.getBucketKey(Date.now() - MAX_EVENT_AGE)
    for (const [key] of this.buckets) {
      if (key < cutoff) {
        this.buckets.delete(key)
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
    this.buckets.clear()
  }
}
```

**What changed from original epic:** The `processedEvents` Set grew unbounded. This implementation uses time-bucketed pruning -- memory is bounded to ~5 minutes of event IDs, with automatic cleanup every 60 seconds.

#### 1.3 React Integration

Correct useEffect pattern -- subscribe returns synchronously, cleanup works:

```typescript
// src/client/lib/nostr/hooks.ts

import { useEffect, useRef } from 'react'
import type { Event as NostrEvent } from 'nostr-tools/core'

/**
 * Subscribe to hub events via Nostr relay.
 * Handles cleanup correctly -- subscribe() is synchronous.
 */
export function useNostrSubscription(
  relayManager: RelayManager | null,
  hubId: string | null,
  filters: Partial<Filter>,
  handler: (event: NostrEvent) => void,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!relayManager || !hubId) return

    // subscribe() is synchronous -- returns subId immediately
    const subId = relayManager.subscribe(
      hubId,
      filters,
      (event) => handlerRef.current(event),
    )

    // Cleanup is also synchronous -- no async leak
    return () => relayManager.unsubscribe(subId)
  }, [relayManager, hubId, filters])
}
```

**What changed from original epic:** The original had `relayManager.subscribe()` as async, which meant the useEffect cleanup received a Promise as the subId -- a no-op unsubscribe. Now `subscribe()` is synchronous.

### Phase 2: Migrate Call Events (2 weeks)

#### 2.1 Client-Side Call Event Handling

Replace `useCalls()` WebSocket subscriptions with Nostr + REST:

```typescript
// src/client/lib/hooks.ts (modified)

export function useCalls() {
  const { relayManager, hubKey, serverPubkey } = useNostr()
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [currentCall, setCurrentCall] = useState<ActiveCall | null>(null)

  // 1. On mount / reconnect: poll REST for current state
  useEffect(() => {
    listActiveCalls().then(activeCalls => {
      setCalls(activeCalls)
    })
  }, [])

  // 2. Subscribe to Nostr for delta events
  useNostrSubscription(
    relayManager,
    currentHubId,
    { kinds: [20001] }, // ephemeral events
    (event) => {
      // Only trust call state events from server pubkey
      if (event.pubkey !== serverPubkey) return

      const content = decryptFromHub(event.content, hubKey)
      if (!content?.type) return

      switch (content.type) {
        case 'call:ring':
          setCalls(prev => [...prev, content as ActiveCall])
          startRinging('Incoming Call!')
          break

        case 'call:answered':
          setCalls(prev => prev.filter(c => c.callId !== content.callId))
          stopRinging()
          break

        case 'call:ended':
          setCalls(prev => prev.filter(c => c.callId !== content.callId))
          stopRinging()
          break

        case 'voicemail:new':
          // Show voicemail notification
          break
      }
    },
  )

  // 3. Answer call via REST (server is authority)
  const answerCall = useCallback(async (callId: string) => {
    const response = await fetch(`/api/calls/${callId}/answer`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (response.status === 409) {
      // Already answered by someone else
      setCalls(prev => prev.filter(c => c.id !== callId))
      return
    }
    if (!response.ok) throw new Error('Failed to answer call')
    const call = await response.json()
    setCurrentCall(call)
  }, [])

  return { calls, currentCall, answerCall }
}
```

#### 2.2 Server-Side Call Event Publishing

See Epic 76.1 for Worker-to-Relay bridge design. The CallRouterDO changes:

```typescript
// src/worker/durable-objects/call-router.ts (modified)

async handleIncomingCall(call: IncomingCall): Promise<void> {
  // ... existing call setup logic ...

  // Publish to Nostr relay via bridge (Epic 76.1)
  await this.relayBridge.publish({
    hubId: call.hubId,
    content: {
      type: 'call:ring',
      callId: call.id,
      callerLast4: call.callerLast4,
      timestamp: Date.now(),
    },
    encryption: 'hub', // hub key broadcast
  })
}

async handleCallAnswered(callId: string, volunteerPubkey: string): Promise<Response> {
  // Atomic: check + assign in DO
  const call = this.activeCalls.get(callId)
  if (!call || call.status !== 'ringing') {
    return new Response(null, { status: 409 }) // Already answered
  }

  call.status = 'in-progress'
  call.volunteer = volunteerPubkey
  // ... connect telephony ...

  // THEN publish authoritative event
  await this.relayBridge.publish({
    hubId: this.getHubId(callId),
    content: {
      type: 'call:answered',
      callId,
      volunteerPubkey,
      timestamp: Date.now(),
    },
    encryption: 'hub',
  })

  return new Response(JSON.stringify(call))
}
```

### Phase 3: Migrate Presence (1 week)

#### 3.1 Volunteer Presence Publishing

Volunteers publish their own status. The server aggregates and re-publishes RBAC-split summaries.

```typescript
// src/client/lib/presence.ts (modified)

export function usePresence() {
  const { relayManager, hubKey } = useNostr()

  const setStatus = useCallback(async (status: PresenceStatus) => {
    // POST to REST -- server aggregates and publishes to relay
    await fetch('/api/presence', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    })
  }, [])

  // Subscribe to presence events from server
  useNostrSubscription(
    relayManager,
    currentHubId,
    { kinds: [20001] },
    (event) => {
      const content = tryDecryptFromHub(event.content, hubKey)
      if (!content) return

      if (content.type === 'presence:summary') {
        // All members: { hasAvailable: boolean }
        setHasAvailable(content.hasAvailable)
      }
      // Admins also try to decrypt the per-admin event
      if (isAdmin) {
        const detail = tryDecryptForMe(event.content)
        if (detail?.type === 'presence:detail') {
          setPresenceDetail(detail)
        }
      }
    },
  )
}
```

#### 3.2 Server Presence Aggregation

The server collects individual status updates via REST, aggregates, and publishes two events:

1. Hub-key encrypted: `{ type: "presence:summary", hasAvailable: boolean }`
2. Per-admin ECIES encrypted: `{ type: "presence:detail", available: N, onCall: N, total: N }`

This preserves the existing RBAC where volunteers see only boolean availability and admins see full counts.

### Phase 4: Migrate Message Events (1.5 weeks)

#### 4.1 Message Notifications

```typescript
// Server publishes targeted notification to assigned volunteer
await this.relayBridge.publish({
  hubId: this.hubId,
  content: {
    type: 'message:new',
    threadId: thread.id,
    channelType: message.channel,
    preview: message.content.substring(0, 50),
    timestamp: Date.now(),
  },
  encryption: 'targeted',
  recipientPubkey: thread.assignedVolunteer,
})
```

#### 4.2 Typing Indicators

Typing indicators are ephemeral and low-priority. Design considerations:

- **Kind 20001 (ephemeral):** Relay forwards but never stores. Appropriate.
- **Debounce: 2000ms** (increased from 500ms). Signing Schnorr on every keystroke burst is expensive. 2-second debounce is sufficient for "user is typing" UX.
- **Hub key encryption:** Typing is non-sensitive metadata. Hub key is fine.

```typescript
const sendTyping = useDebouncedCallback(async () => {
  const sk = getSecretKey()
  if (!sk || !relayManager) return

  const content = encryptForHub(
    { type: 'message:typing', threadId, isTyping: true },
    hubKey,
  )

  const event = finalizeEvent({
    kind: 20001,
    tags: [['d', hubId], ['t', 'llamenos:event']],
    content,
    created_at: Math.floor(Date.now() / 1000),
  }, sk)

  await relayManager.publish(event)
}, 2000) // 2 second debounce
```

### Phase 5: Migrate Admin Events (1 week)

Shift updates, settings changes, and volunteer updates follow the same pattern:

1. Admin makes change via REST API
2. Server DO processes the mutation
3. Server publishes event to relay via bridge (Epic 76.1)
4. Clients receive and process

Shift and settings events use kind 1 (regular, stored) so they survive reconnection. On reconnect, clients can query the relay for recent shift/settings events with `since` filter.

### Phase 6: WebSocket Removal (1 week)

#### 6.1 Remove Server WebSocket

```diff
// src/worker/api/index.ts
- import { wsHandler } from './ws'
- app.get('/api/ws', wsHandler)
```

#### 6.2 Remove Client WebSocket

```diff
- // src/client/lib/ws.ts — DELETE ENTIRE FILE
```

#### 6.3 Update All Consumers

Every component that imports from `ws.ts`:

- [ ] `src/client/lib/hooks.ts` -- Replace `onMessage()` with `useNostrSubscription()`
- [ ] `src/client/routes/index.tsx` -- Replace WS presence with Nostr presence
- [ ] `src/client/App.tsx` -- Replace WS provider with Nostr provider
- [ ] `src/client/lib/auth.tsx` -- Remove WS auth

#### 6.4 Remove Platform WebSocket Polyfill

The Node.js platform includes a `WebSocketPair` polyfill for the server-side WebSocket endpoint. Once WebSocket is removed, this polyfill can also be removed:

```diff
- // src/platform/node/websocket-pair.ts — DELETE
```

### Phase 7: Testing and Hardening (1 week)

#### 7.1 E2E Tests

```typescript
// tests/nostr-relay.spec.ts

test.describe('Nostr Relay Sync', () => {
  test('incoming call notification flows through relay', async ({ page }) => {
    // 1. Login as volunteer
    await loginAsVolunteer(page)

    // 2. Simulate incoming call via telephony webhook
    await simulateIncomingCall()

    // 3. Verify call notification appears (came via Nostr)
    await expect(page.getByTestId('incoming-call')).toBeVisible()

    // 4. Answer via UI (REST to server)
    await page.getByTestId('answer-call').click()

    // 5. Verify call answered UI
    await expect(page.getByTestId('active-call')).toBeVisible()
  })

  test('state syncs on reconnect', async ({ page }) => {
    // 1. Login, get a call ringing
    // 2. Simulate relay disconnect
    // 3. Verify client polls REST for current state
    // 4. Verify ringing call still visible after reconnect
  })

  test('presence RBAC: volunteer sees boolean only', async ({ page }) => {
    // Login as volunteer, verify only hasAvailable shown
  })

  test('presence RBAC: admin sees full counts', async ({ page }) => {
    // Login as admin, verify available/onCall/total shown
  })

  test('call answer race: second volunteer gets 409', async ({ context }) => {
    const page1 = await context.newPage()
    const page2 = await context.newPage()
    // Both answer simultaneously, one gets 409
  })
})
```

#### 7.2 Performance Testing

- [ ] Event latency benchmarks (relay to client, target <100ms)
- [ ] Subscription scaling (100+ concurrent connections per hub)
- [ ] Memory profiling (verify EventDeduplicator stays bounded)
- [ ] Reconnection reliability under network flap

#### 7.3 Security Verification

- [ ] Event signature verification (reject unsigned/invalid)
- [ ] Hub key encryption correctness (decrypt with correct key only)
- [ ] Event type hidden in encrypted content (relay cannot see type)
- [ ] Non-server call:answered events ignored
- [ ] Presence RBAC enforced (volunteer cannot see admin detail)
- [ ] NIP-42 auth enforced (unauthorized pubkeys rejected by relay)

## Nosflare Hardening

For Cloudflare deployments using Nosflare:

### Security Configuration

```typescript
// nosflare config
export const config = {
  maxEventSize: 64 * 1024, // 64KB
  maxSubscriptions: 100,
  rateLimits: {
    eventsPerMinute: 60,
    subscriptionsPerMinute: 20,
  },
  auth: {
    required: true,
    allowedKinds: [1, 20001, 22242], // regular, ephemeral, NIP-42 auth
  },
}
```

### Honest Cloudflare Trust Assessment

**What Nosflare protects against:**
- **Database-only subpoena**: If someone obtains a copy of the relay's Durable Object storage, they get only encrypted event blobs. Event content is unreadable without hub keys.
- **Casual observation**: Cloudflare support staff browsing DO data cannot read events.

**What Nosflare does NOT protect against:**
- **Cloudflare as active adversary**: Cloudflare operates the Workers runtime. They can inspect memory, intercept WebSocket frames, and observe connection metadata in real-time. No amount of relay hardening changes this -- it is inherent to running code on someone else's infrastructure.
- **Connection metadata**: Cloudflare sees which IP addresses connect to the relay, when, and how frequently. This reveals operational tempo even though event content is encrypted.
- **Traffic analysis**: Event sizes and timing patterns are observable. Two events in quick succession after a `call:ring` (the ring + an answer) are distinguishable from background noise.

**This is acceptable because:**
- You already trust Cloudflare for the main Llamenos Worker (same trust boundary)
- The relay runs on the same CF account as your app -- no additional trust party
- For maximum relay privacy, use the Docker/strfry deployment where you control the hardware

### strfry Deployment (Self-Hosted)

For operators wanting maximum privacy, strfry runs on infrastructure they control:

```yaml
# docker-compose.yml addition
services:
  nostr-relay:
    image: dockurr/strfry:latest
    ports:
      - "7777:7777"
    volumes:
      - nostr-data:/app/strfry-db
      - ./strfry.conf:/app/strfry.conf:ro
```

With strfry, the operator controls the hardware. Connection metadata, traffic patterns, and all relay data remain within their infrastructure boundary.

## Components Requiring Changes

### Client Components

| Component | Current | After |
|-----------|---------|-------|
| `src/client/lib/ws.ts` | WebSocket connection to server | **DELETE** -- replaced by `src/client/lib/nostr/relay.ts` |
| `src/client/lib/hooks.ts` | `onMessage()` for WS events | `useNostrSubscription()` + REST polling on mount |
| `src/client/lib/call-store.ts` | Receives WS call events | Subscribe to Nostr call events + REST answer |
| `src/client/lib/presence.ts` | Sends/receives presence via WS | REST POST status + Nostr subscribe for aggregated presence |
| `src/client/components/CallNotification.tsx` | Listens to WS | Listens to Nostr |
| `src/client/components/PresenceIndicator.tsx` | WS presence data | Nostr presence data (RBAC-split) |
| `src/client/routes/index.tsx` | WS for real-time dashboard | Nostr subscriptions + REST polling |
| `src/client/routes/conversations.tsx` | WS message notifications | Nostr message events |

### Server Components

| Component | Current | After |
|-----------|---------|-------|
| `src/worker/api/ws.ts` | WebSocket endpoint | **DELETE** -- replaced by relay bridge (Epic 76.1) |
| `src/worker/durable-objects/call-router.ts` | WS broadcasts | Relay bridge publish |
| `src/worker/durable-objects/identity.ts` | WS presence broadcasts | Relay bridge publish (RBAC-split) |
| `src/worker/durable-objects/conversation.ts` | WS message notifications | Relay bridge publish (targeted) |
| `src/worker/durable-objects/shift-manager.ts` | WS shift updates | Relay bridge publish (kind 1) |
| `src/worker/durable-objects/settings.ts` | WS settings broadcasts | Relay bridge publish (kind 1) |

### Shared Types

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add Nostr event content types, relay config types |
| `src/shared/events.ts` (new) | Event content schemas, type discriminators |

## Implementation Approach

### Clean Rewrite (No Migration)

Since Llamenos is pre-production with no deployed users:

1. **Delete WebSocket code entirely** -- no parallel operation, no feature flags
2. **Build Nostr-first** -- all real-time events designed for relay
3. **No legacy support** -- no backwards compatibility

### Dependency on Pre-Implementation Epics

This epic CANNOT start until:

- **Epic 76.0** (Relay Infrastructure): Relay deployed, NIP-42 configured, health monitoring
- **Epic 76.1** (Worker-to-Relay Bridge): Server can publish events to relay
- **Epic 76.2** (Hub Key Management): Hub keys generated, distributed via REST, rotation working

## Success Criteria

### Functionality
- [ ] All clients connect to relay with NIP-42 auth
- [ ] All real-time events via relay (no WebSocket)
- [ ] State sync on reconnect via REST polling
- [ ] Call answer serialized via REST + DO (not relay)
- [ ] WebSocket code completely removed

### Privacy
- [ ] Relay sees only `llamenos:event` tag (no event type metadata)
- [ ] Event content encrypted (hub key or NIP-44 per-recipient)
- [ ] Presence RBAC maintained (volunteers see boolean, admins see counts)
- [ ] Non-server authoritative events rejected by clients

### Reliability
- [ ] Iterative reconnection with exponential backoff
- [ ] REST fallback for current state on reconnect
- [ ] Event deduplication with bounded memory
- [ ] No missed critical events (calls, messages)

### Performance
- [ ] Event latency <100ms (relay to client)
- [ ] Event deduplicator memory bounded (~5 min window)
- [ ] Typing indicators debounced to 2000ms
- [ ] Supports 100+ concurrent connections per hub

## Open Questions

1. **Event retention for kind 1 (persistent):** How long should relay keep shift/settings events?
   - Recommendation: 7 days. Clients query `since` on reconnect.

2. **Multiple relays for redundancy:** Support relay failover?
   - Recommendation: Single relay initially. Add redundancy if needed.

3. **Relay monitoring:** How to monitor relay health?
   - Health endpoint on relay + client-side connection status reporting

4. **Large hubs (100+ volunteers):** Scaling concerns?
   - Test with synthetic load. Ephemeral events (kind 20001) are not stored, reducing relay load.
   - Consider sharding by ring group if needed.

5. **Offline queue:** Should clients queue events while disconnected?
   - Only for presence (auto-publish "available" on reconnect)
   - Call and message events always go through REST first

## Dependencies

- **Epic 76.0** (Relay Infrastructure) -- must be complete
- **Epic 76.1** (Worker-to-Relay Bridge) -- must be complete
- **Epic 76.2** (Hub Key Management) -- must be complete
- **This epic enables:**
  - Epic 75 (Native Clients) -- connect to relay
  - Epic 77 (Metadata Encryption) -- builds on relay infrastructure
  - Epic 74 (E2EE Messaging) -- message notifications via relay
