---
title: "Setup: SMS"
description: I-enable ang inbound at outbound SMS messaging sa pamamagitan ng iyong telephony provider.
---

Ginagamit ng SMS messaging sa Llamenos ang iyong umiiral na voice telephony provider credentials. Hindi kailangan ng hiwalay na SMS service — kung na-configure mo na ang Twilio, SignalWire, Vonage, o Plivo para sa voice, gumagana ang SMS gamit ang parehong account.

## Mga sinusuportahang provider

| Provider | SMS Support | Mga Tala |
|----------|------------|----------|
| **Twilio** | Oo | Buong two-way SMS sa pamamagitan ng Twilio Messaging API |
| **SignalWire** | Oo | Compatible sa Twilio API — parehong interface |
| **Vonage** | Oo | SMS sa pamamagitan ng Vonage REST API |
| **Plivo** | Oo | SMS sa pamamagitan ng Plivo Message API |
| **Asterisk** | Hindi | Hindi sinusuportahan ng Asterisk ang native SMS |

## 1. I-enable ang SMS sa admin settings

Mag-navigate sa **Admin Settings > Messaging Channels** (o gamitin ang setup wizard sa unang login) at i-toggle ang **SMS** na naka-on.

I-configure ang mga SMS setting:
- **Auto-response message** — opsyonal na welcome message na ipinapadala sa mga unang beses na nag-contact
- **After-hours response** — opsyonal na mensahe na ipinapadala sa labas ng mga shift hours

## 2. I-configure ang webhook

Ituro ang SMS webhook ng iyong telephony provider sa iyong Worker:

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Pumunta sa Twilio Console > Phone Numbers > Active Numbers
2. Piliin ang iyong numero ng telepono
3. Sa ilalim ng **Messaging**, itakda ang webhook URL para sa "A message comes in" sa URL sa itaas
4. Itakda ang HTTP method sa **POST**

### Vonage

1. Pumunta sa Vonage API Dashboard > Applications
2. Piliin ang iyong application
3. Sa ilalim ng **Messages**, itakda ang Inbound URL sa webhook URL sa itaas

### Plivo

1. Pumunta sa Plivo Console > Messaging > Applications
2. Gumawa o mag-edit ng messaging application
3. Itakda ang Message URL sa webhook URL sa itaas
4. I-assign ang application sa iyong numero ng telepono

## 3. Pagsubok

Magpadala ng SMS sa iyong hotline phone number. Dapat makita mo ang conversation na lumabas sa **Conversations** tab sa admin panel.

## Paano ito gumagana

1. Dumarating ang SMS sa iyong provider, na nagpapadala ng webhook sa iyong Worker
2. Vine-validate ng Worker ang webhook signature (provider-specific HMAC)
3. Ang mensahe ay pine-parse at iniimbak sa ConversationDO
4. Nino-notify ang mga on-shift na volunteer sa pamamagitan ng Nostr relay events
5. Tumutugon ang mga volunteer mula sa Conversations tab — ang mga sagot ay ipinapadala pabalik sa pamamagitan ng SMS API ng iyong provider

## Mga tala sa seguridad

- Ang mga SMS message ay dumadaan sa carrier network bilang plaintext — mababasa ito ng iyong provider at ng mga carrier
- Ang mga inbound message ay iniimbak sa ConversationDO pagkatapos dumating
- Ang mga numero ng telepono ng nagpadala ay hina-hash bago i-store (privacy)
- Ang mga webhook signature ay vine-validate ayon sa provider (HMAC-SHA1 para sa Twilio, atbp.)
