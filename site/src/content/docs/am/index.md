---
title: ዶክመንቴሽን
description: Llamenosን እንዴት ለመተግበር፣ ለማዋቀር እና ለመጠቀም እንደሚቻል ይማሩ።
guidesHeading: መመሪያዎች
guides:
  - title: መነሻ
    description: ቅድመ መስፈርቶች፣ መጫኛ፣ የማዋቀሪያ ዋዜማ፣ እና የመጀመሪያ ጉዞ።
    href: /docs/getting-started
  - title: አርክቴክቸር
    description: የስርዓት አርክቴክቸር አጠቃላይ እይታ — ማጠራቀሚያዎች፣ የመረጃ ፍሰት፣ የማመስጠን ንብርታሮች፣ እና በጊዜ-እውነታ መገናኛ።
    href: /docs/architecture
  - title: የራስ-አስተናጋጅ ግምገማ
    description: በDocker Compose ወይም Kubernetes በራስዎ መሰረተ-ልማት ላይ ያስተናግዱ።
    href: /docs/self-hosting
  - title: "Deploy: Docker Compose"
    description: ከራስ-አስተናጋጅ ጋር በአንድ ሰርቨር መተግበሪያ ከራስ-ሰር የHTTPS።
    href: /docs/deploy-docker
  - title: "Deploy: Kubernetes (Helm)"
    description: በይፋዊው Helm ቻርት ወደ Kubernetes ያስተናግዱ።
    href: /docs/deploy-kubernetes
  - title: የአስተዳዳሪ መመሪያ
    description: በጎ ፈቃደኞችን፣ ፊት ለፊት ሰዓታትን፣ መገናኛዎችን፣ የአገድ ዝርዝሮችን፣ ሪፖርቶችን፣ እና ቅንጅቶችን ያስተዳድሩ።
    href: /docs/admin-guide
  - title: የበጎ ፈቃደኛ መመሪያ
    description: ይግቡ፣ ጥሪዎችን ይቀበሉ፣ ለመልእክቶች ይመልሱ፣ ማስታወሻዎችን ይጻፉ፣ እና transcription ይጠቀሙ።
    href: /docs/volunteer-guide
  - title: የሪፖርተር መመሪያ
    description: የተማሰኑ ሪፖርቶችን ያስገቡ እና ሁኔታቸውን ይከታተሉ።
    href: /docs/reporter-guide
  - title: የሞባይል መመሪያ
    description: Llamenosን በiOS እና Android ላይ ያብጁ እና ያዘጋጁ።
    href: /docs/mobile-guide
  - title: የስልክ አቅራቢዎች
    description: የተደገፉ የስልክ አቅራቢዎችን ያወዳድሩ እና ለእርስዎ hotline የተሻለውን ይምረጡ።
    href: /docs/telephony-providers
  - title: "Setup: SMS"
    description: ከስልክ አቅራቢዎ የገቢ/የወጪ SMS መልእክቶችን ያንቁ።
    href: /docs/setup-sms
  - title: "Setup: WhatsApp"
    description: በMeta Cloud API ወደ WhatsApp Business ይገናኙ።
    href: /docs/setup-whatsapp
  - title: "Setup: Signal"
    description: በsignal-cli bridge ወደ Signal መገናኛ ያዘጋጁ።
    href: /docs/setup-signal
  - title: "Setup: Twilio"
    description: Twilioን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
    href: /docs/setup-twilio
  - title: "Setup: SignalWire"
    description: SignalWireን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
    href: /docs/setup-signalwire
  - title: "Setup: Vonage"
    description: Vonageን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
    href: /docs/setup-vonage
  - title: "Setup: Plivo"
    description: Plivoን እንደስልክ አቅራቢ ለማዋቀር በደረጃ የሚሄድ መመሪያ።
    href: /docs/setup-plivo
  - title: "Setup: Asterisk (Self-Hosted)"
    description: ለከፍተኛ ግላዊነት እና ቁጥጥር Asteriskን ከARI bridge ጋር ያስተናግዱ።
    href: /docs/setup-asterisk
  - title: WebRTC Browser Calling
    description: በጎ ፈቃደኞች WebRTCን በመጠቀም በአሳሽ ውስጥ ጥሪዎችን ለመመለስ ያንቁ።
    href: /docs/webrtc-calling
  - title: Troubleshooting
    description: ለመተግበሪያ፣ ዴስክቶፕ፣ ሞባይል፣ ስልክ፣ እና crypto ከተለመዱ ችግሮች ጋር መፍትሄዎች።
    href: /docs/troubleshooting
  - title: Security Model
    description: ምን እንደተመሰጠረ፣ ምን እንዳልተመሰጠረ፣ እና የዛብነት ሞዴልን ይረዱ።
    href: /security
---

## የአርክቴክቸር አጠቃላይ እይታ

Llamenos በCloudflare Workers ላይ ወይም በራስዎ መሰረተ-ልማት ውስጥ በDocker Compose / Kubernetes በኩል ሊሄድ የሚችል ነጠላ ገጽ መተግበሪያ (SPA) ነው። ድምፅ ጥሪዎችን፣ SMS፣ WhatsApp እና Signal ይደግፋል — ሁሉም በአንድ ወደሚገናኝ በመተግበሪያ ውስጥ ወደ ፊት ለፊት ለሚሰሩ በጎ ፈቃደኞች ይላካል።

| ክፍል | Cloudflare | ራስ-አስተናጋጅ |
|---|---|---|
| Frontend | Vite + React + TanStack Router | ተመሳሳይ |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Blob Storage | R2 | RustFS (S3-compatible) |
| Voice | Twilio, SignalWire, Vonage, Plivo, ወይም Asterisk | ተመሳሳይ |
| Messaging | SMS, WhatsApp Business, Signal | ተመሳሳይ |
| Auth | WebSocket keypairs (BIP-340 Schnorr) + WebAuthn | ተመሳሳይ |
| Encryption | ECIES (secp256k1 + XChaCha20-Poly1305) | ተመሳሳይ |
| Transcription | Client-side Whisper (WASM) | Client-side Whisper (WASM) |
| i18n | i18next (13 ቋንቋዎች) | ተመሳሳይ |

## ሚናዎች

| ሚና | ሊያይ ይችላል | ሊሰራ ይችላል |
|---|---|---|
| **ጠሪ** | ምንም (ስልክ/SMS/WhatsApp/Signal) | Hotlineን ይደውሉ ወይም መልእክት ይላኩ |
| **በጎ ፈቃደኛ** | የራስ ማስታወሻዎች፣ የተመደቡ ውይይቶች | ጥሪዎችን ይመልሱ፣ ማስታወሻዎችን ይጻፉ፣ ለመልእክቶች ይመልሱ |
| **ሪፖርተር** | የራስ ሪፖርቶች ብቻ | የተማሰኑ ሪፖርቶችን ከፋይል አባሪዎች ጋር ያስገቡ |
| **አስተዳዳሪ** | ሁሉም ማስታወሻዎች፣ ሪፖርቶች፣ ውይይቶች፣ የኦዲት ምዝግቦች | በጎ ፈቃደኞችን፣ ፊት ለፊት ሰዓታትን፣ መገናኛዎችን፣ አገዶችን፣ ቅንጅቶችን ያስተዳድሩ |
