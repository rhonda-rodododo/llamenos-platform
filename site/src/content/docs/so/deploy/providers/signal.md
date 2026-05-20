---
title: "Tafatirka: Signal"
description: Tafatir kanaalka fariimaha Signal iyada oo loo marayo signal-cli bridge si loogu dhowaad fariimaha gaarka ah.
---

Llamenos waxay taageertaa fariimaha Signal iyada oo loo marayo [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge oo gacanta lagu hayo. Signal wuxuu bixiyaa ilaalinta ugu xoogsan ee gaarka ah ee kanaal kasta oo fariimo ah, taasoo ka dhigaysa mid aad u habboon xaaladaha jawaab celinta dhibaatooyinka ee gaarka ah.

## Shuruudaha hore

- Server Linux ama VM bridge-ka (waxay noqon kartaa isla server-ka Asterisk, ama mid ka duwan)
- Docker oo ku rakiban server-ka bridge-ka
- Lambarka taleefan oo keliya oo loogu talagalay diiwaangelinta Signal
- Helitaanka shabakadda bridge-ka ilaa server-kaaga Llamenos

## Qaab-dhismeedka

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

Bridge-ka signal-cli waxay ku shaqeysaa infrastructure-kaaga oo ay u gudbiyaan fariimaha server-kaaga via HTTP webhooks. Tani waxay macnaheedu yahay inaad maamusho dhammaan waddada fariimaha ee laga bilaabo Signal ilaa codsigaaga.

## 1. Soo saar bridge-ka signal-cli

Ordi container-ka signal-cli-rest-api Docker:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Diiwaangeli lambarka taleefanka

Diiwaangeli bridge-ka iyada oo la isticmaalayo lambarka taleefan oo keliya:

```bash
# Codsiga koodhka xaqiijinta via SMS
curl -X POST http://localhost:8080/v1/register/+1234567890

# Xaqiiji iyada oo la isticmaalayo koodhkaad heshay
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Tafatir gudbinta webhook

Habeey bridge-ka si uu u gudbiyo fariimaha soo gala server-kaaga:

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

## 4. Fur Signal goobaha maamulka

U gudub **Admin Settings > Messaging Channels** (ama isticmaal setup wizard) oo beddel **Signal** ON.

Geli waxyaabaha soo socda:
- **Bridge URL** — URL-ga bridge-kaaga signal-cli (tusaale, `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — bearer token si loo xaqiijiyo codsiyada bridge-ka
- **Webhook Secret** — sirka loo isticmaalo in lagu xaqiijiyo webhooks soo gala (waa inuu waafaqsan yahay waxaad ku tafatirtay tallaabo 3)
- **Registered Number** — lambarka taleefanka ee la diiwaangeliyay Signal

## 5. Tijaabi

U dir fariimaha Signal lambarkaaga taleefanka ee la diiwaangeliyay. Wada hadalku waa inuu ka muuqdaa tab-ka **Conversations**.

## Kormeerka caafimaadka

Llamenos waxay kormeertaa caafimaadka bridge-ka signal-cli:
- Hubin joogto ah oo ku saabsan endpoint-ka `/v1/about` ee bridge-ka
- Hoos u dhaca qumman haddii bridge-ka aan la gaari karin — kanaalada kale way sii shaqeynayaan
- Digniinada maamulka marka bridge-ka uu hoos u dhaco

## Qoraalka fariimaha codka

Fariimaha codka ee Signal waxay noqon karaan in lagu qoro si toos ah browser-ka isbitaallada iyada oo loo isticmaalo Whisper dhinaca client-ka (WASM via `@huggingface/transformers`). Codku marnaba ma ka tagayo device-ka — qoraalka waa inuu la fureeraa oo la kaydiyaa fariimaha codka ee muuqaalka wada hadalka. Isbitaalladu waxay awood u leeyihiin inay awood u yeelato ama ka joojiyaan qoraalka goobaha shakhsiyeed.

## Xusuusinaha amniga

- Signal waxay bixisaa encryption u dhexeeya isticmaalaha iyo bridge-ka signal-cli
- Bridge-ku wuxuu fureeraa fariimaha si uu u gudbiyo sida webhooks — server-ka bridge-ka wuxuu helaa plaintext
- Xaqiijinta webhook waxay isticmaashaa bearer tokens iyada oo leh isbarbardhig waqti-ku-meel-gaar ah
- Sii bridge-ka isla shabakadda server-kaaga Asterisk (haddii la heli karo) si loo yareeyo daahfurka
- Bridge-ku waxay kaydsaa taariikhda fariimaha goobta Docker volume-ka — fiiri encryption marka la joogo
- Si loo helo gaarka ugu sarreeya: isbitaalo gacanta ku haysa Asterisk (cod) iyo signal-cli (fariimo) infrastructure-kaaga

## Xalinta dhibaatooyinka

- **Bridge ma helin fariimo**: Hubi in lambarka taleefanka si sax ah loo diiwaangeliyay iyada oo la isticmaalayo `GET /v1/about`
- **Khaladaadka gudbinta webhook**: Xaqiiji in URL-ga webhook uu ka mid yahay server-ka bridge-ka iyo in madaxa authorization uu waafaqsan yahay
- **Dhibaatooyinka diiwaangelinta**: Qaar ka mid ah lambarrada taleefanka waxay u baahan yihiin in la ka saaro koontada Signal ee horey u jirtay marka hore
