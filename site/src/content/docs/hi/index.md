---
title: दस्तावेज़ीकरण
description: Llamenos को तैनात, कॉन्फ़िगर और उपयोग करना सीखें।
guidesHeading: गाइड
guides:
  - title: शुरू करना
    description: पूर्वापेक्षाएँ, इंस्टॉलेशन, टेलीफ़ोनी सेटअप, और आपकी पहली तैनाती।
    href: /docs/getting-started
  - title: एडमिन गाइड
    description: वॉलंटियर, शिफ्ट, बैन सूची, कस्टम फ़ील्ड, और सेटिंग्स प्रबंधित करें।
    href: /docs/admin-guide
  - title: वॉलंटियर गाइड
    description: लॉग इन करें, कॉल प्राप्त करें, नोट्स लिखें, और ट्रांसक्रिप्शन का उपयोग करें।
    href: /docs/volunteer-guide
  - title: टेलीफ़ोनी प्रदाता
    description: समर्थित टेलीफ़ोनी प्रदाताओं की तुलना करें और अपनी हॉटलाइन के लिए सबसे उपयुक्त चुनें।
    href: /docs/telephony-providers
  - title: "सेटअप: Twilio"
    description: Twilio को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
    href: /docs/setup-twilio
  - title: "सेटअप: SignalWire"
    description: SignalWire को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
    href: /docs/setup-signalwire
  - title: "सेटअप: Vonage"
    description: Vonage को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
    href: /docs/setup-vonage
  - title: "सेटअप: Plivo"
    description: Plivo को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
    href: /docs/setup-plivo
  - title: "सेटअप: Asterisk (सेल्फ़-होस्टेड)"
    description: अधिकतम गोपनीयता और नियंत्रण के लिए ARI ब्रिज के साथ Asterisk तैनात करें।
    href: /docs/setup-asterisk
  - title: WebRTC ब्राउज़र कॉलिंग
    description: WebRTC का उपयोग करके वॉलंटियर्स के लिए ब्राउज़र में कॉल उत्तर देना सक्षम करें।
    href: /docs/webrtc-calling
  - title: सुरक्षा मॉडल
    description: समझें कि क्या एन्क्रिप्ट किया गया है, क्या नहीं, और थ्रेट मॉडल क्या है।
    href: /security
---

## आर्किटेक्चर अवलोकन

Llamenos एक सिंगल-पेज एप्लिकेशन (SPA) है जो Cloudflare Workers और Durable Objects द्वारा समर्थित है। प्रबंधित करने के लिए कोई पारंपरिक सर्वर नहीं है।

| घटक | तकनीक |
|---|---|
| फ्रंटएंड | Vite + React + TanStack Router |
| बैकएंड | Cloudflare Workers + Durable Objects |
| टेलीफ़ोनी | Twilio, SignalWire, Vonage, Plivo, या Asterisk (TelephonyAdapter इंटरफ़ेस के माध्यम से) |
| प्रमाणीकरण | Nostr कीपेयर (BIP-340 Schnorr) + WebAuthn |
| एन्क्रिप्शन | ECIES (secp256k1 + XChaCha20-Poly1305) |
| ट्रांसक्रिप्शन | क्लाइंट-साइड Whisper (WASM) |
| बहुभाषा समर्थन | i18next (12+ भाषाएँ) |

## भूमिकाएँ

| भूमिका | क्या देख सकता है | क्या कर सकता है |
|---|---|---|
| **कॉलर** | कुछ नहीं (GSM फ़ोन) | हॉटलाइन नंबर पर कॉल करना |
| **वॉलंटियर** | केवल अपने नोट्स | कॉल का उत्तर देना, शिफ्ट के दौरान नोट्स लिखना |
| **एडमिन** | सभी नोट्स, ऑडिट लॉग, कॉल डेटा | वॉलंटियर, शिफ्ट, बैन, सेटिंग्स प्रबंधित करना |
