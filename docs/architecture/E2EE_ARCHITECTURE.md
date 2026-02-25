# Llamenos E2EE Architecture Overview

## Vision

Transform Llamenos from a "server-side encrypted" model to a **true zero-knowledge architecture** where:

1. **The server stores data it cannot read** - All content E2EE
2. **The server sees minimal metadata** - Real-time events via Nostr relay
3. **The server cannot correlate activity** - Encrypted metadata, ephemeral presence
4. **Users can verify code integrity** - Reproducible builds
5. **Audio never leaves the device** - Client-side transcription

## Current State vs Target State

### Data at Rest

| Data Type | Current | Target | Epic |
| --------- | ------- | ------ | ---- |
| Call notes | E2EE (V2) | E2EE (V2) | - |
| Transcripts | E2EE | E2EE (client-generated, local mic only) | 78 |
| Reports | E2EE | E2EE | - |
| File attachments | E2EE | E2EE | - |
| SMS messages | **Plaintext** | E2EE (envelope pattern) | 74 |
| WhatsApp messages | **Plaintext** | E2EE (envelope pattern) | 74 |
| Signal messages | **Plaintext** | E2EE (envelope pattern) | 74 |
| Volunteer assignments | **Plaintext** | E2EE (multi-admin envelopes) | 77 |
| Shift schedules | **Plaintext** | E2EE (multi-admin) + signed routing pubkeys | 77 |
| Audit logs | **Plaintext** | Server-readable + Merkle chain + actor signatures | 77 |
| Caller phone hashes | HMAC-SHA256 | HMAC-SHA256 | - |

### Data in Transit (Real-Time)

| Event Type | Current | Target | Epic |
| ---------- | ------- | ------ | ---- |
| Call notifications | WebSocket to server | Nostr relay (ephemeral, E2EE) | 76 |
| Presence updates | WebSocket to server | Nostr relay (ephemeral, E2EE, RBAC) | 76 |
| Message notifications | WebSocket to server | Nostr relay (ephemeral, E2EE) | 76 |
| Typing indicators | WebSocket to server | Nostr relay (ephemeral, E2EE) | 76 |
| Call state changes | Server-authoritative | REST + Nostr relay propagation | 76 |

### External Data Flows

| Flow | Current | Target | Epic |
| ---- | ------- | ------ | ---- |
| Transcription audio | Sent to CF Workers AI | Local mic only (WASM, single-threaded) | 78 |
| Volunteer phone numbers | Exposed to telephony provider | Twilio SDK only (no personal PSTN) | 75 |
| Push notifications | Content visible to Apple/Google | Two-tier encryption (wake key + pubkey) | 75 |

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │  Web Client       │  │  Desktop Client   │  │  Mobile Client    │       │
│  │  (React SPA)      │  │  (Tauri)          │  │  (React Native)   │       │
│  └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘       │
│            │                      │                      │                  │
│            └──────────────────────┼──────────────────────┘                  │
│                                   │                                         │
│  ┌────────────────────────────────┴────────────────────────────────────┐   │
│  │                        SHARED CLIENT CORE                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Key Manager  │  │ Crypto (E2EE)│  │ Nostr Client │              │   │
│  │  │ (PIN-locked) │  │ ECIES+XChaCha│  │ (Relay Conn) │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Transcription│  │ Twilio Voice │  │ State Sync   │              │   │
│  │  │ (WASM Whisper│  │ SDK Handler  │  │ (REST+Nostr) │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    │ REST API                     │ Nostr Events (ephemeral)
                    │ (state mutations,            │ (encrypted content,
                    │  E2EE blob storage)          │  generic tags only)
                    ▼                              ▼
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│           SERVER LAYER              │  │           NOSTR RELAY               │
│  ┌─────────────────────────────┐   │  │  ┌─────────────────────────────┐   │
│  │ Cloudflare Workers / Node.js│   │  │  │ Nosflare (CF) / strfry     │   │
│  │                             │   │  │  │                             │   │
│  │ • Auth (Schnorr/WebAuthn)   │   │  │  │ • NIP-01 Events             │   │
│  │ • Telephony webhooks        │   │  │  │ • NIP-42 Auth               │   │
│  │ • E2EE blob storage         │   │  │  │ • Hub-scoped subscriptions  │   │
│  │ • Atomic call state (DO)    │   │  │  │ • Ephemeral event forwarding│   │
│  │ • Minimal routing metadata  │   │  │  │ • E2EE event content        │   │
│  │ • Server nsec (signing only)│   │  │  │                             │   │
│  └─────────────────────────────┘   │  │  └─────────────────────────────┘   │
│                                     │  │                                     │
│  Server has:                        │  │  Relay sees:                        │
│  • Server nsec (its own identity)   │  │  • Encrypted event content          │
│  • Admin/volunteer npubs (pub only) │  │  • Pubkeys (pseudonymous)           │
│  • Encrypted blobs it can't read    │  │  • Timestamps                       │
│  • NEVER has admin/volunteer nsec   │  │  • Generic tags only (no event type)│
│                                     │  │                                     │
│  Server NEVER:                      │  │  CF deployment caveat:              │
│  • Decrypts content                 │  │  • CF can observe connection meta   │
│  • Holds user private keys          │  │  • Nosflare != additional privacy   │
│  • Reads message/note plaintext     │  │    vs CF (only vs DB-only subpoena) │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
                    │
                    │ Telephony Webhooks
                    ▼
┌─────────────────────────────────────┐
│      EXTERNAL PROVIDERS             │
│  ┌─────────────┐  ┌──────────────┐ │
│  │ Twilio/etc  │  │ SMS/WhatsApp │ │
│  │ (calls)     │  │ (messages)   │ │
│  └─────────────┘  └──────────────┘ │
│                                     │
│  Providers see:                     │
│  • Call audio (if PSTN)             │
│  • Outbound message content         │
│    (inherent, server discards       │
│     after forwarding)               │
│  • Phone numbers                    │
│                                     │
│  NEW trusted parties (Epic 75):     │
│  • Apple APNs (push delivery meta)  │
│  • Google FCM (push delivery meta)  │
└─────────────────────────────────────┘
```

## Epic Dependency Graph

```
┌─────────────────────────────────────┐
│   Epic 76.0: Security Foundations   │
│   (Domain labels, provisioning fix, │
│    emergency procedures, threat     │
│    model updates)                   │
└───────────────┬─────────────────────┘
                │
    ┌───────────┼───────────┐
    │           │           │
    ▼           ▼           │
┌────────┐  ┌────────┐     │
│ 76.1:  │  │ 76.2:  │     │
│ Worker │  │ Key    │     │
│ Relay  │  │ Arch   │     │
│ PoC    │  │ Rdsign │     │
└───┬────┘  └───┬────┘     │
    │           │           │
    └─────┬─────┘           │
          ▼                 │
┌─────────────────────┐    │
│   Epic 76: Nostr    │    │
│   Relay Sync        │    │
│   (Foundation)      │    │
└─────────┬───────────┘    │
          │                │
  ┌───────┼───────┐       │
  │       │       │       │
  ▼       ▼       ▼       │
┌─────┐ ┌─────┐ ┌─────┐  │
│ 75  │ │ 77  │ │ 74  │  │
│     │ │     │ │     │  │
└─────┘ └─────┘ └─────┘  │
                          │
  ┌───────────────────────┘
  │
  ▼                       Independent
┌─────────────────┐     ┌─────────────────┐
│ Epic 78:        │     │ Epic 79:        │
│ Transcription   │     │ Reproducible    │
│ (needs 76.0     │     │ Builds          │
│  for labels)    │     │ (independent)   │
└─────────────────┘     └─────────────────┘
```

## Implementation Approach

### Clean Rewrite (No Migration)

Since Llamenos is **pre-production with no deployed users**, we do a clean rewrite:

- **Delete legacy code entirely** - No WebSocket, no plaintext message storage
- **Build E2EE-first** - All features designed for zero-knowledge from the start
- **No backwards compatibility** - No feature flags, no parallel systems
- **Simpler codebase** - Less code to maintain, fewer edge cases

### What the Server Has vs What It Doesn't

**CRITICAL PRINCIPLE: The server NEVER holds user private keys.**

| The server HAS | The server NEVER HAS |
| --------------- | -------------------- |
| Its own server nsec (for signing Nostr events) | Admin nsec (admin's private key) |
| Admin npub (public key, for ECIES encryption) | Volunteer nsec (any volunteer's private key) |
| Volunteer npubs (for ECIES encryption) | Hub key (symmetric, only clients have it) |
| Encrypted blobs it cannot read | Ability to decrypt any user content |
| Auth tokens (proves identity) | Note/message plaintext (except outbound SMS/WhatsApp momentarily) |

ECIES encryption only needs the **public key** to encrypt. The private key is only needed to **decrypt**, and that happens client-side.

### What We Still Need a Server API For

Even with Nostr relay handling all real-time events, we still need a thin REST API for:

| Function | Why Server Required | What Server Sees |
| -------- | ------------------- | ---------------- |
| **Telephony webhooks** | Twilio/Vonage POST to our server | Call metadata (unavoidable) |
| **Messaging webhooks** | SMS/WhatsApp providers POST to our server | Inbound message content (unavoidable, encrypt immediately, store only ciphertext) |
| **Outbound message relay** | Client sends plaintext + encrypted; server forwards to provider, stores only encrypted | Outbound plaintext **momentarily** (discarded after send — inherent SMS/WhatsApp limitation) |
| **E2EE blob storage** | Persistent storage for encrypted notes/messages | Ciphertext only |
| **Auth (Schnorr/WebAuthn)** | Validate identity, manage sessions | Auth tokens |
| **Call state mutations** | Atomic answer/hangup (DO serialization) | Call ID, volunteer pubkey |
| **File uploads** | Encrypted attachments need R2/S3 | Ciphertext only |
| **Push notification trigger** | Wake sleeping mobile clients | Encrypted payload via APNs/FCM |

### Implementation Order

1. **Epic 76.0: Security Foundations** (Pre-work)
   - Domain separation label audit
   - Provisioning channel SAS fix
   - Emergency key revocation procedures
   - Threat model updates
   - Backup file privacy fix

2. **Epic 76.1 + 76.2: Architecture PoCs** (Pre-work)
   - Worker-to-relay communication PoC
   - Hub key redesign (random keys, ECIES distribution)
   - Multi-admin support design
   - NIP-44 correct usage

3. **Epic 76: Nostr Relay** (Foundation)
   - Deploy self-hosted relay (Nosflare/strfry)
   - Delete WebSocket code
   - Ephemeral events (kind 20001) for real-time
   - REST for state, Nostr for events
   - Server-authoritative call state

4. **Epic 74 + 77: E2EE Data** (Core)
   - E2EE messaging storage (envelope pattern)
   - Encrypted metadata (multi-admin envelopes)
   - Audit logs with Merkle chain integrity
   - Client-side analytics (bounded windows)

5. **Epic 75: Native Clients** (Reach)
   - Tauri desktop (macOS + Windows)
   - React Native mobile (Twilio RN SDK)
   - Two-tier push encryption (wake key + nsec)

6. **Epic 78: Client-Side Transcription** (Privacy)
   - Single-threaded WASM Whisper (no COEP conflict)
   - Local microphone only (Twilio SDK limitation)
   - Chunked processing (96MB memory ceiling)

7. **Epic 79: Reproducible Builds** (Trust)
   - Deterministic builds
   - Worker bundle capture via wrangler --dry-run
   - Checksums on GitHub Releases (not served from app)
   - SLSA provenance

## Key Architecture Principles (From Security Audit)

### 1. Hub Key is Random (Not Derived)

**Old (BROKEN):** `hubKey = HKDF(adminNsec, hubId)` — compromise of admin nsec reveals all hub keys past and future.

**New (Epic 76.2):** `hubKey = crypto.getRandomValues(32)` — random, ECIES-wrapped for each member individually. Rotation generates a genuinely new key with no mathematical link to the old one.

### 2. Server is Authoritative for State, Relay for Events

- **REST for state mutations**: answer call, create note, reassign conversation (DO serializes atomically)
- **Nostr for event propagation**: call:ring, call:answered, presence (broadcast to subscribers)
- **REST for state recovery**: on reconnect, poll `/api/calls/active`, `/api/conversations`

### 3. Ephemeral Nostr Events (Not Replaceable)

**Old (BROKEN):** Kind 30078 (parameterized replaceable) — relay silently drops concurrent events.

**New (Epic 76):** Kind 20001 (ephemeral) — relay forwards to subscribers but never stores. Kind 1 (regular) for persistent events like shift updates.

### 4. Generic Event Tags (No Operational Tempo Leak)

All events use `["t", "llamenos:event"]`. Actual event type is INSIDE the encrypted content. Relay cannot distinguish `call:ring` from `typing`.

### 5. Presence RBAC Preserved

Two separate presence events:
- Hub-key encrypted: `{ hasAvailable: boolean }` for all members
- Per-admin ECIES: `{ available: N, onCall: N, total: N }` for admins only

### 6. Multi-Admin from Day One

Every admin envelope is per-admin ECIES. Adding/removing admins wraps/revokes keys individually. No shared admin secret.

### 7. Honest Trust Boundaries

| Claim | Reality |
| ----- | ------- |
| "Server can't read content" | TRUE for stored data. Server sees outbound SMS/WhatsApp plaintext momentarily (inherent provider limitation). |
| "Nostr relay adds privacy vs CF" | PARTIALLY TRUE. Protects against database-only subpoena. Does NOT protect against CF as active adversary (CF can observe relay connections). |
| "E2EE for all messages" | TRUE for storage. FALSE for the SMS/WhatsApp transport layer (provider sees plaintext — inherent). |
| "Audio never leaves device" | TRUE for transcription. Audio is captured locally only (volunteer mic). Remote party audio not accessible via Twilio SDK. |

## Encryption Key Hierarchy (Post-Audit)

```
Admin nsec (secp256k1) — IDENTITY AND SIGNING ONLY
    │
    ├─→ Auth tokens (Schnorr signatures)
    ├─→ Hub administration (signing invite/revocation events)
    │
    └─→ Admin Decryption Key (SEPARATE keypair, Epic 76.2 Phase 3)
        ├─→ Note admin envelopes (ECIES unwrap)
        ├─→ Message admin envelopes (ECIES unwrap)
        ├─→ Audit log decryption
        └─→ Metadata decryption

Hub Key (random 32 bytes, NOT derived from any identity key)
    │
    ├─→ Nostr event content encryption (XChaCha20-Poly1305 + HKDF per-event)
    ├─→ Presence encryption (volunteer-tier: boolean only)
    ├─→ Ephemeral broadcast data
    │
    └─→ Distribution: ECIES-wrapped individually for each member
        ├─→ Volunteer A envelope
        ├─→ Volunteer B envelope
        └─→ Each admin envelope

Per-Note Key (random 32 bytes) — UNCHANGED
    ├─→ Wrapped for author (ECIES)
    └─→ Wrapped for each admin (ECIES)

Per-Message Key (random 32 bytes) — NEW (matches note pattern)
    ├─→ Wrapped for assigned volunteer (ECIES)
    └─→ Wrapped for each admin (ECIES)

Server nsec (secp256k1) — SERVER IDENTITY ONLY
    ├─→ Signs Nostr events published by server (call:ring, call:answered)
    ├─→ Clients verify server pubkey for authoritative events
    └─→ CANNOT decrypt any user content
```

## Domain Separation Labels (Authoritative Table)

From Epic 76.0:

| Label | Purpose | Used By |
| ----- | ------- | ------- |
| `llamenos:note-key` | ECIES wrapping of per-note symmetric key | Client crypto |
| `llamenos:message` | ECIES wrapping of per-message symmetric key | Client + server crypto |
| `llamenos:transcription` | Transcription key wrapping | Server-side transcription |
| `llamenos:file-key` | Per-file attachment key wrapping | Client crypto |
| `llamenos:hub-event` | Hub key encryption of Nostr event content | Client Nostr encryption |
| `llamenos:hub-key-wrap` | ECIES wrapping of hub key for member distribution | Admin client |
| `llamenos:draft` | Draft encryption key derivation | Client crypto |
| `llamenos:export` | Export encryption key derivation | Client crypto |

## Data Flow Diagrams

### Incoming Call (Target Architecture)

```
1. Telephony webhook arrives at server
   │
   ▼
2. Server extracts minimal info:
   • callId (generated)
   • callerLast4 (masked)
   • timestamp
   │
   ▼
3. Server publishes to Nostr relay (via DO service binding / HTTP):
   Event {
     kind: 20001,  // Ephemeral — relay forwards, never stores
     tags: [["d", hubId], ["t", "llamenos:event"]],  // Generic tag
     content: XChaCha20(hubKey, {type: "call:ring", callId, callerLast4}),
     pubkey: serverPubkey  // Server signs with its own nsec
   }
   │
   ▼
4. All on-shift volunteer clients subscribed to relay:
   • Receive event, verify server signature
   • Decrypt with hub key
   • Route by type field ("call:ring")
   • Show incoming call UI
   │
   ▼
5. Volunteer answers:
   • POST /api/calls/{callId}/answer (REST — server is authority)
   • CallRouterDO atomically sets answeredBy
   • First request: 200 OK
   • Subsequent requests: 409 Conflict
   │
   ▼
6. Server publishes authoritative call:answered event to relay
   • Other clients stop ringing
```

### Message Send (Target Architecture)

```
1. Volunteer types message in conversation view
   │
   ▼
2. Client generates per-message key and encrypts:
   • messageKey = random 32 bytes
   • encryptedContent = XChaCha20(messageKey, messageText)
   • volunteerEnvelope = ECIES(messageKey, volunteerPubkey)
   • adminEnvelopes[] = ECIES(messageKey, adminPubkey) for each admin
   • plaintextForSending = raw text (for SMS/WhatsApp provider)
   │
   ▼
3. POST /api/conversations/{id}/messages
   Body: { plaintextForSending, encryptedContent, nonce, volunteerEnvelope, adminEnvelopes }
   │
   ▼
4. Server:
   • Forwards plaintext to SMS/WhatsApp provider (inherent limitation)
   • Stores ONLY encrypted fields (discards plaintext immediately)
   │
   ▼
5. Server publishes to Nostr relay:
   Event {
     kind: 20001,
     tags: [["d", hubId], ["t", "llamenos:event"]],
     content: XChaCha20(hubKey, {type: "message:new", threadId}),
   }

Server NEVER stores: plaintext message
Server DOES see: outbound plaintext momentarily (inherent SMS/WhatsApp limitation)
```

## Security Analysis

### Trust Boundaries

| Party | Has | Does NOT Have |
| ----- | --- | ------------- |
| Volunteer | Own nsec, hub key, own note keys | Other volunteers' nsec, admin nsec |
| Admin | Admin nsec, admin decryption key, hub key | Volunteer nsec |
| Server | Server nsec, all npubs (public only) | Any user nsec, hub key, note keys |
| Relay | NIP-42 auth tokens | Event content (encrypted), user nsec |
| Apple/Google | Push delivery metadata | Push content (encrypted), identity |

### Attack Scenarios

| Attack | Before | After |
| ------ | ------ | ----- |
| Server DB dump | Messages readable, metadata exposed | Only ciphertext + encrypted metadata |
| Server code compromise | Real-time events visible | Real-time via relay, server has no hub key |
| Relay compromise | N/A | Only encrypted events + generic tags |
| Subpoena of CF hosting | Metadata + activity patterns | Encrypted blobs, relay connection metadata |
| Subpoena of DB only | Full plaintext access | Ciphertext only (relay provides additional protection here) |
| Admin nsec compelled | ALL data decryptable | Only auth compromised (decryption key is separate, 76.2) |
| Hub key compromised | N/A | Nostr events decryptable, but notes/messages still require per-note/per-message keys |
| Device seizure | PIN brute-force → all keys | PIN brute-force → that device's keys only |
| Volunteer departure | Historical access retained | Hub key rotated, departed volunteer locked out |

### Remaining Trust Requirements

1. **Telephony providers**: See call audio (PSTN) and outbound message content (SMS/WhatsApp)
   - Mitigation: Twilio SDK for calls (no personal phone numbers), document SMS/WhatsApp limitation

2. **Admin decryption key compromise**: Can decrypt all notes and messages
   - Mitigation: Separate from identity key (76.2), hardware key storage, rotation procedures, multi-admin threshold

3. **Client code integrity**: Malicious client could exfiltrate data
   - Mitigation: Reproducible builds, code signing, SLSA provenance

4. **Relay availability**: If relay is down, real-time is degraded
   - Mitigation: Self-hosted relay, REST polling fallback for state

5. **Cloudflare (CF deployment)**: Can observe relay connections, DO storage, Worker execution
   - Mitigation: Encrypted content in relay events, honest documentation, self-hosted deployment for highest security

6. **Apple/Google (mobile)**: See push delivery timing and device identifiers
   - Mitigation: Encrypted push payloads, two-tier wake key separation

## Implementation Checklist

### Before Starting (Epic 76.0)

- [ ] Domain separation labels audited and fixed
- [ ] Provisioning SAS verification implemented
- [ ] Emergency key revocation procedures documented
- [ ] Threat model updated with all new trust parties
- [ ] Backup file privacy fixed

### Architecture Proven (Epics 76.1 + 76.2)

- [ ] Worker-to-relay publishing PoC passing latency budget (<1s)
- [ ] Hub key as random secret with ECIES distribution working
- [ ] Multi-admin envelope pattern working
- [ ] Correct NIP-44 usage verified

### Per-Feature Implementation

For each feature:

1. [ ] Data flow designed (E2EE from the start)
2. [ ] Correct domain separation label used
3. [ ] Key distribution planned (multi-admin compatible)
4. [ ] E2E tests written
5. [ ] Performance impact assessed
6. [ ] Documentation updated

### Implementation Verification

- [ ] Server code audit: no private keys held, no plaintext access paths
- [ ] Database schema audit: only ciphertext stored
- [ ] Network audit: real-time via relay only
- [ ] Penetration test of architecture
- [ ] Documentation complete and honest about limitations
- [ ] Security page updated

## Open Research Questions

1. **Multi-hub key management**: Volunteers in multiple hubs store multiple hub keys
   - Each hub has independent random key
   - UI to switch between hubs

2. **Relay federation**: Multiple relays for redundancy?
   - Start with single self-hosted relay
   - Add redundancy if needed

3. **Offline support**: How much functionality without relay/server?
   - Notes: Full offline (local drafts)
   - Calls: Require connectivity
   - Messages: Queue locally, send when connected

4. **Full call transcription**: Remote audio capture requires replacing Twilio SDK with raw WebRTC
   - Deferred to post-MVP
   - Local mic transcription available in MVP

## Success Metrics

| Metric | Target |
| ------ | ------ |
| Server private key access | Zero (server has only its own nsec + user npubs) |
| Server plaintext content access | Zero stored (outbound SMS/WhatsApp momentary, discarded) |
| Metadata visible to server | Minimal (active pubkeys for routing, signed by admin) |
| External data flows | Zero for audio (local transcription) |
| Verification possible | Yes (reproducible builds, GitHub Release checksums) |
| User experience impact | Minimal (< 1s latency increase) |
