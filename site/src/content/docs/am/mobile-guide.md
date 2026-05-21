---
title: የሞባይል መመሪያ
description: Llamenosን በiOS እና Android ላይ ያብጁ እና ያዘጋጁ።
---

የLlamenos ሞባይል መተግበሪያ በጎ ፈቃደኞች ጥሪዎችን መመለስ፣ ለመልእክቶች መመለስ፣ እና የተመሰጠረ ማስታወሻ መጻፍ ከስልካቸው እንዲችሉ ያስችላቸዋል። በReact Native የተሰራ ነው እና ከዴስክቶፕ መተግበሪያ ጋር ተመሳሳይ Rust cryptographic core ይጠቀማል።

## ሞባይል መተግበሪያው ምንድን ነው?

ሞባይል መተግበሪያው የዴስክቶፕ መተግበሪያው ተባባሪ ነው። ከተመሳሳይ Llamenos backend (Cloudflare Workers ወይም ራስ-አስተናጋጅ) ጋር ይገናኛል እና ተመሳሳይ protocol ይጠቀማል፣ በጎ ፈቃደኞች ያለምንም ችግር በዴስክቶፕ እና ሞባይል መካከል መቀየር ይችላሉ።

ሞባይል መተግበሪያው በተለያየ ማጠራቀሚያ ውስጥ ይኖራል (`llamenos-platform`) ግን ያጋራል፣

- **llamenos-core** — ለሁሉም cryptographic ክዋኔዎች ተመሳሳይ Rust crate፣ በUniFFI ለiOS እና Android የተቀናጀ
- **Protocol** — ተመሳሳይ wire format፣ API endpoints፣ እና encryption scheme
- **Backend** — ተመሳሳይ Cloudflare Worker ወይም ራስ-አስተናጋጅ ሰርቨር

## መዉረድ እና መጫን

### Android

ሞባይል መተግበሪያው በአሁኑ ጊዜ ለsideloading እንደ APK ይሰራጫል፣

1. ከቅርብ ጊዜው [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-platform/releases/latest) ገጽ `.apk` ፋይልን ያውርዱ
2. በAndroid መሳሪያዎ ላይ ወደ **Settings > Security** ይሂዱ እና **Install from unknown sources** ያንቁ (ወይም ሲጠየቁ በአንድ መተግበሪያ ያንቁ)
3. የወረደውን APK ይክፈቱ እና **Install** ተጭነው
4. ከተጫነ በኋላ፣ Llamenosን ከመተግበሪያ ጎራጅርዎ ይክፈቱ

App Store እና Play Store ስርጭት ለወደፊት መልቀቅ የታቀደ ነው።

### iOS

iOS ግንባታዎች እንደ TestFlight beta መልቀቆች ይገኛሉ፣

1. ከApp Store [TestFlight](https://apps.apple.com/app/testflight/id899247664) ያጫኑ
2. ከአስተዳዳሪዎ TestFlight የግብዣ ማገናኛውን ይጠይቁ
3. በiOS መሳሪያዎ ላይ ማገናኛውን ይክፈቱ betaውን ለመቀላቀል
4. Llamenosን ከTestFlight ያጫኑ

App Store ስርጭት ለወደፊት መልቀቅ የታቀደ ነው።

## መጀመሪያ ማዋቀር

ሞባይል መተግበሪያው ከቀድሞው የሚገኝ ዴስክቶፕ መለያ ጋር በማገናኘት ይዘጋጃል። ይህ ተመሳሳይ cryptographic identity ምንም ጊዜ ሚስጥሩን በplaintext ሳይልክ በመሳሪያዎች መካከል እንዲጠቀሙ ያረጋግጣል።

### የመሳሪያ provisioning (QR scan)

1. የLlamenos ዴስክቶፕ መተግበሪያውን ይክፈቱ እና ወደ **Settings > Devices** ይሂዱ
2. **Link New Device** ተጭነው — ይህ አንዴ-ጊዜ provisioning token የያዘ QR code ይፈጥራል
3. የLlamenos ሞባይል መተግበሪያውን ይክፈቱ እና **Link Device** ተጭነው
4. በስልክዎ ካሜራ QR codeዎን ይስካን ያድርጉ
5. መተግበሪያዎች የተመሰጠረ key materialን በደህና ለማስተላለፍ ephemeral ECDH key exchange ያደርጋሉ
6. በሞባይል መተግበሪያው ላይ የአካባቢ key storageን ለመጠበቅ PIN ያዘጋጁ
7. ሞባይል መተግበሪያው አሁን ተገናኝቷል እና ለመጠቀም ዝግጁ ነው

Provisioningው ሂደት nsecዎን በplaintext ሊልክ አይችልም። ዴስክቶፕ መተግበሪያው key materialን ከephemeral shared secret ጋር ይጠቅልል፣ እና ሞባይል መተግበሪያው በአካባቢ ያጥፋል።

### Hand setup (nsec entry)

QR code ማስካን ካልቻሉ፣ nsecዎን በቀጥታ ማስገባት ይችላሉ፣

1. ሞባይል መተግበሪያውን ይክፈቱ እና **Enter nsec manually** ተጭነው
2. `nsec1...` ቁልፍዎን ያለጥፉ
3. ለአካባቢ ማከማቻ ጥበቃ PIN ያዘጋጁ
4. መተግበሪያው public keyዎን ያመነጫል እና ከbackend ጋር ይመዘገባል

ይህ ዘዴ nsecዎን በቀጥታ ማስተናገድን ይጠይቃል፣ ስለዚህ device linking ካልተቻለ ብቻ ይጠቀሙበት። nsecውን ለመተየብ ይልቁንም በይለፍ-ቃል አስተዳዳሪ ይጠቀሙ።

## የባህሪ ውድድር

| ባህሪ | ዴስክቶፕ | ሞባይል |
|---|---|---|
| ገቢ ጥሪዎችን መመለስ | አዎ | አዎ |
| የተመሰጠረ ማስታወሻ መጻፍ | አዎ | አዎ |
| ብጁ ማስታወሻ መስኮች | አዎ | አዎ |
| ለመልእክቶች መመለስ (SMS፣ WhatsApp፣ Signal) | አዎ | አዎ |
| ውይይቶችን ማየት | አዎ | አዎ |
| ፊት ለፊት ሰዓት ሁኔታ እና ዕረፍቶች | አዎ | አዎ |
| Client-side transcription | አዎ (WASM Whisper) | አይ |
| ማስታወሻ ፍለጋ | አዎ | አዎ |
| Command palette | አዎ (Ctrl+K) | አይ |
| Keyboard shortcuts | አዎ | አይ |
| Admin ቅንጅቶች | አዎ (ሙሉ) | አዎ (የተገደበ) |
| በጎ ፈቃደኞችን መስተዳድር | አዎ | ብቻ ለማየት |
| Audit logs ማየት | አዎ | አዎ |
| WebRTC browser calling | አዎ | አይ (የራስ ስልክ ይጠቀማል) |
| Push notifications | OS notifications | Native push (FCM/APNS) |
| Auto-update | Tauri updater | App Store / TestFlight |
| ፋይል አባሪዎች (ሪፖርቶች) | አዎ | አዎ |

## ገደቦች

- **Client-side transcription የለም** — WASM Whisper ሞዴል ከፍተኛ ማህደረ-ቃል እና CPU ሀብቶችን ይጠይቃል በሞባይል ላይ አይረጭም። ጥሪ transcription ብቻ በዴስክቶፕ ላይ ይገኛል።
- **የተቀነሰ crypto አፈፃፀም** — ሞባይል መተግበሪያው ተመሳሳይ Rust crypto coreን በUniFFI ቢጠቀምም፣ ክዋኔዎች በዝቅተኛ-መጨረሻ መሳሪያዎች ላይ ከዴስክቶፕ native አፈፃፀም ጋር ሲወዳደር ይቀርላል።
- **የተገደበ admin ባህሪያት** — አንዳንዸ admin ክዋኔዎች (በጅምላ በጎ ፈቃደኛ አስተዳደር፣ የዝርዝር ቅንጅቶች ማዋቀር) ብቻ በዴስክቶፕ መተግበሪያ ላይ ይገኛሉ። ሞባይል መተግበሪያው ለአብዛኛው admin ገጾች የማንበብ-ብቻ እይታ ይሰጣል።
- **WebRTC calling የለም** — ሞባይል በጎ ፈቃደኞች ጥሪዎችን በስልክ ቁጥራቸው በስልክ አቅራቢ በኩል ይቀበላሉ፣ በአሳሽ አይደለም። WebRTC in-app calling ብቻ በዴስክቶፕ ነው።
- **ባትሪ እና ግንኙነት** — መተግበሪያው በጊዜ-እውነታ ዝማኔዎችን ለመቀበል ቀጣይነት ያለው ግንኙነት ያስፈልጋል። የኋላ-ቀን ሞድ በOS የሃይል አስተዳደር ሊገደብ ይችላል። ለታመኑ ማስታወሻዎች ጥሪዎች ሲሰሩ መተግበሪያውን በ forefront ያድርጉ።

## ሞባይል ችግሮችን ማጥፋት

### Provisioning በ"Invalid QR code" ያልተሳካ

- QR code በቅርብ ጊዜ እንደተፈጠረ ያረጋግጡ (provisioning tokens ከ5 ደቂቃዎች በኋላ ያብቃሉ)
- ከዴስክቶፕ መተግበሪያው አዲስ QR code ይፍጠሩ እና እንደገና ይሞክሩ
- ሁለቱም መሳሪያዎች ከበይነመረብ ጋር መገናኘታቸውን ያረጋግጡ

### Push notifications አለማግኘት

- Llamenos ለመልእክቶች በመሳሪያ ቅንጅቶችዎ ውስጥ እንደነቀፋ ያረጋግጡ
- በAndroid፣ ወደ **Settings > Apps > Llamenos > Notifications** ይሂዱ እና ሁሉንም መገናኛዎች ያንቁ
- በiOS፣ ወደ **Settings > Notifications > Llamenos** ይሂዱ እና **Allow Notifications** ያንቁ
- በDo Not Disturb mode አለመሆናቸውን ያረጋግጡ
- ፊት ለፊት ሰዓትዎ እንደሚሰራ እና በዕረፍት ላይ እንዳልሆኑ ያረጋግጡ

### መተግበሪያ ከመክፈቱ ሲፈርስ

- የመተግበሪያውን ዘመናዊ ስሪት እንደሚያሄዱ ያረጋግጡ
- መተግበሪያውን cache ያጽዱ፣ **Settings > Apps > Llamenos > Storage > Clear Cache**
- ችግሩ ከቀጠለ፣ ያጥፉ እና እንደገና ያጫኑ (መሳሪያውን እንደገና ማገናኘት ያስፈልጋል)

### ከመጫን በኋላ የበፊት ማስታወሻዎችን ማጥፋት አለመቻል

- መተግበሪያውን መጫን የአካባቢ key materialን ያስወግዳል
- ዳሽቦርዱን ለመመለስ ከዴስክቶፕ መተግበሪያዎ በQR code መሳሪያውን እንደገና ያገናኙ
- ከመጫን በፊት የተመሰጠሩ ማስታወሻዎች መሳሪያው በተመሳሳይ identity እንደገና ከተገናኘ በኋላ ተደራሽ ይሆናሉ

### በድሮ መሳሪያዎች ላይ ቀር የሚለው አፈፃፀም

- ሌሎች መተግበሪያዎችን ማህደረ-ቃል ለመፍታት ይዝጉ
- ሊገኝ ከሆነ በመተግበሪያ ቅንጅቶች ውስጥ animationዎችን ያጥፉ
- ለከባድ ክዋኔዎች እንደ በጅምላ ማስታወሻ ግምገማ የዴስክቶፕ መተግበሪያውን መጠቀም ያስቡ
