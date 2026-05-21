---
title: "Setup: Signal"
description: Set up the Signal messaging channel via the signal-cli bridge for privacy-focused messaging.
---

Llamenos waxay taageertaa Signal messaging via self-hosted [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge. Signal waxay bixisaa strongest privacy guarantees of any messaging channel, sidaas darteed waxay u habboon tahay sensitive crisis response scenarios.

## Prerequisites

- Linux server ama VM for the bridge (waxay noqon kartaa isku server Asterisk, ama separate)
- Docker installed on bridge server
- Dedicated phone number for Signal registration
- Network access from bridge to your Llamenos server

## Architecture

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

signal-cli bridge-ka waxa uu shaqeeyaa on your infrastructure oo waxa uu gudbiyaa messages to your server via HTTP webhooks. Tani macnaheedu waa aad xakameysaa entire message path from Signal to your application.

## 1. Deploy the signal-cli bridge

Run signal-cli-rest-api Docker container:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Register a phone number

Register bridge-ka with dedicated phone number:

```bash
# Request verification code via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verify with code aad heshay
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Configure webhook forwarding

Setup bridge-ka si uu u gudbiyo incoming messages to your server:

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

## 4. Enable Signal in admin settings

Aad u guur **Admin Settings > Messaging Channels** (ama isticmaal setup wizard) oo toggle **Signal** on.

Geli kuwan:
- **Bridge URL** — URL-ga signal-cli bridge-kaaga (e.g., `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — bearer token for authenticating requests to the bridge
- **Webhook Secret** — secret loo isticmaalo validating incoming webhooks (waa inuu iswaafaqsan yahay waxa aad configure gareysay in step 3)
- **Registered Number** — phone number loo diiwaan geliyay Signal

## 5. Test

Send Signal message to registered phone number-kaaga. Wadahadku waa inuu soo muuqdaa in **Conversations** tab.

## Health monitoring

Llamenos waxay hubisaa health-ga signal-cli bridge:
- Periodic health checks to bridge-ka `/v1/about` endpoint
- Graceful degradation haddii bridge-ka la heli waayo — channels kale way sii shaqeynayaan
- Admin alerts marka bridge-ka dhaco

## Voice message transcription

Signal voice messages waxaa loo turjumi karaa directly in volunteer's browser iyadoo isticmaalayo client-side Whisper (WASM via `@huggingface/transformers`). Audio marnaba ma ka tagayo device-ka — transcript-ka waxaa loo encrypt gareeyaa oo waxaa lagu kaydiyaa alongside voice message in conversation view. Volunteers waxay awood u leeyihiin inay enable ama disable gareyaan transcription in their personal settings.

## Security notes

- Signal waxay bixisaa end-to-end encryption between user and signal-cli bridge
- Bridge-ka waxay decrypt gareysaa messages si ay u gudbiyaan as webhooks — bridge server-ka waxay heshaa plaintext access
- Webhook authentication waxay isticmaashaa bearer tokens with constant-time comparison
- Soo koob bridge on same network as your Asterisk server (haddii la jiro) for minimal exposure
- Bridge-ka waxay kaydsan tahay message history locally in Docker volume — consider encryption at rest
- For maximum privacy: self-host both Asterisk (voice) iyo signal-cli (messaging) on your own infrastructure

## Troubleshooting

- **Bridge not receiving messages**: Check in phone number si sax ah loo diiwaan geliyay with `GET /v1/about`
- **Webhook delivery failures**: Verify webhook URL-ka la heli karo from bridge server oo authorization header uu iswaafaqsan yahay
- **Registration issues**: Qaar phone numbers waxay u baahan yihiin inay ka go'aan existing Signal account first
