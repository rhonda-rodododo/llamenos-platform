---
title: "ማዋቀር: Plivo"
description: Plivoን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
---

Plivo በጀት የሚስማማ የደመነ መድረክ ስልክ አቅራቢ ነው። ከTwilio ጋር ተመሳሳይ XML-ተኮር ጥሪ ቁጥጥር ይጠቀማል፣ ስለዚህ ከLlamenos ጋር ማጋጠም ቀላል ነው።

## ቅድመ ሁኔታዎች

- [Plivo መለያ](https://console.plivo.com/accounts/register/) (የሙከራ ክሬዲት አለ)
- የእርስዎ Llamenos instance ተጭኖ እና በይፋዊ URL በኩል ተደራሽ መሆን

## 1. Plivo መለያ ይፍጠሩ

በ[console.plivo.com](https://console.plivo.com/accounts/register/) ይመዝገቡ። ከማረጋገጫ በኋላ፣ **Auth ID** እና **Auth Token** ከdashboard ዋናው ገጽ ላይ ሊያገኙት ይችላሉ።

## 2. ስልክ ቁጥር ይግዙ

1. በPlivo Console ውስጥ ወደ **Phone Numbers** > **Buy Numbers** ይሂዱ
2. ሀገርዎን ይምረጡ እና ድምፅ ችሎታ ያላቸውን ቁጥሮች ይፈልጉ
3. ቁጥር ይግዙ

## 3. XML application ይፍጠሩ

Plivo ጥሪዎችን ለማስተላለፍ "XML Applications" ይጠቀማል፦

1. ወደ **Voice** > **XML Applications** ይሂዱ
2. **Add New Application** ተጭነው
3. ያዘጋጁ፦
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-domain.com/api/telephony/status` (POST)
4. Application ያስቀምጡ

## 4. ስልክ ቁጥሩን ያጣምሩ

1. ወደ **Phone Numbers** > **Your Numbers** ይሂዱ
2. በHotline ቁጥርዎ ላይ ይጫኑ
3. በ**Voice** ስር፣ ከደረጃ 3 የፈጠሩትን XML Application ይምረጡ
4. ያስቀምጡ

## 5. በLlamenos ውስጥ ያዋቅሩ

1. እንደ አስተዳዳሪ ይግቡ
2. ወደ **Settings** > **Telephony Provider** ይሂዱ
3. ከአቅራቢ dropdown ውስጥ **Plivo**ን ይምረጡ
4. ያስገቡ፦
   - **Auth ID**: ከPlivo Console dashboard
   - **Auth Token**: ከPlivo Console dashboard
   - **Phone Number**: የገዙት ቁጥር (E.164 ቅርጸት)
5. **Save** ተጭነው

## 6. ማዋቀሩን ይሞክሩ

Hotline ቁጥርዎን ይደውሉ። የቋንቋ ምርጫ ማውጫ እና ተለማማዲ ጥሪ ፍሰት መስማት አለብዎት።

## WebRTC ማዋቀር (አማራጭ)

Plivo WebRTC ከነባሪ መረጃዎችዎ ጋር Browser SDK ይጠቀማል፦

1. በPlivo Console ውስጥ፣ ወደ **Voice** > **Endpoints** ይሂዱ
2. አዲስ endpoint ይፍጠሩ (ይህ የአሳሽ ስልክ ማንነት ይሆናል)
3. በLlamenos ውስጥ፣ ወደ **Settings** > **Telephony Provider** ይሂዱ
4. **WebRTC Calling**ን ያንቁ
5. **Save** ተጭነው

Adapter ከAuth ID እና Auth Token ጋር ለደህንነታዊ አሳሽ ማረጋገጫ የጊዜ-ተገደብ HMAC tokens ያመነጫል።

## Plivo-ተናዳድ ማስታወሻዎች

- **XML vs TwiML**: Plivo ለጥሪ ቁጥር የራሱን XML ቅርጸት ይጠቀማል፣ ከTwilio ጋር ተመሳሳይ ነገር ነው። Llamenos adapter ትክክለኛውን Plivo XML በራስ-ሰር ያመነጫል።
- **Answer URL vs Hangup URL**: Plivo መጀመሪያ ጥሪ handler (Answer URL) ከጥሪ መጨረሻ handler (Hangup URL) ይለያል፣ Twilio አንድ status callback ይጠቀማል።
- **Rate limits**: Plivo API rate limits አሉት እና በመለያ ደረጃ ይለያያሉ። ለከፍተኛ መጠን hotlines፣ Plivo support ለማሳደግ ያነጋግሩ።

## ችግር መፍቻ

- **"Auth ID invalid"**: Auth ID ኢሜልዎ አይደለም። በPlivo Console dashboard ዋናው ገጽ ላይ ያግኙት።
- **ጥሪዎች አይሄዱም**: ስልክ ቁጥሩ ትክክለኛውን XML Application ጋር መጣመሩን ያረጋግጡ።
- **Answer URL ስህተቶች**: Plivo ትክክለኛ XML responses ይጠይቃል። ለresponse ስህተቶች ሰርቨር logs ይመልከቱ።
- **ወጪ ጥሪ ገደቦች**: Trial መለያዎች ወጪ ጥሪ ላይ ገደቦች አላቸው። ለምርት ያሻሽሉ።
