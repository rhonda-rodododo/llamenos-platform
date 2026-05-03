---
title: Erste Schritte
description: Stellen Sie Ihre eigene Llamenos-Hotline in weniger als einer Stunde bereit.
---

Stellen Sie Ihre eigene Llamenos-Hotline in weniger als einer Stunde bereit. Sie benoetigen ein Cloudflare-Konto, ein Konto bei einem Telefonieanbieter und einen Rechner mit installiertem Bun.

## Voraussetzungen

- [Bun](https://bun.sh) v1.0 oder hoeher (Runtime und Paketmanager)
- Ein [Cloudflare](https://www.cloudflare.com)-Konto (das kostenlose Kontingent reicht fuer die Entwicklung)
- Ein Konto bei einem Telefonieanbieter -- [Twilio](https://www.twilio.com) ist der einfachste Einstieg, aber Llamenos unterstuetzt auch [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) und [selbst gehostetes Asterisk](/docs/deploy/providers/asterisk). Sehen Sie sich den [Vergleich der Telefonieanbieter](/docs/deploy/providers) an, um bei der Auswahl zu helfen.
- Git

## 1. Klonen und installieren

```bash
git clone https://github.com/rhonda-rodododo/llamenos-hotline.git
cd llamenos-hotline
bun install
```

## 2. Admin-Schluesselpaar generieren

Generieren Sie ein Nostr-Schluesselpaar fuer das Administratorkonto. Dies erzeugt einen geheimen Schluessel (nsec) und einen oeffentlichen Schluessel (npub/hex).

```bash
bun run bootstrap-admin
```

Bewahren Sie den `nsec` sicher auf -- das ist Ihr Admin-Anmeldedaten. Sie benoetigen den hexadezimalen oeffentlichen Schluessel fuer den naechsten Schritt.

## 3. Secrets konfigurieren

Erstellen Sie eine `.dev.vars`-Datei im Projektstammverzeichnis fuer die lokale Entwicklung. Dieses Beispiel verwendet Twilio -- wenn Sie einen anderen Anbieter nutzen, koennen Sie die Twilio-Variablen ueberspringen und Ihren Anbieter ueber die Admin-Oberflaeche nach der ersten Anmeldung konfigurieren.

```bash
# .dev.vars
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PUBKEY=your_hex_public_key_from_step_2
ENVIRONMENT=development
```

Fuer die Produktion setzen Sie diese als Wrangler-Secrets:

```bash
bunx wrangler secret put ADMIN_PUBKEY
# Wenn Sie Twilio als Standard-Anbieter ueber Umgebungsvariablen verwenden:
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_PHONE_NUMBER
```

> **Hinweis**: Sie koennen Ihren Telefonieanbieter auch vollstaendig ueber die Admin-Einstellungsoberflaeche konfigurieren, anstatt Umgebungsvariablen zu verwenden. Dies ist fuer Nicht-Twilio-Anbieter erforderlich. Siehe den [Einrichtungsleitfaden fuer Ihren Anbieter](/docs/deploy/providers).

## 4. Telefonie-Webhooks konfigurieren

Konfigurieren Sie Ihren Telefonieanbieter, um Sprach-Webhooks an Ihren Worker zu senden. Die Webhook-URLs sind unabhaengig vom Anbieter identisch:

- **URL fuer eingehende Anrufe**: `https://your-worker.your-domain.com/telephony/incoming` (POST)
- **Status-Callback-URL**: `https://your-worker.your-domain.com/telephony/status` (POST)

Fuer anbieterspezifische Webhook-Einrichtungsanweisungen siehe: [Twilio](/docs/deploy/providers/twilio), [SignalWire](/docs/deploy/providers/signalwire), [Vonage](/docs/deploy/providers/vonage), [Plivo](/docs/deploy/providers/plivo) oder [Asterisk](/docs/deploy/providers/asterisk).

Fuer die lokale Entwicklung benoetigen Sie einen Tunnel (wie Cloudflare Tunnel oder ngrok), um Ihren lokalen Worker fuer Ihren Telefonieanbieter erreichbar zu machen.

## 5. Lokal ausfuehren

Starten Sie den Worker-Entwicklungsserver (Backend + Frontend):

```bash
# Zuerst die Frontend-Assets bauen
bun run build

# Den Worker-Entwicklungsserver starten
bun run dev:worker
```

Die App ist unter `http://localhost:8787` verfuegbar. Melden Sie sich mit dem Admin-nsec aus Schritt 2 an.

## 6. Auf Cloudflare bereitstellen

```bash
bun run deploy
```

Dies baut das Frontend und stellt den Worker mit Durable Objects auf Cloudflare bereit. Aktualisieren Sie nach dem Deployment die Webhook-URLs Ihres Telefonieanbieters, damit sie auf die Produktions-Worker-URL verweisen.

## Naechste Schritte

- [Administratorhandbuch](/docs/admin-guide) -- Freiwillige hinzufuegen, Schichten erstellen, Einstellungen konfigurieren
- [Handbuch fuer Freiwillige](/docs/volunteer-guide) -- zum Teilen mit Ihren Freiwilligen
- [Telefonieanbieter](/docs/deploy/providers) -- Anbieter vergleichen und bei Bedarf von Twilio wechseln
- [Sicherheitsmodell](/security) -- Verschluesselung und Bedrohungsmodell verstehen
