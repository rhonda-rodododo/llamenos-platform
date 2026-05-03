---
title: मोबाइल गाइड
description: iOS और Android पर Llamenos मोबाइल ऐप इंस्टॉल और सेटअप करें।
---

Llamenos मोबाइल ऐप स्वयंसेवकों को अपने फोन से कॉल का जवाब देने, संदेशों का जवाब देने और एन्क्रिप्टेड नोट्स लिखने देता है। यह React Native के साथ बनाया गया है और डेस्कटॉप ऐप के समान Rust क्रिप्टोग्राफ़िक कोर साझा करता है।

## मोबाइल ऐप क्या है?

मोबाइल ऐप डेस्कटॉप एप्लिकेशन का साथी है। यह उसी Llamenos backend (Cloudflare Workers या self-hosted) से connects होता है और उसी protocol का उपयोग करता है, इसलिए स्वयंसेवक डेस्कटॉप और मोबाइल के बीच seamlessly switch कर सकते हैं।

मोबाइल ऐप एक अलग repository (`llamenos-hotline`) में रहता है लेकिन यह साझा करता है:

- **llamenos-core** — iOS और Android के लिए UniFFI के माध्यम से compiled सभी क्रिप्टोग्राफ़िक ऑपरेशन के लिए उसी Rust crate का उपयोग
- **Protocol** — समान wire format, API endpoints, और encryption scheme
- **Backend** — उसी Cloudflare Worker या self-hosted server

## Download और Install करें

### Android

मोबाइल ऐप वर्तमान में sideloading के लिए APK के रूप में distribute किया जाता है:

1. [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-hotline/releases/latest) page से नवीनतम `.apk` file download करें
2. अपने Android device पर, **Settings > Security** पर जाएं और **Install from unknown sources** सक्षम करें (या prompt होने पर per-app सक्षम करें)
3. Downloaded APK खोलें और **Install** पर tap करें
4. इंस्टॉल होने के बाद, अपने app drawer से Llamenos खोलें

App Store और Play Store distribution भविष्य के release के लिए planned है।

### iOS

iOS builds TestFlight beta releases के रूप में उपलब्ध हैं:

1. App Store से [TestFlight](https://apps.apple.com/app/testflight/id899247664) इंस्टॉल करें
2. TestFlight invite link के लिए अपने admin से पूछें
3. Beta में join करने के लिए अपने iOS device पर link खोलें
4. TestFlight से Llamenos इंस्टॉल करें

App Store distribution भविष्य के release के लिए planned है।

## प्रारंभिक सेटअप

मोबाइल ऐप को एक existing desktop account से link करके सेट किया जाता है। यह सुनिश्चित करता है कि एक ही cryptographic identity सभी devices में उपयोग की जाती है बिना plaintext में secret key transmit किए।

### Device provisioning (QR scan)

1. Llamenos desktop ऐप खोलें और **Settings > Devices** पर जाएं
2. **Link New Device** click करें — यह एक one-time provisioning token वाला QR code generate करता है
3. Llamenos मोबाइल ऐप खोलें और **Link Device** tap करें
4. अपने फोन के camera से QR code scan करें
5. ऐप्स आपके encrypted key material को securely transfer करने के लिए ephemeral ECDH key exchange perform करते हैं
6. अपने local key storage protect करने के लिए मोबाइल ऐप पर PIN सेट करें
7. मोबाइल ऐप अब linked है और उपयोग के लिए तैयार है

Provisioning process आपका nsec plaintext में कभी transmit नहीं करती। Desktop ऐप ephemeral shared secret के साथ key material wrap करता है, और मोबाइल ऐप इसे locally unwrap करता है।

### Manual setup (nsec entry)

यदि आप QR code scan नहीं कर सकते, तो आप अपना nsec directly enter कर सकते हैं:

1. मोबाइल ऐप खोलें और **Enter nsec manually** tap करें
2. अपनी `nsec1...` key paste करें
3. Local storage protect करने के लिए PIN सेट करें
4. ऐप आपकी public key derive करता है और backend के साथ register करता है

इस method में आपके nsec को directly handle करना पड़ता है, इसलिए इसे केवल तभी उपयोग करें जब device linking संभव न हो। इसे type करने की बजाय nsec paste करने के लिए password manager उपयोग करें।

## Feature तुलना

| Feature | Desktop | Mobile |
|---|---|---|
| इनकमिंग कॉल का जवाब देना | हाँ | हाँ |
| एन्क्रिप्टेड नोट्स लिखना | हाँ | हाँ |
| Custom note fields | हाँ | हाँ |
| संदेशों का जवाब देना (SMS, WhatsApp, Signal) | हाँ | हाँ |
| Conversations देखना | हाँ | हाँ |
| Shift status और breaks | हाँ | हाँ |
| Client-side transcription | हाँ (WASM Whisper) | नहीं |
| Note search | हाँ | हाँ |
| Command palette | हाँ (Ctrl+K) | नहीं |
| Keyboard shortcuts | हाँ | नहीं |
| Admin settings | हाँ (पूर्ण) | हाँ (सीमित) |
| Volunteers प्रबंधित करना | हाँ | केवल देखना |
| Audit logs देखना | हाँ | हाँ |
| WebRTC browser calling | हाँ | नहीं (native phone उपयोग करता है) |
| Push notifications | OS notifications | Native push (FCM/APNS) |
| Auto-update | Tauri updater | App Store / TestFlight |
| File attachments (reports) | हाँ | हाँ |

## सीमाएं

- **कोई client-side transcription नहीं** — WASM Whisper model को महत्वपूर्ण memory और CPU resources की जरूरत है जो mobile पर अव्यावहारिक है। Call transcription केवल desktop पर उपलब्ध है।
- **कम crypto performance** — जबकि मोबाइल ऐप UniFFI के माध्यम से उसी Rust crypto core का उपयोग करता है, operations lower-end devices पर desktop native performance की तुलना में धीमी हो सकती हैं।
- **सीमित admin features** — कुछ admin operations (bulk volunteer management, detailed settings configuration) केवल desktop ऐप में उपलब्ध हैं। मोबाइल ऐप अधिकांश admin screens के लिए read-only views प्रदान करता है।
- **कोई WebRTC calling नहीं** — मोबाइल स्वयंसेवक ब्राउज़र के माध्यम से नहीं बल्कि telephony provider के माध्यम से अपने phone number पर कॉल receive करते हैं। WebRTC in-app calling केवल desktop के लिए है।
- **Battery और connectivity** — Real-time updates receive करने के लिए ऐप को persistent connection चाहिए। Background mode OS power management द्वारा सीमित हो सकता है। विश्वसनीय notifications के लिए shifts के दौरान ऐप को foreground में रखें।

## मोबाइल समस्याओं का निवारण

### "Invalid QR code" के साथ Provisioning fail

- सुनिश्चित करें कि QR code हाल ही में generate किया गया था (provisioning tokens 5 मिनट बाद expire हो जाते हैं)
- Desktop ऐप से नया QR code generate करें और फिर try करें
- सुनिश्चित करें कि दोनों devices internet से connected हैं

### Push notifications नहीं मिल रहे

- जाँचें कि आपके device settings में Llamenos के लिए notifications सक्षम हैं
- Android पर: **Settings > Apps > Llamenos > Notifications** पर जाएं और सभी channels सक्षम करें
- iOS पर: **Settings > Notifications > Llamenos** पर जाएं और **Allow Notifications** सक्षम करें
- सुनिश्चित करें कि आप Do Not Disturb mode में नहीं हैं
- सत्यापित करें कि आपकी shift active है और आप break पर नहीं हैं

### ऐप launch पर crash होता है

- सुनिश्चित करें कि आप ऐप का नवीनतम version चला रहे हैं
- App cache clear करें: **Settings > Apps > Llamenos > Storage > Clear Cache**
- यदि समस्या बनी रहती है, uninstall और reinstall करें (आपको device re-link करना होगा)

### Reinstall के बाद पुराने notes decrypt नहीं हो सकते

- ऐप को reinstall करने से local key material हट जाता है
- Access restore करने के लिए अपने desktop ऐप से QR code के माध्यम से device re-link करें
- Reinstall से पहले encrypted notes उसी identity के साथ device re-link होने के बाद accessible होंगे

### पुराने devices पर धीमी performance

- Memory free करने के लिए अन्य apps बंद करें
- उपलब्ध होने पर app settings में animations disable करें
- Bulk note review जैसे heavy operations के लिए desktop ऐप उपयोग करने पर विचार करें
