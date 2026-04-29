---
title: Kijan Pou Kòmanse
description: Deplwaye pwòp liy dirèk Llamenos ou nan mwens ke yon èdtan.
---

Deplwaye pwòp liy dirèk Llamenos ou nan mwens ke yon èdtan. W ap bezwen yon kont Cloudflare, yon kont founisè telefoni, ak yon machin ki gen Bun enstale.

## Kondisyon Prealab

- [Bun](https://bun.sh) v1.0 oswa pi resan (runtime ak package manager)
- Yon kont [Cloudflare](https://www.cloudflare.com) (nivo gratis la mache pou devlopman)
- Yon kont founisè telefoni -- [Twilio](https://www.twilio.com) se sa ki pi fasil pou kòmanse, men Llamenos sipòte tou [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), ak [Asterisk ebèje pa ou menm](/docs/deploy/providers/asterisk). Gade konparezon [Founisè Telefoni yo](/docs/deploy/providers) pou ede ou chwazi.
- Git

## 1. Klone epi enstale

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
bun install
```

## 2. Bootstrap admin keypair la

Jenere yon Nostr keypair pou kont administratè a. Sa pwodui yon kle sekrè (nsec) ak yon kle piblik (npub/hex).

```bash
bun run bootstrap-admin
```

Sere `nsec` la nan yon kote ki an sekirite -- sa se idantifyan koneksyon administratè ou. W ap bezwen kle piblik hex la pou pwochen etap la.

## 3. Konfigire sekrè yo

Kreye yon fichye `.dev.vars` nan rasin pwojè a pou devlopman lokal. Egzanp sa a itilize Twilio -- si w ap itilize yon lòt founisè, ou ka sote varyab Twilio yo epi konfigire founisè ou a atravè admin UI a apre premye koneksyon.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Pou pwodiksyon, mete sa yo kòm sekrè Wrangler:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Si w ap itilize Twilio kòm founisè default atravè env vars:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Nòt**: Ou kapab tou konfigire founisè telefoni ou a antiyèman atravè admin Settings UI a olye ke ou itilize varyab anviwònman. Sa obligatwa pou founisè ki pa Twilio. Gade [gid setup pou founisè ou a](/docs/deploy/providers).

## 4. Konfigire webhook telefoni yo

Konfigire founisè telefoni ou a pou voye webhook vwa bay Worker ou a. URL webhook yo menm kèlkeswa founisè a:

- **URL apèl antre**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **URL callback estati**: `https://your-worker.your-domain.com/telephony/status` (POST)

Pou enstriksyon konfigirasyon webhook espesifik pou chak founisè, gade: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), oswa [Asterisk](/docs/deploy/providers/asterisk).

Pou devlopman lokal, w ap bezwen yon tinèl (tankou Cloudflare Tunnel oswa ngrok) pou ekspoze Worker lokal ou a bay founisè telefoni ou a.

## 5. Egzekite lokalman

Demarè sèvè dev Worker la (backend + frontend):

```bash
# Bati resous frontend yo anvan
bun run build

# Demarè sèvè dev Worker la
bun run dev:worker
```

Aplikasyon an ap disponib nan `http://localhost:8787`. Konekte ak nsec administratè a nan etap 2.

## 6. Deplwaye sou Cloudflare

```bash
bun run deploy
```

Sa a bati frontend la epi deplwaye Worker la ak Durable Objects sou Cloudflare. Apre deplwaman, mete ajou URL webhook founisè telefoni ou a pou dirije yo nan URL Worker pwodiksyon an.

## Pwochen Etap yo

- [Gid pou Administratè](/docs/admin-guide) -- ajoute volontè, kreye ekip travay, konfigire paramèt
- [Gid pou Volontè](/docs/volunteer-guide) -- pataje ak volontè ou yo
- [Founisè Telefoni yo](/docs/deploy/providers) -- konpare founisè yo epi chanje soti nan Twilio si sa nesesè
- [Modèl Sekirite](/security) -- konprann chifraj la ak modèl menas la
