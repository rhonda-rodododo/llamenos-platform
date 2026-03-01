# Epic 208: Feature Parity Phase 1 — Core Volunteer Workflow

## Goal

Implement the core volunteer workflow on both iOS and Android: dashboard with shift status, note creation/viewing with E2EE, shift schedule viewing, and push notifications. These are the features a volunteer needs to take crisis calls and log notes.

## Context

Epics 206-207 established the foundation: auth flow, crypto integration, and secure key storage. This epic adds the features that make the app useful for real crisis response work. All features must work identically on both platforms, using the same API endpoints and crypto operations as the desktop app.

### Feature Scope

| Feature | Crypto Operations | API Endpoints |
|---------|-------------------|---------------|
| Dashboard | `createAuthToken()` | `GET /api/calls/active`, `GET /api/shifts/status` |
| Note Creation | `encryptNoteForRecipients()` | `POST /api/notes` |
| Note Viewing | `decryptNote()` | `GET /api/notes`, `GET /api/notes/:id` |
| Shift Schedule | `createAuthToken()` | `GET /api/shifts`, `POST /api/shifts/clock-in` |
| Push Notifications | `decryptPushPayload()` | APNs (iOS) / FCM (Android) registration |

### What's NOT in Phase 1

- Voice call answering (requires Twilio Voice SDK integration — separate effort)
- Conversations/messaging (SMS, WhatsApp, Signal)
- Admin features (volunteer management, ban lists, shift editing)
- Device linking
- File uploads
- Reports

## Implementation

### Dashboard (Both Platforms)

The dashboard shows:
1. **Shift status** — On/off shift toggle, current shift info
2. **Active calls** — Real-time list of calls waiting for volunteers
3. **Recent notes** — Last 10 notes created by this volunteer
4. **Hub connection status** — WebSocket state indicator

#### Real-Time Updates

Both platforms maintain a WebSocket connection to the Nostr relay for real-time events:
- New call notifications
- Shift change events
- Note creation confirmations

```
// WebSocket connection pattern (both platforms)
1. Connect to relay URL from hub config
2. Subscribe to events with hub pubkey filter
3. Decrypt event content with hub key
4. Route to appropriate UI handler based on event type tag
```

The hub key is obtained during auth and stored encrypted in Keychain/Keystore.

### Note Creation (E2EE)

Note encryption follows the exact same protocol as desktop (`docs/protocol/PROTOCOL.md`):

1. User writes note text + optional custom fields
2. Serialize to `NotePayload` JSON: `{ text, fields }`
3. Call `encryptNoteForRecipients(payloadJson, authorPubkey, adminPubkeys)`
4. Receive: `encryptedContent` + `authorEnvelope` + `adminEnvelopes[]`
5. POST to `/api/notes` with encrypted payload

The CryptoService handles all encryption internally — the view model never sees plaintext keys.

#### Custom Fields

Custom field definitions are fetched from the server (`GET /api/settings/custom-fields`) and rendered dynamically:
- `text` → TextField
- `number` → NumberField
- `select` → Picker/Dropdown
- `checkbox` → Toggle/Switch
- `textarea` → MultilineTextField
- `file` → File picker (Phase 2)

Fields are validated per `CustomFieldDefinition.validation` before encryption.

### Note Viewing (Decryption)

1. Fetch note list: `GET /api/notes`
2. Each note has `encryptedContent` + `recipientEnvelopes[]`
3. Find this volunteer's envelope by pubkey match
4. Call `decryptNote(encryptedContent, envelope, secretKeyHex)` via CryptoService
5. Parse decrypted `NotePayload` JSON
6. Display text + custom field values

### Shift Schedule

- View current week's shifts: `GET /api/shifts`
- Clock in/out: `POST /api/shifts/clock-in`, `POST /api/shifts/clock-out`
- View shift history
- Auto-update dashboard shift status when clocking in/out

### Push Notifications

#### Push Encryption Architecture

Two-tier push encryption uses `LABEL_PUSH_WAKE` and `LABEL_PUSH_FULL` (defined in `src/shared/crypto-labels.ts`). These labels should be added to `docs/protocol/PROTOCOL.md` §2.1 for cross-platform consistency.

**Device wake key**: Each mobile device generates a dedicated wake keypair at registration. The wake public key is sent to the server via `POST /api/devices/register`. The wake private key is stored unencrypted in Keychain/Keystore (accessible without PIN/biometric) specifically so that wake-tier pushes can show "New call available" without requiring unlock. The nsec is NOT used for wake-tier — only the device-specific wake key.

**Full-tier**: Uses the volunteer's actual pubkey (from their nsec). Only decryptable when the app is unlocked (nsec available in CryptoService).

#### iOS (APNs)

1. Register for remote notifications in `AppDelegate`
2. Generate device wake keypair, store in Keychain (`kSecAttrAccessibleAfterFirstUnlock`)
3. Send device token + wake pubkey to server: `POST /api/devices/register`
4. Handle incoming push in notification extension
5. Two tiers:
   - **Wake-tier** (`LABEL_PUSH_WAKE`): Decrypt with device wake key — shows "New call available"
   - **Full-tier** (`LABEL_PUSH_FULL`): Decrypt with nsec (only when unlocked) — shows caller ID, context

#### Android (FCM)

1. Extend `FirebaseMessagingService`
2. Generate device wake keypair, store in Android Keystore (`setUserAuthenticationRequired(false)`)
3. Send FCM token + wake pubkey to server: `POST /api/devices/register`
4. Handle data messages (not notification messages — to control display)
5. Same two-tier encryption as iOS (wake key for wake-tier, nsec for full-tier)
6. Foreground service for call-related notifications (high priority)

### Platform-Specific UI Patterns

| Feature | iOS | Android |
|---------|-----|---------|
| Navigation | `NavigationStack` with typed destinations | Compose Navigation with type-safe routes |
| Pull to refresh | `.refreshable { }` modifier | `PullToRefreshBox` composable |
| Icons | SF Symbols | Material Icons |
| System back | Automatic swipe-back | System back gesture (predictive back) |
| Loading states | `ProgressView()` | `CircularProgressIndicator()` |
| Haptic feedback | `UIImpactFeedbackGenerator` | `HapticFeedbackType.LongPress` |
| Empty states | Custom view with SF Symbol | Custom composable with Material icon |

## Testing Strategy

### iOS XCUITest

```swift
class NoteCreationUITests: XCTestCase {
    func testCreateNote() {
        let app = XCUIApplication()
        app.launch()
        // Login and unlock first...

        // Navigate to notes
        app.buttons["nav-notes"].tap()

        // Create new note
        app.buttons["create-note"].tap()

        // Enter note text
        app.textViews["note-text"].tap()
        app.textViews["note-text"].typeText("Test crisis call note")

        // Save (encrypts + sends)
        app.buttons["save-note"].tap()

        // Verify note appears in list
        XCTAssertTrue(app.staticTexts["Test crisis call note"].waitForExistence(timeout: 5))
    }
}
```

### Android Compose Test

```kotlin
@HiltAndroidTest
class NoteCreationTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun createNote() {
        // Login and unlock first...

        // Navigate to notes
        composeRule.onNodeWithTag("nav-notes").performClick()

        // Create new note
        composeRule.onNodeWithTag("create-note").performClick()

        // Enter note text
        composeRule.onNodeWithTag("note-text").performTextInput("Test crisis call note")

        // Save
        composeRule.onNodeWithTag("save-note").performClick()

        // Verify note appears
        composeRule.onNodeWithText("Test crisis call note").assertIsDisplayed()
    }
}
```

## Verification Checklist

1. Dashboard shows shift status and updates in real time
2. Note creation encrypts correctly (same ciphertext format as desktop)
3. Notes created on mobile decrypt on desktop and vice versa
4. Custom fields render correctly based on field definitions
5. Shift clock-in/out works and updates dashboard
6. Push notifications received and displayed correctly
7. Wake-tier push decrypts without nsec (metadata only)
8. Full-tier push decrypts with nsec (full content)
9. All API calls include correct Schnorr auth tokens
10. Offline handling: show cached data, queue operations

## Risk Assessment

- **Medium risk**: Cross-platform note encryption compatibility — must produce identical ciphertext format
- **Low risk**: API calls — same endpoints as desktop, well-tested
- **Medium risk**: Push notification reliability — APNs and FCM have different delivery guarantees
- **Low risk**: Shift management — simple CRUD operations
- **Mitigation**: Create cross-platform encryption test vectors; test note decrypt interop early

## Dependencies

- Epic 206 (iOS Foundation) — iOS app scaffold
- Epic 207 (Android Foundation) — Android app scaffold

## Blocks

- Epic 209 (Feature Parity Phase 2) — builds on core features
