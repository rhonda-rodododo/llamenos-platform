---
title: "Ruchojmil: Asterisk (Self-Hosted)"
description: Ruchojmil ruxaq' pa ruxaq' richin tich'ak Asterisk rik'in ri sip-bridge richin Llamenos.
---

Asterisk jun open-source telephony platform achi'el tich'ak pa awachib'al. Re' nuya' ruk'u'x samaj chi awe pa konojel awachib'al chuqa' nuyüj ri per-minute cloud taq toj. Llamenos nok pa Asterisk via ri `sip-bridge` samaj rokisaxik ri Asterisk REST Interface (ARI).

> **Rutzijol:** Ri `asterisk-bridge` samaj man k'o ta chik. Xtz'ila' rik'in `sip-bridge`, ri nrokisaj Asterisk ARI, FreeSWITCH ESL, chuqa' Kamailio via ri `PBX_TYPE` ruk'u'x samaj ruchojmil. Tiya' `PBX_TYPE=asterisk` richin Asterisk.

Re' ri ruk'u'x samaj ruk'ayewal chuqa' nuchilab'ej richin taq k'ayib'äl rik'in technical taq to'onelab' ri yetikïr nich'ajin taq ruk'u'x samaj ruch'ak'ik.

## Taq k'ayewal

- Jun Linux ruk'u'x samaj (Ubuntu 22.04+ o Debian 12+ nuchilab'ej) rik'in jun public IP ruk'u'x samaj
- Jun SIP trunk provider richin PSTN connectivity (achike, Telnyx, Flowroute, VoIP.ms)
- Awachib'al Llamenos tz'aqat chuqa' okel via jun public URL
- Jun ruk'u'x samaj rik'in Linux ruk'u'x samaj ruch'ak'ik

## 1. Titz'ib'äx Asterisk

### Rucha'ik A: Ruk'u'x samaj rucholaj (utziläj)

```bash
sudo apt update
sudo apt install asterisk
```

### Rucha'ik B: Docker (nuchilab'ej richin utziläj ruch'ak'ik)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Ruchojmil ri SIP trunk

Tijal `/etc/asterisk/pjsip.conf` richin nitz'aqatisaj aw SIP trunk provider:

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

## 3. Titz'ij'ij' ARI

Tijal `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Tijal `/etc/asterisk/http.conf`:

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

## 4. Ruchojmil ri dialplan

Tijal `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Tich'ak ri sip-bridge samaj

Ri `sip-bridge` samaj nujal rik'in Llamenos webhooks chuqa' ARI taq samajib'äl. Nuk'ul pa ri Llamenos ruk'u'x samaj chuqa' nuch'ak'ij' via Docker Compose rokisaxik ri `--profile telephony` etal.

Titz'aqatisaj pa aw `.env`:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Titikirisaj rik'in ri telephony rutz'aqat:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

O tich'ak achi'el jun standalone:

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

## 6. Ruchojmil pa Llamenos

1. Titikirisaj molojri'ïl achi'el admin
2. Katb'e pa **Settings** → **Telephony Provider**
3. Tacha' **Asterisk (Self-Hosted)**
4. Tiya':
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: aw ARI ewan tzij
   - **Bridge Secret**: aw bridge ewan tzij
   - **Phone Number**: aw SIP trunk rajilab'al (E.164 ruwäch)
5. Tipitz' **Save**

## 7. Tojtob'en ri ruchojmil

```bash
# Ketz'et chi ARI samajin
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Titz'olïxïx Asterisk
sudo systemctl restart asterisk
```

Chuqa' tacha' awachib'al hotline rajilab'al pa jun ch'ich' chuqa' kek'ut ri sip-bridge taq tz'ib'anik.

## Taq ruchajixik rutzil

### TLS chuqa' SRTP

```ini
; Pa pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Titz'ij'ij' SRTP pa endpoints:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Ruk'u'x samaj ruch'ak'ik

- Tokisäx jun firewall: xa xe aw SIP trunk provider okel pa SIP (5060-5061) chuqa' RTP (10000-20000/udp) taq b'ey
- Tiq'at ARI (8088-8089/tcp) xa xe pa ri sip-bridge ruk'u'x samaj
- Tokisäx fail2ban richin ruchajixik chi kiwäch SIP scanning taq tz'ib'anik

## Ruch'utik ruk'ayewal

- **ARI okem xq'at**: Ketz'et chi `http.conf` k'o `enabled=yes`
- **Majun audio**: Kek'ut RTP taq b'ey (10000-20000/udp) e jaqel chuqa' NAT tz'aqat
- **SIP registration taq sachoj**: Ketz'et SIP trunk taq ewan taq tzij chuqa' DNS
- **sip-bridge man nok ta**: Kek'ut chi `PBX_TYPE=asterisk` tz'aqat, chuqa' chi ARI_PASSWORD chuqa' BRIDGE_SECRET nik'oj pa ri bridge chuqa' Llamenos admin ruchojmil
