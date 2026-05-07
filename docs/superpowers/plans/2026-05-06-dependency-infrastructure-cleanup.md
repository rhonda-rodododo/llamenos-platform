# Plan: Dependency & Infrastructure Cleanup

**Spec**: `docs/superpowers/specs/2026-05-05-dependency-infrastructure-cleanup-design.md`

## Prerequisites

- **All 4 prior plans complete**:
  - Plan 1: Rust FFI Server Crypto Bridge — `.so` FFI working
  - Plan 2: Ed25519 Auth Purge — no Schnorr/secp256k1 in auth
  - Plan 3: HPKE Envelope Encryption — no ECIES/XChaCha20
  - Plan 4: WebSocket Relay — no Nostr/strfry
- Zero `@noble/*`, `nostr-tools`, Schnorr, ECIES, XChaCha20 usage remaining in app code

## Implementation Steps

### Step 1: Remove npm Dependencies

**Files**:
- `package.json` (root)

**Changes**:
1. Remove from `dependencies`:
   - `@noble/ciphers`
   - `@noble/curves`
   - `@noble/hashes`
   - `@scure/base`
   - `nostr-tools`
2. Run `bun install` to update `bun.lockb`
3. Verify none appear as transitive deps: `bun pm ls | grep -E "noble|scure|nostr-tools"` → zero results

**Verification**: `bun install` succeeds. `bun run typecheck` passes. `bun run build` passes.

---

### Step 2: Remove Rust Legacy Dependencies

**Files**:
- `packages/crypto/Cargo.toml`
- `apps/desktop/Cargo.toml`

**Changes**:
1. From `packages/crypto/Cargo.toml` remove:
   - `k256` (secp256k1)
   - `elliptic-curve`
   - `bech32`
   - `chacha20poly1305`
2. From `apps/desktop/Cargo.toml` remove:
   - `chacha20poly1305`
3. Verify OpenMLS doesn't transitively need `k256` or `chacha20poly1305`:
   ```bash
   cargo tree --manifest-path packages/crypto/Cargo.toml --features mls -i k256
   cargo tree --manifest-path packages/crypto/Cargo.toml --features mls -i chacha20poly1305
   ```
   If either returns results, keep those deps gated behind `mls` feature only
4. Remove `wasm-bindgen`, `js-sys`, `web-sys` deps if not already removed in Plan 1

**Verification**: `cargo check --all-features` compiles. `cargo test --all-features` passes.

---

### Step 3: Clean Remaining Legacy Rust Modules

**Files**:
- `packages/crypto/src/legacy.rs` (delete if exists)
- `packages/crypto/src/lib.rs`

**Changes**:
1. Delete `packages/crypto/src/legacy.rs` (~40 lines) if it still exists
2. Verify `lib.rs` has NO references to deleted modules:
   - No `pub mod auth_legacy`
   - No `pub mod ecies`
   - No `pub mod encryption_legacy`
   - No `pub mod keys_legacy`
   - No `pub mod legacy`
   - No `pub mod nostr`
   - No `pub mod wasm`
3. Verify `#[cfg(feature = "server")] pub mod ffi_server;` is present
4. Run `cargo clippy --all-features` — zero warnings

**Verification**: `cargo clippy --all-features` clean. `cargo test --all-features` passes.

---

### Step 4: Remove strfry from Docker Compose

**Files**:
- `deploy/docker/docker-compose.dev.yml`
- `deploy/docker/docker-compose.yml`
- `deploy/docker/docker-compose.production.yml`
- `deploy/docker/docker-compose.ci.yml`

**Changes**:
1. Remove `strfry` service definition from all compose files
2. Remove `strfrydata` volume definition from all compose files
3. Remove any `depends_on: strfry` references from other services
4. Add `/ws` upstream to Caddy if not already done in Plan 4

**Verification**: `docker compose -f deploy/docker/docker-compose.dev.yml config` validates

---

### Step 5: Delete strfry Config Files

**Files**:
- `deploy/docker/strfry-dev.conf` (delete)
- `deploy/docker/write-policy.sh` (delete)

**Changes**:
1. Delete both files
2. Verify no other files reference them: `grep -r "strfry-dev.conf\|write-policy.sh" deploy/`

**Verification**: No dangling references

---

### Step 6: Remove strfry from Helm

**Files**:
- `deploy/helm/llamenos/templates/statefulset-strfry.yaml` (delete)
- `deploy/helm/llamenos/templates/service-strfry.yaml` (delete if exists)
- `deploy/helm/llamenos/values.yaml`

**Changes**:
1. Delete strfry StatefulSet and Service templates
2. Remove strfry-related entries from `values.yaml` (image, replicas, storage, etc.)
3. Add WebSocket route configuration if needed

**Verification**: `helm template deploy/helm/llamenos` renders without errors

---

### Step 7: Update Caddyfile

**Files**:
- `deploy/docker/Caddyfile`
- `deploy/docker/Caddyfile.production` (if exists)

**Changes**:
1. Remove `/nostr` proxy route (was `reverse_proxy strfry:7777`)
2. Add `/ws` WebSocket upgrade route: `reverse_proxy app:3000` (verify port from `apps/worker/index.ts`)
3. Ensure WebSocket upgrade headers are properly forwarded

**Verification**: Caddy config validates

---

### Step 8: Remove Nostr Environment Variables

**Files**:
- `deploy/docker/docker-compose.dev.yml`
- `deploy/docker/docker-compose.yml`
- `deploy/docker/docker-compose.production.yml`
- `deploy/helm/llamenos/values.yaml`
- `.env.example` (if exists)
- `.github/workflows/*.yml` (CI secret references)

**Changes**:
1. Remove `SERVER_NOSTR_SECRET` from all env configs
2. Remove `NOSTR_RELAY_URL` from all env configs
3. Remove `NOSTR_RELAY_PUBLIC_URL` from all env configs
4. Remove `ALLOWED_PUBKEY` from all env configs
5. Add `LLAMENOS_CRYPTO_LIB` (optional) to `.env.example` with default documented
6. Consolidate: if `HMAC_SECRET` was separate from `SERVER_NOSTR_SECRET`, verify single `SERVER_SECRET` with HKDF derivation is wired up correctly (from Plan 2, Step 3)

**Verification**: `grep -r "NOSTR_SECRET\|NOSTR_RELAY\|ALLOWED_PUBKEY" deploy/ .github/` → zero results

---

### Step 9: Database Migration — Drop Outbox Table

**Files**:
- `apps/worker/db/migrations/` (new migration if not already created in Plan 4)

**Changes**:
1. If not already done in Plan 4, create migration: `DROP TABLE IF EXISTS nostr_event_outbox;`
2. Remove `nostrEventOutbox` from Drizzle schema if still present
3. Remove any outbox-related schema relations

**Verification**: Migration runs. `bun run typecheck` passes.

---

### Step 10: Update `crypto-labels.json` — Remove Dead Labels

**Files**:
- `packages/protocol/crypto-labels.json`

**Changes**:
1. Remove Nostr/ECIES-specific labels:
   - `LABEL_SERVER_NOSTR_KEY`
   - `LABEL_SERVER_NOSTR_KEY_INFO`
   - `LABEL_SERVER_NOSTR_SIGNING_KEY`
   - `LABEL_SERVER_NOSTR_SIGNING_KEY_INFO`
   - `NOSTR_EVENT_TAG`
   - `LABEL_ECIES_V2_SALT`
2. Verify new labels added by prior plans exist:
   - `LABEL_SERVER_SIGNING_KEY`
   - `LABEL_SERVER_SIGNING_INFO`
   - `LABEL_WS_CHALLENGE`
   - `LABEL_PROVISION_SAS`
3. Reassign IDs for contiguous registry (safe — no production data)
4. Run `bun run codegen` to regenerate TS/Swift/Kotlin constants

**Verification**: `bun run codegen` succeeds. `bun run typecheck` passes.

---

### Step 11: Update CI — `.so` Build Prerequisite

**Files**:
- `.github/workflows/test-desktop.yml` (or equivalent)
- `package.json` (root scripts)

**Changes**:
1. Add `bun run crypto:build:server` as a step before:
   - `bun run dev:server` in any CI job
   - `bun run test:worker`
   - `bun run test:backend:bdd`
   - `bun run test` (Playwright)
2. Modify `dev:server` script to check for `.so` existence and build if missing
3. Add cross-compile check for `aarch64-unknown-linux-gnu` (ARM server target)

**Verification**: CI pipeline runs green

---

### Step 12: Update CLAUDE.md

**Files**:
- `CLAUDE.md` (root)

**Changes**:
1. Remove all Nostr references: strfry, NIP-42, SERVER_NOSTR_SECRET, Nostr relay, Nosflare
2. Remove ECIES references from crypto description
3. Remove XChaCha20-Poly1305 references
4. Remove "Nostr relay (strfry) is a core service" gotcha
5. Remove `nostr-tools` and `@noble/*` from gotchas section
6. Add `bun:ffi` / Rust FFI pattern description
7. Add `bun run crypto:build:server` to development commands
8. Update Docker Compose description (no strfry service)
9. Update auth description: Ed25519 only, no Schnorr
10. Update real-time description: WebSocket relay, not Nostr
11. Update security description: HPKE, not ECIES

**Verification**: Read through for accuracy

---

### Step 13: Update PROTOCOL.md

**Files**:
- `docs/protocol/PROTOCOL.md`

**Changes**:
1. Replace Nostr event format section with native WebSocket event format
2. Update crypto primitives: Ed25519 only, HPKE only, AES-256-GCM only
3. Remove NIP-01/NIP-42 references
4. Document WebSocket upgrade + challenge-response auth protocol
5. Document event encryption (AES-256-GCM + epoch keys)
6. Document event signing (Ed25519 over version:hubId:kind:epoch:payload:ts)
7. Update envelope format: `enc` + `ct` instead of ECIES fields

**Verification**: Spec review for completeness

---

### Step 14: Final Verification — Zero Legacy References

**Files**: None (verification only)

**Changes**: Run all quality gate checks from spec:
1. `cargo test --manifest-path packages/crypto/Cargo.toml --features server` ✓
2. `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile` ✓
3. `cargo clippy --manifest-path packages/crypto/Cargo.toml --all-features` ✓
4. `bun run typecheck` ✓
5. `bun run build` ✓
6. `bun run test` (Playwright E2E) ✓
7. `bun run test:backend:bdd` ✓
8. `grep -r "@noble" src/ apps/ tests/ packages/` → zero results
9. `grep -r "nostr-tools" src/ apps/ tests/` → zero results
10. `grep -r "schnorr" src/ apps/ tests/ packages/crypto/src/` → zero results
11. `grep -r "secp256k1" src/ apps/ tests/ packages/crypto/src/` → zero results
12. `grep -r "k256" packages/crypto/` → zero results
13. `grep -r "xchacha20" src/ apps/ tests/ packages/crypto/src/` → zero results

**Verification**: All 13 checks pass

---

## Dependency Chain

- **Depends on**: All 4 prior plans
- **Depended on by**: Nothing — this is the final cleanup pass

## Risk Notes

- Removing npm deps may break if any are used transitively by other packages — verify with `bun pm ls`
- Removing `k256` from Cargo.toml may fail if OpenMLS transitively requires it — check with `cargo tree`
- `SERVER_SECRET` consolidation requires careful env var management across all deployment targets
- CLAUDE.md and PROTOCOL.md updates are large — review for missed references
- Helm template deletion requires testing: `helm template` must still render correctly
