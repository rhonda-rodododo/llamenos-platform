---
title: "Setup: Vonage"
description: Step-by-step guide to configure Vonage as your telephony provider.
---

Vonage (horey loo yaqaan Nexmo) waxay bixisaa international coverage xooggan iyo qiimo tartami leh. Waxay isticmaashaa API model kala duwan Twilio -- Vonage Applications waxay ururiyaan number-kaaga, webhooks, iyo credentials-kaaga isku meel.

## Prerequisites

- [Vonage account](https://dashboard.nexmo.com/sign-up) (free credit available)
- Your Llamenos instance deployed oo la heli karo via public URL

## 1. Create a Vonage account

Isu diiwaan geli at [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Verify account-kaaga oo xasuusnow **API Key** iyo **API Secret** from dashboard home page.

## 2. Buy a phone number

1. Aad u guur **Numbers** > **Buy numbers** in Vonage Dashboard
2. Dooro country-kaaga oo dooro number leh **Voice** capability
3. Iibso number-ka

## 3. Create a Vonage Application

Vonage waxay ururisaa configuration into "Applications":

1. Aad u guur **Applications** > **Create a new application**
2. Geli magac (e.g., "Llamenos Hotline")
3. Under **Voice**, toggle it on oo set:
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Guji **Generate new application**
5. Keyd **Application ID** shown on confirmation page
6. Download **private key** file -- waxaad u baahan doontaa contents-kiisa for configuration

## 4. Link the phone number

1. Aad u guur **Numbers** > **Your numbers**
2. Guji gear icon-ka ku xiga hotline number-kaaga
3. Under **Voice**, dooro Application aad sameysay in step 3
4. Guji **Save**

## 5. Configure in Llamenos

1. Log in as admin
2. Aad u guur **Settings** > **Telephony Provider**
3. Dooro **Vonage** from provider dropdown
4. Geli:
   - **API Key**: from Vonage Dashboard home page
   - **API Secret**: from Vonage Dashboard home page
   - **Application ID**: from step 3
   - **Phone Number**: number-ka aad iibsatey (E.164 format)
5. Guji **Save**

## 6. Test the setup

Wac hotline number-kaaga. Waa inaad maqashaa language selection menu. Verify in calls u gudbaan to on-shift volunteers.

## WebRTC setup (optional)

Vonage WebRTC waxay isticmaashaa Application credentials aad horey u sameysay:

1. In Llamenos, aad u guur **Settings** > **Telephony Provider**
2. Toggle **WebRTC Calling** on
3. Geli **Private Key** contents (full PEM text from file aad download-gareysay)
4. Guji **Save**

Application ID horey ayaa la configure gareeyay. Vonage waxay soo saartaa RS256 JWTs iyadoo isticmaashaa private key for browser authentication.

## Vonage-specific notes

- **NCCO vs TwiML**: Vonage waxay isticmaashaa NCCO (Nexmo Call Control Objects) in JSON format beddelka XML markup. Llamenos adapter-ka waxay si otomaatig ah u soo saartaa format saxda ah.
- **Answer URL format**: Vonage waxay expect gareysaa in answer URL uu soo celiyo JSON (NCCO), ma aha XML. Tani waxaa ku maamula adapter-ka.
- **Event URL**: Vonage waxay soo diraysaa call events (ringing, answered, completed) to event URL as JSON POST requests.
- **Private key security**: Private key-ga waxaa lagu kaydiyaa encrypted. Marnaba ma ka tagayo server-ka -- waxaa la isticmaalaa kaliya in lagu soo saaro short-lived JWT tokens.

## Troubleshooting

- **"Application not found"**: Verify in Application ID uu iswaafaqsan yahay si sax ah. Waxaad ka heli kartaa under **Applications** in Vonage Dashboard.
- **No incoming calls**: Hubi in phone number-ka uu isku xiran yahay Application saxda ah (step 4).
- **Private key errors**: Paste full PEM content including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.
- **International number formatting**: Vonage waxay u baahan tahay E.164 format. Soo dar `+` and country code.
