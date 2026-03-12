# Epic 309: Relay Event Decryption — All Platforms

**Status**: COMPLETE
**Priority**: Critical
**Depends on**: Epic 252 (server event encryption), Epic 310 (publisher reliability)
**Blocks**: None
**Branch**: `desktop`

## Summary

Wire relay event decryption on ALL platforms (desktop, iOS, Android). The server encrypts all Nostr relay events with XChaCha20-Poly1305 using a key derived via `HKDF(SERVER_NOSTR_SECRET, LABEL_HUB_EVENT)`. This key is exposed to authenticated clients as `serverEventKeyHex` in `GET /api/auth/me`. Currently NO platform decrypts relay events — desktop returns `null` from `getHubKey()`, iOS emits raw encrypted events, and Android tries to JSON.parse encrypted hex (always fails silently).

## Problem Statement

**Server-side** (working): `publishNostrEvent()` encrypts event content via `encryptHubEvent(content, eventKey)` in `apps/worker/lib/hub-event-crypto.ts`. The event key is derived deterministically: `HKDF(SHA-256, SERVER_NOSTR_SECRET, empty_salt, "llamenos:hub-event", 32)`. The hex of this derived key is returned as `serverEventKeyHex` in the authenticated `/api/auth/me` response.

**Desktop** (broken): `src/client/routes/__root.tsx:162` — `getHubKey` returns `null`. The relay's `handleEvent()` skips decryption when no key is available. The auth state in `auth.tsx` doesn't store `serverEventKeyHex` even though `getMe()` returns it.

**iOS** (broken): `AuthMeResponse` has `serverEventKeyHex` field but it's never used. `WebSocketService.emitEvent()` broadcasts raw `NostrEvent` with encrypted content. No decrypt step exists.

**Android** (broken): Doesn't parse `serverEventKeyHex` from auth response at all. `handleMessage()` calls `parseTypedEvent(event.content)` on encrypted hex → `JSON.parse` fails → returns `null` → all events become `Unknown`.

## Architecture

The fix is straightforward across all platforms:

1. **Store `serverEventKeyHex`** from `GET /api/auth/me` response
2. **Decrypt event content** using XChaCha20-Poly1305: split hex → first 24 bytes = nonce, rest = ciphertext
3. **Parse decrypted JSON** into typed events
4. **No ECIES unwrapping needed** — the key is provided directly by the server

For mobile platforms, a new Rust FFI function `decrypt_server_event_hex(encrypted_hex, key_hex)` handles XChaCha20-Poly1305 decryption. Desktop uses the existing JS `decryptFromHub()` which already implements the same algorithm.

## Implementation

### Phase 1: Rust FFI — Server Event Decrypt Function

#### Task 1: Add `decrypt_server_event_hex` to Rust FFI

**File**: `packages/crypto/src/ffi.rs`

```rust
/// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
///
/// Input: hex(nonce_24 + ciphertext), 32-byte key as hex.
/// Output: decrypted UTF-8 string (JSON).
///
/// Used by mobile platforms to decrypt Nostr relay events encrypted
/// with the server event key (from GET /api/auth/me serverEventKeyHex).
#[uniffi::export]
pub fn decrypt_server_event_hex(encrypted_hex: &str, key_hex: &str) -> Result<String, CryptoError> {
    use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};

    let data = hex::decode(encrypted_hex).map_err(CryptoError::HexError)?;
    let key_bytes = hex::decode(key_hex).map_err(CryptoError::HexError)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    if data.len() < 24 + 16 {
        return Err(CryptoError::InvalidCiphertext);
    }

    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];
    let cipher = XChaCha20Poly1305::new_from_slice(&key_bytes)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}
```

Test: Encrypt with known key → decrypt → verify roundtrip.

#### Task 2: Run Rust tests

```bash
cargo test --manifest-path packages/crypto/Cargo.toml
cargo test --manifest-path packages/crypto/Cargo.toml --features mobile
```

### Phase 2: Desktop — Wire `serverEventKeyHex` into Relay

#### Task 3: Store `serverEventKeyHex` in auth state

**File**: `src/client/lib/auth.tsx`
- Add `serverEventKeyHex: string | null` to `AuthState`
- Store `me.serverEventKeyHex ?? null` in all `setState()` calls that process `getMe()` responses
- Expose `serverEventKeyHex` in `AuthContextValue`

#### Task 4: Pass server event key to NostrProvider

**File**: `src/client/routes/__root.tsx`
- Read `serverEventKeyHex` from auth context
- Convert hex to `Uint8Array` using `hexToBytes()` from `@noble/hashes/utils.js`
- Return it from `getHubKey` callback instead of `null`

```typescript
const { serverEventKeyHex } = useAuth()
const getHubKey = useCallback((): Uint8Array | null => {
  if (!serverEventKeyHex) return null
  return hexToBytes(serverEventKeyHex)
}, [serverEventKeyHex])
```

The existing `relay.ts:281-286` already calls `decryptFromHub(event.content, hubKey)` which does XChaCha20-Poly1305 decryption — same algorithm the server uses.

### Phase 3: iOS — Decrypt Relay Events

#### Task 5: Add decrypt method to CryptoService

**File**: `apps/ios/Sources/Services/CryptoService.swift`

Add static method that calls the Rust FFI `decrypt_server_event_hex`:

```swift
/// Decrypt a server-encrypted event payload.
/// Returns nil on failure (wrong key, corrupted data).
static func decryptServerEvent(encryptedHex: String, keyHex: String) -> String? {
    #if canImport(LlamenosCore)
    return try? LlamenosCore.decryptServerEventHex(
        encryptedHex: encryptedHex,
        keyHex: keyHex
    )
    #else
    return nil  // Mock: no decryption without native library
    #endif
}
```

#### Task 6: Wire decryption into WebSocketService

**File**: `apps/ios/Sources/Services/WebSocketService.swift`

- Add `serverEventKeyHex: String?` property
- Decrypt in `emitEvent()` before broadcasting:

```swift
private func emitEvent(_ event: NostrEvent) {
    eventCount += 1

    // Decrypt event content if we have the server event key
    var typedEvent: HubEventType? = nil
    if let keyHex = serverEventKeyHex,
       let decrypted = CryptoService.decryptServerEvent(
           encryptedHex: event.content, keyHex: keyHex
       ) {
        typedEvent = parseTypedContent(decrypted)
    }

    continuationsLock.lock()
    let activeContinuations = continuations.values
    continuationsLock.unlock()
    for continuation in activeContinuations {
        continuation.yield(event)
    }
}
```

Add `parseTypedContent()` for typed event parsing from decrypted JSON.

#### Task 7: Pass key from AppState to WebSocketService

**File**: `apps/ios/Sources/App/AppState.swift`

After successful auth, set `webSocketService.serverEventKeyHex = authResponse.serverEventKeyHex`.

### Phase 4: Android — Decrypt Relay Events

#### Task 8: Add decrypt method to CryptoService

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt`

Add static method that calls the Rust JNI `decrypt_server_event_hex`:

```kotlin
fun decryptServerEvent(encryptedHex: String, keyHex: String): String? {
    return try {
        LlamenosCore.decryptServerEventHex(encryptedHex, keyHex)
    } catch (e: Exception) {
        null
    }
}
```

#### Task 9: Wire decryption into WebSocketService

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt`

- Add `serverEventKeyHex: String?` property
- Decrypt before calling `parseTypedEvent()`:

```kotlin
scope.launch {
    _events.emit(event)
    val keyHex = serverEventKeyHex
    if (keyHex != null) {
        val decrypted = cryptoService.decryptServerEvent(event.content, keyHex)
        if (decrypted != null) {
            parseTypedEvent(decrypted)?.let { typed ->
                _typedEvents.emit(typed)
            }
        }
    }
}
```

#### Task 10: Parse `serverEventKeyHex` from auth response

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiClient.kt` (or equivalent auth handler)

Store `serverEventKeyHex` from auth response and pass to WebSocketService.

### Phase 5: BDD Scenarios

#### Task 11: Shared BDD feature file

**File**: `packages/test-specs/features/core/relay-event-decryption.feature`

```gherkin
@backend
Feature: Relay Event Decryption
  All platforms must decrypt XChaCha20-Poly1305 encrypted Nostr relay events
  using the server event key from GET /api/auth/me.

  Background:
    Given a registered admin "admin1"
    And a registered volunteer "vol1" on the current shift
    And SERVER_NOSTR_SECRET is configured

  @relay @crypto
  Scenario: Server event key is available in auth response
    When "vol1" authenticates
    Then the auth response should contain "serverEventKeyHex"
    And "serverEventKeyHex" should be a 64-character hex string

  @relay @crypto
  Scenario: Relay event content is decryptable with server event key
    When an incoming call arrives from "+15551234567"
    Then the relay should receive a kind 1000 event within 5 seconds
    And the event content should be decryptable with the server event key
    And the decrypted content should contain "type" = "call:ring"

  @relay @crypto
  Scenario: Decrypted event contains expected fields
    When an incoming call arrives from "+15551234567"
    Then the relay should receive a kind 1000 event within 5 seconds
    And the decrypted content should contain a "callId" field
    And the decrypted content should NOT contain a "callerNumber" field

  @relay @crypto
  Scenario: Event with wrong key fails to decrypt gracefully
    When an incoming call arrives from "+15551234567"
    Then the relay should receive a kind 1000 event within 5 seconds
    And the event content should NOT be decryptable with a random key
```

### Phase 6: Integration Gate

`bun run test:all`

## Files to Create

| File | Purpose |
|------|---------|
| `packages/test-specs/features/core/relay-event-decryption.feature` | BDD scenarios |
| `tests/steps/backend/relay-event-decryption.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `packages/crypto/src/ffi.rs` | Add `decrypt_server_event_hex()` |
| `src/client/lib/auth.tsx` | Store `serverEventKeyHex` in state |
| `src/client/routes/__root.tsx` | Wire key into `getHubKey` callback |
| `apps/ios/Sources/Services/CryptoService.swift` | Add `decryptServerEvent()` wrapper |
| `apps/ios/Sources/Services/WebSocketService.swift` | Decrypt before emit |
| `apps/ios/Sources/App/AppState.swift` | Pass key to WebSocketService |
| `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt` | Add `decryptServerEvent()` |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt` | Decrypt before parse |

## Acceptance Criteria & Test Scenarios

- [ ] Rust FFI exports `decrypt_server_event_hex()` with roundtrip test
  → `packages/crypto/src/ffi.rs: "roundtrip server event decrypt"`
- [ ] Desktop stores `serverEventKeyHex` and passes it to relay for decryption
  → `src/client/routes/__root.tsx: getHubKey returns Uint8Array from serverEventKeyHex`
- [ ] iOS decrypts relay events before processing
  → `apps/ios/Tests/WebSocketServiceTests.swift: "decrypts event with server event key"`
- [ ] Android decrypts relay events before parsing
  → `apps/android/app/src/test/java/.../WebSocketServiceTest.kt: "decrypts event content"`
- [ ] Decryption failure does not crash — event is silently skipped
  → BDD: "Event with wrong key fails to decrypt gracefully"
- [ ] BDD scenarios pass (`bun run test:backend:bdd`)
- [ ] All platform tests pass (`bun run test:all`)

## Risk Assessment

- **Low risk**: Desktop fix — just wiring existing pieces together
- **Low risk**: Rust FFI — reuses existing XChaCha20-Poly1305 imports
- **Medium risk**: iOS/Android — depends on native FFI availability (mock fallback exists)
- **Medium risk**: BDD — requires relay + event pipeline test infrastructure

## Execution

- **Phase 1** (Rust FFI): Sequential, must complete before Phase 3-4
- **Phase 2** (Desktop): Independent of Phase 1 (uses JS crypto)
- **Phase 3** (iOS) and **Phase 4** (Android): Parallel after Phase 1
- **Phase 5** (BDD): After Phase 1
- **Phase 6**: `bun run test:all`
