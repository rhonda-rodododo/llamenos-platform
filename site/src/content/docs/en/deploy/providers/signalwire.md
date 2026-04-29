---
title: "Setup: SignalWire"
description: Step-by-step guide to configure SignalWire as your telephony provider.
---

SignalWire is a cost-effective alternative to Twilio with a compatible API. It uses LaML (a TwiML-compatible markup language), so migrating between Twilio and SignalWire is straightforward.

## Prerequisites

- A [SignalWire account](https://signalwire.com/signup) (free trial available)
- Your Llamenos instance deployed and accessible via a public URL

## 1. Create a SignalWire account

Sign up at [signalwire.com/signup](https://signalwire.com/signup). During signup, you will choose a **Space name** (e.g., `myhotline`). Your Space URL will be `myhotline.signalwire.com`. Note this name -- you will need it in the configuration.

## 2. Buy a phone number

1. In your SignalWire Dashboard, go to **Phone Numbers**
2. Click **Buy a Phone Number**
3. Search for a number with voice capability
4. Purchase the number

## 3. Get your credentials

1. Go to **API** in the SignalWire Dashboard
2. Find your **Project ID** (this functions as the Account SID)
3. Create a new **API Token** if you don't have one -- this functions as the Auth Token

## 4. Configure webhooks

1. Go to **Phone Numbers** in the dashboard
2. Click your hotline number
3. Under **Voice Settings**, set:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Configure in Llamenos

1. Log in as admin
2. Go to **Settings** > **Telephony Provider**
3. Select **SignalWire** from the provider dropdown
4. Enter:
   - **Account SID**: your Project ID from step 3
   - **Auth Token**: your API Token from step 3
   - **SignalWire Space**: your Space name (just the name, not the full URL -- e.g., `myhotline`)
   - **Phone Number**: the number you bought (E.164 format)
5. Click **Save**

## 6. Test the setup

Call your hotline number. You should hear the language selection menu followed by the call flow.

## WebRTC setup (optional)

SignalWire WebRTC uses the same API key pattern as Twilio:

1. In your SignalWire Dashboard, create an **API Key** under **API** > **Tokens**
2. Create a **LaML Application**:
   - Go to **LaML** > **LaML Applications**
   - Set the Voice URL to `https://your-domain.com/api/telephony/webrtc-incoming`
   - Note the Application SID
3. In Llamenos, go to **Settings** > **Telephony Provider**
4. Toggle **WebRTC Calling** on
5. Enter the API Key SID, API Key Secret, and Application SID
6. Click **Save**

## Differences from Twilio

- **LaML vs TwiML**: SignalWire uses LaML, which is functionally identical to TwiML. Llamenos handles this automatically.
- **Space URL**: API calls go to `{space}.signalwire.com` instead of `api.twilio.com`. The adapter handles this via the Space name you provide.
- **Pricing**: SignalWire is generally 30-40% cheaper than Twilio for voice calls.
- **Feature parity**: All Llamenos features (recording, transcription, CAPTCHA, voicemail) work identically with SignalWire.

## Troubleshooting

- **"Space not found" errors**: Double-check the Space name (just the subdomain, not the full URL).
- **Webhook failures**: Ensure your server URL is publicly accessible and uses HTTPS.
- **API token issues**: SignalWire tokens can expire. Create a new token if you get authentication errors.
