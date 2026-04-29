---
title: "Setup: SignalWire"
description: Hakbang-hakbang na gabay para i-configure ang SignalWire bilang iyong telephony provider.
---

Ang SignalWire ay isang cost-effective na alternatibo sa Twilio na may compatible na API. Gumagamit ito ng LaML (isang TwiML-compatible na markup language), kaya ang paglipat sa pagitan ng Twilio at SignalWire ay madali.

## Mga Kinakailangan

- Isang [SignalWire account](https://signalwire.com/signup) (may libreng trial)
- Ang iyong Llamenos instance na naka-deploy at naa-access sa pamamagitan ng pampublikong URL

## 1. Lumikha ng SignalWire account

Mag-sign up sa [signalwire.com/signup](https://signalwire.com/signup). Sa panahon ng signup, pipili ka ng **Space name** (hal., `myhotline`). Ang iyong Space URL ay magiging `myhotline.signalwire.com`. Tandaan ang pangalang ito -- kakailanganin mo ito sa configuration.

## 2. Bumili ng numero ng telepono

1. Sa iyong SignalWire Dashboard, pumunta sa **Phone Numbers**
2. I-click ang **Buy a Phone Number**
3. Maghanap ng numero na may voice capability
4. Bilhin ang numero

## 3. Kunin ang iyong mga kredensyal

1. Pumunta sa **API** sa SignalWire Dashboard
2. Hanapin ang iyong **Project ID** (ito ang gumagana bilang Account SID)
3. Lumikha ng bagong **API Token** kung wala ka pa -- ito ang gumagana bilang Auth Token

## 4. I-configure ang mga webhook

1. Pumunta sa **Phone Numbers** sa dashboard
2. I-click ang iyong numero ng hotline
3. Sa ilalim ng **Voice Settings**, itakda ang:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. I-configure sa Llamenos

1. Mag-log in bilang admin
2. Pumunta sa **Settings** > **Telephony Provider**
3. Piliin ang **SignalWire** mula sa provider dropdown
4. Ilagay ang:
   - **Account SID**: ang iyong Project ID mula sa hakbang 3
   - **Auth Token**: ang iyong API Token mula sa hakbang 3
   - **SignalWire Space**: ang iyong Space name (ang pangalan lamang, hindi ang buong URL -- hal., `myhotline`)
   - **Phone Number**: ang binili mong numero (E.164 format)
5. I-click ang **Save**

## 6. Subukan ang setup

Tawagan ang numero ng iyong hotline. Dapat marinig mo ang menu ng pagpili ng wika na sinusundan ng daloy ng tawag.

## WebRTC setup (opsyonal)

Ang SignalWire WebRTC ay gumagamit ng parehong pattern ng API key tulad ng Twilio:

1. Sa iyong SignalWire Dashboard, lumikha ng isang **API Key** sa ilalim ng **API** > **Tokens**
2. Lumikha ng **LaML Application**:
   - Pumunta sa **LaML** > **LaML Applications**
   - Itakda ang Voice URL sa `https://your-worker-url.com/telephony/webrtc-incoming`
   - Tandaan ang Application SID
3. Sa Llamenos, pumunta sa **Settings** > **Telephony Provider**
4. I-toggle on ang **WebRTC Calling**
5. Ilagay ang API Key SID, API Key Secret, at Application SID
6. I-click ang **Save**

## Mga pagkakaiba sa Twilio

- **LaML vs TwiML**: Gumagamit ang SignalWire ng LaML, na functionally identical sa TwiML. Awtomatikong pinamamahalaan ito ng Llamenos.
- **Space URL**: Ang mga API call ay pumupunta sa `{space}.signalwire.com` sa halip na `api.twilio.com`. Pinamamahalaan ito ng adapter sa pamamagitan ng Space name na ibinigay mo.
- **Presyo**: Ang SignalWire ay karaniwang 30-40% na mas mura kaysa Twilio para sa voice call.
- **Feature parity**: Lahat ng Llamenos feature (recording, transcription, CAPTCHA, voicemail) ay gumagana nang pareho sa SignalWire.

## Pag-troubleshoot

- **Mga "Space not found" error**: I-double check ang Space name (ang subdomain lamang, hindi ang buong URL).
- **Mga pagkabigo sa webhook**: Siguraduhing ang iyong Worker URL ay publicly accessible at gumagamit ng HTTPS.
- **Mga isyu sa API token**: Maaaring mag-expire ang mga SignalWire token. Lumikha ng bagong token kung may mga authentication error.
