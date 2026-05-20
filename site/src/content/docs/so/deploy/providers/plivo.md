---
title: "Deji: Plivo"
description: Tilmaan tallaabo-tallaabo ah oo lagu qaabeeyo Plivo bixiyahaaga telefoonada.
---

Plivo waa bixiye telefoon oo kayd-saaxiibtinimo ah oo leh API toosan. Wuxuu isticmaalaa kontorool wicitaan XML-ku-saleysan oo la mid ah TwiML, taasoo ka dhigaysa is-dhexgalka Llámenos mid habsami leh.

## Waxyaabaha loo baahan yahay

- Akoon [Plivo](https://console.plivo.com/accounts/register/) (amaano tijaabo ah waa la heli karaa)
- Matoorkaaga Llámenos oo la hawlgaliyay oo laga heli karo URL dadweyne

## 1. Abuur akoon Plivo

Ka diiwaan geli [console.plivo.com](https://console.plivo.com/accounts/register/). Ka dib xaqiijinta, waxaad ka heli kartaa **Auth ID** iyo **Auth Token** bogga weyn ee dashboard-ka.

## 2. Iibso lambar taleefan

1. Tag **Phone Numbers** > **Buy Numbers** Plivo Console-ka
2. Dooro waddankaaga oo raadi lambarro leh awoodda codka
3. Iibso lambar

## 3. Abuur XML application

Plivo wuxuu isticmaalaa "XML Applications" si uu u mariyo wicitaannada:

1. Tag **Voice** > **XML Applications**
2. Guji **Add New Application**
3. Qaabee:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Kaydi application-ka

## 4. Ku xidh lambarka taleefanka

1. Tag **Phone Numbers** > **Your Numbers**
2. Guji lambarkaaga khadka gurmadka
3. Hoos **Voice**, dooro XML Application-ka aad abuurtay tallaabada 3
4. Kaydi

## 5. Ku qaabee Llámenos

1. Soo gal maamul ahaan
2. Tag **Settings** > **Telephony Provider**
3. Dooro **Plivo** hoos-u-dhaca bixiyaha
4. Gali:
   - **Auth ID**: Plivo Console dashboard-ka
   - **Auth Token**: Plivo Console dashboard-ka
   - **Phone Number**: lambarka aad iibsaty (qaabka E.164)
5. Guji **Save**

## 6. Tijaabi dejinta

U wac lambarkaaga khadka gurmadka. Waa inaad maqashaa liiska xulashada luqadda oo laguu mariyo habka wicitaanka caadiga ah.

## Dejinta WebRTC (ikhtiyaar)

Plivo WebRTC wuxuu isticmaalaa Browser SDK-ga oo leh aqoonsiyahaaga jira:

1. Tag **Voice** > **Endpoints** Plivo Console-ka
2. Abuur endpoint cusub (tani waxay u shaqeysaa aqoonsiga taleefanka browser-ka)
3. Llámenos, tag **Settings** > **Telephony Provider**
4. Shid **WebRTC Calling**
5. Guji **Save**

Adapter-ku wuxuu soo saaraa calamada HMAC-ku-xiran ee wakhtiga-xaddidan oo ka yimid Auth ID iyo Auth Token xaqiijinta browser-ka ammaan ah.

## Plivo xusuus-qor

- **XML vs TwiML**: Plivo wuxuu isticmaalaa qaabkiisa XML ee kontoroolka wicitaanka, kaas oo la mid ah laakiin aan la mid ahayn TwiML. Adapter-ka Llámenos wuxuu si toos ah u soo saaraa XML-ka saxda ah ee Plivo.
- **Answer URL vs Hangup URL**: Plivo wuxuu kala saaraa maareeyaha wicitaanka bilowga ah (Answer URL) iyo maareeyaha dhammaadka wicitaanka (Hangup URL), si ka duwan Twilio oo isticmaala hal wicitaan heer.
- **Xaddidaadda heerka**: Plivo wuxuu leeyahay xaddidaadda heerka API oo ku kala duwan heerka akoonka. Khadadka gurmadka ee mugga-sarreeya, la xiriir taageerada Plivo si aad u kordhiso xaddidaadda.

## Cillad-xallinta

- **"Auth ID invalid"**: Auth ID-ku ma aha ciwaankaaga iimaylka. Ka hel Plivo Console dashboard-ka bogga weyn.
- **Wicitaannada ma socdaan**: Xaqiiji in lambarka taleefanka uu ku xiran yahay XML Application-ka saxda ah.
- **Qaladaadka Answer URL**: Plivo wuxuu filayaa jawaabo XML oo sax ah. Hubi log-yada server-kaaga qaladaadka jawaabta.
- **Xaddidaadda wicitaanka kac-baxa**: Akoonada tijaabadu waxay leeyihiin xaddidaadyo wicitaanka kac-baxa. U cusboonaysii wax-soo-saarka.
