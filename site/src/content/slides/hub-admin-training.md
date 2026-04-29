---
title: "Llámenos Hub Admin Training"
author: "Llámenos Project"
date: 2026-05-03
event: "Hub Admin Onboarding"
description: "Step-by-step training for hub administrators: setup, volunteers, shifts, E2EE, Signal, case management, and audit logs."
---

# Llámenos Hub Admin Training

You're now responsible for a secure crisis hotline.

*No pressure.*

<!-- notes: This is a training session for new hub administrators. Estimated time: 60-90 minutes including questions. The tone here is important: don't make this feel intimidating. Admins don't need to understand the cryptography to run a hub well. They need to understand their responsibilities, know where the controls are, and know what to do when something goes wrong. Start by normalizing the "this is a lot" feeling. It is a lot. It also breaks down into manageable pieces. -->

---

## First Thing: You Don't Need to Understand the Crypto

You need to understand your **responsibilities** and your **controls**.

The cryptography is doing its job whether you understand it or not.

What you need to know:
- **Your admin key is powerful.** Protect it like a physical key to your office.
- **The server stores data it can't read.** That's by design.
- **You can see everything.** With that comes responsibility.
- **You can revoke access instantly.** That's the emergency button.

:::fragment
*The goal of this training: you leave knowing what to do and what not to do. The crypto handles the rest.*
:::

<!-- notes: This framing is intentional. A lot of admin training decks lead with technical architecture. This one doesn't. The first thing a new admin needs to hear is: the system is designed so that you don't need to be a cryptographer to run it safely. Your job is: protect your key, know where the controls are, make good operational decisions. The system's job is: keep encrypted things encrypted. -->

---

## What Is Llámenos?

**Llámenos** (Spanish: "call us") is a secure hotline infrastructure for organizations that take calls from at-risk communities.

:::columns
:::left
### What it does
- Routes inbound PSTN calls to on-shift volunteers
- **Parallel ring**: all on-shift volunteers ring simultaneously
- Encrypted note-taking during and after calls
- Case management for ongoing situations
- Multi-channel: voice, Signal, SMS, WhatsApp
:::right
### Why it's different
- **The server can't read the notes.** That's not a marketing claim — that's the architecture.
- **Call records are hashed, not stored in plaintext.** Subpoena gets encrypted blobs.
- **You own the data.** It runs on your server.
:::

<!-- notes: If someone on this call hasn't seen the full project context, give them this in one sentence: Llámenos is a hotline system where even if law enforcement gets a court order for the server, they can't read the notes. That's the whole design goal. Everything else flows from that. -->

---

## Your Role as Hub Admin

As an admin, you can:

- View **all call records** (metadata — time, duration, which volunteer answered)
- Read **all notes** (your device decrypts them — more on this in a moment)
- Manage **volunteers**: add, remove, change roles
- Configure **shifts** and ring groups
- Manage **ban lists** and spam mitigation
- View **audit logs**: every call answered, every note written, tamper-evident
- Configure **hub settings**: SIP trunk, Signal channel, templates

:::fragment
*With this access comes responsibility. Your admin device is the highest-value target in your org's infrastructure. Treat it accordingly.*
:::

<!-- notes: The key point: admin access to notes is by design. Admins have a cryptographic key envelope for every note — that's how case management works. Someone needs to be able to see the full picture across calls and volunteers. That someone is you. This means: admin devices must be treated with care. Full-disk encryption. Strong PIN. Don't log in as admin from shared devices or take the admin device to places where it might be seized. -->

---

# Setup: Getting Your Hub Running

<!-- notes: Let's walk through initial deployment. This assumes a Linux server with Docker installed. If you don't have one yet, Hetzner in Germany is a good choice for EU orgs — €8-15/month gets you plenty of capacity. -->

---

## What You Need Before Starting

- **Server**: Linux VPS (Ubuntu 22.04+ works well), 2 CPU / 4GB RAM minimum
- **Domain**: A domain you control (`hotline.yourorg.com`)
- **SIP trunk**: Account with Telnyx, SignalWire, Vonage, or similar
- **Docker**: Docker Engine 24+ and Docker Compose V2
- **Cloudflare account**: For Tunnel ingress (free tier is fine)
- **30 minutes** and a text editor

```bash
# Quick check
docker --version   # 24.x or higher
docker compose version  # 2.x
```

<!-- notes: The "30 minutes" is honest for someone comfortable with Linux. For someone who's never set up a server before, budget more and find someone in your technical community to help with the first deploy. This is not SaaS — it's infrastructure that you control. The operational overhead is real but manageable. -->

---

## Initial Deployment

```bash
# 1. Clone the repo
git clone https://github.com/llamenos-hotline/llamenos.git
cd llamenos

# 2. Copy and edit environment config
cp .env.example .env
nano .env

# Key variables to set:
# DATABASE_URL=postgres://llamenos:CHANGEME@db:5432/llamenos
# PG_PASSWORD=CHANGEME
# HMAC_SECRET=<64 random hex chars: openssl rand -hex 32>
# SERVER_NOSTR_SECRET=<64 hex chars: openssl rand -hex 32>
# BRIDGE_SECRET=<32 hex chars: openssl rand -hex 16>
# PBX_TYPE=telnyx   # or signalwire, vonage, asterisk, etc.

# 3. Generate your admin keypair
bun run bootstrap-admin
# ← This prints your admin secret key ONCE. Write it down now.

# 4. Start services
docker compose -f deploy/docker/docker-compose.yml up -d
```

<!-- notes: The bootstrap-admin command is the most important step. It generates your admin Ed25519 keypair. The public key goes in .env as ADMIN_PUBKEY. The secret key is shown ONCE — write it down immediately, put it in a secure password manager (Bitwarden, KeePassXC). If you lose the admin secret key, you cannot access admin functions. There is no "forgot my admin key" recovery path. Treat it like the root password to your entire hotline. -->

---

## The Admin Secret Key: Handle With Care

The bootstrap step prints something like:

```
Admin public key:  npub1abc...xyz
Admin secret key:  nsec1def...uvw  ← THIS IS YOUR ADMIN KEY
                                     SHOWN ONCE. COPY IT NOW.
```

**What to do with it:**
- Store in a password manager (Bitwarden, KeePassXC) with a strong master password
- Consider keeping a paper copy in a physically secure location
- Do NOT store in email, Slack, iCloud, Google Drive
- Do NOT paste it into any chat window or document

:::fragment
*Whoever holds this key can read all notes in your hub. Protect it accordingly.*
:::

<!-- notes: Don't minimize this. A lost admin key means you can't do admin functions. A compromised admin key means whoever has it can decrypt every note ever written in your hub. It's the master decryption key. The good news: it only has to be entered occasionally — the app keeps a session going. But the key itself needs to be stored securely. Physical options: write it on paper, seal it in an envelope, put it in a safe. Digital options: KeePassXC with a strong master password, stored on a device you control. -->

---

## Choose Your SIP Trunk

```bash
# In .env, set your telephony provider:
PBX_TYPE=telnyx          # Options: telnyx, signalwire, vonage,
                         #   plivo, bandwidth, twilio, asterisk

# For Telnyx (recommended — offers CDR-free SIP trunk):
TELNYX_API_KEY=KEY...
TELNYX_SIP_CREDENTIAL_ID=...
TELNYX_PHONE_NUMBER=+15551234567

# For self-hosted Asterisk (maximum privacy — no external CDRs at all):
PBX_TYPE=asterisk
ARI_URL=http://asterisk:8088
ARI_USER=llamenos
ARI_PASSWORD=CHANGEME
```

**CDR-free SIP trunking (Telnyx)**: They don't store call detail records. A subpoena of Telnyx gets routing records only — not timestamps, not phone numbers, not durations in their system.

<!-- notes: Provider choice is the single biggest privacy decision in your deployment. Twilio stores CDRs by default — subpoena them and you get a full call record with phone numbers. Telnyx with CDR-free trunk is significantly better. Self-hosted Asterisk is the gold standard — there's no external SIP provider to subpoena. Start with what you can manage, upgrade as your capacity grows. The adapter architecture means switching is a config change. -->

---

## Set Up Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/\
download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate and create tunnel
cloudflared tunnel login
cloudflared tunnel create llamenos-hotline

# Configure: ~/.cloudflared/config.yml
tunnel: <your-tunnel-id>
ingress:
  - hostname: hotline.yourorg.com
    service: http://localhost:3000
  - service: http_status:404

# Start tunnel as a service
cloudflared service install
systemctl start cloudflared
```

**Why this matters**: No public IP on your server. No port scanning. No DDoS directly at your IP. Cloudflare handles ingress, your server is not directly addressable.

<!-- notes: The Cloudflare Tunnel is a meaningful operational security improvement even if you don't think of it that way. Your server's IP address is never exposed to the internet — not to clients, not to adversaries. Everything goes through Cloudflare's network. This is important because if someone knows your server's IP, they can try to attack it directly or ask a hosting provider for account information. With a tunnel: they don't know the IP. They have to go through Cloudflare's abuse process. -->

---

# Managing Volunteers

<!-- notes: The most common admin task: adding and removing people. Let's walk through how it works and the security considerations. -->

---

## Adding a Volunteer

```
Admin dashboard → Volunteers → Invite Volunteer

1. Enter volunteer's name
   (admin-only — never shown to other volunteers)
2. Set their role (Volunteer, Observer, etc.)
3. Click "Generate Invite Link"
4. Send invite link to volunteer via Signal or encrypted channel
   ← NOT via SMS or email
   ← The link is single-use and expires in 24 hours

Volunteer receives link:
  → Creates their device keypair locally
  → Completes device provisioning
  → You verify via SAS (Short Authentication String)
  → Their device key is added to your hub
```

<!-- notes: The invite link is single-use and expires. Send it via Signal if possible — don't send it via SMS (which Twilio or your carrier can see) or email (which Google/Microsoft can see). The link is not a secret per se, but it should be treated as sensitive — someone who intercepts it could complete onboarding as the volunteer. -->

---

## SAS Verification: The Step You Cannot Skip

When a volunteer completes setup, you'll see a Short Authentication String (SAS):

```
Volunteer's screen:     horse battery staple correct
Your admin screen:      horse battery staple correct
```

- **Strings match**: Tap "Authorize Device" — the volunteer is in.
- **Strings don't match**: Tap "Reject" — someone is intercepting the provisioning. Do NOT proceed. Investigate before retrying.

:::fragment
*This step prevents a MITM from injecting a rogue device into your hub. Compare SAS out-of-band — ideally in person or via Signal audio call. Never compare over the same channel the provisioning is happening on.*
:::

<!-- notes: The SAS is derived from an ECDH exchange between the volunteer's device and your device. If anyone is intercepting the connection, the strings will be different. You can think of this like Signal's safety number verification — same concept. The out-of-band requirement is critical: if you compare SAS via text message over the same network, an adversary who controls the network can show you matching strings while substituting their own device. Do it in person, or via Signal voice call, or via a completely separate channel. -->

---

## Common Gotcha: Admin Added After Notes Were Written

If an admin is added to a hub AFTER some notes were written:

```
Notes written before new admin was added:
  → Those notes don't have an admin envelope for the new admin
  → New admin CANNOT decrypt them
  → This is by design

Notes written after new admin is added:
  → New admin's pubkey is included in admin envelopes
  → New admin can decrypt these
```

**What to do**: Have the original volunteers re-export their pre-existing notes (if needed) and re-share manually. There's no automatic re-keying of old notes.

<!-- notes: This trips people up. If you bring in a second admin after the hub has been running for a month, that new admin can't read the first month's notes. That's not a bug — it's the forward-secrecy model. To fix it: the original admin or the volunteers who wrote those notes can export/re-share them. But there's no automatic retroactive re-encryption. Plan your admin roster before you go live if you need all admins to see all notes from day one. -->

---

## Removing a Volunteer

```
Admin dashboard → Volunteers → [Volunteer Name] → Deactivate

What happens immediately:
  ✓ Volunteer's device key is revoked from sigchain
  ✓ All active sessions for the volunteer are terminated
  ✓ Hub key is rotated — volunteer can't receive future events
  ✓ Future notes: volunteer's key is NOT included in envelopes

What doesn't change:
  ✗ Notes the volunteer already wrote: they still have their device key
    and can potentially still read those notes on their device
    (this is a known limitation of E2EE — you can't un-deliver a key)
```

:::fragment
*After hostile departure: deactivate immediately, rotate hub key, assess what they had access to. Historical access cannot be revoked.*
:::

<!-- notes: The hostile departure scenario is important to understand. If a volunteer turns out to be an informant or leaves under bad circumstances: deactivate them immediately (which rotates the hub key, so they can't see future calls), then assess the damage. What did they have access to? Their own notes. Calls they answered. Caller last-4 digits from those calls. Shift schedules. They cannot access notes from other volunteers, and they cannot access anything that happened after deactivation. That's meaningful containment, but it's not retroactive. -->

---

# Shifts and Ring Groups

<!-- notes: Configuring who is on call when. This is your operational schedule encoded into the system. -->

---

## How Shifts Work

```
Shift schedule example:
  Monday–Friday: 9am–9pm
    Ring group: [Alice, Bob, Carlos]

  Saturday–Sunday: 12pm–8pm
    Ring group: [Bob, Diana]

  After-hours fallback:
    Ring group: [Carlos, Diana]
```

When a call comes in:
1. Llámenos checks current shift
2. All volunteers in the active ring group ring **simultaneously**
3. First pickup wins; others hang up
4. If no one answers: call goes to voicemail (optional) or fallback group

<!-- notes: The shift schedule is the operational plan for your hotline. Volunteers can see which shifts they're assigned to but can't modify the schedule. The fallback group is important: configure it before you go live. What happens if the on-shift group doesn't answer? The voicemail is encrypted — same envelope pattern as notes. -->

---

## Why Parallel Ring Matters Operationally

In a real crisis line:

- **Sequential ring** (ring one, then the next, then the next): The first volunteer gets ALL the calls. The others rarely get rung. Burnout for one person, underuse of others.
- **Parallel ring** (everyone at once): Load distributes naturally. The person who's available picks up. If someone's in the bathroom, the call doesn't die.

```
Scenario: 3 volunteers on shift
  Sequential: Volunteer 1 gets 80% of calls. Volunteer 3 gets 5%.
  Parallel:   All three get roughly equal calls over time.
```

Also: for CDR analysis, parallel ring is much harder to reverse-engineer into a volunteer roster than sequential.

<!-- notes: Both the operational and privacy rationales for parallel ring are real. The load distribution is the operational win. The CDR analysis hardening is the privacy win. You get both. The downside: you need to configure ring groups carefully so you're not ringing people who are genuinely unavailable. Volunteers should be able to mark themselves unavailable temporarily — "I'm off today but I'm on shift tomorrow." -->

---

## Configuring Shifts

```
Admin dashboard → Shifts → New Shift

Fields:
  Name:          "Weekday Day Shift"
  Days:          Mon, Tue, Wed, Thu, Fri
  Start time:    09:00  ← hub timezone!
  End time:      21:00
  Ring group:    [select volunteers]
  Fallback:      [select fallback group]
  Ring timeout:  30 seconds

Admin dashboard → Shifts → Ring Groups
  A ring group is a named set of volunteers.
  Reuse across multiple shifts.
```

**Important**: All times are in the hub's configured timezone (set in `.env` as `HUB_TIMEZONE`). Set this correctly before creating shifts.

<!-- notes: Timezone is the most common configuration mistake. If you're in Atlanta (ET) and you set HUB_TIMEZONE=UTC, your 9am shift starts at 1am Eastern. Double-check this before your first live call. If your volunteers are in multiple timezones, use the timezone where your primary callers are, or where your operations are based. -->

---

## Spam Mitigation

```
Admin dashboard → Settings → Spam Mitigation

Options:
  □ Ban list: Block specific caller IDs (HMAC-hashed, not stored in plaintext)
  □ Rate limiting: Max N calls/hour per caller (default: 3)
  □ Voice verification: DTMF challenge before routing
      "Press 3 to reach a counselor" — digit is randomized per-call
      Stops automated dialers; real callers follow the prompt
  □ Geographic filtering: Allow only specific country codes
```

**Real-world use**: Legal observer hotlines get harassed during actions. Toggle voice verification ON during a high-traffic event, OFF when call volume is normal.

<!-- notes: The voice CAPTCHA is surprisingly effective against automated SIP scanning and telemarketing bots. The digit is randomized per-call, so you can't pre-program a bot to always press "3". Real callers follow the prompt without noticing it's a filter. Admins can toggle this in real-time during a protest if calls become harassing. The ban list uses HMAC-hashed caller IDs — you enter the actual number, it's hashed before storage. If someone gets the ban list, they see hashes, not phone numbers. -->

---

# Understanding E2EE: What Admins Need to Know

<!-- notes: This section is the most important conceptual piece. Admins need to internalize what the system can and cannot see, and what that means for their device security. -->

---

## What Gets Stored vs. What You See

```
Volunteer writes note:
  "Caller is a 28yo woman, fled domestic violence,
   needs shelter referral in North Atlanta."

What's stored in the database:
  encryptedContent: "a3f9bc12d4e8...7f2c"   ← unreadable ciphertext
  authorEnvelope:   { wrappedKey: "..." }
  adminEnvelopes:   [
    { pubkey: "YOUR_ADMIN_PUBKEY", wrappedKey: "..." },
    { pubkey: "OTHER_ADMIN_PUBKEY", wrappedKey: "..." }
  ]
```

**Your app decrypts this locally** using your device key. The server never sees the plaintext. Even if someone gets the database, they get ciphertext.

<!-- notes: Walk through this carefully. The volunteer generates a random 256-bit key for that specific note. They encrypt the note. Then they wrap that key for: themselves, and for each admin. The server gets the ciphertext and the wrapped keys. The server cannot decrypt without your private key. Your private key never leaves your device. This is why admin device security matters so much. -->

---

## What You See vs. What the Database Contains

:::columns
:::left
### In your admin app

- Full note text (decrypted locally)
- Call duration and timestamp
- Which volunteer took the call
- Case notes and custom fields
- Message history (decrypted)
- Caller last-4 digits (for display)
:::right
### In the raw database

- Encrypted blobs
- Timestamps and duration
- Volunteer device pubkey (not name)
- HMAC-hashed caller phone number
- Hash-chained audit log entries
:::

:::fragment
*A database breach gives the attacker: timestamps, durations, encrypted blobs, hashed phone numbers. Not readable content.*
:::

<!-- notes: The audit log is worth explaining separately. Every event generates an audit log entry. The entry contains: timestamp, event type, actor pubkey, and a hash of the content. It's hash-chained — each entry references the hash of the previous one. This means: if someone deletes or modifies an audit log entry, the chain breaks and you can detect the tampering. You can export and verify the chain integrity at any time. -->

---

## Protecting Your Admin Keys

:::columns
:::left
### Do
- **Full-disk encryption** on your admin device
- **Strong PIN/passphrase** on the Llámenos app
- **Log out** when not actively using the admin panel
- **Keep OS up to date**
- **2FA** on any account that can access the server
- Store admin key in **a password manager** with a strong master
:::right
### Don't
- Log in from **shared or public computers**
- Store admin keys in **cloud services** you don't fully control
- Share your admin device with others
- Use the same device for **high-risk field work**
- Take your admin device to **protests or police interactions**
- Paste your admin key into **any chat or document**
:::

<!-- notes: The "don't take it to protests" rule is important. If you're an admin AND you attend protests where your device might be seized, you need two devices: one admin device that stays home, one personal device that you carry. This is the same operational practice that security trainers recommend for any role where you handle sensitive data for an org. Your admin role and your field role need to be on separate devices. -->

---

# Signal Channel Setup

<!-- notes: Adding the Signal channel. This enables inbound messages from Signal users, outbound notifications, and bulk alerts. -->

---

## What the Signal Channel Provides

- **Inbound messages**: People text your org's Signal number → messages arrive encrypted in your inbox
- **Outbound notifications**: Notify registered contacts (schedule updates, alerts)
- **Blast messages**: Send updates to all registered Signal contacts at once

```bash
# Enable the Signal sidecar
docker compose -f deploy/docker/docker-compose.yml \
  --profile signal up -d

# Verify it's running
docker compose logs signal-notifier
# → "Signal notifier ready on port 3100"
```

<!-- notes: The Signal sidecar is a separate process isolated from the main database. If the sidecar is compromised, the attacker gets HMAC-hashed contact registrations and Signal credentials — not the full note database. The isolation is intentional. The bearer token shared between the app and sidecar controls all communication. -->

---

## Registering Your Org's Signal Number

```bash
# In .env:
SIGNAL_NOTIFIER_BEARER_TOKEN=<32 random hex chars: openssl rand -hex 16>
SIGNAL_NUMBER=+15559876543   # Your org's dedicated Signal number

# First-time registration:
docker compose exec signal-notifier signal-cli \
  -u +15559876543 register

# Enter the verification code sent to that number:
docker compose exec signal-notifier signal-cli \
  -u +15559876543 verify 123-456
```

:::fragment
*Use a dedicated phone number for your org's Signal account. Not a personal volunteer number. Not a Google Voice number that you're also using for something else.*
:::

<!-- notes: The Signal number should be a number you specifically acquired for this purpose. A Twilio number with SMS capability, a physical SIM in a device at your office, or a Google Voice number if that's what you have. Do NOT use a personal volunteer's number — the Signal account lives on the server, and that means the volunteer's personal Signal identity would be tied to the org's server process. That's bad for the volunteer's operational security. -->

---

# Case Management

<!-- notes: How the case management system works, and how to configure it for your org's workflow. -->

---

## Template-Driven: Configure for Your Use Case

Nothing is hardcoded. Your hub template defines everything:

```
Your template:
  ├── Entity types (person, incident, location, vehicle...)
  ├── Report types (arrest_report, intake_form, incident_log...)
  ├── Custom fields (badge_number, charges, shelter_needed...)
  ├── Workflow steps (intake → follow-up → closed)
  └── Role-based field visibility (what each role can see)
```

```
Admin dashboard → Settings → Templates → Edit Template
```

**Start minimal**: Define only the fields your volunteers actually need during a call. Add fields later as you learn what's useful in practice.

<!-- notes: The most common mistake with templates: overconfiguring on day one. You don't know what fields you'll actually need until you've run a few calls. Start with the basics — name, situation, needs, follow-up required — and add fields as you discover gaps. Adding a field later is easy. Getting volunteers to fill out 30 fields on every call is not. -->

---

## Linking Records: Building a Picture Across Calls

```
Scenario: Protest incident response

  Incident: [MLK Ave Protest, 2026-05-01]
    └── Person: [Alice, arrested at 10pm]
         └── Arrest Report: [Charges: disorderly conduct]
              └── Note: "Alice confirmed she has an attorney..."
    └── Person: [Bob, arrested at 10:15pm]
         └── Arrest Report: [Charges: unlawful assembly]
    └── Location: [MLK Ave & 5th St]
    └── Vehicle: [Unmarked gray Ford, plate partial: ...]
```

When multiple calls come in about the same incident, volunteers link to the same incident record. You see the full picture across all calls.

<!-- notes: The linking system is what makes Llámenos useful for case management rather than just note-taking. Without linking: you have a pile of disconnected notes from different volunteers about the same event. With linking: every note, arrest report, and follow-up action is attached to the incident. The picture builds automatically as calls come in. Encourage volunteers to search for existing records before creating new ones. -->

---

# Monitoring and Audit Logs

<!-- notes: Keeping visibility into what's happening in your hub. -->

---

## The Audit Log

Every action generates a tamper-evident log entry:

```
Admin dashboard → Audit Log

Sample entries:
  2026-05-01 11:47pm  CALL_ANSWERED   volunteer: pubkey_abc...  call_id: xyz
  2026-05-01 11:48pm  NOTE_CREATED    volunteer: pubkey_abc...  note_id: 456
  2026-05-01 11:52pm  NOTE_EDITED     volunteer: pubkey_abc...  note_id: 456
  2026-05-01 11:59pm  CALL_ENDED      duration: 12m 34s

Filter by: date range, event type, volunteer
Export: CSV
```

The log is **hash-chained** — each entry references the SHA-256 hash of the previous one. If any entry is deleted or modified, the chain breaks.

<!-- notes: The hash chain is your tamper evidence. If law enforcement ever tries to dispute what was in the log, you can prove chain integrity by verifying the hashes. The chain starts at a genesis entry and every subsequent entry references the previous hash. Deleting entries in the middle breaks the chain. The only way to falsify the log is to recompute all subsequent hashes — which requires database access and is detectable by anyone holding an old export. -->

---

## Health Checks

```bash
# Quick health check
curl https://hotline.yourorg.com/health/ready
curl https://hotline.yourorg.com/health/live

# Container status
docker compose ps

# Logs (last 50 lines)
docker compose logs --tail=50 app
docker compose logs --tail=50 sip-bridge
docker compose logs --tail=50 relay

# Optional: full monitoring stack
docker compose --profile monitoring up -d
# → Prometheus + Grafana dashboards
```

**Recommendation**: Set up a free uptime check (UptimeRobot or similar) on your `/health/ready` endpoint. Get an alert before your volunteers do.

<!-- notes: The monitoring profile is optional but recommended for anything beyond a small-scale deployment. The Grafana dashboards show call volume by hour, ring group answer rates, and server metrics. For high-volume hotlines, watch the SIP bridge — it's the most likely point of resource exhaustion under heavy load. The /health/ready endpoint distinguishes "app running" from "app ready to serve traffic" — ready checks the database connection, ready is what you want to monitor. -->

---

# Troubleshooting

<!-- notes: Common issues and what to do about them. Don't panic — most problems are configuration. -->

---

## Common Issues and Fixes

:::columns
:::left
### Calls not connecting
1. `docker compose logs sip-bridge` — look for errors
2. Verify `PBX_TYPE` and credentials in `.env`
3. Check Cloudflare Tunnel is active: `systemctl status cloudflared`
4. Verify SIP DID is pointed at your domain

### Volunteer can't log in
1. Check their device key is authorized (Volunteers → [name] → Device Keys)
2. Verify SAS was completed during onboarding
3. Check if session expired — have them re-authenticate
:::right
### Notes not decrypting (for you)
1. Verify your admin keypair is loaded in the app
2. Check if you were an admin when the note was written
   (notes don't have envelopes for admins added later)
3. `docker compose logs app` for decryption errors

### Signal notifications not delivering
1. `docker compose logs signal-notifier`
2. Check `SIGNAL_NOTIFIER_BEARER_TOKEN` matches in both `.env` and sidecar config
3. `docker compose exec signal-notifier signal-cli -u +1... receive`
:::

<!-- notes: The "notes not decrypting for new admin" is worth a longer explanation: if someone is added as admin after notes were written, those notes don't have an envelope for them. That's by design. The workaround is for the original admin (who can decrypt) or the volunteer (who has the author envelope) to manually re-share the content. There's no automated retroactive re-keying. This is a known limitation of the E2EE design. -->

---

## Getting Help

- **Self-hosting docs**: `llamenos-hotline.com/docs`
- **GitHub Issues**: `github.com/llamenos-hotline/llamenos/issues`
- **Signal group**: Ask during a training session for the group link
- **CLAUDE.md**: In the repo root — full technical reference for deep dives

:::fragment
*Llámenos is pre-production. You are an early deployer. Document issues, file GitHub issues, share your experience. Your real-world deployment makes this better for everyone who comes after you.*
:::

<!-- notes: Encourage admins to file GitHub issues for anything that doesn't work as documented. Even "this was confusing" is useful. The project needs real-world deployment feedback. The more specific the better: "I tried X, expected Y, got Z" with docker compose logs is exactly what we need to fix things. -->
