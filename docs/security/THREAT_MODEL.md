# Llamenos Threat Model

## Document Purpose

This document defines the threat model for Llamenos, a secure crisis response hotline webapp. It identifies adversaries, attack surfaces, trust boundaries, and the security properties the system must maintain. All architectural decisions and security controls are evaluated against this model.

**Related Documents**:
- [Security Overview](README.md) — Entry point for security auditors
- [Data Classification](DATA_CLASSIFICATION.md) — Complete data inventory with encryption status
- [Protocol Specification](../protocol/llamenos-protocol.md) — Cryptographic algorithms and wire formats
- [Deployment Hardening](DEPLOYMENT_HARDENING.md) — Infrastructure security guidance

## Protected Assets

| Asset | Classification | Storage Location | Protection |
|-------|---------------|-----------------|------------|
| Caller phone numbers | PII / Safety-Critical | Hashed in DO/PostgreSQL | HMAC-SHA256 with operator secret; last 4 digits stored plaintext for display |
| Call note content | Confidential | Encrypted in DO/PostgreSQL | E2EE V2: per-note XChaCha20-Poly1305, ECIES key wrapping |
| Volunteer identity (name, phone) | PII / Safety-Critical | Encrypted at rest in DO/PostgreSQL | Visible only to admins; never exposed to other volunteers or callers |
| Volunteer private keys (nsec) | Secret | PIN-encrypted in browser localStorage | PBKDF2-SHA256 600K iterations + XChaCha20-Poly1305 |
| Admin private key (nsec) | Secret | Operator-managed (env var, hardware key) | Never stored server-side |
| Session tokens | Secret | sessionStorage (client), DO/PostgreSQL (server) | 256-bit random, 8-hour TTL, revocable |
| Audit logs | Operational | DO/PostgreSQL | Admin-only access; IP hashes truncated to 96 bits |
| Shift schedules | Operational | DO/PostgreSQL | Authenticated access only |
| Telephony credentials | Secret | Cloudflare Secrets / env vars | Never in source control; never sent to client |

## Adversary Profiles

### Tier 1: Nation-State Actor

**Capabilities**: TLS interception via national CA, ISP-level traffic analysis, physical device seizure, legal compulsion of cloud providers, advanced persistent threats against CI/CD, social engineering of developers/operators.

**Goals**: Identify callers (political dissidents, activists). Identify volunteers. Obtain call note content. Disrupt hotline operations.

**Mitigations**:
- E2EE notes with forward secrecy (V2) — server compromise reveals nothing
- PIN-encrypted keys — device seizure requires PIN brute-force
- Auto-lock on idle/tab-hide — limits physical access window
- Generic PWA name ("Hotline") — reduces identification on seized devices
- Nostr keypair auth — no passwords stored server-side to compel
- Domain-separated ECIES — no cross-context key reuse
- Certificate pinning NOT implemented (impractical for web apps; rely on HSTS preload)

**Residual risks**:
- PIN entropy (4-6 digits, ~20 bits) is brute-forceable with seized encrypted blob + GPU resources
- Caller phone numbers are transiently available to answering volunteers during active calls
- Traffic analysis can reveal call timing, duration, and volunteer activity patterns
- Legal compulsion of Cloudflare can access encrypted blobs (but not decrypt them)

### Tier 2: Private Intelligence / Hacking Firm

**Capabilities**: Targeted phishing, watering-hole attacks, 0-day browser exploits, insider recruitment, social engineering.

**Goals**: Same as Tier 1 but typically contracted by specific interests. May target individual volunteers or admins.

**Mitigations**:
- WebAuthn passkeys — phishing-resistant authentication
- CSP `script-src 'self'` — limits XSS payload injection
- Session revocation on role change/deactivation — compromised accounts can be cut off
- Invite-code system — no open registration; requires admin approval
- Webhook signature validation — prevents telephony API spoofing

### Tier 3: Opportunistic Attacker / Script Kiddie

**Capabilities**: Known CVE exploitation, credential stuffing, automated scanning.

**Goals**: Disruption, data theft, defacement.

**Mitigations**:
- Rate limiting on all auth endpoints
- Voice CAPTCHA for call spam
- SHA-pinned GitHub Actions
- `--frozen-lockfile` dependency installation
- HSTS preload + security headers
- Non-root container execution

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        UNTRUSTED                                │
│  Callers (PSTN)  │  Public Internet  │  CDN/Cloud Provider     │
└──────┬───────────┴────────┬──────────┴──────────┬──────────────┘
       │                    │                     │
       │ Telephony          │ HTTPS/WSS           │ Infrastructure
       │ Webhooks           │                     │ Access
       ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SEMI-TRUSTED                                   │
│  Cloudflare Workers / Node.js Server                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐      │
│  │ Hono API │→│ Auth MW  │→│ Perm MW  │→│ Route Handler │      │
│  └──────────┘ └──────────┘ └──────────┘ └───────┬───────┘      │
│                                                  │               │
│  ┌─────────────────────────────────────────────┐ │               │
│  │ Durable Objects / PostgreSQL                │←┘               │
│  │ (encrypted blobs, hashed identifiers)       │                 │
│  └─────────────────────────────────────────────┘                 │
│                                                                   │
│  Server can see: metadata (who wrote, when, callId)              │
│  Server CANNOT see: note content, transcription text, file data  │
└──────────────────────────────────────────────────────────────────┘
       │                    │
       │ E2EE payloads      │ Encrypted key blobs
       ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                       TRUSTED                                     │
│  Volunteer's Browser                                              │
│  ┌───────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Key Mgr   │ │ Crypto (V2)  │ │ Auth Context │                │
│  │ (closure) │ │ ECIES+XChaCha│ │ Schnorr/WA   │                │
│  └───────────┘ └──────────────┘ └──────────────┘                │
│                                                                   │
│  Decrypted notes exist ONLY here, in memory, while unlocked      │
└──────────────────────────────────────────────────────────────────┘
```

### Boundary Rules

1. **PSTN → Server**: All telephony webhooks MUST be signature-validated (Twilio HMAC-SHA1, Vonage HMAC-SHA256, etc.). Caller numbers are hashed on receipt; only last-4 digits retained in call records.

2. **Internet → Server**: All API requests require Schnorr or WebAuthn session authentication (except `/api/config`, `/api/auth/login`, `/api/auth/bootstrap`). CORS restricts to same-origin. Security headers enforced on all responses.

3. **Server → Client**: The server NEVER sends plaintext note content, transcription text, or file data. All sensitive data is encrypted with the recipient's public key before storage.

4. **Client → Server**: The client sends encrypted payloads only. Exception: `plaintextForSending` in messaging (SMS/WhatsApp require server-side plaintext to reach the provider — documented and accepted).

5. **Cloud Provider**: Cloudflare (or the self-hosted infrastructure operator) can access encrypted blobs, metadata, and traffic patterns. They CANNOT decrypt E2EE content without the volunteer/admin private keys.

## Attack Surface Inventory

### External Attack Surface

| Surface | Entry Point | Auth Required | Validation |
|---------|------------|---------------|------------|
| Login | `POST /api/auth/login` | No | Schnorr signature + rate limit |
| Bootstrap | `POST /api/auth/bootstrap` | No | Schnorr signature + one-shot guard + rate limit |
| Config | `GET /api/config` | No | Read-only; exposes `adminPubkey` |
| Telephony webhooks (10 endpoints) | `POST /telephony/*` | Webhook signature | Provider-specific HMAC |
| Messaging webhooks | `POST /messaging/*` | Webhook signature | Provider-specific validation |
| WebSocket upgrade | `GET /api/ws` | Schnorr or Session | Token in `Sec-WebSocket-Protocol` |
| All other API endpoints | `*/api/*` | Schnorr or Session | Auth + permission middleware |
| IVR audio | `GET /api/ivr-audio/*` | No | Strict regex on path params |
| Dev reset | `POST /api/test-reset*` | No (env-gated) | `ENVIRONMENT=development` check |

### Internal Attack Surface (Post-Authentication)

| Surface | Risk | Mitigation |
|---------|------|------------|
| Volunteer → Admin escalation | Role modification | Safe-fields allowlist on self-update; `roles` requires `volunteers:update` permission |
| Volunteer → Other volunteer's notes | Note content theft | E2EE — server has no plaintext; `notes:read-own` permission scoping |
| Volunteer → Caller identification | PII exposure | Caller numbers hashed; only `callerLast4` sent to answering volunteer; redacted for others |
| Admin → Excessive data access | Insider threat | Audit logging of all admin actions; admin notes are separately encrypted |
| WebSocket message injection | Fake call events | WS rate limiting + prototype pollution guard + action authorization checks |

## Cryptographic Properties

### What We Guarantee

| Property | Mechanism | Strength |
|----------|-----------|----------|
| Note confidentiality | XChaCha20-Poly1305 with random per-note key | 256-bit symmetric |
| Note integrity | Poly1305 MAC (AEAD) | 128-bit |
| Note forward secrecy | Ephemeral ECDH per note + per recipient | secp256k1 |
| Key-at-rest confidentiality | PBKDF2-SHA256 (600K iter) + XChaCha20-Poly1305 | ~20 bits PIN + 256-bit key |
| Auth token unforgeability | BIP-340 Schnorr signatures | 128-bit security level |
| Session token unpredictability | `crypto.getRandomValues(32)` | 256-bit |
| Phone hash preimage resistance | HMAC-SHA256 with operator secret | Infeasible without HMAC secret |

### What We Do NOT Guarantee

| Gap | Reason | Acceptable? |
|-----|--------|------------|
| Traffic analysis resistance | No padding, no dummy traffic | Yes — impractical for a web app |
| Metadata confidentiality | Server needs `callId`, `authorPubkey`, timestamps for routing | Yes — documented trade-off |
| SMS/WhatsApp E2EE | Provider requires plaintext | Yes — documented per-channel |
| PIN brute-force resistance (offline) | 4-6 digit PIN, ~10K-1M possibilities | Marginal — recommend 6-digit minimum |
| Server-side key deletion verification | Cannot prove Cloudflare/operator deleted data | Yes — fundamental cloud trust limitation |

## Legal Compulsion and Subpoena Scenarios

This section documents what data can be obtained through legal process against various parties. Crisis hotlines operating in hostile legal environments should understand these limitations.

### Subpoena of Hosting Provider (Cloudflare, VPS)

**Obtainable:**
- Encrypted database contents (ciphertext for E2EE data)
- Plaintext metadata: call timestamps, durations, volunteer assignments, call IDs
- Caller phone hashes (irreversible without operator's HMAC secret)
- Audit logs with truncated IP hashes
- Traffic metadata (request times, sizes, source IPs)
- Account information for the operator

**Not Obtainable:**
- Note content, transcription text, report bodies (E2EE — provider has ciphertext only)
- Volunteer private keys (stored client-side, never uploaded)
- Per-note encryption keys (ephemeral, never persisted)
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
- Encrypted key blob in localStorage requires PIN brute-force
- 600,000 PBKDF2 iterations + 4-6 digit PIN = estimated hours on GPU hardware
- Session tokens may still be valid if device was recently used (8-hour TTL)

**With PIN (or successful brute-force):**
- Access to that volunteer's decrypted notes
- Cannot decrypt other volunteers' notes (separate keypairs)
- Per-note forward secrecy: compromising identity key does not reveal notes without also obtaining the per-note ECIES envelopes

**Mitigations:**
- Enable device full-disk encryption
- Use 6-digit PIN (not 4-digit)
- Enable auto-lock on shorter timeout
- Admin can remotely revoke sessions

### Device Seizure (Admin)

**Impact if admin nsec is obtained:**
- Can decrypt all notes (admin envelope exists on every note)
- Can impersonate admin role
- Cannot impersonate individual volunteers

**Mitigations:**
- Store admin nsec in hardware security module (HSM) or air-gapped device
- Use YubiKey or similar for admin authentication
- Never store admin nsec on internet-connected devices
- Implement admin key rotation procedures

### Insider Threat (Malicious Operator)

A malicious operator with server access can:
- Read all plaintext metadata
- Modify server code to capture data before encryption (requires deployment access)
- Access HMAC secret to reverse phone hashes
- Cannot decrypt E2EE content without volunteer/admin private keys

**Mitigations:**
- Reproducible builds (planned) allow verification of deployed code
- Multi-party deployment approval
- Audit logging of all server access

## Deployment-Specific Threats

### Cloudflare Workers Deployment

- **Cloudflare as trusted party**: Cloudflare can read memory, intercept requests, access DO storage. E2EE ensures they cannot read note content, but they see all metadata and traffic patterns.
- **Cloudflare account compromise**: Attacker gains full access to Worker code, secrets, and DO storage. Mitigate with 2FA, access logs, and key rotation procedures.
- **`workers.dev` subdomain disabled**: Prevents alternate origin that bypasses domain-specific security policies.

### Docker/Node.js Self-Hosted Deployment

- **Operator as trusted party**: The operator has full access to the server, database, and secrets. They cannot read E2EE content without volunteer private keys.
- **VPS provider access**: The hosting provider can image the VM, access disk, and intercept network traffic. TLS + E2EE provides defense-in-depth.
- **PostgreSQL security**: Database credentials, TLS for connections, encrypted backups are the operator's responsibility.
- **Reverse proxy configuration**: Caddy provides TLS termination and security headers. Misconfiguration (e.g., HTTP without redirect) would expose session tokens.

### Kubernetes Deployment

- **NetworkPolicy enforcement**: Requires a CNI that supports NetworkPolicy (Calico, Cilium). Without enforcement, pod-to-pod traffic is unrestricted.
- **Secret management**: Kubernetes Secrets are base64-encoded, not encrypted, unless etcd encryption is configured. Use External Secrets Operator or Vault for production.
- **Pod security**: `runAsNonRoot`, `readOnlyRootFilesystem`, `drop: ALL` capabilities enforced in the Helm chart.

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-25 | 1.1 | Documentation overhaul | Added legal compulsion section; fixed phone hashing to HMAC-SHA256; fixed caller number broadcast status; added cross-references |
| 2026-02-23 | 1.0 | Security Audit R6 | Initial threat model document |
