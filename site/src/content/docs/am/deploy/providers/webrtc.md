---
title: WebRTC አሳሽ ጥሪ
description: በጎ ፈቃደኞች WebRTCን በመጠቀም በአሳሽ ውስጥ ጥሪዎችን ለመመለስ ያንቁ።
---

WebRTC (Web Real-Time Communication) በጎ ፈቃደኞች ጥሪዎችን በቀጥታ በአሳሽ ውስጥ ለመመለስ ያስችላል፣ ስልክ ሳያስፈልግ። ይህ ስልክ ቁጥራቸውን ለመጋራት ለማይፈልጉ ወይም ከኮምፒዩተር ለሚሰሩ በጎ ፈቃደኞች ጠቃሚ ነው።

## እንዴት እንደሚሰራ

1. አስተዳዳሪ በስልክ አቅራቢ ቅንጅቶች ውስጥ WebRTCን ያንቁ
2. በጎ ፈቃደኞች በፕሮፋይላቸው ውስጥ ጥሪ ምርጫቸውን ወደ "Browser" ይቀይራሉ
3. ጥሪ ሲመጣ፣ Llamenos መተግበሪያ በአሳሽ ውስጥ በማሳወቂያ ይደውላል
4. በጎ ፈቃደኛው **Answer** ተጭኖ ጥሪውን በአሳሹ ማይክራፎን በኩል ያገናኛል

ጥሪው ኦዲዮ ከስልክ አቅራቢ በኩል WebRTC ግንኙነት በኩል ወደ በጎ ፈቃደኛው አሳሽ ይላካል። የጥሪ ጥራት በበጎ ፈቃደኛው የኢንተርኔት ግንኙነት ይወሰናል።

## ቅድመ ሁኔታዎች

### የአስተዳዳሪ ማዋቀሪያ

- WebRTC ከተደገፈ ስልክ አቅራቢ ጋር ከተንቀሳቀሰ (Twilio፣ SignalWire፣ Vonage፣ ወይም Plivo)
- WebRTC መረጃዎች ተዋቅረዋል (የአቅራቢ ማዋቀሪያ መመሪያዎችን ይመልከቱ)
- WebRTC በ**Settings** > **Telephony Provider** ውስጥ ተንብሯል

### የበጎ ፈቃደኛ መስፈርቶች

- ዘመናዊ አሳሽ (Chrome፣ Firefox፣ Edge፣ ወይም Safari 14.1+)
- የሚሰራ ማይክራፎን
- የተረጋጋ የኢንተርኔት ግንኙነት (አነስተኛ 100 kbps up/down)
- የአሳሽ ማሳወቂያ ፍቃዶች ተሰጥተዋል

## በአቅራቢ የተለየ ማዋቀሪያ

እያንዳንዱ ስልክ አቅራቢ ለWebRTC የተለየ መረጃ ይጠይቃል፦

### Twilio / SignalWire

1. በአቅራቢ console ውስጥ **API Key** ይፍጠሩ
2. Voice URL ወደ `https://your-domain.com/api/telephony/webrtc-incoming` የሚዘጋጅ **TwiML/LaML Application** ይፍጠሩ
3. በLlamenos ውስጥ API Key SID፣ API Key Secret፣ እና Application SID ያስገቡ

### Vonage

1. የእርስዎ Vonage Application ቀድሞ WebRTC ችሎታ አለው
2. በLlamenos ውስጥ Application **private key** (PEM ቅርጸት) ያስገቡ
3. Application ID ከመጀመሪያ ማዋቀሪያ ተዋቅሯል

### Plivo

1. በPlivo Console ውስጥ ከ**Voice** > **Endpoints** አዲስ **Endpoint** ይፍጠሩ
2. WebRTC ነባሪ Auth ID እና Auth Token ይጠቀማል
3. WebRTC በLlamenos ውስጥ ያንቁ — ተጨማሪ መረጃ አያስፈልግም

### Asterisk

Asterisk WebRTC SIP.js ከWebSocket transport ጋር ይጠይቃል። ከcloud አቅራቢዎች ጋር ሲወዳደር የበለጠ ተሳስሯል፦

1. በAsterisk `http.conf` ውስጥ WebSocket transport ያንቁ
2. WebRTC clients ጋር DTLS-SRTP ያላቸው PJSIP endpoints ይፍጠሩ
3. Asterisk ሲመረጥ Llamenos SIP.js client በራስ-ሰር ያዋቅራል

ዝርዝሩን ለAsterisk [Asterisk ማዋቀሪያ መመሪያ](/docs/deploy/providers/asterisk) ይመልከቱ።

## የበጎ ፈቃደኛ ጥሪ ምርጫ ማዋቀሪያ

በጎ ፈቃደኞች ጥሪ ምርጫቸውን በመተግበሪያ ውስጥ ያዘጋጃሉ፦

1. ወደ Llamenos ይግቡ
2. ወደ **Settings** (gear አዶ) ይሂዱ
3. በ**Call Preferences** ስር፣ **Phone** ፋንታ **Browser**ን ይምረጡ
4. ሲጠየቁ ማይክራፎን እና ማሳወቂያ ፍቃዶችን ይስጡ
5. በፊት ለፊት ሰዓትዎ ወቅት Llamenos ትር ክፍት ይቆዩ

ጥሪ ሲመጣ፣ የአሳሽ ማሳወቂያ እና በመተግበሪያው ውስጥ የሚደውል አመልካች ያያሉ። ጥሪውን ለማገናኘት **Answer**ን ይጫኑ።

## አሳሽ ተኳሃኝነት

| አሳሽ | ዴስክቶፕ | ሞባይል | ማስታወሻዎች |
|---|---|---|---|
| Chrome | አዎ | አዎ | የሚመከር |
| Firefox | አዎ | አዎ | ሙሉ ድጋፍ |
| Edge | አዎ | አዎ | Chromium-ተኮር፣ ሙሉ ድጋፍ |
| Safari | አዎ (14.1+) | አዎ (14.1+) | ኦዲዮ ለመጀመር የተጠቃሚ ተግባር ይጠይቃል |
| Brave | አዎ | የተገደበ | ለማይክራፎን shields ማጥፋት ሊፈልግ ይችላል |

## የኦዲዮ ጥራት ምክሮች

- Echo ለመከላከል headset ወይም earbuds ይጠቀሙ
- ማይክራፎንን የሚጠቀሙ ሌሎች መተግበሪያዎችን ይዝጉ
- በተቻለ መጠን የተሰራ የኢንተርኔት ግንኙነት ይጠቀሙ
- WebRTCን ሊያ interfere የሚችሉ browser extensions (VPN extensions፣ ad blockers ከWebRTC leak protection ጋር) ያጥፉ

## ችግር መፍቻ

### ድምፅ የለም

- **ማይክራፎን ፍቃዶች ያረጋግጡ**: በአድራሻ ቤት lock አዶ ላይ ይጫኑ እና ማይክራፎን መድረስ "Allow" መሆኑን ያረጋግጡ
- **ማይክራፎንዎን ይሞክሩ**: የአሳሹን ነባሪ ኦዲዮ ሙከራ ወይም [webcamtest.com](https://webcamtest.com) ይጠቀሙ
- **ኦዲዮ output ያረጋግጡ**: ስፒከሮችዎ ወይም headset እንደ output መሳሪያ መምረጣቸውን ያረጋግጡ

### ጥሪዎች በአሳሽ አይደውሉም

- **ማሳወቂያዎች ታግደዋል**: ለLlamenos ጣቢያ የአሳሽ ማሳወቂያዎች እንደተንቀሳቀሱ ያረጋግጡ
- **ትር አይሰራም**: Llamenos ትር ክፍት መሆን አለበት (በኋላ-ቀን ሊሆን ይችላል፣ ግን ትሩ መኖር አለበት)
- **ጥሪ ምርጫ**: በSettings ውስጥ ጥሪ ምርጫዎ "Browser" መሆኑን ያረጋግጡ
- **WebRTC አልተዋቀረም**: አስተዳዳሪዎ WebRTC እንደተንቀሳቀሰ እና መረጃዎች እንደተዋቀሩ ያረጋግጡ

### Firewall እና NAT ችግሮች

WebRTC STUN/TURN serversን firewall እና NAT ለመሻገር ይጠቀማል። ጥሪዎች ይገናኙ ግን ድምፅ ከሌለ፦

- **የድርጅት firewalls**: አንዳንዸ firewalls UDP trafficን በnon-standard ፖርቶች ያገዳሉ። IT ቡድንዎ UDP traffic በፖርቶች 3478 እና 10000-60000 እንዲፈቅዱ ይጠይቁ
- **Symmetric NAT**: አንዳንዸ routers symmetric NAT ይጠቀማሉ፣ ይህም ቀጥተኛ peer ግንኙነትን ሊከለክል ይችላል። የስልክ አቅራቢ TURN servers ይህን በራስ-ሰር መዝገብ አለባቸው
- **VPN interference**: VPNs WebRTC ግንኙነቶችን ሊያ interfere ይችላሉ። በፊት ለፊት ሰዓትዎ ወቅት VPN ያጥፉ

### Echo ወይም feedback

- ስፒከሮች ፋንታ headphones ይጠቀሙ
- በOS ኦዲዮ ቅንጅቶች ውስጥ ማይክራፎን sensitivity ይቀንሱ
- በአሳሽዎ ውስጥ echo cancellation ያንቁ (በነባሪው ብዙውን ጊዜ ተንቀሳቅሷል)
- ከጠንካራ፣ የሚንበለበል ገጽታዎች ይራቁ
