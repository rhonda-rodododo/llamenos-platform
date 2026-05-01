---
title: "Konfigirasyon: Signal"
description: Konfigire chanèl mesaj Signal via pon signal-cli pou mesaj konfidansyèl.
---

Llamenos sipòte mesaj Signal via yon pon [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) otojere. Signal ofri garanti konfidansyalite ki pi fò nan nenpòt chanèl mesaj, ki fè li ideyal pou sityasyon repons kriz sansib.

## Prérequi

- Yon sèvè Linux oswa VM pou pon an (ka menm sèvè ak Asterisk, oswa separe)
- Docker enstale sou sèvè pon an
- Yon nimewo telefòn dedye pou enrejistreman Signal
- Aksè rezo soti nan pon an nan Cloudflare Worker ou a

## Achitekti

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Pon signal-cli la kouri sou enfrastriktirè ou a epi transfere mesaj nan Worker ou a via webhooks HTTP. Sa a vle di ou kontwole tout chemen mesaj soti nan Signal nan aplikasyon ou a.

## 1. Depoze pon signal-cli la

Kouri konteyniè signal-cli-rest-api Docker:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Anrejistre yon nimewo telefòn

Anrejistre pon an ak yon nimewo telefòn dedye:

```bash
# Mande yon kòd verifikasyon via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verifye ak kòd ou resevwa a
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Konfigire transfere webhook

Konfigire pon an pou transfere mesaj rantre nan Worker ou a:

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

## 4. Aktive Signal nan paramèt admin

Ale nan **Paramèt Admin > Chanèl Mesaj** (oswa itilize asistan konfigirasyon) epi aktive **Signal**.

Antre sa ki anba yo:
- **URL Pon** — URL pon signal-cli ou a (egzanp, `https://signal-bridge.example.com:8080`)
- **Kle API Pon** — yon jeton pòtè pou otantifye demann nan pon an
- **Sekrè Webhook** — sekrè itilize pou valide webhooks rantre (dwe matche sa ou te konfigire nan etap 3)
- **Nimewo Anrejistre** — nimewo telefòn anrejistre ak Signal

## 5. Teste

Voye yon mesaj Signal nan nimewo telefòn anrejistre ou a. Konvèsasyon an ta dwe parèt nan onglèt **Konvèsasyon** yo.

## Siveyans sante

Llamenos sivye sante pon signal-cli la:
- Verifikasyon sante peryodik nan pwen final `/v1/about` pon an
- Degradasyon grasye si pon an pa ateyab — lòt chanèl kontinye travay
- Alèt admin lè pon an tonbe

## Trankskripsyon mesaj vwa

Mesaj vwa Signal ka trankri dirèkteman nan navigatè volontè a lè l sèvi ak Whisper bò kliyan (WASM via `@huggingface/transformers`). Odyo pa janm kite aparèy la — trankri a chifre epi estoke ansanm ak mesaj vwa a nan vit konvèsasyon. Volontè ka aktive oswa deaktive trankskripsyon nan paramèt pèsonèl yo.

## Nòt sekirite

- Signal bay chifman de bout an bout ant itilizatè a ak pon signal-cli la
- Pon an dechifre mesaj pou transfere yo kòm webhooks — sèvè pon an gen aksè tèks klè
- Otantifikasyon webhook itilize jeton pòtè ak konparezon tèmporèlman konstan
- Kenbe pon an sou menm rezo ak sèvè Asterisk ou a (si aplikab) pou ekspozisyon minimòm
- Pon an estoke istwa mesaj lokalman nan volim Docker li a — konsidere chifman an repo
- Pou konfidansyalite maksimòm: otojere tou de Asterisk (vwa) ak signal-cli (mesaj) sou pwòp enfrastriktirè ou a

## Depannaj

- **Pon pa resevwa mesaj**: Tcheke ke nimewo telefòn an kòrèkteman anrejistre ak `GET /v1/about`
- **Echèk livrezon webhook**: Verifye URL webhook la ateyab soti nan sèvè pon an epi tèt otorizasyon an matche
- **Pwoblèm anrejistreman**: Kèk nimewo telefòn ka bezwen dezlye soti nan yon kont Signal egzistan premye
