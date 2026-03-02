# Epic 230: Android Settings & Polish

## Goal

Implement Android UI for settings and user-facing features currently stubbed in BDD step definitions: profile editing, theme picker, collapsible settings sections, blasts, demo mode, and panic wipe. Settings should be organized so non-technical hub admins are not overwhelmed by configuration they did not set up themselves.

## Design Principles

- **Feature parity, not UX parity**: Android implements the same settings as desktop but with mobile-native patterns (full-screen sub-screens instead of inline expansion, bottom sheets, etc.)
- **Non-technical admin friendliness**: Hub admins may not be technical users. Settings already configured for them (telephony, IVR, relay, encryption) should be tucked away, not front-and-center
- **No full hub management from mobile**: Technical configuration (telephony provider setup, IVR settings, relay configuration, passkey policies, encryption settings) is NOT in scope for mobile. These are desktop-only admin tasks configured during hub setup
- **Cross-platform settings architecture**: The default/advanced settings division described below applies to ALL clients (desktop, Android, iOS) — not just mobile. Desktop should also implement this pattern to keep non-technical admins from being overwhelmed

## Context

After Epic 228, many settings-related step definitions are stubs. This epic builds the production Compose UI for personal settings, theme management, and secondary features (blasts, demo mode, panic wipe).

## Settings Categorization (Cross-Platform)

This section defines the settings architecture that applies to **all clients** — desktop, Android, and iOS. The goal is to separate day-to-day operational settings from technical configuration that most admins will never need to touch after initial setup.

### Default / Operational Settings (Always Visible)

These are the settings a hub admin or volunteer interacts with regularly:

| Setting | Who sees it |
|---------|-------------|
| Profile (name, phone, languages) | All users |
| Theme (light/dark/system) | All users |
| Notification preferences | All users |
| Key backup | All users |
| Linked devices | All users |
| Transcription | All users |
| Shift management | Admin |
| Volunteer management | Admin |
| Ban lists / spam mitigation toggles | Admin |
| Blasts | Admin |
| Custom fields | Admin |
| Call Languages | Admin — add/remove supported caller languages as new volunteers are onboarded. Friendly name for IVR language routing; the technical IVR config stays in Advanced |

### Advanced / Technical Settings (Behind "Advanced Settings")

These settings are configured once during hub setup and rarely touched afterward. They should be behind an **"Advanced Settings"** collapsible section (desktop) or sub-screen (mobile) with a description like _"These settings were configured during hub setup. Only change them if you know what you're doing."_

| Setting | Notes |
|---------|-------|
| Telephony provider configuration | Twilio/SignalWire/Vonage API keys, SIP config |
| IVR / voice bot settings | CAPTCHA digits, greeting recordings (NOT language routing — that's in operational settings as "Call Languages") |
| Relay configuration | Nostr relay URLs, strfry/Nosflare settings |
| Passkey / WebAuthn policies | Attestation requirements, allowed authenticators |
| Encryption settings | Key rotation policies, ECIES parameters |
| Hub key management | Key rotation, member re-wrapping |
| Webhook configuration | Inbound telephony/messaging webhook URLs |
| Custom domain / branding | Hub name, logo, custom domain settings |

### Implementation Notes

- **Desktop**: Add an "Advanced Settings" collapsible `SettingsSection` at the bottom of the admin settings area. Default collapsed. Slightly muted header styling to de-emphasize
- **Android**: "Advanced Settings" is a separate sub-screen accessible via a list item at the bottom of the settings screen, styled as secondary navigation. On Android, this screen may simply show a message directing the admin to the desktop app for technical configuration (since full hub management is out of scope for mobile)
- **iOS**: Same pattern as Android — sub-screen with secondary styling, may defer to desktop for technical settings
- **Consistent naming**: Use "Advanced Settings" across all platforms (not "Technical Settings" or "Expert Mode")
- **No mobile implementation of advanced settings internals**: Mobile clients show the "Advanced Settings" entry point but may display a "Configure on desktop" message rather than implementing the full forms. This is by design — these are one-time setup tasks

## Implementation

### 1. Profile Editing (SettingsScreen expansion)

**Files modified**: `SettingsScreen.kt`
**New files**: `SettingsViewModel.kt`

`SettingsScreen` currently has no ViewModel — it receives static data as parameters. Need a `SettingsViewModel` for profile editing.

Profile editing section within settings:
- Display name `OutlinedTextField` (`settings-name-input`)
- Phone `OutlinedTextField` with E.164 validation (`settings-phone-input`)
- Read-only npub display (already exists as `settings-npub`)
- Spoken languages: toggle chip row for 13 languages (`settings-language-{code}`)
- "Update Profile" button (`update-profile-button`)
- Success snackbar "Profile updated"
- Validation: phone must match `^\+\d{7,15}$`, inline error "invalid phone"

`SettingsViewModel`:
```kotlin
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
) : ViewModel() {
    data class SettingsUiState(
        val displayName: String = "",
        val phone: String = "",
        val npub: String = "",
        val spokenLanguages: Set<String> = emptySet(),
        val isSaving: Boolean = false,
        val saveError: String? = null,
        val saveSuccess: Boolean = false,
        val isAdmin: Boolean = false,
    )
    fun loadProfile()
    fun updateProfile()
}
```

API: `PUT /api/profile` → `UpdateProfileRequest(displayName, phone, spokenLanguages)`

Admin-only visibility gates (operational settings — always visible to admins):
- "Shift Management" — only if `isAdmin`
- "Volunteer Management" — only if `isAdmin`
- "Ban Lists / Spam Mitigation" — only if `isAdmin`
- "Blasts" — only if `isAdmin`
- "Custom Fields" — only if `isAdmin`

Advanced settings entry point (bottom of admin settings):
- "Advanced Settings" → sub-screen with "Configure on desktop" guidance (see Settings Categorization section above). Technical settings like telephony, IVR, passkey policies, relay config are not implemented on mobile

TestTags: `settings-name-input`, `settings-phone-input`, `update-profile-button`, `settings-language-{code}`, `profile-save-success`, `profile-save-error`

### 2. Collapsible Settings Sections

**New file**: `SettingsSection.kt` (shared composable)
**Files modified**: `SettingsScreen.kt`

Reusable `SettingsSection` composable matching desktop `SettingsSection`:
```kotlin
@Composable
fun SettingsSection(
    id: String,
    title: String,
    icon: ImageVector,
    defaultExpanded: Boolean = false,
    onCopyLink: (() -> Unit)? = null,
    content: @Composable () -> Unit,
)
```

Features:
- Clickable header with title, icon, chevron (animated rotation)
- `AnimatedVisibility` for content
- "Copy Link" icon button on header (copies deep link)
- Persisted expanded state via `KeyValueStore` (key: `settings-section-{id}`)
- Multiple sections can be open simultaneously
- Deep link support: `?section=transcription` opens that section on load

Sections (matching desktop `/settings` — all are "default/operational" settings):
1. Profile (default expanded)
2. Key Backup
3. Linked Devices
4. Transcription
5. Notifications (Android-specific: notification permission request)
6. Advanced Settings (admin-only, collapsed, leads to sub-screen — see Settings Categorization section)

TestTags: `settings-section-{id}`, `settings-section-{id}-header`, `settings-section-{id}-content`, `settings-section-{id}-copy-link`

### 3. Theme Picker

**New file**: `ThemeToggle.kt` (shared composable), `ThemeManager.kt` (service)
**Files modified**: `SettingsScreen.kt`, `LoginScreen.kt`, `LlamenosApp.kt`, `Theme.kt`

Theme toggle composable (3 buttons):
- Sun icon → Light theme (`theme-light`)
- Moon icon → Dark theme (`theme-dark`)
- System icon → Follow system (`theme-system`)

`ThemeManager` (singleton via Hilt):
```kotlin
@Singleton
class ThemeManager @Inject constructor(
    private val keyValueStore: KeyValueStore,
) {
    val themeMode: StateFlow<ThemeMode>  // LIGHT, DARK, SYSTEM
    fun setTheme(mode: ThemeMode)
}
```

Applied in `LlamenosApp.kt`:
```kotlin
val themeManager: ThemeManager = hiltEntryPoint.themeManager()
val themeMode by themeManager.themeMode.collectAsState()
val darkTheme = when (themeMode) {
    ThemeMode.DARK -> true
    ThemeMode.LIGHT -> false
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}
LlamenosTheme(darkTheme = darkTheme) { ... }
```

Placement: Settings screen (in header area) + Login screen (top-right corner)

TestTags: `theme-light`, `theme-dark`, `theme-system`

### 4. Panic Wipe (Android Native)

**New files**: `PanicWipeService.kt`, `PanicWipeOverlay.kt`
**Files modified**: `MainActivity.kt`, `MainScreen.kt`

Android-native equivalent of desktop triple-Escape:
- **Trigger**: Volume down pressed 5 times within 3 seconds (hardware button, works even with screen off content)
- **Alternative**: Shake gesture (accelerometer threshold) — configurable

`PanicWipeService`:
```kotlin
@Singleton
class PanicWipeService @Inject constructor(
    private val keystoreService: KeystoreService,
    private val cryptoService: CryptoService,
) {
    fun wipeAllData()  // Clears keystore, prefs, cached data
}
```

`PanicWipeOverlay` composable:
- Full-screen red flash overlay (matching desktop)
- "Wiping data..." text
- After wipe: navigate to Login screen

TestTags: `panic-wipe-overlay`

### 5. Demo Mode

**New files**: `DemoBanner.kt`
**Files modified**: `LoginScreen.kt`, `MainScreen.kt`

Demo mode on Android (simplified from desktop setup wizard):
- Stored as flag in `KeyValueStore` key `demo_mode_enabled`
- Login screen: when demo mode active, show demo account picker below normal login
  - "Try the demo" heading
  - Demo account cards (Demo Admin, Maria Santos, James Chen, etc.)
  - Each card: avatar + name + role badge
  - Tap → auto-login as that demo identity
- Main screen: `DemoBanner` composable at top
  - "You're exploring Llámenos" text
  - "Dismiss" button → hides banner for session
  - "Deploy your own" link (opens docs URL)

TestTags: `demo-banner`, `dismiss-demo-banner`, `demo-account-{name}`, `demo-mode-toggle`

### 6. Blasts Screen

**New files**: `BlastsScreen.kt`, `BlastCreateScreen.kt`, `BlastsViewModel.kt`, `BlastModels.kt`
**Files modified**: `Navigation.kt`, `MainScreen.kt` or `AdminScreen.kt`

Navigation: Accessible from admin panel as new tab or from conversations area. For Android, add as a 6th admin tab.

`BlastsScreen`:
- Blast list with status badges (draft, scheduled, sent, cancelled)
- "New Blast" FAB
- Per-blast: name, message preview, recipient count, delivery stats

`BlastCreateScreen` (or dialog):
- Blast name field
- Message textarea (character count)
- Recipient selection: volunteer checkboxes + "Select All"
- Schedule time picker (optional — omit for "Send Now")
- "Send" / "Schedule" buttons

`BlastsViewModel`:
```kotlin
data class BlastsUiState(
    val blasts: List<Blast> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)
fun loadBlasts()
fun createBlast(name: String, message: String, recipientIds: List<String>, scheduledAt: String?)
fun sendBlast(id: String)
fun cancelBlast(id: String)
```

Models:
```kotlin
@Serializable data class Blast(val id: String, val name: String, val message: String, val status: String, val recipientCount: Int, val sentCount: Int, val scheduledAt: String?, val createdAt: String)
@Serializable data class CreateBlastRequest(val name: String, val message: String, val recipientIds: List<String>, val scheduledAt: String?)
```

TestTags: `blasts-list`, `blasts-empty`, `blasts-loading`, `create-blast-fab`, `blast-card-{id}`, `blast-name-input`, `blast-message-input`, `blast-send-button`, `blast-schedule-button`, `blast-recipient-{pubkey}`, `blast-select-all`

### 7. Custom Fields in Note Forms

**Files modified**: `NoteCreateScreen.kt`, `NoteDetailScreen.kt`, `NotesViewModel.kt`

Dynamic form fields in note creation/editing:
- Fetch `GET /api/admin/custom-fields` → filter by `context == "notes" || context == "all"`
- Render per field type:
  - `text` → `OutlinedTextField`
  - `number` → `OutlinedTextField` with `KeyboardType.Number`
  - `select` → `ExposedDropdownMenuBox` with options
  - `checkbox` → `Switch`
  - `textarea` → `OutlinedTextField` with `minLines = 3`
- Submit custom field values with note
- Display custom field values as badges on `NoteDetailScreen`

Add to `NotesViewModel`:
```kotlin
val customFields: List<CustomFieldDefinition>
val customFieldValues: MutableMap<String, String>
fun loadCustomFields()
```

TestTags: `custom-field-{name}`, `custom-field-badge-{name}`

## Step Definition Updates

After UI is built, update stub step definitions in:
- `ProfileSettingsSteps.kt` — profile editing, sections, theme now real
- `BlastSteps.kt` — blast creation/status now real
- `DemoModeSteps.kt` — demo mode toggle/accounts now real
- `PanicWipeSteps.kt` — Android-native panic wipe now real
- `CustomFieldSteps.kt` — note custom field display now real

## Verification

```bash
cd apps/android && ./gradlew assembleDebugAndroidTest  # Compiles
cd apps/android && ./gradlew lintDebug                  # No regressions
cd apps/android && ./gradlew testDebugUnitTest          # Unit tests pass
```

## Dependency

- Requires Epic 228 (step definitions exist to test against)
- Parallel with Epic 229 (admin expansion)
- Custom fields in notes depends on Epic 229 (custom fields admin UI)

## Cross-Platform Note

The settings categorization (default vs advanced) defined in this epic is a **cross-platform architectural decision**, not an Android-specific one. When implementing the desktop settings UI, the same division should be applied — advanced/technical settings behind a collapsible "Advanced Settings" section. A separate desktop epic should reference this categorization when reorganizing the desktop settings screen. iOS (Epic TBD) should follow the same pattern.
