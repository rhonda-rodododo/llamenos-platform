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
| | Message content (encrypted on arrival, stored as ciphertext) |
| | Decryption keys (protected by your PIN, your identity provider account, and optionally your hardware security key) |
| | Per-note encryption keys (ephemeral — destroyed after wrapping) |
| | Your HMAC secret for reversing phone hashes |

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

### Text messaging

| Channel | Provider access | Server storage | Notes |
|---------|-----------------|----------------|-------|
| SMS | Your telephony provider reads all messages | **Encrypted** | Provider retains original messages |
| WhatsApp | Meta reads all messages | **Encrypted** | Provider retains original messages |
| Signal | Signal network is end-to-end encrypted, but the bridge decrypts on arrival | **Encrypted** | Better than SMS, not zero-knowledge |

**Messages are encrypted the moment they arrive at your server.** The server stores only ciphertext. Your telephony or messaging provider may still have the original message — that's a limitation of those platforms, not something we can change.

**Messaging provider subpoena**: SMS providers have full message content. Meta has WhatsApp content. Signal messages are end-to-end encrypted to the bridge, but the bridge (running on your server) decrypts them before re-encrypting for storage. In all cases, **your server only has ciphertext** — the hosting provider cannot read message content.

### Notes, transcripts, and reports

All volunteer-written content is end-to-end encrypted:

- Each note uses a **unique random key** (forward secrecy — compromising one note doesn't compromise others)
- Keys are wrapped separately for the volunteer and each admin
- The server stores only ciphertext
- Decryption happens in the browser
- **Custom fields, report content, and file attachments are all individually encrypted**

**Device seizure**: Without your PIN **and** access to your identity provider account, attackers get an encrypted blob that is computationally infeasible to decrypt. If you also use a hardware security key, **three independent factors** protect your data.

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
| Encrypted message storage | SMS, WhatsApp, and Signal messages stored as ciphertext on your server |
| On-device transcription | Audio never leaves your browser — processed entirely on your device |
| Multi-factor key protection | Your encryption keys are protected by your PIN, your identity provider, and optionally a hardware security key |
| Hardware security keys | Physical keys add a third factor that cannot be remotely compromised |
| Reproducible builds | Verify that deployed code matches the public source |
| Encrypted contact directory | Contact records, relationships, and notes are end-to-end encrypted |

## Still planned

| Feature | Privacy benefit |
|---------|-----------------|
| Native call-receiving apps | No personal phone numbers exposed |

---

## Summary table

| Data type | Encrypted | Visible to server | Obtainable under subpoena |
|-----------|-----------|-------------------|---------------------------|
| Call notes | Yes (end-to-end) | No | Ciphertext only |
| Transcripts | Yes (end-to-end) | No | Ciphertext only |
| Reports | Yes (end-to-end) | No | Ciphertext only |
| File attachments | Yes (end-to-end) | No | Ciphertext only |
| Contact records | Yes (end-to-end) | No | Ciphertext only |
| Volunteer identities | Yes (end-to-end) | No | Ciphertext only |
| Team/role metadata | Yes (encrypted) | No | Ciphertext only |
| Custom field definitions | Yes (encrypted) | No | Ciphertext only |
| SMS/WhatsApp/Signal content | Yes (on your server) | No | Ciphertext from your server; provider may have original |
| Call metadata | No | Yes | Yes |
| Caller phone hashes | HMAC hashed | Hash only | Hash (not reversible without your secret) |

---

## For security auditors

Technical documentation:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)
- [API Documentation](/api/docs)

Llamenos is open source: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
