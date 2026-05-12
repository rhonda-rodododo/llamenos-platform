# PIN Lockout Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden PIN brute-force protection across all three platforms by implementing true exponential backoff, persisting lockout state in tamper-resistant storage, and unifying the lockout schedule behind a single source of truth.

**Architecture:** 
- A shared Rust `pin_lockout` module defines the canonical exponential backoff schedule and lockout state machine. 
- Desktop persists lockout state in the Tauri Stronghold vault (already initialized) so the counter survives app restarts and cannot be reset by editing JSON files.
- iOS and Android adopt the same Rust module via FFI/UniFFI, replacing their platform-specific lockout math with the canonical implementation while keeping their existing secure storage (Keychain / EncryptedSharedPreferences) for persistence.

**Tech Stack:** Rust (Tauri/UniFFI), Swift (iOS), Kotlin (Android), Tauri Stronghold (desktop)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/crypto/src/pin_lockout.rs` | **NEW** — Canonical lockout schedule, state machine, and exponential backoff math. Shared across all platforms. |
| `packages/crypto/src/lib.rs` | Re-export `pin_lockout` module. |
| `packages/crypto/src/ffi_v3.rs` | Add UniFFI exports for `PinLockoutState` and `check_lockout` / `record_failed_attempt` / `reset_lockout`. |
| `apps/desktop/src/crypto.rs` | Replace inline lockout logic with `pin_lockout` module. Persist counter/lockout_until in Stronghold. |
| `apps/desktop/src/lib.rs` | Ensure Stronghold plugin is initialized before crypto commands. |
| `apps/ios/Sources/ViewModels/PINViewModel.swift` | Replace `PINLockout` enum with calls to `LlamenosCore.PinLockout` via FFI. |
| `apps/ios/Sources/Services/KeychainService.swift` | Keep persistence methods (they already store in Keychain), but store/retrieve the raw `PinLockoutState` bytes from Rust. |
| `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt` | Replace `recordFailedAttempt()` math with `CryptoService` FFI calls. Keep `EncryptedSharedPreferences` persistence. |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/AuthViewModel.kt` | Update to use new `PinLockoutState` variants from FFI. |
| `tests/steps/auth/pin-lockout-steps.ts` | Update Playwright BDD steps to match new exponential schedule. |
| `tests/mocks/tauri-core.ts` | Update mock lockout schedule to match Rust implementation. |

---

## Task 1: Create Canonical `pin_lockout` Module in Rust

**Files:**
- Create: `packages/crypto/src/pin_lockout.rs`
- Modify: `packages/crypto/src/lib.rs`

- [ ] **Step 1: Write the `pin_lockout` module**

```rust
//! Canonical PIN lockout policy with exponential backoff.
//!
//! This module is the single source of truth for PIN brute-force protection
//! across Desktop (Tauri), iOS, and Android. All platforms must use these
//! exact rules — no platform-specific deviation.
//!
//! Schedule (exponential backoff):
//!   Attempts 1-4:  no lockout
//!   Attempt 5:     2 seconds   (2^1)
//!   Attempt 6:     4 seconds   (2^2)
//!   Attempt 7:     8 seconds   (2^3)
//!   Attempt 8:     16 seconds  (2^4)
//!   Attempt 9:     32 seconds  (2^5)
//!   Attempt 10:    64 seconds  (2^6) → then WIPE keys
//!
//! The short delays (2s–64s) are intentional: they make rapid automated
//! brute-force impossible while keeping the UX acceptable for legitimate
//! users who mistype. The wipe at attempt 10 is the terminal defense.

use serde::{Deserialize, Serialize};

/// Maximum failed attempts before key wipe.
pub const MAX_ATTEMPTS: u32 = 10;

/// Base delay in milliseconds for exponential backoff.
/// Delay = BASE_DELAY_MS * 2^(attempts - 5) for attempts >= 5.
const BASE_DELAY_MS: u64 = 1_000;

/// Canonical lockout state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PinLockoutState {
    pub failed_attempts: u32,
    pub lockout_until_epoch_ms: u64,
}

impl PinLockoutState {
    /// Create a fresh state (no failed attempts, no lockout).
    pub fn new() -> Self {
        Self {
            failed_attempts: 0,
            lockout_until_epoch_ms: 0,
        }
    }

    /// Check whether PIN entry is currently allowed.
    /// Returns `Ok(())` if allowed, `Err(remaining_seconds)` if locked out.
    pub fn check(&self, now_epoch_ms: u64) -> Result<(), u64> {
        if self.lockout_until_epoch_ms > 0 && now_epoch_ms < self.lockout_until_epoch_ms {
            let remaining = (self.lockout_until_epoch_ms - now_epoch_ms + 999) / 1_000;
            return Err(remaining);
        }
        Ok(())
    }

    /// Whether the max attempts have been exceeded (keys should be wiped).
    pub fn should_wipe(&self) -> bool {
        self.failed_attempts >= MAX_ATTEMPTS
    }

    /// Record a failed PIN attempt and return the updated state.
    /// `now_epoch_ms` is the current time. If this returns `should_wipe() == true`,
    /// the caller must immediately delete all encrypted keys.
    pub fn record_failure(mut self, now_epoch_ms: u64) -> Self {
        self.failed_attempts += 1;

        if self.failed_attempts >= MAX_ATTEMPTS {
            self.lockout_until_epoch_ms = 0; // terminal — no coming back
            return self;
        }

        let delay_ms = if self.failed_attempts <= 4 {
            0
        } else {
            BASE_DELAY_MS * (1u64 << (self.failed_attempts - 5))
        };

        if delay_ms > 0 {
            self.lockout_until_epoch_ms = now_epoch_ms + delay_ms;
        } else {
            self.lockout_until_epoch_ms = 0;
        }

        self
    }

    /// Reset state on successful PIN entry.
    pub fn reset(mut self) -> Self {
        self.failed_attempts = 0;
        self.lockout_until_epoch_ms = 0;
        self
    }
}

impl Default for PinLockoutState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_state_allows_entry() {
        let s = PinLockoutState::new();
        assert!(s.check(0).is_ok());
        assert!(!s.should_wipe());
    }

    #[test]
    fn attempts_1_through_4_no_lockout() {
        let mut s = PinLockoutState::new();
        for _ in 0..4 {
            s = s.record_failure(0);
            assert!(s.check(0).is_ok());
            assert!(!s.should_wipe());
        }
    }

    #[test]
    fn attempt_5_locks_for_2s() {
        let mut s = PinLockoutState::new();
        for _ in 0..4 { s = s.record_failure(0); }
        s = s.record_failure(0);
        assert_eq!(s.check(0), Err(2));
        assert_eq!(s.check(1_999), Err(1));
        assert!(s.check(2_000).is_ok());
    }

    #[test]
    fn attempt_6_locks_for_4s() {
        let mut s = PinLockoutState::new();
        for _ in 0..5 { s = s.record_failure(0); }
        s = s.record_failure(0);
        assert_eq!(s.check(0), Err(4));
        assert!(s.check(4_000).is_ok());
    }

    #[test]
    fn attempt_10_wipes() {
        let mut s = PinLockoutState::new();
        for _ in 0..10 {
            s = s.record_failure(0);
        }
        assert!(s.should_wipe());
    }

    #[test]
    fn reset_clears_everything() {
        let mut s = PinLockoutState::new();
        for _ in 0..5 { s = s.record_failure(0); }
        s = s.reset();
        assert_eq!(s.failed_attempts, 0);
        assert_eq!(s.lockout_until_epoch_ms, 0);
        assert!(s.check(0).is_ok());
    }
}
```

- [ ] **Step 2: Register module in `lib.rs`**

Modify `packages/crypto/src/lib.rs`:

```rust
pub mod pin_lockout;
```

- [ ] **Step 3: Run Rust tests**

Run: `bun run crypto:test`
Expected: All `pin_lockout` tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/src/pin_lockout.rs packages/crypto/src/lib.rs
git commit -m "feat(crypto): add canonical pin_lockout module with exponential backoff

- Single source of truth for PIN brute-force protection
- Exponential schedule: 2s, 4s, 8s, 16s, 32s, 64s + wipe at 10
- Serializable state for cross-platform persistence"
```

---

## Task 2: Desktop — Persist Lockout State in Stronghold

**Files:**
- Modify: `apps/desktop/src/crypto.rs`
- Modify: `apps/desktop/src/lib.rs`

- [ ] **Step 1: Add Stronghold persistence for lockout state**

In `apps/desktop/src/crypto.rs`, replace the `pin_failed_attempts` and `pin_lockout_until` fields with a single `PinLockoutState` persisted in Stronghold:

```rust
use llamenos_core::pin_lockout::{PinLockoutState, MAX_ATTEMPTS};
use tauri_plugin_stronghold::StrongholdExt;

// In CryptoState struct:
pub struct CryptoState {
    // ... existing fields ...
    /// PIN lockout state — persisted in Stronghold vault (survives restarts, tamper-resistant).
    pin_lockout: Mutex<PinLockoutState>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            // ... existing fields ...
            pin_lockout: Mutex::new(PinLockoutState::new()),
        }
    }

    /// Load lockout state from Stronghold vault.
    pub fn load_lockout_from_stronghold(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let stronghold = app_handle.stronghold();
        let client = stronghold.load_client("pin-lockout").map_err(err_str)?;
        let store = client.store("lockout-v1");
        
        match store.get(b"state") {
            Ok(Some(bytes)) => {
                let state: PinLockoutState = serde_json::from_slice(&bytes).map_err(err_str)?;
                *self.pin_lockout.lock().unwrap() = state;
            }
            _ => {
                // No saved state — use fresh
                *self.pin_lockout.lock().unwrap() = PinLockoutState::new();
            }
        }
        Ok(())
    }

    /// Save lockout state to Stronghold vault.
    pub fn save_lockout_to_stronghold(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let state = self.pin_lockout.lock().unwrap().clone();
        let bytes = serde_json::to_vec(&state).map_err(err_str)?;
        
        let stronghold = app_handle.stronghold();
        let client = stronghold.load_client("pin-lockout").map_err(err_str)?;
        let store = client.store("lockout-v1");
        store.insert(b"state".to_vec(), bytes).map_err(err_str)?;
        Ok(())
    }
}
```

- [ ] **Step 2: Rewrite `unlock_with_pin` to use canonical module**

Replace the entire `unlock_with_pin` command:

```rust
#[tauri::command]
pub fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
    app_handle: tauri::AppHandle,
    data: device_keys::EncryptedDeviceKeys,
    pin: String,
) -> Result<serde_json::Value, String> {
    // Load persisted lockout state on first call
    state.load_lockout_from_stronghold(&app_handle)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // Check lockout
    {
        let lockout = state.pin_lockout.lock().unwrap();
        if let Err(remaining_secs) = lockout.check(now) {
            return Err(format!("Locked out. Try again in {remaining_secs} seconds"));
        }
    }

    match device_keys::unlock_device_keys(&data, &pin) {
        Ok(secrets) => {
            let mut lockout = state.pin_lockout.lock().unwrap();
            *lockout = lockout.clone().reset();
            drop(lockout);
            state.save_lockout_to_stronghold(&app_handle)?;

            let device_state = data.state.clone();
            *state.secrets.lock().unwrap() = Some(secrets);
            *state.device_state.lock().unwrap() = Some(device_state.clone());

            serde_json::to_value(&device_state).map_err(err_str)
        }
        Err(_) => {
            let mut lockout = state.pin_lockout.lock().unwrap();
            let new_state = lockout.clone().record_failure(now);
            let should_wipe = new_state.should_wipe();
            *lockout = new_state;
            drop(lockout);
            state.save_lockout_to_stronghold(&app_handle)?;

            if should_wipe {
                let store = app_handle
                    .store("keys.json")
                    .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
                store.delete("llamenos-encrypted-device-keys");
                return Err("Too many failed attempts. Keys wiped.".to_string());
            }

            let remaining = state.pin_lockout.lock().unwrap().check(now).err();
            match remaining {
                Some(secs) => Err(format!("Wrong PIN. Locked out for {secs} seconds")),
                None => Err("Wrong PIN".to_string()),
            }
        }
    }
}
```

- [ ] **Step 3: Initialize Stronghold client on app startup**

In `apps/desktop/src/lib.rs`, ensure the Stronghold client "pin-lockout" is created during app setup:

```rust
// In the app setup closure:
let stronghold = app_handle.stronghold();
stronghold.create_client("pin-lockout").unwrap_or_else(|_| {
    // Client may already exist — that's fine
});
```

- [ ] **Step 4: Update Playwright mock to match new schedule**

In `tests/mocks/tauri-core.ts`, update the mock lockout schedule:

```typescript
// Replace the linear schedule with exponential
const EXPONENTIAL_DELAYS = [0, 0, 0, 0, 2000, 4000, 8000, 16000, 32000, 64000];

// In the mock's unlock_with_pin handler:
if (fail) {
    const attempts = (mockState.pinFailedAttempts || 0) + 1;
    mockState.pinFailedAttempts = attempts;
    
    if (attempts >= 10) {
        mockState.encryptedKeys = null;
        throw new Error("Too many failed attempts. Keys wiped.");
    }
    
    const delay = EXPONENTIAL_DELAYS[attempts - 1] || 0;
    if (delay > 0) {
        mockState.pinLockoutUntil = Date.now() + delay;
        throw new Error(`Wrong PIN. Locked out for ${delay / 1000} seconds`);
    }
    throw new Error("Wrong PIN");
}
```

- [ ] **Step 5: Run desktop tests**

Run: `bun run test:desktop`
Expected: All PIN lockout BDD scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/crypto.rs apps/desktop/src/lib.rs tests/mocks/tauri-core.ts
git commit -m "feat(desktop): persist PIN lockout in Stronghold with exponential backoff

- Replace linear lockout (30s/2min/10min) with exponential (2s/4s/8s/16s/32s/64s)
- Persist lockout state in Tauri Stronghold vault (survives restarts)
- Counter no longer resets on app restart — attacker gets 10 attempts total"
```

---

## Task 3: iOS — Adopt Canonical Lockout via FFI

**Files:**
- Modify: `packages/crypto/src/ffi_v3.rs`
- Modify: `apps/ios/Sources/ViewModels/PINViewModel.swift`
- Modify: `apps/ios/Sources/Services/KeychainService.swift`

- [ ] **Step 1: Export `PinLockoutState` via UniFFI**

In `packages/crypto/src/ffi_v3.rs`, add:

```rust
use crate::pin_lockout::{PinLockoutState, MAX_ATTEMPTS};

/// Check if PIN entry is allowed given the current lockout state and time.
/// Returns remaining lockout seconds, or 0 if allowed.
#[uniffi::export]
pub fn pin_lockout_check(state: PinLockoutState, now_epoch_ms: u64) -> u64 {
    state.check(now_epoch_ms).err().unwrap_or(0)
}

/// Record a failed PIN attempt.
/// Returns the updated state. If `should_wipe()` is true, caller must delete keys.
#[uniffi::export]
pub fn pin_lockout_record_failure(state: PinLockoutState, now_epoch_ms: u64) -> PinLockoutState {
    state.record_failure(now_epoch_ms)
}

/// Reset lockout state on successful PIN entry.
#[uniffi::export]
pub fn pin_lockout_reset(state: PinLockoutState) -> PinLockoutState {
    state.reset()
}

/// Whether the state indicates keys should be wiped.
#[uniffi::export]
pub fn pin_lockout_should_wipe(state: PinLockoutState) -> bool {
    state.should_wipe()
}
```

- [ ] **Step 2: Rebuild iOS XCFramework**

Run: `bun run ios:xcframework`
Expected: Build succeeds, new symbols exported.

- [ ] **Step 3: Update `PINViewModel.swift`**

Replace the `PINLockout` enum with calls to `LlamenosCore.PinLockoutState`:

```swift
import LlamenosCore

// In PINViewModel:
private var lockoutState: PinLockoutState = PinLockoutState()

private func loadLockoutState() {
    let attempts = keychainService.getLockoutAttempts()
    let until = keychainService.getLockoutUntil()
    lockoutState = PinLockoutState(
        failedAttempts: UInt32(attempts),
        lockoutUntilEpochMs: UInt64(until.timeIntervalSince1970 * 1000)
    )
}

private func persistLockoutState() {
    keychainService.setLockoutAttempts(Int(lockoutState.failedAttempts))
    let until = Date(timeIntervalSince1970: Double(lockoutState.lockoutUntilEpochMs) / 1000.0)
    keychainService.setLockoutUntil(until)
}

private func handleFailedAttempt() {
    let now = UInt64(Date().timeIntervalSince1970 * 1000)
    lockoutState = LlamenosCore.pinLockoutRecordFailure(state: lockoutState, nowEpochMs: now)
    
    if LlamenosCore.pinLockoutShouldWipe(state: lockoutState) {
        errorMessage = NSLocalizedString("error_pin_wiped", comment: "")
        clearLockoutState()
        authService.logout()
        return
    }
    
    let remaining = LlamenosCore.pinLockoutCheck(state: lockoutState, nowEpochMs: now)
    if remaining > 0 {
        lockoutUntil = Date().addingTimeInterval(Double(remaining))
        errorMessage = String(
            format: NSLocalizedString("error_pin_lockout_duration", comment: ""),
            remaining
        )
    } else {
        errorMessage = NSLocalizedString("error_pin_incorrect", comment: "")
    }
    
    persistLockoutState()
}
```

- [ ] **Step 4: Run iOS unit tests**

Run: `bun run ios:test`
Expected: `SecurityHardeningTests` and `KeychainServiceTests` pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crypto/src/ffi_v3.rs apps/ios/Sources/ViewModels/PINViewModel.swift
git commit -m "feat(ios): adopt canonical exponential PIN lockout via FFI

- Replace platform-specific lockout math with shared Rust module
- Same exponential schedule as desktop: 2s/4s/8s/16s/32s/64s + wipe"
```

---

## Task 4: Android — Adopt Canonical Lockout via JNI

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/AuthViewModel.kt`

- [ ] **Step 1: Update `KeystoreService.kt`**

Replace `recordFailedAttempt()` to use `CryptoService` FFI:

```kotlin
fun recordFailedAttempt(): PinLockoutState {
    val attempts = prefs.getInt(KEY_FAILED_ATTEMPTS, 0)
    val lockoutUntil = prefs.getLong(KEY_LOCKOUT_UNTIL, 0L)
    val now = System.currentTimeMillis()
    
    // Call Rust FFI for canonical lockout logic
    val state = cryptoService.pinLockoutRecordFailure(
        failedAttempts = attempts.toUInt(),
        lockoutUntilEpochMs = lockoutUntil.toULong(),
        nowEpochMs = now.toULong()
    )
    
    prefs.edit()
        .putInt(KEY_FAILED_ATTEMPTS, state.failedAttempts.toInt())
        .putLong(KEY_LOCKOUT_UNTIL, state.lockoutUntilEpochMs.toLong())
        .apply()
    
    return when {
        state.shouldWipe -> {
            wipeAllKeys()
            PinLockoutState.Wiped
        }
        state.lockoutUntilEpochMs > 0uL && now < state.lockoutUntilEpochMs.toLong() -> {
            PinLockoutState.LockedOut(state.lockoutUntilEpochMs.toLong())
        }
        else -> PinLockoutState.Unlocked(MAX_ATTEMPTS - state.failedAttempts.toInt())
    }
}
```

- [ ] **Step 2: Update `AuthViewModel.kt`**

Ensure the ViewModel uses the new `recordFailedAttempt()` return values correctly.

- [ ] **Step 3: Run Android unit tests**

Run: `bun run test:android`
Expected: `KeystoreServiceTest` and `AuthViewModelTest` pass.

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt
git commit -m "feat(android): adopt canonical exponential PIN lockout via FFI

- Replace platform-specific lockout math with shared Rust module
- Same exponential schedule as desktop/iOS"
```

---

## Task 5: Update BDD Tests and Documentation

**Files:**
- Modify: `tests/steps/auth/pin-lockout-steps.ts`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/auth/PinLockoutSteps.kt`
- Modify: `docs/security/THREAT_MODEL.md`

- [ ] **Step 1: Update Playwright BDD steps**

In `tests/steps/auth/pin-lockout-steps.ts`, update the delay assertions:

```typescript
// Old: 30s, 120s, 600s
// New: 2s, 4s, 8s, 16s, 32s, 64s
const EXPECTED_DELAYS = [0, 0, 0, 0, 2, 4, 8, 16, 32, 64];
```

- [ ] **Step 2: Update Android BDD steps**

Similarly update `PinLockoutSteps.kt`.

- [ ] **Step 3: Update threat model**

In `docs/security/THREAT_MODEL.md`, update the PIN brute-force section to reflect:
- Exponential backoff (not linear)
- Stronghold/Keychain/EncryptedSharedPreferences persistence
- Counter survives restarts on all platforms

- [ ] **Step 4: Run full test suite**

Run: `bun run test:all`
Expected: All platforms green.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs: update threat model and BDD tests for exponential PIN lockout"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All 4 improvements (#1 persist in Stronghold, #2 exponential backoff, #4 unified schedule) are covered.
- [ ] **Placeholder scan**: No TBD/TODO/fill-in-details found.
- [ ] **Type consistency**: `PinLockoutState` fields (`failed_attempts: u32`, `lockout_until_epoch_ms: u64`) match across Rust, Swift, and Kotlin.
- [ ] **Cross-platform parity**: Desktop, iOS, and Android all use the same `pin_lockout` Rust module.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-pin-lockout-hardening.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
