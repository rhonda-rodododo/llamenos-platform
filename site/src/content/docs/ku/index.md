---
title: Belgekirin
description: Fêr bibe ka meriv çawa Llamenos saz dike, mîheng dike û bi kar tîne.
guidesHeading: Rêber
guides:
  - title: Destpêkirin
    description: Pêşniyaz, sazkirin, sihîrbaza mîhengê, û belavkirina we ya yekem.
    href: /docs/getting-started
  - title: Mîmarî
    description: Kurteya mîmarîya pergalê — depo, herikîna daneyê, qatên şîfrekirinê, û ragihandina rast-dem.
    href: /docs/architecture
  - title: Kurteya Xweser-Hostkirinê
    description: Li ser înfrastruktura xwe bi Docker Compose an Kubernetes belav bike.
    href: /docs/self-hosting
  - title: "Belavkirin: Docker Compose"
    description: Belavkirina xweser-hostkirina yek-server bi HTTPS-ya otomatîk.
    href: /docs/deploy-docker
  - title: "Belavkirin: Kubernetes (Helm)"
    description: Bi nexşeya fermî ya Helm-ê li Kubernetes belav bike.
    href: /docs/deploy-kubernetes
  - title: Rêbera Rêveberê
    description: Rêveberiya xwebexş, nobet, kanal, lîsteyên qedexekirinê, rapor, û mîhengan.
    href: /docs/admin-guide
  - title: Rêbera Xwebexşê
    description: Têketin, wergirtina bangên, bersivdayîna peyamên, nivîsîna notan, û bikaranîna transkrîpsiyonê.
    href: /docs/volunteer-guide
  - title: Rêbera Raporgerê
    description: Raporên şîfrekirî bişîne û statûya wan bişopîne.
    href: /docs/reporter-guide
  - title: Rêbera Mobîlê
    description: Sepana mobîl a Llamenos li ser iOS û Android saz bike û mîheng bike.
    href: /docs/mobile-guide
  - title: Pêşkêşkarên Telefoniyê
    description: Pêşkêşkarên telefoniyê yên piştgirî bidin ber hev û ya herî guncav ji bo xeta germ a xwe hilbijêre.
    href: /docs/telephony-providers
  - title: "Sazkirin: SMS"
    description: Peyamên SMS-ê yên hundir/derva bi riya pêşkêşkara telefoniya xwe çalak bike.
    href: /docs/setup-sms
  - title: "Sazkirin: WhatsApp"
    description: WhatsApp Business bi riya Meta Cloud API-ê girêde.
    href: /docs/setup-whatsapp
  - title: "Sazkirin: Signal"
    description: Kanala Signal-ê bi riya piraya signal-cli saz bike.
    href: /docs/setup-signal
  - title: "Sazkirin: Twilio"
    description: Rêbera gav-bi-gav ji bo mîhengkirina Twilio wekî pêşkêşkara telefoniya te.
    href: /docs/setup-twilio
  - title: "Sazkirin: SignalWire"
    description: Rêbera gav-bi-gav ji bo mîhengkirina SignalWire wekî pêşkêşkara telefoniya te.
    href: /docs/setup-signalwire
  - title: "Sazkirin: Vonage"
    description: Rêbera gav-bi-gav ji bo mîhengkirina Vonage wekî pêşkêşkara telefoniya te.
    href: /docs/setup-vonage
  - title: "Sazkirin: Plivo"
    description: Rêbera gav-bi-gav ji bo mîhengkirina Plivo wekî pêşkêşkara telefoniya te.
    href: /docs/setup-plivo
  - title: "Sazkirin: Asterisk (Xweser-Hostkirî)"
    description: Asterisk bi piraya ARI-ê ji bo parastina herî zêde û kontrolê belav bike.
    href: /docs/setup-asterisk
  - title: Bangkirina Geroka WebRTC
    description: Bersivdayîna bangê rasterast di gerokê de ji bo xwebexşan bi WebRTC çalak bike.
    href: /docs/webrtc-calling
  - title: Çareserkirina Kêmasiyan
    description: Çareseriyên ji bo pirsgirêkên hevpar ên bi belavkirinê, sermaseyê, mobîlê, telefoniyê, û şîfrekirinê re.
    href: /docs/troubleshooting
  - title: Modela Ewlehiyê
    description: Fêm bike ka çi şîfrekirî ye, çi neyê, û modela tehdîdê.
    href: /security
---

## Kurteya mîmarîyê

Llamenos sepaneke rûpelê yekane (SPA) ye ku dikare li ser **Cloudflare Workers** an jî li ser înfrastruktura xwe bi riya **Docker Compose / Kubernetes** bixebite. Ew bangên dengî, SMS, WhatsApp, û Signal-ê piştgirî dike — hemû ji bo xwebexşên li ser nobetê bi rêya navgîniyek yekbûyî têne rêvebirin.

| Parçe | Cloudflare | Xweser-Hostkirî |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Heman |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Depoya Blob | R2 | RustFS (S3-hevbeş) |
| Deng | Twilio, SignalWire, Vonage, Plivo, an Asterisk | Heman |
| Peyam | SMS, WhatsApp Business, Signal | Heman |
| Rastdanîn | WebSocket keypairs (BIP-340 Schnorr) + WebAuthn | Heman |
| Şîfrekirin | ECIES (secp256k1 + XChaCha20-Poly1305) | Heman |
| Transkrîpsiyon | Client-side Whisper (WASM) | Client-side Whisper (WASM) |
| i18n | i18next (13 ziman) | Heman |

## Rol

| Rol | Dikare bibîne | Dikare bike |
|---|---|---|
| **Bangker** | Tiştek (telefon/SMS/WhatsApp/Signal) | Bang bike an peyamê bişîne xeta germ |
| **Xwebexş** | Notên xwe, axaftinên hatine tayînkirin | Bersiva bangên bide, not binivîse, bersiva peyaman bide |
| **Raporger** | Tenê raporên xwe | Raporên şîfrekirî bi pelên pêvekê bişîne |
| **Rêveber** | Hemû not, rapor, axaftin, tomarên kontrolê | Xwebexş, nobet, kanal, qedexe, mîheng birêve bibe |
