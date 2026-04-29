---
title: "Setup: Asterisk (Self-Hosted)"
description: Hakbang-hakbang na gabay para i-deploy ang Asterisk kasama ang ARI bridge para sa Llamenos.
---

Ang Asterisk ay isang open-source na telephony platform na ikaw ang nagho-host sa sarili mong infrastructure. Nagbibigay ito sa iyo ng pinakamataas na kontrol sa iyong data at inaalis ang per-minute na cloud fee. Kumokonekta ang Llamenos sa Asterisk sa pamamagitan ng Asterisk REST Interface (ARI).

Ito ang pinakakumplikadong opsyon sa setup at inirerekomenda para sa mga organisasyong may teknikal na staff na kayang mamahala ng server infrastructure.

## Mga Kinakailangan

- Isang Linux server (inirerekomenda ang Ubuntu 22.04+ o Debian 12+) na may pampublikong IP address
- Isang SIP trunk provider para sa PSTN connectivity (hal., Telnyx, Flowroute, VoIP.ms)
- Ang iyong Llamenos instance na naka-deploy at naa-access sa pamamagitan ng pampublikong URL
- Pangunahing kaalaman sa pamamahala ng Linux server

## 1. I-install ang Asterisk

### Opsyon A: Package manager (mas simple)

```bash
sudo apt update
sudo apt install asterisk
```

### Opsyon B: Docker (inirerekomenda para sa mas madaling pamamahala)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Opsyon C: Build mula sa source (para sa custom module)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. I-configure ang SIP trunk

I-edit ang `/etc/asterisk/pjsip.conf` para idagdag ang iyong SIP trunk provider. Narito ang isang halimbawang configuration:

```ini
; SIP trunk sa iyong PSTN provider
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

## 3. I-enable ang ARI

Ang ARI (Asterisk REST Interface) ang paraan kung paano kinokontrol ng Llamenos ang mga tawag sa Asterisk.

I-edit ang `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

I-edit ang `/etc/asterisk/http.conf` para i-enable ang HTTP server:

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

## 4. I-configure ang dialplan

I-edit ang `/etc/asterisk/extensions.conf` para i-route ang mga papasok na tawag sa ARI application:

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

## 5. I-deploy ang ARI bridge service

Ang ARI bridge ay isang maliit na service na nagta-translate sa pagitan ng Llamenos webhook at ARI event. Tumatakbo ito kasama ng Asterisk at kumokonekta sa parehong ARI WebSocket at iyong Llamenos Worker.

```bash
# Ang bridge service ay kasama sa Llamenos repository
cd llamenos
bun run build:ari-bridge

# I-run ito
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

O gamit ang Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. I-configure sa Llamenos

1. Mag-log in bilang admin
2. Pumunta sa **Settings** > **Telephony Provider**
3. Piliin ang **Asterisk (Self-Hosted)** mula sa provider dropdown
4. Ilagay ang:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: ang iyong ARI password
   - **Bridge Callback URL**: URL kung saan tumatanggap ang ARI bridge ng webhook mula sa Llamenos (hal., `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: ang iyong SIP trunk phone number (E.164 format)
5. I-click ang **Save**

## 7. Subukan ang setup

1. I-restart ang Asterisk: `sudo systemctl restart asterisk`
2. I-verify na tumatakbo ang ARI: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Tawagan ang numero ng iyong hotline mula sa isang telepono
4. Suriin ang mga log ng ARI bridge para sa connection at call event

## Mga konsiderasyon sa seguridad

Ang pagpapatakbo ng sarili mong Asterisk server ay nagbibigay sa iyo ng buong kontrol, ngunit buong responsibilidad din para sa seguridad:

### TLS at SRTP

Palaging i-enable ang TLS para sa SIP signaling at SRTP para sa media encryption:

```ini
; Sa pjsip.conf transport section
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

I-enable ang SRTP sa mga endpoint:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Paghihiwalay ng network

- Ilagay ang Asterisk sa isang DMZ o nakahiwalay na network segment
- Gumamit ng firewall para limitahan ang access:
  - SIP (5060-5061/tcp/udp): mula lamang sa iyong SIP trunk provider
  - RTP (10000-20000/udp): mula lamang sa iyong SIP trunk provider
  - ARI (8088-8089/tcp): mula lamang sa ARI bridge server
  - SSH (22/tcp): mula lamang sa mga admin IP
- Gumamit ng fail2ban para protektahan laban sa SIP scanning attack

### Regular na pag-update

Panatilihing updated ang Asterisk para sa mga security vulnerability patch:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC kasama ang Asterisk

Sinusuportahan ng Asterisk ang WebRTC sa pamamagitan ng built-in na WebSocket transport at SIP.js sa browser. Nangangailangan ito ng karagdagang configuration:

1. I-enable ang WebSocket transport sa `http.conf`
2. Lumikha ng mga PJSIP endpoint para sa mga WebRTC client
3. I-configure ang DTLS-SRTP para sa media encryption
4. Gamitin ang SIP.js sa client side (awtomatikong kinokonpigura ng Llamenos kapag napili ang Asterisk)

Ang WebRTC setup kasama ang Asterisk ay mas komplikado kaysa sa mga cloud provider. Tingnan ang gabay sa [WebRTC Browser Calling](/docs/deploy/providers/webrtc) para sa mga detalye.

## Pag-troubleshoot

- **Tinanggihan ang ARI connection**: I-verify na ang `http.conf` ay may `enabled=yes` at tama ang bind address.
- **Walang audio**: Suriin na bukas ang RTP port (10000-20000/udp) sa iyong firewall at tamang naka-configure ang NAT.
- **Mga pagkabigo sa SIP registration**: I-verify ang iyong SIP trunk credential at na nare-resolve ng DNS ang SIP server ng iyong provider.
- **Hindi kumokonekta ang bridge**: Suriin na naaabot ng ARI bridge ang parehong Asterisk ARI endpoint at ang iyong Llamenos Worker URL.
- **Mga isyu sa kalidad ng tawag**: Siguraduhing sapat ang bandwidth ng iyong server at mababa ang latency sa SIP trunk provider. Isaalang-alang ang mga codec (opus para sa WebRTC, ulaw/alaw para sa PSTN).
