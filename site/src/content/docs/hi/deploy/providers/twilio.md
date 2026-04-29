---
title: "सेटअप: Twilio"
description: Twilio को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
---

Twilio, Llamenos के लिए डिफ़ॉल्ट टेलीफ़ोनी प्रदाता है और शुरू करने में सबसे आसान है। यह गाइड अकाउंट बनाने, फ़ोन नंबर सेटअप, और webhook कॉन्फ़िगरेशन के बारे में बताती है।

## पूर्वापेक्षाएँ

- एक [Twilio अकाउंट](https://www.twilio.com/try-twilio) (फ्री ट्रायल टेस्टिंग के लिए काम करता है)
- आपका Llamenos इंस्टेंस तैनात और पब्लिक URL से एक्सेसिबल

## 1. Twilio अकाउंट बनाएँ

[twilio.com/try-twilio](https://www.twilio.com/try-twilio) पर साइन अप करें। अपना ईमेल और फ़ोन नंबर वेरिफ़ाई करें। Twilio टेस्टिंग के लिए ट्रायल क्रेडिट प्रदान करता है।

## 2. फ़ोन नंबर खरीदें

1. Twilio Console में **Phone Numbers** > **Manage** > **Buy a number** पर जाएँ
2. अपने वांछित एरिया कोड में **Voice** क्षमता वाला नंबर खोजें
3. **Buy** पर क्लिक करें और कन्फ़र्म करें

यह नंबर सेव करें -- आप इसे Llamenos एडमिन सेटिंग्स में दर्ज करेंगे।

## 3. अपना Account SID और Auth Token प्राप्त करें

1. [Twilio Console डैशबोर्ड](https://console.twilio.com) पर जाएँ
2. मुख्य पेज पर अपना **Account SID** और **Auth Token** खोजें
3. Auth Token प्रकट करने के लिए आँख के आइकन पर क्लिक करें

## 4. Webhooks कॉन्फ़िगर करें

Twilio Console में, अपने फ़ोन नंबर के कॉन्फ़िगरेशन पर जाएँ:

1. **Phone Numbers** > **Manage** > **Active Numbers** पर जाएँ
2. अपने हॉटलाइन नंबर पर क्लिक करें
3. **Voice Configuration** के तहत, सेट करें:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

`your-worker-url.com` को अपने वास्तविक Cloudflare Worker URL से बदलें।

## 5. Llamenos में कॉन्फ़िगर करें

1. एडमिन के रूप में लॉग इन करें
2. **सेटिंग्स** > **टेलीफ़ोनी प्रदाता** पर जाएँ
3. प्रदाता ड्रॉपडाउन से **Twilio** चुनें
4. दर्ज करें:
   - **Account SID**: चरण 3 से
   - **Auth Token**: चरण 3 से
   - **Phone Number**: आपने जो नंबर खरीदा (E.164 फ़ॉर्मेट, जैसे, `+15551234567`)
5. **सेव** पर क्लिक करें

## 6. सेटअप टेस्ट करें

किसी फ़ोन से अपने हॉटलाइन नंबर पर कॉल करें। आपको भाषा चयन मेनू सुनाई देना चाहिए। यदि आपके पास शिफ्ट पर वॉलंटियर हैं, तो कॉल उन तक पहुँचेगी।

## WebRTC सेटअप (वैकल्पिक)

वॉलंटियर्स को अपने फ़ोन के बजाय ब्राउज़र में कॉल का उत्तर देने में सक्षम करने के लिए:

### API Key बनाएँ

1. Twilio Console में **Account** > **API keys & tokens** पर जाएँ
2. **Create API Key** पर क्लिक करें
3. **Standard** की टाइप चुनें
4. **SID** और **Secret** सेव करें -- सीक्रेट केवल एक बार दिखाया जाता है

### TwiML App बनाएँ

1. **Voice** > **Manage** > **TwiML Apps** पर जाएँ
2. **Create new TwiML App** पर क्लिक करें
3. **Voice Request URL** को `https://your-worker-url.com/telephony/webrtc-incoming` पर सेट करें
4. सेव करें और **App SID** नोट करें

### Llamenos में सक्षम करें

1. **सेटिंग्स** > **टेलीफ़ोनी प्रदाता** पर जाएँ
2. **WebRTC कॉलिंग** टॉगल ऑन करें
3. दर्ज करें:
   - **API Key SID**: आपने जो API की बनाई उससे
   - **API Key Secret**: आपने जो API की बनाई उससे
   - **TwiML App SID**: आपने जो TwiML App बनाई उससे
4. **सेव** पर क्लिक करें

वॉलंटियर सेटअप और समस्या निवारण के लिए [WebRTC ब्राउज़र कॉलिंग](/docs/deploy/providers/webrtc) देखें।

## समस्या निवारण

- **कॉल नहीं आ रही**: वेरिफ़ाई करें कि webhook URL सही है और आपका Worker तैनात है। Twilio Console एरर लॉग्स जाँचें।
- **"Invalid webhook" एरर**: सुनिश्चित करें कि webhook URL HTTPS का उपयोग करता है और वैलिड TwiML लौटाता है।
- **ट्रायल अकाउंट सीमाएँ**: ट्रायल अकाउंट केवल वेरिफ़ाइड नंबरों पर कॉल कर सकते हैं। प्रोडक्शन उपयोग के लिए पेड अकाउंट में अपग्रेड करें।
- **Webhook वैलिडेशन विफलता**: सुनिश्चित करें कि Llamenos में Auth Token, Twilio Console में मौजूद Token से मेल खाता है।
