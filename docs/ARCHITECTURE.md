# Architecture Overview

> For full protocol details (wire formats, crypto algorithms, API endpoints), see `docs/protocol/PROTOCOL.md`.

## Monorepo Structure

```
apps/desktop/       Tauri v2 desktop shell (Rust backend + webview frontend)
apps/worker/        Bun HTTP server (Hono + PostgreSQL)
apps/ios/           Native SwiftUI iOS client
apps/android/       Native Kotlin/Compose Android client
apps/sip-bridge/    Protocol-agnostic SIP bridge (PBX_TYPE selects ARI/ESL/Kamailio)
packages/crypto/    Shared Rust crypto crate (native + WASM + UniFFI)
packages/protocol/  JSON Schema definitions + codegen (TS/Swift/Kotlin)
packages/shared/    Cross-boundary TypeScript types and config
packages/i18n/      Localization files + iOS/Android string codegen
```

All platforms implement the same protocol: `docs/protocol/PROTOCOL.md`

## Data Flow

```
Caller (GSM phone)
  │
  ▼
Twilio / SIP Provider ──► TelephonyAdapter (8 providers)
  │
  ▼
Bun HTTP Server (Hono) ──► PostgreSQL
  │                           │
  ├─ REST responses ◄─────────┤
  │                           │
  ▼                           ▼
Nostr Relay (strfry)     RustFS (encrypted file storage)
  │
  ├──► Desktop App (Tauri v2 + webview)
  │      └── Rust CryptoState (device keys never enter webview)
  │
  ├──► iOS App (Native SwiftUI)
  │      └── packages/crypto via UniFFI XCFramework
  │
  └──► Android App (Native Kotlin/Compose)
         └── packages/crypto via JNI .so
```

## Encryption Architecture

### Who encrypts what

| Data | Encrypted by | Decryptable by | Scheme |
|------|-------------|----------------|--------|
| Call notes | Author's client | Author + admins | HPKE per-note key (legacy: ECIES) |
| Messages | Volunteer client | Assigned volunteer + admins | HPKE per-message key (legacy: ECIES) |
| Call records | Server | Admins only | HPKE per-record key (legacy: ECIES) |
| Drafts | Client | Same client only | HKDF-derived key |
| PIN-protected device keys | Client | Same device | PBKDF2 + AES-256-GCM |
| Hub events | Server | All members | Hub key (shared secret) via XChaCha20-Poly1305 |

### Key storage per platform

| Platform | Where device keys live | Access control |
|----------|----------------------|----------------|
| Desktop (Tauri) | Tauri Stronghold / Rust `CryptoState` | Never enters webview |
| iOS | Keychain Services | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` |
| Android | EncryptedSharedPreferences | AndroidKeyStore-backed |
| API server | Never stored | Server has own keypair; user keys never sent |

### Cryptographic primitives

- **Envelope encryption**: HPKE RFC 9180 (X25519 + HKDF-SHA256 + AES-256-GCM) — current
- **Legacy envelope**: secp256k1 ECIES (ECDH + XChaCha20-Poly1305) — for existing data
- **Symmetric**: XChaCha20-Poly1305 (24-byte nonce, 16-byte tag) for hub events
- **KDF**: HKDF-SHA-256, PBKDF2-SHA-256 600K iterations (PINs)
- **Signing**: Ed25519 (device auth, sigchain) + BIP-340 Schnorr (Nostr identity)
- **Domain separation**: 57 labeled contexts in `packages/protocol/crypto-labels.json`

All crypto is implemented once in Rust (`packages/crypto/`), compiled to:
- Native library (Tauri desktop, path dep from `apps/desktop/Cargo.toml`)
- UniFFI XCFramework (iOS) and JNI `.so` (Android)
- WASM (browser test builds)

## Backend Services

The backend runs as a Bun HTTP server with Hono routing and PostgreSQL for persistence:

| Service Layer | Responsibility |
|--------------|---------------|
| Identity service | User identities, pubkeys, roles, device registry |
| Settings service | Hub settings, telephony config, spam rules |
| Records service | Call records, notes, audit log |
| Shift service | Shift schedules, assignments |
| Call router | Active call routing, parallel ringing |
| Conversation service | SMS/WhatsApp/Signal messaging threads |
| CMS services | Contacts, cases, reports, evidence |

## Real-Time Sync

Nostr relay (strfry) with encrypted ephemeral events:
- All event content encrypted with hub key
- Generic tags (`["t", "llamenos:event"]`) — relay can't distinguish types
- Hub key rotated on member departure (excludes departed member)

## Security Layers

| Layer | Desktop | iOS | Android |
|-------|---------|-----|---------|
| Transport | HTTPS (CSP enforced) | HTTPS (App Transport Security) | HTTPS (network security config) |
| IPC isolation | Tauri isolation pattern + capabilities | N/A (native) | N/A (native) |
| Key protection | CryptoState in Rust (zeroize on drop) | Keychain + CryptoService singleton | EncryptedSharedPreferences + CryptoService |
| Auth | Ed25519 device signatures (legacy: Schnorr) | Ed25519 device signatures | Ed25519 device signatures |
| Forward secrecy | HPKE ephemeral encapsulation per envelope | HPKE ephemeral encapsulation | HPKE ephemeral encapsulation |
