---
title: रिपोर्टर गाइड
description: एन्क्रिप्टेड रिपोर्ट कैसे submit करें और उनकी status कैसे track करें।
---

एक रिपोर्टर के रूप में, आप Llamenos platform के माध्यम से अपने संगठन को एन्क्रिप्टेड रिपोर्ट submit कर सकते हैं। रिपोर्ट end-to-end encrypted हैं — सर्वर कभी आपकी report content नहीं देखता।

## शुरुआत करना

आपका admin आपको इनमें से एक देगा:
- एक **nsec** (Nostr secret key) — `nsec1` से शुरू होने वाली string
- एक **invite link** — एक one-time URL जो आपके लिए credentials बनाता है

**अपना nsec private रखें।** यह आपकी identity और login credential है। इसे password manager में store करें।

## Login करना

1. Browser में ऐप खोलें
2. Login field में अपना `nsec` paste करें
3. आपकी identity cryptographically verified होती है — आपकी secret key कभी आपके browser को नहीं छोड़ती

पहले login के बाद, आप भविष्य के आसान logins के लिए Settings में WebAuthn passkey register कर सकते हैं।

## रिपोर्ट submit करना

1. Reports page से **New Report** click करें
2. अपनी रिपोर्ट के लिए एक **title** enter करें (यह admins को triage में मदद करता है — plaintext में stored है)
3. अगर आपके admin ने report categories define की हैं तो एक **category** select करें
4. Body field में अपना **report content** लिखें — यह आपके browser से भेजे जाने से पहले encrypt हो जाता है
5. वैकल्पिक रूप से आपके admin द्वारा configure किए गए **custom fields** भरें
6. वैकल्पिक रूप से **files attach करें** — files upload से पहले client-side encrypt होती हैं
7. **Submit** click करें

आपकी रिपोर्ट आपकी Reports list में "Open" status के साथ दिखती है।

## रिपोर्ट encryption

- रिपोर्ट body और custom field values ECIES (secp256k1 + XChaCha20-Poly1305) का उपयोग करके encrypt की जाती हैं
- File attachments उसी scheme का उपयोग करके अलग से encrypt होते हैं
- केवल आप और admin content decrypt कर सकते हैं
- सर्वर केवल ciphertext store करता है — database compromise होने पर भी आपकी report content सुरक्षित है

## अपनी रिपोर्ट track करना

आपकी Reports page आपकी सभी submitted reports दिखाती है:
- **Title** और **category**
- **Status** — Open, Claimed (एक admin इस पर काम कर रहा है), या Resolved
- submit की गई **Date**

Full thread देखने के लिए एक रिपोर्ट पर click करें, जिसमें कोई भी admin replies शामिल हैं।

## Admins को reply करना

जब कोई admin आपकी रिपोर्ट का जवाब देता है, उनकी reply report thread में दिखती है। आप वापस reply कर सकते हैं — thread के सभी messages encrypted हैं।

## आप क्या नहीं कर सकते

एक रिपोर्टर के रूप में, आपकी access सभी की privacy protect करने के लिए सीमित है:
- आप अपनी रिपोर्ट और Help page **देख सकते** हैं
- आप अन्य reporters की रिपोर्ट, call records, volunteer info, या admin settings **नहीं देख सकते**
- आप calls का जवाब देने या SMS/WhatsApp/Signal conversations में respond करने में **सक्षम नहीं** हैं

## Tips

- वर्णनात्मक titles उपयोग करें — वे admins को full content decrypt किए बिना triage में मदद करते हैं
- Relevant files (screenshots, documents) attach करें जब वे आपकी रिपोर्ट को support करते हों
- Admin responses के लिए समय-समय पर check करें — आप अपनी report list में status changes देखेंगे
- FAQ और guides के लिए Help page उपयोग करें
