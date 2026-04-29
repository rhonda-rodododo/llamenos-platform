---
title: "Setup: WhatsApp"
description: Connect WhatsApp Business via the Meta Cloud API for encrypted messaging.
---

Llamenos supports WhatsApp Business messaging via the Meta Cloud API (Graph API v21.0). WhatsApp enables rich messaging with support for text, images, documents, audio, and interactive messages.

## Prerequisites

- A [Meta Business account](https://business.facebook.com)
- A WhatsApp Business API phone number
- A Meta developer app with WhatsApp product enabled

## Integration modes

Llamenos supports two WhatsApp integration modes:

### Meta Direct (recommended)

Connect directly to the Meta Cloud API. Offers full control and all features.

**Required credentials:**
- **Phone Number ID** — your WhatsApp Business phone number ID
- **Business Account ID** — your Meta Business Account ID
- **Access Token** — a long-lived Meta API access token
- **Verify Token** — a custom string you choose for webhook verification
- **App Secret** — your Meta app secret (for webhook signature validation)

### Twilio mode

If you already use Twilio for voice, you can route WhatsApp through your Twilio account. Simpler setup, but some features may be limited.

**Required credentials:**
- Your existing Twilio Account SID, Auth Token, and a Twilio-connected WhatsApp sender

## 1. Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app (type: Business)
3. Add the **WhatsApp** product
4. In WhatsApp > Getting Started, note your **Phone Number ID** and **Business Account ID**
5. Generate a permanent access token (Settings > Access Tokens)

## 2. Configure the webhook

In the Meta developer dashboard:

1. Go to WhatsApp > Configuration > Webhook
2. Set the Callback URL to:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Set the Verify Token to the same string you'll enter in Llamenos admin settings
4. Subscribe to the `messages` webhook field

Meta will send a GET request to verify the webhook. Your server will respond with the challenge if the verify token matches.

## 3. Enable WhatsApp in admin settings

Navigate to **Admin Settings > Messaging Channels** (or use the setup wizard) and toggle **WhatsApp** on.

Select **Meta Direct** or **Twilio** mode and enter the required credentials.

Configure optional settings:
- **Auto-response message** — sent to first-time contacts
- **After-hours response** — sent outside shift hours

## 4. Test

Send a WhatsApp message to your Business phone number. The conversation should appear in the **Conversations** tab.

## 24-hour messaging window

WhatsApp enforces a 24-hour messaging window:
- You can reply to a user within 24 hours of their last message
- After 24 hours, you must use an approved **template message** to re-initiate the conversation
- Llamenos handles this automatically — if the window has expired, it sends a template message to restart the conversation

## Media support

WhatsApp supports rich media messages:
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Location** sharing
- **Interactive** buttons and list messages

Media attachments appear inline in the conversation view.

## Security notes

- WhatsApp uses end-to-end encryption between the user and Meta's infrastructure
- Meta can technically access message content on their servers
- Messages are encrypted on receipt and stored in the database
- Webhook signatures are validated using HMAC-SHA256 with your app secret
- For maximum privacy, consider using Signal instead of WhatsApp
