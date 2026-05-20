---
title: "Sazkirin: Asterisk (Xweser)"
description: Rêbera gav-bi-gav ji bo sazkirina Asterisk bi sip-bridge ji bo Llamenos.
---

Asterisk platformek telefoniya open-source e ku hûn li ser înfrastruktura xwe bi xwe mîsoger dikin. Ev kontrola herî zêde li ser daneyên we dide û lêçûnên cloud-a deqîqe bi deqîqe radike. Llamenos bi Asterisk re bi karûbarek `sip-bridge` ve têkildar dibe ku ji Asterisk REST Interface (ARI) bikar tîne.

> **Not:** Karûbarek `asterisk-bridge` êdî tune ye. Ji hêla `sip-bridge` ve hatiye şûnve kirin, ku piştgirî dide Asterisk ARI, FreeSWITCH ESL, û Kamailio bi guhertoya hawirdora `PBX_TYPE`. Ji bo Asteriskê `PBX_TYPE=asterisk` saz bikin.

Ev vebijarka sazkirinê ya herî tevlihev e û ji bo saziyên bi karmendên teknîkî ku dikarin înfrastruktura serverê bi rê ve bibin tê pêşniyaz kirin.

## Pêşdibistan

- Serverek Linux (Ubuntu 22.04+ an Debian 12+ tê pêşniyaz kirin) bi navnîşana IP ya giştî
- Pêşkêşkarek SIP trunk ji bo girêdana PSTN (mînak, Telnyx, Flowroute, VoIP.ms)
- Enstansiya Llamenos we hatiye sazkirin û bi URL-yek giştî gihîştî ye
- Nasîna bingehîn a rêveberiya servera Linux

## 1. Asterisk Saz bikin

### Vebijarka A: Birêvebera pakêtê (hêsantir)

```bash
sudo apt update
sudo apt install asterisk
```

### Vebijarka B: Docker (ji bo rêveberiya hêsan tê pêşniyaz kirin)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. SIP trunk Saz bikin

`pjsip.conf` ya `/etc/asterisk/` serast bikin da ku pêşkêşkarê SIP trunk lê zêde bikin:

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

## 3. ARI Çalak bike

`ari.conf` ya `/etc/asterisk/` serast bikin:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

`http.conf` ya `/etc/asterisk/` serast bikin:

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

## 4. Dialplan Saz bikin

`extensions.conf` ya `/etc/asterisk/` serast bikin:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Karûbara sip-bridge Saz bikin

Karûbarek `sip-bridge` di navbera webhookên Llamenos û bûyerên ARI de wergerîne. Ew di depoya Llamenos de ye û bi Docker Compose bi alaya `--profile telephony` tê sazkirin.

Li `.env` ya xwe lê zêde bikin:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Bi profîla telefoniyê dest pê bikin:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

An jî bi tenê bixebitînin:

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

## 6. Di Llamenos de Saz bikin

1. Weke rêveber têkevin
2. Biçin **Settings** → **Telephony Provider**
3. **Asterisk (Self-Hosted)** hilbijêrin
4. Têkevin:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: şîfreya ARI ya we
   - **Bridge Secret**: sirêya bridge ya we
   - **Phone Number**: hejmara SIP trunk ya we (formata E.164)
5. **Save** bikirtînin

## 7. Sazkirinê Biceribînin

```bash
# Piştrast bike ku ARI xebitî ye
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Asterisk ji nû ve bidin destpêkirin
sudo systemctl restart asterisk
```

Paşê ji telefonekê hejmara hotline ya xwe biqeyd bikin û logên sip-bridge kontrol bikin.

## Lihevkirinên ewlehiyê

### TLS û SRTP

```ini
; Di pjsip.conf de
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

SRTP li ser endpointan çalak bikin:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Îzolasyona torê

- Firewall bikar bînin: tenê pêşkêşkarê SIP trunk we divê bigihîje portên SIP (5060-5061) û RTP (10000-20000/udp)
- ARI (8088-8089/tcp) tenê ji bo servera sip-bridge sînordar bikin
- Ji bo parastina li dijî êrişên SIP scanning, fail2ban bikar bînin

## Çareserkirina Arîşeyan

- **ARI connection refused**: Piştrast bike ku `http.conf` `enabled=yes` heye
- **Deng tune**: Kontrol bikin ku portên RTP (10000-20000/udp) vekirî ne û NAT hatiye sazkirin
- **SIP registration failures**: Nasnameyên SIP trunk û DNS kontrol bikin
- **sip-bridge ne girêdide**: Kontrol bikin ku `PBX_TYPE=asterisk` hatiye sazkirin, û ku ARI_PASSWORD û BRIDGE_SECRET di her du aliyên bridge û mîhengên rêveberiya Llamenos de li hev tên
