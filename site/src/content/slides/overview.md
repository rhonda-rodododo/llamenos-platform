---
title: "Llámenos — Secure Hotline Infrastructure"
author: "Llámenos Project"
date: 2026-05-03
event: "Overview"
description: "Executive summary: what Llámenos is, why it exists, and what it protects."
---

# Llámenos
## Secure Hotline Infrastructure for At-Risk Communities

*For organizations where the call log is evidence.*

<!-- notes: This is a 10-15 slide overview for partner orgs, funders, and org leadership. Not technical — big picture. 15-20 minutes. The frame: start with the human problem before you get to the solution. People need to feel the gap before they'll care about what fills it. -->

---

## This Is Why We Built It

> *It was a Tuesday morning when the organizer got the call from the detective. He knew exactly how many crisis calls she'd answered. He knew the times, the durations. He knew she was the one who picked up most often at 2am.*
>
> *The hotline had been running on Google Voice. The detective had served an administrative subpoena on Google three days earlier. Google complied within 48 hours. No one told her.*

:::fragment
**No warrant. No notice. 48 hours.**
:::

<!-- notes: Lead with the story. Not with a feature matrix. The people in this room — funders, org leaders, partner orgs — need to understand what problem this solves before they'll care how it solves it. The problem is: the tools everyone is using expose the people you're trying to protect. -->

---

## The Gap Between "Secure" and Actually Secure

Most crisis hotlines use tools designed for different threat models:

| Tool | Built for | Problem |
|------|-----------|---------|
| Google Voice | Business customer support | Call logs handed over on administrative subpoena |
| Twilio | Developer APIs | Every call detail stored in a subpoenable dashboard |
| Google Docs | Team collaboration | Plaintext notes accessible to Google and any court |
| Signal groups | Personal communication | Not a call routing system; no case management |

:::fragment
*Your callers and volunteers face law enforcement subpoenas, right-wing OSINT campaigns, and private investigators. These tools weren't built with those adversaries in mind.*
:::

<!-- notes: Be specific about the gap. It's not that these are bad tools. It's that they're the wrong tools for this threat model. Google Voice is great for a plumber's answering service. It's not appropriate for a jail support hotline. The threat model matters. -->

---

## What Llámenos Does Differently

**The server stores data it cannot read.**

- **End-to-end encrypted notes**: Volunteer writes notes → notes encrypted on device → server stores ciphertext → subpoena gets ciphertext
- **Caller identity hashing**: Phone numbers hashed on arrival, never stored in plaintext
- **SIP trunking**: You control what call metadata is logged — including: nothing
- **Parallel ring**: All on-shift volunteers ring simultaneously, no sequential volunteer roster revealed
- **Self-hosted**: Your data stays where you put it — your server, your jurisdiction

:::fragment
*This is not a marketing claim. It's the architecture. A detective with a court order gets: timestamps, durations, and encrypted blobs the server itself cannot read.*
:::

<!-- notes: Don't soften this. The zero-knowledge design is the core feature. Everything else is built on top of it. The server cannot read the notes — not "won't read the notes," not "promises not to read the notes" — cannot. Because the decryption keys never reach the server. -->

---

## The Architecture in One Slide

```
Caller dials your number
        │
        ▼
SIP trunk (you control what's logged)
        │
        ▼
Your server — Llámenos + SIP bridge
        │
        ▼
Parallel ring → all on-shift volunteers simultaneously
        │
        ▼
First pickup → encrypted call session
        │
        ▼
Volunteer writes encrypted notes
(only volunteer + admins can decrypt — server cannot)
```

*Self-hosted. EU-compatible. No public IP exposed.*

<!-- notes: Walk through this linearly. Emphasize "your server" at every step. The data stays where you put it. If you're EU-based, host in the EU. GDPR compliance is a design goal. The Cloudflare Tunnel provides ingress without exposing your server's IP address. -->

---

## What Happens at Each Subpoena Target

| Adversary subpoenas | What they get |
|---------------------|---------------|
| Your hosting provider | Encrypted blobs, call timestamps, hashed phone numbers |
| Your telephony provider (with CDR-free SIP) | Call routing records only — no volunteer phone numbers |
| Your telephony provider (standard Twilio) | Full call detail records with phone numbers |
| Your server hardware | Same as hosting provider — encrypted blobs |

| What they cannot get | Why |
|----------------------|-----|
| Note content | E2EE — server stores only ciphertext |
| Caller identity | Phone numbers HMAC-hashed, irreversible without your secret |
| Volunteer identities | Pubkeys only, not names or phone numbers |
| Transcription text | Audio never leaves the volunteer's browser |

<!-- notes: The "transcription text" row is worth highlighting. Audio is transcribed locally in the volunteer's browser using a WASM model. No audio ever reaches a transcription API or the server. A subpoena of any third party can't get transcription data because it was never there. -->

---

## End-to-End Encrypted: What This Actually Means

> *A subpoena of our server yields: timestamps, durations, and encrypted blobs the server itself cannot read.*

:::columns
:::left
### Encrypted at rest (E2EE)
- Call notes
- Inbound messages (Signal, SMS, WhatsApp)
- Voicemails
- Case management records
- File attachments
:::right
### How encryption works
- Random key per note (forward secrecy)
- Key wrapped for volunteer + each admin
- Private keys never leave volunteer devices
- Server is a zero-knowledge relay
:::

:::fragment
*Based on HPKE (RFC 9180) — an IETF standard with a formal security proof. The same key agreement used in TLS 1.3.*
:::

<!-- notes: Don't go deep on the crypto for this audience. The key message: the server can't read the notes. That's provable from the design. AGPL-3.0 license means anyone can audit the code. If you want to hire a cryptographer to verify it — that's encouraged. -->

---

## Self-Hosting: You Own Your Data

```bash
docker compose up -d
```

- **What runs**: PostgreSQL, Llámenos app, Nostr relay, SIP bridge, optional Signal sidecar
- **Where**: Any Linux server — Hetzner (EU), DigitalOcean, your own hardware
- **Cost**: ~$15-20/month for most hotline volumes
- **Jurisdiction**: Host in the EU for GDPR compliance; host where you trust the legal system

:::fragment
*No vendor telemetry. No black-box cloud service between you and your callers. Your data stays where you put it.*
:::

<!-- notes: For funders: the infrastructure cost is genuinely minimal. $15-20/month for the server. $1-5/month for a phone number from a SIP provider. The operational overhead is: someone on your team needs to handle server updates and monitoring — ideally someone who's comfortable on the command line. That's a reasonable ask for an org that takes security seriously. -->

---

## Multi-Channel: Meet People Where They Are

:::columns
:::left
### Voice
- PSTN via SIP trunk
- Parallel ring to on-shift volunteers
- Encrypted voicemail
- Browser-to-browser: no personal phone numbers exposed
:::right
### Messaging
- **Signal** (primary — best for field reporters, jail support families)
- SMS / WhatsApp / Telegram
- All channels: same E2EE envelope design
- Blast messages to Signal contacts for updates
:::

*One encrypted inbox. Multiple contact channels. One case management system.*

<!-- notes: The multi-channel aspect matters for reach. Not everyone can call a phone number. Not everyone has Signal. Jail support families might only have SMS. Rapid responders in the field have Signal. Legal observers filing reports might prefer to type. The org shouldn't have to make people use a specific channel — meet them where they already are, and route everything into the same encrypted system. -->

---

## Template-Driven: Built for Your Org's Actual Workflow

Nothing in Llámenos is hardcoded to any specific use case.

| Your org type | What you configure |
|--------------|-------------------|
| Legal observer network | Entity types: person, incident, officer; report: arrest_report |
| Jail support | Report: booking form, attorney contact, arraignment; blast to Signal contacts |
| Domestic violence crisis line | Custom fields: safety plan, shelter referral; strict volunteer visibility rules |
| Immigration legal line | Multi-language support; attorney matching; intake form |
| Rapid response | Incident types: protest, police contact, medical; mobile-optimized forms |
| Mutual aid dispatch | Resource tracking; volunteer availability; geographic routing |

*Same codebase. Different template. No code changes.*

<!-- notes: This is intentional design. We didn't build a "jail support app." We built secure hotline infrastructure that you configure for your use case. If your org's needs change, you change the template. If another org wants to use Llámenos for a completely different type of crisis line, they write their own template. The platform is neutral about what kind of work you're doing. -->

---

## Open Source — Because Trust Requires Auditability

- **License**: AGPL-3.0 — the code is publicly auditable
- **Reproducible builds**: Verify the running binary matches the published source
- **SLSA provenance**: Build process is signed and auditable
- **SBOM**: Know every library in the software

:::fragment
*We want to be audited. The threat model only works if the implementation is verifiable. "Trust us" is not a security model.*
:::

<!-- notes: For funders and partner orgs: the open source + reproducible builds combination means you don't have to take our word for anything. You can hire a cryptographer or security firm to audit the code. You can verify that what's running on your server is the same code that's on GitHub. This is the right model for security-critical software. Black-box security tools for activist organizations are a liability. -->

---

## Who Is It For?

:::columns
:::left
### Good fit
- Legal observer networks
- Jail support hotlines
- Mutual aid dispatch lines
- Immigration legal lines
- Domestic violence crisis lines
- Rapid response coalitions
- Any org where the call log itself is sensitive
:::right
### What you need to run it
- A volunteer coordinator who can act as hub admin
- A Linux server (or someone to help you get one)
- A SIP trunk from a provider (or willingness to learn)
- Basic operational security practices in your org
- Willingness to give feedback — we're pre-production
:::

<!-- notes: Be honest about the "pre-production" status. This is mature open-source software looking for real-world deployment partners, not SaaS you can sign up for. The right partner org: has real security needs, has some technical capacity or a technical friend, and is willing to file issues when things don't work as documented. Their real-world experience is what makes this better for everyone who comes after them. -->

---

## What Would It Mean for Your Org?

Think about:
- The last time you worried about who could see your call records
- The volunteers who answer late-night calls on their personal phones
- The notes your volunteers write — where they live right now
- The callers who trust you with their situation at their most vulnerable

:::fragment
*Llámenos doesn't solve every problem. It solves the specific problem of: "what happens when law enforcement serves a subpoena on our infrastructure." The notes stay unreadable. The volunteer identities stay protected. The caller histories stay hashed.*
:::

<!-- notes: End with the human stakes. Not the feature list. This infrastructure is for organizations that protect people. The people who call a jail support line at 2am. The organizer who's worried her call records will be used to map her network. The volunteer whose personal phone number is currently in a Twilio CDR that could be subpoenaed. Llámenos makes those threats harder to execute on. That's worth something. -->

---

## Get Started

- **Read the docs**: `llamenos-hotline.com/docs`
- **Review the code**: `github.com/llamenos-hotline/llamenos`
- **Full technical talk**: `llamenos-hotline.com/slides/counterspy-2026/` — 90-minute deep dive
- **Talk to us**: Signal group (contact Rhonda)

:::fragment
*If your org has been subpoenaed, we especially want to talk to you. Your experience stress-tests our threat model in ways no theoretical analysis can.*
:::

<!-- notes: The call to action for overview audiences: read the docs, review the code if you can, come to the CounterSpy talk for the full technical picture. The "if you've been subpoenaed" line is genuine — real incident experience is the most valuable input for verifying that the threat model is correct and the protections are meaningful. -->
