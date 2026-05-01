# Llámenos — Android Data Safety Section

This document provides answers to Google Play's Data Safety questionnaire for the Llamenos app.
Reference: [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)

---

## Section 1: Data Collection and Security

### Does your app collect or share any of the required user data types?

**Yes** — the app collects limited data necessary for its function (see details below).

### Is all of the user data collected by your app encrypted in transit?

**Yes** — all data is transmitted over TLS. All user-generated content (notes, reports, messages) is additionally end-to-end encrypted before transmission, so the server receives only ciphertext.

### Do you provide a way for users to request that their data is deleted?

**Yes** — users can request deletion of their account and all associated data. As an EU-organized project, GDPR Article 17 (right to erasure) applies. Requests are handled via the administrator of the user's hub or via `privacy@llamenos-hotline.com`.

---

## Section 2: Data Types Collected

### App activity

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| App interactions | Yes | No | No | Required | Audit log (tamper-evident activity record for admins); shift and availability tracking |
| In-app search history | No | — | — | — | — |
| Installed apps | No | — | — | — | — |
| Other user-generated content | Yes (E2EE) | No | No | Optional | Call notes, case reports, and contact records — stored as ciphertext only |

**Notes on app interactions:** The audit log records events such as "call answered", "note created", "report submitted". This log is stored on the user's self-hosted hub and is visible only to admins of that hub. It is never transmitted to Llamenos or any third party.

**Notes on user-generated content:** All notes, reports, transcripts, and messages are end-to-end encrypted on-device using HPKE (RFC 9180 / X25519-HKDF-SHA256-AES256-GCM) before leaving the device. The server stores only ciphertext. The Llamenos project cannot access this content. Hub administrators can access content only if they possess the appropriate decryption keys (which are distributed to authorized devices via the app's key management system).

---

### Device or other identifiers

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| Device or other identifiers (push token) | Yes | No | No | Required | Firebase Cloud Messaging (FCM) push token used to deliver incoming call notifications to the correct device |

**Notes on device identifiers:** The FCM push token is stored on the user's self-hosted hub server, associated with their account, solely for the purpose of delivering push notifications for incoming calls. It is not shared with Llamenos or any advertising network. The token is rotated by Android/FCM periodically; old tokens are deleted on renewal.

---

### Personal info

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| Name | Yes (admin-only visibility) | No | No | Required for account | Volunteer display name — visible only to admins of the same hub, never to other volunteers or callers |
| Email address | No | — | — | — | — |
| Phone number | No | — | — | — | — |
| Precise location | No | — | — | — | — |
| Coarse location | No | — | — | — | — |
| Physical address | No | — | — | — | — |
| Other personal info | No | — | — | — | — |

**Notes on personal info:** Volunteer display names are stored on the self-hosted hub. They are never exposed to callers or other volunteers — only to admins. No email addresses or phone numbers of volunteers are collected by the app (phone numbers may be optionally stored by admins in the CMS contact directory, where they are end-to-end encrypted).

---

### Messages

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| Emails | No | — | — | — | — |
| SMS or MMS | No | — | — | — | — |
| Other in-app messages | Yes (E2EE) | No | No | Optional | Encrypted messaging between volunteers and admins within the app |

**Notes on messages:** All in-app messages are end-to-end encrypted before transmission. The server stores only ciphertext. Content is never accessible to Llamenos or the hosting provider.

---

### Audio or video

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| Voice or sound recordings | No — processed ephemerally on-device only | No | Yes | Optional | On-device transcription via local AI model; audio is processed entirely within the app and is never transmitted |
| Music files | No | — | — | — | — |
| Videos | No | — | — | — | — |
| Other audio or video files | No | — | — | — | — |

**Notes on audio:** Call audio is processed entirely on-device using a locally-running AI model (WASM/ONNX). No audio data is uploaded to any server. The transcription feature is opt-in.

---

### Crash logs and diagnostics

| Data type | Collected? | Shared with third parties? | Processed ephemerally? | Required or optional? | Purpose |
|-----------|-----------|--------------------------|----------------------|----------------------|---------|
| Crash logs | Yes | No | No | Required | Crash reports stored on the user's self-hosted hub for debugging purposes |
| Diagnostics | No | — | — | — | — |
| Other app performance data | No | — | — | — | — |

**Notes on crash logs:** Crash reports (stack traces, device model, OS version, app version) are sent to the user's self-hosted hub only — never to Llamenos or any third party. Crash logs do not contain user-generated content (notes, reports, or messages).

---

## Section 3: Data Sharing

### Is any data shared with third parties?

**No.** The app communicates exclusively with the user's self-hosted hub server. No data is shared with:
- Llamenos (the project)
- Google (beyond standard Android OS interactions)
- Advertising networks
- Analytics providers
- Any other third party

The only external communication is FCM push delivery (device token → Google FCM → device), which is inherent to Android push notifications and does not expose user content.

---

## Section 4: Security Practices

### Does your app use encryption to protect data in transit?

**Yes.** All network communication uses TLS. All user-generated content is additionally end-to-end encrypted before transmission using HPKE (RFC 9180 / X25519-HKDF-SHA256-AES256-GCM).

### Does your app follow Google Play's Families Policy?

**No** — this app is not designed for children and does not target minors.

### Does your app meet the independent security review requirements?

The app has not yet undergone a formal independent security review. An audit is planned prior to production launch. The cryptographic implementation is open source and based on standard algorithms (HPKE RFC 9180, Ed25519, HKDF, AES-256-GCM).

---

## Section 5: Data Deletion

### How can users request deletion of their data?

Users can request deletion through:

1. **In-app**: Settings → Account → Delete Account (removes all user data from the hub)
2. **Admin**: Hub administrators can delete volunteer accounts and associated data from the admin panel
3. **Email**: `privacy@llamenos-hotline.com` — requests processed within 30 days per GDPR Article 17

**What is deleted:**
- Account credentials and display name
- All encrypted notes and reports authored by the user
- Device keys and push tokens
- Shift records and availability data
- Audit log entries referencing the user (anonymized, not deleted, to preserve audit chain integrity)

**What is retained (and why):**
- Anonymized audit log hash chain — required for tamper-detection integrity; personal identifiers are removed but the chain structure is preserved

---

## Summary Table for Play Console Data Safety Form

| Category | Data type | Collected | Shared | Encrypted in transit | User can request deletion |
|----------|-----------|-----------|--------|---------------------|--------------------------|
| App activity | App interactions / audit log | Yes | No | Yes (TLS + E2EE) | Partial (audit chain integrity preserved) |
| App activity | User-generated content (notes, reports) | Yes (E2EE) | No | Yes (TLS + E2EE) | Yes |
| Device identifiers | Push token (FCM) | Yes | No (FCM delivery only) | Yes (TLS) | Yes |
| Personal info | Display name | Yes | No | Yes (TLS) | Yes |
| Messages | In-app messages | Yes (E2EE) | No | Yes (TLS + E2EE) | Yes |
| Audio | Call audio for transcription | Ephemeral only | No | N/A (on-device only) | N/A |
| Crash logs | Crash reports | Yes | No | Yes (TLS) | Yes |

---

## Notes for Legal Review Before Submission

- [ ] Confirm privacy policy URL is live: `https://llamenos-hotline.com/privacy`
- [ ] Verify FCM token handling is described accurately (token rotation behavior)
- [ ] Confirm audit log anonymization behavior matches implementation in `apps/worker/`
- [ ] Confirm GDPR DPA (Data Processing Agreement) template is available for hub operators
- [ ] Confirm `privacy@llamenos-hotline.com` is a monitored inbox with 30-day SLA
- [ ] Review whether any third-party SDKs (crash reporting, analytics) have been added since this document was written — if so, update data sharing section accordingly
- [ ] Confirm no advertising SDKs are included (verify `apps/android/app/build.gradle.kts` dependencies)
