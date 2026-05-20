---
title: "Deji: Asterisk (Is-hawlgab)"
description: Tilmaan tallaabo-tallaabo ah oo lagu hawlgaliyo Asterisk oo leh sip-bridge Llámenos.
---

Asterisk waa platform telefoon oo fure-furan oo aad ku martigelisay kaabayaashaaga gaarka ah. Tani waxay ku siinaysaa kontorool ugu sarreeya xogtaada waxayna meesha ka saaraysaa khidmadaha daruuraha daqiiqad kasta. Llámenos wuxuu ku xirmaa Asterisk iyada oo loo marayo adeegga `sip-bridge` isagoo isticmaalaya Asterisk REST Interface (ARI).

> **Xusuus:** Adeegga `asterisk-bridge` mar dambe ma jiro. Waxaa beddelay `sip-bridge`, kaas oo taageera Asterisk ARI, FreeSWITCH ESL, iyo Kamailio iyada oo loo marayo doorsoomaha deegaanka `PBX_TYPE`. Ku deji `PBX_TYPE=asterisk` Asterisk.

Tani waa ikhtiyaarka ugu kakanta ee dejinta waxaana lagugula talinayaa ururrada leh shaqaale farsamo oo maamuli kara kaabayaasha server-ka.

## Waxyaabaha loo baahan yahay

- Server Linux ah (Ubuntu 22.04+ ama Debian 12+ lagu taliyay) oo leh cinwaan IP dadweyne
- Bixiye SIP trunk xiriiriyaha PSTN (tusaale, Telnyx, Flowroute, VoIP.ms)
- Matoorkaaga Llámenos oo la hawlgaliyay oo laga heli karo URL dadweyne
- Aqoon asaasi ah oo ku saabsan maamulka server-ka Linux

## 1. Ku rakib Asterisk

### Ikhtiyaarka A: Maamulaha xirmada (ka fudud)

```bash
sudo apt update
sudo apt install asterisk
```

### Ikhtiyaarka B: Docker (lagu taliyay maamul fudud)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Qaabee SIP trunk

Tafatir `/etc/asterisk/pjsip.conf` si aad ugu darto bixiyahaaga SIP trunk:

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

## 3. Ku shid ARI

Tafatir `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Tafatir `/etc/asterisk/http.conf`:

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

## 4. Qaabee dialplan-ka

Tafatir `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Hawlgeli adeegga sip-bridge

Adeegga `sip-bridge` wuxuu u turjubaa Llámenos webhooks dhacdooyinka ARI. Wuxuu ku jiraa kaydka Llámenos waxaana lagu hawlgeliyaa Docker Compose iyada oo loo marayo calanka `--profile telephony`.

Ku dar `.env`-kaaga:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Ku bilow profile-ka telephony:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

Ama si madax-bannaan u wad:

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

## 6. Ku qaabee Llámenos

1. Soo gal maamul ahaan
2. Tag **Settings** → **Telephony Provider**
3. Dooro **Asterisk (Self-Hosted)**
4. Gali:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: lambarkaaga sirta ah ee ARI
   - **Bridge Secret**: sirtaada bridge
   - **Phone Number**: lambarkaaga SIP trunk (qaabka E.164)
5. Guji **Save**

## 7. Tijaabi dejinta

```bash
# Xaqiiji in ARI shaqeynayo
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Dib u bilow Asterisk
sudo systemctl restart asterisk
```

Ka dib u wac lambarkaaga khadka gurmadka taleefan oo hubi log-yada sip-bridge.

## Tixgelinta amniga

### TLS iyo SRTP

```ini
; pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Ku shid SRTP dhamaanadka:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Goonida shabakadda

- Isticmaal dab-damiya: oo keliya bixiyahaaga SIP trunk waa inuu gaaro SIP (5060-5061) iyo RTP (10000-20000/udp) ports
- Xaddid ARI (8088-8089/tcp) server-ka sip-bridge oo keliya
- Isticmaal fail2ban si aad u ilaaliso weerarrada baadhista SIP

## Cillad-xallinta

- **ARI xiriir diiday**: Xaqiiji in `http.conf` uu leeyahay `enabled=yes`
- **Ma jiro maqal**: Hubi port-yada RTP (10000-20000/udp) inay furan yihiin oo NAT la qaabeyay
- **Qaladaadka diiwaangelinta SIP**: Xaqiiji aqoonsiyaha SIP trunk iyo DNS
- **sip-bridge ma xirmayo**: Hubi in `PBX_TYPE=asterisk` la dejiyay, oo ARI_PASSWORD iyo BRIDGE_SECRET ay ku mid yihiin buundada iyo dejinta maamulka Llámenos
