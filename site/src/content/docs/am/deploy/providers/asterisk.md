---
title: "ማዋቀር: Asterisk (ራስ-ማስተናገድ)"
description: Asteriskን ከsip-bridge ጋር ለLlamenos ለመተግበር በደረጃ የሚሄድ መመሪያ።
---

Asterisk በራስዎ መሰረተ-ልማት ላይ የሚያስተናግዱ ክፍት-ምንጭ የስልክ መድረክ ነው። ይህ ስለ መረጃዎ መቆጣጠር ከፍተኛ ቁጥጥር ይሰጥዎታል እና በደቂቃ የደመነ ክፍያዎችን ያስወግዳል። Llamenos ከ`sip-bridge` አገልግሎት በኩል Asterisk REST Interface (ARI) በመጠቀም ይገናኛል።

> **ማስታወሻ:** `asterisk-bridge` አገልግሎት ከአሁን በኋላ የለም። በ`sip-bridge` ተተክቷል፣ ይህም Asterisk ARI፣ FreeSWITCH ESL፣ እና Kamailioን `PBX_TYPE` የአካባቢ ተለዋዋጭ በመጠቀም ይደግፋል። ለAsterisk `PBX_TYPE=asterisk` ያዘጋጁ።

ይህ በጣም የተሳሰበ የማዋቀሪያ አማራጭ ነው እና ለቴክኒካል ሰራተኞች ያሉትን የሰርቨር መሰረተ-ልማት ለማስተዳደር ለሚችሉ ድርጅቶች ይመከራል።

## ቅድመ ሁኔታዎች

- Linux ሰርቨር (Ubuntu 22.04+ ወይም Debian 12+ የሚመከር) ከይፋዊ IP አድራሻ ጋር
- ለPSTN ግንኙነት SIP trunk አቅራቢ (ለምሳሌ፣ Telnyx፣ Flowroute፣ VoIP.ms)
- የእርስዎ Llamenos instance ተጭኖ እና በይፋዊ URL በኩል ተደራሽ መሆን
- Linux ሰርቨር አስተዳደር መሰረታዊ እውቀት

## 1. Asterisk ያጫኑ

### አማራጭ A: Package manager (ቀላል)

```bash
sudo apt update
sudo apt install asterisk
```

### አማራጭ B: Docker (ለቀላል አስተዳደር የሚመከር)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. SIP trunk ያዋቅሩ

የእርስዎን SIP trunk አቅራቢ ለማከል `/etc/asterisk/pjsip.conf` ያዘጋጁ፦

```ini
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

## 3. ARI ያንቁ

`/etc/asterisk/ari.conf` ያዘጋጁ፦

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`/etc/asterisk/http.conf` ያዘጋጁ፦

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

## 4. Dialplan ያዋቅሩ

`/etc/asterisk/extensions.conf` ያዘጋጁ፦

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. sip-bridge አገልግሎትን ያስተግቡ

`sip-bridge` አገልግሎት በLlamenos webhooks እና ARI ክስተቶች መካከል ይተረጉማል። በLlamenos repository ውስጥ ይገኛል እና በ`--profile telephony` ባንዲራ በDocker Compose ይተገብራል።

ወደ `.env` ያክሉ፦

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

ከtelephony profile ጋር ያስጀምሩ፦

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

ወይም ብቻውን ያሂዱ፦

```bash
cd sip-bridge
PBX_TYPE=asterisk \
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-domain.com/api/telephony \
BRIDGE_SECRET=your-hex-bridge-secret \
bun run start
```

## 6. በLlamenos ውስጥ ያዋቅሩ

1. እንደ አስተዳዳሪ ይግቡ
2. ወደ **Settings** → **Telephony Provider** ይሂዱ
3. **Asterisk (Self-Hosted)** ይምረጡ
4. ያስገቡ፦
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: የእርስዎ ARI password
   - **Bridge Secret**: የእርስዎ bridge secret
   - **Phone Number**: የእርስዎ SIP trunk ቁጥር (E.164 ቅርጸት)
5. **Save** ተጭነው

## 7. ማዋቀሩን ይሞክሩ

```bash
# ARI እየሰራ መሆኑን ያረጋግጡ
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Asterisk እንደገና ያስጀምሩ
sudo systemctl restart asterisk
```

ከዚያ ከስልክዎ Hotline ቁጥርዎን ይደውሉ እና sip-bridge logs ይመልከቱ።

## የደህንነት ምክንያቶች

### TLS እና SRTP

```ini
; In pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

በendpoints ላይ SRTP ያንቁ፦

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### የኔትዎርክ ማገልገል

- Firewall ይጠቀሙ፦ SIP trunk አቅራቢዎ ብቻ SIP (5060-5061) እና RTP (10000-20000/udp) ፖርቶችን መድረስ አለባቸው
- ARI (8088-8089/tcp) ለsip-bridge ሰርቨር ብቻ ይገድቡ
- SIP scanning ጥቃቶችን ለመከላከል fail2ban ይጠቀሙ

## ችግር መፍቻ

- **ARI connection refused**: `http.conf` ውስጥ `enabled=yes` መሆኑን ያረጋግጡ
- **ድምፅ የለም**: RTP ፖርቶች (10000-20000/udp) ክፍት እና NAT ትክክለኛ መሆኑን ያረጋግጡ
- **SIP registration ስህተቶች**: SIP trunk መረጃዎችን እና DNS ያረጋግጡ
- **sip-bridge አይገናኝም**: `PBX_TYPE=asterisk` መዘጋጀቱን እና ARI_PASSWORD እና BRIDGE_SECRET በbridge እና Llamenos አስተዳዳሪ ቅንጅቶች መዛመዱን ያረጋግጡ
