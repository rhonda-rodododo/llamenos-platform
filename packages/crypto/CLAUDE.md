# CLAUDE.md — packages/crypto

Shared Rust cryptographic core for the Llamenos crisis response hotline platform. Lives in-repo at `packages/crypto/` — it is **not** a separate repository.

## Overview

This crate provides a single, auditable implementation of all cryptographic operations across all platforms:

- **Desktop (Tauri v2)**: Linked as a native Rust dependency (`apps/desktop/Cargo.toml` path dep)
- **Server (Bun)**: Loaded as cdylib via `bun:ffi` (feature = "server"). Wrapper at `packages/crypto/ffi.ts`.
- **iOS (native SwiftUI)**: Exposed via UniFFI XCFramework (`build-mobile.sh ios`)
- **Android (native Kotlin/Compose)**: Exposed via UniFFI JNI `.so` files (`build-mobile.sh android`)

## Modules

| Module | Purpose |
|--------|---------|
| `labels` | Domain separation constants (source of truth: `../../packages/protocol/crypto-labels.json`) |
| `hpke_envelope` | HPKE key wrapping/unwrapping (RFC 9180 X25519-HKDF-SHA256-AES256-GCM) |
| `encryption` | Per-note/message/file envelope encryption (HPKE + AES-256-GCM) |
| `device_keys` | Ed25519 signing + X25519 encryption keypair generation and PIN-protected storage |
| `sigchain` | Append-only, hash-chained, Ed25519-signed device authorization records |
| `puk` | Per-User Key hierarchy + Cascading Lazy Key Rotation (CLKR) |
| `auth` | Ed25519 auth token generation/verification |
| `blind_index` | Blind indexing for server-side E2EE search (HMAC-SHA256) |
| `provisioning` | Ephemeral X25519 device provisioning with SAS verification |
| `mls` | MLS group management (RFC 9420, OpenMLS 0.8) |
| `sframe` | SFrame voice E2EE key derivation |
| `padding` | Power-of-2 payload padding (traffic analysis mitigation) |
| `ffi`, `ffi_v3` | UniFFI bindings for iOS/Android |
| `ffi_server` | C ABI exports for bun:ffi server bridge |

## Protocol Compatibility

The authoritative reference is `../../docs/protocol/PROTOCOL.md`. Domain separation constants are defined in `../../packages/protocol/crypto-labels.json` and must match generated constants in all clients. NEVER use raw string literals for crypto contexts.

## Development

```bash
# From repo root:
bun run crypto:test          # cargo test
bun run crypto:test:mobile   # cargo test --features mobile (UniFFI tests)
bun run crypto:clippy        # cargo clippy
bun run crypto:fmt           # cargo fmt --check
bun run crypto:build:server  # Build libllamenos_core.so for bun:ffi

# Mobile build:
./scripts/build-mobile.sh ios      # Build iOS XCFramework
./scripts/build-mobile.sh android  # Build Android JNI .so files
```

## Feature Flags

- `server` — Enable C ABI exports for bun:ffi server bridge. Used by `packages/crypto/ffi.ts`.
- `mobile` — Enable UniFFI scaffolding for iOS/Android. Required for library builds targeting mobile. Without it, the static archive has zero UniFFI symbols.
- `uniffi-bindgen` — Extends `mobile` with the `uniffi-bindgen` CLI tool.

## Crypto Primitives

- **Signing**: Ed25519 (ed25519-dalek)
- **Key agreement**: X25519 (x25519-dalek)
- **Envelope encryption**: HPKE RFC 9180 (DHKEM(X25519) + HKDF-SHA256 + AES-256-GCM)
- **Symmetric AEAD**: AES-256-GCM (sole AEAD — no XChaCha20-Poly1305)
- **KDF**: HKDF-SHA256
- **PIN/passphrase**: Argon2id (64MB, 3 iterations, 4 parallelism)
