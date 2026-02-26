# Data Classification Reference

**Version:** 1.1
**Date:** 2026-02-25

This document provides a complete inventory of all data stored and processed by Llamenos, with classification levels for security audits, legal review, and GDPR compliance.

## Classification Levels

| Level | Definition | Examples |
|-------|------------|----------|
| **E2EE** | End-to-end encrypted; server stores ciphertext only | Note content, transcriptions |
| **Hashed** | One-way cryptographic hash; original not recoverable without brute-force | Caller phone numbers |
| **Encrypted-at-Rest** | Encrypted by infrastructure (database, disk); operator can decrypt | Volunteer personal info |
| **Plaintext** | Stored unencrypted; accessible to operator and under subpoena | Timestamps, call durations |

---

## Data Inventory by Storage Location

### Durable Objects / PostgreSQL (Server-Side)

#### IdentityDO — Volunteer Records

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `pubkey` | Plaintext | Account lifetime | Nostr public key (correlatable) |
| `name` | Encrypted-at-Rest | Account lifetime | Volunteer's display name |
| `phone` | Encrypted-at-Rest | Account lifetime | Volunteer's phone number (for routing) |
| `email` | Encrypted-at-Rest | Account lifetime | Optional contact email |
| `roles` | Plaintext | Account lifetime | `['volunteer']`, `['admin']`, etc. |
| `active` | Plaintext | Account lifetime | Account enabled/disabled |
| `createdAt` | Plaintext | Account lifetime | Registration timestamp |
| `lastSeen` | Plaintext | Updated on activity | Last API request timestamp |
| `webauthnCredentials` | Encrypted-at-Rest | Account lifetime | Passkey credential IDs and public keys |
| `sessionTokens` | Encrypted-at-Rest | 8-hour TTL | Active session tokens |

#### RecordsDO — Call Records and Notes

Storage keys use `callrecord:` prefix pattern (Epic 77) for per-record isolation.

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `callId` | Plaintext | Indefinite | Unique call identifier |
| `callSid` | Plaintext | Indefinite | Telephony provider call ID |
| `startedAt` | Plaintext | Indefinite | Call start timestamp |
| `duration` | Plaintext | Indefinite | Call duration in seconds |
| `answeredBy` | Plaintext | Indefinite | Volunteer pubkey who answered |
| `callerHash` | Hashed (HMAC-SHA256) | Indefinite | Caller phone hash (irreversible) |
| `callerLast4` | Plaintext | Indefinite | Last 4 digits of caller number |
| `hasTranscription` | Plaintext | Indefinite | Boolean flag |
| `hasVoicemail` | Plaintext | Indefinite | Boolean flag |
| `notes[].encryptedContent` | **E2EE** | Indefinite | XChaCha20-Poly1305 ciphertext |
| `notes[].authorEnvelope` | **E2EE** | Indefinite | ECIES-wrapped note key (author) |
| `notes[].adminEnvelope` | **E2EE** | Indefinite | ECIES-wrapped note key (admin) |
| `notes[].authorPubkey` | Plaintext | Indefinite | Who wrote the note |
| `notes[].createdAt` | Plaintext | Indefinite | Note creation timestamp |
| `transcription.encryptedContent` | **E2EE** | Indefinite | Encrypted transcript text |
| `transcription.authorEnvelope` | **E2EE** | Indefinite | ECIES-wrapped key |
| `transcription.adminEnvelope` | **E2EE** | Indefinite | ECIES-wrapped key |

#### ShiftManagerDO — Shift Schedules

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `shiftId` | Plaintext | Indefinite | Unique shift identifier |
| `volunteerPubkeys` | Plaintext | Indefinite | Who is assigned (routing requires plaintext pubkeys) |
| `encryptedDetails` | **E2EE** | Indefinite | Encrypted schedule details (label, description) via `LABEL_SHIFT_SCHEDULE` (Epic 77) |
| `adminEnvelopes[]` | **E2EE** | Indefinite | ECIES-wrapped schedule key (per admin) |
| `startTime` | Plaintext | Indefinite | Shift start time (HH:MM) — plaintext for routing |
| `endTime` | Plaintext | Indefinite | Shift end time (HH:MM) — plaintext for routing |
| `daysOfWeek` | Plaintext | Indefinite | Recurring days — plaintext for routing |
| `ringGroupId` | Plaintext | Indefinite | Associated ring group |

#### CallRouterDO — Active Call State

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `activeCallSid` | Plaintext | Call duration | Current call identifier |
| `ringingVolunteers` | Plaintext | Call duration | Who is currently ringing |
| `callState` | Plaintext | Call duration | `ringing`, `connected`, `completed` |
| `callerHash` | Hashed (HMAC-SHA256) | Call duration | For ban list checking |

#### ConversationDO — Messaging Threads

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `conversationId` | Plaintext | Indefinite | Unique conversation identifier |
| `channel` | Plaintext | Indefinite | `sms`, `whatsapp`, `signal` |
| `participantHash` | Hashed (HMAC-SHA256) | Indefinite | Hashed phone/identifier |
| `assignedVolunteer` | Plaintext | Indefinite | Volunteer pubkey |
| `messages[].encryptedContent` | **E2EE** | Indefinite | XChaCha20-Poly1305 ciphertext (envelope encryption, Epic 74) |
| `messages[].authorEnvelope` | **E2EE** | Indefinite | ECIES-wrapped message key (assigned volunteer) |
| `messages[].adminEnvelopes[]` | **E2EE** | Indefinite | ECIES-wrapped message key (per admin) |
| `messages[].nonce` | Plaintext | Indefinite | 24-byte nonce for XChaCha20-Poly1305 |
| `messages[].direction` | Plaintext | Indefinite | `inbound` or `outbound` |
| `messages[].timestamp` | Plaintext | Indefinite | Message timestamp |
| `messages[].status` | Plaintext | Indefinite | `sent`, `delivered`, `failed` |

**Important**: Messages are now E2EE at rest (Epic 74). The server encrypts inbound messages on webhook receipt and immediately discards the plaintext. Outbound SMS/WhatsApp messages are momentarily visible to the server during the send flow (inherent provider limitation) but are stored only in encrypted form. See [Threat Model: SMS/WhatsApp Outbound Message Limitation](THREAT_MODEL.md#smswhatsapp-outbound-message-limitation).

#### SettingsDO — Application Configuration

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `telephonyProviders` | Encrypted-at-Rest | Indefinite | Provider API credentials |
| `messagingProviders` | Encrypted-at-Rest | Indefinite | Provider API credentials |
| `customFieldDefinitions` | Plaintext | Indefinite | Field names, types, options (no values) |
| `banList` | Hashed (HMAC-SHA256) | Indefinite | Banned phone hashes |
| `spamMitigation` | Plaintext | Indefinite | CAPTCHA settings, rate limits |

#### AuditDO — Audit Logs

Audit logs use a hash-chained integrity mechanism (Epic 77) to detect tampering.

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `timestamp` | Plaintext | Configurable | Event timestamp |
| `action` | Plaintext | Configurable | What happened |
| `actorPubkey` | Plaintext | Configurable | Who did it |
| `ipHash` | Hashed (truncated) | Configurable | 96-bit truncated IP hash |
| `details` | Plaintext | Configurable | Action-specific metadata |
| `entryHash` | Plaintext | Configurable | SHA-256 of (action + actorPubkey + timestamp + details + previousEntryHash) |
| `previousEntryHash` | Plaintext | Configurable | Hash chain link to previous entry |

---

### Client-Side Storage (localStorage)

| Key | Classification | Retention | Notes |
|-----|---------------|-----------|-------|
| `llamenos-encrypted-key` | **E2EE** (PIN-encrypted) | Until logout | Contains encrypted nsec |
| `llamenos-draft:{callId}` | **E2EE** | Until submitted | Encrypted draft note |
| `llamenos-settings` | Plaintext | Indefinite | UI preferences |

**Important**: The volunteer's secret key (nsec) is NEVER stored in plaintext. It exists only:
1. Encrypted in localStorage (PIN-protected)
2. In a JavaScript closure variable during an unlocked session
3. Zeroed from memory on lock/logout

---

### Memory-Only (Never Persisted)

| Data | Lifetime | Notes |
|------|----------|-------|
| Decrypted nsec | Unlocked session | Zeroed on lock |
| Decrypted note content | Page lifetime | React component state |
| Per-note encryption keys | Encryption operation | Generated fresh, never stored |
| ECDH ephemeral keys | Encryption operation | Used once, discarded |
| Hub key | Unlocked session | Stored in hub-key-manager closure; zeroed on lock |
| Transcription audio (microphone) | Recording duration | Captured via AudioWorklet, processed in Web Worker, never persisted |
| Transcription text (pre-encryption) | Seconds | Encrypted immediately after WASM Whisper processing |

---

### Third-Party Systems

#### Telephony Providers (Twilio, SignalWire, Vonage, Plivo)

| Data | Classification | Retention | Notes |
|------|---------------|-----------|-------|
| Call audio | Transient | Provider-controlled | Not recorded by default |
| Call detail records | Plaintext | Provider-controlled | Timestamps, numbers, durations |
| Webhook payloads | Transient | Request duration | Validated via HMAC signature |

#### Cloudflare (Workers Deployment)

| Data | Classification | Notes |
|------|---------------|-------|
| Durable Object storage | Ciphertext for E2EE data | Cloudflare can access encrypted blobs |
| R2 file storage | Ciphertext | Files encrypted client-side |
| Worker logs | Minimal | Request metadata only; no PII logged |

#### Transcription (Client-Side WASM Whisper)

| Data | Classification | Retention |
|------|---------------|-----------|
| Audio input | Memory-only | Duration of transcription processing (in-browser) |
| Transcript output | Encrypted immediately | Stored as E2EE |

**Note**: As of Epic 78, transcription is performed entirely in the browser using WASM Whisper (`@huggingface/transformers`). Audio never leaves the device — no data is sent to any external transcription service.

---

## Data Flow Diagrams

### Note Encryption Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ VOLUNTEER'S BROWSER                                             │
│ ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│ │ Note Text   │───▶│ Generate     │───▶│ XChaCha20-Poly1305   │ │
│ │ + Fields    │    │ noteKey (32B)│    │ encrypt(noteKey,     │ │
│ └─────────────┘    └──────────────┘    │ nonce, plaintext)    │ │
│                           │            └──────────┬───────────┘ │
│                           │                       │             │
│                           ▼                       ▼             │
│              ┌────────────────────┐    ┌──────────────────────┐ │
│              │ ECIES wrap for     │    │ encryptedContent     │ │
│              │ volunteer pubkey   │    │ (ciphertext)         │ │
│              └────────┬───────────┘    └──────────────────────┘ │
│                       │                           │             │
│              ┌────────┴───────────┐               │             │
│              │ ECIES wrap for     │               │             │
│              │ admin pubkey       │               │             │
│              └────────┬───────────┘               │             │
│                       │                           │             │
│                       ▼                           ▼             │
│              ┌────────────────────────────────────────────────┐ │
│              │ { encryptedContent, authorEnvelope,           │ │
│              │   adminEnvelope, authorPubkey, createdAt }    │ │
│              └──────────────────────┬─────────────────────────┘ │
└─────────────────────────────────────┼───────────────────────────┘
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER (no access to plaintext)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ RecordsDO stores encrypted note as-is                       │ │
│ │ Server can see: authorPubkey, createdAt, callId            │ │
│ │ Server cannot see: note text, custom field values          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Caller Phone Number Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐
│ PSTN Call   │────▶│ Telephony   │────▶│ SERVER                  │
│ from Caller │     │ Provider    │     │                         │
└─────────────┘     └─────────────┘     │ 1. Webhook received     │
                                        │    (full phone in body) │
                                        │                         │
                                        │ 2. Extract last 4 digits│
                                        │    callerLast4 = "1234" │
                                        │                         │
                                        │ 3. Hash full number     │
                                        │    HMAC-SHA256(secret,  │
                                        │    "llamenos:phone:" +  │
                                        │    fullPhone)           │
                                        │                         │
                                        │ 4. Check ban list       │
                                        │    (hash comparison)    │
                                        │                         │
                                        │ 5. Store: hash + last4  │
                                        │    Discard: full number │
                                        │                         │
                                        │ 6. Nostr relay event:   │
                                        │    callerLast4 only     │
                                        │    (hub-key encrypted)  │
                                        └─────────────────────────┘
```

---

## GDPR Data Subject Rights

| Right | Implementation |
|-------|----------------|
| **Access** | Volunteers can export their notes (decrypted client-side). Admins can export all metadata. |
| **Rectification** | Volunteers can edit their notes. Admins can update volunteer profiles. |
| **Erasure** | Admin can delete volunteer accounts and notes. E2EE content is cryptographically inaccessible if keys are deleted. |
| **Portability** | Backup export includes encrypted nsec and can be restored on any instance. |
| **Restriction** | Admin can deactivate accounts (revokes sessions, prevents login). |

---

## Retention Recommendations

| Data Type | Recommended Retention | Rationale |
|-----------|----------------------|-----------|
| Call notes | 7 years or legal requirement | Crisis documentation |
| Call metadata | 2 years | Operational analysis |
| Audit logs | 1 year | Security review |
| Session tokens | 8 hours (automatic) | Security best practice |
| Messaging content | 1 year | Follow-up reference |
| Volunteer records | Account lifetime + 90 days | Post-departure access |

Note: Llamenos does not currently enforce automated retention policies. Operators should implement retention schedules appropriate to their jurisdiction.

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-25 | 1.1 | ZK Architecture Overhaul: Updated ConversationDO to E2EE envelope encryption (Epic 74), ShiftManagerDO encrypted details (Epic 77), AuditDO hash chain fields (Epic 77), RecordsDO callrecord: prefix, client-side transcription (Epic 78), hub key in memory-only section, replaced WebSocket broadcast with Nostr relay event |
| 2026-02-25 | 1.0 | Initial data classification document |
