---
title: "Einrichtung: WhatsApp"
description: Verbinden Sie WhatsApp Business ueber die Meta Cloud API fuer verschluesselte Nachrichten.
---

Llamenos unterstuetzt WhatsApp Business-Nachrichten ueber die Meta Cloud API (Graph API v21.0). WhatsApp ermoeglicht umfangreiche Nachrichten mit Unterstuetzung fuer Text, Bilder, Dokumente, Audio und interaktive Nachrichten.

## Voraussetzungen

- Ein [Meta Business-Konto](https://business.facebook.com)
- Eine WhatsApp Business API-Telefonnummer
- Eine Meta-Entwickler-App mit aktiviertem WhatsApp-Produkt

## Integrationsmodi

Llamenos unterstuetzt zwei WhatsApp-Integrationsmodi:

### Meta Direkt (empfohlen)

Direkte Verbindung zur Meta Cloud API. Bietet volle Kontrolle und alle Funktionen.

**Erforderliche Anmeldedaten:**
- **Phone Number ID** -- Ihre WhatsApp Business-Telefonnummer-ID
- **Business Account ID** -- Ihre Meta Business-Konto-ID
- **Access Token** -- ein langlebiges Meta API-Zugriffstoken
- **Verify Token** -- eine benutzerdefinierte Zeichenkette, die Sie fuer die Webhook-Verifizierung waehlen
- **App Secret** -- Ihr Meta App-Geheimnis (fuer die Webhook-Signatur-Validierung)

### Twilio-Modus

Wenn Sie Twilio bereits fuer Sprache verwenden, koennen Sie WhatsApp ueber Ihr Twilio-Konto leiten. Einfacheres Setup, aber einige Funktionen koennen eingeschraenkt sein.

**Erforderliche Anmeldedaten:**
- Ihre bestehende Twilio Account SID, Auth Token und ein Twilio-verbundener WhatsApp-Absender

## 1. Meta-App erstellen

1. Gehen Sie zu [developers.facebook.com](https://developers.facebook.com)
2. Erstellen Sie eine neue App (Typ: Business)
3. Fuegen Sie das **WhatsApp**-Produkt hinzu
4. Notieren Sie unter WhatsApp > Getting Started Ihre **Phone Number ID** und **Business Account ID**
5. Generieren Sie ein permanentes Zugriffstoken (Settings > Access Tokens)

## 2. Webhook konfigurieren

Im Meta-Entwickler-Dashboard:

1. Gehen Sie zu WhatsApp > Configuration > Webhook
2. Setzen Sie die Callback URL auf:
   ```
   https://ihr-worker.ihre-domain.com/api/messaging/whatsapp/webhook
   ```
3. Setzen Sie das Verify Token auf dieselbe Zeichenkette, die Sie in den Llamenos-Admin-Einstellungen eingeben werden
4. Abonnieren Sie das `messages`-Webhook-Feld

Meta sendet eine GET-Anfrage zur Verifizierung des Webhooks. Ihr Worker antwortet mit der Challenge, wenn das Verify Token uebereinstimmt.

## 3. WhatsApp in den Admin-Einstellungen aktivieren

Navigieren Sie zu **Admin-Einstellungen > Nachrichtenkanaele** (oder verwenden Sie den Einrichtungsassistenten) und aktivieren Sie **WhatsApp**.

Waehlen Sie den Modus **Meta Direkt** oder **Twilio** und geben Sie die erforderlichen Anmeldedaten ein.

Konfigurieren Sie optionale Einstellungen:
- **Auto-Antwort-Nachricht** -- wird an Erstkontakte gesendet
- **Antwort ausserhalb der Geschaeftszeiten** -- wird ausserhalb der Schichtzeiten gesendet

## 4. Testen

Senden Sie eine WhatsApp-Nachricht an Ihre Business-Telefonnummer. Die Konversation sollte im Tab **Konversationen** erscheinen.

## 24-Stunden-Nachrichtenfenster

WhatsApp erzwingt ein 24-Stunden-Nachrichtenfenster:
- Sie koennen einem Benutzer innerhalb von 24 Stunden nach seiner letzten Nachricht antworten
- Nach 24 Stunden muessen Sie eine genehmigte **Vorlagennachricht** verwenden, um die Konversation neu zu starten
- Llamenos handhabt dies automatisch -- wenn das Fenster abgelaufen ist, sendet es eine Vorlagennachricht, um die Konversation fortzusetzen

## Medienunterstuetzung

WhatsApp unterstuetzt umfangreiche Mediennachrichten:
- **Bilder** (JPEG, PNG)
- **Dokumente** (PDF, Word, etc.)
- **Audio** (MP3, OGG)
- **Video** (MP4)
- **Standort**-Freigabe
- **Interaktive** Nachrichten mit Buttons und Listen

Medienanhaenge werden inline in der Konversationsansicht angezeigt.

## Sicherheitshinweise

- WhatsApp verwendet Ende-zu-Ende-Verschluesselung zwischen dem Benutzer und der Meta-Infrastruktur
- Meta kann technisch auf Nachrichteninhalte auf ihren Servern zugreifen
- Nachrichten werden in Llamenos nach dem Empfang vom Webhook gespeichert
- Webhook-Signaturen werden mit HMAC-SHA256 und Ihrem App Secret validiert
- Fuer maximalen Datenschutz sollten Sie Signal anstelle von WhatsApp in Betracht ziehen
