---
title: "Deji: Twilio"
description: Tilmaan tallaabo-tallaabo ah oo lagu qaabeeyo Twilio bixiyahaaga telefoonada.
---

Twilio waa bixiyaha telefoonada ee caadiga ah ee Llámenos waa kan ugu fudud in lagu bilaabo. Tilmaantani waxay ku martaa abuurista akoonka, dejinta lambarka taleefanka, iyo qaabeynta webhook-ka.

## Waxyaabaha loo baahan yahay

- Akoon [Twilio](https://www.twilio.com/try-twilio) (tijaabo bilaash ah ayaa u shaqeysa tijaabada)
- Matoorkaaga Llámenos oo la hawlgaliyay oo laga heli karo URL dadweyne

## 1. Abuur akoon Twilio

Ka diiwaan geli [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Xaqiiji iimaylkaaga iyo lambarka taleefankaaga. Twilio wuxuu bixiyaa amaano tijaabo ah oo tijaabada ah.

## 2. Iibso lambar taleefan

1. Tag **Phone Numbers** > **Manage** > **Buy a number** Twilio Console-ka
2. Raadi lambar leh awoodda **Voice** aagga koodka aad rabto
3. Guji **Buy** oo xaqiiji

Kaydi lambarkan — waxaad gelin doontaa dejinta maamulka Llámenos.

## 3. Hel Account SID iyo Auth Token

1. Tag [Twilio Console dashboard](https://console.twilio.com)
2. Ka hel **Account SID** iyo **Auth Token** bogga weyn
3. Guji summada isha si aad u muujiso Auth Token-ka

## 4. Qaabee webhooks-ka

Twilio Console-ka, u gudub qaabeynta lambarkaaga taleefanka:

1. Tag **Phone Numbers** > **Manage** > **Active Numbers**
2. Guji lambarkaaga khadka gurmadka
3. Hoos **Voice Configuration**, ku deji:
   - **A call comes in**: Webhook, `https://your-domain.com/api/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`, HTTP POST

Ku beddel `your-domain.com` xiriiriyaha hawlgalkaaga Llámenos.

## 5. Ku qaabee Llámenos

1. Soo gal maamul ahaan
2. Tag **Settings** > **Telephony Provider**
3. Dooro **Twilio** hoos-u-dhaca bixiyaha
4. Gali:
   - **Account SID**: tallaabada 3
   - **Auth Token**: tallaabada 3
   - **Phone Number**: lambarka aad iibsaty (qaabka E.164, tusaale, `+15551234567`)
5. Guji **Save**

## 6. Tijaabi dejinta

U wac lambarkaaga khadka gurmadka taleefan. Waa inaad maqashaa liiska xulashada luqadda. Haddii aad haysato tabaruceyaal shifta ku jira, wicitaanku wuu dhawaqli doonaa.

## Dejinta WebRTC (ikhtiyaar)

Si aad u oggolaato tabaruceyaasha inay kaga jawaabaan wicitaannada browser-ka halkii taleefankooda:

### Abuur Furaha API

1. Tag **Account** > **API keys & tokens** Twilio Console-ka
2. Guji **Create API Key**
3. Dooro nooca furaha **Standard**
4. Kaydi **SID** iyo **Secret** — sirta waxaa la muujiyaa hal mar oo keliya

### Abuur App TwiML

1. Tag **Voice** > **Manage** > **TwiML Apps**
2. Guji **Create new TwiML App**
3. Deji **Voice Request URL** `https://your-domain.com/api/telephony/webrtc-incoming`
4. Kaydi oo qor **App SID**

### Ku shid Llámenos

1. Tag **Settings** > **Telephony Provider**
2. Shid **WebRTC Calling**
3. Gali:
   - **API Key SID**: furaha API aad abuurtay
   - **API Key Secret**: furaha API aad abuurtay
   - **TwiML App SID**: TwiML App-ka aad abuurtay
4. Guji **Save**

Ka eeg [Wicitaannada WebRTC ee Browserka](/docs/deploy/providers/webrtc) dejinta tabaruceyaasha iyo cillad-xallinta.

## Cillad-xallinta

- **Wicitaannada ma imanayaan**: Xaqiiji in xiriiriyaha webhook-ka uu sax yahay oo server-kaagu hawlgaliyay. Hubi qaladaadka log-ga Twilio Console.
- **Qaladaadka "Invalid webhook"**: Hubi in xiriiriyaha webhook-ku isticmaalo HTTPS uu soo celiyo TwiML sax ah.
- **Xaddidaadda akoonka tijaabada**: Akoonada tijaabadu waxay wici karaan oo keliya lambarrada la xaqiijiyay. U cusboonaysii akoon la bixiyay si aad u isticmaasho wax-soo-saarka.
- **Qaladaadka xaqiijinta webhook-ka**: Hubi in Auth Token-ka Llámenos uu waafaqsanyahay Twilio Console.
