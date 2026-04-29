---
title: "Setup: Asterisk (Self-Hosted)"
description: Step-by-step guide to deploy Asterisk with the sip-bridge for Llamenos.
---

Asterisk is an open-source telephony platform that you host on your own infrastructure. This gives you maximum control over your data and eliminates per-minute cloud fees. Llamenos connects to Asterisk via the `sip-bridge` service using the Asterisk REST Interface (ARI).

> **Note:** The `asterisk-bridge` service no longer exists. It has been replaced by `sip-bridge`, which supports Asterisk ARI, FreeSWITCH ESL, and Kamailio via the `PBX_TYPE` environment variable. Set `PBX_TYPE=asterisk` for Asterisk.

This is the most complex setup option and is recommended for organizations with technical staff who can manage server infrastructure.

## Prerequisites

- A Linux server (Ubuntu 22.04+ or Debian 12+ recommended) with a public IP address
- A SIP trunk provider for PSTN connectivity (e.g., Telnyx, Flowroute, VoIP.ms)
- Your Llamenos instance deployed and accessible via a public URL
- Basic familiarity with Linux server administration

## 1. Install Asterisk

### Option A: Package manager (simpler)

```bash
sudo apt update
sudo apt install asterisk
```

### Option B: Docker (recommended for easier management)

```bash
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

## 2. Configure the SIP trunk

Edit `/etc/asterisk/pjsip.conf` to add your SIP trunk provider:

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

Edit `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Edit `/etc/asterisk/http.conf`:

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

Edit `/etc/asterisk/extensions.conf`:

```ini
[from-trunk]
exten => _X.,1,NoOp(Incoming call from ${CALLERID(num)})
 same => n,Stasis(llamenos,incoming)
 same => n,Hangup()
```

## 5. Deploy the sip-bridge service

The `sip-bridge` service translates between Llamenos webhooks and ARI events. It is included in the Llamenos repository and is deployed via Docker Compose using the `--profile telephony` flag.

Add to your `.env`:

```env
PBX_TYPE=asterisk
ARI_PASSWORD=your-strong-ari-password
BRIDGE_SECRET=your-hex-bridge-secret   # openssl rand -hex 32
```

Start with the telephony profile:

```bash
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml \
  --profile telephony up -d
```

Or run standalone:

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
2. Go to **Settings** → **Telephony Provider**
3. Select **Asterisk (Self-Hosted)**
4. Enter:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: your ARI password
   - **Bridge Secret**: your bridge secret
   - **Phone Number**: your SIP trunk number (E.164 format)
5. Click **Save**

## 7. Test the setup

```bash
# Verify ARI is running
curl -u llamenos:password https://your-server:8089/ari/asterisk/info

# Restart Asterisk
sudo systemctl restart asterisk
```

Then call your hotline number from a phone and check the sip-bridge logs.

## Security considerations

### TLS and SRTP

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

- Use a firewall: only your SIP trunk provider should reach SIP (5060-5061) and RTP (10000-20000/udp) ports
- Restrict ARI (8088-8089/tcp) to the sip-bridge server only
- Use fail2ban to protect against SIP scanning attacks

## Troubleshooting

- **ARI connection refused**: Verify `http.conf` has `enabled=yes`
- **No audio**: Check RTP ports (10000-20000/udp) are open and NAT is configured
- **SIP registration failures**: Verify SIP trunk credentials and DNS
- **sip-bridge not connecting**: Check `PBX_TYPE=asterisk` is set, and that ARI_PASSWORD and BRIDGE_SECRET match in both the bridge and Llamenos admin settings
