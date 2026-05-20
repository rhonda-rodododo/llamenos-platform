---
title: "ማዋቀር: Signal"
description: በsignal-cli bridge በኩል የSignal መልእክት ሰርጥን ለግላዊነት-ተኮር መልእክት ልውውጥ ያዘጋጁ።
---

Llamenos Signal መልእክት ልውውጥን በራስ-ማስተናገድ [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) bridge በኩል ይደግፋል። Signal ከማንኛውም የመልእክት ሰርጥ የበለጠ ግላዊነት ዋስትና ያቀርባል፣ ስለዚህ ለስሜታዊ የአደጋ ጊዜ ምላሽ ሁኔታዎች ኢዲአል ነው።

## ቅድመ ሁኔታዎች

- ለbridge Linux ሰርቨር ወይም VM (ከAsterisk ጋር ተመሳሳይ ሰርቨር ሊሆን ይችላል፣ ወይም የተለየ)
- በbridge ሰርቨር ላይ Docker ተጭኗል
- ለSignal ምዝገባ የተመደበ ስልክ ቁጥር
- ከbridge ወደ Llamenos ሰርቨር የኔትዎርክ መድረስ

## አርክቴክቸር

![Signal Bridge Architecture](/diagrams/signal-bridge.svg)

signal-cli bridge በእርስዎ መሰረተ-ልማት ላይ ይሰራል እና መልእክቶችን ወደ ሰርቨርዎ በHTTP webhooks በኩል ያስተላልፋል። ይህ ማለት ከSignal ወደ መተግበሪያዎ የመልእክት መንገድ ሙሉ በሙሉ በእርስዎ ቁጥጥር ስር ማለት ነው።

## 1. signal-cli bridge ያስተግቡ

signal-cli-rest-api Docker container ያሂዱ፦

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. ስልክ ቁጥር ይመዝገቡ

Bridge ከተመደበ ስልክ ቁጥር ጋር ይመዝገቡ፦

```bash
# በSMS በኩል verification code ይጠይቁ
curl -X POST http://localhost:8080/v1/register/+1234567890

# ከደረሰዎት ኮድ ጋር ያረጋግጡ
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Webhook forwarding ያዋቅሩ

ገቢ መልእክቶችን ወደ ሰርቨርዎ ለማስተላለፍ bridge ያዘጋጁ፦

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

## 4. Signal በአስተዳዳሪ ቅንጅቶች ውስጥ ያንቁ

ወደ **Admin Settings > Messaging Channels** ይሂዱ (ወይም setup wizard ይጠቀሙ) እና **Signal**ን ያንቁ።

የሚከተሉትን ያስገቡ፦
- **Bridge URL** — የsignal-cli bridge URL (ለምሳሌ፣ `https://signal-bridge.example.com:8080`)
- **Bridge API Key** — ወደ bridge ለማረጋገጫ የሚጠቀሙ bearer token
- **Webhook Secret** — ገቢ webhooks ለማረጋገጫ የሚጠቀሙ ሚስጥር (ከደረጃ 3 ከዋቀሩት ጋር መዛመድ አለበት)
- **Registered Number** — ከSignal ጋር የተመዘገበው ስልክ ቁጥር

## 5. ይሞክሩ

ወደ የተመዘገበው ስልክ ቁጥር Signal መልእክት ይላኩ። መልእክቱ በ**Conversations** ትር ውስጥ መታየት አለበት።

## የጤና ክትትል

Llamenos signal-cli bridge ጤና ይከታተላል፦
- ወደ bridge `/v1/about` endpoint ጊዜያዊ ጤና ፍተሻዎች
- bridge ሊደርስ ካልቻለ ጥሩ መታወክ — ሌሎች ሰርጦች መስራታቸውን ይቀጥላሉ
- bridge ሲወርድ አስተዳዳሪ ማስጠንቀቂያዎች

## የድምፅ መልእክት transcription

Signal የድምፅ መልእክቶች በበጎ ፈቃደኛው አሳሽ ውስጥ በclient-side Whisper (WASM via `@huggingface/transformers`) በቀጥታ ሊtranscribe ይችላሉ። ኦዲዮ መሳሪያውን ከቶ አይለቅም — transcript ከድምፅ መልእክቱ ጋር በውይይት እይታው ውስጥ ተመሰጥሮ ይቆማል። በጎ ፈቃደኞች transcription በየግል ቅንጅቶቻቸው ውስጥ ማንቃት ወይም ማጥፋት ይችላሉ።

## የደህንነት ማስታወሻዎች

- Signal በተጠቃሚ እና signal-cli bridge መካከል end-to-end encryption ይሰጣል
- Bridge መልእክቶችን እንደ webhooks ለማስተላለፍ ያስወግዳል — bridge ሰርቨር plaintext መድረስ አለበት
- Webhook ማረጋገጫ constant-time comparison ያላቸውን bearer tokens ይጠቀማል
- Bridge ከAsterisk ሰርቨር ጋር (ካለ) በተመሳሳይ network ላይ ለመጠበቅ ይሞክሩ
- Bridge የመልእክት ታሪኩን በDocker volume ውስጥ ይቆያል — ማረፍያ ላይ encryption ያስቡ
- ለከፍተኛ ግላዊነት፦ Asterisk (ድምፅ) እና signal-cli (መልእክት) ሁለቱንም በራስዎ መሰረተ-ልማት ላይ ያስተናግዱ

## ችግር መፍቻ

- **Bridge መልእክቶችን አይቀበልም**: ስልክ ቁጥሩ በ`GET /v1/about` ትክክለኛ መመዝገቡን ያረጋግጡ
- **Webhook delivery ስህተቶች**: Webhook URL ከbridge ሰርቨር ተደራሽ መሆኑን እና authorization header መዛመዱን ያረጋግጡ
- **ምዝገባ ችግሮች**: አንዳንዸ ስልክ ቁጥሮች ከቀድሞ ካለው Signal መለያ መለየት ሊፈልጉ ይችላሉ
