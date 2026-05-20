---
title: "Deji: SMS"
description: Ku shid farriimaha SMS ee soo-gala iyo gudbaha iyada oo loo marayo bixiyahaaga telefoonada.
---

Farriimaha SMS ee Llámenos waxay dib u isticmaalaan aqoonsiyahaaga bixiyaha telefoonada ee jira. Ma jiro adeeg SMS oo gooni ah oo loo baahan yahay — haddii aad hore u qaabaysay Twilio, SignalWire, Vonage, ama Plivo codka, SMS wuxuu la shaqeeyaa isla akoonka.

## Bixiyeyaasha la taageero

| Bixiyaha | Taageerada SMS | Xusuus |
|---|---|---|
| **Twilio** | Haa | SMS laba-jihood oo buuxda iyada oo loo marayo Twilio Messaging API |
| **SignalWire** | Haa | La jaan-qaadi kara API Twilio — isla interface |
| **Vonage** | Haa | SMS iyada oo loo marayo Vonage REST API |
| **Plivo** | Haa | SMS iyada oo loo marayo Plivo Message API |
| **Asterisk** | Maya | Asterisk ma taageero SMS dabiici ah |

## 1. Ku shid SMS dejinta maamulka

Tag **Admin Settings > Messaging Channels** (ama isticmaal qalabka dejinta markaad marka hore soo gasho) oo shid **SMS**.

Qaabee dejinta SMS:
- **Farriinta jawaabta tooska ah** — farriin soo dhaweyn ikhtiyaari ah oo loo diro xiriirrada marka koowaad
- **Jawaabta saacadaha ka baxsan** — farriin ikhtiyaari ah oo loo diro wakhtiyada shifta ka baxsan

## 2. Qaabee webhook-ka

U jeedi webhook-ka SMS-ka bixiyahaaga telefoonada server-kaaga:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Tag Twilio Console > Phone Numbers > Active Numbers
2. Dooro lambarkaaga taleefanka
3. Hoos **Messaging**, ku deji xiriiriyaha webhook-ka "A message comes in" URL-ka sare
4. Deji habka HTTP **POST**

### Vonage

1. Tag Vonage API Dashboard > Applications
2. Dooro application-kaaga
3. Hoos **Messages**, ku deji Inbound URL-ka webhook URL-ka sare

### Plivo

1. Tag Plivo Console > Messaging > Applications
2. Abuur ama tafatir application farriimeed
3. Deji Message URL-ka webhook URL-ka sare
4. U qoondee application-ka lambarkaaga taleefanka

## 3. Tijaabi

U dir SMS lambarkaaga taleefanka khadka gurmadka. Waa inaad aragtaa wada hadalka oo ka soo baxaya taabka **Conversations** qaybta maamulka.

## Sida ay u shaqeyso

1. SMS waxay ku soo gaartaa bixiyahaaga, kaas oo u soo diraya webhook server-kaaga
2. Server-ku wuxuu xaqiijiyaa saxiixa webhook-ka (HMAC bixiye-gaar ah)
3. Farriinta waa la farsameeyaa waxaana lagu kaydiyaa ConversationService
4. Tabaruceyaasha shifta ku jira waxaa loo ogeysiiyaa iyada oo loo marayo WebSocket relay events
5. Tabaruceyaashu way ka jawaabaan taabka Conversations — jawaabaha waxaa dib loogu soo celiyaa iyada oo loo marayo API-ga SMS ee bixiyahaaga

## Xusuus-qor amniga

- Farriimaha SMS waxay ku socdaan shabakadda sidaha qoraal cad — bixiyahaaga iyo sidayaashu way aqrin karaan
- Farriimaha soo gala waa la siriyay marka la helo waxaana lagu kaydiyaa kaydka xogta
- Lambarrada taleefannada soo dirayaasha waa la hasheeyay ka hor kaydinta (asturnaanta)
- Sahiixa webhook-ka waa la xaqiijiyaa bixiye kasta (HMAC-SHA1 Twilio, iwm)
