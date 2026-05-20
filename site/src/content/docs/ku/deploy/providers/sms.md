---
title: "Sazkirina SMS"
description: "Peyamên SMS-ê yên hatin û çûyî çalak bike bi peydakera telefoniya xwe re."
---

Peyama SMS di Llamenos de nasnameyên peydakera dengê telefoniya heyî bi kar tîne. Tu xizmeta SMS-ê ya cuda naxwazî — eger tu berê Twilio, SignalWire, Vonage, an Plivo ji bo dengê mîhengekî, SMS bi heman hesabê dixebite.

## Peydakarên piştgirî

| Peydakar | Piştgiriya SMS | Nîşe |
|----------|---------------|------|
| **Twilio** | Erê | SMS-ê du-alî yê bi tevahî bi rêya Twilio Messaging API |
| **SignalWire** | Erê | Bi Twilio API re lihevhatî — heman navber |
| **Vonage** | Erê | SMS bi rêya Vonage REST API |
| **Plivo** | Erê | SMS bi rêya Plivo Message API |
| **Asterisk** | Na | Asterisk piştgiriya SMS-ê ya bingehîn nake |

## 1. SMS di mîhenganê rêvebirinê de çalak bike

Here lêveke **Mîhenga Rêvebirinê > Kanalên Peyamanê** (an jî bi kar bîne sihêrên sazkirinê di têketina yekê de) û derbasberiya **SMS** çalak bike.

Mîhenga SMS mîheng bike:
- **Peyama bixweber** — peyama xatirê ya bijartî ji bo peywendiyên cara yekê tê şandin
- **Bersiva dema derveyî nobetê** — peyama bijartî li derveyî saetan tê şandin

## 2. Webhook mîheng bike

Peyama SMS ya peydakera telefoniya xwe bi rêvebera xwe ve girêbide:

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Here Twilio Console > Phone Numbers > Active Numbers
2. Hejmara telefoniya xwe hilbijêre
3. Li bin **Messaging**, URL-ê webhookê ji bo "A message comes in" rast bike bi URL-ê jorîn
4. Rêbaza HTTP-ê wekî **POST** mîheng bike

### Vonage

1. Here Vonage API Dashboard > Applications
2. Sepana xwe hilbijêre
3. Li bin **Messages**, URL-ê Inbound bi URL-ê webhookê jorîn mîheng bike

### Plivo

1. Here Plivo Console > Messaging > Applications
2. Sepanek peyamê biafirîne an jî sererast bike
3. URL-ê Peyamê bi URL-ê webhookê jorîn mîheng bike
4. Sepanê bi hejmara telefoniya xwe ve girêbide

## 3. Test bike

SMS-ekê ji hejmara telefoniya hotline xwe re bişîne. Divê axaftin di rûpela **Axaftinan** de di panela rêvebirinê de xuya bibe.

## Çawa dixebite

1. SMS-ek li peydakera te tê, ku webhookekê bi rêvebera te dişîne
2. Rêveber imzeya webhookê piştrast dike (HMAC-ê ya peydakar)
3. Peyam tê analîzkirin û di ConversationService de tê hilanîn
4. Vijekarên li ser nobetê bi rêya bûyerên WebSocket relay agahdar dikin
5. Vijekar ji rûpela Axftinan bersiv didin — bersiv bi rêya API-ê ya SMS ya peydakara te tên şandin

## Nîşeyên ewlehiyê

- Peyamên SMS bi rêya torê ya operatorên di textê de ne — peydakera te û operator dikarin wan bixwînin
- Peyamên hatinê dema wergirtinê tên şîfrekirin û di danegehê de tê hilanîn
- Hejmarên telefoniya şandevan berî hilanînê tên hashkirin (nezaketî)
- Imzeyên webhookê ji hêla peydakar ve tên piştrastkirin (HMAC-SHA1 ji bo Twilio, hwd.)
