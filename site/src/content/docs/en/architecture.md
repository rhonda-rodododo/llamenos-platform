---
title: Architecture
description: System architecture overview — repositories, data flow, encryption layers, and real-time communication.
---

This page explains how Llamenos is structured, how data flows through the system, and where encryption is applied.

## Repository structure

Llamenos is split across three repositories that share a common protocol and cryptographic core:

```
llamenos              llamenos-core           llamenos-mobile
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

- **llamenos** — The desktop application (Tauri v2 with a Vite + React webview), the Cloudflare Worker backend, and the self-hosted Node.js backend. This is the primary repository.
- **llamenos-core** — A shared Rust crate that implements all cryptographic operations: ECIES envelope encryption, Schnorr signatures, PBKDF2 key derivation, HKDF, and XChaCha20-Poly1305. Compiled to native code (for Tauri), WASM (for browser), and UniFFI bindings (for mobile).
- **llamenos-mobile** — The React Native mobile application for iOS and Android. Uses UniFFI bindings to call into the same Rust crypto code.

All three platforms implement the same wire protocol defined in `docs/protocol/PROTOCOL.md`.

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
    |           Nostr relay (encrypted hub event notifies online clients)
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

The backend uses six Cloudflare Durable Objects (or their PostgreSQL equivalents for self-hosted deployments):

| Durable Object | Responsibility |
|---|---|
| **IdentityDO** | Manages volunteer identities, public keys, display names, and WebAuthn credentials. Handles invite creation and redemption. |
| **SettingsDO** | Stores hotline configuration: name, enabled channels, provider credentials, custom note fields, spam mitigation settings, feature flags. |
| **RecordsDO** | Stores encrypted call notes, encrypted reports, and file attachment metadata. Handles note search (over encrypted metadata). |
| **ShiftManagerDO** | Manages recurring shift schedules, ring groups, volunteer shift assignments. Determines who is on-shift at any given time. |
| **CallRouterDO** | Orchestrates real-time call routing: parallel ringing, first-pickup termination, break status, active call tracking. Generates TwiML/provider responses. |
| **ConversationDO** | Manages threaded messaging conversations across SMS, WhatsApp, and Signal. Handles message encryption on ingest, conversation assignment, and outbound replies. |

All DOs are accessed as singletons via `idFromName()` and routed internally using a lightweight `DORouter` (method + path pattern matching).

## Encryption matrix

| Data | Encrypted? | Algorithm | Who can decrypt |
|---|---|---|---|
| Call notes | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Note author + all admins |
| Note custom fields | Yes (E2EE) | Same as notes | Note author + all admins |
| Reports | Yes (E2EE) | Same as notes | Report author + all admins |
| Report attachments | Yes (E2EE) | XChaCha20-Poly1305 (streamed) | Report author + all admins |
| Message content | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Assigned volunteer + all admins |
| Transcripts | Yes (at-rest) | XChaCha20-Poly1305 | Transcript creator + all admins |
| Hub events (Nostr) | Yes (symmetric) | XChaCha20-Poly1305 with hub key | All current hub members |
| Volunteer nsec | Yes (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Volunteer only |
| Audit log entries | No (integrity-protected) | SHA-256 hash chain | Admins (read), system (write) |
| Caller phone numbers | No (server-side only) | N/A | Server + admins |
| Volunteer phone numbers | Stored in IdentityDO | N/A | Admins only |

### Per-note forward secrecy

Each note or message gets a unique random symmetric key. That key is wrapped via ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) individually for each authorized reader. Compromising one note's key reveals nothing about other notes. There are no long-lived symmetric keys for content encryption.

### Key hierarchy

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
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

Real-time updates (new calls, messages, shift changes, presence) flow through a Nostr relay:

- **Self-hosted**: strfry relay running alongside the app in Docker/Kubernetes
- **Cloudflare**: Nosflare (Cloudflare Workers-based relay)

All events are ephemeral (kind 20001) and encrypted with the hub key. Events use generic tags (`["t", "llamenos:event"]`) so the relay cannot distinguish event types. The content field contains XChaCha20-Poly1305 ciphertext.

### Event flow

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
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

The relay sees encrypted blobs and valid signatures but cannot read event content or determine what actions are being performed.

## Security layers

### Transport layer

- All client-server communication over HTTPS (TLS 1.3)
- WebSocket connections to Nostr relay over WSS
- Content Security Policy (CSP) restricts script sources, connections, and frame ancestors
- Tauri isolation pattern separates IPC from the webview

### Application layer

- Authentication via Nostr keypairs (BIP-340 Schnorr signatures)
- WebAuthn session tokens for multi-device convenience
- Role-based access control (caller, volunteer, reporter, admin)
- All 25 cryptographic domain separation constants defined in `crypto-labels.ts` prevent cross-protocol attacks

### At-rest encryption

- Call notes, reports, messages, and transcripts encrypted before storage
- Volunteer secret keys encrypted with PIN-derived keys (PBKDF2)
- Tauri Stronghold provides encrypted vault storage on desktop
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
