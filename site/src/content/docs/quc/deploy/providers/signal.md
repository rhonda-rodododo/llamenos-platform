---
title: "Ruchojmil: Signal"
description: Ruchojmil ri Signal messaging channel via ri signal-cli bridge richin privacy-focused messaging.
---

Llamenos nrokisaj Signal messaging via jun self-hosted [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge. Signal nuya' ri ruk'u'x samaj rutzil richin privacy richin jun ruk'u'x samaj, nub'än re' utziläj richin sensitive crisis response taq k'ayewal.

## Taq k'ayewal

- Jun Linux ruk'u'x samaj o VM richin ri bridge (yatikïr nusamaj achi'el ri Asterisk ruk'u'x samaj, o jun chik)
- Docker tz'ib'an pa ri bridge ruk'u'x samaj
- Jun dedicated phone number richin Signal registration
- Ruk'u'x samaj okem pa ri bridge pa awachib'al Llamenos ruk'u'x samaj

## Ruk'u'x samaj ruch'ak'ik

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Ri signal-cli bridge samajin pa awachib'al chuqa' nuya' taq tzij pa awachib'al via HTTP webhooks. Re' nuya' chi awe nuch'ajin ri ronojel message path pa Signal pa awachib'al.

## 1. Tich'ak ri signal-cli bridge

Titikirisaj ri signal-cli-rest-api Docker container:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Titz'ib'äx jun phone number

Titz'ib'äx ri bridge rik'in jun dedicated phone number:

```bash
# Tijikib'äx jun verification code via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Titz'akaj rik'in ri code xak'ulaj
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Ruchojmil webhook forwarding

Tiya' ri bridge richin nuya' incoming taq tzij pa awachib'al:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer your-webhook-secret"
      }
    }
  }'
```

## 4. Titz'ij'ij' Signal pa admin ruchojmil

Katb'e pa **Admin Settings > Messaging Channels** (o tokisäx ri setup wizard) chuqa' titz'ij'ij' **Signal**.

Tiya' ri k'utun:
- **Bridge URL** — ri URL aw signal-cli bridge (achike, `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — jun bearer token richin authenticate taq taq pa ri bridge
- **Webhook Secret** — ri ewan tzij rokisaxik richin validate incoming webhooks (k'o chi nik'oj chi re' xatz'ub'aj chuwäch step 3)
- **Registered Number** — ri phone number tz'ib'an rik'in Signal

## 5. Tojtob'en

Titaq jun Signal message pa aw registered phone number. Ri conversation k'o chi nuk'ut pa ri **Conversations** tab.

## Health monitoring

Llamenos nub'än ri signal-cli bridge rutzil:
- Periodic health checks pa ri bridge's `/v1/about` endpoint
- Graceful degradation we ri bridge man okel ta — ch'aqa' chik taq b'ey nik'oje' samajin
- Admin alerts we ri bridge xb'än

## Voice message transcription

Signal voice messages yatikïr nitz'akaj pa ri volunteer's browser rokisaxik client-side Whisper (WASM via `@huggingface/transformers`). Audio majun xb'än pa ri ruk'u'x samaj — ri transcript nitz'akaj chuqa' niyak alongside ri voice message pa ri conversation view. Taq volunteers yatikïr nitz'ij'ij' o nitz'ap ri transcription pa ri personal ruchojmil.

## Taq rutzijol rutzil

- Signal nuya' end-to-end encryption pa ri user chuqa' ri signal-cli bridge
- Ri bridge nitz'akaj taq tzij richin nuya' achi'el webhooks — ri bridge ruk'u'x samaj k'o plaintext okem
- Webhook authentication nrokisaj bearer tokens rik'in constant-time comparison
- Tiya' ri bridge pa ri junam ruk'u'x samaj achi'el aw Asterisk ruk'u'x samaj (we applicable) richin minimal exposure
- Ri bridge niyak message history pa ruk'u'x samaj pa ri Docker volume — ticha' encryption at rest
- Richin ruk'u'x samaj rutzil: self-host ch'aqa' chik Asterisk (voice) chuqa' signal-cli (messaging) pa awachib'al

## Ruch'utik ruk'ayewal

- **Bridge man nik'ul ta taq tzij**: Kek'ut chi ri phone number tz'aqat tz'ib'an rik'in `GET /v1/about`
- **Webhook delivery taq sachoj**: Ketz'et chi ri webhook URL okel pa ri bridge ruk'u'x samaj chuqa' ri authorization header nik'oj
- **Registration taq k'ayewal**: Jujun taq phone numbers yek'atzin chi e unlinked pa jun existing Signal account chuwäch
