---
title: "Setup: Vonage"
description: Hakbang-hakbang na gabay para i-configure ang Vonage bilang iyong telephony provider.
---

Ang Vonage (dating Nexmo) ay nag-aalok ng malakas na internasyonal na saklaw at mapagkumpitensyang presyo. Gumagamit ito ng ibang API model kaysa Twilio -- ang mga Vonage Application ay nagsasama ng iyong numero, webhook, at mga kredensyal.

## Mga Kinakailangan

- Isang [Vonage account](https://dashboard.nexmo.com/sign-up) (may libreng credit)
- Ang iyong Llamenos instance na naka-deploy at naa-access sa pamamagitan ng pampublikong URL

## 1. Lumikha ng Vonage account

Mag-sign up sa [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). I-verify ang iyong account at tandaan ang iyong **API Key** at **API Secret** mula sa dashboard home page.

## 2. Bumili ng numero ng telepono

1. Pumunta sa **Numbers** > **Buy numbers** sa Vonage Dashboard
2. Piliin ang iyong bansa at pumili ng numero na may **Voice** capability
3. Bilhin ang numero

## 3. Lumikha ng Vonage Application

Nagsasama ang Vonage ng configuration sa "Applications":

1. Pumunta sa **Applications** > **Create a new application**
2. Maglagay ng pangalan (hal., "Llamenos Hotline")
3. Sa ilalim ng **Voice**, i-toggle ito at itakda ang:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. I-click ang **Generate new application**
5. I-save ang **Application ID** na ipinapakita sa confirmation page
6. I-download ang **private key** file -- kakailanganin mo ang nilalaman nito para sa configuration

## 4. I-link ang numero ng telepono

1. Pumunta sa **Numbers** > **Your numbers**
2. I-click ang icon ng gear sa tabi ng iyong numero ng hotline
3. Sa ilalim ng **Voice**, piliin ang Application na ginawa mo sa hakbang 3
4. I-click ang **Save**

## 5. I-configure sa Llamenos

1. Mag-log in bilang admin
2. Pumunta sa **Settings** > **Telephony Provider**
3. Piliin ang **Vonage** mula sa provider dropdown
4. Ilagay ang:
   - **API Key**: mula sa Vonage Dashboard home page
   - **API Secret**: mula sa Vonage Dashboard home page
   - **Application ID**: mula sa hakbang 3
   - **Phone Number**: ang binili mong numero (E.164 format)
5. I-click ang **Save**

## 6. Subukan ang setup

Tawagan ang numero ng iyong hotline. Dapat marinig mo ang menu ng pagpili ng wika. I-verify na naru-route ang mga tawag sa mga boluntaryo na nasa shift.

## WebRTC setup (opsyonal)

Ang Vonage WebRTC ay gumagamit ng mga Application credential na nagawa mo na:

1. Sa Llamenos, pumunta sa **Settings** > **Telephony Provider**
2. I-toggle on ang **WebRTC Calling**
3. Ilagay ang nilalaman ng **Private Key** (ang buong PEM text mula sa file na na-download mo)
4. I-click ang **Save**

Naka-configure na ang Application ID. Gumagawa ang Vonage ng mga RS256 JWT gamit ang private key para sa browser authentication.

## Mga tala na tiyak sa Vonage

- **NCCO vs TwiML**: Gumagamit ang Vonage ng NCCO (Nexmo Call Control Objects) sa JSON format sa halip na XML markup. Awtomatikong bumubuo ang Llamenos adapter ng tamang format.
- **Format ng Answer URL**: Inaasahan ng Vonage na ang answer URL ay nagbabalik ng JSON (NCCO), hindi XML. Pinamamahalaan ito ng adapter.
- **Event URL**: Nagpapadala ang Vonage ng mga call event (ringing, answered, completed) sa event URL bilang JSON POST request.
- **Seguridad ng private key**: Ang private key ay iniimbak nang naka-encrypt. Hindi ito kailanman umaalis sa server -- ginagamit lamang ito para bumuo ng mga short-lived JWT token.

## Pag-troubleshoot

- **"Application not found"**: I-verify na eksaktong tumutugma ang Application ID. Mahahanap mo ito sa ilalim ng **Applications** sa Vonage Dashboard.
- **Walang papasok na tawag**: Siguraduhing naka-link ang numero ng telepono sa tamang Application (hakbang 4).
- **Mga error sa private key**: I-paste ang buong PEM content kasama ang mga linyang `-----BEGIN PRIVATE KEY-----` at `-----END PRIVATE KEY-----`.
- **Pag-format ng internasyonal na numero**: Kinakailangan ng Vonage ang E.164 format. Isama ang `+` at country code.
