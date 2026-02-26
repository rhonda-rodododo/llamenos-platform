# Epic 74: End-to-End Encrypted Messaging Storage

## Problem Statement

SMS, WhatsApp, and Signal messages must be stored with E2EE encryption. The server should never be able to read message content — it only needs to route messages to the correct volunteer and store encrypted blobs for later retrieval.

**Clean Rewrite Context:** Since Llamenos is pre-production with no deployed users, we build E2EE messaging from scratch. All messages are encrypted from day one — no plaintext storage, no migration code.

## Goals

1. Store all messaging content (SMS, WhatsApp, Signal) as ciphertext on the server
2. Maintain the ability to display conversation threads to assigned volunteers
3. Allow all admins to read conversations (for oversight/training)
4. Preserve search functionality (admin-only, over encrypted metadata)
5. No changes to the external messaging flow (webhooks still receive plaintext from providers)

## Security Model

### Encryption Flow — Inbound Messages

```
Inbound message (webhook arrives at server)
    |
    +-- Extract metadata (sender hash, timestamp, channel)
    |
    +-- Server encrypts content with per-message random key (XChaCha20-Poly1305)
    |   +-- ECIES-wrap per-message key for assigned volunteer (volunteerEnvelope)
    |   +-- ECIES-wrap per-message key for each admin (adminEnvelopes[])
    |
    +-- Store: encryptedContent + nonce + envelopes + plaintext metadata
    |
    +-- Discard plaintext immediately
```

### Encryption Flow — Outbound Messages

```
Outbound message (volunteer composes in browser)
    |
    +-- Client generates per-message random key
    +-- Client encrypts content (XChaCha20-Poly1305) -> encryptedContent + nonce
    +-- Client wraps per-message key for self (volunteerEnvelope)
    +-- Client wraps per-message key for each admin (adminEnvelopes[])
    |
    +-- Client sends to server:
    |   {
    |     plaintextForSending: "Hello...",     // for SMS/WhatsApp provider
    |     encryptedContent: "...",             // for storage
    |     nonce: "...",                        // for storage
    |     volunteerEnvelope: {...},            // for storage
    |     adminEnvelopes: [{...}, {...}]       // for storage
    |   }
    |
    +-- Server forwards plaintextForSending to provider API
    +-- Server stores ONLY encrypted fields, discards plaintext immediately
```

> **Inherent Limitation:** For outbound SMS and WhatsApp messages, plaintext transits the server momentarily so it can be forwarded to the provider API. This is NOT zero-knowledge for the outbound send path. It IS zero-knowledge for storage — the server never persists plaintext and has no key material to decrypt stored messages. Signal messages via a self-hosted bridge may avoid this limitation entirely (see Phase 3 below).

### Envelope Pattern (Matching Note Encryption)

The current codebase uses dual independent ECIES encryptions for messages — two separate ciphertexts of the same plaintext. This diverges from the note encryption pattern (`encryptNoteV2` in `crypto.ts`), which correctly uses a per-note random symmetric key with ECIES-wrapped envelopes.

**Messages MUST use the same envelope pattern as notes:**

1. Generate a random 32-byte per-message symmetric key
2. Encrypt the plaintext once with XChaCha20-Poly1305 using that key
3. ECIES-wrap the per-message key separately for each authorized reader
4. Store one ciphertext + N envelopes (not N ciphertexts)

This is more efficient (one encryption operation instead of N), produces smaller storage (one ciphertext instead of N), and is consistent with the proven note encryption design.

### Domain Separation

The existing `encryptForPublicKey()` function in `src/client/lib/crypto.ts` uses the domain label `"llamenos:transcription"` for ECDH key derivation. This label was originally written for server-encrypted transcriptions and was reused for messages without updating the domain.

**Messages MUST use domain label `"llamenos:message"`** (not `"llamenos:transcription"`). This ensures cryptographic domain separation between message encryption and transcription encryption. See Epic 76.0 for the full domain label audit across the codebase.

### What the Server Stores (After Implementation)

| Data | Storage | Notes |
|------|---------|-------|
| Message content | XChaCha20-Poly1305 ciphertext | Single copy, per-message random key |
| Encryption nonce | Plaintext | 24-byte nonce for content decryption |
| Volunteer envelope | ECIES ciphertext | Per-message key wrapped for volunteer |
| Admin envelopes | ECIES ciphertext[] | Per-message key wrapped for each admin |
| Sender identifier | HMAC hash | Already implemented |
| Timestamp | Plaintext | Required for ordering |
| Channel type | Plaintext | Required for routing |
| Message direction | Plaintext | inbound/outbound |
| Delivery status | Plaintext | sent/delivered/failed |
| Assigned volunteer | Plaintext pubkey | Required for filtering |

### What Changes for Volunteers

- Conversation view decrypts messages client-side (same pattern as notes)
- Slight latency on initial load while decrypting message batch
- Outbound messages: client sends both plaintext (for provider) and encrypted (for storage)

### Trade-offs

| Trade-off | Decision |
|-----------|----------|
| Volunteer must be assigned before inbound encryption for them | Accept — unassigned messages encrypted for admin(s) only until assignment |
| Re-assignment requires re-wrapping keys | Accept — admin client performs re-encryption (see Phase 5) |
| Server-side message search | Remove — search only over metadata (timestamps, channel) |
| Message preview in notifications | Remove — notifications show "New message" without content |
| Outbound plaintext transits server | Accept — inherent limitation of SMS/WhatsApp (document clearly) |

## Implementation

### Phase 1: Types and Encryption Infrastructure

1. **Updated types** in `src/shared/types.ts`:

   ```typescript
   // Reuse existing RecipientEnvelope from file encryption
   // (already defined: { pubkey, encryptedFileKey, ephemeralPubkey })
   //
   // For messages, the "encryptedFileKey" field wraps the per-message key.
   // Consider renaming to a generic RecipientEnvelope with `encryptedKey`
   // field in Epic 76.0 type cleanup.

   interface EncryptedMessage {
     id: string
     conversationId: string
     channel: ChannelType
     direction: 'inbound' | 'outbound'
     timestamp: string
     status: MessageDeliveryStatus
     encryptedContent: string             // XChaCha20-Poly1305 ciphertext (one copy)
     nonce: string                        // 24-byte encryption nonce (hex)
     volunteerEnvelope?: RecipientEnvelope // Per-message key wrapped for volunteer (null if unassigned)
     adminEnvelopes: RecipientEnvelope[]   // Per-message key wrapped for each admin
     hasAttachments: boolean
     attachmentIds?: string[]
     externalId?: string
     deliveredAt?: string
     readAt?: string
     failureReason?: string
     retryCount?: number
   }
   ```

2. **Client-side encryption** in `src/client/lib/crypto.ts`:

   ```typescript
   // Encrypt a message using the envelope pattern (matching encryptNoteV2)
   export function encryptMessage(
     content: string,
     volunteerPubkey: string | null,
     adminPubkeys: string[]              // All admin pubkeys (Epic 76.2)
   ): {
     encryptedContent: string
     nonce: string
     volunteerEnvelope: RecipientEnvelope | null
     adminEnvelopes: RecipientEnvelope[]
   } {
     // 1. Generate random per-message symmetric key
     const messageKey = randomBytes(32)
     const nonce = randomBytes(24)

     // 2. Encrypt content once with XChaCha20-Poly1305
     const cipher = xchacha20poly1305(messageKey, nonce)
     const ciphertext = cipher.encrypt(utf8ToBytes(content))

     // 3. ECIES-wrap the per-message key for each reader
     //    Uses domain label "llamenos:message" (NOT "llamenos:transcription")
     const volunteerEnvelope = volunteerPubkey
       ? wrapKeyForPubkey(messageKey, volunteerPubkey, 'llamenos:message')
       : null

     const adminEnvelopes = adminPubkeys.map(pubkey =>
       wrapKeyForPubkey(messageKey, pubkey, 'llamenos:message')
     )

     return {
       encryptedContent: bytesToHex(ciphertext),
       nonce: bytesToHex(nonce),
       volunteerEnvelope,
       adminEnvelopes,
     }
   }
   ```

3. **Client-side decryption** in `src/client/lib/crypto.ts`:

   ```typescript
   // Decrypt a message using the recipient's envelope
   export function decryptMessage(
     message: EncryptedMessage,
     recipientSecretKey: Uint8Array
   ): string | null {
     try {
       // Determine which envelope to use based on the recipient's pubkey
       const pubkey = getPublicKey(recipientSecretKey)
       const envelope = message.volunteerEnvelope?.pubkey === pubkey
         ? message.volunteerEnvelope
         : message.adminEnvelopes.find(e => e.pubkey === pubkey)

       if (!envelope) return null

       // Unwrap the per-message key from the envelope
       // Uses domain label "llamenos:message"
       const messageKey = unwrapKey(envelope, recipientSecretKey, 'llamenos:message')

       // Decrypt content
       const ciphertext = hexToBytes(message.encryptedContent)
       const nonce = hexToBytes(message.nonce)
       const cipher = xchacha20poly1305(messageKey, nonce)
       const plaintext = cipher.decrypt(ciphertext)
       return new TextDecoder().decode(plaintext)
     } catch {
       return null
     }
   }
   ```

4. **No migration needed**: All messages encrypted from the start (pre-production, no existing data). Storage schema designed for envelope pattern only.

### Phase 2: Inbound Message Handling

1. **Webhook handlers** (`sms-adapter.ts`, `whatsapp-adapter.ts`, `signal-adapter.ts`):
   - Receive plaintext from provider (unavoidable)
   - Server encrypts immediately using envelope pattern before storage
   - If conversation has assigned volunteer: wrap key for volunteer + all admins
   - If unassigned: wrap key for all admins only (volunteer envelope added on assignment)

2. **Server-side encryption** in `src/worker/lib/crypto.ts`:
   - Add `encryptMessageForStorage()` — generates per-message key, encrypts content, wraps key for recipients
   - Uses domain label `"llamenos:message"` for ECDH key derivation
   - Server must know all admin pubkeys (fetched from IdentityDO)

3. **ConversationDO changes**:
   - Store `EncryptedMessage` with envelope pattern (not dual ECIES)
   - Per-message storage keys: `message:${messageId}` instead of array
   - Use `ctx.storage.list({ prefix: 'message:', ... })` with cursor pagination for retrieval

### Phase 3: Outbound Message Handling

1. **Client sends both plaintext and encrypted**:
   - Compose message in browser
   - Client generates per-message key and encrypts using envelope pattern
   - Client sends to server: `{ plaintextForSending, encryptedContent, nonce, volunteerEnvelope, adminEnvelopes }`

2. **Server forwards plaintext, stores encrypted**:
   - Server forwards `plaintextForSending` to SMS/WhatsApp provider API
   - Server stores ONLY `encryptedContent`, `nonce`, and envelopes
   - Server discards `plaintextForSending` immediately after provider send (success or failure)
   - Server NEVER holds admin private keys — it cannot decrypt stored messages

3. **Existing implementation already follows this pattern**:
   - `src/worker/routes/conversations.ts` already accepts `plaintextForSending`
   - `src/client/routes/conversations.tsx` already sends plaintext alongside encrypted content
   - The migration is upgrading from dual-ECIES to envelope pattern, not changing the flow

4. **Signal bridge (improved path)**:
   - If using self-hosted signal-cli bridge, plaintext never needs to reach the Llamenos server
   - Server forwards encrypted payload directly to bridge
   - Bridge handles Signal protocol E2EE to recipient
   - This eliminates the "momentary plaintext" limitation for Signal

### Phase 4: Conversation UI Updates

1. **ConversationThread component**:
   - Fetch encrypted messages via paginated API
   - Batch decrypt on load using `decryptMessage()`
   - Cache decrypted content in React state (memory-only, never persisted)
   - Show loading state during decryption
   - Incremental decryption for large threads (decrypt visible messages first)

2. **Conversation list**:
   - Remove message preview (shows "New message" or timestamp only)
   - Notification text: channel type + timestamp, no content

### Phase 5: Re-encryption on Reassignment

The audit found the current re-encryption stub is a no-op. This phase adds concrete re-encryption when a conversation is reassigned to a different volunteer.

**Design: Admin-mediated re-wrapping**

Re-encryption does NOT re-encrypt message content. It re-wraps the per-message symmetric keys for the new volunteer.

1. Admin initiates reassignment in the UI
2. Admin client fetches all `EncryptedMessage` records for the conversation
3. For each message, admin client:
   - Unwraps the per-message key using their own admin envelope
   - Wraps the per-message key for the new volunteer's pubkey
   - Produces a new `volunteerEnvelope`
4. Admin client POSTs the new volunteer envelopes to server via:
   ```
   POST /api/conversations/:id/rewrap
   Body: { newVolunteerPubkey: string, envelopes: Array<{ messageId: string, volunteerEnvelope: RecipientEnvelope }> }
   ```
5. Server replaces old volunteer envelopes with new ones (atomic batch update)

**Constraints:**
- Admin MUST be online during reassignment (server cannot rewrap — no private keys)
- If admin is offline: reassignment is blocked in the UI. The new volunteer sees:
  `"[Messages encrypted before your assignment -- admin must authorize access]"`
- New inbound messages after reassignment are encrypted for the new volunteer immediately
- Old volunteer's envelopes are deleted on reassignment (they lose access)

**Performance for long conversations:**
- Rewrap is key-wrapping only (fast ECDH + AES), not re-encryption of content
- 1000 messages = 1000 ECIES wrap operations, ~2-3 seconds on modern hardware
- Paginate if needed, but unlikely to be a bottleneck

### Phase 6: Multi-Admin Support

The current implementation assumes a single `ADMIN_PUBKEY`. Epic 76.2 designs the multi-admin key architecture.

**Impact on message encryption:**
- Each message needs admin envelopes for ALL active admins (one per admin)
- `adminEnvelopes: RecipientEnvelope[]` instead of a single `adminEnvelope`
- When a new admin is added: existing messages need admin envelope addition (admin-mediated, same as volunteer rewrap)
- When an admin is removed: their envelopes can optionally be deleted (they still had access historically; forward secrecy via per-message keys limits exposure)
- Storage cost: ~100 bytes per admin per message (ECIES envelope size)

## Files to Modify

- `src/shared/types.ts` — Update `EncryptedMessage` type to envelope pattern, add `MessageEnvelope` type
- `src/worker/types.ts` — Update `EncryptedMessage` to match shared type
- `src/client/lib/crypto.ts` — Add `encryptMessage()`, `decryptMessage()` with `"llamenos:message"` domain, parameterize `wrapKeyForPubkey` domain label
- `src/worker/lib/crypto.ts` — Add server-side `encryptMessageForStorage()` with `"llamenos:message"` domain
- `src/worker/durable-objects/conversation-do.ts` — Envelope-pattern storage, per-message storage keys, rewrap endpoint
- `src/worker/routes/conversations.ts` — Accept envelope-pattern fields, add `POST /rewrap` endpoint
- `src/worker/messaging/sms-adapter.ts` — Encrypt inbound with envelope pattern
- `src/worker/messaging/whatsapp-adapter.ts` — Encrypt inbound with envelope pattern
- `src/worker/messaging/signal-adapter.ts` — Encrypt inbound with envelope pattern
- `src/client/components/ConversationThread.tsx` — Client-side decryption with envelope unwrap
- `src/client/components/MessageComposer.tsx` — Send envelope-pattern encrypted fields
- `src/client/routes/conversations.tsx` — Update encryption flow, handle "admin must authorize" state

## Success Criteria

- [ ] All messages stored as single ciphertext + envelope(s) (no dual-ECIES, no plaintext storage path)
- [ ] Domain label `"llamenos:message"` used consistently (not `"llamenos:transcription"`)
- [ ] Conversation thread renders correctly with client-side decryption
- [ ] Outbound messages: client sends `plaintextForSending` + encrypted fields; server never persists plaintext
- [ ] Reassignment re-wraps per-message keys for new volunteer (admin-mediated)
- [ ] All active admins can read all conversations (multi-admin envelopes)
- [ ] Server logs show no plaintext message content
- [ ] Subpoena of database yields only ciphertext + ECIES envelopes for message bodies

## Dependencies

- **Epic 76.0 (Domain Separation Audit)** — Defines `"llamenos:message"` domain label and parameterized domain in `wrapKeyForPubkey`
- **Epic 76.2 (Key Architecture)** — Multi-admin pubkey registry, admin envelope management
- Builds on existing ECIES infrastructure from note encryption (`encryptNoteV2` pattern)

## Estimated Effort

Medium-Large — touches messaging adapters, DO storage, conversation UI, and adds rewrap endpoint. The envelope pattern itself is well-established from notes; the main work is migrating the dual-ECIES pattern and adding the rewrap flow.

## Execution Context

### ConversationDO Message Handling
- `src/worker/durable-objects/conversation-do.ts` — current message storage in conversation arrays
- `/conversations/:id/messages` POST — add message endpoint
- `/conversations/incoming` POST — inbound message from webhook

### Messaging Adapters (Inbound Encryption Points)
- `src/worker/messaging/sms-adapter.ts` — inbound SMS handler; plaintext arrives from Twilio webhook
- `src/worker/messaging/whatsapp-adapter.ts` — inbound WhatsApp handler
- `src/worker/messaging/signal-adapter.ts` — inbound Signal handler (self-hosted bridge)

### Client Encryption Pattern
- `src/client/lib/crypto.ts` L140-161 — `encryptNoteV2()` template for `encryptMessage()`
- Same pattern: random per-message key + XChaCha20-Poly1305 + ECIES-wrap for each reader
- `wrapKeyForPubkey()` at L76-105 — reuse with domain label `"llamenos:message"`

### Server-Side Encryption
- `src/worker/lib/crypto.ts` L16-55 — `encryptForPublicKey()` for server-side ECIES
- Needs: `encryptMessageForStorage()` — generates per-message key, encrypts content, wraps for recipients

### Conversation UI
- `src/client/components/ConversationThread.tsx` — currently renders plaintext messages; needs client-side decrypt
- `src/client/routes/conversations.tsx` — already sends `plaintextForSending` alongside encrypted content

### Shared Types
- `src/shared/types.ts` — `RecipientEnvelope` already defined: `{ pubkey, encryptedFileKey, ephemeralPubkey }`
- Reuse for message envelopes (rename `encryptedFileKey` → `encryptedKey` in shared type, or create alias)
