---
name: nostr-realtime-events
description: Use when adding real-time sync for new data types, implementing Nostr event publishing or subscription, working with the relay connection, or handling event encryption. Also use when the user mentions "real-time", "Nostr", "relay", "subscription", "useNostrSubscription", "publishNostrEvent", "hub key", "event kind", or needs to understand the real-time event pipeline.
---

# Nostr Real-Time Events

## Event Pipeline Overview

The real-time pipeline is notification-based. Events carry IDs, never full data.

```
Server DO mutation
  -> publishNostrEvent(env, KIND, content)
  -> encrypt content with hub key (XChaCha20-Poly1305)
  -> sign event with server Nostr key
  -> send to relay (strfry or Nosflare)
  -> client useNostrSubscription receives event
  -> decrypt content with hub key
  -> handler dispatches API fetch by ID
```

**Events are NOTIFICATIONS only.** The encrypted content contains an object like
`{ "id": "abc123", "action": "created" }`. Clients use the ID to fetch the full
resource via the REST API. NEVER put sensitive data (notes, transcripts, PII) in
event content.

## Server-Side Publishing

File: `apps/worker/lib/nostr-events.ts`

```typescript
import { publishNostrEvent } from '@worker/lib/nostr-events';

// Inside a DO method, after a successful mutation:
publishNostrEvent(c.env, KIND_MESSAGE_NEW, {
  type: 'message:new',
  entityId: messageId,
}).catch((e) => {
  console.error('[messaging] Failed to publish event:', e)
})
```

The function:
1. Serializes content to JSON
2. Encrypts with the hub event key (see below)
3. Creates a Nostr event (kind = the constant, tags = `["t", "llamenos:event"]`)
4. Signs with `SERVER_NOSTR_SECRET` (HKDF-derived keypair)
5. Publishes to relay via service binding (CF) or persistent WebSocket (Node.js)

**Generic tags are intentional.** The relay sees `["t", "llamenos:event"]` on every
event regardless of type. It cannot distinguish call events from note events from
settings changes. The kind number is inside the encrypted content.

## Hub Key Encryption

All event content is encrypted so the relay (and any eavesdropper) cannot read it.

```
hub_event_key = HKDF-SHA256(
  ikm: hub_key,              // random 32 bytes, distributed to members
  salt: empty,
  info: LABEL_HUB_EVENT_KEY  // from packages/protocol/crypto-labels.json
) -> 32 bytes

encrypted = XChaCha20-Poly1305(
  key: hub_event_key,
  nonce: random 24 bytes,
  plaintext: JSON content
)
```

The domain separation constant `LABEL_HUB_EVENT_KEY` is defined in
`packages/protocol/crypto-labels.json` and generated to all platforms via codegen.
NEVER use a raw string literal for this label.

## Hub Key Distribution

| Step | Description |
|------|-------------|
| Generation | `crypto.getRandomValues(new Uint8Array(32))` -- pure random, NOT derived from any identity key |
| Wrapping | ECIES-wrapped individually per member using `LABEL_HUB_KEY_WRAP` |
| Storage | Each member stores their wrapped copy; decrypt with their nsec |
| Rotation | On member departure: generate new hub key, re-wrap for remaining members, exclude departed |
| Server access | Server holds hub key in SettingsDO for encryption at publish time |

## Client-Side Subscription

### useNostrSubscription Hook

File: `src/client/lib/hooks/useNostrSubscription.ts`

```typescript
useNostrSubscription(hubId, [KIND_CALL_RING, KIND_CALL_UPDATE, KIND_MESSAGE_NEW], (event) => {
  // event.content is already decrypted
  const { type, entityId } = JSON.parse(event.content);

  switch (event.kind) {
    case KIND_CALL_RING:
    case KIND_CALL_UPDATE:
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      break;
    case KIND_MESSAGE_NEW:
      queryClient.invalidateQueries({ queryKey: ['messages', entityId] });
      break;
  }
});
```

The hook:
1. Connects via `RelayManager` (WebSocket to strfry/Nosflare)
2. Subscribes with REQ filter: `{ kinds: [...], "#t": ["llamenos:event"], since: now }`
3. Performs NIP-42 AUTH challenge-response if relay requires it
4. Decrypts each incoming event with the hub event key
5. Passes decrypted event to the handler callback
6. Handles reconnection automatically (exponential backoff)

### RelayManager

File: `src/client/lib/relay-manager.ts`

- Maintains a single WebSocket connection per relay
- Automatic reconnection with exponential backoff (1s, 2s, 4s... max 30s)
- NIP-42 AUTH: signs challenge with the user's nsec via platform.ts IPC
- Connection state exposed as reactive signal for UI indicators

## Event Deduplication

File: `src/client/lib/event-deduplicator.ts`

The `EventDeduplicator` prevents processing duplicate events (relay retransmissions,
reconnection replays):

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Bucket size | 1 minute | Groups event IDs by timestamp |
| Max age | 5 minutes | Buckets older than this are pruned |
| Key | event.id (Nostr event hash) | Unique per event |

```typescript
const dedup = new EventDeduplicator();

// Returns true if this event has NOT been seen before
if (dedup.check(event.id, event.created_at)) {
  handleEvent(event);
}
```

## Existing Event Kinds

All constants defined in `packages/shared/nostr-events.ts`:

| Constant | Value | Published By | Content Type | Trigger |
|----------|-------|-------------|--------------|---------|
| `KIND_CALL_RING` | 1000 | CallRouterDO | `call:ring` | Incoming call |
| `KIND_CALL_UPDATE` | 1001 | CallRouterDO | `call:update` | Call answered, completed, etc. |
| `KIND_CALL_VOICEMAIL` | 1002 | CallRouterDO | `voicemail:new` | Voicemail received |
| `KIND_MESSAGE_NEW` | 1010 | Routes + messaging/router | `message:new` | Inbound message or status update |
| `KIND_CONVERSATION_ASSIGNED` | 1011 | Routes + messaging/router | `conversation:assigned` / `conversation:closed` | Assignment change |
| `KIND_PRESENCE_UPDATE` | 20000 | CallRouterDO | `presence:summary` | Volunteer availability changed |
| `KIND_NIP42_AUTH` | 22242 | NodeNostrPublisher | NIP-42 auth | Relay authentication |

Kinds 1000-1011 are regular (persisted by relay). Kind 20000 is ephemeral (broadcast only, 5-min TTL).

## Adding a New Event Type

Follow this checklist exactly. Missing any step causes silent failures on one or
more platforms.

### Step 1: Add the KIND constant

File: `packages/shared/nostr-events.ts`

```typescript
// Choose the appropriate range:
// Regular (1000-9999): persisted by relay, returned in queries
// Ephemeral (20000-29999): broadcast only, not persisted
export const KIND_MY_NEW_EVENT = 1012;
```

### Step 2: Publish from the route or DO

In the relevant route handler or DO method, after the mutation succeeds.
Use `publishNostrEvent()` from `apps/worker/lib/nostr-events.ts`:

```typescript
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_MY_NEW_EVENT } from '@shared/nostr-events'

publishNostrEvent(c.env, KIND_MY_NEW_EVENT, {
  type: 'my-domain:action',
  entityId: result.id,
}).catch((e) => {
  console.error('[my-domain] Failed to publish event:', e)
})
```

### Step 3: Add client handler

In the component or hook that manages this data:

```typescript
useNostrSubscription(hubId, [KIND_MY_NEW_EVENT], (event) => {
  const { id, action } = JSON.parse(event.content);
  queryClient.invalidateQueries({ queryKey: ['my-resource'] });
});
```

### Step 4: Update iOS handler

File: `apps/ios/Sources/Services/NostrSubscriptionManager.swift`

Add a case in the event handler switch for the new kind constant.

### Step 5: Update Android handler

File: `apps/android/app/src/main/kotlin/org/llamenos/service/NostrSubscriptionService.kt`

Add a case in the event handler when-block for the new kind constant.

### Step 6: Add REST polling fallback

Every real-time subscription MUST have a REST polling fallback. Relays can
disconnect, events can be lost. Use a periodic refetch (30-60s) as a safety net:

```typescript
const { data } = useQuery({
  queryKey: ['my-resource'],
  refetchInterval: 30_000,  // fallback polling
});
```

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Putting full data in event content | PII leaks to relay, bloated events | Use IDs only; client fetches via API |
| Missing iOS/Android handler | Mobile users don't see real-time updates | Always update all 3 platforms |
| Forgetting hub key encryption | Events are plaintext on the relay wire | Always use `publishNostrEvent()` which encrypts automatically |
| No REST polling fallback | Missed events during relay disconnect cause stale UI | Add `refetchInterval` to every query that also has a subscription |
| Using raw string for crypto label | Domain separation violation, audit failure | Import from generated constants |
| Not handling relay reconnection | Permanent disconnect after network blip | RelayManager handles this; verify reconnection in tests |
| Publishing before mutation commits | Event arrives but API returns stale data | Always publish AFTER the storage write succeeds |
| Using wrong kind range | Regular events persist forever, ephemeral events are lost on disconnect | Choose range based on whether the event needs relay persistence (see table above) |
