---
name: tauri-ipc-development
description: Use when adding new Tauri IPC commands, modifying desktop crypto operations, updating the Rust CryptoState, or fixing Playwright test failures related to missing IPC mocks. Also use when the user mentions "IPC command", "platform.ts", "CryptoState", "tauri invoke", "generate_handler", or needs to understand the 4-layer IPC chain from Rust to test mocks.
---

# Tauri IPC Development Guide

Every Tauri IPC command spans 4 layers. ALL FOUR must be updated together — missing any one layer causes a broken feature or broken tests.

## The 4-Layer Chain

```
Layer 1: packages/crypto/src/        -> Rust crypto implementation (pure, no Tauri)
Layer 2: apps/desktop/src/crypto.rs  -> Tauri IPC command wrappers (#[tauri::command])
Layer 3: src/client/lib/platform.ts  -> TypeScript async wrappers (tauriInvoke)
Layer 4: tests/mocks/tauri-ipc-handler.ts -> Playwright test mock (handleInvoke switch)
```

```
  Frontend component
       |
       v
  platform.ts  (Layer 3: async TS function)
       |
       v  tauriInvoke('cmd_name', { args })
  ─────────────── IPC boundary ───────────────
       |
       v
  crypto.rs    (Layer 2: #[tauri::command] fn)
       |
       v
  packages/crypto/src/  (Layer 1: pure Rust crypto)
```

In Playwright tests, Layers 1+2 are replaced by Layer 4 (JS mock with `@noble/*` libs).

## Layer 1: Rust Crypto Crate

**Path:** `packages/crypto/src/`

Pure crypto functions with zero Tauri dependency. This crate compiles to native (desktop), WASM (browser), and UniFFI (mobile).

| File | Purpose |
|------|---------|
| `lib.rs` | Module declarations, re-exports |
| `ecies.rs` | ECDH key agreement, ECIES wrap/unwrap (secp256k1 + XChaCha20-Poly1305) |
| `encryption.rs` | Note, message, call record, draft, file, export, PIN encrypt/decrypt |
| `auth.rs` | BIP-340 Schnorr auth token creation and verification |
| `keys.rs` | Keypair generation, nsec/npub bech32 encoding, validation |
| `labels.rs` | Domain separation constants (LABEL_NOTE_KEY, LABEL_FILE_KEY, etc.) |
| `nostr.rs` | Nostr event ID computation and signing |
| `errors.rs` | CryptoError enum |
| `ffi.rs` | UniFFI exports for iOS/Android (feature-gated) |

### Adding a new crypto function

1. Add the function to the appropriate module (e.g., `encryption.rs`).
2. Re-export from `lib.rs` if needed by Layer 2.
3. Add unit tests in the same module.
4. Run `cargo test -p llamenos-core`.

```rust
// packages/crypto/src/encryption.rs
pub fn encrypt_widget(plaintext: &str, key: &str) -> Result<String, CryptoError> {
    // Implementation using labels::LABEL_WIDGET and XChaCha20-Poly1305
}
```

## Layer 2: Tauri IPC Commands

**Path:** `apps/desktop/src/crypto.rs`

Thin wrappers that bridge Tauri IPC to Layer 1. Two patterns:

### Stateful commands (use CryptoState)

Read the nsec from `CryptoState` — the webview never sees the secret key.

```rust
#[tauri::command]
pub fn my_command_from_state(
    state: tauri::State<'_, CryptoState>,
    some_arg: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;  // Errors if locked
    llamenos_core::encryption::my_function(&some_arg, &sk).map_err(err_str)
}
```

### Stateless commands (no CryptoState)

Public-key-only or validation operations. No `state` parameter.

```rust
#[tauri::command]
pub fn my_stateless_command(input: String) -> Result<String, String> {
    llamenos_core::keys::validate(&input).map_err(err_str)
}
```

### CryptoState structure

```rust
pub struct CryptoState {
    secret_key: Mutex<Option<String>>,       // nsec hex, None if locked
    public_key: Mutex<Option<String>>,       // x-only pubkey hex
    provisioning_token: Mutex<Option<String>>, // one-time token for nsec export
}
```

Key methods:
- `get_secret_key() -> Result<String, String>` — returns nsec hex or error if locked
- `get_public_key() -> Result<String, String>` — returns pubkey hex or error if locked
- `lock()` — zeroizes secret key, clears public key and provisioning token

### Register in generate_handler!

**Path:** `apps/desktop/src/lib.rs`

After adding the `#[tauri::command]` function, register it in the `generate_handler!` macro:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    crypto::my_command_from_state,   // ADD HERE
    crypto::my_stateless_command,    // ADD HERE
])
```

FORGETTING THIS = silent failure. The command will not exist at runtime. No compile error, no warning — just a runtime "command not found" from the webview.

## Layer 3: TypeScript Platform

**Path:** `src/client/lib/platform.ts`

Every IPC command gets an async TypeScript wrapper here. This is the ONLY file that imports from `@tauri-apps/api/core`.

### Adding a new wrapper

```typescript
// Stateful example — no secret key in args
export async function myCommand(someArg: string): Promise<string> {
  return tauriInvoke<string>('my_command_from_state', { someArg })
}

// Stateless example
export async function myStatelessCommand(input: string): Promise<string> {
  return tauriInvoke<string>('my_stateless_command', { input })
}
```

### Parameter name conversion rules

Tauri auto-converts between TypeScript camelCase and Rust snake_case:

| TypeScript (platform.ts) | Rust (crypto.rs) |
|--------------------------|-------------------|
| `someArg` | `some_arg` |
| `payloadJson` | `payload_json` |
| `authorPubkey` | `author_pubkey` |
| `encryptedContent` | `encrypted_content` |
| `ephemeralPubkeyHex` | `ephemeral_pubkey_hex` |

The parameter object keys in the `tauriInvoke` call MUST match the Rust function parameter names after camelCase-to-snake_case conversion.

### Import rule

NEVER import from `@tauri-apps/api/*` or `@tauri-apps/plugin-*` in any file except `platform.ts`. All other code imports from `platform.ts`:

```typescript
// CORRECT
import { myCommand } from '@/lib/platform'

// WRONG — never do this
import { invoke } from '@tauri-apps/api/core'
```

## Layer 4: Playwright Test Mock

**Path:** `tests/mocks/tauri-ipc-handler.ts`

When `PLAYWRIGHT_TEST=true`, Vite aliases swap `@tauri-apps/api/core` and `@tauri-apps/plugin-store` for mock implementations. The mock routes all IPC calls through a `handleInvoke` switch statement.

### Adding a new mock handler

Add a case to the `handleInvoke` switch. The mock must produce byte-identical output to Rust for the same inputs.

```typescript
case 'my_command_from_state': {
  const sk = requireUnlocked()  // Mirrors CryptoState.get_secret_key()
  // Implement using @noble/* libraries
  return myJsImplementation(args.someArg as string, hexToBytes(sk))
}

case 'my_stateless_command': {
  return myStatelessJsImpl(args.input as string)
}
```

### Mock CryptoState

```typescript
let secretKeyHex: string | null = null   // Mirrors Rust CryptoState.secret_key
let publicKeyHex: string | null = null   // Mirrors Rust CryptoState.public_key

function requireUnlocked(): string {
  if (!secretKeyHex) throw new Error('CryptoState is locked')
  return secretKeyHex
}
```

### Noble library imports (MUST use .js extension)

```typescript
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
```

Missing `.js` extension = build failure. This is a `@noble/*` package requirement.

### Shared crypto implementations

Complex crypto logic lives in `tests/mocks/crypto-impl.ts` and is imported by the handler. Keep the handler switch cases thin — delegate to `crypto-impl.ts` for anything non-trivial.

## CryptoState Lifecycle

```
App launch          -> CryptoState::new()         (secret_key = None)
unlock_with_pin     -> secret_key = Some(nsec_hex) (PIN decrypts stored key)
import_key_to_state -> secret_key = Some(nsec_hex) (first-time import)
lock_crypto         -> secret_key.zeroize(); None  (manual lock)
Window destroyed    -> state.lock()                (app closing)
Tray quit           -> state.lock()                (tray menu quit)
```

The nsec hex is zeroized (overwritten with zeros via the `zeroize` crate) before being dropped. Only `get_nsec_from_state` returns the nsec, and it requires a one-time provisioning token from `request_provisioning_token`.

## Registered IPC Commands

All commands registered in `generate_handler![]` in `apps/desktop/src/lib.rs`:

### Stateful (use CryptoState)

| Command | Purpose |
|---------|---------|
| `unlock_with_pin` | Decrypt stored key with PIN, load into state |
| `import_key_to_state` | Encrypt nsec with PIN, store, and load into state |
| `lock_crypto` | Zeroize and clear secret key |
| `is_crypto_unlocked` | Check if state holds a key |
| `get_public_key_from_state` | Return pubkey without exposing nsec |
| `create_auth_token_from_state` | Schnorr auth token from state key |
| `ecies_unwrap_key_from_state` | ECIES unwrap with generic label |
| `decrypt_note_from_state` | Decrypt V2 note envelope |
| `decrypt_message_from_state` | Decrypt message with reader envelopes |
| `decrypt_call_record_from_state` | Decrypt call record metadata |
| `decrypt_legacy_note_from_state` | Decrypt V1 packed note |
| `decrypt_transcription_from_state` | Decrypt server-encrypted transcription |
| `encrypt_draft_from_state` | Encrypt draft for local auto-save |
| `decrypt_draft_from_state` | Decrypt locally-saved draft |
| `encrypt_export_from_state` | Encrypt JSON export blob (returns base64) |
| `sign_nostr_event_from_state` | Compute event ID + Schnorr signature |
| `decrypt_file_metadata_from_state` | Decrypt ECIES file metadata |
| `unwrap_file_key_from_state` | Unwrap file key envelope |
| `unwrap_hub_key_from_state` | Unwrap hub key envelope |
| `rewrap_file_key_from_state` | Unwrap + re-wrap file key for new recipient |
| `request_provisioning_token` | Generate one-time token for nsec export |
| `get_nsec_from_state` | Export nsec (requires provisioning token) |

### Stateless (no CryptoState)

| Command | Purpose |
|---------|---------|
| `generate_keypair` | Generate new Nostr keypair |
| `key_pair_from_nsec` | Derive keypair from nsec (onboarding) |
| `is_valid_nsec` | Validate nsec bech32 format |
| `ecies_wrap_key` | ECIES wrap key for recipient (public-key-only) |
| `encrypt_note` | Encrypt note with per-note forward secrecy |
| `encrypt_message` | Encrypt message for multiple readers |
| `create_auth_token` | Auth token with explicit secret key (sign-in only) |
| `verify_schnorr` | Verify Schnorr signature |

### Deregistered (kept for unit tests only)

These accept `secret_key_hex` as a parameter and are marked `#[allow(dead_code)]`. They are NOT in `generate_handler![]`:

`ecies_unwrap_key`, `decrypt_note`, `decrypt_message`, `encrypt_with_pin`, `decrypt_with_pin`, `get_public_key`

## Step-by-Step: Adding a New IPC Command

### 1. Layer 1 — Rust crypto function

```bash
# Edit packages/crypto/src/encryption.rs (or appropriate module)
# Add function + unit test
cargo test -p llamenos-core
```

### 2. Layer 2 — Tauri command wrapper

```bash
# Edit apps/desktop/src/crypto.rs
# Add #[tauri::command] fn
# Edit apps/desktop/src/lib.rs
# Add to generate_handler![]
```

### 3. Layer 3 — TypeScript wrapper

```bash
# Edit src/client/lib/platform.ts
# Add exported async function using tauriInvoke
```

### 4. Layer 4 — Test mock

```bash
# Edit tests/mocks/tauri-ipc-handler.ts
# Add case to handleInvoke switch
# If complex, add implementation to tests/mocks/crypto-impl.ts
```

### 5. Verify

```bash
cargo test -p llamenos-core          # Layer 1
bun run typecheck                    # Layers 3+4
bun run test                         # Full E2E (exercises all 4 layers)
```

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Forgot `generate_handler![]` entry | Runtime: "command not found" (no compile error) | Add to `apps/desktop/src/lib.rs` |
| Parameter name mismatch TS/Rust | Runtime: argument is `undefined` in Rust | Match camelCase (TS) to snake_case (Rust) exactly |
| Missing test mock case | Playwright crash: "Unknown IPC command: cmd_name" | Add case to `handleInvoke` switch |
| Missing `.js` in `@noble/*` import | Build error in test mock | Use `@noble/hashes/sha2.js` not `@noble/hashes/sha2` |
| Import `@tauri-apps/*` directly | Breaks test builds, bypasses platform abstraction | Import from `@/lib/platform` instead |
| SHA-256 for KDF instead of HKDF | Wrong derived keys, decryption failures | Use HKDF-SHA256 with domain separation labels |
| Forgot `cargo test` after Rust changes | Broken crypto, discovered late in E2E | Run `cargo test -p llamenos-core` after every Rust edit |
| Mock output differs from Rust | Tests pass but desktop fails (or vice versa) | Verify byte-identical output for same inputs |
| Stateful cmd missing `state` param | Compile error or runtime panic | Use `state: tauri::State<'_, CryptoState>` as first param |
| Returning bytes instead of hex | TS receives garbled data | Use `hex::encode()` in Rust, `bytesToHex()` in mock |
