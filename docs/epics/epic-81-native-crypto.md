# Epic 81: Native Crypto Migration (llamenos-core Unification)

## Problem Statement

Llamenos currently has two independent crypto implementations:

1. **JavaScript** (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`) -- used by the browser SPA
2. **Rust** (`llamenos-core` crate with `k256`, `chacha20poly1305`, `hkdf`, `sha2`) -- used by the Tauri desktop app via IPC commands

This dual implementation creates several problems:

- **Two codebases to audit**: Any crypto change must be made and reviewed in both JS and Rust. A bug in one may not exist in the other, creating subtle cross-platform inconsistencies.
- **No shared test vectors**: There is no guarantee that both implementations produce identical output for the same input. A note encrypted on desktop might fail to decrypt in the browser, or vice versa.
- **Platform detection complexity**: The frontend must detect whether it is running in Tauri and route crypto calls accordingly. This branching logic is spread across multiple files.
- **Future platforms multiply the problem**: React Native (Epic 75) would add a third implementation, and any future platform (iOS native, Android native) adds more.

**Goal**: Converge on a single crypto implementation -- `llamenos-core` in Rust -- compiled to native code for desktop (via Tauri IPC), to WASM for browser, and to native libraries for mobile (via UniFFI). One codebase, one audit, identical behavior everywhere.

## Architecture Overview

```
                         llamenos-core (Rust)
                    Single auditable crypto crate
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        Tauri IPC         wasm-bindgen       UniFFI
        (native)          (WASM module)    (Swift/Kotlin)
              │                │                │
        ┌─────┘          ┌─────┘          ┌─────┘
        │                │                │
   Desktop App       Browser SPA      Mobile App
   (macOS/Win)      (all browsers)   (iOS/Android)
```

The migration proceeds in phases, maintaining full backward compatibility at each step. At no point does any platform lose crypto functionality.

## Phase 1: Platform Detection Layer

**What it does**: Create a unified platform abstraction (`src/client/lib/platform.ts`) that detects the runtime environment and routes all crypto calls through a single interface. On desktop, calls go to Rust via Tauri IPC. On browser, calls go to the existing `@noble/*` JS code. This is the foundational routing layer that all subsequent phases build on.

**Platforms affected**: All (browser, desktop)

**Implementation**:

```typescript
// src/client/lib/platform.ts

export type Platform = 'browser' | 'desktop' | 'mobile'

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'desktop'
  }
  // Future: detect React Native
  return 'browser'
}

export const currentPlatform = detectPlatform()

/**
 * CryptoProvider interface — all crypto operations go through this.
 * Each platform provides its own implementation.
 */
export interface CryptoProvider {
  // ECIES
  eciesWrapKey(key: Uint8Array, recipientPubkey: string, label: string): Promise<KeyEnvelope>
  eciesUnwrapKey(envelope: KeyEnvelope, secretKeyHex: string, label: string): Promise<Uint8Array>

  // Note encryption
  encryptNote(payloadJson: string, authorPubkey: string, adminPubkeys: string[]): Promise<EncryptedNote>
  decryptNote(encryptedContent: string, envelope: KeyEnvelope, secretKeyHex: string): Promise<string>

  // Message encryption
  encryptMessage(plaintext: string, readerPubkeys: string[]): Promise<EncryptedMessage>
  decryptMessage(encryptedContent: string, readerEnvelopes: RecipientKeyEnvelope[], secretKeyHex: string, readerPubkey: string): Promise<string>

  // Auth
  createAuthToken(secretKeyHex: string, timestamp: number, method: string, path: string): Promise<AuthToken>
  verifySchnorr(messageHex: string, signatureHex: string, pubkeyHex: string): Promise<boolean>

  // Key management
  generateKeypair(): Promise<KeyPair>
  getPublicKey(secretKeyHex: string): Promise<string>

  // PIN encryption
  encryptWithPin(nsec: string, pin: string, pubkeyHex: string): Promise<EncryptedKeyData>
  decryptWithPin(data: EncryptedKeyData, pin: string): Promise<string>
}
```

```typescript
// src/client/lib/platform-crypto-browser.ts
// Wraps existing @noble/* code behind the CryptoProvider interface

import * as crypto from './crypto'
import * as ecies from './ecies'
import type { CryptoProvider } from './platform'

export const browserCryptoProvider: CryptoProvider = {
  async eciesWrapKey(key, recipientPubkey, label) {
    return ecies.eciesWrapKey(key, recipientPubkey, label)
  },
  // ... delegate all methods to existing JS implementations
}
```

```typescript
// src/client/lib/platform-crypto-desktop.ts
// Routes calls through Tauri IPC to llamenos-core

import { invoke } from '@tauri-apps/api/core'
import type { CryptoProvider } from './platform'

export const desktopCryptoProvider: CryptoProvider = {
  async eciesWrapKey(key, recipientPubkey, label) {
    return invoke('ecies_wrap_key', {
      keyHex: bytesToHex(key),
      recipientPubkey,
      label,
    })
  },
  // ... delegate all methods to Tauri IPC commands
}
```

```typescript
// src/client/lib/platform-crypto.ts
// The unified entry point — consumers import from here

import { currentPlatform } from './platform'
import type { CryptoProvider } from './platform'

let _provider: CryptoProvider | null = null

export async function getCryptoProvider(): Promise<CryptoProvider> {
  if (_provider) return _provider

  if (currentPlatform === 'desktop') {
    const { desktopCryptoProvider } = await import('./platform-crypto-desktop')
    _provider = desktopCryptoProvider
  } else {
    const { browserCryptoProvider } = await import('./platform-crypto-browser')
    _provider = browserCryptoProvider
  }

  return _provider
}
```

**Acceptance criteria**:
- [ ] `platform.ts` correctly detects browser vs desktop environment
- [ ] `CryptoProvider` interface covers all existing crypto operations
- [ ] `browserCryptoProvider` wraps existing `@noble/*` code with no behavior change
- [ ] `desktopCryptoProvider` wraps existing Tauri IPC commands
- [ ] Lazy loading: browser users never download the desktop provider code (and vice versa)
- [ ] Existing call sites migrated to use `getCryptoProvider()` instead of direct imports
- [ ] All E2E tests pass on both browser and desktop

---

## Phase 2: Key Manager Migration

**What it does**: Migrate `src/client/lib/key-manager.ts` to use the platform layer. On desktop, the nsec is stored in Stronghold (Epic 80) and all key operations route through Rust. On browser, the existing closure-scoped key management is unchanged.

**Platforms affected**: Desktop (primary), browser (interface change only)

**Implementation**:

```typescript
// src/client/lib/key-manager.ts (modified)

import { getCryptoProvider } from './platform-crypto'
import { currentPlatform } from './platform'

// On browser: nsec in closure (existing behavior)
// On desktop: nsec in Rust CryptoState (Epic 80 Phase 6)
let secretKey: Uint8Array | null = null  // browser only
let publicKey: string | null = null

export async function unlock(pin: string): Promise<string> {
  const provider = await getCryptoProvider()

  if (currentPlatform === 'desktop') {
    // Delegates to Stronghold — nsec stays in Rust
    const data = await loadEncryptedKeyFromStore()
    publicKey = await provider.unlockWithPin(data, pin)
    // secretKey stays null on desktop — Rust holds it
    return publicKey
  }

  // Browser: existing flow
  const data = loadEncryptedKeyFromStorage()
  const nsec = await provider.decryptWithPin(data, pin)
  secretKey = hexToBytes(nsec)
  publicKey = await provider.getPublicKey(nsec)
  return publicKey
}

export async function createAuthToken(method: string, path: string): Promise<AuthToken> {
  const provider = await getCryptoProvider()

  if (currentPlatform === 'desktop') {
    // Rust creates the token using its internal secret key
    return provider.createAuthTokenFromState(Date.now(), method, path)
  }

  // Browser: use closure-scoped key
  if (!secretKey) throw new Error('Key manager locked')
  return provider.createAuthToken(bytesToHex(secretKey), Date.now(), method, path)
}
```

**Key design decisions**:
- On desktop, the `secretKey` JS variable is always `null`. The Rust `CryptoState` (Epic 80, Phase 6) holds the actual nsec.
- The `CryptoProvider` gains additional desktop-only methods (`unlockWithPin`, `createAuthTokenFromState`) that operate on the Rust-side secret key without exposing it.
- The `isUnlocked()` check becomes platform-aware: on desktop, it queries Rust state; on browser, it checks the closure variable.

**Acceptance criteria**:
- [ ] `key-manager.ts` uses `getCryptoProvider()` for all crypto operations
- [ ] On desktop, `secretKey` is always `null` (nsec never in JS memory)
- [ ] On browser, existing closure-scoped behavior is unchanged
- [ ] PIN unlock flow works on both platforms
- [ ] Auto-lock (idle timeout, visibility change) works on both platforms
- [ ] `isUnlocked()` returns correct state on both platforms
- [ ] Device linking / provisioning works through the platform layer

---

## Phase 3: ECIES Migration

**What it does**: Route all ECIES wrap/unwrap calls through the platform layer. This covers note key wrapping, file key wrapping, hub key wrapping, and device provisioning key exchange.

**Platforms affected**: Desktop (routes to Rust), browser (wraps existing JS)

**Implementation**:

All call sites that currently import from `src/client/lib/ecies.ts` directly are updated to use the `CryptoProvider`:

```typescript
// Before:
import { eciesWrapKey, eciesUnwrapKey } from '@/lib/ecies'
const envelope = await eciesWrapKey(noteKey, adminPubkey, LABEL_NOTE_KEY)

// After:
import { getCryptoProvider } from '@/lib/platform-crypto'
const provider = await getCryptoProvider()
const envelope = await provider.eciesWrapKey(noteKey, adminPubkey, LABEL_NOTE_KEY)
```

**Call sites to migrate**:
- Note encryption (`src/client/lib/crypto.ts` -- `encryptNote`, `decryptNote`)
- Hub key wrapping (`src/client/lib/nostr/encryption.ts` -- hub key distribution)
- File encryption (`src/client/lib/crypto.ts` -- `encryptFile`, `decryptFile`)
- Device provisioning (`src/client/lib/device-provision.ts` -- ECDH key exchange)

**Acceptance criteria**:
- [ ] All ECIES call sites use `CryptoProvider` instead of direct `@noble/*` imports
- [ ] Desktop ECIES operations execute in Rust via `llamenos-core`
- [ ] Browser ECIES operations use existing `@noble/*` code
- [ ] Cross-platform test: note encrypted on desktop can be decrypted in browser (and vice versa)
- [ ] All domain separation labels (`LABEL_NOTE_KEY`, `LABEL_HUB_KEY_WRAP`, etc.) pass through correctly

---

## Phase 4: Auth Token Migration

**What it does**: Route Schnorr auth token creation through the platform layer. On desktop, tokens are created natively in Rust without the nsec ever reaching the webview.

**Platforms affected**: Desktop (primary), browser (interface change only)

**Implementation**:

The auth token flow in `src/client/lib/crypto.ts` creates a Schnorr signature over `{timestamp}:{method}:{path}` with the `llamenos:auth:` prefix. This is migrated to the platform layer:

```typescript
// src/client/lib/api.ts (modified)

import { getCryptoProvider } from '@/lib/platform-crypto'
import { currentPlatform } from '@/lib/platform'

async function getAuthHeaders(method: string, path: string): Promise<Headers> {
  const provider = await getCryptoProvider()
  const timestamp = Math.floor(Date.now() / 1000)

  let token: AuthToken
  if (currentPlatform === 'desktop') {
    // Rust creates the token using its internal secret key
    token = await provider.createAuthTokenFromState(timestamp, method, path)
  } else {
    // Browser: pass secret key explicitly
    const skHex = getSecretKeyHex() // from key-manager
    token = await provider.createAuthToken(skHex, timestamp, method, path)
  }

  return new Headers({
    'X-Auth-Token': JSON.stringify(token),
  })
}
```

**Acceptance criteria**:
- [ ] Auth token creation routes through `CryptoProvider`
- [ ] Desktop tokens are created entirely in Rust (nsec never sent to webview)
- [ ] Browser tokens use existing JS Schnorr implementation
- [ ] Auth tokens from both platforms are accepted by the server (identical format)
- [ ] Token verification test: create token on desktop, verify on server; create on browser, verify on server

---

## Phase 5: Note and Message Encryption Migration

**What it does**: Route all note and message encryption/decryption through the platform layer. This is the final step before all crypto is platform-abstracted.

**Platforms affected**: Desktop (routes to Rust), browser (wraps existing JS)

**Implementation**:

Migrate the high-level encryption functions:

```typescript
// src/client/lib/crypto.ts (before)
export async function encryptNote(payload: NotePayload, ...): Promise<EncryptedNote> {
  // Direct @noble/* calls
}

// src/client/lib/crypto.ts (after)
export async function encryptNote(payload: NotePayload, ...): Promise<EncryptedNote> {
  const provider = await getCryptoProvider()
  return provider.encryptNote(JSON.stringify(payload), authorPubkey, adminPubkeys)
}
```

**Call sites to migrate**:
- `encryptNote` / `decryptNote` -- note creation and reading
- `encryptMessage` / `decryptMessage` -- messaging channel encryption (Epic 74)
- `encryptWithPin` / `decryptWithPin` -- key storage encryption
- Hub event encryption/decryption (XChaCha20-Poly1305 with hub key)

**Acceptance criteria**:
- [ ] All note encryption/decryption routes through `CryptoProvider`
- [ ] All message encryption/decryption routes through `CryptoProvider`
- [ ] All hub event encryption/decryption routes through `CryptoProvider`
- [ ] Cross-platform: note encrypted on browser decrypts on desktop (and vice versa)
- [ ] Cross-platform: message encrypted on browser decrypts on desktop (and vice versa)
- [ ] No direct `@noble/*` imports remain in application code (only in `platform-crypto-browser.ts`)

---

## Phase 6: WASM Build for Browser

**What it does**: Compile `llamenos-core` to WebAssembly via `wasm-bindgen`, replacing `@noble/*` in the browser entirely. After this phase, all three platforms (desktop, browser, mobile) use the same Rust crypto implementation.

**Platforms affected**: Browser (replaces JS crypto with WASM)

**Why this matters**: This is the convergence point. Instead of auditing two implementations (JS + Rust), there is one (`llamenos-core`). A bug fix in Rust automatically applies to all platforms. A security audit of `llamenos-core` covers everything.

**Implementation**:

1. **Add wasm-bindgen bindings to llamenos-core**:

```rust
// llamenos-core/src/wasm.rs

use wasm_bindgen::prelude::*;
use crate::{ecies, encryption, auth, keys};

#[wasm_bindgen]
pub fn wasm_ecies_wrap_key(
    key_hex: &str,
    recipient_pubkey: &str,
    label: &str,
) -> Result<JsValue, JsError> {
    let key_bytes = hex::decode(key_hex)?;
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let envelope = ecies::ecies_wrap_key(&key, recipient_pubkey, label)?;
    Ok(serde_wasm_bindgen::to_value(&envelope)?)
}

#[wasm_bindgen]
pub fn wasm_encrypt_note(
    payload_json: &str,
    author_pubkey: &str,
    admin_pubkeys: JsValue,
) -> Result<JsValue, JsError> {
    let pubkeys: Vec<String> = serde_wasm_bindgen::from_value(admin_pubkeys)?;
    let result = encryption::encrypt_note(payload_json, author_pubkey, &pubkeys)?;
    Ok(serde_wasm_bindgen::to_value(&result)?)
}

// ... all other crypto operations
```

2. **Build WASM module**:

```bash
# In llamenos-core/
wasm-pack build --target web --out-dir ../src/client/lib/wasm/
```

3. **Create WASM crypto provider**:

```typescript
// src/client/lib/platform-crypto-wasm.ts

import init, * as core from './wasm/llamenos_core'

let initialized = false

async function ensureInit() {
  if (!initialized) {
    await init()
    initialized = true
  }
}

export const wasmCryptoProvider: CryptoProvider = {
  async eciesWrapKey(key, recipientPubkey, label) {
    await ensureInit()
    return core.wasm_ecies_wrap_key(bytesToHex(key), recipientPubkey, label)
  },
  // ... all methods delegate to WASM
}
```

4. **Update platform detection to prefer WASM**:

```typescript
// src/client/lib/platform-crypto.ts (updated)

export async function getCryptoProvider(): Promise<CryptoProvider> {
  if (_provider) return _provider

  if (currentPlatform === 'desktop') {
    const { desktopCryptoProvider } = await import('./platform-crypto-desktop')
    _provider = desktopCryptoProvider
  } else {
    // Browser: use WASM (llamenos-core compiled to WebAssembly)
    const { wasmCryptoProvider } = await import('./platform-crypto-wasm')
    _provider = wasmCryptoProvider
  }

  return _provider
}
```

5. **Remove @noble/* dependencies** (after WASM is verified):

```json
// package.json — remove:
// "@noble/curves": "...",
// "@noble/ciphers": "...",
// "@noble/hashes": "...",
```

The `platform-crypto-browser.ts` file (JS fallback) is kept but only used if WASM fails to load (graceful degradation).

**Build integration**:
- `wasm-pack build` runs as a pre-build step before `vite build`
- WASM binary is content-hashed and included in the Vite output
- WASM module is lazy-loaded (code-split) so it does not block initial page render
- WASM binary size target: < 200KB gzipped for the crypto module

**Acceptance criteria**:
- [ ] `llamenos-core` compiles to WASM via `wasm-pack` with all crypto operations exposed
- [ ] WASM module loads and initializes in all target browsers (Chrome, Firefox, Safari, Edge)
- [ ] Browser crypto routes through WASM by default
- [ ] WASM crypto produces identical output to the JS implementation for all operations
- [ ] `@noble/*` packages removed from `package.json` (after verification)
- [ ] WASM module is code-split and lazy-loaded
- [ ] WASM binary size < 200KB gzipped
- [ ] Graceful fallback to JS if WASM fails to load (e.g., older browser, CSP blocks WASM)
- [ ] Performance benchmark: WASM crypto is at least as fast as JS crypto for all operations

---

## Phase 7: Cross-Platform Test Vectors

**What it does**: Generate a comprehensive set of test vectors from the Rust implementation and validate them against every platform's crypto provider. This is the final proof that all platforms produce identical cryptographic output.

**Platforms affected**: All (Rust native, WASM, JS fallback, UniFFI/mobile)

**Implementation**:

1. **Generate test vectors from Rust**:

```rust
// llamenos-core/tests/generate_vectors.rs

use llamenos_core::{ecies, encryption, auth, keys};
use serde::Serialize;

#[derive(Serialize)]
struct TestVector {
    name: String,
    inputs: serde_json::Value,
    expected_output: serde_json::Value,
}

fn generate_ecies_vectors() -> Vec<TestVector> {
    // Fixed seed keypairs for reproducibility
    let alice_sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let bob_sk = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    let bob_pk = keys::get_public_key(bob_sk).unwrap();

    let key = [0x42u8; 32]; // Fixed key for wrapping
    let envelope = ecies::ecies_wrap_key(&key, &bob_pk, "llamenos:note-key").unwrap();

    // Unwrap must recover the same key
    let recovered = ecies::ecies_unwrap_key(&envelope, bob_sk, "llamenos:note-key").unwrap();
    assert_eq!(key.to_vec(), recovered);

    vec![TestVector {
        name: "ecies_wrap_unwrap_note_key".into(),
        inputs: serde_json::json!({
            "key_hex": hex::encode(key),
            "recipient_sk_hex": bob_sk,
            "recipient_pk_hex": bob_pk,
            "label": "llamenos:note-key",
            "envelope": serde_json::to_value(&envelope).unwrap(),
        }),
        expected_output: serde_json::json!({
            "recovered_key_hex": hex::encode(key),
        }),
    }]
}

fn generate_auth_token_vectors() -> Vec<TestVector> {
    let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let token = auth::create_auth_token(sk, 1700000000, "GET", "/api/calls").unwrap();

    vec![TestVector {
        name: "auth_token_get_calls".into(),
        inputs: serde_json::json!({
            "secret_key_hex": sk,
            "timestamp": 1700000000u64,
            "method": "GET",
            "path": "/api/calls",
        }),
        expected_output: serde_json::json!({
            "token": serde_json::to_value(&token).unwrap(),
        }),
    }]
}

// Generate vectors for: ECIES, note encryption, message encryption,
// PIN encryption, auth tokens, keypair derivation, hub key wrapping
```

2. **Test vector file format**:

```json
{
  "version": 1,
  "generated_by": "llamenos-core 0.1.0",
  "generated_at": "2026-02-25T00:00:00Z",
  "vectors": [
    {
      "name": "ecies_unwrap_note_key",
      "inputs": { "...": "..." },
      "expected_output": { "...": "..." }
    }
  ]
}
```

3. **Validate on each platform**:

```typescript
// tests/crypto-vectors.spec.ts (Playwright E2E)

import vectors from '../test-vectors/crypto-vectors.json'

test.describe('Cross-platform crypto vectors', () => {
  for (const vector of vectors.vectors) {
    test(`${vector.name}`, async ({ page }) => {
      // Execute the crypto operation in the browser context
      const result = await page.evaluate(async (v) => {
        const provider = await getCryptoProvider()
        // Run the operation described by the vector
        return runVector(provider, v)
      }, vector)

      expect(result).toEqual(vector.expected_output)
    })
  }
})
```

```rust
// llamenos-core/tests/validate_vectors.rs

#[test]
fn validate_all_vectors() {
    let vectors: TestVectors = serde_json::from_str(
        include_str!("../../test-vectors/crypto-vectors.json")
    ).unwrap();

    for vector in &vectors.vectors {
        match vector.name.as_str() {
            "ecies_unwrap_note_key" => validate_ecies_unwrap(vector),
            "auth_token_get_calls" => validate_auth_token(vector),
            // ... all vector types
            _ => panic!("Unknown vector: {}", vector.name),
        }
    }
}
```

**Vector categories** (minimum coverage):

| Category | Vectors | What's Validated |
|----------|---------|-----------------|
| ECIES wrap/unwrap | 5 | Key wrapping with each domain separation label |
| Note encryption | 3 | Single admin, multi-admin, round-trip |
| Message encryption | 3 | Single reader, multi-reader, round-trip |
| Auth token | 3 | GET, POST, different paths |
| PIN encryption | 2 | Encrypt/decrypt round-trip with known PIN |
| Keypair derivation | 2 | Known secret -> known pubkey |
| Schnorr verification | 3 | Valid sig, invalid sig, wrong pubkey |
| Hub key wrapping | 2 | Wrap/unwrap with LABEL_HUB_KEY_WRAP |

**Acceptance criteria**:
- [ ] Test vector JSON file generated from `llamenos-core` with all crypto operation categories
- [ ] Rust native tests validate all vectors (self-test)
- [ ] WASM tests validate all vectors in browser context
- [ ] JS fallback tests validate all vectors (if JS path is retained)
- [ ] Tauri IPC tests validate all vectors via desktop commands
- [ ] Vector file is committed to the repository and run in CI on every crypto change
- [ ] Any new crypto operation must add corresponding test vectors before merging
- [ ] Round-trip tests: encrypt on platform A, decrypt on platform B (all combinations)

## Implementation Phases Summary

| Phase | Description | Duration | Dependencies | Platforms |
|-------|-------------|----------|-------------|-----------|
| 1 | Platform Detection Layer | 1 week | None | Browser, Desktop |
| 2 | Key Manager Migration | 1 week | Phase 1, Epic 80 Phase 6 | Desktop (primary) |
| 3 | ECIES Migration | 3 days | Phase 1 | Browser, Desktop |
| 4 | Auth Token Migration | 2 days | Phase 2 | Browser, Desktop |
| 5 | Note/Message Encryption | 3 days | Phase 1, Phase 3 | Browser, Desktop |
| 6 | WASM Build for Browser | 1.5 weeks | Phases 1-5 | Browser |
| 7 | Cross-Platform Test Vectors | 1 week | Phase 6 | All |

**Total estimated duration**: ~5 weeks

**Parallelization**: Phases 3, 4, and 5 can run in parallel once Phase 1 is complete. Phase 6 requires all prior phases. Phase 7 requires Phase 6.

## Migration Strategy

### Incremental, Never Breaking

Each phase wraps the existing implementation behind the platform layer without changing behavior. The migration follows this pattern:

1. **Add the platform abstraction** (new code alongside old code)
2. **Migrate call sites** one module at a time (old imports -> new platform imports)
3. **Verify** with E2E tests after each module migration
4. **Remove old direct imports** once all call sites are migrated
5. **Remove old code** only after WASM replaces JS entirely (Phase 6)

At no point does a platform lose crypto functionality. If the WASM build fails, the JS fallback remains available.

### Rollback Plan

If any phase introduces regressions:
- Phase 1-5: Revert to direct `@noble/*` imports (the JS code is still present)
- Phase 6: Fall back to `platform-crypto-browser.ts` (JS provider) instead of WASM
- Phase 7: Test vector failures block the PR but do not affect runtime

## Security Considerations

### Single Audit Surface

After Phase 6, there is exactly one crypto implementation to audit: `llamenos-core`. This is a significant security improvement:

- **Before**: Auditor must review `@noble/curves` + `@noble/ciphers` + `@noble/hashes` (JS) AND `k256` + `chacha20poly1305` + `hkdf` + `sha2` (Rust) and verify they produce identical results.
- **After**: Auditor reviews only `llamenos-core` (Rust) and verifies the WASM/IPC/UniFFI bindings are faithful wrappers.

### WASM Security Properties

- WASM runs in the same sandbox as JS (same origin, same CSP restrictions)
- WASM memory is not directly accessible from JS (linear memory isolation)
- Secret keys inside WASM linear memory are not inspectable via JS `window` object
- However, WASM does not provide stronger isolation than a Web Worker -- it runs on the same thread

### Supply Chain

- `llamenos-core` is a first-party crate, not a third-party dependency
- `wasm-pack` and `wasm-bindgen` are well-audited in the Rust ecosystem
- The WASM binary is content-hashed and integrity-checked by the browser's CSP (`script-src`)
- Reproducible WASM builds follow the same strategy as Epic 79 / Epic 80 Phase 7

## Success Criteria

1. **Unification**
   - [ ] Single `CryptoProvider` interface used by all application code
   - [ ] No direct `@noble/*` imports in application code (only in fallback provider)
   - [ ] `llamenos-core` is the sole crypto implementation after Phase 6

2. **Cross-Platform Correctness**
   - [ ] All test vectors pass on all platforms
   - [ ] Round-trip encryption/decryption works across all platform combinations
   - [ ] Auth tokens from all platforms are accepted by the server

3. **Performance**
   - [ ] WASM crypto is at least as fast as JS crypto
   - [ ] Desktop (native Rust) crypto is faster than both
   - [ ] WASM module loads in < 100ms on a modern browser
   - [ ] Lazy loading prevents WASM from blocking initial page render

4. **Maintainability**
   - [ ] New crypto operations require only Rust implementation + WASM bindings
   - [ ] No JS crypto code to maintain (after Phase 6 + verification)
   - [ ] Test vectors catch platform divergence automatically in CI

## Dependencies

- **Epic 80 (Desktop Security Hardening)** -- Phase 2 depends on Epic 80 Phase 6 (CryptoState in Rust)
- **Epic 75 (Native Call Clients)** -- mobile platform support extends the same pattern via UniFFI
- **Epic 79 (Reproducible Builds)** -- WASM binary must be reproducibly built
- **llamenos-core crate** -- the shared Rust crypto library (already exists with all operations)

## Open Questions

1. **WASM binary size**: How large is `llamenos-core` compiled to WASM? If > 500KB gzipped, consider splitting into multiple modules (e.g., separate module for Schnorr vs ChaCha20).

2. **WASM initialization latency**: `wasm-pack` WASM modules require async initialization (`await init()`). This must complete before the first crypto operation. Should we preload during app startup or lazy-load on first use?

3. **JS fallback retention**: After Phase 6, should `platform-crypto-browser.ts` (JS fallback) be kept for browsers that do not support WASM? Modern browser WASM support is >97%, but some privacy-focused browsers may disable it.

4. **nostr-tools dependency**: `nostr-tools` uses `@noble/curves` internally for signature verification. After removing `@noble/*`, does `nostr-tools` still work? Options: (a) keep `@noble/*` as transitive dependency of `nostr-tools`, (b) use WASM for the signature verification that `nostr-tools` does, (c) contribute WASM backend to `nostr-tools`.

5. **UniFFI timeline**: Mobile platform support (Swift/Kotlin bindings via UniFFI) is deferred to Epic 75's React Native phase. The `CryptoProvider` interface is designed to accommodate this, but the UniFFI bindings are not part of this epic.

## Execution Context

### Current Crypto Call Sites (to migrate)

- `src/client/lib/crypto.ts` -- `encryptNote`, `decryptNote`, `createAuthToken`, `deriveSharedKey`
- `src/client/lib/ecies.ts` -- `eciesWrapKey`, `eciesUnwrapKey`
- `src/client/lib/key-store.ts` -- `encryptStoredKey`, `decryptStoredKey` (PBKDF2 + XChaCha20)
- `src/client/lib/key-manager.ts` -- `unlock`, `lock`, `createAuthToken`, `getSecretKey`
- `src/client/lib/backup.ts` -- `createBackup`, `restoreBackup` (PBKDF2 + XChaCha20)
- `src/client/lib/device-provision.ts` -- ECDH key exchange for multi-device

### Existing Tauri IPC Commands (from `src-tauri/src/crypto.rs`)

Already implemented and mapped to `llamenos-core`:
- `ecies_wrap_key`, `ecies_unwrap_key`
- `encrypt_note`, `decrypt_note`
- `encrypt_message`, `decrypt_message`
- `create_auth_token`
- `encrypt_with_pin`, `decrypt_with_pin`
- `generate_keypair`, `get_public_key`
- `verify_schnorr`

### @noble/* Packages to Eventually Remove

- `@noble/curves` -- secp256k1 ECDH, Schnorr signatures
- `@noble/ciphers` -- XChaCha20-Poly1305
- `@noble/hashes` -- SHA-256, HKDF, PBKDF2, HMAC

These are high-quality, audited libraries. The motivation for removal is not quality concerns but maintenance burden of dual implementations and the audit surface benefit of a single codebase.
