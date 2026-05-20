---
title: "Setup: SignalWire"
description: Step-by-step guide to configure SignalWire as your telephony provider.
---

SignalWire waa ikhtiyaar qiimo fiican oo beddelka ah Twilio with a compatible API. Waxay isticmaashaa LaML (luuqad markup compatible with TwiML), sidaas darteed migrating between Twilio iyo SignalWire waa fudud.

## Prerequisites

- [SignalWire account](https://signalwire.com/signup) (free trial available)
- Your Llamenos instance deployed oo la heli karo via public URL

## 1. Create a SignalWire account

Isu diiwaan geli at [signalwire.com/signup](https://signalwire.com/signup). Inta la sameynayo signup, waxaad dooran doontaa **Space name** (e.g., `myhotline`). Space URL-gaaga wuxuu noqon doonaa `myhotline.signalwire.com`. Xasuusnow magacan -- waxaad u baahan doontaa configuration-ka.

## 2. Buy a phone number

1. In your SignalWire Dashboard, aad u guur **Phone Numbers**
2. Guji **Buy a Phone Number**
3. Raadi number leh voice capability
4. Iibso number-ka

## 3. Get your credentials

1. Aad u guur **API** in SignalWire Dashboard
2. Hel **Project ID** (tani waxay howl gelisaa Account SID)
3. Create a new **API Token** haddii aadan horey u lahayn -- tani waxay howl gelisaa Auth Token

## 4. Configure webhooks

1. Aad u guur **Phone Numbers** in dashboard
2. Guji hotline number-kaaga
3. Under **Voice Settings**, set:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Configure in Llamenos

1. Log in as admin
2. Aad u guur **Settings** > **Telephony Provider**
3. Dooro **SignalWire** from provider dropdown
4. Geli:
   - **Account SID**: your Project ID from step 3
   - **Auth Token**: your API Token from step 3
   - **SignalWire Space**: your Space name (magaca kaliya, ma aha full URL -- e.g., `myhotline`)
   - **Phone Number**: number-ka aad iibsatey (E.164 format)
5. Guji **Save**

## 6. Test the setup

Wac hotline number-kaaga. Waa inaad maqashaa language selection menu ka dibna call flow-ka.

## WebRTC setup (optional)

SignalWire WebRTC waxay isticmaashaa isku API key pattern-ka Twilio:

1. In your SignalWire Dashboard, create an **API Key** under **API** > **Tokens**
2. Create a **LaML Application**:
   - Aad u guur **LaML** > **LaML Applications**
   - Set Voice URL to `https://your-domain.com/api/telephony/webrtc-incoming`
   - Xasuusnow Application SID
3. In Llamenos, aad u guur **Settings** > **Telephony Provider**
4. Toggle **WebRTC Calling** on
5. Geli API Key SID, API Key Secret, iyo Application SID
6. Guji **Save**

## Differences from Twilio

- **LaML vs TwiML**: SignalWire waxay isticmaashaa LaML, taas oo shaqaysa isku mid ah TwiML. Llamenos waxay si otomaatig ah ula dhaqantaa.
- **Space URL**: API calls waxay aadaan `{space}.signalwire.com` beddelka `api.twilio.com`. Adapter-ka waxay ku maamushan via Space name aad bixisay.
- **Pricing**: SignalWire guud ahaan waxay tahay 30-40% cheaper than Twilio for voice calls.
- **Feature parity**: Dhammaan features-ka Llamenos (recording, transcription, CAPTCHA, voicemail) waxay isku mid u shaqeeyaan SignalWire.

## Troubleshooting

- **"Space not found" errors**: Hubi mar labaad Space name-ka (subdomain kaliya, ma aha full URL).
- **Webhook failures**: Hubi in server URL-kaagu publicly accessible yahay oo isticmaalo HTTPS.
- **API token issues**: SignalWire tokens way dhacayaan. Create a new token haddii aad hesho authentication errors.
