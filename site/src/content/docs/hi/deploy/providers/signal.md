---
title: "Setup: Signal"
description: Privacy-focused messaging के लिए signal-cli bridge के माध्यम से Signal messaging channel सेट करें।
---

Llamenos एक self-hosted [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge के माध्यम से Signal messaging का समर्थन करता है। Signal किसी भी messaging channel में सबसे मजबूत privacy guarantees प्रदान करता है, जो इसे sensitive crisis response scenarios के लिए आदर्श बनाता है।

## पूर्वापेक्षाएं

- Bridge के लिए एक Linux server या VM (Asterisk के समान server हो सकता है, या अलग)
- Bridge server पर Docker installed
- Signal registration के लिए एक dedicated phone number
- Bridge से आपके Cloudflare Worker तक network access

## Architecture

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Signal-cli bridge आपके infrastructure पर चलता है और HTTP webhooks के माध्यम से आपके Worker को messages forward करता है। इसका मतलब है कि आप Signal से आपके application तक पूरे message path को control करते हैं।

## 1. Signal-cli bridge deploy करें

Signal-cli-rest-api Docker container चलाएं:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Phone number register करें

एक dedicated phone number के साथ bridge register करें:

```bash
# Request a verification code via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verify with the code you received
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Webhook forwarding कॉन्फ़िगर करें

Bridge को incoming messages को आपके Worker पर forward करने के लिए सेट करें:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-worker.your-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer your-webhook-secret"
      }
    }
  }'
```

## 4. Admin settings में Signal सक्षम करें

**Admin Settings > Messaging Channels** पर navigate करें (या setup wizard उपयोग करें) और **Signal** toggle करें।

निम्नलिखित enter करें:
- **Bridge URL** — आपके signal-cli bridge का URL (जैसे, `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — bridge को requests authenticate करने के लिए bearer token
- **Webhook Secret** — incoming webhooks validate करने के लिए उपयोग किया जाने वाला secret (चरण 3 में configure किया गया से match होना चाहिए)
- **Registered Number** — Signal के साथ registered phone number

## 5. Test करें

अपने registered phone number पर एक Signal message भेजें। Conversation **Conversations** tab में दिखनी चाहिए।

## Health monitoring

Llamenos signal-cli bridge health monitor करता है:
- Bridge के `/v1/about` endpoint पर periodic health checks
- Bridge unreachable होने पर graceful degradation — अन्य channels काम करते रहते हैं
- Bridge down होने पर Admin alerts

## Voice message transcription

Signal voice messages को `@huggingface/transformers` के माध्यम से client-side Whisper (WASM) उपयोग करके volunteer के browser में directly transcribe किया जा सकता है। Audio कभी device नहीं छोड़ता — transcript conversation view में voice message के साथ encrypted और stored होता है। Volunteers अपनी personal settings में transcription enable या disable कर सकते हैं।

## सुरक्षा नोट्स

- Signal user और signal-cli bridge के बीच end-to-end encryption प्रदान करता है
- Bridge webhooks के रूप में forward करने के लिए messages decrypt करता है — bridge server का plaintext access है
- Webhook authentication constant-time comparison के साथ bearer tokens उपयोग करती है
- Bridge को अपने Asterisk server (यदि applicable) के समान network पर रखें minimum exposure के लिए
- Bridge अपने Docker volume में locally message history store करता है — encryption at rest पर विचार करें
- Maximum privacy के लिए: अपने infrastructure पर खुद Asterisk (voice) और signal-cli (messaging) दोनों host करें

## समस्या निवारण

- **Bridge messages receive नहीं कर रहा**: `GET /v1/about` के साथ check करें कि phone number सही ढंग से registered है
- **Webhook delivery failures**: Verify करें कि webhook URL bridge server से reachable है और authorization header match करता है
- **Registration issues**: कुछ phone numbers को पहले existing Signal account से unlink करने की जरूरत हो सकती है
