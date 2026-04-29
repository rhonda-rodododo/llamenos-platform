---
title: WebRTC-Browseranrufe
description: Aktivieren Sie die Anrufannahme im Browser fuer Freiwillige ueber WebRTC.
---

WebRTC (Web Real-Time Communication) ermoeglicht es Freiwilligen, Hotline-Anrufe direkt in ihrem Browser anzunehmen, ohne ein Telefon zu benoetigen. Dies ist nuetzlich fuer Freiwillige, die ihre Telefonnummer nicht teilen moechten oder von einem Computer aus arbeiten.

## So funktioniert es

1. Der Administrator aktiviert WebRTC in den Einstellungen des Telefonieanbieters
2. Freiwillige setzen ihre Anrufpraeferenz auf "Browser" in ihrem Profil
3. Wenn ein Anruf eingeht, klingelt die Llamenos-App im Browser mit einer Benachrichtigung
4. Der Freiwillige klickt auf "Annehmen" und der Anruf wird ueber den Browser mit dem Mikrofon verbunden

Der Anruf-Audio wird vom Telefonieanbieter ueber eine WebRTC-Verbindung zum Browser des Freiwilligen geleitet. Die Anrufqualitaet haengt von der Internetverbindung des Freiwilligen ab.

## Voraussetzungen

### Admin-Einrichtung

- Ein unterstuetzter Telefonieanbieter mit aktiviertem WebRTC (Twilio, SignalWire, Vonage oder Plivo)
- Anbieterspezifische WebRTC-Zugangsdaten konfiguriert (siehe Anbieter-Einrichtungsanleitungen)
- WebRTC aktiviert unter **Einstellungen** > **Telefonieanbieter**

### Anforderungen fuer Freiwillige

- Ein moderner Browser (Chrome, Firefox, Edge oder Safari 14.1+)
- Ein funktionierendes Mikrofon
- Eine stabile Internetverbindung (mindestens 100 kbps Upload/Download)
- Browser-Benachrichtigungsberechtigungen erteilt

## Anbieterspezifische Einrichtung

Jeder Telefonieanbieter benoetigt unterschiedliche Zugangsdaten fuer WebRTC:

### Twilio / SignalWire

1. Erstellen Sie einen **API-Schluessel** in der Anbieter-Konsole
2. Erstellen Sie eine **TwiML/LaML-Anwendung** mit der Voice URL auf `https://your-worker-url.com/telephony/webrtc-incoming`
3. Geben Sie in Llamenos API Key SID, API Key Secret und Application SID ein

### Vonage

1. Ihre Vonage-Anwendung beinhaltet bereits WebRTC-Faehigkeit
2. Fuegen Sie in Llamenos den **privaten Schluessel** Ihrer Anwendung ein (PEM-Format)
3. Die Application ID ist bereits aus der Ersteinrichtung konfiguriert

### Plivo

1. Erstellen Sie einen **Endpoint** in der Plivo-Konsole unter **Voice** > **Endpoints**
2. WebRTC verwendet Ihre vorhandene Auth ID und Auth Token
3. Aktivieren Sie WebRTC in Llamenos -- keine zusaetzlichen Zugangsdaten erforderlich

### Asterisk

Asterisk WebRTC erfordert eine SIP.js-Konfiguration mit WebSocket-Transport. Dies ist aufwaendiger als bei Cloud-Anbietern:

1. Aktivieren Sie den WebSocket-Transport in der `http.conf` von Asterisk
2. Erstellen Sie PJSIP-Endpoints fuer WebRTC-Clients mit DTLS-SRTP
3. Llamenos konfiguriert den SIP.js-Client automatisch, wenn Asterisk ausgewaehlt ist

Siehe den [Asterisk-Einrichtungsleitfaden](/docs/deploy/providers/asterisk) fuer alle Details.

## Anrufpraeferenz fuer Freiwillige einrichten

Freiwillige konfigurieren ihre Anrufpraeferenz in der App:

1. Melden Sie sich bei Llamenos an
2. Gehen Sie zu **Einstellungen** (Zahnrad-Symbol)
3. Unter **Anrufpraeferenzen** waehlen Sie **Browser** statt **Telefon**
4. Erteilen Sie Mikrofon- und Benachrichtigungsberechtigungen, wenn aufgefordert
5. Lassen Sie den Llamenos-Tab waehrend Ihrer Schicht geoeffnet

Wenn ein Anruf eingeht, sehen Sie eine Browser-Benachrichtigung und einen Klingelanzeiger in der App. Klicken Sie auf **Annehmen**, um sich zu verbinden.

## Browser-Kompatibilitaet

| Browser | Desktop | Mobil | Hinweise |
|---|---|---|---|
| Chrome | Ja | Ja | Empfohlen |
| Firefox | Ja | Ja | Volle Unterstuetzung |
| Edge | Ja | Ja | Chromium-basiert, volle Unterstuetzung |
| Safari | Ja (14.1+) | Ja (14.1+) | Erfordert Benutzerinteraktion zum Starten des Audios |
| Brave | Ja | Eingeschraenkt | Moeglicherweise muessen Shields fuer das Mikrofon deaktiviert werden |

## Tipps zur Audioqualitaet

- Verwenden Sie ein Headset oder Ohrhoerer, um Echo zu vermeiden
- Schliessen Sie andere Anwendungen, die das Mikrofon verwenden
- Verwenden Sie nach Moeglichkeit eine kabelgebundene Internetverbindung
- Deaktivieren Sie Browser-Erweiterungen, die WebRTC stoeren koennten (VPN-Erweiterungen, Werbeblocker mit WebRTC-Leak-Schutz)

## Fehlerbehebung

### Kein Audio

- **Mikrofonberechtigungen pruefen**: Klicken Sie auf das Schloss-Symbol in der Adressleiste und stellen Sie sicher, dass der Mikrofonzugriff auf "Erlauben" steht
- **Mikrofon testen**: Verwenden Sie den integrierten Audio-Test Ihres Browsers oder eine Seite wie [webcamtest.com](https://webcamtest.com)
- **Audioausgabe pruefen**: Stellen Sie sicher, dass Ihre Lautsprecher oder Ihr Headset als Ausgabegeraet ausgewaehlt sind

### Anrufe klingeln nicht im Browser

- **Benachrichtigungen blockiert**: Pruefen Sie, ob Browser-Benachrichtigungen fuer die Llamenos-Seite aktiviert sind
- **Tab nicht aktiv**: Der Llamenos-Tab muss geoeffnet sein (er kann im Hintergrund sein, aber der Tab muss existieren)
- **Anrufpraeferenz**: Ueberpruefen Sie, ob Ihre Anrufpraeferenz in den Einstellungen auf "Browser" gesetzt ist
- **WebRTC nicht konfiguriert**: Bitten Sie Ihren Administrator zu ueberpruefen, ob WebRTC aktiviert und die Zugangsdaten konfiguriert sind

### Firewall- und NAT-Probleme

WebRTC verwendet STUN/TURN-Server, um Firewalls und NAT zu ueberwinden. Wenn Anrufe verbunden werden, aber Sie kein Audio hoeren:

- **Unternehmens-Firewalls**: Einige Firewalls blockieren UDP-Verkehr auf Nicht-Standardports. Bitten Sie Ihr IT-Team, UDP-Verkehr auf den Ports 3478 und 10000-60000 zuzulassen
- **Symmetrisches NAT**: Einige Router verwenden symmetrisches NAT, das direkte Peer-Verbindungen verhindern kann. Die TURN-Server des Telefonieanbieters sollten dies automatisch handhaben
- **VPN-Interferenz**: VPNs koennen WebRTC-Verbindungen stoeren. Versuchen Sie, Ihr VPN waehrend der Schichten zu trennen

### Echo oder Rueckkopplung

- Verwenden Sie Kopfhoerer statt Lautsprecher
- Reduzieren Sie die Mikrofonempfindlichkeit in den Audio-Einstellungen Ihres Betriebssystems
- Aktivieren Sie die Echounterdrueckung in Ihrem Browser (normalerweise standardmaessig aktiviert)
- Entfernen Sie sich von harten, reflektierenden Oberflaechen
