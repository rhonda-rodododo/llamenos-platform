# Android Google Play Store Submission Plan

**Date**: 2026-05-01
**Status**: Spec
**Goal**: Submit the Llamenos Android app to Google Play Store for the first time

---

## 1. Current State Assessment

### What the app has

| Aspect | Current State | Play Store Ready? |
|--------|--------------|-------------------|
| **Application ID** | `org.llamenos.hotline` | Yes |
| **compileSdk / targetSdk** | 36 (Android 16) | Yes — meets Aug 2026 deadline |
| **minSdk** | 26 (Android 8.0) | Yes |
| **Version** | `versionCode=1`, `versionName=0.1.0` | Yes (first submission) |
| **NDK / ABI filters** | `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` | Yes — all architectures |
| **Signing** | Release signing config via env vars (`KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) | Needs Play App Signing enrollment |
| **R8 / ProGuard** | Enabled for release (`isMinifyEnabled=true`, `isShrinkResources=true`) with comprehensive ProGuard rules | Yes |
| **App icon** | Adaptive icon (`ic_launcher_foreground.xml`, `ic_launcher_background.xml`) in `mipmap-anydpi-v26` | Yes |
| **Fastlane metadata** | `title.txt`, `short_description.txt`, `full_description.txt`, `changelogs/default.txt` in `en-US` | Partial — needs screenshots, feature graphic |
| **Firebase** | `firebase-messaging` dependency present, `PushService` registered | Needs `google-services.json` for release |
| **Network security** | HTTPS-only in release (cleartext blocked) | Yes |
| **Deep links** | `llamenos://` custom scheme registered | Yes |
| **Permissions declared** | INTERNET, RECORD_AUDIO, FINE/COARSE_LOCATION, BIOMETRIC, VIBRATE, FOREGROUND_SERVICE, POST_NOTIFICATIONS, FOREGROUND_SERVICE_PHONE_CALL, CAMERA, MODIFY_AUDIO_SETTINGS, BLUETOOTH/BLUETOOTH_CONNECT, USE_FULL_SCREEN_INTENT, MANAGE_OWN_CALLS | Needs justification for each |
| **VoIP** | Linphone SDK (`linphone-sdk-android:5.4.100`), `CoreService` with `phoneCall` foreground type | Yes |
| **Encryption** | JNI `.so` files from `packages/crypto` (HPKE, Ed25519, AES-256-GCM, HKDF, XChaCha20-Poly1305) | Needs export compliance declaration |
| **Privacy policy** | `llamenos.org/privacy` (from iOS submission work) | Yes — reuse |
| **google-services.json** | Not found in repo (gitignored) | Must exist for release builds |
| **Play Store console** | Developer account being set up | In progress |

### App features (132 Kotlin source files, 88 UI screens)

- **Auth**: Onboarding, login, PIN set/unlock, biometric
- **Dashboard**: Active call card, shift status
- **Calls**: VoIP via Linphone SIP, call history, parallel ringing
- **Notes**: E2E encrypted note creation/detail, per-note forward secrecy
- **Reports**: Template-driven report types, audio input, typed reports
- **Cases**: Case list/detail, quick status, comments
- **Contacts**: Contact list/detail, timeline
- **Conversations**: Encrypted messaging
- **Events**: Create/list/detail
- **Shifts**: Schedule view
- **Hubs**: Multi-hub management, create hub, hub list
- **Admin**: Volunteers, shift schedule, ban list, custom fields, audit log, settings, schema browser, system health, recording player, user detail
- **Settings**: Device linking (QR scanner via CameraX + ML Kit)
- **Triage**: Report triage, detail
- **Blasts**: Broadcast messaging
- **Help**: In-app help
- **Components**: Demo banner, empty state, error card, loading overlay, offline banner, PIN pad, secure text, transcription overlay, update banner/required screen

---

## 2. Google Play Requirements (2026)

### 2.1 Developer Account

| Requirement | Details |
|-------------|---------|
| **Account type** | Organization account recommended (avoids 12-tester/14-day closed testing gate that applies only to personal accounts created after Nov 2023) |
| **Registration fee** | $25 one-time |
| **D-U-N-S number** | Required for organization accounts |
| **Identity verification** | Government ID + organization docs required |
| **Developer address** | Must be provided (displayed on store listing) |

### 2.2 Technical Requirements

| Requirement | Current State | Gap? |
|-------------|--------------|------|
| **AAB format** | Gradle builds AAB by default (`./gradlew bundleRelease`) | No gap |
| **Target SDK 36+** | `targetSdk = 36` | No gap |
| **64-bit support** | `arm64-v8a` and `x86_64` in ABI filters | No gap |
| **Play App Signing** | Not enrolled yet | **GAP** — must enroll and generate upload key |
| **App signing key validity** | Must end after Oct 22, 2033 | Must verify when generating keystore |
| **Deobfuscation mapping** | R8 mapping file needed for crash reporting | Should upload with each release |

### 2.3 Store Listing Assets

| Asset | Specification | Status |
|-------|--------------|--------|
| **App title** | Max 30 chars; "Llamenos" (8 chars) | Done |
| **Short description** | Max 80 chars | Done (56 chars) |
| **Full description** | Max 4000 chars | Done |
| **App icon** | 512x512 PNG, 32-bit, no alpha | **GAP** — need hi-res Play Store icon (separate from adaptive icon) |
| **Feature graphic** | 1024x500 JPEG/PNG, no alpha, <1MB | **GAP** — not created |
| **Phone screenshots** | Min 2, max 8; min 320px per side, max 3840px; 16:9 or 9:16; JPEG/PNG no alpha; <8MB each. Recommended: 1080x2400 | **GAP** — none exist |
| **Tablet screenshots** | Optional but recommended (7" and 10") | **GAP** — nice to have |
| **Promo video** | Optional YouTube URL | Skip for v1 |

### 2.4 Content Rating (IARC)

Complete the IARC questionnaire in Play Console. For Llamenos:
- No violence, sexual content, or gambling
- **Crisis/sensitive content**: May trigger "sensitive topics" flag — be transparent
- **User-generated content**: Notes and messages are encrypted — server cannot read them
- **Communication features**: Yes (VoIP calls, messaging)
- Expected rating: **Mature 17+** or **Everyone** depending on crisis content characterization

### 2.5 Data Safety Section

Must declare all data collection, sharing, and security practices. For Llamenos:

| Data Type | Collected? | Shared? | E2EE? | Notes |
|-----------|-----------|---------|-------|-------|
| **Personal info (name)** | Yes (admin-visible only) | No | Yes (encrypted at rest) | Admin sees volunteer names |
| **Email** | No | — | — | |
| **Phone number** | No (caller numbers handled server-side only) | No | — | App users don't provide phone numbers |
| **Location** | Yes (optional, during events) | No | No | Used for geocoding field reports |
| **Audio** | Yes (call recording, optional) | No | Yes | Client-side transcription, E2EE storage |
| **Messages** | Yes | No | Yes (E2EE) | Per-message envelope encryption |
| **App activity** | Yes (audit logs, admin only) | No | No | Hash-chained audit log |
| **Device identifiers** | Yes (FCM token for push) | No | No | Firebase push token |
| **Crash logs** | Yes (CrashReporter) | No | No | Crash diagnostics |

**Key declarations**:
- Data is encrypted in transit (HTTPS-only, certificate pinning)
- Data is encrypted at rest (E2EE for notes/messages, EncryptedSharedPreferences for keys)
- Users can request data deletion
- App follows GDPR requirements (EU parent organization)
- E2EE data does NOT need to be disclosed as "collected" per Google's policy (unreadable by developer)

### 2.6 Privacy Policy

- URL: `https://llamenos.org/privacy` (already created for iOS submission)
- Must be accessible from store listing AND within the app
- Must cover: what data is collected, how it's used, how it's shared, user rights, contact info
- Must be specific to the app (not a generic website policy)

### 2.7 Permissions Justifications

Each sensitive permission needs justification in Play Console:

| Permission | Justification |
|------------|--------------|
| `RECORD_AUDIO` | Core VoIP calling functionality — volunteers answer crisis calls |
| `ACCESS_FINE_LOCATION` | Optional field report geocoding for crisis events |
| `ACCESS_COARSE_LOCATION` | Fallback for location when fine location denied |
| `CAMERA` | QR code scanning for secure device linking (`required="false"`) |
| `USE_BIOMETRIC` | Optional PIN-free unlock using device biometrics |
| `FOREGROUND_SERVICE_PHONE_CALL` | Active VoIP call management via Linphone SIP |
| `POST_NOTIFICATIONS` | Push notifications for incoming calls and messages |
| `BLUETOOTH_CONNECT` | Bluetooth audio routing during VoIP calls |
| `USE_FULL_SCREEN_INTENT` | Incoming call screen (like a phone dialer) |
| `MANAGE_OWN_CALLS` | VoIP call integration with Android telecom framework |

**Potential review concerns**:
- `ACCESS_FINE_LOCATION` — Google's April 2026 policy update tightens location requirements. Since this is for optional event geocoding (not core functionality), consider whether the location button API is sufficient or if a permission declaration form is needed.
- `BLUETOOTH_CONNECT` — Standard for VoIP apps, but will need to justify.

### 2.8 Export Compliance (US Encryption Laws)

Google Play does NOT have an equivalent to Apple's App Store Connect export compliance questionnaire. However:

- The app uses strong encryption (HPKE/AES-256-GCM/XChaCha20-Poly1305/Ed25519)
- Since the app is open-source (AGPL-3.0) and the crypto library (`packages/crypto`) is publicly available, it likely qualifies under the **publicly available** or **mass market** exemptions under EAR (Export Administration Regulations)
- **Action**: File a self-classification report (BIS ECCN 5D002) with the Bureau of Industry and Security if distributing to non-US users. This is a one-time email notification, not an approval process.
- Google already blocks downloads to embargoed countries automatically.

### 2.9 Pre-Launch Report

Google automatically runs the pre-launch report when you upload an AAB:

- **Crawls the app** for several minutes — tapping, swiping, typing
- **Checks for**: Crashes, ANRs, slow startup, unsupported API use
- **Login wall**: The app requires Nostr keypair auth + PIN — the crawler won't be able to get past onboarding. Must provide **demo credentials** or create a **demo mode** bypass for the crawler.
- **Action needed**: Either:
  1. Provide test credentials in Play Console's pre-launch report settings, OR
  2. Implement a demo/test account that the crawler can use, OR
  3. Accept that the crawler will only test the login screen (acceptable for first submission — many auth-gated apps do this)

### 2.10 Testing Tracks

| Track | Purpose | Testers | Review Time |
|-------|---------|---------|-------------|
| **Internal** | Quick QA validation | Up to 100 | Immediate |
| **Closed (Alpha)** | Required gate for personal accounts; broader testing | Up to 400K | ~24 hours |
| **Open (Beta)** | Public pre-release | Unlimited | Standard review |
| **Production** | Public release | Everyone | 1-7 days review |

**If organization account**: Can go Internal → Production directly (no 14-day closed testing gate).
**If personal account**: Must have 12+ testers opted in for 14+ consecutive days in closed testing before production access.

---

## 3. Gap Analysis — What's Missing

### 3.1 Critical (Blocks Submission)

| # | Gap | Effort | Priority |
|---|-----|--------|----------|
| G1 | **Play App Signing enrollment** — must generate upload keystore, enroll in Play Console | 1 hour | P0 |
| G2 | **512x512 Play Store icon** — hi-res icon for store listing (not the adaptive launcher icon) | 1 hour (design) | P0 |
| G3 | **1024x500 Feature Graphic** — required for store listing | 2 hours (design) | P0 |
| G4 | **Phone screenshots** (min 2, ideally 4-6) — 1080x2400 recommended | 4 hours (capture + polish) | P0 |
| G5 | **Data Safety form** — complete questionnaire in Play Console | 1 hour | P0 |
| G6 | **Content rating** (IARC questionnaire) | 30 min | P0 |
| G7 | **Privacy policy URL** in Play Console and in-app | 30 min (already exists at llamenos.org/privacy; verify in-app link) | P0 |
| G8 | **google-services.json** for release Firebase project | 30 min | P0 |
| G9 | **Permissions declaration form** — justify RECORD_AUDIO, CAMERA, LOCATION in Play Console | 1 hour | P0 |

### 3.2 Important (Should Fix Before Submission)

| # | Gap | Effort | Priority |
|---|-----|--------|----------|
| G10 | **App category selection** — "Communication" or "Social" in Play Console | 5 min | P1 |
| G11 | **Contact email / website** — developer contact info for store listing | 5 min | P1 |
| G12 | **Upload AAB and verify pre-launch report** — ensure no crashes on crawl | 2 hours | P1 |
| G13 | **ProGuard/R8 mapping upload** — for crash symbolication | Automated with AAB upload | P1 |
| G14 | **BIS self-classification report** for encryption | 1 hour (one-time email) | P1 |
| G15 | **Verify `versionCode` / `versionName` via knope** — ensure version management is wired up for Android | 1 hour | P1 |

### 3.3 Nice to Have

| # | Gap | Effort | Priority |
|---|-----|--------|----------|
| G16 | **Tablet screenshots** (7" and 10") | 2 hours | P2 |
| G17 | **Localized store listings** (Spanish, etc.) — Fastlane metadata for other locales | 4 hours per locale | P2 |
| G18 | **Promo video** (YouTube) | 8 hours | P2 |
| G19 | **Fastlane Supply integration** for automated uploads | 4 hours | P2 |
| G20 | **Play Store CI/CD pipeline** — automated AAB upload on tag | 4 hours | P2 |

---

## 4. Implementation Plan

### Phase 1: Developer Account & Signing (Day 1)

**4.1 Complete Developer Account Setup**
- [ ] Finish Google Play Developer registration ($25 fee)
- [ ] Choose **Organization** account type (avoids 14-day closed testing gate)
- [ ] Provide D-U-N-S number, organization documentation
- [ ] Complete identity verification
- [ ] Set developer name, email, website, physical address

**4.2 Generate Upload Keystore**
```bash
keytool -genkeypair \
  -alias llamenos \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore llamenos-upload.keystore \
  -storepass <SECURE_PASSWORD> \
  -dname "CN=Llamenos, OU=Mobile, O=Llamenos, L=Atlanta, ST=GA, C=US"
```
- [ ] Store keystore securely (NOT in repo — add to CI secrets)
- [ ] Back up keystore to secure offline storage (loss = cannot push updates)
- [ ] Note: Key validity must extend past Oct 22, 2033 (10000 days from 2026 = 2053, good)

**4.3 Enroll in Play App Signing**
- [ ] Create new app in Play Console
- [ ] During first AAB upload, enroll in Play App Signing
- [ ] Upload the upload key certificate (not the keystore itself)
- [ ] Google generates and manages the app signing key

### Phase 2: Build Configuration (Day 1-2)

**4.4 Verify Release Build**
```bash
cd apps/android
KEYSTORE_PATH=/path/to/llamenos-upload.keystore \
KEYSTORE_PASSWORD=<pw> \
KEY_ALIAS=llamenos \
KEY_PASSWORD=<pw> \
./gradlew bundleRelease
```
- [ ] Verify AAB is generated at expected output path
- [ ] Verify R8 mapping file is generated (`mapping.txt`)
- [ ] Run `bundletool` to validate AAB structure
- [ ] Test install via `bundletool build-apks` → device

**4.5 Verify Firebase Configuration**
- [ ] Ensure release `google-services.json` exists (Firebase Console → Project settings → Android app → `org.llamenos.hotline`)
- [ ] Verify push notifications work in release build
- [ ] Note: Debug builds use `org.llamenos.hotline.debug` suffix — need separate Firebase app or strip suffix

**4.6 Version Management**
- [ ] Verify knope is configured for `apps/android/app/build.gradle.kts` version bumps
- [ ] Ensure `versionCode` auto-increments (critical — Play Store rejects same/lower versionCode)
- [ ] Consider: `versionCode = <epoch-based or CI build number>` for CI

### Phase 3: Store Listing Assets (Day 2-3)

**4.7 Create Visual Assets**
- [ ] **512x512 icon** — export from existing adaptive icon foreground + background, composited to a flat PNG (32-bit, no alpha/transparency)
- [ ] **1024x500 feature graphic** — branded banner with app name, tagline, key visual. Keep critical content within center 860x480 safe zone
- [ ] **Phone screenshots** (1080x2400, portrait, JPEG/PNG no alpha):
  - Screenshot 1: Dashboard / active call card
  - Screenshot 2: Encrypted notes list
  - Screenshot 3: Call in progress (VoIP)
  - Screenshot 4: Case management
  - Screenshot 5: Hub management / multi-hub
  - Screenshot 6: Admin panel

**4.8 Capture Screenshots**
- [ ] Use a clean device/emulator (Pixel 9 for 1080x2400)
- [ ] Populate with realistic demo data
- [ ] Capture via `adb shell screencap` or Android Studio
- [ ] Post-process: add device frames, captions (optional but recommended)
- [ ] Place in `apps/android/fastlane/metadata/android/en-US/images/phoneScreenshots/`

**4.9 Update Fastlane Metadata**
- [ ] Review and finalize `full_description.txt` — ensure it mentions key Play Store keywords
- [ ] Add `changelogs/1.txt` for versionCode 1 (or use `default.txt`)
- [ ] Create `images/` directory structure for screenshots and graphics

### Phase 4: Play Console Configuration (Day 3-4)

**4.10 App Content Setup**
- [ ] **Privacy policy URL**: `https://llamenos.org/privacy`
- [ ] **App access**: "All or some functionality is restricted" → provide instructions for review team
  - "This app requires an invite from an organization administrator. Test account credentials provided below."
  - Provide test account credentials (admin + volunteer)
- [ ] **Ads declaration**: No ads
- [ ] **Content rating**: Complete IARC questionnaire
  - Communication app: Yes
  - User-generated content: Yes (encrypted)
  - Violence/sexual/drugs: No
  - Crisis/safety content: Yes — declare transparently
- [ ] **Target audience**: Not aimed at children (declare 18+)
- [ ] **News app**: No
- [ ] **COVID-19 app**: No
- [ ] **Data Safety section**: See Section 2.5 above
- [ ] **Government apps**: No

**4.11 Permissions Declarations**
- [ ] Complete declarations for each sensitive permission in Play Console
- [ ] Provide a video demo if requested for RECORD_AUDIO / CAMERA / LOCATION usage
- [ ] `USE_FULL_SCREEN_INTENT` — justify as incoming VoIP call screen

**4.12 Store Listing**
- [ ] **App name**: Llamenos (or "Llamenos - Secure Crisis Hotline")
- [ ] **Short description**: "Secure crisis response hotline with end-to-end encryption"
- [ ] **Full description**: Use existing `full_description.txt`
- [ ] **Category**: Communication
- [ ] **Tags**: crisis, hotline, encrypted, volunteer, VoIP
- [ ] **Contact email**: (organization contact)
- [ ] **Contact website**: `https://llamenos.org`
- [ ] Upload icon, feature graphic, screenshots

### Phase 5: Testing & Release (Day 4-7)

**4.13 Internal Testing Track**
- [ ] Upload signed AAB to internal testing track
- [ ] Add team members as internal testers
- [ ] Verify install + basic functionality on real devices
- [ ] Check pre-launch report for crashes/warnings
- [ ] Fix any issues found

**4.14 Closed Testing (if personal account)**
- [ ] Create closed testing track
- [ ] Add 12+ testers via email list or Google Group
- [ ] Wait 14 days with testers opted in
- [ ] Apply for production access after 14-day gate

**4.15 Production Release**
- [ ] If organization account: promote directly from internal to production
- [ ] Set rollout percentage (recommend 20% initially for first release)
- [ ] Monitor pre-launch report, crash reports, ANRs
- [ ] If clean after 48 hours, increase to 100%

### Phase 6: Post-Submission (Ongoing)

**4.16 Monitor & Maintain**
- [ ] Monitor Play Console for policy violations, crash reports, user reviews
- [ ] Set up Play Console email notifications
- [ ] File BIS self-classification report for encryption (ECCN 5D002)
- [ ] Plan CI/CD pipeline for automated AAB uploads (Fastlane Supply or Play Developer API)
- [ ] Keep targetSdk current (must update within 1 year of new Android release)

---

## 5. Data Safety Form — Detailed Answers

### Does your app collect or share any of the required user data types?

**Yes** — the app collects certain data types.

### Data collected:

| Category | Data Type | Collected | Purpose | Required | E2EE |
|----------|-----------|-----------|---------|----------|------|
| Location | Approximate location | Yes | App functionality (event geocoding) | No | No |
| Location | Precise location | Yes | App functionality (event geocoding) | No | No |
| Personal info | Name | Yes | App functionality (volunteer profiles, admin-visible) | Yes | Yes |
| Messages | Other in-app messages | Yes | App functionality (crisis notes, case notes) | Yes | Yes |
| Audio | Voice or sound recordings | Yes | App functionality (call recording, transcription) | No | Yes |
| App activity | Other user-generated content | Yes | App functionality (reports, cases) | Yes | Yes |
| Device or other IDs | Device or other IDs | Yes | App functionality (push notifications via FCM) | Yes | No |
| App info and performance | Crash logs | Yes | Analytics (crash reporting) | No | No |

### Data NOT collected:
- Email address (app uses Nostr keypair auth, not email)
- Phone number (caller numbers are server-side only, not in the app)
- Payment info
- Health info
- Files and docs (photos, videos, files)
- Web browsing history
- Search history
- Contacts (no READ_CONTACTS permission)
- Calendar
- SMS/MMS
- Installed apps

### Security practices:
- Data is encrypted in transit: **Yes** (HTTPS-only, certificate pinning)
- Data can be deleted by user: **Yes** (account deletion)
- Committed to Play Families policy: **No** (not a children's app)

### E2EE note:
Per Google's policy, E2E encrypted data that is unreadable by the developer does not need to be disclosed as "collected." Notes, messages, and call recordings are E2EE — only sender and recipient can read them. However, we still declare them for transparency.

---

## 6. Content Rating Questionnaire (IARC) — Expected Answers

| Question | Answer | Rationale |
|----------|--------|-----------|
| Does the app contain violence? | No | Crisis response coordination, not violent content |
| Sexual content? | No | |
| Language/profanity? | No | User-generated content is encrypted |
| Controlled substances? | No | |
| Gambling? | No | |
| User interaction/communication? | **Yes** | VoIP calls, encrypted messaging |
| Users can share info with others? | **Yes** | Notes, messages (encrypted) |
| Location sharing? | **Yes** (optional) | Event geocoding |
| Digital purchases? | No | |

**Expected rating**: Varies by region (IARC assigns per-market ratings). Likely **Teen (13+)** or **Everyone 10+** in most markets due to communication features.

---

## 7. Differences from iOS App Store Submission

| Aspect | iOS | Android |
|--------|-----|---------|
| **Review time** | 24-48 hours typical | 1-7 days (production); internal is instant |
| **Build format** | IPA (via Xcode) | AAB (via Gradle) |
| **Signing** | Apple manages; provisioning profiles + certificates | Play App Signing; upload key + Google-managed signing key |
| **Encryption compliance** | ITSAppUsesNonExemptEncryption plist key + annual self-classification | BIS self-classification report (one-time email) |
| **Testing gate** | TestFlight (no minimum tester count) | 12 testers / 14 days for personal accounts |
| **Screenshots** | Per device size class (6.9", 6.7", 6.5", etc.) | One set of phone screenshots (1080x2400 recommended) |
| **Privacy** | App Privacy "nutrition labels" | Data Safety section |
| **Feature graphic** | Not required | Required (1024x500) |
| **Categories** | Utilities / Social Networking | Communication |
| **Pre-launch testing** | No automated crawl | Google runs automated crawl (pre-launch report) |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Rejection for VoIP permissions** | Medium | High (delays launch) | Prepare video demo of call functionality; provide clear permission justification |
| **Pre-launch report crashes** | Low | Medium | Test release build thoroughly before upload; ProGuard rules already comprehensive |
| **Location permission rejection** (April 2026 policy) | Medium | Low | Location is optional; can remove if challenged; currently targets SDK 36, not 37 |
| **Content moderation concerns** | Low | High | Clear privacy policy; explain E2EE design; crisis response is legitimate use |
| **14-day testing gate** | High (if personal) | Medium (delays 2 weeks) | Use organization account to bypass |
| **Login wall blocks pre-launch crawl** | High | Low | Expected for auth-gated apps; provide test credentials |

---

## 9. Timeline

### Organization Account Path (Recommended)

| Day | Milestone |
|-----|-----------|
| Day 1 | Developer account finalized; upload keystore generated; release AAB built and verified |
| Day 2 | Store listing assets created (icon, feature graphic, screenshots) |
| Day 3 | Play Console fully configured (data safety, content rating, permissions, store listing) |
| Day 4 | AAB uploaded to internal testing track; pre-launch report reviewed |
| Day 5 | Fix any pre-launch issues; promote to production (20% rollout) |
| Day 6-7 | Google review (1-7 days) |
| Day 7-12 | **App live on Play Store** |

### Personal Account Path (If Unavoidable)

| Day | Milestone |
|-----|-----------|
| Day 1-3 | Same as above through internal testing |
| Day 4 | Upload to closed testing track; recruit 12+ testers |
| Day 4-18 | **14-day waiting period** with testers opted in |
| Day 18 | Apply for production access |
| Day 19-25 | Production access review (up to 7 days) |
| Day 25+ | **App live on Play Store** |

---

## 10. CI/CD Integration (Future)

After initial manual submission, automate with:

```yaml
# GitHub Actions workflow (future)
- name: Build Release AAB
  run: |
    cd apps/android
    ./gradlew bundleRelease
  env:
    KEYSTORE_PATH: ${{ secrets.ANDROID_KEYSTORE_PATH }}
    KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
    KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}

- name: Upload to Play Store
  uses: r0adkll/upload-google-play@v1
  with:
    serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
    packageName: org.llamenos.hotline
    releaseFiles: app/build/outputs/bundle/release/app-release.aab
    track: internal
    mappingFile: app/build/outputs/mapping/release/mapping.txt
```

Or via Fastlane Supply:
```ruby
# apps/android/fastlane/Fastfile
lane :deploy do
  gradle(task: "bundleRelease")
  upload_to_play_store(
    track: "internal",
    aab: "app/build/outputs/bundle/release/app-release.aab",
    mapping: "app/build/outputs/mapping/release/mapping.txt"
  )
end
```

---

## 11. Decisions to Review

| Decision | Chosen Option | Alternatives |
|----------|--------------|-------------|
| **Account type** | Organization (bypasses 14-day gate) | Personal (cheaper but slower due to 14-day closed testing requirement) |
| **Category** | Communication | Social; Tools — Communication is most accurate for VoIP + messaging |
| **Initial rollout** | 20% staged → 100% | 100% immediate — staged is safer for first release |
| **Pre-launch crawl** | Accept login-wall limitation; provide test credentials | Build demo mode bypass — unnecessary complexity for first submission |
| **Fastlane vs manual** | Manual first submission; automate later | Full Fastlane setup first — overhead not justified until release cadence is established |
| **Screenshot style** | Raw captures with optional device frames | Polished marketing screenshots — can iterate after launch |
| **Location permission** | Keep for now (SDK 36, not affected by April 2026 SDK 37+ policy change) | Remove preemptively — too aggressive; feature works and permission is justified |

---

## Appendix A: Play Console Checklist

Quick-reference checklist for the Play Console UI:

- [ ] App created in Play Console
- [ ] App access instructions provided
- [ ] Content rating questionnaire completed
- [ ] Target audience and content set
- [ ] Privacy policy URL set
- [ ] Data Safety form completed
- [ ] Ads declaration completed
- [ ] News app declaration completed
- [ ] COVID-19 app declaration completed
- [ ] Government apps declaration completed
- [ ] Financial features declaration (if applicable) — N/A
- [ ] Store listing: title, descriptions, icon, feature graphic, screenshots
- [ ] Contact details: email, website, phone (optional)
- [ ] Pricing: Free
- [ ] Countries/regions: All (minus embargoed)
- [ ] AAB uploaded
- [ ] Signing key enrolled
- [ ] Pre-launch report reviewed
- [ ] Release track selected and promoted
