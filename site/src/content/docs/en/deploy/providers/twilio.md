---
title: "Setup: Twilio"
description: Step-by-step guide to configure Twilio as your telephony provider.
---

Twilio is the default telephony provider for Llamenos and the easiest to get started with. This guide walks through account creation, phone number setup, and webhook configuration.

## Prerequisites

- A [Twilio account](https://www.twilio.com/try-twilio) (free trial works for testing)
- Your Llamenos instance deployed and accessible via a public URL

## 1. Create a Twilio account

Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verify your email and phone number. Twilio provides trial credit for testing.

## 2. Buy a phone number

1. Go to **Phone Numbers** > **Manage** > **Buy a number** in the Twilio Console
2. Search for a number with **Voice** capability in your desired area code
3. Click **Buy** and confirm

Save this number -- you will enter it in Llamenos admin settings.

## 3. Get your Account SID and Auth Token

1. Go to the [Twilio Console dashboard](https://console.twilio.com)
2. Find your **Account SID** and **Auth Token** on the main page
3. Click the eye icon to reveal the Auth Token

## 4. Configure webhooks

In the Twilio Console, navigate to your phone number's configuration:

1. Go to **Phone Numbers** > **Manage** > **Active Numbers**
2. Click your hotline number
3. Under **Voice Configuration**, set:
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

Replace `your-domain.com` with your actual Llamenos deployment URL.

## 5. Configure in Llamenos

1. Log in as admin
2. Go to **Settings** > **Telephony Provider**
3. Select **Twilio** from the provider dropdown
4. Enter:
   - **Account SID**: from step 3
   - **Auth Token**: from step 3
   - **Phone Number**: the number you bought (E.164 format, e.g., `+15551234567`)
5. Click **Save**

## 6. Test the setup

Call your hotline number from a phone. You should hear the language selection menu. If you have volunteers on shift, the call will ring through.

## WebRTC setup (optional)

To enable volunteers to answer calls in their browser instead of their phone:

### Create an API Key

1. Go to **Account** > **API keys & tokens** in the Twilio Console
2. Click **Create API Key**
3. Choose **Standard** key type
4. Save the **SID** and **Secret** -- the secret is shown only once

### Create a TwiML App

1. Go to **Voice** > **Manage** > **TwiML Apps**
2. Click **Create new TwiML App**
3. Set the **Voice Request URL** to `https://your-domain.com/api/telephony/webrtc-incoming`
4. Save and note the **App SID**

### Enable in Llamenos

1. Go to **Settings** > **Telephony Provider**
2. Toggle **WebRTC Calling** on
3. Enter:
   - **API Key SID**: from the API key you created
   - **API Key Secret**: from the API key you created
   - **TwiML App SID**: from the TwiML App you created
4. Click **Save**

See [WebRTC Browser Calling](/docs/deploy/providers/webrtc) for volunteer setup and troubleshooting.

## Troubleshooting

- **Calls not arriving**: Verify the webhook URL is correct and your server is deployed. Check the Twilio Console error logs.
- **"Invalid webhook" errors**: Make sure the webhook URL uses HTTPS and returns valid TwiML.
- **Trial account limitations**: Trial accounts can only call verified numbers. Upgrade to a paid account for production use.
- **Webhook validation failures**: Ensure the Auth Token in Llamenos matches the one in Twilio Console.
