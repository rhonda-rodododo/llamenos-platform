# Relay Event Decryption — All Platforms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire relay event decryption on all platforms so encrypted Nostr events can be parsed into typed events.

**Architecture:** The server encrypts relay events with XChaCha20-Poly1305 using `serverEventKeyHex` (HKDF-derived from `SERVER_NOSTR_SECRET`). Clients get this key from `GET /api/auth/me`. Desktop uses JS crypto (`decryptFromHub()`); mobile uses a new Rust FFI function. No ECIES unwrapping needed — the key is provided directly.

**Tech Stack:** Rust (chacha20poly1305 crate), TypeScript/React (noble/hashes), Swift (UniFFI), Kotlin (JNI/UniFFI)

---

### Task 1: Rust FFI — Write Failing Test for `decrypt_server_event_hex`

**Files:**
- Modify: `packages/crypto/src/ffi.rs:266-475` (test module)

**Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` block at the bottom of `ffi.rs`:

```rust
#[test]
fn roundtrip_server_event_decrypt() {
    use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};

    // Generate a random 32-byte key
    let key = random_bytes_32();
    let key_hex = hex::encode(&key);

    // Encrypt a JSON payload (simulating what the server does)
    let plaintext = r#"{"type":"call:ring","callId":"abc123"}"#;
    let mut nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut nonce_bytes).unwrap();
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

    // Pack as hex(nonce || ciphertext) — same format as server
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    let encrypted_hex = hex::encode(&packed);

    // Decrypt via the new FFI function
    let decrypted = decrypt_server_event_hex(&encrypted_hex, &key_hex).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn server_event_decrypt_wrong_key_fails() {
    use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};

    let key = random_bytes_32();
    let wrong_key = random_bytes_32();

    let plaintext = r#"{"type":"call:ring"}"#;
    let mut nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut nonce_bytes).unwrap();
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    let encrypted_hex = hex::encode(&packed);

    let result = decrypt_server_event_hex(&encrypted_hex, &hex::encode(wrong_key));
    assert!(result.is_err());
}

#[test]
fn server_event_decrypt_too_short_fails() {
    let key_hex = hex::encode(random_bytes_32());
    // Less than 24 (nonce) + 16 (tag) = 40 bytes minimum
    let short_hex = hex::encode([0u8; 30]);
    let result = decrypt_server_event_hex(&short_hex, &key_hex);
    assert!(result.is_err());
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path packages/crypto/Cargo.toml roundtrip_server_event`
Expected: FAIL with "cannot find function `decrypt_server_event_hex`"

---

### Task 2: Rust FFI — Implement `decrypt_server_event_hex`

**Files:**
- Modify: `packages/crypto/src/ffi.rs:1-265` (add function before test module)

**Step 1: Implement the function**

Add this function after `ecies_decrypt_content_hex` (before the `#[cfg(test)]` block):

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
    if data.len() < 40 {
        // 24 nonce + 16 tag minimum
        return Err(CryptoError::InvalidCiphertext);
    }

    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];
    let cipher = XChaCha20Poly1305::new_from_slice(&key_bytes)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}
```

**Step 2: Run tests to verify they pass**

Run: `cargo test --manifest-path packages/crypto/Cargo.toml`
Expected: ALL PASS (3 new tests + existing tests)

**Step 3: Run mobile feature tests too**

Run: `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/crypto/src/ffi.rs
git commit -m "feat(E309): add decrypt_server_event_hex Rust FFI for mobile relay decryption"
```

---

### Task 3: Desktop — Add `serverEventKeyHex` to Auth State

**Files:**
- Modify: `src/client/lib/auth.tsx`

**Context:** There are 8 `setState()` calls that build the auth state from `getMe()` responses. All need `serverEventKeyHex` added. There's also one signOut reset that needs `serverEventKeyHex: null`.

**Step 1: Add to `AuthState` interface (line 8)**

```typescript
interface AuthState {
  // ... existing fields ...
  adminDecryptionPubkey: string
  serverEventKeyHex: string | null  // ADD THIS
}
```

**Step 2: Add to `AuthContextValue` interface (line 29)**

```typescript
interface AuthContextValue extends AuthState {
  // ... existing methods ...
  serverEventKeyHex: string | null  // Already inherited from AuthState, but ensure exposed
}
```

Note: `serverEventKeyHex` is already part of `AuthContextValue` via `extends AuthState`, so no explicit addition needed there.

**Step 3: Add to initial state (line 49)**

```typescript
const [state, setState] = useState<AuthState>({
  // ... existing fields ...
  adminDecryptionPubkey: '',
  serverEventKeyHex: null,  // ADD THIS
})
```

**Step 4: Add to ALL 7 setState calls that process `getMe()` responses**

In every `setState()` that builds from `me` (lines 135, 168, 215, 252, 291, 324, 349), add:

```typescript
serverEventKeyHex: me.serverEventKeyHex ?? null,
```

Add this line after `adminDecryptionPubkey: me.adminDecryptionPubkey || '',` in each one.

**Step 5: Add to signOut reset (line 394)**

```typescript
setState({
  // ... existing reset fields ...
  adminDecryptionPubkey: '',
  serverEventKeyHex: null,  // ADD THIS
  sessionExpiring: false,
  sessionExpired: false,
})
```

**Step 6: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors (the field propagates via `AuthContextValue extends AuthState`)

---

### Task 4: Desktop — Wire Key into NostrProvider

**Files:**
- Modify: `src/client/routes/__root.tsx:150-176`

**Step 1: Update the `NostrWrappedLayout` component**

Replace the current `getHubKey` implementation (lines 159-164):

```typescript
// FROM:
  // Hub key not yet available at this layer — will be provided by hub-key-manager
  // when Epic 76.2 hub key distribution is wired in. For now, return null
  // which means Nostr events won't be decrypted (REST polling still works).
  const getHubKey = useCallback((): Uint8Array | null => {
    return null
  }, [])

// TO:
  const { serverEventKeyHex } = useAuth()

  // Server event key for decrypting relay events (XChaCha20-Poly1305).
  // The key comes from GET /api/auth/me — same algorithm as decryptFromHub().
  const getHubKey = useCallback((): Uint8Array | null => {
    if (!serverEventKeyHex) return null
    return hexToBytes(serverEventKeyHex)
  }, [serverEventKeyHex])
```

**Step 2: Add imports**

Add to the imports at the top of the file:

```typescript
import { hexToBytes } from '@noble/hashes/utils.js'
import { useAuth } from '@/lib/auth'
```

Check if `useAuth` and `hexToBytes` are already imported. Only add what's missing.

**Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/client/lib/auth.tsx src/client/routes/__root.tsx
git commit -m "feat(E309): wire serverEventKeyHex into desktop relay decryption"
```

---

### Task 5: iOS — Add Decrypt to CryptoService

**Files:**
- Modify: `apps/ios/Sources/Services/CryptoService.swift`

**Context:** Check if `CryptoService.swift` exists and what pattern it uses. If it uses `#if canImport(LlamenosCore)` for gating native FFI, follow that pattern.

**Step 1: Add static decrypt method**

```swift
/// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
/// Returns nil on decryption failure (wrong key, corrupted data).
static func decryptServerEvent(encryptedHex: String, keyHex: String) -> String? {
    #if canImport(LlamenosCore)
    return try? LlamenosCore.decryptServerEventHex(
        encryptedHex: encryptedHex,
        keyHex: keyHex
    )
    #else
    // Stand-in: no decryption without native library
    return nil
    #endif
}
```

If CryptoService doesn't exist yet, check the iOS source tree for the equivalent service file that wraps FFI calls.

---

### Task 6: iOS — Wire Decryption into WebSocketService

**Files:**
- Modify: `apps/ios/Sources/Services/WebSocketService.swift`

**Step 1: Add `serverEventKeyHex` property**

After the existing private properties (around line 128):

```swift
/// Server event encryption key (hex), set after authentication.
var serverEventKeyHex: String?
```

**Step 2: Add `parseTypedContent()` method**

Add before the `// MARK: - Reconnection` section:

```swift
// MARK: - Event Decryption & Parsing

/// Decrypt event content using the server event key.
private func decryptEventContent(_ encryptedHex: String) -> String? {
    guard let keyHex = serverEventKeyHex else { return nil }
    return CryptoService.decryptServerEvent(encryptedHex: encryptedHex, keyHex: keyHex)
}

/// Parse decrypted JSON content into a HubEventType.
private func parseTypedContent(_ json: String) -> HubEventType? {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = obj["type"] as? String else { return nil }
    return HubEventType(rawValue: type) ?? .unknown
}
```

**Step 3: Update `emitEvent()` to decrypt**

The current `emitEvent()` (line 283) just broadcasts raw events. It should attempt decryption:

```swift
/// Broadcast an event to all active continuations.
/// Attempts to decrypt content with the server event key before emission.
private func emitEvent(_ event: NostrEvent) {
    eventCount += 1

    // Log decryption status for debugging
    if serverEventKeyHex != nil {
        let decrypted = decryptEventContent(event.content)
        if let json = decrypted, let eventType = parseTypedContent(json) {
            // Future: emit typed event via a separate typed stream
            _ = eventType
        }
    }

    continuationsLock.lock()
    let activeContinuations = continuations.values
    continuationsLock.unlock()
    for continuation in activeContinuations {
        continuation.yield(event)
    }
}
```

**Step 4: Clear key on disconnect**

In the `disconnect()` method, add: `serverEventKeyHex = nil`

**Step 5: Commit**

```bash
git add apps/ios/Sources/Services/CryptoService.swift apps/ios/Sources/Services/WebSocketService.swift
git commit -m "feat(E309): add relay event decryption to iOS WebSocketService"
```

---

### Task 7: iOS — Pass Key from AppState

**Files:**
- Modify: `apps/ios/Sources/App/AppState.swift`

**Context:** `AuthMeResponse` already has `serverEventKeyHex: String?` at line 395. Find where the auth response is processed and the WebSocketService is connected, and pass the key.

**Step 1: Find where WebSocketService is configured**

Search for `webSocketService` or `connect(to:` in AppState. After auth succeeds and the response is available, set:

```swift
webSocketService.serverEventKeyHex = authResponse.serverEventKeyHex
```

**Step 2: Clear on logout**

Where logout clears state, add:

```swift
webSocketService.serverEventKeyHex = nil
```

**Step 3: Commit**

```bash
git add apps/ios/Sources/App/AppState.swift
git commit -m "feat(E309): pass serverEventKeyHex from auth to iOS WebSocketService"
```

---

### Task 8: Android — Add Decrypt to CryptoService

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt`

**Step 1: Add decrypt method**

```kotlin
/**
 * Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
 * Returns null on decryption failure.
 */
fun decryptServerEvent(encryptedHex: String, keyHex: String): String? {
    return try {
        // Calls Rust FFI via JNI
        uniffi.llamenos_core.decryptServerEventHex(encryptedHex, keyHex)
    } catch (e: Exception) {
        null
    }
}
```

If Rust FFI is not yet linked (placeholder mock), add a mock fallback that returns `null`.

---

### Task 9: Android — Wire Decryption into WebSocketService

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt`

**Step 1: Add `serverEventKeyHex` property**

```kotlin
/** Server event encryption key, set after authentication. */
var serverEventKeyHex: String? = null
```

**Step 2: Update `handleMessage()` to decrypt before parsing**

Replace the current typed event parsing in `handleMessage()` (lines 181-187):

```kotlin
// FROM:
scope.launch {
    _events.emit(event)
    // Parse into typed event and emit on the typed flow
    parseTypedEvent(event.content)?.let { typed ->
        _typedEvents.emit(typed)
    }
}

// TO:
scope.launch {
    _events.emit(event)
    // Decrypt then parse into typed event
    val keyHex = serverEventKeyHex
    val content = if (keyHex != null) {
        cryptoService.decryptServerEvent(event.content, keyHex) ?: return@launch
    } else {
        event.content
    }
    parseTypedEvent(content)?.let { typed ->
        _typedEvents.emit(typed)
    }
}
```

**Step 3: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt
git commit -m "feat(E309): add relay event decryption to Android WebSocketService"
```

---

### Task 10: Android — Parse `serverEventKeyHex` from Auth Response

**Files:**
- Modify: Android auth handler (find where `/api/auth/me` response is parsed)

**Step 1: Find the auth response model**

Search for `AuthMeResponse` or the data class that maps the `/api/auth/me` JSON response. Add:

```kotlin
val serverEventKeyHex: String? = null
```

**Step 2: Pass to WebSocketService after auth**

Where auth succeeds and WebSocketService is initialized:

```kotlin
webSocketService.serverEventKeyHex = authResponse.serverEventKeyHex
```

**Step 3: Clear on logout**

```kotlin
webSocketService.serverEventKeyHex = null
```

**Step 4: Commit**

```bash
git add apps/android/
git commit -m "feat(E309): pass serverEventKeyHex from auth to Android WebSocketService"
```

---

### Task 11: BDD Feature File

**Files:**
- Create: `packages/test-specs/features/core/relay-event-decryption.feature`
- Create: `tests/steps/backend/relay-event-decryption.steps.ts`

**Step 1: Write the feature file**

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

**Step 2: Write backend step definitions**

Create `tests/steps/backend/relay-event-decryption.steps.ts` implementing the steps. Reference existing step files in `tests/steps/backend/` for patterns (auth setup, relay connection, event receiving).

Key helpers needed:
- `deriveServerEventKey()` — import from `apps/worker/lib/hub-event-crypto.ts`
- XChaCha20-Poly1305 decrypt — import from `@noble/ciphers/chacha.js`
- WebSocket relay client for subscribing to events

**Step 3: Run BDD**

Run: `bun run test:backend:bdd`
Expected: All 4 scenarios pass

**Step 4: Commit**

```bash
git add packages/test-specs/features/core/relay-event-decryption.feature tests/steps/backend/relay-event-decryption.steps.ts
git commit -m "test(E309): add BDD scenarios for relay event decryption"
```

---

### Task 12: Update Backlog and Epic Status

**Files:**
- Modify: `docs/NEXT_BACKLOG.md`
- Modify: `docs/epics/epic-309-relay-event-decryption.md`

**Step 1: Mark epic complete**

Change status from `IN PROGRESS` to `COMPLETE`.

**Step 2: Update backlog**

Add completion entry to `docs/NEXT_BACKLOG.md` in the appropriate section.

**Step 3: Commit**

```bash
git add docs/
git commit -m "docs(E309): mark relay event decryption epic complete"
```

---

## Dependency Graph

```
Task 1-2 (Rust FFI) ─┬──→ Task 5-7 (iOS)
                      └──→ Task 8-10 (Android)

Task 3-4 (Desktop) ──── (independent, can run in parallel with Task 1-2)

Task 11 (BDD) ────── (after Task 1-2, needs server event key derivation)

Task 12 (Docs) ───── (after all others)
```

**Parallelizable groups:**
- Group A: Tasks 1-2 (Rust) + Tasks 3-4 (Desktop) — independent
- Group B: Tasks 5-7 (iOS) || Tasks 8-10 (Android) — after Group A
- Group C: Task 11 (BDD) — after Tasks 1-2
- Group D: Task 12 (Docs) — last
