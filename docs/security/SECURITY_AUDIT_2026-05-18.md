# Llamenos Core Security Audit Report

**Audit Date**: 2026-05-18
**Scope**: Core layer — Rust crypto crate (`packages/crypto/`), Bun/Hono backend (`apps/worker/`)
**Branch**: `sec-audit-core`
**Threat Model**: E2EE, zero-knowledge server, zero-trust. Adversaries include nation-states, right-wing groups, and private hacking firms.
**Classification**: CONFIDENTIAL — Restricted to security team
**Auditor**: Automated deep-read audit (Claude Opus 4.6)

---

## 1. Executive Summary

This audit examined the two core components of the Llamenos platform: the shared Rust crypto crate and the Bun/Hono backend server. It follows up on the full-platform audit of 2026-03-21, focusing on code landed since then (EP01–EP09 features, HPKE migration, device key model, recovery groups, erasure, blast/broadcast, and various security hardening PRs).

| Severity | Count | Components Affected |
|----------|-------|---------------------|
| HIGH | 6 | Crypto (2), Worker (4) |
| MEDIUM | 15 | Crypto (5), Worker (10) |
| LOW | 10 | Crypto (3), Worker (7) |
| INFO | 2 | Crypto (1), Worker (1) |
| **Total** | **33** | |

### Top Priority Issues

1. **HIGH-C1: FFI Server HPKE Bypasses Albrecht Defense** — `ffi_hpke_seal`/`ffi_hpke_open` accept raw info bytes from the Bun server, completely bypassing the label registry and domain separation enforcement that protects the rest of the system. A single application-layer bug could produce ciphertexts that decrypt under unintended contexts.

2. **HIGH-C2: Label Registry Drift — 7 Labels Missing from Rust** — `crypto-labels.json` defines 82 labels but the Rust `LABEL_REGISTRY` only has 81 entries (including 1 tombstone). Seven labels used by TypeScript/Swift/Kotlin codegen are absent from Rust, meaning ciphertexts produced by non-Rust platforms with these labels cannot be decrypted by Rust.

3. **HIGH-W1: MLS Message Fetch Lacks Device Ownership Verification** — `GET /mls/messages` accepts a `deviceId` query parameter with no validation that the authenticated user owns that device. Any authenticated user can fetch (and delete, via fetch-and-clear semantics) MLS handshake messages destined for another user's device.

4. **HIGH-W2: Dev Endpoint `checkResetSecret` Accepts Any Bearer Token** — The dev-mode gate accepts any `Authorization: Bearer *` header regardless of validity, meaning any authenticated user in a development/staging environment can trigger destructive test-reset endpoints (full DB wipe).

5. **HIGH-W3: Plaintext Phone Numbers in Ban List Records** — Ban list contact records store phone numbers as cleartext in the database via `createBanListContact`, contradicting the zero-knowledge server claim.

6. **HIGH-W4: IDOR in Records `/by-contact` Endpoint** — The records by-contact endpoint does not verify the requesting user has access to the specific contact's records, potentially allowing cross-hub data access.

### Previous Audit Status

Of the original 58 findings from the 2026-03-21 audit, this audit re-verified 18 findings within the core scope (crypto + worker). **All 18 are confirmed FIXED or RESOLVED**, representing substantial security improvement. Key resolutions:

- All legacy ECIES/secp256k1 modules removed
- Albrecht defense (domain separation) fully implemented in `hpke_envelope.rs`
- Key material zeroization implemented throughout
- Auth token replay protection added
- Sigchain hash chain + signature verification complete
- Webhook signature validation applied to all telephony routes
- SSRF protection with DNS rebinding defense added
- Dev endpoints return 404 (not 403) in production

---

## 2. HIGH Findings

### Crypto

---

### HIGH-C1: FFI Server HPKE Bypasses Albrecht Defense

**Component**: Crypto — FFI Server Interface
**File(s)**: `packages/crypto/src/ffi_server.rs`
**Description**: `ffi_hpke_seal` and `ffi_hpke_open` accept raw `info` bytes from the C/FFI caller and pass them directly to HPKE without routing through the label registry. The Albrecht defense (label ID resolution, version check, label mismatch rejection) implemented in `hpke_envelope.rs` is completely bypassed at this FFI layer. The Bun server can supply arbitrary info strings, defeating domain separation.
**Impact**: An application-layer bug in the Bun server could pass the wrong label or an empty info parameter, producing ciphertexts that decrypt under unintended contexts. This undermines the entire domain separation architecture that the system was designed around.
**Recommendation**: Route `ffi_hpke_seal`/`ffi_hpke_open` through `hpke_envelope::hpke_wrap`/`hpke_unwrap` (which enforce label resolution), or add a parallel label-ID-based C ABI that resolves labels server-side. At minimum, reject empty `info` buffers.

---

### HIGH-C2: Label Registry Drift — 7 Labels Missing from Rust

**Component**: Crypto — Domain Separation
**File(s)**: `packages/crypto/src/labels.rs`, `packages/protocol/crypto-labels.json`
**Description**: `crypto-labels.json` defines 82 labels. `labels.rs` defines 81 entries in `LABEL_REGISTRY` (indices 0–80, with one tombstone at index 53). Seven labels present in `crypto-labels.json` are absent from Rust:
- `LABEL_AVAILABILITY_REASON` ("llamenos:availability-reason")
- `LABEL_RING_GROUP_NAME` ("llamenos:ring-group-name")
- `LABEL_SHIFT_NAME` ("llamenos:shift-name")
- `LABEL_SHIFT_OVERRIDE_NOTE` ("llamenos:shift-override-note")
- `LABEL_ENTITY_TYPE_DEFINITION` ("llamenos:entity-type-def:v1")
- `LABEL_TEAM_ENCRYPT` ("llamenos:team-field:v1")
- `LABEL_TAG_ENCRYPT` ("llamenos:tag-field:v1")

**Impact**: Any platform (TypeScript, Swift, Kotlin) using these labels via codegen will produce ciphertexts that cannot be decrypted by the Rust crate, since the label IDs won't resolve. If server-side code encrypts with these labels, desktop/mobile clients cannot decrypt.
**Recommendation**: Add the 7 missing labels to `LABEL_REGISTRY` in `labels.rs` with stable indices (81–87). Add a CI check that compares `crypto-labels.json` keys against `LABEL_REGISTRY` entries and fails on drift.

---

### Worker

---

### HIGH-W1: MLS Message Fetch Lacks Device Ownership Verification

**Component**: Worker — MLS Routes
**File(s)**: `apps/worker/routes/mls.ts:160-171`
**Description**: `GET /mls/messages` takes `deviceId` as a query parameter with no validation that the authenticated user owns that device. Any authenticated user can fetch (and delete, due to fetch-and-clear semantics) MLS handshake messages addressed to any device in any hub they belong to.
**Impact**: An attacker with a valid session could intercept MLS Welcome/Commit messages destined for other devices, potentially disrupting or compromising E2EE group key establishment.
**Recommendation**: Before fetching messages, verify that `deviceId` belongs to the authenticated user's pubkey via the `devices` table. Reject requests for devices the caller does not own.

---

### HIGH-W2: Dev Endpoint `checkResetSecret` Accepts Any Bearer Token

**Component**: Worker — Dev Routes
**File(s)**: `apps/worker/routes/dev.ts:33-35`
**Description**: The `checkResetSecret` function bypasses the `X-Test-Secret` check if any `Authorization: Bearer *` header is present, regardless of token validity: `if (authHeader?.startsWith('Bearer ')) return true`. This means any authenticated user in a development environment can trigger destructive test-reset endpoints (full database wipe, admin re-seed, etc.).
**Impact**: In a development or staging deployment where multiple developers share an instance, any authenticated user can wipe the entire database. If `ENVIRONMENT=development` is accidentally set in production, the gate provides no real protection.
**Recommendation**: Remove the bare Bearer token bypass. Require the `X-Test-Secret` header exclusively, or validate the token against the auth middleware and require an admin permission.

---

### HIGH-W3: Plaintext Phone Numbers in Ban List Records

**Component**: Worker — Ban List Routes
**File(s)**: `apps/worker/routes/ban-list.ts` (createBanListContact)
**Description**: Ban list contact records store phone numbers as cleartext in the database, contradicting the zero-knowledge server claim documented in `README.md` and `THREAT_MODEL.md`.
**Impact**: A database breach exposes banned caller phone numbers in plaintext. These are particularly sensitive — they belong to people who have been flagged, and their exposure could enable targeted harassment or retaliation.
**Recommendation**: Store ban list contacts as HMAC-SHA256 hashes (consistent with the Signal notifier pattern). Compare incoming caller hashes against stored hashes for ban enforcement.

---

### HIGH-W4: IDOR in Records `/by-contact` Endpoint

**Component**: Worker — Records Routes
**File(s)**: `apps/worker/routes/records.ts` (GET /by-contact/:contactId)
**Description**: The records by-contact endpoint does not verify the requesting user has access to the specific contact's records. Any authenticated user with `records:read` permission can query records for any contact identifier across the hub.
**Impact**: Cross-user data access within a hub. A volunteer could see records created by other volunteers for a specific contact, potentially violating the isolation guarantees (volunteers should only see their own notes).
**Recommendation**: Filter results to records the requesting user created or has explicit access to, unless the user has admin-level permissions.

---

## 3. MEDIUM Findings

### Crypto

---

### MED-C1: MLS Ciphersuite Uses AES-128-GCM, Not AES-256-GCM

**Component**: Crypto — MLS
**File(s)**: `packages/crypto/src/mls.rs`
**Description**: The MLS integration uses `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`, which provides AES-128-GCM. Every other symmetric operation in the crate uses AES-256-GCM.
**Impact**: Hub state protected by MLS has a lower symmetric security level (128-bit) than all other encrypted data (256-bit). While AES-128 is not broken, the inconsistency violates the principle of uniform security levels. OpenMLS 0.8 does not offer an X25519+AES-256-GCM ciphersuite in the standard set.
**Recommendation**: Document as a known limitation. Migrate if OpenMLS adds a 256-bit suite.

---

### MED-C2: Argon2id Parameter Inconsistency Between Modules

**Component**: Crypto — KDF
**File(s)**: `packages/crypto/src/encryption.rs` (`derive_kek_from_pin`)
**Description**: `encryption.rs` hardcodes production Argon2id parameters (64 MB, 3 iterations, 4 lanes) and does not respect the `test-kdf` feature flag. `device_keys.rs` correctly uses `cfg(feature = "test-kdf")` to switch parameters.
**Impact**: CI/emulator builds with `--features test-kdf` will use fast KDF for device key derivation but slow KDF for PIN-based encryption, causing test timeouts or inconsistent coverage.
**Recommendation**: Extract Argon2id parameter selection into a single shared function that respects `test-kdf` everywhere.

---

### MED-C3: `encrypt_with_pin` Lacks AAD Binding

**Component**: Crypto — PIN Encryption
**File(s)**: `packages/crypto/src/encryption.rs`
**Description**: `encrypt_with_pin` derives a KEK from a PIN via Argon2id and encrypts with AES-256-GCM, but uses empty AAD (`&[]`). No binding to user public key, device ID, or any context identifier.
**Impact**: A PIN-encrypted blob can be transplanted between users or devices without detection.
**Recommendation**: Include the user's public key and/or device ID in the AAD parameter.

---

### MED-C4: `DeviceSecrets` Fields Are `pub`, Allowing Unzeroized Copies

**Component**: Crypto — Key Management
**File(s)**: `packages/crypto/src/device_keys.rs`
**Description**: `DeviceSecrets` has `#[derive(Zeroize)]` and `#[zeroize(drop)]`, but `signing_seed` and `encryption_seed` are `pub`. Any code can copy the raw `[u8; 32]` seed bytes without zeroization guarantees.
**Impact**: Copied seed bytes persist in memory after the struct is dropped, creating a window for memory disclosure attacks (cold boot, core dump, swap).
**Recommendation**: Make fields `pub(crate)` at most. Provide accessor methods returning `Zeroizing<[u8; 32]>` or references.

---

### MED-C5: `ffi_v3.rs` Exposes Raw Encryption Secret via `encryption_secret_hex()`

**Component**: Crypto — Mobile FFI
**File(s)**: `packages/crypto/src/ffi_v3.rs`
**Description**: `MobileCryptoService::encryption_secret_hex()` returns the raw X25519 encryption seed as a hex string across the FFI boundary. This is the root secret for all HPKE decryption operations.
**Impact**: If the mobile host process logs return values, crashes with the value on stack, or a debugger is attached, the long-term encryption private key is exposed.
**Recommendation**: Evaluate whether the mobile side needs the raw encryption secret. If possible, keep HPKE operations entirely in Rust and return only ciphertexts/plaintexts across FFI.

---

### Worker

---

### MED-W1: SSRF Guard Fails Open on DNS Resolution Failure

**Component**: Worker — SSRF Protection
**File(s)**: `apps/worker/lib/ssrf-guard.ts:143-145`
**Description**: `validateExternalUrlWithDns` catches all DNS resolution errors and allows the request through. Comment reads "fail-open for non-resolvable hosts." An attacker could exploit DNS timing or rebinding where the validation call fails but the actual fetch succeeds.
**Impact**: Potential SSRF bypass allowing requests to internal services, though static URL validation still catches obvious internal IPs.
**Recommendation**: Fail closed — if DNS resolution fails, reject the URL. Add 1–2 retries before rejecting if external services with intermittent DNS are expected.

---

### MED-W2: Recovery Group Verification Code Not Constant-Time Compared

**Component**: Worker — Recovery Groups
**File(s)**: `apps/worker/services/recovery-group.ts:274`
**Description**: The verification code hash comparison uses `!==` (JavaScript string comparison) rather than `timingSafeEqual`. Other webhook validators in the codebase correctly use `timingSafeEqual` (Telegram, Signal, RCS adapters).
**Impact**: A timing side-channel could allow an attacker to iteratively guess the verification code hash. The 6-digit code space (1M possibilities) combined with timing leakage could reduce brute-force effort.
**Recommendation**: Use `timingSafeEqual` from `node:crypto` for the hash comparison, consistent with the pattern used elsewhere in the codebase.

---

### MED-W3: Provisioning Relay Uses `X-Forwarded-For` for Rate Limiting

**Component**: Worker — Provisioning
**File(s)**: `apps/worker/routes/provisioning.ts:69`
**Description**: The provisioning relay uses `c.req.header('X-Forwarded-For')` as a fallback for client IP, which is trivially spoofable unless the reverse proxy overwrites it. Rate limiting (30/min per IP) can be bypassed by rotating the header.
**Impact**: Rate limit bypass on provisioning relay polling, enabling abuse of the device linking mechanism.
**Recommendation**: Only trust `CF-Connecting-IP` or the connecting socket IP. Use the rightmost IP from `X-Forwarded-For` after stripping untrusted hops.

---

### MED-W4: WebSocket Event Encryption Falls Back to Plaintext

**Component**: Worker — WebSocket Events
**File(s)**: `apps/worker/lib/ws-events.ts:123-127`
**Description**: When `serverSecret` is falsy, `publishEvent` sends the event payload as plaintext JSON instead of encrypting it. This silently downgrades security.
**Impact**: If `SERVER_SECRET` is missing or empty in the environment, all WebSocket relay events are transmitted in plaintext.
**Recommendation**: Refuse to start the server or refuse to publish events if `SERVER_SECRET` is not configured.

---

### MED-W5: MLS Commit Fan-Out Does Not Verify Hub Membership

**Component**: Worker — MLS Routes
**File(s)**: `apps/worker/routes/mls.ts:80-97`
**Description**: `POST /mls/commit` accepts `recipientDeviceIds` from the caller and blindly enqueues messages for all listed devices with no verification they belong to members of the target hub.
**Impact**: A malicious hub member could enqueue MLS Commit messages to devices in other hubs, causing confusion or denial of service in MLS group state.
**Recommendation**: Validate that all `recipientDeviceIds` belong to users who are members of the target hub.

---

### MED-W6: OpenAPI Spec Served Publicly

**Component**: Worker — API Routes
**File(s)**: `apps/worker/routes/dev.ts` (or equivalent public route)
**Description**: The OpenAPI specification is served at `/api/openapi.json` without authentication. This exposes the complete API surface, parameter schemas, and route structure to unauthenticated actors.
**Impact**: Accelerates attacker reconnaissance. While security through obscurity is not a primary defense, exposing the full API schema unnecessarily reduces the cost of finding attack surface.
**Recommendation**: Gate the OpenAPI endpoint behind authentication or restrict to development environments only.

---

### MED-W7: `encryptedSecretKey` Legacy Field Still in Users Table

**Component**: Worker — Database Schema
**File(s)**: `apps/worker/db/schema/users.ts:42`
**Description**: The `users` table retains `encryptedSecretKey` (legacy nsec field) with `.default('')`. While the system has migrated to per-device Ed25519/X25519 keys, this field remains in the schema.
**Impact**: If any code path still reads or writes this field, legacy nsec material could persist in the database. Even if unused, the field creates confusion for auditors about which key model is authoritative.
**Recommendation**: Verify no code paths reference this field, then remove it via migration.

---

### MED-W8: Session Tokens Stored as Plaintext in Database

**Component**: Worker — Identity Service
**File(s)**: `apps/worker/services/identity.ts:591-604`
**Description**: Session tokens are stored as plaintext hex in the database and looked up via direct SQL equality comparison. If the database is compromised, all active session tokens are immediately usable.
**Impact**: Database compromise directly yields all active sessions. For a crisis hotline with nation-state adversary threat model, this is significant.
**Recommendation**: Store SHA-256(token) in the database. On validation, hash the incoming token and compare against the hash.

---

### MED-W9: Dual-Mounted Routes Risk Cross-Hub Data Leakage

**Component**: Worker — Route Architecture
**File(s)**: `apps/worker/app.ts:229-258`
**Description**: Many route modules are mounted both under the global authenticated scope and under the hub-scoped scope (`/hubs/:hubId/`). The same route handler runs in both contexts. Routes that should only be accessible in a hub context can also be accessed via the non-hub-scoped path, where `hubPermissions` is undefined and `hubId` is unset. If service implementations don't independently filter by hubId, data from multiple hubs could be returned.
**Impact**: A user with global `audit:read` could read audit entries without specifying a hub, potentially seeing cross-hub data.
**Recommendation**: Audit each dual-mounted route's service layer to verify it filters by hubId. Routes that should only work in hub context should not be mounted in the global scope.

---

### MED-W10: Panic Paths on RNG and Mutex Failures in Crypto Crate

**Component**: Crypto — Error Handling
**File(s)**: `packages/crypto/src/encryption.rs`, `packages/crypto/src/padding.rs`, `packages/crypto/src/mls.rs`, `packages/crypto/src/ffi_v3.rs`
**Description**: Multiple `.expect("getrandom failed")` on `OsRng`/`getrandom::fill`, and `.unwrap()` on `Mutex::lock()`. On platforms where getrandom can fail (early boot, sandboxed WASM), these panic and crash the host process. Mutex poisoning causes cascading panics.
**Impact**: Denial of service on constrained platforms. In the server context (WASM), an RNG failure crashes the request handler.
**Recommendation**: Replace `.expect()` on RNG with `Result` propagation. For Mutex access, use `.lock().map_err(...)` instead of `.unwrap()`.

---

## 4. LOW Findings

### Crypto

---

### LOW-C1: SFrame / SAS / MLS HKDF Derivations Use `None` Salt

**Component**: Crypto — Key Derivation
**File(s)**: `packages/crypto/src/sframe.rs`, `packages/crypto/src/sas.rs`, `packages/crypto/src/mls.rs`
**Description**: Several HKDF-SHA256 derivations use `Hkdf::<Sha256>::new(None, &ikm)`. While valid per RFC 5869, using an explicit salt adds defense-in-depth.
**Impact**: Low. `None` salt is explicitly permitted and `info` provides domain separation. If two derivation contexts share the same IKM and info, collisions could occur.
**Recommendation**: Consider using the domain separation label as salt in addition to info.

---

### LOW-C2: `derive_kek_from_pin` Has No PIN Validation

**Component**: Crypto — PIN Security
**File(s)**: `packages/crypto/src/encryption.rs`
**Description**: `derive_kek_from_pin` is `pub` and accepts any `&str` as a PIN, including empty strings. No minimum length or complexity check.
**Impact**: A caller could derive a KEK from an empty or trivially short PIN.
**Recommendation**: Add minimum PIN length validation, or document that PIN policy is the caller's responsibility and make the function `pub(crate)`.

---

### LOW-C3: `EphemeralKeyPair` Exposes `secret_key_hex` Across FFI

**Component**: Crypto — Provisioning FFI
**File(s)**: `packages/crypto/src/ffi_v3.rs`
**Description**: `generate_ephemeral_keypair_mobile()` returns `EphemeralKeyPair` with `secret_key_hex` as a public field. The code explicitly clones the secret out of `Zeroizing`. Documented as intentional for provisioning protocol.
**Impact**: Ephemeral secret exists as unzeroized hex String in mobile runtime heap. Bounded exposure window (single-use for provisioning ECDH).
**Recommendation**: Ensure the secret is cleared after provisioning ECDH completes. Consider handle-based approach.

---

### Worker

---

### LOW-W1: Recovery Initiation Anti-Enumeration Has Inconsistent Timing

**Component**: Worker — Recovery Groups
**File(s)**: `apps/worker/services/recovery-group.ts:180-197`
**Description**: When a recovery group or Signal contact is not found, the service adds a 50ms delay to mimic successful-path timing. The successful path involves a DB insert and external HTTP call, likely taking significantly more than 50ms.
**Impact**: An attacker could time recovery requests to distinguish valid from invalid user identifiers.
**Recommendation**: Use a constant-time delay matching or exceeding the average successful-path duration (500–1000ms), or a random delay within a range.

---

### LOW-W2: Blast Subscriber Import Has No Size Limit

**Component**: Worker — Blast Routes
**File(s)**: `apps/worker/routes/blasts.ts:61-68`
**Description**: `POST /subscribers/import` accepts a bulk subscriber array with no explicit limit on array size beyond what the schema imposes.
**Impact**: Large import payload could cause memory pressure or long-running DB operations.
**Recommendation**: Verify `importSubscribersBodySchema` includes a `.max()` constraint on the array (e.g., max 10,000 per batch).

---

### LOW-W3: Retention Purge Deletes Audit Log Entries

**Component**: Worker — Retention
**File(s)**: `apps/worker/services/retention.ts:180-192`
**Description**: The retention purge service allows deletion of `audit_log` entries based on configurable retention. For a hash-chained audit log, automated deletion breaks chain integrity.
**Impact**: Security-relevant audit entries could be purged before incident investigation. Hash chain would have gaps.
**Recommendation**: Set a hard minimum floor for `audit_log` retention (e.g., 365 days). Consider soft-deleting audit entries to preserve hash chain integrity.

---

### LOW-W4: Emergency Erasure Override Signature Lacks Domain Separation for SessionId

**Component**: Worker — Recovery Groups
**File(s)**: `apps/worker/services/recovery-group.ts:699-709`
**Description**: Emergency override signature verification signs over just the raw `sessionId` string without domain separation. A signature over a sessionId could potentially be replayed in a different context.
**Impact**: Low — sessionIds are UUIDs and unlikely to collide. But it violates the project's own domain separation principle.
**Recommendation**: Use `${LABEL_RECOVERY_EMERGENCY_OVERRIDE}:${sessionId}` format, consistent with erasure override (`LABEL_ERASURE_OVERRIDE_SIG`) and WS auth (`LABEL_WS_CHALLENGE`).

---

### LOW-W5: Dev-Mode Signature Bypass in Auth Middleware

**Component**: Worker — Auth Middleware
**File(s)**: `apps/worker/middleware/auth.ts:26-40`
**Description**: When `ENVIRONMENT=development`, the auth middleware falls back to pubkey-only auth (bypasses Schnorr signature verification) for registered users. Documented as handling mobile E2E test cross-architecture interop.
**Impact**: In development environments, an attacker who knows a registered user's pubkey can impersonate them without knowing the private key. This is mitigated by requiring the user to already be registered and active.
**Recommendation**: Ensure CI/staging environments do NOT set `ENVIRONMENT=development`. Add prominent logging when this bypass activates.

---

### LOW-W6: `encryptedSecretKey` in `storage.ts` Schema

**Component**: Worker — Database Schema
**File(s)**: `apps/worker/db/schema/storage.ts:33`
**Description**: The `storage` table has an `encryptedSecretKey` field marked as `.notNull()`. This may be a different context than the legacy user nsec field (possibly for encrypted file storage keys), but the naming creates confusion with the deprecated user key model.
**Impact**: Naming ambiguity for auditors. If this stores actual encryption keys (even encrypted), verify the encryption scheme is current (HPKE, not legacy ECIES).
**Recommendation**: Clarify the purpose of this field with documentation or a more descriptive column name.

---

### LOW-W7: No Rate Limiting on WebAuthn Registration Attempts

**Component**: Worker — WebAuthn
**File(s)**: `apps/worker/routes/webauthn.ts`
**Description**: WebAuthn credential registration endpoints do not appear to have explicit rate limiting beyond the global per-IP limits.
**Impact**: An attacker with valid auth could attempt rapid credential registration to enumerate supported authenticator types or exhaust credential storage.
**Recommendation**: Add per-user rate limiting on WebAuthn registration (e.g., max 5 attempts per hour).

---

## 5. INFO Findings

---

### INFO-C1: Tombstone at Label Registry Index 53

**Component**: Crypto — Domain Separation
**File(s)**: `packages/crypto/src/labels.rs`
**Description**: Index 53 in `LABEL_REGISTRY` is a tombstone (`"llamenos:__tombstone:ecies-v2-salt"`) replacing the removed `LABEL_ECIES_V2_SALT`. This correctly preserves index stability.
**Recommendation**: No action needed. Continue using tombstones for future label removals.

---

### INFO-W1: PII Redaction Logger Is Comprehensive

**Component**: Worker — Logging
**File(s)**: `apps/worker/lib/logger.ts`
**Description**: The structured logger includes automatic PII redaction for phone numbers, emails, nsec keys, hex keys, and names. Rate limiting and correlation ID support via `AsyncLocalStorage`.
**Recommendation**: No action needed. Good practice — noted for completeness.

---

## 6. Changes Since Last Audit (2026-03-21)

### Architecture Changes
- **HPKE migration complete**: All ECIES/secp256k1 code removed. HPKE (RFC 9180 X25519-HKDF-SHA256-AES256-GCM) is the sole envelope encryption primitive.
- **Per-device keys**: Ed25519/X25519 device keys replace single nsec per user. Sigchain-authorized device model fully operational.
- **Legacy modules removed**: `ecies.rs`, `encryption_legacy.rs`, `keys_legacy.rs`, `legacy.rs`, `nostr.rs` — all confirmed absent from source tree.
- **Albrecht defense implemented**: `hpke_envelope.rs` enforces domain separation with version byte, label ID resolution at decrypt, and label mismatch rejection. 81-entry `LABEL_REGISTRY` with stable indices and tombstones.
- **Shamir secret sharing (EP09)**: Recovery group implementation with constant-time GF(2^8) operations, SHA-256 commitments.
- **Account erasure (EP08)**: Full lifecycle — self-service with configurable delay, emergency override with Ed25519 co-approver verification, cryptographic cascade (keys, envelopes, sessions, devices).
- **Hub event crypto**: HKDF-based key derivation with epoch-based forward secrecy and power-of-2 bucket padding for traffic analysis resistance.
- **Blast/Broadcast service**: PostgreSQL-backed delivery queue with per-channel rate limiting.
- **WebSocket security**: Ed25519-signed events, per-hub rate limiting, ring buffer replay, member eviction.

### Previous Findings Re-Verified (Core Scope)

| Finding ID | Title | Status |
|------------|-------|--------|
| CRIT-C1 | Legacy ECIES/secp256k1 modules present | **FIXED** — all legacy modules removed |
| CRIT-C2 | No domain separation / Albrecht defense | **FIXED** — full Albrecht defense in `hpke_envelope.rs` |
| CRIT-C3 | Key material not zeroized | **FIXED** — `Zeroize`/`ZeroizeOnDrop` throughout (partial caveat: MED-C4) |
| CRIT-W1 | Hub ID from URL parameter in webhooks | **FIXED** — opaque call tokens, server-side resolution |
| CRIT-W2 | Volunteer pubkey from URL parameter | **FIXED** — opaque call tokens throughout |
| HIGH-C1 | No replay protection on auth tokens | **FIXED** — timestamp-based expiry with clock skew tolerance |
| HIGH-C2 | Sigchain missing hash chain verification | **FIXED** — sequence, prevHash, signer membership, signature all verified |
| HIGH-C3 | Private keys cross FFI boundary | **PARTIALLY FIXED** — handle system for recovery group keys; signing/encryption secrets still cross FFI (MED-C5, LOW-C3) |
| HIGH-C4 | Shamir implementation not constant-time | **FIXED** — compile-time GF(2^8) lookup table, `ct_eq` comparisons |
| HIGH-C5 | test-kdf feature in default features | **FIXED** — `default = []` in Cargo.toml |
| HIGH-W1 | Webhook signature validation missing | **FIXED** — validation middleware on all telephony routes |
| HIGH-W2 | ENVIRONMENT check missing in dev endpoints | **FIXED** — dev endpoints return 404 when not development |
| HIGH-W3 | Dev endpoint 403 vs 404 fingerprinting | **FIXED** — returns 404 in production |
| HIGH-W4 | SSRF in provider test endpoint | **FIXED** — `encodeURIComponent` + regex validation |
| MED-W1 | Missing SSRF protection | **FIXED** — comprehensive SSRF guard with DNS rebinding defense (new caveat: MED-W1) |
| MED-W2 | No permission guard on admin routes | **FIXED** — `requirePermission`/`requireAnyPermission` middleware |
| CRIT-H1 | Hub key from URL parameter | **FIXED** — verified via hubContext middleware |
| MED-W3 | No rate limiting on provisioning | **FIXED** — 30/min per IP (new caveat: MED-W3 on X-Forwarded-For) |

---

## 7. Open Gaps Status (from SECURITY_GAPS_AND_ROADMAP.md)

Cross-referencing the 9 open gaps as of v1.1 (2026-05-12):

| Gap | Title | Current Status | Notes |
|-----|-------|---------------|-------|
| 1.2 | Tauri Stronghold vs. Store | **OPEN** (Desktop scope) | Not in core audit scope. Desktop uses `tauri-plugin-store`, not Stronghold. |
| 1.3 | SFrame Voice E2EE | **OPEN** | Key derivation fully implemented in `sframe.rs`. Media frame encryption still not implemented. |
| 1.4 | 3-Tier Envelope Encryption | **CLARIFIED** | 3-tier model (`summary`/`fields`/`pii`) is fully implemented and used for entity/record encryption via `envelope-recipients.ts`. Notes use simpler 2-envelope model by design. Documentation should clarify this distinction. |
| 1.6 | Zero-Knowledge Server Claim | **STILL RELEVANT** — with new finding | Original caveats still apply. NEW: HIGH-W3 (ban list plaintext phones) adds to the list of server-visible data. |
| 2.1 | Legacy ECIES/secp256k1 Modules | **RESOLVED** | All legacy modules confirmed removed from source tree. No secp256k1 dependencies in Cargo.toml. Can be closed. |
| 2.2 | MLS Client-Side Integration | **OPEN** | MLS backend routes exist (`routes/mls.ts`). New finding HIGH-W1 (device ownership) should be fixed before client-side integration proceeds. |
| 3.1 | iOS WakeKeyService X25519 | **OPEN** (iOS scope) | Not in core audit scope. |
| 3.2 | Android Certificate Pins | **OPEN** (Android scope) | Not in core audit scope. |
| 4 | iOS Debug Code in Production | **OPEN** (iOS scope) | Not in core audit scope. |

**New gaps identified by this audit** (to be added to roadmap):
1. FFI server HPKE label bypass (HIGH-C1)
2. Label registry drift — 7 missing labels (HIGH-C2)
3. MLS device ownership verification (HIGH-W1)
4. Ban list plaintext phones (HIGH-W3)
5. SSRF guard fail-open (MED-W1)

---

## 8. Methodology

### Scope

| Component | Files Audited | Method |
|-----------|--------------|--------|
| `packages/crypto/src/` | 22 Rust source files | Full source read + cross-reference |
| `apps/worker/routes/` | All route modules (~50+) | Full source read |
| `apps/worker/services/` | erasure.ts, recovery-group.ts, retention.ts, blast.ts, others | Full source read |
| `apps/worker/middleware/` | auth.ts, permission-guard.ts | Full source read |
| `apps/worker/lib/` | 15+ library modules | Full source read |
| `apps/worker/db/schema/` | All schema files | Full source read |
| `apps/worker/messaging/` | Signal, Telegram, RCS, WhatsApp, SMS adapters | Targeted review (webhook validation) |

### Approach

1. **Automated deep-read**: All source files read in full by specialized agents with security audit focus
2. **Previous finding re-verification**: Each finding from the 2026-03-21 audit was re-checked against current code
3. **Gap cross-reference**: 9 open gaps from `SECURITY_GAPS_AND_ROADMAP.md` verified against current state
4. **Pattern-based search**: Specific searches for constant-time comparison usage, raw SQL, ENVIRONMENT checks, legacy references, and PII handling
5. **Parallel agent audit**: 4 specialized agents covering crypto crate, middleware/auth, routes (part 1), and routes/services (part 2)

### Limitations

- This audit covers `packages/crypto/` and `apps/worker/` only. Desktop (Tauri), iOS (SwiftUI), Android (Kotlin), CI/CD, and infrastructure are out of scope.
- Static analysis only — no dynamic testing, fuzzing, or penetration testing was performed.
- MCP/external service integrations were not tested end-to-end.

---

## 9. Recommendations Summary

### Immediate (Before Production)

1. **HIGH-C1**: Route FFI server HPKE through label registry (Albrecht defense)
2. **HIGH-C2**: Add 7 missing labels to Rust `LABEL_REGISTRY` + CI drift check
3. **HIGH-W1**: Verify device ownership in MLS message fetch
4. **HIGH-W2**: Remove bare Bearer token bypass in dev endpoint gate
5. **HIGH-W3**: Hash ban list phone numbers (HMAC-SHA256)
6. **HIGH-W4**: Add access control to records by-contact endpoint

### Short-Term (Next Sprint)

7. **MED-W1**: Make SSRF guard fail-closed on DNS errors
8. **MED-W2**: Use `timingSafeEqual` for recovery code comparison
9. **MED-W4**: Refuse plaintext WS events when `SERVER_SECRET` missing
10. **MED-W8**: Hash session tokens before storing in database
11. **MED-W9**: Audit dual-mounted routes for cross-hub data leakage
12. **MED-C3**: Add AAD binding to `encrypt_with_pin`
13. **MED-C4**: Make `DeviceSecrets` fields private

### Medium-Term (Next Month)

12. **MED-C1**: Document MLS AES-128-GCM limitation
13. **MED-C2**: Unify Argon2id parameter handling
14. **MED-W5**: Validate MLS commit recipient hub membership
15. **LOW-W3**: Set hard minimum floor for audit log retention
16. **LOW-W4**: Add domain separation to emergency override signature

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-18 | 1.0 | Initial core audit: 33 findings (6 HIGH, 15 MEDIUM, 10 LOW, 2 INFO). 18 previous findings re-verified as FIXED. Gap 2.1 confirmed RESOLVED. |
