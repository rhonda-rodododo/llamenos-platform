---
title: "Setup: WhatsApp"
description: Connect WhatsApp Business via the Meta Cloud API for encrypted messaging.
---

Llamenos waxay taageertaa WhatsApp Business messaging via Meta Cloud API (Graph API v21.0). WhatsApp waxay awood u siisaa rich messaging with support for text, images, documents, audio, iyo interactive messages.

## Prerequisites

- [Meta Business account](https://business.facebook.com)
- WhatsApp Business API phone number
- Meta developer app with WhatsApp product enabled

## Integration modes

Llamenos waxay taageertaa laba WhatsApp integration mode:

### Meta Direct (recommended)

Isku xir directly to Meta Cloud API. Bixisaa xakameyn oo dhan iyo dhammaan features.

**Credentials loo baahan yahay:**
- **Phone Number ID** — your WhatsApp Business phone number ID
- **Business Account ID** — your Meta Business Account ID
- **Access Token** — long-lived Meta API access token
- **Verify Token** — custom string aad doorato for webhook verification
- **App Secret** — your Meta app secret (for webhook signature validation)

### Twilio mode

Haddii horey uu isticmaalayso Twilio for voice, waxaad ku gudbi kartaa WhatsApp through your Twilio account. Setup fudud, laakiin qaar features waxay yaraan karaan.

**Credentials loo baahan yahay:**
- Your existing Twilio Account SID, Auth Token, iyo Twilio-connected WhatsApp sender

## 1. Create a Meta app

1. Aad u guur [developers.facebook.com](https://developers.facebook.com)
2. Create a new app (nooc: Business)
3. Kudar **WhatsApp** product
4. In WhatsApp > Getting Started, xasuusnow **Phone Number ID** iyo **Business Account ID**
5. Generate a permanent access token (Settings > Access Tokens)

## 2. Configure the webhook

In Meta developer dashboard:

1. Aad u guur WhatsApp > Configuration > Webhook
2. Set Callback URL to:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Set Verify Token to same string aad gelin doontaa in Llamenos admin settings
4. Subscribe to `messages` webhook field

Meta waxay soo diraysaa GET request si ay u verify gareyso webhook. Server-kaagu wuu jawaabi doonaa with challenge haddii verify token uu iswaafaqsan yahay.

## 3. Enable WhatsApp in admin settings

Aad u guur **Admin Settings > Messaging Channels** (ama isticmaal setup wizard) oo toggle **WhatsApp** on.

Dooro **Meta Direct** ama **Twilio** mode oo geli credentials-ka loo baahan yahay.

Configure optional settings:
- **Auto-response message** — sent to first-time contacts
- **After-hours response** — sent outside shift hours

## 4. Test

Send WhatsApp message to Business phone number-kaaga. Wadahadku waa inuu soo muuqdaa in **Conversations** tab.

## 24-hour messaging window

WhatsApp waxay ku xirtaa 24-saacadood messaging window:
- Waxaad u jawaabi kartaa user within 24 hours of their last message
- Kadib 24 hours, waa inaad isticmaashaa approved **template message** si aad dib u bilaabto conversation
- Llamenos waxay ku maamushan tani si otomaatig ah -- haddii window-ka dhacay, waxay soo dirtaa template message si ay dib u bilaabto conversation

## Media support

WhatsApp waxay taageertaa rich media messages:
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Location** sharing
- **Interactive** buttons and list messages

Media attachments way soo muuqanayaan inline in conversation view.

## Security notes

- WhatsApp waxay isticmaashaa end-to-end encryption between user and Meta's infrastructure
- Meta technically waxay awood u leedahay inay access gareyso message content on their servers
- Messages waxaa loo encrypt gareeyaa on receipt oo waxaa lagu kaydiyaa database
- Webhook signatures waxaa la validate gareeyaa iyadoo isticmaalayo HMAC-SHA256 with your app secret
- For maximum privacy, consider isticmaalka Signal beddelka WhatsApp
