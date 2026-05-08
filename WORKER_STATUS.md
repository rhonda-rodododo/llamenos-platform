# Worker Status: crypto-ffi-auth

**Branch**: `crypto-ffi-auth`
**PR**: https://github.com/rhonda-rodododo/llamenos-platform/pull/225
**Status**: Complete — pushed and PR created

## Commits (3)

1. `6be1e804` — feat(crypto): add Rust FFI server bridge + delete WASM target
2. `7823d4a2` — feat(auth): Ed25519 auth purge — server + test infrastructure
3. `75916e8e` — purge(auth): remove Schnorr/nip19 from client + delete auth_legacy.rs

## Verification Results

| Check | Result |
|-------|--------|
| `cargo test --all-features` | ✅ 11 passed |
| `cargo clippy --all-features -D warnings` | ✅ Clean |
| `bunx tsc --noEmit` | ✅ Clean |
| `bun run build` | ✅ Success |
| `bun run codegen` → `--check` | ✅ Up to date |

## What Was Done

### Plan 1: Rust FFI Server Bridge
- Added `server` feature to `packages/crypto/Cargo.toml`
- Created `ffi_server.rs` with 15 C ABI FFI functions
- Created `packages/crypto/ffi.ts` TypeScript wrapper (bun:ffi)
- Created `packages/shared/encoding.ts` (hex/utf8 utilities)
- Added `crypto:build:server` script
- Deleted WASM target (`wasm.rs`, wasm-pack config)

### Plan 2: Ed25519 Auth Purge
- Deleted `auth_legacy.rs` (Schnorr auth)
- Removed `auth_schnorr` re-export from `legacy.rs`
- Rewrote `apps/worker/lib/auth.ts` to use Ed25519 via FFI
- Migrated all test infrastructure (api-helpers, global-setup, 5 BDD step files)
- Removed nip19/nostr-tools from client (settings, login, auth, key-manager)
- Replaced demo nsec1 strings with hex seeds
- Added `isValidSeedHex()` to platform.ts

## What Stays (Intentionally)

- **ECIES modules** (`ecies.rs`, `keys_legacy.rs`, `encryption_legacy.rs`) — mobile FFI still uses them
- **Nostr modules** (`nostr.rs`, `nostr-publisher.ts`, relay files) — NIP-01 event system stays
- **`legacyImportNsec`** in platform.ts — deprecated but used by Playwright test helpers
- **`nostr-tools` dependency** — still needed for `nostr-tools/pure` (event verification)

## Remaining Work (Out of Scope)

- Backend BDD tests need running server to validate end-to-end
- Playwright E2E tests need Tauri IPC mock rebuild
- Full ECIES → HPKE migration (separate epic)
- Nostr relay removal (separate epic)
