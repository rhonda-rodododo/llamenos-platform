# Llamenos Security Documentation

**Last Updated:** 2026-02-25
**Protocol Version:** 1.0
**Audit Status:** Round 6 complete (2026-02-23)

This directory contains security documentation for Llamenos, a crisis response hotline designed to protect volunteer and caller identity against well-funded adversaries.

## Quick Links for Security Auditors

| Document | Purpose | Audience |
|----------|---------|----------|
| [Data Classification](DATA_CLASSIFICATION.md) | What data exists, where it's stored, what's encrypted | Auditors, operators, legal |
| [Threat Model](THREAT_MODEL.md) | Adversaries, attack surfaces, trust boundaries | Auditors, security engineers |
| [Protocol Specification](../protocol/llamenos-protocol.md) | Cryptographic algorithms, key management, wire formats | Auditors, cryptographers |
| [Security Audit R6](SECURITY_AUDIT_2026-02-R6.md) | Latest audit findings and remediation status | Auditors |
| [Deployment Hardening](DEPLOYMENT_HARDENING.md) | Infrastructure security for operators | Operators, DevOps |

## Security Architecture Summary

### End-to-End Encrypted (Zero-Knowledge)

The server **cannot read** these, even under legal compulsion:

| Data | Encryption | Forward Secrecy |
|------|-----------|-----------------|
| Call notes (text + custom fields) | XChaCha20-Poly1305 + ECIES | Yes (per-note ephemeral key) |
| Call transcriptions | XChaCha20-Poly1305 + ECIES | Yes (per-transcription ephemeral key) |
| Encrypted reports | XChaCha20-Poly1305 + ECIES | Yes (per-report ephemeral key) |
| File attachments | XChaCha20-Poly1305 + ECIES | Yes (per-file ephemeral key) |
| Draft notes | XChaCha20-Poly1305 | No (deterministic key, local-only) |
| Volunteer secret keys (nsec) | PBKDF2 + XChaCha20-Poly1305 | N/A (local storage only) |

### Server-Accessible Under Subpoena

If a hosting provider is legally compelled to provide data, they **can access**:

| Data | Storage | Notes |
|------|---------|-------|
| Call metadata | Plaintext | Timestamps, durations, which volunteer answered, call IDs |
| Caller phone hashes | HMAC-SHA256 | Irreversible without the HMAC secret; last 4 digits stored plaintext |
| Volunteer public keys | Plaintext | Nostr npub format; correlatable with other Nostr activity |
| Shift schedules | Plaintext | Who was on-call when |
| Audit logs | Plaintext | IP hashes (truncated), timestamps, actions |
| SMS/WhatsApp messages | E2EE at rest | Encrypted on receipt (Epic 74); plaintext only in transit to/from provider (inherent channel limitation) |
| Encrypted blobs | Ciphertext | Notes, transcripts, files — encrypted but present |

### Transient Access (During Processing)

| Data | Window | Mitigation |
|------|--------|------------|
| Voice call audio | Duration of call | Provider-dependent (Twilio, etc.); use self-hosted Asterisk for maximum privacy |
| Transcription audio | Recording duration | Audio never leaves device — WASM Whisper processes in-browser (Epic 78) |
| Caller phone number | Active call only | Hashed immediately; only last 4 digits retained |

## Legal Compulsion Scenarios

### Scenario 1: Hosting Provider Subpoena (Cloudflare, VPS)

**What they can provide:**
- Encrypted database blobs (useless without volunteer/admin private keys)
- Plaintext metadata (call times, durations, volunteer assignments)
- Caller phone hashes (irreversible without HMAC secret held by operator)
- Audit logs with truncated IP hashes
- Traffic metadata (request times, sizes, IP addresses)

**What they cannot provide:**
- Note content, transcription text, report bodies (E2EE)
- Volunteer private keys (client-side only)
- Per-note encryption keys (ephemeral, never stored)
- HMAC secret (operator-controlled, not stored with provider)

### Scenario 2: Telephony Provider Subpoena (Twilio, etc.)

**What they can provide:**
- Call recordings (if enabled — Llamenos does NOT enable recording by default)
- Call detail records (timestamps, durations, phone numbers)
- SMS/WhatsApp message content (passes through their systems)

**What they cannot provide:**
- Call notes (never sent to telephony provider)
- Volunteer identities beyond phone numbers used for routing

### Scenario 3: Device Seizure

**Without PIN:**
- Encrypted key blob in localStorage (requires PIN brute-force)
- 600,000 PBKDF2 iterations + 4-6 digit PIN = ~10-60 seconds per attempt on GPU

**With PIN:**
- Access to that volunteer's notes only (not other volunteers')
- Per-note forward secrecy means compromising identity key doesn't reveal past notes
- Session tokens (8-hour TTL, revocable by admin)

### Scenario 4: Admin Key Compromise

**Impact:**
- Admin can decrypt all notes (admin envelope on every note)
- Admin cannot impersonate volunteers (separate keypairs)
- Historical notes remain encrypted until actively decrypted

**Mitigation:**
- Store admin nsec in hardware security module or air-gapped device
- Never use admin keypair on public Nostr relays
- Consider key rotation procedures (documented in [Deployment Hardening](DEPLOYMENT_HARDENING.md))

## Cryptographic Primitives

| Primitive | Library | Usage |
|-----------|---------|-------|
| secp256k1 ECDH | @noble/curves | Key agreement for ECIES |
| BIP-340 Schnorr | @noble/curves | Authentication signatures |
| XChaCha20-Poly1305 | @noble/ciphers | Symmetric encryption (256-bit) |
| SHA-256 | @noble/hashes | HKDF, domain separation |
| PBKDF2-SHA256 | Web Crypto API | PIN key derivation (600K iterations) |
| HMAC-SHA256 | @noble/hashes | Phone/IP hashing (with operator secret) |

All cryptographic code uses audited, constant-time implementations from the `@noble` family. No custom cryptographic constructions.

## Additional Security Features

| Feature | Mechanism | Epic |
|---------|-----------|------|
| Real-time event encryption | Hub key (random 32 bytes) encrypts all Nostr relay events; generic tags prevent event-type analysis | 76/76.2 |
| Hub key distribution | ECIES-wrapped individually per member; rotation excludes departed members | 76.2 |
| Envelope encryption (messages) | Per-message random key, ECIES-wrapped for volunteer + each admin | 74 |
| Hash-chained audit log | SHA-256 chain with `previousEntryHash` + `entryHash` for tamper detection | 77 |
| Encrypted metadata | Call assignments (`LABEL_CALL_META`) and shift schedules (`LABEL_SHIFT_SCHEDULE`) encrypted | 77 |
| Client-side transcription | WASM Whisper in-browser; audio never leaves device | 78 |
| Reproducible builds | `SOURCE_DATE_EPOCH`, `CHECKSUMS.txt` in GitHub Releases, SLSA provenance | 79 |
| Admin key separation | Identity key (signing) separate from decryption key (envelope unwrap) | 76.2 |

## What We Do NOT Claim

- **Traffic analysis resistance**: No padding, no dummy traffic. An observer can see call timing patterns.
- **Metadata confidentiality**: The server needs timestamps and routing data to function.
- **SMS/WhatsApp transport E2EE**: These channels require provider-side plaintext during transit. Messages are E2EE at rest on the server, but the provider sees plaintext.
- **Nostr relay metadata privacy**: The relay can observe event metadata (pubkeys, timestamps, sizes, frequency) — only content is encrypted.
- **PIN brute-force resistance (offline)**: 4-6 digits is ~20 bits of entropy. With a seized encrypted blob and GPU resources, this is brute-forceable in hours.
- **Deletion verification**: We cannot cryptographically prove that Cloudflare/VPS providers deleted data when requested.

## Audit History

| Date | Round | Findings | Status |
|------|-------|----------|--------|
| 2026-02-23 | R6 | 3 critical, 6 high, 10 medium, 8 low | See [audit report](SECURITY_AUDIT_2026-02-R6.md) |
| 2026-02-15 | R5 | 3 critical, 7 high, 8 medium, 4 low | Fully remediated |

## For Website Visitors

See [llamenos.org/security](https://llamenos.org/security) for a user-friendly explanation of our security model.

## Reporting Security Issues

Security vulnerabilities should be reported via email to security@llamenos.org. We follow a 90-day disclosure policy.
