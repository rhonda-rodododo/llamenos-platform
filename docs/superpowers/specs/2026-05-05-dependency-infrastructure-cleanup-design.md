# Dependency & Infrastructure Cleanup

**Date:** 2026-05-05
**Status:** Draft
**Depends on:** All other specs in this series
**Depended on by:** Nothing (final cleanup pass)

## Context

After completing the Rust FFI bridge, Ed25519 auth purge, HPKE envelope migration, and WebSocket relay replacement, the codebase will have dead dependencies, orphaned configuration, and stale documentation. This spec covers the final cleanup pass.

## Package.json Changes

### Production Dependencies Removed

| Package | Version | Reason |
|---------|---------|--------|
| `@noble/ciphers` | `^2.2.0` | Symmetric crypto now via Rust FFI |
| `@noble/curves` | `^2.2.0` | No secp256k1, no JS Ed25519 |
| `@noble/hashes` | `^2.2.0` | HMAC/HKDF/SHA now via Rust FFI |
| `@scure/base` | `^2.2.0` | Bech32/hex utils replaced by `packages/shared/encoding.ts` |
| `nostr-tools` | `^2.23.3` | Nostr protocol removed entirely |

### Dependencies Retained

All other dependencies are unaffected. No new npm dependencies are added — `bun:ffi` is a Bun built-in.

### Verify No Transitive Dependency

After removal, run `bun install` and verify none of these packages appear in `bun.lockb` as transitive dependencies of other packages. If any do, they're harmless (not imported by our code) but worth noting.

## Rust Dependency Changes

### packages/crypto/Cargo.toml

**Remove:**
```toml
k256 = { version = "0.13", features = ["ecdh", "schnorr", "serde"] }
elliptic-curve = { version = "0.13", features = ["sec1"] }
bech32 = "0.11"
chacha20poly1305 = "0.10"
```

**Verify retained deps** cover all needs:
- `ed25519-dalek` — Ed25519 signing/verification
- `x25519-dalek` — X25519 key agreement (used by HPKE)
- `hpke` — RFC 9180 HPKE implementation
- `aes-gcm` — AES-256-GCM AEAD
- `sha2` — SHA-256
- `hmac` — HMAC-SHA256
- `hkdf` — HKDF-SHA256
- `rand` — cryptographic random bytes
- `openmls` — MLS (behind feature flag)

### apps/desktop/Cargo.toml

**Remove:**
```toml
chacha20poly1305 = "0.10"
```

## Rust Source Cleanup

### Modules Deleted

| Module | Lines | Replacement |
|--------|-------|-------------|
| `src/auth_legacy.rs` | ~70 | `src/auth.rs` (Ed25519) |
| `src/ecies.rs` | ~150 | `src/hpke_envelope.rs` |
| `src/encryption_legacy.rs` | ~80 | `src/encryption.rs` (AES-256-GCM) |
| `src/keys_legacy.rs` | ~60 | `src/device_keys.rs` (Ed25519/X25519) |
| `src/legacy.rs` | ~40 | Nothing |
| `src/nostr.rs` | ~80 | Nothing (Nostr removed) |

### lib.rs Update

Remove legacy module declarations:
```rust
// DELETE these lines:
pub mod auth_legacy;
pub mod ecies;
pub mod encryption_legacy;
pub mod keys_legacy;
pub mod legacy;
pub mod nostr;

// ADD:
#[cfg(feature = "server")]
pub mod ffi;
```

### provisioning.rs Rewrite

`provisioning.rs` currently uses secp256k1 ECDH. Rewrite to use HPKE:
- Provisioner seals the provisioning payload to the new device's X25519 public key
- SAS (Short Authentication String) derivation uses HKDF with the HPKE `enc` value as input instead of secp256k1 shared secret

This is a functional change, not just a delete — the provisioning protocol changes.

## Docker / Helm / Infrastructure

### Docker Compose (dev, prod, CI)

Remove from all compose files:
- `strfry` service definition
- `strfrydata` volume definition
- Any `depends_on: strfry` references

Add WebSocket upstream to Caddy reverse proxy configuration.

### Files Deleted

| File | Purpose |
|------|--------|
| `deploy/docker/strfry-dev.conf` | strfry relay configuration |
| `deploy/docker/write-policy.sh` | strfry write policy plugin |

### Helm Templates

Delete:
- `deploy/helm/llamenos/templates/statefulset-strfry.yaml`
- `deploy/helm/llamenos/templates/service-strfry.yaml`
- Any strfry-related entries in `values.yaml`

### Caddyfile

Remove:
```
route /nostr {
    reverse_proxy strfry:7777
}
```

Add:
```
route /ws {
    reverse_proxy app:3000
}
```

(Port must match the Hono server's listen port — check `apps/worker/index.ts` for the actual value during implementation.)

### Environment Variables

**Remove:**
- `SERVER_NOSTR_SECRET` — everywhere (docker-compose, helm values, CI secrets, .env.example)
- `NOSTR_RELAY_URL` — internal relay connection
- `NOSTR_RELAY_PUBLIC_URL` — client-facing relay URL
- `ALLOWED_PUBKEY` — strfry write policy

**Add:**
- `LLAMENOS_CRYPTO_LIB` (optional) — path to `.so` for FFI, defaults to `packages/crypto/dist/server/libllamenoscore.so`

**Consolidate:** If `SERVER_NOSTR_SECRET` and `HMAC_SECRET` were separate, consolidate to a single `SERVER_SECRET` with HKDF label derivation per purpose. This reduces the number of secrets to manage.

## Database Migration

### Table Deleted

- `nostr_event_outbox` — Nostr outbox persistence table

Create a migration that drops this table:
```sql
DROP TABLE IF EXISTS nostr_event_outbox;
```

## Documentation Updates

### CLAUDE.md

Update the following sections:
- Remove all Nostr references (relay, strfry, NIP-42, event kinds, SERVER_NOSTR_SECRET)
- Update crypto description: "HPKE RFC 9180 X25519-HKDF-SHA256-AES256-GCM" (already there, but remove ECIES references)
- Add `bun:ffi` pattern description
- Update development commands: add `bun run crypto:build:server`
- Remove `nostr-tools` from gotchas
- Update Docker Compose description (no strfry)
- Remove "Nostr relay (strfry) is a core service" gotcha

### PROTOCOL.md

Update wire format specification:
- Replace Nostr event format with native WebSocket event format
- Update crypto primitives (Ed25519 only, HPKE only, AES-256-GCM only)
- Remove NIP-01/NIP-42 references
- Document WebSocket upgrade auth
- Document event encryption (AES-256-GCM + epoch keys)

### crypto-labels.json

Review all 57 labels. Remove any that reference Nostr-specific operations. Add any new labels needed for:
- `LABEL_SERVER_SIGNING_KEY` — HKDF label for server Ed25519 keypair
- `LABEL_WS_EVENT_ENCRYPT` — HKDF label for WebSocket event encryption (if different from existing hub event label)

## Development Script Changes

### package.json Scripts

**Add:**
- `crypto:build:server` — `cargo build --release --features server && cp target/release/libllamenoscore.so packages/crypto/dist/server/`

**Modify:**
- `dev:server` — add `.so` build as prerequisite (or check if `.so` exists, build if missing)
- `test:worker` — add `.so` build as prerequisite

## Quality Gates

After all changes, verify:

1. `cargo test --manifest-path packages/crypto/Cargo.toml --features server` — Rust FFI tests pass
2. `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile` — mobile tests still pass
3. `cargo clippy --manifest-path packages/crypto/Cargo.toml --all-features` — no warnings
4. `bun run typecheck` — no TypeScript errors
5. `bun run build` — Vite build succeeds
6. `bun run test` — Playwright E2E tests pass
7. `bun run test:backend:bdd` — backend BDD tests pass
8. `grep -r "@noble" src/ apps/ tests/ packages/` — zero results (except maybe lockfile)
9. `grep -r "nostr-tools" src/ apps/ tests/` — zero results
10. `grep -r "schnorr" src/ apps/ tests/ packages/crypto/src/` — zero results
11. `grep -r "secp256k1" src/ apps/ tests/ packages/crypto/src/` — zero results
12. `grep -r "k256" packages/crypto/` — zero results (not in Cargo.toml or source)
13. `grep -r "xchacha20" src/ apps/ tests/ packages/crypto/src/` — zero results

## Decisions to Review

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Remove all `@noble/*` | Yes, zero JS crypto | Keep `@noble/hashes` for non-crypto hashing | One audit surface. Rust FFI handles everything |
| Consolidate to `SERVER_SECRET` | Single secret + HKDF | Keep separate secrets per purpose | Fewer secrets to manage. HKDF provides cryptographic separation |
| Drop `nostr_event_outbox` table | Migration to drop | Keep table unused | Dead table. Clean schema |
| `.so` as build prerequisite | Required for dev:server and tests | Optional with JS fallback | No fallback. Rust crypto is the only implementation |
