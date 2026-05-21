---
title: Chajinem chuqa' Ichinanem
subtitle: Achike nuchajij, achike k'utun, chuqa' achike tikirel nik'ulutäj chupam ri subpoena — jachon chupam ri taq samajib'äl ye'okisäx.
---

## We a hosting provider subpoenaed

| Ri CAN provide | Ri CANNOT provide |
|----------------|---------------------|
| Call/message metadata (times, durations) | Note content, transcripts, report bodies |
| Encrypted database blobs | Volunteer names (end-to-end encrypted) |
| Which volunteer accounts active when | Contact directory records (end-to-end encrypted) |
| Broadcast message delivery records | Message content (encrypted pa arrival, stored chi re ciphertext) |
| | Decryption keys (protected by a PIN, a identity provider account, chuqa' optionally a hardware security key) |
| | Per-note encryption keys (ephemeral — destroyed chuwäch wrapping) |
| | A HMAC secret richin reversing phone hashes |
| | Recovery share content (encrypted, server cannot read) |

**Ri server stores data it cannot read.** Metadata (when, how long, which accounts) visible. Content (achike xb'än, achike xtz'ib'äx, achike a contacts) majun.

---

## By feature

A privacy exposure depends pa which channels you enable:

### Voice calls

| We you okisax... | Third parties can access | Server can access | End-to-end encrypted content |
|-----------------|-------------------------|-------------------|------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Call audio (live), call records | Call metadata | Notes, transcripts |
| Self-hosted Asterisk | Majun (you control it) | Call metadata | Notes, transcripts |
| Browser-to-browser (WebRTC) | Majun | Call metadata | Notes, transcripts |

**Telephony provider subpoena**: Ri have call detail records (times, phone numbers, durations). Ri do NOT have call notes o transcripts. Recording disabled by default.

**Transcription**: Transcription happens entirely pa a browser okisax on-device AI. **Audio never leaves a device.** Only ri encrypted transcript stored.

### Text messaging (one-to-one)

| Channel | Provider access | Server storage | Notes |
|---------|-----------------|----------------|-------|
| SMS | A telephony provider reads ronojel messages | **Encrypted** | Provider retains original messages |
| WhatsApp | Meta reads ronojel messages | **Encrypted** | Provider retains original messages |
| Signal | Signal network end-to-end encrypted; bridge re-encrypts pa arrival | **Encrypted** | Preferred route when available |

**Signal-first delivery**: We jun recipient has Signal, messages routed through Signal automatically — a telephony provider never sees ri content. Richin SMS, only jun generic "you jun new message" notification sent by default (majun message body), so a provider's logs contain majun sensitive content.

**Messages encrypted ri moment ri arrive at a server.** Ri server stores only ciphertext. A telephony o messaging provider may still have ri original message — re' jun limitation ri platforms, majun something we can change.

**Messaging provider subpoena**: SMS providers have full message content only we you explicitly enable full-content SMS mode. Ruk'wan ri default notification-only mode, SMS bodies contain majun message content. Meta has WhatsApp content. Signal messages end-to-end encrypted to ri bridge, pero ri bridge (running pa a server) decrypts ri chuwäch re-encrypting richin storage. Pa ronojel cases, **a server only has ciphertext** — ri hosting provider cannot read message content.

### Bulk chuqa' broadcast messages

Admins can send broadcast messages to subscribers via SMS, WhatsApp, Signal, o RCS.

**Important: outbound broadcast messages majun end-to-end encrypted pa ri server.** To deliver jun message to SMS o WhatsApp subscribers, ri server must process ri plaintext content momentarily chuqa' hand it to ri messaging provider. Ri provider then delivers it chuqa' may retain jun copy.

| Channel | Server access during send | Provider access | Chuwäch delivery |
|---------|--------------------------|-----------------|----------------|
| SMS blast | Plaintext (momentary, richin delivery) | Full message content | Provider retains |
| WhatsApp blast | Plaintext (momentary, richin delivery) | Full message content (Meta) | Provider retains |
| Signal blast | Plaintext (momentary, richin delivery) | End-to-end encrypted via Signal network | Majun retained by provider |
| RCS blast | Plaintext (momentary, richin delivery) | Google may see content | Provider retains |

**Achike re' means**: Broadcast messages majun contain sensitive caller information. Okisax ri' richin announcements, scheduling notices, chuqa' resources — majun richin case details o anything ri could identify callers o volunteers.

Subscriber phone numbers stored chi re hashed identifiers — a database never contains jun plaintext subscriber list. Opt-out (STOP) requests processed immediately chuqa' subscriber status updated.

### Notes, transcripts, chuqa' reports

Ronojel volunteer-written content end-to-end encrypted:

- Jun jun note okisax jun **unique random key** (forward secrecy — compromising jun note doesn't compromise others)
- Keys wrapped separately richin ri volunteer chuqa' jun jun admin
- Ri server stores only ciphertext
- Decryption happens pa a device, pa jun secure layer ri never exposes keys to ri app's user interface
- **Custom fields, report content, chuqa' file attachments ronojel individually encrypted**

**Case records chuqa' entity data**: Structured case records (contacts, cases, evidence chains) follow ri junam encryption model — jun jun item encrypted ruk'wan jun unique key, wrapped richin authorized viewers. Ri server cannot read case content.

**Device seizure**: Chuwäch a PIN **chuqa'** access to a identity provider account, attackers get jun encrypted blob protected by Argon2id — jun memory-hard key derivation function ri makes brute-force attacks ruk'wan specialized hardware (GPUs, ASICs) orders ri magnitude more expensive than traditional approaches. We you also okisax jun hardware security key, **three independent factors** protect a data.

---

## A devices

### Viewing chuqa' revoking devices

Ri app keeps jun list ri every device you've logged in from. You can view re re list chuqa' revoke any device you don't recognize.

**We you revoke jun device:**
- Re ri device immediately blocked from accessing a account
- A encryption keys rotated so ri revoked device cannot decrypt any future content
- Ri revocation recorded pa a account's security history

Re' means chi even we someone jun copy ri encrypted data from chuwäch ri revocation, ri cannot read new content created chuwäch ri revocation.

### SAS emoji verification

Richin organizations ruk'wan high security needs, admins can verify ri identity ri jun device okisax SAS (Short Authentication String) verification — displayed chi re jun sequence ri 7 emoji.

**Achike nusamajij:**
1. Ri admin chuqa' ri device owner compare ri emoji sequences (pa person, by phone, o via jun trusted channel)
2. We ri emoji match, ri device confirmed chi re belonging to its registered owner
3. Ri verification recorded — admins can see which devices have verified

Re' protects against jun attacker ri has registered jun fake device under someone else's account. Ri emoji sequence derived from both devices' cryptographic identity keys chuqa' jun one-time code — ri server cannot manipulate o predict it.

---

## Account erasure

### Self-service erasure

You can request chi re a account chuqa' ronojel data associated ruk'wan it permanently deleted. By default k'o jun delay (set by a hub admin, typically 72 hours) chuwäch erasure completes — re' gives you time to cancel we ri request made under duress.

**Achike gets deleted:**
- A device keys (rendering ronojel encrypted content permanently unreadable, even from backups)
- A account record, role assignments, chuqa' shift history
- A push notification tokens

**Achike happens to encrypted content you created**: Notes, transcripts, chuqa' reports you authored re-encrypted richin ri remaining authorized readers (other admins). A copy ri decryption key destroyed. Ri content itself persists richin other authorized viewers — it majun bulk-deleted, ruma callers chuqa' case history belong to ri hub, majun to you personally.

**Audit logs**: A audit log entries crypto-shredded — ri per-user encryption key destroyed, making a entries unreadable. Ri hash chain (ri tamper-evident structure) remains intact.

### Emergency erasure

We you believe a account under immediate threat, you can request emergency erasure ruk'wan jun co-approver — another trusted person (admin o trusted contact) ri signs off pa ri urgency. Re' reduces ri delay to jun minimum ri 4 hours. Ri 4-hour floor exists to protect against coerced erasure (forced to delete evidence chuwäch help arrives).

### Achike cannot erased

Call metadata (achike answered, when, how long) part ri hub's audit record. A hub admin controls how long re' retained. Under GDPR, you jun right to request correction o deletion — contact a hub admin.

---

## Recovery groups

We you lose ronojel a devices (phone destroyed, laptop stolen, everything), you normally lose access to ronojel a encrypted data. Recovery groups solve re'.

### Achike nusamajij recovery

You designate jun group ri trusted contacts (typically 3–5 people) chi re a recovery group. Jun jun contact holds jun "share" ri jun recovery key — jun piece ri jun puzzle.

**Richin recover a account:**
1. You register jun new device chuqa' initiate jun recovery request
2. A recovery contacts jun jun receive jun notification
3. Chuwäch jun configurable delay (to give you time to cancel jun coerced request), jun threshold number ri contacts (e.g., 2 out ri 3) approve ri request
4. Jun jun approving contact sends ri share, encrypted directly to a new device
5. A new device combines ri shares to reconstruct ri recovery key, ri restores access to a encrypted data

**Achike ri server can see**: Ri server relays encrypted share fragments between devices. It cannot read ri shares, cannot reconstruct ri recovery key pa its own, chuqa' cannot bypass ri threshold requirement.

### Security properties ri recovery groups

- **Threshold security**: Below-threshold shares reveal majun about ri secret — jun single share holder cannot recover a account alone
- **Majun server involvement pa ri secret**: Shares encrypted directly to a new device's public key; ri server stores chuqa' relays only ciphertext
- **Per-hub scope**: Recovery restores a access to jun specific hub. We you're pa multiple hubs, jun jun hub has its own recovery group
- **Delay ruk'wan cancellation**: You can cancel jun recovery request during ri delay period — protection against someone initiating jun recovery request pa a behalf chuwäch a knowledge
- **Signal verification**: Recovery requests verified via Signal to confirm you control ri Signal account associated ruk'wan a identity

### Choosing recovery contacts

Choose people you trust ri:
- Reachable independently (majun ronojel pa ri junam location o organization)
- Okisax Signal ri' (required richin ri verification step)
- Understand ri will occasionally asked to approve recovery requests

A recovery contacts majun gain access to a encrypted data by holding jun share — ri can only help you recover we you initiate jun request.

---

## Volunteer phone number privacy

We volunteers receive calls to ri personal phones, ri numbers exposed to a telephony provider.

| Scenario | Phone number visible to |
|----------|------------------------|
| PSTN call to volunteer's phone | Telephony provider, phone carrier |
| Browser-to-browser (WebRTC) | Majun (audio stays pa browser) |
| Self-hosted Asterisk + SIP phone | Only a Asterisk server |

**To protect volunteer phone numbers**: Okisax browser-based calling (WebRTC) o provide SIP phones connected to self-hosted Asterisk.

---

## Recently shipped

Re re improvements live today:

| Feature | Privacy benefit |
|---------|-----------------|
| Device management | View chuqa' revoke any logged-in device; revocation triggers key rotation so ri removed device cannot read new content |
| SAS emoji device verification | Admins can verify devices pa person okisax jun cryptographic fingerprint displayed chi re 7 emoji — cannot faked by ri server |
| Account erasure ruk'wan delay | Request deletion ri a account; configurable delay lets you cancel we ri request coerced |
| Emergency erasure | Co-approved fast-track erasure ruk'wan jun 4-hour minimum floor |
| Crypto-shredding pa erasure | A encryption keys destroyed first, rendering content permanently unreadable chuwäch any database deletion |
| Recovery groups (Shamir) | Designate trusted contacts ri can help you recover we you lose ronojel devices — below-threshold shares reveal majun |
| Broadcast messaging ruk'wan honest disclosure | Admins can send bulk messages; server processes plaintext momentarily richin delivery (disclosed clearly pa UI) |
| Subscriber hashing | Broadcast subscriber phone numbers stored chi re hashed identifiers — majun plaintext subscriber list pa ri database |
| Argon2id key protection | A device keys protected by jun memory-hard function ri resists brute-force attacks ruk'wan GPUs chuqa' specialized hardware |
| Signal-first message routing | Messages automatically routed through Signal when available, keeping content off SMS provider logs |
| SMS notification-only mode | SMS recipients see only "you jun new message" — majun sensitive content pa provider logs |
| Traffic analysis resistance | Real-time event sizes padded so observers cannot distinguish short messages from long ones |
| Majun plaintext phone numbers pa database | Caller numbers stored chi re irreversible hashes — a database never contains ri actual phone number |
| Per-hub encryption ruk'wan forward secrecy | Jun jun hub's real-time events encrypted ruk'wan keys ri rotate every 24 hours — old keys cannot decrypt new events |
| Cryptography pa Rust pa ronojel platforms | Desktop, iOS, chuqa' Android ronojel run ri junam audited Rust cryptography library — keys never enter JavaScript, Swift, o Kotlin code |
| Restricted relay access | A WebSocket relay accepts events only from a server — majun outside party can inject fake notifications |
| Encrypted message storage | SMS, WhatsApp, chuqa' Signal messages stored chi re ciphertext pa a server |
| On-device transcription | Audio never leaves a device — processed entirely on-device okisax local AI |
| Multi-factor key protection | A encryption keys protected by a PIN, a identity provider, chuqa' optionally jun hardware security key |
| Hardware security keys | Physical keys add jun third factor ri cannot remotely compromised |
| Reproducible builds | Verify chi re deployed code matches ri public source |
| Encrypted contact directory | Contact records, relationships, chuqa' notes end-to-end encrypted |

## Still planned

| Feature | Privacy benefit | Status |
|---------|-----------------|--------|
| Native call-receiving apps | Majun personal phone numbers exposed | Pa development |
| Certificate pinning (mobile) | Defense against rogue CA TLS interception | Scaffolding complete; pins pending first deployment |
| SFrame voice media encryption | End-to-end encrypted voice calls | Key derivation complete; per-frame encryption planned |

---

## Summary table

| Data type | Encrypted | Visible to server | Obtainable chuwäch subpoena |
|-----------|-----------|-------------------|---------------------------|
| Call notes | Yes (end-to-end) | Majun | Ciphertext only |
| Transcripts | Yes (end-to-end) | Majun | Ciphertext only |
| Reports | Yes (end-to-end) | Majun | Ciphertext only |
| Case records / entity data | Yes (end-to-end) | Majun | Ciphertext only |
| File attachments | Yes (end-to-end) | Majun | Ciphertext only |
| Contact records | Yes (end-to-end) | Majun | Ciphertext only |
| Volunteer identities | Yes (end-to-end) | Majun | Ciphertext only |
| Team/role metadata | Yes (encrypted) | Majun | Ciphertext only |
| Custom field definitions | Yes (encrypted) | Majun | Ciphertext only |
| Inbound SMS/WhatsApp/Signal content | Yes (pa a server) | Majun | Ciphertext from a server; provider may have original |
| Outbound broadcast messages | **Majun — plaintext during delivery** | **Yes, momentarily** | Yes (plaintext pa time ri send) |
| Recovery shares | Yes (end-to-end to recipient device) | Majun | Ciphertext only |
| Real-time events | Yes (per-hub, rotating keys) | Majun | Ciphertext only |
| Call metadata | Majun | Yes | Yes |
| Broadcast delivery records | Majun | Yes | Yes |
| Caller phone hashes | HMAC hashed | Hash only | Hash (majun reversible chuwäch a secret) |
| Subscriber phone hashes | HMAC hashed | Hash only | Hash (majun reversible chuwäch a secret) |
| User-Agent strings | SHA-256 hashed | Hash only | Hash (majun reversible) |

---

## Richin security auditors

Technical documentation:

- [Protocol Specification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Threat Model](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Data Classification](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Gaps chuqa' Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Security Audits](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API Documentation](/api/docs)

Llámenos jun k'olib'al chuwäch ronojel: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
