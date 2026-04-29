---
title: "Setup: Plivo"
description: Step-by-step guide to configure Plivo as your telephony provider.
---

Plivo is a budget-friendly cloud telephony provider with a straightforward API. It uses XML-based call control similar to TwiML, making integration with Llamenos seamless.

## Prerequisites

- A [Plivo account](https://console.plivo.com/accounts/register/) (trial credit available)
- Your Llamenos instance deployed and accessible via a public URL

## 1. Create a Plivo account

Sign up at [console.plivo.com](https://console.plivo.com/accounts/register/). After verification, you can find your **Auth ID** and **Auth Token** on the dashboard home page.

## 2. Buy a phone number

1. Go to **Phone Numbers** > **Buy Numbers** in the Plivo Console
2. Select your country and search for numbers with voice capability
3. Purchase a number

## 3. Create an XML application

Plivo uses "XML Applications" to route calls:

1. Go to **Voice** > **XML Applications**
2. Click **Add New Application**
3. Configure:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Save the application

## 4. Link the phone number

1. Go to **Phone Numbers** > **Your Numbers**
2. Click on your hotline number
3. Under **Voice**, select the XML Application you created in step 3
4. Save

## 5. Configure in Llamenos

1. Log in as admin
2. Go to **Settings** > **Telephony Provider**
3. Select **Plivo** from the provider dropdown
4. Enter:
   - **Auth ID**: from the Plivo Console dashboard
   - **Auth Token**: from the Plivo Console dashboard
   - **Phone Number**: the number you bought (E.164 format)
5. Click **Save**

## 6. Test the setup

Call your hotline number. You should hear the language selection menu and be routed through the normal call flow.

## WebRTC setup (optional)

Plivo WebRTC uses the Browser SDK with your existing credentials:

1. Go to **Voice** > **Endpoints** in the Plivo Console
2. Create a new endpoint (this acts as the browser phone identity)
3. In Llamenos, go to **Settings** > **Telephony Provider**
4. Toggle **WebRTC Calling** on
5. Click **Save**

The adapter generates time-limited HMAC tokens from your Auth ID and Auth Token for secure browser authentication.

## Plivo-specific notes

- **XML vs TwiML**: Plivo uses its own XML format for call control, which is similar but not identical to TwiML. The Llamenos adapter generates the correct Plivo XML automatically.
- **Answer URL vs Hangup URL**: Plivo separates the initial call handler (Answer URL) from the call end handler (Hangup URL), unlike Twilio which uses a single status callback.
- **Rate limits**: Plivo has API rate limits that vary by account tier. For high-volume hotlines, contact Plivo support to increase limits.

## Troubleshooting

- **"Auth ID invalid"**: The Auth ID is not your email address. Find it on the Plivo Console dashboard home page.
- **Calls not routing**: Verify that the phone number is linked to the correct XML Application.
- **Answer URL errors**: Plivo expects valid XML responses. Check your server logs for response errors.
- **Outbound call restrictions**: Trial accounts have limitations on outbound calling. Upgrade for production use.
