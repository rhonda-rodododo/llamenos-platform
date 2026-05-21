---
title: "Sazkirin: Signal"
description: Kanala peyamên Signal bi navgîniya signal-cli bridge ji bo peyamên li ser parastina nepeniyê saz bikin.
---

Llamenos peyamên Signal bi navgîniya bridge-a xweser [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) piştgirî dike. Signal garantiyên herî zêde yên nepeniyê ji her kanala peyamên din dide, ku ji bo senaryoyên bersivdana krizê yên hesas bêhempa dike.

## Pêşdibistan

- Serverek Linux an VM ji bo bridge (dikare heman serverê Asterisk be, an cuda)
- Docker li ser servera bridge hatiye sazkirin
- Hejmarek telefonê ya taybet ji bo qeydkirina Signal
- Gihiştina torê ji bridge ber bi servera Llamenos

## Mîmarî

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Bridge-a signal-cli li ser înfrastruktura we dixebite û peyaman bi navgîniya webhookên HTTP ber bi servera we ve dişîne. Ev tê vê wateyê ku hûn riya peyamê ji Signal ber bi serîlêdana xwe bi tevahî kontrol dikin.

## 1. Bridge-a signal-cli Saz bikin

Konteynera Docker-a signal-cli-rest-api bixebitînin:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Hejmarek telefonê qeyd bikin

Bridge bi hejmarek telefonê ya taybet qeyd bikin:

```bash
# Koda verastkirinê bi navgîniya SMS bixwazin
curl -X POST http://localhost:8080/v1/register/+1234567890

# Bi koda ku wergirtî verast bikin
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Rêveberiya webhookê saz bikin

Bridge saz bikin da ku peyamên hatî ber bi servera we ve bişîne:

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

## 4. Signal di mîhengên rêveberiyê de çalak bikin

Biçin **Admin Settings > Messaging Channels** (an jî sihêrbara sazkirinê bikar bînin) û **Signal** çalak bikin.

Van têkevin:
- **Bridge URL** — URL-ya bridge-a signal-cli ya we (mînak, `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — tokenek bearer ji bo erêkirina daxwazên ber bi bridge ve
- **Webhook Secret** — sirêya ku ji bo erêkirina webhookên hatî bikar tê (divê bi ya ku di gava 3 de saz kirî re li hev bê)
- **Registered Number** — hejmara telefonê ya bi Signal re hatiye qeydkirin

## 5. Biceribînin

Peyamek Signalê bişînin hejmara telefonê ya qeydkirî ya we. Dîalog divê di taba **Conversations** de xuya bibe.

## Çavdêriya tenduristiyê

Llamenos tenduristiya bridge-a signal-cli çavdêriyê dike:
- Kontrolên tenduristiya demkî ber bi endpointê `/v1/about` yê bridge
- Jêbûna bi rûmet heke bridge negihîştî be — kanalên din berdewam dikin
- Hişyariyên rêveber dema ku bridge têk diçe

## Transkripsiyona peyama dengî

Peyamên dengî yên Signal dikarin rasterast di geroka xwebexş de bi navgîniya Whisper-a aliyê xerîdar (WASM bi navgîniya `@huggingface/transformers`) werin transkripsiyon kirin. Deng ji amûrê derdikeve — transkripsiyon şîfrekirî ye û li gel peyama dengî di dîmena dîalogê de tê tomar kirin. Xwebexş dikarin transkripsiyonê di mîhengên kesane yên xwe de çalak an jî neçalak bikin.

## Notên ewlehiyê

- Signal şîfrekirina end-to-end di navbera bikarhêner û bridge-a signal-cli de peyda dike
- Bridge peyaman ji bo ku wekî webhookên pêşde bişîne şîfre vedike — servera bridge gihiştina plaintext heye
- Erêkirina webhook bi tokenên bearer bi berawirdkirina dema sabît tê kirin
- Bridge li ser heman torê wekî servera Asterisk-a we bihêlin (heke derbasdar be) ji bo kêmtirîn eşkerekirin
- Bridge dîroka peyaman bi xweber di volume-a xwe ya Docker de tomar dike — şîfrekirina li ser dîskê bifikirin
- Ji bo nepeniya herî zêde: hem Asterisk (deng) û hem jî signal-cli (peyam) li ser înfrastruktura xwe ya xweser bihêlin

## Çareserkirina Arîşeyan

- **Bridge peyamên nagire**: Kontrol bikin ku hejmara telefonê bi rastî bi `GET /v1/about` hatiye qeydkirin
- **Têkiliyên webhook**: URL-ya webhookê ji servera bridge ve gihîştî ye û header-a erêkirinê li hev tê piştrast bikin
- **Arîşeyên qeydkirinê**: Hin hejmarên telefonê dibe ku pêşî ji hesabek Signal-a heyî werin veqetandin
