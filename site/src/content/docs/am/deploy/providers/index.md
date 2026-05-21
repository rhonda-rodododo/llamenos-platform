---
title: የስልክ አቅራቢዎች
description: የተደገፉ የስልክ አቅራቢዎችን ያወዳድሩ እና ለእርስዎ hotline የተሻለውን ይምረጡ።
---

Llamenos በ**TelephonyAdapter** በተሰኘው በይነገጽ በኩል ብዙ የስልክ አቅራቢዎችን ይደግፋል። አቅራቢዎችን በማንኛውም ጊዜ ከአስተዳዳሪ ቅንጅቶች መቀየር ይችላሉ — መተግበሪያ ኮድን ሳይቀይሩ።

## የተደገፉ አቅራቢዎች

| አቅራቢ | አይነት | የዋጋ ሞዴል | WebRTC ድጋፍ | የማዋቀር ውስብስብነት | ለምን ጥሩ ነው |
|---|---|---|---|---|---|
| **Twilio** | Cloud | በደቂቃ | አዎ | ቀላል | በፍጥነት መጀመር |
| **SignalWire** | Cloud | በደቂቃ (ያነሰ) | አዎ | ቀላል | ዋጋን የሚጠብቁ ድርጅቶች |
| **Vonage** | Cloud | በደቂቃ | አዎ | መካከለኛ | ዓለም አቀፍ ድጋፍ |
| **Plivo** | Cloud | በደቂቃ | አዎ | መካከለኛ | በጀት የሚስማማ አማራጭ |
| **Telnyx** | Cloud | በደቂቃ | አዎ | መካከለኛ | ለገንቢዎች ተስማሚ |
| **Bandwidth** | Cloud | በደቂቃ | አዎ | መካከለኛ | የአሜሪካ ጥራት |
| **Asterisk** | ራስ-ማስተናገድ | SIP trunk ዋጋ ብቻ | አዎ (sip-bridge በኩል) | ከባድ | ከፍተኛ ግላዊነት |
| **FreeSWITCH** | ራስ-ማስተናገድ | SIP trunk ዋጋ ብቻ | አዎ (sip-bridge በኩል) | ከባድ | ከፍተኛ መጠን |

## የዋጋ ውድድር

ለአሜሪካ ድምፅ ጥሪዎች አካባቢያዊ በደቂቃ ዋጋ (በክልል እና መጠን ይለያያል):

| አቅራቢ | ገቢ | ወጪ | ስልክ ቁጥር | ነፃ ደረጃ |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/ወር | የሙከራ ክሬዲት |
| SignalWire | $0.005 | $0.009 | $1.00/ወር | የሙከራ ክሬዲት |
| Vonage | $0.0049 | $0.0139 | $1.00/ወር | ነፃ ክሬዲት |
| Plivo | $0.0055 | $0.010 | $0.80/ወር | የሙከራ ክሬዲት |
| Telnyx | $0.005 | $0.009 | $1.00/ወር | የሙከራ ክሬዲት |
| Asterisk | SIP trunk ዋጋ | SIP trunk ዋጋ | ከSIP አቅራቢ | የለም |

## የባህሪ ድጋፍ ማትሪክስ

| ባህሪ | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| ጥሪ መቅዳት | አዎ | አዎ | አዎ | አዎ | አዎ |
| በጊዜ-እውነታ transcription | አዎ | አዎ | አዎ | አዎ | አዎ (bridge በኩል) |
| Voice CAPTCHA | አዎ | አዎ | አዎ | አዎ | አዎ |
| Voicemail | አዎ | አዎ | አዎ | አዎ | አዎ |
| WebRTC አሳሽ ጥሪ | አዎ | አዎ | አዎ | አዎ | አዎ (SIP.js) |
| Webhook ማረጋገጫ | አዎ | አዎ | አዎ | አዎ | ብጁ (HMAC) |
| ተመሳሳይ ጊዜ መደወል | አዎ | አዎ | አዎ | አዎ | አዎ |

## SIP bridge

ራስ-ማስተናገድ አቅራቢዎች (Asterisk፣ FreeSWITCH፣ Kamailio) በ`sip-bridge` አገልግሎት በኩል ይደረሳሉ። የኋላ-ገጽ ለመምረጥ `PBX_TYPE` የአካባቢ ተለዋዋጭ ያዘጋጁ፦

```env
PBX_TYPE=asterisk      # Asterisk ARI
PBX_TYPE=freeswitch    # FreeSWITCH ESL
PBX_TYPE=kamailio      # Kamailio
```

## እንዴት ማዋቀር እንደሚቻል

1. በአስተዳዳሪ sidebar ውስጥ ወደ **Settings** ይሂዱ
2. **Telephony Provider** ክፍሉን ይክፈቱ
3. ከdropdown ውስጥ አቅራቢዎን ይምረጡ
4. የሚያስፈልጉ መረጃዎችን ያስገቡ
5. Hotline ስልክ ቁጥርዎን በE.164 ቅርጸት ያዘጋጁ (ለምሳሌ፣ `+15551234567`)
6. **Save** ተጭነው
7. በአቅራቢዎ console ውስጥ webhooks ያዋቅሩ

የእያንዳንዱን ማዋቀሪያ መመሪያ ይመልከቱ፦

- [Twilio ማዋቀር](/docs/en/deploy/providers/twilio)
- [SignalWire ማዋቀር](/docs/en/deploy/providers/signalwire)
- [Vonage ማዋቀር](/docs/en/deploy/providers/vonage)
- [Plivo ማዋቀር](/docs/en/deploy/providers/plivo)
- [Asterisk ማዋቀር (ራስ-ማስተናገድ)](/docs/en/deploy/providers/asterisk)
- [SMS ማዋቀር](/docs/en/deploy/providers/sms)
- [WhatsApp ማዋቀር](/docs/en/deploy/providers/whatsapp)
- [Signal ማዋቀር](/docs/en/deploy/providers/signal)
- [WebRTC አሳሽ ጥሪ](/docs/en/deploy/providers/webrtc)
