# Llamenos Threat Model

## Document Purpose

This document defines the threat model for Llamenos, a secure crisis response hotline app. It identifies adversaries, attack surfaces, trust boundaries, and the security properties the system must maintain. All architectural decisions and security controls are evaluated against this model.

**Related Documents**:
- [Security Overview](README.md) — Entry point for security auditors
- [Crypto Architecture](CRYPTO_ARCHITECTURE.md) — Cryptographic primitives, key hierarchy, protocols
- [Data Classification](DATA_CLASSIFICATION.md) — Complete data inventory with encryption status
- [Protocol Specification](../protocol/PROTOCOL.md) — Wire formats and API contracts
- [Deployment Hardening](DEPLOYMENT_HARDENING.md) — Infrastructure security guidance

## Protected Assets

| Asset | Classification | Storage Location | Protection |
|-------|---------------|-----------------|------------|
| Caller phone numbers | PII / Safety-Critical | Hashed in PostgreSQL | HMAC-SHA256 with operator secret; last 4 digits stored plaintext for display |
| Call note content | Confidential | Encrypted in PostgreSQL | E2EE: per-note AES-256-GCM, HPKE key wrapping (RFC 9180) |
| Volunteer identity (name, phone) | PII / Safety-Critical | Encrypted at rest in PostgreSQL | Visible only to admins; never exposed to other users or callers |
| Device private keys | Secret | Platform secure storage (Tauri Store / iOS Keychain / Android Keystore) | PBKDF2-SHA256 600K iterations + AES-256-GCM; private keys never leave Rust layer |
| Admin device keys | Secret | Operator-managed (platform secure storage, HSM) | Never stored server-side; separate signing and encryption keypairs |
| Session tokens | Secret | Client memory, PostgreSQL (server) | 256-bit random, 8-hour TTL, revocable |
| User sigchain | Integrity-Critical | PostgreSQL | Append-only, hash-chained, Ed25519-signed device authorization log |
| PUK seed | Secret | HPKE-wrapped per device, stored server-side | Per-user key hierarchy with cascading lazy key rotation (CLKR) |
| Hub key | Secret | HPKE-wrapped per member, client memory | Random 32 bytes; rotated on member departure |
| Audit logs | Operational | PostgreSQL | Admin-only access; IP hashes truncated to 96 bits; SHA-256 hash chain |
| Telephony credentials | Secret | Environment variables / Kubernetes Secrets | Never in source control; never sent to client |

## Adversary Profiles

### Tier 1: Nation-State Actor

**Capabilities**: TLS interception via national CA, ISP-level traffic analysis, physical device seizure, legal compulsion of hosting/cloud providers, advanced persistent threats against CI/CD, social engineering of developers/operators.

**Goals**: Identify callers (political dissidents, activists). Identify volunteers. Obtain call note content. Disrupt hotline operations.

**Mitigations**:
- E2EE notes with forward secrecy — per-note random key, HPKE-wrapped; server compromise reveals nothing
- Per-device Ed25519/X25519 keys — no single "identity key" to compromise; device deauthorization via sigchain
- PIN-encrypted device keys — physical seizure requires PIN brute-force (600K PBKDF2 iterations)
- Auto-lock on idle — limits physical access window
- 57 domain separation labels — prevents cross-context key reuse (Albrecht defense)
- HPKE label enforcement at decrypt — label mismatch causes immediate rejection before decryption
- Certificate pinning scaffolding (iOS/Android) — pins to be populated after first production deployment
- Sigchain device revocation — compromised devices can be deauthorized without affecting other devices

**Residual risks**:
- PIN entropy (6–8 digits, ~20–27 bits) is brute-forceable with seized encrypted blob + GPU resources
- Caller phone numbers are transiently available to answering volunteers during active calls
- Traffic analysis can reveal call timing, duration, and volunteer activity patterns
- Legal compulsion of hosting provider yields encrypted blobs (but not decryption keys)

### Tier 2: Private Intelligence / Hacking Firm

**Capabilities**: Targeted phishing, watering-hole attacks, 0-day browser exploits, insider recruitment, social engineering.

**Goals**: Same as Tier 1 but typically contracted by specific interests. May target individual volunteers or admins.

**Mitigations**:
- WebAuthn passkeys — phishing-resistant authentication
- Tauri isolation pattern — crypto operations in sandboxed Rust backend, never in webview
- CSP `script-src 'self'` — limits XSS payload injection
- Session revocation on role change/deactivation — compromised accounts can be cut off
- Invite-code system — no open registration; requires admin approval
- Webhook signature validation — prevents telephony API spoofing
- Device keys never enter webview — private keys stay in Rust CryptoState (desktop) or MobileState (iOS/Android)

### Tier 3: Opportunistic Attacker / Script Kiddie

**Capabilities**: Known CVE exploitation, credential stuffing, automated scanning.

**Goals**: Disruption, data theft, defacement.

**Mitigations**:
- Rate limiting on all auth endpoints
- Voice CAPTCHA for call spam
- SHA-pinned GitHub Actions
- `--frozen-lockfile` dependency installation
- HSTS preload + security headers
- Non-root container execution with `no-new-privileges`
- Single Rust crypto crate — minimal supply chain surface for cryptographic operations

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        UNTRUSTED                                │
│  Callers (PSTN)  │  Public Internet  │  Hosting Provider       │
└──────┬───────────┴────────┬──────────┴──────────┬──────────────┘
       │                    │                     │
       │ Telephony          │ HTTPS/WSS           │ Infrastructure
       │ Webhooks           │                     │ Access
       ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SEMI-TRUSTED                                   │
│  Bun HTTP Server (Hono) + PostgreSQL                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐      │
│  │ Hono API │→│ Auth MW  │→│ Perm MW  │→│ Route Handler │      │
│  └──────────┘ └──────────┘ └──────────┘ └───────┬───────┘      │
│                                                  │               │
│  ┌─────────────────────────────────────────────┐ │               │
│  │ PostgreSQL                                  │←┘               │
│  │ (encrypted blobs, hashed identifiers)       │                 │
│  └─────────────────────────────────────────────┘                 │
│                                                                   │
│  Server can see: metadata (who wrote, when, callId, routing)     │
│  Server CANNOT see: note content, transcription text, file data  │
└──────────────────────────────────────────────────────────────────┘
       │                    │
       │ E2EE payloads      │ HPKE-wrapped key blobs
       ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                       TRUSTED                                     │
│  Client App (Tauri Desktop / iOS / Android)                      │
│  ┌───────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Device Key│ │ Crypto (Rust)│ │ Auth Context │                │
│  │ Manager   │ │ HPKE+AES-GCM│ │ Ed25519/WA   │                │
│  └───────────┘ └──────────────┘ └──────────────┘                │
│                                                                   │
│  Decrypted notes exist ONLY here, in memory, while unlocked      │
│  Device private keys NEVER leave the Rust layer                  │
└──────────────────────────────────────────────────────────────────┘
```

### Boundary Rules

1. **PSTN → Server**: All telephony webhooks MUST be signature-validated (Twilio HMAC-SHA1, Vonage HMAC-SHA256, etc.). Caller numbers are hashed on receipt; only last-4 digits retained in call records.

2. **Internet → Server**: All API requests require Ed25519 or WebAuthn session authentication (except `/api/config`, `/api/auth/login`, `/api/auth/bootstrap`). CORS restricts to same-origin. Security headers enforced on all responses.

3. **Server → Client**: The server NEVER sends plaintext note content, transcription text, or file data. All sensitive data is HPKE-wrapped for the recipient's X25519 pubkey before storage.

4. **Client → Server**: The client sends HPKE-encrypted payloads only. Exception: `plaintextForSending` in messaging (SMS/WhatsApp require server-side plaintext to reach the provider — documented and accepted).

5. **Hosting Provider**: The hosting provider can access encrypted blobs, metadata, and traffic patterns. They CANNOT decrypt E2EE content without device private keys.

## Attack Surface Inventory

### External Attack Surface

| Surface | Entry Point | Auth Required | Validation |
|---------|------------|---------------|------------|
| Login | `POST /api/auth/login` | No | Ed25519 signature + rate limit |
| Bootstrap | `POST /api/auth/bootstrap` | No | Ed25519 signature + one-shot guard + rate limit |
| Config | `GET /api/config` | No | Read-only; exposes server Nostr pubkey |
| Telephony webhooks (10 endpoints) | `POST /telephony/*` | Webhook signature | Provider-specific HMAC |
| Messaging webhooks | `POST /messaging/*` | Webhook signature | Provider-specific validation |
| All other API endpoints | `*/api/*` | Ed25519 or Session | Auth + permission middleware |
| IVR audio | `GET /api/ivr-audio/*` | No | Strict regex on path params |
| Dev endpoints | `POST /api/test-*` | No (env-gated) | `ENVIRONMENT=development` check + `DEV_RESET_SECRET` |

### Internal Attack Surface (Post-Authentication)

| Surface | Risk | Mitigation |
|---------|------|------------|
| User → Admin escalation | Role modification | Safe-fields allowlist on self-update; `roles` requires `volunteers:update` permission |
| User → Other user's notes | Note content theft | E2EE — server has no plaintext; `notes:read-own` permission scoping; per-note HPKE wrapping |
| User → Caller identification | PII exposure | Caller numbers hashed; only `callerLast4` sent to answering volunteer; redacted for others |
| Admin → Excessive data access | Insider threat | Audit logging of all admin actions; admin notes are separately encrypted |
| Nostr relay event injection | Fake call events | Server-signed events (clients verify server pubkey) + NIP-42 auth + hub key encryption |
| Device compromise → Other devices | Lateral movement | Sigchain-based device authorization — compromised device can be deauthorized without affecting others |

## Cryptographic Properties

### What We Guarantee

| Property | Mechanism | Strength |
|----------|-----------|----------|
| Note confidentiality | AES-256-GCM with random per-note key | 256-bit symmetric |
| Note integrity | GCM authentication tag | 128-bit |
| Note forward secrecy | HPKE encapsulation per note + per recipient | X25519 |
| Key-at-rest confidentiality | PBKDF2-SHA256 (600K iter) + AES-256-GCM | ~20–27 bits PIN + 256-bit key |
| Auth token unforgeability | Ed25519 signatures | 128-bit security level |
| Session token unpredictability | `crypto.getRandomValues(32)` | 256-bit |
| Phone hash preimage resistance | HMAC-SHA256 with operator secret | Infeasible without HMAC secret |
| Cross-context key reuse prevention | 57 domain separation labels + Albrecht defense | Label enforced at decrypt |
| Device authorization integrity | Sigchain — append-only, hash-chained, Ed25519-signed | Tamper-evident |
| User key forward secrecy | PUK with CLKR — key rotation without re-encrypting historical data | Per-generation isolation |

### What We Do NOT Guarantee

| Gap | Reason | Acceptable? |
|-----|--------|------------|
| Traffic analysis resistance | No padding, no dummy traffic | Yes — impractical for a native app + API architecture |
| Metadata confidentiality | Server needs `callId`, `authorPubkey`, timestamps for routing | Yes — documented trade-off |
| SMS/WhatsApp E2EE | Provider requires plaintext | Yes — documented per-channel |
| PIN brute-force resistance (offline) | 6–8 digit PIN, ~1M–100M possibilities | Adequate with PBKDF2 rate-limiting |
| Server-side key deletion verification | Cannot prove hosting provider deleted data | Yes — fundamental cloud trust limitation |
| Nostr relay metadata privacy | Relay can observe event metadata (IPs, timing, sizes) | Yes — content encrypted; only metadata visible |

## Legal Compulsion and Subpoena Scenarios

This section documents what data can be obtained through legal process against various parties. Crisis hotlines operating in hostile legal environments should understand these limitations.

### Subpoena of Hosting Provider (VPS)

**Obtainable:**
- Encrypted database contents (ciphertext for E2EE data)
- Plaintext metadata: call timestamps, durations, volunteer assignments, call IDs
- Caller phone hashes (irreversible without operator's HMAC secret)
- Audit logs with truncated IP hashes
- Traffic metadata (request times, sizes, source IPs)
- Account information for the operator

**Not Obtainable:**
- Note content, transcription text, report bodies (E2EE — provider has ciphertext only)
- Device private keys (stored client-side in platform secure storage, never uploaded)
- Per-note encryption keys (ephemeral, never persisted)
- PUK seeds (HPKE-wrapped for each device — server has ciphertext only)
- Operator's HMAC secret (not stored with hosting provider)

### Subpoena of Telephony Provider (Twilio, SignalWire, etc.)

**Obtainable:**
- Call detail records (timestamps, phone numbers, durations)
- Call recordings (if recording is enabled — **Llamenos does NOT enable recording by default**)
- SMS message content (passes through provider in plaintext)
- WhatsApp message content (passes through Meta)
- Account and billing information

**Not Obtainable:**
- Call notes (never sent to telephony provider)
- Volunteer identities beyond phone numbers used for call routing
- Any E2EE content

### Device Seizure (Volunteer)

**Without PIN:**
- Encrypted key blob in platform secure storage requires PIN brute-force
- 600,000 PBKDF2 iterations + 6–8 digit PIN = estimated hours to weeks on GPU hardware
- Session tokens may still be valid if device was recently used (8-hour TTL)
- Sigchain is public (device pubkeys are visible) but does not contain private keys

**With PIN (or successful brute-force):**
- Access to that user's decrypted notes (via author envelope)
- Cannot decrypt other users' notes (separate keypairs, per-note HPKE wrapping)
- Per-note forward secrecy: compromising device key requires also obtaining the per-note HPKE envelopes from the server
- PUK seed for current generation — can walk CLKR chain to decrypt historical notes

**Mitigations:**
- Enable device full-disk encryption
- Use 8-digit PIN (not 6-digit)
- Enable auto-lock on shorter timeout
- Admin can remotely deauthorize device via sigchain + revoke sessions
- Hub key rotation on departure excludes seized device

### Device Seizure (Admin)

**Impact if admin device keys are obtained:**
- Can decrypt all notes (admin envelope exists on every note)
- Can decrypt all messages (admin envelope on every message)
- Cannot impersonate other users (separate device keypairs)

**Mitigations:**
- Store admin device on hardened platform with strong PIN/biometrics
- Use YubiKey or similar for admin WebAuthn authentication
- Implement admin key rotation procedures (see [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md))
- Consider hardware security module (HSM) for admin key storage

### Insider Threat (Malicious Operator)

A malicious operator with server access can:
- Read all plaintext metadata
- Modify server code to capture data before encryption (requires deployment access)
- Access HMAC secret to reverse phone hashes
- Cannot decrypt E2EE content without device private keys

**Mitigations:**
- Reproducible builds allow verification of deployed code
- Multi-party deployment approval
- Audit logging of all server access
- Sigchain provides tamper-evident record of device authorizations

## Deployment-Specific Threats

### Self-Hosted Deployment (Docker Compose / Kubernetes)

- **Operator as trusted party**: The operator has full access to the server, database, and secrets. They cannot read E2EE content without device private keys.
- **VPS provider access**: The hosting provider can image the VM, access disk, and intercept network traffic. TLS + E2EE provides defense-in-depth.
- **PostgreSQL security**: Database credentials, TLS for connections, encrypted backups are the operator's responsibility.
- **Reverse proxy configuration**: Caddy provides TLS termination and security headers. Misconfiguration (e.g., HTTP without redirect) would expose session tokens.

### Kubernetes Deployment

- **NetworkPolicy enforcement**: Requires a CNI that supports NetworkPolicy (Calico, Cilium). Without enforcement, pod-to-pod traffic is unrestricted.
- **Secret management**: Kubernetes Secrets are base64-encoded, not encrypted, unless etcd encryption is configured. Use External Secrets Operator or Vault for production.
- **Pod security**: `runAsNonRoot`, `readOnlyRootFilesystem`, `drop: ALL` capabilities enforced in the Helm chart.

## Push Notification Infrastructure (APNs/FCM) as Trusted Parties

Mobile push notifications require routing through Apple Push Notification service (APNs) and Google Firebase Cloud Messaging (FCM). These are platform-mandated intermediaries.

### What APNs/FCM Can Observe

| Observable | Detail | Severity |
|-----------|--------|----------|
| Device tokens | Unique per-device identifier registered with the push service | Medium |
| Push timing | Exact timestamp of every notification delivery | High |
| Push metadata | Message size, priority level, collapse keys | Medium |
| Delivery receipts | Whether the notification was delivered, opened, or dismissed | Low |

### What APNs/FCM Cannot Observe (With Encrypted Payloads)

Push payloads are encrypted with a per-device wake key (symmetric, HPKE-wrapped for the device's X25519 pubkey). APNs/FCM see an opaque blob and a priority level.

### Two-Tier Push Encryption

- **Tier 1 (Wake Key)**: No PIN required. Contains notification type, resource ID, display-safe preview. Sufficient to show "Incoming call" without decrypting E2EE content.
- **Tier 2 (Device Key)**: PIN required. Full message content, caller details, sensitive data. App prompts for PIN unlock.

### Residual Risk: Activity Pattern Analysis

A sophisticated adversary with APNs/FCM access can infer hotline activity windows, call volume, and volunteer shift patterns from push notification timing. This is an inherent limitation of mobile push infrastructure. Organizations under extreme threat models should consider foreground-only operation (no push notifications).

## Admin Pubkey Fetch Trust

The client fetches admin pubkeys from the server (`GET /api/auth/me`). If an attacker performs MITM and substitutes their own pubkey, volunteers would unknowingly encrypt admin envelopes for the attacker.

### Current Mitigation

Admin pubkeys are only returned to authenticated users. The attacker must compromise the TLS connection to an already-authenticated session OR compromise the server itself.

### Defense-in-Depth Recommendations

1. **Build-time pubkey pinning**: Embed SHA-256 hash of expected admin pubkey in client bundle. Requires two-point compromise (API response + served JS).
2. **Out-of-band verification**: Display admin pubkey fingerprint in admin UI for manual verification via secure side channel.
3. **Subresource Integrity (SRI)**: SRI hashes on client bundle protect pinned hash in transit.

### Residual Risk

A server compromise can serve modified client code that removes the pinning check. This is a fundamental limitation of any application that receives code from a server. Native apps with code signing (Tauri updater, App Store) partially address this but introduce their own supply chain risks.

## Departed User Key Retirement

When a user departs the organization, they retain their device private keys. There is no technical mechanism to force deletion of keys from a device the organization no longer controls.

### What a Departed User CAN Do

| Action | Reason | Severity |
|--------|--------|----------|
| Decrypt notes they authored | They hold the author envelope key | Low — they wrote these notes |
| Walk their CLKR chain for historical PUK generations | They hold the current PUK seed | Low — historical access during their tenure |
| Prove they were a member | Their sigchain is published | Medium — depending on context |

### What a Departed User CANNOT Do

| Action | Reason |
|--------|--------|
| Decrypt new hub events | Hub key rotated on departure; new key not distributed to them |
| Decrypt other users' notes | They never had those HPKE envelope keys |
| Decrypt notes created after departure | New notes use keys they don't possess |
| Access the application | Sessions revoked; WebAuthn credentials revoked; device deauthorized via sigchain |

### Hub Key Rotation as Primary Defense

When a user departs:
1. Admin deactivates the user and revokes sessions
2. Device deauthorized via sigchain entry
3. New hub key generated and HPKE-wrapped for remaining members (label: `LABEL_HUB_KEY_WRAP`)
4. PUK rotated — departed user excluded from new seed distribution
5. Old hub key retained by clients for historical event decryption
6. Departed user excluded from all new key distributions

## SMS/WhatsApp Outbound Message Limitation

Outbound messages via SMS and WhatsApp are **not zero-knowledge**. The server sees plaintext momentarily during the send flow. This is an inherent limitation of these messaging channels, not a bug.

### Channel Comparison

| Channel | Server Sees Plaintext? | Provider Sees Plaintext? | True E2EE Possible? |
|---------|----------------------|--------------------------|---------------------|
| In-app notes | No | N/A | Yes (current) |
| In-app messaging (Nostr) | No | N/A | Yes (current) |
| SMS outbound | Yes (momentarily) | Yes (stored by provider) | No |
| WhatsApp outbound (Business API) | Yes (momentarily) | Yes (Meta can read) | No |
| Signal outbound (via signal-notifier sidecar) | No (sidecar handles) | No (Signal protocol E2EE) | Yes |

The Signal notification sidecar (`signal-notifier/` on port 3100) provides true E2EE: it resolves contacts via HMAC-hashed identifiers (zero-knowledge) and re-encrypts via Signal protocol.

## Rust Crypto Supply Chain

All cryptographic operations are implemented in `packages/crypto/` (Rust), eliminating npm as the supply chain surface for crypto. The Rust crate uses audited RustCrypto dependencies.

### Critical Rust Dependencies

| Crate | Purpose | Risk if Compromised |
|-------|---------|-------------------|
| `hpke` 0.13 | RFC 9180 key encapsulation | Key theft, AEAD backdoor |
| `ed25519-dalek` v2 | Ed25519 signing | Signature forgery |
| `x25519-dalek` v2 | X25519 key agreement | Key agreement backdoor |
| `aes-gcm` 0.10 | AES-256-GCM encryption | Plaintext recovery |
| `openmls` 0.8 | MLS group management | Group key compromise |

### Mitigations

- `Cargo.lock` ensures reproducible builds
- Single crate compiled for all platforms — one audit target
- No npm crypto dependencies in production (legacy `@noble/*` being phased out)
- `bun audit` / `cargo audit` in CI pipeline
- SHA-pinned GitHub Actions
- Bun does not run postinstall scripts by default

## Nostr Relay Trust Boundary

The Nostr relay (strfry, self-hosted) handles all real-time event delivery.

### What the Relay Can Observe

| Observable | Detail | Severity |
|-----------|--------|----------|
| Event metadata | Pubkeys (pseudonymous), timestamps, event kinds | Medium |
| Connection metadata | IP addresses, connection timing, duration | Medium |
| Event sizes | Ciphertext length reveals approximate content size | Low |
| Generic tags | All events use `["t", "llamenos:event"]` — relay cannot distinguish event types | Low |

### What the Relay Cannot Observe

| Protected | Mechanism |
|-----------|-----------|
| Event content | Encrypted with hub event key (AES-256-GCM + HKDF from hub key) |
| Event type | Actual type (call:ring, presence, typing) is inside encrypted content |
| User identity | Pubkeys are pseudonymous; relay has no mapping to real identities |

## Audit Log Tamper Detection

Audit logs use a SHA-256 hash chain with `previousEntryHash` → `entryHash` linking.

**Protects against**: Silent entry deletion, entry modification, entry reordering.

**Does NOT protect against**: Log truncation from the end, complete log replacement by an attacker with full DB access, operator collusion (could disable logging entirely).

**Mitigation for advanced threats**: Periodically export and sign audit log checkpoints to an external append-only store.

## Admin Key Separation

The admin has separate keys for different operations:

| Key | Purpose | Compromise Impact |
|-----|---------|------------------|
| Ed25519 signing key | Authentication, signing events, hub administration | Can impersonate admin; encrypted content remains protected |
| X25519 encryption key | HPKE envelope unwrapping (notes, messages, metadata) | Can decrypt all admin-wrapped envelopes; cannot impersonate |
| Both | Full admin compromise | Equivalent to pre-separation compromise |

## Reproducible Builds

Verification via `scripts/verify-build.sh [version]`:

| Verification | What It Proves | What It Does NOT Prove |
|-------------|---------------|----------------------|
| Script passes | Client JS/CSS bundles match source | That the deployed server is serving those bundles |
| `CHECKSUMS.txt` matches | File integrity between build and release | That the release was built from unmodified source |
| SLSA provenance | Build ran in a specific GitHub Actions workflow | That the Actions environment was not compromised |

Trust anchor is the **GitHub Release**, not the running application.

## Client-Side Transcription

Audio from the volunteer's microphone is processed entirely in-browser/in-app:
- Captured via AudioWorklet ring buffer
- Processed in Web Worker using WASM Whisper (`@huggingface/transformers` ONNX runtime)
- Transcript encrypted immediately with the note's E2EE key
- **No audio data ever leaves the device**

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-05-02 | 2.0 | Security docs overhaul | Complete rewrite: HPKE replaces ECIES, per-device Ed25519/X25519 keys replace nsec, added sigchain/PUK/CLKR/MLS/SFrame, removed Cloudflare Workers/Durable Objects references (backend is Bun+PostgreSQL), updated trust boundary diagram, updated all crypto references to packages/crypto Rust crate |
| 2026-02-25 | 1.3 | ZK Architecture Overhaul | Added Nostr relay trust boundary, audit log tamper detection, admin key separation, hub key compromise analysis, reproducible builds, client-side transcription |
| 2026-02-25 | 1.2 | Epic 76.0 Phase 4 | Added APNs/FCM trust, Cloudflare trust boundary, admin pubkey fetch trust, departed volunteer key retirement, SMS/WhatsApp outbound limitation, npm supply chain risk |
| 2026-02-23 | 1.0 | Security Audit R6 | Initial threat model document |
