---
title: "Ruchojmil: Vonage"
description: Ruchojmil ruxaq' pa ruxaq' richin ruchojmil Vonage achi'el aw telephony provider.
---

Vonage (k'a ri' Nexmo) nuya' strong international coverage chuqa' competitive pricing. Nrokisaj jun different API model chuwäch Twilio -- Vonage Applications nujunam aw number, webhooks, chuqa' taq ewan taq tzij.

## Taq k'ayewal

- Jun [Vonage account](https://dashboard.nexmo.com/sign-up) (free credit available)
- Awachib'al Llamenos tz'aqat chuqa' okel via jun public URL

## 1. Titz'uk jun Vonage account

Titz'ib'äx pa ri [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Titz'akaj aw account chuqa' tatz'eta' aw **API Key** chuqa' **API Secret** pa ri dashboard home page.

## 2. Tiq'axaj jun phone number

1. Katb'e pa **Numbers** > **Buy numbers** pa ri Vonage Dashboard
2. Tacha' awachib'al chuqa' tacha' jun rajilab'al rik'in **Voice** capability
3. Tiq'axaj ri rajilab'al

## 3. Titz'uk jun Vonage Application

Vonage nujunam ruchojmil pa "Applications":

1. Katb'e pa **Applications** > **Create a new application**
2. Tiya' jun b'i'aj (achike, "Llamenos Hotline")
3. Pa **Voice**, titz'ij'ij' chuqa' tiya':
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Tipitz' **Generate new application**
5. Tiya' ri **Application ID** nuk'ut pa ri confirmation page
6. Tiq'axaj ri **private key** file — xaraj chuwäch ri ruk'u'x samaj richin ruchojmil

## 4. Titz'ajij' ri phone number

1. Katb'e pa **Numbers** > **Your numbers**
2. Tipitz' ri gear icon chuwäch awachib'al hotline rajilab'al
3. Pa **Voice**, tacha' ri Application xatz'uk chuwäch step 3
4. Tipitz' **Save**

## 5. Ruchojmil pa Llamenos

1. Titikirisaj molojri'ïl achi'el admin
2. Katb'e pa **Settings** > **Telephony Provider**
3. Tacha' **Vonage** pa ri provider dropdown
4. Tiya':
   - **API Key**: pa ri Vonage Dashboard home page
   - **API Secret**: pa ri Vonage Dashboard home page
   - **Application ID**: pa step 3
   - **Phone Number**: ri rajilab'al xaq'axaj (E.164 ruwäch)
5. Tipitz' **Save**

## 6. Tojtob'en ri ruchojmil

Tacha' awachib'al hotline rajilab'al. Yatikïr nab'än ri rucha'ik ch'ab'äl selection menu. Ketz'et chi taq tzij b'ey pa on-shift volunteers.

## WebRTC ruchojmil (rucha'ik)

Vonage WebRTC nrokisaj ri Application taq ewan taq tzij xatz'uk chik:

1. Pa Llamenos, katb'e pa **Settings** > **Telephony Provider**
2. Titz'ij'ij' **WebRTC Calling**
3. Tiya' ri **Private Key** ruk'u'x samaj (ri full PEM text pa ri file xaq'axaj)
4. Tipitz' **Save**

Ri Application ID chik tz'aqat. Vonage nitz'uk RS256 JWTs rokisaxik ri private key richin browser authentication.

## Vonage-specific taq rutzijol

- **NCCO vs TwiML**: Vonage nrokisaj NCCO (Nexmo Call Control Objects) pa JSON ruwäch instead of XML markup. Ri Llamenos adapter nitz'uk ri correct ruwäch automatically.
- **Answer URL ruwäch**: Vonage nuya' chi ri answer URL nuya' JSON (NCCO), man XML. Re' nub'än ri adapter.
- **Event URL**: Vonage nitaq call taq samajib'äl (ringing, answered, completed) pa ri event URL achi'el JSON POST taq taq.
- **Private key rutzil**: Ri private key niyak encrypted. Majun xb'än pa ri ruk'u'x samaj -- xa xe nokisaj richin nitz'uk short-lived JWT tokens.

## Ruch'utik ruk'ayewal

- **"Application not found"**: Ketz'et chi ri Application ID nik'oj exactly. Yatikïr nawïl pa **Applications** pa ri Vonage Dashboard.
- **Majun incoming taq tzij**: Ketz'et chi ri phone number tz'ajin pa ri correct Application (step 4).
- **Private key taq sachoj**: Tatz'ib'aj ri full PEM ruk'u'x samaj including ri `-----BEGIN PRIVATE KEY-----` chuqa' `-----END PRIVATE KEY-----` taq tz'ib'.
- **International number formatting**: Vonage nrajo' E.164 ruwäch. Titz'aqatisaj ri `+` chuqa' country code.
