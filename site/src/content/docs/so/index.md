---
title: Dukumeentiyada
description: Bar sida loo daajiyo, loo habeeyo, oo loo isticmaalo Llamenos.
guidesHeading: Hageedyo
guides:
  - title: Bilowga
    description: Shuruudaha hore, ku-rakibidda, xawaaraha habaynta, iyo daajintaada ugu horreysa.
    href: /docs/getting-started
  - title: Qaab-dhismeedka
    description: Soo-koobid qaab-dhismeedka nidaamka — kaydysyada, qulqulka xogta, heerarka encrypt-ka, iyo isgaarsiinta waqti-dhabta ah.
    href: /docs/architecture
  - title: Soo-koobid Iskaashi-hoosaadka
    description: Ku daaji infrastrukturadaada Docker Compose ama Kubernetes.
    href: /docs/self-hosting
  - title: "Daajinta: Docker Compose"
    description: Daajinta iskaashi-hoosaadka server-kaliya iyadoo HTTPS si otomaatig ah u shaqeysa.
    href: /docs/deploy-docker
  - title: "Daajinta: Kubernetes (Helm)"
    description: Ku daaji Kubernetes iyadoo chart-ka Helm ee rasmiga ah.
    href: /docs/deploy-kubernetes
  - title: Hageedka Maamulka
    description: Maamul ku-simaha, shift-yada, kanaallada, liisaska mamnuuca, warbixinnada, iyo goobaha.
    href: /docs/admin-guide
  - title: Hageedka Ku-simaha
    description: Soo gal, qabso wicitaannada, jawaab farriinnada, qor qoraallo, oo isticmaal transcription.
    href: /docs/volunteer-guide
  - title: Hageedka Wariyaha
    description: Gudbi warbixin encrypt ah oo raadiso heerarka.
    href: /docs/reporter-guide
  - title: Hageedka Mobile-ka
    description: Ku rakib oo ku habee app-ka Llamenos ee iOS iyo Android.
    href: /docs/mobile-guide
  - title: Bixiyayaasha Telephony-ga
    description: Isbarbardhig bixiyayaasha telephony-ga ee la taageero oo dooran kan ugu habboon ee xotiyahaaga.
    href: /docs/telephony-providers
  - title: "Habaynta: SMS"
    description: Dajin fariimaha SMS ee soo-galka/soo-baxka adigoo isticmaalaya bixiyahaaga telephony-ga.
    href: /docs/setup-sms
  - title: "Habaynta: WhatsApp"
    description: Ku xidh WhatsApp Business iyadoo loo marayo Meta Cloud API.
    href: /docs/setup-whatsapp
  - title: "Habaynta: Signal"
    description: Ku habee kanaalka Signal iyadoo loo marayo signal-cli bridge.
    href: /docs/setup-signal
  - title: "Habaynta: Twilio"
    description: Tallaabo-tallaabo oo lagu habeeyo Twilio inay noqoto bixiyahaaga telephony-ga.
    href: /docs/setup-twilio
  - title: "Habaynta: SignalWire"
    description: Tallaabo-tallaabo oo lagu habeeyo SignalWire inay noqoto bixiyahaaga telephony-ga.
    href: /docs/setup-signalwire
  - title: "Habaynta: Vonage"
    description: Tallaabo-tallaabo oo lagu habeeyo Vonage inay noqoto bixiyahaaga telephony-ga.
    href: /docs/setup-vonage
  - title: "Habaynta: Plivo"
    description: Tallaabo-tallaabo oo lagu habeeyo Plivo inay noqoto bixiyahaaga telephony-ga.
    href: /docs/setup-plivo
  - title: "Habaynta: Asterisk (Iskaashi-hoosaadka)"
    description: Ku daaji Asterisk iyadoo ARI bridge si loo helo ilaalinta ugu sarreysa iyo maareynta.
    href: /docs/setup-asterisk
  - title: Wicitaanka WebRTC Browser-ka
    description: Dajin in ku-simaha uu ku jawaabo wicitaannada browser-ka iyadoo loo isticmaalayo WebRTC.
    href: /docs/webrtc-calling
  - title: Xalinta Dhibaatooyinka
    description: Xalalka arrimaha caadiga ah ee la xiriira daajinta, desktop-ka, mobile-ka, telephony-ga, iyo crypto-ga.
    href: /docs/troubleshooting
  - title: Qaab-dhismeedka Amniga
    description: Fahma waxa encrypt loo sameeyo, waxa aan la encrypt-lahayn, iyo qaab-dhismeedka khatar-ga.
    href: /security
---

## Soo-koobid qaab-dhismeedka

Llamenos waa single-page application (SPA) oo ku shaqan karta **Cloudflare Workers** ama infrastrukturadaadaaga iyadoo loo marayo **Docker Compose / Kubernetes**. Waxay taageertaa wicitaannada codka, SMS, WhatsApp, iyo Signal — oo dhan loo wada xiriira ku-simaha shift-ka iyadoo loo marayo interface isku mid ah.

| Qayb | Cloudflare | Iskaashi-hoosaad |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Isku mid |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Blob Storage | R2 | RustFS (S3-compatible) |
| Codka | Twilio, SignalWire, Vonage, Plivo, ama Asterisk | Isku mid |
| Farriimaha | SMS, WhatsApp Business, Signal | Isku mid |
| Auth | WebSocket keypairs (BIP-340 Schnorr) + WebAuthn | Isku mid |
| Encryption | ECIES (secp256k1 + XChaCha20-Poly1305) | Isku mid |
| Transcription | Client-side Whisper (WASM) | Client-side Whisper (WASM) |
| i18n | i18next (13 luuqadood) | Isku mid |

## Doorarka

| Door | Arki karaa | Sameyn karaa |
|---|---|---|
| **Wicitaanka** | Waxba (telefoonka/SMS/WhatsApp/Signal) | Wiciso ama fariin u dir xotiyaha |
| **Ku-sime** | Qoraalladaada, wada-hadallada la kugu xilsaartay | Jawaab wicitaanno, qor qoraallo, jawaab farriimaha |
| **Wariye** | Warbixinnadaada keliya | Gudbi warbixin encrypt ah oo leh lifaaqyada faylasha |
| **Maamul** | Dhammaan qoraallada, warbixinnada, wada-hadallada, log-yada baaritaanka | Maamul ku-simaha, shift-yada, kanaallada, mamnuucyada, goobaha |
