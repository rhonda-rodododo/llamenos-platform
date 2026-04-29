---
title: "सेटअप: SignalWire"
description: SignalWire को अपने टेलीफ़ोनी प्रदाता के रूप में कॉन्फ़िगर करने की चरण-दर-चरण गाइड।
---

SignalWire एक संगत API के साथ Twilio का लागत-प्रभावी विकल्प है। यह LaML (TwiML-संगत मार्कअप भाषा) का उपयोग करता है, इसलिए Twilio और SignalWire के बीच माइग्रेशन सीधा है।

## पूर्वापेक्षाएँ

- एक [SignalWire अकाउंट](https://signalwire.com/signup) (फ्री ट्रायल उपलब्ध)
- आपका Llamenos इंस्टेंस तैनात और पब्लिक URL से एक्सेसिबल

## 1. SignalWire अकाउंट बनाएँ

[signalwire.com/signup](https://signalwire.com/signup) पर साइन अप करें। साइनअप के दौरान, आप एक **Space** नाम चुनेंगे (जैसे, `myhotline`)। आपका Space URL `myhotline.signalwire.com` होगा। यह नाम नोट करें -- आपको कॉन्फ़िगरेशन में इसकी आवश्यकता होगी।

## 2. फ़ोन नंबर खरीदें

1. अपने SignalWire डैशबोर्ड में, **Phone Numbers** पर जाएँ
2. **Buy a Phone Number** पर क्लिक करें
3. वॉइस क्षमता वाला नंबर खोजें
4. नंबर खरीदें

## 3. अपने क्रेडेंशियल्स प्राप्त करें

1. SignalWire डैशबोर्ड में **API** पर जाएँ
2. अपना **Project ID** खोजें (यह Account SID के रूप में कार्य करता है)
3. यदि आपके पास नहीं है तो एक नया **API Token** बनाएँ -- यह Auth Token के रूप में कार्य करता है

## 4. Webhooks कॉन्फ़िगर करें

1. डैशबोर्ड में **Phone Numbers** पर जाएँ
2. अपने हॉटलाइन नंबर पर क्लिक करें
3. **Voice Settings** के तहत, सेट करें:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. Llamenos में कॉन्फ़िगर करें

1. एडमिन के रूप में लॉग इन करें
2. **सेटिंग्स** > **टेलीफ़ोनी प्रदाता** पर जाएँ
3. प्रदाता ड्रॉपडाउन से **SignalWire** चुनें
4. दर्ज करें:
   - **Account SID**: चरण 3 से आपका Project ID
   - **Auth Token**: चरण 3 से आपका API Token
   - **SignalWire Space**: आपका Space नाम (सिर्फ़ नाम, पूरा URL नहीं -- जैसे, `myhotline`)
   - **Phone Number**: आपने जो नंबर खरीदा (E.164 फ़ॉर्मेट)
5. **सेव** पर क्लिक करें

## 6. सेटअप टेस्ट करें

अपने हॉटलाइन नंबर पर कॉल करें। आपको भाषा चयन मेनू और उसके बाद कॉल फ़्लो सुनाई देना चाहिए।

## WebRTC सेटअप (वैकल्पिक)

SignalWire WebRTC, Twilio के समान API की पैटर्न का उपयोग करता है:

1. अपने SignalWire डैशबोर्ड में, **API** > **Tokens** के तहत एक **API Key** बनाएँ
2. एक **LaML Application** बनाएँ:
   - **LaML** > **LaML Applications** पर जाएँ
   - Voice URL को `https://your-worker-url.com/telephony/webrtc-incoming` पर सेट करें
   - Application SID नोट करें
3. Llamenos में, **सेटिंग्स** > **टेलीफ़ोनी प्रदाता** पर जाएँ
4. **WebRTC कॉलिंग** टॉगल ऑन करें
5. API Key SID, API Key Secret, और Application SID दर्ज करें
6. **सेव** पर क्लिक करें

## Twilio से अंतर

- **LaML बनाम TwiML**: SignalWire, LaML का उपयोग करता है, जो कार्यात्मक रूप से TwiML के समान है। Llamenos इसे स्वचालित रूप से संभालता है।
- **Space URL**: API कॉल `api.twilio.com` के बजाय `{space}.signalwire.com` पर जाती हैं। एडाप्टर इसे आपके द्वारा प्रदान किए गए Space नाम के माध्यम से संभालता है।
- **मूल्य निर्धारण**: SignalWire आमतौर पर वॉइस कॉल के लिए Twilio से 30-40% सस्ता है।
- **फ़ीचर पैरिटी**: सभी Llamenos फ़ीचर (रिकॉर्डिंग, ट्रांसक्रिप्शन, CAPTCHA, वॉइसमेल) SignalWire के साथ समान रूप से काम करते हैं।

## समस्या निवारण

- **"Space not found" एरर**: Space नाम दोबारा जाँचें (सिर्फ़ सबडोमेन, पूरा URL नहीं)।
- **Webhook विफलता**: सुनिश्चित करें कि आपका Worker URL सार्वजनिक रूप से एक्सेसिबल है और HTTPS का उपयोग करता है।
- **API टोकन समस्याएँ**: SignalWire टोकन की समय सीमा समाप्त हो सकती है। यदि आपको प्रमाणीकरण त्रुटियाँ मिलती हैं तो एक नया टोकन बनाएँ।
