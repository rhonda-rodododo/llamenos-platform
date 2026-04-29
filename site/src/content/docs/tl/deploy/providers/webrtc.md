---
title: WebRTC Browser Calling
description: I-enable ang pagsagot ng tawag sa browser para sa mga boluntaryo gamit ang WebRTC.
---

Pinapayagan ng WebRTC (Web Real-Time Communication) ang mga boluntaryo na sagutin ang mga tawag sa hotline nang direkta sa kanilang browser, nang hindi nangangailangan ng telepono. Ito ay kapaki-pakinabang para sa mga boluntaryo na mas gustong hindi ibahagi ang kanilang numero ng telepono o nagtatrabaho mula sa computer.

## Paano ito gumagana

1. Ine-enable ng admin ang WebRTC sa mga setting ng telephony provider
2. Itinatakda ng mga boluntaryo ang kanilang call preference sa "Browser" sa kanilang profile
3. Kapag may pumasok na tawag, tumutunog ang Llamenos app sa browser na may notification
4. Kini-click ng boluntaryo ang "Answer" at kumokonekta ang tawag sa pamamagitan ng browser gamit ang kanilang mikropono

Ang call audio ay niru-route mula sa telephony provider sa pamamagitan ng WebRTC connection sa browser ng boluntaryo. Ang kalidad ng tawag ay depende sa internet connection ng boluntaryo.

## Mga Kinakailangan

### Setup ng admin

- Isang sinusuportahang telephony provider na may naka-enable na WebRTC (Twilio, SignalWire, Vonage, o Plivo)
- Naka-configure na mga WebRTC credential na tiyak sa provider (tingnan ang mga gabay sa setup ng provider)
- Naka-toggle on ang WebRTC sa **Settings** > **Telephony Provider**

### Mga kinakailangan ng boluntaryo

- Isang modernong browser (Chrome, Firefox, Edge, o Safari 14.1+)
- Isang gumaganang mikropono
- Isang matatag na koneksyon sa internet (minimum 100 kbps upload/download)
- Naka-grant na browser notification permission

## Setup na tiyak sa provider

Nangangailangan ang bawat telephony provider ng iba-ibang mga kredensyal para sa WebRTC:

### Twilio / SignalWire

1. Lumikha ng **API Key** sa provider console
2. Lumikha ng **TwiML/LaML Application** na may Voice URL na nakatakda sa `https://your-worker-url.com/telephony/webrtc-incoming`
3. Sa Llamenos, ilagay ang API Key SID, API Key Secret, at Application SID

### Vonage

1. Kasama na ng iyong Vonage Application ang WebRTC capability
2. Sa Llamenos, i-paste ang **private key** ng iyong Application (PEM format)
3. Naka-configure na ang Application ID mula sa paunang setup

### Plivo

1. Lumikha ng **Endpoint** sa Plivo Console sa ilalim ng **Voice** > **Endpoints**
2. Gumagamit ang WebRTC ng iyong kasalukuyang Auth ID at Auth Token
3. I-enable ang WebRTC sa Llamenos -- walang karagdagang kredensyal na kailangan

### Asterisk

Ang Asterisk WebRTC ay nangangailangan ng SIP.js configuration na may WebSocket transport. Ito ay mas komplikado kaysa sa mga cloud provider:

1. I-enable ang WebSocket transport sa `http.conf` ng Asterisk
2. Lumikha ng mga PJSIP endpoint para sa mga WebRTC client na may DTLS-SRTP
3. Awtomatikong kinokonpigura ng Llamenos ang SIP.js client kapag napili ang Asterisk

Tingnan ang [gabay sa setup ng Asterisk](/docs/deploy/providers/asterisk) para sa buong mga detalye.

## Setup ng call preference ng boluntaryo

Kino-configure ng mga boluntaryo ang kanilang call preference sa app:

1. Mag-log in sa Llamenos
2. Pumunta sa **Settings** (icon ng gear)
3. Sa ilalim ng **Call Preferences**, piliin ang **Browser** sa halip na **Phone**
4. I-grant ang mga permission ng mikropono at notification kapag na-prompt
5. Panatilihing bukas ang Llamenos tab sa panahon ng iyong shift

Kapag may pumasok na tawag, makikita mo ang isang browser notification at isang in-app ringing indicator. I-click ang **Answer** para kumonekta.

## Compatibility ng browser

| Browser | Desktop | Mobile | Mga Tala |
|---|---|---|---|
| Chrome | Oo | Oo | Inirerekomenda |
| Firefox | Oo | Oo | Buong suporta |
| Edge | Oo | Oo | Chromium-based, buong suporta |
| Safari | Oo (14.1+) | Oo (14.1+) | Nangangailangan ng user interaction para magsimula ang audio |
| Brave | Oo | Limitado | Maaaring kailanganin na i-disable ang mga shield para sa mikropono |

## Mga tip para sa kalidad ng audio

- Gumamit ng headset o earbuds para maiwasan ang echo
- Isara ang ibang mga application na gumagamit ng mikropono
- Gumamit ng wired na internet connection kung maaari
- I-disable ang mga browser extension na maaaring makagambala sa WebRTC (mga VPN extension, ad blocker na may WebRTC leak protection)

## Pag-troubleshoot

### Walang audio

- **Suriin ang mga permission ng mikropono**: I-click ang lock icon sa address bar at siguraduhing ang microphone access ay "Allow"
- **Subukan ang iyong mikropono**: Gamitin ang built-in na audio test ng iyong browser o isang site tulad ng [webcamtest.com](https://webcamtest.com)
- **Suriin ang audio output**: Siguraduhing napili ang iyong mga speaker o headset bilang output device

### Hindi tumutunog ang mga tawag sa browser

- **Naka-block ang mga notification**: Suriin na naka-enable ang mga browser notification para sa Llamenos site
- **Hindi aktibo ang tab**: Dapat bukas ang Llamenos tab (maaari itong nasa background, ngunit dapat may tab)
- **Call preference**: I-verify na nakatakda ang iyong call preference sa "Browser" sa Settings
- **Hindi naka-configure ang WebRTC**: Hilingin sa iyong admin na i-verify na naka-enable ang WebRTC at nakatakda ang mga kredensyal

### Mga isyu sa firewall at NAT

Gumagamit ang WebRTC ng mga STUN/TURN server para makatawid sa mga firewall at NAT. Kung kumokonekta ang mga tawag pero walang audio:

- **Mga corporate firewall**: Maaaring i-block ng ilang firewall ang UDP traffic sa mga hindi karaniwang port. Hilingin sa iyong IT team na payagan ang UDP traffic sa port 3478 at 10000-60000
- **Symmetric NAT**: Maaaring gumamit ng symmetric NAT ang ilang router na makakapigil sa mga direct peer connection. Dapat hawakan ito ng mga TURN server ng telephony provider nang awtomatiko
- **VPN interference**: Maaaring makagambala ang mga VPN sa WebRTC connection. Subukang i-disconnect ang iyong VPN sa panahon ng mga shift

### Echo o feedback

- Gumamit ng headphone sa halip na speaker
- Bawasan ang sensitivity ng mikropono sa audio settings ng iyong OS
- I-enable ang echo cancellation sa iyong browser (karaniwang naka-enable na bilang default)
- Lumayo sa matitigas at reflective na ibabaw
