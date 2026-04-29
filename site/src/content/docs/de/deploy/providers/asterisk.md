---
title: "Einrichtung: Asterisk (selbst gehostet)"
description: Schritt-fuer-Schritt-Anleitung zur Bereitstellung von Asterisk mit der ARI-Bridge fuer Llamenos.
---

Asterisk ist eine Open-Source-Telefonieplattform, die Sie auf Ihrer eigenen Infrastruktur hosten. Dies gibt Ihnen maximale Kontrolle ueber Ihre Daten und eliminiert Cloud-Kosten pro Minute. Llamenos verbindet sich mit Asterisk ueber das Asterisk REST Interface (ARI).

Dies ist die komplexeste Einrichtungsoption und wird fuer Organisationen empfohlen, die ueber technisches Personal zur Verwaltung der Serverinfrastruktur verfuegen.

## Voraussetzungen

- Ein Linux-Server (Ubuntu 22.04+ oder Debian 12+ empfohlen) mit einer oeffentlichen IP-Adresse
- Ein SIP-Trunk-Anbieter fuer die PSTN-Konnektivitaet (z.B. Telnyx, Flowroute, VoIP.ms)
- Ihre Llamenos-Instanz muss bereitgestellt und ueber eine oeffentliche URL erreichbar sein
- Grundkenntnisse in der Linux-Serveradministration

## 1. Asterisk installieren

### Option A: Paketmanager (einfacher)

```bash
sudo apt update
sudo apt install asterisk
```

### Option B: Docker (empfohlen fuer einfachere Verwaltung)

```bash
docker pull asterisk/asterisk:20
docker run -d \
  --name asterisk \
  --network host \
  -v /etc/asterisk:/etc/asterisk \
  -v /var/lib/asterisk:/var/lib/asterisk \
  asterisk/asterisk:20
```

### Option C: Aus Quellcode kompilieren (fuer benutzerdefinierte Module)

```bash
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar xzf asterisk-20-current.tar.gz
cd asterisk-20.*/
./configure
make
sudo make install
sudo make samples
```

## 2. SIP-Trunk konfigurieren

Bearbeiten Sie `/etc/asterisk/pjsip.conf`, um Ihren SIP-Trunk-Anbieter hinzuzufuegen. Hier ist eine Beispielkonfiguration:

```ini
; SIP-Trunk zu Ihrem PSTN-Anbieter
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

## 3. ARI aktivieren

ARI (Asterisk REST Interface) ist die Methode, mit der Llamenos Anrufe auf Asterisk steuert.

Bearbeiten Sie `/etc/asterisk/ari.conf`:

```ini
[general]
enabled=yes
pretty=yes

[llamenos]
type=user
read_only=no
password=your-strong-ari-password
```

Bearbeiten Sie `/etc/asterisk/http.conf`, um den HTTP-Server zu aktivieren:

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

## 4. Waehlplan konfigurieren

Bearbeiten Sie `/etc/asterisk/extensions.conf`, um eingehende Anrufe an die ARI-Anwendung weiterzuleiten:

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

## 5. ARI-Bridge-Service bereitstellen

Die ARI-Bridge ist ein kleiner Service, der zwischen Llamenos-Webhooks und ARI-Ereignissen uebersetzt. Er laeuft neben Asterisk und verbindet sich sowohl mit dem ARI-WebSocket als auch mit Ihrem Llamenos-Worker.

```bash
# Der Bridge-Service ist im Llamenos-Repository enthalten
cd llamenos
bun run build:ari-bridge

# Ausfuehren
ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
ASTERISK_ARI_USERNAME=llamenos \
ASTERISK_ARI_PASSWORD=your-strong-ari-password \
LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
bun run ari-bridge
```

Oder mit Docker:

```bash
docker run -d \
  --name llamenos-ari-bridge \
  -e ASTERISK_ARI_URL=https://your-asterisk-server:8089/ari \
  -e ASTERISK_ARI_USERNAME=llamenos \
  -e ASTERISK_ARI_PASSWORD=your-strong-ari-password \
  -e LLAMENOS_CALLBACK_URL=https://your-worker-url.com/telephony \
  llamenos/ari-bridge
```

## 6. In Llamenos konfigurieren

1. Melden Sie sich als Administrator an
2. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
3. Waehlen Sie **Asterisk (selbst gehostet)** aus dem Anbieter-Dropdown
4. Geben Sie ein:
   - **ARI URL**: `https://your-asterisk-server:8089/ari`
   - **ARI Username**: `llamenos`
   - **ARI Password**: Ihr ARI-Passwort
   - **Bridge Callback URL**: URL, unter der die ARI-Bridge Webhooks von Llamenos empfaengt (z.B. `https://bridge.your-domain.com/webhook`)
   - **Phone Number**: Ihre SIP-Trunk-Telefonnummer (E.164-Format)
5. Klicken Sie auf **Speichern**

## 7. Einrichtung testen

1. Asterisk neu starten: `sudo systemctl restart asterisk`
2. Pruefen, ob ARI laeuft: `curl -u llamenos:password https://your-server:8089/ari/asterisk/info`
3. Rufen Sie Ihre Hotline-Nummer von einem Telefon aus an
4. Pruefen Sie die ARI-Bridge-Logs auf Verbindungs- und Anrufereignisse

## Sicherheitshinweise

Das Betreiben eines eigenen Asterisk-Servers gibt Ihnen volle Kontrolle, aber auch die volle Verantwortung fuer die Sicherheit:

### TLS und SRTP

Aktivieren Sie immer TLS fuer die SIP-Signalisierung und SRTP fuer die Medienverschluesselung:

```ini
; Im Transport-Abschnitt von pjsip.conf
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/etc/asterisk/keys/asterisk.pem
priv_key_file=/etc/asterisk/keys/asterisk.key
method=tlsv1_2
```

SRTP auf Endpoints aktivieren:

```ini
[trunk-endpoint]
media_encryption=sdes
media_encryption_optimistic=yes
```

### Netzwerkisolierung

- Platzieren Sie Asterisk in einer DMZ oder einem isolierten Netzwerksegment
- Verwenden Sie eine Firewall, um den Zugriff einzuschraenken:
  - SIP (5060-5061/tcp/udp): nur von Ihrem SIP-Trunk-Anbieter
  - RTP (10000-20000/udp): nur von Ihrem SIP-Trunk-Anbieter
  - ARI (8088-8089/tcp): nur vom ARI-Bridge-Server
  - SSH (22/tcp): nur von Admin-IPs
- Verwenden Sie fail2ban zum Schutz gegen SIP-Scanning-Angriffe

### Regelmaessige Updates

Halten Sie Asterisk aktuell, um Sicherheitsluecken zu beheben:

```bash
sudo apt update && sudo apt upgrade asterisk
```

## WebRTC mit Asterisk

Asterisk unterstuetzt WebRTC ueber seinen integrierten WebSocket-Transport und SIP.js im Browser. Dies erfordert zusaetzliche Konfiguration:

1. Aktivieren Sie den WebSocket-Transport in `http.conf`
2. Erstellen Sie PJSIP-Endpoints fuer WebRTC-Clients
3. Konfigurieren Sie DTLS-SRTP fuer die Medienverschluesselung
4. Verwenden Sie SIP.js auf der Client-Seite (wird automatisch von Llamenos konfiguriert, wenn Asterisk ausgewaehlt ist)

Die WebRTC-Einrichtung mit Asterisk ist aufwaendiger als bei Cloud-Anbietern. Siehe den Leitfaden [WebRTC-Browseranrufe](/docs/deploy/providers/webrtc) fuer Details.

## Fehlerbehebung

- **ARI-Verbindung abgelehnt**: Ueberpruefen Sie, ob `http.conf` `enabled=yes` hat und die Bind-Adresse korrekt ist.
- **Kein Audio**: Pruefen Sie, ob die RTP-Ports (10000-20000/udp) in Ihrer Firewall geoeffnet sind und NAT korrekt konfiguriert ist.
- **SIP-Registrierungsfehler**: Ueberpruefen Sie Ihre SIP-Trunk-Zugangsdaten und ob DNS den SIP-Server Ihres Anbieters aufloest.
- **Bridge verbindet sich nicht**: Pruefen Sie, ob die ARI-Bridge sowohl den Asterisk-ARI-Endpunkt als auch Ihre Llamenos-Worker-URL erreichen kann.
- **Probleme mit der Anrufqualitaet**: Stellen Sie sicher, dass Ihr Server ausreichend Bandbreite und geringe Latenz zum SIP-Trunk-Anbieter hat. Beruecksichtigen Sie Codecs (Opus fuer WebRTC, ulaw/alaw fuer PSTN).
