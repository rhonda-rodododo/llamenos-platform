---
title: Architecture
description: System architecture overview — repositories, data flow, encryption layers, and real-time communication.
---

Boggan wuxuu sharxayaa sida Llamenos uu u qaabaysan yahay, sida data uu ugu dhaco system-ka, iyo halka encryption lagu dhex dhexaadiyo.

## Repository structure

Llamenos waxaa loo qaybiyay saddex repositories oo wadaaga common protocol and cryptographic core:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — Desktop application-ka (Tauri v2 with Vite + React webview), Cloudflare Worker backend, iyo self-hosted Node.js backend. Tani waa primary repository.
- **llamenos-core** — Shared Rust crate implementing dhammaan cryptographic operations: ECIES envelope encryption, Schnorr signatures, PBKDF2 key derivation, HKDF, iyo XChaCha20-Poly1305. Compiled to native code (for Tauri), WASM (for browser), iyo UniFFI bindings (for mobile).
- **llamenos-platform** — React Native mobile application for iOS iyo Android. Isticmaalaa UniFFI bindings si ay u yeeshaan calls into same Rust crypto code.

Dhammaan saddexda platforms waxay implement gareyaan isku wire protocol defined in `docs/protocol/PROTOCOL.md`.

## Data flow

### Incoming call

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### Incoming message (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           WebSocket relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

Backend-ka waxa uu isticmaalaa lix Cloudflare Durable Objects (ama PostgreSQL equivalents for self-hosted deployments):

| Durable Object | Mas'uuliyad |
|---|---|
| **IdentityDO** | Maamulaa volunteer identities, public keys, display names, iyo WebAuthn credentials. Handles invite creation iyo redemption. |
| **SettingsDO** | Kaydiyaa hotline configuration: name, enabled channels, provider credentials, custom note fields, spam mitigation settings, feature flags. |
| **RecordsDO** | Kaydiyaa encrypted call notes, encrypted reports, iyo file attachment metadata. Handles note search (over encrypted metadata). |
| **ShiftManagerDO** | Maamulaa recurring shift schedules, ring groups, volunteer shift assignments. Determines who is on-shift at any given time. |
| **CallRouterDO** | Orchestrates real-time call routing: parallel ringing, first-pickup termination, break status, active call tracking. Generates TwiML/provider responses. |
| **ConversationDO** | Maamulaa threaded messaging conversations across SMS, WhatsApp, iyo Signal. Handles message encryption on ingest, conversation assignment, iyo outbound replies. |

Dhammaan DOs waxaa la access gareeyaa as singletons via `idFromName()` oo routed internally iyadoo la isticmaalayo lightweight `DORouter` (method + path pattern matching).

## Encryption matrix

| Data | Encrypted? | Algorithm | Yaa decrypt gareya kara |
|---|---|---|---|
| Call notes | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Note author + all admins |
| Note custom fields | Yes (E2EE) | Same as notes | Note author + all admins |
| Reports | Yes (E2EE) | Same as notes | Report author + all admins |
| Report attachments | Yes (E2EE) | XChaCha20-Poly1305 (streamed) | Report author + all admins |
| Message content | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Assigned volunteer + all admins |
| Transcripts | Yes (at-rest) | XChaCha20-Poly1305 | Transcript creator + all admins |
| Hub events (WebSocket) | Yes (symmetric) | XChaCha20-Poly1305 with hub key | All current hub members |
| Volunteer nsec | Yes (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Volunteer kaliya |
| Audit log entries | No (integrity-protected) | SHA-256 hash chain | Admins (read), system (write) |
| Caller phone numbers | No (server-side only) | N/A | Server + admins |
| Volunteer phone numbers | Stored in IdentityDO | N/A | Admins kaliya |

### Per-note forward secrecy

Each note ama message waxay heshaa unique random symmetric key. Key-gaas waxaa lagu wrap via ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) individually for each authorized reader. Compromising one note's key ma muujinayo waxba about notes kale. Ma jiraan long-lived symmetric keys for content encryption.

### Key hierarchy

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs WebSocket events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time WebSocket hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## Real-time communication

Real-time updates (new calls, messages, shift changes, presence) waxay ku dhacaan through WebSocket relay:

- **Self-hosted**: WebSocket relay relay running alongside app-ka in Docker/Kubernetes
- **Cloudflare**: Nosflare (Cloudflare Workers-based relay)

Dhammaan events waxay ahaan karaan ephemeral (kind 20001) oo encrypted with hub key. Events waxay isticmaalaan generic tags (`["t", "llamenos:event"]`) sidaas darteed relay ma garto event types. Content field waxay ku jirtaa XChaCha20-Poly1305 ciphertext.

### Event flow

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as WebSocket event (Schnorr)
    v
WebSocket relay (WebSocket relay / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Relay-ga waxay aragtaa encrypted blobs iyo valid signatures laakiin ma akhriyi karaan event content ama determine what actions are being performed.

## Security layers

### Transport layer

- Dhammaan client-server communication over HTTPS (TLS 1.3)
- WebSocket connections to WebSocket relay over WSS
- Content Security Policy (CSP) xaddidaa script sources, connections, iyo frame ancestors
- Tauri isolation pattern kala saaraa IPC from webview

### Application layer

- Authentication via WebSocket keypairs (BIP-340 Schnorr signatures)
- WebAuthn session tokens for multi-device convenience
- Role-based access control (caller, volunteer, reporter, admin)
- Dhammaan 25 cryptographic domain separation constants defined in `crypto-labels.ts` ka hortaga cross-protocol attacks

### At-rest encryption

- Call notes, reports, messages, iyo transcripts encrypted before storage
- Volunteer secret keys encrypted with PIN-derived keys (PBKDF2)
- Tauri Stronghold bixisaa encrypted vault storage on desktop
- Audit log integrity protected via SHA-256 hash chain

### Build verification

- Reproducible builds via `Dockerfile.build` with `SOURCE_DATE_EPOCH`
- Content-hashed filenames for frontend assets
- `CHECKSUMS.txt` published with GitHub Releases
- SLSA provenance attestations
- Verification script: `scripts/verify-build.sh`

## Platform differences

| Feature | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|---|---|---|---|
| Crypto backend | Native Rust (via IPC) | Native Rust (via UniFFI) | WASM (llamenos-core) |
| Key storage | Tauri Stronghold (encrypted) | Secure Enclave / Keystore | Browser localStorage (PIN-encrypted) |
| Transcription | Client-side Whisper (WASM) | Not available | Client-side Whisper (WASM) |
| Auto-update | Tauri updater | App Store / Play Store | Automatic (CF Workers) |
| Push notifications | OS-native (Tauri notification) | OS-native (FCM/APNS) | Browser notifications |
| Offline support | Limited (needs API) | Limited (needs API) | Limited (needs API) |
