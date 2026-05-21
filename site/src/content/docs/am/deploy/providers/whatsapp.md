---
title: "ማዋቀር: WhatsApp"
description: በMeta Cloud API ወደ WhatsApp Business ይገናኙ።
---

Llamenos WhatsApp Business መልእክት ልውውጥን በMeta Cloud API (Graph API v21.0) በኩል ይደግፋል። WhatsApp ጽሑፍ፣ ምስሎች፣ ሰነዶች፣ ኦዲዮ፣ እና ተግባራዊ መልእክቶችን የመላክ ችሎታ ይሰጣል።

## ቅድመ ሁኔታዎች

- [Meta Business መለያ](https://business.facebook.com)
- WhatsApp Business API ስልክ ቁጥር
- WhatsApp product ከነቁ የMeta developer መተግበሪያ

## የማጋጠሚያ ሁኔታዎች

Llamenos ሁለት የWhatsApp ማጋጠሚያ ሁኔታዎችን ይደግፋል፦

### Meta Direct (የሚመከር)

ቀጥተኛ ወደ Meta Cloud API ይገናኙ። ሙሉ ቁጥጥር እና ሁሉም ባህሪያት ያቀርባል።

**የሚያስፈልጉ መረጃዎች፦**
- **Phone Number ID** — የእርስዎ WhatsApp Business ስልክ ቁጥር ID
- **Business Account ID** — የእርስዎ Meta Business Account ID
- **Access Token** — ረጅም-ጊዜ Meta API access token
- **Verify Token** — ለwebhook ማረጋገጫ የሚመርጡት ብጁ ሀረግ
- **App Secret** — የእርስዎ Meta app secret (ለwebhook ፊርማ ማረጋገጫ)

### Twilio ሁኔታ

ከድምፅ ለTwilio ካዋቀሩ፣ WhatsAppን በTwilio መለያዎ በኩል ማሳለፍ ይችላሉ። ቀላል ማዋቀሪያ፣ ግን አንዳንዸ ባህሪያት የተገደቡ ሊሆኑ ይችላሉ።

**የሚያስፈልጉ መረጃዎች፦**
- የነባሩ Twilio Account SID፣ Auth Token፣ እና Twilio-ተገናኝ WhatsApp sender

## 1. Meta app ይፍጠሩ

1. ወደ [developers.facebook.com](https://developers.facebook.com) ይሂዱ
2. አዲስ app ይፍጠሩ (አይነት፦ Business)
3. **WhatsApp** product ያክሉ
4. በWhatsApp > Getting Started፣ **Phone Number ID** እና **Business Account ID** ያስታውሱ
5. ቋሚ access token ይፍጠሩ (Settings > Access Tokens)

## 2. Webhook ያዋቅሩ

በMeta developer dashboard ውስጥ፦

1. ወደ WhatsApp > Configuration > Webhook ይሂዱ
2. Callback URL ወደ ይህ ያዘጋጁ፦
   ```
   https://your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Verify Token ወደ በLlamenos አስተዳዳሪ ቅንጅቶች ውስጥ የሚያስገቡት ተመሳሳይ ሀረግ ያዘጋጁ
4. ወደ `messages` webhook field ይመዝገቡ

Meta webhook ለማረጋገጫ GET ጥያቄ ይልካል። ሰርቨርዎ verify token ከተዛመደ ከchallenge ጋር ይመልሳል።

## 3. WhatsApp በአስተዳዳሪ ቅንጅቶች ውስጥ ያንቁ

ወደ **Admin Settings > Messaging Channels** ይሂዱ (ወይም setup wizard ይጠቀሙ) እና **WhatsApp**ን ያንቁ።

**Meta Direct** ወይም **Twilio** ሁኔታን ይምረጡ እና የሚያስፈልጉ መረጃዎችን ያስገቡ።

አማራጭ ቅንጅቶችን ያዘጋጁ፦
- **Auto-response message** — ለመጀመሪያ ጊዜ ተገናኝዎች የሚላክ
- **After-hours response** — ከፊት ለፊት ሰዓት ውጭ የሚላክ

## 4. ይሞክሩ

ወደ Business ስልክ ቁጥርዎን WhatsApp መልእክት ይላኩ። መልእክቱ በ**Conversations** ትር ውስጥ መታየት አለበት።

## 24-ሰዓት የመልእክት መስኮት

WhatsApp 24-ሰዓት የመልእክት መስኮት ይጠብቃል፦
- ከመጨረሻ መልእክታቸው በኋላ በ24 ሰዓታት ውስጥ ተጠቃሚን መመለስ ይችላሉ
- ከ24 ሰዓታት በኋላ፣ ውይይቱን ለመቀጠል የተፈቀደ **template message** መጠቀም አለብዎት
- Llamenos ይህን በራስ-ሰር ይይዛል — መስኮቱ ከተዘጋ፣ ውይይቱን ለማስጀመር template message ይልካል

## ሚዲያ ድጋፍ

WhatsApp ሃብታም ሚዲያ መልእክቶችን ይደግፋል፦
- **ምስሎች** (JPEG፣ PNG)
- **ሰነዶች** (PDF፣ Word፣ ወዘተ)
- **ኦዲዮ** (MP3፣ OGG)
- **ቪዲዮ** (MP4)
- **አካባቢ** መጋራት
- **ተግባራዊ** ቁልፎች እና ዝርዝር መልእክቶች

ሚዲያ አባሪዎች በውይይት እይታው ውስጥ inline ይታያሉ።

## የደህንነት ማስታወሻዎች

- WhatsApp በተጠቃሚ እና Meta መሰረተ-ልማት መካከል end-to-end encryption ይጠቀማል
- Meta በቴክኒካል መልእክት ይዘትን በሰርቨሮቻቸው ላይ ሊያዩ ይችላሉ
- መልእክቶች በመቀበል ጊዜ ይመሰጠራሉ እና በዳታቤዝ ውስጥ ይቆማሉ
- Webhook ፊርማዎች በapp secret ጋር HMAC-SHA256 በመጠቀም ይረጋገጣሉ
- ለከፍተኛ ግላዊነት፣ WhatsApp ፋንታ Signalን መጠቀም ያስቡ
