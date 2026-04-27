# Plan: Crypto Protocol Alignment

**Spec**: `docs/superpowers/specs/2026-04-27-crypto-protocol-alignment.md`
**Date**: 2026-04-27
**Estimated phases**: 6 (ordered by dependency)

---

## Phase 1: Foundation — Crate Restructure + Ed25519/X25519 Primitives

**Goal**: Replace secp256k1 with Ed25519/X25519, add HPKE, restructure modules.

### 1.1 Update `packages/crypto/Cargo.toml`

**Remove**:
- `k256` (secp256k1 ECDH + Schnorr)
- `elliptic-curve`
- `bech32` (nsec/npub encoding)
- `chacha20poly1305` (replaced by AES-256-GCM from hpke suite)

**Add**:
```toml
# Ed25519 signing
ed25519-dalek = { version = "2", features = ["serde", "batch", "rand_core"] }

# X25519 key agreement
x25519-dalek = { version = "2", features = ["serde", "static_secrets"] }

# HPKE: DHKEM(X25519) + HKDF-SHA256 + AES-256-GCM
hpke = { version = "0.12", features = ["x25519", "aes-gcm"] }

# AES-256-GCM (standalone symmetric operations)
aes-gcm = "0.10"

# Curve25519 raw types (shared between ed25519/x25519)
curve25519-dalek = { version = "4", features = ["serde"] }
```

**Keep** (unchanged):
- `hkdf`, `sha2`, `hmac`, `hex`, `base64`, `rand`, `getrandom`, `zeroize`, `serde`, `serde_json`, `thiserror`, `uniffi`, `wasm-bindgen`, `unicode-normalization`, `chrono`

### 1.2 New module structure

```
packages/crypto/src/
├── lib.rs                  # Module declarations + re-exports
├── errors.rs               # CryptoError enum (expand variants)
├── labels.rs               # Domain separation constants (expand from v1 hotline)
├── device_keys.rs          # NEW: Ed25519 + X25519 keypair generation + storage
├── hpke_envelope.rs        # NEW: HPKE seal/open with label enforcement
├── puk.rs                  # NEW: PUK seed, subkey derivation, rotation, CLKR
├── sigchain.rs             # NEW: SigchainLink creation + verification
├── auth.rs                 # REWRITE: Ed25519 auth tokens (replace Schnorr)
├── encryption.rs           # REWRITE: items_key + content_key via HPKE
├── blind_index.rs          # KEEP: unchanged (HMAC-based, curve-independent)
├── ffi.rs                  # REWRITE: new UniFFI surface
├── wasm.rs                 # REWRITE: new wasm-bindgen exports
├── mls.rs                  # NEW (Phase 3): OpenMLS wrapper
├── sframe.rs              # NEW (Phase 5): SFrame key derivation
└── legacy.rs              # TEMPORARY: old secp256k1 functions (deleted in Phase 6)
```

### 1.3 Implement `device_keys.rs`

```rust
// Ed25519 signing keypair + X25519 encryption keypair
// PIN-based encryption of key material (PBKDF2 + AES-256-GCM)
// Zeroize on drop for all key material
// UniFFI-exported DeviceKeyState type
```

**Tests**: Generate keypair, sign/verify, encrypt/decrypt PIN blob, zeroize behavior.

### 1.4 Implement `hpke_envelope.rs`

```rust
// HpkeEnvelope struct: { v: u8, label_id: u8, enc: String, ct: String }
// hpke_seal(plaintext, recipient_pubkey, label, aad) -> HpkeEnvelope
// hpke_open(envelope, expected_label, aad) -> plaintext
// Label enforcement: check labelId matches expected before HPKE open
// Base64url encode/decode helpers
```

**Tests**: Round-trip seal/open, label mismatch rejection, AAD binding failure, v3 check.

### 1.5 Implement `auth.rs` (Ed25519 replacement)

Replace BIP-340 Schnorr with Ed25519:
```rust
// create_auth_token(timestamp, method, path) -> AuthToken
// verify_auth_token(token_json, pubkey_hex) -> bool
// Message format: SHA-256("llamenos:device-auth:" + ts + ":" + method + ":" + path)
```

**Tests**: Create + verify round-trip, reject wrong key, reject tampered message.

### 1.6 Update `labels.rs`

Port all labels from `llamenos-hotline/src/shared/crypto-labels.ts` into Rust. Use v1 naming convention with colon-separated paths and `:v1` suffix (e.g., `"llamenos:puk:sign:v1"`). Add the `LABEL_REGISTRY` array with stable indices matching v1 hotline ordering. Add `label_to_id()` and `id_to_label()` functions. Retire indices 42-46 per v1 convention.

### 1.7 Update `packages/protocol/crypto-labels.json`

Add all new labels. Ensure indices match v1 hotline's `LABEL_REGISTRY` ordering.

**Tests for Phase 1**: `cargo test` — all new modules + existing `blind_index` tests still pass.

---

## Phase 2: PUK + Sigchain + CLKR

**Goal**: Implement the per-user key hierarchy and identity chain.

### 2.1 Implement `puk.rs`

```rust
// Subkey derivation: HMAC-SHA256(seed, label || BE32(gen))
//   - sign: ed25519 seed
//   - dh: x25519 seed
//   - secretbox: AES-256-GCM key
// create_initial_puk(device_enc_pubkey, device_id) -> PukState + HpkeEnvelope
// open_puk_envelope(envelope, device_id) -> seed bytes
// rotate_puk(old_seed, old_gen, remaining_devices) -> RotatePukResult
// decrypt_old_gen_wrap(wrapped_hex, secretbox_key, new_gen) -> old_seed
// generation_walk(current_seed, current_gen, target_gen, wrap_chain) -> target_seed
```

**Tests**: Subkey determinism, rotation chain walk, envelope open, cross-platform vector tests (match v1 TS output).

### 2.2 Implement `sigchain.rs`

```rust
// SigchainLink struct (see spec)
// Payload types enum (serde-tagged)
// create_sigchain_link(seq, prev_hash, payload_json) -> SigchainLink (signs with device key)
// verify_sigchain_link(link, expected_signer_pubkey) -> bool
// verify_sigchain(links: Vec<SigchainLink>) -> SigchainVerifiedState
// Canonical hash: SHA-256 of JSON with sorted keys
```

**Tests**: Chain creation + verification, hash-chain integrity, invalid signature rejection, semantic rule enforcement (device_add, device_remove, puk_rotate generation monotonicity).

### 2.3 Rewrite `encryption.rs`

Replace ECIES-based encryption with HPKE-based:
```rust
// encrypt_note(payload, items_key_hex) -> { ct, content_key_envelope }
// decrypt_note(ct, content_key_envelope, items_key) -> payload
// encrypt_message(plaintext, recipient_items_keys) -> EncryptedMessage
// decrypt_message(encrypted, items_key) -> plaintext
// wrap_items_key(items_key, hub_ptk) -> HpkeEnvelope
// unwrap_items_key(envelope, hub_ptk) -> items_key
```

**Tests**: Round-trip encrypt/decrypt for notes, messages. Multi-recipient. Items_key wrap/unwrap.

### 2.4 Update `ffi.rs` for Phase 2

Add UniFFI exports for: `DeviceKeyState`, `PukState`, `HpkeEnvelope`, `SigchainLink`, all Phase 1+2 functions.

**Test**: `cargo test --features mobile` — UniFFI scaffolding compiles.

---

## Phase 3: MLS Integration

**Goal**: Add OpenMLS as the group key agreement mechanism.

### 3.1 Add OpenMLS dependencies to `Cargo.toml`

```toml
openmls = { version = "0.6", features = ["test-utils"] }
openmls_rust_crypto = "0.3"
openmls_basic_credential = "0.3"
```

Feature-gate behind `mls`:
```toml
[features]
mls = ["dep:openmls", "dep:openmls_rust_crypto", "dep:openmls_basic_credential"]
mobile = ["dep:uniffi", "mls"]
```

### 3.2 Implement `mls.rs`

```rust
// Ciphersuite: MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519
// MlsGroupState: group_id, epoch, member_count
// KeyPackageBundle: key_package_bytes, key_package_ref
// MlsCommitResult: commit_bytes, welcome_bytes (optional), new_epoch
//
// Functions:
// mls_create_group(group_id) -> MlsGroupState
// mls_generate_key_packages(count) -> Vec<KeyPackageBundle>
// mls_add_member(key_package_bytes) -> MlsCommitResult
// mls_remove_member(leaf_index) -> MlsCommitResult
// mls_process_welcome(welcome_bytes) -> MlsGroupState
// mls_process_commit(commit_bytes) -> MlsGroupState
// mls_export_secret(label, length) -> Vec<u8>
// mls_self_update() -> MlsCommitResult
//
// Persistence: OpenMlsKeyStore trait implemented over
//   - Desktop: Stronghold
//   - Mobile: platform keychain (via FFI callback)
//   - Tests: in-memory
```

**Tests**: Create group, add 3 members, remove 1, verify epoch advancement, export_secret consistency across members.

### 3.3 Hub PTK via MLS exporter

```rust
// derive_hub_ptk(mls_export_secret, hub_id) -> [u8; 32]
// With fallback to CLKR-distributed PTK when MLS is unavailable
```

### 3.4 Update UniFFI + WASM exports

Add all MLS functions to `ffi.rs` and `wasm.rs`.

---

## Phase 4: Desktop (Tauri) Integration

**Goal**: Rewrite `apps/desktop/src/crypto.rs` to use new primitives.

### 4.1 Rewrite `apps/desktop/src/crypto.rs`

Replace `CryptoState` (nsec-based) with `DeviceCryptoState`:
```rust
pub struct DeviceCryptoState {
    device_id: Mutex<Option<String>>,
    signing_key: Mutex<Option<ed25519_dalek::SigningKey>>,
    encryption_key: Mutex<Option<x25519_dalek::StaticSecret>>,
    puk_seed: Mutex<Option<[u8; 32]>>,
    puk_generation: Mutex<u32>,
    mls_state: Mutex<Option<MlsGroupManager>>,
}
```

### 4.2 New IPC commands

Remove all nsec/Nostr commands. Add:
```rust
// Device lifecycle
generate_device_keys(pin) -> DeviceKeyState
unlock_device(encrypted_blob, pin) -> DeviceKeyState
lock_device()
get_device_state() -> DeviceKeyState

// PUK
create_puk() -> PukState
load_puk_from_envelope(envelope, device_id) -> PukState
rotate_puk(remaining_device_pubkeys) -> RotatePukResult

// HPKE
hpke_seal(plaintext, recipient_pubkey, label, aad) -> HpkeEnvelope
hpke_open(envelope, expected_label, aad) -> Vec<u8>

// Sigchain
create_sigchain_link(seq, prev_hash, payload_json) -> SigchainLink
verify_sigchain(links_json) -> SigchainVerifiedState

// MLS
mls_create_hub_group(hub_id) -> MlsGroupState
mls_generate_key_packages(count) -> Vec<KeyPackageBundle>
mls_process_message(message_bytes) -> MlsProcessResult
mls_export_hub_ptk() -> String (hex)

// Auth
create_auth_token(timestamp, method, path) -> String
```

### 4.3 Update `src/client/lib/platform.ts`

Replace all IPC call signatures. Remove nsec/npub references. Add device key + PUK + MLS calls.

### 4.4 Update `tests/mocks/tauri-ipc-mock.ts`

Implement new IPC commands in the Playwright test mock using the WASM build of `packages/crypto`.

### 4.5 Run Playwright tests

Ensure all existing desktop E2E tests pass with new crypto backend (auth flow will need updates).

---

## Phase 5: SFrame Voice E2EE

**Goal**: Derive per-call SFrame keys from MLS epoch secrets.

### 5.1 Implement `sframe.rs`

```rust
// derive_sframe_base_key(exporter_secret, call_id) -> [u8; 32]
// derive_sframe_send_key(base_key, participant_index) -> [u8; 16]
// Fallback: derive from hub PTK when MLS unavailable
```

### 5.2 Add to UniFFI + IPC

Export `derive_sframe_key` to all platforms.

### 5.3 Integration with call service

Update `apps/worker/telephony/` to include SFrame key negotiation in call setup flow.

---

## Phase 6: Backend API + Cleanup

**Goal**: Server endpoints for device registration, key packages, sigchain, MLS fanout.

### 6.1 New database tables

File: `apps/worker/db/schema/crypto.ts`
```sql
-- device_keys: device_id, user_id, signing_pubkey, encryption_pubkey, status, created_at
-- key_packages: id, device_id, user_id, key_package_bytes, key_package_ref, consumed_at
-- sigchain_links: id, user_id, seq, prev_hash, entry_hash, payload, signature, created_at
-- mls_messages: id, hub_id, epoch, message_type, sender_device_id, message_bytes, created_at
-- puk_envelopes: id, user_id, device_id, generation, envelope_json, created_at
-- clkr_chain: user_id, generation, wrapped_seed_hex
```

### 6.2 New routes

File: `apps/worker/routes/crypto.ts`
```
POST   /api/devices/register
GET    /api/devices/:userId
POST   /api/key-packages/upload
GET    /api/key-packages/:userId
POST   /api/sigchain/append
GET    /api/sigchain/:userId
POST   /api/mls/:hubId/commit
GET    /api/mls/:hubId/messages
POST   /api/mls/:hubId/welcome
POST   /api/puk/envelopes
GET    /api/puk/envelopes/:userId
```

### 6.3 Auth middleware update

Replace Schnorr signature verification with Ed25519 in `apps/worker/lib/auth.ts`.

### 6.4 Remove legacy code

- Delete `packages/crypto/src/nostr.rs`
- Delete `packages/crypto/src/ecies.rs` (replaced by `hpke_envelope.rs`)
- Delete `packages/crypto/src/provisioning.rs` (replaced by sigchain + PUK)
- Remove `legacy.rs` shim
- Remove `k256`, `bech32`, `chacha20poly1305` from Cargo.toml
- Remove nsec/npub references from all Tauri commands
- Remove Nostr relay auth code from worker

### 6.5 Update protocol schemas

- `packages/protocol/schemas/` — add `DeviceKeyState`, `PukState`, `HpkeEnvelope`, `SigchainLink`, `MlsGroupState` schemas
- `packages/protocol/crypto-labels.json` — final sync with all labels

### 6.6 Mobile crypto rebuild

- `packages/crypto/scripts/build-mobile.sh ios` — rebuild XCFramework
- `packages/crypto/scripts/build-mobile.sh android` — rebuild JNI .so
- Update `apps/ios/Sources/Generated/LlamenosCore.swift` — new UniFFI bindings
- Update `apps/android/app/src/main/java/.../CryptoService.kt` — new FFI surface

---

## Phase 7 (Future): Post-Quantum Hybrid

**Not in this plan's scope.** Feature-gated `pq` flag:
```toml
ml-kem = { version = "0.3", optional = true }
[features]
pq = ["dep:ml-kem"]
```

Envelope `v: 4` with hybrid KEM (X25519 + ML-KEM-1024). Activated when NIST finalizes ML-KEM and ecosystem crates stabilize.

---

## Test Requirements Per Phase

| Phase | Test Type | Command |
|-------|-----------|---------|
| 1 | Rust unit | `cargo test -p llamenos-core` |
| 1 | Cross-platform vectors | `cargo test -p llamenos-core -- --test-threads=1 vectors` |
| 2 | Rust unit | `cargo test -p llamenos-core` |
| 2 | FFI compilation | `cargo test -p llamenos-core --features mobile` |
| 3 | MLS integration | `cargo test -p llamenos-core --features mls` |
| 4 | Desktop E2E | `bun run test` (Playwright) |
| 4 | Type check | `bun run typecheck` |
| 5 | Rust unit | `cargo test -p llamenos-core -- sframe` |
| 6 | Backend BDD | `bun run test:backend:bdd` |
| 6 | Full suite | `bun run test:all` |

---

## Dependencies Between Phases

```
Phase 1 (primitives)
  └── Phase 2 (PUK + sigchain)
        ├── Phase 3 (MLS)
        │     └── Phase 5 (SFrame)
        └── Phase 4 (desktop integration)
              └── Phase 6 (backend + cleanup)
```

Phases 3 and 4 can run in parallel after Phase 2 completes. Phase 5 requires Phase 3. Phase 6 requires both 4 and 5.

---

## Risk Mitigation

1. **OpenMLS version stability**: Pin to specific git commit if crates.io version has breaking changes. OpenMLS 0.6 is the latest stable.
2. **WASM size**: Adding `openmls` to WASM build may bloat binary. Mitigation: feature-gate MLS out of WASM — browser clients use server-mediated MLS via API calls.
3. **Key package exhaustion**: If a device is offline for extended periods, its key packages may be consumed. Mitigation: server-side "last resort" key package (non-consumed, reusable, lower security) + push notification to replenish.
4. **Sigchain fork**: Two devices offline simultaneously both append at the same seq. Mitigation: server enforces seq uniqueness; rejected device retries with incremented seq.
