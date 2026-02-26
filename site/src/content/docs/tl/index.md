---
title: Dokumentasyon
description: Alamin kung paano mag-deploy, mag-configure, at gamitin ang Llamenos.
guidesHeading: Mga Gabay
guides:
  - title: Pagsisimula
    description: Mga kinakailangan, pag-install, pag-setup ng telephony, at iyong unang deployment.
    href: /docs/getting-started
  - title: Gabay para sa Admin
    description: Pamahalaan ang mga boluntaryo, shift, ban list, custom field, at mga setting.
    href: /docs/admin-guide
  - title: Gabay para sa Boluntaryo
    description: Mag-log in, tumanggap ng mga tawag, sumulat ng mga nota, at gamitin ang transcription.
    href: /docs/volunteer-guide
  - title: Mga Telephony Provider
    description: Ihambing ang mga sinusuportahang telephony provider at piliin ang pinakamainam para sa iyong hotline.
    href: /docs/telephony-providers
  - title: "Setup: Twilio"
    description: Hakbang-hakbang na gabay para i-configure ang Twilio bilang iyong telephony provider.
    href: /docs/setup-twilio
  - title: "Setup: SignalWire"
    description: Hakbang-hakbang na gabay para i-configure ang SignalWire bilang iyong telephony provider.
    href: /docs/setup-signalwire
  - title: "Setup: Vonage"
    description: Hakbang-hakbang na gabay para i-configure ang Vonage bilang iyong telephony provider.
    href: /docs/setup-vonage
  - title: "Setup: Plivo"
    description: Hakbang-hakbang na gabay para i-configure ang Plivo bilang iyong telephony provider.
    href: /docs/setup-plivo
  - title: "Setup: Asterisk (Self-Hosted)"
    description: I-deploy ang Asterisk gamit ang ARI bridge para sa pinakamataas na privacy at kontrol.
    href: /docs/setup-asterisk
  - title: WebRTC Browser Calling
    description: I-enable ang pagsagot ng tawag sa browser para sa mga boluntaryo gamit ang WebRTC.
    href: /docs/webrtc-calling
  - title: Modelo ng Seguridad
    description: Unawain kung ano ang naka-encrypt, kung ano ang hindi, at ang threat model.
    href: /security
---

## Pangkalahatang-tanaw ng arkitektura

Ang Llamenos ay isang single-page application (SPA) na sinusuportahan ng Cloudflare Workers at Durable Objects. Walang tradisyonal na mga server na kailangang pamahalaan.

| Bahagi | Teknolohiya |
|---|---|
| Frontend | Vite + React + TanStack Router |
| Backend | Cloudflare Workers + Durable Objects |
| Telephony | Twilio, SignalWire, Vonage, Plivo, o Asterisk (sa pamamagitan ng TelephonyAdapter interface) |
| Auth | Nostr keypairs (BIP-340 Schnorr) + WebAuthn |
| Encryption | ECIES (secp256k1 + XChaCha20-Poly1305) |
| Transcription | Client-side Whisper (WASM) |
| i18n | i18next (12+ na wika) |

## Mga Tungkulin

| Tungkulin | Makikita | Magagawa |
|---|---|---|
| **Tumatawag** | Wala (GSM phone) | Tumawag sa numero ng hotline |
| **Boluntaryo** | Sariling mga nota lamang | Sagutin ang mga tawag, sumulat ng mga nota sa panahon ng shift |
| **Admin** | Lahat ng nota, audit log, datos ng tawag | Pamahalaan ang mga boluntaryo, shift, ban, mga setting |
