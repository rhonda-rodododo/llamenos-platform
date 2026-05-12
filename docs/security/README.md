# Llamenos Security Documentation

**Last Updated:** 2026-05-11
**Crypto Architecture:** HPKE (RFC 9180) + Ed25519/X25519 + AES-256-GCM
**Audit Status:** Two historical audits (2026-02, 2026-03); docs updated for current architecture
**Domain Separation Labels:** 69 defined (source of truth in `packages/protocol/crypto-labels.json`)

This directory contains security documentation for Llamenos, a crisis response hotline app designed to protect volunteer and caller identity against well-funded adversaries.

## Quick Links for Security Auditors

| Document | Purpose | Audience |
|----------|---------|----------|
| [Crypto Architecture](CRYPTO_ARCHITECTURE.md) | Primitives, key hierarchy, HPKE envelopes, domain separation, sigchain, PUK, MLS, SFrame | Auditors, cryptographers |
| [Threat Model](THREAT_MODEL.md) | Adversaries, attack surfaces, trust boundaries, legal compulsion scenarios | Auditors, security engineers |
| [Data Classification](DATA_CLASSIFICATION.md) | Complete data inventory with encryption status per field | Auditors, operators, legal |
| [Protocol Specification](../protocol/PROTOCOL.md) | Wire formats, API contracts, cryptographic algorithms | Auditors, developers |
| [Deployment Hardening](DEPLOYMENT_HARDENING.md) | Docker Compose, Kubernetes Helm, Ansible, Caddy, WebSocket configuration | Operators, DevOps |
| [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md) | Device deauthorization via sigchain, hub key rotation, PUK rotation | Operators |
| [Incident Response](INCIDENT_RESPONSE.md) | Server compromise, CI/CD compromise, account compromise, GDPR notification | Operators |
| [Certificate Pins](CERTIFICATE_PINS.md) | iOS/Android certificate pinning (scaffolding — pins pending first deployment) | Mobile developers |
| [Security Gaps and Roadmap](SECURITY_GAPS_AND_ROADMAP.md) | Known gaps, incomplete implementations, planned improvements | Auditors, developers, operators |

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
| AES-256-GCM | Symmetric encryption (notes, messages, HPKE AEAD) |
| XChaCha20-Poly1305 | Hub event encryption (WebSocket events) |
| Argon2id (64MB, 3 iterations, 4 parallelism) | PIN/passphrase-to-KEK derivation for device key storage |
| HMAC-SHA256 | Phone/IP hashing, blind index generation |
| **69 domain separation labels** | Albrecht defense — label enforced at decrypt |

> **Note:** 69 labels are defined in `packages/protocol/crypto-labels.json` (source of truth). The Rust `LABEL_REGISTRY` currently contains 57 entries; 12 newer labels are used in TypeScript backend code but not yet registered in Rust. See [Security Gaps](SECURITY_GAPS_AND_ROADMAP.md#11-domain-separation-label-count-medium).

### End-to-End Encrypted (Zero-Knowledge for Content)

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
| Device private keys | Argon2id + AES-256-GCM | N/A (platform secure storage) |

> **Note:** The server is zero-knowledge for note/message/file **content**. The server DOES see metadata (timestamps, routing, call durations) and processes plaintext momentarily during SMS/WhatsApp outbound sends. See [What We Do NOT Claim](#what-we-do-not-claim).

### Identity Model

- **Per-device Ed25519/X25519 keys** — not a single "nsec" per user
- **Sigchain** — append-only, hash-chained, Ed25519-signed device authorization log
- **PUK (Per-User Key)** — user-level key hierarchy with Cascading Lazy Key Rotation (CLKR)
- **Hub key** — random 32 bytes, HPKE-wrapped per member, rotated on departure
- **MLS** (RFC 9420) — group state management (always compiled; no feature flag)
- **Hub event epoch rotation** — server event key rotates every 24 hours for forward secrecy
- **SFrame** — voice E2EE key derivation (media frame encryption planned — see [Security Gaps](SECURITY_GAPS_AND_ROADMAP.md#13-sframe-voice-e2ee-low))

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

- **Traffic analysis resistance (full)**: Hub events are padded to power-of-2 buckets (min 512B), but no dummy traffic or cover traffic — patterns from connection timing remain visible
- **Metadata confidentiality**: Server needs timestamps, routing data, and event counts; caller numbers are HMAC-hashed and User-Agent SHA-256 hashed, country is not stored — but connection metadata remains
- **SMS/WhatsApp transport E2EE**: Provider sees plaintext during transit; Signal-first routing (when the recipient has Signal) avoids this, and SMS notification-only mode omits message content from SMS bodies — but provider-visible delivery still occurs
- **WebSocket metadata privacy**: The server handles all event distribution; authenticated connections only; content is per-hub encrypted with epoch-rotating keys — server cannot fake events but can observe connection metadata
- **PIN brute-force resistance (offline) — now significantly improved**: Minimum 8 digits or alphanumeric passphrase (8+ chars); Argon2id (64MB, 3 iterations, 4 parallelism) replaces PBKDF2 for strong GPU/ASIC resistance. Seizure of encrypted blob requires defeating Argon2id in addition to guessing credential.
- **Deletion verification**: Cannot cryptographically prove hosting provider deleted data
- **SFrame voice media encryption**: Key derivation is implemented; per-frame AES-128-CTR + HMAC encryption is planned but not yet complete

## Known Security Gaps

For a complete inventory of known gaps, incomplete implementations, and planned improvements, see [Security Gaps and Roadmap](SECURITY_GAPS_AND_ROADMAP.md).

Highlights:
- **12 domain separation labels** in JSON are not yet in the Rust registry
- **Tauri Stronghold** is initialized but device keys are stored via `tauri-plugin-store`
- **SFrame** has key derivation but no media frame encryption
- **Certificate pinning** is scaffolding only (placeholder pins)
- **WebAuthn enforcement** settings exist but may not be wired into auth middleware
- **iOS DEBUG blocks** in security-critical paths need production build verification

## Reporting Security Issues

Security vulnerabilities should be reported via email to security@llamenos.org. We follow a 90-day disclosure policy.
