---
title: "ማዋቀር: SignalWire"
description: SignalWireን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
---

SignalWire ከTwilio ጋር ሲወዳደር የበለጠ ዋጋ ቆጣቢ አማራጭ ነው። LaML (ከTwiML ጋር ተኳሃኝ markup language) ይጠቀማል፣ ስለዚህ በTwilio እና SignalWire መካከል መቀየር ቀላል ነው።

## ቅድመ ሁኔታዎች

- [SignalWire መለያ](https://signalwire.com/signup) (ነፃ trial አለ)
- የእርስዎ Llamenos instance ተጭኖ እና በይፋዊ URL በኩል ተደራሽ መሆን

## 1. SignalWire መለያ ይፍጠሩ

በ[signalwire.com/signup](https://signalwire.com/signup) ይመዝገቡ። በምዝገባ ወቅት **Space name** ይምረጡ (ለምሳሌ፣ `myhotline`)። የእርስዎ Space URL `myhotline.signalwire.com` ይሆናል። ይህን ስም ያስታውሱ — በማዋቀሪያ ውስጥ ያስፈልጋል።

## 2. ስልክ ቁጥር ይግዙ

1. በSignalWire Dashboard ውስጥ ወደ **Phone Numbers** ይሂዱ
2. **Buy a Phone Number** ተጭነው
3. ድምፅ ችሎታ ያለውን ቁጥር ይፈልጉ
4. ቁጥሩን ይግዙ

## 3. መረጃዎችን ያግኙ

1. በSignalWire Dashboard ውስጥ ወደ **API** ይሂዱ
2. **Project ID** ያግኙ (ይህን Account SID ፋንታ ይጠቀማል)
3. ካልኖረዎት አዲስ **API Token** ይፍጠሩ — ይህን Auth Token ፋንታ ይጠቀማል

## 4. Webhooks ያዋቅሩ

1. በdashboard ውስጥ ወደ **Phone Numbers** ይሂዱ
2. Hotline ቁጥርዎን ይጫኑ
3. በ**Voice Settings** ስር ያዘጋጁ፦
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. በLlamenos ውስጥ ያዋቅሩ

1. እንደ አስተዳዳሪ ይግቡ
2. ወደ **Settings** > **Telephony Provider** ይሂዱ
3. ከአቅራቢ dropdown ውስጥ **SignalWire**ን ይምረጡ
4. ያስገቡ፦
   - **Account SID**: ከደረጃ 3 የመጣው Project ID
   - **Auth Token**: ከደረጃ 3 የመጣው API Token
   - **SignalWire Space**: የእርስዎ Space ስም (እራሱ ስም ብቻ፣ ሙሉ URL አይደለም — ለምሳሌ፣ `myhotline`)
   - **Phone Number**: የገዙት ቁጥር (E.164 ቅርጸት)
5. **Save** ተጭነው

## 6. ማዋቀሩን ይሞክሩ

Hotline ቁጥርዎን ይደውሉ። የቋንቋ ምርጫ ማውጫ እና ጥሪ ፍሰቱን መስማት አለብዎት።

## WebRTC ማዋቀር (አማራጭ)

SignalWire WebRTC ከTwilio ጋር ተመሳሳይ API key ስርዓት ይጠቀማል፦

1. በSignalWire Dashboard ውስጥ፣ ከ**API** > **Tokens** ስር **API Key** ይፍጠሩ
2. **LaML Application** ይፍጠሩ፦
   - ወደ **LaML** > **LaML Applications** ይሂዱ
   - Voice URL ወደ `https://your-domain.com/api/telephony/webrtc-incoming` ያዘጋጁ
   - Application SID ይመዝገቡ
3. በLlamenos ውስጥ፣ ወደ **Settings** > **Telephony Provider** ይሂዱ
4. **WebRTC Calling**ን ያንቁ
5. API Key SID፣ API Key Secret፣ እና Application SID ያስገቡ
6. **Save** ተጭነው

## ከTwilio ጋር ያሉ ልዩነቶች

- **LaML vs TwiML**: SignalWire LaML ይጠቀማል፣ በተግባር TwiML ጋር ተመሳሳይ ነው። Llamenos ይህን በራስ-ሰር ይይዛል።
- **Space URL**: API ጥሪዎች ወደ `{space}.signalwire.com` ይሄዳሉ — ወደ `api.twilio.com` ፋንታ። Adapter ከሚሰጡት Space ስም በኩል ይህን ይይዛል።
- **ዋጋ**: SignalWire በአጠቃላይ ከTwilio በ30-40% ያነሰ ነው።
- **ባህሪ ተመሳሳይነት**: ሁሉም Llamenos ባህሪያት (መቅዳት፣ transcription፣ CAPTCHA፣ voicemail) በSignalWire ተመሳሳይ ይሰራሉ።

## ችግር መፍቻ

- **"Space not found" ስህተቶች**: Space ስምን ድጋሚ ያረጋግጡ (subdomain ብቻ፣ ሙሉ URL አይደለም)።
- **Webhook መሳካት**: ሰርቨርዎ URL በይፋዊነት ተደራሽ እና HTTPS መሆኑን ያረጋግጡ።
- **API token ችግሮች**: SignalWire tokens ጊዜ ሊያብቁ ይችላሉ። ማረጋገጫ ስህተቶች ካጋጠሙ አዲስ token ይፍጠሩ።
