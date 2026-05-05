# CLAUDE.md — packages/crypto

Shared Rust cryptographic core for the Llamenos crisis response hotline platform. Lives in-repo at `packages/crypto/` — it is **not** a separate repository.

## Overview

This crate provides a single, auditable implementation of all cryptographic operations across all platforms:

- **Desktop (Tauri v2)**: Linked as a native Rust dependency (`apps/desktop/Cargo.toml` path dep)
- **iOS (native SwiftUI)**: Exposed via UniFFI XCFramework (`build-mobile.sh ios`)
- **Android (native Kotlin/Compose)**: Exposed via UniFFI JNI `.so` files (`build-mobile.sh android`)
- **Browser (test builds only)**: Compiled to WebAssembly via `wasm-bindgen`

## Modules

| Module | Purpose |
|--------|---------|
| `labels` | 57 domain separation constants (source of truth: `../../packages/protocol/crypto-labels.json`) |
| `hpke_envelope` | HPKE key wrapping/unwrapping (RFC 9180 X25519-HKDF-SHA256-AES256-GCM) — current |
| `ecies` | Legacy ECIES (secp256k1 ECDH + XChaCha20-Poly1305) — scheduled for removal |
| `encryption` | Per-note/message/file envelope encryption (HPKE); legacy decryption path |
| `device_keys` | Ed25519 signing + X25519 encryption keypair generation and PIN-protected storage |
| `sigchain` | Append-only, hash-chained, Ed25519-signed device authorization records |
| `puk` | Per-User Key hierarchy + Cascading Lazy Key Rotation (CLKR) |
| `auth` | Ed25519 auth token generation/verification; legacy Schnorr path |
| `blind_index` | Blind indexing for server-side E2EE search (HMAC-SHA256) |
| `provisioning` | Ephemeral ECDH device provisioning with SAS verification |
| `mls` | MLS group management (RFC 9420, OpenMLS 0.8) |
| `sframe` | SFrame voice E2EE key derivation |
| `padding` | Power-of-2 payload padding (traffic analysis mitigation) |
| `nostr` | Nostr key derivation from `SERVER_NOSTR_SECRET` |
| `ffi`, `ffi_v3` | UniFFI bindings for iOS/Android |
| `wasm` | WASM exports for browser test builds |

## Protocol Compatibility

The authoritative reference is `../../docs/protocol/PROTOCOL.md`. Domain separation constants are defined in `../../packages/protocol/crypto-labels.json` and must match generated constants in all clients. NEVER use raw string literals for crypto contexts.

## Development

```bash
# From repo root:
bun run crypto:test          # cargo test
bun run crypto:test:mobile   # cargo test --features mobile (UniFFI tests)
bun run crypto:clippy        # cargo clippy
bun run crypto:fmt           # cargo fmt --check

# Mobile build:
./scripts/build-mobile.sh ios      # Build iOS XCFramework
./scripts/build-mobile.sh android  # Build Android JNI .so files
```

## Feature Flags

- `mobile` — Enable UniFFI scaffolding for iOS/Android. Required for library builds targeting mobile. Without it, the static archive has zero UniFFI symbols.
- `uniffi-bindgen` — Extends `mobile` with the `uniffi-bindgen` CLI tool.

## Legacy Notes

`ecies.rs`, `keys_legacy.rs`, `auth_legacy.rs`, `encryption_legacy.rs` contain the old secp256k1/ECIES/Schnorr/nsec implementations. These are kept for decrypting existing data and are being phased out. All new code uses HPKE + Ed25519/X25519.
