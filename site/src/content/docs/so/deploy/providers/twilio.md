---
title: "Setup: Twilio"
description: Step-by-step guide to configure Twilio as your telephony provider.
---

Twilio waa default telephony provider for Llamenos oo ugu fudud ee bilowga. Tilmaahan wuxuu ku siinayaa account creation, phone number setup, iyo webhook configuration.

## Prerequisites

- [Twilio account](https://www.twilio.com/try-twilio) (free trial works for testing)
- Your Llamenos instance deployed oo la heli karo via public URL

## 1. Create a Twilio account

Isu diiwaan geli at [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verify email-kaaga iyo phone number-kaaga. Twilio waxay bixisaa trial credit for testing.

## 2. Buy a phone number

1. Aad u guur **Phone Numbers** > **Manage** > **Buy a number** in Twilio Console
2. Raadi number leh **Voice** capability in your desired area code
3. Guji **Buy** oo confirm

Keyd number-kaan -- waxaad gelin doontaa Llamenos admin settings.

## 3. Get your Account SID and Auth Token

1. Aad u guur [Twilio Console dashboard](https://console.twilio.com)
2. Hel **Account SID** iyo **Auth Token** on main page
3. Guji eye icon si aad u aragto Auth Token

## 4. Configure webhooks

In Twilio Console, aad u guur phone number-kaaga configuration:

1. Aad u guur **Phone Numbers** > **Manage** > **Active Numbers**
2. Guji hotline number-kaaga
3. Under **Voice Configuration**, set:
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

Beddel `your-domain.com` with your actual Llamenos deployment URL.

## 5. Configure in Llamenos

1. Log in as admin
2. Aad u guur **Settings** > **Telephony Provider**
3. Dooro **Twilio** from provider dropdown
4. Geli:
   - **Account SID**: from step 3
   - **Auth Token**: from step 3
   - **Phone Number**: number-ka aad iibsatey (E.164 format, e.g., `+15551234567`)
5. Guji **Save**

## 6. Test the setup

Wac hotline number-kaaga from a phone. Waa inaad maqashaa language selection menu. Haddii aad leedahay volunteers on shift, call-ka wuu u gudbin doonaa.

## WebRTC setup (optional)

Si aad u awoodiso volunteers inay jawaabayaan calls in their browser instead of their phone:

### Create an API Key

1. Aad u guur **Account** > **API keys & tokens** in Twilio Console
2. Guji **Create API Key**
3. Dooro **Standard** key type
4. Keyd **SID** iyo **Secret** -- secret-ka waxaa la muujiyaa mar kaliya

### Create a TwiML App

1. Aad u guur **Voice** > **Manage** > **TwiML Apps**
2. Guji **Create new TwiML App**
3. Set **Voice Request URL** to `https://your-domain.com/api/telephony/webrtc-incoming`
4. Keyd oo xasuusnow **App SID**

### Enable in Llamenos

1. Aad u guur **Settings** > **Telephony Provider**
2. Toggle **WebRTC Calling** on
3. Geli:
   - **API Key SID**: from API key aad sameysay
   - **API Key Secret**: from API key aad sameysay
   - **TwiML App SID**: from TwiML App aad sameysay
4. Guji **Save**

Eeg [WebRTC Browser Calling](/docs/deploy/providers/webrtc) for volunteer setup and troubleshooting.

## Troubleshooting

- **Calls not arriving**: Verify webhook URL-ka sax yahay oo server-kaagu deployed yahay. Check Twilio Console error logs.
- **"Invalid webhook" errors**: Hubi in webhook URL-ka isticmaalo HTTPS oo uu soo celiyo valid TwiML.
- **Trial account limitations**: Trial accounts waxay wici karaan kaliya verified numbers. Upgrade to paid account for production use.
- **Webhook validation failures**: Hubi in Auth Token in Llamenos uu iswaafaqsan yahay kan ku jira Twilio Console.
