---
title: Rutz'ib'axik
description: Taweta'maj jawi' tik'otob', tawokisaj, ch'ab'ej ri Llamenos.
guidesHeading: Ruk'amonik
guides:
  - title: Tik'otob'
    description: K'atz'ina taq jastaq, nik'oj, runik'oj wokisaxik, ronojel ri nab'ej tik'otob'.
    href: /docs/getting-started
  - title: Ruchakul ri Runik'oj
    description: Ruk'utunsaxik ri uchakul ri runik'oj — repositorios, uxojik ri tzij, etz'apwach taq ruxak, chuqa' ch'awib'al pa ri q'otij ri'.
    href: /docs/architecture
  - title: Ruk'utunsaxik Tikojo Tik'otob'
    description: Tikojo pa ranik'oj Docker Compose o pa Kubernetes.
    href: /docs/self-hosting
  - title: "Tik'otob': Docker Compose"
    description: Tik'otob' pa jun servidor chik rij chib'anik ruk'ayb'al HTTPS rub'anikil chik.
    href: /docs/deploy-docker
  - title: "Tik'otob': Kubernetes (Helm)"
    description: Tik'otob' pa Kubernetes ruk' ri rub'anikil Helm wuj.
    href: /docs/deploy-kubernetes
  - title: Ruk'amonik K'amalb'e
    description: Tak'axaj ajpatanib', ch'akul taq ri', b'eyab', q'atej taq ruxak, q'axeb'al taq tzij, chuqa' runik'oj.
    href: /docs/admin-guide
  - title: Ruk'amonik Ajpatan
    description: Tak'ij, tak'ul siponik, tatak b'aq tzijob'al, tatz'ib'aj taq ch'ab'äl, ch'ab'ej ri tzijtz'ib'axik.
    href: /docs/volunteer-guide
  - title: Ruk'amonik Ajal Q'axeb'al Tzij
    description: Takom b'anik q'axeb'al tzij etz'apwach chuqa' tak'utj ri rajal.
    href: /docs/reporter-guide
  - title: Ruk'amonik Chapb'äl
    description: Tikojo chuqa' tawokisaj ri Llamenos chapb'äl pa iOS chuqa' Android.
    href: /docs/mobile-guide
  - title: K'utunela' Telefonía
    description: Tatz'eqelaj ri k'utunela' telefonía chikichik chuqa' tacha' ri utz pa awokisaxik.
    href: /docs/telephony-providers
  - title: "Nik'oj: SMS"
    description: Tijaq ri tzijob'exik SMS pa ruwi' ruk' k'utunel ri telefonía.
    href: /docs/setup-sms
  - title: "Nik'oj: WhatsApp"
    description: Tak'ay ri' ri WhatsApp Business ruk' ri Meta Cloud API.
    href: /docs/setup-whatsapp
  - title: "Nik'oj: Signal"
    description: Tawokisaj ri b'eyal Signal ruk' ri signal-cli puerta.
    href: /docs/setup-signal
  - title: "Nik'oj: Twilio"
    description: Ruk'amonik chijib'al chike ri wokisaxik Twilio je' ri k'utunel ri telefonía.
    href: /docs/setup-twilio
  - title: "Nik'oj: SignalWire"
    description: Ruk'amonik chijib'al chike ri wokisaxik SignalWire je' ri k'utunel ri telefonía.
    href: /docs/setup-signalwire
  - title: "Nik'oj: Vonage"
    description: Ruk'amonik chijib'al chike ri wokisaxik Vonage je' ri k'utunel ri telefonía.
    href: /docs/setup-vonage
  - title: "Nik'oj: Plivo"
    description: Ruk'amonik chijib'al chike ri wokisaxik Plivo je' ri k'utunel ri telefonía.
    href: /docs/setup-plivo
  - title: "Nik'oj: Asterisk (Tikojo Tik'otob')"
    description: Tikojo Asterisk ruk' ri puerta ARI chike ri nim raqän chajinik chuqa' k'ojik.
    href: /docs/setup-asterisk
  - title: WebRTC Oyonik pa Navegador
    description: Tijaq ri oyonik pa ri nuk'samaj chib'äl chike ri ajpatanib' ruk' WebRTC.
    href: /docs/webrtc-calling
  - title: Ruchojmil taq Jastaq
    description: Tatoj ri ajk'ay taq jastaq ri e k'ayew chike ri tik'otob', desktop, chapb'äl, telefonía, chuqa' etz'apwach.
    href: /docs/troubleshooting
  - title: Ruchajinik ri K'amb'ej
    description: Ch'obo' jas ri etz'apwach, jas ri man etz'apwach ta, chuqa' ri uchajinik ruch'ijik.
    href: /security
---

## Ruk'utunsaxik ri uchakul ri runik'oj

Ri Llamenos jun runik'oj ichinan jun wuj (SPA) ri tikowin tik'otob' pa **Cloudflare Workers** o pa ranik'oj ruk' **Docker Compose / Kubernetes**. Kuk'ay ri uxojik siponik, SMS, WhatsApp, chuqa' Signal — konojel e ko' k'ayew chike ri ajpatanib' ruk' jun k'utb'al chik.

| Componente | Cloudflare | Tikojo Tik'otob' |
|---|---|---|
| Nuk'samaj chib'äl | Vite + React + TanStack Router | Junam |
| Ajk'ayb'al | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Yakb'al taq wuj | R2 | RustFS (S3-compatible) |
| Ch'ab'äl | Twilio, SignalWire, Vonage, Plivo, o Asterisk | Junam |
| Tzijob'exik | SMS, WhatsApp Business, Signal | Junam |
| Ri ch'ob'onik | WebSocket keypairs (BIP-340 Schnorr) + WebAuthn | Junam |
| Etz'apwach | ECIES (secp256k1 + XChaCha20-Poly1305) | Junam |
| Tzijtz'ib'axik | Pa rokiyonel nuk'samaj chib'äl Whisper (WASM) | Pa rokiyonel nuk'samaj chib'äl Whisper (WASM) |
| i18n | i18next (13 ch'ab'äl) | Junam |

## Taq Patanijel

| Patanijel | Rikowin ruk'utik | Rikowin rub'anik |
|---|---|---|
| **Ajoyon** | Maj (teléfono/SMS/WhatsApp/Signal) | Tisipon pe o tak' b'aq tzijob'al pa ri ruch'awib'al |
| **Ajpatan** | Ruk' ri tz'ib'axik, taq ch'awib'al e ya'on | Tak'ul siponik, tatz'ib'aj taq ch'ab'äl, tatak b'aq tzijob'al |
| **Ajal Q'axeb'al Tzij** | Ruk' ri q'axeb'al tzij xwi | Takom b'anik q'axeb'al tzij etz'apwach ruk' taq wuj |
| **K'amalb'e** | Konojel taq tz'ib'axik, q'axeb'al taq tzij, ch'awib'al, etal raqan | Tak'axaj ajpatanib', ch'akul taq ri', b'eyab', q'atej taq ruxak, runik'oj |
