---
title: "ማዋቀር: SMS"
description: ከስልክ አቅራቢዎ የገቢ/የወጪ SMS መልእክቶችን ያንቁ።
---

በLlamenos ውስጥ የSMS መልእክት ልውውጥ የነባሪ የድምፅ ስልክ አቅራቢ መረጃዎችን ይጠቀማል። ለSMS የተለየ አገልግሎት አያስፈልግም — ከድምፅ ለTwilio፣ SignalWire፣ Vonage፣ ወይም Plivo ካዋቀሩ፣ SMS በተመሳሳይ መለያ ይሰራል።

## የተደገፉ አቅራቢዎች

| አቅራቢ | SMS ድጋፍ | ማስታወሻዎች |
|----------|------------|-------|
| **Twilio** | አዎ | ሙሉ ሁለት-አቅጣጫ SMS በTwilio Messaging API በኩል |
| **SignalWire** | አዎ | ከTwilio API ጋር ተኳሃኝ — ተመሳሳይ በይነገጽ |
| **Vonage** | አዎ | SMS በVonage REST API በኩል |
| **Plivo** | አዎ | SMS በPlivo Message API በኩል |
| **Asterisk** | አይ | Asterisk ተፈጥሯዊ SMS አይደግፍም |

## 1. SMS በአስተዳዳሪ ቅንጅቶች ውስጥ ያንቁ

ወደ **Admin Settings > Messaging Channels** ይሂዱ (ወይም በመጀመሪያ መግቢያ ላይ setup wizard ይጠቀሙ) እና **SMS**ን ያንቁ።

SMS ቅንጅቶችን ያዘጋጁ፦
- **Auto-response message** — ለመጀመሪያ ጊዜ ተገናኝዎች አማራጭ የሰላምታ መልእክት
- **After-hours response** — ከፊት ለፊት ሰዓት ውጭ የሚላክ አማራጭ መልእክት

## 2. Webhook ያዋቅሩ

የስልክ አቅራቢዎን SMS webhook ወደ ሰርቨርዎ ያቅኑ፦

```
POST https://your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. ወደ Twilio Console > Phone Numbers > Active Numbers ይሂዱ
2. ስልክ ቁጥርዎን ይምረጡ
3. በ**Messaging** ስር፣ "A message comes in" የሚለውን webhook URL ወደ ላይ ያዘጋጁ
4. HTTP method ወደ **POST** ያዘጋጁ

### Vonage

1. ወደ Vonage API Dashboard > Applications ይሂዱ
2. መተግበሪያዎን ይምረጡ
3. በ**Messages** ስር፣ Inbound URL ወደ ላይ ያዘጋጁ

### Plivo

1. ወደ Plivo Console > Messaging > Applications ይሂዱ
2. የመልእክት መተግበሪያ ይፍጠሩ ወይም ያርትዑ
3. Message URL ወደ ላይ ያዘጋጁ
4. መተግበሪያውን ለስልክ ቁጥርዎ ያጣምሩ

## 3. ይሞክሩ

ወደ Hotline ስልክ ቁጥርዎን SMS ይላኩ። መልእክቱ በአስተዳዳሪ panel ውስጥ በ**Conversations** ትር ውስጥ መታየት አለበት።

## እንዴት እንደሚሰራ

1. SMS በአቅራቢዎ ይደርሳል፣ ይህም webhook ወደ ሰርቨርዎ ይልካል
2. ሰርቨሩ webhook ፊርማውን ያረጋግጣል (በአቅራቢ የተለየ HMAC)
3. መልእክቱ ተተንትኖ በConversationService ውስጥ ይቆማል
4. በፊት ለፊት ላይ ያሉ በጎ ፈቃደኞች በWebSocket relay ክስተቶች ይሳወቃሉ
5. በጎ ፈቃደኞች ከConversations ትር ውስጥ ይመልሳሉ — ምላሾች በአቅራቢዎን SMS API በኩል ይመለሳሉ

## የደህንነት ማስታወሻዎች

- SMS መልእክቶች በcarrier network በplaintext ያልፋሉ — አቅራቢዎ እና carriers ሊያነቧቸው ይችላሉ
- ገቢ መልእክቶች በመቀበል ጊዜ ይመሰጠራሉ እና በዳታቤዝ ውስጥ ይቆማሉ
- የላኪ ስልክ ቁጥሮች ከማከማቻ በፊት hashed ይደረጋሉ (ግላዊነት)
- Webhook ፊርማዎች በአቅራቢ (Twilio HMAC-SHA1፣ ወዘተ) ይረጋገጣሉ
