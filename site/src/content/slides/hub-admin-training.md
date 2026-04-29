---
title: "Llámenos Hub Admin Training"
author: "Llámenos Project"
date: 2026-05-03
event: "Hub Admin Onboarding"
description: "Step-by-step training for hub administrators: setup, volunteers, shifts, E2EE, Signal, case management, and audit logs."
---

# Llámenos Hub Admin Training

Welcome to hub administration.

*This deck covers everything you need to set up and run a Llámenos hub — from initial deployment to ongoing operations.*

<!-- notes: This is a reusable training deck for new hub administrators. It assumes the person has been designated as an admin by an existing admin or during initial setup. Estimated time to walk through: 60-90 minutes, depending on Q&A. -->

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
### Who it's for
- Legal observer networks
- Jail support hotlines
- Mutual aid dispatch lines
- Crisis lines with privacy requirements
- Any org where **the call log is itself sensitive**
:::

<!-- notes: Start here for new admins who may not have seen the full project context. Emphasize: Llámenos is not a general VoIP system. It's specifically designed for the threat model of organizations that face administrative subpoenas, OSINT attacks, and the risk of volunteer identity exposure. -->

---

## Your Role as Hub Admin

As an admin, you can:

- View **all call records** (metadata, not plaintext content — that's E2EE)
- Read **all notes** (you have a key envelope — more on this later)
- Manage **volunteers**: add, remove, change roles
- Configure **shifts** and ring groups
- Manage **ban lists** and spam mitigation
- View **audit logs**: every call answered, every note written
- Configure **hub settings**: SIP trunk, Signal channel, templates

:::fragment
*With this access comes responsibility. Protect your admin keypair and device. Admin compromise means note access.*
:::

<!-- notes: The critical thing to communicate: admin access to notes is by design. Admins have a key envelope for every note — that's how case management works. This means: admin devices must be treated as high-value targets. Use full-disk encryption. Strong PIN/passphrase. Don't log in as admin from shared devices. -->

---

# Setup: Docker Compose

<!-- notes: Section 2: Setting up the hub. Assumes Linux server with Docker installed. -->

---

## Prerequisites

- **Server**: Linux VPS (Ubuntu 22.04+ recommended), 2 CPU / 4GB RAM minimum
- **Domain**: A domain you control (`hotline.yourorg.com`)
- **SIP trunk**: Account with Telnyx, SignalWire, Vonage, or similar
- **Docker**: Docker Engine 24+ and Docker Compose V2
- **Cloudflare account**: For Tunnel ingress (free tier is fine)

```bash
# Verify Docker is installed
docker --version   # Should be 24.x or higher
docker compose version  # Should be 2.x
```

<!-- notes: Recommend Hetzner (EU) or DigitalOcean for hosting. For EU orgs: Hetzner in Germany or Finland. The server needs outbound internet access for Docker pulls and Cloudflare Tunnel. Inbound: only Cloudflare Tunnel connects — no ports need to be open to the internet. -->

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
# HMAC_SECRET=<64 random hex chars — run: openssl rand -hex 32>
# SERVER_NOSTR_SECRET=<64 hex chars — run: openssl rand -hex 32>
# BRIDGE_SECRET=<32 hex chars>
# PBX_TYPE=telnyx   # or signalwire, vonage, asterisk, etc.

# 3. Generate admin keypair
bun run bootstrap-admin
# Saves ADMIN_PUBKEY to .env, prints your admin secret key ONCE

# 4. Start services
docker compose -f deploy/docker/docker-compose.yml up -d
```

<!-- notes: The bootstrap-admin command generates an Ed25519 keypair. The pubkey goes in .env as ADMIN_PUBKEY. The secret key is shown ONCE — write it down, put it in a secure vault (Bitwarden, KeePassXC, a password manager with strong master password). If you lose the admin secret key, you cannot access admin functions. There is no recovery path that doesn't require a new bootstrap. -->

---

## Configure Your SIP Trunk

```bash
# In .env, set your telephony provider:
PBX_TYPE=telnyx          # Options: telnyx, signalwire, vonage,
                         #   plivo, bandwidth, twilio, asterisk, freeswitch

# For Telnyx (CDR-free trunk option):
TELNYX_API_KEY=KEY...
TELNYX_SIP_CREDENTIAL_ID=...
TELNYX_PHONE_NUMBER=+15551234567

# For self-hosted Asterisk:
PBX_TYPE=asterisk
ARI_URL=http://asterisk:8088
ARI_USER=llamenos
ARI_PASSWORD=CHANGEME
```

```bash
# Verify SIP bridge is running
docker compose logs sip-bridge
# Should see: "SIP bridge ready, provider: telnyx"
```

<!-- notes: Telnyx with CDR-free SIP trunking is recommended for orgs with serious privacy requirements. They offer a SIP trunk option where they don't store call detail records. That's the key differentiator from Twilio's Programmable Voice API (which always stores CDRs). For completely air-gapped operations: self-hosted Asterisk with no cloud SIP provider. That requires a PSTN DID from a provider, but the routing happens entirely on your server. -->

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

# Start tunnel (as a service)
cloudflared service install
systemctl start cloudflared
```

<!-- notes: The Cloudflare Tunnel means your server has NO open inbound ports. Everything goes through Cloudflare's network. This is a significant operational security improvement — no port scanning, no DDoS directly to your IP. The IP address of your server is not exposed to clients. For extra protection: use Cloudflare Zero Trust to restrict access to the admin panel by device or identity. -->

---

# Managing Volunteers

<!-- notes: Section 3: Adding and managing volunteers. -->

---

## Adding a Volunteer

```
Admin dashboard → Volunteers → Invite Volunteer

1. Enter volunteer's name (this is admin-only — not shown to other volunteers)
2. Set role: Volunteer (or Observer, Dispatcher, etc. per your template)
3. Click "Generate Invite Link"
4. Send invite link to volunteer via Signal / encrypted channel
   (do NOT send via SMS or email — invite links are single-use but still sensitive)

Volunteer receives link:
  → Creates their device keypair in the app
  → Completes device provisioning (SAS verification with you)
  → Their pubkey is added to your hub sigchain
```

<!-- notes: The invite link is a one-time URL. It expires after 24 hours. The volunteer uses it to set up their device: generate a local keypair, upload their device pubkey to the hub. After that, their private key never leaves their device. YOU (admin) verify the device via SAS — Short Authentication String. -->

---

## Device Provisioning: SAS Verification

When a volunteer completes setup, you'll see a SAS (Short Authentication String):

```
Volunteer's screen:     horse battery staple correct
Your admin screen:      horse battery staple correct
```

- **If they match**: Tap "Authorize Device" — the volunteer's device is added to the sigchain
- **If they differ**: Tap "Reject" — someone is intercepting the provisioning. Investigate before retrying.

:::fragment
*This step prevents a MITM from injecting a rogue device into your hub. Do not skip it.*
:::

<!-- notes: The SAS is derived via ECDH + HKDF between the volunteer's device and the admin's device. If an adversary is intercepting the connection, they'll see different values. The comparison must happen out-of-band — ideally in person or via Signal audio call. Never compare SAS via the same channel the provisioning is happening on. -->

---

## Removing a Volunteer

```
Admin dashboard → Volunteers → [Volunteer Name] → Deactivate

What happens:
  ✓ Volunteer's device key is revoked from sigchain
  ✓ Hub key is rotated (departed volunteer can't receive future events)
  ✓ Future notes: volunteer's key is not included in admin_envelopes
  ✗ Historical notes: volunteer still has their copies (accepted limitation)
```

:::fragment
*After removal: the volunteer cannot take calls, view the dashboard, or receive new notes. They may retain access to historical notes they took themselves — this is a known limitation of E2EE systems.*
:::

<!-- notes: This is the "forward secrecy on departure" limitation. In any E2EE system: you can't un-deliver a key that has already been delivered. What you CAN guarantee: from the moment of revocation, the departed volunteer cannot receive new notes, new hub events, or new calls. Historical notes they authored are accessible to them via their device. Design implication: sensitive incident notes should be considered "accessible to departed volunteers who took them." That's the same as any other note-taking system. -->

---

# Shifts and Ring Groups

<!-- notes: Section 4: Configuring when volunteers are on call. -->

---

## How Shifts Work

```
Shift schedule:
  Monday–Friday: 9am–9pm
    Ring group: Volunteers A, B, C

  Saturday–Sunday: 12pm–8pm
    Ring group: Volunteers B, D

  After-hours fallback:
    Ring group: Volunteers C, D (on-call rotation)
```

- When a call comes in, Llámenos checks the current shift
- All volunteers in the active ring group ring **simultaneously**
- First pickup wins; others hang up
- If no one answers: call goes to voicemail (optional) or fallback group

<!-- notes: The shift schedule is configured by admin. Volunteers see which shifts they're assigned to but cannot modify the schedule. The fallback group is important: if the on-shift group doesn't answer, who picks up? Configure this before going live. Voicemail is encrypted — same envelope pattern as notes. -->

---

## Configuring a Shift

```
Admin dashboard → Shifts → New Shift

Fields:
  Name:          "Weekday Day Shift"
  Days:          Mon, Tue, Wed, Thu, Fri
  Start time:    09:00 (local hub timezone)
  End time:      21:00
  Ring group:    [select volunteers]
  Fallback:      [select fallback group or leave blank]
  Ring timeout:  30 seconds (before going to voicemail/fallback)
```

```
Admin dashboard → Shifts → Ring Groups

A ring group is a named set of volunteers.
You can reuse the same ring group across multiple shifts.
```

<!-- notes: Timezone matters. The hub timezone is set in .env (HUB_TIMEZONE). Make sure all shift times are in the hub's configured timezone. If your volunteers are in multiple timezones, the hub timezone is the reference. Configure it for where the majority of your callers are, or where your operational base is. -->

---

## Spam Mitigation

```
Admin dashboard → Settings → Spam Mitigation

Options:
  □ Ban list: Block specific caller IDs
    → Add numbers, area codes, or prefixes

  □ Rate limiting: Max N calls per hour per caller
    → Default: 3 calls/hour per hashed caller ID

  □ Voice verification: Play a DTMF challenge before routing
    → "Press 3 to reach a counselor" (randomized digit)
    → Blocks automated dialers and SIP scanners

  □ Geographic filtering: Allow only specific country codes
    → Useful for orgs serving a specific region
```

<!-- notes: The voice verification / DTMF challenge is particularly effective against automated SIP scanning and telemarketing robots. Real callers can follow the prompt; automated dialers usually can't. The digit is randomized per-call so you can't pre-program a bot to press "3" every time. The ban list uses HMAC-hashed caller IDs — you add the actual number, it's hashed before storage. -->

---

# Understanding E2EE

## What Admins Can and Can't See

<!-- notes: Section 6: This is the most important conceptual section for admins to internalize. -->

---

## The Note Encryption Flow

```
Volunteer writes note:
  "Caller is a 28yo woman, fled domestic violence,
   needs shelter referral in North Atlanta."

What gets stored in the database:
  encryptedContent: "a3f9bc12d4e8...7f2c" (ciphertext)
  authorEnvelope:   { wrappedKey: "...", ephemeralPubkey: "..." }
  adminEnvelopes:   [
    { pubkey: "YOUR_ADMIN_PUBKEY", wrappedKey: "...", ephemeralPubkey: "..." },
    { pubkey: "OTHER_ADMIN_PUBKEY", wrappedKey: "...", ephemeralPubkey: "..." }
  ]
```

As admin, **your app decrypts the note locally** using your device key.
The server **never** sees the plaintext.

<!-- notes: Walk through this carefully. The volunteer generates a random 256-bit key for that note. They encrypt the note content with XChaCha20-Poly1305. Then they wrap that key using HPKE for: themselves, and for each admin. The server gets the ciphertext and the key envelopes. The server cannot decrypt the note without your private key — and your private key never leaves your device. -->

---

## What You See vs. What the Server Sees

:::columns
:::left
### In Your Admin App

- Full note text (decrypted locally)
- Call duration and timestamp
- Which volunteer took the call
- Case notes and custom fields
- Message history (decrypted)
:::right
### In the Database (raw)

- Encrypted blobs
- Timestamps and duration
- Volunteer device pubkey (not name)
- HMAC-hashed caller phone number
- Audit log entries (event type + hash, no content)
:::

:::fragment
*A server compromise gets the attacker: timestamps, duration, encrypted blobs. Not readable content.*
:::

<!-- notes: The audit log is worth explaining separately. Every event (call answered, note created, note edited) generates an audit log entry. The entry contains: timestamp, event type, actor pubkey, and a hash of the content. It's hash-chained — each entry references the hash of the previous one, making it tamper-evident. Admins can see the full audit log. The log itself doesn't contain decryptable content — just hashes and event types. -->

---

## Protecting Your Admin Keys

:::columns
:::left
### Do
- Use **full-disk encryption** on your admin device
- Set a **strong PIN/passphrase** on the Llámenos app
- **Log out** when not actively using the admin panel
- Keep your device's OS **up to date**
- Use **2FA** on any account that can access the server
:::right
### Don't
- Log in from **shared or public computers**
- Store admin keys in **cloud services** (iCloud, Google Drive)
- Share your admin device with others
- Use the same device for **high-risk activities** (protest attendance)
- Take your admin device to **protests or police interactions**
:::

<!-- notes: The key operational security point: your admin device is a high-value target. If law enforcement has your admin device unlocked, they can read all notes. This is why we recommend: admin function should be on a dedicated device that stays at a secure location. Volunteer function (answering calls) can be on a personal device — but even there, full-disk encryption and strong PIN are baseline requirements. -->

---

# Signal Channel Setup

<!-- notes: Section 7: Connecting the Signal sidecar. -->

---

## What the Signal Channel Provides

- **Inbound messages**: People text your org's Signal number → messages arrive in Llamenos inbox (encrypted)
- **Outbound notifications**: Hub admin can notify registered Signal contacts (schedule updates, alerts)
- **Blast messages**: Bulk notify all registered Signal contacts

```bash
# Enable the Signal sidecar profile
docker compose -f deploy/docker/docker-compose.yml \
  --profile signal up -d

# Check sidecar is running
docker compose logs signal-notifier
# Should see: "Signal notifier ready on port 3100"
```

<!-- notes: The Signal sidecar is a separate process that handles Signal protocol communication. It's isolated from the main app — the main app communicates with it via a bearer token. This means if the sidecar is compromised, it doesn't have access to the main database. It only has access to the HMAC-hashed contact registry and the Signal account credentials. -->

---

## Registering Your Org's Signal Number

```bash
# Configure in .env:
SIGNAL_NOTIFIER_BEARER_TOKEN=<32 random hex chars>
SIGNAL_NUMBER=+15559876543   # Your org's dedicated Signal number

# First-time registration (via signal-cli):
docker compose exec signal-notifier signal-cli \
  -u +15559876543 register

# You'll receive a verification code via SMS to that number
docker compose exec signal-notifier signal-cli \
  -u +15559876543 verify 123-456
```

:::fragment
*Use a dedicated phone number for your org's Signal account — not a personal number.*
:::

<!-- notes: The Signal number should be a number you control specifically for this purpose. A Google Voice number, a Twilio number with SMS forwarding, or a physical SIM in a device at your office. Do NOT use a personal volunteer's number. The Signal account lives on the server, not on anyone's personal device. -->

---

# Case Management

<!-- notes: Section 8: Templates, reports, and custom fields. -->

---

## How Case Management Works

Llámenos case management is entirely **template-driven**:

```
Your hub template defines:
  ├── Entity types (person, incident, location, vehicle...)
  ├── Report types (arrest_report, intake_form, incident_log...)
  ├── Custom fields (badge_number, charges, shelter_needed...)
  ├── Workflow steps (intake → follow-up → closed)
  └── Role-based field visibility
```

```
Admin dashboard → Settings → Templates → Edit Template
```

*Nothing is hardcoded to any specific use case. Configure it for your org.*

<!-- notes: This is worth emphasizing: there is no "jail support template" or "domestic violence template" built into the app. You define what an entity is, what a report contains, what fields exist. The template is a JSON file that you edit via the dashboard. If you're not sure what fields you need, start minimal and add fields as you learn what your volunteers actually need during calls. -->

---

## Creating a Custom Report Type

```
Settings → Templates → Report Types → Add Report Type

Fields:
  Name:             arrest_report
  Display name:     Arrest Report
  Fields:
    - name (text, required)
    - booking_number (text)
    - charges (text, multiline)
    - arresting_agency (text)
    - badge_number (text)
    - location (text)
    - time_of_arrest (datetime)
    - needs_attorney (boolean)
    - attorney_contacted (boolean)
  Mobile optimized: ✓ (simplified view for mobile volunteers)
  Allow case conversion: ✓ (can be escalated to a full case)
```

<!-- notes: The "mobile optimized" flag tells the mobile clients to use a simplified form layout. Full custom fields still appear, but the layout is optimized for one-handed phone use. Useful if volunteers are in the field, not at a desk. -->

---

## Linking Records

Records can be linked to each other:

```
Example: Protest incident response

  Incident: [Protest at MLK Ave, 2026-05-01]
    └── Person: [Alice, arrested]
         └── Arrest Report: [Charges: disorderly conduct]
              └── Note: "Alice confirmed she has an attorney..."
    └── Person: [Bob, arrested]
         └── Arrest Report: [Charges: unlawful assembly]
    └── Location: [MLK Ave & 5th St]
    └── Vehicle: [Unmarked gray Ford, plate: ...]
```

*Link records during the call — link to existing records or create new ones on the fly.*

<!-- notes: The linking system is what makes Llámenos useful for case management rather than just note-taking. When multiple calls come in about the same incident, volunteers can link their notes to the same incident record. Admins can then see the full picture across all calls. -->

---

# Monitoring and Audit Logs

<!-- notes: Section 9: Keeping an eye on what's happening. -->

---

## The Audit Log

Every action in Llámenos generates an audit log entry:

```
Admin dashboard → Audit Log

Sample entries:
  2026-05-01 11:47pm  CALL_ANSWERED   volunteer: pubkey_abc123...  call_id: xyz
  2026-05-01 11:48pm  NOTE_CREATED    volunteer: pubkey_abc123...  note_id: 456
  2026-05-01 11:52pm  NOTE_EDITED     volunteer: pubkey_abc123...  note_id: 456
  2026-05-01 11:59pm  CALL_ENDED      duration: 12m 34s

Filter by: date range, event type, volunteer, call
Export: CSV (for legal review)
```

The log is **hash-chained** — each entry references the SHA-256 hash of the previous entry. Tamper-evident.

<!-- notes: The hash chain means you can detect if log entries have been deleted or modified. The chain is verifiable: start from any entry, verify its hash matches the previous entry's hash, walk back to the genesis entry. The chain can't be falsified without recomputing all subsequent hashes — and the genesis hash is published (or held by a trusted third party). For legal contexts: the chain integrity is evidence that the log hasn't been tampered with. -->

---

## Health and Monitoring

```bash
# Health endpoints
curl https://hotline.yourorg.com/health/ready
curl https://hotline.yourorg.com/health/live

# Docker container status
docker compose ps

# Logs
docker compose logs --tail=50 app
docker compose logs --tail=50 sip-bridge
docker compose logs --tail=50 relay

# Optional: Prometheus + Grafana monitoring
docker compose --profile monitoring up -d
```

*The monitoring profile adds Prometheus scraping and Grafana dashboards for call volume, latency, and error rates.*

<!-- notes: Basic monitoring: set up a simple uptime check via UptimeRobot (free) or similar on your /health/ready endpoint. For more detailed monitoring: the Prometheus profile is ready to go. The Grafana dashboards show call volume by hour, ring group answer rates, and server metrics. For high-volume hotlines, monitor your SIP bridge — it's the most likely point of resource exhaustion under heavy load. -->

---

# Troubleshooting

<!-- notes: Section 10: Common issues and how to fix them. -->

---

## Common Issues

:::columns
:::left
### Calls not connecting
1. Check SIP bridge status: `docker compose logs sip-bridge`
2. Verify `PBX_TYPE` and credentials in `.env`
3. Check Cloudflare Tunnel is active: `systemctl status cloudflared`
4. Verify SIP trunk number is pointed at your domain

### Volunteer can't log in
1. Check their device key is authorized (Volunteers → [name] → Device Keys)
2. Verify SAS was completed during onboarding
3. Check app version — old versions may not be compatible
:::right
### Notes not decrypting
1. Verify admin keypair is loaded in the app
2. Check that the note's `adminEnvelopes` includes your pubkey
3. If admin was added AFTER the note was written, you won't have access
   (re-key is not automatic)

### Signal notifications not delivering
1. `docker compose logs signal-notifier`
2. Check `SIGNAL_NOTIFIER_BEARER_TOKEN` matches in both app and sidecar
3. Verify Signal registration: `docker compose exec signal-notifier signal-cli -u +1... receive`
:::

<!-- notes: The "notes not decrypting" issue with admin access: if an admin pubkey was added to the hub AFTER some notes were written, those old notes don't have an envelope for the new admin. This is by design — you can't retroactively add key access to notes that were already encrypted. Workaround: the original volunteer can re-export their decrypted notes manually for the new admin's review. -->

---

## Getting Help

- **Self-hosting docs**: `llamenos-hotline.com/docs`
- **GitHub Issues**: `github.com/llamenos-hotline/llamenos/issues`
- **Signal group**: Ask Rhonda after a training session
- **CLAUDE.md**: In the repo root — comprehensive technical reference

:::fragment
*Remember: Llámenos is pre-production. You are an early deployer. Document issues and share them. Your real-world experience improves the system for everyone.*
:::

<!-- notes: Encourage admins to file GitHub issues for anything that doesn't work as documented. The project needs real-world deployment feedback. Even "this was confusing to set up" is useful. The threat model document (docs/protocol/PROTOCOL.md) is the technical reference for the cryptographic protocol — if you're debugging crypto issues, start there. -->
