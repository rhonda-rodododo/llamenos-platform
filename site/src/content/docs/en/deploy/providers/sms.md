---
title: "Setup: SMS"
description: Enable inbound and outbound SMS messaging via your telephony provider.
---

SMS messaging in Llamenos reuses your existing voice telephony provider credentials. No separate SMS service is required — if you've already configured Twilio, SignalWire, Vonage, or Plivo for voice, SMS works with the same account.

## Supported providers

| Provider | SMS Support | Notes |
|----------|------------|-------|
| **Twilio** | Yes | Full two-way SMS via Twilio Messaging API |
| **SignalWire** | Yes | Compatible with Twilio API — same interface |
| **Vonage** | Yes | SMS via Vonage REST API |
| **Plivo** | Yes | SMS via Plivo Message API |
| **Asterisk** | No | Asterisk does not support native SMS |

## 1. Enable SMS in admin settings

Navigate to **Admin Settings > Messaging Channels** (or use the setup wizard on first login) and toggle **SMS** on.

Configure the SMS settings:
- **Auto-response message** — optional welcome message sent to first-time contacts
- **After-hours response** — optional message sent outside shift hours

## 2. Configure the webhook

Point your telephony provider's SMS webhook to your server:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Go to your Twilio Console > Phone Numbers > Active Numbers
2. Select your phone number
3. Under **Messaging**, set the webhook URL for "A message comes in" to the URL above
4. Set the HTTP method to **POST**

### Vonage

1. Go to the Vonage API Dashboard > Applications
2. Select your application
3. Under **Messages**, set the Inbound URL to the webhook URL above

### Plivo

1. Go to the Plivo Console > Messaging > Applications
2. Create or edit a messaging application
3. Set the Message URL to the webhook URL above
4. Assign the application to your phone number

## 3. Test

Send an SMS to your hotline phone number. You should see the conversation appear in the **Conversations** tab in the admin panel.

## How it works

1. An SMS arrives at your provider, which sends a webhook to your server
2. The server validates the webhook signature (provider-specific HMAC)
3. The message is parsed and stored in the ConversationService
4. On-shift volunteers are notified via Nostr relay events
5. Volunteers reply from the Conversations tab — responses are sent back via your provider's SMS API

## Security notes

- SMS messages traverse the carrier network in plaintext — your provider and carriers can read them
- Inbound messages are encrypted on receipt and stored in the database
- Sender phone numbers are hashed before storage (privacy)
- Webhook signatures are validated per-provider (HMAC-SHA1 for Twilio, etc.)
