# nsec / Legacy Key Audit — 2026-05-31

**Branch**: `research-nsec-audit`
**Auditor**: Claude (automated comprehensive grep + manual classification)
**Scope**: All platforms — backend, desktop, iOS, Android, crypto crate, protocol, tests, docs

## Context

The architecture migrated from single-user nsec (Nostr-style secp256k1 private key, bech32-encoded) to per-device Ed25519/X25519 keys authorized via sigchain. CLAUDE.md states: *"Per-device keys, not nsec: Users have Ed25519/X25519 device keys authorized via sigchain. nsec is no longer the identity primitive."*

This audit identifies all remaining nsec/legacy references and classifies each.

---

## CRITICAL Findings

### C1: `agent-identity.ts` uses secp256k1 Schnorr for firehose agent keypairs
- **File**: `apps/worker/lib/agent-identity.ts:9,29-30`
- **Classification**: NEEDS_MIGRATION
- **Risk**: CRITICAL
- **Detail**: `generateAgentKeypair()` imports `schnorr` from `@noble/curves/secp256k1.js` and generates secp256k1 keypairs for firehose inference agents. The entire agent identity system (generate, seal, unseal) uses secp256k1 — the old curve. This is **active production code**, not legacy.
- **Impact**: Agent signing keys are secp256k1 while all other signing in the system uses Ed25519. This creates a cryptographic inconsistency and means the agent identity module cannot use the Rust crypto crate.
- **Recommended action**: Migrate to Ed25519 keypairs using `@llamenos/crypto/ffi` or the Rust FFI. Update `generateAgentKeypair()`, `unsealAgentNsec()`, and all callers.
- **Related files**:
  - `apps/worker/services/firehose-agent.ts:51,126-132,167,181-182,223,259,265` — consumes nsec bytes
  - `apps/worker/services/firehose.ts:29,42,80,161,166` — stores `encryptedAgentNsec` in DB
  - `apps/worker/__tests__/unit/agent-identity.test.ts:9,18-19,55-63` — tests secp256k1 keypair generation
  - `apps/worker/__tests__/unit/firehose-agent.test.ts:105` — test fixture with `encryptedAgentNsec`

### C2: `provisioning.rs` transfers signing seed as bech32 nsec
- **File**: `packages/crypto/src/provisioning.rs:40-41,100,122-123,167,218,248-249`
- **Classification**: NEEDS_MIGRATION
- **Risk**: CRITICAL
- **Detail**: The device provisioning module wraps the signing seed as a bech32-encoded `nsec1...` string before encrypting it for transfer. The `DecryptionResult` struct has a field named `nsec: Zeroizing<String>`. The receiving side (`apps/desktop/src/crypto.rs:1216-1228`) decodes the bech32 nsec and checks for the `"nsec"` HRP.
- **Impact**: This is a vestigial wire format from the Nostr era. While the data is encrypted in transit (AES-256-GCM), using bech32 nsec encoding for what is now an Ed25519 signing seed is misleading and adds unnecessary complexity (bech32 dependency in Cargo.toml).
- **Recommended action**: Transfer the raw signing seed bytes (hex-encoded) instead of bech32 nsec. Rename `encrypt_nsec_for_provisioning` → `encrypt_signing_seed_for_provisioning`, `decrypt_provisioned_nsec` → `decrypt_provisioned_signing_seed`. Remove bech32 dependency from `packages/crypto/Cargo.toml:70` and `apps/desktop/Cargo.toml:39`.

### C3: `recovery_group_generate_keypair` returns `privateKeyHex` to webview
- **File**: `apps/desktop/src/crypto.rs:817-827`
- **Classification**: NEEDS_MIGRATION
- **Risk**: CRITICAL (security finding — matches H16 from prior audit)
- **Detail**: The IPC command `recovery_group_generate_keypair` returns `privateKeyHex` directly to the JavaScript webview. The fix (`recovery_group_create` at line 835) exists but the old command is still registered in `lib.rs:185`.
- **Recommended action**: Remove `recovery_group_generate_keypair` from `generate_handler![]` in `lib.rs:185`. Keep `recovery_group_create` (the safe replacement).

---

## HIGH Findings

### H1: Desktop `legacy_import_nsec` IPC command still registered
- **File**: `apps/desktop/src/crypto.rs:994-1004`, `apps/desktop/src/lib.rs:192`
- **Classification**: DEAD_CODE (attack surface)
- **Risk**: HIGH
- **Detail**: `legacy_import_nsec` is registered as a Tauri IPC command. It's a thin wrapper around `device_import_and_load`. While functionally equivalent, keeping a command named "nsec" in the handler list is confusing and expands the attack surface with a redundant entry point.
- **Recommended action**: Remove `legacy_import_nsec` from `generate_handler![]`. If backward compatibility is needed, keep only `device_import_and_load`.

### H2: Desktop frontend exposes "nsec" terminology to users
- **File**: `src/client/routes/users.tsx:50,95-116` — `generatedNsec` state, `volunteer-nsec-code` testid, `dismiss-nsec` testid
- **File**: `src/client/routes/login.tsx:50-51,56,99-110,486-517` — nsec input field, `nsec-input` testid, `nsec-pin` id
- **File**: `src/client/routes/onboarding.tsx:47,133,138,143,156,328` — comments reference nsec
- **File**: `src/client/routes/link-device.tsx:38-39,63,67,70,93,99,125-165` — `encryptedNsecData` state
- **Classification**: NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: The desktop frontend UI still uses "nsec" terminology in variable names, test IDs, and comments. While `onboarding.tsx` correctly avoids putting the nsec in JS state, the naming creates confusion. The login flow (`login.tsx:506`) uses `data-testid="nsec-input"` — users see "Secret key" but the internal naming is still nsec.
- **Recommended action**: Rename all `nsec` references to `seed`/`signingKey`/`secretKey` in UI code. Update test IDs from `nsec-input` → `seed-input`, `volunteer-nsec-code` → `volunteer-seed-code`, `dismiss-nsec` → `dismiss-seed-dialog`.

### H3: `auth.tsx` exports `hasNsec` boolean
- **File**: `src/client/lib/auth.tsx:54,556`
- **Classification**: NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: The auth context exports `hasNsec: boolean` (mapped from `state.isKeyUnlocked`). This is consumed extensively across the app: `cases.tsx`, `notes.tsx`, `reports.tsx`, `conversations.tsx`, `index.tsx`.
- **Recommended action**: Rename `hasNsec` → `isKeyUnlocked` or `hasCryptoAccess` across all consumers.

### H4: iOS Help view explains "nsec" to users
- **File**: `apps/ios/Sources/Views/Help/HelpView.swift:104,167-168`
- **Classification**: NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: Help text says "Your secret key (nsec) never leaves your device" and has an FAQ "What is an nsec?" These are user-facing strings that teach users Nostr-specific terminology that no longer applies.
- **Recommended action**: Update help text to reference "device key" or "secret key" without Nostr-specific terminology. Update i18n strings.

### H5: Android `AdminModels.kt` has `nsec` field in `CreateVolunteerResponse`
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/model/AdminModels.kt:85,91`
- **Classification**: NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: `CreateVolunteerResponse` data class has `val nsec: String`. This is consumed by `AdminViewModel.kt:501` which stores it as `createdVolunteerNsec`.
- **Recommended action**: Rename to `seedHex` to match the actual content (Ed25519 signing seed).

### H6: Android UI uses `nsec` extensively in component naming
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminViewModel.kt:91,482,489-490,501`
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/Navigation.kt:98,103,495`
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/SecureText.kt:21,29-30`
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/settings/DeviceLinkViewModel.kt:212`
- **Classification**: NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: Android UI code references nsec in state names (`createdVolunteerNsec`), navigation comments ("Display generated nsec"), and component docs ("displays sensitive text like nsec").
- **Recommended action**: Rename to `seed`/`signingKey` terminology throughout Android UI.

### H7: `platform.ts` exports legacy nsec functions
- **File**: `src/client/lib/platform.ts:141-150,713-775,1113,1118,1129`
- **Classification**: DEAD_CODE / NEEDS_MIGRATION
- **Risk**: HIGH
- **Detail**: `legacyImportNsec()` (line 141) is an active wrapper for `legacy_import_nsec` IPC. Lines 713-775 contain deprecated `KeyPair` type with `nsec` field and deprecated `importKeyToState` function. Line 1113 constructs a result with `nsec: result.seedHex`.
- **Recommended action**: Remove deprecated types/functions. Rename `legacyImportNsec` if it must stay.

---

## MEDIUM Findings

### M1: Test mock (`tests/mocks/tauri-core.ts`) implements full nsec/bech32/ECIES mock layer
- **File**: `tests/mocks/tauri-core.ts:17,91-93,432-433,461-462,791-819,1130-1221`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: The Playwright test mock maintains a full secp256k1/nsec/bech32 mock implementation including `legacy_import_nsec`, `nsecEncode`/`nsecDecode`, `eciesWrap`, and a `keyType` discriminator for secp256k1 vs ed25519. This is necessary to test the legacy import path but is a significant maintenance burden.
- **Recommended action**: After removing `legacy_import_nsec` IPC command (H1), simplify the mock to Ed25519-only. Remove secp256k1/bech32/ECIES mock code.

### M2: Deploy docker test helpers use nsec
- **File**: `deploy/docker/tests/helpers.ts:4,31,44-52`
- **File**: `deploy/docker/tests/test-ids.ts:7,113`
- **File**: `deploy/docker/tests/mocks/tauri-core.ts:26-33,49-50,73,77-90,129-130`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: Docker deploy tests use hardcoded `ADMIN_NSEC` bech32 key and test flows that reference nsec input/dismiss.
- **Recommended action**: Migrate to Ed25519 seed hex. Update test IDs.

### M3: Desktop E2E test helpers reference nsec
- **File**: `tests/api-helpers.ts:31,54-57,278,304` — `ADMIN_NSEC` alias, `nsec` field in helper types
- **File**: `tests/helpers.ts:397,421` — comments about nsec
- **File**: `tests/smoke.spec.ts:2,24-34` — nsec input visibility tests
- **File**: `tests/debug-login.mjs:30-38` — uses `pubkeyFromNsec`, `encryptWithPin` with nsec
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: Desktop E2E test infrastructure uses nsec naming. `ADMIN_NSEC` is actually just an alias for `ADMIN_SEED`.
- **Recommended action**: Rename `ADMIN_NSEC` → `ADMIN_SEED` everywhere. Update test step definitions.

### M4: BDD step definitions use nsec terminology
- **File**: `tests/steps/auth/login-steps.ts:8,20-51,66` — "nsec import input field", "nsec field"
- **File**: `tests/steps/auth/onboarding-steps.ts:10-37` — "generated nsec", nsec display assertions
- **File**: `tests/steps/auth/key-import-steps.ts:25-37` — "nsec field"
- **File**: `tests/steps/auth/pin-steps.ts:22` — "confirmed my nsec backup"
- **File**: `tests/steps/auth/user-steps.ts:13-14` — `createUserAndGetNsec`, `dismissNsecCard`
- **File**: `tests/steps/crypto/crypto-steps.ts:49-146` — nsec/npub format assertions
- **File**: `tests/steps/dashboard/dashboard-steps.ts:62` — nsec comment
- **File**: `tests/steps/settings/key-backup-steps.ts:19` — nsec in regex
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: BDD step definitions reference nsec extensively. The Gherkin feature files likely use "nsec" in scenario descriptions too.
- **Recommended action**: Rename to "signing seed" / "secret key" in step definitions and Gherkin features.

### M5: Android E2E test steps use nsec
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/crypto/CryptoSteps.kt:31,74-76,92-93,120-122,151-153,160-162,411,424,538-539`
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/auth/LoginSteps.kt:31-33,73-74,83-89,150-157,173-177`
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/auth/UserSteps.kt:27-29,87-92,131-139`
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/common/GenericSteps.kt:129,482-489,532-534`
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/admin/UserDetailSteps.kt:34-35`
- **File**: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/crypto/TestVectors.kt:35,46`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: Android Cucumber BDD steps have nsec in step names, test IDs (`nsec-input`, `nsec-display-dialog`, `dismiss-nsec-dialog`), and comments.
- **Recommended action**: Update step definitions and test tags after renaming Android UI components.

### M6: `packages/crypto/src/errors.rs` has `InvalidNsec` error variant
- **File**: `packages/crypto/src/errors.rs:42-43`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: `CryptoError::InvalidNsec` error variant with message "Invalid nsec bech32 encoding". Used in provisioning (which encodes as nsec bech32). Also propagated to Android UniFFI (`llamenos_core.kt:2611,2655,2720`).
- **Recommended action**: After C2 (removing bech32 from provisioning), this error variant can be removed or renamed to `InvalidSigningSeed`.

### M7: `packages/crypto/src/encryption.rs` test uses nsec strings
- **File**: `packages/crypto/src/encryption.rs:588-617,807`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: PIN encryption tests use `"nsec1test..."` as test payloads. The encrypt_with_pin function accepts arbitrary strings, so these are just test data.
- **Recommended action**: Replace test strings with `"test-signing-seed-..."` for clarity.

### M8: Live/staging test helpers use nip19 and nsec
- **File**: `tests/live/helpers.ts:6,8,27,41,56-59,80,83,86`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: Live staging tests import `nip19` from `@llamenos/crypto/ffi` and use `STAGING_ADMIN_NSEC` env var. The `preloadEncryptedKey` function decodes nsec via nip19.
- **Recommended action**: Migrate to Ed25519 seed hex. Remove nip19 dependency.

### M9: Desktop E2E crypto spec tests nsec format
- **File**: `tests/desktop/specs/crypto.wdio.ts:48,52,63,68-77,125-147`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: WebdriverIO desktop crypto tests validate `kp.nsec` field, test `is_valid_nsec` command, and test `key_pair_from_nsec` command.
- **Recommended action**: Update to test Ed25519 device key generation. Remove nsec-specific assertions.

### M10: iOS components use nsec in accessibility IDs
- **File**: `apps/ios/Sources/Views/Components/SecureTextField.swift:5-6,11,32-36,75-76`
- **File**: `apps/ios/Sources/Views/Settings/DeviceLinkView.swift:8,15`
- **File**: `apps/ios/Sources/Services/AuthService.swift:102`
- **File**: `apps/ios/Sources/ViewModels/AuthViewModel.swift:6,21,23,51`
- **File**: `apps/ios/Sources/ViewModels/DeviceLinkViewModel.swift:14,24,308,347`
- **File**: `apps/ios/Sources/App/AppState.swift:11,324`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: iOS Swift code uses "nsec" in comments, accessibility identifiers (`nsec-display`, `nsec_display_label`), and state descriptions.
- **Recommended action**: Update accessibility identifiers and comments to use "signing key" / "device key" terminology.

### M11: iOS `WakeKeyService` references ECIES
- **File**: `apps/ios/Sources/Services/WakeKeyService.swift:48,241,260`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: WakeKeyService has comments about "legacy ECIES path" and mentions secp256k1 in comments. Line 260 comment says `get_public_key` uses x25519_dalek (correct), but line 241 mentions falling back to "legacy ECIES path".
- **Recommended action**: Update comments to reflect current HPKE-only state.

### M12: iOS `CryptoService` has "legacy secp256k1" section
- **File**: `apps/ios/Sources/Services/CryptoService.swift:363`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: CryptoService has a MARK section labeled "Device Linking ECDH (legacy secp256k1)".
- **Recommended action**: Investigate if this is active code or just a comment. Update or remove.

### M13: Android `WakeKeyService` references secp256k1/ECIES
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt:45,47,50,246`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: Comments reference "generates a secp256k1 keypair" (line 45) and "Legacy ECIES path removed" (line 246). Line 47 mentions "HPKE (or legacy ECIES)".
- **Recommended action**: Update comments to reflect current HPKE-only state.

### M14: Android `CryptoService` has secp256k1 device linking method
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt:733`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: Comment says "Generate an ephemeral secp256k1 keypair for device linking ECDH."
- **Recommended action**: Verify whether this actually uses secp256k1 or if the comment is stale. Update accordingly.

### M15: Worker auth test uses secp256k1 Schnorr
- **File**: `apps/worker/lib/auth.test.ts:10,31-32,53`
- **Classification**: TEST_ONLY
- **Risk**: MEDIUM
- **Detail**: Auth test imports `schnorr` from secp256k1 to generate test keypairs and signatures. The actual `auth.ts` uses `ed25519Verify`. This means the test is testing Schnorr verification (legacy) not Ed25519 verification (current).
- **Recommended action**: **This is a test correctness issue.** The test should generate Ed25519 keys and use `ed25519Sign` to create test tokens, matching the actual auth flow.

### M16: `backup.ts` client lib uses nsec terminology
- **File**: `src/client/lib/backup.ts:37-38,156,164,169,191,200`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: Backup format comments reference "PIN-encrypted nsec" and "recovery-key-encrypted nsec". Functions accept/return nsec strings.
- **Recommended action**: Rename parameters and comments to reference "signing seed".

### M17: `demo-nsec-data.ts` and `demo-accounts.ts` use nsec naming
- **File**: `src/client/lib/demo-nsec-data.ts:24`
- **File**: `src/client/lib/demo-accounts.ts:12,24,31,36`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: `DEMO_NSECS` is an alias for `DEMO_SEEDS`. `getDemoNsec` aliases `getDemoSeed`. `getDemoAccountsWithNsec` aliases `getDemoAccountsWithSeed`.
- **Recommended action**: Remove the nsec aliases. Use only the seed-based names.

### M18: Worker `identity.ts` provisioning uses `encryptedNsec`
- **File**: `apps/worker/services/identity.ts:1253,1265,1275,1303,1325`
- **Classification**: NEEDS_MIGRATION
- **Risk**: MEDIUM
- **Detail**: Identity service provisioning room management uses `encryptedNsec` field name.
- **Recommended action**: Rename to `encryptedSigningSeed` or `encryptedDeviceKeys`.

---

## LOW Findings

### L1: `packages/crypto/src/labels.rs` — Nostr labels and ECIES tombstone
- **File**: `packages/crypto/src/labels.rs:112-116,212-232,357,399-400,438,443,447-448`
- **Classification**: FALSE_POSITIVE
- **Risk**: LOW
- **Detail**: Labels like `LABEL_SERVER_NOSTR_KEY`, `NOSTR_EVENT_TAG`, `LABEL_SERVER_NOSTR_SIGNING_KEY` are active domain separation constants used for the WebSocket relay protocol (which was historically "Nostr relay" but is now a custom protocol). The ECIES tombstone at index 53 is correct — it preserves registry stability. These are NOT nsec/legacy key issues.
- **Recommended action**: No change needed. The "Nostr" naming in labels is a protocol naming choice, not a key architecture issue.

### L2: `apps/worker/lib/logger.ts` redacts nsec patterns
- **File**: `apps/worker/lib/logger.ts:148,152,160`
- **Classification**: FALSE_POSITIVE
- **Risk**: LOW
- **Detail**: Logger has `NSEC_RE = /nsec1[0-9a-z]{58}/g` for redacting nsec strings from logs. This is a defense-in-depth measure.
- **Recommended action**: Keep — redaction patterns should be broader, not narrower.

### L3: Worker `openapi/config.ts` references "Nostr session token"
- **File**: `apps/worker/openapi/config.ts:45`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: OpenAPI description says "Nostr session token (JSON with pubkey, timestamp, token signed via BIP-340 Schnorr)". This is inaccurate — auth now uses Ed25519.
- **Recommended action**: Update description to "Ed25519 session token".

### L4: `apps/worker/routes/dev.ts` references npub1 bech32
- **File**: `apps/worker/routes/dev.ts:11`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: Comment says "npub1 bech32 encoding is no longer supported" — correct documentation of the change.
- **Recommended action**: No change needed.

### L5: iOS UniFFI bindings contain nsec references
- **File**: `packages/crypto/bindings/swift/LlamenosCore.swift:591,612,955,967,971,985,988,1447,1531,1562,1582`
- **Classification**: FALSE_POSITIVE (generated code)
- **Risk**: LOW
- **Detail**: These are UniFFI-generated Swift bindings reflecting the Rust source types. They'll update automatically when the Rust source is updated.
- **Recommended action**: Fix Rust source (C2, M6); bindings will regenerate.

### L6: Android UniFFI bindings contain `InvalidNsec`
- **File**: `apps/android/app/src/main/java/org/llamenos/core/llamenos_core.kt:2611,2655,2720`
- **Classification**: FALSE_POSITIVE (generated code)
- **Risk**: LOW
- **Detail**: UniFFI-generated. Will update when Rust `CryptoError::InvalidNsec` is renamed (M6).
- **Recommended action**: Fix Rust source (M6); bindings will regenerate.

### L7: `ApiService.kt` references ECIES in comment
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:348`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: Comment says "Returns HubKeyEnvelopeResponse wrapping the ECIES envelope fields." Should say HPKE.
- **Recommended action**: Update comment.

### L8: `scripts/check-ecies-active.sh` — CI guard script
- **File**: `scripts/check-ecies-active.sh:10,54`
- **Classification**: FALSE_POSITIVE
- **Risk**: LOW
- **Detail**: This script detects active ECIES usage in protocol docs — it's a guard against regression.
- **Recommended action**: Keep. This is defensive tooling.

### L9: Extensive documentation references (COMPLETED_BACKLOG, epics, specs, plans, protocol docs)
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: ~200+ references across `docs/`, `CHANGELOG.md`, epic docs, superpowers specs/plans. These document the migration history and are valuable context.
- **Recommended action**: No changes needed for historical docs. Active protocol docs (`PROTOCOL.md`) have a separate epic for updating (Epic H — protocol drift).

### L10: `NoteModels.kt` references ECIES in comment
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/model/NoteModels.kt:36`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: Comment says "after ECIES unwrap" — should say "after HPKE unwrap".
- **Recommended action**: Update comment.

### L11: `PushService.kt` references nsec
- **File**: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:47`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: Comment says "when the volunteer's nsec is available" — should say "when the device key is unlocked".
- **Recommended action**: Update comment.

### L12: `provisioning.ts` client lib references nsec
- **File**: `src/client/lib/provisioning.ts:5,63,135,145`
- **Classification**: NEEDS_MIGRATION
- **Risk**: LOW
- **Detail**: Provisioning client code uses `encryptedNsec` field names and nsec comments.
- **Recommended action**: Rename after C2 (provisioning wire format change).

### L13: `key-manager.ts` and `webauthn.ts` comments reference nsec
- **File**: `src/client/lib/key-manager.ts:97,101,116`
- **File**: `src/client/lib/webauthn.ts:41`
- **Classification**: DOCUMENTATION
- **Risk**: LOW
- **Detail**: Comments reference nsec but the code itself uses the correct abstractions.
- **Recommended action**: Update comments.

### L14: `Caddyfile.production` matched on "nsec" substring
- **File**: `deploy/docker/Caddyfile.production:39,158`
- **Classification**: FALSE_POSITIVE
- **Risk**: LOW
- **Detail**: CSP header content — `'none'` contains "nsec" substring. Not related.
- **Recommended action**: No change.

---

## Summary

### By Risk Level

| Risk | Count |
|------|-------|
| CRITICAL | 3 |
| HIGH | 7 |
| MEDIUM | 18 |
| LOW | 14 |

### By Classification

| Classification | Count |
|---------------|-------|
| NEEDS_MIGRATION | 19 |
| TEST_ONLY | 8 |
| DEAD_CODE | 2 |
| DOCUMENTATION | 7 |
| FALSE_POSITIVE | 6 |

### By Platform

| Platform | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| `apps/worker/` (backend) | 1 (C1) | 0 | 3 (M15,M18,M3-partial) | 3 (L2,L3,L4) | 7 |
| `src/client/` (desktop frontend) | 0 | 3 (H2,H3,H7) | 4 (M3,M16,M17,M4) | 2 (L12,L13) | 9 |
| `apps/desktop/` (Tauri Rust) | 1 (C3) | 1 (H1) | 0 | 0 | 2 |
| `apps/ios/` | 0 | 1 (H4) | 3 (M10,M11,M12) | 1 (L5) | 5 |
| `apps/android/` | 0 | 2 (H5,H6) | 2 (M5,M13-M14) | 4 (L6,L7,L10,L11) | 8 |
| `packages/crypto/` | 1 (C2) | 0 | 2 (M6,M7) | 1 (L1) | 4 |
| `tests/` | 0 | 0 | 4 (M1,M2,M8,M9) | 0 | 4 |
| `docs/` | 0 | 0 | 0 | 2 (L8,L9) | 2 |
| `deploy/` | 0 | 0 | 1 (M2) | 1 (L14) | 2 |

### Priority Remediation Order

1. **C1**: Migrate agent-identity from secp256k1 to Ed25519 (security + consistency)
2. **C2**: Remove bech32 nsec wire format from provisioning (security simplification)
3. **C3**: Remove `recovery_group_generate_keypair` IPC command (key leak)
4. **H1**: Remove `legacy_import_nsec` IPC command (attack surface)
5. **M15**: Fix auth test to use Ed25519 (test correctness)
6. **H2-H7**: Rename nsec → seed/signingKey across all UI code (all platforms)
7. **M1-M9**: Update test infrastructure naming
8. **Remaining**: Comments and documentation updates
