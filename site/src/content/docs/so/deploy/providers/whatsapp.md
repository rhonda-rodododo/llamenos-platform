---
title: "Deji: WhatsApp"
description: Ku xir WhatsApp Business iyada oo loo marayo Meta Cloud API farriimaha sirta ah.
---

Llámenos wuxuu taageeraa farriiminta WhatsApp Business iyada oo loo marayo Meta Cloud API (Graph API v21.0). WhatsApp wuxuu awood u siinayaa farriimo qani ah oo taageera qoraal, sawirro, dukumannti, maqal, iyo farriimo is-dhexgal ah.

## Waxyaabaha loo baahan yahay

- Akoon [Meta Business](https://business.facebook.com)
- Lambar taleefan oo WhatsApp Business API ah
- App Meta developer oo leh badeecadda WhatsApp oo la shiday

## Hababka is-dhexgalka

Llámenos wuxuu taageeraa laba hab oo WhatsApp is-dhexgal:

### Meta Direct (lagu taliyay)

Ku xir si toos ah Meta Cloud API. Wuxuu bixiyaa kontorool buuxda iyo dhammaan astaamaha.

**Aqoonsiyaha loo baahan yahay:**
- **Phone Number ID** — aqoonsiga lambarka taleefankaaga WhatsApp Business
- **Business Account ID** — aqoonsiga akoonkaaga Meta Business
- **Access Token** — calanka marin-u-helista Meta API ee muddada-dheer
- **Verify Token** — xaraf gaar ah oo aad doorato xaqiijinta webhook-ka
- **App Secret** — sirta app-kaaga Meta (xaqiijinta saxiixa webhook-ka)

### Habka Twilio

Haddii aad hore u isticmaasho Twilio codka, waxaad u mari kartaa WhatsApp akoonkaaga Twilio. Dejin fudud, laakiin astaamaha qaar waa laga yaabaa inay xaddidan yihiin.

**Aqoonsiyaha loo baahan yahay:**
- Twilio Account SID-kaaga jira, Auth Token, iyo soo-dirayaasha WhatsApp ee ku xiran Twilio

## 1. Abuur Meta app

1. Tag [developers.facebook.com](https://developers.facebook.com)
2. Abuur app cusub (nooca: Business)
3. Ku dar badeecadda **WhatsApp**
4. WhatsApp > Getting Started, qor **Phone Number ID** iyo **Business Account ID**
5. Abuur calan marin-u-helis joogto ah (Settings > Access Tokens)

## 2. Qaabee webhook-ka

Meta developer dashboard-ka:

1. Tag WhatsApp > Configuration > Webhook
2. Deji Callback URL-ka:
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Deji Verify Token-ka isla xarafka aad gelin doonto dejinta maamulka Llámenos
4. Subscribe gal goobta webhook-ka ee `messages`

Meta wuxuu soo dirayaa codsi GET si uu u xaqiijiyo webhook-ka. Server-kaagu wuxuu ka jawaabi doonaa caqabadda (challenge) haddii verify token-ku waafaqsanyahay.

## 3. Ku shid WhatsApp dejinta maamulka

Tag **Admin Settings > Messaging Channels** (ama isticmaal qalabka dejinta) oo shid **WhatsApp**.

Dooro **Meta Direct** ama **Twilio** habka oo gali aqoonsiyaha loo baahan yahay.

Qaabee dejinta ikhtiyaariga ah:
- **Farriinta jawaabta tooska ah** — loo diro xiriirrada marka koowaad
- **Jawaabta saacadaha ka baxsan** — loo diro wakhtiyada shifta ka baxsan

## 4. Tijaabi

U dir farriin WhatsApp lambarkaaga taleefanka Business. Wada hadalku waa inuu ka soo baxaa taabka **Conversations**.

## Daaqadda 24-saac ee farriiminta

WhatsApp wuxuu dhaqangeliyay daaqad 24-saac oo farriimeed:
- Waxaad uga jawaabi kartaa isticmaale 24 saac gudahood farriintoodii ugu dambeysay
- 24 saac ka dib, waa inaad isticmaashaa **farriin qaabaysan** (template message) oo la ansixiyay si aad dib u bilaabato wada hadalka
- Llámenos wuxuu tan si toos ah u maamulaa — haddii daaqaddu dhammaatay, wuxuu soo dirayaa farriin qaabaysan si uu dib u bilaabo wada hadalka

## Taageerada warbaahinta

WhatsApp wuxuu taageeraa farriimaha warbaahinta qaniga ah:
- **Sawirro** (JPEG, PNG)
- **Dukumannti** (PDF, Word, iwm)
- **Maqal** (MP3, OGG)
- **Fiidiyoow** (MP4)
- **Goobta** wadaagista
- **Is-dhexgalka** badhamada iyo liisaska farriimaha

Lifaaqyada warbaahintu waxay ka soo baxaan khadka wada hadalka.

## Xusuus-qor amniga

- WhatsApp wuxuu isticmaalaa sirta dhammaad-ilaa-dhammaad u dhexeeya isticmaalaha iyo kaabayaasha Meta
- Meta si farsamo ahaan ayuu u heli karaa nuxurka farriimaha server-yadooda
- Farriimaha waa la siriyay marka la helo waxaana lagu kaydiyaa kaydka xogta
- Sahiixa webhook-ka waa la xaqiijiyaa iyadoo la isticmaalayo HMAC-SHA256 oo leh sirta app-kaaga
- Asturnaanta ugu badan, ka fiirso isticmaalka Signal halkii WhatsApp
