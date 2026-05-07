# Ed25519 Auth & Identity Purge

**Date:** 2026-05-05
**Status:** Draft
**Depends on:** Rust FFI Server Crypto Bridge
**Depended on by:** HPKE Envelope Encryption, WebSocket Relay

## Context

Llamenos authentication currently has a dual-path verification system: try Schnorr (secp256k1 BIP-340) first, fall back to Ed25519. This backward compatibility exists because the codebase transitioned from Nostr-style `nsec` identity keys to Ed25519 per-device keys but kept the old path "during migration." There are no production users, no stored Schnorr-signed tokens, and no data to migrate. The old path is dead weight that prevents removing `@noble/curves` and the `k256` Rust crate.

**Goal:** Ed25519 is the only signature scheme. No Schnorr. No nsec/npub. No secp256k1 anywhere in auth.

## Changes

### Server Auth Verification

**File:** `apps/worker/lib/auth.ts`

Current `verifyAuthToken()` has a try-Schnorr-then-try-Ed25519 ladder. Replace with a single Ed25519 verify call through Rust FFI:

```typescript
import { ed25519Verify } from '@llamenos/crypto/ffi'
import { utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'

export async function verifyAuthToken(auth: AuthPayload, method?: string, path?: string): Promise<boolean> {
  if (!validateToken(auth)) return false
  if (!method || !path) return false
  try {
    const message = utf8ToBytes(
      `${LABEL_DEVICE_AUTH}:${auth.pubkey}:${auth.timestamp}:${method}:${path}`
    )
    return ed25519Verify(
      hexToBytes(auth.pubkey),
      message,
      hexToBytes(auth.token),
    )
  } catch {
    return false
  }
}
```

No fallback. No try/catch ladder. One code path.

**CRITICAL: Canonical auth message format** (must match exactly between Rust `auth.rs` and server `auth.ts`):

```
{LABEL_DEVICE_AUTH}:{pubkey_hex}:{timestamp_ms}:{METHOD}:{path}
```

Example: `llamenos:device-auth:v1:abc123...def:1717000000000:GET:/api/calls`

**Design decisions:**
- **No pre-hashing:** Ed25519 signs the raw UTF-8 message bytes directly (not `SHA-256(message)`). Ed25519 internally applies SHA-512, providing full 256-bit collision resistance. Pre-hashing with SHA-256 would reduce this to 128 bits — unnecessary and weaker.
- **Pubkey included in message:** Binds the signature to the specific key identity, preventing type confusion even though Ed25519 signatures are inherently key-bound.
- **Label from `crypto-labels.json`:** Uses registered `LABEL_DEVICE_AUTH`, not a local string literal. Both Rust and TypeScript read from the same source of truth.

**Rust `auth.rs` must be updated** to match this format (currently uses `LABEL_DEVICE_AUTH:{timestamp}:{method}:{path}` without pubkey). Add pubkey to the Rust message construction. Add cross-language test vectors to verify byte-identical messages.

**Imports removed:**
- `schnorr` from `@noble/curves/secp256k1.js`
- `ed25519` from `@noble/curves/ed25519.js`
- `sha256` from `@noble/hashes/sha2.js`
- `hexToBytes` from `@noble/hashes/utils.js`
- `utf8ToBytes` from `@noble/ciphers/utils.js`

### Server Keypair Derivation

**File:** `apps/worker/lib/nostr-publisher.ts` → deleted (see WebSocket Relay spec)

The server's signing keypair derivation moves to a new `apps/worker/lib/server-identity.ts`:

```typescript
import { hkdfSha256, ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { utf8ToBytes } from '@shared/encoding'

const LABEL_SERVER_SIGNING_KEY = 'llamenos:server-signing-key:v1'
const LABEL_SERVER_SIGNING_INFO = 'llamenos:server-signing-key-info:v1'

export function deriveServerKeypair(serverSecret: string): { secretKey: Uint8Array; pubkey: Uint8Array } {
  const secretKey = hkdfSha256(
    hexToBytes(serverSecret),
    utf8ToBytes(LABEL_SERVER_SIGNING_KEY),
    utf8ToBytes(LABEL_SERVER_SIGNING_INFO),
    32,
  )
  const pubkey = ed25519PubkeyFromSeed(secretKey)
  return { secretKey, pubkey }
}
```

**Env var:** `SERVER_NOSTR_SECRET` renamed to `SERVER_SECRET` (or reuse existing `HMAC_SECRET` with distinct HKDF labels — decision below).

### Client Auth Token Creation

**File:** `src/client/lib/platform.ts`

The `createAuthToken()` IPC command already delegates to Rust CryptoState. The Rust side switches from `auth_legacy.rs` (Schnorr) to `auth.rs` (Ed25519). No client-side TypeScript change needed beyond removing `legacyImportNsec()`.

### Demo Accounts

**File:** `src/client/lib/demo-nsec-data.ts` → deleted

Demo accounts currently store `nsec1...` bech32-encoded secp256k1 secret keys. Replace with Ed25519 seeds in hex:

New file: `src/client/lib/demo-accounts.ts`
```typescript
export const DEMO_ACCOUNTS = [
  { name: 'Admin Demo', seedHex: '0'.repeat(64), role: 'admin' },  // deterministic test seed
  { name: 'Volunteer Demo', seedHex: '1'.repeat(64), role: 'user' },  // deterministic test seed
  // ... additional demo accounts with distinct seeds
] as const
```

Seeds are deterministic test fixtures, not production credentials.

### Test Infrastructure

**Files affected:**
- `tests/api-helpers.ts` — `createAuthToken()` switches from `schnorr.sign()` to `ed25519Sign()` via FFI
- `tests/global-setup.ts` — admin bootstrap uses Ed25519 seed, not nsec
- `tests/steps/backend/auth.steps.ts` — Ed25519 token creation
- `tests/steps/backend/invite.steps.ts` — Ed25519 signed invites
- `tests/steps/backend/network-security.steps.ts` — Ed25519 tokens
- `apps/worker/lib/auth.test.ts` — Ed25519 only verification tests
- `apps/worker/__tests__/unit/auth-utils.test.ts` — same

**Pattern for test auth tokens:**
```typescript
import { ed25519Sign, sha256, ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'

function createTestAuthToken(seed: Uint8Array, method: string, path: string): AuthPayload {
  const pubkey = ed25519PubkeyFromSeed(seed)
  const timestamp = Date.now()
  const message = `llamenos:auth:${bytesToHex(pubkey)}:${timestamp}:${method}:${path}`
  const hash = sha256(utf8ToBytes(message))
  const token = ed25519Sign(seed, hash)
  return { pubkey: bytesToHex(pubkey), timestamp, token: bytesToHex(token) }
}
```

### Pubkey Format

**Current:** 64-char hex (x-only secp256k1 Schnorr pubkey, 32 bytes)
**New:** 64-char hex (Ed25519 pubkey, 32 bytes)

Same wire format (64 hex chars = 32 bytes). Database columns unchanged. The bytes just mean something different now. No schema migration needed.

### Settings UI

**File:** `src/client/routes/settings.tsx`

Remove `nip19` import and any nsec/npub display. Identity display shows Ed25519 pubkey hex (or a truncated fingerprint). No bech32 encoding.

## Files Deleted

| File | Reason |
|------|--------|
| `src/client/lib/demo-nsec-data.ts` | Replaced by `demo-accounts.ts` with Ed25519 seeds |
| `packages/crypto/src/auth_legacy.rs` | Schnorr auth — replaced by `auth.rs` |
| `packages/crypto/src/keys_legacy.rs` | secp256k1 keypairs — replaced by `device_keys.rs` |
| `packages/crypto/src/nostr.rs` | NIP-01 event signing — Nostr removed entirely |

## Files Modified

| File | Change |
|------|--------|
| `apps/worker/lib/auth.ts` | Remove Schnorr, use FFI Ed25519 |
| `src/client/lib/platform.ts` | Remove `legacyImportNsec()` |
| `src/client/routes/settings.tsx` | Remove `nip19` import |
| `tests/api-helpers.ts` | Ed25519 auth tokens |
| `tests/global-setup.ts` | Ed25519 admin bootstrap |
| All BDD step files using Schnorr | Ed25519 tokens |

## Decisions to Review

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Remove Schnorr entirely | Yes, no fallback | Keep as deprecated fallback | No production users, no data. Dead code is attack surface |
| Pubkey format stays 64-char hex | Same wire format | Switch to base64url | Minimizes change surface. 64 hex = 32 bytes regardless of curve |
| Server secret consolidation | Single `SERVER_SECRET` with HKDF labels | Keep separate `SERVER_NOSTR_SECRET` + `HMAC_SECRET` | One secret, deterministic derivation per purpose via labels. Fewer env vars to manage |
| Test auth via FFI | Tests call `.so` | Use `@noble/curves/ed25519` as devDep | Single implementation even in tests. No mock drift |
