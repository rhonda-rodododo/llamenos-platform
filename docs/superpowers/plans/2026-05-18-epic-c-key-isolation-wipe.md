# Epic C — Key Isolation & Wipe Completeness

**Epic**: Security Audit Fix — Key Isolation & Wipe Completeness
**Date**: 2026-05-18
**Findings**: H16, H17, H21, C04, C06, H27, plus Android wake key and ephemeral key issues
**Platforms**: Desktop (Tauri), iOS (SwiftUI), Android (Kotlin/Compose)

---

## Executive Summary

Key isolation violations and incomplete wipe implementations across all three platforms. The most critical issues:

1. **Recovery group private key enters webview** (H16) — `shamirCombine` returns reconstructed secret as hex to JS; `recovery_group_generate_keypair` returns private key to JS
2. **Stronghold vault file persists after wipe** (H17) — only the key entry is removed, not the `vault.hold` file
3. **localStorage fallback stores encrypted device keys in plaintext** (H21) — XSS vector for key extraction
4. **4 IPC commands missing from Rust** (C06) — `device_import_and_load`, `generate_backup_from_state`, `generate_ephemeral_ed25519`, `legacy_import_nsec`
5. **iOS wipe misses 4+ storage locations** (H27) — offline queue, crash logs, URL cache, cookies not cleared on panic/remote wipe
6. **Android wipe uses hardcoded key list** (C04) — misses wake keys, doesn't lock crypto state

---

## Phase 1: Desktop Key Isolation (H16, H17, H21, C06)

### Task 1.1 — H16: Move recovery group combine+decrypt to Rust-only

**Problem**: `shamirCombine()` returns the reconstructed recovery group private key as a hex string to the webview (`platform.ts:1184-1189`). `recovery_group_generate_keypair` also returns `privateKeyHex` to JS (`platform.ts:1207-1213`, `crypto.rs:750-761`).

**Current flow** (`account-recovery-flow.tsx:99-117`):
1. Frontend decrypts each contributed share via `hpkeOpenFromState` (share hex returns to JS)
2. Frontend calls `shamirCombine(shares)` → reconstructed private key returns to JS as hex
3. Private key is in webview memory

**Fix — New combined IPC command**: `recovery_group_reconstruct_from_shares`

**Files to modify**:
- `apps/desktop/src/crypto.rs` — Add new command that:
  1. Accepts array of HPKE-encrypted share envelopes + label
  2. Decrypts each share using device key from CryptoState (HPKE open)
  3. Parses x/y from each decrypted share
  4. Runs Shamir combine internally
  5. Stores reconstructed key in a new `recovery_group_key: Mutex<Option<Vec<u8>>>` field on CryptoState
  6. Returns only success/failure boolean — NO key material to JS
- `apps/desktop/src/crypto.rs` — Add `recovery_group_decrypt` command:
  1. Uses stored recovery group key to decrypt the target payload
  2. Returns only the plaintext result, not the key
  3. Zeroizes the recovery group key after use
- `apps/desktop/src/lib.rs` — Register both new commands in `generate_handler![]`
- `src/client/lib/platform.ts` — Update `shamirCombine` to call new IPC, remove hex return
- `src/client/components/account-recovery-flow.tsx` — Refactor to use new combined IPC instead of per-share decrypt + combine

**Also fix**: `recovery_group_generate_keypair` must NOT return `privateKeyHex` to JS. Refactor to:
1. Generate keypair in Rust
2. Immediately split via Shamir internally
3. Return `{ publicKeyHex, shares, commitments }` — private key never leaves Rust
- `apps/desktop/src/crypto.rs` — New `recovery_group_create` command combining generate + split
- `src/client/lib/platform.ts` — Update `recoveryGroupGenerateKeypair` signature
- Frontend components that create recovery groups — update to use new API

**Tests**:
- **Rust unit test**: `test_recovery_group_reconstruct_no_key_in_return` — verify return value contains no key material
- **Rust unit test**: `test_recovery_group_key_zeroized_after_decrypt` — verify CryptoState field is None after use
- **Playwright E2E**: `test: recovery group decrypt does not expose private key to webview` — mock IPC layer asserts no hex key in any IPC response

### Task 1.2 — H17: Stronghold vault file deletion on wipe

**Problem**: `wipeKey()` → `platformClearStoredKey()` → `store.delete(STORE_KEY)` only removes the key entry from the Stronghold vault. The `vault.hold` file remains on disk containing (now empty) encrypted vault structure.

**Current flow** (`platform.ts:608-615`):
```typescript
async delete(key: string): Promise<void> {
  await store.remove(key)
  await stronghold.save()
}
```

**Fix — Add `wipe_keys` IPC command in Rust**:

**Files to modify**:
- `apps/desktop/src/crypto.rs` — Add `wipe_keys` command:
  1. Lock CryptoState (zeroize all secrets)
  2. Get app data dir via Tauri API
  3. `std::fs::remove_file(vault_path)` to delete `vault.hold`
  4. Return success/failure
- `apps/desktop/src/lib.rs` — Register `wipe_keys` in `generate_handler![]`
- `src/client/lib/platform.ts` — Add `wipeVaultFile()` export calling `wipe_keys` IPC
- `src/client/lib/key-manager.ts:193-196` — Update `wipeKey()` to call `wipeVaultFile()` instead of just `platformClearStoredKey()`
- `src/client/lib/panic-wipe.ts:51-55` — Replace `clearStoredKey()` with `wipeVaultFile()`

**Tests**:
- **Rust unit test**: `test_wipe_keys_removes_vault_file` — create temp vault file, call wipe, assert file doesn't exist
- **Playwright E2E**: `test: device wipe clears Stronghold vault file` — trigger wipe, verify vault file absent (via IPC to check `fs::metadata`)

### Task 1.3 — H21: Remove localStorage fallback for device keys

**Problem**: `getSecureStore()` in `platform.ts:618-632` falls back to localStorage when not running in Tauri. Encrypted device keys stored in plaintext localStorage are extractable via XSS.

**Current code** (`platform.ts:618-632`):
```typescript
// Test/browser fallback — localStorage
return {
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(`llamenos:${key}`)
    ...
  },
  ...
}
```

**Fix — Hard fail when Stronghold unavailable**:

**Files to modify**:
- `src/client/lib/platform.ts:618-632` — Replace localStorage fallback with:
  ```typescript
  throw new Error('Secure storage unavailable — Tauri Stronghold required for device key storage')
  ```
- `tests/mocks/tauri-ipc.ts` (or equivalent) — Ensure Playwright test mock provides a proper in-memory secure store implementation that does NOT use localStorage. The mock should use a `Map<string, unknown>` held in closure scope.

**Verify**: Search for any other `localStorage.getItem('llamenos:')` patterns that store key material. The key-manager's `getLockDelay()` uses localStorage for a non-secret preference — that's fine.

**Tests**:
- **Playwright E2E**: `test: no localStorage fallback for device keys` — assert `localStorage` contains no `llamenos:` prefixed keys after full app lifecycle
- **Unit test**: `getSecureStore()` throws when `useTauri` is false

### Task 1.4 — C06: Implement missing IPC commands

**Problem**: 4 IPC commands are called from `platform.ts` but not registered in `generate_handler![]` in `lib.rs`:
1. `device_import_and_load` (platform.ts:134)
2. `legacy_import_nsec` (platform.ts:150)
3. `generate_backup_from_state` (platform.ts:1100)
4. `generate_ephemeral_ed25519` (platform.ts:1111)

**Files to modify**:
- `apps/desktop/src/crypto.rs` — Implement all 4 commands:

  **`device_import_and_load`** (HIGH priority — used by tests and key import flow):
  - Takes `signing_secret_hex: String, pin: String, device_id: String`
  - Derives X25519 encryption seed from signing seed via HKDF
  - Creates DeviceSecrets, encrypts with PIN, loads into CryptoState
  - Returns `EncryptedDeviceKeys` (encrypted blob + public DeviceKeyState)

  **`generate_ephemeral_ed25519`** (HIGH priority — admin user onboarding):
  - Takes no arguments
  - Generates random 32-byte Ed25519 seed
  - Derives public key
  - Returns `{ signingPubkeyHex, seedHex }` — NOTE: seed intentionally returned (ephemeral, for provisioning)

  **`generate_backup_from_state`** (HIGH priority — backup/recovery flow):
  - Takes `recovery_key: String`
  - Reads device secrets from CryptoState
  - Encrypts with recovery key (XChaCha20-Poly1305 or HPKE)
  - Returns encrypted backup blob as hex

  **`legacy_import_nsec`** (MEDIUM priority — v2→v3 migration, deprecated):
  - Takes `nsec_hex: String, pin: String, device_id: String`
  - Converts secp256k1 nsec to Ed25519 seed (or wraps as-is for compatibility)
  - Encrypts with PIN, loads into CryptoState
  - Returns `EncryptedDeviceKeys`

- `apps/desktop/src/lib.rs` — Register all 4 in `generate_handler![]`

**Tests**:
- **Rust unit tests** for each command:
  - `test_device_import_and_load_round_trip` — import seed, verify pubkeys match expected
  - `test_generate_ephemeral_ed25519_returns_valid_keypair` — verify seed→pubkey derivation
  - `test_generate_backup_from_state_encrypts_secrets` — verify backup blob is not plaintext
  - `test_legacy_import_nsec_loads_state` — verify CryptoState populated after import

### Task 1.5 — Desktop wipe completeness audit

**Current wipe coverage on desktop**:

| Storage Location | Panic Wipe | Logout | PIN Wipe | Fix Needed |
|-----------------|------------|--------|----------|------------|
| Rust CryptoState (secrets) | ✅ via `keyManager.wipeKey()` | ✅ via `lockCrypto()` | ✅ via Rust | — |
| Stronghold vault entry | ✅ via `clearStoredKey()` | ❌ (intentional) | ✅ via platform | — |
| Stronghold vault FILE | ❌ | ❌ | ❌ | **H17** |
| localStorage | ✅ `localStorage.clear()` | Partial (drafts only) | ❌ | **H21** (remove fallback) |
| sessionStorage | ✅ `sessionStorage.clear()` | ✅ `removeItem(token)` | ❌ | — |
| IndexedDB | ✅ (async) | ❌ | ❌ | — |
| Tauri Store (settings.json) | ✅ `store.clear()` | ❌ | ❌ | — |
| Tauri Store (drafts.json) | ✅ `store.clear()` | ❌ | ❌ | — |
| Hub key (Rust) | ✅ via `lock()` | ✅ via `lock()` | ✅ | — |
| Server event keys (Rust) | ✅ via `lock()` | ✅ via `lock()` | ✅ | — |
| Recovery group key (Rust) | ⚠️ Not guaranteed | ❌ | ❌ | **H16** (add zeroization) |

**No additional files to create** — fixes covered by Tasks 1.1–1.4.

---

## Phase 2: iOS Wipe Completeness (H27)

### Task 2.1 — Create centralized WipeService

**Problem**: Wipe logic is scattered across 5+ files with inconsistent coverage. Panic wipe (`PanicWipeConfirmationView.swift:87-121`) misses offline queue and crash logs. Remote wipe (`AppState.swift:333-353`) misses wake key, offline queue, crash logs, URL cache, cookies.

**Current wipe coverage gaps**:

| Storage | Panic Wipe | Remote Wipe | Logout |
|---------|-----------|-------------|--------|
| Keychain (all keys) | ✅ | ✅ | ✅ |
| Rust crypto state | ✅ | ✅ | ✅ |
| UserDefaults | ✅ | ✅ | ✅ |
| Wake key (Keychain) | ✅ | ❌ | ✅ |
| Offline queue (file) | ❌ | ❌ | ✅ |
| Crash logs (files) | ❌ | ❌ | ❌ |
| URL cache | ✅ | ❌ | ❌ |
| HTTP cookies | ✅ | ❌ | ❌ |
| WebSocket | ✅ | ✅ | ✅ |
| Temp/Caches dirs | ❌ | ❌ | ❌ |

**Files to create**:
- `apps/ios/Sources/Services/WipeService.swift` — Centralized wipe service:

```swift
@Observable final class WipeService {
    let keychainService: KeychainService
    let cryptoService: CryptoService
    let wakeKeyService: WakeKeyService
    let offlineQueue: OfflineQueue
    let crashReportingService: CrashReportingService
    let webSocketService: WebSocketService

    /// Full destructive wipe — used by panic wipe and remote device wipe
    func wipeAll() {
        // 1. Keychain — delete ALL items (device keys, PIN data, biometric, wake keys)
        keychainService.deleteAll()

        // 2. Rust crypto state — zeroize device secrets, hub keys, server event keys
        cryptoService.clearHubKeys()
        cryptoService.lock()

        // 3. Wake key service
        wakeKeyService.cleanup()

        // 4. Offline queue — delete queued operations file
        offlineQueue.clear()

        // 5. Crash logs — delete all crash report files
        crashReportingService.clearCrashLogs()

        // 6. URL cache
        URLCache.shared.removeAllCachedResponses()

        // 7. HTTP cookies
        if let cookies = HTTPCookieStorage.shared.cookies {
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }

        // 8. Temp directory
        clearDirectory(FileManager.default.temporaryDirectory)

        // 9. Caches directory
        if let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            clearDirectory(cachesDir)
        }

        // 10. Application Support (offline queue file lives here)
        if let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            let llamenosDir = appSupport.appendingPathComponent("llamenos")
            clearDirectory(llamenosDir)
        }

        // 11. WebSocket
        webSocketService.disconnect()

        // 12. UserDefaults
        if let bundleId = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleId)
        }
    }

    /// Logout cleanup — less aggressive, preserves crash logs and caches
    func logout() {
        keychainService.deleteAll()
        cryptoService.clearHubKeys()
        cryptoService.lock()
        wakeKeyService.cleanup()
        offlineQueue.clear()
        webSocketService.disconnect()
    }

    private func clearDirectory(_ url: URL) {
        let fm = FileManager.default
        guard let contents = try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) else { return }
        for item in contents {
            try? fm.removeItem(at: item)
        }
    }
}
```

**Files to modify**:
- `apps/ios/Sources/App/AppState.swift` — Add `WipeService` as dependency, replace inline wipe logic:
  - `handleDeviceWipe()` (lines 333-353) → call `wipeService.wipeAll()`
  - `didLogout()` (lines 356-369) → call `wipeService.logout()`
- `apps/ios/Sources/Views/Settings/PanicWipeConfirmationView.swift` — Replace `performPanicWipe()` (lines 87-121) with `appState.wipeService.wipeAll()` + UI flash + navigation
- `apps/ios/Sources/App/LlamenosApp.swift` — Inject WipeService into AppState

### Task 2.2 — Enumerate and verify all iOS storage locations

**Comprehensive storage audit**:

| Platform | Storage Location | Type | Covered by WipeService? | Fix |
|----------|-----------------|------|------------------------|-----|
| iOS | Keychain (`org.llamenos.hotline`) | SecItem | ✅ `deleteAll()` | — |
| iOS | Keychain wake keys | SecItem | ✅ `wakeKeyService.cleanup()` | — |
| iOS | UserDefaults (bundle domain) | plist | ✅ `removePersistentDomain` | — |
| iOS | Offline queue file (`AppSupport/llamenos/offline-queue.json`) | File | ✅ `offlineQueue.clear()` + dir wipe | **H27** |
| iOS | Crash logs (`AppSupport/crashes/`) | Files | ✅ `clearCrashLogs()` | **H27** |
| iOS | URL cache | NSURLCache | ✅ `removeAllCachedResponses()` | **H27** |
| iOS | HTTP cookies | HTTPCookieStorage | ✅ `deleteCookie` loop | **H27** |
| iOS | Temp directory | Files | ✅ `clearDirectory(tmp)` | **H27** |
| iOS | Caches directory | Files | ✅ `clearDirectory(caches)` | **H27** |
| iOS | Rust memory (device keys) | FFI | ✅ `cryptoService.lock()` | — |
| iOS | Rust memory (hub keys) | FFI | ✅ `cryptoService.clearHubKeys()` | — |
| iOS | Rust memory (server event keys) | FFI | ✅ via `lock()` | — |
| iOS | Core Data / SQLite | N/A | Not used | — |

**Tests**:
- **XCUITest**: `test_deviceWipeClearsAllStores`:
  1. Create device keys, store data in UserDefaults, queue an offline operation
  2. Trigger panic wipe via UI (type "WIPE", confirm)
  3. Verify: Keychain query returns `errSecItemNotFound`
  4. Verify: UserDefaults for bundle ID returns nil
  5. Verify: Offline queue file doesn't exist
  6. Verify: Crash logs directory is empty
  7. Verify: App shows login/setup screen

- **Unit test**: `test_wipeServiceCoversAllStorageKeys`:
  1. Populate all known storage locations
  2. Call `wipeService.wipeAll()`
  3. Assert each location is empty/cleared

---

## Phase 3: Android Wipe + Key Hardening (C04, wake key, ephemeral key)

### Task 3.1 — C04: Fix incomplete wipe with `prefs.edit().clear().apply()`

**Problem**: `wipeAll()` in `KeystoreService.kt:207-222` uses a hardcoded key list, missing `wake-secret`, `wake-pubkey`, `signing-pubkey`, `encryption-pubkey`. Any new keys added to storage won't be wiped.

**Also**: Remote wipe handler in `Navigation.kt:429` only calls `keystoreService.wipeAll()` — doesn't lock crypto or clear hub keys.

**Files to modify**:
- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt`:
  - Replace `wipeAll()` (lines 207-222) body with:
    ```kotlin
    fun wipeAll() {
        // Clear ALL EncryptedSharedPreferences — no hardcoded key list
        prefs.edit().clear().apply()
    }
    ```
  - Note: `wipeAllKeys()` (private, line 183) already uses `prefs.edit().clear().apply()` for PIN brute-force wipe — make `wipeAll()` consistent.

- `apps/android/app/src/main/java/org/llamenos/hotline/ui/Navigation.kt:429` — Update remote wipe handler:
  ```kotlin
  .collect { attributed ->
      val wipeEvent = attributed.event
      // Clear ALL storage
      keystoreService.wipeAll()
      // Zeroize Rust crypto state
      cryptoService.clearHubKeys()
      cryptoService.lock()
      // Clear transcription preferences
      context.getSharedPreferences("transcription_prefs", Context.MODE_PRIVATE)
          .edit().clear().apply()
      // Update UI
      isDeviceWiped = true
      deviceWipeReason = wipeEvent.reason
  }
  ```

- `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/AuthViewModel.kt:350-354` — Update `resetAuthState()`:
  ```kotlin
  fun resetAuthState() {
      cryptoService.clearHubKeys()  // Clear hub keys + server event keys from Rust
      cryptoService.lock()          // Zeroize device secrets in Rust
      keystoreService.clear()       // Clear all EncryptedSharedPreferences
      // Clear transcription preferences (separate SharedPreferences instance)
      context.getSharedPreferences("transcription_prefs", Context.MODE_PRIVATE)
          .edit().clear().apply()
      _uiState.value = AuthUiState()
  }
  ```

### Task 3.2 — AndroidKeyStore enumeration on wipe

**Problem**: The `MasterKey` in AndroidKeyStore persists even after `prefs.edit().clear().apply()`. While data is inaccessible without the MasterKey, a wipe should also remove the MasterKey for completeness.

**Files to modify**:
- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt` — Add to `wipeAll()`:
  ```kotlin
  fun wipeAll() {
      prefs.edit().clear().apply()
      // Also delete the MasterKey from AndroidKeyStore
      try {
          val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
          keyStore.load(null)
          keyStore.deleteEntry("_androidx_security_master_key_")
      } catch (_: Exception) {
          // KeyStore may not be available — continue
      }
  }
  ```

### Task 3.3 — Wake key: move to AndroidKeyStore with hardware backing

**Problem**: Wake key secret is stored as hex `String` in EncryptedSharedPreferences (`WakeKeyService.kt:76,91`). While encrypted at rest, it's not PIN-protected and stored as a JVM String (not zeroizable).

**Current code** (`WakeKeyService.kt:69-95`):
```kotlin
val secretKeyHex = org.llamenos.core.mobileRandomBytesHex()
keystoreService.store(KEY_WAKE_SECRET, secretKeyHex)  // Hex string in EncryptedSharedPreferences
```

**Fix**: Generate wake key as an AndroidKeyStore-backed key:

**Files to modify**:
- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt`:
  - Generate X25519 keypair via Rust FFI (required for compatibility with server HPKE)
  - Store the secret in AndroidKeyStore directly (not EncryptedSharedPreferences):
    ```kotlin
    // Store wake secret encrypted under a dedicated AndroidKeyStore key
    private fun storeWakeSecret(secretBytes: ByteArray) {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        // Generate a dedicated AES key for wake secret encryption
        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        keyGen.init(
            KeyGenParameterSpec.Builder("llamenos-wake-key", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        val wakeAesKey = keyGen.generateKey()
        // Encrypt the X25519 secret with the AndroidKeyStore-backed key
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, wakeAesKey)
        val encrypted = cipher.doFinal(secretBytes)
        val iv = cipher.iv
        // Store IV + ciphertext in EncryptedSharedPreferences (double-encrypted)
        keystoreService.store(KEY_WAKE_SECRET, Base64.encodeToString(iv + encrypted, Base64.NO_WRAP))
        // Zeroize the plaintext
        secretBytes.fill(0)
    }
    ```
  - Update `cleanup()` to also delete the AndroidKeyStore entry `"llamenos-wake-key"`
  - Update `decryptWakePush()` to retrieve and decrypt via AndroidKeyStore key

- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt` — Add `"llamenos-wake-key"` to AndroidKeyStore cleanup in `wipeAll()`

### Task 3.4 — Ephemeral key: use `ByteArray` instead of `String`

**Problem**: `CryptoService.generateEphemeralKeypair()` (line 528-549) returns `Pair<String, String>` (hex). Kotlin strings are immutable — cannot be zeroized. The ephemeral secret persists in JVM heap until GC.

**Files to modify**:
- `apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt`:
  - Change `generateEphemeralKeypair()` return type to use a zeroizable wrapper:
    ```kotlin
    class EphemeralKeypair(
        val publicKeyHex: String,  // Public key is fine as String
        private val secretBytes: ByteArray,  // Secret as ByteArray for zeroization
    ) : AutoCloseable {
        fun secretHex(): String = secretBytes.joinToString("") { "%02x".format(it) }
        override fun close() { secretBytes.fill(0) }
    }
    ```
  - Update `generateEphemeralKeypair()` to return `EphemeralKeypair`
  - Update `deriveSharedSecret()` to accept `ByteArray` for the secret parameter

- `apps/android/app/src/main/java/org/llamenos/hotline/ui/settings/DeviceLinkViewModel.kt` — Update device linking flow to use `EphemeralKeypair.use { }` block for automatic zeroization

### Task 3.5 — Android wipe completeness audit

**Comprehensive storage matrix**:

| Platform | Storage Location | Current Wipe | Fix | Task |
|----------|-----------------|-------------|-----|------|
| Android | EncryptedSharedPrefs (all keys) | Partial (hardcoded list) → ✅ | `clear().apply()` | **3.1** |
| Android | AndroidKeyStore (MasterKey) | ❌ → ✅ | Delete entry on wipe | **3.2** |
| Android | AndroidKeyStore (wake key) | ❌ → ✅ | Delete entry on wipe | **3.3** |
| Android | Transcription SharedPrefs | ❌ → ✅ | `clear().apply()` separate prefs | **3.1** |
| Android | Rust memory (device keys) | ❌ in remote wipe → ✅ | `cryptoService.lock()` | **3.1** |
| Android | Rust memory (hub keys) | ❌ in remote wipe → ✅ | `cryptoService.clearHubKeys()` | **3.1** |
| Android | Rust memory (server event keys) | ❌ → ✅ | Via `clearHubKeys()` | **3.1** |
| Android | Wake key (EncryptedSharedPrefs) | ❌ in `wipeAll()` → ✅ | `clear()` covers it | **3.1** |
| Android | Ephemeral key (JVM heap) | ❌ (String) → ✅ | ByteArray + zeroize | **3.4** |
| Android | Cache directory | ❌ | Add `context.cacheDir` wipe | **3.1** |

**Tests**:
- **Android unit test**: `test_wipeAllClearsAllPreferences`:
  1. Store values in all EncryptedSharedPreferences keys
  2. Store transcription preferences
  3. Call `wipeAll()`
  4. Verify `prefs.all` is empty
  5. Verify transcription prefs are empty
  6. Verify AndroidKeyStore entries removed

- **Android unit test**: `test_wakeKeyStoredInKeystore`:
  1. Call `getOrCreateWakePublicKey()`
  2. Verify AndroidKeyStore contains `"llamenos-wake-key"` entry
  3. Verify wake secret is NOT stored as plaintext in SharedPreferences

- **Android unit test**: `test_ephemeralKeyIsZeroized`:
  1. Generate ephemeral keypair
  2. Use `.use { }` block
  3. Verify `secretBytes` is all zeros after close

- **Cucumber BDD E2E**:
  - `Scenario: Remote device wipe clears all sensitive data`:
    1. Given a registered device with stored keys
    2. When the server sends a device wipe event
    3. Then EncryptedSharedPreferences contains no entries
    4. And transcription preferences are cleared
    5. And the app shows the device wipe receipt screen
  - `Scenario: Wake key is hardware-backed`:
    1. Given a device with push notifications enabled
    2. When the wake key is generated
    3. Then the wake secret is encrypted under an AndroidKeyStore key
    4. And the plaintext secret is not in SharedPreferences

---

## Cross-Platform Wipe Completeness Matrix

| Platform | Storage | Before | After | Fix |
|----------|---------|--------|-------|-----|
| **Desktop** | Tauri Store (settings/drafts) | Panic only | ✅ All wipe paths | — (already covered) |
| **Desktop** | Stronghold vault entry | ✅ | ✅ | — |
| **Desktop** | Stronghold vault FILE | ❌ | ✅ | **H17** (Task 1.2) |
| **Desktop** | localStorage (key fallback) | ❌ Insecure | ✅ Removed | **H21** (Task 1.3) |
| **Desktop** | Recovery group key (Rust) | ❌ Leaks to JS | ✅ Rust-only | **H16** (Task 1.1) |
| **Desktop** | CryptoState secrets (Rust) | ✅ | ✅ | — |
| **Desktop** | Hub key / event keys (Rust) | ✅ | ✅ | — |
| **Desktop** | sessionStorage | ✅ | ✅ | — |
| **Desktop** | IndexedDB | ✅ (panic) | ✅ | — |
| **iOS** | Keychain (all items) | ✅ | ✅ | — |
| **iOS** | UserDefaults | ✅ | ✅ | — |
| **iOS** | Wake key (Keychain) | Panic+logout only | ✅ All paths | **H27** (Task 2.1) |
| **iOS** | Offline queue (file) | Logout only | ✅ All paths | **H27** (Task 2.1) |
| **iOS** | Crash logs (files) | ❌ | ✅ All paths | **H27** (Task 2.1) |
| **iOS** | URL cache | Panic only | ✅ All paths | **H27** (Task 2.1) |
| **iOS** | HTTP cookies | Panic only | ✅ All paths | **H27** (Task 2.1) |
| **iOS** | Temp directory | ❌ | ✅ | **H27** (Task 2.1) |
| **iOS** | Caches directory | ❌ | ✅ | **H27** (Task 2.1) |
| **iOS** | Rust memory (all keys) | ✅ | ✅ | — |
| **Android** | EncryptedSharedPrefs | Partial (hardcoded) | ✅ `clear()` | **C04** (Task 3.1) |
| **Android** | AndroidKeyStore (MasterKey) | ❌ | ✅ Delete entry | **C04** (Task 3.2) |
| **Android** | AndroidKeyStore (wake key) | ❌ | ✅ Delete entry | Wake key (Task 3.3) |
| **Android** | Transcription SharedPrefs | ❌ | ✅ | **C04** (Task 3.1) |
| **Android** | Rust memory (device keys) | ❌ in remote wipe | ✅ | **C04** (Task 3.1) |
| **Android** | Rust memory (hub+event keys) | ❌ in remote wipe | ✅ | **C04** (Task 3.1) |
| **Android** | Ephemeral key (JVM heap) | ❌ (String) | ✅ (ByteArray+zeroize) | Ephemeral (Task 3.4) |

---

## Implementation Order & Dependencies

```
Phase 1 (Desktop) — no cross-platform dependencies
  Task 1.4 (C06: missing IPC commands) — FIRST, unblocks test flows
  Task 1.3 (H21: remove localStorage fallback) — independent
  Task 1.2 (H17: Stronghold vault file deletion) — independent
  Task 1.1 (H16: recovery group key isolation) — depends on 1.4 partially

Phase 2 (iOS) — independent of Phase 1
  Task 2.1 (WipeService creation) — single task, all H27 fixes

Phase 3 (Android) — independent of Phase 1 and 2
  Task 3.1 (C04: wipeAll fix) — FIRST, highest impact
  Task 3.2 (AndroidKeyStore cleanup) — depends on 3.1
  Task 3.3 (Wake key hardening) — independent
  Task 3.4 (Ephemeral key zeroization) — independent
```

**All three phases can be implemented in parallel** — each platform's changes are independent.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Recovery group API change breaks existing recovery flows | No production users yet — clean break is safe |
| Stronghold vault deletion breaks re-login | Vault is only needed when encrypted keys exist; after wipe, user must re-onboard |
| AndroidKeyStore not available on all devices | StrongBox fallback to TEE already implemented; wake key falls back to EncryptedSharedPrefs only if KeyStore unavailable |
| ByteArray zeroization not guaranteed by JVM | Use `secretBytes.fill(0)` immediately after use + `AutoCloseable` pattern; best-effort in managed runtime |
| iOS WipeService introduction breaks existing test helpers | Update test setup to inject WipeService alongside existing services |
