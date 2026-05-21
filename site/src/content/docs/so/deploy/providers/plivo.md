---
title: "Setup: Plivo"
description: Step-by-step guide to configure Plivo as your telephony provider.
---

Plivo waa cloud telephony provider qiimo jaban with a straightforward API. Waxay isticmaashaa XML-based call control similar to TwiML, sidaas darteed integration with Llamenos waa mid fudud.

## Prerequisites

- [Plivo account](https://console.plivo.com/accounts/register/) (trial credit available)
- Your Llamenos instance deployed oo la heli karo via public URL

## 1. Create a Plivo account

Isu diiwaan geli at [console.plivo.com](https://console.plivo.com/accounts/register/). Kadib verification, waxaad ka heli kartaa **Auth ID** iyo **Auth Token** on dashboard home page.

## 2. Buy a phone number

1. Aad u guur **Phone Numbers** > **Buy Numbers** in Plivo Console
2. Dooro country-kaaga oo raadi numbers with voice capability
3. Iibso number

## 3. Create an XML application

Plivo waxay isticmaashaa "XML Applications" si ay u gudbiso calls:

1. Aad u guur **Voice** > **XML Applications**
2. Guji **Add New Application**
3. Configure:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Keyd application-ka

## 4. Link the phone number

1. Aad u guur **Phone Numbers** > **Your Numbers**
2. Guji hotline number-kaaga
3. Under **Voice**, dooro XML Application aad sameysay in step 3
4. Keyd

## 5. Configure in Llamenos

1. Log in as admin
2. Aad u guur **Settings** > **Telephony Provider**
3. Dooro **Plivo** from provider dropdown
4. Geli:
   - **Auth ID**: from Plivo Console dashboard
   - **Auth Token**: from Plivo Console dashboard
   - **Phone Number**: number-ka aad iibsatey (E.164 format)
5. Guji **Save**

## 6. Test the setup

Wac hotline number-kaaga. Waa inaad maqashaa language selection menu oo aad u gudubto normal call flow.

## WebRTC setup (optional)

Plivo WebRTC waxay isticmaashaa Browser SDK with your existing credentials:

1. Aad u guur **Voice** > **Endpoints** in Plivo Console
2. Create a new endpoint (tani waxay howl gelisaa browser phone identity)
3. In Llamenos, aad u guur **Settings** > **Telephony Provider**
4. Toggle **WebRTC Calling** on
5. Guji **Save**

Adapter-ka waxay soo saartaa time-limited HMAC tokens from your Auth ID and Auth Token for secure browser authentication.

## Plivo-specific notes

- **XML vs TwiML**: Plivo waxay isticmaashaa XML format-kaaga u gaarka ah for call control, taas oo la mid laakiin aan isku mid ahayn TwiML. Llamenos adapter-ka waxay si otomaatig ah u soo saartaa saxda ah Plivo XML.
- **Answer URL vs Hangup URL**: Plivo waxay kala saartaa initial call handler (Answer URL) from call end handler (Hangup URL), unlike Twilio oo isticmaasho single status callback.
- **Rate limits**: Plivo waxay leedahay API rate limits ku kala duwan account tier. For high-volume hotlines, la xidhiidh Plivo support si aad u kordhiso limits.

## Troubleshooting

- **"Auth ID invalid"**: Auth ID ma aha email-kaaga. Hel on Plivo Console dashboard home page.
- **Calls not routing**: Verify in phone number-ka uu isku xiran yahay XML Application saxda ah.
- **Answer URL errors**: Plivo waxay expect gareysaa valid XML responses. Check your server logs for response errors.
- **Outbound call restrictions**: Trial accounts waxay leeyihiin limitations on outbound calling. Upgrade for production use.
