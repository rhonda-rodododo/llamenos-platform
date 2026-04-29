---
title: "Einrichtung: SignalWire"
description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von SignalWire als Telefonieanbieter.
---

SignalWire ist eine kostenguenstige Alternative zu Twilio mit einer kompatiblen API. Es verwendet LaML (eine TwiML-kompatible Auszeichnungssprache), sodass die Migration zwischen Twilio und SignalWire unkompliziert ist.

## Voraussetzungen

- Ein [SignalWire-Konto](https://signalwire.com/signup) (kostenlose Testversion verfuegbar)
- Ihre Llamenos-Instanz muss bereitgestellt und ueber eine oeffentliche URL erreichbar sein

## 1. SignalWire-Konto erstellen

Registrieren Sie sich auf [signalwire.com/signup](https://signalwire.com/signup). Waehrend der Registrierung waehlen Sie einen **Space-Namen** (z.B. `myhotline`). Ihre Space-URL wird `myhotline.signalwire.com` sein. Notieren Sie diesen Namen -- Sie benoetigen ihn fuer die Konfiguration.

## 2. Telefonnummer kaufen

1. Gehen Sie in Ihrem SignalWire-Dashboard zu **Phone Numbers**
2. Klicken Sie auf **Buy a Phone Number**
3. Suchen Sie eine Nummer mit Sprachfaehigkeit
4. Kaufen Sie die Nummer

## 3. Zugangsdaten abrufen

1. Gehen Sie zu **API** im SignalWire-Dashboard
2. Finden Sie Ihre **Project ID** (diese dient als Account SID)
3. Erstellen Sie einen neuen **API Token**, falls Sie noch keinen haben -- dieser dient als Auth Token

## 4. Webhooks konfigurieren

1. Gehen Sie zu **Phone Numbers** im Dashboard
2. Klicken Sie auf Ihre Hotline-Nummer
3. Unter **Voice Settings** setzen Sie:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Call status callback**: `https://your-worker-url.com/telephony/status` (POST)

## 5. In Llamenos konfigurieren

1. Melden Sie sich als Administrator an
2. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
3. Waehlen Sie **SignalWire** aus dem Anbieter-Dropdown
4. Geben Sie ein:
   - **Account SID**: Ihre Project ID aus Schritt 3
   - **Auth Token**: Ihr API Token aus Schritt 3
   - **SignalWire Space**: Ihr Space-Name (nur der Name, nicht die vollstaendige URL -- z.B. `myhotline`)
   - **Phone Number**: die von Ihnen gekaufte Nummer (E.164-Format)
5. Klicken Sie auf **Speichern**

## 6. Einrichtung testen

Rufen Sie Ihre Hotline-Nummer an. Sie sollten das Sprachauswahlmenue gefolgt vom Anrufablauf hoeren.

## WebRTC-Einrichtung (optional)

SignalWire WebRTC verwendet das gleiche API-Schluessel-Muster wie Twilio:

1. Erstellen Sie in Ihrem SignalWire-Dashboard einen **API-Schluessel** unter **API** > **Tokens**
2. Erstellen Sie eine **LaML-Anwendung**:
   - Gehen Sie zu **LaML** > **LaML Applications**
   - Setzen Sie die Voice URL auf `https://your-worker-url.com/telephony/webrtc-incoming`
   - Notieren Sie die Application SID
3. Gehen Sie in Llamenos zu **Einstellungen** > **Telefonieanbieter**
4. Aktivieren Sie **WebRTC-Anrufe**
5. Geben Sie API Key SID, API Key Secret und Application SID ein
6. Klicken Sie auf **Speichern**

## Unterschiede zu Twilio

- **LaML vs TwiML**: SignalWire verwendet LaML, das funktional mit TwiML identisch ist. Llamenos handhabt dies automatisch.
- **Space-URL**: API-Aufrufe gehen an `{space}.signalwire.com` statt an `api.twilio.com`. Der Adapter handhabt dies ueber den von Ihnen angegebenen Space-Namen.
- **Preise**: SignalWire ist generell 30-40% guenstiger als Twilio fuer Sprachanrufe.
- **Funktionsparitaet**: Alle Llamenos-Funktionen (Aufzeichnung, Transkription, CAPTCHA, Voicemail) funktionieren identisch mit SignalWire.

## Fehlerbehebung

- **"Space not found"-Fehler**: Ueberpruefen Sie den Space-Namen (nur die Subdomain, nicht die vollstaendige URL).
- **Webhook-Fehler**: Stellen Sie sicher, dass Ihre Worker-URL oeffentlich erreichbar ist und HTTPS verwendet.
- **API-Token-Probleme**: SignalWire-Tokens koennen ablaufen. Erstellen Sie ein neues Token, wenn Sie Authentifizierungsfehler erhalten.
