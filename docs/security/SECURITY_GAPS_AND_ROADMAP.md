# Security Gaps and Improvement Roadmap

**Version:** 1.0
**Date:** 2026-05-11
**Status:** Living document — updated as gaps are closed and new ones identified

This document provides an honest inventory of known security gaps, incomplete implementations, and planned improvements in the Llamenos platform. It is intended for security auditors, cryptographers, and developers to understand what is fully implemented versus what remains work-in-progress.

**Related Documents**:
- [Security Overview](README.md) — Entry point for security auditors
- [Crypto Architecture](CRYPTO_ARCHITECTURE.md) — Cryptographic primitives and key hierarchy
- [Threat Model](THREAT_MODEL.md) — Adversary profiles and trust boundaries

---

## Summary

| Category | Count | Severity Distribution |
|----------|-------|----------------------|
| Documentation/Implementation Mismatches | 6 | 2 Medium, 4 Low |
| Incomplete Implementations | 4 | 1 Medium, 3 Low |
| Code TODOs (Security-Critical) | 3 | 2 Medium, 1 Low |
| iOS Debug Code in Production Paths | 1 | Medium |
| **Total** | **14** | |

---

## 1. Documentation/Implementation Mismatches

These are cases where the documentation claims something that the implementation does not fully support.

### 1.1 Domain Separation Label Count (MEDIUM)

**Claim:** "57 domain separation labels" (README.md, CRYPTO_ARCHITECTURE.md)

**Reality:** `packages/protocol/crypto-labels.json` contains **69 labels**. The Rust `LABEL_REGISTRY` in `packages/crypto/src/labels.rs` only has **57 entries** (indices 0-56).

**Impact:** Labels like `LABEL_WS_CHALLENGE`, `LABEL_SERVER_SIGNING_KEY`, `LABEL_SERVER_EVENT_ENCRYPTION_KEY`, `LABEL_HUB_EVENT_EPOCH`, etc. exist in the JSON source of truth and are used in TypeScript backend code, but **cannot be used in HPKE envelopes from Rust** because they lack registry IDs.

**Fix:** Add the 12 missing labels to `packages/crypto/src/labels.rs` `LABEL_REGISTRY` with stable indices 57-68. Update all documentation to state "69 domain separation labels."

**Files:**
- `packages/protocol/crypto-labels.json` (source of truth, 69 labels)
- `packages/crypto/src/labels.rs` (registry has 57)
- `docs/security/README.md` (claims 57)
- `docs/security/CRYPTO_ARCHITECTURE.md` (claims 57)

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

### 1.5 WebAuthn Enforcement Settings (LOW)

**Claim:** WebAuthn settings (`requireForAdmins`, `requireForUsers`) exist in the system.

**Reality:** Settings are stored in `systemSettings` table and retrievable via API, but **enforcement logic is not visibly wired into the authentication middleware**. The `authenticateRequest` function in `apps/worker/lib/auth.ts` tries session token first, then Ed25519 fallback — no visible check for WebAuthn requirement based on user role.

**Impact:** WebAuthn can be configured but may not be enforced.

**Fix:** Add WebAuthn requirement checks to auth middleware or login flow.

**Files:**
- `apps/worker/lib/auth.ts` (no WebAuthn enforcement)
- `apps/worker/routes/webauthn.ts` (settings stored)

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

### 2.3 Sigchain Server-Side Signature Validation (LOW)

**Status:** The backend enforces hash-chain continuity (sequence numbers, prevHash linkage) but **explicitly does NOT validate Ed25519 signatures** — "Signature validation is left to the client."

**Impact:** A malicious client could publish invalid sigchain entries that pass server validation but fail client-side verification.

**Files:**
- `apps/worker/services/crypto-keys.ts`

---

### 2.4 Audit Log Chain Verification (LOW)

**Status:** Audit logs use SHA-256 hash chaining with `previousEntryHash` → `entryHash` linkage. However, there is **no visible API endpoint or tool for clients to verify the full chain integrity**.

**Impact:** Tamper detection exists at the DB level but cannot be independently verified by clients or external auditors.

**Fix:** Add a chain verification endpoint or export tool.

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

### 3.3 Client Signal Notification — ECIES Wiring (LOW)

**Location:** `src/client/components/signal-notification-section.tsx:66`

**TODO:** "wire into ECIES encrypt via platform.ts in the full implementation"

**Impact:** Signal notification encryption may not be fully wired into the desktop client.

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

### Immediate (Next Sprint)
1. Fix crypto-label registry drift (add 12 missing labels to Rust)
2. Verify iOS DEBUG blocks are excluded from production builds
3. Replace Android placeholder certificate pins
4. Clarify Stronghold vs. Store in documentation

### Short-Term (Next Month)
5. Implement WebAuthn enforcement in auth middleware
6. Add audit log chain verification endpoint
7. Wire iOS WakeKeyService X25519 migration
8. Document 3-tier envelope status (notes vs. cases)

### Medium-Term (Next Quarter)
9. Implement SFrame media frame encryption
10. Migrate device key storage to Stronghold (or update docs)
11. Add sigchain server-side signature validation
12. Remove legacy ECIES modules (after migration complete)

### Long-Term (Ongoing)
13. Traffic analysis resistance (dummy traffic)
14. External audit log anchoring
15. Nostr security hardening implementation

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
| 2026-05-11 | 1.0 | Initial inventory: 14 gaps across 5 categories, with severity, impact, and recommended fixes |
