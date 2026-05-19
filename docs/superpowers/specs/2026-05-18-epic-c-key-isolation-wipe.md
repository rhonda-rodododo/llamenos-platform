# Epic C — Key Isolation & Wipe Completeness

**Date:** 2026-05-18
**Status:** Spec
**Severity:** CRITICAL / HIGH mix — all findings are security-relevant

## Summary

Two independent audits found that device wipe and key isolation are incomplete across all platforms. Private keys leak to higher layers than intended, wipe operations leave residual sensitive data, and dead code paths create runtime crash risks. This spec defines the required behavior for each finding and the cross-platform wipe completeness matrix.

---

## Finding C04 — Incomplete Android Device Wipe (CRITICAL)

### Current Behavior

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt:207-222`

`wipeAll()` removes a hardcoded list of 9 keys:

```kotlin
val keys = listOf(
    KEY_ENCRYPTED_KEYS, KEY_HUB_URL, KEY_DEVICE_ID,
    KEY_BIOMETRIC_ENABLED, "pin-verification", "biometric-pin",
    "pin-length", "pin-lockout-attempts", "pin-lockout-until",
)
```

This list is missing:
- `KEY_SIGNING_PUBKEY` ("signing-pubkey")
- `KEY_ENCRYPTION_PUBKEY` ("encryption-pubkey")
- `KEY_FAILED_ATTEMPTS` ("failed_attempts")
- `KEY_LOCKOUT_UNTIL` ("lockout_until")
- Wake key entries: `"wake-secret"`, `"wake-pubkey"` (from `WakeKeyService`)
- Any FCM token stored in prefs
- Any future keys added to the store

Meanwhile, `wipeAllKeys()` (called on max PIN attempts) correctly uses `prefs.edit().clear().apply()` which removes everything.

### Required Behavior

`wipeAll()` must use `prefs.edit().clear().apply()` — the same approach as `wipeAllKeys()`. This ensures:
1. All current keys are removed (including wake-secret, wake-pubkey, pubkeys)
2. Any future keys added to EncryptedSharedPreferences are automatically covered
3. No hardcoded list to maintain

After clearing prefs, also delete the AndroidKeyStore master key entry to prevent key material reuse:

```kotlin
fun wipeAll() {
    prefs.edit().clear().apply()
    try {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        keyStore.deleteEntry("_androidx_security_master_key_")
    } catch (_: Exception) { /* best effort */ }
}
```

### File Changes

| File | Change |
|------|--------|
| `apps/android/.../crypto/KeystoreService.kt` | Replace `wipeAll()` body with `prefs.edit().clear().apply()` + AndroidKeyStore master key deletion |

---

## Finding C06 — 3 IPC Commands Missing from Rust Handler (CRITICAL)

### Current Behavior

**Files:**
- `apps/desktop/src/lib.rs:144-186` — `invoke_handler` registration
- `src/client/lib/platform.ts:128,1094,1109` — frontend calls
- `tests/mocks/tauri-core.ts:754,821,832` — test mock implementations

Three IPC commands are called from the frontend TypeScript but NOT registered in the Rust `invoke_handler`:

| Command | Frontend location | Purpose |
|---------|------------------|---------|
| `device_import_and_load` | `platform.ts:128-137` | Import known Ed25519 seed as device keys (test support) |
| `generate_backup_from_state` | `platform.ts:1094-1103` | Generate encrypted backup from CryptoState |
| `generate_ephemeral_ed25519` | `platform.ts:1109-1115` | Generate ephemeral Ed25519 keypair for admin-created users |

These calls will throw a Tauri `command not found` error at runtime. The test mock (`tauri-core.ts`) implements them in JS, so tests pass — but the production build crashes when these code paths are exercised.

### Dead Code Analysis

| Command | Needed? | Reasoning |
|---------|---------|-----------|
| `device_import_and_load` | **REMOVE** — test-only | Only used for Playwright tests to import known key material. The test mock handles this. Production never imports raw seeds. Remove the frontend function; keep the mock. |
| `generate_backup_from_state` | **IMPLEMENT** — production feature | Recovery backup is a planned feature. The frontend function signature is correct. Implement in Rust: re-encrypt the device key blob with a recovery key. |
| `generate_ephemeral_ed25519` | **IMPLEMENT** — production feature | Admin user creation flow requires generating an ephemeral keypair on the admin's device. Implement in Rust: generate Ed25519 keypair, return pubkey + seed (seed is used once for initial registration, then discarded). |

### Required Behavior

1. **`device_import_and_load`**: Remove from `platform.ts`. Keep the mock in `tauri-core.ts` for test support. Mark `legacyImportNsec` as test-only too.

2. **`generate_backup_from_state`**: Implement as a Rust `#[tauri::command]`:
   - Takes: recovery key (pubkey hex), PIN (to verify authorization)
   - Returns: HPKE-sealed device key blob encrypted to the recovery key
   - Device secrets stay in Rust — only the encrypted output crosses IPC

3. **`generate_ephemeral_ed25519`**: Implement as a Rust `#[tauri::command]`:
   - Takes: nothing
   - Returns: `{ signingPubkeyHex, seedHex }` — the seed is ephemeral and used once
   - NOTE: The seed must cross IPC because the admin sends it to the server for the new user's initial registration. This is acceptable because the seed is ephemeral (not the admin's device key).

### File Changes

| File | Change |
|------|--------|
| `apps/desktop/src/crypto.rs` | Add `generate_backup_from_state` and `generate_ephemeral_ed25519` commands |
| `apps/desktop/src/lib.rs` | Register both new commands in `invoke_handler` |
| `src/client/lib/platform.ts` | Remove `deviceImportAndLoad` function. Update `generateBackupFromState` and `generateEphemeralKeypair` types if needed |
| `tests/mocks/tauri-core.ts` | Keep `device_import_and_load` mock. Update other mocks to match Rust signatures |

---

## Finding H16 — Recovery Group Private Key Exposed to Webview (HIGH)

### Current Behavior

**File:** `apps/desktop/src/crypto.rs:750-761`

```rust
pub fn recovery_group_generate_keypair() -> Result<serde_json::Value, String> {
    let secret = StaticSecret::random_from_rng(rand::rngs::OsRng);
    let public = PublicKey::from(&secret);
    Ok(serde_json::json!({
        "publicKeyHex": hex::encode(public.as_bytes()),
        "privateKeyHex": hex::encode(secret.as_bytes()),  // ← LEAKED TO WEBVIEW
    }))
}
```

The recovery group X25519 private key is serialized as hex and returned to the webview JS. The caller (`platform.ts:1208-1213`) receives the full `RecoveryGroupKeypair` with `privateKeyHex` in JavaScript memory.

The private key then flows to `shamirSplit` (also via IPC), which at least keeps the splitting in Rust. But the private key transits through JS between these two calls.

### Required Behavior

The recovery group keypair generation and Shamir splitting must be a single atomic Rust operation. The private key must NEVER cross the IPC boundary.

New command: `recovery_group_generate_and_split`:
- Takes: `total: u8`, `threshold: u8`
- Returns: `{ publicKeyHex, shares: [{x, y}], commitments: [hex] }`
- Internally: generate keypair → split private key → zeroize private key → return

Remove the standalone `recovery_group_generate_keypair` command that returns the private key.

### File Changes

| File | Change |
|------|--------|
| `apps/desktop/src/crypto.rs` | Replace `recovery_group_generate_keypair` with `recovery_group_generate_and_split` that keeps the private key in Rust |
| `apps/desktop/src/lib.rs` | Update `invoke_handler` registration |
| `src/client/lib/platform.ts` | Replace `recoveryGroupGenerateKeypair()` with `recoveryGroupGenerateAndSplit(total, threshold)` that returns shares directly |
| `tests/mocks/tauri-core.ts` | Update mock to match new function signature |

**Note:** iOS and Android already handle this better — `mobileRecoveryGroupGenerateKeypair()` returns a handle (opaque pointer) on Android, and the Swift version's keypair stays within the CryptoService scope. However, both platforms should also be audited to confirm the private key doesn't leak into view model / UI layer code.

---

## Finding H17 — Device Wipe Leaves Stronghold Vault on Disk (HIGH)

### Current Behavior

**File:** `src/client/lib/relay/connection.ts:334-355`

The `handleDeviceWipe` method in the relay connection:
1. Calls `wipeKey()` from key-manager (clears in-memory state)
2. Clears `localStorage` and `sessionStorage`
3. Clears IndexedDB

But the Stronghold vault file (`vault.hold` in the app data directory) persists on disk. This file contains the PIN-encrypted device key blob. While it's encrypted with PBKDF2-SHA256 (600K iterations), leaving it on disk after a wipe command means an attacker with disk access gets unlimited offline brute-force attempts against the PIN.

**File:** `src/client/lib/platform.ts:576-582`

The vault path is `${appDataDir()}/vault.hold`. The `clearStoredKey` function only deletes the key from the Stronghold store — it doesn't delete the vault file itself.

### Required Behavior

The wipe sequence must:
1. Clear all Stronghold store entries
2. Delete the Stronghold vault file from disk (`std::fs::remove_file`)
3. Clear Tauri Store (`plugin:store`) entries if any
4. Zeroize CryptoState in Rust
5. Clear web storage (localStorage, sessionStorage, IndexedDB)

Implement a `wipe_device` IPC command in Rust that handles steps 1-4 atomically. The frontend calls this single command, then handles step 5 (web storage).

### File Changes

| File | Change |
|------|--------|
| `apps/desktop/src/crypto.rs` | Add `wipe_device` command: lock CryptoState + delete vault.hold file + clear Tauri Store |
| `apps/desktop/src/lib.rs` | Register `wipe_device` in `invoke_handler` |
| `src/client/lib/platform.ts` | Add `wipeDevice()` function that calls `wipe_device` IPC |
| `src/client/lib/relay/connection.ts` | `handleDeviceWipe` calls `wipeDevice()` instead of `wipeKey()` |

---

## Finding H21 — localStorage Fallback for Device Keys (HIGH)

### Current Behavior

**File:** `src/client/lib/platform.ts:618-631`

```typescript
// Test/browser fallback — localStorage
return {
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(`llamenos:${key}`)
    ...
  },
  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(`llamenos:${key}`, JSON.stringify(value))
  },
  ...
}
```

When `useTauri` is false (non-Tauri context), `getSecureStore()` returns a localStorage-backed implementation. localStorage is:
- Readable by any JS in the webview (XSS = full key compromise)
- Stored as plaintext JSON on disk
- Not encrypted at rest

The `useTauri` check at line 16 includes `import.meta.env.PLAYWRIGHT_TEST`, so test builds use the Tauri IPC mock. But if Stronghold loading fails at runtime (corrupt vault, missing plugin), the code falls through to localStorage with no warning.

### Required Behavior

Remove the localStorage fallback entirely. If Stronghold is unavailable, `getSecureStore()` must throw:

```typescript
throw new Error('Secure storage unavailable — Stronghold plugin not loaded')
```

There is no safe fallback for key storage. Failing hard is the correct behavior — it surfaces the issue immediately rather than silently degrading security.

The test mock path (`PLAYWRIGHT_TEST`) should remain, but it should be the only non-Stronghold path, and it should be clearly separated (checked first, before attempting Stronghold).

### File Changes

| File | Change |
|------|--------|
| `src/client/lib/platform.ts` | Remove localStorage fallback from `getSecureStore()`. Add explicit throw for non-Tauri, non-test contexts |

---

## Finding H27 — iOS Wipe Doesn't Clear All Stores (HIGH)

### Current Behavior

**File:** `apps/ios/Sources/App/AppState.swift:334-353`

```swift
func handleDeviceWipe(reason: String) {
    keychainService.wipeAll()
    cryptoService.clearHubKeys()
    cryptoService.lock()
    if let bundleId = Bundle.main.bundleIdentifier {
        UserDefaults.standard.removePersistentDomain(forName: bundleId)
    }
    deviceWipeReason = reason
    isDeviceWiped = true
    webSocketService.disconnect()
}
```

**File:** `apps/ios/Sources/Services/KeychainService.swift:159-174`

```swift
func wipeAll() {
    let keys = [
        KeychainKey.encryptedKeys, KeychainKey.hubURL, KeychainKey.deviceID,
        KeychainKey.biometricEnabled, KeychainKey.pinHash, KeychainKey.biometricPIN,
        KeychainKey.pinLength, KeychainKey.pinLockoutAttempts, KeychainKey.pinLockoutUntil,
    ]
    for key in keys { delete(key: key) }
}
```

Missing from wipe:
- **Core Data stores** — if any SQLite databases exist in the app container
- **Temp directory** (`NSTemporaryDirectory()`) — may contain downloaded media, decrypted files
- **Caches directory** — cached API responses, images
- **Crash logs** — may contain sensitive stack traces with key material addresses
- **Offline queue files** — `OfflineQueue` may persist queued operations to disk
- **Transcription files** — `TranscriptionService` may have cached audio/text
- **Any future Keychain keys** — hardcoded list problem (same as C04 on Android)

### Required Behavior

1. **KeychainService.wipeAll()** — Use `deleteAll()` (which already exists and deletes ALL items for the service) instead of the hardcoded key list. The `deleteAll()` method at line 177-183 does exactly what's needed.

2. **AppState.handleDeviceWipe()** — comprehensive wipe:
   ```
   a. keychainService.deleteAll()           // All Keychain items for this service
   b. cryptoService.clearHubKeys()          // Rust hub keys
   c. cryptoService.lock()                  // Zeroize device secrets in Rust
   d. UserDefaults.removePersistentDomain   // App preferences
   e. Clear temp directory                  // NSTemporaryDirectory contents
   f. Clear caches directory                // Library/Caches contents
   g. Delete Core Data SQLite files         // If any exist
   h. offlineQueue.clear()                  // Queued operations
   i. transcriptionService.cleanup()        // Any cached audio/text
   j. wakeKeyService.cleanup()              // Wake key state
   ```

### File Changes

| File | Change |
|------|--------|
| `apps/ios/Sources/Services/KeychainService.swift` | `wipeAll()` should call `deleteAll()` instead of iterating a hardcoded list |
| `apps/ios/Sources/App/AppState.swift` | Expand `handleDeviceWipe` to clear temp dir, caches dir, Core Data, offline queue, transcription cache |

---

## Android Wake Key Without Hardware Binding (HIGH)

### Current Behavior

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt:69-95`

The wake key secret is stored as a hex string in `KeystoreService` (EncryptedSharedPreferences), NOT directly in AndroidKeyStore with hardware binding. While EncryptedSharedPreferences uses a MasterKey backed by AndroidKeyStore, the wake secret itself is a software-managed value.

Additionally, the fallback path (lines 83-93) generates random bytes that are NOT valid cryptographic keys:

```kotlin
// Placeholder: generate random keypair bytes
val random = SecureRandom()
val secretBytes = ByteArray(32)
random.nextBytes(secretBytes)
val pubBytes = ByteArray(32)
random.nextBytes(pubBytes)  // ← NOT derived from secretBytes!
```

This generates a public key that has no relationship to the secret key, making HPKE decryption impossible.

### Required Behavior

1. **Remove the plaintext fallback entirely.** If the native library isn't loaded, `getOrCreateWakePublicKey()` must throw. A non-functional key is worse than no key (silent failure).

2. **Wake key stays in EncryptedSharedPreferences** (acceptable for now) — the MasterKey provides hardware-backed encryption. Moving the wake key into AndroidKeyStore directly would require a different key type (asymmetric key generation in hardware), which is a larger change. The current EncryptedSharedPreferences approach with StrongBox-backed MasterKey is adequate.

3. **Fail hard if native lib unavailable:**
   ```kotlin
   fun getOrCreateWakePublicKey(): String {
       check(nativeLibLoaded) { "Native crypto library required for wake key generation" }
       // ... existing native path
   }
   ```

### File Changes

| File | Change |
|------|--------|
| `apps/android/.../crypto/WakeKeyService.kt` | Remove lines 82-94 (placeholder fallback). Add `check(nativeLibLoaded)` guard. |

---

## Android Ephemeral Secret Key in Non-Zeroizable JVM String (HIGH)

### Current Behavior

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt:74-78`

```kotlin
val secretKeyHex = org.llamenos.core.mobileRandomBytesHex()  // Returns String
val publicKeyHex = org.llamenos.core.getPublicKey(secretKeyHex)
keystoreService.store(KEY_WAKE_SECRET, secretKeyHex)  // Stored as String
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt:528-537`

```kotlin
fun generateEphemeralKeypair(): Pair<String, String> {
    val secretKeyHex = org.llamenos.core.mobileRandomBytesHex()  // Returns String
    val publicKeyHex = org.llamenos.core.getPublicKey(secretKeyHex)
    return Pair(secretKeyHex, publicKeyHex)  // Secret in JVM String
}
```

JVM `String` objects are immutable and cannot be explicitly zeroed. They persist in the heap until GC collects them, and even then the memory may not be cleared. Secret key material in JVM Strings is a known security anti-pattern.

### Required Behavior

This is a deeper issue that involves the UniFFI binding layer. The Rust FFI currently returns `String` for hex-encoded secret material. The fix has two levels:

**Level 1 (Application layer — this epic):**
- Minimize the lifetime of secret Strings in Kotlin
- After storing the wake secret in KeystoreService, null the local reference
- For ephemeral keypairs used in device linking: keep the return as `Pair<String, String>` but document that callers must null their reference after use

**Level 2 (FFI layer — separate epic):**
- Add `ByteArray`-returning FFI functions (`mobileRandomBytes() -> ByteArray`)
- Use `ByteArray` throughout the Kotlin crypto layer (can be explicitly filled with zeros)
- Requires changes to `packages/crypto/src/mobile_ffi.rs` and UniFFI bindings

This spec covers Level 1. Level 2 should be tracked as a follow-up.

### File Changes

| File | Change |
|------|--------|
| `apps/android/.../crypto/WakeKeyService.kt` | Add comment documenting String limitation; null local refs after store |
| `apps/android/.../crypto/CryptoService.kt` | Document ephemeral key String lifetime limitation |
| (Follow-up) `packages/crypto/src/mobile_ffi.rs` | Add ByteArray-returning variants of secret-producing functions |

---

## Wipe Completeness Matrix

For each platform, every storage location and whether the current wipe covers it.

### Desktop (Tauri)

| Storage Location | Type | Contains | Current Wipe | Status |
|-----------------|------|----------|-------------|--------|
| Rust CryptoState (memory) | In-memory | Device secrets, hub keys, server event keys | `lockCrypto()` zeroizes | **OK** |
| Stronghold vault (`vault.hold`) | File on disk | PIN-encrypted device key blob | Store entry deleted, **file persists** | **MISSING (H17)** |
| Tauri Store (plugin:store) | File on disk | App preferences | Not cleared in wipe | **MISSING** |
| localStorage | Browser storage | Session data, preferences | `localStorage.clear()` | **OK** |
| sessionStorage | Browser storage | Transient session data | `sessionStorage.clear()` | **OK** |
| IndexedDB | Browser storage | Cached data | Databases deleted | **OK** |
| WebCrypto keys | Browser memory | AES-GCM content keys (transient) | Lost on page reload | **OK** (ephemeral) |

### iOS

| Storage Location | Type | Contains | Current Wipe | Status |
|-----------------|------|----------|-------------|--------|
| Rust CryptoState (memory) | In-memory | Device secrets, hub keys, server event keys | `cryptoService.lock()` + `clearHubKeys()` | **OK** |
| iOS Keychain | Keychain Services | Encrypted device keys, hub URL, device ID, PIN data, biometric PIN | `wipeAll()` — **hardcoded key list** | **PARTIAL (H27)** |
| UserDefaults | Plist file | App preferences, settings | `removePersistentDomain` | **OK** |
| Core Data / SQLite | Database files | Potentially cached entity data | **Not cleared** | **MISSING (H27)** |
| Temp directory | Files | Downloaded media, decrypted files | **Not cleared** | **MISSING (H27)** |
| Caches directory | Files | API response cache, images | **Not cleared** | **MISSING (H27)** |
| Crash logs | Files | Stack traces (may contain addresses) | **Not cleared** | **MISSING (H27)** |
| OfflineQueue | Files/memory | Queued API operations | Not cleared in wipe | **MISSING (H27)** |
| TranscriptionService | Files/memory | Audio/text cache | Not cleared in wipe | **MISSING (H27)** |

### Android

| Storage Location | Type | Contains | Current Wipe | Status |
|-----------------|------|----------|-------------|--------|
| Rust CryptoState (memory) | In-memory | Device secrets, hub keys, server event keys | `mobileLock()` zeroizes | **OK** |
| EncryptedSharedPreferences | File (encrypted) | Device keys, wake keys, pubkeys, hub URL, PIN state | `wipeAll()` — **hardcoded key list** | **PARTIAL (C04)** |
| AndroidKeyStore master key | Hardware/TEE | AES-256-GCM master key for EncryptedSharedPreferences | **Not deleted** | **MISSING (C04)** |
| JVM String references | Heap memory | Ephemeral secret keys (String, not zeroizable) | GC-dependent | **WEAK** |
| SharedPreferences (unencrypted) | File | Any non-sensitive prefs | Not explicitly cleared | **CHECK** |
| Room/SQLite databases | Database files | Cached data if any | Not cleared | **CHECK** |
| App cache directory | Files | HTTP cache, images | Not cleared | **MISSING** |
| App files directory | Files | Downloaded content | Not cleared | **MISSING** |

---

## Key Isolation Audit

For each platform, trace where private key bytes exist at each layer.

### Desktop Key Isolation

```
Layer 1: Rust (apps/desktop/src/crypto.rs)
├── CryptoState.secrets: DeviceSecrets (Ed25519 seed + X25519 seed)
│   ├── Created: device_generate_and_load, unlock_with_pin
│   ├── Used: ed25519_sign_from_state, hpke_open_from_state, etc.
│   ├── Zeroized: lock() → Option::take() → Drop → Zeroize
│   └── Status: ✅ CONTAINED IN RUST
│
├── CryptoState.hub_key: Vec<u8> (32-byte AES key)
│   ├── Set via: set_hub_key IPC (hex from JS → Rust)
│   ├── Used: decrypt_hub_event, encrypt/decrypt_hub_field
│   └── Status: ✅ CONTAINED IN RUST (H2 hardening)
│
├── CryptoState.server_event_keys: Vec<(u64, Vec<u8>)>
│   └── Status: ✅ CONTAINED IN RUST
│
├── recovery_group_generate_keypair → privateKeyHex
│   └── Status: ❌ LEAKS TO WEBVIEW (H16)
│
├── encryption_secret_hex() → String
│   ├── Used by hpke_open_from_state internally
│   └── Status: ⚠️ Secret as hex String in Rust — stays in Rust but not zeroized on use
│
Layer 2: IPC boundary (Tauri invoke)
├── device_generate_and_load → encrypted blob (safe)
├── get_device_pubkeys → public keys only (safe)
├── recovery_group_generate_keypair → privateKeyHex ❌ (H16)
└── All other commands → results/public data only (safe)

Layer 3: JavaScript (src/client/lib/platform.ts)
├── RecoveryGroupKeypair.privateKeyHex ❌ (H16)
├── PUK seedHex — transit through JS for storage ⚠️
│   (Seed is wrapped in HPKE for storage, but transits JS briefly)
├── localStorage fallback for encrypted device keys ❌ (H21)
└── All other crypto results: public keys, ciphertexts, signatures (safe)
```

### iOS Key Isolation

```
Layer 1: Rust via UniFFI (packages/crypto mobile FFI)
├── Mobile CryptoState: device secrets, hub keys, server event keys
│   └── Status: ✅ CONTAINED IN RUST
│
├── mobileRecoveryGroupGenerateKeypair → RecoveryGroupKeypair
│   └── Returns publicKeyHex + handle (opaque) on Android
│   └── On iOS: returns full keypair struct — needs audit of what Swift sees
│   └── Status: ⚠️ NEEDS VERIFICATION
│
Layer 2: Swift (apps/ios/Sources/Services/CryptoService.swift)
├── signingPubkeyHex, encryptionPubkeyHex, deviceId — public only ✅
├── All HPKE/symmetric ops delegate to Rust FFI — secrets stay in Rust ✅
├── generateEphemeralKeypair() → (secretHex, publicHex) ⚠️
│   └── Ephemeral secp256k1 secret transits Swift for device linking
│   └── Acceptable: ephemeral and short-lived
└── No private key storage in Swift ✅

Layer 3: SwiftUI Views/ViewModels
└── Only receive public keys and operation results ✅
```

### Android Key Isolation

```
Layer 1: Rust via JNI/UniFFI (packages/crypto mobile FFI)
├── Mobile CryptoState: device secrets, hub keys, server event keys
│   └── Status: ✅ CONTAINED IN RUST
│
Layer 2: Kotlin (apps/android/.../crypto/CryptoService.kt)
├── signingPubkeyHex, encryptionPubkeyHex, deviceId — public only ✅
├── All HPKE/symmetric ops delegate to Rust FFI ✅
├── generateEphemeralKeypair() → Pair<String, String>
│   └── Secret key in JVM String (not zeroizable) ⚠️
├── WakeKeyService.getOrCreateWakePublicKey()
│   └── secretKeyHex in JVM String, stored to EncryptedSharedPreferences ⚠️
│   └── Plaintext fallback generates invalid keys ❌
└── testHubKeys: ConcurrentHashMap — test-only fallback ✅ (only when native lib unavailable)

Layer 3: Compose UI / ViewModels
└── Only receive public keys and operation results ✅
```

---

## Cross-Platform Consistency Requirements

All platforms must meet the same standard for wipe completeness:

1. **Complete crypto zeroization**: All in-memory key material (device secrets, hub keys, server event keys) must be zeroized. All platforms currently do this via Rust `lock()`.

2. **Complete persistent storage erasure**: Every storage mechanism that could contain sensitive data must be cleared. No hardcoded key lists — use bulk-clear operations (`prefs.clear()`, `deleteAll()`, `fs::remove_file`).

3. **No silent degradation**: If a storage mechanism is unavailable during wipe, log a warning but don't skip. If secure storage is unavailable during operation, fail hard — never fall back to insecure storage.

4. **File system cleanup**: Temp files, caches, and database files must be deleted. Key material may leak into these through crash dumps, swap, or application logic.

5. **Audit log**: Log the wipe event to the server BEFORE destroying local state (best effort — if offline, the wipe still proceeds).

---

## Test Plan

### Desktop

1. **Stronghold deletion test**: After `wipe_device` IPC call, verify `vault.hold` file does not exist at the expected path
2. **CryptoState zeroization**: After wipe, all stateful IPC commands must return "locked" errors
3. **localStorage removal**: After wipe, `localStorage.getItem('llamenos:*')` returns null for all keys
4. **No fallback test**: With Stronghold plugin intentionally failing, verify `getSecureStore()` throws (not falls back to localStorage)
5. **Recovery group isolation**: Verify `recovery_group_generate_and_split` IPC command does NOT return `privateKeyHex` in the response

### iOS

1. **Keychain completeness**: After `handleDeviceWipe`, `SecItemCopyMatching` with service filter returns `errSecItemNotFound` for ALL items
2. **File system cleanup**: After wipe, temp directory and caches directory are empty
3. **UserDefaults cleared**: After wipe, `UserDefaults.standard.dictionaryRepresentation()` contains no app keys
4. **Rust state locked**: After wipe, `cryptoService.isUnlocked` returns false
5. **XCUITest**: Automated wipe test verifying DeviceWipeReceiptView appears and no data survives

### Android

1. **EncryptedSharedPreferences cleared**: After `wipeAll()`, `prefs.all` is empty
2. **AndroidKeyStore entry deleted**: After wipe, `keyStore.containsAlias("_androidx_security_master_key_")` returns false
3. **Wake key removed**: After wipe, `keystoreService.retrieve("wake-secret")` returns null
4. **Native lib required**: `getOrCreateWakePublicKey()` throws when native lib not loaded (no silent fallback)
5. **Instrumented test**: Full wipe sequence on device/emulator, verify no data survives in app sandbox

### Cross-Platform Verification

1. **Filesystem inspection**: After wipe on each platform, enumerate all files in the app data directory and verify none contain key material
2. **Memory inspection** (debug builds): After wipe, dump process memory and grep for known key patterns (hex pubkeys as canaries)
3. **Re-onboarding test**: After wipe, verify the app enters the unauthenticated state and requires full re-onboarding (no cached identity survives)

---

## Implementation Order

Findings are ordered by severity and dependency:

1. **H21** — Remove localStorage fallback (simplest, highest risk/effort ratio)
2. **C04** — Fix Android wipe completeness
3. **H27** — Fix iOS wipe completeness
4. **H17** — Desktop Stronghold vault deletion + wipe_device command
5. **C06** — Implement missing IPC commands / remove dead code
6. **H16** — Recovery group key isolation (atomic generate+split)
7. **Wake key hardening** — Remove Android fallback
8. **JVM String zeroization** — Document limitations, plan Level 2 FFI changes
