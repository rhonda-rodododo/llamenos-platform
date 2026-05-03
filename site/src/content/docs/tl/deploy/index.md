---
title: Pagsisimula
description: I-deploy ang sarili mong Llamenos hotline sa loob ng isang oras.
---

I-deploy ang sarili mong Llamenos hotline sa loob ng isang oras. Kakailanganin mo ang isang Cloudflare account, isang telephony provider account, at isang machine na may nakainstall na Bun.

## Mga Kinakailangan

- [Bun](https://bun.sh) v1.0 o mas bago (runtime at package manager)
- Isang [Cloudflare](https://www.cloudflare.com) account (gumagana ang free tier para sa development)
- Isang telephony provider account -- ang [Twilio](https://www.twilio.com) ang pinakamadaling simulan, ngunit sinusuportahan din ng Llamenos ang [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), at [self-hosted Asterisk](/docs/deploy/providers/asterisk). Tingnan ang paghahambing ng [Mga Telephony Provider](/docs/deploy/providers) para sa tulong sa pagpili.
- Git

## 1. I-clone at i-install

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
bun install
```

## 2. I-bootstrap ang admin keypair

Bumuo ng Nostr keypair para sa admin account. Gumagawa ito ng secret key (nsec) at public key (npub/hex).

```bash
bun run bootstrap-admin
```

Itago nang ligtas ang `nsec` -- ito ang iyong admin login credential. Kakailanganin mo ang hex public key para sa susunod na hakbang.

## 3. I-configure ang mga secret

Lumikha ng `.dev.vars` file sa project root para sa local development. Ang halimbawang ito ay gumagamit ng Twilio -- kung gumagamit ka ng ibang provider, maaari mong laktawan ang mga Twilio variable at i-configure ang iyong provider sa pamamagitan ng admin UI pagkatapos ng unang pag-login.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Para sa production, itakda ang mga ito bilang Wrangler secret:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Kung gumagamit ng Twilio bilang default provider sa pamamagitan ng env vars:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Tandaan**: Maaari mo ring i-configure ang iyong telephony provider sa pamamagitan ng admin Settings UI sa halip na gumamit ng environment variable. Ito ay kinakailangan para sa mga provider na hindi Twilio. Tingnan ang [gabay sa setup para sa iyong provider](/docs/deploy/providers).

## 4. I-configure ang mga telephony webhook

I-configure ang iyong telephony provider para magpadala ng voice webhook sa iyong Worker. Pareho ang mga webhook URL anuman ang provider:

- **Incoming call URL**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **Status callback URL**: `https://your-worker.your-domain.com/telephony/status` (POST)

Para sa mga tagubilin sa pag-setup ng webhook na tiyak sa provider, tingnan ang: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), o [Asterisk](/docs/deploy/providers/asterisk).

Para sa local development, kakailanganin mo ng tunnel (tulad ng Cloudflare Tunnel o ngrok) para i-expose ang iyong lokal na Worker sa iyong telephony provider.

## 5. I-run nang lokal

Simulan ang Worker dev server (backend + frontend):

```bash
# I-build muna ang mga frontend asset
bun run build

# Simulan ang Worker dev server
bun run dev:worker
```

Makikita ang app sa `http://localhost:8787`. Mag-log in gamit ang admin nsec mula sa hakbang 2.

## 6. I-deploy sa Cloudflare

```bash
bun run deploy
```

Ito ay nagbu-build ng frontend at nagde-deploy ng Worker na may Durable Objects sa Cloudflare. Pagkatapos mag-deploy, i-update ang mga webhook URL ng iyong telephony provider para tumuro sa production Worker URL.

## Mga Susunod na Hakbang

- [Gabay para sa Admin](/docs/admin-guide) -- magdagdag ng mga boluntaryo, lumikha ng mga shift, i-configure ang mga setting
- [Gabay para sa Boluntaryo](/docs/volunteer-guide) -- ibahagi sa iyong mga boluntaryo
- [Mga Telephony Provider](/docs/deploy/providers) -- ihambing ang mga provider at lumipat mula sa Twilio kung kailangan
- [Modelo ng Seguridad](/security) -- unawain ang encryption at threat model
