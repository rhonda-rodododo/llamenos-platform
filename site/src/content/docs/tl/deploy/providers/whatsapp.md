---
title: "Setup: WhatsApp"
description: I-connect ang WhatsApp Business sa pamamagitan ng Meta Cloud API para sa encrypted messaging.
---

Sinusuportahan ng Llamenos ang WhatsApp Business messaging sa pamamagitan ng Meta Cloud API (Graph API v21.0). Pinapagana ng WhatsApp ang rich messaging na may suporta para sa text, mga larawan, dokumento, audio, at interactive messages.

## Mga kinakailangan

- Isang [Meta Business account](https://business.facebook.com)
- Isang WhatsApp Business API phone number
- Isang Meta developer app na may WhatsApp product na naka-enable

## Mga integration mode

Sinusuportahan ng Llamenos ang dalawang WhatsApp integration mode:

### Meta Direct (inirerekomenda)

Direktang kumokonekta sa Meta Cloud API. Nag-aalok ng buong kontrol at lahat ng features.

**Mga kinakailangang credential:**
- **Phone Number ID** — ang iyong WhatsApp Business phone number ID
- **Business Account ID** — ang iyong Meta Business Account ID
- **Access Token** — isang long-lived Meta API access token
- **Verify Token** — isang custom string na pinipili mo para sa webhook verification
- **App Secret** — ang iyong Meta app secret (para sa webhook signature validation)

### Twilio mode

Kung gumagamit ka na ng Twilio para sa voice, maaari mong i-route ang WhatsApp sa pamamagitan ng iyong Twilio account. Mas simpleng setup, pero maaaring limitado ang ilang features.

**Mga kinakailangang credential:**
- Ang iyong umiiral na Twilio Account SID, Auth Token, at isang Twilio-connected WhatsApp sender

## 1. Gumawa ng Meta app

1. Pumunta sa [developers.facebook.com](https://developers.facebook.com)
2. Gumawa ng bagong app (type: Business)
3. Idagdag ang **WhatsApp** product
4. Sa WhatsApp > Getting Started, itala ang iyong **Phone Number ID** at **Business Account ID**
5. Gumawa ng permanent access token (Settings > Access Tokens)

## 2. I-configure ang webhook

Sa Meta developer dashboard:

1. Pumunta sa WhatsApp > Configuration > Webhook
2. Itakda ang Callback URL sa:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Itakda ang Verify Token sa parehong string na ilalagay mo sa Llamenos admin settings
4. Mag-subscribe sa `messages` webhook field

Magpapadala ang Meta ng GET request para i-verify ang webhook. Tutugon ang iyong Worker ng challenge kung tumugma ang verify token.

## 3. I-enable ang WhatsApp sa admin settings

Mag-navigate sa **Admin Settings > Messaging Channels** (o gamitin ang setup wizard) at i-toggle ang **WhatsApp** na naka-on.

Piliin ang **Meta Direct** o **Twilio** mode at ilagay ang mga kinakailangang credential.

I-configure ang mga opsyonal na setting:
- **Auto-response message** — ipinapadala sa mga unang beses na nag-contact
- **After-hours response** — ipinapadala sa labas ng mga shift hours

## 4. Pagsubok

Magpadala ng WhatsApp message sa iyong Business phone number. Dapat lumabas ang conversation sa **Conversations** tab.

## 24-hour messaging window

Ipinapatupad ng WhatsApp ang 24-hour messaging window:
- Maaari kang tumugon sa isang user sa loob ng 24 oras pagkatapos ng kanilang huling mensahe
- Pagkatapos ng 24 oras, kailangan mong gumamit ng approved na **template message** para muling simulan ang conversation
- Awtomatikong hina-handle ito ng Llamenos — kung nag-expire na ang window, nagpapadala ito ng template message para i-restart ang conversation

## Suporta sa media

Sinusuportahan ng WhatsApp ang mga rich media message:
- **Mga larawan** (JPEG, PNG)
- **Mga dokumento** (PDF, Word, atbp.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- Pagbabahagi ng **lokasyon**
- **Interactive** na mga button at list message

Lumalabas ang mga media attachment nang inline sa conversation view.

## Mga tala sa seguridad

- Gumagamit ang WhatsApp ng end-to-end encryption sa pagitan ng user at ng infrastructure ng Meta
- Technically, maa-access ng Meta ang content ng mensahe sa kanilang mga server
- Iniimbak sa Llamenos ang mga mensahe pagkatapos matanggap mula sa webhook
- Vine-validate ang mga webhook signature gamit ang HMAC-SHA256 kasama ang iyong app secret
- Para sa pinakamataas na privacy, isaalang-alang ang paggamit ng Signal sa halip na WhatsApp
