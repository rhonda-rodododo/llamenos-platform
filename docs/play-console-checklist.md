# Google Play Console Submission Checklist

This is a step-by-step walkthrough for completing all required Google Play Console sections for the Llamenos app. Work through each section in order. The app entry already exists (app ID `4975762233921342016`, developer ID `5368829321457184694`).

Navigate to Play Console → **All apps** → **Llamenos** to begin.

---

## Pre-flight: Assets to Prepare

These must exist before you can complete certain sections. Prepare them first.

- [ ] **App icon** — 512×512 PNG, fully opaque (no alpha), matches adaptive icon foreground in `apps/android/app/src/main/res/`. Background color `#1A1A2E`. Save to `apps/android/fastlane/metadata/android/en-US/icon.png`.
- [ ] **Feature graphic** — 1024×500 PNG or JPG, fully opaque. Dark background (`#1A1A2E`), app name "Llámenos" centered, tagline "Secure crisis response". Save to `apps/android/fastlane/metadata/android/en-US/featureGraphic.png`.
- [ ] **Phone screenshots** — minimum 2, recommended 7, at 1080×2400 PNG. See `docs/android-store-assets.md` for the screenshot sequence. Save to `apps/android/fastlane/metadata/android/en-US/phoneScreenshots/`.
- [ ] **Signed AAB** — build with `./gradlew bundleRelease` using the upload keystore. The CI `mobile-release` workflow produces this automatically.
- [ ] **Privacy policy URL** — `https://llamenos.org/privacy` must be live and publicly accessible before Google review.

---

## Section 1: App content → Privacy policy

**Path:** Play Console → Llamenos → **Policy** → **App content** → Privacy policy

1. Click **Add privacy policy**.
2. Enter URL: `https://llamenos.org/privacy`
3. Click **Save**.

---

## Section 2: App content → Ads

**Path:** Policy → App content → Ads

1. Select: **No, my app does not contain ads**
2. Click **Save**.

---

## Section 3: App content → Content rating (IARC questionnaire)

**Path:** Policy → App content → Content rating

1. Click **Start questionnaire**.
2. **Email address:** Enter your contact email (e.g., `support@llamenos-platform.com`).
3. **App or game?** Select: **App**
4. **Category:** Select: **Utility** (or **Communication** — either is fine; Utility maps to the cleanest PEGI 3 path)
5. Answer each question:

| Question | Answer |
|----------|--------|
| Does the app contain references to or depictions of alcohol, tobacco, or drugs? | **No** |
| Does the app contain references to or depictions of violence or gore? | **No** |
| Does the app contain references to or depictions of sexual content? | **No** |
| Does the app contain profanity or crude humor? | **No** |
| Does the app share the user's location with other users? | **No** |
| Does the app allow users to communicate with each other? | **Yes** — text messaging between volunteers and admins within the same hub |
| Does the app show user-generated content visible to other users? | **No** — all content is end-to-end encrypted and only accessible to the authoring volunteer and authorized admins |
| Is this app designed for children? | **No** |

6. Click **Save questionnaire**.
7. Review the calculated rating — expected: **Everyone (ESRB) / PEGI 3 / G (ACB)**.
8. Click **Apply rating** to confirm.

---

## Section 4: App content → Target audience and content

**Path:** Policy → App content → Target audience and content

1. **Target age groups:** Select **18 and over**.
   - Do NOT select any age groups under 18.
2. **Is this app designed primarily for children?** → **No**
3. **Does your app appeal to children?** → **No** (crisis response software for trained volunteers)
4. Click **Save**.

---

## Section 5: App content → News apps

**Path:** Policy → App content → News apps

1. **Is this app a news app?** → **No**
2. Click **Save**.

---

## Section 6: App content → COVID-19 contact tracing and status apps

**Path:** Policy → App content → COVID-19 contact tracing and status apps

1. **Is this a COVID-19 contact tracing or status app?** → **No**
2. Click **Save**.

---

## Section 7: App content → Government apps

**Path:** Policy → App content → Government apps (if shown)

1. **Is this a government app?** → **No**
2. Click **Save** (or skip if the section is not present for your region).

---

## Section 8: App content → Financial features

**Path:** Policy → App content → Financial features (if shown)

1. **Does the app provide financial services?** → **No**
2. Click **Save** (or skip if not present).

---

## Section 9: App content → Data safety

**Path:** Policy → App content → Data safety

Work through the four sub-steps in order.

### Step 1: Data collection and security

| Question | Answer |
|----------|--------|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data be deleted? | **Yes** |

For the deletion URL, enter: `https://llamenos.org/privacy#data-deletion`
(or describe in-app method: Settings → Account → Delete Account)

Click **Next**.

### Step 2: Data types

Enable each data type listed below. For all others, leave unchecked.

#### Personal info
| Data type | Collected | Shared |
|-----------|-----------|--------|
| Name | ✅ Collected | ❌ Not shared |

- **Is this data processed ephemerally?** → No
- **Is collection required, or can users opt out?** → Required (account registration)
- **Why is this data collected?** → App functionality (volunteer display name, visible only to admins)

#### App activity
| Data type | Collected | Shared |
|-----------|-----------|--------|
| App interactions | ✅ Collected | ❌ Not shared |
| Other user-generated content | ✅ Collected | ❌ Not shared |

For **App interactions:**
- Ephemeral? → No
- Required? → Required
- Purpose → App functionality (audit log for tamins)

For **Other user-generated content:**
- Ephemeral? → No
- Required? → Optional (user chooses whether to write notes)
- Purpose → App functionality (call notes, case reports — stored as ciphertext only)

#### Messages
| Data type | Collected | Shared |
|-----------|-----------|--------|
| Other in-app messages | ✅ Collected | ❌ Not shared |

- Ephemeral? → No
- Required? → Optional
- Purpose → App functionality (encrypted messaging between volunteers and admins)

#### Audio or video
| Data type | Collected | Shared |
|-----------|-----------|--------|
| Voice or sound recordings | ✅ Collected (ephemeral only) | ❌ Not shared |

- **Is this data processed ephemerally?** → **Yes** (on-device only, never stored or transmitted)
- Purpose → App functionality (on-device transcription — audio never leaves the device)

#### Device or other identifiers
| Data type | Collected | Shared |
|-----------|-----------|--------|
| Device or other identifiers | ✅ Collected | ❌ Not shared |

- Ephemeral? → No
- Required? → Required
- Purpose → App functionality (FCM push token for incoming call notifications)
  - Note in the optional description field: "FCM push token stored on user's self-hosted hub server only. Never shared with Llamenos or advertising networks."

#### App info and performance
| Data type | Collected | Shared |
|-----------|-----------|--------|
| Crash logs | ✅ Collected | ❌ Not shared |

- Ephemeral? → No
- Required? → Required
- Purpose → Analytics (crash reports sent to user's self-hosted hub only; never to Llamenos or third parties)

Click **Next**.

### Step 3: Data usage and handling

For each data type you enabled, confirm:

| Data type | Encrypted in transit | Users can request deletion |
|-----------|---------------------|---------------------------|
| Name | ✅ Yes | ✅ Yes |
| App interactions | ✅ Yes | Partial (audit hash chain preserved; personal identifiers removed) — select **Yes** |
| Other user-generated content | ✅ Yes (TLS + E2EE) | ✅ Yes |
| Other in-app messages | ✅ Yes (TLS + E2EE) | ✅ Yes |
| Voice recordings | N/A (ephemeral, never transmitted) | N/A — select **No** with note: processed ephemerally on-device |
| Device identifiers | ✅ Yes | ✅ Yes |
| Crash logs | ✅ Yes | ✅ Yes |

Click **Next**.

### Step 4: Preview

Review the generated data safety label. Confirm it matches the table in `docs/android-data-safety.md`. Click **Submit**.

---

## Section 10: Store listing → Main store listing (English)

**Path:** Grow → Store presence → Main store listing

### App details

| Field | Value |
|-------|-------|
| App name | `Llamenos` |
| Short description | `Secure crisis response coordination with end-to-end encryption` |

**Full description** — paste the following (copy exactly, including blank lines):

```
Llamenos is open-source software for operating secure crisis response hotlines — built for organizations that need to protect caller and volunteer identities against serious adversaries.

END-TO-END ENCRYPTED BY DESIGN

Every note, transcript, report, and message is end-to-end encrypted. The server stores only ciphertext — your hosting provider, your hub administrator, and Llamenos itself cannot read the content of your calls. Encryption happens on your device. Decryption happens only on authenticated volunteer devices.

Each note uses a unique random key with forward secrecy: compromising one note does not compromise others. Keys are wrapped separately for the volunteer and each admin using HPKE (RFC 9180), a modern standard also used in TLS 1.3.

HOW IT WORKS

When someone calls your organization's hotline number, all on-shift volunteers receive simultaneous push notifications. The first volunteer to answer takes the call. Other notifications are cleared automatically.

During the call, volunteers write encrypted notes in real-time. Optional on-device transcription uses AI running entirely on your phone — audio never leaves your device. After the call, notes are sealed and stored as ciphertext on your self-hosted server.

FOR VOLUNTEER TEAMS

• Shift scheduling — admins define recurring shifts and ring groups
• Parallel ringing — all on-shift volunteers ring simultaneously
• Encrypted notes — per-call forward-secret note encryption
• Case management — template-driven reports with custom fields
• Contact records — encrypted caller contact directory
• Multi-hub support — volunteers can belong to multiple hubs and receive calls from all simultaneously

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
• Android Keystore-backed encryption keys — device private keys never leave secure hardware

SELF-HOSTED INFRASTRUCTURE

Your organization runs its own hub. There is no central Llamenos cloud. Your data stays on infrastructure you control, in the jurisdiction you choose. Deploy via Docker Compose on any Linux VPS.

13 LANGUAGES

The app is available in English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, and German — designed for multilingual volunteer teams serving diverse communities.

OPEN SOURCE

Llamenos is fully open source under the AGPL-3.0 license. Audit the code, run your own instance, or contribute at github.com/rhonda-rodododo/llamenos-platform.

---

Llamenos is software for organizations that operate crisis response services. The app requires an invitation from an administrator of a self-hosted hub to use. It is not a consumer crisis service — if you are in crisis, please contact your local emergency services or a crisis helpline in your region.
```

### App category

| Field | Value |
|-------|-------|
| App category | **Productivity** |
| Tags (optional) | crisis response, encrypted, volunteer, hotline, secure |

### Contact details

| Field | Value |
|-------|-------|
| Email | `support@llamenos-platform.com` |
| Phone | (leave blank) |
| Website | `https://llamenos.org` |

### Graphic assets

Upload each asset prepared in the pre-flight section:

1. **App icon** — click the icon upload area → select your 512×512 PNG
2. **Feature graphic** — click the feature graphic upload area → select your 1024×500 PNG/JPG
3. **Phone screenshots** — drag-and-drop your screenshots in the recommended order (dashboard → incoming call → note editor → case report → shift schedule → admin panel → security settings)

Click **Save**.

---

## Section 11: Store listing → Translations

**Path:** Grow → Store presence → Store listings → Manage translations → Add language

### Spanish (es-419)

1. Click **Add language** → select **Spanish (Latin America) — es-419**
2. **Short description:**
   ```
   Coordinación segura de respuesta a crisis con cifrado de extremo a extremo
   ```
3. **Full description** — paste from `docs/android-play-store-metadata.md` (Spanish section)
4. Upload the same graphic assets as the English listing (or localized versions if available)
5. Click **Save**

### French (fr-FR)

1. Click **Add language** → select **French (France) — fr-FR**
2. **Short description:**
   ```
   Coordination sécurisée de réponse aux crises avec chiffrement de bout en bout
   ```
3. **Full description** — paste from `docs/android-play-store-metadata.md` (French section)
4. Upload the same graphic assets as the English listing (or localized versions if available)
5. Click **Save**

---

## Section 12: Play App Signing setup

**Path:** Release → Setup → App signing

This must be configured before creating the first release.

1. Navigate to **Release** → **Setup** → **App signing**
2. Google will prompt you to opt into Play App Signing. Click **Continue**.
3. **App signing key:** Select **"Use Google-generated key"**
   - Google creates and manages the final signing key. You retain only the upload key.
4. **Upload key:** You need to register your upload key certificate.
   - The upload key certificate PEM is at `/tmp/upload-cert.pem` (generated when the upload keystore was created)
   - SHA-256 fingerprint: `05:4A:68:71:A3:00:C3:0B:1D:BF:75:14:F4:66:66:B6:87:E6:39:06:11:31:01:BD:A9:82:00:97:0D:82:E1:74`
   - Upload the PEM file when Play Console prompts for the upload key certificate
5. Click **Save**.

> **Note:** Once configured, your release pipeline signs AABs with the upload key. Google re-signs with the app signing key before delivery. Never share the upload keystore private key; the app signing key is managed by Google and is inaccessible to you.

---

## Section 13: Internal testing track

**Path:** Release → Testing → Internal testing

1. Click **Create new release**.
2. **App bundles:** Click **Upload** → select the signed AAB produced by the CI `mobile-release` workflow (file ends in `.aab`).
3. **Release name:** Leave as the auto-detected version name (e.g., `1.0.0 (1)`) or enter a custom name like `Internal test 1`.
4. **What's new in this release:**
   ```
   Initial release of Llamenos for Android.

   • End-to-end encrypted call notes and reports
   • Shift management and parallel call routing
   • Template-driven case management
   • On-device transcription (audio never leaves your device)
   • Support for 13 languages
   • Android Keystore-backed encryption keys
   • Self-hosted — your data stays on your infrastructure
   ```
5. Click **Save** → **Review release** → **Start rollout to Internal testing**.

### Add internal testers

1. In the Internal testing track, click **Testers** tab.
2. Click **Create email list** or **Add testers**.
3. Add tester email addresses (one per line).
4. Click **Save changes**.
5. Share the opt-in link with testers — they must click the opt-in link before the app appears in their Play Store.

---

## Section 14: Service account for Fastlane (Supply / Deliver)

These steps set up automated deployment via `fastlane supply` so future releases can be uploaded from CI without manual Play Console interaction.

### Create the service account

1. Go to [Google Play Console](https://play.google.com/console) → **Setup** → **API access**
2. Click **Link to a Google Cloud project** (or create a new one if needed)
3. In the linked Google Cloud Console, navigate to **IAM & Admin** → **Service Accounts**
4. Click **+ Create Service Account**
   - **Name:** `llamenos-fastlane`
   - **Description:** `Fastlane Supply — automated Android release uploads`
   - Click **Create and continue**
5. **Grant roles:** Skip role assignment at the project level (Play Console uses its own permission system)
6. Click **Done**
7. Click the new service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**
8. Download the JSON key file. Keep it secure — it grants release access.

### Grant access in Play Console

1. Return to Play Console → **Setup** → **API access**
2. Under **Service accounts**, find `llamenos-fastlane` → click **Grant access**
3. **Account permissions:** Select **Release manager** (or **Release to production, exclude devices, and use app signing by Google Play** if you want more granular control)
4. Click **Apply**

### Set the GitHub Secret

1. Base64-encode the JSON key:
   ```bash
   base64 -w 0 llamenos-fastlane-key.json
   ```
2. In the GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - **Name:** `PLAY_SERVICE_ACCOUNT`
   - **Value:** the base64-encoded JSON string
3. Click **Add secret**

The CI `mobile-release` workflow reads `PLAY_SERVICE_ACCOUNT`, decodes it, and passes it to `fastlane supply` for automated uploads.

---

## Final pre-submission checklist

Before submitting for review (when moving from internal to closed/open track or production):

- [ ] Privacy policy URL is live: `https://llamenos.org/privacy`
- [ ] App icon uploaded (512×512 PNG, no alpha)
- [ ] Feature graphic uploaded (1024×500, no transparency)
- [ ] Minimum 2 phone screenshots uploaded
- [ ] All App content sections show a green checkmark in Play Console
- [ ] Data safety form submitted
- [ ] Content rating applied (should show Everyone / PEGI 3)
- [ ] Target audience set to 18+
- [ ] Internal test track has at least one release uploaded
- [ ] Play App Signing configured with Google-managed signing key
- [ ] Service account created and `PLAY_SERVICE_ACCOUNT` secret set in GitHub
- [ ] Contact email `support@llamenos-platform.com` is a monitored inbox
- [ ] Review export compliance: HPKE/AES-256-GCM qualifies for EAR encryption exemption (ENC unrestricted) — confirm before submitting for production
- [ ] Confirm no advertising SDKs in `apps/android/app/build.gradle.kts`

---

## Troubleshooting

**"Policy declaration required" error when uploading AAB**
→ Complete the Data safety form first (Section 9). Play Console blocks uploads until data safety is submitted.

**Content rating questionnaire not showing**
→ The app must have a category set. Complete the store listing category field first.

**AAB rejected: "App not signed"**
→ Ensure Play App Signing is configured (Section 12) before uploading. The AAB must be signed with the upload key registered in Play Console.

**Testers can't find the app in Play Store**
→ Testers must click the internal testing opt-in link before the app appears. Share the link from the Internal testing → Testers tab.

**Fastlane `supply` fails with 401**
→ The service account JSON may be malformed after base64 encoding. Decode and re-validate: `echo $PLAY_SERVICE_ACCOUNT | base64 -d | python3 -m json.tool`
