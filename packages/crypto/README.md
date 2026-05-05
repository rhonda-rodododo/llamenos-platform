# packages/crypto

Shared Rust cryptographic core for Llamenos. All cryptographic operations are implemented **once** in this crate and compiled to three targets:

| Target | How | Used by |
|--------|-----|---------|
| Native Rust | Path dependency in `apps/desktop/Cargo.toml` | Tauri desktop (keys never enter webview) |
| UniFFI XCFramework | `./scripts/build-mobile.sh ios` | iOS SwiftUI client |
| UniFFI JNI `.so` | `./scripts/build-mobile.sh android` | Android Kotlin/Compose client |
| WASM | `wasm-bindgen` (test builds only) | Browser mock layer for Playwright |

## What it provides

- **HPKE envelope encryption** (RFC 9180, X25519-HKDF-SHA256-AES256-GCM) — key wrapping for notes, messages, files, hub key, PUK
- **Ed25519/X25519 device keys** — per-device signing + encryption keypairs; PIN-protected storage via Argon2id
- **Sigchain** — append-only, hash-chained, Ed25519-signed device authorization log
- **PUK (Per-User Key)** — user-level key hierarchy with Cascading Lazy Key Rotation (CLKR)
- **57 domain separation labels** — Albrecht defense; enforced at decrypt
- **Blind indexing** — HMAC-SHA256-based server-side search over encrypted data
- **MLS** (RFC 9420, OpenMLS 0.8) — group key management for hub state
- **SFrame** — voice E2EE key derivation
- **Payload padding** — power-of-2 bucketing for traffic analysis resistance
- **Legacy ECIES/Schnorr/nsec** — retained for decrypting existing data; being phased out

## Building

```bash
# From repo root
bun run crypto:test           # cargo test
bun run crypto:test:mobile    # cargo test --features mobile
bun run crypto:clippy         # lint
bun run crypto:fmt            # format check

# Mobile
./scripts/build-mobile.sh ios      # → LlamenosCoreFFI.xcframework
./scripts/build-mobile.sh android  # → libllamenos_crypto.so (multiple ABIs)
```

## Key rules

- **Never use raw string literals for crypto contexts** — always use constants generated from `../protocol/crypto-labels.json`
- **HPKE only for new code** — the legacy ECIES modules (`ecies.rs`) are read-only; no new callers
- **`mobile` feature is required** for iOS/Android library builds — without it, the static archive has zero UniFFI symbols
- Private key material uses `zeroize::Zeroizing<>` throughout; secrets are cleared on lock/drop

## Security docs

- `docs/security/CRYPTO_ARCHITECTURE.md` — full primitive inventory, key hierarchy, envelope format
- `docs/protocol/PROTOCOL.md` — wire formats and protocol contracts
- `docs/security/THREAT_MODEL.md` — adversary profiles and trust boundaries
