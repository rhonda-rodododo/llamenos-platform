---
title: Getting Started
description: Deploy your own Llamenos hotline in under an hour.
---

Deploy your own Llamenos hotline in under an hour. This guide covers the **Cloudflare Workers** deployment. If you prefer to self-host on your own infrastructure, see the [Self-Hosting Overview](/docs/self-hosting) for Docker Compose and Kubernetes options.

You'll need a Cloudflare account, at least one communication channel (voice, SMS, WhatsApp, or Signal), and a machine with Bun installed.

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later (runtime and package manager)
- A [Cloudflare](https://www.cloudflare.com) account (free tier works for development)
- At least one communication channel:
  - **Voice**: [Twilio](https://www.twilio.com) is the easiest to start with, but Llamenos also supports [SignalWire](/docs/setup-signalwire), [Vonage](/docs/setup-vonage), [Plivo](/docs/setup-plivo), and [self-hosted Asterisk](/docs/setup-asterisk). See the [Telephony Providers](/docs/telephony-providers) comparison.
  - **SMS**: Included with Twilio, SignalWire, Vonage, or Plivo — see [SMS Setup](/docs/setup-sms).
  - **WhatsApp**: Requires a [Meta Business](https://business.facebook.com) account — see [WhatsApp Setup](/docs/setup-whatsapp).
  - **Signal**: Requires a self-hosted [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge — see [Signal Setup](/docs/setup-signal).
- Git

## 1. Clone and install

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. Bootstrap the admin keypair

Generate a Nostr keypair for the admin account. This produces a secret key (nsec) and public key (npub/hex).

```bash
bun run bootstrap-admin
```

Save the `nsec` securely — this is your admin login credential. You'll need the hex public key for the next step.

## 3. Configure secrets

Create a `.dev.vars` file in the project root for local development. At minimum you need the admin public key. Twilio credentials are optional if you plan to configure channels through the setup wizard instead.

```bash
# .dev.vars
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development

# Voice provider (optional — can be configured via admin UI instead)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp (optional — can be configured via admin UI instead)
# WHATSAPP_ACCESS_TOKEN=your_meta_access_token
# WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
# WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
```

For production, set these as Wrangler secrets:

```bash
bunx wrangler secret put ADMIN_PUBKEY

# If using Twilio as the default voice provider via env vars:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER

# If using WhatsApp via env vars:
bunx wrangler secret put WHATSAPP_ACCESS_TOKEN
bunx wrangler secret put WHATSAPP_VERIFY_TOKEN
bunx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

> **Note**: You can configure all providers and channels through the admin Settings UI or the setup wizard instead of environment variables. Env vars serve as a fallback for voice (Twilio only). For non-Twilio providers, SMS, WhatsApp, and Signal, use the admin UI. See the [setup guide for your provider](/docs/telephony-providers).

## 4. Configure webhooks

Configure your providers to send webhooks to your Worker. The webhook URLs depend on which channels you enable:

**Voice** (all providers):
- **Incoming call**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **Status callback**: `https://your-worker.your-domain.com/telephony/status` (POST)

**SMS** (if enabled):
- **Inbound SMS**: `https://your-worker.your-domain.com/api/messaging/sms/webhook` (POST)

**WhatsApp** (if enabled):
- **Webhook**: `https://your-worker.your-domain.com/api/messaging/whatsapp/webhook` (GET for verification, POST for messages)

**Signal** (if using the bridge):
- Configure the signal-cli bridge to forward to: `https://your-worker.your-domain.com/api/messaging/signal/webhook`

For provider-specific setup: [Twilio](/docs/setup-twilio), [SignalWire](/docs/setup-signalwire), [Vonage](/docs/setup-vonage), [Plivo](/docs/setup-plivo), [Asterisk](/docs/setup-asterisk), [SMS](/docs/setup-sms), [WhatsApp](/docs/setup-whatsapp), [Signal](/docs/setup-signal).

For local development, you'll need a tunnel (like Cloudflare Tunnel or ngrok) to expose your local Worker to your providers.

## 5. Run locally

Start the Worker dev server (backend + frontend):

```bash
# Build frontend assets first
bun run build

# Start the Worker dev server
bun run dev:worker
```

The app will be available at `http://localhost:8787`. Log in with the admin nsec from step 2.

### First-login setup wizard

On your first login as admin, the app will redirect you to the **setup wizard**. This guided flow helps you:

1. **Name your hotline** — set the display name
2. **Choose channels** — enable Voice, SMS, WhatsApp, Signal, and/or Reports
3. **Configure providers** — enter credentials for each enabled channel
4. **Review and finish** — the wizard marks setup as complete

You can re-configure all of these settings later from **Admin Settings**.

## 6. Deploy to Cloudflare

```bash
bun run deploy
```

This builds the frontend and deploys the Worker with Durable Objects to Cloudflare. After deploying, update your telephony provider's webhook URLs to point to the production Worker URL.

## Next steps

- [Admin Guide](/docs/admin-guide) — add volunteers, create shifts, configure channels and settings
- [Volunteer Guide](/docs/volunteer-guide) — share with your volunteers
- [Reporter Guide](/docs/reporter-guide) — set up the reporter role for encrypted report submissions
- [Self-Hosting](/docs/self-hosting) — deploy on your own infrastructure instead of Cloudflare
- [SMS Setup](/docs/setup-sms) — enable SMS messaging
- [WhatsApp Setup](/docs/setup-whatsapp) — connect WhatsApp Business
- [Signal Setup](/docs/setup-signal) — set up the Signal channel
- [Telephony Providers](/docs/telephony-providers) — compare voice providers and switch from Twilio if needed
- [Security Model](/security) — understand the encryption and threat model
