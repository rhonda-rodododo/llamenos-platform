---
title: "Setup: SMS"
description: Enable inbound and outbound SMS messaging via your telephony provider.
---

SMS messaging in Llamenos waxay dib u isticmaashaa existing voice telephony provider credentials-kaaga. Ma u baahnato separate SMS service -- haddii horey uu configure gareysay Twilio, SignalWire, Vonage, ama Plivo for voice, SMS waxay shaqaysaa with the same account.

## Supported providers

| Provider | SMS Support | Notes |
|----------|------------|-------|
| **Twilio** | Yes | Full two-way SMS via Twilio Messaging API |
| **SignalWire** | Yes | Compatible with Twilio API -- same interface |
| **Vonage** | Yes | SMS via Vonage REST API |
| **Plivo** | Yes | SMS via Plivo Message API |
| **Asterisk** | No | Asterisk ma taageerto native SMS |

## 1. Enable SMS in admin settings

Aad u guur **Admin Settings > Messaging Channels** (ama isticmaal setup wizard on first login) oo toggle **SMS** on.

Configure SMS settings:
- **Auto-response message** — optional welcome message sent to first-time contacts
- **After-hours response** — optional message sent outside shift hours

## 2. Configure the webhook

U jeedi SMS webhook-ka telephony provider-kaaga server-kaaga:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Aad u guur Twilio Console > Phone Numbers > Active Numbers
2. Dooro phone number-kaaga
3. Under **Messaging**, set webhook URL for "A message comes in" to URL above
4. Set HTTP method to **POST**

### Vonage

1. Aad u guur Vonage API Dashboard > Applications
2. Dooro application-kaaga
3. Under **Messages**, set Inbound URL to webhook URL above

### Plivo

1. Aad u guur Plivo Console > Messaging > Applications
2. Create ama wax ka beddel messaging application
3. Set Message URL to webhook URL above
4. Assign application-ka to phone number-kaaga

## 3. Test

Send SMS to hotline phone number-kaaga. Waa inaad aragto wadahadka soo muuqda in **Conversations** tab in admin panel.

## How it works

1. SMS wuxuu yimaadaa provider-kaaga, taasoo soo diraysa webhook to your server
2. Server-ka waxay validate gareysaa webhook signature (provider-specific HMAC)
3. Farriintu way parse gareysaa oo waxay ku kaydsan tahay ConversationService
4. On-shift volunteers waxaa loo soo gudbinayaa via WebSocket relay events
5. Volunteers ka jawaabayaan from Conversations tab — responses waxay la soo noqdaan via provider-kaaga SMS API

## Security notes

- SMS messages waxay marayaan carrier network in plaintext -- provider-kaaga iyo carriers waxay akhriyi karaan
- Inbound messages waxaa loo encrypt gareeyaa on receipt oo waxaa lagu kaydiyaa database
- Sender phone numbers waxaa loo hash gareeyaa before storage (privacy)
- Webhook signatures waxaa la validate gareeyaa per-provider (HMAC-SHA1 for Twilio, etc.)
