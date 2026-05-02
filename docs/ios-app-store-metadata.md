# Llámenos — iOS App Store Metadata

## App Information

**App Name:** Llamenos
*(Note: The App Store does not support accented characters in the app name field. Use "Llamenos" in the name field; the in-app display name retains "Llámenos".)*
*(10 characters — well within the 30-character limit)*

**Subtitle (30 chars max):**
```
Secure crisis response
```
*(22 characters)*

**Bundle ID:** `org.llamenos.hotline`

**Primary Category:** Social Networking

**Secondary Category:** Utilities

**SKU:** `llamenos-ios-v1`

---

## App Store Listing

### Description (4000 chars max)

```
Llamenos is open-source software for operating secure crisis response hotlines — built for organizations that need to protect caller and volunteer identities against serious adversaries.

END-TO-END ENCRYPTED BY DESIGN

Every note, transcript, report, and message is end-to-end encrypted. The server stores only ciphertext — your hosting provider, your hub administrator, and Llamenos itself cannot read the content of your calls. Encryption happens on your device. Decryption happens only on authenticated volunteer devices.

Each note uses a unique random key with forward secrecy: compromising one note does not compromise others. Keys are wrapped separately for the volunteer and each admin using HPKE (RFC 9180), a modern standard used in TLS 1.3.

HOW IT WORKS

When someone calls your organization's hotline number, all on-shift volunteers receive simultaneous push notifications. The first volunteer to answer takes the call. Other notifications are cleared automatically.

During the call, volunteers write encrypted notes in real-time. Optional on-device transcription uses AI running entirely within the app — audio never leaves your device. After the call, notes are sealed and stored as ciphertext on your self-hosted server.

FOR VOLUNTEER TEAMS

• Shift scheduling — admins define recurring shifts and ring groups
• Parallel ringing — all on-shift volunteers ring simultaneously
• Encrypted notes — per-call forward-secret note encryption
• Case management — template-driven reports with custom fields
• Contact records — encrypted caller contact directory
• Multi-hub support — volunteers can be members of multiple hubs, receiving calls from all simultaneously

FOR ADMINISTRATORS

• Volunteer management — invite, assign roles, manage shifts
• Real-time ban lists — block abusive callers instantly
• Spam mitigation — rate limiting, voice bot detection
• Audit logs — tamper-evident hash-chained activity log
• Configurable telephony — works with Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, or FreeSWITCH

PRIVACY FIRST

• Server cannot read encrypted content (zero-knowledge design)
• On-device transcription — audio never transmitted to any server
• No advertising, no tracking, no behavioral profiling
• GDPR-compliant — EU organization, data processing agreements available
• Reproducible builds — verify the published app matches the public source code
• iOS Keychain-backed encryption keys — device private keys never leave secure hardware

SELF-HOSTED INFRASTRUCTURE

Your organization runs its own hub. There is no central Llamenos cloud. Your data stays on infrastructure you control, in the jurisdiction you choose. Deploy via Docker Compose on any Linux VPS.

13 LANGUAGES

The app is available in English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, and German — designed for multilingual volunteer teams serving diverse communities.

OPEN SOURCE

Llamenos is fully open source under the AGPL-3.0 license. Audit the code, run your own instance, or contribute at github.com/rhonda-rodododo/llamenos-platform.

---

Llamenos is software for organizations that operate crisis response services. The app requires an invitation from an administrator of a self-hosted hub to use. It is not a consumer crisis service — if you are in crisis, please contact your local emergency services or a crisis helpline in your region.
```

*(Character count: approximately 2,870 — well within the 4,000 character limit)*

---

### Keywords (100 chars max)

```
crisis,hotline,volunteer,encrypted,secure,E2EE,notes,shifts,response,coordination
```

*(82 characters)*

**Alternate keyword sets to A/B test:**
- `crisis line,hotline,E2EE,volunteer,secure,shifts,notes,encrypted,response`
- `crisis,hotline,encrypted,volunteer,secure,nonprofit,shifts,coordination,response`

---

### Promotional Text (170 chars max)

*(Promotional text can be updated at any time without a new app review — use this for timely messaging.)*

```
Secure crisis hotline coordination. E2EE notes, parallel call routing, and shift management. Your data, your infrastructure.
```
*(125 characters)*

**Alternates:**
- `End-to-end encrypted crisis response coordination for volunteer organizations. Self-hosted. Open source. 13 languages.` (118 chars)
- `The secure backbone for your crisis hotline. E2EE notes, shift management, and call routing — running on your own server.` (121 chars)

---

### What's New (first release)

```
Initial release of Llamenos for iOS.

• End-to-end encrypted call notes and reports
• Shift management and parallel call routing
• Template-driven case management
• On-device transcription (audio never leaves your device)
• Support for 13 languages
• iOS Keychain-backed encryption keys
• Self-hosted — your data stays on your infrastructure
```

---

## Age Rating Questionnaire

Answer all questions "None" / "No":

| Question | Answer |
|----------|--------|
| Made for Kids | No |
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Unrestricted Web Access | No |
| Gambling and Contests | No |

**Resulting rating: 4+**

---

## App Privacy Details (Nutrition Labels)

These declarations must be entered in App Store Connect under App Privacy. They map to the Privacy Manifest at `apps/ios/Sources/PrivacyInfo.xcprivacy`.

### Tracking

**Does this app track users?** No

The app does not use data to track users across apps or websites owned by other companies, and does not share data with data brokers. `NSPrivacyTracking: false` is declared in the Privacy Manifest.

**Tracking domains:** None

---

### Data Collected

#### User Content

| Attribute | Value |
|-----------|-------|
| Data Type | Other User Content (`NSPrivacyCollectedDataTypeOtherUserContent`) |
| Collected | Yes |
| Linked to Identity | Yes — content is cryptographically linked to the volunteer's device key |
| Used for Tracking | No |
| Purpose | App Functionality — volunteers write encrypted call notes and case reports |

**Important note for App Store Connect:** Although user content (notes, reports, messages) is collected and linked to identity, it is **end-to-end encrypted**. The app developer and server operator cannot read the content. This should be disclosed in the app's description and privacy policy. Apple does not currently have a "E2EE" exemption for this label, so mark as "Linked to Identity: Yes" and add an explanatory note in the privacy policy URL.

#### Identifiers

| Attribute | Value |
|-----------|-------|
| Data Type | Device ID (`NSPrivacyCollectedDataTypeDeviceID`) |
| Collected | Yes — APNs push token is stored server-side for push delivery |
| Linked to Identity | Yes |
| Used for Tracking | No |
| Purpose | App Functionality — push token used to deliver incoming call notifications |

| Attribute | Value |
|-----------|-------|
| Data Type | User ID (`NSPrivacyCollectedDataTypeUserID`) |
| Collected | Yes — Ed25519 public key serves as the user identifier (Nostr-compatible) |
| Linked to Identity | Yes |
| Used for Tracking | No |
| Purpose | App Functionality — user identity for authentication and E2EE key wrapping |

#### Usage Data

| Attribute | Value |
|-----------|-------|
| Data Type | Product Interaction (`NSPrivacyCollectedDataTypeProductInteraction`) |
| Collected | Yes — audit log records call events, note creation, admin actions |
| Linked to Identity | Yes — audit log entries are attributed to the acting user |
| Used for Tracking | No |
| Purpose | App Functionality — tamper-evident audit log for organizational accountability |

#### Diagnostics

| Attribute | Value |
|-----------|-------|
| Data Type | Crash Data (`NSPrivacyCollectedDataTypeCrashData`) |
| Collected | Yes — crash reports sent to crash reporting service |
| Linked to Identity | No — crash reports are anonymized |
| Used for Tracking | No |
| Purpose | App Functionality — crash diagnosis and stability improvements |

| Attribute | Value |
|-----------|-------|
| Data Type | Performance Data (`NSPrivacyCollectedDataTypePerformanceData`) |
| Collected | Yes — performance diagnostics |
| Linked to Identity | No — performance data is not linked to individual users |
| Used for Tracking | No |
| Purpose | App Functionality — app stability and performance monitoring |

#### Location

| Attribute | Value |
|-----------|-------|
| Data Type | Precise Location (`NSPrivacyCollectedDataTypePreciseLocation`) |
| Collected | Yes — optional, used to autofill location fields in case reports |
| Linked to Identity | Yes — stored within E2EE case report content |
| Used for Tracking | No |
| Purpose | App Functionality — report autofill, with explicit user permission |

#### Sensitive Info

| Attribute | Value |
|-----------|-------|
| Data Type | Audio Data (`NSPrivacyCollectedDataTypeAudioData`) |
| Collected | Yes — call audio processed for on-device transcription |
| Linked to Identity | Yes — transcripts associated with call records |
| Used for Tracking | No |
| Purpose | App Functionality — on-device transcription; audio never transmitted off-device |

| Attribute | Value |
|-----------|-------|
| Data Type | Phone Number (`NSPrivacyCollectedDataTypePhoneNumber`) |
| Collected | Yes — admin-entered contact records may include phone numbers |
| Linked to Identity | Yes — contact record associated with caller |
| Used for Tracking | No |
| Purpose | App Functionality — caller contact directory; stored E2EE on the hub |

**Note:** Caller phone numbers arriving via telephony webhooks are HMAC-hashed server-side before any app-level processing. The app itself stores phone numbers only in explicitly created contact records.

---

### Required Reason APIs

| API | Reason Code | Purpose |
|-----|-------------|---------|
| NSUserDefaults (`@AppStorage`) | CA92.1 | Storing user preferences (language, auto-lock timeout, theme) |

---

## Export Compliance (BIS / EAR)

### Summary

The app uses non-exempt encryption for protecting user-generated content. The correct compliance path is **self-classification** under EAR License Exception ENC.

### Encryption Used

| Algorithm | Usage | Key Length |
|-----------|-------|------------|
| HPKE (RFC 9180) — X25519-HKDF-SHA256 + AES-256-GCM | Key encapsulation for E2EE note/report/message encryption | 256-bit symmetric |
| AES-256-GCM | Symmetric encryption for notes, reports, messages | 256-bit |
| XChaCha20-Poly1305 | Alternative symmetric encryption for some payloads | 256-bit |
| Ed25519 | Digital signatures for authentication (Schnorr/BIP-340) | 256-bit |
| X25519 | ECDH key agreement for device linking | 256-bit |
| PBKDF2-SHA256 | Key derivation for PIN-based device key encryption | — |
| HKDF-SHA256 | Key derivation for various domain-separated contexts | — |

All cryptographic implementations are from the `packages/crypto` Rust crate using auditable open-source libraries (`ring`, `hpke`, `ed25519-dalek`, `x25519-dalek`). No proprietary or government-restricted algorithms.

### EAR Classification

**ECCN:** 5D002.c.1 — Software specially designed or modified to use cryptography employing digital techniques performing any cryptographic function other than authentication or digital signature.

**License Exception ENC (740.17(b)(1)):**
The app qualifies for License Exception ENC as:
- Uses only standard, publicly-available cryptographic algorithms (AES, HKDF, HPKE, Ed25519, X25519)
- Intended for mass-market distribution (App Store)
- Not for military or government restricted use
- Full source code is publicly available (AGPL-3.0 at github.com/rhonda-rodododo/llamenos-platform)
- Encryption is for protecting user data, not for circumventing government access

**Self-classification report recipients:**
- BIS: `crypt@bis.doc.gov`
- NSA ENC: `enc@nsa.gov`

Include in the report:
- Product name: Llamenos
- ECCN: 5D002.c.1
- License Exception: ENC (740.17(b)(1))
- Algorithms: AES-256-GCM, XChaCha20-Poly1305, X25519-HKDF, HPKE (RFC 9180), Ed25519, PBKDF2
- Purpose: End-to-end encryption of crisis hotline coordination data
- Distribution: iOS App Store (public, mass-market)

### App Store Connect Questionnaire Answers

When completing the export compliance questionnaire in App Store Connect:

| Question | Answer |
|----------|--------|
| Does your app use encryption? | Yes |
| Does your app qualify for any of the exemptions? | No (content encryption goes beyond authentication/HTTPS) |
| Does your app implement any standard encryption algorithms? | Yes |
| Is your app classified under EAR Category 5 Part 2? | Yes — ECCN 5D002 |
| Does your app qualify for License Exception ENC? | Yes — 740.17(b)(1) |

**`ITSAppUsesNonExemptEncryption`** must be set to `YES` in `apps/ios/Info.plist` (or project.yml). This is already done per the compliance fixes in commit `feat(ios): code signing config, Privacy Manifest, VoIP removal, and compliance fixes`.

**`ITSEncryptionExportComplianceCode`**: Enter the ERN (Encryption Registration Number) or self-classification reference once the BIS filing is acknowledged.

---

## Review Notes for Apple App Review

```
Thank you for reviewing Llamenos.

WHAT THIS APP DOES

Llamenos is a secure crisis response coordination app for nonprofit and community organizations
that operate telephone hotlines. It allows volunteers to:
  - Receive push notifications when a call arrives at their organization's hotline number
  - Write end-to-end encrypted notes during and after calls
  - Submit structured case reports (also E2EE)
  - Manage shifts and availability
  - Coordinate via encrypted messaging with admins

The app connects to a self-hosted server ("hub") operated by the user's organization. There
is no central Llamenos server — each organization runs its own infrastructure. Volunteers
must be invited by a hub administrator to use the app.

HOW TO TEST

We have configured a test hub for review purposes:

  Hub URL:                  [TO BE FILLED IN BEFORE SUBMISSION]
  Volunteer account:        [TO BE FILLED IN — invite link or pre-provisioned credentials]
  Admin account:            [TO BE FILLED IN — admin account login]
  Test PIN:                 [TO BE FILLED IN]

Testing flow (volunteer):
  1. Open the app and enter the Hub URL
  2. Select "Create New Identity" and set a PIN when prompted
  3. Accept the invite to join the hub (link provided above, or admin can send it)
  4. The Dashboard shows shift status and quick actions
  5. Navigate to Notes tab to create or view encrypted notes
  6. Navigate to Cases to view case management
  7. Navigate to Settings to see security configuration

Testing flow (admin):
  1. Log in with the admin account credentials above
  2. Access the Admin Panel from Settings → Admin Panel
  3. View volunteer management, shift configuration, and audit logs

NOTE: Live telephony (receiving actual calls) requires a telephony provider configured on
the hub. For review purposes, all app features except receiving a live incoming call are
fully testable. The review instance has sample notes and case records pre-loaded.

END-TO-END ENCRYPTION EXPLANATION

All note content, transcripts, case reports, and messages are encrypted on-device before
being sent to the server. The encryption uses HPKE (RFC 9180) — the same standard used
in modern TLS. The server receives and stores only ciphertext. This is why the app requires
a PIN on first launch: the PIN protects the device's encryption key stored in iOS Keychain.
The app developer cannot read the content of any encrypted data.

VOIP / CALLKIT USAGE

The app uses VoIP push notifications (PushKit) and CallKit to present incoming hotline calls
to volunteers in the native iOS incoming call UI. This allows:
  - Incoming call alerts even when the app is backgrounded or the phone is locked
  - Native call screen (like a regular phone call) for professional appearance
  - Immediate reporting to CallKit upon VoIP push receipt (iOS 13+ requirement)

The RECORD_AUDIO permission is requested when a VoIP call is answered. Audio is used for:
  1. The live SIP voice call between caller and volunteer
  2. Optional on-device transcription (audio never transmitted off-device; WASM Whisper)

We do not record calls without explicit user consent. Transcription is opt-in per-call.

MICROPHONE USAGE

NSMicrophoneUsageDescription: "Llamenos needs access to your microphone to connect VoIP calls from your hotline and to enable optional on-device transcription. Audio is not recorded unless you explicitly start transcription. Audio is never transmitted to any server — transcription runs entirely on your device."

NETWORK ACCESS

The app communicates exclusively with the hub URL that the organization's administrator
configures. It does not make requests to any Llamenos-operated servers.

OPEN SOURCE

Full source code: https://github.com/rhonda-rodododo/llamenos-platform

Contact during review: support@llamenos.org
```

---

## Screenshot Specifications

### Required Sizes

| Device | Dimensions | Notes |
|--------|-----------|-------|
| 6.9" display (iPhone 16 Pro Max) | 1320×2868 px | **Required** |
| 6.7" display (iPhone 16 Plus, 15 Plus, 14 Plus) | 1290×2796 px | Covers 6.7" requirement |
| 6.5" display (iPhone 14 Plus, 13 Pro Max, 12 Pro Max) | 1284×2778 px | Required if 6.9" not provided |
| 5.5" display (iPhone 8 Plus) | 1242×2208 px | Required for older device support |
| iPad 12.9" 3rd gen | 2048×2732 px | Required if iPad is declared |

**For v1 (iPhone-only):** Minimum required sizes are **6.9"** (1320×2868) and/or **6.7"** (1290×2796). Apple accepts the same screenshot set for both 6.9" and 6.7" display sizes if they are the same dimensions — provide 1290×2796 as the base.

### Recommended Screenshot Sequence

1. **Login / Onboarding** — Hub URL entry screen with security tagline
   - Overlay text: "Your hub. Your data. Your infrastructure."

2. **Dashboard (on-shift)** — Hero card showing active shift, activity metrics, quick actions grid
   - Overlay text: "Always ready when your community calls"

3. **Incoming Call** — CallKit native call screen or the VoIP ring notification
   - Overlay text: "Calls routed to all on-shift volunteers simultaneously"

4. **Note-taking** — Encrypted note editor during or after a call, showing the lock/encryption indicator
   - Overlay text: "End-to-end encrypted. The server cannot read your notes."

5. **Case Management** — Template-driven case report with custom fields filled in
   - Overlay text: "Template-driven case records with custom fields"

6. **Conversations** — E2EE messaging thread between volunteer and admin
   - Overlay text: "Encrypted messaging — server sees only ciphertext"

7. **Settings / Security** — Showing encryption status, auto-lock, emergency wipe options
   - Overlay text: "Military-grade security built for crisis response"

8. **Admin Panel** (optional — show admin capability)
   - Overlay text: "Full admin control — volunteer management, audit logs, ban lists"

### Screenshot Technical Notes

- Use iPhone 16 Pro Max simulator or device for capture
- Status bar: Set to 9:41 AM with full signal/battery for clean appearance
- Use `xcrun simctl status_bar <device_id> override --time "9:41"` to set simulator time
- Dark mode recommended for most screens (matches app branding)
- Do NOT include personally identifiable information in sample data
- All sample note content should be placeholder crisis response text

---

## URLs

**Privacy Policy:** `https://llamenos.org/privacy`
*(Must be live and accessible without login before submission)*

**Support URL:** `https://llamenos.org/support`
*(Must include contact information)*

**Marketing URL:** `https://llamenos.org`

---

## Fastlane Metadata

Fastlane Deliver metadata is maintained at `apps/ios/fastlane/metadata/en-US/`. Run `fastlane deliver download_metadata` to pull existing metadata from App Store Connect, or push with `fastlane deliver`.

---

## Notes for Legal Review Before Submission

- [ ] Confirm privacy policy URL is live and accessible: `https://llamenos.org/privacy`
- [ ] Confirm support URL is live: `https://llamenos.org/support`
- [ ] Confirm "Llamenos" is acceptable as app name (no trademark conflicts)
- [ ] Confirm contact email addresses (`support@llamenos.org`, `privacy@llamenos.org`) are active
- [ ] File BIS self-classification report to `crypt@bis.doc.gov` and `enc@nsa.gov`
- [ ] Enter ECCN 5D002 and License Exception ENC in App Store Connect export compliance
- [ ] Confirm test hub URL and credentials are ready for App Review team
- [ ] Confirm AGPL-3.0 license acknowledgment in Settings → About links to full license text
- [ ] Verify `ITSAppUsesNonExemptEncryption = YES` is in Info.plist / project.yml
- [ ] Verify app icon has no alpha channel (1024×1024, fully opaque, sRGB/P3)
- [ ] Verify all 13 localized strings display correctly in simulator
- [ ] Test full app flow on physical iOS device (not just simulator)
- [ ] Verify PushKit/CallKit flow works end-to-end on real device with real VoIP push
- [ ] Ensure test hub instance will remain running for 2–4 weeks during review
