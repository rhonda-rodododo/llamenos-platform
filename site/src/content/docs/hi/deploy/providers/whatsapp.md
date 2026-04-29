---
title: "Setup: WhatsApp"
description: एन्क्रिप्टेड messaging के लिए Meta Cloud API के माध्यम से WhatsApp Business connect करें।
---

Llamenos Meta Cloud API (Graph API v21.0) के माध्यम से WhatsApp Business messaging का समर्थन करता है। WhatsApp text, images, documents, audio, और interactive messages के समर्थन के साथ rich messaging सक्षम करता है।

## पूर्वापेक्षाएं

- एक [Meta Business account](https://business.facebook.com)
- एक WhatsApp Business API phone number
- WhatsApp product enabled के साथ एक Meta developer app

## Integration modes

Llamenos दो WhatsApp integration modes का समर्थन करता है:

### Meta Direct (अनुशंसित)

Meta Cloud API से directly connect करें। पूर्ण नियंत्रण और सभी features प्रदान करता है।

**आवश्यक credentials:**
- **Phone Number ID** — आपका WhatsApp Business phone number ID
- **Business Account ID** — आपका Meta Business Account ID
- **Access Token** — एक long-lived Meta API access token
- **Verify Token** — webhook verification के लिए आपके द्वारा choose की गई custom string
- **App Secret** — आपका Meta app secret (webhook signature validation के लिए)

### Twilio mode

यदि आप पहले से voice के लिए Twilio उपयोग करते हैं, तो आप WhatsApp को अपने Twilio account के माध्यम से route कर सकते हैं। सरल setup, लेकिन कुछ features सीमित हो सकते हैं।

**आवश्यक credentials:**
- आपका existing Twilio Account SID, Auth Token, और एक Twilio-connected WhatsApp sender

## 1. Meta app बनाएं

1. [developers.facebook.com](https://developers.facebook.com) पर जाएं
2. एक नया app बनाएं (type: Business)
3. **WhatsApp** product जोड़ें
4. WhatsApp > Getting Started में, अपना **Phone Number ID** और **Business Account ID** note करें
5. एक permanent access token generate करें (Settings > Access Tokens)

## 2. Webhook configure करें

Meta developer dashboard में:

1. WhatsApp > Configuration > Webhook पर जाएं
2. Callback URL set करें:
   ```
   https://your-worker.your-domain.com/api/messaging/whatsapp/webhook
   ```
3. Verify Token को उसी string पर set करें जो आप Llamenos admin settings में enter करेंगे
4. `messages` webhook field subscribe करें

Meta webhook verify करने के लिए एक GET request भेजेगा। यदि verify token match करता है तो आपका Worker challenge के साथ respond करेगा।

## 3. Admin settings में WhatsApp सक्षम करें

**Admin Settings > Messaging Channels** पर navigate करें (या setup wizard उपयोग करें) और **WhatsApp** toggle करें।

**Meta Direct** या **Twilio** mode select करें और आवश्यक credentials enter करें।

वैकल्पिक settings configure करें:
- **Auto-response message** — first-time contacts को भेजा जाता है
- **After-hours response** — shift hours के बाहर भेजा जाता है

## 4. Test करें

अपने Business phone number पर एक WhatsApp message भेजें। Conversation **Conversations** tab में दिखनी चाहिए।

## 24-hour messaging window

WhatsApp एक 24-hour messaging window enforce करता है:
- आप user के last message के 24 घंटे के भीतर reply कर सकते हैं
- 24 घंटे के बाद, conversation फिर से शुरू करने के लिए आपको एक approved **template message** उपयोग करना होगा
- Llamenos इसे automatically handle करता है — यदि window expire हो गई है, तो conversation restart करने के लिए template message भेजता है

## Media support

WhatsApp rich media messages का समर्थन करता है:
- **Images** (JPEG, PNG)
- **Documents** (PDF, Word, आदि)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Location** sharing
- **Interactive** buttons और list messages

Media attachments conversation view में inline दिखते हैं।

## सुरक्षा नोट्स

- WhatsApp user और Meta के infrastructure के बीच end-to-end encryption उपयोग करता है
- Meta तकनीकी रूप से उनके servers पर message content access कर सकता है
- Messages webhook से receipt के बाद Llamenos में store होते हैं
- Webhook signatures आपके app secret के साथ HMAC-SHA256 उपयोग करके validate होते हैं
- Maximum privacy के लिए, WhatsApp के बजाय Signal उपयोग करने पर विचार करें
