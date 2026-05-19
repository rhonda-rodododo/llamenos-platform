---
title: Privacy Policy
subtitle: What Llámenos collects, how it's protected, and your rights as a user.
---

**Effective date: May 18, 2026**

Llámenos is open-source crisis response software. This policy applies to the Llámenos iOS app and the backend services operated by your hub administrator. It does not apply to hubs operated by third parties — each hub's administrator is responsible for their own data practices.

---

## What We Collect

### Account and identity data

- **Device public key** — a cryptographic identifier unique to your device. Never shared outside your hub.
- **Push notification token** — used only to deliver call alerts to your device. Rotated periodically.
- **Role and hub membership** — which hubs you belong to and your assigned role (volunteer, admin).
- **Device metadata** — device model, OS version, and app version. Collected when you register a device. Used for security monitoring and support.

### Activity data

- **Call metadata** — timestamps, call duration, which volunteer answered. Not the content of calls.
- **Shift records** — which shifts you were scheduled for and whether you were active.
- **Audit log entries** — actions taken in the app (note created, report submitted, settings changed). Visible to admins only.
- **Security events** — device registrations, revocations, session activity, and account changes. Stored in your security history, visible to you and admins.

### Content you create — end-to-end encrypted

- **Call notes and transcripts** — written notes and browser-generated transcripts from calls you handle.
- **Reports and case records** — structured reports, custom fields, file attachments, and case history.
- **Contact records** — caller contact information, if recorded.
- **Messages** — inbound text messages routed to your hub.

**The server stores this content as ciphertext only.** It cannot be read by the server operator, the hosting provider, or Llámenos. Your encryption keys are protected by your PIN and identity provider credentials, and optionally a hardware security key. Decryption happens only on your authenticated device.

### Broadcast/subscriber data

If your hub uses broadcast messaging, subscriber phone numbers are stored as **hashed identifiers** — not as plaintext phone numbers. This means the database never contains a readable subscriber list. Opt-out (STOP) requests are processed immediately and cannot be ignored.

When a broadcast message is sent, the server processes plaintext message content momentarily to deliver it via the messaging provider (SMS, WhatsApp, Signal, or RCS). The server does not store broadcast message content after delivery — only delivery status records are retained.

### Recovery group data

If you configure a recovery group, the server stores:
- Your recovery group public key (used to verify recovery requests)
- Encrypted share fragments (each fragment encrypted to a specific share holder's device — the server cannot read them)
- Recovery request records (timing, status — not content)

**The server cannot reconstruct your recovery key.** Share fragments are encrypted end-to-end to each share holder's device. A minimum threshold of share holders must actively contribute their shares for recovery to succeed.

### Crash reports and diagnostics

If enabled by your hub administrator, the app may send crash reports to a diagnostics service. These contain device model, OS version, app version, and a stack trace. They do not contain call content, notes, or personal identity information.

### Location

The app does not collect location data. If a future feature requests location access, it will be optional, disclosed separately, and not used for tracking.

---

## How We Use Data

- **To operate the app** — routing calls to on-shift volunteers, enabling note-taking, managing shifts and reports.
- **For security** — detecting abuse, maintaining ban lists, rate limiting, and providing device security history.
- **For auditing** — providing administrators with audit logs of app activity (not content).
- **For recovery** — storing encrypted share fragments so that recovery groups can help users regain access.

We do not use your data for advertising. We do not sell or share your data with third parties for commercial purposes. We do not build behavioral profiles.

---

## End-to-End Encryption

All note content, transcripts, reports, contact records, and inbound messages are end-to-end encrypted. Each item uses a unique random key. Your private key never leaves your device. The server receives and stores only ciphertext.

**What this means in practice:**

| Data type | Server can read? | Obtainable under subpoena |
|-----------|-----------------|---------------------------|
| Call notes | No | Encrypted ciphertext only |
| Transcripts | No | Encrypted ciphertext only |
| Reports | No | Encrypted ciphertext only |
| Case records | No | Encrypted ciphertext only |
| Inbound messages | No | Encrypted ciphertext only |
| Recovery shares | No | Encrypted ciphertext only |
| Outbound broadcast messages | **Yes, momentarily during delivery** | Yes (plaintext at time of send) |
| Call metadata | Yes | Yes |
| Your device public key | Yes | Yes |
| Security events | Yes | Yes |

See our [Security page](/security) for a full breakdown.

---

## Data Retention

### Content you create

Notes, transcripts, reports, and messages are retained until you or an admin explicitly deletes them, or your hub is shut down. Your hub administrator can configure retention periods that automatically purge content older than a set threshold.

### Broadcast messages

Broadcast message content is not stored after delivery. Only delivery status records (sent, failed, unsubscribed) are retained. Your hub admin controls how long delivery records are kept.

### Call metadata and audit logs

Retained per your hub administrator's configuration. Platform-enforced minimums prevent administrators from setting retention periods that would destroy audit evidence before required legal holds expire.

### Security events and device records

Security events (device registrations, revocations, session activity) are retained for the lifetime of your account. These are part of the security audit trail and support your right to review account activity.

### Recovery shares

Encrypted share fragments are retained until you delete your recovery group configuration or your account is erased.

### Push tokens

Removed when you log out or uninstall the app.

### Account data and erasure

You can request complete erasure of your account — see below.

---

## Account Erasure

You have the right to request permanent deletion of your account. Llámenos implements erasure with strong cryptographic guarantees.

### What erasure does

1. **Keys destroyed first**: Your device encryption keys are destroyed immediately. This renders all content you created permanently unreadable — even from database backups — before any database deletion occurs.
2. **Account and device records deleted**: Your account record, device registrations, push tokens, and role assignments are removed.
3. **Audit entries crypto-shredded**: The encryption key for your audit log entries is destroyed, making your entries unreadable. The audit chain's tamper-evident structure remains intact (required for hub integrity).
4. **Encrypted content re-wrapped**: Notes and reports you authored are re-encrypted for remaining authorized readers (other admins). Your copy of the decryption key is removed; the content persists for case continuity.

### Self-service erasure

Available from your account settings on all platforms. By default, there is a delay (set by your hub admin, typically 72 hours, minimum 24 hours, maximum 7 days) before erasure completes. **You can cancel during this period.** The delay is a safety feature — it protects you if you are being coerced into erasing your account.

### Emergency erasure

If you face immediate danger, a co-approver (a trusted admin or contact) can approve emergency erasure, reducing the delay to a minimum of 4 hours. The 4-hour floor exists to protect against coerced deletion of evidence when help is on the way.

### Admin erasure

Hub admins can initiate immediate erasure of any account in their hub. This is subject to audit logging.

---

## Third-Party Services

Llámenos integrates with telephony providers for call routing (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, or self-hosted Asterisk/FreeSWITCH). Your hub administrator selects the provider.

**What telephony providers receive:**

- The phone number of the caller (inbound calls)
- Call duration and timestamps
- They do **not** receive call notes, transcripts, or any content you create in the app

**What messaging providers receive for broadcast messages:**

- Message content (SMS, WhatsApp, RCS) — the provider must receive plaintext to deliver the message
- For Signal broadcasts, content is delivered end-to-end encrypted via the Signal network

Your hub administrator may use additional third-party services (crash reporting, monitoring). Consult your hub's privacy notice for specifics.

---

## Your Rights Under GDPR

Llámenos is developed by an EU-based organization. If you are in the European Economic Area, you have the following rights under the General Data Protection Regulation:

- **Right of access** — request a copy of personal data held about you
- **Right to rectification** — correct inaccurate data
- **Right to erasure** — request permanent deletion of your account and all associated data (see [Account Erasure](#account-erasure) above and our [Data Deletion page](/data-deletion) for full details)
- **Right to data portability** — receive your data in a structured, machine-readable format
- **Right to object** — object to processing based on legitimate interests
- **Right to restrict processing** — request that processing be limited
- **Right to withdraw consent** — where processing is based on consent, withdraw it at any time

**Note on encrypted content**: Because call notes, transcripts, and reports are end-to-end encrypted and the server cannot read them, we cannot provide you with a decrypted export of content you did not directly access on your device. We can confirm what encrypted records exist and delete them. For content you can still decrypt (on an active device), the app allows you to view and export your own notes.

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
