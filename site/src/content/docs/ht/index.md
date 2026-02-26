---
title: Dokimantasyon
description: Aprann kijan pou deplwaye, konfigire, epi itilize Llamenos.
guidesHeading: Gid yo
guides:
  - title: Kijan Pou Kòmanse
    description: Kondisyon prealab, enstalasyon, konfigirasyon telefoni, ak premye deplwaman ou.
    href: /docs/getting-started
  - title: Gid pou Administratè
    description: Jere volontè, ekip travay, lis entèdi, chan pèsonalize, ak paramèt yo.
    href: /docs/admin-guide
  - title: Gid pou Volontè
    description: Konekte, resevwa apèl, ekri nòt, epi itilize transkripsyon.
    href: /docs/volunteer-guide
  - title: Founisè Telefoni yo
    description: Konpare founisè telefoni ki sipòte yo epi chwazi sa ki pi bon pou liy dirèk ou a.
    href: /docs/telephony-providers
  - title: "Setup: Twilio"
    description: Gid etap pa etap pou konfigire Twilio kòm founisè telefoni ou.
    href: /docs/setup-twilio
  - title: "Setup: SignalWire"
    description: Gid etap pa etap pou konfigire SignalWire kòm founisè telefoni ou.
    href: /docs/setup-signalwire
  - title: "Setup: Vonage"
    description: Gid etap pa etap pou konfigire Vonage kòm founisè telefoni ou.
    href: /docs/setup-vonage
  - title: "Setup: Plivo"
    description: Gid etap pa etap pou konfigire Plivo kòm founisè telefoni ou.
    href: /docs/setup-plivo
  - title: "Setup: Asterisk (Ebèje Pa Ou Menm)"
    description: Deplwaye Asterisk ak pon ARI a pou pi gwo nivo konfidansyalite ak kontwòl.
    href: /docs/setup-asterisk
  - title: Apèl nan Navigatè ak WebRTC
    description: Aktive repons apèl nan navigatè pou volontè yo ak WebRTC.
    href: /docs/webrtc-calling
  - title: Modèl Sekirite
    description: Konprann sa ki chifre, sa ki pa chifre, ak modèl menas la.
    href: /security
---

## Apèsi sou achitekti a

Llamenos se yon single-page application (SPA) ki fonksyone ak Cloudflare Workers ak Durable Objects. Pa gen okenn sèvè tradisyonèl pou jere.

| Konpozan | Teknoloji |
|---|---|
| Frontend | Vite + React + TanStack Router |
| Backend | Cloudflare Workers + Durable Objects |
| Telefoni | Twilio, SignalWire, Vonage, Plivo, oswa Asterisk (atravè TelephonyAdapter interface) |
| Otantifikasyon | Nostr keypairs (BIP-340 Schnorr) + WebAuthn |
| Chifraj | ECIES (secp256k1 + XChaCha20-Poly1305) |
| Transkripsyon | Whisper nan kote kliyan (WASM) |
| i18n | i18next (12+ lang) |

## Wòl yo

| Wòl | Ka wè | Ka fè |
|---|---|---|
| **Moun k ap rele** | Anyen (telefòn GSM) | Rele nimewo liy dirèk la |
| **Volontè** | Pwòp nòt pa li sèlman | Reponn apèl, ekri nòt pandan ekip travay |
| **Administratè** | Tout nòt, jounal odit, done apèl | Jere volontè, ekip travay, entèdiksyon, paramèt |
