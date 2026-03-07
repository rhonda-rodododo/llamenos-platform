---
name: nostr-realtime-events
description: >
  Guide adding new real-time event types to the Llamenos Nostr relay broadcast system. Use this
  skill when implementing real-time features, adding new broadcast event types, modifying event
  encryption, or when the user mentions "real-time", "Nostr", "relay", "broadcast", "event",
  "live update", "subscription", "WebSocket sync", "hub key", "encrypted event", "event type",
  "publishNostrEvent", "RelayManager", or "subscribe to changes". Also use when a feature needs
  other clients to see changes immediately without polling — this implies a new Nostr event type.
  If the user describes "when admin creates X, volunteers should see it" or "sync across devices",
  this skill applies. Covers the full pipeline: server publishing, event encryption, client
  subscription, decryption, and React hook integration across all platforms.
---

# Nostr Real-Time Events for Llamenos

Llamenos uses a Nostr relay (strfry for self-hosted, Nosflare for CF) for real-time sync
between all clients. All event content is encrypted — the relay cannot read it. Events are
ephemeral (not stored long-term) and used for push-style notifications.

## Architecture

```
Server mutation (DO handler)
  → publishNostrEvent(env, kind, { type, ...data })
    → Encrypt content with server event key (XChaCha20-Poly1305)
    → Sign with server Nostr keypair (BIP-340 Schnorr)
    → Publish to relay (CF: service binding, Node: WebSocket)

Relay (strfry / Nosflare)
  → Stores event temporarily
  → Broadcasts to all subscribers matching filter

Client (Desktop / iOS / Android)
  → RelayManager subscribes with filter: { kinds: [20001], '#d': [hubId] }
  → Receives event → verifies signature → decrypts content
  → Routes to handler based on event.type
  → React hook triggers re-fetch / state update
```

### Key Files

| File | Layer | Purpose |
|------|-------|---------|
| `apps/worker/lib/nostr-events.ts` | Server publish | `publishNostrEvent()` — encrypt + sign + publish |
| `apps/worker/lib/nostr-publisher.ts` | Server transport | CF/Node publisher implementations |
| `apps/worker/lib/hub-event-crypto.ts` | Server crypto | XChaCha20-Poly1305 event encryption |
| `src/client/lib/nostr/relay.ts` | Desktop client | `RelayManager` — WebSocket, auth, subscriptions |
| `src/client/lib/nostr/events.ts` | Desktop events | Event creation, validation, deduplication |
| `src/client/lib/nostr/hooks.ts` | Desktop React | `useNostrSubscription()` hook |
| `src/client/lib/nostr/types.ts` | Desktop types | `LlamenosEvent` union type |
| `src/client/lib/nostr/context.tsx` | Desktop context | React context providing RelayManager |
| `src/client/lib/hub-key-manager.ts` | Desktop crypto | Hub key store, event decryption |

## Event Structure

All Llamenos events use Nostr kind `20001` (ephemeral) with standardized tags:

```json
{
  "kind": 20001,
  "created_at": 1709836800,
  "tags": [
    ["d", "hub-id-here"],
    ["t", "llamenos:event"]
  ],
  "content": "<hex-encoded encrypted JSON>",
  "pubkey": "<server pubkey>",
  "id": "<event hash>",
  "sig": "<BIP-340 signature>"
}
```

- `["d", hubId]` — hub scoping (clients subscribe to their hub only)
- `["t", "llamenos:event"]` — generic tag so relay can't distinguish event types
- Content is encrypted — event type is inside the encrypted payload

### Encrypted Content Structure

After decryption, the content is a JSON object with a `type` discriminator:

```typescript
interface LlamenosEvent {
  type: string       // e.g., 'volunteer:updated', 'note:created', 'call:started'
  hubId: string      // redundant with tag, but inside encrypted envelope
  [key: string]: unknown  // event-specific data
}
```

## Adding a New Event Type

### Step 1: Define the Event Type

Add to `src/client/lib/nostr/types.ts`:

```typescript
// Add to the LlamenosEvent union
export type LlamenosEvent =
  | VolunteerUpdatedEvent
  | NoteCreatedEvent
  | CallStartedEvent
  | MyNewEvent  // <-- add here

export interface MyNewEvent {
  type: 'my-feature:updated'
  hubId: string
  featureId: string
  updatedBy: string  // pubkey of who made the change
}
```

### Step 2: Publish from the Server

In the relevant DO method, after the mutation:

```typescript
// In a Durable Object method:
import { publishNostrEvent } from '../lib/nostr-events'

private async updateMyFeature(id: string, data: MyFeature): Promise<Response> {
  // ... perform the mutation ...
  await this.ctx.storage.put(`feature:${id}`, data)

  // Broadcast to all connected clients
  publishNostrEvent(this.env, 20001, {
    type: 'my-feature:updated',
    hubId: this.hubId,
    featureId: id,
    updatedBy: data.updatedBy,
  })

  return Response.json(data)
}
```

`publishNostrEvent` handles:
- Encrypting content with server event key (XChaCha20-Poly1305)
- Signing with server Nostr keypair
- Publishing to relay (fire-and-forget, errors caught silently)

### Step 3: Handle on the Desktop Client

Create or update a hook that subscribes to the event:

```typescript
// src/client/lib/hooks/useMyFeatureSync.ts
import { useNostrSubscription } from '../nostr/hooks'
import { useQueryClient } from '@tanstack/react-query'

export function useMyFeatureSync(hubId: string) {
  const queryClient = useQueryClient()

  useNostrSubscription(hubId, [20001], (event, content) => {
    if (content.type === 'my-feature:updated') {
      // Invalidate the query cache so the UI refetches
      queryClient.invalidateQueries({ queryKey: ['my-feature'] })
    }
  })
}
```

Then use the hook in your route component:

```tsx
function MyFeaturePage() {
  const { hubId } = useAuth()
  useMyFeatureSync(hubId)  // <-- real-time updates

  const { data } = useQuery({
    queryKey: ['my-feature'],
    queryFn: () => api.getMyFeature(),
  })

  return <div>{/* render data */}</div>
}
```

### Step 4: Handle on iOS

In the iOS app, the `NostrService` manages relay connections:

```swift
// apps/ios/Sources/Services/NostrService.swift
// Subscribe to events and route by type:

func handleEvent(_ content: [String: Any]) {
    guard let type = content["type"] as? String else { return }

    switch type {
    case "my-feature:updated":
        NotificationCenter.default.post(
            name: .myFeatureUpdated,
            object: nil,
            userInfo: content
        )
    // ... other event types
    }
}
```

### Step 5: Handle on Android

```kotlin
// apps/android/.../service/NostrService.kt
// Route events by type:

when (content.getString("type")) {
    "my-feature:updated" -> {
        _myFeatureEvents.emit(content)
    }
}
```

## Event Encryption Details

### Server-Side Encryption

Events are encrypted with a key derived from `SERVER_NOSTR_SECRET`:

```
event_key = HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=empty, info="llamenos:hub-event", 32)
nonce = random(24 bytes)
ciphertext = XChaCha20-Poly1305(event_key, nonce).encrypt(UTF-8(json_content))
encrypted = hex(nonce || ciphertext)
```

### Client-Side Decryption

Clients receive the server event key via `GET /api/auth/me` (field: `serverEventKeyHex`).
The `RelayManager` uses this key to decrypt incoming events:

```typescript
// In RelayManager.handleEvent():
const hubKey = this.getHubKey()
const decrypted = decryptFromHub(event.content, hubKey)
const content = parseLlamenosContent(decrypted)
```

### Why Not Hub Key?

The server event key is derived from `SERVER_NOSTR_SECRET` (server-side secret), not the
client-side hub key. This is because the server publishes events — it needs to encrypt them
but doesn't have the hub key (zero-knowledge design). Clients receive the event key alongside
the hub key during authentication.

## Subscription Filtering

Clients subscribe with Nostr REQ filters:

```json
["REQ", "sub-id", {
  "kinds": [20001],
  "#d": ["hub-id"],
  "#t": ["llamenos:event"]
}]
```

This means:
- All events for a hub come through one subscription
- Client-side routing by `content.type` determines which handler fires
- No way for the relay to filter by event type (it's encrypted)

## Event Deduplication

The `EventDeduplicator` class prevents duplicate processing:
- Time-bucketed storage (1-minute buckets)
- Events older than 5 minutes are rejected
- Automatic pruning every 60 seconds
- Bounded memory usage

## useNostrSubscription Hook

```typescript
// Desktop React hook for subscribing to events
function useNostrSubscription(
  hubId: string,
  kinds: number[],
  handler: NostrEventHandler,
): void
```

- Automatically subscribes on mount, unsubscribes on unmount
- Handles relay reconnection transparently
- Handler receives both the raw Nostr event and parsed content
- Multiple hooks can subscribe — all receive all events

## Relay Connection Lifecycle

```
App launch → User authenticates
  → Fetch /api/auth/me (get serverEventKeyHex, relayUrl, serverPubkey)
  → Create RelayManager with config
  → Connect to relay WebSocket
  → NIP-42 auth (signed by Rust CryptoState, nsec never in webview)
  → Subscribe to hub events
  → Process incoming events until disconnect/close

On reconnect:
  → Exponential backoff with jitter (1s → 30s max)
  → Re-authenticate (NIP-42)
  → Re-send all active subscriptions
  → Flush pending events from queue
```

## Common Patterns

### Invalidation (most common)
Most event handlers just invalidate a React Query cache:
```typescript
queryClient.invalidateQueries({ queryKey: ['volunteers'] })
```

### Optimistic Update
For real-time UX, update the cache directly:
```typescript
queryClient.setQueryData(['calls', 'active'], (old) => {
  return old?.filter(c => c.id !== content.callId)
})
```

### Toast/Notification
For user-facing alerts:
```typescript
if (content.type === 'call:incoming') {
  toast.info('Incoming call!')
}
```

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Forgetting `publishNostrEvent` after mutation | Other clients don't see changes | Always publish after state changes |
| Adding event type but not handling on mobile | iOS/Android miss updates | Update all platform handlers |
| Using relay for data transfer | Data loss (ephemeral events) | Events are notifications, not data. Fetch via API |
| Not encrypting sensitive data in event payload | Relay operator can read content | Content is encrypted by default via `publishNostrEvent` |
| Putting PII in event payload | Privacy violation even with encryption | Only include IDs, not names/phones |
| Creating new Nostr kinds | Breaks relay filtering | Always use kind 20001 with type field in content |
