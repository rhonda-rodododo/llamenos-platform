---
title: "Einrichtung: Signal"
description: Richten Sie den Signal-Nachrichtenkanal ueber die signal-cli-Bridge fuer datenschutzorientierte Kommunikation ein.
---

Llamenos unterstuetzt Signal-Nachrichten ueber eine selbst gehostete [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api)-Bridge. Signal bietet die staerksten Datenschutzgarantien aller Nachrichtenkanaele und ist damit ideal fuer sensible Krisenreaktionsszenarien.

## Voraussetzungen

- Ein Linux-Server oder eine VM fuer die Bridge (kann derselbe Server wie Asterisk sein, oder separat)
- Docker auf dem Bridge-Server installiert
- Eine dedizierte Telefonnummer fuer die Signal-Registrierung
- Netzwerkzugang von der Bridge zu Ihrem Cloudflare Worker

## Architektur

```mermaid
flowchart LR
    User["Signal-Benutzer"] --> Servers["Signal-Server"]
    Servers --> Bridge["signal-cli-Bridge<br/>(selbst gehostet)"]
    Bridge --> Worker["Llamenos Worker<br/>(Cloudflare)"]
```

Die signal-cli-Bridge laeuft auf Ihrer Infrastruktur und leitet Nachrichten ueber HTTP-Webhooks an Ihren Worker weiter. Das bedeutet, Sie kontrollieren den gesamten Nachrichtenweg von Signal bis zu Ihrer Anwendung.

## 1. signal-cli-Bridge bereitstellen

Starten Sie den signal-cli-rest-api Docker-Container:

```bash
docker run -d \
  --name signal-cli \
  --restart unless-stopped \
  -p 8080:8080 \
  -v signal-cli-data:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

## 2. Telefonnummer registrieren

Registrieren Sie die Bridge mit einer dedizierten Telefonnummer:

```bash
# Verifizierungscode per SMS anfordern
curl -X POST http://localhost:8080/v1/register/+1234567890

# Mit dem erhaltenen Code verifizieren
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/123456
```

## 3. Webhook-Weiterleitung konfigurieren

Richten Sie die Bridge ein, um eingehende Nachrichten an Ihren Worker weiterzuleiten:

```bash
curl -X PUT http://localhost:8080/v1/about \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://ihr-worker.ihre-domain.com/api/messaging/signal/webhook",
      "headers": {
        "Authorization": "Bearer ihr-webhook-geheimnis"
      }
    }
  }'
```

## 4. Signal in den Admin-Einstellungen aktivieren

Navigieren Sie zu **Admin-Einstellungen > Nachrichtenkanaele** (oder verwenden Sie den Einrichtungsassistenten) und aktivieren Sie **Signal**.

Geben Sie Folgendes ein:
- **Bridge-URL** -- die URL Ihrer signal-cli-Bridge (z.B. `https://signal-bridge.beispiel.com:8080`)
- **Bridge-API-Schluessel** -- ein Bearer-Token zur Authentifizierung von Anfragen an die Bridge
- **Webhook-Geheimnis** -- das Geheimnis zur Validierung eingehender Webhooks (muss mit dem in Schritt 3 konfigurierten uebereinstimmen)
- **Registrierte Nummer** -- die bei Signal registrierte Telefonnummer

## 5. Testen

Senden Sie eine Signal-Nachricht an Ihre registrierte Telefonnummer. Die Konversation sollte im Tab **Konversationen** erscheinen.

## Gesundheitsueberwachung

Llamenos ueberwacht die Gesundheit der signal-cli-Bridge:
- Regelmaessige Gesundheitspruefungen am `/v1/about`-Endpunkt der Bridge
- Graceful Degradation, wenn die Bridge nicht erreichbar ist -- andere Kanaele funktionieren weiter
- Admin-Benachrichtigungen, wenn die Bridge ausfaellt

## Sprachnachricht-Transkription

Signal-Sprachnachrichten koennen direkt im Browser des Freiwilligen mittels client-seitigem Whisper (WASM ueber `@huggingface/transformers`) transkribiert werden. Audio verlaesst niemals das Geraet -- das Transkript wird verschluesselt und zusammen mit der Sprachnachricht in der Konversationsansicht gespeichert. Freiwillige koennen die Transkription in ihren persoenlichen Einstellungen aktivieren oder deaktivieren.

## Sicherheitshinweise

- Signal bietet Ende-zu-Ende-Verschluesselung zwischen dem Benutzer und der signal-cli-Bridge
- Die Bridge entschluesselt Nachrichten, um sie als Webhooks weiterzuleiten -- der Bridge-Server hat Klartextzugriff
- Die Webhook-Authentifizierung verwendet Bearer-Tokens mit Vergleich in konstanter Zeit
- Halten Sie die Bridge im gleichen Netzwerk wie Ihren Asterisk-Server (falls zutreffend) fuer minimale Exposition
- Die Bridge speichert den Nachrichtenverlauf lokal in ihrem Docker-Volume -- erwaegen Sie Verschluesselung im Ruhezustand
- Fuer maximalen Datenschutz: hosten Sie sowohl Asterisk (Sprache) als auch signal-cli (Nachrichten) auf Ihrer eigenen Infrastruktur

## Fehlerbehebung

- **Bridge empfaengt keine Nachrichten**: Ueberpruefen Sie, ob die Telefonnummer korrekt registriert ist mit `GET /v1/about`
- **Webhook-Zustellungsfehler**: Ueberpruefen Sie, ob die Webhook-URL vom Bridge-Server erreichbar ist und der Authorization-Header uebereinstimmt
- **Registrierungsprobleme**: Manche Telefonnummern muessen moeglicherweise zuerst von einem bestehenden Signal-Konto getrennt werden
