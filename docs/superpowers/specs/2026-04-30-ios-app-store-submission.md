# Spec: iOS App Store First Submission

**Date**: 2026-04-30
**Status**: Draft
**Epic**: First App Store Release

## Context

Llamenos is a secure crisis response hotline app. The iOS client is a native SwiftUI app at `apps/ios/` using UniFFI XCFramework from `packages/crypto/` for E2EE. The app targets iOS 17+ and is built with xcodegen (`project.yml`). An Apple Developer account has been created but not yet activated. This spec covers everything needed for a first-time App Store submission with high confidence of approval.

## Current App State (Audit)

### What Exists

The iOS app is substantially feature-complete with the following screens and capabilities:

**Authentication Flow**:
- LoginView: Hub URL entry, "Create New Identity", "Link from Another Device"
- PINSetView / PINUnlockView: PIN-based device key encryption
- BiometricPrompt: Face ID / Touch ID unlock
- OnboardingView: Device key generation explanation
- DeviceLinkView: QR + ECDH device linking

**Main App (6-tab TabView)**:
1. **Dashboard**: Shift status hero card, active call panel, quick actions grid (Reports, Cases, Call History, Help, Contacts, Blasts, Triage), identity/connection strip, recent notes, pull-to-refresh
2. **Notes**: List + detail + create with E2EE, custom fields, call/conversation linking
3. **Cases**: Case management with list, detail, comments, quick status
4. **Conversations**: E2EE messaging with list + detail views
5. **Shifts**: Shift schedule management
6. **Settings**: Account, Preferences, Transcription, Diagnostics, Hub Management, Admin Panel, Help/FAQ, Emergency Wipe, Lock/Logout, version info

**Admin Features** (role-gated):
- Users management, Invites, Ban List, Call Settings, Spam Settings, IVR Settings, Telephony Settings, Audit Log, Custom Fields, Schema Browser, Report Categories, System Health, Transcription Settings, Recording Player

**VoIP/Telephony**:
- LinphoneService with SIP account management, CallKit enabled, SRTP mandatory
- VoIP push handling via APNs (background mode: voip, remote-notification, audio)
- Pending call hub ID tracking for multi-hub routing

**Security Features**:
- Privacy overlay (app switcher screenshot protection)
- Auto-lock timeout (configurable: 1/5/15/30 min)
- Emergency wipe (panic wipe)
- E2EE notes, reports, messages via HPKE (Rust FFI)
- Device key model (Ed25519/X25519, PIN-encrypted, Keychain storage)
- Wake key service (encrypted push payload decryption)

**Infrastructure**:
- 13 locales (en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de)
- Custom DM Sans font family
- Branded color system (xcassets color sets)
- App icon (1024x1024 universal PNG)
- Logo image set (SVG)
- Deep linking (`llamenos://` URL scheme)
- Crash reporting service
- Offline queue with replay
- WebSocket real-time events
- Version compatibility checking
- Fastlane configured (beta + release lanes)
- ExportOptions.plist (app-store-connect method, manual signing)

### What Is Missing or Incomplete

1. **No Privacy Manifest** (`PrivacyInfo.xcprivacy`) -- required since May 2024, will cause rejection
2. **No privacy policy URL** -- required for all apps; none exists on the marketing site
3. **No support URL** -- required for all apps
4. **No `ITSAppUsesNonExemptEncryption`** in Info.plist -- will trigger "Missing Compliance" on every TestFlight upload
5. **Development Team is empty** (`DEVELOPMENT_TEAM: ""`) -- cannot code sign
6. **Code signing set to ad-hoc** (`CODE_SIGN_IDENTITY: "-"`) -- must be Apple Distribution for App Store
7. **Entitlements has `aps-environment: development`** -- must be `production` for App Store build
8. **No CallKit integration code** -- LinphoneService sets `callKitEnabled = true` on the Linphone core, but no CXProvider/CXCallController usage in Swift. If the Linphone SDK handles it internally, this may be fine, but needs verification
9. **No PushKit VoIP push registration** -- the app registers for APNs remote-notification but not PushKit VoIP pushes. Since iOS 13, VoIP pushes MUST report to CallKit immediately. The app currently processes VoIP push data through standard APNs `didReceiveRemoteNotification`. This needs careful review: if the `voip` background mode is declared but PushKit is not used with CallKit, Apple may reject
10. **ExportOptions.plist missing team ID and provisioning profile** -- needed for `xcodebuild -exportArchive`
11. **Fastlane not configured with credentials** -- no Appfile, no match setup
12. **No App Store Connect app record** -- needs to be created
13. **No screenshots** for App Store listing
14. **No app description/keywords/categories** prepared
15. **No age rating questionnaire answers** prepared
16. **No App Privacy Details** (nutrition labels) prepared
17. **Logo imageset uses SVG** -- may not render on all devices; should have PNG fallbacks
18. **Swift tools version 5.9 / Xcode version "16.0"** in project.yml -- Apple now requires iOS 26 SDK (Xcode 26). The deployment target (iOS 17) is fine, but the BUILD SDK must be current
19. **Bundle version is `1` and short version is `1.0`** -- fine for first release, but should be managed by knope

## Apple App Store Requirements (2026)

### Technical Requirements

| Requirement | Status | Action Needed |
|---|---|---|
| Built with iOS 26 SDK (Xcode 26+) | NEEDS UPDATE | Update project.yml `xcodeVersion`, build on Mac with Xcode 26.4.1 |
| Minimum deployment target | OK | iOS 17.0 is acceptable |
| App icon 1024x1024 PNG, no alpha, sRGB/P3 | NEEDS VERIFICATION | Verify `AppIcon.png` has no alpha channel |
| Launch screen | OK | Uses `UILaunchScreen: {}` (storyboard-less) |
| Privacy Manifest (`PrivacyInfo.xcprivacy`) | MISSING | Must create with required reason API declarations |
| `ITSAppUsesNonExemptEncryption` in Info.plist | MISSING | Must add (value: YES -- app uses HPKE/AES-256-GCM) |
| App thinning / bitcode | OK | Bitcode is no longer required; ExportOptions.plist already has `compileBitcode: false` |
| Privacy policy URL | MISSING | Must create and host |
| Support URL | MISSING | Must create |

### Encryption Export Compliance

This is a CRITICAL area for Llamenos. The app uses non-exempt encryption extensively:

- **HPKE** (RFC 9180): X25519-HKDF-SHA256-AES256-GCM -- key encapsulation for E2EE
- **Ed25519**: Digital signatures for authentication
- **X25519**: ECDH key agreement for device linking
- **AES-256-GCM**: Symmetric encryption for notes, reports, messages
- **XChaCha20-Poly1305**: Symmetric encryption for some payloads
- **PBKDF2**: Key derivation for PIN encryption
- **HKDF**: Key derivation for various contexts
- **Schnorr signatures**: Nostr-compatible authentication (BIP-340)

**Classification**: This app uses encryption for purposes beyond authentication/HTTPS. It encrypts user-generated content (notes, reports, messages) with strong cryptographic algorithms. This is **non-exempt encryption**.

**Required steps**:
1. Set `ITSAppUsesNonExemptEncryption` to `YES` in Info.plist
2. Determine ECCN classification -- likely **5D002** (information security software using encryption)
3. Check if eligible for **License Exception ENC** (mass market/publicly available) under BIS EAR 740.17
4. If eligible for ENC exception: file a **self-classification report** (annual, to BIS and ENC Encryption Request Coordinator)
5. Alternatively: obtain a **CCATS** (Commodity Classification Automated Tracking System) number from BIS
6. Provide the classification number in App Store Connect as `ITSEncryptionExportComplianceCode`
7. If self-classifying under ENC: the annual report covers it; no CCATS needed

**Recommendation**: The app's encryption is for protecting user data (not military/government use). Standard open-source algorithms (AES, X25519, Ed25519) with mass-market distribution qualify for **License Exception ENC** under Section 740.17(b)(1). File the self-classification report with BIS before submission. This is a one-time filing (plus annual renewal).

### Privacy Requirements

**App Privacy Details (Nutrition Labels)**:
The app must declare what data it collects in App Store Connect. Based on the codebase:

| Data Type | Collected? | Linked to User? | Used for Tracking? | Purpose |
|---|---|---|---|---|
| Contact Info (phone) | No | N/A | No | Callers' phones are HMAC-hashed server-side |
| User Content (notes, reports) | Yes | Yes (but E2EE) | No | App Functionality |
| Identifiers (device ID, push token) | Yes | Yes | No | App Functionality |
| Usage Data (interactions) | Yes | Yes | No | App Functionality (audit log) |
| Diagnostics (crash reports) | Yes | No (anonymous) | No | App Functionality |
| Location | Yes (optional) | Yes | No | App Functionality (report autofill) |

**Privacy Manifest (`PrivacyInfo.xcprivacy`)**:
Must declare:
- Required Reason APIs used (UserDefaults via `@AppStorage`, any file timestamp APIs, etc.)
- Data collection types matching the nutrition labels above
- Third-party SDK privacy manifests (LlamenosCoreFFI XCFramework, Linphone SDK if bundled)
- No tracking declaration (`NSPrivacyTracking: false`)

### VoIP / CallKit Requirements (CRITICAL)

Since iOS 13, Apple requires:
1. If your app declares `voip` background mode, it MUST use **PushKit** for VoIP notifications
2. When a PushKit VoIP push arrives, the app MUST immediately report a call to **CallKit** via `CXProvider.reportNewIncomingCall`
3. Failure to call CallKit on PushKit delivery causes the system to **terminate the app** and eventually **block PushKit delivery entirely**

**Current state**: The app declares `voip` background mode but uses standard APNs `didReceiveRemoteNotification` for push handling. The LinphoneService enables `callKitEnabled` on the Linphone core, which means Linphone SDK may handle CallKit internally.

**Risk assessment**: HIGH. Two possible paths:
- **Path A**: If Linphone SDK handles PushKit + CallKit internally (which it does when properly configured), verify this integration is complete and functional. The Linphone iOS SDK 5.x includes built-in CallKit and PushKit support.
- **Path B**: If the current implementation bypasses PushKit entirely (using standard APNs for call notifications), remove the `voip` background mode. Standard push notifications can still alert the user, but the incoming call UI won't show on the lock screen.

**Recommendation**: Path A is strongly preferred for a hotline app. Verify Linphone SDK's built-in PushKit/CallKit integration is working. This is the single highest rejection risk.

### Demo Account for Review

Apple requires demo account credentials or a built-in demo mode. Options:
- **Option A**: Stand up a review instance of the backend, create a demo admin + volunteer account, provide credentials in App Review notes
- **Option B**: Build a demo mode (toggle in Settings or via special login) that shows sample data without a real backend
- **Option C**: Request Apple's approval for demo mode exemption due to security obligations

**Recommendation**: Option A. Deploy a dedicated review instance (can be the staging server). Create pre-provisioned accounts. Provide hub URL + credentials in App Review notes. Include detailed instructions for testing each feature (volunteer flow, admin flow, call simulation). Apple reviewers need to see the app is functional, not that calls actually work over PSTN.

### Age Rating

Based on the app's content:
- Violence/graphic content: None in the app itself (it handles crisis calls but doesn't display violent content)
- Gambling: None
- Mature content: None
- Drug/alcohol references: None
- Sexual content: None
- Profanity: None
- Horror/fear: None

**Likely rating**: 4+ (no objectionable content in the app itself). The app is a tool for volunteers, not a content consumption app. However, because it handles "crisis response" topics, Apple may flag it for review -- include a clear explanation in the review notes that this is a professional tool for trained volunteers, not a consumer-facing crisis content app.

### Screenshots

Required sizes:
- **iPhone 6.9"** (iPhone 16 Pro Max): 1320x2868 or 1290x2796 -- REQUIRED
- **iPad 13"** (if app supports iPad): 2064x2752 -- REQUIRED if iPad is supported

The app targets iOS 17+ iPhone. If iPad support is not declared (and the project.yml only targets iOS, not iPadOS), iPad screenshots may not be required, but the app will still run on iPad in compatibility mode.

**Minimum**: 1 screenshot per device class. **Recommended**: 5-8 screenshots showing key flows.

Suggested screenshot set:
1. Login screen (branded, shows security tagline)
2. Dashboard (on-shift, showing activity stats)
3. Notes list with E2EE indicator
4. Note detail / creation
5. Case management view
6. Conversations (E2EE messaging)
7. Settings with security features
8. Admin panel (if showing admin features)

## Decisions to Review

### Decision 1: iPad Support

**Chosen**: iPhone-only for v1 submission
**Alternatives**: Universal app supporting iPad
**Rationale**: The app is optimized for mobile field use by volunteers. iPad layout would require significant UI work. Declaring iPhone-only avoids iPad screenshot requirements and iPad-specific review. Can add iPad support in a future update.
**Risk**: None -- Apple accepts iPhone-only apps.

### Decision 2: VoIP Background Mode

**Chosen**: Keep `voip` background mode with Linphone SDK's built-in CallKit/PushKit integration
**Alternatives**: Remove `voip` mode and use standard push notifications only
**Rationale**: A crisis hotline app needs reliable incoming call notifications. CallKit provides the native incoming call UI (works from lock screen, shows caller info). Removing it would significantly degrade the volunteer experience. The Linphone SDK 5.x has mature CallKit/PushKit integration.
**Risk**: HIGH if the PushKit/CallKit flow is not properly verified end-to-end. Must test on a real device with actual VoIP pushes before submission.

### Decision 3: Encryption Export Compliance Path

**Chosen**: Self-classification under License Exception ENC (740.17(b)(1))
**Alternatives**: Obtain CCATS from BIS (6-8 week process), or claim exempt encryption (incorrect -- would be a compliance violation)
**Rationale**: The app uses standard, publicly available cryptographic algorithms for protecting user data. This is textbook mass-market encryption software. Self-classification is the standard path for apps like Signal, WhatsApp, etc.
**Risk**: LOW. The self-classification report is straightforward for standard algorithms. File with BIS before first submission.

### Decision 4: Demo Account vs. Demo Mode

**Chosen**: Dedicated review backend instance with pre-provisioned accounts
**Alternatives**: Built-in demo mode, or request security exemption from Apple
**Rationale**: A demo mode would require significant development effort and maintenance. A dedicated review instance shows the real app. Apple reviewers are accustomed to receiving server credentials. Include detailed testing instructions.
**Risk**: LOW. The review instance must be kept running during the review period (typically 1-2 weeks). Include fallback contact info in case the reviewer has issues.

### Decision 5: Build SDK Version

**Chosen**: Build with iOS 26 SDK (Xcode 26.4.1) targeting iOS 17.0 deployment
**Alternatives**: Build with iOS 18 SDK (would be rejected after April 28, 2026)
**Rationale**: Apple requires iOS 26 SDK as of April 28, 2026. The Mac M4 already has Xcode 26.4.1 installed. Deployment target remains iOS 17.0 for broad compatibility.
**Risk**: NONE. Xcode 26 is already installed on the build machine.

## Gap Analysis Summary

### Blockers (Must Fix Before Submission)

| # | Gap | Effort | Risk if Skipped |
|---|---|---|---|
| 1 | Privacy Manifest (`PrivacyInfo.xcprivacy`) | 2h | Automatic rejection |
| 2 | Privacy policy URL (hosted on marketing site) | 4h | Automatic rejection |
| 3 | Support URL | 1h | Automatic rejection |
| 4 | `ITSAppUsesNonExemptEncryption` + export compliance code in Info.plist | 1h (code) + 2-4 weeks (BIS filing) | "Missing Compliance" warning; blocks TestFlight external testing |
| 5 | Development Team + code signing configuration | 2h | Cannot build for App Store |
| 6 | Apple Developer Program activation | $99 + 1-2 days | Cannot do anything |
| 7 | App Store Connect app record + metadata | 4h | Cannot submit |
| 8 | Screenshots (minimum 1 per device class) | 4h | Cannot submit |
| 9 | Demo account + review instance | 8h | Likely rejection (app requires login) |
| 10 | VoIP/PushKit/CallKit verification | 8-16h | HIGH rejection risk |
| 11 | Age rating questionnaire (new 2026 format) | 1h | Cannot submit |
| 12 | App Privacy Details (nutrition labels) in ASC | 2h | Automatic rejection |
| 13 | Entitlements: `aps-environment: production` for release build | 0.5h | Push notifications won't work |
| 14 | Update `xcodeVersion` in project.yml for Xcode 26 | 0.5h | Build warnings/issues |

### Should Fix (Reduces Rejection Risk)

| # | Gap | Effort | Risk if Skipped |
|---|---|---|---|
| 15 | Verify AppIcon.png has no alpha channel | 0.5h | Rejection if alpha present |
| 16 | Add PNG fallback for Logo imageset (currently SVG only) | 1h | Possible rendering issues |
| 17 | Verify Linphone SDK includes its own PrivacyInfo.xcprivacy | 1h | Rejection if SDK lacks manifest |
| 18 | Test full app flow on device (not just simulator) | 4h | Crashes = rejection |
| 19 | Verify all localized strings render correctly | 2h | Broken UI = rejection |

### Nice to Have (Post-v1)

| # | Item | Notes |
|---|---|---|
| 20 | iPad layout support | Can add later |
| 21 | App Store preview video | Optional, improves conversion |
| 22 | TestFlight external beta testing | Good practice before full submission |
| 23 | Automated screenshot generation (Fastlane Snapshot) | Saves time for updates |

## Comprehensive Plan

### Phase 0: Account Activation (Days 1-3)

**Prerequisite**: Must be completed before any other phase.

1. **Activate Apple Developer Program**
   - Enroll at developer.apple.com/programs/enroll/
   - If enrolling as organization: need D-U-N-S Number (can take 5 business days)
   - If enrolling as individual: immediate with Apple ID verification
   - Cost: $99/year
   - Timeline: 1-2 business days for approval (sometimes same-day for individuals)

2. **Create certificates and provisioning profiles**
   - Generate Apple Distribution certificate (Xcode or developer portal)
   - Create App ID: `org.llamenos.hotline`
   - Enable capabilities: Push Notifications, Background Modes (VoIP, remote-notification, audio)
   - Create App Store provisioning profile for `org.llamenos.hotline`
   - Download and install on the Mac M4

3. **Create App Store Connect record**
   - Log into App Store Connect
   - Create new app: bundle ID `org.llamenos.hotline`, name "Llamenos", primary language English
   - Set SKU (e.g., `llamenos-ios-v1`)

### Phase 1: Export Compliance (Days 1-14, parallel with Phase 0)

**This has the longest lead time and should start immediately.**

1. **File BIS self-classification report**
   - Determine ECCN: 5D002 (information security software)
   - Eligible for License Exception ENC under 740.17(b)(1) -- mass market, publicly available algorithms
   - File via BIS SNAP-R system or email to `crypt@bis.doc.gov` and `enc@nsa.gov`
   - Report includes: product name, ECCN, encryption algorithms, key lengths, purpose
   - Timeline: File immediately; no response needed (self-classification), but allow 30 days for any questions
   - Once filed, you can proceed with submission

2. **Document encryption usage for App Store Connect**
   - Prepare answers to the export compliance questionnaire in ASC
   - "Does your app use encryption?" -- YES
   - "Does your app qualify for any exemptions?" -- NO (goes beyond authentication/HTTPS)
   - "Does your app implement any standard encryption algorithms?" -- YES
   - Provide ECCN: 5D002
   - Provide self-classification report reference number

### Phase 2: Code Changes (Days 3-7)

All changes in `apps/ios/`:

1. **Create Privacy Manifest** (`PrivacyInfo.xcprivacy`)
   ```
   - NSPrivacyTracking: false
   - NSPrivacyTrackingDomains: [] (empty)
   - NSPrivacyCollectedDataTypes: declare User Content, Identifiers, Usage Data, Diagnostics, Location
   - NSPrivacyAccessedAPITypes: declare UserDefaults usage reason (CA92.1 -- preferences)
   ```
   - Add to `project.yml` sources
   - Verify LlamenosCoreFFI XCFramework includes its own manifest (or add one)

2. **Update Info.plist**
   - Add `ITSAppUsesNonExemptEncryption: true`
   - Add `ITSEncryptionExportComplianceCode` with ECCN or self-classification reference
   - Verify all `NS*UsageDescription` strings are present and clear

3. **Update project.yml**
   - Set `DEVELOPMENT_TEAM` to the actual team ID
   - Set `CODE_SIGN_IDENTITY` to `Apple Distribution`
   - Set `CODE_SIGN_STYLE` to `Automatic` (or keep Manual with explicit profile)
   - Update `xcodeVersion` to `"26.0"` (or remove -- Xcode version on machine determines SDK)
   - Add `SWIFT_VERSION: "6.0"` if Xcode 26 requires it (verify)

4. **Update entitlements for release**
   - Change `aps-environment` to `production` (or handle via build configuration -- development for Debug, production for Release)
   - Best practice: use `$(APS_ENTITLEMENT)` build setting, set per-configuration

5. **Update ExportOptions.plist**
   - Add `teamID`
   - Add `provisioningProfiles` dictionary mapping bundle ID to profile name
   - Verify `signingStyle: manual` with correct profile, or switch to `automatic`

6. **Verify/fix AppIcon.png**
   - Ensure no alpha channel (must be fully opaque)
   - Ensure sRGB or P3 color space
   - 1024x1024 exactly

7. **Add Logo PNG fallback**
   - Convert `logo.svg` to PNG for the Logo imageset
   - Add 1x, 2x, 3x PNG variants to `Contents.json`

8. **VoIP / CallKit verification** (CRITICAL)
   - Verify Linphone SDK's PushKit integration is properly configured
   - If needed, add PushKit delegate (`PKPushRegistry` with `voIP` type)
   - Verify `CXProvider.reportNewIncomingCall` is called on VoIP push receipt
   - Test on physical device with real VoIP push
   - If PushKit/CallKit cannot be verified: consider removing `voip` from `UIBackgroundModes` for v1 and using standard push notifications (less ideal but avoids rejection)

### Phase 3: Metadata Preparation (Days 5-10)

1. **Write privacy policy**
   - Must cover: what data is collected, how it's used, E2EE explanation, GDPR rights, data retention, contact info
   - Host at `llamenos.org/privacy` (or similar) on the marketing site
   - Must be accessible without login

2. **Write terms of service** (recommended but not strictly required)
   - Host at `llamenos.org/terms`

3. **Create support URL**
   - Can be a page on the marketing site with contact email
   - Host at `llamenos.org/support`
   - Must include up-to-date contact information

4. **Write app description** (max 4000 chars)
   - Emphasize: secure crisis response, E2EE, volunteer safety
   - Mention key features: encrypted notes, shift management, call handling, case management
   - Include privacy/security positioning
   - Localize for at least English and Spanish

5. **Prepare keywords** (max 100 chars)
   - E.g.: "crisis,hotline,volunteer,encrypted,notes,shifts,E2EE,secure,response,VoIP"

6. **Select categories**
   - Primary: Productivity or Utilities
   - Secondary: Social Networking (if applicable)

7. **Complete age rating questionnaire**
   - Answer all questions (violence: none, mature content: none, etc.)
   - Expected result: 4+

8. **Prepare App Privacy Details** (nutrition labels)
   - Fill out the questionnaire in App Store Connect based on the data collection table above
   - Key: emphasize that content is E2EE and server cannot access it

### Phase 4: Screenshots (Days 7-10)

1. **Set up demo data**
   - Create a backend instance with sample data: notes, cases, conversations, shifts, users
   - Both admin and volunteer accounts

2. **Capture screenshots** on iPhone 16 Pro Max simulator (or device)
   - Size: 1290x2796 minimum
   - Minimum 3, recommended 5-8 per localization
   - Key screens:
     1. Login (branded, security tagline visible)
     2. Dashboard (on-shift, active stats)
     3. Notes list (showing encrypted notes)
     4. Note creation/detail
     5. Case management
     6. Conversations (E2EE messaging)
     7. Settings (security features visible)
     8. Help screen (security overview)

3. **Add promotional text** (optional, 170 chars)
   - "Secure crisis response coordination with end-to-end encryption"

### Phase 5: Review Instance Setup (Days 8-12)

1. **Deploy a review backend**
   - Stand up a publicly accessible instance (VPS or cloud)
   - Configure with demo telephony (mock adapter or Twilio sandbox)
   - Pre-provision admin and volunteer accounts
   - Ensure instance stays up for 2-4 weeks (review period)

2. **Prepare review notes**
   - Hub URL for the review instance
   - Admin credentials (username/pubkey + PIN)
   - Volunteer credentials
   - Step-by-step testing guide:
     - How to log in (enter hub URL, create identity, set PIN)
     - How to view dashboard
     - How to create/view encrypted notes
     - How to view conversations
     - How to access admin features
     - How to use shift management
   - Explain that VoIP calls require a configured telephony provider (if applicable)
   - Explain E2EE: "Notes and messages are end-to-end encrypted. The server cannot read the content."

### Phase 6: Build and Archive (Days 12-14)

1. **Build XCFramework** (on Mac M4)
   ```
   cd packages/crypto && ./scripts/build-mobile.sh ios
   ```
   - Copy XCFramework and generated bindings to `apps/ios/`

2. **Generate Xcode project**
   ```
   cd apps/ios && xcodegen generate
   ```

3. **Archive for App Store**
   ```
   xcodebuild archive \
     -project Llamenos.xcodeproj \
     -scheme Llamenos \
     -archivePath build/Llamenos.xcarchive \
     -destination "generic/platform=iOS" \
     -configuration Release \
     CODE_SIGN_IDENTITY="Apple Distribution" \
     DEVELOPMENT_TEAM="XXXXXXXXXX"
   ```

4. **Export IPA**
   ```
   xcodebuild -exportArchive \
     -archivePath build/Llamenos.xcarchive \
     -exportOptionsPlist ExportOptions.plist \
     -exportPath build/export
   ```

5. **Validate** (optional but recommended)
   ```
   xcrun altool --validate-app -f build/export/Llamenos.ipa -t ios
   ```
   Or use Xcode Organizer for validation.

### Phase 7: TestFlight (Days 14-16, recommended)

1. **Upload to App Store Connect**
   - Via Xcode Organizer, `xcrun altool`, or Fastlane
   - Fastlane: `cd apps/ios/fastlane && fastlane beta`

2. **Internal testing**
   - Add team members to internal TestFlight group
   - Verify app installs and runs on physical devices
   - Test all major flows
   - Verify push notifications work
   - Verify VoIP calls work (if applicable)

3. **External testing** (optional)
   - Add external testers (requires beta app review -- usually 1-2 days)
   - Wider testing before full submission

### Phase 8: App Store Submission (Days 16-18)

1. **Complete App Store Connect listing**
   - Upload screenshots
   - Enter description, keywords, categories
   - Set pricing (Free)
   - Complete age rating
   - Complete App Privacy Details
   - Enter privacy policy URL, support URL
   - Enter export compliance info
   - Enter demo account credentials in Review Information

2. **Select build**
   - Choose the TestFlight build that passed testing

3. **Submit for review**
   - Click "Submit for Review"
   - Verify all fields are filled (ASC will warn about missing items)

4. **Wait for review**
   - First submissions: typically 1-3 days, can take up to 2 weeks
   - Monitor for reviewer questions/rejections in App Store Connect
   - Be ready to respond quickly to any reviewer inquiries

### Phase 9: Post-Submission (Ongoing)

1. **Monitor review status** in App Store Connect
2. **Respond to any reviewer feedback** within 24 hours
3. **If rejected**: read the rejection reason carefully, fix the issue, resubmit
4. **Once approved**: set release date (manual release recommended for first launch)
5. **Announce**: update marketing site, notify stakeholders

## Timeline Estimate

| Phase | Duration | Dependencies | Can Parallelize? |
|---|---|---|---|
| 0: Account Activation | 1-3 days | None | Yes (start immediately) |
| 1: Export Compliance | 1-14 days | None | Yes (start immediately) |
| 2: Code Changes | 3-5 days | Phase 0 (need team ID) | Partially (VoIP work is independent) |
| 3: Metadata | 3-5 days | Phase 0 (need ASC access) | Yes (can draft before ASC) |
| 4: Screenshots | 2-3 days | Phase 2 (need working app) | Partially |
| 5: Review Instance | 3-4 days | Phase 2 (need server) | Yes |
| 6: Build & Archive | 1-2 days | Phases 0, 2 | No |
| 7: TestFlight | 2-3 days | Phase 6 | No |
| 8: Submission | 1 day | All above | No |
| 9: Review Wait | 1-14 days | Phase 8 | N/A |

**Critical path**: Account Activation (3d) -> Code Changes (5d) -> Build (2d) -> TestFlight (3d) -> Submit (1d) -> Review (1-14d) = **15-28 days minimum**

**Recommended total timeline**: **3-4 weeks** from today, assuming account activation goes smoothly and no major VoIP issues.

**Biggest risk**: VoIP/CallKit/PushKit integration. If this is broken, it could add 1-2 weeks. Recommend investigating this first.

## Checklist for Surefire Approval

- [ ] Apple Developer Program active and paid
- [ ] App Store Connect app record created
- [ ] Distribution certificate generated
- [ ] Provisioning profile created with correct capabilities
- [ ] `PrivacyInfo.xcprivacy` added with all required declarations
- [ ] `ITSAppUsesNonExemptEncryption` set in Info.plist
- [ ] BIS self-classification report filed
- [ ] Export compliance code entered in App Store Connect
- [ ] Privacy policy URL hosted and accessible
- [ ] Support URL hosted and accessible
- [ ] App description written and localized
- [ ] Keywords selected (within 100 char limit)
- [ ] Category selected
- [ ] Age rating questionnaire completed
- [ ] App Privacy Details (nutrition labels) completed
- [ ] Screenshots captured for required device sizes
- [ ] Demo account credentials prepared
- [ ] Review instance deployed and accessible
- [ ] Review notes written with testing instructions
- [ ] App icon verified (no alpha, correct size)
- [ ] VoIP/CallKit/PushKit verified on real device
- [ ] Code signing configured correctly
- [ ] Entitlements correct for production
- [ ] All localized strings render correctly
- [ ] App tested on real device (not just simulator)
- [ ] No crashes in any flow
- [ ] TestFlight internal testing passed
- [ ] Build uploaded to App Store Connect
- [ ] All App Store Connect fields filled
- [ ] Submit for Review clicked
