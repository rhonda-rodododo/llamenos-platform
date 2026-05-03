# Security Hardening Implementation Plan

**Date:** 2026-05-03
**Branch:** v1-security-study
**Status:** Research complete — implementation plan ready for review
**Based on:** Security Gaps Feasibility Analysis + 58-Finding Audit (2026-03-21) + Nostr Hardening Spec (2026-05-03)

---

## v1 Solutions Already Ported to v2

These security patterns from v1 have been successfully carried forward:

| Solution | Status | Key Files |
|----------|--------|-----------|
| HMAC-SHA256 phone hashing (with server secret) | ✅ Ported | `apps/worker/lib/crypto.ts:15-19` |
| IP hash truncation (96-bit HMAC) | ✅ Ported | `apps/worker/lib/crypto.ts:25-29` |
| SSRF guard (full CIDR blocklist: IPv4, IPv6, mapped) | ✅ Ported | `apps/worker/lib/ssrf-guard.ts` |
| Per-note forward secrecy (random key per note) | ✅ Ported | `packages/crypto/src/encryption.rs`, HPKE envelopes |
| Hub key rotation on member departure | ✅ Ported | `apps/worker/routes/hubs.ts:269-283`, Key Revocation Runbook |
| 57 domain separation labels (Albrecht defense) | ✅ Ported | `packages/protocol/crypto-labels.json`, `packages/crypto/src/labels.rs` |
| Ed25519 auth tokens bound to method+path | ✅ Ported | `apps/worker/lib/auth.ts` |
| DEV_RESET_SECRET gate on test endpoints | ✅ Ported | `apps/worker/routes/dev.ts` |
| Bun audit in CI pipeline | ✅ Ported | `.github/workflows/ci.yml` |
| Per-device Ed25519/X25519 keys (no global nsec) | ✅ Ported | `packages/crypto/src/device_keys.rs` |
| Sigchain (append-only device authorization) | ✅ Ported | `packages/crypto/src/sigchain.rs` |
| PUK with Cascading Lazy Key Rotation (CLKR) | ✅ Ported | `packages/crypto/src/puk.rs` |
| Device keys never in webview (Rust CryptoState) | ✅ Ported | `apps/desktop/src/crypto.rs`, `platform.ts` |
| Zeroize on key material (device_keys.rs) | ✅ Ported | `DeviceSecrets` uses `#[derive(Zeroize)]` |
| Hub-per-worker test isolation | ✅ Ported | `apps/worker/routes/dev.ts` (test-create-hub) |
| Nostr outbox with PostgreSQL persistence | ✅ Ported | `apps/worker/lib/nostr-outbox.ts` |
| Hash-chained audit logs (SHA-256) | ✅ Ported | Audit service |
| Blind indexes for encrypted search | ✅ Ported | `packages/crypto/src/blind_index.rs`, `apps/worker/lib/blind-index-query.ts` |

---

## v1 Solutions Still Needed in v2

These were resolved or designed in v1 but have not yet been carried forward:

### 1. Nsec/Secret Key Leakage — IPC Commands (CRIT-D1/D2/D3 from audit)

**v1 status:** The March audit flagged three IPC commands (`generate_keypair`, `get_nsec_from_state`, `create_auth_token`) that leak the nsec into the webview. These were identified as v1's most critical desktop vulnerabilities.

**v2 status:** Based on code inspection, `DeviceKeyState` in `device_keys.rs:26-36` correctly excludes secret material. The new device key architecture (generate→PIN-encrypt→store→unlock in Rust) does NOT leak secrets over IPC. **Partially resolved** — however, legacy `keys.rs` `KeyPair` struct and legacy IPC commands may still exist. The isolation allowlist drift (HIGH-D2) needs cleanup.

**Action needed:** Verify all legacy IPC commands are removed from `generate_handler![]` and isolation allowlist. Verify no path returns secret key material over IPC.

### 2. Production strfry Write-Policy Enforcement (CRIT from Nostr spec)

**v1 status:** Identified in Nostr hardening spec — relay accepts writes from anyone.

**v2 status:** `deploy/docker/strfry-prod.conf` has `plugin = ""` — enforcement is not implemented.

**Action needed:** Ship `write-policy.lua` that whitelists only the server pubkey.

### 3. PIN Lockout Counter in Stronghold (HIGH-D3 from audit)

**v1 status:** The audit identified that `pin_failed_attempts` and `pin_lockout_until` are stored in plaintext JSON (`apps/desktop/src/crypto.rs:28-30`). An adversary with filesystem access can reset the counter between PIN attempts.

**v2 status:** Same code remains — counter is in CryptoState's in-memory Mutex but persisted to Tauri Store (plain JSON). Stronghold is initialized but unused for key storage (MED-D2).

**Action needed:** Migrate PIN lockout state to Tauri Stronghold OR implement server-side rate limiting with nonces.

### 4. Rate Limiting Inverted Check (HIGH-W2 from audit)

**v1 status:** The audit flagged that rate limiting is disabled in production due to an inverted environment check.

**v2 status:** Need to verify current `apps/worker/routes/auth.ts` — the middleware in `apps/worker/middleware/auth.ts` has a dev-mode bypass but the rate limiting condition needs verification.

**Action needed:** Audit all rate-limiting guards for correct polarity. Introduce explicit `DISABLE_RATE_LIMITING=true` for dev.

### 5. Docker Image Pinning to SHA-256 Digest (CRIT-CI2, HIGH-CI2/CI3)

**v1 status:** Partially fixed (some images pinned, strfry and whisper still tag-only per audit).

**v2 status:** Same — `deploy/docker/docker-compose.yml` likely has remaining unpinned images.

**Action needed:** Pin ALL images to digest. Add CI check that rejects mutable tags in compose files.

### 6. Workflow Input Injection (CRIT-CI1)

**v1 status:** Identified in audit — `${{ github.event.inputs.version }}` directly in shell.

**v2 status:** Needs verification. Fix is mechanical: use `env:` indirection + semver regex.

**Action needed:** Audit all `workflow_dispatch` inputs for direct shell injection.

---

## New for v2 (Not in v1)

### A. Per-Hub Event Key Derivation (Critical — from Nostr spec)

Currently a single `SERVER_NOSTR_SECRET`-derived event key is shared with ALL users across ALL hubs. A compromised or revoked user can decrypt all relay traffic.

**Solution:** `HKDF(SHA-256, SERVER_NOSTR_SECRET, salt=hubId, info="llamenos:hub-event", 32)` — deliver per-hub keys to members only.

### B. Client Publisher Pubkey Verification (Critical — from Nostr spec)

`RelayManager.handleEvent()` verifies Nostr signatures but never checks that `event.pubkey === serverPubkey`. A compromised relay or external attacker who knows the event key can inject forged events.

**Solution:** Add `event.pubkey !== this.serverPubkey` rejection in `handleEvent()`.

### C. PIN/Passphrase Upgrade (8-digit minimum + alphanumeric option)

Currently: `is_valid_pin()` accepts 6-8 digits only (`device_keys.rs:268-270`).

**Requirements:**
- Minimum 8-digit numeric PIN (raise from 6)
- OR alphanumeric passphrase (user's choice, minimum 12 chars)
- Argon2id for passphrase-based derivation (NOT currently in `Cargo.toml` — add `argon2` crate)
- Keep PBKDF2-SHA256 600K for numeric PIN (Argon2id for passphrases with memory-hard parameters)
- **NO IDP** — authentication remains Nostr keypairs + WebAuthn exclusively

### D. Hub Symmetric Key Decrypt in Rust (from Nostr spec H2)

Hub key and server event key currently live in JavaScript memory. A webview XSS could extract them.

**Solution:** Add IPC command `decrypt_hub_event(ciphertext, hub_id) -> plaintext` in Rust CryptoState. Encrypted relay events pass through to Rust and return as plaintext without the key ever touching JS.

### E. Event Key Rotation Epochs (from Nostr spec H5)

Single cached event key with no rotation mechanism. No forward secrecy for relay events.

**Solution:** Time-based epoch derivation (e.g., daily). Include epoch in event tags. Clients maintain a small window of recent epoch keys.

### F. MLS Always-On (remove feature flag)

MLS is currently behind `mls` feature flag in `Cargo.toml:83`. For v2, MLS should be compiled unconditionally for all platforms — it provides the group key management primitive needed for hub state.

---

## Implementation Phases

### Phase A: Quick Wins (1-2 days each)

| # | Task | Files | Impact |
|---|------|-------|--------|
| A1 | Ship strfry write-policy plugin (whitelist server pubkey) | `deploy/docker/write-policy.lua`, `strfry-prod.conf` | Blocks relay injection |
| A2 | Add server pubkey verification in `RelayManager.handleEvent()` | `src/client/lib/nostr/relay.ts` | Blocks forged events |
| A3 | Pin all remaining Docker images to SHA-256 digest | `deploy/docker/docker-compose.yml`, `docker-compose.production.yml` | Supply chain |
| A4 | Verify/fix rate limiting polarity (`HIGH-W2`) | `apps/worker/routes/auth.ts` | Auth brute-force |
| A5 | Remove `'unsafe-inline'` from style-src CSP | `apps/desktop/tauri.conf.json:25` | CSS injection |
| A6 | Remove `'wasm-unsafe-eval'` from production CSP | `apps/desktop/tauri.conf.json:22` | Unnecessary attack surface |
| A7 | Fix `d` tag mismatch — server events use hubId not "global" | `apps/worker/lib/nostr-events.ts:24` | Cross-hub event leak |
| A8 | Enforce `wss://` for relay connections in production | `src/client/lib/nostr/context.tsx` | Metadata protection |
| A9 | Reduce outbox retention to 5 minutes for delivered events | `apps/worker/lib/nostr-outbox.ts` | Metadata exposure window |
| A10 | Add `--locked` to remaining `cargo install` in CI | `.github/workflows/mobile-release.yml:57` | Supply chain |
| A11 | Fix workflow input injection (env indirection + semver regex) | `.github/workflows/tauri-release.yml` | CI compromise |
| A12 | Audit/remove legacy IPC commands from isolation allowlist | `apps/desktop/isolation/index.html` | IPC drift |

### Phase B: PIN/Passphrase Upgrade (3-5 days)

**Goal:** Minimum 8-digit PIN OR alphanumeric passphrase. NO IDP.

| # | Task | Notes |
|---|------|-------|
| B1 | Update `is_valid_pin()` in `device_keys.rs` and `encryption.rs` | Accept: 8+ digits OR 12+ alphanumeric chars |
| B2 | Add `argon2` crate to `Cargo.toml` | Use `argon2 = "0.5"` (RustCrypto, audited) |
| B3 | Implement dual KDF strategy | Numeric 8+ digits → PBKDF2-SHA256 600K iter; Alphanumeric 12+ chars → Argon2id (m=64MB, t=3, p=4) |
| B4 | Update `EncryptedDeviceKeys` format | Add `kdf: "pbkdf2" | "argon2id"` field to stored blob |
| B5 | Update `derive_kek()` to dispatch by KDF type | Backward-compatible: existing blobs without `kdf` field default to PBKDF2 |
| B6 | Expose passphrase option in PIN UI (all platforms) | PINPad component + "Use passphrase" toggle |
| B7 | Migrate PIN lockout counter to Stronghold | Move `pin_failed_attempts`/`pin_lockout_until` from plain JSON to encrypted vault |
| B8 | Update mobile FFI: `mobile_is_valid_pin` → `mobile_is_valid_credential` | Accept both PIN and passphrase formats |
| B9 | Update tests | Cross-platform round-trip with both KDF types |

**Entropy analysis:**
- 6-digit PIN: ~20 bits (current minimum — **too low**)
- 8-digit PIN: ~27 bits (new minimum — adequate with 600K PBKDF2)
- 12-char alphanumeric: ~71 bits (with Argon2id — excellent)
- 16-char passphrase: ~95 bits (far exceeds requirements)

### Phase C: Metadata Reduction (2-3 days)

| # | Task | Notes |
|---|------|-------|
| C1 | Per-hub event key derivation | `HKDF(secret, salt=hubId, info="llamenos:hub-event")` — deliver only member-hub keys |
| C2 | Separate signing and encryption secrets for relay | Independent HKDF domains or two env vars |
| C3 | Hash phone in ALL audit log paths | Verify `apps/worker/routes/bans.ts:63` and all other `audit()` calls |
| C4 | Remove `callerLast4` from non-answering-volunteer contexts | Only the answering volunteer needs last4 during the call |
| C5 | Restrict `POST /bans/` raw phone to admin only | `MED-W2` from audit |
| C6 | Tighten strfry event age to 300s | Production relay rejects events older than 5 minutes |
| C7 | Event key rotation epochs (daily) | Time-based derivation with epoch in event tags |

### Phase D: Transport Privacy (3-5 days)

| # | Task | Notes |
|---|------|-------|
| D1 | Move hub key decrypt to Rust CryptoState | New IPC command: `decrypt_hub_event(ciphertext, hub_id) -> plaintext` |
| D2 | Payload padding for HPKE envelopes | Pad all encrypted content to nearest 256-byte boundary before HPKE wrap |
| D3 | Signal-first notification delivery | `user-notifications.ts` already gates on Signal preference; make Signal the default channel, fallback to others |
| D4 | NIP-42 auth state machine (three-state) | `unauthenticated → authenticating → authenticated`; buffer events until relay confirms |
| D5 | Certificate pinning for relay connection | Tauri Rust backend for desktop; platform-specific for iOS/Android |
| D6 | Event sequence numbers per hub | Monotonic counter; clients detect out-of-order delivery |

### Phase E: Cryptographic Erasure (1-2 days)

| # | Task | Notes |
|---|------|-------|
| E1 | Document crypto erasure guarantees | Hub key rotation = effective crypto erasure for departed members (they cannot decrypt new data) |
| E2 | Verify hub key rotation excludes departed member | Confirm `removeHubRole` triggers re-wrap for remaining members only |
| E3 | PUK rotation on departure excludes old user | Confirm CLKR chain is not extended to departed user's devices |
| E4 | Add admin command: `force-hub-key-rotation` | Manual trigger for emergency scenarios (device seizure) |
| E5 | Add retention policy enforcement | Automated deletion of call metadata older than configured retention (2 years default) |

---

## Architectural Constraints

These are non-negotiable for all implementation work:

1. **NO IDP** — No OAuth, OIDC, SAML, Auth0, Cognito, or any identity provider. Authentication is:
   - Ed25519 device keypairs (per-device, generated locally)
   - WebAuthn passkeys (phishing-resistant, device-bound)
   - PIN/passphrase for device key encryption at rest

2. **All crypto in Rust** — `packages/crypto/` is the single implementation. No JS crypto in production (legacy `@noble/*` is server-side only for ECIES key wrapping during transition).

3. **HPKE for all key wrapping** — RFC 9180 X25519-HKDF-SHA256-AES256-GCM. No new ECIES code.

4. **MLS for group key management** — Always-on (remove feature flag). OpenMLS 0.8.

5. **No backwards compatibility needed** — Pre-production. Can break stored formats freely.

6. **Per-device keys, not nsec** — Users have Ed25519+X25519 device keys authorized via sigchain. The nsec/npub is a legacy Nostr concept being phased out.

7. **Domain separation always** — 57 labels in `crypto-labels.json`. Never use raw string literals.

8. **Device keys never in webview** — All private key operations in Rust CryptoState (desktop) or MobileState (iOS/Android).

---

## 58-Finding Audit Status Summary

### Resolved / Not Applicable in v2:

| Finding | Status | Notes |
|---------|--------|-------|
| CRIT-D1/D2/D3 (nsec in webview) | **Largely resolved** | New `DeviceKeyState` excludes secrets; verify legacy commands removed |
| CRIT-C1 (HKDF None salt) | **Resolved** | HPKE replaces ECIES for new code; legacy retained read-only |
| CRIT-C2 (v1 legacy path active) | **Acknowledged** | Legacy code retained for decryption during transition — acceptable |
| CRIT-C3 (KDF mismatch ffi/provisioning) | **Resolved** | v2 uses unified `device_keys.rs` with single KDF path |
| CRIT-H2/H3 (hub switch key leak) | **Resolved** | Multi-hub axiom + proper reconnect implemented (Plan A mobile work) |
| CRIT-M1 (push payload logged) | **Needs verification** | Check if `#if DEBUG` guard added |
| CRIT-M3 (hardcoded admin key) | **Needs verification** | Check git history; rotate key if found |
| HIGH-W1 (global server event key) | **Open** → Phase C1 |
| HIGH-W2 (rate limiting inverted) | **Open** → Phase A4 |
| HIGH-W3 (raw phone in audit) | **Open** → Phase C3 |
| HIGH-D3 (PIN lockout in plain JSON) | **Open** → Phase B7 |

### Still Open (addressed in this plan):

- **CRIT-CI1** (workflow injection) → Phase A11
- **CRIT-CI2** (Docker image pinning) → Phase A3
- **HIGH-CI1** (cargo install --locked) → Phase A10
- **HIGH-D1** (unsafe-inline CSP) → Phase A5
- **HIGH-W1** (global event key) → Phase C1
- **HIGH-W2** (rate limit polarity) → Phase A4
- **HIGH-W3** (raw phone audit) → Phase C3
- **HIGH-D3** (PIN lockout bypass) → Phase B7
- **MED-D1** (wasm-unsafe-eval) → Phase A6
- **MED-W2** (raw phone ban endpoint) → Phase C5

---

## Decisions to Review

### D1: Argon2id vs PBKDF2 for passphrase derivation

**Chosen:** Dual strategy — PBKDF2-SHA256 600K for numeric PINs, Argon2id for alphanumeric passphrases.
**Alternative A:** Argon2id for everything (even numeric PINs).
**Alternative B:** Increase PBKDF2 iterations to 1M+ for all credential types.
**Tradeoff:** Argon2id provides memory-hard resistance against GPU/ASIC attacks, but adds a dependency (`argon2` crate, ~50KB). PBKDF2 is adequate for 8-digit PINs (600K iterations ≈ 0.5s on mobile), but weak against parallel attacks for passphrases that might encourage users to pick weaker ones. Dual strategy gives optimal UX: fast PIN entry for daily use, strong passphrase option for high-security admins.

### D2: Server-side PIN rate limiting vs client-only

**Chosen:** Client-side lockout in Stronghold (Phase B7) — no server involvement.
**Alternative:** Server-issued nonce required for each PIN attempt; server tracks attempts.
**Tradeoff:** Server-side rate limiting is stronger (attacker cannot bypass by modifying client state), but introduces a network dependency for unlocking the app. For crisis response (might be offline/poor connectivity), client-side with hardware-backed storage (Stronghold/Keychain/Keystore) is more appropriate. A seized device with Stronghold access still requires brute-forcing the Stronghold passphrase.

### D3: Hub key decrypt in Rust vs keeping in JS

**Chosen:** Move to Rust CryptoState (Phase D1).
**Alternative:** Keep in JS with aggressive memory scrubbing.
**Tradeoff:** Moving to Rust adds IPC overhead per event (~0.1ms per call). With typical event rates (1-10/sec during active calls), this is negligible. The security gain (hub key never in JS memory) outweighs the minimal performance cost. Mobile (UniFFI) already has this pattern for device keys.

### D4: Cover traffic (dummy events)

**Chosen:** Defer to post-launch. Not included in this plan.
**Alternative:** Implement constant-rate publishing during quiet periods.
**Tradeoff:** Cover traffic is the strongest metadata protection but adds bandwidth cost, complexity, and client-side filtering. For pre-production, fixing the critical architectural issues (per-hub keys, pubkey verification, write policy) provides 10x more security value per engineering hour.

### D5: Minimum PIN length — 8 vs 10 digits

**Chosen:** 8-digit minimum (27 bits + 600K PBKDF2 ≈ weeks to brute-force on GPU).
**Alternative:** 10-digit minimum (33 bits — years to brute-force).
**Tradeoff:** 8 digits is the NIST-recommended minimum for online banking PINs. Combined with 600K iterations, offline brute-force requires ~$10K-50K of GPU time. For our threat model (device seizure by well-funded adversary), 8 digits is adequate for the "quick unlock" use case. Users who want more security should use the alphanumeric passphrase option (Phase B).

### D6: Remove ECIES legacy code vs keep read-only

**Chosen:** Keep legacy ECIES for decryption of existing test data; no new ECIES operations.
**Alternative:** Remove entirely (CRIT-C2 from audit recommended this).
**Tradeoff:** We're pre-production with no real user data, so removal is safe. However, test fixtures and seed data may use ECIES envelopes. Keep `encryption_legacy.rs` and `ecies.rs` in read-only mode (no `wrap` functions exported) until all test data is migrated to HPKE envelopes.

---

## Priority Sequencing

```
Phase A (Quick Wins)          ←── START HERE (1-2 weeks)
  ├── A1-A3: Relay + supply chain (P0 — blocks production)
  ├── A4-A6: Auth + CSP (P0)
  └── A7-A12: Cleanup (P1)

Phase B (PIN/Passphrase)      ←── After Phase A (1 week)
  └── B1-B9: All PIN work is one atomic delivery

Phase C (Metadata Reduction)  ←── After Phase B (1 week)
  └── C1-C7: Per-hub keys + audit cleanup

Phase D (Transport Privacy)   ←── Can start in parallel with Phase C
  └── D1-D6: Rust decrypt + padding + Signal-first

Phase E (Crypto Erasure)      ←── After C+D (2 days)
  └── E1-E5: Verification + retention enforcement
```

Total estimated calendar time: **4-5 weeks** (with parallel work on C+D).

---

## References

- `docs/security/SECURITY_AUDIT_2026-03-21.md` — 58-finding audit
- `docs/security/SECURITY_AUDIT_2026-02-R6.md` — R6 audit (historical)
- `docs/superpowers/specs/2026-05-03-nostr-security-hardening.md` — Nostr relay security
- `docs/security/CRYPTO_ARCHITECTURE.md` — Current crypto primitives
- `docs/security/THREAT_MODEL.md` — Adversary profiles
- `docs/security/KEY_REVOCATION_RUNBOOK.md` — Operational key management
- `packages/crypto/src/device_keys.rs` — PIN validation and key encryption
- `packages/crypto/Cargo.toml` — Dependencies (no Argon2id yet)
- `apps/desktop/src/crypto.rs` — PIN lockout counter (in-memory + plain JSON)
