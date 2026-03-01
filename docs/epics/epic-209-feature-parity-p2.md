# Epic 209: Feature Parity Phase 2 — Full Feature Set

## Goal

Complete feature parity with the desktop app on both mobile platforms: voice call answering via Twilio Voice SDK, E2EE conversations (SMS/WhatsApp/Signal messaging), admin capabilities, device linking, and file attachments.

## Context

Phase 1 (Epic 208) established the core volunteer workflow: dashboard, notes, shifts, push. Phase 2 adds the features that complete the crisis response experience: answering calls on your phone, managing text conversations, and admin tools.

### Feature Scope

| Feature | Priority | Complexity |
|---------|----------|------------|
| Voice call answering | P0 — Core function | High (native VoIP SDK) |
| E2EE conversations | P0 — Core function | Medium (same crypto as notes) |
| File attachments | P1 — Important | Medium (R2 upload + ECIES) |
| Admin: volunteer management | P1 — Important | Low (CRUD) |
| Admin: ban lists | P1 — Important | Low (CRUD) |
| Admin: shift editing | P1 — Important | Medium (calendar UI) |
| Admin: audit log | P2 — Nice-to-have | Low (read-only) |
| Device linking | P2 — Nice-to-have | High (ECDH provisioning) |
| Settings management | P1 — Important | Low (forms) |

## Implementation

### Voice Call Answering

The most complex mobile feature. Volunteers receive incoming calls via parallel ringing — multiple volunteers ring simultaneously, first pickup wins.

#### iOS: Twilio Voice SDK + CallKit

```swift
// SPM dependency — use official Twilio Voice iOS SDK
.package(url: "https://github.com/twilio/twilio-voice-ios", from: "6.0.0")
```

**CallKit integration**:
- Register `CXProvider` in `AppDelegate`
- Handle `CXAnswerCallAction`, `CXEndCallAction`
- Display native iOS call UI (caller ID, answer/decline buttons)
- Audio routing via `AVAudioSession` (speaker, earpiece, Bluetooth)

**Push for incoming calls**:
- VoIP push via PushKit (`PKPushRegistry`)
- Must report call to CallKit immediately on VoIP push receipt (iOS requirement)
- Background audio session activation

```swift
class CallService: NSObject, CXProviderDelegate, TVOCallDelegate {
    private let provider: CXProvider
    private var activeCall: TVOCall?
    private var pendingInvite: TVOCallInvite?  // Store invite for deferred answer

    func handleIncomingPush(_ payload: [String: Any]) {
        let callInvite = TwilioVoiceSDK.handleNotification(payload, delegate: self)
        self.pendingInvite = callInvite  // Store for when user answers via CallKit
        // Report to CallKit
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Crisis Call")
        update.hasVideo = false
        provider.reportNewIncomingCall(with: callInvite.uuid, update: update)
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        activeCall = pendingInvite?.accept(with: self)
        pendingInvite = nil
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        activeCall?.disconnect()
        pendingInvite?.reject()
        pendingInvite = nil
        action.fulfill()
    }
}
```

#### Android: Twilio Voice SDK + ConnectionService

```kotlin
// build.gradle.kts
implementation("com.twilio:voice-android:6.6.1")
```

**ConnectionService integration**:
- Register `ConnectionService` in manifest
- `telecomManager.addNewIncomingCall()` for native phone UI
- `Connection` subclass handles answer/reject/disconnect
- Audio focus management via `AudioManager`

**FCM for incoming calls**:
- High-priority data message triggers foreground service
- Full-screen intent for incoming call UI
- Notification channel: "Incoming Calls" with importance HIGH

```kotlin
class CallConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        val connection = LlamenosConnection(request.extras)
        connection.setRinging()
        return connection
    }
}

class LlamenosConnection(private val extras: Bundle) : Connection() {
    private var twilioCall: Call? = null

    override fun onAnswer() {
        twilioCall = Voice.connect(context, connectOptions, callListener)
        setActive()
    }

    override fun onDisconnect() {
        twilioCall?.disconnect()
        destroy()
    }
}
```

#### Access Token Generation

Both platforms need a Twilio Access Token to connect. The server generates this:
1. Mobile calls `POST /api/webrtc/token` with Schnorr auth
2. Server returns Twilio Access Token (same endpoint desktop uses)
3. Token used to register device with Twilio
4. Incoming calls route through Twilio → push notification → app

### E2EE Conversations

Conversations work identically to the desktop app:

1. **Inbound message arrives** (SMS/WhatsApp/Signal webhook → server)
2. **Server encrypts** with volunteer's pubkey + admin pubkeys
3. **Push notification** sent to assigned volunteer
4. **Volunteer opens conversation** → fetches encrypted messages → decrypts locally
5. **Volunteer replies** → encrypts reply → server decrypts + sends via channel adapter

The crypto operations use the same `LABEL_MESSAGE` domain separation and `encryptMessageForReaders` / `decryptMessageForReader` functions from CryptoService.

#### Conversation UI

- Message list with bubbles (inbound = left, outbound = right)
- Channel indicator (SMS badge, WhatsApp badge, Signal badge)
- Typing indicators (where supported)
- Auto-close after inactivity timeout
- Conversation assignment (auto or manual)

### File Attachments

File upload follows the E2EE file protocol:

1. **Select file** (camera, photo library, document picker)
2. **Generate random file key** → encrypt file with XChaCha20-Poly1305
3. **Encrypt metadata** (filename, mime type, size) per recipient
4. **ECIES-wrap file key** per recipient (`LABEL_FILE_KEY`)
5. **Chunked upload** to R2 via `/api/uploads`
6. **Share `FileRecord`** with conversation/note

```
// File encryption flow (same on both platforms)
fileKey = randomBytesHex()
encryptedChunks = chunkAndEncrypt(file, fileKey)
fileKeyEnvelopes = wrapKeyForRecipients(fileKey, recipientPubkeys, LABEL_FILE_KEY)
encryptedMetadata = encryptMetadataForRecipients(metadata, recipientPubkeys)
```

### Admin Features

Admin screens are simpler — mostly CRUD operations with API calls:

| Screen | API Endpoints |
|--------|---------------|
| Volunteer list | `GET /api/volunteers`, `POST /api/invites` |
| Volunteer detail | `GET /api/volunteers/:id`, `PUT /api/volunteers/:id/role` |
| Ban list | `GET /api/bans`, `POST /api/bans`, `DELETE /api/bans/:id` |
| Shift editor | `GET /api/shifts`, `POST /api/shifts`, `PUT /api/shifts/:id` |
| Audit log | `GET /api/audit` (paginated, filterable) |
| Settings | `GET /api/settings`, `PUT /api/settings` |

Admin features are gated by role — the API returns 403 for non-admin pubkeys. Mobile UI hides admin tabs when the user's role doesn't include admin permissions.

### Device Linking

Ephemeral ECDH provisioning for adding the mobile device to an existing identity:

1. **Desktop** generates provisioning room ID + QR code
2. **Mobile** scans QR code → joins ephemeral provisioning room on relay
3. **ECDH handshake** using `LABEL_DEVICE_PROVISION`:
   - Desktop sends ephemeral pubkey
   - Mobile sends ephemeral pubkey
   - Both derive shared secret via ECDH
4. **SAS verification** — 6-digit code displayed on both devices, user confirms match
5. **Desktop encrypts nsec** with shared secret → sends via relay
6. **Mobile decrypts nsec** → imports into CryptoService → stores PIN-encrypted

This is the same flow described in `docs/protocol/PROTOCOL.md` §6 Device Provisioning.

### Settings Management

Volunteer settings:
- Notification preferences (call sounds, message alerts)
- Language selection (13 locales)
- Auto-lock timeout (1min, 5min, 15min, 30min)
- Biometric unlock toggle
- Hub connection status

Admin settings (subset of desktop admin):
- Telephony provider config
- Messaging channel toggles
- Custom field management
- Spam mitigation settings

## Testing Strategy

Voice call tests require Twilio test credentials and are best done as integration tests rather than unit tests. Conversation and file tests can use the same Playwright-style pattern with mock crypto.

### Cross-Platform Interop Tests

Critical: Notes and messages encrypted on mobile MUST decrypt on desktop, and vice versa. Create test vectors:

1. Encrypt a note on iOS → verify it decrypts on desktop
2. Encrypt a note on Android → verify it decrypts on desktop
3. Encrypt a note on desktop → verify it decrypts on both mobile platforms
4. Same for messages and file key envelopes

These interop tests validate that all three platforms use identical crypto.

## Verification Checklist

1. Incoming calls ring on mobile with native call UI
2. Answering a call on mobile cancels ringing on other devices
3. Call audio works (speaker, earpiece, Bluetooth)
4. Conversations show decrypted messages
5. Sending a reply encrypts and delivers via correct channel
6. File upload encrypts, chunks, and uploads correctly
7. File download decrypts and displays correctly
8. Admin screens show/hide based on user role
9. Device linking via QR code works between desktop and mobile
10. Settings changes persist and sync

## Risk Assessment

- **High risk**: Twilio Voice SDK integration — platform-specific, complex audio routing
- **Medium risk**: VoIP push (iOS) — strict Apple requirements for CallKit reporting timing
- **Medium risk**: ConnectionService (Android) — varies by OEM (Samsung, Xiaomi have custom call UIs)
- **Low risk**: Conversations — same crypto as notes, well-proven
- **Low risk**: Admin features — simple CRUD
- **Mitigation**: Test voice on physical devices early; emulators don't fully support VoIP

## Dependencies

- Epic 208 (Feature Parity Phase 1) — core volunteer workflow

## Blocks

- Epic 210 (Release Prep)
