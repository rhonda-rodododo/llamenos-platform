---
title: "Ruchojmil: WhatsApp"
description: Tokisäx WhatsApp Business via ri Meta Cloud API richin encrypted messaging.
---

Llamenos nrokisaj WhatsApp Business messaging via ri Meta Cloud API (Graph API v21.0). WhatsApp nuya' rich messaging rik'in support richin text, images, documents, audio, chuqa' interactive taq tzij.

## Taq k'ayewal

- Jun [Meta Business account](https://business.facebook.com)
- Jun WhatsApp Business API phone number
- Jun Meta developer app rik'in WhatsApp product enabled

## Integration taq b'ey

Llamenos nrokisaj ka'i' WhatsApp integration taq b'ey:

### Meta Direct (nuchilab'ej)

Tokisäx directly pa ri Meta Cloud API. Nuya' full control chuqa' konojel taq features.

**Ruk'utun taq ewan taq tzij:**
- **Phone Number ID** — aw WhatsApp Business phone number ID
- **Business Account ID** — aw Meta Business Account ID
- **Access Token** — jun long-lived Meta API access token
- **Verify Token** — jun custom string xacha' richin webhook verification
- **App Secret** — aw Meta app secret (richin webhook signature validation)

### Twilio ruwäch

We chik nawokisaj Twilio richin voice, yatikïr nub'än WhatsApp through aw Twilio account. Utziläj ruchojmil, pero jujun taq features yek'atzin chi e limited.

**Ruk'utun taq ewan taq tzij:**
- Aw existing Twilio Account SID, Auth Token, chuqa' jun Twilio-connected WhatsApp sender

## 1. Titz'uk jun Meta app

1. Katb'e pa [developers.facebook.com](https://developers.facebook.com)
2. Titz'uk jun k'ak'a' app (ruwäch: Business)
3. Titz'aqatisaj ri **WhatsApp** product
4. Pa WhatsApp > Getting Started, tatz'eta' aw **Phone Number ID** chuqa' **Business Account ID**
5. Titz'uk jun permanent access token (Settings > Access Tokens)

## 2. Ruchojmil ri webhook

Pa ri Meta developer dashboard:

1. Katb'e pa WhatsApp > Configuration > Webhook
2. Tiya' ri Callback URL pa:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Tiya' ri Verify Token pa ri junam string xatz'ub'aj pa Llamenos admin ruchojmil
4. Titz'aqatisaj pa ri `messages` webhook field

Meta nitaq jun GET request richin nitz'akaj ri webhook. Awachib'al ruk'u'x samaj nuya' ri challenge we ri verify token nik'oj.

## 3. Titz'ij'ij' WhatsApp pa admin ruchojmil

Katb'e pa **Admin Settings > Messaging Channels** (o tokisäx ri setup wizard) chuqa' titz'ij'ij' **WhatsApp**.

Tacha' **Meta Direct** o **Twilio** ruwäch chuqa' tiya' ri ruk'utun taq ewan taq tzij.

Ruchojmil rucha'ik taq ruchojmil:
- **Auto-response message** — titaq pa first-time contacts
- **After-hours response** — titaq outside shift hours

## 4. Tojtob'en

Titaq jun WhatsApp message pa aw Business phone number. Ri conversation k'o chi nuk'ut pa ri **Conversations** tab.

## 24-hour messaging window

WhatsApp nuchajij' jun 24-hour messaging window:
- Yatikïr natzij' pa jun user within 24 hours of ri ruk'isanem message
- Chuwäch 24 hours, xaraj nokisaj jun approved **template message** richin re-initiate ri conversation
- Llamenos nub'än re' automatically — we ri window xtz'api', nitaq jun template message richin titikirisaj chik ri conversation

## Media support

WhatsApp nrokisaj rich media taq tzij:
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Location** sharing
- **Interactive** buttons chuqa' list taq tzij

Media attachments nik'ut inline pa ri conversation view.

## Taq rutzijol rutzil

- WhatsApp nrokisaj end-to-end encryption pa ri user chuqa' Meta's infrastructure
- Meta yatikïr technically okem message content pa ri taq ruk'u'x samaj
- Taq tzij nitz'akaj pa receipt chuqa' niyak pa ri ruk'u'x tzij
- Webhook signatures nitz'akaj rokisaxik HMAC-SHA256 rik'in aw app secret
- Richin ruk'u'x samaj rutzil, tacha' Signal instead of WhatsApp
