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

<!-- notes: This is a 10-slide overview for partner orgs, funders, and org leadership. Not technical — big picture. 15-20 minutes to walk through. -->

---

## The Problem

Your callers face real threats. So do your volunteers.

:::columns
:::left
### The caller risk
- Their phone number in your call records
- Their identity tied to the call log
- Law enforcement subpoena → Google, Twilio, your cloud provider hands it over
:::right
### The volunteer risk
- Their personal phone number in your call logs
- Sequential ring reveals who's on call and when
- Notes in Google Docs or shared drives are a liability
:::

:::fragment
**Administrative subpoenas require no judge. Response time: 24-72 hours. You may not be notified.**
:::

<!-- notes: Lead with the threat. Don't start with features. This audience needs to understand why the current tools are inadequate before they'll care about the solution. -->

---

## Llámenos: The Solution

**Secure, self-hosted hotline infrastructure** built for organizations that face real adversaries.

- **Parallel ring**: All on-shift volunteers ring simultaneously — no sequential volunteer exposure
- **SIP trunking**: You control the call log, not Twilio or Google
- **End-to-end encrypted notes**: Server stores ciphertext. Subpoena gets you encrypted blobs.
- **Zero-knowledge design**: Server cannot read notes or messages, even under compulsion
- **Open source** (AGPL-3.0): No vendor dependency, no black box

<!-- notes: Keep this crisp. One slide, one idea. Llámenos solves the metadata problem (SIP trunking + parallel ring) and the content problem (E2EE notes). That's the pitch. -->

---

## Architecture in One Slide

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
(only volunteer + admins can decrypt)
```

*Self-hosted. EU-compatible. Cloudflare Tunnels for ingress — no exposed public IP.*

<!-- notes: Walk through the architecture linearly. Emphasize: "your server" at every step. The data stays where you put it. If you're EU-based, host in the EU. GDPR compliance is a design goal, not an afterthought. -->

---

## E2EE: What This Actually Means

> *A subpoena of our server would yield: timestamps, durations, and encrypted blobs the server itself cannot read.*

:::columns
:::left
### Encrypted at rest
- Call notes
- Inbound messages (Signal, SMS, WhatsApp)
- Voicemails
- Case management records
:::right
### How it works
- Random key per note (forward secrecy)
- Key wrapped for each authorized reader
- Private keys never leave volunteer devices
- Server is a zero-knowledge relay
:::

:::fragment
*Based on HPKE (RFC 9180) — the same key agreement used in TLS 1.3.*
:::

<!-- notes: Don't go too deep on the crypto here. The key message: the server can't read the notes. That's provable from the design. A jury of cryptographers can verify it. The RFC 9180 reference gives credibility without requiring the audience to understand HPKE. -->

---

## Self-Hosting: You Own Your Data

```bash
docker compose up -d
```

- **What runs**: PostgreSQL, Llámenos app, Nostr relay, SIP bridge, optional Signal sidecar
- **Where**: Any Linux server — Hetzner (EU), DigitalOcean, your own hardware
- **Cost**: ~$15-20/month for a VPS that handles most hotline volumes
- **Ingress**: Cloudflare Tunnels — no public IP needed

:::fragment
*No vendor telemetry. No black-box cloud service between you and your callers. Your data stays where you put it.*
:::

<!-- notes: For funders: the self-hosting cost is minimal. $15-20/month for the server. $1-5/month for a SIP DID (phone number) from Telnyx or SignalWire. The operational overhead is: someone on your team needs to handle server updates and monitoring. That's a reasonable ask for an org that takes security seriously. -->

---

## Open Source — No Black Box

- **License**: AGPL-3.0 — the code is auditable by anyone
- **Reproducible builds**: Verify the binary matches the published source
- **SLSA provenance**: Build process is auditable
- **SBOM**: Know every library in the software

:::fragment
*We want to be audited. The threat model only works if the implementation is verifiable.*
:::

<!-- notes: AGPL means: anyone can read the code, anyone can audit it, and if someone forks it and runs it as a service, they must publish their changes. For activist orgs: you can hire your own cryptographer to review the implementation. You don't have to trust us. -->

---

## Multi-Channel: Meet Your Users Where They Are

:::columns
:::left
### Voice
- PSTN via SIP trunk
- Parallel ring to on-shift volunteers
- Encrypted voicemail
- SFrame voice E2EE (optional)
:::right
### Messaging
- Signal (primary focus)
- SMS / WhatsApp / Telegram
- All channels: same E2EE envelope
- Zero-knowledge Signal sidecar
:::

*One encrypted inbox. Multiple contact channels. One case management system.*

<!-- notes: The multi-channel aspect is important for reach. Not everyone can call. Not everyone has Signal. The org's callers and correspondents should be able to reach them via whatever channel they have. The encryption is consistent across all channels — the same zero-knowledge design applies to Signal messages as to call notes. -->

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
:::right
### Requirements
- A volunteer coordinator who can act as hub admin
- A Linux server (or willingness to self-host)
- A SIP trunk from a provider (or self-hosted PBX)
- Basic operational security practices in your org
:::

:::fragment
*Pre-production. Looking for beta partner organizations.*
:::

<!-- notes: Be honest about the "pre-production" status. This is not "enterprise SaaS ready to go." This is mature open-source software looking for real-world deployment partners. The right partner is an org with: (1) real security needs, (2) some technical capacity, (3) willingness to give feedback and report issues. -->

---

## Get Started

- **Read the docs**: `llamenos-hotline.com/docs`
- **Review the code**: `github.com/llamenos-hotline/llamenos`
- **Talk to us**: Signal group (contact Rhonda)
- **Full talk**: `llamenos-hotline.com/slides/counterspy-2026/` — 90-minute deep dive on architecture and threat model

:::fragment
*If your org has been subpoenaed, we especially want to talk to you.*
:::

<!-- notes: The call to action for overview audiences: read the docs, talk to us if you have real security needs. The "if you've been subpoenaed" line is intentional — their experience is the most valuable input for stress-testing the threat model. -->
