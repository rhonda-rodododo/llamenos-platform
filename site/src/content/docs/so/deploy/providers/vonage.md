---
title: "Deji: Vonage"
description: Tilmaan tallaabo-tallaabo ah oo lagu qaabeeyo Vonage bixiyahaaga telefoonada.
---

Vonage (hore Nexmo) wuxuu bixiyaa dabool caalami oo xooggan iyo qiimo tartan leh. Wuxuu isticmaalaa qaab API ka duwan Twilio — Vonage Applications ayaa kooxaysa lambarkaaga, webhooks-ka, iyo aqoonsiyaha.

## Waxyaabaha loo baahan yahay

- Akoon [Vonage](https://dashboard.nexmo.com/sign-up) (amaano bilaash ah waa la heli karaa)
- Matoorkaaga Llámenos oo la hawlgaliyay oo laga heli karo URL dadweyne

## 1. Abuur akoon Vonage

Ka diiwaan geli [Vonage API Dashboard](https://dashboard.nexmo.com/sign-up). Xaqiiji akoonkaaga oo qor **API Key** iyo **API Secret** bogga weyn ee dashboard-ka.

## 2. Iibso lambar taleefan

1. Tag **Numbers** > **Buy numbers** Vonage Dashboard-ka
2. Dooro waddankaaga oo dooro lambar leh awoodda **Voice**
3. Iibso lambarka

## 3. Abuur Vonage Application

Vonage wuxuu kooxeeyaa qaabeynta "Applications":

1. Tag **Applications** > **Create a new application**
2. Gali magac (tusaale, "Llamenos Hotline")
3. Hoos **Voice**, shid oo ku deji:
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Guji **Generate new application**
5. Kaydi **Application ID** bogga xaqiijinta
6. Soo deji faylka **private key** — waxaad u baahan doontaa nuxurkiisa qaabeynta

## 4. Ku xidh lambarka taleefanka

1. Tag **Numbers** > **Your numbers**
2. Guji summada gear-ka agagaarka lambarkaaga khadka gurmadka
3. Hoos **Voice**, dooro Application-ka aad abuurtay tallaabada 3
4. Guji **Save**

## 5. Ku qaabee Llámenos

1. Soo gal maamul ahaan
2. Tag **Settings** > **Telephony Provider**
3. Dooro **Vonage** hoos-u-dhaca bixiyaha
4. Gali:
   - **API Key**: Vonage Dashboard bogga weyn
   - **API Secret**: Vonage Dashboard bogga weyn
   - **Application ID**: tallaabada 3
   - **Phone Number**: lambarka aad iibsaty (qaabka E.164)
5. Guji **Save**

## 6. Tijaabi dejinta

U wac lambarkaaga khadka gurmadka. Waa inaad maqashaa liiska xulashada luqadda. Xaqiiji in wicitaannada loo mariyo tabaruceyaasha shifta ku jira.

## Dejinta WebRTC (ikhtiyaar)

Vonage WebRTC wuxuu isticmaalaa aqoonsiyaha Application-ka aad hore u abuurtay:

1. Llámenos, tag **Settings** > **Telephony Provider**
2. Shid **WebRTC Calling**
3. Gali nuxurka **Private Key** (qoraalka PEM buuxda ee faylka aad soo dejisay)
4. Guji **Save**

Application ID-ka waa hore loo qaabeyay. Vonage wuxuu soo saaraa JWT-yada RS256 isagoo isticmaalaya furaha gaarka ah ee xaqiijinta browser-ka.

## Vonage xusuus-qor

- **NCCO vs TwiML**: Vonage wuxuu isticmaalaa NCCO (Nexmo Call Control Objects) qaabka JSON halkii XML. Adapter-ka Llámenos wuxuu si toos ah u soo saaraa qaabka saxda ah.
- **Qaabka Answer URL**: Vonage wuxuu filayaa in answer URL-ku soo celiyo JSON (NCCO), ma aha XML. Tan waxaa maamula adapter-ka.
- **Event URL**: Vonage wuxuu u diraa dhacdooyinka wicitaanka (dhawaq, laga jawaabay, dhammaystay) event URL-ka sida JSON POST requests.
- **Amniga furaha gaarka ah**: Furaha gaarka ah waa la kaydiyaa isagoo sir ah. Marna kama baxo server-ka — waxaa loo isticmaalaa oo keliya in lagu soo saaro JWT-yada muddoda-gaaban.

## Cillad-xallinta

- **"Application not found"**: Xaqiiji in Application ID-ku si sax ah u waafaqsan yahay. Waxaad ka heli kartaa **Applications** Vonage Dashboard-ka.
- **Ma jiraan wicitaanno soo gala**: Hubi in lambarka taleefanka uu ku xiran yahay Application-ka saxda ah (tallaabada 4).
- **Qaladaadka furaha gaarka ah**: Ku dheji nuxurka PEM buuxda oo ay ku jiraan sadarrada `-----BEGIN PRIVATE KEY-----` iyo `-----END PRIVATE KEY-----`.
- **Qaabaynta lambarka caalamiga ah**: Vonage wuxuu u baahan yahay qaabka E.164. Ku dar `+` iyo koodka waddanka.
