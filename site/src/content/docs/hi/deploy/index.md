---
title: शुरू करना
description: एक घंटे से भी कम समय में अपनी Llamenos हॉटलाइन तैनात करें।
---

एक घंटे से भी कम समय में अपनी Llamenos हॉटलाइन तैनात करें। आपको एक Cloudflare अकाउंट, एक टेलीफ़ोनी प्रदाता अकाउंट, और Bun इंस्टॉल की गई मशीन की आवश्यकता होगी।

## पूर्वापेक्षाएँ

- [Bun](https://bun.sh) v1.0 या बाद का संस्करण (रनटाइम और पैकेज मैनेजर)
- एक [Cloudflare](https://www.cloudflare.com) अकाउंट (फ्री टियर विकास के लिए पर्याप्त है)
- एक टेलीफ़ोनी प्रदाता अकाउंट — [Twilio](https://www.twilio.com) शुरू करने के लिए सबसे आसान है, लेकिन Llamenos [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), और [सेल्फ़-होस्टेड Asterisk](/docs/deploy/providers/asterisk) का भी समर्थन करता है। चुनने में सहायता के लिए [टेलीफ़ोनी प्रदाता](/docs/deploy/providers) तुलना देखें।
- Git

## 1. क्लोन और इंस्टॉल करें

```bash
git clone https://github.com/rhonda-rodododo/llamenos.git
cd llamenos
bun install
```

## 2. एडमिन कीपेयर बूटस्ट्रैप करें

एडमिन अकाउंट के लिए एक Nostr कीपेयर जनरेट करें। यह एक सीक्रेट की (nsec) और पब्लिक की (npub/hex) उत्पन्न करता है।

```bash
bun run bootstrap-admin
```

`nsec` को सुरक्षित रूप से सहेजें — यह आपका एडमिन लॉगिन क्रेडेंशियल है। अगले चरण के लिए आपको hex पब्लिक की की आवश्यकता होगी।

## 3. सीक्रेट्स कॉन्फ़िगर करें

स्थानीय विकास के लिए प्रोजेक्ट रूट में `.dev.vars` फ़ाइल बनाएँ। यह उदाहरण Twilio का उपयोग करता है — यदि आप किसी अन्य प्रदाता का उपयोग कर रहे हैं, तो आप Twilio वेरिएबल्स को छोड़ सकते हैं और पहले लॉगिन के बाद एडमिन UI से अपने प्रदाता को कॉन्फ़िगर कर सकते हैं।

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

प्रोडक्शन के लिए, इन्हें Wrangler सीक्रेट्स के रूप में सेट करें:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# यदि Twilio को डिफ़ॉल्ट प्रदाता के रूप में env vars से उपयोग कर रहे हैं:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **नोट**: आप एनवायरनमेंट वेरिएबल्स के बजाय एडमिन सेटिंग्स UI से भी अपने टेलीफ़ोनी प्रदाता को पूरी तरह से कॉन्फ़िगर कर सकते हैं। गैर-Twilio प्रदाताओं के लिए यह आवश्यक है। अपने प्रदाता की [सेटअप गाइड](/docs/deploy/providers) देखें।

## 4. टेलीफ़ोनी webhooks कॉन्फ़िगर करें

अपने टेलीफ़ोनी प्रदाता को वॉइस webhooks आपके Worker को भेजने के लिए कॉन्फ़िगर करें। Webhook URLs सभी प्रदाताओं के लिए समान हैं:

- **इनकमिंग कॉल URL**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **स्टेटस कॉलबैक URL**: `https://your-worker.your-domain.com/telephony/status` (POST)

प्रदाता-विशिष्ट webhook सेटअप निर्देशों के लिए देखें: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo), या [Asterisk](/docs/deploy/providers/asterisk)।

स्थानीय विकास के लिए, आपको अपने स्थानीय Worker को टेलीफ़ोनी प्रदाता के लिए एक्सपोज़ करने हेतु एक टनल (जैसे Cloudflare Tunnel या ngrok) की आवश्यकता होगी।

## 5. स्थानीय रूप से चलाएँ

Worker डेव सर्वर शुरू करें (बैकएंड + फ्रंटएंड):

```bash
# पहले फ्रंटएंड एसेट्स बिल्ड करें
bun run build

# Worker डेव सर्वर शुरू करें
bun run dev:worker
```

ऐप `http://localhost:8787` पर उपलब्ध होगा। चरण 2 से एडमिन nsec के साथ लॉग इन करें।

## 6. Cloudflare पर तैनात करें

```bash
bun run deploy
```

यह फ्रंटएंड बिल्ड करता है और Durable Objects के साथ Worker को Cloudflare पर तैनात करता है। तैनाती के बाद, अपने टेलीफ़ोनी प्रदाता के webhook URLs को प्रोडक्शन Worker URL की ओर अपडेट करें।

## अगले कदम

- [एडमिन गाइड](/docs/admin-guide) — वॉलंटियर जोड़ें, शिफ्ट बनाएँ, सेटिंग्स कॉन्फ़िगर करें
- [वॉलंटियर गाइड](/docs/volunteer-guide) — अपने वॉलंटियर्स के साथ साझा करें
- [टेलीफ़ोनी प्रदाता](/docs/deploy/providers) — प्रदाताओं की तुलना करें और ज़रूरत पड़ने पर Twilio से बदलें
- [सुरक्षा मॉडल](/security) — एन्क्रिप्शन और थ्रेट मॉडल को समझें
