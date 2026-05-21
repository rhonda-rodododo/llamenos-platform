---
title: "Ruchojmil: Twilio"
description: Ruchojmil ruxaq' pa ruxaq' richin ruchojmil Twilio achi'el aw telephony provider.
---

Twilio ri default telephony provider richin Llamenos chuqa' ri easiest richin rutikirib'al samaj. Re' ruxaq' nuk'ut chawe rik'in account creation, phone number setup, chuqa' webhook ruchojmil.

## Taq k'ayewal

- Jun [Twilio account](https://www.twilio.com/try-twilio) (free trial works richin testing)
- Awachib'al Llamenos tz'aqat chuqa' okel via jun public URL

## 1. Titz'uk jun Twilio account

Titz'ib'äx pa [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Titz'akaj aw email chuqa' phone number. Twilio nuya' trial credit richin testing.

## 2. Tiq'axaj jun phone number

1. Katb'e pa **Phone Numbers** > **Manage** > **Buy a number** pa ri Twilio Console
2. Tikanoj jun rajilab'al rik'in **Voice** capability pa aw desired area code
3. Tipitz' **Buy** chuqa' titz'akaj

Tiya' re' rajilab'al — xaraj chuwäch ri Llamenos admin ruchojmil.

## 3. Tik'ul aw Account SID chuqa' Auth Token

1. Katb'e pa ri [Twilio Console dashboard](https://console.twilio.com)
2. Tiwïl aw **Account SID** chuqa' **Auth Token** pa ri main page
3. Tipitz' ri eye icon richin niya' ri Auth Token

## 4. Ruchojmil taq webhooks

Pa ri Twilio Console, katb'e pa aw phone number's ruchojmil:

1. Katb'e pa **Phone Numbers** > **Manage** > **Active Numbers**
2. Tipitz' pa awachib'al hotline rajilab'al
3. Pa **Voice Configuration**, tiya':
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

Tijal `your-domain.com` rik'in aw actual Llamenos deployment URL.

## 5. Ruchojmil pa Llamenos

1. Titikirisaj molojri'ïl achi'el admin
2. Katb'e pa **Settings** > **Telephony Provider**
3. Tacha' **Twilio** pa ri provider dropdown
4. Tiya':
   - **Account SID**: pa step 3
   - **Auth Token**: pa step 3
   - **Phone Number**: ri rajilab'al xaq'axaj (E.164 ruwäch, achike, `+15551234567`)
5. Tipitz' **Save**

## 6. Tojtob'en ri ruchojmil

Tacha' awachib'al hotline rajilab'al pa jun ch'ich'. Yatikïr nab'än ri rucha'ik ch'ab'äl selection menu. We awetaman taq volunteers on shift, ri tzij b'ey b'ey.

## WebRTC ruchojmil (rucha'ik)

Richin nitz'ij'ij' chi ri volunteers yetikïr nik'ul taq tzij pa ri browser instead of ri phone:

### Titz'uk jun API Key

1. Katb'e pa **Account** > **API keys & tokens** pa ri Twilio Console
2. Tipitz' **Create API Key**
3. Tacha' **Standard** key ruwäch
4. Tiya' ri **SID** chuqa' **Secret** — ri secret nuk'ut xa jun k'ak'a'

### Titz'uk jun TwiML App

1. Katb'e pa **Voice** > **Manage** > **TwiML Apps**
2. Tipitz' **Create new TwiML App**
3. Tiya' ri **Voice Request URL** pa `https://your-domain.com/api/telephony/webrtc-incoming`
4. Tiya' chuqa' tatz'eta' ri **App SID**

### Titz'ij'ij' pa Llamenos

1. Katb'e pa **Settings** > **Telephony Provider**
2. Titz'ij'ij' **WebRTC Calling**
3. Tiya':
   - **API Key SID**: pa ri API key xatz'uk
   - **API Key Secret**: pa ri API key xatz'uk
   - **TwiML App SID**: pa ri TwiML App xatz'uk
4. Tipitz' **Save**

Katz'eto' [WebRTC Browser Calling](/docs/deploy/providers/webrtc) richin volunteer setup chuqa' ruch'utik ruk'ayewal.

## Ruch'utik ruk'ayewal

- **Taq tzij man e ta**: Ketz'et chi ri webhook URL tz'aqat chuqa' awachib'al tz'aqat. Kek'ut ri Twilio Console error taq tz'ib'anik.
- **"Invalid webhook" taq sachoj**: Ketz'et chi ri webhook URL nrokisaj HTTPS chuqa' nuya' valid TwiML.
- **Trial account limitations**: Trial accounts xa xe yetikïr nik'ul verified taq taq taq. Tiya' rutz'aqat richin production use.
- **Webhook validation taq sachoj**: Ketz'et chi ri Auth Token pa Llamenos nik'oj ri pa Twilio Console.
