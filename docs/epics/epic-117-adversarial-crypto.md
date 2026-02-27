# Epic 117: Adversarial Crypto Tests

**Status: PENDING**
**Repos**: llamenos-core (Rust tests) + llamenos (JS tests)
**Priority**: High — ensures crypto operations fail safely with malicious input
**Depends on**: Epic 112 (expanded test vectors provide the base for adversarial variants)

## Summary

Add 17+ negative/adversarial test cases in Rust and JS that verify cryptographic operations reject bad input with proper errors. These tests prove that tampered ciphertext, wrong keys, expired tokens, and malformed inputs are all caught — not silently accepted.

## Motivation

Positive tests (Epic 112) verify "correct input → correct output." Adversarial tests verify "bad input → explicit rejection." Without adversarial tests:
- A refactor could accidentally remove authentication tag checking
- A wrong-key decryption could return garbage instead of an error
- An expired token could be silently accepted

## Rust Adversarial Tests

### ECIES Module (`llamenos-core/src/ecies.rs`) — 5 tests

**1. `ecies_wrong_recipient_key_fails`**
- Wrap a key for recipient A
- Attempt to unwrap with recipient B's key
- Expected: `Err(...)` (auth tag verification failure)

**2. `ecies_truncated_wrapped_key_fails`**
- Take a valid wrapped key and truncate it by 1 byte
- Attempt to unwrap
- Expected: `Err(...)` (nonce/ciphertext parsing failure)

**3. `ecies_tampered_ciphertext_fails`**
- Take a valid wrapped key and flip a bit in the ciphertext portion (after nonce)
- Attempt to unwrap
- Expected: `Err(...)` (auth tag verification failure)

**4. `ecies_empty_plaintext_fails`**
- Attempt to wrap an empty byte array
- Expected: `Err(...)` or succeeds (implementation-defined — document behavior)

**5. `ecies_invalid_pubkey_format_fails`**
- Attempt to wrap with a 31-byte pubkey (too short)
- Attempt to wrap with all-zeros pubkey (not on curve)
- Expected: `Err(...)` (invalid public key)

### Encryption Module (`llamenos-core/src/encryption.rs`) — 6 tests

**6. `note_wrong_admin_key_fails`**
- Encrypt a note for admin A
- Attempt to decrypt with admin B's key using admin A's envelope
- Expected: `Err(...)` (ECIES unwrap failure)

**7. `note_tampered_content_fails`**
- Encrypt a note, then flip a bit in `encrypted_content`
- Attempt to decrypt with correct key
- Expected: `Err(...)` (XChaCha20-Poly1305 auth tag failure)

**8. `message_wrong_reader_fails`**
- Encrypt a message for readers [A, B]
- Attempt to decrypt as reader C using reader A's envelope
- Expected: `Err(...)` (ECIES unwrap failure)

**9. `pin_wrong_pin_fails`**
- Encrypt nsec with PIN "1234"
- Attempt to decrypt with PIN "5678"
- Expected: `Err(...)` (auth tag failure — wrong KEK derived)

**10. `pin_boundary_lengths`**
- Test PIN "123" (too short — 3 digits) → validation error
- Test PIN "1234567" (too long — 7 digits) → validation error
- Test PIN "1234" (4 digits) → succeeds
- Test PIN "123456" (6 digits) → succeeds

**11. `draft_wrong_key_fails`**
- Encrypt a draft with key A
- Attempt to decrypt with key B
- Expected: `Err(...)` (HKDF derives different symmetric key → auth tag failure)

### Auth Module (`llamenos-core/src/auth.rs`) — 4 tests

**12. `auth_expired_token_rejected`**
- Create a token with timestamp = now - 6 minutes
- Verify with current time (5-minute window)
- Expected: verification fails (expired)

**13. `auth_wrong_method_rejected`**
- Create a token for method "GET", path "/api/notes"
- Verify with method "POST", path "/api/notes"
- Expected: verification fails (method mismatch in signed message)

**14. `auth_wrong_path_rejected`**
- Create a token for method "GET", path "/api/notes"
- Verify with method "GET", path "/api/calls"
- Expected: verification fails (path mismatch)

**15. `auth_malformed_token_rejected`**
- Verify a token string that's too short (< 64 hex chars)
- Verify a token string with non-hex characters
- Verify a token with valid format but random signature bytes
- Expected: all fail with appropriate errors

### Nostr Module (`llamenos-core/src/nostr.rs`) — 2 tests

**16. `nostr_tampered_content_invalidates_id`**
- Finalize an event, then change the `content` field
- Recompute event ID from tampered canonical JSON
- Expected: computed ID ≠ original event.id

**17. `nostr_wrong_key_signature_fails`**
- Finalize an event with key A
- Verify the signature against key B's pubkey
- Expected: `schnorr::verify()` returns false

## Adversarial Test Vectors in JSON

Add an `"adversarial"` section to `test-vectors.json` for JS consumption:

```json
{
  "adversarial": {
    "ecies": {
      "validEnvelope": { ... },
      "tamperedWrappedKey": "hex...",     // bit-flipped ciphertext
      "truncatedWrappedKey": "hex...",    // 1 byte removed
      "wrongRecipientSecret": "hex..."   // different key
    },
    "note": {
      "validEncrypted": { ... },
      "tamperedContent": "hex...",        // bit-flipped encrypted_content
      "wrongAdminSecret": "hex..."       // different admin key
    },
    "auth": {
      "validToken": { ... },
      "expiredTimestamp": 1708899700000,  // 5+ minutes before valid token
      "wrongMethod": "POST",
      "wrongPath": "/api/calls",
      "malformedToken": "not-hex-at-all"
    },
    "message": {
      "validEncrypted": { ... },
      "wrongReaderSecret": "hex..."      // key not in reader list
    }
  }
}
```

## TypeScript Adversarial Tests

### File: `llamenos/tests/crypto-interop.spec.ts`

Add adversarial test section:

```typescript
test.describe('Adversarial: tampered input rejected', () => {
  test('ECIES unwrap with wrong key throws', () => {
    const { validEnvelope, wrongRecipientSecret } = vectors.adversarial.ecies
    expect(() => eciesUnwrapKey(validEnvelope, wrongRecipientSecret, LABEL_NOTE_KEY))
      .toThrow()
  })

  test('ECIES unwrap with truncated data throws', () => {
    const { truncatedWrappedKey } = vectors.adversarial.ecies
    const envelope = { wrappedKey: truncatedWrappedKey, ephemeralPubkey: vectors.ecies.envelope.ephemeralPubkey }
    expect(() => eciesUnwrapKey(envelope, vectors.keys.adminSecretKeyHex, LABEL_NOTE_KEY))
      .toThrow()
  })

  test('ECIES unwrap with tampered ciphertext throws', () => {
    const { tamperedWrappedKey } = vectors.adversarial.ecies
    const envelope = { wrappedKey: tamperedWrappedKey, ephemeralPubkey: vectors.ecies.envelope.ephemeralPubkey }
    expect(() => eciesUnwrapKey(envelope, vectors.keys.adminSecretKeyHex, LABEL_NOTE_KEY))
      .toThrow()
  })

  test('Note decrypt with wrong admin key throws', () => {
    const { validEncrypted, wrongAdminSecret } = vectors.adversarial.note
    expect(() => decryptNote(
      validEncrypted.encryptedContent,
      validEncrypted.adminEnvelopes[0],
      wrongAdminSecret
    )).toThrow()
  })

  test('Note decrypt with tampered content throws', () => {
    const { tamperedContent } = vectors.adversarial.note
    const { adminEnvelopes } = vectors.noteEncryption
    expect(() => decryptNote(tamperedContent, adminEnvelopes[0], vectors.keys.adminSecretKeyHex))
      .toThrow()
  })

  test('Auth token with wrong method fails verification', () => {
    const { validToken, wrongMethod } = vectors.adversarial.auth
    const result = verifyAuthToken(validToken, wrongMethod, vectors.auth.path)
    expect(result).toBe(false)
  })

  test('Auth token with wrong path fails verification', () => {
    const { validToken, wrongPath } = vectors.adversarial.auth
    const result = verifyAuthToken(validToken, vectors.auth.method, wrongPath)
    expect(result).toBe(false)
  })

  test('Message decrypt with wrong reader key throws', () => {
    const { validEncrypted, wrongReaderSecret } = vectors.adversarial.message
    expect(() => decryptMessage(
      validEncrypted.encryptedContent,
      validEncrypted.readerEnvelopes,
      wrongReaderSecret,
      getPublicKey(wrongReaderSecret)
    )).toThrow()
  })
})
```

## Files to Modify

### llamenos-core
- `src/ecies.rs` — 5 new test functions in `#[cfg(test)]` module
- `src/encryption.rs` — 6 new test functions
- `src/auth.rs` — 4 new test functions
- `src/nostr.rs` — 2 new test functions
- `tests/interop.rs` — generate adversarial vectors in JSON

### llamenos
- `tests/crypto-interop.spec.ts` — add adversarial test section (8+ tests)

### Regenerated
- `llamenos-core/tests/fixtures/test-vectors.json` — now includes `adversarial` section

## Verification

1. `cd ~/projects/llamenos-core && cargo test` — 17+ new adversarial tests pass (total: ~55+ tests)
2. `cd ~/projects/llamenos && bun run test -- tests/crypto-interop.spec.ts` — 8+ adversarial JS tests pass
3. Every adversarial test explicitly checks for error/rejection (not just "doesn't crash")
4. No adversarial test accidentally succeeds (false positive — would indicate a security bug)
5. Code coverage of error paths in ecies.rs, encryption.rs, auth.rs, nostr.rs significantly increased
