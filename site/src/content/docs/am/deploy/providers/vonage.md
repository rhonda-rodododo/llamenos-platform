---
title: "ማዋቀር: Vonage"
description: Vonageን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
---

Vonage (ቀደም ብሎ Nexmo) ጠንካራ ዓለም አቀፍ ድጋፍ እና ተወዳዳሪ ዋጋ ያቀርባል። ከTwilio የተለየ API ሞዴል ይጠቀማል — Vonage Applications ቁጥርዎን፣ webhooks፣ እና መረጃዎችን አንድ ላይ ያጣምራል።

## ቅድመ ሁኔታዎች

- [Vonage መለያ](https://dashboard.nexmo.com/sign-up) (ነፃ ክሬዲት አለ)
- የእርስዎ Llamenos instance ተጭኖ እና በይፋዊ URL በኩል ተደራሽ መሆን

## 1. Vonage መለያ ይፍጠሩ

በ[Vonage API Dashboard](https://dashboard.nexmo.com/sign-up) ይመዝገቡ። መለያዎን ያረጋግጡ እና ከdashboard ዋናው ገጽ **API Key** እና **API Secret** ያስታውሱ።

## 2. ስልክ ቁጥር ይግዙ

1. በVonage Dashboard ውስጥ ወደ **Numbers** > **Buy numbers** ይሂዱ
2. ሀገርዎን ይምረጡ እና **Voice** ችሎታ ያለውን ቁጥር ይምረጡ
3. ቁጥሩን ይግዙ

## 3. Vonage Application ይፍጠሩ

Vonage ማዋቀሪያዎችን ወደ "Applications" ያጣምራል፦

1. ወደ **Applications** > **Create a new application** ይሂዱ
2. ስም ያስገቡ (ለምሳሌ፣ "Llamenos Hotline")
3. በ**Voice** ስር ያብሩ እና ያዘጋጁ፦
   - **Answer URL**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Event URL**: `https://your-domain.com/api/telephony/status` (POST)
4. **Generate new application** ተጭነው
5. በማረጋገጫ ገጽ ላይ የታየውን **Application ID** ያስታውሱ
6. **private key** ፋይሉን ያውርዱ — ማዋቀሪያ ውስጥ ይህ ያስፈልጋል

## 4. ስልክ ቁጥሩን ያጣምሩ

1. ወደ **Numbers** > **Your numbers** ይሂዱ
2. በHotline ቁጥርዎ አጠገብ ያለውን gear አዶ ይጫኑ
3. በ**Voice** ስር፣ ከደረጃ 3 የፈጠሩትን Application ይምረጡ
4. **Save** ተጭነው

## 5. በLlamenos ውስጥ ያዋቅሩ

1. እንደ አስተዳዳሪ ይግቡ
2. ወደ **Settings** > **Telephony Provider** ይሂዱ
3. ከአቅራቢ dropdown ውስጥ **Vonage**ን ይምረጡ
4. ያስገቡ፦
   - **API Key**: ከVonage Dashboard ዋናው ገጽ
   - **API Secret**: ከVonage Dashboard ዋናው ገጽ
   - **Application ID**: ከደረጃ 3
   - **Phone Number**: የገዙት ቁጥር (E.164 ቅርጸት)
5. **Save** ተጭነው

## 6. ማዋቀሩን ይሞክሩ

Hotline ቁጥርዎን ይደውሉ። የቋንቋ ምርጫ ማውጫ መስማት አለብዎት። ጥሪዎች ወደ ፊት ለፊት ላይ ያሉ በጎ ፈቃደኞች መሄዳቸውን ያረጋግጡ።

## WebRTC ማዋቀር (አማራጭ)

Vonage WebRTC ከዚህ በፊት ከፈጠሩት Application መረጃዎች ይጠቀማል፦

1. በLlamenos ውስጥ፣ ወደ **Settings** > **Telephony Provider** ይሂዱ
2. **WebRTC Calling**ን ያንቁ
3. **Private Key** ይዘት ያስገቡ (ያወረዱት ፋይል ሙሉ PEM ጽሑፍ)
4. **Save** ተጭነው

Application ID ከዚህ በፊት ተዋቅሯል። Vonage ለአሳሽ ማረጋገጫ RS256 JWTs ከprivate key በመጠቀም ያመነጫል።

## Vonage-ተናዳድ ማስታወሻዎች

- **NCCO vs TwiML**: Vonage NCCO (Nexmo Call Control Objects) በJSON ቅርጸት ፋንታ XML markup ይጠቀማል። Llamenos adapter ትክክለኛውን ቅርጸት በራስ-ሰር ያመነጫል።
- **Answer URL ቅርጸት**: Vonage answer URL JSON (NCCO) መመለስ ይጠብቃል፣ XML አይደለም። ይህ adapter በኩል ይደረጋል።
- **Event URL**: Vonage ጥሪ ክስተቶችን (ringing፣ answered፣ completed) ወደ event URL እንደ JSON POST requests ይልካል።
- **Private key ደህንነት**: Private key በተመሰጠረ መልኩ ይቆማል። ከሰርቨር አይወጣም — ለአጭር ጊዜ JWT tokens ለመፍጠር ብቻ ይጠቀማል።

## ችግር መፍቻ

- **"Application not found"**: Application ID ትክክለኛ መሆኑን ያረጋግጡ። በVonage Dashboard ውስጥ ከ**Applications** ስር ሊያገኙት ይችላሉ።
- **ገቢ ጥሪዎች አይደርሱም**: ስልክ ቁጥሩ ትክክለኛውን Application ጋር መጣመሩን ያረጋግጡ (ደረጃ 4)።
- **Private key ስህተቶች**: ሙሉ PEM ጽሑፍ ከ`-----BEGIN PRIVATE KEY-----` እና `-----END PRIVATE KEY-----` መስመሮች ጋር ያስገቡ።
- **ዓለም አቀፍ ቁጥር ቅርጸት**: Vonage E.164 ቅርጸት ይጠይቃል። `+` እና የሀገር ኮድ ያካትቱ።
