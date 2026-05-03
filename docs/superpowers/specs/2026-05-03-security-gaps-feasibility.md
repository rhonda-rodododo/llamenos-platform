# Security Gaps Feasibility Analysis

**Date:** 2026-05-03
**Branch:** `security-gaps-audit`
**Scope:** Feasibility analysis for closing the 6 acknowledged security gaps ("What We Do NOT Claim") plus additional findings discovered during investigation.
**Threat model:** Nation-state adversaries targeting crisis hotline volunteer identities.

---

## Gap 1: Traffic Analysis Resistance

**Current state:** Zero traffic analysis resistance implemented. All Nostr events are published on-demand with variable-length encrypted payloads and no padding or dummy traffic.

### What we found

- **Event publishing**: `apps/worker/lib/nostr-publisher.ts` — `NodeNostrPublisher` maintains a persistent WebSocket to strfry. Events are published immediately upon business logic triggers (calls, messages, presence). No batching, no intentional delays.
- **Encryption**: `apps/worker/lib/hub-event-crypto.ts:38-47` — XChaCha20-Poly1305 with 24-byte random nonce. Ciphertext length equals plaintext length exactly (plus 16-byte auth tag + 24-byte nonce). No padding.
- **Event kinds**: `packages/shared/nostr-events.ts` — 16 event kinds (12 regular, 2 ephemeral). All use identical tags `[["d", "global"], ["t", "llamenos:event"]]` — relay cannot distinguish event types (good), but ciphertext **length** reveals content class:
  - `call:ring` payload ~120 bytes
  - `message:new` payload ~100 bytes
  - `typing:indicator` payload ~80 bytes
- **Outbox poller**: `apps/worker/lib/nostr-outbox-poller.ts` — 30-second drain interval, 50-event batch. Timing of outbox drain is observable.
- **No existing padding/dummy/chaff infrastructure** anywhere in the codebase.

### Feasibility assessment

| Technique | Feasibility | Effort | Bandwidth cost |
|-----------|------------|--------|----------------|
| **Payload padding to fixed buckets** (512B, 1KB, 4KB) | EASY | 1-2 days | ~2-5x current |
| **Constant-rate dummy events** (e.g., 1 event/sec baseline) | MODERATE | 3-5 days | Significant — relay storage + client filtering |
| **OHTTP (Oblivious HTTP) for API calls** | HARD | 2-4 weeks | Requires relay proxy infrastructure |
| **Tor hidden service for relay** | HARD | 1-2 weeks | Adds 200-500ms latency per event |

### Recommended approach

**Phase 1 (EASY):** Pad all encrypted event payloads to nearest power-of-2 bucket before XChaCha20-Poly1305 encryption. Add padding in `encryptHubEvent()` (`hub-event-crypto.ts:38`), remove after decryption. This eliminates content-type inference from ciphertext length. Estimated 1 day.

**Phase 2 (MODERATE):** Add low-rate background cover traffic during quiet periods. Reuse the existing `TokenBucketRateLimiter` (`apps/worker/lib/rate-limiter.ts`) infrastructure. Generate synthetic events with valid structure but random content. Clients already handle decrypt failures (null return -> silent drop), so no client changes needed. Main cost is relay storage and bandwidth. Estimated 3-5 days.

**Phase 3 (HARD, deferred):** Tor hidden service or OHTTP for relay access to hide client IPs. This is a deployment architecture change, not a code change. Consider for post-launch.

### Rating: MODERATE
Payload padding is easy and high-value. Constant-rate traffic is feasible but operationally complex. Full traffic analysis resistance (Tor/OHTTP) is impractical pre-launch.

---

## Gap 2: Metadata Confidentiality

**Current state:** Server stores significant plaintext metadata needed for routing. Some metadata is already hashed (phone numbers, IPs), but gaps exist.

### What we found

**Already protected:**
- Caller phone numbers -> HMAC-SHA256 hash via `hashPhone()` (`apps/worker/lib/crypto.ts:15-19`), prefix `HMAC_PHONE_PREFIX`
- IP addresses -> HMAC-SHA256 truncated to 96 bits via `hashIP()` (`apps/worker/lib/crypto.ts:25-29`)
- Contact identifiers -> XChaCha20-Poly1305 encryption via `encryptContactIdentifier()` (`apps/worker/lib/crypto.ts:179-189`)
- Message content -> HPKE envelope encryption on webhook receipt (`apps/worker/lib/crypto.ts:111-137`)
- Call record metadata -> encrypted for admin via `encryptCallRecordForStorage()` (`apps/worker/lib/crypto.ts:147-170`)

**NEW FINDING — Plaintext full caller phone number in active calls:**
- `apps/worker/db/schema/calls.ts:24` — `callerNumber` column stores the **full plaintext phone number** in the `active_calls` table during call lifecycle. This directly contradicts the security documentation which states "Caller numbers are hashed on receipt." The hash is used for rate limiting and ban checks, but the original number persists in the active calls table.

**Other plaintext metadata:**
- `apps/worker/services/audit.ts:289-290` — **Country** (`CF-IPCountry`) and **User-Agent** stored plaintext in audit log details
- `apps/worker/routes/evidence.ts:207` — **User-Agent stored plaintext** in evidence custody chain entries
- `apps/worker/db/schema/calls.ts:25,54,251` — `callerLast4` (last 4 digits, plaintext) in call records
- `apps/worker/db/schema/conversations.ts:28,32,43` — `channelType`, `contactLast4`, `metadata` (JSONB, plaintext)
- `apps/worker/middleware/request-logger.ts:14-17` — HTTP method, path, status, duration (plaintext in logs)

**No Tor/onion references found** anywhere in the codebase.

### Feasibility assessment

| Reduction | Feasibility | Effort | Impact |
|-----------|------------|--------|--------|
| **Encrypt/hash `callerNumber` in active_calls** | EASY | 1 day | Eliminates plaintext phone storage |
| **Hash User-Agent before audit storage** | EASY | 0.5 day | Eliminates browser fingerprinting in logs |
| **Remove country from audit logs** | EASY | 0.5 day | No operational value vs. privacy cost |
| **Tor hidden service for client API** | HARD | 2-4 weeks | Hides client IPs entirely |
| **Onion routing for API calls** | IMPRACTICAL | Months | Requires custom mix network |

### Recommended approach

**Immediate fixes:**
1. Remove `callerNumber` plaintext column from `active_calls` — use only `callerHash` and `callerLast4` for routing. The full number is only needed transiently during the telephony webhook handler, not stored.
2. Hash User-Agent before writing to audit logs and evidence custody entries.
3. Remove `country` (GeoIP) from audit log details — it's fingerprinting data with no operational value for a crisis hotline.
4. Extend IP hash from 96-bit truncation to full 256-bit HMAC-SHA256 (prevents birthday-attack correlation).

**Medium-term:** Evaluate Cloudflare Tunnel or WireGuard for relay access to reduce IP exposure to the relay operator.

### Rating: EASY (for metadata reduction), HARD (for full confidentiality)
Significant metadata reduction is achievable in 2-3 days. Full metadata confidentiality (hiding IPs from the server) requires architectural changes.

### Additional finding: `callerNumber` plaintext storage

**Severity: HIGH** — This is a new finding not in the existing audit. The `active_calls` table stores the full caller phone number in plaintext (`apps/worker/db/schema/calls.ts:24`). The security documentation and threat model state that caller numbers are "hashed on receipt," but the hash is used only for rate limiting keys while the original number persists in the database during the call lifecycle. For a crisis hotline protecting callers from nation-state adversaries, this is a significant gap.

---

## Gap 3: SMS/WhatsApp Transport E2EE

**Current state:** Messages are E2EE at rest (HPKE envelope encryption per recipient). The gap is the transit leg — SMS/WhatsApp providers see plaintext during delivery.

### What we found

**Messaging adapter architecture** (`apps/worker/messaging/`):
- 5 channel adapters: SMS (Twilio), WhatsApp (Meta/Twilio), Signal, RCS (Google RBM), Telegram
- All adapters implement `MessagingAdapter` interface (`apps/worker/messaging/adapter.ts:1-77`)
- **Inbound flow**: Webhook -> parse -> `encryptMessageForStorage()` -> plaintext discarded
  - SMS: `apps/worker/messaging/sms/twilio.ts:34-64` — form-encoded POST
  - WhatsApp: `apps/worker/messaging/whatsapp/adapter.ts:88-245` — JSON payload
  - Signal: `apps/worker/messaging/signal/adapter.ts:50-103` — JSON from bridge
- **Outbound flow**: `plaintextForSending` in request body -> adapter -> provider API
  - Server sees plaintext momentarily (~100-500ms in memory)
  - Provider sees and may log plaintext indefinitely

**Signal notifier sidecar** (`signal-notifier/`):
- Standalone service with SQLite, isolated from main app
- Zero-knowledge: main server never sees plaintext phone numbers for Signal contacts
- Registration: time-limited HMAC tokens (`apps/worker/services/user-notifications.ts:181-186`), plaintext identifier sent only to sidecar
- Dispatch: main server sends `identifierHash` + message to sidecar (`signal-notifier/src/routes.ts:56-78`); sidecar resolves hash -> plaintext -> Signal bridge
- **Gap**: Sidecar SQLite stores plaintext identifiers unencrypted on disk

**No Signal-first priority logic exists.** All channels are treated equally. Channel selection is determined by the inbound channel — outbound replies use the same channel.

### Feasibility assessment

| Approach | Feasibility | Effort | Privacy gain |
|----------|------------|--------|-------------|
| **Signal-first delivery preference** | EASY | 2-3 days | Routes sensitive content to E2EE channel |
| **SMS notification-only mode** ("check the app") | MODERATE | 3-5 days | Eliminates message content on SMS |
| **Encrypt SMS content** (recipient needs app) | IMPRACTICAL | N/A | Defeats SMS accessibility |
| **Sidecar SQLite encryption** (SQLCipher) | EASY | 1 day | Protects identifiers at rest |
| **WhatsApp E2EE** via Cloud API | IMPRACTICAL | N/A | Meta's Business API doesn't support it |

### Recommended approach

1. **Signal-first delivery** (EASY): Add a `preferSignalIfAvailable` flag per hub. Before outbound send, check if recipient has a registered Signal identifier. If so, route via Signal sidecar. Fallback to SMS/WhatsApp only if Signal unavailable.

2. **SMS notification-only mode** (MODERATE): Add `smsMode: 'full' | 'notification-only'` to hub config. In notification-only mode, outbound SMS sends only "You have a new message -- open Llamenos" instead of actual content. Inbound SMS still accepted and encrypted normally.

3. **Sidecar SQLite encryption** (EASY): Add SQLCipher or column-level encryption to `signal-notifier/src/store.ts:37-42`. Key derived from `NOTIFIER_API_KEY` via HKDF.

### Rating: MODERATE
Signal is the only truly E2EE channel. SMS/WhatsApp transport encryption is inherently impossible due to provider architecture. The strategy should be: maximize Signal usage, minimize SMS content exposure, accept the residual risk for channels that require provider plaintext.

---

## Gap 4: Nostr Relay Metadata Privacy

**Current state:** Already being addressed by the Nostr Security Hardening spec (`docs/superpowers/specs/2026-05-03-nostr-security-hardening.md`). That spec identifies 3 critical, 5 high, and 5 medium findings.

### What the hardening spec already covers

**Critical (P0):**
- C1: Single server event key shared with ALL users across ALL hubs — no per-hub scoping (`apps/worker/routes/auth.ts:153-154`)
- C2: Client doesn't verify event publisher identity — `event.pubkey !== serverPubkey` check missing (`src/client/lib/nostr/relay.ts:275-278`)
- C3: Production strfry write policy not enforced — open relay accepts events from anyone (`deploy/docker/strfry-prod.conf:46-49`)

**High (P1):**
- H1: `SERVER_NOSTR_SECRET` is single point of catastrophic failure
- H2: Hub key in JavaScript memory (not in Rust CryptoState)
- H3: No replay protection beyond 5-minute deduplication
- H4: NIP-42 auth doesn't wait for relay confirmation
- H5: No forward secrecy for event encryption key

### Additional relay privacy measures

| Measure | Feasibility | Effort | Notes |
|---------|------------|--------|-------|
| **Per-hub event keys** (C1 fix) | EASY | 2-3 days | Already recommended in hardening spec |
| **Strfry write-policy plugin** (C3 fix) | EASY | 1 day | Lua script whitelisting server pubkey |
| **Tor/I2P relay access** | HARD | 2-4 weeks | Hides client IPs from relay |
| **Relay federation** (multiple relays) | MODERATE | 1-2 weeks | Distributes trust across relays |
| **Mix network for event delivery** | IMPRACTICAL | Months | Academic research, no production libraries |
| **Cover traffic** | MODERATE | 3-5 days | Masks operational tempo |
| **Move hub key decrypt to Rust** (H2 fix) | MODERATE | 3-5 days | Prevents webview key extraction |

### Rating: MODERATE (incremental) / HARD (full privacy)
The hardening spec's Phase 1 (C1-C3 fixes) should be implemented first — these are the highest-value improvements. Relay metadata privacy beyond that requires Tor integration or mix networks, which are HARD.

---

## Gap 5: PIN Brute-Force Resistance (Offline)

**Current state:** PBKDF2-SHA256 with 600,000 iterations, 6-8 digit PIN. Client-side lockout with escalating delays and key wipe at 10 attempts.

### What we found

**Key derivation** (`packages/crypto/src/device_keys.rs`):
- Algorithm: PBKDF2-HMAC-SHA256
- Iterations: 600,000 (line 23)
- Salt: 32 bytes random (line 228-229)
- Output: AES-256-GCM key encrypting 64-byte key material (Ed25519 + X25519 seeds)
- PIN validation: 6-8 ASCII digits only (`is_valid_pin()`, line 268-271)

**Brute-force estimates:**

| PIN length | Keyspace | PBKDF2-600K @ 1 att/sec | GPU (10K att/sec) | ASIC (1M att/sec) |
|-----------|----------|------------------------|-------------------|-------------------|
| 6 digits | 10^6 | ~11.5 days | ~1.7 minutes | ~1 second |
| 8 digits | 10^8 | ~3.2 years | ~2.8 hours | ~1.7 minutes |

**Client-side lockout:**
- Desktop (`apps/desktop/src/crypto.rs:98-160`): Escalating delays -> key wipe at 10 attempts. **CRITICAL: Lockout counter stored in plain JSON** (`settings.json` via Tauri Store) — bypassable with filesystem access (confirmed HIGH-D3).
- iOS (`apps/ios/Sources/ViewModels/PINViewModel.swift:27-44`): Same escalation. Counter in iOS Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). More secure than desktop.
- Android (`apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt:138-150`): Same escalation. Counter in `EncryptedSharedPreferences` with StrongBox/TEE backing. Most secure implementation.

**No server-side PIN rate limiting exists.** PIN validation is entirely client-side.

**Argon2id:** Not used. The `@noble/hashes` package in node_modules has Argon2id, but it's not integrated into `packages/crypto/`. The Rust ecosystem has `argon2` crate available.

### Feasibility assessment

| Improvement | Feasibility | Effort | Security gain |
|-------------|------------|--------|---------------|
| **Migrate to Argon2id** in packages/crypto | MODERATE | 3-5 days | 3-5x harder GPU/ASIC attack |
| **Support passphrases** (not just PIN) | EASY | 1-2 days | Exponential entropy increase |
| **Desktop lockout in Stronghold** (fix HIGH-D3) | EASY | 1 day | Lockout counter tamper-resistant |
| **iOS Secure Enclave for key wrap** | MODERATE | 2-3 days | Hardware-bound key, impossible to extract |
| **Server-side rate limiting on unlock** | MODERATE | 2-3 days | Prevents multi-device parallel attacks |
| **Increase PBKDF2 to 1M iterations** | EASY | 0.5 day | ~1.67x slower brute-force |
| **Require 8-digit minimum** | EASY | 0.5 day | 100x larger keyspace vs 6-digit |

### Recommended approach

**Immediate (pre-launch):**
1. **Require 8-digit minimum PIN** — simple config change in `is_valid_pin()`. 100x improvement over 6-digit.
2. **Fix HIGH-D3** — migrate desktop PIN lockout counter to Tauri Stronghold. Already recommended in the March audit.
3. **Increase PBKDF2 to 1,000,000 iterations** — trivial change, backward-compatible (existing encrypted blobs store their iteration count).

**Medium-term:**
4. **Support optional passphrase** — allow alphanumeric PINs/passphrases alongside numeric PINs. `is_valid_pin()` already validates length; extend to accept 12+ character strings.
5. **Argon2id migration** — replace PBKDF2 with Argon2id (m=64MB, t=3, p=1). Add version byte to stored key blob for backward compatibility. The `argon2` Rust crate is well-maintained and audited.

**Post-launch:**
6. **iOS Secure Enclave** — use `SecKeyCreateRandomKey` with `.accessibleWhenUnlockedThisDeviceOnly` to create a hardware-bound wrapping key. The PIN-derived KEK wraps a Secure Enclave key reference, not the raw device key.
7. **Server-side unlock rate limiting** — require a server-issued nonce for PIN unlock attempts. Server tracks attempts per device, returns 429 after threshold.

### Rating: EASY (immediate improvements) / MODERATE (Argon2id + hardware enclaves)
The 6-digit PIN is the weakest link. Requiring 8 digits + increasing PBKDF2 iterations are trivial changes that provide 100-167x improvement. Argon2id provides the strongest long-term improvement against GPU/ASIC attacks.

---

## Gap 6: Deletion Verification

**Current state:** No cryptographic erasure mechanism. Data deletion relies on PostgreSQL `DELETE` statements and operator trust.

### What we found

**Hub deletion** (`apps/worker/services/settings.ts:1525-1653`):
- Comprehensive cascade delete across 40+ tables within a database transaction
- Deletes: users, conversations, cases, evidence, contacts, shifts, calls, blasts, crypto keys
- Hub keys and settings deleted via CASCADE constraints
- **Positive**: Clean implementation, no orphaned records

**Data retention** (`apps/worker/lib/ttl.ts`):
- Admin-configurable TTLs with validation (max 365 days)
- Automatic cleanup on 15-minute interval
- Categories: CAPTCHA (5m), rate limits (2m), sessions (immediate), provisioning rooms (5m), invites (30d), file uploads (24h), blast queues (7d)

**Hub key lifecycle** (`docs/epics/epic-366-hub-key-lifecycle-fix.md`):
- Epic 366 documents that hub key lifecycle tests are currently FAILING
- `setHubKeyEnvelopes` uses replace-all transaction (correct for revocation)
- But no automatic re-wrapping on key rotation

**GDPR compliance gap:** No explicit "right to be forgotten" endpoint. Admins configure TTLs but cannot force immediate erasure of all user-scoped data on demand.

### Cryptographic erasure feasibility

The key insight: **if all data for a hub is encrypted under the hub key, destroying the hub key makes all data cryptographically unrecoverable.** Llamenos already has the building blocks:

1. **Hub key**: Random 32 bytes, HPKE-wrapped per member (`LABEL_HUB_KEY_WRAP`)
2. **Per-note keys**: Random per note, HPKE-wrapped for author + admins
3. **Hub event key**: Derived from hub key via HKDF

**But:** Not all hub data is encrypted under the hub key. Call metadata (timestamps, durations, `answeredBy`) is plaintext. Audit logs are plaintext. These cannot be cryptographically erased.

| Approach | Feasibility | Effort | What it covers |
|----------|------------|--------|----------------|
| **Hub key destruction** -> E2EE data unrecoverable | EASY | 1 day | Notes, messages, files, reports, CMS data |
| **Encrypt all metadata under hub key** | HARD | 2-4 weeks | Call metadata, audit logs — but routing breaks |
| **Formal GDPR erasure endpoint** | MODERATE | 3-5 days | DELETE cascade + hub key destruction + audit record |
| **Crypto-shredding with key escrow** | MODERATE | 1-2 weeks | Hub key backed up to admin, destroyed on demand |
| **Verifiable deletion** (append-only log) | HARD | 2-4 weeks | Proves deletion happened, not that data is gone |

### Recommended approach

1. **Crypto-shredding for E2EE data** (EASY): When a hub is deleted, explicitly destroy all hub key envelopes and the hub key material. Since notes, messages, and files are encrypted under keys that are themselves wrapped with the hub key or per-user keys, destroying the wrapping keys makes the data unrecoverable even if ciphertext blobs persist on backup media.

2. **Formal GDPR erasure endpoint** (MODERATE): `DELETE /api/admin/hubs/:id/gdpr-erase` that:
   - Destroys all hub key envelopes (crypto-shred)
   - Executes the existing cascade delete
   - Creates a signed audit log entry recording the erasure (the audit entry itself must survive)
   - Returns a signed attestation document

3. **Encrypt call metadata under hub key** (HARD, deferred): Move `answeredBy`, `callerLast4`, timestamps into encrypted metadata fields. This requires significant routing architecture changes since the server needs these for call routing.

### Rating: MODERATE
Crypto-shredding is straightforward given the existing key hierarchy. True deletion verification (proving the hosting provider deleted data) remains IMPRACTICAL — this is a fundamental limitation of any cloud-hosted system. The best achievable outcome is: *even if the hosting provider retains the data, it is cryptographically unreadable.*

---

## Additional Security Findings

### NEW-1 (HIGH): Full caller phone number stored plaintext in `active_calls`

**File:** `apps/worker/db/schema/calls.ts:24`
**Description:** The `callerNumber` column in `active_calls` stores the full plaintext phone number. The security documentation states numbers are "hashed on receipt," but the hash is used only for rate limiting while the original persists in the database.
**Impact:** A database breach during active calls exposes caller phone numbers in plaintext. For a crisis hotline, this directly endangers callers.
**Fix:** Remove `callerNumber` column. Use only `callerHash` (for ban checks) and `callerLast4` (for display). The full number is needed only transiently during the telephony webhook handler — hold it in memory, never persist.

### NEW-2 (MEDIUM): User-Agent and country stored plaintext in audit logs

**Files:** `apps/worker/services/audit.ts:289-290`, `apps/worker/routes/evidence.ts:207`
**Description:** The `details` JSONB field in audit log entries includes plaintext `country` (from `CF-IPCountry` header) and `ua` (User-Agent string). Evidence custody entries also store plaintext User-Agent.
**Impact:** Browser fingerprinting data persists indefinitely in the database. Under the nation-state threat model, User-Agent + country narrows volunteer identification.
**Fix:** Hash User-Agent before storage. Remove country entirely (no operational value). Evidence custody should log only device type category, not full User-Agent string.

### NEW-3 (MEDIUM): Hub key lifecycle tests failing (Epic 366)

**File:** `docs/epics/epic-366-hub-key-lifecycle-fix.md`
**Description:** Hub key rotation tests are documented as FAILING. The `PUT /hubs/:id/key` endpoint's expected envelope format doesn't match step definitions.
**Impact:** Hub key rotation on member departure — the primary defense against departed users — may not function correctly.
**Fix:** Resolve Epic 366. This is a blocker for the hub key destruction approach recommended in Gap 6.

### NEW-4 (LOW): Nostr event encryption conditional on `SERVER_NOSTR_SECRET`

**File:** `apps/worker/lib/nostr-events.ts:13-21`
**Description:** If `SERVER_NOSTR_SECRET` is not configured, event content is published as plaintext JSON. No validation enforces that the secret must be set in production.
**Impact:** A misconfigured deployment exposes all real-time event data (call notifications, messages, presence) in plaintext on the relay.
**Fix:** Add a startup check that fails if `SERVER_NOSTR_SECRET` is not set when `ENVIRONMENT !== 'development'`.

### Additional scan results (no issues found)

| Area | Status | Notes |
|------|--------|-------|
| **SSRF protections** (`apps/worker/lib/ssrf-guard.ts`) | Strong | Blocks loopback, private, link-local, CGNAT, reserved IPv4/IPv6 |
| **CSP** (`apps/desktop/tauri.conf.json:20-32`) | Strong | Restrictive `default-src`, `script-src 'self'`, `object-src 'none'`, `form-action 'none'` |
| **CORS** (`apps/worker/middleware/cors.ts`) | Correct | Whitelist-based with Tauri origins, proper `Vary: Origin` |
| **SQL injection** | Safe | All queries use Drizzle ORM parameterized `sql` tag, no raw string concatenation |
| **Code injection** (dynamic eval patterns) | None found | React sanitization throughout |
| **Hardcoded secrets** | None found | All credentials via environment variables |
| **Auth rate limiting** (`apps/worker/routes/auth.ts`) | Good | Login: 10/IP, Bootstrap: 5/IP (hashed IP) |
| **Unvalidated redirects** | None found | All redirect targets hardcoded or request-derived |
| **Webhook signatures** | Excellent | Constant-time comparison for all 5 telephony + 5 messaging adapters |

---

## Priority Ranking

Ordered by threat model impact (nation-state adversary targeting volunteer/caller identities) balanced against implementation effort.

### P0 — Must fix before any production deployment

| # | Gap | Action | Effort | Why |
|---|-----|--------|--------|-----|
| 1 | **NEW-1** | Remove plaintext `callerNumber` from `active_calls` | 1 day | Directly exposes caller PII; contradicts security documentation |
| 2 | **Gap 5** | Require 8-digit minimum PIN + increase PBKDF2 to 1M iterations | 0.5 day | 100-167x improvement in offline brute-force resistance |
| 3 | **Gap 5** | Fix HIGH-D3: migrate desktop lockout counter to Stronghold | 1 day | Lockout is currently bypassable on desktop |
| 4 | **Gap 4** | Per-hub event keys (Nostr hardening C1) | 2-3 days | Single key compromise = all hubs compromised |
| 5 | **Gap 4** | Strfry write-policy plugin (Nostr hardening C3) | 1 day | Open relay accepts events from anyone |

### P1 — Should fix before production

| # | Gap | Action | Effort | Why |
|---|-----|--------|--------|-----|
| 6 | **Gap 1** | Pad encrypted event payloads to power-of-2 buckets | 1 day | Eliminates content-type inference from length |
| 7 | **Gap 2** | Hash User-Agent, remove country from audit logs | 1 day | Reduces metadata fingerprinting surface |
| 8 | **Gap 3** | Signal-first delivery preference | 2-3 days | Routes content to E2EE channel when available |
| 9 | **Gap 3** | Encrypt sidecar SQLite (SQLCipher) | 1 day | Protects Signal identifiers at rest |
| 10 | **NEW-4** | Require `SERVER_NOSTR_SECRET` in production | 0.5 day | Prevents plaintext event publication |
| 11 | **Gap 6** | Implement crypto-shredding on hub deletion | 1-2 days | Makes deleted E2EE data unrecoverable |
| 12 | **NEW-3** | Resolve Epic 366 (hub key lifecycle tests) | 2-3 days | Blocker for hub key rotation correctness |

### P2 — Post-launch hardening

| # | Gap | Action | Effort | Why |
|---|-----|--------|--------|-----|
| 13 | **Gap 5** | Migrate to Argon2id for PIN derivation | 3-5 days | Strongest GPU/ASIC resistance |
| 14 | **Gap 5** | Support optional passphrase (12+ characters) | 1-2 days | Exponential entropy increase for advanced users |
| 15 | **Gap 3** | SMS notification-only mode | 3-5 days | Eliminates message content on SMS |
| 16 | **Gap 1** | Constant-rate cover traffic | 3-5 days | Masks operational tempo |
| 17 | **Gap 2** | Tor/Cloudflare Tunnel for relay access | 2-4 weeks | Hides client IPs |
| 18 | **Gap 6** | Formal GDPR erasure endpoint with signed attestation | 3-5 days | Compliance requirement |
| 19 | **Gap 5** | iOS Secure Enclave key wrapping | 2-3 days | Hardware-bound keys |
| 20 | **Gap 5** | Server-side PIN unlock rate limiting | 2-3 days | Prevents parallel device attacks |

### P3 — Future / research

| # | Gap | Action | Effort | Why |
|---|-----|--------|--------|-----|
| 21 | **Gap 1** | OHTTP or Tor hidden service for relay | Weeks | Full traffic analysis resistance |
| 22 | **Gap 2** | Encrypt all call metadata under hub key | Weeks | Full metadata confidentiality (breaks routing) |
| 23 | **Gap 4** | Relay federation / mix network | Weeks | Distributed relay trust |
| 24 | **Gap 6** | Verifiable deletion (append-only proof log) | Weeks | Proves deletion occurred |

---

## How `packages/crypto` Capabilities Apply

| Gap | Relevant crypto capability | How it helps |
|-----|---------------------------|-------------|
| **Gap 1** (traffic analysis) | XChaCha20-Poly1305 in `hub-event-crypto.ts` | Padding can be added before encryption with no algorithm change |
| **Gap 3** (SMS E2EE) | HPKE envelope encryption already wraps messages | Signal-first just routes to the E2EE channel; crypto is already correct |
| **Gap 4** (relay privacy) | HKDF with hub-specific salt | Per-hub event keys derivable via existing HKDF infrastructure |
| **Gap 5** (PIN) | PBKDF2 in `device_keys.rs` | Argon2id via `argon2` Rust crate is a drop-in replacement |
| **Gap 5** (PIN) | `is_valid_pin()` | Extending to support passphrases is a one-line change |
| **Gap 6** (deletion) | Hub key HPKE wrapping | Destroying key envelopes = crypto-shredding all hub E2EE data |
| **Gap 6** (deletion) | CLKR chain | PUK rotation already supports key generation retirement |

---

## Decisions to Review

### D1: Require 8-digit PIN minimum or allow 6-digit with server-side rate limiting?

**Chosen:** Require 8-digit minimum (simplest, highest impact).
**Alternative:** Keep 6-digit but add server-side rate limiting on PIN unlock attempts.
**Tradeoff:** 8-digit is 100x stronger offline with zero server dependency. Server-side rate limiting is more complex, requires network connectivity for unlock, and adds a failure mode (can't unlock device when offline). For a crisis hotline where volunteers may be in low-connectivity environments, offline-first security is paramount.

### D2: Argon2id vs. higher PBKDF2 iterations?

**Chosen:** Increase PBKDF2 to 1M iterations now; migrate to Argon2id post-launch.
**Alternative:** Migrate to Argon2id immediately.
**Tradeoff:** PBKDF2 increase is backward-compatible (iteration count stored in blob). Argon2id requires a version byte in the stored format and migration path for existing encrypted blobs. Since we're pre-production with no deployed devices, Argon2id migration has zero backward-compatibility cost — but it requires adding the `argon2` crate dependency and cross-platform testing.

### D3: Signal-first delivery vs. equal channel treatment?

**Chosen:** Signal-first with SMS/WhatsApp fallback.
**Alternative:** Let operators configure per-hub channel priority.
**Tradeoff:** Signal-first maximizes E2EE coverage automatically. Per-hub configuration is more flexible but requires admin understanding of E2EE implications. Recommendation: implement Signal-first as default behavior, allow per-hub override for operators who need specific channel ordering.

### D4: Crypto-shredding vs. physical deletion for GDPR erasure?

**Chosen:** Both — crypto-shred (destroy keys) + physical deletion (cascade DELETE).
**Alternative:** Physical deletion only.
**Tradeoff:** Physical deletion alone is insufficient — backup media, replication logs, and WAL files may retain data. Crypto-shredding ensures that even retained ciphertext is unreadable. Combined approach provides defense-in-depth: physical deletion removes from the database, crypto-shredding protects against backup retention.

### D5: Remove `callerNumber` column or encrypt it?

**Chosen:** Remove the column entirely.
**Alternative:** Encrypt `callerNumber` with a transient key that expires when the call ends.
**Tradeoff:** The column exists for routing convenience during active calls, but routing only needs `callerHash` (ban check) and `callerLast4` (display). The full number is needed only during the telephony webhook handler to create the hash and extract last-4. Encrypting adds complexity; removing is cleaner and eliminates the attack surface entirely.
