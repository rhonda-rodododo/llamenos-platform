---
title: "Setup: Twilio"
description: Hakbang-hakbang na gabay para i-configure ang Twilio bilang iyong telephony provider.
---

Ang Twilio ang default na telephony provider para sa Llamenos at ang pinakamadaling simulan. Itinuturo ng gabay na ito ang paglikha ng account, pag-setup ng numero ng telepono, at pag-configure ng webhook.

## Mga Kinakailangan

- Isang [Twilio account](https://www.twilio.com/try-twilio) (gumagana ang libreng trial para sa pagsubok)
- Ang iyong Llamenos instance na naka-deploy at naa-access sa pamamagitan ng pampublikong URL

## 1. Lumikha ng Twilio account

Mag-sign up sa [twilio.com/try-twilio](https://www.twilio.com/try-twilio). I-verify ang iyong email at numero ng telepono. Nagbibigay ang Twilio ng trial credit para sa pagsubok.

## 2. Bumili ng numero ng telepono

1. Pumunta sa **Phone Numbers** > **Manage** > **Buy a number** sa Twilio Console
2. Maghanap ng numero na may **Voice** capability sa iyong gustong area code
3. I-click ang **Buy** at kumpirmahin

I-save ang numerong ito -- ilalagay mo ito sa Llamenos admin settings.

## 3. Kunin ang iyong Account SID at Auth Token

1. Pumunta sa [Twilio Console dashboard](https://console.twilio.com)
2. Hanapin ang iyong **Account SID** at **Auth Token** sa pangunahing pahina
3. I-click ang icon ng mata para ipakita ang Auth Token

## 4. I-configure ang mga webhook

Sa Twilio Console, mag-navigate sa configuration ng iyong numero ng telepono:

1. Pumunta sa **Phone Numbers** > **Manage** > **Active Numbers**
2. I-click ang iyong numero ng hotline
3. Sa ilalim ng **Voice Configuration**, itakda ang:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

Palitan ang `your-worker-url.com` ng iyong aktwal na Cloudflare Worker URL.

## 5. I-configure sa Llamenos

1. Mag-log in bilang admin
2. Pumunta sa **Settings** > **Telephony Provider**
3. Piliin ang **Twilio** mula sa provider dropdown
4. Ilagay ang:
   - **Account SID**: mula sa hakbang 3
   - **Auth Token**: mula sa hakbang 3
   - **Phone Number**: ang binili mong numero (E.164 format, hal., `+15551234567`)
5. I-click ang **Save**

## 6. Subukan ang setup

Tawagan ang numero ng iyong hotline mula sa isang telepono. Dapat marinig mo ang menu ng pagpili ng wika. Kung may mga boluntaryo sa shift, dadaan ang tawag.

## WebRTC setup (opsyonal)

Para payagan ang mga boluntaryo na sagutin ang mga tawag sa kanilang browser sa halip na sa kanilang telepono:

### Lumikha ng API Key

1. Pumunta sa **Account** > **API keys & tokens** sa Twilio Console
2. I-click ang **Create API Key**
3. Piliin ang **Standard** key type
4. I-save ang **SID** at **Secret** -- ang secret ay ipinapakita lamang nang isang beses

### Lumikha ng TwiML App

1. Pumunta sa **Voice** > **Manage** > **TwiML Apps**
2. I-click ang **Create new TwiML App**
3. Itakda ang **Voice Request URL** sa `https://your-worker-url.com/telephony/webrtc-incoming`
4. I-save at tandaan ang **App SID**

### I-enable sa Llamenos

1. Pumunta sa **Settings** > **Telephony Provider**
2. I-toggle on ang **WebRTC Calling**
3. Ilagay ang:
   - **API Key SID**: mula sa API key na ginawa mo
   - **API Key Secret**: mula sa API key na ginawa mo
   - **TwiML App SID**: mula sa TwiML App na ginawa mo
4. I-click ang **Save**

Tingnan ang [WebRTC Browser Calling](/docs/deploy/providers/webrtc) para sa setup ng boluntaryo at pag-troubleshoot.

## Pag-troubleshoot

- **Hindi dumarating ang mga tawag**: I-verify na tama ang webhook URL at naka-deploy ang iyong Worker. Suriin ang Twilio Console error logs.
- **Mga "Invalid webhook" error**: Siguraduhing gumagamit ng HTTPS ang webhook URL at nagbabalik ng valid TwiML.
- **Mga limitasyon ng trial account**: Ang mga trial account ay maaari lamang tumawag sa mga verified number. Mag-upgrade sa bayad na account para sa production use.
- **Mga pagkabigo sa webhook validation**: Siguraduhing tugma ang Auth Token sa Llamenos sa nasa Twilio Console.
