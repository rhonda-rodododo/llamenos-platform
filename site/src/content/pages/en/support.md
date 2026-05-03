---
title: Support
subtitle: Get help with Llámenos — setup, configuration, and troubleshooting.
---

## Contact

**Email:** [support@llamenos-hotline.com](mailto:support@llamenos-hotline.com)

We aim to respond within 2 business days. For urgent issues affecting an active crisis line, include "URGENT" in the subject line.

**Bug reports and feature requests:** [github.com/rhonda-rodododo/llamenos-hotline/issues](https://github.com/rhonda-rodododo/llamenos-hotline/issues)

**Security disclosures:** For vulnerabilities, please use GitHub's private security advisory feature rather than opening a public issue.

---

## Documentation

- [Deployment guide](/docs/deploy) — set up your own self-hosted hub
- [Admin guide](/docs/admin-guide) — manage volunteers, shifts, and settings
- [Volunteer guide](/docs/volunteer-guide) — answer calls, write notes, use the app
- [Reporter guide](/docs/reporter-guide) — submit reports and case records

---

## Frequently Asked Questions

### Getting started

**What is Llámenos?**

Llámenos is open-source software for operating a secure crisis response hotline. Organizations self-host their own hub. When someone calls your hotline number, all on-shift volunteers ring simultaneously — the first to answer takes the call. Volunteers log encrypted notes. Admins manage shifts, volunteers, and settings.

**Who runs Llámenos?**

Each organization runs their own hub. There is no central Llámenos cloud service. The iOS app connects to your organization's self-hosted hub, not to any Llámenos-operated server.

**How do I get the iOS app?**

Download Llámenos from the App Store. To use it, you need an invitation from the administrator of a hub. The app cannot be used without a hub connection.

**I received an invite — how do I set up my account?**

Open the invite link on your device. The app will guide you through creating your encrypted device keys and joining the hub. You will need to set a PIN — this PIN protects your encryption keys and cannot be recovered if forgotten.

---

### Calls and shifts

**I'm on shift but not receiving calls. What's wrong?**

Check that:
- You are marked as available in the app
- Push notifications are enabled for Llámenos in iOS Settings → Notifications
- Your hub administrator has configured a telephony provider
- You are assigned to the active shift or ring group

If notifications work for other apps but not Llámenos, contact your hub administrator to verify the push notification configuration.

**Can I receive calls on my personal phone number?**

By default, calls are delivered as push notifications to the app. If your administrator has enabled PSTN fallback (forwarding to a real phone number), your personal number would be exposed to the telephony provider. Ask your administrator which mode is configured.

**What happens if no one answers a call?**

After the configured timeout, the call goes to voicemail (if configured) or disconnects. Your administrator can configure fallback behavior in the hub settings.

---

### Privacy and encryption

**Can the server read my notes?**

No. Notes, transcripts, reports, and messages are end-to-end encrypted. The server stores only ciphertext. Your hub operator cannot read the content. See our [Privacy Policy](/privacy) and [Security page](/security) for technical details.

**What happens if I forget my PIN?**

Your PIN protects your encryption keys. If you forget it, your encrypted data cannot be recovered — this is a security feature, not a bug. Contact your hub administrator to reset your account. You will lose access to previously encrypted notes from your account.

**Is my call audio recorded?**

Recording is disabled by default. If your administrator has enabled recording, they must disclose this to volunteers. In-browser transcription uses on-device AI — audio never leaves your device.

---

### Technical issues

**The app says "Unable to connect to hub." What do I do?**

1. Check your internet connection
2. Confirm your hub administrator has the server running
3. Try closing and reopening the app
4. If the issue persists, contact your hub administrator with the error message from the app's diagnostics screen

**How do I report a bug?**

Open an issue at [github.com/rhonda-rodododo/llamenos-hotline/issues](https://github.com/rhonda-rodododo/llamenos-hotline/issues). Include:
- iOS version and device model
- App version (found in Settings → About)
- Steps to reproduce the issue
- What you expected vs. what happened
- Any error messages displayed

**I found a security vulnerability. How do I report it?**

Use GitHub's private security advisory: [github.com/rhonda-rodododo/llamenos-hotline/security/advisories/new](https://github.com/rhonda-rodododo/llamenos-hotline/security/advisories/new). Do not open a public issue for security vulnerabilities.

---

### For administrators

**How do I self-host a hub?**

See the [Deployment guide](/docs/deploy). Llámenos runs via Docker Compose on a standard Linux VPS. Minimum requirements: 2 vCPU, 2 GB RAM, PostgreSQL 16.

**How do I add volunteers to my hub?**

In the admin panel, go to Volunteers → Invite. Generate an invite link and share it securely with the volunteer. The link is single-use and expires.

**Which telephony providers are supported?**

Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth, Asterisk, and FreeSWITCH. See the admin guide for configuration instructions for each provider.

**Is there a hosted / managed version?**

Not currently. Llámenos is self-hosted software. We are exploring managed hosting options for organizations that cannot operate their own infrastructure — contact [support@llamenos-hotline.com](mailto:support@llamenos-hotline.com) if this is a blocker for your organization.
