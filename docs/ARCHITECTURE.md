# Architecture Overview

> **Note:** This document reflects the original pre-monorepo architecture (three separate repos, React Native, Cloudflare Durable Objects).
> The current architecture is a monorepo (`apps/`, `packages/`) with native iOS/Android, Bun+PostgreSQL backend, and a Rust crypto crate.
> See `CLAUDE.md` for the authoritative current architecture description.

## Three-Repo Structure (Historical)

```
llamenos/           Desktop app (Tauri v2) + API + protocol spec
llamenos-core/      Shared Rust crypto crate (native + WASM + UniFFI)
llamenos-mobile/    React Native mobile app (Expo)
```

All three implement the same protocol: `docs/protocol/PROTOCOL.md`

## Data Flow

```
Caller (GSM phone)
  │
  ▼
Twilio / SIP Provider ──► TelephonyAdapter
  │
  ▼
Cloudflare Worker API ──► Durable Objects (6 singletons)
  │                           │
  ├─ REST responses ◄─────────┤
  │                           │
  ▼                           ▼
Nostr Relay (strfry)     PostgreSQL (self-hosted alt)
  │
  ├──► Desktop App (Tauri v2 + webview)
  │      └── Rust CryptoState (nsec never enters webview)
  │
  └──► Mobile App (React Native)
         └── llamenos-core via UniFFI (nsec in native layer)
```

## Encryption Architecture

### Who encrypts what

| Data | Encrypted by | Decryptable by | Scheme |
|------|-------------|----------------|--------|
| Call notes | Author's client | Author + admins | ECIES per-note key |
| Messages | Volunteer client | Assigned volunteer + admins | ECIES per-message key |
| Call records | Server | Admins only | ECIES per-record key |
| Drafts | Client | Same client only | HKDF-derived key |
| PIN-protected nsec | Client | Same device | PBKDF2 + XChaCha20 |
| Hub events | Server | All members | Hub key (shared secret) |

### Key storage per platform

| Platform | Where nsec lives | Access control |
|----------|-----------------|----------------|
| Desktop (Tauri) | Rust `CryptoState` | Never enters webview |
| Mobile (RN) | expo-secure-store | Keychain (iOS) / EncryptedSharedPreferences (Android) |
| API server | Never stored | Server has own keypair; user keys never sent |

### Cryptographic primitives

- **Curve**: secp256k1 (ECDH + BIP-340 Schnorr)
- **AEAD**: XChaCha20-Poly1305 (24-byte nonce, 16-byte tag)
- **KDF**: HKDF-SHA-256 (legacy), PBKDF2-SHA-256 600K iterations (PINs)
- **Domain separation**: 28 labeled contexts in `crypto-labels.ts` / `labels.rs`

All crypto is implemented once in Rust (`llamenos-core`), compiled to:
- Native library (Tauri desktop)
- UniFFI Swift/Kotlin bindings (React Native mobile)
- WASM (future browser support)

## Durable Objects (Cloudflare)

Six singletons accessed via `idFromName()`:

| DO | Responsibility |
|----|---------------|
| IdentityDO | Volunteer identities, pubkeys, roles |
| SettingsDO | Hub settings, telephony config, spam rules |
| RecordsDO | Call records, notes, audit log |
| ShiftManagerDO | Shift schedules, assignments |
| CallRouterDO | Active call routing, parallel ringing |
| ConversationDO | SMS/WhatsApp/Signal messaging threads |

## Real-Time Sync

Nostr relay (strfry) with encrypted ephemeral events:
- All event content encrypted with hub key
- Generic tags (`["t", "llamenos:event"]`) — relay can't distinguish types
- Hub key rotated on member departure (excludes departed member)

## Security Layers

| Layer | Desktop | Mobile |
|-------|---------|--------|
| Transport | HTTPS (CSP enforced) | HTTPS (enforced in API client) |
| IPC isolation | Tauri isolation pattern + allowlist | N/A (native bridge) |
| Key protection | CryptoState in Rust (zeroize on drop) | expo-secure-store + PBKDF2 |
| Auth | BIP-340 Schnorr signatures | BIP-340 Schnorr signatures |
| Forward secrecy | Ephemeral ECDH per encryption | Ephemeral ECDH per encryption |
