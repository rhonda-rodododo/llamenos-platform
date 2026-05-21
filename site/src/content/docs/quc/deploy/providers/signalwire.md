---
title: "Ruchojmil: SignalWire"
description: Ruchojmil ruxaq' pa ruxaq' richin ruchojmil SignalWire achi'el aw telephony provider.
---

SignalWire jun cost-effective alternative pa Twilio rik'in jun compatible API. Nrokisaj LaML (jun TwiML-compatible markup language), nub'än chi ri migration pa Twilio chuqa' SignalWire straightforward.

## Taq k'ayewal

- Jun [SignalWire account](https://signalwire.com/signup) (free trial available)
- Awachib'al Llamenos tz'aqat chuqa' okel via jun public URL

## 1. Titz'uk jun SignalWire account

Titz'ib'äx pa [signalwire.com/signup](https://signalwire.com/signup). Chuwäch ri rutz'ib'axik, xacha' jun **Space b'i'aj** (achike, `myhotline`). Aw Space URL k'o chi k'o `myhotline.signalwire.com`. Tatz'eta' re' b'i'aj — xaraj chuwäch ri ruchojmil.

## 2. Tiq'axaj jun phone number

1. Pa aw SignalWire Dashboard, katb'e pa **Phone Numbers**
2. Tipitz' **Buy a Phone Number**
3. Tikanoj jun rajilab'al rik'in voice capability
4. Tiq'axaj ri rajilab'al

## 3. Tik'ul aw taq ewan taq tzij

1. Katb'e pa **API** pa ri SignalWire Dashboard
2. Tiwïl aw **Project ID** (re' nusamaj achi'el ri Account SID)
3. Titz'uk jun k'ak'a' **API Token** we man k'o ta — re' nusamaj achi'el ri Auth Token

## 4. Ruchojmil taq webhooks

1. Katb'e pa **Phone Numbers** pa ri dashboard
2. Tipitz' pa awachib'al hotline rajilab'al
3. Pa **Voice Settings**, tiya':
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Ruchojmil pa Llamenos

1. Titikirisaj molojri'ïl achi'el admin
2. Katb'e pa **Settings** > **Telephony Provider**
3. Tacha' **SignalWire** pa ri provider dropdown
4. Tiya':
   - **Account SID**: aw Project ID pa step 3
   - **Auth Token**: aw API Token pa step 3
   - **SignalWire Space**: aw Space b'i'aj (xa xe ri b'i'aj, man ri full URL — achike, `myhotline`)
   - **Phone Number**: ri rajilab'al xaq'axaj (E.164 ruwäch)
5. Tipitz' **Save**

## 6. Tojtob'en ri ruchojmil

Tacha' awachib'al hotline rajilab'al. Yatikïr nab'än ri rucha'ik ch'ab'äl selection menu chuqa' tib'e' pa ri call flow.

## WebRTC ruchojmil (rucha'ik)

SignalWire WebRTC nrokisaj ri junam API key pattern achi'el Twilio:

1. Pa aw SignalWire Dashboard, titz'uk jun **API Key** pa **API** > **Tokens**
2. Titz'uk jun **LaML Application**:
   - Katb'e pa **LaML** > **LaML Applications**
   - Tiya' ri Voice URL pa `https://your-domain.com/api/telephony/webrtc-incoming`
   - Tatz'eta' ri Application SID
3. Pa Llamenos, katb'e pa **Settings** > **Telephony Provider**
4. Titz'ij'ij' **WebRTC Calling**
5. Tiya' ri API Key SID, API Key Secret, chuqa' Application SID
6. Tipitz' **Save**

## Taq ruk'ayewal pa Twilio

- **LaML vs TwiML**: SignalWire nrokisaj LaML, ri nusamaj functionally identical pa TwiML. Llamenos nub'än re' automatically.
- **Space URL**: API taq taq b'ey b'ey pa `{space}.signalwire.com` instead of `api.twilio.com`. Ri adapter nub'än re' via ri Space b'i'aj xaya'.
- **Rutz'aqat**: SignalWire yalan 30-40% cheaper chuwäch Twilio richin voice calls.
- **Feature parity**: Konojel Llamenos taq features (recording, transcription, CAPTCHA, voicemail) samajin identically rik'in SignalWire.

## Ruch'utik ruk'ayewal

- **"Space not found" taq sachoj**: Double-check ri Space b'i'aj (xa xe ri subdomain, man ri full URL).
- **Webhook taq sachoj**: Ketz'et chi awachib'al URL publicly accessible chuqa' nrokisaj HTTPS.
- **API token taq k'ayewal**: SignalWire tokens yek'atzin chi e expire. Titz'uk jun k'ak'a' token we xak'ulaj authentication taq sachoj.
