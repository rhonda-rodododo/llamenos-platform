# EP02 — Device & Identity Management — Completion Plan

## Scope

### Already Done (~90%)
- `/security/*` route tree with 4 tabs (devices, sessions, passkeys, history)
- Device listing, rename, revoke
- Device revocation endpoint
- Session management (list, terminate, terminate all others)
- Emergency lockdown
- Security event timeline
- Passkeys management
- Admin device oversight
- SAS emoji verification modal (UI shell)
- Device verification storage schema
- User-role assignment UI
- React Query hooks for devices
- iOS device list, session list, security events
- Android device list, security events
- `LABEL_SAS_DERIVE` crypto label

### Remaining Work
- SAS emoji derivation uses local mock instead of Rust `packages/crypto` IPC
- Mobile session terminate-all-others flow not confirmed
- Sigchain integration for device revocation not verified
- Rate limiting on device operations not verified

## Tasks (ordered by dependency)

### Task 1: Implement SAS derivation in packages/crypto
- **Platform**: crypto (Rust)
- **Files**:
  - `packages/crypto/src/sas.rs` (new or extend existing module)
  - `packages/crypto/src/lib.rs` — export `derive_sas` function
- **What**: Implement `fn derive_sas(pubkey_a: &[u8; 32], pubkey_b: &[u8; 32], nonce: &[u8; 32]) -> [u8; 7]` in Rust. Internally: canonicalize pubkey order (lexicographic min||max), HKDF-SHA256 with `LABEL_SAS_DERIVE`, extract 42 bits → seven 6-bit indices into a 64-entry emoji table. Export the emoji table as a constant. Expose via UniFFI bindings for mobile, and ensure WASM compilation works for test builds.
- **Spec reference**: D4 (SAS emoji table from packages/crypto)
- **Acceptance**: `bun run crypto:test` passes; `derive_sas` returns deterministic 7-index array; canonical pubkey ordering verified in tests

### Task 2: Wire SAS derivation through Tauri IPC
- **Platform**: desktop
- **Files**:
  - `apps/desktop/src/crypto.rs` — add `derive_sas` IPC command
  - `src/client/lib/platform.ts` — add `deriveSas()` function
  - `src/client/components/security/verify-fingerprint-modal.tsx` — replace mock with `platform.deriveSas()`
  - `tests/mocks/` — add mock for `derive_sas` IPC command
- **What**: Add a Tauri IPC command `derive_sas` that delegates to `packages/crypto::derive_sas`. Wire `platform.ts` to call this command. Replace the local mock in the verify fingerprint modal with the real `platform.deriveSas()` call. Add corresponding mock in the Playwright test mock layer.
- **Spec reference**: D4, Architecture (Data flow — SAS verification)
- **Acceptance**: SAS verification ceremony uses real HKDF derivation from Rust; emoji display matches between admin and target; Playwright tests pass with mock

### Task 3: Verify sigchain integration for device revocation
- **Platform**: backend
- **Files**:
  - `apps/worker/routes/devices.ts` — `POST /api/devices/:id/revoke`
  - `apps/worker/services/` — sigchain service
- **What**: Audit the device revocation endpoint to confirm it atomically: (1) appends a `device_remove` sigchain link signed by the requesting device, (2) deletes the device record, (3) rotates PUK excluding revoked device, (4) rotates hub keys for all user's hubs. If any step is missing, implement it. Add test coverage.
- **Spec reference**: Architecture (Data flow — device revocation)
- **Acceptance**: Device revocation creates sigchain link; PUK rotation excludes revoked device; hub keys rotated; all within a transaction

### Task 4: Verify rate limiting on device operations
- **Platform**: backend
- **Files**:
  - `apps/worker/routes/devices.ts`
  - `apps/worker/routes/sessions.ts`
  - `apps/worker/routes/account.ts`
- **What**: Verify that rate limits are in place: device revocation (3/hour), session termination (10/hour), device registration (5/hour per user), WebAuthn registration (3/hour), security event queries (30/minute), admin overview (10/minute). If missing, add rate limiting middleware.
- **Spec reference**: Security Considerations (Rate limiting)
- **Acceptance**: Rate limits enforced; exceeding returns 429

### Task 5: Verify iOS session terminate-all-others flow
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Security/SessionListView.swift`
  - `apps/ios/Sources/Services/` — session-related service
- **What**: Confirm that the iOS session list view has a "terminate all other sessions" action that calls `POST /api/sessions/terminate-others`. If missing, add the button and API call. Test on simulator.
- **Spec reference**: Architecture (SessionsPage), Platform Coverage
- **Acceptance**: iOS users can terminate all other sessions from the session list view

### Task 6: Wire SAS derivation on mobile
- **Platform**: iOS, Android
- **Files**:
  - iOS: UniFFI bindings for `derive_sas` in `CryptoService`
  - Android: JNI bindings for `derive_sas` in `CryptoService`
- **What**: Ensure `derive_sas` is exposed via UniFFI (iOS) and JNI (Android). This may already be handled by the UniFFI/JNI build pipeline if the function is properly annotated in the Rust crate. Verify by checking that `CryptoService.deriveSas()` is callable on both platforms.
- **Spec reference**: D4, Dependencies (packages/crypto UniFFI bindings)
- **Acceptance**: `derive_sas` callable from Swift and Kotlin; returns correct 7-index array matching Rust output

### Task 7: Fix @wip BDD scenarios for device linking
- **Platform**: backend
- **Files**:
  - `packages/test-specs/features/security/network-security.feature` — 7 @wip scenarios
  - Related step definitions in `tests/steps/`
- **What**: Investigate the 7 @wip device linking scenarios in `network-security.feature`. These cover HTTPS validation for device linking. Implement missing step definitions or fix backend logic to make them pass. Remove @wip tags.
- **Spec reference**: BDD test plan
- **Acceptance**: All 7 scenarios pass; @wip tags removed
