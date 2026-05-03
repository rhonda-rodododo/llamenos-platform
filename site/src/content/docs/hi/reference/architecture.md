---
title: आर्किटेक्चर
description: सिस्टम आर्किटेक्चर का अवलोकन — रिपॉजिटरी, डेटा प्रवाह, एन्क्रिप्शन परतें, और रियल-टाइम संचार।
---

यह पृष्ठ बताता है कि Llamenos कैसे संरचित है, सिस्टम में डेटा कैसे प्रवाहित होता है, और एन्क्रिप्शन कहाँ लागू होता है।

## रिपॉजिटरी संरचना

Llamenos तीन रिपॉजिटरी में विभाजित है जो एक सामान्य प्रोटोकॉल और क्रिप्टोग्राफ़िक कोर साझा करते हैं:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — डेस्कटॉप एप्लिकेशन (Tauri v2 के साथ Vite + React webview), Cloudflare Worker बैकएंड, और स्व-होस्टेड Node.js बैकएंड। यह मुख्य रिपॉजिटरी है।
- **llamenos-core** — एक साझा Rust crate जो सभी क्रिप्टोग्राफ़िक ऑपरेशन लागू करता है: ECIES एन्वेलप एन्क्रिप्शन, Schnorr सिग्नेचर, PBKDF2 की डेरिवेशन, HKDF, और XChaCha20-Poly1305। नेटिव कोड (Tauri के लिए), WASM (ब्राउज़र के लिए), और UniFFI बाइंडिंग (मोबाइल के लिए) में संकलित।
- **llamenos-platform** — iOS और Android के लिए React Native मोबाइल एप्लिकेशन। उसी Rust क्रिप्टो कोड को कॉल करने के लिए UniFFI बाइंडिंग का उपयोग करता है।

तीनों प्लेटफ़ॉर्म `docs/protocol/PROTOCOL.md` में परिभाषित समान वायर प्रोटोकॉल लागू करते हैं।

## डेटा प्रवाह

### इनकमिंग कॉल

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### इनकमिंग संदेश (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           Nostr relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

बैकएंड छह Cloudflare Durable Objects (या स्व-होस्टेड deployments के लिए उनके PostgreSQL समकक्ष) का उपयोग करता है:

| Durable Object | जिम्मेदारी |
|---|---|
| **IdentityDO** | स्वयंसेवक पहचान, सार्वजनिक कुंजियां, प्रदर्शन नाम, और WebAuthn क्रेडेंशियल प्रबंधित करता है। इनवाइट निर्माण और रिडेम्पशन संभालता है। |
| **SettingsDO** | हॉटलाइन कॉन्फ़िगरेशन स्टोर करता है: नाम, सक्षम चैनल, प्रदाता क्रेडेंशियल, कस्टम नोट फ़ील्ड, स्पैम शमन सेटिंग, फ़ीचर फ़्लैग। |
| **RecordsDO** | एन्क्रिप्टेड कॉल नोट्स, एन्क्रिप्टेड रिपोर्ट, और फ़ाइल अटैचमेंट मेटाडेटा स्टोर करता है। नोट खोज संभालता है (एन्क्रिप्टेड मेटाडेटा पर)। |
| **ShiftManagerDO** | आवर्ती शिफ्ट शेड्यूल, रिंग ग्रुप, स्वयंसेवक शिफ्ट असाइनमेंट प्रबंधित करता है। किसी भी समय ड्यूटी पर कौन है यह निर्धारित करता है। |
| **CallRouterDO** | रियल-टाइम कॉल रूटिंग को ऑर्केस्ट्रेट करता है: समानांतर रिंगिंग, पहले उठाने पर समाप्ति, ब्रेक स्टेटस, सक्रिय कॉल ट्रैकिंग। TwiML/प्रदाता प्रतिक्रियाएं उत्पन्न करता है। |
| **ConversationDO** | SMS, WhatsApp, और Signal पर थ्रेडेड मैसेजिंग वार्तालाप प्रबंधित करता है। इनजेस्ट पर मैसेज एन्क्रिप्शन, वार्तालाप असाइनमेंट, और आउटबाउंड उत्तर संभालता है। |

सभी DOs को `idFromName()` के माध्यम से सिंगलटन के रूप में एक्सेस किया जाता है और हल्के `DORouter` (method + path पैटर्न मिलान) का उपयोग करके आंतरिक रूप से रूट किया जाता है।

## एन्क्रिप्शन मैट्रिक्स

| डेटा | एन्क्रिप्टेड? | एल्गोरिदम | कौन डिक्रिप्ट कर सकता है |
|---|---|---|---|
| कॉल नोट्स | हाँ (E2EE) | XChaCha20-Poly1305 + ECIES एनवेलप | नोट लेखक + सभी एडमिन |
| नोट कस्टम फ़ील्ड | हाँ (E2EE) | नोट्स जैसा | नोट लेखक + सभी एडमिन |
| रिपोर्ट | हाँ (E2EE) | नोट्स जैसा | रिपोर्ट लेखक + सभी एडमिन |
| रिपोर्ट अटैचमेंट | हाँ (E2EE) | XChaCha20-Poly1305 (स्ट्रीम्ड) | रिपोर्ट लेखक + सभी एडमिन |
| मैसेज कंटेंट | हाँ (E2EE) | XChaCha20-Poly1305 + ECIES एनवेलप | असाइन किया गया स्वयंसेवक + सभी एडमिन |
| ट्रांसक्रिप्ट | हाँ (at-rest) | XChaCha20-Poly1305 | ट्रांसक्रिप्ट निर्माता + सभी एडमिन |
| Hub events (Nostr) | हाँ (सिमेट्रिक) | hub key के साथ XChaCha20-Poly1305 | सभी मौजूदा hub सदस्य |
| स्वयंसेवक nsec | हाँ (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | केवल स्वयंसेवक |
| ऑडिट लॉग प्रविष्टियां | नहीं (integrity-protected) | SHA-256 हैश चेन | एडमिन (पढ़ना), सिस्टम (लिखना) |
| कॉलर फोन नंबर | नहीं (केवल सर्वर-साइड) | N/A | सर्वर + एडमिन |
| स्वयंसेवक फोन नंबर | IdentityDO में स्टोर | N/A | केवल एडमिन |

### प्रति-नोट फॉरवर्ड सीक्रेसी

प्रत्येक नोट या मैसेज को एक अद्वितीय यादृच्छिक सिमेट्रिक key मिलती है। वह key प्रत्येक अधिकृत पाठक के लिए ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) के माध्यम से अलग-अलग रैप की जाती है। एक नोट की key से समझौता करने से अन्य नोट्स के बारे में कुछ भी नहीं पता चलता। कंटेंट एन्क्रिप्शन के लिए कोई long-lived सिमेट्रिक key नहीं है।

### Key पदानुक्रम

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs Nostr events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time Nostr hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## रियल-टाइम संचार

रियल-टाइम अपडेट (नई कॉल, संदेश, शिफ्ट परिवर्तन, उपस्थिति) एक Nostr relay के माध्यम से प्रवाहित होते हैं:

- **स्व-होस्टेड**: Docker/Kubernetes में ऐप के साथ चलने वाला strfry relay
- **Cloudflare**: Nosflare (Cloudflare Workers-आधारित relay)

सभी events ephemeral (kind 20001) हैं और hub key से एन्क्रिप्ट किए गए हैं। Events generic tags (`["t", "llamenos:event"]`) का उपयोग करते हैं ताकि relay event प्रकारों को अलग न कर सके। कंटेंट फ़ील्ड में XChaCha20-Poly1305 ciphertext है।

### Event प्रवाह

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Relay एन्क्रिप्टेड blobs और वैध सिग्नेचर देखता है लेकिन event कंटेंट नहीं पढ़ सकता या यह निर्धारित नहीं कर सकता कि कौन से एक्शन किए जा रहे हैं।

## सुरक्षा परतें

### ट्रांसपोर्ट परत

- HTTPS (TLS 1.3) पर सभी client-server संचार
- WSS पर Nostr relay से WebSocket कनेक्शन
- Content Security Policy (CSP) स्क्रिप्ट स्रोत, कनेक्शन और frame ancestors को प्रतिबंधित करता है
- Tauri isolation pattern IPC को webview से अलग करता है

### एप्लिकेशन परत

- Nostr keypairs के माध्यम से प्रमाणीकरण (BIP-340 Schnorr signatures)
- मल्टी-डिवाइस सुविधा के लिए WebAuthn session tokens
- Role-based access control (caller, volunteer, reporter, admin)
- `crypto-labels.ts` में परिभाषित सभी 25 क्रिप्टोग्राफ़िक domain separation constants cross-protocol attacks को रोकते हैं

### at-rest एन्क्रिप्शन

- स्टोरेज से पहले कॉल नोट्स, रिपोर्ट, संदेश और ट्रांसक्रिप्ट एन्क्रिप्ट किए जाते हैं
- स्वयंसेवक secret keys PIN-derived keys (PBKDF2) से एन्क्रिप्ट की जाती हैं
- Tauri Stronghold डेस्कटॉप पर एन्क्रिप्टेड vault storage प्रदान करता है
- Audit log integrity SHA-256 हैश चेन द्वारा संरक्षित

### बिल्ड वेरिफिकेशन

- `SOURCE_DATE_EPOCH` के साथ `Dockerfile.build` के माध्यम से reproducible builds
- Frontend assets के लिए content-hashed filenames
- GitHub Releases के साथ `CHECKSUMS.txt` प्रकाशित
- SLSA provenance attestations
- वेरिफिकेशन स्क्रिप्ट: `scripts/verify-build.sh`

## प्लेटफ़ॉर्म अंतर

| फ़ीचर | डेस्कटॉप (Tauri) | मोबाइल (React Native) | ब्राउज़र (Cloudflare) |
|---|---|---|---|
| Crypto backend | नेटिव Rust (IPC के माध्यम से) | नेटिव Rust (UniFFI के माध्यम से) | WASM (llamenos-core) |
| Key storage | Tauri Stronghold (एन्क्रिप्टेड) | Secure Enclave / Keystore | Browser localStorage (PIN-encrypted) |
| Transcription | Client-side Whisper (WASM) | उपलब्ध नहीं | Client-side Whisper (WASM) |
| Auto-update | Tauri updater | App Store / Play Store | स्वचालित (CF Workers) |
| Push notifications | OS-native (Tauri notification) | OS-native (FCM/APNS) | Browser notifications |
| Offline support | सीमित (API की जरूरत) | सीमित (API की जरूरत) | सीमित (API की जरूरत) |
