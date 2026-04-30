---
title: "Llámenos Hotline — More Secure Hubs for Your Spokes"
author: "Rhonda"
date: 2026-05-03
event: "CounterSpy 2026"
description: "How Llámenos protects caller and volunteer identity against well-funded adversaries — architecture, crypto, and real threat model."
---

# Llámenos Hotline
## More Secure Hubs for Your Spokes

CounterSpy 2026 — Atlanta, Sunday May 3

<!-- notes: Phones on airplane mode if that's relevant to your threat model — and if you're at CounterSpy, it probably is. I'm Rhonda. This talk is about software I built because people I love were getting their phones seized at protests and their call records subpoenaed. Ninety minutes. I have a lot to show you. Questions during the talk — I'd rather it be a conversation than a monologue. Before I start: I am not selling you anything. This is AGPL-3.0 software. You can read every line. -->

---

## It Started Like This

> *A detective in Atlanta called an organizer at 9:37am on a Tuesday. He knew her name. He knew she'd answered calls at 11pm, 1am, and 2am during the protest. He cited specific call durations.*
>
> *She'd been running her org's crisis line through Google Voice. The detective had served an administrative subpoena on Google three days earlier. Google had complied within 48 hours. She didn't know.*

:::fragment
*He didn't need a warrant. He needed a form and 48 hours.*
:::

<!-- notes: Pause here. Let this land. This is not a hypothetical. Administrative subpoenas to US-based cloud providers require no judicial review. The provider doesn't have to tell you they complied. You might find out months later in a transparency report, or you might find out when a detective calls you. This is the threat we're designing against. Not nation-state zero-days. Not sophisticated cryptographic attacks. Paperwork. -->

---

## Who This Talk Is For

- **Legal observer networks** documenting state violence at protests
- **Jail support** hotlines taking calls from detainees and families
- **Mutual aid dispatchers** coordinating direct action support
- **Domestic violence crisis lines** protecting caller identity
- **Immigration legal hotlines** where the call log is evidence
- **Rapid response coalitions** with time-sensitive routing needs

:::fragment
*If you're running a phone-based support operation for people who face real threats — this talk is for you.*
:::

<!-- notes: Raise your hand if you operate or support a crisis line. Keep it up if you're on Google Voice. Keep it up if you use Twilio directly. Keep it up if your volunteers write notes in Google Docs. Okay. I see you. You're the reason I'm here. -->

---

## What I'll Cover

1. **Why existing tools fail** the activist threat model (and specifically how)
2. **SIP trunking** — why call routing matters for privacy
3. **E2EE notes and messages** — what "zero-knowledge server" actually means
4. **What a subpoena actually gets** — walking through the matrix
5. **Signal channel integration** — for orgs using Signal in the field
6. **What changed in v2** — results of a crypto review
7. **Self-hosting** — what it takes, what it costs, what it protects
8. **What we still can't protect** — be honest about the boundary

<!-- notes: Rough timing: Parts 1-2 take about 20 min, Part 3 about 20 min, Parts 4-6 about 20 min, Parts 7-8 about 10 min, then Q&A. Adjust based on audience questions throughout. The most important section is Part 4 — the subpoena matrix. That's where the architecture becomes real. -->

---

# Part 1: The Problem

<!-- notes: Let's start with who's coming for your org and why your current tools are a gift to them. -->

---

## Your Adversaries, Named

:::columns
:::left
### State actors
- **Local police** with administrative subpoenas (no judge, 24-72 hrs)
- **Federal agencies** (FBI, ICE) with NSLs and grand jury subpoenas
- **Fusion centers** correlating data across agencies
- DHS behavioral analysis units pattern-matching on call timing
:::right
### Contracted/private
- **Right-wing groups** with OSINT toolkits and PI contracts
- **Private investigators** with carrier-level access and courthouse relationships
- Doxxing crews targeting volunteers by name, employer, and neighborhood
:::

:::fragment
*None of these adversaries need to break encryption. They go to your provider with a form.*
:::

<!-- notes: Name the adversaries directly. "Law enforcement" is too abstract. We're talking about cops. We're talking about ICE. We're talking about the private investigators that right-wing groups hire after getting org member lists from leak sites. The threat model matters because it determines what you protect against. We're not defending against nation-state zero-days aimed at individual people. We're defending against a detective with 48 hours and a form. That's achievable. Let's talk about how. -->

---

## Real Scenarios

> *A detective got a Google administrative subpoena. All incoming call records for the past 90 days: timestamps, caller IDs, duration. They called the organizer whose personal number showed up most often as the answering line.*

:::fragment
> *A Twilio account was subpoenaed during a protest response. The dashboard showed every call: who called, who answered, how long they talked. Volunteer phone numbers were in the CDRs.*
:::

:::fragment
> *A volunteer's notes were in a shared Google Doc. The doc was in a G Suite account. The org didn't know Google had responded to a CIPA request until the legal case surfaced it.*
:::

<!-- notes: These are composites from real incidents — don't name the orgs, obviously. The point: these are not sophisticated attacks. They're paperwork. The attacker doesn't need to break encryption or compromise your server. They just need to ask your cloud provider nicely — or not so nicely — and the provider complies. Our job is to make that form useless. -->

---

## Why Google Voice Fails

- **Call records**: Google stores them. Administrative subpoena = Google hands them over within 48 hours.
- **Caller ID**: Google sees the real number. You have it, they have it.
- **Account access**: If the G Suite account is compromised, everything is exposed.
- **The volunteer's personal number**: When they answer a Google Voice forwarded call, their phone number shows up in the CDR.

:::fragment
*Your Google Voice call log is basically a gift-wrapped package for any detective with a subpoena and 48 hours.*
:::

:::fragment
*Google Voice was designed for a business's customer support line. Not for a legal observer network.*
:::

<!-- notes: Google's administrative subpoena compliance is extremely fast. I've spoken to people who only found out they were subpoenaed because they asked for a transparency report months later. The latency between the subpoena and the detective's phone call to the organizer was under 72 hours in at least one case I know of personally. -->

---

## Why Twilio Direct API Fails

- **CDRs in the dashboard**: Every call — caller ID, called number, duration, timestamp — stored in Twilio's dashboard, forever, by default.
- **Twilio is US-based**: Subject to US law. Administrative subpoenas. Grand jury subpoenas. NSLs.
- **TwiML Apps store config**: Your volunteer phone numbers are in your Twilio account config.
- **Recording storage**: If you record calls for "quality," those recordings are on Twilio S3. Under the same subpoena.

:::fragment
*Twilio is a great developer tool. It is a terrible privacy layer for activist hotlines.*
:::

<!-- notes: I want to be fair to Twilio. They publish transparency reports. They push back on some requests. But "they sometimes push back" is not a threat model. When law enforcement has a valid administrative subpoena, US-based providers comply. Twilio does not have a legal obligation to protect your volunteers from cops. That obligation is yours, and the way you fulfill it is through architecture. -->

---

## The Subpoena Attack Surface

```
Google Voice account
    ├── Call history (caller ID, timestamps, duration)
    ├── Voicemail recordings (stored by Google)
    └── Account holder identity → who runs the hotline

Twilio dashboard  
    ├── CDRs: every call, every participant phone number
    ├── TwiML config: volunteer phone numbers
    └── Recording files on S3 → actual call audio

Notes in Google Docs
    ├── Full plaintext content
    └── Edit history showing when each volunteer wrote what
```

:::fragment
**Every hop is a separate subpoena target. And they all comply.**
:::

<!-- notes: This is why we talk about "attack surface reduction." You can't make the calls disappear. But you can make the call records useless, and the notes unreadable. That's the design goal. Not invisibility. Uselessness — turning what the adversary gets into something they can't act on. -->

---

# Part 2: The Architecture

<!-- notes: Now let's talk about what we actually built. The core insight is: metadata is as dangerous as content. Who called whom, when, for how long — that's enough to identify an organizer, map a network, and build a harassment campaign. -->

---

## SIP Trunk vs. Twilio API

:::columns
:::left
### Twilio REST API

- Call enters Twilio's servers
- Twilio stores full CDR
- **Caller ID, called number, duration, timestamp** all in Twilio dashboard
- Subpoena Twilio → you get everything
- Easy setup, dangerous metadata posture
:::right
### SIP Trunk (Llámenos)

- PSTN number → SIP trunk → **your server**
- You control what gets logged (including: nothing)
- Telnyx/SignalWire offer CDR-free options
- Self-hosted Asterisk/FreeSWITCH: no cloud provider at all
- More setup, **you own the metadata**
:::

<!-- notes: The SIP trunk is the key architectural move. Instead of "Twilio routes calls for you," you're saying "a PSTN number terminates at MY server, then I route." The call detail record lives on your infrastructure, not Twilio's. If you go all the way to self-hosted Asterisk with no cloud SIP provider, there's no external party with records at all — just your database, which you control. -->

---

## The Call Flow

![PSTN SIP Call Flow](/diagrams/pstn-sip-flow.svg)

<!-- notes: Walk through this slowly. The SIP bridge is the key piece — it's running on your server, behind a Cloudflare Tunnel for ingress, no public IP needed. The PSTN number is just a DID (Direct Inward Dial) from whatever SIP provider you chose. The caller's phone rings YOUR server. Not Twilio's server. Not Google's server. Yours. -->

---

## Why Parallel Ring Matters

:::columns
:::left
### Sequential Ring (most hotlines)
- Call → Volunteer 1 (ring 20s)
- No answer → Volunteer 2 (ring 20s)
- No answer → Volunteer 3 (ring 20s)

**What the CDR reveals:**
Three separate call legs to three numbers. Timestamps show who was tried when. The whole volunteer roster, with timing, in one CDR.
:::right
### Parallel Ring (Llámenos)
- Call → ALL on-shift volunteers simultaneously
- First pickup → others instantly hang up

**What your server logs:**
One inbound call. Outbound legs all start at the same timestamp. First pickup wins.
:::

:::fragment
*Sequential ring is a directory of your volunteer roster, handed to any detective with a subpoena. Parallel ring is a single event.*
:::

<!-- notes: This is subtle but important for OSINT defense. If an adversary can see CDRs, sequential ring tells them: here are the volunteer phone numbers, in order of who answers first, on which days. That's your volunteer mapping. Parallel ring gives them much less — and combined with CDR-free SIP trunks, the metadata posture is dramatically better. Also: parallel ring is better operations. In a real crisis line, if you ring volunteers sequentially, the first person gets all the calls. Parallel ring distributes load AND reduces timing correlation. Two wins. -->

---

## 8 Telephony Adapters — Choose Your Trust Level

![Telephony Adapters](/diagrams/telephony-adapters.svg)

:::fragment
*Every adapter implements the same interface. Switching providers is a config change, not a code rewrite.*
:::

<!-- notes: The adapter architecture means you can start with Twilio while you're building your self-hosting capability, migrate to Telnyx when you're ready, then to self-hosted Asterisk when you want full control. No code changes — just update PBX_TYPE in your .env. The SIP bridge is provider-agnostic. This is important because your threat model might evolve. You don't want to rewrite your hotline infrastructure every time you move up the privacy ladder. -->

---

## Self-Hosting: The Full Stack

```bash
# What you run
docker compose up -d
```

![Docker Services](/diagrams/docker-services.svg)

- **Cloudflare Tunnels** for ingress — no public IP exposed, ever
- **EU hosting** compatible — Hetzner in Germany or Finland, GDPR by design
- **No telemetry** to any external party
- Reproducible builds with **SLSA provenance** and **cosign** verification

<!-- notes: The Cloudflare Tunnel means your server doesn't need a public IP. It phones home to Cloudflare, which handles ingress. No port scanning. No DDoS directly at your IP. IP address not exposed to clients. Yes, Cloudflare is still a third party — I'll talk about the trust model there in the limitations section. But it's substantially better than "here's my server's IP, please subpoena it." -->

---

# Part 3: E2EE — Zero-Knowledge Notes & Messages

<!-- notes: Now the most important part — what happens after the call. The notes. The conversation history. The reason your server is valuable to an adversary. Let me show you what "zero-knowledge" actually means in practice. -->

---

## What "Zero-Knowledge Server" Actually Means

The server should **not** be able to read call notes, even under subpoena.

:::columns
:::left
### What the server stores
- `encryptedContent` — ciphertext blob
- `authorEnvelope` — key wrapped for volunteer
- `adminEnvelopes[]` — key wrapped for each admin
- Timestamps (call started/ended)
- Duration
:::right
### What the server does NOT store
- Note content (plaintext)
- Caller identity
- Conversation transcript
- Who the volunteer is (pubkey only, not name)
:::

:::fragment
*A successful subpoena of your server gets them: "yes, a call happened at 11:47pm, duration 23 minutes, here's a ciphertext blob." Have fun with that, detective.*
:::

<!-- notes: This is the core promise. If your server is compromised, if you're served a subpoena, if an admin is coerced — they get encrypted blobs. To read a note, you need the volunteer's private key. The private key never leaves the device. Ever. The server is a zero-knowledge relay. It's moving data it can't read. -->

---

## Per-Note Forward Secrecy

```
For each note written:

  1. Generate random 256-bit note key
     note_key = random_bytes(32)

  2. Encrypt note content
     nonce = random_bytes(24)
     ciphertext = XChaCha20-Poly1305(note_key, nonce).encrypt(note_json)

  3. Wrap note_key for volunteer (author)
     author_envelope = HPKE_wrap(note_key, volunteer_pubkey, "llamenos:note-key")

  4. Wrap note_key for each admin
     admin_envelopes = admins.map(admin =>
       HPKE_wrap(note_key, admin.pubkey, "llamenos:note-key")
     )

  5. Store: { ciphertext, author_envelope, admin_envelopes[] }
  6. Discard note_key from memory
```

<!-- notes: "Forward secrecy" means: if someone gets a volunteer's identity key tomorrow, it doesn't let them decrypt yesterday's notes. Each note has its own random 256-bit key. The identity key is only used to WRAP the per-note key — not to encrypt content directly. So even if the identity key is compromised, the attacker has to also get the wrapped note key for each individual note. It's envelopes inside envelopes. A whole detective novel's worth of extra homework. -->

---

## Client-Side Transcription — Audio Never Leaves the Browser

This one is a big deal.

:::columns
:::left
### How most transcription works
- Call audio → sent to API (Cloudflare, Google, OpenAI)
- Transcription service processes your call content
- You get text back
- **The transcription provider heard everything**
- Subpoena the transcription provider
:::right
### How Llámenos does it
- WASM Whisper model — runs in the volunteer's browser
- AudioWorklet ring buffer → Web Worker isolation
- Transcript generated locally
- **Audio never leaves the device. At all.**
- Works offline after first model download
:::

:::fragment
*The transcription provider can't be subpoenaed for audio that never reached them.*
:::

<!-- notes: This is one of the things I'm most proud of. We moved transcription from a cloud API to in-browser WASM — Whisper via Hugging Face's ONNX runtime. The audio is captured by MediaRecorder, processed in a Web Worker, and the resulting transcript text is encrypted immediately with the note's E2EE key. No network request. No API key. No transcript provider. The call audio exists only in browser memory for the duration of the processing. For this audience: that's huge. That's the audio equivalent of zero-knowledge. -->

---

## HPKE — Why We Moved From ECIES

:::columns
:::left
### v1: secp256k1 ECIES
- Non-standard curve for key agreement (Nostr-specific)
- Custom construction — no formal proof for this exact combination
- Single nsec per user = single point of compromise
- No domain separation = cross-protocol attack surface
- **Identified in review:** non-standard, not formally verified
:::right
### v2: HPKE (RFC 9180)
- X25519 key agreement (standard, constant-time)
- HKDF-SHA256 for KDF (standard)
- AES-256-GCM for AEAD (standard)
- Formally specified, IETF-maintained, actively audited
- Per-device keys + sigchain authorization
- **57 domain separation labels** (Albrecht defense)
:::

<!-- notes: The v1 → v2 migration came out of a review by a cryptographer who has worked on Signal's protocol. The core problem with v1 was: it worked, but "it worked" is not the same as "it's formally verified." A custom ECIES scheme using Nostr's secp256k1 curve — you can't point a peer at an RFC and say "that's what we do." HPKE is an IETF RFC. It's the same key agreement used in TLS 1.3's 0-RTT mode. The formal security analysis exists. That matters when you're trying to explain your security model to a lawyer, a journalist, or another cryptographer. -->

---

## 57 Domain Separation Labels

Every cryptographic operation has a **unique context string**.

```javascript
// From packages/protocol/crypto-labels.json — source of truth for all platforms

"llamenos:note-key"          // Per-note key wrapping
"llamenos:message"           // Per-message envelope encryption  
"llamenos:hub-key-wrap"      // Hub key distribution
"llamenos:file-key"          // Per-file symmetric key
"llamenos:device-provision"  // Device linking ECDH
"llamenos:push-wake"         // Push notification wake key
"llamenos:sas"               // Short authentication string (SAS) HKDF salt
// ... 50 more
```

:::fragment
*Without domain separation: an attacker could craft an input valid as both a message key and a note key, achieving a cross-protocol attack. With 57 distinct labels: each operation is cryptographically isolated.*
:::

<!-- notes: The "Albrecht defense" — named after Martin Albrecht's work on cross-protocol attacks in real-world deployments. If you use the same KDF with the same inputs across two different operations, an attacker who can interact with one context might be able to influence the other. Domain separation labels prevent this by binding every HKDF/ECDH/HPKE output to its specific purpose. We generate these constants from a single JSON file and compile them to TypeScript, Swift, and Kotlin via codegen. No raw string literals anywhere in the codebase. -->

---

## Per-Device Keys + User Sigchain

```
Old model (v1):
  User has ONE nsec (secret key)
  nsec lives on every device
  Device compromise = full account compromise

New model (v2):
  User has a sigchain (append-only, hash-chained)
  Each device has its own Ed25519/X25519 keypair
  New device linked via ephemeral ECDH provisioning room
  SAS verification prevents MITM on device link

  Sigchain entry:
    { devicePubkey, authorizedBy, timestamp, previousHash, sig }
    Signed by existing authorized device
```

<!-- notes: The sigchain is conceptually borrowed from Signal's sealed sender. Each device authorization is a signed statement from an already-authorized device. You verify a new device by comparing a Short Authentication String — four emoji, six words, whatever — between the two devices. This prevents a MITM from injecting a rogue device into your account. And importantly: if one device is seized, the other devices aren't automatically compromised. Device compromise is local. -->

---

## Per-Message Envelope Encryption

Same zero-knowledge pattern as notes — for inbound Signal, SMS, WhatsApp messages:

![Per-Message Envelope Encryption](/diagrams/envelope-encryption.svg)

:::fragment
*The server is a blind relay. It routes messages it cannot read.*
:::

<!-- notes: This is important for Signal integration especially. When someone sends a Signal message to your org's Signal number, the server receives it, encrypts it immediately, and throws away the plaintext. Even if the server is compromised moments after the message arrives, the plaintext is gone. The attacker gets ciphertext. This is different from how most messaging integrations work — most store the plaintext forever. We discard it immediately. -->

---

# Part 4: What Does a Subpoena Actually Get?

<!-- notes: This is the slide I really want this audience to internalize. Let me walk through each subpoena scenario concretely. What does each adversary actually get, and what can't they get. -->

---

## Hosting Provider Subpoena (Cloudflare, VPS)

**What they CAN hand over:**

| Data | What it reveals |
|------|----------------|
| Call metadata | Timestamps, durations, volunteer assignment (pubkey only) |
| Encrypted database blobs | Ciphertext — useless without volunteer/admin private keys |
| Caller phone hashes | HMAC hashes — irreversible without your HMAC secret |
| Audit logs | Event types + truncated IP hashes, no content |
| Traffic metadata | Request times, sizes, IP addresses |

**What they CANNOT hand over:**

Note content, message content, transcription text, per-note encryption keys (ephemeral, never stored), volunteer private keys (device-side only), your HMAC secret.

<!-- notes: This is the key scenario. Law enforcement goes to your hosting provider — Cloudflare, Hetzner, DigitalOcean, whoever. Gets a court order. The provider hands over everything they have. What does that get them? Encrypted blobs, timestamps, and hashed phone numbers. They can prove a call happened. They cannot read what was said in the notes. They cannot identify the caller. Metadata: yes. Content: no. That's a meaningful line. -->

---

## Telephony Provider Subpoena (Twilio, Telnyx, etc.)

**What they CAN hand over:**

| Data | If you use... |
|------|--------------|
| Call detail records (caller ID, times, duration) | All providers |
| Call recordings | Only if recording is enabled — **Llámenos does NOT enable recording by default** |
| SMS message content | Twilio, SignalWire SMS (passes through in plaintext) |
| WhatsApp content | Via Meta Business API |

**What they CANNOT hand over:**

Call notes (never sent to telephony provider), volunteer identities beyond routing phone numbers (with CDR-free trunk), any E2EE content.

:::fragment
*With CDR-free SIP trunking: the telephony provider has routing records only — no call content, no volunteer phone numbers in their system.*
:::

<!-- notes: This is why the SIP trunk choice matters. With Twilio Programmable Voice: they have everything. With Telnyx CDR-free SIP trunk: they have much less — just the DID termination record. With self-hosted Asterisk pointing at a SIP DID: the provider sees only that a call terminated at your server, and your server is what you just talked about — encrypted blobs and metadata. -->

---

## Device Seizure

**Without volunteer's PIN:**
- Encrypted key blob in localStorage (requires PIN brute-force)
- 600,000 PBKDF2 iterations + 6-8 digit PIN = estimated hours to days on GPU hardware
- Session tokens may still be valid if device was recently used (8-hour TTL — admin can revoke)

**With PIN (or successful brute-force):**
- Access to that volunteer's notes only — not other volunteers' notes
- Per-note forward secrecy: compromising identity key doesn't reveal notes without also getting per-note envelopes

**Admin device seized:**
- If admin nsec obtained: attacker can decrypt ALL notes (admin envelope on every note)
- Admin key separation: identity key vs. decryption key are separate keypairs — compromising auth doesn't auto-expose notes

<!-- notes: The device seizure scenario is worth walking through carefully. If a volunteer's phone is seized unlocked — bad day. Admin can revoke the session. The volunteer's notes are accessible but only their notes. If the phone is locked, the attacker needs to brute-force a 6-8 digit PIN against 600k PBKDF2 iterations. That's not impossible but it's not fast either. The admin device is the most sensitive — store it somewhere that isn't your pocket at a protest. -->

---

## The Honest Limitations: What We Do NOT Claim

- **Traffic analysis resistance**: No padding, no dummy traffic. A watcher can see call timing patterns.
- **SMS/WhatsApp transport E2EE**: These channels require provider-side plaintext in transit. We E2EE at rest; the provider sees it in transit.
- **PIN brute-force resistance (offline)**: 6-8 digits is ~27 bits of entropy. A seized encrypted blob + a GPU = brute-forceable in days to weeks.
- **Metadata confidentiality**: The server needs timestamps and routing data to function.
- **Cloudflare as adversary**: If Cloudflare is willing and legally compelled to instrument the Workers runtime — they could. We recommend self-hosted deployment for high-threat orgs.

:::fragment
*We're solving for the realistic adversary: lazy cops with administrative subpoenas. Not nation-states with runtime instrumentation budgets.*
:::

<!-- notes: I want to say this clearly: we built this for the threat model that most US activist orgs actually face. An FBI agent with a national security letter and unlimited resources is a different problem than a county sheriff with a form and 48 hours. We're solving the second problem really well. The first problem — nation-state adversary targeting you specifically — you have bigger issues than your hotline software. Operational security, device hygiene, physical security. Llámenos is one layer, not the whole stack. -->

---

# Part 5: Signal Channels

<!-- notes: A lot of orgs already use Signal for internal coordination. We built a way to route Signal messages into the same zero-knowledge system. Let me explain what we actually built and what the field use cases look like. -->

---

## Why We Added Signal as a Channel

Signal is already where your people are:

- **Legal observers in the field** can't install a custom app mid-protest. They have Signal.
- **Jail support families** sending updates about arraignment times use what's on their phone.
- **Rapid responders** on the ground need to file reports fast — Signal is the fastest secure channel.
- **Callers who can't use the hotline number** can reach you via Signal with better privacy.

:::fragment
*The goal: one secure inbox. Voice calls, Signal, SMS, WhatsApp — all end up encrypted in the same place, behind the same zero-knowledge design.*
:::

<!-- notes: The impetus for Signal integration was feedback from legal observer networks. Their observers in the field have Signal, not a custom app, and they're not going to install one while they're watching police arrest people. They need to send: "12 people arrested, here are the names, badge number 4471 made the call." That message needs to be encrypted at rest, not sitting in a Signal group that includes 40 people with varying device security. -->

---

## Field Use Cases for Signal

| Scenario | Signal channel enables |
|---------|----------------------|
| Observer at protest | Files rapid arrest report via Signal → encrypts in case management |
| Jail support coordinator | Sends arraignment update blast to all registered contacts |
| Organizer filing incident | Sends evidence description via Signal → linked to incident record |
| Admin notifying volunteers | Sends schedule change to all Signal-registered volunteers |
| Field medic coordinating | Reports injuries without naming anyone in cleartext |
| Legal team | Receives encrypted case notes from Signal channel without being in the app |

<!-- notes: These aren't hypothetical. These are the workflows that led to the Signal integration request. The pattern is: someone in a high-stakes field situation needs to file a record, they can't stop and open a custom app, but they have Signal. The channel integration means that Signal message becomes an E2EE record in the case management system. No copy-paste. No manual logging later. It just appears, encrypted. -->

---

## The Signal Sidecar: Zero-Knowledge Contact Resolution

```
signal-notifier/ (port 3100)

Problem: To send Signal notifications, you need phone numbers.
But we don't store phone numbers in plaintext.

Solution: HMAC-hashed contact resolution

  Registration:
    User registers their phone number
    Server stores: HMAC_SHA256("llamenos:phone:" + E.164_number)
    Plaintext number discarded immediately

  Resolution:
    Sidecar receives HMAC hash from app
    Looks up Signal registration by hash
    Sends notification to Signal number
    App never sees the phone number in plaintext
```

<!-- notes: The Signal sidecar is isolated from the main app. It communicates via a bearer token. If the sidecar is compromised, the attacker sees HMAC hashes, not phone numbers. The sidecar knows "hash ABC → Signal registration XYZ" but not "hash ABC → +14045551234". The mapping is hash to registration, not hash to number. This is what zero-knowledge contact resolution means: we can route notifications to people without knowing who they are. -->

---

## Signal Channel Features

:::columns
:::left
### Inbound
- Messages from Signal arrive at sidecar
- Sidecar forwards to app via webhook
- App encrypts immediately using per-message envelope
- Read receipts sent back via sidecar
- Typing indicators supported
- Identity key trust verification (safety number changes held pending review)
:::right
### Outbound: Blast / Broadcast
- Jail support update: "17 people arraigned, bail 9am"
- Rapid response alert: "Police moving on south side"
- Schedule change: "Tonight's shift has coverage"
- PostgreSQL-backed delivery queue
- Per-channel rate limiting (Signal: 1 msg/sec per recipient)
- Retry with exponential backoff
:::

<!-- notes: Rate limiting is critical. Signal aggressively rate-limits bulk senders — if you blast 200 recipients without rate limiting, you'll get your org's Signal number banned. The delivery queue handles this. Also important: the identity key verification. If someone reinstalls Signal, they get a new identity key. The sidecar detects this as a safety number change and holds delivery pending manual review — same as Signal desktop does. This prevents you from accidentally sending to a number that's been taken over. -->

---

## Why Not Just Signal For Everything?

**Signal is always preferable when everyone has it. But not everyone does.**

- Someone calling from **jail** can't install Signal — they have a payphone
- In an emergency, people call a **phone number** — they don't download an app first
- Some phones can't fit additional apps — cheap prepaid burners, older devices
- A family member checking if someone was released — that's **public information**, SMS is fine
- Different situations have different threat models — not everything needs maximum security

:::fragment
*Don't exclude people from support because they don't have the right app installed.*
:::

<!-- notes: This comes up in every conversation. "Why not just Signal for everything?" And the answer is: because we serve people in crisis who don't get to choose their communication channel. Someone calling from a county jail is on a monitored payphone. They don't have Signal. A family member who just found out their kid was arrested is calling the number on a flyer — they're not going to download an app in that moment. An organizer texting jail support updates about who's been released — that's already public information the moment the person walks out. SMS is fine for that. WhatsApp, RCS, Telegram are better if they have them. Signal is best if they have it. We support ALL of them because every threat model is different, and the right channel depends on the sensitivity of the specific communication, not a blanket policy. -->

---

## Signal IS Our Preferred Channel — Here's How We Use It

- **Account invites** go via Signal (not email — no metadata trail)
- **Notifications** route through Signal by default (push via zero-knowledge sidecar)
- **Field reporting** — legal observers text the hub directly from Signal
- **Blast alerts** — jail support updates, rapid response coordination
- **Password/PIN reset** flows use Signal, never email
- **Receipts, reactions, typing indicators** — full Signal UX, not just text

:::fragment
*Email is a surveillance channel. We route account operations through Signal instead.*
:::

<!-- notes: We're not anti-Signal — we're deeply integrated with it. Account invites go via Signal, not email. Why? Because email leaves metadata everywhere. Your email provider knows you received an invite to a crisis hotline platform. That's the kind of thing that ends up in a fusion center database. Signal invites: the notifier sidecar uses HMAC-hashed contact identifiers, never stores plaintext phone numbers. The recipient gets a Signal message with an invite link. No email provider in the loop. Same with notifications — volunteer shift reminders, call alerts, they all go through Signal by default. PIN reset? Signal. Not email. The principle is: email is a surveillance channel. Every email provider is a potential subpoena target. Signal is the preferred transport for everything administrative. The other channels exist for the people you SERVE, not for your internal operations. -->

---

# Part 6: What Changed in v2

<!-- notes: I want to be transparent about our process. We had v1 working, we had a cryptographer review it, and they found real problems. Here's what we found and what we changed. This is important: don't use software where the developers are afraid to talk about what they got wrong. -->

---

## What the Review Found

A Signal protocol cryptographer reviewed v1. Key findings:

:::fragment
1. **secp256k1 ECIES was non-standard** — custom construction, no formal proof for this exact combination
:::

:::fragment
2. **Single nsec per user** — one private key per person, on multiple devices. Device compromise = all notes compromised.
:::

:::fragment
3. **No domain separation** — same HKDF inputs across different operations → cross-protocol attack surface
:::

:::fragment
4. **No per-note forward secrecy** — one content key wrapped per user, not per note → historical notes exposed by key compromise
:::

:::fragment
5. **No SAS verification** on device linking — MITM could inject a rogue device into your sigchain
:::

<!-- notes: I want to be clear: v1 wasn't broken in the sense of "trivially exploited by a script kiddie." The issues were architectural weaknesses that would matter against a sophisticated cryptographic adversary. The review was valuable precisely because it forced us to think through each protocol detail. None of the changes were cosmetic. Each one closes a specific attack class. -->

---

## The Biggest Change: Why We Left the Browser

**Web E2EE has a fatal problem for our threat model: server compromise.**

- Your server delivers the JavaScript that does the encryption
- A compromised server can deliver **modified JS** that exfiltrates keys
- The user has **no way to verify** the code they're running
- Keys in localStorage — accessible to XSS, browser extensions, devtools
- Your "E2EE web app" is only as trustworthy as your server on every page load

:::fragment
*What's the point of E2EE if the server that's subpoenaed is the same server that delivers your crypto code?*
:::

<!-- notes: This is the question that killed v1. We had a perfectly good web-based E2EE system. The noble-curves library is audited, constant-time, the algorithms were correct. But it didn't matter. Because here's the scenario: a law enforcement agency serves a subpoena on your hosting provider. They don't ask for the encrypted data — they know they can't decrypt it. Instead, they ask the provider to modify the JavaScript that gets served to users on next page load. A tiny change: before encrypting, also POST the plaintext to a different endpoint. The user sees the same UI. The same green lock icon. The same "end-to-end encrypted" badge. But their notes are being exfiltrated in plaintext. This isn't theoretical. This is how web-based E2EE systems are attacked by sophisticated adversaries. ProtonMail has written about this. The Lavabit case established the precedent. For our threat model — activists facing law enforcement with subpoena power — a web app is a liability, not a protection. That's why v2 is native clients only. -->

---

## v2: Native Clients — No Webview on Mobile

:::columns
:::left
### Desktop (Tauri v2)
- Rust process holds device keys
- Webview renders UI only — no key access
- **Stronghold** encrypted vault
- Code is the compiled binary you installed
- Reproducible builds — verify the binary matches source
:::right
### iOS + Android (Fully Native)
- **No webview.** SwiftUI / Kotlin Compose
- iOS: **Keychain** (Secure Enclave backed)
- Android: **Keystore** (hardware-backed)
- Crypto via **shared Rust crate** (UniFFI/JNI)
- Code is the app you installed from a signed build
:::

:::fragment
*The server can't deliver malicious code. It only serves encrypted data. The crypto runs in your native app.*
:::

<!-- notes: On mobile there is NO webview. The iOS app is native SwiftUI. The Android app is native Kotlin Compose. The crypto layer is a shared Rust crate compiled to an XCFramework for iOS via UniFFI, and JNI shared library for Android. The UI code never touches private keys — CryptoService is a singleton, the ViewModel gets pubkeys for display, that's it. On desktop, Tauri has a webview for the React UI, but the Rust backend process holds the keys. The webview calls Rust via IPC. If someone finds an XSS in our React code, they can mess up the UI but they cannot exfiltrate keys — the keys are in a different process. The critical difference from a web app: the code running on your device is the binary you installed. It doesn't change on every page load. It can be reproducibly built and verified. Your server serves encrypted data to the client. It never serves code. That's the architecture that makes E2EE meaningful against our threat model. -->

---

## What Else Changed: Crypto Protocol v1 → v2

:::columns
:::left
### v1
- secp256k1 ECIES (custom construction)
- Single nsec per user, on every device
- No domain separation
- No per-note forward secrecy
- No device authorization chain
:::right
### v2
- **HPKE (RFC 9180)** — formally verified
- **Per-device Ed25519/X25519 keys**
- **57 domain separation labels** (Albrecht defense)
- **Random key per note** (forward secrecy)
- **Append-only sigchain** + SAS device provisioning
:::

<!-- notes: The platform shift is the headline, but the crypto protocol changed too. HPKE replaces our custom ECIES — you can point a cryptographer at RFC 9180 and they can verify our implementation against a specification, not against our own claims. Per-device keys mean compromising one device doesn't compromise all your other devices. The sigchain means you can revoke a compromised device without rotating your identity. These are all changes that came from the crypto review. -->

---

## Three Native Clients, One Crypto Crate

**Same Rust code on every platform. Device keys stay in native memory.**

![Crypto Primitives](/diagrams/crypto-primitives.svg)

Desktop (Tauri v2):
  Rust process ← IPC → Webview (UI only)
  Keys in Stronghold encrypted vault
  Webview CANNOT access private keys

iOS (SwiftUI):
  UniFFI XCFramework → CryptoService singleton
  Keys in Keychain (Secure Enclave backed)
  UI layer gets pubkeys only

Android (Kotlin/Compose):
  JNI .so → CryptoService singleton
  Keys in Keystore (hardware-backed)
  UI layer gets pubkeys only
```

:::fragment
*Signal's architecture: native crypto, thin UI shell. We adopted it wholesale.*
:::

<!-- notes: This is Signal's design principle applied to a hotline platform. One Rust crate, compiled to native binary for desktop, XCFramework via UniFFI for iOS, JNI shared library for Android. WASM build exists too — but only for browser-based tests, not for the production app. The production app is ALWAYS native. Why does this matter? Because the security boundary is the process boundary. On desktop, the Tauri webview renders React — it handles UI, routing, forms. Every crypto operation goes through IPC to the Rust backend process. The webview literally does not have access to the device private key. It can ask Rust to sign something, decrypt something, but it never sees the key. Same on mobile — the CryptoService is a singleton that wraps the FFI. The ViewModel gets pubkeys for display. It never gets private keys. If someone finds an XSS in our React code — which is possible, we're not arrogant about that — they can mess up the UI. They cannot exfiltrate keys. That's the platform shift that matters. -->

---

## SFrame — Voice E2EE

Voice calls are encrypted too — not just notes.

```
SFrame (RFC 9605):
  Per-call key derived from the Llámenos crypto layer
  Media frames encrypted before leaving the device
  Decrypted on the volunteer's device only
  Server cannot decrypt live call audio
```

:::fragment
*Your SIP bridge passes encrypted frames. Even if the bridge is compromised, the audio is ciphertext.*
:::

<!-- notes: SFrame is an IETF RFC (9605) for media frame encryption. Designed for WebRTC streams. The key derivation is integrated into packages/crypto — same Rust crate, same audit surface. What this means: a compromised SIP bridge sees only encrypted media frames, not call audio. The wiretap is broken at the media layer. -->

---

# Part 7: Self-Hosting & Deployment

<!-- notes: What does it actually take to run this? This section is for the people in the room who are thinking about deploying it, or who are advising orgs that might. -->

---

## What You Run

```yaml
services:
  db:           PostgreSQL 16 (encrypted notes, audit log)
  app:          Bun + Hono (the API server)
  relay:        strfry (self-hosted Nostr relay — real-time events)
  sip-bridge:   Asterisk / FreeSWITCH / Kamailio (SIP routing)
  
# Optional profiles:
  signal:       signal-notifier sidecar (port 3100)
  telephony:    Kamailio + CoTURN (full self-hosted SIP)
  monitoring:   Prometheus + Grafana
```

- **Cloudflare Tunnels** for ingress — no exposed public IP
- **EU hosting**: Hetzner Germany/Finland for GDPR compliance
- **Kubernetes** option: Helm chart with health probes and network policies

<!-- notes: The strfry Nostr relay is not optional — it's the real-time event bus between server and clients. Your Nostr relay, running on your infrastructure, not one of the public ones. This is important: hub events, call routing, presence — all go through the relay. That relay is yours. Cost for a small org: 2 CPU, 4GB RAM VPS on Hetzner is about €8/month. SIP DID from Telnyx is $1-5/month. That's the infrastructure cost for a secure hotline. -->

---

## Template-Driven — Nothing Is Hardcoded

Nothing in the app is hardcoded to any specific use case.

```javascript
// Everything comes from a template:
{
  "entityTypes": ["person", "incident", "location", "vehicle"],
  "reportTypes": [
    {
      "name": "arrest_report",
      "fields": ["name", "charges", "badge_number", "location"],
      "mobileOptimized": true
    }
  ],
  "roles": ["volunteer", "observer", "dispatcher"],
  "customFields": [...]
}
```

*Legal observer network, jail support, domestic violence line, immigration legal — same codebase, different template.*

<!-- notes: This is intentional. We didn't build a "jail support app" that gets repurposed. We built secure routing and case management infrastructure that you configure via templates. Your org's use case is a JSON file. If you change use cases — new template. If a different org wants to use Llámenos — different template. The platform doesn't care what kind of crisis hotline you run. You define the entities, the report types, the fields, the workflows. -->

---

## Multi-Hub: One Install, Many Lines

Your org might run more than one line:

```
Hub A: Jail support line (overnight after mass arrests)
Hub B: Rapid response line (daytime, protest hours)  
Hub C: Community safety line (ongoing)

One volunteer can be in all three hubs.
All hubs active simultaneously — incoming calls from any hub ring them.
Active hub in the UI doesn't affect which calls they receive.
```

- Each hub has its own encrypted key space, volunteers, shifts, and case records
- Hub key rotates on member departure — departed member can't read new hub events
- Multi-org: different orgs can run separate hubs on the same install

<!-- notes: Multi-hub came from feedback that orgs don't run one line — they run several. The jail support crew runs overnight. The rapid response crew runs during protests. The community safety line runs all the time. Before Llámenos, each of these was a separate system — or worse, a separate phone number with volunteers managing multiple Google Voice accounts. Multi-hub means one deployment, one set of volunteers, multiple operational contexts. Each hub is cryptographically isolated. -->

---

# Part 8: What We Still Can't Protect

<!-- notes: I want to close with honesty. Llámenos is a significant improvement over Google Voice and Twilio direct. It is not magic. Here's what we can't protect against, and I want to say this clearly so you don't deploy it with false confidence. -->

---

## The Honest Threat Model Boundary

:::columns
:::left
### We protect against
- Administrative subpoenas to cloud providers (notes unreadable)
- CDR analysis (with CDR-free SIP trunk)
- Note content exposure (E2EE, forward secrecy)
- Message content exposure (E2EE)
- Caller identity via phone records (HMAC hashing)
- Sequential ring volunteer identification
- Device seizure note exposure (PIN-protected keys)
:::right
### We don't protect against
- **Traffic analysis**: Sophisticated adversary can see call timing patterns
- **Device seizure with PIN**: Seized + unlocked = notes accessible
- **Admin coercion**: A coerced admin can decrypt all notes
- **Nation-state runtime instrumentation**: If Cloudflare is your adversary, use self-hosted
- **Operational security failures**: Bad passwords, phishing, shoulder surfing
- **SMS/WhatsApp in transit**: Provider sees plaintext during delivery
:::

<!-- notes: Admin coercion deserves a mention. If an admin is physically coerced — that's a bad day. They can decrypt notes. This is not a flaw in the cryptography — it's a fundamental property of any multi-admin system where admins need to read records. The design choice: admins need case management access, so they have an envelope on every note. If your threat model includes coerced admins, store the admin key on an air-gapped device that doesn't travel to protests. -->

---

## Know Your Threat Model Before You Deploy

> *Llámenos is designed for the realistic threat faced by a US-based activist organization: law enforcement administrative subpoenas, OSINT-level adversaries, and insider threats. It is not designed to withstand a dedicated nation-state adversary with physical access to your infrastructure.*

**Before deploying, answer:**
- Who is your adversary? Be specific.
- What can they do without a warrant in your jurisdiction?
- What can they do WITH a warrant?
- Who are your admins and what's their physical security posture?
- What happens if your server is seized?
- What happens if a volunteer is an informant?

<!-- notes: The "seized server" question matters. If law enforcement seizes your server, they get encrypted blobs and call metadata. They do NOT get note content or plaintext caller IDs — if you've configured CDR-free SIP. That's a meaningful protection. It means they have to come back with something harder to get than an administrative subpoena. And that means more time, more scrutiny, more opportunity for your legal team to fight it. Not invincibility. But friction. -->

---

## Get Involved

- **Code**: `github.com/llamenos-hotline/llamenos` (AGPL-3.0)
- **Self-hosting docs**: `llamenos-hotline.com/docs`
- **This deck**: `llamenos-hotline.com/slides/counterspy-2026/`
- **Signal**: Ask me after the talk

:::fragment
*We especially need:*
- *Organizations willing to run beta deployments — real ops, real feedback*
- *Cryptographers to audit the HPKE implementation*
- *People who have survived subpoenas and can stress-test our threat model assumptions*
- *EU-based orgs for GDPR validation*
:::

:::fragment
*This is pre-production software. We built it to be auditable. We built it to be self-hosted. We built it because the existing options were a gift to cops.*
:::

<!-- notes: The project is pre-production. No production users yet. We need orgs with real security needs who are willing to give us real-world feedback. If you've been subpoenaed — I want to talk to you specifically. Your experience stress-tests our assumptions in ways that theoretical analysis cannot. Come find me after this. I'll be the one by the coffee trying to convince people that self-hosting a Nostr relay is worth it.

Likely questions:
1. "What does it cost?" — €8-15/month VPS on Hetzner. $1-5/month SIP DID. That's it.
2. "What about GDPR?" — HMAC-hashed caller numbers, E2EE content, EU hosting available. Caller data question for your DPA.
3. "Can we port our Google Voice number?" — Yes. Port to a SIP-capable provider, point at your trunk.
4. "What's the status of MLS?" — Behind a feature flag. Functional, not battle-tested. Wait for the RFC to stabilize.
5. "What if a volunteer leaves badly?" — Hub key rotation. Future notes inaccessible. Historical notes they took: they still have their device key. That's the forward secrecy trade-off. Same as any E2EE system.
6. "Can we use this with existing Twilio numbers?" — Yes, via Twilio Elastic SIP Trunking — different from Programmable Voice API, better CDR posture. -->

---

# Questions?

**Rhonda** / CounterSpy 2026, Atlanta

*"More Secure Hubs for Your Spokes"*

`llamenos-hotline.com/slides/counterspy-2026/`
