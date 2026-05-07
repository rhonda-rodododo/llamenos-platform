# HPKE Envelope Encryption

**Date:** 2026-05-05
**Status:** Draft
**Depends on:** Rust FFI Server Crypto Bridge, Ed25519 Auth Purge
**Depended on by:** WebSocket Relay (for event encryption)

## Context

Llamenos uses an envelope encryption pattern for E2EE: a random symmetric key encrypts the content, then the symmetric key is wrapped asymmetrically for each authorized reader. Currently this wrapping uses ECIES (secp256k1 ECDH + HKDF + XChaCha20-Poly1305). The Rust crate already has a working `hpke_envelope.rs` implementing RFC 9180, but it's not used by the TypeScript server or client code.

**Goal:** Replace all ECIES key wrapping with HPKE. Replace all XChaCha20-Poly1305 symmetric encryption with AES-256-GCM. One asymmetric primitive (HPKE), one AEAD (AES-256-GCM), both implemented in Rust.

## HPKE Suite

```
KEM:  DHKEM(X25519, HKDF-SHA256)  — RFC 9180 0x0020
KDF:  HKDF-SHA256                  — RFC 9180 0x0001
AEAD: AES-256-GCM                  — RFC 9180 0x0002
Mode: Base (anonymous sender)
```

This is the same suite used by `packages/crypto/src/hpke_envelope.rs` and by `llamenos-hotline`'s `@hpke/core` implementation.

## Envelope Format

### Old (ECIES v2)

```typescript
interface EciesEnvelope {
  wrappedKey: string    // hex: version(1) + nonce(24) + ciphertext
  ephemeralPubkey: string  // hex: compressed secp256k1 pubkey (33 bytes)
}
```

### New (HPKE v3)

```typescript
interface HpkeEnvelope {
  enc: string   // hex: X25519 ephemeral pubkey (32 bytes)
  ct: string    // hex: AES-256-GCM ciphertext + tag (16 bytes)
}
```

Wire format is smaller (32-byte enc vs 33-byte compressed pubkey, no version byte, no 24-byte nonce — GCM nonce is internal to HPKE).

### Recipient Envelope (unchanged shape)

```typescript
interface RecipientEnvelope {
  pubkey: string   // hex: recipient's X25519 public key (32 bytes)
  enc: string      // hex: HPKE enc (ephemeral pubkey)
  ct: string       // hex: HPKE ciphertext (wrapped symmetric key + tag)
}
```

## Server-Side Encryption Tiers

### Tier 1: Server-Encrypted (Symmetric)

For data the server must read at runtime (credentials, push endpoints, IVR audio):

```typescript
import { symmetricEncrypt, symmetricDecrypt, hkdfSha256 } from '@llamenos/crypto/ffi'

function serverEncrypt(plaintext: Uint8Array, label: string, serverSecret: Uint8Array): Uint8Array {
  const key = hkdfSha256(serverSecret, new Uint8Array(0), utf8ToBytes(label), 32)
  return symmetricEncrypt(key, plaintext, utf8ToBytes(label))  // AES-256-GCM
}
```

**Replaces:** `encryptContactIdentifier()`, `encryptStorageCredential()`, and similar functions in `apps/worker/lib/crypto.ts` that used `@noble/ciphers/chacha` + `@noble/hashes/hkdf`.

### Tier 2: Hub-Encrypted (Shared Symmetric Key)

For data visible to all hub members (role names, shift metadata, contact identifiers):

```typescript
function hubEncrypt(plaintext: Uint8Array, hubKey: Uint8Array, label: string): Uint8Array {
  return symmetricEncrypt(hubKey, plaintext, utf8ToBytes(label))
}
```

No change in pattern — just switches AEAD from XChaCha20-Poly1305 to AES-256-GCM via FFI.

### Tier 3: E2EE Envelope (Per-Recipient HPKE)

For data only specific recipients can read (messages, notes, PII):

```typescript
import { hpkeSeal, symmetricEncrypt, randomBytes } from '@llamenos/crypto/ffi'

function envelopeEncrypt(
  plaintext: Uint8Array,
  readerPubkeys: Uint8Array[],
  label: string,
): { encryptedContent: Uint8Array; envelopes: RecipientEnvelope[] } {
  const contentKey = randomBytes(32)
  const encryptedContent = symmetricEncrypt(contentKey, plaintext, utf8ToBytes(label))

  const envelopes = readerPubkeys.map(pk => {
    const sealed = hpkeSeal(pk, contentKey, utf8ToBytes(label), utf8ToBytes(`${label}:key-wrap`))
    // sealed = enc(32) || ciphertext+tag
    return {
      pubkey: bytesToHex(pk),
      enc: bytesToHex(sealed.subarray(0, 32)),
      ct: bytesToHex(sealed.subarray(32)),
    }
  })

  return { encryptedContent, envelopes }
}
```

## Domain Separation (Label Enforcement)

All 57 labels from `crypto-labels.json` continue to be enforced. The label is passed as:
- HPKE `info` parameter (binds the key schedule to the purpose)
- AES-256-GCM `aad` parameter (binds ciphertext to the purpose)

This is the Albrecht defense — decrypting with the wrong label fails even if you have the right key.

## Call Sites to Migrate

| Function | File | Current | New |
|----------|------|---------|-----|
| `eciesWrapKeyForRecipient()` | `apps/worker/lib/crypto.ts` | ECIES | `hpkeSeal()` via FFI |
| `eciesWrapKeyServer()` | `apps/worker/lib/crypto.ts` | ECIES | `hpkeSeal()` via FFI |
| `encryptMessageForStorage()` | `apps/worker/lib/crypto.ts` | ECIES + XChaCha20 | HPKE + AES-256-GCM |
| `encryptCallRecordForStorage()` | `apps/worker/lib/crypto.ts` | ECIES + XChaCha20 | HPKE + AES-256-GCM |
| `encryptContactIdentifier()` | `apps/worker/lib/crypto.ts` | HKDF + XChaCha20 | `serverEncrypt()` via FFI |
| `decryptContactIdentifier()` | `apps/worker/lib/crypto.ts` | HKDF + XChaCha20 | `serverDecrypt()` via FFI |
| `encryptStorageCredential()` | `apps/worker/lib/crypto.ts` | HKDF + XChaCha20 | `serverEncrypt()` via FFI |
| `decryptStorageCredential()` | `apps/worker/lib/crypto.ts` | HKDF + XChaCha20 | `serverDecrypt()` via FFI |
| `hashPhone()` | `apps/worker/lib/crypto.ts` | `@noble/hashes/hmac` | `hmacSha256()` via FFI |
| `hashIP()` | `apps/worker/lib/crypto.ts` | `@noble/hashes/hmac` | `hmacSha256()` via FFI |
| `hashAuditEntry()` | `apps/worker/lib/crypto.ts` | `@noble/hashes/sha2` | `sha256()` via FFI |
| `stableJsonStringify()` | `apps/worker/lib/crypto.ts` | Pure JS | Unchanged (no crypto) |
| Hub key wrapping | `src/client/lib/hub-key-manager.ts` | ECIES via platform.ts | HPKE via platform.ts |
| File encryption | `src/client/lib/file-crypto.ts` | ECIES + XChaCha20 | HPKE + AES-256-GCM via platform.ts |
| Push encryption | `apps/worker/lib/push-encryption.ts` | ECIES + XChaCha20 | HPKE + AES-256-GCM via FFI |
| Device provisioning | `src/client/lib/provisioning.ts` | secp256k1 ECDH | HPKE via platform.ts |
| Firehose agent | `apps/worker/services/firehose-agent.ts` | XChaCha20 decryption | AES-256-GCM via FFI |

## Client-Side (Desktop)

`src/client/lib/platform.ts` IPC commands change:

```
eciesWrapKey    → hpkeSeal      (Rust CryptoState)
eciesUnwrapKey  → hpkeOpen      (Rust CryptoState)
```

The Rust `CryptoState` in `apps/desktop/src/crypto.rs` already has access to `hpke_envelope.rs`. IPC handler implementations switch from calling `ecies::wrap_key()` to `hpke_envelope::seal()`.

## Client-Side (Mobile)

iOS and Android already have `hpke_envelope` available via UniFFI. The mobile `CryptoService` wrappers switch from ECIES calls to HPKE calls. Same pattern as desktop.

## Test Migration

**`tests/crypto-helpers.ts`:**
- Remove ECIES encrypt/decrypt helpers
- Add HPKE seal/open helpers via FFI
- Replace XChaCha20-Poly1305 with AES-256-GCM for symmetric test encryption

**`tests/crypto-interop.spec.ts`:**
- Rewrite to test HPKE interop: TypeScript (via FFI) seals → Rust opens, and vice versa
- Test label enforcement: seal with label A, try to open with label B → must fail

**`tests/mocks/tauri-core.ts`:**
- Replace ECIES mock with FFI calls to real Rust crypto
- No more mock crypto — tests use the real `.so`

## Rust Module Changes

| Module | Action |
|--------|--------|
| `hpke_envelope.rs` | Keep — this is the new primary |
| `ecies.rs` | Delete |
| `encryption_legacy.rs` | Delete |
| `encryption.rs` | Update to AES-256-GCM only |

## Files Deleted

- `packages/crypto/src/ecies.rs`
- `packages/crypto/src/encryption_legacy.rs`

## Decisions to Review

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| AES-256-GCM for all symmetric | Single AEAD | XChaCha20-Poly1305 for symmetric, AES-256-GCM for HPKE | One AEAD = simpler audit. AES-NI hardware acceleration on all server/desktop CPUs. No production data to migrate |
| HPKE base mode (anonymous sender) | Base mode | Auth mode (sender-authenticated) | Matches v1 pattern. Sender identity established via auth token, not HPKE mode |
| Label as both `info` and `aad` | Dual binding | Label as `info` only | Albrecht defense — defense in depth. Existing `hpke_envelope.rs` already does this |
| Remove `migrateContactIfNeeded()` | Delete | Keep for future migrations | No production data. YAGNI. Can re-add if needed |
