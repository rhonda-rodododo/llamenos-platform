# Llamenos Security Documentation

**Last Updated:** 2026-05-02
**Crypto Architecture:** HPKE (RFC 9180) + Ed25519/X25519 + AES-256-GCM
**Audit Status:** Two historical audits (2026-02, 2026-03); docs updated for current architecture

This directory contains security documentation for Llamenos, a crisis response hotline app designed to protect volunteer and caller identity against well-funded adversaries.

## Quick Links for Security Auditors

| Document | Purpose | Audience |
|----------|---------|----------|
| [Crypto Architecture](CRYPTO_ARCHITECTURE.md) | Primitives, key hierarchy, HPKE envelopes, domain separation, sigchain, PUK, MLS, SFrame | Auditors, cryptographers |
| [Threat Model](THREAT_MODEL.md) | Adversaries, attack surfaces, trust boundaries, legal compulsion scenarios | Auditors, security engineers |
| [Data Classification](DATA_CLASSIFICATION.md) | Complete data inventory with encryption status per field | Auditors, operators, legal |
| [Protocol Specification](../protocol/PROTOCOL.md) | Wire formats, API contracts, cryptographic algorithms | Auditors, developers |
| [Deployment Hardening](DEPLOYMENT_HARDENING.md) | Docker Compose, Kubernetes Helm, Ansible, Caddy, strfry configuration | Operators, DevOps |
| [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md) | Device deauthorization via sigchain, hub key rotation, PUK rotation | Operators |
| [Incident Response](INCIDENT_RESPONSE.md) | Server compromise, CI/CD compromise, account compromise, GDPR notification | Operators |
| [Certificate Pins](CERTIFICATE_PINS.md) | iOS/Android certificate pinning (scaffolding — pins pending first deployment) | Mobile developers |

### Historical Audit Reports

| Document | Date | Notes |
|----------|------|-------|
| [Security Audit R6](SECURITY_AUDIT_2026-02-R6.md) | 2026-02-23 | Point-in-time snapshot; pre-HPKE, pre-device-keys architecture |
| [Security Audit 2026-03](SECURITY_AUDIT_2026-03-21.md) | 2026-03-21 | Platform-wide audit (Rust crypto, Worker, Tauri, iOS, Android); 58 findings |

## Security Architecture Summary

### Cryptographic Foundation

All cryptographic operations are implemented once in `packages/crypto/` (Rust), compiled to native (Tauri desktop), WASM (browser testing), and UniFFI (iOS/Android). There is no separate JS crypto implementation for production use.

| Primitive | Usage |
|-----------|-------|
| HPKE (RFC 9180, X25519-HKDF-SHA256-AES256-GCM) | All key wrapping (notes, messages, files, hub key, PUK) |
| Ed25519 | Device signing keys, auth tokens, sigchain entries |
| X25519 | Device encryption keys, HPKE decapsulation |
| AES-256-GCM | Symmetric encryption |
| PBKDF2-SHA256 (600K iterations) | PIN-to-KEK derivation for device key storage |
| HMAC-SHA256 | Phone/IP hashing, blind index generation |
| 57 domain separation labels | Albrecht defense — label enforced at decrypt |

### End-to-End Encrypted (Zero-Knowledge)

The server **cannot read** these, even under legal compulsion:

| Data | Encryption | Forward Secrecy |
|------|-----------|-----------------|
| Call notes (text + custom fields) | AES-256-GCM + HPKE wrapping | Yes (per-note random key) |
| Call transcriptions | AES-256-GCM + HPKE wrapping | Yes (per-transcription key) |
| Encrypted reports | AES-256-GCM + HPKE wrapping | Yes (per-report key) |
| File attachments | AES-256-GCM + HPKE wrapping | Yes (per-file key) |
| Messages (SMS/WhatsApp/Signal) | AES-256-GCM + HPKE wrapping | Yes (per-message key) |
| CMS contacts/cases | AES-256-GCM + HPKE wrapping | Yes |
| Draft notes | AES-256-GCM (HKDF-derived key) | No (deterministic key, local-only) |
| Device private keys | PBKDF2 + AES-256-GCM | N/A (platform secure storage) |

### Identity Model

- **Per-device Ed25519/X25519 keys** — not a single "nsec" per user
- **Sigchain** — append-only, hash-chained, Ed25519-signed device authorization log
- **PUK (Per-User Key)** — user-level key hierarchy with Cascading Lazy Key Rotation (CLKR)
- **Hub key** — random 32 bytes, HPKE-wrapped per member, rotated on departure
- **MLS** (RFC 9420, feature-gated) — group state management
- **SFrame** — voice E2EE key derivation

### Server-Accessible Under Subpoena

| Data | Storage | Notes |
|------|---------|-------|
| Call metadata | Plaintext | Timestamps, durations, which user answered |
| Caller phone hashes | HMAC-SHA256 | Irreversible without HMAC secret |
| User public keys | Plaintext | Ed25519 signing + X25519 encryption pubkeys |
| Sigchain entries | Plaintext | Device authorization log (pubkeys, not private keys) |
| Shift schedules (timing) | Plaintext | Start/end times needed for routing |
| Audit logs | Plaintext | IP hashes (truncated), timestamps, actions |
| Encrypted blobs | Ciphertext | Notes, messages, files — encrypted but present |

## What We Do NOT Claim

- **Traffic analysis resistance**: No padding, no dummy traffic
- **Metadata confidentiality**: Server needs timestamps and routing data
- **SMS/WhatsApp transport E2EE**: Provider sees plaintext during transit (messages are E2EE at rest)
- **Nostr relay metadata privacy**: Relay observes event metadata (pubkeys, timing, sizes) — only content is encrypted
- **PIN brute-force resistance (offline)**: 6–8 digits is ~20–27 bits of entropy
- **Deletion verification**: Cannot cryptographically prove hosting provider deleted data

## Reporting Security Issues

Security vulnerabilities should be reported via email to security@llamenos.org. We follow a 90-day disclosure policy.
