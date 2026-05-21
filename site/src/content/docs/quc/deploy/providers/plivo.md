---
title: "Ruchojmil: Plivo"
description: Ruchojmil ruxaq' pa ruxaq' richin ruchojmil Plivo achi'el aw telephony provider.
---

Plivo jun budget-friendly cloud telephony provider rik'in jun straightforward API. Nrokisaj XML-based call control, nusamaj achi'el TwiML, nub'än ri rutz'akuxik rik'in Llamenos seamless.

## Taq k'ayewal

- Jun [Plivo account](https://console.plivo.com/accounts/register/) (trial credit available)
- Awachib'al Llamenos tz'aqat chuqa' okel via jun public URL

## 1. Titz'uk jun Plivo account

Titz'ib'äx pa [console.plivo.com](https://console.plivo.com/accounts/register/). Chuwäch rutz'akuxik, yatikïr nawïl aw **Auth ID** chuqa' **Auth Token** pa ri dashboard home page.

## 2. Tiq'axaj jun phone number

1. Katb'e pa **Phone Numbers** > **Buy Numbers** pa ri Plivo Console
2. Tacha' awachib'al chuqa' tikanoj taq taq taq rik'in voice capability
3. Tiq'axaj jun rajilab'al

## 3. Titz'uk jun XML application

Plivo nrokisaj "XML Applications" richin nub'än taq tzij:

1. Katb'e pa **Voice** > **XML Applications**
2. Tipitz' **Add New Application**
3. Ruchojmil:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Tiyak ri application

## 4. Titz'ajij' ri phone number

1. Katb'e pa **Phone Numbers** > **Your Numbers**
2. Tipitz' pa awachib'al hotline rajilab'al
3. Pa **Voice**, tacha' ri XML Application xatz'uk chuwäch step 3
4. Tiyak

## 5. Ruchojmil pa Llamenos

1. Titikirisaj molojri'ïl achi'el admin
2. Katb'e pa **Settings** > **Telephony Provider**
3. Tacha' **Plivo** pa ri provider dropdown
4. Tiya':
   - **Auth ID**: pa ri Plivo Console dashboard
   - **Auth Token**: pa ri Plivo Console dashboard
   - **Phone Number**: ri rajilab'al xaq'axaj (E.164 ruwäch)
5. Tipitz' **Save**

## 6. Tojtob'en ri ruchojmil

Tacha' awachib'al hotline rajilab'al. Yatikïr nab'än ri rucha'ik ch'ab'äl selection menu chuqa' tib'e' pa ri normal call flow.

## WebRTC ruchojmil (rucha'ik)

Plivo WebRTC nrokisaj ri Browser SDK rik'in aw existing taq ewan taq tzij:

1. Katb'e pa **Voice** > **Endpoints** pa ri Plivo Console
2. Titz'uk jun k'ak'a' endpoint (re' nusamaj achi'el ri browser phone identity)
3. Pa Llamenos, katb'e pa **Settings** > **Telephony Provider**
4. Titz'ij'ij' **WebRTC Calling**
5. Tipitz' **Save**

Ri adapter nitz'uk time-limited HMAC tokens pa aw Auth ID chuqa' Auth Token richin secure browser authentication.

## Plivo-specific taq rutzijol

- **XML vs TwiML**: Plivo nrokisaj ri ruk'u'x XML ruwäch richin call control, ri nusamaj achi'el pero man junam ta rik'in TwiML. Ri Llamenos adapter nitz'uk ri correct Plivo XML automatically.
- **Answer URL vs Hangup URL**: Plivo nujunam ri initial call handler (Answer URL) chuqa' ri call end handler (Hangup URL), man junam ta rik'in Twilio ri nrokisaj jun status callback.
- **Rate limits**: Plivo k'o API rate limits ri yalan pa account tier. Richin high-volume hotlines, tacha' Plivo support richin niya' rutz'aqat.

## Ruch'utik ruk'ayewal

- **"Auth ID invalid"**: Ri Auth ID man ta aw email address. Tiwïl pa ri Plivo Console dashboard home page.
- **Taq tzij man nub'än ta**: Ketz'et chi ri phone number tz'ajin pa ri correct XML Application.
- **Answer URL taq sachoj**: Plivo nuya' valid XML responses. Kek'ut awachib'al taq tz'ib'anik richin response taq sachoj.
- **Outbound call restrictions**: Trial accounts k'o limitations pa outbound calling. Tiya' rutz'aqat richin production use.
