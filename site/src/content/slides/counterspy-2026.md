---
title: "More Secure Hubs for Your Spokes"
author: "Rhonda"
date: 2026-05-03
event: "CounterSpy 2026"
description: "How Llámenos protects caller and volunteer identity against well-funded adversaries — architecture deep-dive."
---

# Llámenos
## More Secure Hubs for Your Spokes

CounterSpy 2026 — Atlanta

<!-- notes: Welcome everyone. I'm Rhonda. Before we start — phones on airplane mode if you're worried about RF surveillance. This talk assumes a threat model that includes law enforcement, right-wing groups, and private investigators. -->

---

## Who This Is For

- **Hotline operators** who have reason to fear their callers' identities being exposed
- **Legal observer networks** documenting state violence
- **Mutual aid dispatchers** coordinating direct action support
- Anyone running a call center where **the call log is itself evidence**

:::fragment
*If Google Voice is in your threat model, stay with me.*
:::

<!-- notes: Ask audience: how many are running a crisis line today? How many on Google Voice? -->

---

## The Threat Model

:::columns
:::left
### What We're Defending Against

- Law enforcement with subpoenas
- Right-wing groups with OSINT skills
- Private investigators with carrier access
- Insider threats (rogue volunteers)
:::right
### What We're NOT Defending Against

- Compromised device (out of scope)
- Coercion of admin with physical access
- Nation-state 0-days on the server
:::

<!-- notes: Be honest about scope. We're not trying to be Signal here. We're trying to be better than the Google Voice default. -->

---

## Why Existing Tools Fail

> "We used Google Voice because it was free and easy. Then a detective called our volunteer directly."

- Google Voice exposes call records to Google **and** to law enforcement
- Twilio direct API leaves SID/metadata in plain text in their dashboard
- Most SIP providers store CDRs (call detail records) unencrypted

:::fragment
**Every hop is a potential subpoena target.**
:::

<!-- notes: Real incident from a legal observer network. Not naming names. The detective had a Google administrative subpoena — took 48 hours and no judicial review. -->

---

## The Architecture

:::background(/images/slides/llamenos-architecture.png)
## Llámenos Architecture

SIP trunk → parallel ring → E2EE notes → audit log
:::

---

## Key Innovations

```
┌─────────────────────────────────────────────┐
│  CALLER  →  SIP Trunk  →  Llámenos         │
│              (no CDR)      ↓                │
│                       Ring Group            │
│                       (parallel)            │
│                            ↓                │
│                      Volunteer App          │
│                       (E2EE notes)          │
└─────────────────────────────────────────────┘
```

- **SIP trunking**: Calls leave PSTN via SIP — no Twilio call logs
- **E2EE notes**: Per-note HPKE encryption, server sees only ciphertext
- **Parallel ringing**: No sequential-ring trail showing who was called when

---

## E2EE Notes: How It Works

1. Volunteer answers call
2. App generates **random note key** (256-bit)
3. Key is **HPKE-wrapped** for each authorized reader (volunteer + admins)
4. Server stores only: `ciphertext || wrapped_keys[]`
5. Server **cannot** read the note — not even under subpoena

:::fragment
*The subpoena gets you: "yes, a call happened, here's ciphertext."*
:::

<!-- notes: HPKE = Hybrid Public Key Encryption, RFC 9180. Uses X25519-HKDF-SHA256-AES256-GCM. Same crypto as Signal protocol's sealed sender. -->

---

## SIP Trunking vs Direct API

:::columns
:::left
### Direct Twilio API

- CDRs stored in Twilio dashboard
- Twilio has caller ID, duration, timestamp
- Subpoena → Twilio → everything
- Easy to set up, **dangerous for us**
:::right
### SIP Trunk (Llámenos)

- We control the SIP provider (or use Telnyx/SignalWire)
- CDR policy configurable or disabled
- No third-party dashboard with your call logs
- More complex, **much better for threat model**
:::

---

## Self-Hosting: The Full Stack

```bash
# What you run
docker compose up -d

# What you get
- PostgreSQL (call records, encrypted notes)
- Llámenos app (Bun + Hono)
- Nostr relay (strfry) — real-time events
- SIP bridge (Asterisk/FreeSWITCH)
```

- **EU-hosted** option for GDPR compliance
- **Cloudflare Tunnels** for ingress (no public IP exposed)
- **No vendor telemetry** — your data stays yours

<!-- notes: Show the docker-compose on the next slide if you want the deep dive. -->

---

## Audit Logging Without Exposure

- Every call answered → audit log entry
- Every note written → audit log entry
- Log is **hash-chained** (tamper detection)
- Admins see the log; volunteers **cannot**
- But the log itself contains **no PII** — just event hashes

:::fragment
*You can prove a call happened without proving who made it.*
:::

---

## What We Still Can't Protect

- **Carrier metadata**: Your SIP trunk provider still knows traffic patterns
- **Timing correlation**: A sophisticated adversary can correlate call timing
- **Volunteer device compromise**: Once the device is owned, notes are decryptable
- **Admin coercion**: If admin is compromised, they can re-wrap note keys

*Know your threat model. This is a significant improvement over Google Voice, not a perfect solution.*

<!-- notes: Honesty matters here. I'm not selling you security snake oil. Llámenos is designed for the realistic threat model of a US-based activist org facing administrative subpoenas and OSINT-level adversaries. -->

---

## Get Involved

- **Code**: `github.com/llamenos-hotline/llamenos` (AGPL-3.0)
- **Signal group**: Ask me after the talk
- **Self-hosting docs**: `llamenos-hotline.com/docs`
- **This presentation**: `llamenos-hotline.com/slides/counterspy-2026/`

:::fragment
*We especially need people who have survived subpoenas and can review threat model assumptions.*
:::

<!-- notes: The project is pre-production. No production users yet. Looking for beta hotlines willing to run the system. EU-based partners especially welcome. -->

---

# Questions?

Rhonda / CounterSpy 2026

*Slides: llamenos-hotline.com/slides/counterspy-2026/*

<!-- notes: Leave time for questions. Be ready to discuss: key rotation on volunteer departure, GDPR compliance specifics, cost of self-hosting, migration path from Google Voice. -->
