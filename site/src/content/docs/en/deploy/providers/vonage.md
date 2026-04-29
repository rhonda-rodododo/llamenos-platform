---
title: "Setup: Vonage"
description: Step-by-step guide to configure Vonage as your telephony provider.
---

Vonage (formerly Nexmo) offers strong international coverage and competitive pricing. It uses a different API model than Twilio -- Vonage Applications group your number, webhooks, and credentials together.

## Prerequisites

- A [Vonage account](https://dashboard.nexmo.com/sign-up) (free credit available)
- Your Llamenos instance deployed and accessible via a public URL

## 1. Create a Vonage account

Sign up at the [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Verify your account and note your **API Key** and **API Secret** from the dashboard home page.

## 2. Buy a phone number

1. Go to **Numbers** > **Buy numbers** in the Vonage Dashboard
2. Select your country and choose a number with **Voice** capability
3. Purchase the number

## 3. Create a Vonage Application

Vonage groups configuration into "Applications":

1. Go to **Applications** > **Create a new application**
2. Enter a name (e.g., "Llamenos Hotline")
3. Under **Voice**, toggle it on and set:
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Click **Generate new application**
5. Save the **Application ID** shown on the confirmation page
6. Download the **private key** file -- you will need its contents for configuration

## 4. Link the phone number

1. Go to **Numbers** > **Your numbers**
2. Click the gear icon next to your hotline number
3. Under **Voice**, select the Application you created in step 3
4. Click **Save**

## 5. Configure in Llamenos

1. Log in as admin
2. Go to **Settings** > **Telephony Provider**
3. Select **Vonage** from the provider dropdown
4. Enter:
   - **API Key**: from the Vonage Dashboard home page
   - **API Secret**: from the Vonage Dashboard home page
   - **Application ID**: from step 3
   - **Phone Number**: the number you bought (E.164 format)
5. Click **Save**

## 6. Test the setup

Call your hotline number. You should hear the language selection menu. Verify that calls route to on-shift volunteers.

## WebRTC setup (optional)

Vonage WebRTC uses the Application credentials you already created:

1. In Llamenos, go to **Settings** > **Telephony Provider**
2. Toggle **WebRTC Calling** on
3. Enter the **Private Key** contents (the full PEM text from the file you downloaded)
4. Click **Save**

The Application ID is already configured. Vonage generates RS256 JWTs using the private key for browser authentication.

## Vonage-specific notes

- **NCCO vs TwiML**: Vonage uses NCCO (Nexmo Call Control Objects) in JSON format instead of XML markup. The Llamenos adapter generates the correct format automatically.
- **Answer URL format**: Vonage expects the answer URL to return JSON (NCCO), not XML. This is handled by the adapter.
- **Event URL**: Vonage sends call events (ringing, answered, completed) to the event URL as JSON POST requests.
- **Private key security**: The private key is stored encrypted. It never leaves the server -- it is only used to generate short-lived JWT tokens.

## Troubleshooting

- **"Application not found"**: Verify the Application ID matches exactly. You can find it under **Applications** in the Vonage Dashboard.
- **No incoming calls**: Make sure the phone number is linked to the correct Application (step 4).
- **Private key errors**: Paste the full PEM content including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.
- **International number formatting**: Vonage requires E.164 format. Include the `+` and country code.
