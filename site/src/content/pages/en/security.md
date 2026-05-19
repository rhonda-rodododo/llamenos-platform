---
title: Security & Privacy
subtitle: What's protected, what's visible, and what can be obtained under subpoena — organized by which features you use.
---

## If your hosting provider is subpoenaed

| They CAN provide | They CANNOT provide |
|------------------|---------------------|
| Call/message metadata (times, durations) | Note content, transcripts, report bodies |
| Encrypted database blobs | Volunteer names (end-to-end encrypted) |
| Which volunteer accounts were active when | Contact directory records (end-to-end encrypted) |
| Broadcast message delivery records | Message content (encrypted on arrival, stored as ciphertext) |
| | Decryption keys (protected by your PIN, your identity provider account, and optionally your hardware security key) |
| | Per-note encryption keys (ephemeral — destroyed after wrapping) |
| | Your HMAC secret for reversing phone hashes |
| | Recovery share content (encrypted, server cannot read) |

**The server stores data it cannot read.** Metadata (when, how long, which accounts) is visible. Content (what was said, what was written, who your contacts are) is not.

---

## By feature

Your privacy exposure depends on which channels you enable:

### Voice calls

| If you use... | Third parties can access | Server can access | End-to-end encrypted content |
|---------------|-------------------------|-------------------|------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), call records | Call metadata | Notes, transcripts |
| Self-hosted Asterisk | Nothing (you control it) | Call metadata | Notes, transcripts |
| Browser-to-browser (WebRTC) | Nothing | Call metadata | Notes, transcripts |

**Telephony provider subpoena**: They have call detail records (times, phone numbers, durations). They do NOT have call notes or transcripts. Recording is disabled by default.

**Transcription**: Transcription happens entirely in your browser using on-device AI. **Audio never leaves your device.** Only the encrypted transcript is stored.

### Text messaging (one-to-one)

| Channel | Provider access | Server storage | Notes |
|---------|-----------------|----------------|-------|
| SMS | Your telephony provider reads all messages | **Encrypted** | Provider retains original messages |
| WhatsApp | Meta reads all messages | **Encrypted** | Provider retains original messages |
| Signal | Signal network is end-to-end encrypted; bridge re-encrypts on arrival | **Encrypted** | Preferred route when available |

**Signal-first delivery**: When a recipient has Signal, messages are routed through Signal automatically — your telephony provider never sees the content. For SMS, only a generic "you have a new message" notification is sent by default (no message body), so your provider's logs contain no sensitive content.

**Messages are encrypted the moment they arrive at your server.** The server stores only ciphertext. Your telephony or messaging provider may still have the original message — that's a limitation of those platforms, not something we can change.

**Messaging provider subpoena**: SMS providers have full message content only if you explicitly enable full-content SMS mode. With the default notification-only mode, SMS bodies contain no message content. Meta has WhatsApp content. Signal messages are end-to-end encrypted to the bridge, but the bridge (running on your server) decrypts them before re-encrypting for storage. In all cases, **your server only has ciphertext** — the hosting provider cannot read message content.

### Bulk and broadcast messages

Admins can send broadcast messages to subscribers via SMS, WhatsApp, Signal, or RCS.

**Important: outbound broadcast messages are not end-to-end encrypted at the server.** To deliver a message to SMS or WhatsApp subscribers, the server must process the plaintext content momentarily and hand it to the messaging provider. The provider then delivers it and may retain a copy.

| Channel | Server access during send | Provider access | After delivery |
|---------|--------------------------|-----------------|----------------|
| SMS blast | Plaintext (momentary, for delivery) | Full message content | Provider retains |
| WhatsApp blast | Plaintext (momentary, for delivery) | Full message content (Meta) | Provider retains |
| Signal blast | Plaintext (momentary, for delivery) | End-to-end encrypted via Signal network | Not retained by provider |
| RCS blast | Plaintext (momentary, for delivery) | Google may see content | Provider retains |

**What this means**: Broadcast messages should not contain sensitive caller information. Use them for announcements, scheduling notices, and resources — not for case details or anything that could identify callers or volunteers.

Subscriber phone numbers are stored as hashed identifiers — your database never contains a plaintext subscriber list. Opt-out (STOP) requests are processed immediately and subscriber status updated.

### Notes, transcripts, and reports

All volunteer-written content is end-to-end encrypted:

- Each note uses a **unique random key** (forward secrecy — compromising one note doesn't compromise others)
- Keys are wrapped separately for the volunteer and each admin
- The server stores only ciphertext
- Decryption happens on your device, in a secure layer that never exposes keys to the app's user interface
- **Custom fields, report content, and file attachments are all individually encrypted**

**Case records and entity data**: Structured case records (contacts, cases, evidence chains) follow the same encryption model — each item encrypted with a unique key, wrapped for authorized viewers. The server cannot read case content.

**Device seizure**: Without your PIN **and** access to your identity provider account, attackers get an encrypted blob protected by Argon2id — a memory-hard key derivation function that makes brute-force attacks with specialized hardware (GPUs, ASICs) orders of magnitude more expensive than traditional approaches. If you also use a hardware security key, **three independent factors** protect your data.

---

## Your devices

### Viewing and revoking devices

The app keeps a list of every device you've logged in from. You can view this list and revoke any device you don't recognize.

**When you revoke a device:**
- That device is immediately blocked from accessing your account
- Your encryption keys are rotated so the revoked device cannot decrypt any future content
- The revocation is recorded in your account's security history

This means that even if someone has a copy of your encrypted data from before the revocation, they cannot read new content created after the revocation.

### SAS emoji verification

For organizations with high security needs, admins can verify the identity of a device using SAS (Short Authentication String) verification — displayed as a sequence of 7 emoji.

**How it works:**
1. The admin and the device owner compare their emoji sequences (in person, by phone, or via a trusted channel)
2. If the emoji match, the device is confirmed as belonging to its registered owner
3. The verification is recorded — admins can see which devices have been verified

This protects against an attacker who has registered a fake device under someone else's account. The emoji sequence is derived from both devices' cryptographic identity keys and a one-time code — the server cannot manipulate or predict it.

---

## Account erasure

### Self-service erasure

You can request that your account and all data associated with it be permanently deleted. By default there is a delay (set by your hub admin, typically 72 hours) before erasure completes — this gives you time to cancel if the request was made under duress.

**What gets deleted:**
- Your device keys (rendering all encrypted content permanently unreadable, even from backups)
- Your account record, role assignments, and shift history
- Your push notification tokens

**What happens to encrypted content you created**: Notes, transcripts, and reports you authored are re-encrypted for the remaining authorized readers (other admins). Your copy of the decryption key is destroyed. The content itself persists for other authorized viewers — it is not bulk-deleted, because callers and case history belong to the hub, not to you personally.

**Audit logs**: Your audit log entries are crypto-shredded — the per-user encryption key is destroyed, making your entries unreadable. The hash chain (the tamper-evident structure) remains intact.

### Emergency erasure

If you believe your account is under immediate threat, you can request emergency erasure with a co-approver — another trusted person (admin or trusted contact) who signs off on the urgency. This reduces the delay to a minimum of 4 hours. The 4-hour floor exists to protect against coerced erasure (being forced to delete evidence before help arrives).

### What cannot be erased

Call metadata (who answered, when, how long) is part of the hub's audit record. Your hub admin controls how long this is retained. Under GDPR, you have the right to request correction or deletion — contact your hub admin.

---

## Recovery groups

If you lose all your devices (phone destroyed, laptop stolen, everything), you would normally lose access to all your encrypted data. Recovery groups solve this.

### How recovery works

You designate a group of trusted contacts (typically 3–5 people) as your recovery group. Each contact holds one "share" of a recovery key — a piece of a puzzle.

**To recover your account:**
1. You register a new device and initiate a recovery request
2. Your recovery contacts each receive a notification
3. After a configurable delay (to give you time to cancel a coerced request), a threshold number of contacts (e.g., 2 out of 3) approve the request
4. Each approving contact sends their share, encrypted directly to your new device
5. Your new device combines the shares to reconstruct the recovery key, which restores access to your encrypted data

**What the server can see**: The server relays encrypted share fragments between devices. It cannot read the shares, cannot reconstruct the recovery key on its own, and cannot bypass the threshold requirement.

### Security properties of recovery groups

- **Threshold security**: Below-threshold shares reveal nothing about the secret — a single share holder cannot recover your account alone
- **No server involvement in the secret**: Shares are encrypted directly to your new device's public key; the server stores and relays only ciphertext
- **Per-hub scope**: Recovery restores your access to one specific hub. If you're in multiple hubs, each hub has its own recovery group
- **Delay with cancellation**: You can cancel a recovery request during the delay period — protection against someone initiating a recovery request on your behalf without your knowledge
- **Signal verification**: Recovery requests are verified via Signal to confirm you control the Signal account associated with your identity

### Choosing recovery contacts

Choose people you trust who:
- Are reachable independently (not all in the same location or organization)
- Use Signal themselves (required for the verification step)
- Understand they will occasionally be asked to approve recovery requests

Your recovery contacts do not gain access to your encrypted data by holding a share — they can only help you recover when you initiate a request.

---

## Volunteer phone number privacy

When volunteers receive calls to their personal phones, their numbers are exposed to your telephony provider.

| Scenario | Phone number visible to |
|----------|------------------------|
| PSTN call to volunteer's phone | Telephony provider, phone carrier |
| Browser-to-browser (WebRTC) | No one (audio stays in browser) |
| Self-hosted Asterisk + SIP phone | Only your Asterisk server |

**To protect volunteer phone numbers**: Use browser-based calling (WebRTC) or provide SIP phones connected to self-hosted Asterisk.

---

## Recently shipped

These improvements are live today:

| Feature | Privacy benefit |
|---------|-----------------|
| Device management | View and revoke any logged-in device; revocation triggers key rotation so the removed device cannot read new content |
| SAS emoji device verification | Admins can verify devices in person using a cryptographic fingerprint displayed as 7 emoji — cannot be faked by the server |
| Account erasure with delay | Request deletion of your account; configurable delay lets you cancel if the request was coerced |
| Emergency erasure | Co-approved fast-track erasure with a 4-hour minimum floor |
| Crypto-shredding on erasure | Your encryption keys are destroyed first, rendering content permanently unreadable before any database deletion |
| Recovery groups (Shamir) | Designate trusted contacts who can help you recover if you lose all devices — below-threshold shares reveal nothing |
| Broadcast messaging with honest disclosure | Admins can send bulk messages; server processes plaintext momentarily for delivery (disclosed clearly in UI) |
| Subscriber hashing | Broadcast subscriber phone numbers stored as hashed identifiers — no plaintext subscriber list in the database |
| Argon2id key protection | Your device keys are protected by a memory-hard function that resists brute-force attacks with GPUs and specialized hardware |
| Signal-first message routing | Messages are automatically routed through Signal when available, keeping content off SMS provider logs |
| SMS notification-only mode | SMS recipients see only "you have a new message" — no sensitive content in provider logs |
| Traffic analysis resistance | Real-time event sizes are padded so observers cannot distinguish short messages from long ones |
| No plaintext phone numbers in database | Caller numbers are stored as irreversible hashes — your database never contains the actual phone number |
| Per-hub encryption with forward secrecy | Each hub's real-time events are encrypted with keys that rotate every 24 hours — old keys cannot decrypt new events |
| Cryptography in Rust on all platforms | Desktop, iOS, and Android all run the same audited Rust cryptography library — keys never enter JavaScript, Swift, or Kotlin code |
| Restricted relay access | Your WebSocket relay accepts events only from your server — no outside party can inject fake notifications |
| Encrypted message storage | SMS, WhatsApp, and Signal messages stored as ciphertext on your server |
| On-device transcription | Audio never leaves your device — processed entirely on-device using local AI |
| Multi-factor key protection | Your encryption keys are protected by your PIN, your identity provider, and optionally a hardware security key |
| Hardware security keys | Physical keys add a third factor that cannot be remotely compromised |
| Reproducible builds | Verify that deployed code matches the public source |
| Encrypted contact directory | Contact records, relationships, and notes are end-to-end encrypted |

## Still planned

| Feature | Privacy benefit | Status |
|---------|-----------------|--------|
| Native call-receiving apps | No personal phone numbers exposed | In development |
| Certificate pinning (mobile) | Defense against rogue CA TLS interception | Scaffolding complete; pins pending first deployment |
| SFrame voice media encryption | End-to-end encrypted voice calls | Key derivation complete; per-frame encryption planned |

---

## Summary table

| Data type | Encrypted | Visible to server | Obtainable under subpoena |
|-----------|-----------|-------------------|---------------------------|
| Call notes | Yes (end-to-end) | No | Ciphertext only |
| Transcripts | Yes (end-to-end) | No | Ciphertext only |
| Reports | Yes (end-to-end) | No | Ciphertext only |
| Case records / entity data | Yes (end-to-end) | No | Ciphertext only |
| File attachments | Yes (end-to-end) | No | Ciphertext only |
| Contact records | Yes (end-to-end) | No | Ciphertext only |
| Volunteer identities | Yes (end-to-end) | No | Ciphertext only |
| Team/role metadata | Yes (encrypted) | No | Ciphertext only |
| Custom field definitions | Yes (encrypted) | No | Ciphertext only |
| Inbound SMS/WhatsApp/Signal content | Yes (on your server) | No | Ciphertext from your server; provider may have original |
| Outbound broadcast messages | **No — plaintext during delivery** | **Yes, momentarily** | Yes (plaintext at time of send) |
| Recovery shares | Yes (end-to-end to recipient device) | No | Ciphertext only |
| Real-time events | Yes (per-hub, rotating keys) | No | Ciphertext only |
| Call metadata | No | Yes | Yes |
| Broadcast delivery records | No | Yes | Yes |
| Caller phone hashes | HMAC hashed | Hash only | Hash (not reversible without your secret) |
| Subscriber phone hashes | HMAC hashed | Hash only | Hash (not reversible without your secret) |
| User-Agent strings | SHA-256 hashed | Hash only | Hash (not reversible) |

---

## For security auditors

Technical documentation:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Gaps and Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API Documentation](/api/docs)

Llamenos is open source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
