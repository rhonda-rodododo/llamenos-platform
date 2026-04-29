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

<!-- notes: Welcome. I'm Rhonda. Phones on airplane mode if that's relevant to your threat model — and if you're at CounterSpy, it probably is. This is a 90-minute talk. I have a lot to show you. Raise your hand if you have questions mid-slide — I'd rather make this interactive than have you leave with half the picture. Before I start: I am not selling you anything. This is AGPL-3.0 software. I'm here to explain threat models. -->

---

## Who Is This Talk For?

- **Legal observer networks** documenting state violence at protests
- **Jail support** hotlines taking calls from detainees and families
- **Mutual aid dispatchers** coordinating direct action support
- **Domestic violence crisis lines** protecting caller identity
- **Immigration legal hotlines** where the call log is evidence
- **Rapid response coalitions** with time-sensitive routing needs

:::fragment
*If you're running a phone-based support operation for people who face real threats — this talk is for you.*
:::

<!-- notes: Ask the room: raise your hand if you operate or support a crisis line. Keep it up if you're on Google Voice. Keep it up if you use Twilio directly. This frames the problem for those who aren't operators themselves. About 75 minutes of content plus 15 minutes of questions. -->

---

## What I'll Cover

1. **Why existing tools fail** the activist threat model
2. **SIP trunking** — why call routing matters for privacy
3. **E2EE notes and messages** — what "zero-knowledge server" actually means
4. **Signal channel integration** — for orgs that need Signal-based reporting
5. **What changed in v2** — the results of a crypto review
6. **Self-hosting** — what it takes, what it costs, what it protects
7. **What we still can't protect** — be honest about the boundary

<!-- notes: Rough timing: Parts 1-2 take about 20 min, Part 3 about 20 min, Parts 4-5 about 20 min, Parts 6-7 about 10 min, then Q&A. Adjust based on audience questions throughout. -->

---

# Part 1: The Problem

<!-- notes: Transition: Let's start with who's coming for your org and why your current tools are a gift to them. -->

---

## The Realistic Adversaries

:::columns
:::left
### Well-Resourced
- Law enforcement with **administrative subpoenas** (no judicial review, 48 hrs)
- Fusion centers correlating data across agencies
- Federal agencies with NSLs
:::right
### Moderately Resourced
- Right-wing groups with **OSINT toolkits**
- Private investigators with **carrier access**
- Doxxing crews targeting volunteers by name
:::

:::fragment
**Note: We're not defending against nation-state 0-days or coerced admins. That's a different threat model.**
:::

<!-- notes: Administrative subpoenas are the key point here. They require no judge. A detective can serve one directly to Google, to Twilio, to any US-based cloud provider. Response time is typically 24-72 hours. The provider almost never tells you. This is the threat most activist hotlines face day-to-day — not sophisticated attacks, just paperwork. -->

---

## Real Scenarios

> *A detective got a Google administrative subpoena. All incoming call records for the past 90 days: timestamps, caller IDs, duration. They called the organizer whose personal number showed up most often.*

:::fragment
> *A Twilio account was subpoenaed during a protest response. The dashboard showed every call: who called, who answered, how long they talked.*
:::

:::fragment
> *A volunteer's notes were in a shared Google Doc. The doc was in a G Suite account. The org didn't know Google had responded to a CIPA request.*
:::

<!-- notes: These are anonymized composites from real incidents. Don't name orgs. The point is: these are not sophisticated attacks. They're paperwork. The attacker doesn't need to break encryption — they go to the provider with a form. Our job is to make that form useless. -->

---

## Why Google Voice Fails

- **Call records**: Google stores them. Administrative subpoena = Google hands them over.
- **Caller ID**: Google sees the real number. You have it, they have it.
- **48-hour administrative subpoena**: No judicial review. No notice to you.
- **Account access**: If the account is compromised, everything is exposed.
- **Google Fi extension**: Organizer's personal number becomes visible when they answer.

:::fragment
*Google Voice was designed for a business's customer support line. Not for a legal observer network.*
:::

<!-- notes: Google's "administrative subpoena" compliance is extremely fast. I've spoken to people who only found out because they asked for a transparency report months later. The latency between the subpoena and the call to the organizer was under 72 hours in at least one case I know of. -->

---

## Why Twilio Direct API Fails

- **CDRs in the dashboard**: Every call — caller ID, called number, duration, timestamp, recording URL — stored in Twilio's dashboard.
- **Twilio is US-based**: Subject to US law and administrative subpoenas.
- **TwiML Apps store config**: Who your volunteers are is in your Twilio account.
- **Recording storage**: If you record calls for quality, those recordings are on Twilio S3.

:::fragment
*Twilio is a great developer tool. It's a terrible privacy layer for activist hotlines.*
:::

<!-- notes: I want to be fair to Twilio here. They publish transparency reports, they push back on some requests. But "they sometimes push back" is not a threat model. When law enforcement has a valid administrative subpoena, US-based providers comply. -->

---

## The Subpoena Attack Surface

```
Google Voice account
    ├── Call history (caller ID, timestamps, duration)
    ├── Voicemail recordings (stored by Google)
    └── Account holder identity

Twilio dashboard  
    ├── CDRs: every call, every participant
    ├── TwiML config: who your volunteers are
    └── Recording files on S3

Notes in Google Docs
    ├── Full plaintext content
    └── Edit history showing when each volunteer wrote
```

:::fragment
**Every hop is a separate subpoena target. And they all comply.**
:::

<!-- notes: This is why we talk about "attack surface reduction." You can't make the calls disappear, but you can make the call records useless and the notes unreadable. -->

---

# Part 2: The Architecture

## Why SIP Trunking Changes Everything

<!-- notes: Transition: Now let's talk about what we actually built. The core insight is that the metadata — who called whom, when, for how long — is as dangerous as the content. -->

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
- You control what gets logged (or: nothing)
- Telnyx/SignalWire offer CDR-free options
- Self-hosted Asterisk/FreeSWITCH: no cloud provider at all
- More setup, **you own the metadata**
:::

<!-- notes: The SIP trunk is the key architectural move. Instead of "Twilio routes calls for you," you're saying "a PSTN number terminates at MY server, then I route." The call detail record lives on your infrastructure, not Twilio's. If you go all the way to self-hosted Asterisk with no cloud SIP provider, there's no external party with records at all — just your database. -->

---

## The Call Flow

```
Caller dials PSTN number
        │
        ▼
SIP trunk terminates at YOUR server
  (Telnyx CDR-free / SignalWire / self-hosted)
        │
        ▼
Llámenos SIP bridge
  (Asterisk, FreeSWITCH, or Kamailio)
        │
        ▼
Parallel ring → ALL on-shift volunteers
  simultaneously
        │
        ▼
First volunteer picks up → others hang up
  ↳ Caller is connected
  ↳ Volunteer logs encrypted notes
```

<!-- notes: Walk through this slowly. The SIP bridge is the key piece. It's running on your server, behind a Cloudflare Tunnel for ingress. No public IP needed. The PSTN number is just a DID (Direct Inward Dial) from whatever SIP provider you chose. -->

---

## Why Parallel Ring Matters

:::columns
:::left
### Sequential Ring (traditional)
- Call → Volunteer 1 (ring 20s)
- No answer → Volunteer 2 (ring 20s)
- No answer → Volunteer 3 (ring 20s)

**What the CDR shows:**
Three separate call legs to three numbers. Timestamps show who was tried when. Who answered is obvious.
:::right
### Parallel Ring (Llámenos)
- Call → ALL on-shift volunteers simultaneously
- First pickup → others instantly hang up

**What the CDR shows (on your server):**
One inbound call. Outbound legs all start at the same timestamp. First pickup wins.
:::

:::fragment
*Sequential ring is a timeline of your volunteer roster. Parallel ring is a single event.*
:::

<!-- notes: This is subtle but important for OSINT defense. If an adversary can see CDRs, sequential ring tells them: "here are the volunteer phone numbers, in order, at this time of day." Parallel ring tells them much less. Combined with CDR-free SIP trunks, the metadata posture is dramatically better. -->

---

## 8 Telephony Adapters — Choose Your Trust Level

```
TelephonyAdapter (abstract interface)
├── TwilioAdapter          ← Easy. CDRs in dashboard. OK for low-risk orgs.
├── SignalWireAdapter       ← CDR-configurable. Better than Twilio.
├── TelnyxAdapter          ← CDR-free SIP trunk option. Good choice.
├── VonageAdapter
├── PlivoAdapter
├── BandwidthAdapter
├── AsteriskAdapter        ← Self-hosted. No external CDRs at all.
└── FreeSWITCHAdapter      ← Self-hosted alternative.
```

:::fragment
*Every adapter implements the same interface. Switching providers is a config change, not a rewrite.*
:::

<!-- notes: The adapter architecture means you can start with Twilio while you're building out your self-hosting capability, then migrate to Telnyx, then eventually to self-hosted Asterisk when you're ready. No code changes. The SIP bridge (sip-bridge/) is provider-agnostic — PBX_TYPE env var selects the backend. -->

---

## Self-Hosting: The Full Stack

```bash
# What you run
docker compose -f deploy/docker/docker-compose.yml up -d

# Services:
# ├── PostgreSQL     — encrypted notes, call records, audit log
# ├── Llamenos app   — Bun/Hono HTTP server
# ├── strfry         — self-hosted Nostr relay (real-time events)
# ├── sip-bridge     — Asterisk/FreeSWITCH/Kamailio SIP bridge
# └── signal-notifier — zero-knowledge Signal sidecar (optional)
```

- **Cloudflare Tunnels** for ingress — no public IP exposed
- **EU hosting** option for GDPR compliance
- **No telemetry** to any external party
- Reproducible builds with **SLSA provenance** and **cosign** verification

<!-- notes: The Cloudflare Tunnel means your server doesn't need a public IP. It phones home to Cloudflare, which handles ingress. This is important for operational security — no IP address exposed to the internet. The reproducible build system lets you verify that the binary you're running matches the published source code. -->

---

# Part 3: E2EE — Zero-Knowledge Notes & Messages

<!-- notes: Transition: Now the most important part — what happens AFTER the call. The notes. The conversation history. The reason your server is valuable to an adversary. -->

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
*A successful subpoena gets you: "yes, a call happened at 11:47pm, duration 23 minutes, here's a ciphertext blob."*
:::

<!-- notes: This is the key promise. If your server is compromised, if you're served a subpoena, if an admin is coerced — they get encrypted blobs. To read a note, you need the volunteer's private key. The private key never leaves the device. -->

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

<!-- notes: "Forward secrecy" means: if a key is compromised tomorrow, it doesn't decrypt yesterday's notes. Each note has its own random key. The volunteer's identity key is only used to wrap the per-note key — not to encrypt content directly. So even if the volunteer's identity key is later compromised, the attacker has to also get the wrapped note key for each note individually. -->

---

## HPKE — Why We Moved From ECIES

:::columns
:::left
### v1: secp256k1 ECIES

- Non-standard curve for key agreement
- Custom construction (SHA-256 + XChaCha20)
- No formal security proof for this exact combination
- Single nsec per user = single point of compromise
- **Identified issues:** no domain separation, no forward secrecy, wrong curve
:::right
### v2: HPKE (RFC 9180)

- X25519 for key agreement (standard)
- HKDF-SHA256 for key derivation (standard)
- AES-256-GCM for AEAD (standard)
- Formally specified, actively maintained
- Per-device keys + sigchain authorization
- **57 domain separation labels** (Albrecht defense)
:::

<!-- notes: The v1 → v2 migration came out of a review by a cryptographer who has worked on Signal's protocol. The core problem with v1 was: it worked, but it wasn't a standard construction. A jury of your peers can't quickly verify a custom ECIES scheme. HPKE is an IETF RFC. It's the same key agreement used in TLS 1.3's 0-RTT. The formal security analysis exists. -->

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
*Without domain separation: an attacker could feed a wrapped message key into the note-key decryption path, or cross-protocol attacks between ECDH uses. With 57 labels: each operation is cryptographically isolated.*
:::

<!-- notes: The "Albrecht defense" refers to Martin Albrecht's work on cross-protocol attacks in real-world crypto deployments. If you use the same key derivation function with the same inputs across two different operations, an attacker can try to mix the outputs. Domain separation labels prevent this by binding the output of every HKDF/ECDH/HPKE operation to its specific purpose. We generate these constants in one JSON file and compile them to TypeScript, Swift, and Kotlin via codegen. No raw string literals in the codebase. -->

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

<!-- notes: The sigchain is borrowed conceptually from Signal's sealed sender. Each device authorization is a signed statement from an already-authorized device. You verify a new device by comparing a short authentication string (SAS) — four emoji, six words, whatever — between the two devices. This prevents a MITM from injecting a rogue device into your sigchain. -->

---

## What the Server "Knows" vs. What It Knows

:::columns
:::left
### Server CAN observe
- A call happened at timestamp T
- Call duration D seconds
- Which hub the call came through
- That a note was created (not contents)
- Volunteer device pubkey (not name, not number)
:::right
### Server CANNOT observe
- Note contents
- Message contents
- Caller phone number (HMAC-hashed)
- Caller identity
- Message transcript
- Who the volunteer is as a person
:::

<!-- notes: The caller phone number is stored as an HMAC hash (llamenos:phone: prefix). The HMAC key is a server secret. This means the server can recognize "same caller called again" without storing the number in plaintext. If someone gets the database, they see a hash — they can't reverse it to the phone number without the HMAC key. If they get the HMAC key AND the database, they can compute hashes but not the original numbers. -->

---

## Per-Message Envelope Encryption

Same pattern as notes — for inbound SMS, WhatsApp, Signal messages:

```
Inbound message arrives at webhook
        │
        ▼
Server generates random message_key = random_bytes(32)
        │
        ▼
Encrypt plaintext: XChaCha20-Poly1305(message_key, nonce)
        │
        ▼
HPKE-wrap message_key for: assigned volunteer + all admins
        │
        ▼
Store { ciphertext, readerEnvelopes[] }
Discard plaintext from memory immediately
        │
        ▼
Server cannot read stored messages
```

:::fragment
*The server acts as a blind relay. It routes messages it cannot read.*
:::

<!-- notes: This is important for Signal integration especially. When someone sends a Signal message to your org's Signal number, the server receives it, encrypts it immediately, and throws away the plaintext. Even if the server is compromised moments after the message arrives, the plaintext is gone. The attacker gets ciphertext. -->

---

## Cascading Key Rotation

:::columns
:::left
### The Problem
Volunteer leaves the org. They still have their copy of old note keys. You want to ensure future notes are inaccessible to them.
:::right
### The Solution
**Per-User Key (PUK)** with cascading lazy rotation:

```
PUK ──wraps──▶ items_key
items_key ──wraps──▶ per-note key
per-note key ──encrypts──▶ note content
```

On volunteer departure: rotate PUK. Lazy re-wrap of items_keys. Future notes: departed volunteer can't decrypt.
:::

<!-- notes: "Lazy rotation" means we don't immediately re-encrypt all historical notes. Historical notes stay encrypted with old keys — the departed volunteer has their old device key and could still read historical notes they had access to. That's accepted. What we guarantee: future notes after the rotation are inaccessible to the departed volunteer. MLS (behind a feature flag) will handle group key rotation when that's ready. -->

---

# Part 4: Signal Channels

<!-- notes: Transition: A lot of orgs already use Signal for internal coordination. We built a way to route Signal messages into the same zero-knowledge system. -->

---

## Why We Added Signal as a Channel

- Callers who can't install your app can reach you via Signal
- Rapid responders in the field have Signal already
- Legal observers want to file reports from their phone
- Jail support families want to send updates via what they already have

:::fragment
*The goal: one secure inbox. Voice calls, SMS, WhatsApp, Signal — all end up encrypted in the same place.*
:::

<!-- notes: The impetus for Signal integration was feedback from legal observer networks. Their observers in the field have Signal, not a custom app. They need to send updates during a protest. "We have 12 people arrested, here are the names." That message needs to be encrypted at rest, not sitting in a Signal group that includes 40 people. -->

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

<!-- notes: The Signal sidecar is a separate process that runs alongside the main app. It has access to Signal credentials (via signal-cli or similar). The main app communicates with it via a bearer token. The sidecar resolves HMAC hashes to Signal registrations — it knows the mapping, but the mapping is: hash → Signal registration, not hash → phone number. If the sidecar is compromised, the attacker sees hashes, not numbers. -->

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
:::right
### Outbound
- App sends notification request to sidecar
- Sidecar resolves HMAC → Signal registration
- Delivers via Signal protocol
- Identity key trust verification before delivery
- Retry queue with backoff
- Failover to SMS if Signal delivery fails
:::

<!-- notes: The identity key verification is important. Signal identifies users by their identity key. If someone's identity key changes (e.g., they reinstalled Signal), you get a safety number change warning. The sidecar checks for this and holds delivery pending manual review — same behavior as Signal desktop. -->

---

## Blast / Broadcast

Send a message to all registered Signal contacts at once:

- **Jail support update**: "17 people arraigned, bail hearing at 9am tomorrow"
- **Rapid response alert**: "Police moving on south side, rally to 5th and Main"
- **Schedule change**: "Tonight's shift covered by backup volunteers"

```
Blast delivery:
  ├── PostgreSQL-backed delivery queue
  ├── Per-channel rate limiting (Signal: 1 msg/sec per recipient)
  ├── Per-recipient delivery status tracking
  └── Retry with exponential backoff
```

<!-- notes: Rate limiting is critical here. Signal aggressively rate-limits bulk senders. The blast service handles this with a delivery queue and per-recipient rate limiting. You don't want to get your org's Signal number banned because you sent a bulk message too fast. -->

---

## Why Not Just Signal For Everything?

:::columns
:::left
### Signal does well
- End-to-end encrypted messages
- Voice and video calls (E2EE)
- Disappearing messages
- Safety number verification
- Widely deployed in activist communities
:::right
### Signal doesn't have
- **Parallel ring** for voice routing
- **Case management** and note-taking
- **Role-based access** (volunteer vs. admin)
- **Admin audit logs**
- **Template-driven workflows**
- **Multi-hub routing** (multiple orgs, one volunteer)
- **On-call shift scheduling**
:::

<!-- notes: This comes up a lot. "Why not just use Signal?" Signal is great for 1:1 and small group communication. It's not a call routing system. It doesn't know who's on shift. It doesn't have parallel ring. It doesn't have case management. And importantly: Signal's server knows your phone number. Llámenos doesn't store your volunteers' phone numbers in plaintext. They're hashed. -->

---

# Part 5: What Changed in v2

## The Crypto Review

<!-- notes: Transition: I want to be transparent about our process. We had v1 working, we had someone review it, and we found real problems. Here's what we found and what we changed. -->

---

## What the Review Found

A Signal protocol cryptographer reviewed v1. Key findings:

:::fragment
1. **secp256k1 ECIES was non-standard** — custom construction, no formal proof for this exact combination
:::

:::fragment
2. **Single nsec per user** — one private key per person, lives on multiple devices. Compromise one device → compromise all notes.
:::

:::fragment
3. **No domain separation** — same HKDF inputs across different operations → cross-protocol attack surface
:::

:::fragment
4. **No per-note forward secrecy** — one content key wrapped per user, not per note → historical notes exposed by key compromise
:::

:::fragment
5. **No SAS verification** on device linking — MITM could inject a rogue device
:::

<!-- notes: I want to be clear: v1 wasn't broken in the sense that it would have been trivially exploited. The issues were architectural weaknesses that would matter against a sophisticated cryptographic adversary. The review was valuable precisely because it forced us to think through each protocol detail. The changes we made are not cosmetic. -->

---

## What We Changed: v1 → v2

:::columns
:::left
### v1
- secp256k1 ECIES (custom)
- XChaCha20-Poly1305 (content)
- Single nsec per user
- No domain separation
- No per-note forward secrecy
- No SAS verification
- No sigchain
:::right
### v2
- **HPKE (RFC 9180)** — X25519-HKDF-SHA256-AES256-GCM
- XChaCha20-Poly1305 (content, still good)
- **Per-device Ed25519/X25519 keys**
- **57 domain separation labels** (Albrecht defense)
- **Random key per note** (forward secrecy)
- **SAS verification** on device provisioning
- **Append-only hash-chained sigchain**
:::

<!-- notes: HPKE (RFC 9180) is the IETF-standardized hybrid public key encryption scheme. The exact suite we use — X25519-HKDF-SHA256-AES256-GCM — is the same as what TLS 1.3 uses for 0-RTT. It has a formal security proof. It's audited. It's not a custom construction. -->

---

## The Shared Rust Crypto Crate

**One implementation. Compiled to three targets. One audit surface.**

```
packages/crypto/  (Rust crate)
├── HPKE: RFC 9180 X25519-HKDF-SHA256-AES256-GCM
├── Ed25519 / BIP-340 Schnorr signatures
├── PBKDF2 / HKDF key derivation
├── XChaCha20-Poly1305 content encryption
├── SFrame key derivation (voice E2EE)
└── MLS (behind feature flag, for group state)

Compiled to:
├── native     → Tauri desktop (via Cargo path dep)
├── WASM       → browser test builds
└── UniFFI     → iOS XCFramework + Android JNI .so
```

:::fragment
*One implementation reviewed once. Platform-specific crypto libraries are where divergence hides.*
:::

<!-- notes: This is a principle from Signal's design too. You want one audited implementation, not three implementations that drift from each other. The UniFFI bindings let the Rust crate be called from Swift (iOS) and Kotlin (Android) directly. The WASM build lets browser-based tests use the same crypto. -->

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

<!-- notes: SFrame is an IETF RFC (9605) for media frame encryption. It was designed specifically for WebRTC media streams, but it applies to SIP media as well. The key derivation is integrated into packages/crypto — same Rust crate, same audit surface. This means a compromised SIP bridge sees only encrypted media frames, not call audio. -->

---

## Device Provisioning Protocol

```
Linking a new device (Signal-style ephemeral ECDH):

  New device:
    Generate ephemeral X25519 keypair
    Post ephemeralPubkey to provisioning room

  Existing authorized device:
    Fetch ephemeralPubkey
    Derive shared secret: ECDH(device_privkey, ephemeral_pubkey)
    Derive SAS: HKDF-SHA256(shared_secret, "llamenos:sas")
    Display SAS to user (6 words / 4 emoji)
    Wrap identity key material for new device
    Post to provisioning room

  User compares SAS on both screens
  If they match: new device is authorized in sigchain
  If mismatch: abort — there's a MITM
```

<!-- notes: The SAS (Short Authentication String) verification is the key step. The two devices independently compute a hash of the ECDH shared secret. If a MITM is intercepting, they'll see different values. The user visually confirms "yes, these match" — same as Signal's safety number comparison or WhatsApp's QR code pairing. -->

---

# Part 6: Self-Hosting & Deployment

<!-- notes: Transition: Now let's talk about what it actually takes to run this. -->

---

## What You Run

```yaml
# deploy/docker/docker-compose.yml

services:
  db:           PostgreSQL 16 (encrypted notes, audit log)
  app:          Bun + Hono (the API server)
  relay:        strfry (self-hosted Nostr relay — real-time events)
  sip-bridge:   Asterisk / FreeSWITCH / Kamailio (SIP routing)
  
# Optional profiles:
  signal:       signal-notifier sidecar (port 3100)
  telephony:    Kamailio + CoTURN (if you want full self-hosted SIP)
  inference:    LLM firehose agent (message extraction)
  monitoring:   Prometheus + Grafana
```

- **Cloudflare Tunnels** for ingress — no exposed public IP
- **EU hosting** compatible — GDPR by design
- **Kubernetes** option: Helm chart with health probes

<!-- notes: The Nostr relay (strfry) is not optional. It's the real-time event bus between the server and clients. Hub events, push notifications, call routing — all go through Nostr relay. It's self-hosted on your infrastructure. Your Nostr relay, not one of the public ones. -->

---

## Reproducible Builds — Verify What You're Running

```bash
# Anyone can verify the binary matches the published source
./scripts/verify-build.sh

# What this checks:
# - SOURCE_DATE_EPOCH is set (reproducible timestamps)
# - Content-hashed filenames match published CHECKSUMS.txt
# - SLSA provenance attestation verifiable via cosign
# - SBOM (Software Bill of Materials) matches dependencies
```

- **SLSA Level 2 provenance**: Build provenance signed by CI
- **cosign**: Verify the signature on the release
- **SBOM**: Know exactly what libraries you're running
- **knope** manages version bumps — no manual version file editing

<!-- notes: Reproducible builds matter for activist orgs because it means you're not taking my word for what the binary does. You can build it yourself from source and get the same hash. This is auditable. The SLSA provenance tells you which GitHub Actions workflow built it and when. cosign is the signature verification. The CHECKSUMS.txt in every release has SHA-256 hashes for every artifact. -->

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
  "customFields": [...],
  "workflowSteps": [...]
}
```

*Legal observer network, jail support, domestic violence line, immigration legal — same codebase, different template.*

<!-- notes: This is intentional. We didn't want to build a "jail support app" that gets repurposed. We built a secure routing and case management infrastructure that you configure via templates. Your org's use case is a JSON file. If you change use cases, you change the template. If a different org wants to use Llámenos, they write their own template. -->

---

# Part 7: What We Still Can't Protect

<!-- notes: Transition: I want to close with honesty. Llámenos is a significant improvement over Google Voice and Twilio direct. It is not a magic shield. Here's what we can't protect against. -->

---

## The Honest Threat Model Boundary

:::columns
:::left
### We protect against
- Administrative subpoenas to cloud providers
- CDR analysis (with CDR-free SIP trunk)
- Note content exposure (E2EE)
- Message content exposure (E2EE)
- Caller identity via phone records (HMAC)
- Sequential ring volunteer identification
- Note exposure via key compromise (forward secrecy)
:::right
### We don't protect against
- **Carrier metadata**: Your SIP provider still sees traffic patterns
- **Timing correlation**: Sophisticated adversary can correlate
- **Device compromise**: Owned device = decryptable notes
- **Admin coercion**: Coerced admin can re-wrap note keys
- **Nation-state 0-days**: On the server, the clients, or the crypto
- **Operational security failures**: Bad password hygiene, phishing
:::

<!-- notes: I want to be very clear about admin coercion. If an admin is physically coerced, they can decrypt notes. This is not a flaw in the cryptography — it's a fundamental property of multi-admin E2EE. The alternative is "only the volunteer can read notes, admins cannot" — which means admins can't do case management. We made the design choice that admins need to read notes, and we document the consequence: coerced admin = exposed notes. Know your threat model. -->

---

## Know Your Threat Model

> *Llámenos is designed for the realistic threat faced by a US-based activist organization: law enforcement administrative subpoenas, OSINT-level adversaries, and insider threats. It is not designed to withstand a dedicated nation-state adversary with physical access to your infrastructure.*

**Before deploying:**
- Who is your adversary?
- What can they do without a warrant?
- What can they do with a warrant?
- Who are your admins and what's their risk profile?
- What happens if your server is seized?

<!-- notes: The "seized server" question is important. If law enforcement seizes your server, they get encrypted blobs and call metadata (timestamps, duration, hashed phone numbers). They do NOT get note contents, message contents, or plaintext caller IDs — assuming you've configured CDR-free SIP. That's a meaningful protection. It means they have to come back with something harder to get than an administrative subpoena. -->

---

## Get Involved

- **Code**: `github.com/llamenos-hotline/llamenos` (AGPL-3.0)
- **Self-hosting docs**: `llamenos-hotline.com/docs`
- **This deck**: `llamenos-hotline.com/slides/counterspy-2026/`
- **Signal**: Ask me after the talk — I'll share the group link

:::fragment
*We especially need:*
- *Organizations willing to run beta deployments*
- *Cryptographers to review the HPKE implementation*
- *People who have survived subpoenas and can stress-test our threat model assumptions*
- *EU-based orgs for GDPR validation*
:::

<!-- notes: The project is pre-production. No production users yet. We are looking for organizations willing to run beta deployments — ideally ones that have real security needs and existing operational security practices. If you've been subpoenaed, I want to talk to you specifically. Your real-world experience stress-tests our threat model assumptions in ways that theoretical analysis cannot. -->

---

# Questions?

**Rhonda** / CounterSpy 2026, Atlanta

*"More Secure Hubs for Your Spokes"*

`llamenos-hotline.com/slides/counterspy-2026/`

<!-- notes: Likely questions to prepare for:

1. "What does it cost to self-host?" — Small VPS (2 CPU, 4GB RAM) is enough for most orgs. ~$10-20/month on Hetzner (EU). SIP trunk DID is $1-5/month depending on provider. PostgreSQL storage grows slowly.

2. "What happens when a volunteer leaves and they might be a threat?" — Key rotation via PUK. Future notes inaccessible to departed volunteer. Historical notes they had access to: they still have those keys. This is accepted. Same limitation as any E2EE system.

3. "How hard is it to migrate from Google Voice?" — Get a new phone number (or port your existing one to a SIP-capable provider), point it at your SIP trunk, deploy the Docker Compose stack. No automated migration tool yet.

4. "GDPR — what about caller data?" — Caller phone numbers stored as HMAC hashes (one-way). Call timestamps stored. Content encrypted. For EU org with EU callers: you're not storing identifiable call content. Legal question: is a hashed phone number "personal data"? EU DPA may have views on this. Get legal advice for your jurisdiction.

5. "Can we use this with our existing Twilio numbers?" — Yes. TwilioAdapter supports SIP trunking via Twilio Elastic SIP Trunking, which is different from Twilio Programmable Voice API. Elastic SIP gives you significantly better CDR control.

6. "What's the status of the MLS implementation?" — Behind a feature flag. Functional but not battle-tested. We recommend waiting for the MLS RFC to stabilize further before enabling it in production. -->
