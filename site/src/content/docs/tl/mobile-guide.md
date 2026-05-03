---
title: Gabay sa Mobile
description: I-install at i-set up ang Llamenos mobile app sa iOS at Android.
---

Ang Llamenos mobile app ay nagpapahintulot sa mga volunteer na sumagot ng mga tawag, tumugon sa mga mensahe, at sumulat ng mga naka-encrypt na nota mula sa kanilang telepono. Ito ay ginawa gamit ang React Native at nagbabahagi ng parehong Rust cryptographic core sa desktop app.

## Ano ang mobile app?

Ang mobile app ay kasama ng desktop application. Kumokonekta ito sa parehong Llamenos backend (Cloudflare Workers o self-hosted) at gumagamit ng parehong protocol, kaya maaaring magpalipat-lipat ang mga volunteer sa pagitan ng desktop at mobile nang walang hassle.

Ang mobile app ay nasa hiwalay na repository (`llamenos-hotline`) pero nagbabahagi ng:

- **llamenos-core** — Parehong Rust crate para sa lahat ng cryptographic operations, kino-compile sa pamamagitan ng UniFFI para sa iOS at Android
- **Protocol** — Parehong wire format, API endpoints, at encryption scheme
- **Backend** — Parehong Cloudflare Worker o self-hosted server

## Download at pag-install

### Android

Kasalukuyang idini-distribute ang mobile app bilang APK para sa sideloading:

1. I-download ang pinakabagong `.apk` file mula sa [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-hotline/releases/latest) page
2. Sa iyong Android device, pumunta sa **Settings > Security** at i-enable ang **Install from unknown sources** (o i-enable ito per-app kapag na-prompt)
3. Buksan ang na-download na APK at i-tap ang **Install**
4. Kapag na-install na, buksan ang Llamenos mula sa app drawer

Ang App Store at Play Store distribution ay planado para sa hinaharap na release.

### iOS

Ang mga iOS build ay available bilang TestFlight beta releases:

1. I-install ang [TestFlight](https://apps.apple.com/app/testflight/id899247664) mula sa App Store
2. Humingi sa iyong admin ng TestFlight invite link
3. Buksan ang link sa iyong iOS device para sumali sa beta
4. I-install ang Llamenos mula sa TestFlight

Ang App Store distribution ay planado para sa hinaharap na release.

## Paunang setup

Ang mobile app ay sini-set up sa pamamagitan ng pag-link nito sa umiiral na desktop account. Tinitiyak nito na pareho ang cryptographic identity na ginagamit sa lahat ng device nang hindi kailanman ipinadadala ang secret key bilang plaintext.

### Device provisioning (QR scan)

1. Buksan ang Llamenos desktop app at pumunta sa **Settings > Devices**
2. I-click ang **Link New Device** — gagawa ito ng QR code na naglalaman ng one-time provisioning token
3. Buksan ang Llamenos mobile app at i-tap ang **Link Device**
4. I-scan ang QR code gamit ang camera ng iyong phone
5. Nagsasagawa ang mga app ng ephemeral ECDH key exchange para ligtas na ilipat ang iyong encrypted key material
6. Magtakda ng PIN sa mobile app para protektahan ang iyong lokal na key storage
7. Ang mobile app ay naka-link na at handa nang gamitin

Ang provisioning process ay hindi kailanman nagpapadala ng iyong nsec bilang plaintext. Bini-wrap ng desktop app ang key material gamit ang ephemeral shared secret, at ina-unwrap ng mobile app ito nang lokal.

### Manual setup (nsec entry)

Kung hindi mo ma-scan ang QR code, maaari mong direktang ilagay ang iyong nsec:

1. Buksan ang mobile app at i-tap ang **Enter nsec manually**
2. I-paste ang iyong `nsec1...` key
3. Magtakda ng PIN para protektahan ang lokal na storage
4. Dine-derive ng app ang iyong public key at nagre-register sa backend

Ang paraang ito ay nangangailangan ng direktang pag-handle ng iyong nsec, kaya gamitin lamang ito kung hindi posible ang device linking. Gumamit ng password manager para i-paste ang nsec sa halip na i-type ito.

## Paghahambing ng mga feature

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Sumagot ng papasok na tawag | Oo | Oo |
| Sumulat ng mga naka-encrypt na nota | Oo | Oo |
| Custom note fields | Oo | Oo |
| Tumugon sa mga mensahe (SMS, WhatsApp, Signal) | Oo | Oo |
| Tingnan ang mga conversation | Oo | Oo |
| Shift status at pahinga | Oo | Oo |
| Client-side transcription | Oo (WASM Whisper) | Hindi |
| Note search | Oo | Oo |
| Command palette | Oo (Ctrl+K) | Hindi |
| Keyboard shortcuts | Oo | Hindi |
| Admin settings | Oo (buo) | Oo (limitado) |
| Pamahalaan ang mga volunteer | Oo | Tingnan lamang |
| Tingnan ang mga audit log | Oo | Oo |
| WebRTC browser calling | Oo | Hindi (gumagamit ng native phone) |
| Push notifications | OS notifications | Native push (FCM/APNS) |
| Auto-update | Tauri updater | App Store / TestFlight |
| Mga file attachment (reports) | Oo | Oo |

## Mga limitasyon

- **Walang client-side transcription** — Ang WASM Whisper model ay nangangailangan ng malaking memory at CPU resources na hindi praktikal sa mobile. Ang call transcription ay available lamang sa desktop.
- **Mas mababang crypto performance** — Bagaman gumagamit ang mobile app ng parehong Rust crypto core sa pamamagitan ng UniFFI, maaaring mas mabagal ang mga operasyon sa mas lumang mga device kumpara sa desktop native performance.
- **Limitadong admin features** — Ang ilang admin operations (bulk volunteer management, detalyadong settings configuration) ay available lamang sa desktop app. Nagbibigay ang mobile app ng read-only views para sa karamihan ng admin screens.
- **Walang WebRTC calling** — Tumatanggap ang mga mobile volunteer ng mga tawag sa kanilang phone number sa pamamagitan ng telephony provider, hindi sa browser. Ang in-app WebRTC calling ay para sa desktop lamang.
- **Battery at connectivity** — Kailangan ng app ang persistent connection para makatanggap ng real-time updates. Maaaring limitado ang background mode ng OS power management. Panatilihin ang app sa foreground sa panahon ng shift para sa maaasahang mga notification.

## Troubleshooting ng mga isyu sa mobile

### Nabigo ang provisioning na may "Invalid QR code"

- Siguraduhing kamakailan lang na-generate ang QR code (nag-e-expire ang provisioning tokens pagkatapos ng 5 minuto)
- Gumawa ng bagong QR code mula sa desktop app at subukan muli
- Tiyaking konektado ang parehong device sa internet

### Hindi nakakatanggap ng push notifications

- Suriin na naka-enable ang mga notification para sa Llamenos sa iyong device settings
- Sa Android: Pumunta sa **Settings > Apps > Llamenos > Notifications** at i-enable ang lahat ng channels
- Sa iOS: Pumunta sa **Settings > Notifications > Llamenos** at i-enable ang **Allow Notifications**
- Siguraduhing hindi naka-Do Not Disturb mode
- I-verify na aktibo ang iyong shift at wala kang pahinga

### Nag-crash ang app sa pagbukas

- Tiyaking pinapatakbo mo ang pinakabagong bersyon ng app
- I-clear ang app cache: **Settings > Apps > Llamenos > Storage > Clear Cache**
- Kung nagpapatuloy ang isyu, i-uninstall at i-reinstall (kakailanganin mong i-re-link ang device)

### Hindi ma-decrypt ang mga lumang nota pagkatapos mag-reinstall

- Ina-alis ng pag-reinstall ng app ang lokal na key material
- I-re-link ang device sa pamamagitan ng QR code mula sa iyong desktop app para ma-restore ang access
- Ang mga nota na naka-encrypt bago mag-reinstall ay maa-access kapag na-re-link ang device gamit ang parehong identity

### Mabagal na performance sa mga lumang device

- Isara ang ibang mga app para mapalaya ang memory
- I-disable ang mga animation sa app settings kung available
- Isaalang-alang ang paggamit ng desktop app para sa mabibigat na operasyon tulad ng bulk note review
