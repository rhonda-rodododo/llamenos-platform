---
title: "सेटअप: Asterisk (सेल्फ़-होस्टेड)"
description: Llamenos के लिए ARI ब्रिज के साथ Asterisk तैनात करने की चरण-दर-चरण गाइड।
---

Asterisk एक ओपन-सोर्स टेलीफ़ोनी प्लेटफ़ॉर्म है जिसे आप अपने स्वयं के इंफ्रास्ट्रक्चर पर होस्ट करते हैं। यह आपको अपने डेटा पर अधिकतम नियंत्रण देता है और प्रति-मिनट क्लाउड शुल्क समाप्त करता है। Llamenos, Asterisk REST Interface (ARI) के माध्यम से Asterisk से जुड़ता है।

यह सबसे जटिल सेटअप विकल्प है और उन संगठनों के लिए अनुशंसित है जिनके पास सर्वर इंफ्रास्ट्रक्चर प्रबंधित कर सकने वाला तकनीकी स्टाफ़ है।

## पूर्वापेक्षाएँ

- एक Linux सर्वर (Ubuntu 22.04+ या Debian 12+ अनुशंसित) जिसमें पब्लिक IP एड्रेस हो
- PSTN कनेक्टिविटी के लिए एक SIP ट्रंक प्रदाता (जैसे, Telnyx, Flowroute, VoIP.ms)
- आपका Llamenos इंस्टेंस तैनात और पब्लिक URL से एक्सेसिबल
- Linux सर्वर एडमिनिस्ट्रेशन की बुनियादी जानकारी

## 1. Asterisk इंस्टॉल करें

### विकल्प A: पैकेज मैनेजर (सरल)

```bash
sudo apt update
sudo apt install asterisk
```

### विकल्प B: Docker (आसान प्रबंधन के लिए अनुशंसित)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### विकल्प C: सोर्स से बिल्ड करें (कस्टम मॉड्यूल के लिए)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. SIP ट्रंक कॉन्फ़िगर करें

अपने SIP ट्रंक प्रदाता को जोड़ने के लिए `/etc/asterisk/pjsip.conf` संपादित करें। यहाँ एक उदाहरण कॉन्फ़िगरेशन है:

```ini
; SIP trunk to your PSTN provider
[trunk-provider]
type=registration
transport=transport-tls
outbound_auth=trunk-auth
server_uri=sip:sip.your-provider.com
client_uri=sip:your-account@sip.your-provider.com

[trunk-auth]
type=auth
auth_type=userpass
username=your-account
password=your-password

[trunk-endpoint]
type=endpoint
context=from-trunk
transport=transport-tls
disallow=all
allow=ulaw
allow=alaw
allow=opus
aors=trunk-aor
outbound_auth=trunk-auth

[trunk-aor]
type=aor
contact=sip:sip.your-provider.com
```

## 3. ARI सक्षम करें

ARI (Asterisk REST Interface) वह तरीका है जिससे Llamenos, Asterisk पर कॉल नियंत्रित करता है।

`/etc/asterisk/ari.conf` संपादित करें:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

HTTP सर्वर सक्षम करने के लिए `/etc/asterisk/http.conf` संपादित करें:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 4. डायलप्लान कॉन्फ़िगर करें

इनकमिंग कॉल को ARI एप्लिकेशन में रूट करने के लिए `/etc/asterisk/extensions.conf` संपादित करें:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()

[llamenos-outbound]
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
 same => n,Stasis(llamenos,outbound)
 same => n,Hangup()
```

## 5. ARI ब्रिज सर्विस तैनात करें

ARI ब्रिज एक छोटी सर्विस है जो Llamenos webhooks और ARI इवेंट्स के बीच ट्रांसलेट करती है। यह Asterisk के साथ-साथ चलती है और ARI WebSocket और आपके Llamenos Worker दोनों से कनेक्ट होती है।

```bash
# ब्रिज सर्विस Llamenos रिपॉज़िटरी में शामिल है
cd llamenos
bun run build:ari-bridge

# इसे चलाएँ
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

या Docker के साथ:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Llamenos में कॉन्फ़िगर करें

1. एडमिन के रूप में लॉग इन करें
2. **सेटिंग्स** > **टेलीफ़ोनी प्रदाता** पर जाएँ
3. प्रदाता ड्रॉपडाउन से **Asterisk (सेल्फ़-होस्टेड)** चुनें
4. दर्ज करें:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: आपका ARI पासवर्ड
   - **Bridge Callback URL**: वह URL जहाँ ARI ब्रिज Llamenos से webhooks प्राप्त करता है (जैसे, `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: आपका SIP ट्रंक फ़ोन नंबर (E.164 फ़ॉर्मेट)
5. **सेव** पर क्लिक करें

## 7. सेटअप टेस्ट करें

1. Asterisk रीस्टार्ट करें: `sudo systemctl restart asterisk`
2. ARI चल रहा है वेरिफ़ाई करें: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. किसी फ़ोन से अपने हॉटलाइन नंबर पर कॉल करें
4. कनेक्शन और कॉल इवेंट्स के लिए ARI ब्रिज लॉग्स जाँचें

## सुरक्षा विचार

अपना Asterisk सर्वर चलाने से आपको पूर्ण नियंत्रण मिलता है, लेकिन सुरक्षा की पूर्ण ज़िम्मेदारी भी:

### TLS और SRTP

SIP सिग्नलिंग के लिए हमेशा TLS और मीडिया एन्क्रिप्शन के लिए SRTP सक्षम करें:

```ini
; In pjsip.conf transport section
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Endpoints पर SRTP सक्षम करें:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### नेटवर्क आइसोलेशन

- Asterisk को DMZ या अलग नेटवर्क सेगमेंट में रखें
- एक्सेस प्रतिबंधित करने के लिए फ़ायरवॉल का उपयोग करें:
  - SIP (5060-5061/tcp/udp): केवल आपके SIP ट्रंक प्रदाता से
  - RTP (10000-20000/udp): केवल आपके SIP ट्रंक प्रदाता से
  - ARI (8088-8089/tcp): केवल ARI ब्रिज सर्वर से
  - SSH (22/tcp): केवल एडमिन IPs से
- SIP स्कैनिंग हमलों से बचाने के लिए fail2ban का उपयोग करें

### नियमित अपडेट

सुरक्षा कमज़ोरियों को पैच करने के लिए Asterisk अपडेट रखें:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## Asterisk के साथ WebRTC

Asterisk अपने बिल्ट-इन WebSocket ट्रांसपोर्ट और ब्राउज़र में SIP.js के माध्यम से WebRTC का समर्थन करता है। इसके लिए अतिरिक्त कॉन्फ़िगरेशन की आवश्यकता है:

1. `http.conf` में WebSocket ट्रांसपोर्ट सक्षम करें
2. WebRTC क्लाइंट्स के लिए PJSIP endpoints बनाएँ
3. मीडिया एन्क्रिप्शन के लिए DTLS-SRTP कॉन्फ़िगर करें
4. क्लाइंट साइड पर SIP.js का उपयोग करें (जब Asterisk चुना जाता है तो Llamenos द्वारा स्वचालित रूप से कॉन्फ़िगर किया जाता है)

Asterisk के साथ WebRTC सेटअप क्लाउड प्रदाताओं की तुलना में अधिक जटिल है। विवरण के लिए [WebRTC ब्राउज़र कॉलिंग](/docs/deploy/providers/webrtc) गाइड देखें।

## समस्या निवारण

- **ARI कनेक्शन रिफ़्यूज़्ड**: वेरिफ़ाई करें कि `http.conf` में `enabled=yes` है और बाइंड एड्रेस सही है।
- **कोई ऑडियो नहीं**: जाँचें कि RTP पोर्ट (10000-20000/udp) आपके फ़ायरवॉल में खुले हैं और NAT सही तरीके से कॉन्फ़िगर है।
- **SIP रजिस्ट्रेशन विफलता**: अपने SIP ट्रंक क्रेडेंशियल्स वेरिफ़ाई करें और सुनिश्चित करें कि DNS आपके प्रदाता के SIP सर्वर को रिज़ॉल्व करता है।
- **ब्रिज कनेक्ट नहीं हो रहा**: जाँचें कि ARI ब्रिज Asterisk ARI endpoint और आपके Llamenos Worker URL दोनों तक पहुँच सकता है।
- **कॉल क्वालिटी समस्याएँ**: सुनिश्चित करें कि आपके सर्वर में SIP ट्रंक प्रदाता तक पर्याप्त बैंडविड्थ और कम लेटेंसी है। कोडेक्स पर विचार करें (WebRTC के लिए opus, PSTN के लिए ulaw/alaw)।
