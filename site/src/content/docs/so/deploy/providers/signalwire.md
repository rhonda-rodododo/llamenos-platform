---
title: "Deji: SignalWire"
description: Tilmaan tallaabo-tallaabo ah oo lagu qaabeeyo SignalWire bixiyahaaga telefoonada.
---

SignalWire waa beddel ku-ool ah oo Twilio ah oo leh API la jaan-qaadi karo. Wuxuu isticmaalaa LaML (luqad calaamadayn u ah TwiML), markaa u gudubka Twilio iyo SignalWire waa mid toos ah.

## Waxyaabaha loo baahan yahay

- Akoon [SignalWire](https://signalwire.com/signup) (tijaabo bilaash ah waa la heli karaa)
- Matoorkaaga Llámenos oo la hawlgaliyay oo laga heli karo URL dadweyne

## 1. Abuur akoon SignalWire

Ka diiwaan geli [signalwire.com/signup](https://signalwire.com/signup). Inta lagu jiro diiwaangelinta, waxaad dooran doontaa **Space name** (tusaale, `myhotline`). Space URL-kaagu wuxuu noqonayaa `myhotline.signalwire.com`. Qor magacan — waxaad u baahan doontaa qaabeynta.

## 2. Iibso lambar taleefan

1. SignalWire Dashboard-kaaga, tag **Phone Numbers**
2. Guji **Buy a Phone Number**
3. Raadi lambar leh awoodda codka
4. Iibso lambarka

## 3. Hel aqoonsiyahaaga

1. Tag **API** SignalWire Dashboard-ka
2. Ka hel **Project ID** (tani waxay u shaqeysaa Account SID)
3. Abuur **API Token** cusub haddii aadan haysan — tani waxay u shaqeysaa Auth Token

## 4. Qaabee webhooks-ka

1. Tag **Phone Numbers** dashboard-ka
2. Guji lambarkaaga khadka gurmadka
3. Hoos **Voice Settings**, ku deji:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Ku qaabee Llámenos

1. Soo gal maamul ahaan
2. Tag **Settings** > **Telephony Provider**
3. Dooro **SignalWire** hoos-u-dhaca bixiyaha
4. Gali:
   - **Account SID**: Project ID-gaaga tallaabada 3
   - **Auth Token**: API Token-kaaga tallaabada 3
   - **SignalWire Space**: Space name-gaaga (magaca oo keliya, ma aha URL buuxda — tusaale, `myhotline`)
   - **Phone Number**: lambarka aad iibsaty (qaabka E.164)
5. Guji **Save**

## 6. Tijaabi dejinta

U wac lambarkaaga khadka gurmadka. Waa inaad maqashaa liiska xulashada luqadda oo ay raacdo habka wicitaanka.

## Dejinta WebRTC (ikhtiyaar)

SignalWire WebRTC wuxuu isticmaalaa isla qaabka furaha API sida Twilio:

1. SignalWire Dashboard-kaaga, abuur **API Key** hoos **API** > **Tokens**
2. Abuur **LaML Application**:
   - Tag **LaML** > **LaML Applications**
   - Deji Voice URL-ka `https://your-domain.com/api/telephony/webrtc-incoming`
   - Qor Application SID-ka
3. Llámenos, tag **Settings** > **Telephony Provider**
4. Shid **WebRTC Calling**
5. Gali API Key SID, API Key Secret, iyo Application SID
6. Guji **Save**

## Kala duwanaanshaha Twilio

- **LaML vs TwiML**: SignalWire wuxuu isticmaalaa LaML, oo shaqo ahaan la mid ah TwiML. Llámenos si toos ah ayuu u maamulaa tan.
- **Space URL**: Wicitaannada API waxay u tagaan `{space}.signalwire.com` halkii `api.twilio.com`. Adapter-ku wuxuu tan u maamulaa Space name-ka aad bixiso.
- **Qiimaynta**: SignalWire guud ahaan waa 30-40% ka jaban Twilio wicitaannada codka.
- **Sinnaanta astaamaha**: Dhammaan astaamaha Llámenos (duubis, qoraal-qaadis, CAPTCHA, farriin cod) waxay si isku midah ugu shaqeeyaan SignalWire.

## Cillad-xallinta

- **Qaladaadka "Space not found"**: Laba jeer hubi Space name-ka (subdomain oo keliya, ma aha URL buuxda).
- **Qaladaadka webhook-ka**: Hubi in URL-ka server-kaagu uu dadweyne yahay oo uu isticmaalo HTTPS.
- **Arrimaha API token**: Calamada SignalWire way dhaci karaan. Abuur token cusub haddii aad hesho qaladaadka xaqiijinta.
