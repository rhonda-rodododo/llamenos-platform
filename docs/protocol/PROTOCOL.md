# Llamenos Interoperability Protocol Specification

**Version:** 1.0.0
**Status:** Canonical reference for all client implementations
**Audience:** Desktop (Tauri), Mobile (Native Swift/Kotlin), and any third-party client implementors

This document is the definitive wire-format specification for interoperating with the Llamenos server. Every byte layout, algorithm, and endpoint is described with sufficient precision to build a conforming client from scratch. All cryptographic constants, key derivation functions, and wire formats are derived directly from the source-of-truth implementation.

---

## Table of Contents

1. [Authentication Protocol](#1-authentication-protocol)
2. [Cryptographic Operations](#2-cryptographic-operations)
3. [WebSocket Event Schema](#3-WebSocket-event-schema)
4. [REST API Endpoints](#4-rest-api-endpoints)
5. [Push Notification Protocol](#5-push-notification-protocol)
6. [Device Provisioning Protocol](#6-device-provisioning-protocol)
7. [Permission Model](#7-permission-model)
- [Appendix A: Library Dependencies](#appendix-a-library-dependencies-for-implementors)
- [Appendix B: Type Definitions Reference](#appendix-b-type-definitions-reference)
- [Appendix C: Legacy Encryption (pre-v2 ECIES)](#appendix-c-legacy-encryption-pre-v2-ecies)

---

## 1. Authentication Protocol

Llamenos supports two authentication mechanisms. Clients MUST implement signature auth (Schnorr or Ed25519). Session token auth is optional and requires WebAuthn support.

### 1.1 Schnorr Signature Authentication (Legacy)

Every authenticated API request carries a self-signed token proving possession of a private key. The token is bound to the specific HTTP method and path to prevent cross-endpoint replay attacks.

> **Phase 6 Note:** Clients with per-device Ed25519 keys (Section 2.11) use Ed25519 signatures instead of Schnorr. The token construction is identical (same message format and binding), but the signature algorithm differs. The server tries Schnorr verification first, then falls back to Ed25519. New client implementations SHOULD use Ed25519 with the `LABEL_DEVICE_AUTH` prefix (see Section 1.1.1).

#### Token Construction

```
Step 1: Build the message string
  message = "llamenos:auth:" + pubkey_hex + ":" + timestamp_ms + ":" + HTTP_METHOD + ":" + path

  Where:
    pubkey_hex  = 64 hex chars (x-only secp256k1 public key)
    timestamp_ms = Unix epoch in milliseconds (integer)
    HTTP_METHOD  = uppercase string ("GET", "POST", "PATCH", "PUT", "DELETE")
    path         = URL pathname starting with "/" (e.g., "/api/auth/me")

Step 2: Hash the message
  message_hash = SHA-256(UTF-8(message))
  // Result: 32 bytes

Step 3: Sign with BIP-340 Schnorr
  signature = schnorr.sign(message_hash, secret_key)
  // Result: 64 bytes

Step 4: Encode as JSON
  token_json = JSON.stringify({
    "pubkey": pubkey_hex,        // 64-char hex string
    "timestamp": timestamp_ms,   // integer (milliseconds)
    "token": hex(signature)      // 128-char hex string
  })
```

#### HTTP Header Format

```
Authorization: Bearer {"pubkey":"<64_hex>","timestamp":<ms>,"token":"<128_hex>"}
```

The JSON is inlined directly after `Bearer ` (single space). No base64 encoding.

#### Example

```
Authorization: Bearer {"pubkey":"a1b2c3d4e5f6...","timestamp":1709318400000,"token":"deadbeef..."}
```

#### Validation Rules (Server-Side)

1. Parse `Authorization` header, strip `Bearer ` prefix, `JSON.parse()` the remainder.
2. Verify `pubkey`, `timestamp`, and `token` fields are all present and non-empty.
3. Check token freshness: `|now() - timestamp| <= 300,000 ms` (5-minute window, both directions).
4. Reconstruct the message: `"llamenos:auth:" + pubkey + ":" + timestamp + ":" + method + ":" + path`.
5. Compute `SHA-256(UTF-8(message))`.
6. Verify the Schnorr signature: `schnorr.verify(hex_to_bytes(token), message_hash, hex_to_bytes(pubkey))`.
7. Look up the pubkey in the identity store to resolve the user record.

#### 1.1.1 Ed25519 Device Authentication (Phase 6)

For clients using per-device Ed25519 keys (Section 2.11), the auth token uses a different message prefix and Ed25519 signatures:

```
Step 1: Build the message string
  message = "llamenos:device-auth:v1:" + timestamp_ms + ":" + HTTP_METHOD + ":" + path

  Where:
    timestamp_ms = Unix epoch in milliseconds (integer)
    HTTP_METHOD  = uppercase string ("GET", "POST", "PATCH", "PUT", "DELETE")
    path         = URL pathname starting with "/" (e.g., "/api/auth/me")

Step 2: Hash the message
  message_hash = SHA-256(UTF-8(message))

Step 3: Sign with Ed25519
  signature = ed25519.sign(message_hash, device_signing_key)
  // Result: 64 bytes

Step 4: Encode as JSON (same format as Schnorr)
  token_json = JSON.stringify({
    "pubkey": ed25519_pubkey_hex,   // 64-char hex string (32-byte Ed25519 public key)
    "timestamp": timestamp_ms,
    "token": hex(signature)         // 128-char hex string
  })
```

The server validates Ed25519 tokens the same way as Schnorr tokens, resolving the Ed25519 pubkey to a user via the device registry or sigchain.

### 1.2 Session Token Authentication (WebAuthn)

After a successful WebAuthn authentication ceremony, the server issues a random 256-bit session token with an 8-hour expiry. Clients send it on subsequent requests:

```
Authorization: Session <token_hex>
```

Where `token_hex` is a 64-character hex string (32 random bytes).

#### Validation Rules

1. Parse `Authorization` header, strip `Session ` prefix, trim whitespace.
2. Look up the token in the sessions store.
3. Verify the session has not expired (`expiresAt > now()`).
4. Resolve the associated pubkey to the user record.

### 1.3 Authentication Priority

The server checks Session auth first. If the `Authorization` header starts with `Session `, Schnorr auth is not attempted. If the header starts with `Bearer `, Session auth is not attempted.

---

## 2. Cryptographic Operations

All cryptographic operations in Llamenos use domain separation constants to prevent cross-context key reuse attacks. These constants are the canonical source of truth.

### 2.1 Domain Separation Constants

Every HPKE/ECIES derivation, HKDF context, HMAC key, and signature binding uses a unique context string from this list. Clients MUST use these exact strings. Using raw string literals instead of these constants is a protocol violation.

> **Note:** The authoritative source of truth for all domain separation constants is `packages/protocol/crypto-labels.json`. The tables below list the most commonly used labels. Refer to the source file for the complete and current count.

#### Device Authentication

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_DEVICE_AUTH` | `llamenos:device-auth:v1` | Ed25519 device auth token message prefix (Phase 6) |
| `AUTH_PREFIX` | `llamenos:auth:` | Schnorr auth token message prefix (legacy) |

#### HPKE Key Wrapping Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_NOTE_KEY` | `llamenos:note-key` | Per-note symmetric key wrapping (V2 forward secrecy) |
| `LABEL_FILE_KEY` | `llamenos:file-key` | Per-file symmetric key wrapping |
| `LABEL_FILE_METADATA` | `llamenos:file-metadata` | File metadata wrapping |
| `LABEL_HUB_KEY_WRAP` | `llamenos:hub-key-wrap` | Hub key distribution wrapping |

#### Content Encryption Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_TRANSCRIPTION` | `llamenos:transcription` | Server-side transcription encryption |
| `LABEL_MESSAGE` | `llamenos:message` | E2EE message encryption |
| `LABEL_CALL_META` | `llamenos:call-meta` | Encrypted call record metadata |
| `LABEL_SHIFT_SCHEDULE` | `llamenos:shift-schedule` | Encrypted shift schedule details |

#### HKDF Derivation Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `HKDF_SALT` | `llamenos:hkdf-salt:v1` | Legacy symmetric key derivation salt |
| `HKDF_CONTEXT_NOTES` | `llamenos:notes` | Legacy V1 note encryption context |
| `HKDF_CONTEXT_DRAFTS` | `llamenos:drafts` | Draft encryption context |
| `HKDF_CONTEXT_EXPORT` | `llamenos:export` | Export encryption context |
| `LABEL_HUB_EVENT` | `llamenos:hub-event` | Hub event HKDF derivation from hub key |

#### ECDH Key Agreement

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_DEVICE_PROVISION` | `llamenos:device-provision` | Device provisioning ECDH shared key derivation |

#### SAS Verification

| Constant | Value | Purpose |
|----------|-------|---------|
| `SAS_SALT` | `llamenos:sas` | SAS HKDF salt for provisioning verification |
| `SAS_INFO` | `llamenos:provisioning-sas` | SAS HKDF info parameter |

#### PUK (Per-User Key) Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_PUK_SIGN` | `llamenos:puk:sign:v1` | PUK signing key derivation |
| `LABEL_PUK_DH` | `llamenos:puk:dh:v1` | PUK Diffie-Hellman key derivation |
| `LABEL_PUK_SECRETBOX` | `llamenos:puk:secretbox:v1` | PUK symmetric encryption |
| `LABEL_PUK_WRAP_TO_DEVICE` | `llamenos:puk:wrap:device:v1` | PUK wrapping for device distribution |
| `LABEL_PUK_PREVIOUS_GEN` | `llamenos:puk:prev-gen:v1` | Previous PUK generation chain link |

#### Push Notification Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_PUSH_WAKE` | `llamenos:push-wake` | Push notification wake key encryption |
| `LABEL_PUSH_FULL` | `llamenos:push-full` | Push notification full content encryption |

#### CMS (Case Management) Labels

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_CONTACT_ID` | `llamenos:contact-id` | Contact identifier encryption |
| `LABEL_CONTACT_PROFILE` | `llamenos:contact-profile` | Contact profile data encryption |
| `LABEL_CASE_SUMMARY` | `llamenos:case-summary` | Case summary encryption |
| `LABEL_CASE_FIELDS` | `llamenos:case-fields` | Case custom field encryption |

#### HMAC Domain Separation

| Constant | Value | Purpose |
|----------|-------|---------|
| `HMAC_PHONE_PREFIX` | `llamenos:phone:` | Phone number hashing prefix |
| `HMAC_IP_PREFIX` | `llamenos:ip:` | IP address hashing prefix |
| `HMAC_KEYID_PREFIX` | `llamenos:keyid:` | Key identification hashing prefix |
| `HMAC_SUBSCRIBER` | `llamenos:subscriber` | Subscriber identifier HMAC key |
| `HMAC_PREFERENCE_TOKEN` | `llamenos:preference-token` | Preference token HMAC key |

#### Recovery / Backup

| Constant | Value | Purpose |
|----------|-------|---------|
| `RECOVERY_SALT` | `llamenos:recovery` | Recovery key PBKDF2 fallback salt (legacy) |
| `LABEL_BACKUP` | `llamenos:backup` | Generic backup encryption |

#### Server WebSocket Identity

| Constant | Value | Purpose |
|----------|-------|---------|
| `LABEL_SERVER_NOSTR_KEY` | `llamenos:server-WebSocket-key` | HKDF salt for server WebSocket keypair derivation |
| `LABEL_SERVER_NOSTR_KEY_INFO` | `llamenos:server-WebSocket-key:v1` | HKDF info parameter (versioned for rotation) |

### 2.2 HPKE Envelope Encryption (Current)

HPKE (Hybrid Public Key Encryption, RFC 9180) is the current envelope encryption primitive for wrapping symmetric keys for specific recipients. It replaces the legacy ECIES scheme (Section 2.2.1) for all new encryption operations.

#### Algorithm

```
Suite:     DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-256-GCM
KEM ID:    0x0020 (X25519)
KDF ID:    0x0001 (HKDF-SHA256)
AEAD ID:   0x0002 (AES-256-GCM)
```

#### Wire Format (v3 Envelope)

```json
{
  "v": 3,
  "labelId": 1,
  "enc": "<base64url — 32-byte HPKE encapsulated key>",
  "ct": "<base64url — AEAD ciphertext>"
}
```

Where:
- `v`: Envelope version (always 3 for HPKE)
- `labelId`: Integer ID mapping to a domain separation label (see `crypto-labels.json`)
- `enc`: The HPKE KEM encapsulated shared secret (32 bytes, base64url-encoded)
- `ct`: The AEAD ciphertext (base64url-encoded)

#### Albrecht Defense (Label Enforcement)

Before decryption, the `labelId` in the envelope MUST match the expected label for the operation context. This prevents ciphertext misuse attacks where an attacker substitutes an envelope from one context into another (e.g., using a note key envelope as a hub key envelope). Mismatched labels MUST cause decryption to fail.

#### Encryption

```
hpkeWrapKey(plaintext_key[32], recipient_x25519_pubkey[32], label_string):

  1. Look up label ID from crypto-labels.json
  2. HPKE.Seal(recipient_x25519_pubkey, plaintext_key, info=label_string)
  3. Return v3 envelope JSON
```

#### Decryption

```
hpkeUnwrapKey(envelope, device_x25519_secret_key[32], expected_label_string):

  1. Verify envelope.v === 3
  2. Verify envelope.labelId matches expected label
  3. HPKE.Open(device_x25519_secret_key, envelope.enc, envelope.ct, info=expected_label_string)
  4. Return plaintext key (32 bytes)
```

### 2.2.1 ECIES Key Wrapping (Legacy)

> **Deprecation Notice:** ECIES is retained for backwards compatibility with existing encrypted data. All new encryption operations SHOULD use HPKE (Section 2.2). ECIES uses secp256k1 ECDH + XChaCha20-Poly1305 while HPKE uses X25519 + AES-256-GCM.

ECIES (Elliptic Curve Integrated Encryption Scheme) is the legacy primitive for encrypting symmetric keys for specific recipients.

#### Algorithm

```
Curve:     secp256k1
AEAD:      XChaCha20-Poly1305

eciesWrapKey(plaintext_key[32], recipient_pubkey_hex[64], label_string):

  1. Generate ephemeral keypair:
     ephemeral_secret = random(32)
     ephemeral_pubkey = secp256k1.getPublicKey(ephemeral_secret, compressed=true)
     // ephemeral_pubkey: 33 bytes (compressed format, 0x02 or 0x03 prefix)

  2. Prepare recipient compressed pubkey:
     // WebSocket pubkeys are x-only (32 bytes / 64 hex chars). Prepend 0x02.
     recipient_compressed = 0x02 || hex_to_bytes(recipient_pubkey_hex)
     // Result: 33 bytes

  3. ECDH shared secret:
     shared = secp256k1.getSharedSecret(ephemeral_secret, recipient_compressed)
     // shared: 33 bytes (compressed point)
     shared_x = shared[1..33]
     // shared_x: 32 bytes (x-coordinate only, strip the 0x02/0x03 prefix byte)

  4. Derive symmetric key (domain-separated):
     label_bytes = UTF-8(label_string)
     key_input = label_bytes || shared_x
     symmetric_key = SHA-256(key_input)
     // symmetric_key: 32 bytes

  5. Encrypt the plaintext key:
     nonce = random(24)
     cipher = XChaCha20-Poly1305(symmetric_key, nonce)
     ciphertext = cipher.encrypt(plaintext_key)
     // ciphertext: 32 + 16 = 48 bytes (32 plaintext + 16 auth tag)

  6. Pack output:
     packed = nonce || ciphertext
     // packed: 24 + 48 = 72 bytes

  7. Return:
     KeyEnvelope {
       wrappedKey:      hex(packed)           // 144 hex chars
       ephemeralPubkey: hex(ephemeral_pubkey)  // 66 hex chars (compressed 33 bytes)
     }
```

#### Byte Layout of `wrappedKey`

```
Offset  Length  Content
------  ------  -------
0       24      XChaCha20-Poly1305 nonce (random)
24      32      Encrypted symmetric key
56      16      Poly1305 authentication tag
------  ------
Total:  72 bytes (144 hex chars)
```

#### Unwrapping

```
eciesUnwrapKey(envelope: KeyEnvelope, secret_key[32], label_string):

  1. Parse ephemeral pubkey:
     ephemeral_pub = hex_to_bytes(envelope.ephemeralPubkey)
     // 33 bytes, already compressed

  2. ECDH shared secret:
     shared = secp256k1.getSharedSecret(secret_key, ephemeral_pub)
     shared_x = shared[1..33]

  3. Derive symmetric key (same as wrapping):
     label_bytes = UTF-8(label_string)
     key_input = label_bytes || shared_x
     symmetric_key = SHA-256(key_input)

  4. Unpack and decrypt:
     data = hex_to_bytes(envelope.wrappedKey)
     nonce = data[0..24]
     ciphertext = data[24..]
     cipher = XChaCha20-Poly1305(symmetric_key, nonce)
     plaintext_key = cipher.decrypt(ciphertext)
     // plaintext_key: 32 bytes
```

#### RecipientKeyEnvelope

When wrapping a key for multiple recipients, each envelope is tagged with the recipient's pubkey:

```typescript
interface RecipientKeyEnvelope {
  pubkey: string           // recipient's x-only pubkey (64 hex chars)
  wrappedKey: string       // 144 hex chars (nonce + ciphertext + tag)
  ephemeralPubkey: string  // 66 hex chars (compressed 33-byte ephemeral pubkey)
}
```

A unique ephemeral keypair is generated per-recipient per-wrap operation. This ensures that compromising one recipient's envelope reveals nothing about other recipients' envelopes.

### 2.3 Per-Note Encryption (V2 Forward Secrecy)

Every note is encrypted with a unique random key, providing forward secrecy. Compromising an identity key does not reveal past notes.

#### Encryption

```
encryptNoteV2(payload: NotePayload, author_x25519_pubkey_hex, admin_x25519_pubkey_hexes[]):

  1. Serialize payload:
     json_string = JSON.stringify(payload)
     // NotePayload = { text: string, fields?: Record<string, string|number|boolean> }

  2. Generate per-note symmetric key:
     note_key = random(32)

  3. Encrypt content with AES-256-GCM:
     iv = random(12)
     ciphertext_with_tag = AES-256-GCM.encrypt(note_key, iv, UTF-8(json_string))
     // ciphertext_with_tag: variable length + 16-byte GCM tag appended
     encrypted_content = hex(iv || ciphertext_with_tag)

  4. Wrap note_key for the author via HPKE:
     author_sealed = HPKE.Seal(
       recipientPk = hex_to_bytes(author_x25519_pubkey_hex),
       plaintext   = note_key,
       info        = UTF-8("llamenos:note-key"),
       aad         = empty
     )
     author_envelope = {
       enc: hex(author_sealed[0..32]),   // 32-byte HPKE encapsulated key → 64 hex chars
       ct:  hex(author_sealed[32..])     // AEAD ciphertext
     }

  5. Wrap note_key for each admin via HPKE:
     admin_envelopes = []
     for each admin_x25519_pubkey_hex in admin_x25519_pubkey_hexes:
       sealed = HPKE.Seal(
         recipientPk = hex_to_bytes(admin_x25519_pubkey_hex),
         plaintext   = note_key,
         info        = UTF-8("llamenos:note-key"),
         aad         = empty
       )
       admin_envelopes.push({
         pubkey: admin_x25519_pubkey_hex,   // 64 hex chars
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       })

  6. Return:
     EncryptedNoteV2 {
       encryptedContent: encrypted_content,   // hex string
       authorEnvelope:   author_envelope,      // KeyEnvelope { enc, ct }
       adminEnvelopes:   admin_envelopes        // RecipientEnvelope[] { pubkey, enc, ct }
     }
```

#### Decryption

```
decryptNoteV2(encrypted_content_hex, envelope: KeyEnvelope, device_x25519_secret_key[32]):

  1. Unwrap the note key via HPKE:
     enc_bytes = hex_to_bytes(envelope.enc)   // 32 bytes
     ct_bytes  = hex_to_bytes(envelope.ct)
     note_key = HPKE.Open(
       recipientSk = device_x25519_secret_key,
       enc         = enc_bytes,
       ciphertext  = ct_bytes,
       info        = UTF-8("llamenos:note-key"),
       aad         = empty
     )
     // note_key: 32 bytes

  2. Decrypt content with AES-256-GCM:
     data = hex_to_bytes(encrypted_content_hex)
     iv   = data[0..12]
     ciphertext_with_tag = data[12..]
     plaintext = AES-256-GCM.decrypt(note_key, iv, ciphertext_with_tag)

  3. Parse JSON:
     json_string = UTF-8_decode(plaintext)
     payload = JSON.parse(json_string) as NotePayload
     // If JSON parse fails or doesn't have .text field:
     // Return { text: json_string }
```

#### Wire Format: `encryptedContent`

```
Offset  Length    Content
------  ------    -------
0       12        AES-256-GCM IV (random, 12 bytes)
12      variable  Ciphertext + GCM tag (UTF-8 JSON payload + 16-byte GCM authentication tag)
```

The entire byte sequence is hex-encoded for transport.

#### Wire Format: Key Envelopes

Author envelope (`authorEnvelope`):
```json
{ "enc": "<hex64 — 32-byte HPKE encapsulated key>", "ct": "<hex — AEAD ciphertext>" }
```

Admin envelope (`adminEnvelopes[i]`):
```json
{ "pubkey": "<hex64>", "enc": "<hex64>", "ct": "<hex>" }
```

### 2.4 Per-Message Encryption

Messages (SMS, WhatsApp, Signal, web reports) use the same envelope pattern as notes but with `LABEL_MESSAGE` for domain separation. A random per-message symmetric key is generated and wrapped for each authorized reader.

#### Encryption

```
encryptMessage(plaintext_string, reader_x25519_pubkey_hexes[]):

  1. Generate per-message symmetric key:
     message_key = random(32)

  2. Encrypt content with AES-256-GCM:
     iv = random(12)
     ciphertext_with_tag = AES-256-GCM.encrypt(
       key     = message_key,
       iv      = iv,
       aad     = UTF-8("llamenos:message"),
       message = UTF-8(plaintext_string)
     )
     encrypted_content = hex(iv || ciphertext_with_tag)

  3. Wrap message_key for each reader via HPKE:
     reader_envelopes = []
     for each reader_x25519_pubkey_hex in reader_x25519_pubkey_hexes:
       sealed = HPKE.Seal(
         recipientPk = hex_to_bytes(reader_x25519_pubkey_hex),
         plaintext   = message_key,
         info        = UTF-8("llamenos:message"),
         aad         = UTF-8("llamenos:message:key-wrap")
       )
       reader_envelopes.push({
         pubkey: reader_x25519_pubkey_hex,   // 64 hex chars
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       })

  4. Return:
     EncryptedMessagePayload {
       encryptedContent: encrypted_content,
       readerEnvelopes:  reader_envelopes     // RecipientEnvelope[] { pubkey, enc, ct }
     }
```

#### Decryption

```
decryptMessage(encrypted_content_hex, reader_envelopes[], device_x25519_secret_key[32], reader_pubkey_hex):

  1. Find matching envelope:
     envelope = reader_envelopes.find(e => e.pubkey === reader_pubkey_hex)
     // Return null if no matching envelope

  2. Unwrap message key via HPKE:
     enc_bytes = hex_to_bytes(envelope.enc)
     ct_bytes  = hex_to_bytes(envelope.ct)
     message_key = HPKE.Open(
       recipientSk = device_x25519_secret_key,
       enc         = enc_bytes,
       ciphertext  = ct_bytes,
       info        = UTF-8("llamenos:message"),
       aad         = UTF-8("llamenos:message:key-wrap")
     )

  3. Decrypt content with AES-256-GCM:
     data = hex_to_bytes(encrypted_content_hex)
     iv   = data[0..12]
     ciphertext_with_tag = data[12..]
     plaintext = AES-256-GCM.decrypt(
       key        = message_key,
       iv         = iv,
       aad        = UTF-8("llamenos:message"),
       ciphertext = ciphertext_with_tag
     )

  4. Return UTF-8 string
```

#### Server-Side Encryption (Inbound Webhooks)

When the server receives an inbound message via a messaging webhook (SMS/WhatsApp/Signal), it encrypts the plaintext immediately using the same envelope pattern:

1. Server generates a random `message_key`.
2. Server encrypts the plaintext with AES-256-GCM (AAD=`UTF-8(LABEL_MESSAGE)`).
3. Server wraps `message_key` for each authorized reader (assigned volunteer + all admins) via HPKE with `LABEL_MESSAGE`. See `apps/worker/lib/crypto.ts` `encryptMessageForStorage()`.
4. Plaintext is discarded from memory. The server cannot read stored messages after this point.

### 2.5 Call Record Metadata Encryption

Active calls remain as plaintext (routing necessity). When a call completes, sensitive metadata is encrypted into an envelope and stored permanently.

#### What Gets Encrypted

```typescript
interface CallRecordMetadata {
  answeredBy: string | null   // Volunteer pubkey
  callerNumber: string        // HMAC-hashed phone number
}
```

#### What Stays in Plaintext

```
callerLast4, startedAt, endedAt, duration, status, hasTranscription,
hasVoicemail, hasRecording, recordingSid
```

#### Algorithm

Same envelope pattern as per-message encryption but using `LABEL_CALL_META` and admin-only recipients:

```
encryptCallRecordForStorage(metadata_object, admin_x25519_pubkey_hexes[]):

  1. record_key = random(32)
  2. iv = random(12)
  3. ciphertext_with_tag = AES-256-GCM.encrypt(
       key     = record_key,
       iv      = iv,
       aad     = UTF-8("llamenos:call-meta"),
       message = UTF-8(JSON.stringify(metadata_object))
     )
  4. encrypted_content = hex(iv || ciphertext_with_tag)
  5. admin_envelopes = admin_x25519_pubkey_hexes.map(pk => {
       sealed = HPKE.Seal(
         recipientPk = hex_to_bytes(pk),
         plaintext   = record_key,
         info        = UTF-8("llamenos:call-meta"),
         aad         = UTF-8("llamenos:call-meta:key-wrap")
       )
       return {
         pubkey: pk,
         enc:    hex(sealed[0..32]),
         ct:     hex(sealed[32..])
       }
     })
  6. Return { encryptedContent, adminEnvelopes }
```

Decryption: `HPKE.Open(device_x25519_secret_key, enc_bytes, ct_bytes, info=UTF-8("llamenos:call-meta"), aad=UTF-8("llamenos:call-meta:key-wrap"))` returns `record_key`. Then AES-256-GCM decrypt using `iv = data[0..12]`, `aad = UTF-8("llamenos:call-meta")`.

### 2.6 Key Storage (PIN-Encrypted)

> **Legacy Model:** This section describes the original nsec-per-user key storage using XChaCha20-Poly1305.
> The current system uses per-device Ed25519/X25519 keypairs stored with AES-256-GCM (Section 2.11).
> Section 2.6 is retained for backward-compatibility reference only.
> New client implementations MUST use the Section 2.11 model.

The user's WebSocket secret key (nsec, bech32-encoded) is encrypted with a user-chosen PIN and stored in the client's local persistent storage (localStorage on web, secure storage on native).

#### Encryption Parameters

```
PIN:          6-8 decimal digits (validated by regex /^\d{6,8}$/)
Salt:         16 random bytes
KDF:          PBKDF2 with SHA-256
Iterations:   600,000
Key length:   256 bits (32 bytes)
AEAD:         XChaCha20-Poly1305
Nonce:        24 random bytes
```

#### Key Derivation

```
Step 1: Import PIN as PBKDF2 key material
  pin_bytes = UTF-8(pin_string)
  key_material = PBKDF2.importKey(pin_bytes)

Step 2: Derive KEK (Key Encryption Key)
  kek = PBKDF2.deriveBits(
    hash = SHA-256,
    salt = salt[16],
    iterations = 600000,
    length = 256 bits
  )
  // kek: 32 bytes
```

#### Encryption

```
storeEncryptedKey(nsec_bech32, pin, pubkey_hex):

  1. salt = random(16)
  2. kek = PBKDF2-SHA256(UTF-8(pin), salt, 600000, 32)
  3. nonce = random(24)
  4. cipher = XChaCha20-Poly1305(kek, nonce)
  5. ciphertext = cipher.encrypt(UTF-8(nsec_bech32))
  6. pubkey_hash = SHA-256(UTF-8("llamenos:keyid:" + pubkey_hex))[0..8]
     // First 8 bytes = 16 hex chars (truncated hash)

  Storage JSON:
  {
    "salt":       hex(salt),          // 32 hex chars
    "iterations": 600000,
    "nonce":      hex(nonce),         // 48 hex chars
    "ciphertext": hex(ciphertext),    // variable length
    "pubkey":     hex(pubkey_hash)    // 16 hex chars (truncated, NOT the actual pubkey)
  }
```

**Security note:** The `pubkey` field stores a truncated SHA-256 hash of the pubkey, NOT the plaintext pubkey. This allows identification of which key is stored without revealing the actual public key to an attacker who gains access to local storage.

#### Decryption

```
decryptStoredKey(pin):

  1. Read JSON from storage
  2. salt = hex_to_bytes(stored.salt)
  3. nonce = hex_to_bytes(stored.nonce)
  4. ciphertext = hex_to_bytes(stored.ciphertext)
  5. kek = PBKDF2-SHA256(UTF-8(pin), salt, 600000, 32)
  6. cipher = XChaCha20-Poly1305(kek, nonce)
  7. plaintext = cipher.decrypt(ciphertext)
     // Throws on wrong PIN (authentication failure)
  8. Return UTF-8_decode(plaintext)
     // Returns nsec bech32 string
```

### 2.7 Hub Key Management

Each hub has a random symmetric key used for hub-wide broadcast encryption. The hub key is NOT derived from any identity key -- it is pure random bytes.

#### Key Generation

```
hub_key = crypto.getRandomValues(new Uint8Array(32))
// 32 random bytes
```

#### Distribution

The hub key is wrapped individually for each hub member using HPKE. Clients compute envelopes and upload them via `PUT /api/hubs/:hubId/key`:

```
wrapHubKeyForMembers(hub_key[32], member_x25519_pubkey_hexes[]):

  envelopes = []
  for each member_x25519_pubkey_hex in member_x25519_pubkey_hexes:
    sealed = HPKE.Seal(
      recipientPk = hex_to_bytes(member_x25519_pubkey_hex),
      plaintext   = hub_key,
      info        = UTF-8("llamenos:hub-key-wrap"),
      aad         = UTF-8("llamenos:hub-key-wrap:key-wrap")
    )
    envelopes.push({
      pubkey: member_x25519_pubkey_hex,   // 64 hex chars
      enc:    hex(sealed[0..32]),
      ct:     hex(sealed[32..])
    })
  return envelopes
```

Members fetch their envelope from `GET /api/hubs/:hubId/key` and unwrap:

```
unwrapHubKey(envelope: RecipientEnvelope, device_x25519_secret_key[32]):
  enc_bytes = hex_to_bytes(envelope.enc)
  ct_bytes  = hex_to_bytes(envelope.ct)
  return HPKE.Open(
    recipientSk = device_x25519_secret_key,
    enc         = enc_bytes,
    ciphertext  = ct_bytes,
    info        = UTF-8("llamenos:hub-key-wrap"),
    aad         = UTF-8("llamenos:hub-key-wrap:key-wrap")
  )
  // Returns hub_key: 32 bytes
```

#### Hub-Wide Encryption / Decryption

```
encryptForHub(plaintext_string, hub_key[32]):
  nonce = random(24)
  cipher = XChaCha20-Poly1305(hub_key, nonce)
  ciphertext = cipher.encrypt(UTF-8(plaintext_string))
  return hex(nonce || ciphertext)

decryptFromHub(packed_hex, hub_key[32]):
  data = hex_to_bytes(packed_hex)
  nonce = data[0..24]
  ciphertext = data[24..]
  cipher = XChaCha20-Poly1305(hub_key, nonce)
  plaintext = cipher.decrypt(ciphertext)
  return UTF-8_decode(plaintext)
```

#### Key Rotation

On member departure:

1. Generate a new random hub key.
2. Wrap it for all **remaining** members (excluding the departed member).
3. Store new envelopes via `PUT /api/hubs/:hubId/key`.
4. Re-encrypt any hub-scoped data with the new key.
5. Distribute via `GET /api/hubs/:hubId/key`.

### 2.8 WebSocket Event Encryption

#### Hub-Wide Broadcasts

Hub-wide events (call rings, presence updates, settings changes) are encrypted with a key derived from the hub key:

```
Step 1: Derive event encryption key
  event_key = HKDF(
    hash = SHA-256,
    ikm  = hub_key,
    salt = empty (zero-length),
    info = UTF-8("llamenos:hub-event"),
    length = 32
  )

Step 2: Encrypt event content
  nonce = random(24)
  cipher = XChaCha20-Poly1305(event_key, nonce)
  ciphertext = cipher.encrypt(UTF-8(json_content))
  encrypted = hex(nonce || ciphertext)
```

All hub members who possess the hub key can derive the same event key and decrypt.

#### Targeted Messages (Single Recipient)

For events intended for a single recipient (e.g., direct provisioning messages), use HPKE encryption targeted to the recipient's X25519 pubkey.

### 2.9 Server WebSocket Keypair Derivation

The server derives its event signing keypair deterministically from a 64-hex-char secret (`SERVER_SECRET`):

```
deriveServerKeypair(server_secret_hex):

  secret_bytes = hex_to_bytes(server_secret_hex)  // 32 bytes

  // Use registered domain separation labels (LABEL_SERVER_SIGNING_KEY, LABEL_SERVER_SIGNING_INFO)
  signing_seed = HKDF(
    hash = SHA-256,
    ikm  = secret_bytes,
    salt = UTF-8(LABEL_SERVER_SIGNING_KEY),   // "llamenos:server:signing-key"
    info = UTF-8(LABEL_SERVER_SIGNING_INFO),  // "llamenos:server:signing-info"
    length = 32
  )

  pubkey = Ed25519.pubkeyFromSeed(signing_seed)  // 32-byte Ed25519 public key, hex-encoded

  Return { secretKey: signing_seed, pubkeyHex }
```

See `apps/worker/lib/server-identity.ts` `deriveServerKeypair()` for the implementation.

The server's pubkey is distributed to clients via `GET /api/config` in the `serverWebSocketPubkey` field. Clients verify server-published WebSocket events against this pubkey.

### 2.10 HMAC Operations

#### Phone Number Hashing

```
hashPhone(phone_e164, hmac_secret_hex):
  key = hex_to_bytes(hmac_secret_hex)
  input = UTF-8("llamenos:phone:" + phone_e164)
  return hex(HMAC-SHA256(key, input))
```

#### IP Address Hashing

```
hashIP(ip_string, hmac_secret_hex):
  key = hex_to_bytes(hmac_secret_hex)
  input = UTF-8("llamenos:ip:" + ip_string)
  return hex(HMAC-SHA256(key, input))[0..24]
  // Truncated to 96 bits (24 hex chars)
```

### 2.11 Per-Device Key Storage (Current)

The current key model uses per-device keypairs — replacing the legacy single nsec-per-user scheme (Section 2.6). Each device generates two independent keypairs on first launch:

```
Device Key Generation:
  1. signing_seed = random(32)
     ed25519_signing_key = Ed25519.from_seed(signing_seed)
     ed25519_pubkey = ed25519_signing_key.public_key()
     // Used for: auth tokens, sigchain entries, MLS leaf credentials

  2. encryption_seed = random(32)
     x25519_encryption_key = X25519.from(encryption_seed)
     x25519_pubkey = x25519_encryption_key.public_key()
     // Used for: HPKE decapsulation, PUK envelope decryption
```

Device private keys are stored encrypted with the user's PIN using AES-256-GCM (not XChaCha20-Poly1305 as in legacy nsec storage):

```
PIN Encryption (Phase 6):
  KDF:    PBKDF2-SHA256, 600,000 iterations
  AEAD:   AES-256-GCM (12-byte nonce, 16-byte tag)
```

#### Platform Storage

| Platform | Storage | Access Control |
|----------|---------|----------------|
| Desktop (Tauri) | Tauri Stronghold (encrypted vault) | Rust `CryptoState`; keys never enter webview |
| iOS | Keychain Services | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` |
| Android | EncryptedSharedPreferences | AndroidKeyStore-backed |

#### Device Authorization (Sigchain)

New devices are authorized via an append-only hash-chained sigchain. Each sigchain entry is Ed25519-signed by an existing authorized device and contains the new device's Ed25519 + X25519 public keys. The PUK (Per-User Key) is wrapped for each authorized device via `LABEL_PUK_WRAP_TO_DEVICE`.

#### Relationship to WebSocket Identity

WebSocket events are signed by the server's derived event keypair. Clients verify the server signature on all WebSocket events. Device Ed25519 keys handle application-level auth and sigchain. Device X25519 keys handle HPKE encryption. These are NOT derived from the server event key.

### 2.12 Audit Log Hash Chain

Each audit log entry contains a SHA-256 hash linking it to the previous entry, forming a tamper-evident chain:

```
hashAuditEntry(entry):
  content = entry.id + ":" +
            entry.event + ":" +
            entry.actorPubkey + ":" +
            entry.createdAt + ":" +
            JSON.stringify(entry.details) + ":" +
            (entry.previousEntryHash || "")

  return hex(SHA-256(UTF-8(content)))
```

Each entry stores:
- `previousEntryHash`: SHA-256 of the prior entry (empty string for the first entry)
- `entryHash`: SHA-256 of this entry's content

### 2.13 Legacy V1 Note Decryption

V1 notes (pre-forward-secrecy) are encrypted with a key derived from the user's secret key via HKDF. No new V1 notes are created; this exists only for backward compatibility.

```
decryptNote(packed_hex, secret_key[32]):

  1. Derive key:
     salt = UTF-8("llamenos:hkdf-salt:v1")
     key = HKDF(SHA-256, secret_key, salt, UTF-8("llamenos:notes"), 32)

  2. Decrypt:
     data = hex_to_bytes(packed_hex)
     nonce = data[0..24]
     ciphertext = data[24..]
     cipher = XChaCha20-Poly1305(key, nonce)
     plaintext = cipher.decrypt(ciphertext)
     return parse_as_NotePayload(UTF-8_decode(plaintext))
```

### 2.13 Transcription Decryption

> **Legacy Model:** This section describes the original ECIES-based transcription encryption (secp256k1 ECDH + XChaCha20-Poly1305). Retained for decrypting existing transcriptions. New implementations should use HPKE (Section 2.2).

Server-encrypted transcriptions use ECIES with a per-transcription ephemeral key. The server wraps the ciphertext for the answering volunteer's pubkey.

```
decryptTranscription(packed_hex, ephemeral_pubkey_hex, secret_key[32]):

  1. ephemeral_pub = hex_to_bytes(ephemeral_pubkey_hex)
     // Already compressed (33 bytes / 66 hex chars)

  2. shared = secp256k1.getSharedSecret(secret_key, ephemeral_pub)
     shared_x = shared[1..33]

  3. label = UTF-8("llamenos:transcription")
     key_input = label || shared_x
     symmetric_key = SHA-256(key_input)

  4. data = hex_to_bytes(packed_hex)
     nonce = data[0..24]
     ciphertext = data[24..]
     cipher = XChaCha20-Poly1305(symmetric_key, nonce)
     plaintext = cipher.decrypt(ciphertext)

  5. Return UTF-8_decode(plaintext)
```

### 2.14 Draft Encryption

Local draft auto-save uses HKDF-derived keys with `HKDF_CONTEXT_DRAFTS` domain separation:

```
encryptDraft(plaintext_string, secret_key[32]):
  salt = UTF-8("llamenos:hkdf-salt:v1")
  key = HKDF(SHA-256, secret_key, salt, UTF-8("llamenos:drafts"), 32)
  nonce = random(24)
  cipher = XChaCha20-Poly1305(key, nonce)
  ciphertext = cipher.encrypt(UTF-8(plaintext_string))
  return hex(nonce || ciphertext)
```

### 2.15 Export Encryption

JSON export blobs are encrypted with an HKDF-derived key:

```
encryptExport(json_string, secret_key[32]):
  salt = UTF-8("llamenos:hkdf-salt:v1")
  key = HKDF(SHA-256, secret_key, salt, UTF-8("llamenos:export"), 32)
  nonce = random(24)
  cipher = XChaCha20-Poly1305(key, nonce)
  ciphertext = cipher.encrypt(UTF-8(json_string))
  return nonce || ciphertext   // raw bytes, not hex
```

### 2.16 Encrypted File Uploads

Files are encrypted client-side before upload. The encryption follows the envelope pattern:

1. Generate random 32-byte file key.
2. Encrypt file content with XChaCha20-Poly1305 (chunked).
3. Encrypt file metadata (original name, MIME type, size, dimensions, duration, plaintext SHA-256 checksum) using `LABEL_FILE_METADATA`.
4. Wrap file key for each recipient using `LABEL_FILE_KEY`.
5. Upload encrypted chunks, envelopes, and metadata to server.

```typescript
interface EncryptedFileMetadata {
  originalName: string
  mimeType: string
  size: number
  dimensions?: { width: number; height: number }
  duration?: number
  checksum: string   // SHA-256 of plaintext for integrity verification
}

interface RecipientEnvelope {
  pubkey: string   // recipient X25519 pubkey (hex)
  enc: string      // HPKE encapsulated key (hex, 64 chars)
  ct: string       // HPKE AEAD ciphertext — wraps the file key (LABEL_FILE_KEY)
}
```

---

## 3. WebSocket Event Schema

Llamenos uses a built-in WebSocket endpoint on the API server for real-time event distribution. All events are server-signed and encrypted with the hub key.

### 3.1 Event Kind Definitions

#### Regular Events (Persisted)

| Kind | Constant | Purpose |
|------|----------|---------|
| 1000 | `KIND_CALL_RING` | Incoming call notification -- triggers volunteer ringing |
| 1001 | `KIND_CALL_UPDATE` | Call state update (answered, completed, etc.) |
| 1002 | `KIND_CALL_VOICEMAIL` | Voicemail received for a call |
| 1010 | `KIND_MESSAGE_NEW` | New conversation message (inbound from external channel) |
| 1011 | `KIND_CONVERSATION_ASSIGNED` | Conversation assignment changed |
| 1020 | `KIND_SHIFT_UPDATE` | Shift schedule changed |
| 1030 | `KIND_SETTINGS_CHANGED` | Settings changed (global or hub-scoped) |

#### Ephemeral Events (Not Persisted, Broadcast Only)

| Kind | Constant | Purpose |
|------|----------|---------|
| 20000 | `KIND_PRESENCE_UPDATE` | Volunteer presence update -- online counts, availability |
| 20001 | `KIND_CALL_SIGNAL` | Call answer/hangup signals -- real-time coordination |

#### Authentication Events

| Type | Constant | Purpose |
|------|----------|---------|
| `auth` | `EVENT_AUTH` | WebSocket authentication |

### 3.2 Event Format

All server-published events follow this structure:

```json
{
  "kind": 1000,
  "created_at": 1709318400,
  "tags": [
    ["d", "global"],
    ["t", "llamenos:event"]
  ],
  "content": "<encrypted_json_string>",
  "id": "<computed_event_id>",
  "pubkey": "<server_WebSocket_pubkey>",
  "sig": "<schnorr_signature>"
}
```

#### Tag Convention

All events include a generic `type` field inside the encrypted payload. This prevents the WebSocket infrastructure from distinguishing between event types (call events, message events, settings events all look the same to the server).

The `["d", "global"]` tag is used for hub-wide broadcasts. Hub-scoped events would use `["d", hub_id]`.

#### Content Encryption

The `content` field is always encrypted:
- **Hub-wide broadcasts**: Encrypted with the hub key (Section 2.8).
- **Targeted messages**: Encrypted via HPKE (Section 2.2) targeted to the recipient's X25519 pubkey.

The plaintext content is a JSON string with a `type` field identifying the event type:

```json
{"type": "call:ring", "callId": "abc123", "callerLast4": "5678"}
{"type": "call:answered", "callId": "abc123", "answeredBy": "pubkey_hex"}
{"type": "call:end", "callId": "abc123"}
{"type": "presence:update", "onlineCount": 5}
{"type": "message:new", "conversationId": "conv123", "channelType": "sms"}
{"type": "message:status", "conversationId": "conv123", "messageId": "msg456", "status": "delivered"}
{"type": "conversation:assigned", "conversationId": "conv123", "assignedTo": "pubkey_hex"}
{"type": "shift:update", "shiftId": "shift123"}
{"type": "settings:changed", "section": "spam"}
{"type": "report:new", "conversationId": "conv123", "category": "harassment"}
```

### 3.3 Server Signing

Events are signed using the server's derived keypair (Section 2.9). Clients verify against the `serverWebSocketPubkey` from `GET /api/config`.

```
signServerEvent(payload, secret_key):
  // Serialize payload deterministically
  message = SHA-256(JSON.stringify(payload))
  // Sign with BIP-340 Schnorr
  signature = schnorr.sign(message, secret_key)
  return { payload, signature: hex(signature), pubkey: serverPubkey }
```

### 3.4 Client Connection

Clients connect to the WebSocket endpoint provided by `GET /api/config`:
- `wsUrl`: WebSocket URL (e.g., `wss://api.example.com/ws` or relative `/ws`)
- If `wsUrl` is null, WebSocket real-time is not configured.

Clients authenticate and then receive events for their subscribed hubs:

```json
{
  "action": "subscribe",
  "hubIds": ["hub-id-1", "hub-id-2"]
}
```

---

## 4. REST API Endpoints

All API endpoints are prefixed with `/api`. Requests and responses use JSON unless otherwise noted. All timestamps are ISO 8601 strings.

### 4.1 Public Endpoints (No Auth)

#### Health Check

```
GET /api/health
Response: { "status": "ok" }
```

#### Configuration

```
GET /api/config
Response: {
  "hotlineName": "Hotline",
  "hotlineNumber": "+1234567890",
  "channels": {
    "voice": true, "sms": false, "whatsapp": false,
    "signal": false, "rcs": false, "reports": true
  },
  "setupCompleted": true,
  "demoMode": false,
  "demoResetSchedule": null,
  "needsBootstrap": false,
  "hubs": [{ "id": "...", "name": "...", "slug": "...", ... }],
  "defaultHubId": "...",
  "serverWebSocketPubkey": "hex_64",
  "WebSocketRelayUrl": "wss://...",
  "apiVersion": "1.0.0",
  "minApiVersion": "0.9.0",
  "sentryDsn"?: "https://..."   // Optional, only if GlitchTip/Sentry is configured
}
```

#### Build Verification

```
GET /api/config/verify
Response: {
  "version": "1.0.0",
  "commit": "abc1234",
  "buildTime": "2024-01-01T00:00:00Z",
  "verificationUrl": "https://github.com/...",
  "trustAnchor": "GitHub Release checksums + SLSA provenance"
}
```

#### IVR Audio (Public -- Twilio Fetches During Calls)

```
GET /api/ivr-audio/:promptType/:language
Response: audio/wav binary
// promptType: [a-z_-]+, language: [a-z]{2,5}(-[A-Z]{2})?
```

#### Messaging Preferences (Token-Validated, No Auth)

```
GET /api/messaging/preferences?token=<hmac_token>
Response: subscriber preference data

PATCH /api/messaging/preferences?token=<hmac_token>
Body: { status?: string, language?: string, ... }
```

### 4.2 Authentication

#### Login

```
POST /api/auth/login
Body: { "pubkey": "hex64", "timestamp": ms, "token": "hex128" }
Response: { "ok": true, "roles": ["role-super-admin"] }
Error: 401 { "error": "Invalid credentials" }
Rate limited: 10 attempts per IP
```

#### Bootstrap (First Admin Registration)

```
POST /api/auth/bootstrap
Body: { "pubkey": "hex64", "timestamp": ms, "token": "hex128" }
Response: { "ok": true, "roles": ["role-super-admin"] }
Error: 403 { "error": "Admin already exists" }
Rate limited: 5 attempts per IP
```

#### Get Current User (Auth Required)

```
GET /api/auth/me
Auth: Bearer or Session
Response: {
  "pubkey": "hex64",
  "roles": ["role-super-admin"],
  "permissions": ["*"],
  "primaryRole": { "id": "role-super-admin", "name": "Super Admin", "slug": "super-admin" } | null,
  "name": "Admin",
  "transcriptionEnabled": true,
  "spokenLanguages": ["en", "es"],
  "uiLanguage": "en",
  "profileCompleted": true,
  "onBreak": false,
  "callPreference": "phone",
  "webauthnRequired": false,
  "webauthnRegistered": true,
  "adminDecryptionPubkey"?: "hex64",    // Optional, present for admins
  "serverEventKeyHex"?: "hex64"         // Optional, server event signing key
}
```

#### Logout

```
POST /api/auth/me/logout
Auth: Bearer or Session
Response: { "ok": true }
// If using Session auth, the token is revoked server-side
```

#### Update Profile

```
PATCH /api/auth/me/profile
Auth: Required
Body: {
  "name"?: string,
  "phone"?: string (E.164),
  "spokenLanguages"?: string[],
  "uiLanguage"?: string,
  "profileCompleted"?: boolean,
  "callPreference"?: "phone" | "browser" | "both"
}
Response: { "ok": true }
```

#### Update Availability

```
PATCH /api/auth/me/availability
Auth: Required
Body: { "onBreak": boolean }
Response: { "ok": true }
```

#### Update Transcription Preference

```
PATCH /api/auth/me/transcription
Auth: Required
Body: { "enabled": boolean }
Response: { "ok": true }
Error: 403 if opt-out is not allowed by admin
```

### 4.3 WebAuthn

#### Login Flow

```
POST /api/webauthn/login/options
Auth: None
Response: { ...publicKeyCredentialRequestOptions, "challengeId": "uuid" }

POST /api/webauthn/login/verify
Auth: None
Body: { "assertion": WebAuthnAssertion, "challengeId": "uuid" }
Response: { "token": "hex64", "pubkey": "hex64" }
// Returns a session token for subsequent requests
```

#### Registration Flow (Auth Required)

```
POST /api/webauthn/register/options
Auth: Required
Body: { "label": "My Phone" }
Response: { ...publicKeyCredentialCreationOptions, "challengeId": "uuid" }

POST /api/webauthn/register/verify
Auth: Required
Body: { "attestation": WebAuthnAttestation, "label": "My Phone", "challengeId": "uuid" }
Response: { "ok": true }
```

#### Credential Management (Auth Required)

```
GET /api/webauthn/credentials
Auth: Required
Response: { "credentials": [{ "id", "label", "backedUp", "createdAt", "lastUsedAt" }] }

DELETE /api/webauthn/credentials/:credId
Auth: Required
Response: { "ok": true }
```

### 4.4 Invites

#### Public (No Auth)

```
GET /api/invites/validate/:code
Response: { "valid": true, "name": "...", "expiresAt": "..." }
Rate limited: 5 attempts per IP

POST /api/invites/redeem
Body: { "code": "...", "pubkey": "hex64", "timestamp": ms, "token": "hex128" }
Response: { "ok": true, "pubkey": "hex64", "roles": [...] }
Rate limited: 5 attempts per IP
```

#### Authenticated (Requires `invites:read`)

```
GET /api/invites
Permission: invites:read
Response: { "invites": InviteCode[] }

POST /api/invites
Permission: invites:create
Body: { "name": string, "phone": string (E.164), "roleIds": string[] }
Response: { "code": "...", ... }

DELETE /api/invites/:code
Permission: invites:revoke
Response: { "ok": true }
```

### 4.5 Volunteers

All volunteer endpoints require `volunteers:read` baseline permission.

```
GET /api/volunteers
Permission: volunteers:read
Response: { "volunteers": Volunteer[] }

POST /api/volunteers
Permission: volunteers:create
Body: { "name": string, "phone": string, "roleIds": string[], "pubkey": string }
Response: Volunteer

PATCH /api/volunteers/:targetPubkey
Permission: volunteers:update
Body: { "name"?, "phone"?, "roles"?, "active"?, ... }
Response: Volunteer

DELETE /api/volunteers/:targetPubkey
Permission: volunteers:delete
Response: { "ok": true }
```

### 4.6 Shifts

```
GET /api/shifts/my-status
Auth: Required (any role)
Response: { "onShift": boolean, ... }

GET /api/shifts
Permission: shifts:read
Response: { "shifts": Shift[] }

POST /api/shifts
Permission: shifts:create
Body: { "name", "startTime", "endTime", "days": number[], "volunteerPubkeys": string[] }
Response: Shift

PATCH /api/shifts/:id
Permission: shifts:update
Body: partial Shift
Response: Shift

DELETE /api/shifts/:id
Permission: shifts:delete
Response: { "ok": true }

GET /api/shifts/fallback
Permission: shifts:manage-fallback
Response: { "fallbackPubkeys": string[] }

PUT /api/shifts/fallback
Permission: shifts:manage-fallback
Body: { "fallbackPubkeys": string[] }
Response: { "ok": true }
```

Hub-scoped: All shift endpoints are also available at `/api/hubs/:hubId/shifts/*`.

### 4.7 Notes

All note endpoints require `notes:read-own` baseline. Clients must encrypt notes before sending (Section 2.3).

```
GET /api/notes?callId=...&page=1&limit=50
Permission: notes:read-own (own only) or notes:read-all (all notes)
Response: { "notes": EncryptedNote[], "total": number }

POST /api/notes
Permission: notes:create
Body: {
  "callId": string,
  "encryptedContent": hex,
  "authorEnvelope"?: { "enc": hex64, "ct": hex },         // KeyEnvelope (HPKE; no pubkey field)
  "adminEnvelopes"?: { "pubkey": hex64, "enc": hex64, "ct": hex }[]  // RecipientEnvelope[]
}
Response: EncryptedNote

PATCH /api/notes/:id
Permission: notes:update-own
Body: {
  "encryptedContent": hex,
  "authorEnvelope"?: { "enc": hex64, "ct": hex },         // KeyEnvelope (HPKE; no pubkey field)
  "adminEnvelopes"?: { "pubkey": hex64, "enc": hex64, "ct": hex }[]  // RecipientEnvelope[]
}
Response: EncryptedNote
```

Hub-scoped: `/api/hubs/:hubId/notes/*`

### 4.8 Calls

```
GET /api/calls/active
Permission: calls:read-active (redacted caller info) or calls:read-active-full
Response: { "calls": CallRecord[] }

GET /api/calls/today-count
Permission: calls:read-active
Response: { "count": number }

GET /api/calls/presence
Permission: calls:read-presence
Response: { "volunteers": [...] }

GET /api/calls/history?page=1&limit=50&search=&dateFrom=&dateTo=
Permission: calls:read-history
Response: { "calls": EncryptedCallRecord[], "total": number }

POST /api/calls/:callId/answer
Permission: calls:answer
Response: { "call": CallRecord }
Error: 409 "Call already answered"

POST /api/calls/:callId/hangup
Permission: calls:hangup
Response: { "call": CallRecord }
Error: 403 "Not your call", 404 "Call not found"

POST /api/calls/:callId/spam
Permission: calls:report-spam
Response: { ...spamResult }
Error: 403 "Not your call", 404 "Call not found"

GET /api/calls/:callId/recording
Permission: calls:read-recording or answering volunteer
Response: audio/wav binary
Headers: Content-Type: audio/wav, Cache-Control: private, no-store

GET /api/calls/debug
Permission: calls:debug
Response: internal call state
```

Hub-scoped: `/api/hubs/:hubId/calls/*`

### 4.9 Conversations

```
GET /api/conversations?status=&channel=&page=1&limit=50
Permission: conversations:read-all (all) or conversations:read-assigned (own + waiting)
Response: {
  "conversations": Conversation[],
  "total"?: number,
  "assignedCount"?: number,
  "waitingCount"?: number,
  "claimableChannels"?: string[]
}

GET /api/conversations/stats
Auth: Required
Response: { "total": number, "active": number, "waiting": number, "closed": number }

GET /api/conversations/load
Permission: conversations:read-all
Response: { "loads": { [pubkey: string]: number } }

GET /api/conversations/:id
Auth: Required (access-checked per conversation)
Response: Conversation

GET /api/conversations/:id/messages?page=1&limit=50
Auth: Required (access-checked per conversation)
Response: { "messages": EncryptedMessage[], "total": number }

POST /api/conversations/:id/messages
Permission: conversations:send or conversations:send-any
Body: {
  "encryptedContent": hex,
  "readerEnvelopes": MessageKeyEnvelope[],
  "plaintextForSending"?: string  // For external channels; server sends via adapter then discards
}
Response: EncryptedMessage

PATCH /api/conversations/:id
Permission: conversations:update or assigned volunteer
Body: { "status"?: string, "assignedTo"?: string }
Response: Conversation

POST /api/conversations/:id/claim
Permission: conversations:claim + channel-specific (e.g., conversations:claim-sms)
Response: Conversation
Error: 403 "No permission to claim this channel type"
```

Hub-scoped: `/api/hubs/:hubId/conversations/*`

### 4.10 Reports

Reports are a specialized type of conversation with `metadata.type = "report"`.

```
GET /api/reports?status=&category=&page=1&limit=50
Permission: reports:read-all, reports:read-assigned, or reports:read-own
Response: { "conversations": Conversation[], "total": number }

POST /api/reports
Permission: reports:create
Body: {
  "title": string,
  "category"?: string,
  "encryptedContent": hex,
  "readerEnvelopes": MessageKeyEnvelope[]
}
Response: { "id": string, ... }

GET /api/reports/:id
Permission: reports:read-all, reports:read-assigned (if assigned), or own report
Response: Conversation (with metadata.type = "report")

GET /api/reports/:id/messages?page=1&limit=100
Auth: Required (access-checked)
Response: { "messages": EncryptedMessage[], "total": number }

POST /api/reports/:id/messages
Permission: reports:send-message, reports:send-message-own (own report), or assigned
Body: {
  "encryptedContent": hex,
  "readerEnvelopes": MessageKeyEnvelope[],
  "attachmentIds"?: string[]
}
Response: EncryptedMessage

POST /api/reports/:id/assign
Permission: reports:assign
Body: { "assignedTo": "pubkey_hex" }
Response: Conversation

PATCH /api/reports/:id
Permission: reports:update
Body: { "status"?: string }
Response: Conversation

GET /api/reports/categories
Auth: Required
Response: { "categories": string[] }

GET /api/reports/:id/files
Auth: Required (access-checked)
Response: { "files": FileRecord[] }
```

Hub-scoped: `/api/hubs/:hubId/reports/*`

### 4.11 Bans

```
POST /api/bans
Permission: bans:report
Body: { "phone": string (E.164), "reason": string }
Response: BanEntry

GET /api/bans
Permission: bans:read
Response: { "bans": BanEntry[] }

POST /api/bans/bulk
Permission: bans:bulk-create
Body: { "phones": string[] (E.164), "reason": string }
Response: { "ok": true, "count": number }

DELETE /api/bans/:phone
Permission: bans:delete
Response: { "ok": true }
// :phone is URL-encoded E.164 (e.g., %2B12125551234)
```

Hub-scoped: `/api/hubs/:hubId/bans/*`

### 4.12 Settings

#### Telephony Provider

```
GET /api/settings/telephony-provider
Permission: settings:manage-telephony
Response: TelephonyProviderConfig | null

PATCH /api/settings/telephony-provider
Permission: settings:manage-telephony
Body: TelephonyProviderConfig
Response: { "ok": true }

POST /api/settings/telephony-provider/test
Permission: settings:manage-telephony
Body: { "type": "twilio"|"signalwire"|..., ...provider_credentials }
Response: { "ok": true } or { "ok": false, "error": "..." }
```

#### Messaging

```
GET /api/settings/messaging
Permission: settings:manage-messaging
Response: MessagingConfig

PATCH /api/settings/messaging
Permission: settings:manage-messaging
Body: partial MessagingConfig
Response: { "ok": true }
```

#### Spam Mitigation

```
GET /api/settings/spam
Permission: settings:manage-spam
Response: SpamSettings

PATCH /api/settings/spam
Permission: settings:manage-spam
Body: partial SpamSettings
Response: { "ok": true }
```

#### Call Settings

```
GET /api/settings/call
Permission: settings:manage
Response: CallSettings

PATCH /api/settings/call
Permission: settings:manage
Body: partial CallSettings
Response: { "ok": true }
```

#### IVR Languages

```
GET /api/settings/ivr-languages
Permission: settings:manage-ivr
Response: { "enabledLanguages": string[] }

PATCH /api/settings/ivr-languages
Permission: settings:manage-ivr
Body: { "enabledLanguages": string[] }
Response: { "ok": true }
```

#### IVR Audio

```
GET /api/settings/ivr-audio
Permission: settings:manage-ivr
Response: { "audios": [...] }

PUT /api/settings/ivr-audio/:promptType/:language
Permission: settings:manage-ivr
Content-Type: application/octet-stream (raw audio bytes)
Response: { "ok": true }

DELETE /api/settings/ivr-audio/:promptType/:language
Permission: settings:manage-ivr
Response: { "ok": true }
```

#### Transcription

```
GET /api/settings/transcription
Auth: Required (any role)
Response: { "globalEnabled": boolean, "allowVolunteerOptOut": boolean, ... }

PATCH /api/settings/transcription
Permission: settings:manage-transcription
Body: partial transcription settings
Response: { "ok": true }
```

#### Custom Fields

```
GET /api/settings/custom-fields
Auth: Required (returns filtered by role)
Response: { "fields": CustomFieldDefinition[] }

PUT /api/settings/custom-fields
Permission: settings:manage-fields
Body: { "fields": CustomFieldDefinition[] }
Response: { "ok": true }
```

#### WebAuthn Settings

```
GET /api/settings/webauthn
Permission: settings:manage
Response: { "requireForAdmins": boolean, "requireForVolunteers": boolean }

PATCH /api/settings/webauthn
Permission: settings:manage
Body: { "requireForAdmins"?: boolean, "requireForVolunteers"?: boolean }
Response: { "ok": true }
```

#### Roles (PBAC)

```
GET /api/settings/roles
Auth: Required
Response: { "roles": Role[] }

POST /api/settings/roles
Permission: system:manage-roles
Body: { "name": string, "slug": string, "permissions": string[], "description": string }
Response: Role

PATCH /api/settings/roles/:id
Permission: system:manage-roles
Body: partial Role
Response: Role

DELETE /api/settings/roles/:id
Permission: system:manage-roles
Response: { "ok": true }
```

#### Permissions Catalog

```
GET /api/settings/permissions
Permission: system:manage-roles
Response: {
  "permissions": { [key: string]: string },
  "byDomain": { [domain: string]: [{ "key": string, "label": string }] }
}
```

#### Setup State

```
GET /api/settings/setup
Permission: settings:manage
Response: SetupState

PATCH /api/settings/setup
Permission: settings:manage
Body: partial SetupState
Response: SetupState
```

### 4.13 Files

#### Upload Flow

```
POST /api/uploads/init
Permission: files:upload
Body: {
  "totalSize": number,
  "totalChunks": number,
  "conversationId": string,
  "recipientEnvelopes": RecipientEnvelope[],
  "encryptedMetadata": [{ "pubkey": hex64, "encryptedContent": hex, "enc": hex64, "ct": hex }]
  // encryptedMetadata entries use encryptedMetadataEntrySchema — HPKE envelope fields
}
Response: { "uploadId": "uuid", "totalChunks": number }

PUT /api/uploads/:id/chunks/:chunkIndex
Permission: files:upload
Content-Type: application/octet-stream (raw encrypted chunk bytes)
Response: { "chunkIndex": number, "completedChunks": number, "totalChunks": number }

POST /api/uploads/:id/complete
Permission: files:upload
Response: { "fileId": "uuid", "status": "complete" }
Error: 400 "Not all chunks uploaded"

GET /api/uploads/:id/status
Permission: files:upload
Response: {
  "uploadId": string, "status": "uploading"|"complete"|"failed",
  "completedChunks": number, "totalChunks": number, "totalSize": number
}
```

#### File Download

```
GET /api/files/:id/content
Permission: files:download-own (if recipient) or files:download-all
Response: application/octet-stream (encrypted file bytes)
Headers: Cache-Control: private, no-cache

GET /api/files/:id/envelopes
Permission: files:download-own or files:download-all
Response: { "envelopes": RecipientEnvelope[] }
// Non-admin users receive only their own envelope

GET /api/files/:id/metadata
Permission: files:download-own or files:download-all
Response: { "metadata": [{ "pubkey", "encryptedContent", "enc", "ct" }] }
// encryptedMetadataEntrySchema — HPKE envelope fields

POST /api/files/:id/share
Permission: files:share
Body: {
  "envelope": RecipientEnvelope,
  "encryptedMetadata": { "pubkey", "encryptedContent", "enc", "ct" }
  // encryptedMetadataEntrySchema — HPKE envelope fields
}
Response: { "ok": true }
```

### 4.14 Blasts (Message Broadcasting)

#### Subscribers

```
GET /api/blasts/subscribers?page=&limit=&tag=&status=
Auth: Required
Response: { "subscribers": Subscriber[], "total": number }

DELETE /api/blasts/subscribers/:id
Auth: Required
Response: { "ok": true }

GET /api/blasts/subscribers/stats
Auth: Required
Response: { "total": number, "active": number, ... }

POST /api/blasts/subscribers/import
Auth: Required
Body: { "subscribers": [...] }
Response: { "imported": number, ... }
```

#### Blasts

```
GET /api/blasts
Auth: Required
Response: { "blasts": Blast[] }

POST /api/blasts
Auth: Required
Body: { "name", "content": BlastContent, "targetChannels", "targetTags", "targetLanguages" }
Response: Blast

GET /api/blasts/:id
Auth: Required
Response: Blast

PATCH /api/blasts/:id
Auth: Required
Body: partial Blast
Response: Blast

DELETE /api/blasts/:id
Auth: Required
Response: { "ok": true }

POST /api/blasts/:id/send
Auth: Required
Response: { "ok": true, "stats": BlastStats }

POST /api/blasts/:id/schedule
Auth: Required
Body: { "scheduledAt": ISO8601 }
Response: { "ok": true }

POST /api/blasts/:id/cancel
Auth: Required
Response: { "ok": true }
```

#### Blast Settings

```
GET /api/blasts/settings
Auth: Required
Response: BlastSettings

PATCH /api/blasts/settings
Auth: Required
Body: partial BlastSettings
Response: { "ok": true }
```

Hub-scoped: `/api/hubs/:hubId/blasts/*`

### 4.15 Hubs

```
GET /api/hubs
Auth: Required (filtered by membership; super admin sees all)
Response: { "hubs": Hub[] }

POST /api/hubs
Permission: system:manage-hubs
Body: { "name": string, "slug"?: string, "description"?: string, "phoneNumber"?: string }
Response: { "hub": Hub }

GET /api/hubs/:hubId
Auth: Required (membership checked)
Response: { "hub": Hub }

PATCH /api/hubs/:hubId
Permission: system:manage-hubs
Body: partial Hub
Response: Hub

POST /api/hubs/:hubId/members
Permission: volunteers:manage-roles
Body: { "pubkey": hex64, "roleIds": string[] }
Response: { "ok": true }

DELETE /api/hubs/:hubId/members/:pubkey
Permission: volunteers:manage-roles
Response: { "ok": true }

GET /api/hubs/:hubId/key
Auth: Required (hub member)
Response: { "envelope": RecipientKeyEnvelope }
// Returns only the requesting user's envelope

PUT /api/hubs/:hubId/key
Permission: system:manage-hubs
Body: { "envelopes": RecipientKeyEnvelope[] }
Response: { "ok": true }
```

### 4.16 Setup Wizard

```
GET /api/setup/state
Auth: Required
Response: SetupState

PATCH /api/setup/state
Permission: settings:manage
Body: partial SetupState
Response: SetupState

POST /api/setup/complete
Permission: settings:manage
Body: { "demoMode"?: boolean }
Response: SetupState
// Also creates a default hub if none exists

POST /api/setup/test/signal
Permission: settings:manage-messaging
Body: { "bridgeUrl": string, "bridgeApiKey": string }
Response: { "ok": true } or { "ok": false, "error": "..." }

POST /api/setup/test/whatsapp
Permission: settings:manage-messaging
Body: { "phoneNumberId": string, "accessToken": string }
Response: { "ok": true } or { "ok": false, "error": "..." }
```

### 4.17 Audit Log

```
GET /api/audit?page=1&limit=50&actorPubkey=&eventType=&dateFrom=&dateTo=&search=
Permission: audit:read
Response: {
  "entries": AuditLogEntry[],
  "total": number
}
```

Hub-scoped: `/api/hubs/:hubId/audit/*`

### 4.18 WebRTC

```
GET /api/telephony/webrtc-token
Auth: Required
Response: { "token": string, "provider": string, "identity": string }
Error: 400 "Call preference is set to phone only"

GET /api/telephony/webrtc-status
Auth: Required
Response: { "available": boolean, "provider": "twilio"|"signalwire"|null }
```

### 4.19 Device Provisioning

```
POST /api/provision/rooms
Auth: None (new device has no auth)
Body: { "ephemeralPubkey": hex66 }
Response: { "roomId": "uuid", "token": "random_string" }

GET /api/provision/rooms/:id?token=<token>
Auth: None
Response: {
  "status": "waiting" | "ready" | "expired",
  "encryptedNsec"?: hex,
  "primaryPubkey"?: hex64,
  "ephemeralPubkey"?: hex66
}

POST /api/provision/rooms/:id/payload
Auth: Required (primary device must be authenticated)
Body: {
  "token": string,
  "encryptedNsec": hex,
  "primaryPubkey": hex64
}
Response: { "ok": true }
```

### 4.20 Telephony Webhooks

These endpoints are called by telephony providers (Twilio, SignalWire, etc.), not by clients. Each request is validated by the provider's webhook signature, not Llamenos auth. Hub routing is via `?hub=<hubId>` query parameter.

```
POST /api/telephony/incoming
POST /api/telephony/language-selected
POST /api/telephony/captcha
POST /api/telephony/volunteer-answer
POST /api/telephony/call-status
POST /api/telephony/wait-music  (also GET)
POST /api/telephony/queue-exit
POST /api/telephony/voicemail-complete
POST /api/telephony/call-recording
POST /api/telephony/voicemail-recording
```

### 4.21 Messaging Webhooks

These endpoints are called by messaging providers. Each adapter validates its own webhook signature.

```
GET  /api/messaging/whatsapp/webhook    (Meta webhook verification)
GET  /api/messaging/rcs/webhook         (Google RBM webhook verification)
POST /api/messaging/:channel/webhook?hub=<hubId>
// channel: sms | whatsapp | signal | rcs
```

### 4.22 Development / Test (Development Environment Only)

```
POST /api/test-reset            (full reset, requires X-Test-Secret header)
POST /api/test-reset-no-admin   (reset without admin)
POST /api/test-reset-records    (light reset, preserves identity/settings)
```

### 4.23 Hub-Scoped Routes

All of the following routes are also available with a `/api/hubs/:hubId/` prefix, which scopes them to a specific hub:

```
/api/hubs/:hubId/shifts/*
/api/hubs/:hubId/bans/*
/api/hubs/:hubId/notes/*
/api/hubs/:hubId/calls/*
/api/hubs/:hubId/audit/*
/api/hubs/:hubId/conversations/*
/api/hubs/:hubId/reports/*
/api/hubs/:hubId/blasts/*
```

When using hub-scoped routes, the `hubContext` middleware resolves hub-specific permissions for the user and scopes all queries to the specified hub.

> **Note:** This section documents the core API surface. Additional endpoints for blasts, recovery groups, events, and entity management are implemented but not fully documented here. See `apps/worker/routes/` for the full route list.

---

## 5. Push Notification Protocol

For mobile clients (iOS/Android), push notifications deliver time-sensitive events (incoming calls, new messages) when the app is backgrounded.

### 5.1 Device Registration

```
POST /api/devices/register
Auth: Required
Body: {
  "platform": "ios" | "android",
  "pushToken": string,              // APNs device token or FCM registration token
  "wakeKeyPublic": hex,             // 33-byte compressed secp256k1 pubkey (66 hex chars)
  "ed25519Pubkey"?: hex,            // Phase 6: 32-byte Ed25519 signing pubkey (64 hex chars)
  "x25519Pubkey"?: hex              // Phase 6: 32-byte X25519 encryption pubkey (64 hex chars)
}
Response: 204 No Content (empty body)
```

### 5.2 Two-Tier Encryption

Push notifications use a two-tier encryption scheme to balance security with usability:

**Tier 1 -- Wake Key (No PIN Required)** (`LABEL_PUSH_WAKE`)
- A symmetric "wake key" is generated per-device at registration time.
- It is HPKE-wrapped for the device's X25519 pubkey and stored server-side.
- Push payloads are encrypted with this wake key.
- The app can decrypt the push payload without requiring PIN entry.
- Contains only: notification type, conversation/call ID, and display-safe metadata.

**Tier 2 -- Full Decryption (PIN Required)** (`LABEL_PUSH_FULL`)
- Message content, caller details, and other sensitive data remain encrypted with the device's identity key.
- The app must prompt for PIN unlock to decrypt the full content.
- This mirrors the behavior of the desktop app's locked/unlocked states.

### 5.3 Push Payload Format

```json
{
  "encrypted": "<hex_nonce24_ciphertext>",
  "deviceId": "<uuid>"
}
```

Decrypted content (Tier 1):

```json
{
  "type": "call:ring" | "message:new" | "conversation:assigned" | "report:new",
  "id": "resource_id",
  "preview": "Safe display text (no PII)",
  "timestamp": 1709318400
}
```

### 5.4 VoIP Push (iOS)

For incoming call notifications on iOS, a VoIP push is sent via APNs with a 30-second deadline. The app MUST:

1. Report a new incoming call to CallKit within 30 seconds.
2. Decrypt the wake-key-encrypted payload to get the call ID.
3. Display the CallKit incoming call UI.
4. If the user answers, prompt for PIN to unlock the identity key.
5. Use the identity key to authenticate and answer the call via REST API.

### 5.5 Hub Routing for Push Notifications

The `hubId` field in a decrypted wake payload identifies which hub the notification belongs to. Clients must dispatch the notification to the correct hub handler regardless of which hub is currently active in the UI.

**Routing rules:**
- `incoming_call`: iOS: call `linphoneService.handleVoipPush(callId:hubId:)`. Android: call `linphoneService.storePendingCallHub(callId, hubId)`. Do NOT switch the active hub context.
- All other types (`shift_reminder`, `announcement`, `call_ended`): Store `hubId` in notification extras for navigation on tap. Do NOT switch the active hub context.

**Active hub switching is permitted only when:**
1. The user explicitly taps a delivered notification (notification tap callback).
2. The app is unlocked and the user initiates answering a call (the `handleIncomingCall` app-unlocked path).

This constraint preserves the multi-hub axiom: a user browsing Hub A must not have their context silently switched to Hub B by a background notification.

---

## 6. Device Provisioning Protocol

New devices can be linked to an existing account using a Signal-style provisioning protocol with ephemeral X25519 ECDH key exchange and Short Authentication String (SAS) verification.

> **Migration Note (v2.0):** The server currently accepts the `encryptedNsec` field for backward compatibility with pre-Phase-6 clients. The protocol described below reflects the Phase 6 target using per-device keypairs. New implementations MUST implement the Phase 6 protocol. The server field is named `encryptedNsec` but carries the Phase 6 device key bundle payload described here.

### 6.1 Protocol Flow

```
New Device                          Server                     Primary Device
-----------                         ------                     ---------------
1. Generate ephemeral keypair (X25519):
   eSK, ePK = X25519.generateKey()
   // eSK: 32 bytes (private), ePK: 32 bytes (public)

2. POST /api/provision/rooms
   { ephemeralPubkey: hex(ePK) }
                                    Creates room with
                                    roomId + token
   <-- { roomId, token }

3. Display QR code:
   JSON.stringify({ r: roomId, t: token })
   (or short code: roomId[0..8])

4. Poll: GET /api/provision/rooms/:id
   ?token=<token>
                                                               Scans QR / enters code

                                                        5. GET /api/provision/rooms/:id
                                                           ?token=<token>
                                                           <-- { ephemeralPubkey: hex(ePK) }

                                                        6. Compute shared secret (X25519):
                                                           shared = X25519(primarySK, ePK)
                                                           // shared: 32 bytes (raw X25519 output)
                                                           // X25519 is symmetric: X25519(eSK, primaryPK)
                                                           //   = X25519(primarySK, ePK)

                                                        7. Compute SAS:
                                                           sasBytes = HKDF(SHA-256, shared,
                                                             salt=UTF-8("llamenos:sas"),
                                                             info=UTF-8("llamenos:provisioning-sas"),
                                                             length=4)
                                                           num = (sasBytes[0]<<24 | sasBytes[1]<<16 |
                                                                  sasBytes[2]<<8  | sasBytes[3]) >>> 0
                                                           code = (num % 1000000).padStart(6, '0')
                                                           Display: "XXX XXX"

8. Also compute SAS (new device side):
   shared = X25519(eSK, primaryPK)
   // Same X25519 shared secret → same HKDF → same SAS
   Same HKDF derivation → same code
   Display: "XXX XXX"

9. User visually compares                                    User visually compares
   both codes match? -->                                     <-- both codes match?

                                                        10. Derive provisioning key via HKDF:
                                                            prov_key = HKDF(SHA-256, shared,
                                                              salt=UTF-8("llamenos:provisioning:v1"),
                                                              info=UTF-8("llamenos:provisioning:v1"),
                                                              length=32)
                                                            // Uses LABEL_PROVISIONING_SALT

                                                        11. Build device key bundle:
                                                            bundle = JSON.stringify({
                                                              signingPubkey: hex(primary_ed25519_pubkey),
                                                              encPubkey: hex(primary_x25519_pubkey),
                                                              pukEncrypted: <HPKE-wrapped PUK seed for
                                                                             new device's X25519 key>
                                                            })

                                                        12. Encrypt device key bundle:
                                                            iv = random(12)
                                                            ct_with_tag = AES-256-GCM.encrypt(
                                                              key = prov_key,
                                                              iv  = iv,
                                                              message = UTF-8(bundle)
                                                            )
                                                            encryptedPayload = hex(iv || ct_with_tag)

                                                        13. POST /api/provision/rooms/:id/payload
                                                            Auth: Required (primary device)
                                                            {
                                                              token,
                                                              encryptedNsec: encryptedPayload,
                                                              // Note: field named "encryptedNsec" for
                                                              // backward compat; payload is device bundle
                                                              primaryPubkey: hex(primary_ed25519_pubkey)
                                                            }

14. Poll returns status: "ready"
    { encryptedNsec: encryptedPayload, primaryPubkey }

15. Derive provisioning key (same as step 10):
    shared = X25519(eSK, primaryPK)
    prov_key = HKDF(SHA-256, shared,
      salt=UTF-8("llamenos:provisioning:v1"),
      info=UTF-8("llamenos:provisioning:v1"),
      length=32)

16. Decrypt device key bundle:
    data = hex_to_bytes(encryptedPayload)
    iv   = data[0..12]
    ct   = data[12..]
    bundle_json = UTF-8_decode(AES-256-GCM.decrypt(prov_key, iv, ct))
    bundle = JSON.parse(bundle_json)

17. New device now has:
    - Primary device's signing + encryption pubkeys (for sigchain verification)
    - PUK (Per-User Key) encrypted for new device's X25519 key
    New device decrypts PUK using its own X25519 secret key via HPKE.Open
    with label LABEL_PUK_WRAP_TO_DEVICE.

18. New device generates its own Ed25519 + X25519 keypairs (Section 2.11)
    and registers via sigchain with primary device's authorization.
```

#### Server Implementation

Cross-reference: `apps/worker/routes/provisioning.ts`, `apps/worker/services/identity.ts`.

The server stores only the ephemeral pubkey and encrypted payload — it cannot decrypt the payload. The `encryptedNsec` field in the server API carries the Phase 6 device key bundle described above.

### 6.2 QR Code Format

```json
{"r":"<roomId>","t":"<token>"}
```

Compact JSON. The `r` and `t` keys are shortened for QR code density.

### 6.3 Short Code (Manual Entry)

For users who cannot scan a QR code:

```
short_code = roomId[0..8].toUpperCase()
// e.g., "A1B2C3D4"
```

### 6.4 SAS Display Format

```
"XXX XXX"
// e.g., "847 293"
// Two groups of three digits separated by a space
```

The SAS code is derived deterministically from the ECDH shared secret. Both devices compute it independently. If the codes match, no man-in-the-middle attack is present.

### 6.5 Room Lifecycle

- Rooms expire after a configurable timeout (typically 5 minutes).
- Status transitions: `waiting` -> `ready` -> (consumed)
- Polling returns `expired` (status 404 or 410) when the room has timed out.

---

## 7. Permission Model

Llamenos uses Permission-Based Access Control (PBAC). Users are assigned roles, and each role is a named bundle of permissions. Effective permissions are the union of all assigned roles.

### 7.1 Permission Format

Permissions are colon-separated strings: `domain:action`.

```
calls:answer
notes:read-own
settings:manage-telephony
system:manage-roles
```

### 7.2 Wildcard Support

| Pattern | Meaning |
|---------|---------|
| `*` | Global wildcard -- grants ALL permissions |
| `domain:*` | Domain wildcard -- grants all actions in domain (e.g., `calls:*` grants `calls:answer`, `calls:read-active`, etc.) |

### 7.3 Permission Resolution

```
permissionGranted(granted_permissions[], required_permission):
  1. If granted includes "*" -> true
  2. If granted includes exact match -> true
  3. domain = required_permission.split(":")[0]
     If granted includes "domain:*" -> true
  4. Return false
```

For multiple roles:

```
resolvePermissions(role_ids[], all_role_definitions[]):
  permissions = Set()
  for each role_id in role_ids:
    role = find role by id
    for each permission in role.permissions:
      permissions.add(permission)
  return Array.from(permissions)
```

### 7.4 Permission Catalog

#### Calls

| Permission | Description |
|------------|-------------|
| `calls:answer` | Answer incoming calls |
| `calls:read-active` | See active calls (caller info redacted) |
| `calls:read-active-full` | See active calls with full caller info |
| `calls:read-history` | View call history |
| `calls:read-presence` | View volunteer presence |
| `calls:read-recording` | Listen to call recordings |
| `calls:debug` | Debug call state |

#### Notes

| Permission | Description |
|------------|-------------|
| `notes:create` | Create call notes |
| `notes:read-own` | Read own notes |
| `notes:read-all` | Read all notes |
| `notes:read-assigned` | Read notes from assigned volunteers |
| `notes:update-own` | Update own notes |

#### Reports

| Permission | Description |
|------------|-------------|
| `reports:create` | Submit reports |
| `reports:read-own` | Read own reports |
| `reports:read-all` | Read all reports |
| `reports:read-assigned` | Read assigned reports |
| `reports:assign` | Assign reports to reviewers/volunteers |
| `reports:update` | Update report status |
| `reports:send-message-own` | Send messages in own reports |
| `reports:send-message` | Send messages in any report |

#### Conversations

| Permission | Description |
|------------|-------------|
| `conversations:read-assigned` | Read assigned + waiting conversations |
| `conversations:read-all` | Read all conversations |
| `conversations:claim` | Claim a waiting conversation |
| `conversations:claim-sms` | Claim SMS conversations |
| `conversations:claim-whatsapp` | Claim WhatsApp conversations |
| `conversations:claim-signal` | Claim Signal conversations |
| `conversations:claim-rcs` | Claim RCS conversations |
| `conversations:claim-web` | Claim web conversations |
| `conversations:claim-any` | Claim any channel (bypass restrictions) |
| `conversations:send` | Send messages in assigned conversations |
| `conversations:send-any` | Send messages in any conversation |
| `conversations:update` | Reassign/close/reopen conversations |

#### Volunteers

| Permission | Description |
|------------|-------------|
| `volunteers:read` | List/view volunteer profiles |
| `volunteers:create` | Create new volunteers |
| `volunteers:update` | Update volunteer profiles |
| `volunteers:delete` | Deactivate/delete volunteers |
| `volunteers:manage-roles` | Assign/change volunteer roles |

#### Shifts

| Permission | Description |
|------------|-------------|
| `shifts:read-own` | Check own shift status |
| `shifts:read` | View all shifts |
| `shifts:create` | Create shifts |
| `shifts:update` | Modify shifts |
| `shifts:delete` | Delete shifts |
| `shifts:manage-fallback` | Manage fallback ring group |

#### Bans

| Permission | Description |
|------------|-------------|
| `bans:report` | Report/flag a number |
| `bans:read` | View ban list |
| `bans:create` | Ban numbers |
| `bans:bulk-create` | Bulk ban import |
| `bans:delete` | Remove bans |

#### Invites

| Permission | Description |
|------------|-------------|
| `invites:read` | View pending invites |
| `invites:create` | Create invite codes |
| `invites:revoke` | Revoke invite codes |

#### Settings

| Permission | Description |
|------------|-------------|
| `settings:read` | View settings |
| `settings:manage` | Modify all settings |
| `settings:manage-telephony` | Modify telephony provider |
| `settings:manage-messaging` | Modify messaging channels |
| `settings:manage-spam` | Modify spam settings |
| `settings:manage-ivr` | Modify IVR/language settings |
| `settings:manage-fields` | Modify custom fields |
| `settings:manage-transcription` | Modify transcription settings |

#### Audit

| Permission | Description |
|------------|-------------|
| `audit:read` | View audit log |

#### Blasts

| Permission | Description |
|------------|-------------|
| `blasts:read` | View blast history |
| `blasts:send` | Send blasts |
| `blasts:manage` | Manage subscriber lists and templates |
| `blasts:schedule` | Schedule future blasts |

#### Files

| Permission | Description |
|------------|-------------|
| `files:upload` | Upload files |
| `files:download-own` | Download own/authorized files |
| `files:download-all` | Download any file |
| `files:share` | Re-encrypt/share files with others |

#### System (Super-Admin Only)

| Permission | Description |
|------------|-------------|
| `system:manage-roles` | Create/edit/delete custom roles |
| `system:manage-hubs` | Create/manage hubs |
| `system:manage-instance` | Instance-level settings |

### 7.5 Default Roles

#### Super Admin (`role-super-admin`)

```
Permissions: ["*"]
System role: true (cannot be modified or deleted)
```

Full system access. Creates hubs, manages all settings and users.

#### Hub Admin (`role-hub-admin`)

```
Permissions: [
  "volunteers:*", "shifts:*", "settings:*", "audit:read",
  "bans:*", "invites:*", "notes:read-all", "notes:create", "notes:update-own",
  "reports:*", "conversations:*", "calls:*", "blasts:*", "files:*"
]
```

Full control within assigned hub(s). Manages volunteers, shifts, settings.

#### Reviewer (`role-reviewer`)

```
Permissions: [
  "notes:read-assigned", "reports:read-assigned", "reports:assign",
  "reports:update", "reports:send-message",
  "conversations:read-assigned", "conversations:send",
  "shifts:read-own", "files:download-own", "files:upload"
]
```

Reviews notes and reports from assigned volunteers or shifts.

#### Volunteer (`role-volunteer`)

```
Permissions: [
  "calls:answer", "calls:read-active",
  "notes:create", "notes:read-own", "notes:update-own",
  "conversations:claim", "conversations:send", "conversations:read-assigned",
  "conversations:claim-sms", "conversations:claim-whatsapp",
  "conversations:claim-signal", "conversations:claim-rcs", "conversations:claim-web",
  "shifts:read-own", "bans:report",
  "reports:read-assigned", "reports:send-message",
  "files:upload", "files:download-own"
]
```

Answers calls, writes notes, handles assigned conversations.

#### Reporter (`role-reporter`)

```
Permissions: [
  "reports:create", "reports:read-own", "reports:send-message-own",
  "files:upload", "files:download-own"
]
```

Submits reports and tracks their own submissions.

### 7.6 Hub-Scoped Permissions

Users can have different roles in different hubs. Permission resolution checks both global roles and hub-specific roles:

```
hasHubPermission(global_roles, hub_roles, all_role_defs, hub_id, permission):
  1. global_perms = resolvePermissions(global_roles, all_role_defs)
     If permissionGranted(global_perms, permission) -> true  (super-admin bypasses)
  2. assignment = hub_roles.find(hr => hr.hubId === hub_id)
     If no assignment -> false
  3. hub_perms = resolvePermissions(assignment.roleIds, all_role_defs)
     Return permissionGranted(hub_perms, permission)
```

### 7.7 Channel Claim Permissions

Claiming a conversation requires both the general `conversations:claim` permission and a channel-specific permission:

| Channel | Required Permission |
|---------|-------------------|
| SMS | `conversations:claim-sms` |
| WhatsApp | `conversations:claim-whatsapp` |
| Signal | `conversations:claim-signal` |
| RCS | `conversations:claim-rcs` |
| Web | `conversations:claim-web` |
| Any (bypass) | `conversations:claim-any` |

---

## Appendix A: Library Dependencies for Implementors

Clients implementing this protocol need the following cryptographic capabilities:

| Operation | Library (JS reference) | Algorithm |
|-----------|----------------------|-----------|
| Key generation | `@noble/curves` | secp256k1, Ed25519, X25519 |
| Schnorr signatures | `@noble/curves/secp256k1` | BIP-340 |
| ECDH | `@noble/curves/secp256k1` | secp256k1 |
| SHA-256 | `@noble/hashes/sha2` | SHA-256 |
| HMAC | `@noble/hashes/hmac` | HMAC-SHA256 |
| HKDF | `@noble/hashes/hkdf` | HKDF-SHA256 |
| AEAD | `@noble/ciphers/chacha` | XChaCha20-Poly1305 |
| PBKDF2 | Web Crypto API | PBKDF2-SHA256 |
| Encoding | `@noble/hashes` | hex, utf8 |

**Gotchas for non-JS implementations:**
- `@noble/ciphers` and `@noble/hashes` require `.js` extension in import paths (JS-specific).
- `schnorr` is a separate named export from secp256k1 (not the default).
- WebSocket pubkeys are x-only (32 bytes) -- prepend `0x02` for ECDH compressed format.
- `secp256k1.getSharedSecret()` returns 33 bytes; extract x-coordinate with `[1..33]`.
- XChaCha20-Poly1305 uses a 24-byte nonce, not 12-byte (unlike standard ChaCha20-Poly1305).
- The Poly1305 tag is 16 bytes, appended to the ciphertext by the AEAD implementation.

## Appendix B: Type Definitions Reference

### NotePayload

```typescript
interface NotePayload {
  text: string
  fields?: Record<string, string | number | boolean>
}
```

### CustomFieldDefinition

```typescript
interface CustomFieldDefinition {
  id: string                // UUID
  name: string              // machine-readable key (e.g., "severity")
  label: string             // display label (e.g., "Severity Rating")
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
  required: boolean
  options?: string[]         // for 'select' type
  validation?: {
    minLength?: number       // text/textarea
    maxLength?: number       // text/textarea
    min?: number             // number
    max?: number             // number
  }
  visibleToVolunteers: boolean
  editableByVolunteers: boolean
  context: 'call-notes' | 'reports' | 'both'
  allowFileUpload?: boolean
  acceptedFileTypes?: string[]
  order: number
  createdAt: string
}
```

### TelephonyProviderConfig

```typescript
interface TelephonyProviderConfig {
  type: 'twilio' | 'signalwire' | 'vonage' | 'plivo' | 'asterisk' | 'telnyx' | 'bandwidth' | 'freeswitch'
  phoneNumber: string        // E.164
  accountSid?: string
  authToken?: string
  signalwireSpace?: string
  apiKey?: string
  apiSecret?: string
  applicationId?: string
  privateKey?: string        // Vonage PEM
  authId?: string
  ariUrl?: string
  ariUsername?: string
  ariPassword?: string
  bridgeCallbackUrl?: string
  webrtcEnabled?: boolean
  apiKeySid?: string
  apiKeySecret?: string
  twimlAppSid?: string
}
```

### Hub

```typescript
interface Hub {
  id: string
  name: string
  slug: string
  description?: string
  status: 'active' | 'suspended' | 'archived'
  phoneNumber?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

### AuditLogEntry

```typescript
interface AuditLogEntry {
  id: string
  event: string
  actorPubkey: string
  details: Record<string, unknown>
  createdAt: string
  previousEntryHash?: string   // SHA-256 chain link
  entryHash?: string           // SHA-256 of this entry
}
```

---

## Appendix C: Legacy Encryption (pre-v2 ECIES)

> **Historical Reference Only.** This appendix documents the encryption primitives used before v2.0 (2026-Q1). They are retained so implementors can read data encrypted with the old scheme during migration. **DO NOT implement new encryption using these algorithms.**

### C.1 ECIES Key Wrapping (Replaced by Section 2.2 HPKE)

ECIES was the key-wrapping primitive in v1. It used secp256k1 ECDH + XChaCha20-Poly1305 instead of X25519 HPKE + AES-256-GCM.

See Section 2.2.1 for the full ECIES algorithm specification (retained in the main body for backward-compat read path).

### C.2 nsec-per-User Key Storage (Replaced by Section 2.11)

v1 stored a single secp256k1 secret key (nsec, bech32-encoded) per user, PIN-encrypted with PBKDF2-SHA256 + XChaCha20-Poly1305. See Section 2.6 (marked Legacy) for the full algorithm.

### C.3 Provisioning (secp256k1 ECDH + nsec Transfer)

v1 provisioning used secp256k1 ECDH for the ephemeral key exchange and transferred the nsec directly (XChaCha20-Poly1305 encrypted). The SAS derivation used the compressed X coordinate (`sharedX = shared[1..33]`) instead of the raw 32-byte X25519 output. See the migration note in Section 6 for context.

### C.4 XChaCha20-Poly1305 Wire Format (v1 encryptedContent)

v1 content was encrypted with XChaCha20-Poly1305:

```
Offset  Length    Content
------  ------    -------
0       24        XChaCha20-Poly1305 nonce (random, 24 bytes)
24      variable  Ciphertext + 16-byte Poly1305 authentication tag
```

The entire byte sequence was hex-encoded. v2 uses AES-256-GCM with a 12-byte IV (Section 2.3).
