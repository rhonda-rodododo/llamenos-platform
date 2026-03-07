---
name: e2ee-envelope-operations
description: >
  Guide implementing end-to-end encrypted (E2EE) data operations in the Llamenos monorepo.
  Use this skill when working with encrypted notes, messages, files, call records, transcriptions,
  or any feature that handles sensitive data. Use when the user mentions "encrypt", "decrypt",
  "E2EE", "envelope", "ECIES", "forward secrecy", "per-note key", "key wrap", "multi-recipient",
  "admin envelope", "hub key", "zero-knowledge", "encrypted storage", "envelope encryption",
  "XChaCha20", "Poly1305", or "key derivation". Also use when implementing any feature that
  stores user-generated content (notes, messages, reports) — ALL user content is E2EE in this
  project. If a feature creates, reads, or modifies data that could contain PII or sensitive
  information, this skill applies. Covers the multi-recipient envelope pattern, per-record
  forward secrecy, crypto label usage, and cross-platform implementation.
---

# E2EE Envelope Operations for Llamenos

All user-generated content in Llamenos is end-to-end encrypted. The server stores ciphertext
and can never read the plaintext. This is a non-negotiable architectural constraint, not a
nice-to-have. Every new data type that stores user content MUST use envelope encryption.

## Core Concept: Multi-Recipient Envelope Encryption

```
Plaintext (e.g., note content)
  ↓
Generate random 32-byte content key (unique per record)
  ↓
Encrypt plaintext with content key (XChaCha20-Poly1305)
  = encryptedContent
  ↓
For each reader (author + each admin):
  ECIES wrap content key for reader's pubkey
  = KeyEnvelope { ephemeralPubkey, encryptedKey }
  ↓
Store: { encryptedContent, authorEnvelope, adminEnvelopes[] }
```

**Why per-record keys?** Forward secrecy. Compromising one record's key doesn't
decrypt other records. Revoking a reader (e.g., deactivated admin) doesn't require
re-encrypting all existing records.

## Data Types and Their Encryption

| Data Type | Content Key Derivation | Readers | Label |
|-----------|----------------------|---------|-------|
| **Notes** | Random 32 bytes per note | Author + all admins | `LABEL_NOTE_SEAL` |
| **Messages** | Random 32 bytes per message | Assigned volunteer + all admins | `LABEL_MESSAGE_SEAL` |
| **Call Records** | Random 32 bytes per record | All admins only | `LABEL_CALL_RECORD_SEAL` |
| **File Metadata** | ECIES ephemeral key | Uploader + admins | `LABEL_FILE_METADATA` |
| **File Content** | Random 32 bytes per file | Per-file access list | `LABEL_FILE_KEY_WRAP` |
| **Transcriptions** | Server ephemeral ECDH | Volunteer + admin | `LABEL_TRANSCRIPTION` |
| **Drafts** | Derived from user's key | Self only (local) | `LABEL_DRAFT_ENCRYPT` |
| **Hub Key** | Random 32 bytes | All hub members | `LABEL_HUB_KEY_WRAP` |

## Crypto Labels (Domain Separation)

**NEVER use raw string literals for crypto contexts.** Always import from generated constants:

```typescript
// Desktop (TypeScript)
import { LABEL_NOTE_SEAL, LABEL_MESSAGE_SEAL } from '@shared/crypto-labels'

// iOS (Swift) — generated from crypto-labels.json
CryptoLabels.labelNoteSeal

// Android (Kotlin) — generated from crypto-labels.json
CryptoLabels.LABEL_NOTE_SEAL
```

All 28+ labels are defined in `packages/protocol/crypto-labels.json` (source of truth).
Run `bun run codegen` after adding new labels.

## Encryption Patterns by Platform

### Desktop (via Tauri IPC → Rust)

```typescript
import * as platform from '@/lib/platform'
import { LABEL_NOTE_SEAL } from '@shared/crypto-labels'

// Encrypt a note
const result = await platform.encryptNote(
  JSON.stringify(notePayload),  // plaintext JSON
  authorPubkey,                 // author's x-only pubkey
  adminPubkeys,                 // array of admin pubkeys
)
// result: { encryptedContent, authorEnvelope, adminEnvelopes[] }

// Decrypt a note
const plaintext = await platform.decryptNote(
  encryptedContent,  // hex string
  myEnvelope,        // KeyEnvelope for the current user
)
// plaintext: JSON string → parse it
```

### iOS (via CryptoService → UniFFI → Rust)

```swift
// Encrypt
let result = try CryptoService.shared.encryptNote(
    payload: noteJSON,
    authorPubkey: authorPubkey,
    adminPubkeys: adminPubkeys
)

// Decrypt
let plaintext = try CryptoService.shared.decryptNote(
    encryptedContent: result.encryptedContent,
    envelope: myEnvelope
)
```

### Android (via CryptoService → JNI → Rust)

```kotlin
// Encrypt
val result = cryptoService.encryptNote(
    payload = noteJSON,
    authorPubkey = authorPubkey,
    adminPubkeys = adminPubkeys,
)

// Decrypt
val plaintext = cryptoService.decryptNote(
    encryptedContent = result.encryptedContent,
    envelope = myEnvelope,
)
```

### Server (Worker — encrypt on behalf of caller)

The server encrypts inbound webhook data (e.g., incoming SMS) and discards plaintext
immediately. It uses `@noble/curves` + `@noble/ciphers` directly:

```typescript
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { LABEL_MESSAGE_SEAL } from '@shared/crypto-labels'

// Generate per-message content key
const contentKey = new Uint8Array(32)
crypto.getRandomValues(contentKey)

// Encrypt content
const nonce = new Uint8Array(24)
crypto.getRandomValues(nonce)
const cipher = xchacha20poly1305(contentKey, nonce)
const ct = cipher.encrypt(utf8ToBytes(plaintext))
const encryptedContent = bytesToHex(new Uint8Array([...nonce, ...ct]))

// Wrap content key for each reader via ECIES
for (const readerPubkey of readers) {
  const envelope = eciesWrapKey(contentKey, readerPubkey, LABEL_MESSAGE_SEAL)
  envelopes.push({ pubkey: readerPubkey, ...envelope })
}

// Discard plaintext and contentKey immediately
```

## Type Definitions

### KeyEnvelope (single recipient)

```typescript
interface KeyEnvelope {
  ephemeralPubkey: string  // hex, 32 bytes (x-only)
  encryptedKey: string     // hex, ECIES ciphertext
}
```

### RecipientEnvelope (tagged with recipient)

```typescript
interface RecipientEnvelope {
  pubkey: string           // recipient's pubkey (hex, 32 bytes)
  ephemeralPubkey: string  // ECIES ephemeral pubkey
  encryptedKey: string     // ECIES-wrapped content key
}
```

### RecipientKeyEnvelope (with key ID)

```typescript
interface RecipientKeyEnvelope extends RecipientEnvelope {
  keyId: string  // for key rotation tracking
}
```

## ECIES Implementation Details

The ECIES (Elliptic Curve Integrated Encryption Scheme) used:

1. **Key agreement**: secp256k1 ECDH (ephemeral → recipient)
2. **KDF**: HKDF-SHA256 with domain separation label
3. **Encryption**: XChaCha20-Poly1305 (24-byte nonce, 16-byte tag)

```
ephemeral_keypair = secp256k1.random()
shared_secret = ECDH(ephemeral_secret, recipient_pubkey)
shared_x = shared_secret[1:33]  // x-coordinate only (33-byte compressed → 32-byte x)
derived_key = HKDF(SHA-256, shared_x, salt=empty, info=label, 32)
nonce = random(24)
encrypted = XChaCha20-Poly1305(derived_key, nonce).encrypt(content_key)
envelope = { ephemeralPubkey: ephemeral_pub, encryptedKey: hex(nonce || encrypted) }
```

**Gotcha**: Nostr pubkeys are x-only (32 bytes). For ECDH, prepend `"02"` to get the
compressed format that `secp256k1.getSharedSecret()` expects.

**Gotcha**: `secp256k1.getSharedSecret()` returns 33 bytes (compressed point). Extract
the x-coordinate with `.slice(1, 33)`.

## Adding a New Encrypted Data Type

### Step 1: Add Crypto Label

Edit `packages/protocol/crypto-labels.json`:

```json
{
  "LABEL_MY_DATA_SEAL": "llamenos:my-data-seal:v1"
}
```

Run `bun run codegen` to generate constants for all platforms.

### Step 2: Define Storage Format

Decide the encryption structure:

```typescript
interface EncryptedMyData {
  encryptedContent: string        // hex: nonce || XChaCha20-Poly1305 ciphertext
  authorEnvelope: KeyEnvelope     // content key wrapped for author
  adminEnvelopes: RecipientEnvelope[]  // content key wrapped for each admin
  version: 2                      // always 2 (v1 was pre-forward-secrecy)
}
```

### Step 3: Implement Encryption

**Option A**: Use existing platform functions if the pattern matches notes/messages:

```typescript
// If it's like a note (author + admins):
const result = await platform.encryptNote(JSON.stringify(payload), authorPub, adminPubs)

// If it's like a message (arbitrary readers):
const result = await platform.encryptMessage(plaintext, readerPubkeys)
```

**Option B**: Add a new IPC command if the pattern is novel (see `tauri-ipc-development` skill).

### Step 4: Implement Decryption

Find the user's envelope and decrypt:

```typescript
async function decryptMyData(
  encrypted: EncryptedMyData,
  myPubkey: string,
): Promise<MyDataPayload | null> {
  // Find the envelope addressed to me
  const myEnvelope =
    (encrypted.authorEnvelope && myPubkey === /* author check */)
      ? encrypted.authorEnvelope
      : encrypted.adminEnvelopes.find(e => e.pubkey === myPubkey)

  if (!myEnvelope) return null  // Not a recipient

  const json = await platform.decryptNote(encrypted.encryptedContent, myEnvelope)
  return json ? JSON.parse(json) : null
}
```

### Step 5: Server Storage

The server stores only ciphertext + envelopes:

```typescript
// In the DO:
await this.ctx.storage.put(`mydata:${id}`, {
  id,
  encryptedContent: result.encryptedContent,
  authorEnvelope: result.authorEnvelope,
  adminEnvelopes: result.adminEnvelopes,
  version: 2,
  createdAt: Date.now(),
  // NO plaintext fields here
})
```

### Step 6: Test

- **Desktop**: Playwright test encrypts, stores, fetches, decrypts via mock IPC
- **Crypto**: Test vectors in `packages/crypto/tests/test_vectors.json`
- **Cross-platform**: Same ciphertext decryptable by Rust, TS, Swift, Kotlin

## Hub Key Distribution

The hub key is a shared symmetric key for all hub members (used for Nostr event encryption,
NOT for note/message encryption):

```
Hub key lifecycle:
1. Admin generates random 32 bytes
2. ECIES-wrap for each member (volunteer + admin) using LABEL_HUB_KEY_WRAP
3. Store wrapped envelopes in SettingsDO
4. Each client unwraps with their private key
5. On member departure: generate NEW hub key, re-wrap for remaining members
   (departed member's envelope is simply not included)
```

Hub key is NOT used for notes/messages (those have per-record keys for forward secrecy).
Hub key encrypts real-time Nostr event content and is rotated on membership changes.

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Raw string literal for crypto label | Domain separation broken | Import from `@shared/crypto-labels` |
| Storing plaintext alongside ciphertext | E2EE defeated | Server ONLY stores encrypted fields |
| Reusing content key across records | No forward secrecy | Generate random key PER record |
| Forgetting admin envelopes | Admins can't read data | Always wrap for ALL active admins |
| Not handling "not a recipient" case | Crash on decrypt attempt | Return null, show "cannot decrypt" UI |
| Using hub key for note encryption | Wrong pattern — hub key rotates | Notes use per-note random keys |
| Encrypting without version field | Can't migrate format later | Always include `version: 2` |
| Logging plaintext on server | Breaks zero-knowledge guarantee | Only log IDs and metadata, never content |
| Forgetting to update mobile platforms | Mobile can't decrypt new data | All 3 platforms must implement |

## File Locations

| File | Purpose |
|------|---------|
| `packages/crypto/src/lib.rs` | Core Rust crypto (ECIES, XChaCha20, HKDF) |
| `packages/protocol/crypto-labels.json` | Domain separation constants (source of truth) |
| `packages/shared/crypto-labels.ts` | Generated TS constants |
| `src/client/lib/platform.ts` | Desktop encrypt/decrypt functions |
| `src/client/lib/hub-key-manager.ts` | Hub key store + Nostr event decryption |
| `apps/worker/lib/crypto.ts` | Server-side crypto operations |
| `apps/worker/lib/hub-event-crypto.ts` | Server event encryption |
| `apps/ios/Sources/Services/CryptoService.swift` | iOS crypto (UniFFI) |
| `apps/android/.../crypto/CryptoService.kt` | Android crypto (JNI) |
| `packages/crypto/tests/test_vectors.json` | Cross-platform test vectors |
