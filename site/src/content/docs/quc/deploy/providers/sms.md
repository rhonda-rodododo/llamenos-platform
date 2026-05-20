---
title: "Ruchojmil: SMS"
description: Titz'ij'ij' inbound chuqa' outbound SMS messaging via aw telephony provider.
---

SMS messaging pa Llamenos nrokisaj aw existing voice telephony provider taq ewan taq tzij. Majun separate SMS samaj rajowaxik — we xatz'ub'aj chik Twilio, SignalWire, Vonage, o Plivo richin voice, SMS samajin rik'in ri junam account.

## Taq providers nik'oj

| Provider | SMS Support | Taq rutzijol |
|----------|------------|-------|
| **Twilio** | Yes | Full two-way SMS via Twilio Messaging API |
| **SignalWire** | Yes | Compatible rik'in Twilio API — junam interface |
| **Vonage** | Yes | SMS via Vonage REST API |
| **Plivo** | Yes | SMS via Plivo Message API |
| **Asterisk** | No | Asterisk man nrokisaj ta native SMS |

## 1. Titz'ij'ij' SMS pa admin ruchojmil

Katb'e pa **Admin Settings > Messaging Channels** (o tokisäx ri setup wizard pa rutikirib'al okem) chuqa' titz'ij'ij' **SMS**.

Ruchojmil ri SMS ruchojmil:
- **Auto-response message** — rucha'ik welcome message titaq pa first-time contacts
- **After-hours response** — rucha'ik message titaq outside shift hours

## 2. Ruchojmil ri webhook

Tiya' aw telephony provider's SMS webhook pa awachib'al:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Katb'e pa aw Twilio Console > Phone Numbers > Active Numbers
2. Tacha' aw phone number
3. Pa **Messaging**, tiya' ri webhook URL richin "A message comes in" pa ri URL above
4. Tiya' ri HTTP method pa **POST**

### Vonage

1. Katb'e pa ri Vonage API Dashboard > Applications
2. Tacha' aw application
3. Pa **Messages**, tiya' ri Inbound URL pa ri webhook URL above

### Plivo

1. Katb'e pa ri Plivo Console > Messaging > Applications
2. Titz'uk o tijal jun messaging application
3. Tiya' ri Message URL pa ri webhook URL above
4. Titz'ajij' ri application pa aw phone number

## 3. Tojtob'en

Titaq jun SMS pa awachib'al hotline phone number. Yatikïr nab'än ri conversation pa ri **Conversations** tab pa ri admin panel.

## Achike rub'eyal nisamäj

1. Jun SMS nok pa aw provider, ri nuya' jun webhook pa awachib'al
2. Ri ruk'u'x samaj nitz'akaj ri webhook signature (provider-specific HMAC)
3. Ri message nitz'akaj chuqa' niyak pa ri ConversationService
4. On-shift taq volunteers nik'ut via WebSocket relay taq samajib'äl
5. Taq volunteers nitzij' pa ri Conversations tab — taq responses netaq chik via aw provider's SMS API

## Taq rutzijol rutzil

- SMS taq tzij b'ey pa ri carrier network pa plaintext — aw provider chuqa' carriers yatikïr nik'ul
- Inbound taq tzij nitz'akaj pa receipt chuqa' niyak pa ri ruk'u'x tzij
- Sender phone numbers nitz'akaj chuwäch storage (privacy)
- Webhook signatures nitz'akaj per-provider (HMAC-SHA1 richin Twilio, etc.)
