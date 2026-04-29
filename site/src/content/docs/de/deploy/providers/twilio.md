---
title: "Einrichtung: Twilio"
description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Twilio als Telefonieanbieter.
---

Twilio ist der Standard-Telefonieanbieter fuer Llamenos und am einfachsten einzurichten. Diese Anleitung fuehrt Sie durch die Kontoerstellung, die Einrichtung der Telefonnummer und die Webhook-Konfiguration.

## Voraussetzungen

- Ein [Twilio-Konto](https://www.twilio.com/try-twilio) (die kostenlose Testversion funktioniert fuer Tests)
- Ihre Llamenos-Instanz muss bereitgestellt und ueber eine oeffentliche URL erreichbar sein

## 1. Twilio-Konto erstellen

Registrieren Sie sich auf [twilio.com/try-twilio](https://www.twilio.com/try-twilio). Verifizieren Sie Ihre E-Mail-Adresse und Telefonnummer. Twilio stellt Testguthaben zur Verfuegung.

## 2. Telefonnummer kaufen

1. Gehen Sie zu **Phone Numbers** > **Manage** > **Buy a number** in der Twilio-Konsole
2. Suchen Sie eine Nummer mit **Voice**-Faehigkeit in Ihrer gewuenschten Vorwahl
3. Klicken Sie auf **Buy** und bestaetigen Sie

Notieren Sie diese Nummer -- Sie werden sie in den Llamenos-Admin-Einstellungen eingeben.

## 3. Account SID und Auth Token abrufen

1. Gehen Sie zum [Twilio-Konsolen-Dashboard](https://console.twilio.com)
2. Finden Sie Ihre **Account SID** und Ihren **Auth Token** auf der Hauptseite
3. Klicken Sie auf das Augen-Symbol, um den Auth Token anzuzeigen

## 4. Webhooks konfigurieren

Navigieren Sie in der Twilio-Konsole zur Konfiguration Ihrer Telefonnummer:

1. Gehen Sie zu **Phone Numbers** > **Manage** > **Active Numbers**
2. Klicken Sie auf Ihre Hotline-Nummer
3. Unter **Voice Configuration** setzen Sie:
   - **A call comes in**: Webhook, `https://your-worker-url.com/telephony/incoming`, HTTP POST
   - **Call status changes**: `https://your-worker-url.com/telephony/status`, HTTP POST

Ersetzen Sie `your-worker-url.com` durch Ihre tatsaechliche Cloudflare Worker URL.

## 5. In Llamenos konfigurieren

1. Melden Sie sich als Administrator an
2. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
3. Waehlen Sie **Twilio** aus dem Anbieter-Dropdown
4. Geben Sie ein:
   - **Account SID**: aus Schritt 3
   - **Auth Token**: aus Schritt 3
   - **Phone Number**: die von Ihnen gekaufte Nummer (E.164-Format, z.B. `+15551234567`)
5. Klicken Sie auf **Speichern**

## 6. Einrichtung testen

Rufen Sie Ihre Hotline-Nummer von einem Telefon aus an. Sie sollten das Sprachauswahlmenue hoeren. Wenn Freiwillige im Dienst sind, wird der Anruf durchgestellt.

## WebRTC-Einrichtung (optional)

Um Freiwilligen zu ermoeglichen, Anrufe in ihrem Browser statt auf ihrem Telefon anzunehmen:

### API-Schluessel erstellen

1. Gehen Sie zu **Account** > **API keys & tokens** in der Twilio-Konsole
2. Klicken Sie auf **Create API Key**
3. Waehlen Sie den Schluesseltyp **Standard**
4. Speichern Sie die **SID** und das **Secret** -- das Secret wird nur einmal angezeigt

### TwiML-App erstellen

1. Gehen Sie zu **Voice** > **Manage** > **TwiML Apps**
2. Klicken Sie auf **Create new TwiML App**
3. Setzen Sie die **Voice Request URL** auf `https://your-worker-url.com/telephony/webrtc-incoming`
4. Speichern Sie und notieren Sie die **App SID**

### In Llamenos aktivieren

1. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
2. Aktivieren Sie **WebRTC-Anrufe**
3. Geben Sie ein:
   - **API Key SID**: vom erstellten API-Schluessel
   - **API Key Secret**: vom erstellten API-Schluessel
   - **TwiML App SID**: von der erstellten TwiML-App
4. Klicken Sie auf **Speichern**

Siehe [WebRTC-Browseranrufe](/docs/deploy/providers/webrtc) fuer die Einrichtung der Freiwilligen und Fehlerbehebung.

## Fehlerbehebung

- **Anrufe kommen nicht an**: Ueberpruefen Sie, ob die Webhook-URL korrekt ist und Ihr Worker bereitgestellt wurde. Pruefen Sie die Fehlerprotokolle der Twilio-Konsole.
- **"Invalid webhook"-Fehler**: Stellen Sie sicher, dass die Webhook-URL HTTPS verwendet und gueltiges TwiML zurueckgibt.
- **Einschraenkungen des Testkontos**: Testkonten koennen nur verifizierte Nummern anrufen. Fuehren Sie ein Upgrade auf ein bezahltes Konto fuer den Produktionsbetrieb durch.
- **Webhook-Validierungsfehler**: Stellen Sie sicher, dass der Auth Token in Llamenos mit dem in der Twilio-Konsole uebereinstimmt.
