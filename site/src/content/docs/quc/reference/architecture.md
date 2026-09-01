---
title: Ruk'ojlib'al
description: Rub'eyal ruk'ojlib'al q'inoj — taq k'olib'al, ruk'amik taq tzij, taq ruk'ojlem ewan tzij, chuqa' rutzijoxik pa ri q'ijul.
---

Re re ruwuj re' nuk'üt rub'eyal nuch'akun Llámenos, achike rub'eyal yek'am ri taq tzij chupam ri q'inoj, chuqa' akuchi' nuk'ül ri ewan tzij.

## Rucholajem taq k'olib'al

Llámenos nuk'äm pa oxi' taq k'olib'al ri yek'wan jun komon protocolo chuqa' jun komon ruk'ojlem ewan tzij:

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

- **llamenos** — Ri chokoy chupam ri kematz'ib' (Tauri v2 ruk'wan jun Vite + React webview), ri Cloudflare Worker ruk'ojlem, chuqa' ri aj chokoy Node.js ri yakon ruma ri aj chokoy. Re re' ri nimalaj k'olib'al.
- **llamenos-core** — Jun komon Rust crate ri nub'än ronojel ri taq samajib'äl ewan tzij: ECIES envelope encryption, Schnorr signatures, PBKDF2 key derivation, HKDF, chuqa' XChaCha20-Poly1305. Compiled pa native code (richin Tauri), WASM (richin kematz'ib'), chuqa' UniFFI bindings (richin chokoy pa oyonib'al).
- **llamenos-platform** — Ri React Native chokoy pa oyonib'al richin iOS chuqa' Android. Okisax UniFFI bindings richin yokisäx riRust ewan tzij code.

Ronojel oxi' taq ruk'ojlib'al nub'än ri junam wire protocol nrajo' pa `docs/protocol/PROTOCOL.md`.

## Ruk'amik taq tzij

### Ojqanem pa t'elefon

```
Ojqanel (t'elefon)
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

### Ojqanem pa tz'ib' (SMS / WhatsApp / Signal)

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

Ri ruk'ojlem nuk'ul oxi' taq Cloudflare Durable Objects (o ri PostgreSQL equivalents richin self-hosted deployments):

| Durable Object | Ruchajic |
|---|---|
| **IdentityDO** | Nuk'samajij ri taq anima'el kichin ri taq to'onel, taq ewan rutzijol winaq, b'i'aj taq etal, chuqa' taq WebAuthn credentials. Nub'än ri ruk'utik chuqa' ruk'exik taq rutz'ib'axik ojqanem. |
| **SettingsDO** | Nuyak ri runuk'ulem hotline: b'i'aj, taq samajinel taqanel, taq rutzijol winaq ruk'wayis, samajinel taq tz'ib'aj taq notes, taq runuk'ulem spam mitigation, feature flags. |
| **RecordsDO** | Nuyak taq ewan notes pa t'elefon, taq ewan taq tz'ib'axik, chuqa' file attachment metadata. Nub'än ri rukanoxik notes (over encrypted metadata). |
| **ShiftManagerDO** | Nuk'utik chuqa' nuk'oj ri recurring shift schedules, ring groups, taq rutz'ib'axik ojqanem pa shifts. Nuk'üt achi'el ri winaq k'o pa shift pa jun q'ijul. |
| **CallRouterDO** | Nuk'utik pa q'ijul ri ruk'amik t'elefon: parallel ringing, first-pickup termination, break status, active call tracking. Generates TwiML/provider responses. |
| **ConversationDO** | Nuk'utik taq threaded messaging conversations chupam SMS, WhatsApp, chuqa' Signal. Nub'än message encryption on ingest, conversation assignment, chuqa' outbound replies. |

Ronojel DOs yek'ul junam singletons via `idFromName()` chuqa' yek'utik internally ruma jun `DORouter` (method + path pattern matching).

## Encryption matrix

| Tzij | Ewan? | Algorithm | Achi'el ri tikirel nisöl |
|---|---|---|---|
| Call notes | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Rutz'ib'axik note + ronojel taq admin |
| Note custom fields | Yes (E2EE) | Same as notes | Rutz'ib'axik note + ronojel taq admin |
| Reports | Yes (E2EE) | Same as notes | Rutz'ib'axik report + ronojel taq admin |
| Report attachments | Yes (E2EE) | XChaCha20-Poly1305 (streamed) | Rutz'ib'axik report + ronojel taq admin |
| Message content | Yes (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Assigned volunteer + ronojel taq admin |
| Transcripts | Yes (at-rest) | XChaCha20-Poly1305 | Transcript creator + ronojel taq admin |
| Hub events (WebSocket) | Yes (symmetric) | XChaCha20-Poly1305 with hub key | Ronojel taq aktual taq winaq pa hub |
| Volunteer nsec | Yes (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Volunteer only |
| Audit log entries | No (integrity-protected) | SHA-256 hash chain | Taq admin (read), q'inoj (write) |
| Caller phone numbers | No (server-side only) | N/A | Server + taq admin |
| Volunteer phone numbers | Stored in IdentityDO | N/A | Taq admin only |

### Per-note forward secrecy

Jun jun note o message nuk'ül jun unique random symmetric key. Re ri' key nub'än wrap via ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) individually richin jun jun authorized reader. Compromising jun note's key majun niya' retal chi rij ch'aqa' chik taq notes. Majun long-lived symmetric keys richin content encryption.

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

## Rutzijoxik pa ri q'ijul

Real-time updates (new calls, messages, shift changes, presence) yek'am chupam jun WebSocket relay:

- **Self-hosted**: WebSocket relay running alongside ri app pa Docker/Kubernetes
- **Cloudflare**: Nosflare (Cloudflare Workers-based relay)

Ronojel events yek'owis (kind 20001) chuqa' ewan ruma ri hub key. Events okisax generic tags (`["t", "llamenos:event"]`) richin ri relay majun tikirel nik'ut achike samaj ri'. Ri content field nuya' XChaCha20-Poly1305 ciphertext.

### Ruk'amik events

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as WebSocket event (Schnorr)
    v
WebSocket relay
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

Ri relay nuk'ül ewan blobs chuqa' valid signatures pero majun tikirel nisöl ri event content o nuk'üt achike taq samajib'äl ye'okisäx.

## Security layers

### Transport layer

- Ronojel client-server communication over HTTPS (TLS 1.3)
- WebSocket connections to WebSocket relay over WSS
- Content Security Policy (CSP) restricts script sources, connections, chuqa' frame ancestors
- Tauri isolation pattern separates IPC from ri webview

### Application layer

- Authentication via WebSocket keypairs (BIP-340 Schnorr signatures)
- WebAuthn session tokens richin multi-device convenience
- Role-based access control (caller, volunteer, reporter, admin)
- Ronojel 25 cryptographic domain separation constants nrajo' pa `crypto-labels.ts` nuchajij cross-protocol attacks

### At-rest encryption

- Call notes, reports, messages, chuqa' transcripts ewan chuwäch niyak
- Volunteer secret keys ewan ruma PIN-derived keys (PBKDF2)
- Tauri Stronghold provides encrypted vault storage pa desktop
- Audit log integrity protected via SHA-256 hash chain

### Build verification

- Reproducible builds via `Dockerfile.build` ruk'wan `SOURCE_DATE_EPOCH`
- Content-hashed filenames richin frontend assets
- `CHECKSUMS.txt` published ruk'wan GitHub Releases
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
