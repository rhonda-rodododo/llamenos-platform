---
name: tauri-ipc-development
description: >
  Guide adding new Tauri IPC commands for the Llamenos desktop app. Use this skill when adding
  new crypto operations, platform features, or native functionality that requires communication
  between the webview (TypeScript) and the Rust backend. Use when the user mentions "IPC",
  "Tauri command", "platform.ts", "invoke", "CryptoState", "Rust backend", "desktop native",
  "Tauri plugin", "tauriInvoke", "new IPC command", "desktop crypto", or "mock for tests".
  Also use when a feature needs to call into native code from the frontend, when adding a new
  function to platform.ts, when the test mock layer needs updating, or when modifying the Rust
  CryptoState. If a desktop feature touches encrypted data, key management, or native OS
  capabilities, this skill applies. The IPC chain has 4 layers that must stay synchronized:
  Rust crate, Tauri IPC handler, platform.ts wrapper, and Playwright test mock.
---

# Tauri IPC Development for Llamenos

The desktop app uses Tauri v2 with a strict security boundary: the secret key (nsec) lives
exclusively in the Rust process, never crossing into the webview. All crypto operations route
through IPC commands. Adding a new operation requires changes at 4 layers.

## Architecture

```
Frontend (webview)                    Rust backend (Tauri)
┌─────────────────────┐              ┌─────────────────────────┐
│ React component     │              │ packages/crypto/src/    │
│   ↓                 │              │   lib.rs (crypto ops)   │
│ platform.ts         │  IPC invoke  │   ↓                     │
│   tauriInvoke(cmd)  │ ──────────→  │ apps/desktop/src/       │
│                     │              │   crypto.rs (IPC cmds)  │
│                     │  ← response  │   lib.rs (Tauri setup)  │
└─────────────────────┘              └─────────────────────────┘

Test builds (Playwright)
┌─────────────────────┐
│ tests/mocks/        │
│   tauri-ipc-mock.ts │  Mirrors CryptoState in JS
│   (replaces IPC)    │
└─────────────────────┘
```

### Key Files

| File | Layer | Purpose |
|------|-------|---------|
| `packages/crypto/src/lib.rs` | Crypto crate | Core crypto operations (shared across all platforms) |
| `apps/desktop/src/crypto.rs` | IPC handlers | Tauri `#[command]` functions wrapping crypto crate |
| `apps/desktop/src/lib.rs` | Tauri setup | Plugin registration, command registration, CryptoState |
| `apps/desktop/Cargo.toml` | Dependencies | Path dep to `../../packages/crypto` |
| `src/client/lib/platform.ts` | Frontend wrapper | TypeScript functions calling `tauriInvoke()` |
| `tests/mocks/tauri-ipc-mock.ts` | Test mock | JavaScript reimplementation for Playwright |
| `apps/desktop/capabilities/` | Permissions | Tauri capability definitions |

## Adding a New IPC Command (Full Walkthrough)

### Step 1: Implement in the Crypto Crate (if needed)

If the operation is a new crypto primitive, add it to `packages/crypto/src/lib.rs`:

```rust
// packages/crypto/src/lib.rs

/// Derive a context-specific key using HKDF.
pub fn derive_context_key(
    secret_key: &[u8; 32],
    context: &str,
) -> Result<[u8; 32], CryptoError> {
    let ikm = secret_key;
    let salt = context.as_bytes();
    let info = b"llamenos:context-key:v1";
    let mut output = [0u8; 32];
    hkdf_sha256(ikm, salt, info, &mut output)?;
    Ok(output)
}
```

If the function needs UniFFI exposure for mobile:

```rust
#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn derive_context_key(secret_key: Vec<u8>, context: String) -> Result<Vec<u8>, CryptoError> {
    // UniFFI wrapper with Vec<u8> instead of fixed arrays
}
```

### Step 2: Create the Tauri IPC Command

Add to `apps/desktop/src/crypto.rs`:

```rust
use llamenos_crypto; // the packages/crypto crate
use tauri::State;
use crate::CryptoState;

#[tauri::command]
pub async fn derive_context_key_from_state(
    state: State<'_, CryptoState>,
    context: String,
) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let nsec_hex = guard.as_ref().ok_or("Crypto state locked")?;
    let secret_key = hex::decode(nsec_hex).map_err(|e| e.to_string())?;

    let key_bytes: [u8; 32] = secret_key.try_into().map_err(|_| "Invalid key length")?;
    let result = llamenos_crypto::derive_context_key(&key_bytes, &context)
        .map_err(|e| e.to_string())?;

    Ok(hex::encode(result))
}
```

**Key patterns**:
- Use `State<'_, CryptoState>` to access the locked nsec
- Return `Result<T, String>` — Tauri serializes errors as IPC error strings
- Use hex encoding for byte arrays crossing the IPC boundary
- Stateful commands (using CryptoState) get `_from_state` suffix
- Stateless commands (no nsec needed) take the key as a parameter

### Step 3: Register the Command

Add to `apps/desktop/src/lib.rs` in the `invoke_handler` list:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    crypto::derive_context_key_from_state,
])
```

### Step 4: Add the Platform.ts Wrapper

Add to `src/client/lib/platform.ts`:

```typescript
/**
 * Derive a context-specific key via CryptoState.
 */
export async function deriveContextKey(
  context: string,
): Promise<string> {
  return tauriInvoke<string>('derive_context_key_from_state', { context })
}
```

**Naming conventions**:
- TypeScript function: `camelCase` matching the operation
- Tauri command: `snake_case` matching the Rust function
- Parameter names must match exactly between TS and Rust (Tauri uses serde)

### Step 5: Update the Test Mock

Add to `tests/mocks/tauri-ipc-mock.ts`:

```typescript
case 'derive_context_key_from_state': {
  const { context } = args as { context: string }
  if (!mockCryptoState.nsecHex) throw new Error('Crypto state locked')

  // JavaScript equivalent of the Rust operation
  const secretKey = hexToBytes(mockCryptoState.nsecHex)
  const contextKey = hkdf(sha256, secretKey, context, 'llamenos:context-key:v1', 32)
  return bytesToHex(contextKey)
}
```

**Critical**: The mock must produce identical results to the Rust implementation.
Use the same crypto libraries (`@noble/hashes`, `@noble/ciphers`, `@noble/curves`).
Cross-platform test vectors in `packages/crypto/tests/test_vectors.json` verify this.

### Step 6: Update Tauri Capabilities (if needed)

If the command needs special permissions, update `apps/desktop/capabilities/`:

```json
{
  "permissions": [
    "core:default",
    "store:default",
    "llamenos:derive-context-key"
  ]
}
```

Most crypto commands don't need special capabilities — they're internal IPC.

## CryptoState Architecture

```rust
// apps/desktop/src/lib.rs
pub struct CryptoState(pub Mutex<Option<String>>);
// Mutex<Option<String>> where:
//   None = locked (no key loaded)
//   Some(nsec_hex) = unlocked (key available)
```

**Lifecycle**:
1. App starts → `CryptoState(Mutex::new(None))` (locked)
2. User enters PIN → `unlock_with_pin` decrypts nsec, stores in CryptoState
3. All `_from_state` commands read from CryptoState
4. User locks/logs out → `lock_crypto` sets CryptoState back to None
5. PIN brute-force protection: Rust tracks attempts, triggers lockout/wipe

**Security invariants**:
- The nsec hex string ONLY exists in CryptoState (Rust memory)
- The webview NEVER receives the nsec (except `getNsecFromState` for device provisioning)
- All signing/encryption happens in Rust, results returned to webview
- PIN attempt tracking is in Rust, not JavaScript (can't be bypassed)

## The tauriInvoke Pattern

```typescript
// The universal IPC wrapper in platform.ts
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}
```

- Dynamic import ensures the Tauri API is only loaded in Tauri context
- In test builds (`PLAYWRIGHT_TEST=true`), Vite aliases redirect this import to the mock
- The mock intercepts all `invoke()` calls and routes to JavaScript implementations

## Test Mock Architecture

```
PLAYWRIGHT_TEST=true
  → vite.config.ts aliases:
    @tauri-apps/api/core → tests/mocks/tauri-core-mock.ts
    @tauri-apps/plugin-store → tests/mocks/tauri-store-mock.ts
  → tauri-core-mock.ts:
    export function invoke(cmd, args) {
      return handleIpcCommand(cmd, args)  // JS reimplementation
    }
  → tauri-ipc-mock.ts:
    switch(cmd) {
      case 'generate_keypair': ...
      case 'encrypt_note': ...
      // Every IPC command has a JS equivalent
    }
```

When adding a new IPC command, you MUST add the mock case or Playwright tests will fail
with "Unknown IPC command" errors.

## Existing IPC Commands Reference

### Stateless (no CryptoState needed)
- `generate_keypair` → `PlatformKeyPair`
- `get_public_key(secretKeyHex)` → pubkey hex
- `is_valid_nsec(nsec)` → boolean
- `key_pair_from_nsec(nsec)` → `PlatformKeyPair | null`
- `create_auth_token(secretKeyHex, timestamp, method, path)` → token hex
- `verify_schnorr(message, signature, pubkey)` → boolean
- `ecies_wrap_key(keyHex, recipientPubkey, label)` → `KeyEnvelope`
- `encrypt_note(payloadJson, authorPubkey, adminPubkeys)` → `EncryptedNoteResult`
- `encrypt_message(plaintext, readerPubkeys)` → `EncryptedMessageResult`

### Stateful (reads nsec from CryptoState)
- `get_public_key_from_state` → pubkey hex
- `create_auth_token_from_state(timestamp, method, path)` → token hex
- `ecies_unwrap_key_from_state(envelope, label)` → key hex
- `decrypt_note_from_state(encryptedContent, envelope)` → plaintext JSON
- `decrypt_message_from_state(encryptedContent, readerEnvelopes)` → plaintext
- `decrypt_call_record_from_state(encryptedContent, adminEnvelopes)` → JSON
- `decrypt_transcription_from_state(packed, ephemeralPubkeyHex)` → text
- `encrypt_draft_from_state(plaintext)` → packed
- `decrypt_draft_from_state(packed)` → plaintext
- `encrypt_export_from_state(jsonString)` → base64
- `sign_nostr_event_from_state(kind, createdAt, tags, content)` → `SignedNostrEvent`
- `decrypt_file_metadata_from_state(encryptedContentHex, ephemeralPubkeyHex)` → JSON
- `unwrap_file_key_from_state(envelope)` → key hex
- `unwrap_hub_key_from_state(envelope)` → key hex
- `rewrap_file_key_from_state(encryptedFileKeyHex, ephemeralPubkeyHex, newRecipientPubkeyHex)` → envelope

### Key management
- `import_key_to_state(nsec, pin, pubkeyHex)` → `EncryptedKeyData`
- `unlock_with_pin(data, pin)` → pubkey hex (loads into CryptoState)
- `lock_crypto` → void (zeros CryptoState)
- `is_crypto_unlocked` → boolean
- `request_provisioning_token` → one-time token
- `get_nsec_from_state(token)` → nsec (provisioning only)

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Mismatched parameter names (TS vs Rust) | Silent IPC failure | Ensure exact name match (Tauri uses serde) |
| Forgetting to register in `generate_handler!` | "Command not found" at runtime | Add to lib.rs handler list |
| Forgetting test mock case | Playwright tests crash | Add mock in tauri-ipc-mock.ts |
| Returning raw bytes instead of hex | Serialization failure across IPC | Always hex-encode byte arrays |
| Not handling locked CryptoState | Panic in Rust | Return proper error when `guard.as_ref()` is None |
| Using CryptoState for stateless ops | Unnecessary coupling | Take key as parameter for ops that don't need persistent state |
| Mock produces different output than Rust | Test/prod behavior diverges | Verify with cross-platform test vectors |
