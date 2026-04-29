---
title: "Einrichtung: Plivo"
description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Plivo als Telefonieanbieter.
---

Plivo ist ein kostenguenstiger Cloud-Telefonieanbieter mit einer unkomplizierten API. Er verwendet XML-basierte Anrufsteuerung aehnlich wie TwiML, was die Integration mit Llamenos nahtlos macht.

## Voraussetzungen

- Ein [Plivo-Konto](https://console.plivo.com/accounts/register/) (Testguthaben verfuegbar)
- Ihre Llamenos-Instanz muss bereitgestellt und ueber eine oeffentliche URL erreichbar sein

## 1. Plivo-Konto erstellen

Registrieren Sie sich auf [console.plivo.com](https://console.plivo.com/accounts/register/). Nach der Verifizierung finden Sie Ihre **Auth ID** und Ihren **Auth Token** auf der Dashboard-Startseite.

## 2. Telefonnummer kaufen

1. Gehen Sie zu **Phone Numbers** > **Buy Numbers** in der Plivo-Konsole
2. Waehlen Sie Ihr Land und suchen Sie Nummern mit Sprachfaehigkeit
3. Kaufen Sie eine Nummer

## 3. XML-Anwendung erstellen

Plivo verwendet "XML-Anwendungen" zur Anrufweiterleitung:

1. Gehen Sie zu **Voice** > **XML Applications**
2. Klicken Sie auf **Add New Application**
3. Konfigurieren Sie:
   - **Application Name**: Llamenos Hotline
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Hangup URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Speichern Sie die Anwendung

## 4. Telefonnummer verknuepfen

1. Gehen Sie zu **Phone Numbers** > **Your Numbers**
2. Klicken Sie auf Ihre Hotline-Nummer
3. Unter **Voice** waehlen Sie die XML-Anwendung, die Sie in Schritt 3 erstellt haben
4. Speichern

## 5. In Llamenos konfigurieren

1. Melden Sie sich als Administrator an
2. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
3. Waehlen Sie **Plivo** aus dem Anbieter-Dropdown
4. Geben Sie ein:
   - **Auth ID**: vom Plivo-Konsolen-Dashboard
   - **Auth Token**: vom Plivo-Konsolen-Dashboard
   - **Phone Number**: die von Ihnen gekaufte Nummer (E.164-Format)
5. Klicken Sie auf **Speichern**

## 6. Einrichtung testen

Rufen Sie Ihre Hotline-Nummer an. Sie sollten das Sprachauswahlmenue hoeren und durch den normalen Anrufablauf geleitet werden.

## WebRTC-Einrichtung (optional)

Plivo WebRTC verwendet das Browser-SDK mit Ihren vorhandenen Zugangsdaten:

1. Gehen Sie zu **Voice** > **Endpoints** in der Plivo-Konsole
2. Erstellen Sie einen neuen Endpoint (dieser dient als Browser-Telefonidentitaet)
3. Gehen Sie in Llamenos zu **Einstellungen** > **Telefonieanbieter**
4. Aktivieren Sie **WebRTC-Anrufe**
5. Klicken Sie auf **Speichern**

Der Adapter generiert zeitbegrenzte HMAC-Tokens aus Ihrer Auth ID und Ihrem Auth Token fuer sichere Browser-Authentifizierung.

## Plivo-spezifische Hinweise

- **XML vs TwiML**: Plivo verwendet sein eigenes XML-Format fuer die Anrufsteuerung, das TwiML aehnlich, aber nicht identisch ist. Der Llamenos-Adapter generiert automatisch das korrekte Plivo-XML.
- **Answer URL vs Hangup URL**: Plivo trennt den initialen Anrufhandler (Answer URL) vom Anrufende-Handler (Hangup URL), im Gegensatz zu Twilio, das einen einzelnen Status-Callback verwendet.
- **Rate-Limits**: Plivo hat API-Rate-Limits, die je nach Kontostufe variieren. Fuer Hotlines mit hohem Volumen kontaktieren Sie den Plivo-Support, um die Limits zu erhoehen.

## Fehlerbehebung

- **"Auth ID invalid"**: Die Auth ID ist nicht Ihre E-Mail-Adresse. Finden Sie sie auf der Startseite des Plivo-Konsolen-Dashboards.
- **Anrufe werden nicht weitergeleitet**: Ueberpruefen Sie, ob die Telefonnummer mit der richtigen XML-Anwendung verknuepft ist.
- **Answer-URL-Fehler**: Plivo erwartet gueltige XML-Antworten. Pruefen Sie Ihre Worker-Logs auf Antwortfehler.
- **Einschraenkungen bei ausgehenden Anrufen**: Testkonten haben Einschraenkungen bei ausgehenden Anrufen. Fuehren Sie ein Upgrade fuer den Produktionsbetrieb durch.
