---
title: "Einrichtung: SMS"
description: Aktivieren Sie eingehende und ausgehende SMS-Nachrichten ueber Ihren Telefonieanbieter.
---

SMS-Nachrichten in Llamenos verwenden die bestehenden Anmeldedaten Ihres Sprachtelefonie-Anbieters. Kein separater SMS-Dienst ist erforderlich -- wenn Sie Twilio, SignalWire, Vonage oder Plivo bereits fuer Sprache konfiguriert haben, funktioniert SMS mit demselben Konto.

## Unterstuetzte Anbieter

| Anbieter | SMS-Unterstuetzung | Hinweise |
|----------|-------------------|----------|
| **Twilio** | Ja | Vollstaendiges bidirektionales SMS ueber Twilio Messaging API |
| **SignalWire** | Ja | Kompatibel mit der Twilio-API -- gleiche Schnittstelle |
| **Vonage** | Ja | SMS ueber Vonage REST API |
| **Plivo** | Ja | SMS ueber Plivo Message API |
| **Asterisk** | Nein | Asterisk unterstuetzt kein natives SMS |

## 1. SMS in den Admin-Einstellungen aktivieren

Navigieren Sie zu **Admin-Einstellungen > Nachrichtenkanaele** (oder verwenden Sie den Einrichtungsassistenten bei der ersten Anmeldung) und aktivieren Sie **SMS**.

Konfigurieren Sie die SMS-Einstellungen:
- **Auto-Antwort-Nachricht** -- optionale Willkommensnachricht, die an Erstkontakte gesendet wird
- **Antwort ausserhalb der Geschaeftszeiten** -- optionale Nachricht, die ausserhalb der Schichtzeiten gesendet wird

## 2. Webhook konfigurieren

Richten Sie den SMS-Webhook Ihres Telefonieanbieters auf Ihren Worker:

```
POST https://ihr-worker.ihre-domain.com/api/messaging/sms/webhook
```

### Twilio / SignalWire

1. Gehen Sie zur Twilio-Konsole > Phone Numbers > Active Numbers
2. Waehlen Sie Ihre Telefonnummer
3. Setzen Sie unter **Messaging** die Webhook-URL fuer "A message comes in" auf die obige URL
4. Setzen Sie die HTTP-Methode auf **POST**

### Vonage

1. Gehen Sie zum Vonage API Dashboard > Applications
2. Waehlen Sie Ihre Anwendung
3. Setzen Sie unter **Messages** die Inbound URL auf die obige Webhook-URL

### Plivo

1. Gehen Sie zur Plivo-Konsole > Messaging > Applications
2. Erstellen oder bearbeiten Sie eine Messaging-Anwendung
3. Setzen Sie die Message URL auf die obige Webhook-URL
4. Weisen Sie die Anwendung Ihrer Telefonnummer zu

## 3. Testen

Senden Sie eine SMS an Ihre Hotline-Telefonnummer. Sie sollten die Konversation im Tab **Konversationen** im Admin-Panel sehen.

## Funktionsweise

1. Eine SMS kommt bei Ihrem Anbieter an, der einen Webhook an Ihren Worker sendet
2. Der Worker validiert die Webhook-Signatur (anbieterspezifisches HMAC)
3. Die Nachricht wird geparst und im ConversationDO gespeichert
4. Diensthabende Freiwillige werden ueber Nostr-Relay-Events benachrichtigt
5. Freiwillige antworten ueber den Konversationen-Tab -- Antworten werden ueber die SMS-API Ihres Anbieters zurueckgesendet

## Sicherheitshinweise

- SMS-Nachrichten durchqueren das Mobilfunknetz im Klartext -- Ihr Anbieter und die Mobilfunkbetreiber koennen sie lesen
- Eingehende Nachrichten werden nach der Ankunft im ConversationDO gespeichert
- Absender-Telefonnummern werden vor der Speicherung gehasht (Datenschutz)
- Webhook-Signaturen werden pro Anbieter validiert (HMAC-SHA1 fuer Twilio, etc.)
