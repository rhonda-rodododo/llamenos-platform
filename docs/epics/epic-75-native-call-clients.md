# Epic 75: Native Call-Receiving Clients (Desktop + Mobile)

## Problem Statement

Currently, volunteers must keep a browser window open and focused to receive WebRTC calls. This is impractical for real-world hotline operation where volunteers need to be notified of incoming calls while doing other work. Additionally, when volunteers use PSTN forwarding (Twilio calling their personal phones), their phone numbers are exposed to the telephony provider.

**User pain points:**
- Impractical to stare at browser window waiting for calls
- Personal phone numbers exposed when using PSTN call forwarding
- No push notifications for incoming calls
- Browser must remain open and active

**Privacy goals:**
- Zero exposure of volunteer personal phone numbers to third parties
- Calls handled entirely via WebRTC (audio never leaves volunteer-controlled endpoints)
- Push notifications that don't leak call metadata to notification services

## Requirements

### Functional Requirements

1. **Desktop Client (Tauri)**
   - Native application for macOS and Windows (Linux deferred — see architecture notes)
   - System tray presence with call notification badges
   - Twilio Voice SDK call handling via WebView
   - Background operation (minimize to tray)
   - Auto-start on login (optional)
   - Same E2EE key management as web app

2. **Mobile Client (React Native)**
   - iOS and Android applications
   - Push notifications for incoming calls
   - VoIP push for iOS (CallKit integration) with push key separation
   - Background call handling
   - Lock screen call UI
   - Same E2EE key management as web app

3. **Shared Requirements**
   - Nostr keypair authentication (same identity across all devices)
   - Device linking via QR code (existing provisioning protocol)
   - PIN-encrypted key storage
   - Real-time presence sync via Nostr relay (Epic 76)
   - Note-taking during calls
   - E2EE note encryption

### Non-Functional Requirements

- **Privacy**: No personal phone numbers exposed to any third party
- **Reliability**: Must not miss calls when app is backgrounded
- **Latency**: Call notification within 1 second of ring start
- **Battery**: Mobile app should not drain battery when idle

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Existing Infrastructure                    │
├─────────────────────────────────────────────────────────────┤
│  CallRouterDO  │  Nostr Relay (Epic 76)  │  Twilio Voice   │
└───────┬────────┴─────────┬───────────────┴──────┬──────────┘
        │                  │                       │
        │   Call Events    │   Presence/Signaling  │  Twilio SDK
        ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Native Client Layer                        │
├────────────────────────┬────────────────────────────────────┤
│     Tauri Desktop      │        React Native Mobile          │
├────────────────────────┼────────────────────────────────────┤
│  • Rust backend        │  • @twilio/voice-react-native-sdk   │
│  • WebView frontend    │  • CallKit (iOS) / ConnectionSvc    │
│  • Twilio Voice JS SDK │  • Push notification handlers       │
│  • System tray         │  • react-native-quick-crypto        │
│  • Auto-launch         │  • Background execution             │
│  • macOS + Windows     │  • iOS + Android                    │
└────────────────────────┴────────────────────────────────────┘
```

### Call Handling Architecture Reality

The existing `webrtc.ts` is NOT raw WebRTC — it is a wrapper around the Twilio Voice SDK (`@twilio/voice-sdk`). The SDK handles ICE negotiation, DTLS, SRTP, and TURN traversal internally. This has significant implications for native clients:

**Desktop (Tauri):**
- The Twilio Voice JS SDK works inside WebView, which is the correct approach
- macOS: WKWebView has full WebRTC support — Twilio SDK works
- Windows: WebView2 (Chromium-based) has full WebRTC support — Twilio SDK works
- Linux: WebKitGTK does NOT have reliable WebRTC support. Linux desktop is deferred to a future phase that either bundles a Chromium WebView or implements native WebRTC
- Initial release targets macOS + Windows only

**Mobile (React Native):**
- Must use `@twilio/voice-react-native-sdk` — a completely separate native SDK with its own Swift/Kotlin call handling layers
- This is NOT `react-native-webrtc` — the Twilio React Native SDK has its own API surface
- The existing web call flow code (`webrtc.ts`, `call-manager.ts`) CANNOT be reused for call handling
- Call setup, audio routing, and teardown are handled by the native SDK, not by JS

**Code Sharing Reality:**
- UI components (note-taking, call status display, dashboard) can be shared
- Crypto layer (`@noble/curves`, `@noble/ciphers`, key management) can be shared with porting (see crypto section)
- Nostr relay communication can be shared
- Call handling layer must be rewritten per platform: Twilio JS SDK for web/desktop, Twilio React Native SDK for mobile

### Desktop Client (Tauri)

**Why Tauri over Electron:**
- Smaller binary size (~10MB vs ~150MB)
- Lower memory footprint
- Native Rust backend for crypto operations
- Better security model (no Node.js in main process)

**Core Components:**

1. **Rust Backend (`src-tauri/`)**
   ```rust
   // Key management - reuse existing crypto logic via wasm
   mod key_manager {
       // PBKDF2 key derivation
       // XChaCha20-Poly1305 encryption
       // BIP-340 Schnorr signatures
   }

   // Nostr relay connection management (replaces WebSocket)
   mod relay_client {
       // Connect to Nostr relay per Epic 76
       // Subscribe to call events
       // Reconnection with exponential backoff
   }

   // System tray and notifications
   mod tray {
       // Badge updates
       // Native notifications
       // Menu actions
   }
   ```

2. **WebView Frontend**
   - Reuse existing React components
   - Twilio Voice JS SDK runs inside WebView (handles all WebRTC internally)
   - Tauri-specific adaptations for:
     - Window management (minimize to tray)
     - Native file dialogs (backup export)
     - System notifications

3. **Platform Support Matrix**

   | Platform | WebView Engine | Twilio SDK Works | Status |
   |----------|---------------|-----------------|--------|
   | macOS | WKWebView | Yes | Phase 1 |
   | Windows | WebView2 (Chromium) | Yes | Phase 2 |
   | Linux | WebKitGTK | No (unreliable WebRTC) | Deferred |

**Build & Distribution:**
- GitHub Actions for cross-platform builds
- Code signing for macOS (notarization) and Windows (Authenticode)
- Auto-updater via Tauri's built-in updater

### Mobile Client (React Native)

**Core Dependencies:**
- `@twilio/voice-react-native-sdk` - Native Twilio Voice SDK (NOT `react-native-webrtc`)
- `react-native-callkit` - iOS VoIP integration
- `react-native-voip-push-notification` - iOS VoIP push
- `@notifee/react-native` - Android foreground service notifications
- `react-native-keychain` - Secure key storage
- `react-native-quick-crypto` - Native crypto module (replaces `crypto.subtle`)
- `@noble/curves`, `@noble/ciphers`, `@noble/hashes` - Crypto (via Hermes with BigInt)

**Minimum React Native Version:** 0.71+ (Hermes 0.12+ required for BigInt support, needed by `@noble/curves` v2.x and `nostr-tools`)

### React Native Crypto Porting

`key-store.ts` uses `crypto.subtle.importKey` and `crypto.subtle.deriveBits` for PBKDF2 key derivation. These Web Crypto APIs do NOT exist in React Native's Hermes engine.

**Required Changes:**
- Replace `crypto.subtle` PBKDF2 calls with `react-native-quick-crypto` (provides a Node.js-compatible `crypto` API backed by native OpenSSL/BoringSSL)
- `@noble/curves` v2.x requires BigInt — works in Hermes >= 0.12 (React Native >= 0.71)
- `@noble/ciphers` and `@noble/hashes` work without BigInt (pure JS, no platform dependencies)
- `nostr-tools` uses `@noble/curves` internally — same BigInt requirement applies
- Create a `crypto-platform.ts` abstraction that selects Web Crypto (browser/WebView) or `react-native-quick-crypto` (RN) at runtime
- Test all crypto paths in the React Native environment — subtle differences in encoding can cause interoperability failures

### iOS-Specific

#### Push Key Separation (VoIP Push + PIN Deadlock Fix)

**The Problem:** iOS kills apps that don't call `CXProvider.reportNewIncomingCall()` within ~30 seconds of receiving a VoIP push. But the volunteer's nsec is PIN-encrypted. If the volunteer hasn't entered their PIN, the app cannot decrypt the push payload to show call details. This is a deadlock.

**The Solution:** A separate device-specific wake key that does NOT require PIN entry:

1. **During device provisioning**, generate a random 256-bit symmetric key (the "wake key")
2. Store the wake key in iOS Keychain with `kSecAttrAccessibleAfterFirstUnlock` (available after first device unlock, no PIN/biometric required)
3. Server encrypts a minimal push payload with the wake key: `{ callId, signal: "incoming_call" }`
4. On VoIP push receipt, app decrypts using wake key immediately — no PIN needed
5. CallKit UI shown immediately with generic information ("Incoming Call")
6. Full call details (caller last 4 digits, etc.) decrypted ONLY after volunteer enters PIN and nsec is available

**Security Properties:**
- The wake key is NOT the nsec — compromise reveals only "a call is coming in"
- Wake key is device-specific (generated per device, not derived from nsec)
- No caller identity, volunteer identity, or call content is accessible via wake key
- The wake key is registered with the server during device provisioning alongside the VoIP push token

```swift
// VoIP push handler
func pushRegistry(_ registry: PKPushRegistry,
                  didReceiveIncomingPushWith payload: PKPushPayload,
                  for type: PKPushType) {
    // 1. Decrypt with wake key (always available after first unlock)
    let wakeKey = Keychain.load(key: "wake_key",
                                accessibility: .afterFirstUnlock)
    let minimal = decrypt(payload.dictionaryPayload["encrypted"], with: wakeKey)

    // 2. Report to CallKit IMMEDIATELY (must happen within 30s)
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "Incoming Call")
    update.hasVideo = false
    provider.reportNewIncomingCall(with: UUID(), update: update) { error in
        // CallKit UI is now showing
    }

    // 3. Full details available only after PIN entry unlocks nsec
    // UI prompts for PIN → decrypt full payload → update CallKit display
}
```

#### CallKit Integration

```swift
// CXProvider configuration
let config = CXProviderConfiguration()
config.supportsVideo = false
config.maximumCallsPerCallGroup = 1
config.supportedHandleTypes = [.generic] // Hide caller ID

// Report incoming call
provider.reportNewIncomingCall(with: uuid, update: update)
```

#### Background Execution
- VoIP push keeps connection alive
- Audio session configured for VoIP
- No continuous background execution needed

### Android-Specific

1. **Push Notifications (FCM)**
   - High-priority FCM data messages
   - Foreground service for call handling
   - Full-screen intent for incoming calls

2. **ConnectionService Integration**
   ```kotlin
   // Self-managed ConnectionService
   class HotlineConnectionService : ConnectionService() {
       override fun onCreateIncomingConnection(
           connectionManagerPhoneAccount: PhoneAccountHandle,
           request: ConnectionRequest
       ): Connection {
           // Return custom Connection backed by Twilio RN SDK
       }
   }
   ```

3. **Background Execution**
   - Foreground service during active call
   - Firebase messaging for push-based wake

### Push Notification Privacy

**Problem:** Push notifications typically route through Apple/Google servers, potentially leaking metadata.

**Solution: Encrypted Push Payloads**

1. **Server sends minimal push:**
   ```json
   {
     "type": "call",
     "encrypted": "<XChaCha20-Poly1305 ciphertext>",
     "nonce": "<24 bytes hex>"
   }
   ```

2. **Two-tier decryption:**
   - Wake key decrypts minimal payload (callId, signal type) — no PIN required
   - nsec decrypts full payload (caller last4, call metadata) — requires PIN

3. **Apple/Google see only:**
   - That a push was delivered to this device
   - Opaque ciphertext (no call details, no identity)

### Multi-Device Answer Coordination

**The Problem:** When a volunteer has multiple devices (web + mobile + desktop), two devices could attempt to answer simultaneously. Without atomic coordination, both might connect, causing audio conflicts.

**The Solution: Server-Authoritative Answer with Optimistic UI**

1. Volunteer taps "Answer" on any device
2. Client sends `POST /api/calls/{callId}/answer` to CallRouterDO
3. CallRouterDO atomically sets `answeredBy = { volunteerId, deviceId, timestamp }`
4. First request succeeds with `200 OK` — this device connects audio
5. Subsequent requests receive `409 Conflict` — these devices show "Answered on another device"
6. Server publishes authoritative `call:answered` event via Nostr relay (Epic 76) to all subscribed devices
7. Client shows a brief "Confirming answer..." interstitial between tap and audio connection

**Twilio Integration:**
- Each volunteer device gets a separate Twilio CallSid (standard parallel dial pattern)
- When one device answers, server cancels the other CallSids via Twilio REST API
- This is how parallel ringing already works — one pickup terminates other legs

```typescript
// CallRouterDO answer handler
async handleAnswer(callId: string, volunteerId: string, deviceId: string) {
  const call = await this.getCall(callId);

  // Atomic check-and-set
  if (call.answeredBy) {
    return new Response(JSON.stringify({
      error: 'already_answered',
      answeredBy: call.answeredBy.deviceId === deviceId ? 'you' : 'another_device'
    }), { status: 409 });
  }

  call.answeredBy = { volunteerId, deviceId, timestamp: Date.now() };
  await this.persistCall(call);

  // Cancel other ring legs via Twilio
  await this.cancelOtherLegs(callId, deviceId);

  // Publish via Nostr relay
  await this.publishEvent('call:answered', { callId, volunteerId, deviceId });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

### Key Management

**Reuse Existing Protocol:**
- Same Nostr keypair (nsec/npub) as web app
- Device linking via QR code provisioning (Epic 76.2)
- PIN-encrypted key storage

**Platform-Specific Storage:**

| Platform | Storage | nsec Protection | Wake Key Protection |
|----------|---------|----------------|-------------------|
| macOS | Keychain | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | N/A (desktop uses foreground) |
| Windows | Credential Manager (DPAPI) | Encrypted at rest, available when logged in | N/A |
| iOS | Keychain + Secure Enclave | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + `biometryCurrentSet` | `kSecAttrAccessibleAfterFirstUnlock` |
| Android | Keystore (TEE/StrongBox) | Requires user authentication | Available after first unlock |

**iOS Keychain Accessibility Rationale:**
- **nsec**: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` with `biometryCurrentSet` access control — highest protection against nation-state adversary. Only accessible when device is unlocked AND current biometric set matches. Does not migrate to new devices or backups.
- **Wake key**: `kSecAttrAccessibleAfterFirstUnlock` — acceptable because wake key reveals only "a call is coming in" with no identity or content data. Must be available for VoIP push handling when device is locked.
- **Hub key** (if applicable): `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — same rationale as nsec.

**Key Derivation:**
```
PIN -> PBKDF2-SHA256 (600K iterations) -> KEK
KEK + nsec -> XChaCha20-Poly1305 -> encrypted_nsec (stored)
```

### Call Flow

```
1. Server detects incoming call via Twilio webhook
2. CallRouterDO identifies on-shift volunteers
3. Server sends push notifications + Nostr relay event to all on-shift devices
4. Each device creates a separate Twilio call leg (parallel dial)
5. Client receives push/event, decrypts with wake key, shows incoming call UI
6. Volunteer answers on one device -> POST /api/calls/{callId}/answer
7. CallRouterDO atomically confirms answer, cancels other legs
8. Client shows "Confirming answer..." interstitial
9. Twilio SDK connects audio on confirmed device
10. Other devices receive call:answered event, dismiss UI
11. Call in progress (audio via Twilio SDK, not raw WebRTC)
12. Hangup -> Twilio SDK disconnects, server notified
```

## Implementation Phases

### Phase 1: Tauri Desktop Foundation — macOS (2 weeks)

**Tasks:**
1. Initialize Tauri project with React frontend
2. Port key-manager.ts to work in Tauri context
3. Implement system tray with presence indicator
4. Nostr relay connection with reconnection logic (Epic 76)
5. Native notifications for incoming calls
6. Twilio Voice JS SDK call handling via WKWebView
7. Multi-device answer coordination (client side)

**Deliverables:**
- Desktop app that can log in, show presence, receive and handle calls on macOS
- Manual testing on macOS (primary dev platform)

### Phase 2: Desktop Polish + Windows (1 week)

**Tasks:**
1. Audio device selection
2. Call controls (mute, hangup)
3. Note-taking during calls
4. Auto-updater configuration
5. Windows build and testing (WebView2)
6. GitHub Actions for automated macOS + Windows builds

**Deliverables:**
- Fully functional desktop app on macOS and Windows
- Automated CI builds with code signing

### Phase 3: React Native Foundation (2 weeks)

**Tasks:**
1. Initialize React Native project (bare workflow, not Expo)
2. Implement crypto module via `react-native-quick-crypto` (replaces `crypto.subtle`)
3. Verify `@noble/curves` BigInt support in Hermes >= 0.12
4. Secure key storage (Keychain with correct accessibility levels / Android Keystore)
5. Nostr relay connection management
6. Basic UI: login, dashboard, call list

**Deliverables:**
- Mobile app shell with authentication and crypto working
- Shared code structure for iOS/Android
- Crypto interoperability verified with web app (same keys produce same outputs)

### Phase 4: iOS VoIP Integration (1.5 weeks)

**Tasks:**
1. VoIP push notification setup (APNs)
2. Wake key generation and Keychain storage during device provisioning
3. Push key separation: wake key decryption in `didReceiveIncomingPush`
4. CallKit integration with immediate reporting
5. `@twilio/voice-react-native-sdk` integration
6. Background audio session
7. Full incoming call flow (push -> wake key decrypt -> CallKit -> PIN prompt -> full decrypt -> Twilio SDK connect)
8. TestFlight distribution

**App Store Strategy:**
- Prepare App Review notes explaining crisis hotline use case and VoIP entitlement need
- Obtain VoIP entitlement pre-approval before first submission
- Register as healthcare-adjacent app if applicable to Apple's categories
- Expect extended review timeline (2-4 weeks, not days) for VoIP + mental health category
- Generic "Hotline" name supports security but may confuse reviewers — prepare supplementary materials explaining the privacy rationale

**Deliverables:**
- iOS app receiving calls via VoIP push with push key separation
- Native call UI via CallKit
- TestFlight build submitted for internal testing

### Phase 5: Android Call Integration (1.5 weeks)

**Tasks:**
1. FCM high-priority messaging
2. ConnectionService implementation with Twilio RN SDK
3. Foreground service for active calls
4. Full-screen incoming call intent
5. Play Store internal testing track

**App Store Strategy:**
- Document health/crisis app use case for Play Store review
- Prepare privacy policy covering VoIP and push notification data handling
- Expected review timeline: 1-2 weeks

**Deliverables:**
- Android app receiving calls via FCM
- Native-feeling call experience

### Phase 6: E2E Testing & Hardening (1 week)

**Tasks:**
1. Cross-platform E2E tests (Detox for mobile, WebdriverIO for desktop)
2. Push notification reliability testing
3. Multi-device answer race condition testing
4. Network interruption handling
5. Battery usage optimization
6. Security audit of native crypto implementations
7. Crypto interoperability tests (web <-> mobile <-> desktop produce identical ciphertexts)

**Deliverables:**
- Test suite covering critical paths
- Performance and battery benchmarks
- Multi-device coordination verified under load

## Server-Side Changes

### Push Notification Infrastructure

1. **Device Registration (updated for wake key)**
   ```typescript
   // Endpoint for push token + wake key registration
   POST /api/devices/register
   {
     platform: 'ios' | 'android',
     pushToken: string,
     voipToken?: string,       // iOS VoIP token (separate from regular push)
     wakeKeyPublic: string,    // Device-specific wake key for push encryption
   }
   ```

2. **FCM Integration (Android)**
   - Service account credentials in Cloudflare secrets
   - High-priority data messages (not notification messages)

3. **Two-Tier Push Encryption**
   ```typescript
   // Minimal payload encrypted with wake key (no PIN required)
   const wakePayload = encrypt(
     JSON.stringify({ callId: call.id, signal: 'incoming_call' }),
     device.wakeKey
   );

   // Full payload encrypted with volunteer's pubkey (requires PIN)
   const fullPayload = encryptForPublicKey(
     JSON.stringify({ callId: call.id, callerLast4: call.callerLast4, timestamp: Date.now() }),
     volunteer.pubkey
   );

   // Push contains both
   sendPush(device.voipToken, { wake: wakePayload, full: fullPayload });
   ```

### CallRouterDO Changes

1. Send push notifications + Nostr relay events on ring start
2. Atomic `answeredBy` field to prevent duplicate answers (returns `409 Conflict`)
3. Cancel non-answering Twilio call legs after answer confirmed
4. Track which devices answered (prevent duplicate answers across multi-device)
5. Handle multi-device presence (same volunteer on web + mobile + desktop)
6. Publish authoritative `call:answered` event via Nostr relay

## Security Considerations

### Native Code Security

- **Tauri**: Rust backend compiled to native code, no JS in privileged context
- **React Native**: Crypto via `react-native-quick-crypto` (native OpenSSL), keys in platform secure storage
- **Code signing**: All binaries signed to prevent tampering

### Push Notification Threats

| Threat | Mitigation |
|--------|------------|
| Apple/Google see push content | Encrypted payload, minimal metadata |
| Push token theft | Tokens scoped to app bundle ID |
| Replay attacks | Timestamp + call ID in encrypted payload |
| Push spoofing | Validate push comes from our server (APNs/FCM auth) |
| VoIP push timeout (iOS 30s) | Wake key separation — decrypt without PIN |
| Wake key compromise | Reveals only "call incoming" — no identity or content |

### Key Storage

| Platform | Key | Storage | Protection Level |
|----------|-----|---------|-----------------|
| macOS | nsec | Keychain + Secure Enclave | Unlocked + this device only |
| Windows | nsec | Credential Manager | DPAPI encryption |
| iOS | nsec | Keychain | `whenUnlockedThisDeviceOnly` + `biometryCurrentSet` |
| iOS | wake key | Keychain | `afterFirstUnlock` (acceptable — minimal data) |
| Android | nsec | Keystore | TEE/StrongBox + user auth required |
| Android | wake key | Keystore | TEE/StrongBox, no auth required |

## Success Criteria

1. **Functionality**
   - [ ] Desktop app receives and handles calls on macOS and Windows
   - [ ] Mobile app receives and handles calls on iOS and Android
   - [ ] Device linking works between web <-> desktop <-> mobile
   - [ ] Notes can be created and are E2EE
   - [ ] Multi-device answer coordination works atomically (no double-answer)

2. **Privacy**
   - [ ] No volunteer phone numbers exposed to any party
   - [ ] Push notification content encrypted (two-tier: wake key + pubkey)
   - [ ] Keys stored securely in platform keystores with correct accessibility levels
   - [ ] Wake key compromise reveals no identity or call content

3. **Reliability**
   - [ ] Calls received within 1 second of ring start
   - [ ] No missed calls when app is backgrounded (mobile)
   - [ ] iOS VoIP push + CallKit works without PIN entry (wake key separation)
   - [ ] Graceful handling of network interruptions

4. **User Experience**
   - [ ] Native call UI on mobile (CallKit/ConnectionService)
   - [ ] System tray integration on desktop
   - [ ] Auto-updater for desktop clients
   - [ ] "Confirming answer..." interstitial provides clear feedback

## Open Questions

1. **Linux desktop support**: Deferred due to WebKitGTK WebRTC limitations. Options: bundle Chromium WebView (CEF), wait for WebKitGTK improvements, or build native WebRTC integration.

2. **Expo vs bare React Native**: Bare workflow recommended for full control over native code (VoIP push, CallKit, ConnectionService require deep native access).

3. **Push notification service**: Direct APNs/FCM for reliability, encrypted payloads for privacy. Self-hosted alternatives (ntfy) considered but not recommended for VoIP wake reliability.

4. **App store distribution costs:**
   - macOS: Developer ID certificate (~$99/year)
   - Windows: Authenticode certificate (~$200-400/year)
   - iOS/Android: App Store Connect + Play Console (~$125 total)

5. **Twilio React Native SDK maturity**: `@twilio/voice-react-native-sdk` is relatively new. Evaluate stability and feature parity with the JS SDK before committing.

## Dependencies

- **Epic 76 (Nostr Relay Sync) — REQUIRED FIRST**
  - Native clients receive call notifications via Nostr relay
  - Eliminates need for dedicated WebSocket server
  - Push notifications become backup/wake mechanism only
- **Epic 76.2 (Key Architecture) — REQUIRED**
  - Device key management for multi-device provisioning
  - Wake key registration during device linking
- **Epic 76.1 (Worker-to-Relay) — Must Be Resolved**
  - Push notification design depends on how the Worker publishes events to the relay
- Existing Twilio Voice SDK infrastructure in web app

## Execution Context

### Existing Call Handling
- `src/client/lib/webrtc.ts` — Twilio Voice JS SDK wrapper (NOT raw WebRTC)
- `src/client/lib/call-manager.ts` — Call state management
- These work in Tauri WebView (WKWebView/WebView2) but NOT in React Native

### Crypto Layer Portability
- `@noble/curves` v2.x requires BigInt — needs Hermes >= 0.12 (React Native >= 0.71)
- `@noble/ciphers` and `@noble/hashes` work without BigInt (pure JS)
- `src/client/lib/key-store.ts` — uses `crypto.subtle.importKey` for PBKDF2; needs `react-native-quick-crypto` replacement

### Nostr Relay Connection
- After Epic 76: `src/client/lib/nostr/relay.ts` — `RelayManager` class; portable to native clients
- `nostr-tools` works with BigInt (same Hermes requirement as `@noble/curves`)

### Key Manager
- `src/client/lib/key-manager.ts` — closure-scoped secret key; auto-lock on idle (5 min) + visibility change
- Native clients need platform-specific secure storage (Keychain, Credential Manager, Keystore)

### Push Notification Infrastructure
- `src/worker/durable-objects/call-router.ts` — needs push notification sending alongside Nostr relay publish
- New endpoint: `POST /api/devices/register` for push token + wake key registration
