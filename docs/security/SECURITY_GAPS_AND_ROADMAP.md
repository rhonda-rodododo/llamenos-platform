# Security Gaps and Improvement Roadmap

**Version:** 1.1
**Date:** 2026-05-12
**Status:** Living document — updated as gaps are closed and new ones identified

This document provides an honest inventory of known security gaps, incomplete implementations, and planned improvements in the Llamenos platform. It is intended for security auditors, cryptographers, and developers to understand what is fully implemented versus what remains work-in-progress.

**Related Documents**:
- [Security Overview](README.md) — Entry point for security auditors
- [Crypto Architecture](CRYPTO_ARCHITECTURE.md) — Cryptographic primitives and key hierarchy
- [Threat Model](THREAT_MODEL.md) — Adversary profiles and trust boundaries

---

## Summary

| Category | Count | Resolved | Open | Severity Distribution |
|----------|-------|----------|------|----------------------|
| Documentation/Implementation Mismatches | 6 | 2 | 4 | 1 Medium, 3 Low (1 Medium + 1 Low resolved) |
| Incomplete Implementations | 4 | 2 | 2 | 1 Medium, 1 Low (2 Low resolved) |
| Code TODOs (Security-Critical) | 3 | 1 | 2 | 2 Medium (1 Low resolved) |
| iOS Debug Code in Production Paths | 1 | 0 | 1 | Medium |
| **Total** | **14** | **5** | **9** | |

---

## 1. Documentation/Implementation Mismatches

These are cases where the documentation claims something that the implementation does not fully support.

### 1.1 Domain Separation Label Count — RESOLVED

**Status:** Resolved in PR #288 (fix/security-gaps-followup).

**Original issue:** `packages/protocol/crypto-labels.json` contained 69 labels but the Rust `LABEL_REGISTRY` in `packages/crypto/src/labels.rs` only had 57 entries (indices 0-56).

**Resolution:** All 12 missing labels were added to the Rust `LABEL_REGISTRY` with stable indices 57-68. The registry now has 69 entries matching the JSON source of truth. Additionally, a value collision was discovered and fixed: `LABEL_SERVER_NOSTR_KEY` and `LABEL_SERVER_SIGNING_KEY` had identical values (`llamenos:server:nostr-key`). `LABEL_SERVER_SIGNING_KEY` was corrected to `llamenos:server:signing-key` and its JSON Schema description updated.

**Files changed:**
- `packages/crypto/src/labels.rs` (registry now has 69 entries, indices 0-68)
- `packages/protocol/crypto-labels.json` (collision fixed for `LABEL_SERVER_SIGNING_KEY`)

---

### 1.2 Tauri Stronghold vs. Store (MEDIUM)

**Claim:** "Tauri Stronghold (encrypted vault)" for device key storage (README.md, THREAT_MODEL.md, CLAUDE.md)

**Reality:** The Tauri Stronghold plugin (`tauri-plugin-stronghold`) is **initialized** in `apps/desktop/src/lib.rs` with PBKDF2-SHA256 (600K iterations), but the **actual device key storage uses `tauri-plugin-store`** (`keys.json`). The `unlock_with_pin` command in `apps/desktop/src/crypto.rs` reads from `app_handle.store("keys.json")` and calls `store.delete("llamenos-encrypted-device-keys")` on wipe.

**Impact:** Security documentation overstates the storage hardening. Store plugin provides less protection than Stronghold.

**Fix Options:**
- (a) Migrate device key storage to Stronghold (preferred — aligns with documented architecture)
- (b) Update all documentation to reflect actual `tauri-plugin-store` usage

**Files:**
- `apps/desktop/src/lib.rs` (Stronghold initialized)
- `apps/desktop/src/crypto.rs` (uses Store plugin)
- `docs/security/README.md`
- `docs/security/THREAT_MODEL.md`

---

### 1.3 SFrame Voice E2EE (LOW)

**Claim:** "SFrame — voice E2EE key derivation" (README.md, CRYPTO_ARCHITECTURE.md)

**Reality:** SFrame **key derivation** is fully implemented (`derive_sframe_key`, `derive_sframe_base_key`, `derive_sframe_send_key` in `packages/crypto/src/sframe.rs`). However, **actual media frame encryption** (AES-128-CTR + HMAC-SHA256 per frame) is **not implemented**.

**Impact:** Voice E2EE is not end-to-end complete. The key derivation infrastructure exists but cannot actually encrypt/decrypt media frames.

**Fix:** Implement SFrame media frame encryption/decryption using the derived keys.

**Files:**
- `packages/crypto/src/sframe.rs` (key derivation only)

---

### 1.4 3-Tier Envelope Encryption (LOW)

**Claim:** Some documentation references summary/fields/pii tiers for entity encryption.

**Reality:** The 3-tier envelope model (`summary`/`fields`/`pii` recipients) exists in `apps/worker/lib/envelope-recipients.ts` and is designed for cases/entity schema. However, the **notes schema** only uses `authorEnvelope` + `adminEnvelopes`. The 3-tier model is **not wired to the note encryption flow**.

**Impact:** Notes use a simpler 2-envelope model. The 3-tier model may be used for CMS cases/entities but this is not clearly documented.

**Fix:** Clarify in documentation which data types use 2-envelope vs. 3-envelope encryption.

**Files:**
- `apps/worker/lib/envelope-recipients.ts` (3-tier model)
- `apps/worker/db/schema/records.ts` (notes use 2-envelope)

---

### 1.5 WebAuthn Enforcement Settings — RESOLVED

**Status:** Resolved in PR #288 (fix/security-gaps-followup).

**Original issue:** WebAuthn settings (`requireForAdmins`, `requireForUsers`) were stored but enforcement was not wired into the authentication middleware.

**Resolution:** Server-side enforcement was added to the auth middleware — users who have not registered a passkey now receive a 403 response with `X-WebAuthn-Required: true` header when WebAuthn is required for their role. Client-side redirect to passkey enrollment was also added.

---

### 1.6 Zero-Knowledge Server Claim (LOW — Caveat)

**Claim:** "Zero-knowledge server" — server cannot read notes, messages, transcriptions.

**Reality:** This is **mostly true** for notes/messages/files. However, the server DOES see:
- Call routing metadata (timestamps, durations, who answered)
- Caller phone hashes (HMAC-SHA256, reversible with HMAC secret)
- Contact metadata for ban lists
- Message plaintext momentarily during SMS/WhatsApp outbound send
- Server-encrypted credentials (telephony provider API keys)

**Impact:** The claim is accurate with caveats. "Zero-knowledge" should be qualified.

**Fix:** Update documentation to say "Zero-knowledge for note/message content" rather than unqualified "zero-knowledge server."

---

## 2. Incomplete Implementations

### 2.1 Legacy ECIES/secp256k1 Modules (LOW)

**Status:** Legacy modules retained for backward compatibility during Phase 6 migration.

**Files:**
- `packages/crypto/src/ecies.rs`
- `packages/crypto/src/encryption_legacy.rs`
- `packages/crypto/src/keys_legacy.rs`
- `packages/crypto/src/legacy.rs`
- `packages/crypto/src/nostr.rs`

**Plan:** Remove after all users have migrated to Ed25519/X25519 device keys. The `users` table still has `encryptedSecretKey` (legacy nsec) and `devices` table stores `ed25519Pubkey`/`x25519Pubkey` as optional fields.

---

### 2.2 MLS Client-Side Integration (LOW)

**Status:** MLS is fully implemented in `packages/crypto/src/mls.rs` (OpenMLS 0.8) and backend routes exist (`apps/worker/routes/mls.ts`). However, **actual client-side MLS integration** (automatic group creation on hub create, key package upload) is not fully visible in the audited code.

**Impact:** MLS infrastructure exists but may not be actively used for hub state management.

---

### 2.3 Sigchain Server-Side Signature Validation — RESOLVED

**Status:** Resolved in PR #288 (fix/security-gaps-followup).

**Original issue:** The backend enforced hash-chain continuity but did not validate Ed25519 signatures on sigchain entries.

**Resolution:** Ed25519 signature verification was added to the `appendSigchainLink` method. The server now validates that each sigchain entry's signature is correct before accepting it, preventing malicious clients from publishing invalid entries.

---

### 2.4 Audit Log Chain Verification — RESOLVED

**Status:** Resolved in PR #288 (fix/security-gaps-followup).

**Original issue:** Audit logs used SHA-256 hash chaining but no API endpoint existed for independent chain verification.

**Resolution:** A `GET /api/audit/verify` endpoint was added with a `verifyChain()` method that walks the full audit log chain and reports any integrity violations. Clients and external auditors can now independently verify tamper-evidence of the audit log.

---

## 3. Code TODOs (Security-Critical)

### 3.1 iOS WakeKeyService — X25519 Migration (MEDIUM)

**Location:** `apps/ios/Sources/Services/WakeKeyService.swift:264`

**TODO:** "Switch to X25519 key derivation when server sends HPKE envelopes"

**Impact:** iOS push notification wake keys may still use older key derivation until server supports HPKE envelopes for push.

---

### 3.2 Android Certificate Pins — Placeholder (MEDIUM)

**Location:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:66`

**TODO:** "Replace placeholder pins after first production deployment to app.llamenos.org"

**Impact:** Certificate pinning is scaffolding only. Mobile apps use standard TLS validation without pinning.

---

### 3.3 Client Signal Notification — ECIES Wiring — RESOLVED

**Status:** Resolved in PR #288 (fix/security-gaps-followup).

**Original issue:** Signal notification encryption had a TODO to "wire into ECIES encrypt via platform.ts."

**Resolution:** The ECIES TODO was replaced with HPKE encryption routed through `platform.ts`, consistent with the project-wide migration from ECIES to HPKE (RFC 9180).

---

## 4. iOS Debug Code in Production Paths (MEDIUM)

**Issue:** Extensive `#if DEBUG` blocks exist in security-critical iOS code paths. If these are accidentally compiled into production builds, they could:
- Inject mock identities into CryptoService
- Bypass decryption in WebSocketService
- Skip auth checks in auth views
- Disable panic wipe
- Show offline banners with debug info

**Files with `#if DEBUG` in security paths:**
- `apps/ios/Sources/Services/CryptoService.swift`
- `apps/ios/Sources/Services/WebSocketService.swift`
- `apps/ios/Sources/Views/Auth/AuthView.swift`
- `apps/ios/Sources/Views/Auth/PanicWipeView.swift`
- `apps/ios/Sources/Views/Components/OfflineBanner.swift`
- `apps/ios/Sources/Views/Components/PINPadView.swift`
- `apps/ios/Sources/Views/Components/UpdateBanner.swift`
- `apps/ios/Sources/Views/Components/BiometricPromptView.swift`
- `apps/ios/Sources/Views/Auth/PINUnlockView.swift`
- `apps/ios/Sources/Views/Auth/PINSetView.swift`
- `apps/ios/Sources/Views/Auth/LoginView.swift`

**Mitigation:** Ensure DEBUG blocks are never compiled into production (standard Xcode behavior, but verify CI/CD build configurations).

---

## 5. Planned Improvements (from Specs)

### 5.1 Nostr Security Hardening

**Spec:** `docs/superpowers/specs/2026-05-03-nostr-security-hardening.md`

**Status:** Spec exists but implementation status is unclear. Nostr integration may be planned but not yet active.

**Planned:**
- NIP-01/NIP-42 event signing with domain separation
- Nostr key derivation from server secret
- Event encryption with per-hub keys

---

### 5.2 Security Hardening Plan

**Spec:** `docs/superpowers/specs/2026-05-03-security-hardening-plan.md`

**Planned improvements:**
- Traffic analysis resistance (dummy traffic)
- Forward secrecy for hub events (beyond epoch rotation)
- Metadata padding for API payloads
- Rate limiting enhancements
- Audit log integrity verification
- Supply chain verification improvements

---

### 5.3 Security Gaps Feasibility Study

**Spec:** `docs/superpowers/specs/2026-05-03-security-gaps-feasibility.md`

**Acknowledged gaps:**
1. Traffic analysis resistance (full) — no dummy traffic
2. Forward secrecy for hub events — epoch rotation only
3. Metadata padding — API payloads not padded
4. Rate limiting — basic per-IP only
5. Audit log integrity — no external anchoring
6. Supply chain verification — reproducible builds exist but not mandatory

---

## 6. Historical Audit Findings (Still Relevant)

### 6.1 Security Audit 2026-03-21 (58 findings)

**Status:** Historical document marked as point-in-time snapshot.

**Potentially still relevant findings** (require verification):
- Certificate pinning scaffolding (not yet active)
- iOS/Android debug code paths
- WebAuthn enforcement wiring
- SFrame media encryption completeness

**No longer relevant** (addressed in current architecture):
- ECIES replaced with HPKE
- PBKDF2 replaced with Argon2id
- Per-device keys replace nsec
- Cloudflare Workers references removed

---

## 7. Recommended Priority Order

### Completed (PR #288)
- ~~Fix crypto-label registry drift (add 12 missing labels to Rust)~~ — RESOLVED: all 69 labels registered; label collision fixed
- ~~Implement WebAuthn enforcement in auth middleware~~ — RESOLVED: server-side 403 + client redirect
- ~~Add audit log chain verification endpoint~~ — RESOLVED: `GET /api/audit/verify`
- ~~Add sigchain server-side signature validation~~ — RESOLVED: Ed25519 verification in `appendSigchainLink`
- ~~Wire Signal notification HPKE encryption~~ — RESOLVED: ECIES TODO replaced with HPKE via platform.ts

### Immediate (Next Sprint)
1. Verify iOS DEBUG blocks are excluded from production builds
2. Replace Android placeholder certificate pins
3. Clarify Stronghold vs. Store in documentation

### Short-Term (Next Month)
4. Wire iOS WakeKeyService X25519 migration
5. Document 3-tier envelope status (notes vs. cases)

### Medium-Term (Next Quarter)
6. Implement SFrame media frame encryption
7. Migrate device key storage to Stronghold (or update docs)
8. Remove legacy ECIES modules (after migration complete)

### Long-Term (Ongoing)
9. Traffic analysis resistance (dummy traffic)
10. External audit log anchoring
11. Nostr security hardening implementation

---

## 8. Verification Checklist

For each gap, verify closure with:

- [ ] Code change merged to main
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Manual verification performed
- [ ] Security review completed

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-12 | 1.1 | Marked 5 gaps as RESOLVED per PR #288: domain separation label count (1.1), WebAuthn enforcement (1.5), sigchain server-side validation (2.3), audit log chain verification (2.4), Signal notification HPKE wiring (3.3). Noted label collision fix (LABEL_SERVER_NOSTR_KEY / LABEL_SERVER_SIGNING_KEY). Updated summary counts and priority order. |
| 2026-05-11 | 1.0 | Initial inventory: 14 gaps across 5 categories, with severity, impact, and recommended fixes |
