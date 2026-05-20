---
title: "Setup: Asterisk (Self-Hosted)"
description: Step-by-step guide to deploy Asterisk with the sip-bridge for Llamenos.
---

Asterisk waa open-source telephony platform aad ku host-gareyso infrastructure-kaagaaga. Tani waxay kuu siisaa xakameyn ugu sarreysaa data-gaaga oo waxay ka goysaa per-minute cloud fees. Llamenos waxay isku xirtaa Asterisk via adeegga `sip-bridge` iyadoo isticmaalayo Asterisk REST Interface (ARI).

> **Note:** Adeegga `asterisk-bridge` ma jiro. Waxaa beddelay `sip-bridge`, taasoo taageerta Asterisk ARI, FreeSWITCH ESL, iyo Kamailio via `PBX_TYPE` environment variable. Set `PBX_TYPE=asterisk` for Asterisk.

Tani waa ikhtiyaarka ugu dhisme-xeerka badan oo lagu talinayaa ururada leh staff technical oo kara inay maamulaan server infrastructure.

## Prerequisites

- Linux server (Ubuntu 22.04+ ama Debian 12+ recommended) leh public IP address
- SIP trunk provider for PSTN connectivity (e.g., Telnyx, Flowroute, VoIP.ms)
- Your Llamenos instance deployed oo la heli karo via public URL
- Basic familiarity with Linux server administration

## 1. Install Asterisk

### Ikhtiyaar A: Package manager (fudud)

```bash
sudo apt update
sudo apt install asterisk
```

### Ikhtiyaar B: Docker (recommended for easier management)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Configure the SIP trunk

Wax ka beddel `/etc/asterisk/pjsip.conf` si aad u darto SIP trunk provider-kaaga:

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

## 3. Enable ARI

Wax ka beddel `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Wax ka beddel `/etc/asterisk/http.conf`:

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

## 4. Configure the dialplan

Wax ka beddel `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Deploy the sip-bridge service

Adeegga `sip-bridge` waxa uu turjumaa between Llamenos webhooks iyo ARI events. Waxaa ku jira Llamenos repository-ga oo waxaa la dejiyaa via Docker Compose iyadoo la isticmaalayo `--profile telephony` flag.

Kudar `.env`:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Bilow iyadoo la isticmaalayo telephony profile:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

Ama run standalone:

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

## 6. Configure in Llamenos

1. Log in as admin
2. Aad u guur **Settings** → **Telephony Provider**
3. Dooro **Asterisk (Self-Hosted)**
4. Geli:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: your ARI password
   - **Bridge Secret**: your bridge secret
   - **Phone Number**: your SIP trunk number (E.164 format)
5. Guji **Save**

## 7. Test the setup

```bash
# Verify ARI is running
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Restart Asterisk
sudo systemctl restart asterisk
```

Kadib wac hotline number-kaaga from a phone oo check sip-bridge logs.

## Security considerations

### TLS iyo SRTP

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

Enable SRTP on endpoints:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Network isolation

- Isticmaal firewall: SIP trunk provider-kaaga kaliya ayaa inuu gaaro SIP (5060-5061) iyo RTP (10000-20000/udp) ports
- Xaddid ARI (8088-8089/tcp) to sip-bridge server kaliya
- Isticmaal fail2ban si aad u ilaaliso against SIP scanning attacks

## Troubleshooting

- **ARI connection refused**: Verify `http.conf` leeyahay `enabled=yes`
- **No audio**: Check RTP ports (10000-20000/udp) ay furan yihiin oo NAT la configure gareeyay
- **SIP registration failures**: Verify SIP trunk credentials iyo DNS
- **sip-bridge not connecting**: Check `PBX_TYPE=asterisk` set yahay, oo in ARI_PASSWORD and BRIDGE_SECRET iswaafaqaqaan labadaba bridge-ka iyo Llamenos admin settings
