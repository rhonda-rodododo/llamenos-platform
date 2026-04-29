---
title: "Setup: Asterisk (Ebèje Pa Ou Menm)"
description: Gid etap pa etap pou deplwaye Asterisk ak pon ARI a pou Llamenos.
---

Asterisk se yon platfòm telefoni open-source ke ou ebèje sou pwòp enfrastrikti ou. Sa ba ou maksimòm kontwòl sou done ou yo epi elimine frè cloud pa minit. Llamenos konekte ak Asterisk atravè Asterisk REST Interface (ARI).

Sa se opsyon setup ki pi konplèks la epi li rekòmande pou òganizasyon ki gen pèsonèl teknik ki ka jere enfrastrikti sèvè.

## Kondisyon Prealab

- Yon sèvè Linux (Ubuntu 22.04+ oswa Debian 12+ rekòmande) ki gen yon adrès IP piblik
- Yon founisè SIP trunk pou konektivite PSTN (pa egzanp, Telnyx, Flowroute, VoIP.ms)
- Enstans Llamenos ou deplwaye epi aksesib atravè yon URL piblik
- Konesans debaz nan administrasyon sèvè Linux

## 1. Enstale Asterisk

### Opsyon A: Package manager (pi senp)

```bash
sudo apt update
sudo apt install asterisk
```

### Opsyon B: Docker (rekòmande pou jesyon pi fasil)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Opsyon C: Bati soti nan sous (pou modil pèsonalize)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. Konfigire SIP trunk la

Modifye `/etc/asterisk/pjsip.conf` pou ajoute founisè SIP trunk ou. Men yon egzanp konfigirasyon:

```ini
; SIP trunk bay founisè PSTN ou
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

## 3. Aktive ARI

ARI (Asterisk REST Interface) se fason Llamenos kontwole apèl sou Asterisk.

Modifye `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Modifye `/etc/asterisk/http.conf` pou aktive sèvè HTTP a:

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

## 4. Konfigire dialplan la

Modifye `/etc/asterisk/extensions.conf` pou dirije apèl antre yo nan aplikasyon ARI a:

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

## 5. Deplwaye sèvis pon ARI a

Pon ARI a se yon ti sèvis ki tradui ant webhook Llamenos ak evènman ARI. Li fonksyone akote Asterisk epi li konekte ak tou de WebSocket ARI ak Worker Llamenos ou a.

```bash
# Sèvis pon an enkli nan repozitwa Llamenos
cd llamenos
bun run build:ari-bridge

# Egzekite li
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Oswa ak Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. Konfigire nan Llamenos

1. Konekte kòm administratè
2. Ale nan **Settings** > **Telephony Provider**
3. Chwazi **Asterisk (Self-Hosted)** nan lis dewoulant founisè a
4. Antre:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: modpas ARI ou
   - **Bridge Callback URL**: URL kote pon ARI a resevwa webhook nan men Llamenos (pa egzanp, `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: nimewo telefòn SIP trunk ou (fòma E.164)
5. Klike sou **Save**

## 7. Teste konfigirasyon an

1. Redemarè Asterisk: `sudo systemctl restart asterisk`
2. Verifye ARI ap fonksyone: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Rele nimewo liy dirèk ou a soti nan yon telefòn
4. Tcheke jounal pon ARI a pou evènman koneksyon ak apèl

## Konsiderasyon sekirite

Egzekite pwòp sèvè Asterisk ou ba ou tout kontwòl, men tou tout responsablite pou sekirite:

### TLS ak SRTP

Toujou aktive TLS pou siyalizasyon SIP ak SRTP pou chifraj medya:

```ini
; Nan seksyon transport pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

Aktive SRTP sou endpoint yo:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Izolasyon rezo

- Mete Asterisk nan yon DMZ oswa segman rezo izole
- Itilize yon firewall pou restrenn aksè:
  - SIP (5060-5061/tcp/udp): sèlman soti nan founisè SIP trunk ou
  - RTP (10000-20000/udp): sèlman soti nan founisè SIP trunk ou
  - ARI (8088-8089/tcp): sèlman soti nan sèvè pon ARI a
  - SSH (22/tcp): sèlman soti nan IP administratè yo
- Itilize fail2ban pou pwoteje kont atak eskanaj SIP

### Mizajou regilye

Kenbe Asterisk ajou pou korije vilnerabilite sekirite:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC ak Asterisk

Asterisk sipòte WebRTC atravè transpò WebSocket entegre ak SIP.js nan navigatè a. Sa mande konfigirasyon adisyonèl:

1. Aktive transpò WebSocket nan `http.conf`
2. Kreye endpoint PJSIP pou kliyan WebRTC
3. Konfigire DTLS-SRTP pou chifraj medya
4. Itilize SIP.js sou bò kliyan an (Llamenos konfigire otomatikman lè Asterisk chwazi)

Setup WebRTC ak Asterisk pi konplike pase ak founisè cloud. Gade gid [Apèl nan Navigatè ak WebRTC](/docs/deploy/providers/webrtc) pou detay.

## Depannaj

- **Koneksyon ARI refize**: Verifye ke `http.conf` gen `enabled=yes` epi adrès bind la kòrèk.
- **Pa gen odyo**: Tcheke ke pò RTP (10000-20000/udp) louvri nan firewall ou epi NAT konfigire kòrèkteman.
- **Echèk anrejistreman SIP**: Verifye idantifyan SIP trunk ou epi ke DNS rezoud sèvè SIP founisè ou a.
- **Pon pa konekte**: Tcheke ke pon ARI a ka rive ni nan endpoint ARI Asterisk ni nan URL Worker Llamenos ou a.
- **Pwoblèm kalite apèl**: Asire ke sèvè ou gen ase bandwidth ak ba latans bay founisè SIP trunk la. Konsidere kodèk (opus pou WebRTC, ulaw/alaw pou PSTN).
