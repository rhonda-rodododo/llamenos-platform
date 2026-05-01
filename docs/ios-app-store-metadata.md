# Llámenos — iOS App Store Metadata

## App Identity

**App Name:** Llamenos
*(Note: The App Store does not support accented characters in the app name field. Use "Llamenos" in the name field; the display name in the app can retain "Llámenos".)*

**Subtitle (30 chars max):** Secure crisis response
*(28 characters)*

**Bundle ID:** `com.llamenos.app`

**Primary Category:** Productivity

**Secondary Category:** Utilities

---

## Description (4000 chars max)

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
• On-device transcription — audio never transmitted
• No advertising, no tracking, no behavioral profiling
• GDPR-compliant — EU organization, data processing agreements available
• Reproducible builds — verify the published app matches the public source code

SELF-HOSTED INFRASTRUCTURE

Your organization runs its own hub. There is no central Llamenos cloud. Your data stays on infrastructure you control, in the jurisdiction you choose. Deploy via Docker Compose on any Linux VPS.

13 LANGUAGES

The app is available in English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, and German — designed for multilingual volunteer teams serving diverse communities.

OPEN SOURCE

Llamenos is fully open source under the AGPL-3.0 license. Audit the code, run your own instance, or contribute at github.com/rhonda-rodododo/llamenos-platform.

---

Llamenos is software for organizations that operate crisis response services. The app requires an invitation from an administrator of a self-hosted hub to use. It is not a consumer crisis service — if you are in crisis, please contact your local emergency services or a crisis helpline in your region.
```

*(Character count: approximately 2,850 — well within the 4,000 character limit)*

---

## Keywords (100 chars max)

```
crisis,hotline,volunteer,encrypted,secure,E2EE,notes,shifts,response,coordination
```

*(82 characters)*

**Alternate keywords to A/B test:**
- `crisis line,hotline,E2EE,volunteer,secure,shifts,notes,encrypted,response`
- `crisis,hotline,encrypted,volunteer,secure,nonprofit,shifts,coordination,response`

---

## Age Rating

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

## Privacy Policy URL

`https://llamenos-hotline.com/privacy`

## Support URL

`https://llamenos-hotline.com/support`

## Marketing URL (optional)

`https://llamenos-hotline.com`

---

## Review Notes for Apple App Review

```
Thank you for reviewing Llamenos.

WHAT THIS APP DOES

Llamenos is a secure crisis response coordination app for nonprofit and community organizations that operate telephone hotlines. It allows volunteers to:
  - Receive push notifications when a call arrives at their organization's hotline number
  - Write encrypted notes during and after calls
  - Submit structured case reports
  - Manage shifts and availability

The app connects to a self-hosted server ("hub") operated by the user's organization. There is no central Llamenos server — each organization runs its own infrastructure.

HOW TO TEST

To use the app, a reviewer needs an invitation from a hub administrator. We have configured a test hub for review purposes:

  Hub URL: [TO BE FILLED IN BEFORE SUBMISSION — test hub URL]
  Test volunteer credentials: [TO BE FILLED IN — invite link or credentials]
  Test admin credentials: [TO BE FILLED IN — admin account details]

Basic testing flow:
  1. Accept the invite link to create an account and set a PIN
  2. Navigate to the Shifts tab and join an open shift
  3. The home screen will show your on-shift status
  4. Explore the Notes, Reports, and Settings tabs

NOTE: Receiving an actual call requires a configured telephony provider (Twilio, etc.) and a real phone number pointed at the hub. For review purposes, you can test all core app features (note-taking, reports, case management, settings) without receiving a live call.

END-TO-END ENCRYPTION

All note content, transcripts, and reports are encrypted on-device before being sent to the server. The encryption uses HPKE (RFC 9180) — a modern standard. The server receives and stores only ciphertext. This is why the app requires a PIN on first launch: the PIN protects your device's encryption key.

TELEPHONY FEATURES

The app supports receiving calls via VoIP push notifications (CallKit). This requires the hub to be configured with a telephony provider. In the test environment, this feature may not be active — all non-telephony features (notes, reports, case management, settings) are fully testable without it.

NETWORK ACCESS

The app communicates exclusively with the hub URL configured by the organization's administrator. It does not make requests to any Llamenos-operated servers. The app requires internet access to connect to the hub.

PUSH NOTIFICATIONS

Push notifications are used to alert volunteers of incoming calls. The app requests notification permission on first launch. Notifications are required for the core call-answering feature but are not required to use note-taking and reporting features.

OPEN SOURCE

The full source code is available at: https://github.com/rhonda-rodododo/llamenos-platform

If you have any questions during review, please contact: support@llamenos-hotline.com
```

---

## What's New (first release)

```
Initial release of Llamenos for iOS.

• End-to-end encrypted call notes and reports
• Shift management and parallel call routing
• Template-driven case management
• On-device transcription (audio never leaves your device)
• Support for 13 languages
• Self-hosted — your data stays on your infrastructure
```

---

## Screenshots Guidance

Screenshots should show (in order):

1. **Home / dashboard** — showing on-shift status and recent activity
2. **Incoming call alert** — CallKit call screen or push notification
3. **Note-taking screen** — during or after a call, showing the encrypted note editor
4. **Case report form** — showing template-driven fields
5. **Shift schedule** — showing the shift management interface
6. **Settings / encryption status** — showing encryption key info or security settings

For each screenshot, overlay text should emphasize:
- "End-to-end encrypted"
- "Server cannot read your notes"
- "Audio never leaves your device" (transcription screen)
- "Self-hosted — your data, your infrastructure"

---

## App Clip (optional, future)

Not applicable for initial release.

---

## Notes for Legal Review Before Submission

- [ ] Confirm privacy policy URL is live and accessible: `https://llamenos-hotline.com/privacy`
- [ ] Confirm support URL is live: `https://llamenos-hotline.com/support`
- [ ] Confirm "Llamenos" is acceptable as app name (no trademark conflicts)
- [ ] Confirm contact email addresses (`support@`, `privacy@`, `legal@`) are active
- [ ] Confirm test hub URL and credentials are ready for App Review team
- [ ] Review export compliance: HPKE / AES-256-GCM encryption — select "Yes, qualifies for exemption" under encryption export compliance (standard encryption, not proprietary, same as TLS)
- [ ] Confirm AGPL-3.0 license acknowledgment in Settings → About is present and links to license text
