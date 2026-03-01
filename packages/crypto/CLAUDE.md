# CLAUDE.md — llamenos-core

Shared Rust cryptographic core for the Llamenos crisis response hotline platform.

## Overview

This crate provides a single, auditable implementation of all cryptographic operations used across three platforms:

- **Desktop (Tauri v2)**: Linked as a native Rust dependency via `Cargo.toml` path/git dep
- **Mobile (React Native)**: Exposed via UniFFI bindings (Swift for iOS, Kotlin for Android)
- **Browser**: Compiled to WebAssembly via `wasm-bindgen` (future — replaces `@noble/*` JS crypto)

## Modules

| Module | Purpose |
|--------|---------|
| `labels` | All 25 domain separation constants (must match `src/shared/crypto-labels.ts` in llamenos) |
| `ecies` | ECIES key wrapping/unwrapping (secp256k1 ECDH + SHA-256 KDF + XChaCha20-Poly1305) |
| `encryption` | High-level note, message, call record, draft, and PIN encryption |
| `auth` | BIP-340 Schnorr signature auth tokens |
| `keys` | Keypair generation, nsec/npub bech32 encoding |
| `errors` | `CryptoError` enum |

## Protocol Compatibility

This crate MUST produce byte-identical output to the TypeScript implementations in `../llamenos/src/client/lib/crypto.ts` for the same inputs. The protocol specification at `../llamenos/docs/protocol/PROTOCOL.md` is the authoritative reference.

## Development

```bash
cargo build            # Build
cargo test             # Run all 17 tests
cargo clippy           # Lint
cargo doc --open       # Generate docs
```

## Feature Flags

- `uniffi` — Enable UniFFI bindings for mobile (Swift/Kotlin)
- `wasm` — Enable wasm-bindgen exports for browser

## Related Repos

- `~/projects/llamenos` — Desktop app, API server, protocol spec
- `~/projects/llamenos-mobile` — React Native mobile app
