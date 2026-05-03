---
title: Privacy Policy
subtitle: What Llámenos collects, how it's protected, and your rights as a user.
---

**Effective date: May 1, 2026**

Llámenos is open-source crisis response software. This policy applies to the Llámenos iOS app and the backend services operated by your hub administrator. It does not apply to hubs operated by third parties — each hub's administrator is responsible for their own data practices.

---

## What We Collect

### Account and identity data

- **Device public key** — a cryptographic identifier unique to your device. Never shared outside your hub.
- **Push notification token** — used only to deliver call alerts to your device. Rotated periodically.
- **Role and hub membership** — which hubs you belong to and your assigned role (volunteer, admin).

### Activity data

- **Call metadata** — timestamps, call duration, which volunteer answered. Not the content of calls.
- **Shift records** — which shifts you were scheduled for and whether you were active.
- **Audit log entries** — actions taken in the app (note created, report submitted, settings changed). Visible to admins only.

### Content you create — end-to-end encrypted

- **Call notes and transcripts** — written notes and browser-generated transcripts from calls you handle.
- **Reports and case records** — structured reports, custom fields, file attachments, and case history.
- **Contact records** — caller contact information, if recorded.
- **Messages** — inbound text messages routed to your hub.

**The server stores this content as ciphertext only.** It cannot be read by the server operator, the hosting provider, or Llámenos. Your encryption keys are protected by your PIN and identity provider credentials, and optionally a hardware security key. Decryption happens only on your authenticated device.

### Crash reports and diagnostics

If enabled by your hub administrator, the app may send crash reports to a diagnostics service. These contain device model, OS version, app version, and a stack trace. They do not contain call content, notes, or personal identity information.

### Location

The app does not collect location data. If a future feature requests location access, it will be optional, disclosed separately, and not used for tracking.

---

## How We Use Data

- **To operate the app** — routing calls to on-shift volunteers, enabling note-taking, managing shifts and reports.
- **For security** — detecting abuse, maintaining ban lists, rate limiting.
- **For auditing** — providing administrators with audit logs of app activity (not content).

We do not use your data for advertising. We do not sell or share your data with third parties for commercial purposes. We do not build behavioral profiles.

---

## End-to-End Encryption

All note content, transcripts, reports, contact records, and messages are end-to-end encrypted using HPKE (RFC 9180, X25519-HKDF-SHA256-AES256-GCM). Each item uses a unique random key. Your private key never leaves your device. The server receives and stores only ciphertext.

**What this means in practice:**

| Data type | Server can read? | Obtainable under subpoena |
|-----------|-----------------|---------------------------|
| Call notes | No | Encrypted ciphertext only |
| Transcripts | No | Encrypted ciphertext only |
| Reports | No | Encrypted ciphertext only |
| Messages | No | Encrypted ciphertext only |
| Call metadata | Yes | Yes |
| Your device public key | Yes | Yes |

See our [Security page](/security) for a full breakdown.

---

## Data Retention

- **Content you create** is retained until you or an admin deletes it, or your hub is shut down.
- **Call metadata and audit logs** are retained per your hub administrator's configuration.
- **Push tokens** are removed when you log out or uninstall the app.
- **Account data** is removed when your account is deleted by an admin.

---

## Third-Party Services

Llámenos integrates with telephony providers for call routing (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, or self-hosted Asterisk/FreeSWITCH). Your hub administrator selects the provider.

**What telephony providers receive:**

- The phone number of the caller (inbound calls)
- Call duration and timestamps
- They do **not** receive call notes, transcripts, or any content you create in the app

Your hub administrator may use additional third-party services (crash reporting, monitoring). Consult your hub's privacy notice for specifics.

---

## Your Rights Under GDPR

Llámenos is developed by an EU-based organization. If you are in the European Economic Area, you have the following rights under the General Data Protection Regulation:

- **Right of access** — request a copy of personal data held about you
- **Right to rectification** — correct inaccurate data
- **Right to erasure** — request deletion of your account and associated data
- **Right to data portability** — receive your data in a structured, machine-readable format
- **Right to object** — object to processing based on legitimate interests
- **Right to restrict processing** — request that processing be limited
- **Right to withdraw consent** — where processing is based on consent, withdraw it at any time

To exercise these rights, contact your hub administrator (the data controller for your hub), or reach us at [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

You also have the right to lodge a complaint with your national data protection authority.

---

## Children's Privacy

Llámenos is not directed at children under 13, or under 16 in the EU. We do not knowingly collect personal data from children. If you believe a child has submitted personal data through the app, contact us and we will delete it promptly.

---

## Changes to This Policy

We will post any changes to this policy on this page and update the effective date. For significant changes, we will provide notice through the app or by email where feasible.

---

## Contact

**Privacy inquiries:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Bug reports and security disclosures:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llámenos is open source. You can audit what the app does: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
