---
title: "ማዋቀር: Twilio"
description: Twilioን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
---

Twilio ለLlamenos ነባሪ የስልክ አቅራቢ እና ለመጀመር በጣም ቀላል ነው። ይህ መመሪያ የመለያ ፍጠር፣ የስልክ ቁጥር ማዋቀር፣ እና webhook ማዋቀርን ያስተምርዎታል።

## ቅድመ ሁኔታዎች

- [Twilio መለያ](https://www.twilio.com/try-twilio) (ለሙከራ ነፃ trial ይሰራል)
- የእርስዎ Llamenos instance ተጭኖ እና በይፋዊ URL በኩል ተደራሽ መሆን

## 1. Twilio መለያ ይፍጠሩ

በ[twilio.com/try-twilio](https://www.twilio.com/try-twilio) ይመዝገቡ። ኢሜል እና ስልክ ቁጥርዎን ያረጋግጡ። Twilio ለሙከራ ክሬዲት ይሰጣል።

## 2. ስልክ ቁጥር ይግዙ

1. በTwilio Console ውስጥ ወደ **Phone Numbers** > **Manage** > **Buy a number** ይሂዱ
2. በሚፈልጉት area code ውስጥ **Voice** ችሎታ ያለውን ቁጥር ይፈልጉ
3. **Buy** ተጭነው ያረጋግጡ

ይህን ቁጥር ያስታውሱ — በLlamenos አስተዳዳሪ ቅንጅቶች ውስጥ ያስገቡታል።

## 3. Account SID እና Auth Token ያግኙ

1. ወደ [Twilio Console dashboard](https://console.twilio.com) ይሂዱ
2. በዋናው ገጽ ላይ **Account SID** እና **Auth Token** ያግኙ
3. Auth Token ለማየት የዓይን አዶን ይጫኑ

## 4. Webhooks ያዋቅሩ

በTwilio Console ውስጥ፣ ወደ ስልክ ቁጥርዎ ማዋቀሪያ ይሂዱ፦

1. ወደ **Phone Numbers** > **Manage** > **Active Numbers** ይሂዱ
2. Hotline ቁጥርዎን ይጫኑ
3. በ**Voice Configuration** ስር ያዘጋጁ፦
   - **A call comes in**: Webhook፣ `https://your-domain.com/api/telephony/incoming`፣ HTTP POST
   - **Call status changes**: `https://your-domain.com/api/telephony/status`፣ HTTP POST

`your-domain.com` ከእውነተኛው Llamenos መተግበሪያ URL ጋር ይተኩ።

## 5. በLlamenos ውስጥ ያዋቅሩ

1. እንደ አስተዳዳሪ ይግቡ
2. ወደ **Settings** > **Telephony Provider** ይሂዱ
3. ከአቅራቢ dropdown ውስጥ **Twilio**ን ይምረጡ
4. ያስገቡ፦
   - **Account SID**: ከደረጃ 3
   - **Auth Token**: ከደረጃ 3
   - **Phone Number**: የገዙት ቁጥር (E.164 ቅርጸት፣ ለምሳሌ፣ `+15551234567`)
5. **Save** ተጭነው

## 6. ማዋቀሩን ይሞክሩ

ከስልክዎ Hotline ቁጥርዎን ይደውሉ። የቋንቋ ምርጫ ማውጫ መስማት አለብዎት። በፊት ለፊት ላይ ያሉ በጎ ፈቃደኞች ካሉ፣ ጥሪው ይደርሳቸዋል።

## WebRTC ማዋቀር (አማራጭ)

በጎ ፈቃደኞች ጥሪዎችን በስልካቸው ፋንታ በአሳሽ ውስጥ ለመመለስ፦

### API Key ይፍጠሩ

1. በTwilio Console ውስጥ ወደ **Account** > **API keys & tokens** ይሂዱ
2. **Create API Key** ተጭነው
3. **Standard** key አይነትን ይምረጡ
4. **SID** እና **Secret** ያስታውሱ — ሚስጥሩ አንዴ ብቻ ይታያል

### TwiML App ይፍጠሩ

1. ወደ **Voice** > **Manage** > **TwiML Apps** ይሂዱ
2. **Create new TwiML App** ተጭነው
3. **Voice Request URL** ወደ `https://your-domain.com/api/telephony/webrtc-incoming` ያዘጋጁ
4. ያስታውሱ እና **App SID** ይመዝገቡ

### በLlamenos ውስጥ ያንቁ

1. ወደ **Settings** > **Telephony Provider** ይሂዱ
2. **WebRTC Calling**ን ያንቁ
3. ያስገቡ፦
   - **API Key SID**: ከየፈጠሩት API key
   - **API Key Secret**: ከየፈጠሩት API key
   - **TwiML App SID**: ከየፈጠሩት TwiML App
4. **Save** ተጭነው

የበጎ ፈቃደኛ ማዋቀሪያ እና ችግር መፍቻ ለWebRTC [WebRTC አሳሽ ጥሪ](/docs/deploy/providers/webrtc) ይመልከቱ።

## ችግር መፍቻ

- **ጥሪዎች አይደርሱም**: Webhook URL ትክክል መሆኑን እና ሰርቨርዎ ተጭኖ መሆኑን ያረጋግጡ። Twilio Console error logs ይመልከቱ።
- **"Invalid webhook" ስህተቶች**: Webhook URL HTTPS መጠቀሙን እና ትክክለኛ TwiML መመለሱን ያረጋግጡ።
- **Trial መለያ ገደቦች**: Trial መለያዎች ለተረጋገጡ ቁጥሮች ብቻ መደወል ይችላሉ። ለምርት ክፍያ ያለው መለያ ያሻሽሉ።
- **Webhook ማረጋገጫ መሳካት**: በLlamenos ውስጥ ያለው Auth Token ከTwilio Console ጋር መዛመዱን ያረጋግጡ።
