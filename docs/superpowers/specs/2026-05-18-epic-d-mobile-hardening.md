# Spec: Epic D — Mobile Platform Hardening

**Date:** 2026-05-18
**Status:** Specced — plan pending

## Overview

This epic closes the remaining security gaps identified in the 2026-05-18 security audit for the iOS and Android platforms. It is scoped to five independent workstreams that can be implemented in parallel across platforms.

Security audit reference: 197+ findings processed into 9 fix epics (A–I). This is Epic D (mobile hardening), covering C05, H25, H29, H30, H31, H33, MOB-02, and two gap items (3.1, 4.0).

---

## Strategic Decision: Certificate Pinning (User-Confirmed 2026-05-18)

- **Hard fail** on pin mismatch — connection refused, no fallback to system CA.
- Rapid pin rotation: backup pins pre-loaded, pin update mechanism via signed config endpoint.
- Monitoring: pin failure events reported to admin dashboard (not to external service).
- Pre-deployment: extract SPKI hashes from actual production certs before enabling.
- No soft-fail rollout period. Ship hard or don't ship.

---

## Phase 1: Certificate Pinning (C05, H29)

### Problem

Both platforms have real SPKI-based certificate pinning infrastructure, but pins are placeholders:

- **iOS** (`apps/ios/Sources/Services/APIService.swift:558`): `CertificatePins.cloudflareHashes` is empty. `CertificatePinningDelegate` will `performDefaultHandling` (no pinning) until the array is non-empty.
- **Android** (`apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:82-84`): OkHttp `CertificatePinner` has two entries with `sha256/REPLACE_AFTER_DEPLOYMENT`.

No pins = no protection. Anyone with a valid CA-signed cert for `*.llamenos.org` can MITM.

### Requirements

- Populate real SPKI hashes (leaf + intermediate CA backup) on both platforms.
- iOS: Add `#if !DEBUG` compile-time assertion that `cloudflareHashes` is non-empty — prevents accidentally shipping with empty pins.
- Both: Pin rotation via signed `/api/config` endpoint (server sends `currentPin` + `nextPin` hashes signed by the server's Ed25519 key; client verifies signature then updates local cache).
- Both: Pin mismatch events logged and surfaced in admin dashboard as a security event (type: `cert_pin_mismatch`).
- No cleartext fallback. Hard fail unconditionally.

### Constraints

- Production SPKI hashes must be extracted from actual production certs before this ships.
- Extraction command: `openssl s_client -connect app.llamenos.org:443 </dev/null 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`
- `docs/security/CERTIFICATE_PINS.md` must be created/updated with the extracted hashes and the extraction procedure.
- Android `network_security_config.xml` already has `cleartextTrafficPermitted="false"` — do not relax this.

---

## Phase 2: Biometric & PIN Security (H25, H30, MOB-02)

### Problem

- **iOS H25** (`apps/ios/Sources/Views/Auth/PINUnlockView.swift:120-133`): `handleBiometricUnlock()` calls `BiometricPrompt.authenticate()` but on success does nothing — "biometric success is a convenience UX signal". The PIN stored behind biometric protection in Keychain is never retrieved. `KeychainService.retrievePINWithBiometric()` exists but is not called from the unlock flow.
- **Android MOB-02** (`apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/PINUnlockScreen.kt:171-173`): Biometric button `onClick` is an empty comment placeholder.
- **Android H30**: `FLAG_SECURE` is applied for nsec display (`SecureText.kt`) but not on PIN entry, recovery phrase display, or key management screens.

### Requirements

- **iOS**: After biometric success, call `keychainService.retrievePINWithBiometric()` to get the stored PIN, then call the same `vm.onPINComplete(pin)` path used for manual entry. If Keychain retrieval fails (biometric not set up, key not found), show PIN pad normally — no error, just silent fallback.
- **Android**: Wire `BiometricPrompt` API in `PINUnlockScreen.kt`. On success, retrieve PIN from Keystore via `keystoreService.retrievePINWithBiometric()`, then call `viewModel.onBiometricSuccess(pin)`. If biometric not available or fails, hide the button.
- **Android**: Apply `FLAG_SECURE` to `PINUnlockScreen`, `AccountRecoveryView` (or equivalent), and any screen that renders raw key material. Use a `SecureWindowEffect` composable (extract from `SecureText.kt` pattern).

---

## Phase 3: Multi-Hub Axiom & Deep Links (H31, H33)

### Problem

- **Android H31** (`apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:229-231`): `handleIncomingCall` calls `activeHubState.setActiveHub(hubId)` when the app is unlocked and a push arrives. This violates the multi-hub axiom: "background handlers must NEVER call setActiveHub". `LinphoneService.kt:108` already calls `setActiveHub` at the correct moment (when the SIP call is received by `onCallStateChanged`). The PushService call is redundant AND a violation.
- **Android H33** (`DeepLinkActivity.kt`): Only handles `llamenos://oauth/callback`. No allowlist for app links. No `autoVerify` or `assetlinks.json`. A malicious app could register a competing intent handler for `llamenos://` URIs on unverified devices.

### Requirements

- **H31**: Remove `serviceScope.launch { activeHubState.setActiveHub(hubId) }` from `PushService.handleIncomingCall`. Keep `linphoneService.storePendingCallHub(callId, hubId)` — that's what feeds `LinphoneService.onCallStateChanged`.
- **H33**: Add `DeepLinkValidator` with an explicit allowlist of allowed hosts (`oauth`, `call`, `hub`). Require user confirmation dialog for any link going to a sensitive destination. Add `autoVerify="true"` intent filter attribute in `AndroidManifest.xml`. Create `site/.well-known/assetlinks.json` for App Links verification.
- BDD: Cucumber scenarios for push not switching hub and deep link validation.

---

## Phase 4: iOS DEBUG Audit (Gap 4.0)

### Problem

`apps/ios/Sources/App/BuildSafety.swift` has a compile-time check (`#if RELEASE_HARDENED && DEBUG`) and a runtime check (`assertionFailure` for dangerous launch args). However:
- Mock identity injection (test identity `--test-authenticated`, `--test-volunteer-identity`) is guarded by `#if DEBUG` in multiple service files.
- The `RELEASE_HARDENED` flag must be added to the Release build configuration in Xcode — this is currently documented but not verified as set.
- CI does not verify the release binary is free of DEBUG symbols for security paths.

### Requirements

- Audit every `#if DEBUG` block in: `APIService.swift`, `CryptoService.swift`, `AuthService.swift`, `WakeKeyService.swift`, any `*Service.swift` that references `--test-*` launch args.
- Mock identity injection must live in a dedicated test scheme/target only, not in the main app target behind `#if DEBUG`.
- Verify `RELEASE_HARDENED` is set in the Xcode Release configuration (check `apps/ios/project.yml` or `LlamenosHotline.xcodeproj`).
- Add a CI step: after building the release IPA/xcarchive, run `nm` on the binary and fail the job if any symbol matching `testAuthenticated`, `testIdentity`, or `resetKeychain` is found outside the test target.

---

## Phase 5: WakeKeyService X25519 Migration (Gap 3.1)

### Problem

- **iOS** (`apps/ios/Sources/Services/WakeKeyService.swift:262-265`): `deriveX25519PublicKey` is misnamed — it calls `getPublicKey(secretKeyHex:)` which is secp256k1, not X25519. The comment says "TODO: Switch to X25519 key derivation when server sends HPKE envelopes."
- **Android** (`apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt:74-75`): Uses `org.llamenos.core.getPublicKey()` which is also secp256k1.
- The server already sends HPKE envelopes (v3 migration per CLAUDE.md). The HPKE seal uses the recipient's X25519 public key. Using secp256k1 keys here is a cryptographic mismatch — the server will fail to encrypt push payloads for devices using the wrong key type.

### Requirements

- **iOS**: Replace `getPublicKey(secretKeyHex:)` call in `deriveX25519PublicKey` with the Rust FFI function that derives an X25519 public key. Check `packages/crypto` for the correct FFI function name (likely `mobileX25519PublicKey(secretKeyHex:)` or similar).
- **Android**: Replace `org.llamenos.core.getPublicKey()` in `WakeKeyService.getOrCreateWakePublicKey()` with the X25519-specific FFI function.
- Server-side coordination: server must be confirmed to send HPKE envelopes using X25519 (not secp256k1 ECIES) before enabling. Add a feature flag or server version check.
- Unit tests: verify that derived public key has the correct length (32 bytes for X25519 vs 33 bytes for secp256k1 compressed).
- On-device migration: existing devices have secp256k1 wake keys registered. Migration must re-register the device with the new X25519 wake pubkey. Add migration logic to `ensureKeypairExists()` that detects old key length and forces re-generation.

---

## Out of Scope

- Desktop certificate pinning (separate epic)
- Backend authentication rate limiting (Epic A)
- Sigchain MLS integration (Epic E)
- GDPR data erasure enhancements (Epic F)
