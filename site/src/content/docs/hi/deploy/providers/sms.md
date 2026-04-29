---
title: "Setup: SMS"
description: अपने telephony provider के माध्यम से inbound और outbound SMS messaging सक्षम करें।
---

Llamenos में SMS messaging आपके existing voice telephony provider credentials का पुनः उपयोग करती है। कोई अलग SMS service की जरूरत नहीं है — यदि आपने पहले से voice के लिए Twilio, SignalWire, Vonage, या Plivo configure किया है, तो SMS उसी account के साथ काम करता है।

## समर्थित providers

| Provider | SMS Support | Notes |
|----------|------------|-------|
| **Twilio** | हाँ | Twilio Messaging API के माध्यम से पूर्ण two-way SMS |
| **SignalWire** | हाँ | Twilio API के साथ compatible — समान interface |
| **Vonage** | हाँ | Vonage REST API के माध्यम से SMS |
| **Plivo** | हाँ | Plivo Message API के माध्यम से SMS |
| **Asterisk** | नहीं | Asterisk native SMS support नहीं करता |

## 1. Admin settings में SMS सक्षम करें

**Admin Settings > Messaging Channels** पर navigate करें (या पहले login पर setup wizard उपयोग करें) और **SMS** toggle करें।

SMS settings configure करें:
- **Auto-response message** — first-time contacts को भेजा गया वैकल्पिक welcome message
- **After-hours response** — shift hours के बाहर भेजा गया वैकल्पिक message

## 2. Webhook configure करें

अपने telephony provider के SMS webhook को आपके Worker पर point करें:

```
POST https://your-worker.your-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. अपने Twilio Console > Phone Numbers > Active Numbers पर जाएं
2. अपना phone number select करें
3. **Messaging** के अंतर्गत, "A message comes in" के लिए webhook URL को ऊपर दिए URL पर set करें
4. HTTP method को **POST** पर set करें

### Vonage

1. Vonage API Dashboard > Applications पर जाएं
2. अपना application select करें
3. **Messages** के अंतर्गत, Inbound URL को ऊपर दिए webhook URL पर set करें

### Plivo

1. Plivo Console > Messaging > Applications पर जाएं
2. एक messaging application बनाएं या edit करें
3. Message URL को ऊपर दिए webhook URL पर set करें
4. Application को अपने phone number पर assign करें

## 3. Test करें

अपने hotline phone number पर एक SMS भेजें। आपको admin panel में **Conversations** tab में conversation दिखनी चाहिए।

## यह कैसे काम करता है

1. एक SMS आपके provider पर आता है, जो आपके Worker को webhook भेजता है
2. Worker webhook signature validate करता है (provider-specific HMAC)
3. Message parse होता है और ConversationDO में store होता है
4. On-shift volunteers को Nostr relay events के माध्यम से notify किया जाता है
5. Volunteers Conversations tab से reply करते हैं — responses आपके provider के SMS API के माध्यम से वापस भेजे जाते हैं

## सुरक्षा नोट्स

- SMS messages carrier network के माध्यम से plaintext में travel करते हैं — आपका provider और carriers उन्हें पढ़ सकते हैं
- Inbound messages arrival के बाद ConversationDO में store होते हैं
- Sender phone numbers storage से पहले hash होते हैं (privacy)
- Webhook signatures per-provider validate होते हैं (Twilio के लिए HMAC-SHA1, आदि)
