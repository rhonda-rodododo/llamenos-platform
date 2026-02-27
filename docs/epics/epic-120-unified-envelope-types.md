# Epic 120: Unified Envelope Types & Encryption Cleanup

## Status: APPROVED

## Problem Statement

The codebase uses two different type shapes for the same ECIES envelope construction:

**Notes (author + admin):**
```typescript
interface EncryptedNote {
  encryptedContent: string
  authorEnvelope?: { wrappedKey: string; ephemeralPubkey: string }  // no pubkey field
  adminEnvelopes?: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
}
```

**Messages (uniform readers):**
```typescript
interface EncryptedMessage {
  encryptedContent: string
  readerEnvelopes: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
}
```

The underlying ECIES construction is identical for both — the only difference is that `authorEnvelope` omits the `pubkey` field (since the author's pubkey is implicit from the note's `authorPubkey` field).

Additionally:
- `KeyEnvelope` in `shared/types.ts` has `recipientPubkey` while `MessageKeyEnvelope` uses `pubkey` — two names for the same field
- Notes use `LABEL_NOTE_KEY`, messages use `LABEL_MESSAGE` — these MUST remain different (domain separation), but the envelope format should be uniform
- `encryptMessageForStorage` (server-side) and `encryptNote` (client-side) follow different patterns for the same construction

With threaded notes (Epic 123), note replies will use the same envelope pattern as messages. Unifying now prevents even more divergence.

## Goals

1. Unify envelope types to a single `RecipientEnvelope` shape used everywhere
2. Add `pubkey` field to note author envelopes for consistency
3. Standardize naming (`recipientPubkey` → `pubkey` everywhere, or vice versa)
4. Keep domain separation labels distinct (this is security-critical)

## Implementation

### Phase 1: Define Unified Envelope Type

**File: `src/shared/types.ts`**

```typescript
/** ECIES-wrapped symmetric key for one recipient. */
export interface RecipientEnvelope {
  /** Recipient's x-only public key (hex). */
  pubkey: string
  /** Nonce (24 bytes) + ciphertext: ECIES-wrapped symmetric key (hex). */
  wrappedKey: string
  /** Ephemeral secp256k1 compressed public key used for ECDH (hex). */
  ephemeralPubkey: string
}

/** Encrypted content with per-reader ECIES envelopes. */
export interface EncryptedRecord {
  /** XChaCha20-Poly1305 encrypted content (hex). */
  encryptedContent: string
  /** One envelope per authorized reader. */
  envelopes: RecipientEnvelope[]
}
```

### Phase 2: Migrate Note Types

Update `EncryptedNote` to use unified envelopes:

```typescript
// Before
interface EncryptedNote {
  authorEnvelope?: { wrappedKey: string; ephemeralPubkey: string }
  adminEnvelopes?: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
}

// After
interface EncryptedNote {
  envelopes: RecipientEnvelope[]  // author envelope + admin envelopes unified
}
```

The author's envelope now has a `pubkey` field like every other envelope. The distinction between "author" and "admin" envelopes is no longer structural — both are `RecipientEnvelope` entries where the first entry is the author (identified by `pubkey === note.authorPubkey`).

### Phase 3: Migrate Message Types

Update `EncryptedMessage` to use unified envelopes:

```typescript
// Before
interface EncryptedMessage {
  readerEnvelopes: MessageKeyEnvelope[]
}

// After
interface EncryptedMessage {
  envelopes: RecipientEnvelope[]
}
```

### Phase 4: Update Crypto Functions

**`src/client/lib/platform.ts`** — `encryptNote` now returns `envelopes: RecipientEnvelope[]`
**`src-tauri/src/crypto.rs`** — Rust IPC returns unified envelope format
**`src/worker/lib/crypto.ts`** — `encryptMessageForStorage` and `encryptCallRecordForStorage` use `RecipientEnvelope`
**`llamenos-core/src/encryption.rs`** — `encrypt_note` returns unified format

### Phase 5: Deprecate Old Envelope Types

Remove `KeyEnvelope` (with `recipientPubkey`) and `MessageKeyEnvelope` (with `pubkey`) in favor of the single `RecipientEnvelope`. Update all consumers:

- `src/worker/types.ts` — Remove `MessageKeyEnvelope`, use `RecipientEnvelope`
- `src/shared/types.ts` — Remove `KeyEnvelope`, `RecipientKeyEnvelope`, use `RecipientEnvelope`
- Frontend components — Use `RecipientEnvelope` everywhere

Note: The existing `RecipientEnvelope` in `shared/types.ts` (used for file uploads with `encryptedFileKey` instead of `wrappedKey`) needs to be reconciled — rename the file-specific one to `FileRecipientEnvelope` or unify the field name.

### Phase 6: Update Test Vectors

**`llamenos-core/tests/interop.rs`** — Regenerate test vectors with unified envelope format
**`tests/crypto-interop.spec.ts`** — Update consumption tests
**`llamenos-mobile/__tests__/crypto-interop.test.ts`** — Update mobile tests

## Security Considerations

- **Domain separation labels MUST remain distinct**: `LABEL_NOTE_KEY` for notes, `LABEL_MESSAGE` for messages. This prevents cross-protocol attacks where a message envelope is replayed as a note envelope.
- The unified type is a structural change only — the crypto construction (ECDH -> SHA-256(label || sharedX) -> XChaCha20-Poly1305) is identical and unchanged.
- Adding `pubkey` to author envelopes is a net security improvement — it makes envelope provenance explicit rather than implicit.

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Define `RecipientEnvelope`, `EncryptedRecord`; deprecate old types |
| `src/worker/types.ts` | Update `EncryptedNote`, `EncryptedMessage` to use `RecipientEnvelope` |
| `src/client/lib/platform.ts` | Update encrypt/decrypt return types |
| `src/worker/lib/crypto.ts` | Update server-side encryption functions |
| `src-tauri/src/crypto.rs` | Update IPC return format |
| `llamenos-core/src/encryption.rs` | Update Rust envelope types |
| `src/worker/routes/notes.ts` | Accept unified envelope format |
| `src/worker/routes/conversations.ts` | Use `RecipientEnvelope` type |
| `src/worker/routes/reports.ts` | Use `RecipientEnvelope` type |
| `tests/crypto-interop.spec.ts` | Update for unified format |

## Dependency

Depends on **Epic 119** (Records Domain Consolidation) — the shared components and utilities from 119 make the type migration smoother.

## Verification

1. All crypto interop tests pass with unified envelope format
2. Notes encrypt/decrypt correctly with new format
3. Messages encrypt/decrypt correctly (unchanged crypto, new type)
4. Note replies (Epic 123) use the same envelope format
5. Cross-platform (desktop Rust, browser WASM, mobile UniFFI) all produce compatible envelopes
6. Domain separation labels remain distinct in all code paths
