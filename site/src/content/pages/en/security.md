---
title: Security & Privacy
subtitle: What's protected, what's visible, and what can be obtained under subpoena — organized by which features you use.
---

## If your hosting provider is subpoenaed

| They CAN provide | They CANNOT provide |
|------------------|---------------------|
| Call/message metadata (times, durations) | Note content, transcripts, report bodies |
| Encrypted database blobs | Decryption keys (stored on your devices) |
| Which volunteers were active when | Per-note encryption keys (ephemeral) |
| SMS/WhatsApp message content | Your HMAC secret for reversing phone hashes |

**The server stores data it cannot read.** Metadata (when, how long, who) is visible. Content (what was said, what was written) is not.

---

## By feature

Your privacy exposure depends on which channels you enable:

### Voice calls

| If you use... | Third parties can access | Server can access | E2EE content |
|---------------|-------------------------|-------------------|--------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), call records | Call metadata | Notes, transcripts |
| Self-hosted Asterisk | Nothing (you control it) | Call metadata | Notes, transcripts |
| Browser-to-browser (WebRTC) | Nothing | Call metadata | Notes, transcripts |

**Telephony provider subpoena**: They have call detail records (times, phone numbers, durations). They do NOT have call notes or transcripts. Recording is disabled by default.

**Transcription window**: During the ~30 seconds of transcription, audio is processed by Cloudflare Workers AI. After transcription, only encrypted text is stored.

### Text messaging

| Channel | Provider access | Server storage | Notes |
|---------|-----------------|----------------|-------|
| SMS | Your telephony provider reads all messages | Plaintext | Inherent limitation of SMS |
| WhatsApp | Meta reads all messages | Plaintext | WhatsApp Business API requirement |
| Signal | Signal network is E2EE, but the signal-cli bridge decrypts | Plaintext | Better than SMS, not zero-knowledge |

**Messaging provider subpoena**: SMS provider has full message content. Meta has WhatsApp content. Signal messages are E2EE to the bridge, but the bridge (running on your server) has plaintext.

**Future improvement**: We're exploring E2EE message storage where the server only stores ciphertext. See [roadmap](#whats-planned).

### Notes, transcripts, and reports

All volunteer-written content is end-to-end encrypted:

- Each note uses a unique random key (forward secrecy)
- Keys are wrapped separately for the volunteer and admin
- Server stores only ciphertext
- Decryption happens in the browser

**Device seizure**: Without your PIN, attackers get an encrypted blob. A 6-digit PIN with 600K PBKDF2 iterations takes hours to brute-force on GPU hardware.

---

## Volunteer phone number privacy

When volunteers receive calls to their personal phones, their numbers are exposed to your telephony provider.

| Scenario | Phone number visible to |
|----------|------------------------|
| PSTN call to volunteer's phone | Telephony provider, phone carrier |
| Browser-to-browser (WebRTC) | No one (audio stays in browser) |
| Self-hosted Asterisk + SIP phone | Only your Asterisk server |

**To protect volunteer phone numbers**: Use browser-based calling (WebRTC) or provide SIP phones connected to self-hosted Asterisk.

**Future improvement**: Native desktop and mobile apps for receiving calls without exposing personal phone numbers.

---

## What's planned

We're working on improvements to reduce trust requirements:

| Feature | Status | Privacy benefit |
|---------|--------|-----------------|
| E2EE message storage | Planned | SMS/WhatsApp/Signal stored as ciphertext |
| Client-side transcription | Planned | Audio never leaves browser |
| Native call-receiving apps | Planned | No personal phone numbers exposed |
| Reproducible builds | Planned | Verify deployed code matches source |
| Self-hosted Signal bridge | Available | Run signal-cli on your own infrastructure |

---

## Summary table

| Data type | Encrypted | Visible to server | Obtainable under subpoena |
|-----------|-----------|-------------------|---------------------------|
| Call notes | Yes (E2EE) | No | Ciphertext only |
| Transcripts | Yes (E2EE) | No | Ciphertext only |
| Reports | Yes (E2EE) | No | Ciphertext only |
| File attachments | Yes (E2EE) | No | Ciphertext only |
| Call metadata | No | Yes | Yes |
| Volunteer identities | Encrypted at rest | Admin only | Yes (with effort) |
| Caller phone hashes | HMAC hashed | Hash only | Hash (not reversible without your secret) |
| SMS content | No | Yes | Yes |
| WhatsApp content | No | Yes | Yes (also from Meta) |
| Signal content | No | Yes | Yes (from your server) |

---

## For security auditors

Technical documentation:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos is open source: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
