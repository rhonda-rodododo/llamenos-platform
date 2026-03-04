# Epic 246: iOS Panic Wipe

## Summary

Implement emergency data deletion ("panic wipe") for iOS. A clearly marked destructive action in Settings that immediately wipes all local data (keychain, UserDefaults, crypto state) and returns to the login screen. This is a security feature for volunteers in hostile environments who need to quickly destroy evidence of app usage.

## Context

- **Android has**: Panic Wipe button in Settings with confirmation dialog. Clears all local storage and returns to login.
- **iOS has**: Logout (which clears keys), but no "wipe everything" option that also clears UserDefaults, cached data, and any traces
- **Security requirement**: Volunteers in dangerous situations may need to quickly destroy all app data if their device is seized

## Implementation

### Settings Integration

Add a "Panic Wipe" button in the Settings actions section, BELOW the logout button. Styled as destructive (red) with warning icon.

```swift
// In SettingsView actionsSection
Button(role: .destructive) {
    showPanicWipeConfirmation = true
} label: {
    Label {
        Text(NSLocalizedString("settings_panic_wipe", comment: "Emergency Wipe"))
    } icon: {
        Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(.red)
    }
}
.accessibilityIdentifier("settings-panic-wipe")
```

### Confirmation Dialog

Two-step confirmation to prevent accidental activation:

```swift
.alert(
    NSLocalizedString("panic_wipe_title", comment: "Emergency Data Wipe"),
    isPresented: $showPanicWipeConfirmation
) {
    Button(NSLocalizedString("cancel", comment: "Cancel"), role: .cancel) {}
    Button(NSLocalizedString("panic_wipe_confirm", comment: "Wipe All Data"), role: .destructive) {
        performPanicWipe()
    }
} message: {
    Text(NSLocalizedString(
        "panic_wipe_message",
        comment: "This will permanently delete ALL data including your identity keys. This cannot be undone. Make sure you have backed up your secret key."
    ))
}
```

### Wipe Implementation

```swift
func performPanicWipe() {
    // 1. Clear keychain (all stored keys, PIN, hub URL, biometric settings)
    appState.keychainService.deleteAll()

    // 2. Lock crypto (clear nsec from memory)
    appState.cryptoService.lock()

    // 3. Clear UserDefaults
    if let bundleId = Bundle.main.bundleIdentifier {
        UserDefaults.standard.removePersistentDomain(forName: bundleId)
    }

    // 4. Disconnect WebSocket
    appState.webSocketService.disconnect()

    // 5. Clear wake key
    appState.wakeKeyService.cleanup()

    // 6. Reset app state
    appState.isLocked = false
    appState.authStatus = .unauthenticated
    appState.userRole = .volunteer
    appState.unreadConversationCount = 0

    // 7. Clear URL cache
    URLCache.shared.removeAllCachedResponses()

    // 8. Clear cookies
    let storage = HTTPCookieStorage.shared
    storage.cookies?.forEach { storage.deleteCookie($0) }
}
```

### Visual Feedback

Brief flash/haptic before transition to login screen. Use `UINotificationFeedbackGenerator().notificationOccurred(.warning)`.

## BDD Tests — PanicWipeUITests.swift

```
Scenario: Panic wipe button exists in settings
  Given I am authenticated
  When I navigate to settings
  Then I should see the panic wipe button

Scenario: Panic wipe shows confirmation dialog
  Given I am authenticated
  When I navigate to settings
  And I tap panic wipe
  Then I should see a confirmation dialog

Scenario: Panic wipe returns to login screen
  Given I am authenticated
  When I navigate to settings
  And I tap panic wipe
  And I confirm the wipe
  Then I should see the login screen

Scenario: Cancel panic wipe stays on settings
  Given I am authenticated
  When I navigate to settings
  And I tap panic wipe
  And I cancel the wipe
  Then I should still be on the settings screen
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sources/Views/Settings/SettingsView.swift` | Modify — add panic wipe button + confirmation |
| `Sources/App/AppState.swift` | Modify — add `performPanicWipe()` method |
| `Tests/UI/PanicWipeUITests.swift` | Create |

## Dependencies

- None (uses existing services)
- Low complexity, can be implemented independently
