# Data Classification Reference

**Version:** 2.0
**Date:** 2026-05-02

Complete inventory of all data stored and processed by Llamenos, with classification levels for security audits, legal review, and GDPR compliance.

## Classification Levels

| Level | Definition | Examples |
|-------|------------|----------|
| **E2EE** | End-to-end encrypted; server stores ciphertext only | Note content, transcriptions |
| **Hashed** | One-way cryptographic hash; original not recoverable without brute-force | Caller phone numbers |
| **Encrypted-at-Rest** | Encrypted by infrastructure (database, disk); operator can decrypt | Volunteer personal info |
| **Plaintext** | Stored unencrypted; accessible to operator and under subpoena | Timestamps, call durations |

---

## Data Inventory by Storage Location

### PostgreSQL (Server-Side)

#### User Records

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `pubkey` | Plaintext | Account lifetime | Ed25519 signing public key (device-specific) |
| `encryptionPubkey` | Plaintext | Account lifetime | X25519 encryption public key (device-specific) |
| `name` | Encrypted-at-Rest | Account lifetime | User's display name |
| `phone` | Encrypted-at-Rest | Account lifetime | User's phone number (for routing) |
| `email` | Encrypted-at-Rest | Account lifetime | Optional contact email |
| `roles` | Plaintext | Account lifetime | `['volunteer']`, `['admin']`, etc. — hub-scoped |
| `active` | Plaintext | Account lifetime | Account enabled/disabled |
| `createdAt` | Plaintext | Account lifetime | Registration timestamp |
| `lastSeen` | Plaintext | Updated on activity | Last API request timestamp |
| `webauthnCredentials` | Encrypted-at-Rest | Account lifetime | Passkey credential IDs and public keys |
| `sessionTokens` | Encrypted-at-Rest | 8-hour TTL | Active session tokens |

#### Sigchain Entries

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `id` | Plaintext | Indefinite | Entry UUID |
| `seq` | Plaintext | Indefinite | Sequence number in chain |
| `prevHash` | Plaintext | Indefinite | SHA-256 of previous entry (chain link) |
| `entryHash` | Plaintext | Indefinite | SHA-256 of this entry |
| `signerDeviceId` | Plaintext | Indefinite | Which device signed this entry |
| `signerPubkey` | Plaintext | Indefinite | Ed25519 pubkey of signer |
| `signature` | Plaintext | Indefinite | Ed25519 signature (128 hex chars) |
| `payloadJson` | Plaintext | Indefinite | Canonical JSON (add-device, remove-device, rotate-puk) |

#### PUK (Per-User Key) State

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `pukGeneration` | Plaintext | Account lifetime | Current PUK generation number |
| `pukSigningPubkey` | Plaintext | Account lifetime | Current PUK signing subkey |
| `pukDhPubkey` | Plaintext | Account lifetime | Current PUK DH subkey |
| `deviceSeedEnvelopes[]` | **E2EE** | Account lifetime | HPKE-wrapped PUK seed, one per authorized device (label: `LABEL_PUK_WRAP_TO_DEVICE`) |
| `clkrChainLinks[]` | **E2EE** | Account lifetime | AES-256-GCM encrypted previous-generation seeds (CLKR chain) |

#### Call Records and Notes

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `callId` | Plaintext | Indefinite | Unique call identifier |
| `callSid` | Plaintext | Indefinite | Telephony provider call ID |
| `startedAt` | Plaintext | Indefinite | Call start timestamp |
| `duration` | Plaintext | Indefinite | Call duration in seconds |
| `answeredBy` | Plaintext | Indefinite | User pubkey who answered |
| `callerHash` | Hashed (HMAC-SHA256) | Indefinite | Caller phone hash (irreversible) |
| `callerLast4` | Plaintext | Indefinite | Last 4 digits of caller number |
| `hasTranscription` | Plaintext | Indefinite | Boolean flag |
| `hasVoicemail` | Plaintext | Indefinite | Boolean flag |
| `notes[].encryptedContent` | **E2EE** | Indefinite | AES-256-GCM ciphertext (via HPKE) |
| `notes[].authorEnvelope` | **E2EE** | Indefinite | HPKE-wrapped note key (author, label: `LABEL_NOTE_KEY`) |
| `notes[].adminEnvelopes[]` | **E2EE** | Indefinite | HPKE-wrapped note key (per admin, label: `LABEL_NOTE_KEY`) |
| `notes[].authorPubkey` | Plaintext | Indefinite | Who wrote the note |
| `notes[].createdAt` | Plaintext | Indefinite | Note creation timestamp |
| `transcription.encryptedContent` | **E2EE** | Indefinite | Encrypted transcript text |
| `transcription.authorEnvelope` | **E2EE** | Indefinite | HPKE-wrapped key (label: `LABEL_TRANSCRIPTION`) |
| `transcription.adminEnvelopes[]` | **E2EE** | Indefinite | HPKE-wrapped key (per admin) |

#### Call Record Metadata

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `encryptedMetadata` | **E2EE** | Indefinite | AES-256-GCM ciphertext (answeredBy, callerNumber) |
| `metadataEnvelopes[]` | **E2EE** | Indefinite | HPKE-wrapped metadata key (label: `LABEL_CALL_META`) |
| `callerLast4`, `startedAt`, etc. | Plaintext | Indefinite | Routing-required fields |

#### Shift Schedules

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `shiftId` | Plaintext | Indefinite | Unique shift identifier |
| `volunteerPubkeys` | Plaintext | Indefinite | Who is assigned (routing requires plaintext) |
| `encryptedDetails` | **E2EE** | Indefinite | Encrypted schedule details (label: `LABEL_SHIFT_SCHEDULE`) |
| `adminEnvelopes[]` | **E2EE** | Indefinite | HPKE-wrapped schedule key (per admin) |
| `startTime` / `endTime` | Plaintext | Indefinite | Shift times (routing needs plaintext) |
| `daysOfWeek` | Plaintext | Indefinite | Recurring days (routing needs plaintext) |

#### Conversations (Messaging)

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `conversationId` | Plaintext | Indefinite | Unique conversation identifier |
| `channel` | Plaintext | Indefinite | `sms`, `whatsapp`, `signal`, `telegram`, `rcs` |
| `participantHash` | Hashed (HMAC-SHA256) | Indefinite | Hashed phone/identifier |
| `assignedVolunteer` | Plaintext | Indefinite | User pubkey |
| `messages[].encryptedContent` | **E2EE** | Indefinite | AES-256-GCM ciphertext (envelope encryption) |
| `messages[].authorEnvelope` | **E2EE** | Indefinite | HPKE-wrapped message key (assigned volunteer, label: `LABEL_MESSAGE`) |
| `messages[].adminEnvelopes[]` | **E2EE** | Indefinite | HPKE-wrapped message key (per admin, label: `LABEL_MESSAGE`) |
| `messages[].direction` | Plaintext | Indefinite | `inbound` or `outbound` |
| `messages[].timestamp` | Plaintext | Indefinite | Message timestamp |
| `messages[].status` | Plaintext | Indefinite | `sent`, `delivered`, `failed` |

**Important**: Server encrypts inbound messages on webhook receipt and immediately discards plaintext. Outbound SMS/WhatsApp messages are momentarily visible to the server during the send flow (provider limitation). See [Threat Model: SMS/WhatsApp Outbound Message Limitation](THREAT_MODEL.md#smswhatsapp-outbound-message-limitation).

#### CMS Data (Case Management)

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `contacts[].encryptedFields` | **E2EE** | Indefinite | HPKE-wrapped contact PII (label: `LABEL_CONTACT_ID`) |
| `contacts[].blindIndexes` | Hashed (HMAC-SHA256) | Indefinite | Server-side search indexes (exact, date, trigram) |
| `cases[].encryptedFields` | **E2EE** | Indefinite | HPKE-wrapped case fields (label: `LABEL_CASE_FIELDS`) |
| `cases[].statusIndex` | Hashed (HMAC-SHA256) | Indefinite | Blind index for status filtering |
| `reports[].encryptedContent` | **E2EE** | Indefinite | HPKE-wrapped report body |
| `interactions[].encryptedContent` | **E2EE** | Indefinite | HPKE-wrapped interaction notes |

#### Hub Key Distribution

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `hubKeyVersion` | Plaintext | Current | Key version counter |
| `memberEnvelopes[]` | **E2EE** | Current | HPKE-wrapped hub key, one per member (label: `LABEL_HUB_KEY_WRAP`) |
| `hubKeyHistory[]` | Client-side only | Indefinite | Clients retain old hub keys for historical decryption |

#### Application Configuration

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `telephonyProviders` | Encrypted-at-Rest | Indefinite | Provider API credentials |
| `messagingProviders` | Encrypted-at-Rest | Indefinite | Provider API credentials |
| `customFieldDefinitions` | Plaintext | Indefinite | Field names, types, options (no values) |
| `reportTypeDefinitions` | Plaintext | Indefinite | Template-driven report type schemas |
| `banList` | Hashed (HMAC-SHA256) | Indefinite | Banned phone hashes |
| `spamMitigation` | Plaintext | Indefinite | CAPTCHA settings, rate limits |

#### Audit Logs

Hash-chained for tamper detection.

| Field | Classification | Retention | Notes |
|-------|---------------|-----------|-------|
| `timestamp` | Plaintext | Configurable | Event timestamp |
| `action` | Plaintext | Configurable | What happened |
| `actorPubkey` | Plaintext | Configurable | Who did it |
| `ipHash` | Hashed (truncated) | Configurable | 96-bit truncated IP hash (HMAC-SHA256) |
| `details` | Plaintext | Configurable | Action-specific metadata |
| `entryHash` | Plaintext | Configurable | SHA-256 of this entry's content |
| `previousEntryHash` | Plaintext | Configurable | Hash chain link to previous entry |

---

### Client-Side Storage

| Platform | Storage | Key | Classification | Notes |
|----------|---------|-----|---------------|-------|
| **Desktop (Tauri)** | Tauri Store (plugin-store) | Device keys (encrypted) | **E2EE** (PIN-encrypted) | PBKDF2 + AES-256-GCM; private keys in Rust CryptoState only |
| **iOS** | Keychain | Device keys (encrypted) | **E2EE** (PIN-encrypted) | kSecAttrAccessibleWhenUnlockedThisDeviceOnly + Secure Enclave |
| **Android** | EncryptedSharedPreferences | Device keys (encrypted) | **E2EE** (PIN-encrypted) | Android Keystore-backed |
| All platforms | Local/app storage | Draft notes | **E2EE** | HKDF-derived key (local-only, label: `LABEL_DRAFTS`) |
| All platforms | Local/app storage | UI preferences | Plaintext | Non-sensitive settings |
| All platforms | Local/app storage | Hub key cache | **E2EE** | Encrypted with device key; zeroed on lock |
| All platforms | Local/app storage | PUK seed cache | **E2EE** | HPKE-wrapped; zeroed on lock |

**Important**: Device private keys are NEVER stored in plaintext. They exist only:
1. Encrypted in platform secure storage (PIN-protected)
2. In the Rust `CryptoState` / `MobileState` during an unlocked session
3. Zeroized from memory on lock/logout

---

### Memory-Only (Never Persisted)

| Data | Lifetime | Notes |
|------|----------|-------|
| Device private keys (unlocked) | Unlocked session | In Rust CryptoState/MobileState; zeroized on lock |
| Decrypted note content | View lifetime | App UI state |
| Per-note encryption keys | Encryption operation | Generated fresh, never stored |
| HPKE ephemeral keys | Encryption operation | Used once, discarded |
| PUK seed (unlocked) | Unlocked session | Derived subkeys in memory; zeroized on lock |
| Hub key | Unlocked session | Stored in hub-key-manager; zeroized on lock |
| Hub event key | Unlocked session | HKDF-derived from hub key |
| Transcription audio | Recording duration | AudioWorklet → Web Worker, never persisted |
| Transcription text (pre-encryption) | Seconds | Encrypted immediately after WASM Whisper processing |

---

### Third-Party Systems

#### Telephony Providers (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth)

| Data | Classification | Retention | Notes |
|------|---------------|-----------|-------|
| Call audio | Transient | Provider-controlled | Not recorded by default |
| Call detail records | Plaintext | Provider-controlled | Timestamps, numbers, durations |
| Webhook payloads | Transient | Request duration | Validated via HMAC signature |

#### Signal Notifier Sidecar (port 3100)

| Data | Classification | Retention | Notes |
|------|---------------|-----------|-------|
| Contact identifiers | Hashed (HMAC) | Session only | Zero-knowledge: HMAC-hashed contact resolution |
| Plaintext phone numbers | **Never stored** | Never | Sidecar never stores plaintext phone numbers |

#### Transcription (Client-Side WASM Whisper)

| Data | Classification | Retention |
|------|---------------|-----------|
| Audio input | Memory-only | Duration of processing (in-browser/in-app) |
| Transcript output | Encrypted immediately | Stored as E2EE |

**Note**: Transcription is performed entirely on-device using WASM Whisper (`@huggingface/transformers`). Audio never leaves the device.

#### Nostr Relay (strfry, self-hosted)

| Data | Classification | Retention | Notes |
|------|---------------|-----------|-------|
| Ephemeral events (kind 20001) | Never persisted | Forwarded only | Call signals, presence — never stored to disk |
| Persistent events (kind 1000+) | **E2EE** | Configurable | Content encrypted with hub event key |
| Connection metadata | Plaintext | Log-dependent | IP, timing — operator controls logging |

---

## Data Flow Diagrams

### Note Encryption Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT APP (Tauri / iOS / Android)                              │
│ ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│ │ Note Text   │───▶│ Generate     │───▶│ AES-256-GCM          │ │
│ │ + Fields    │    │ noteKey (32B)│    │ encrypt(noteKey,     │ │
│ └─────────────┘    └──────────────┘    │ nonce, plaintext)    │ │
│                           │            └──────────┬───────────┘ │
│                           │                       │             │
│                           ▼                       ▼             │
│              ┌────────────────────┐    ┌──────────────────────┐ │
│              │ HPKE wrap for     │    │ encryptedContent     │ │
│              │ author X25519 key │    │ (ciphertext)         │ │
│              │ (LABEL_NOTE_KEY)  │    │                      │ │
│              └────────┬───────────┘    └──────────────────────┘ │
│                       │                           │             │
│              ┌────────┴───────────┐               │             │
│              │ HPKE wrap for     │               │             │
│              │ each admin X25519 │               │             │
│              │ (LABEL_NOTE_KEY)  │               │             │
│              └────────┬───────────┘               │             │
│                       │                           │             │
│                       ▼                           ▼             │
│              ┌────────────────────────────────────────────────┐ │
│              │ { encryptedContent, authorEnvelope,           │ │
│              │   adminEnvelopes[], authorPubkey, createdAt }  │ │
│              └──────────────────────┬─────────────────────────┘ │
└─────────────────────────────────────┼───────────────────────────┘
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER (no access to plaintext)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ PostgreSQL stores encrypted note as-is                      │ │
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
| **Access** | Users can export their notes (decrypted client-side). Admins can export all metadata. |
| **Rectification** | Users can edit their notes. Admins can update user profiles. |
| **Erasure** | Admin can delete user accounts and notes. E2EE content is cryptographically inaccessible if device keys are deleted. |
| **Portability** | Backup export includes encrypted device keys (PIN-protected). |
| **Restriction** | Admin can deactivate accounts (revokes sessions, deauthorizes devices via sigchain). |

---

## Retention Recommendations

| Data Type | Recommended Retention | Rationale |
|-----------|----------------------|-----------|
| Call notes | 7 years or legal requirement | Crisis documentation |
| Call metadata | 2 years | Operational analysis |
| Audit logs | 1 year | Security review |
| Session tokens | 8 hours (automatic) | Security best practice |
| Messaging content | 1 year | Follow-up reference |
| User records | Account lifetime + 90 days | Post-departure access |
| Sigchain entries | Indefinite | Identity integrity — chain must be complete |
| PUK CLKR chain | Account lifetime | Required for historical note decryption |

Note: Llamenos does not currently enforce automated retention policies. Operators should implement retention schedules appropriate to their jurisdiction.

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-02 | 2.0 | Complete rewrite: HPKE replaces ECIES for all key wrapping, per-device Ed25519/X25519 keys replace nsec, added sigchain/PUK/CLKR entries, added CMS data, added hub key distribution, added blind indexes, updated client storage to Tauri Store/Keychain/Keystore (not localStorage), updated Nostr relay data, added signal-notifier sidecar, removed Durable Objects/Cloudflare references |
| 2026-02-25 | 1.1 | ZK Architecture Overhaul: Updated ConversationDO to E2EE, ShiftManagerDO encrypted details, AuditDO hash chain, client-side transcription |
| 2026-02-25 | 1.0 | Initial data classification document |
