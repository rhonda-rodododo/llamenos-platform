---
title: "Einrichtung: Vonage"
description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Vonage als Telefonieanbieter.
---

Vonage (ehemals Nexmo) bietet starke internationale Abdeckung und wettbewerbsfaehige Preise. Es verwendet ein anderes API-Modell als Twilio -- Vonage-Anwendungen buendeln Ihre Nummer, Webhooks und Zugangsdaten.

## Voraussetzungen

- Ein [Vonage-Konto](https://dashboard.nexmo.com/sign-up) (kostenloses Guthaben verfuegbar)
- Ihre Llamenos-Instanz muss bereitgestellt und ueber eine oeffentliche URL erreichbar sein

## 1. Vonage-Konto erstellen

Registrieren Sie sich im [Vonage-API-Dashboard](https://dashboard.nexmo.com/sign-up). Verifizieren Sie Ihr Konto und notieren Sie Ihren **API Key** und **API Secret** von der Dashboard-Startseite.

## 2. Telefonnummer kaufen

1. Gehen Sie zu **Numbers** > **Buy numbers** im Vonage-Dashboard
2. Waehlen Sie Ihr Land und suchen Sie eine Nummer mit **Voice**-Faehigkeit
3. Kaufen Sie die Nummer

## 3. Vonage-Anwendung erstellen

Vonage buendelt die Konfiguration in "Anwendungen":

1. Gehen Sie zu **Applications** > **Create a new application**
2. Geben Sie einen Namen ein (z.B. "Llamenos Hotline")
3. Unter **Voice** aktivieren Sie es und setzen:
   - **Answer URL**: `https://your-worker-url.com/telephony/incoming` (POST)
   - **Event URL**: `https://your-worker-url.com/telephony/status` (POST)
4. Klicken Sie auf **Generate new application**
5. Speichern Sie die **Application ID**, die auf der Bestaetigungsseite angezeigt wird
6. Laden Sie die **Private-Key**-Datei herunter -- Sie benoetigen deren Inhalt fuer die Konfiguration

## 4. Telefonnummer verknuepfen

1. Gehen Sie zu **Numbers** > **Your numbers**
2. Klicken Sie auf das Zahnrad-Symbol neben Ihrer Hotline-Nummer
3. Unter **Voice** waehlen Sie die Anwendung, die Sie in Schritt 3 erstellt haben
4. Klicken Sie auf **Save**

## 5. In Llamenos konfigurieren

1. Melden Sie sich als Administrator an
2. Gehen Sie zu **Einstellungen** > **Telefonieanbieter**
3. Waehlen Sie **Vonage** aus dem Anbieter-Dropdown
4. Geben Sie ein:
   - **API Key**: von der Vonage-Dashboard-Startseite
   - **API Secret**: von der Vonage-Dashboard-Startseite
   - **Application ID**: aus Schritt 3
   - **Phone Number**: die von Ihnen gekaufte Nummer (E.164-Format)
5. Klicken Sie auf **Speichern**

## 6. Einrichtung testen

Rufen Sie Ihre Hotline-Nummer an. Sie sollten das Sprachauswahlmenue hoeren. Ueberpruefen Sie, ob Anrufe an die Freiwilligen im Dienst weitergeleitet werden.

## WebRTC-Einrichtung (optional)

Vonage WebRTC verwendet die bereits erstellten Anwendungszugangsdaten:

1. Gehen Sie in Llamenos zu **Einstellungen** > **Telefonieanbieter**
2. Aktivieren Sie **WebRTC-Anrufe**
3. Geben Sie den Inhalt des **Private Key** ein (der vollstaendige PEM-Text aus der heruntergeladenen Datei)
4. Klicken Sie auf **Speichern**

Die Application ID ist bereits konfiguriert. Vonage generiert RS256-JWTs mit dem privaten Schluessel fuer die Browser-Authentifizierung.

## Vonage-spezifische Hinweise

- **NCCO vs TwiML**: Vonage verwendet NCCO (Nexmo Call Control Objects) im JSON-Format statt XML-Markup. Der Llamenos-Adapter generiert das korrekte Format automatisch.
- **Answer-URL-Format**: Vonage erwartet, dass die Answer-URL JSON (NCCO) zurueckgibt, kein XML. Dies wird vom Adapter gehandhabt.
- **Event-URL**: Vonage sendet Anrufereignisse (Klingeln, Angenommen, Beendet) als JSON-POST-Anfragen an die Event-URL.
- **Sicherheit des privaten Schluessels**: Der private Schluessel wird verschluesselt gespeichert. Er verlaesst niemals den Server -- er wird nur zur Generierung kurzlebiger JWT-Tokens verwendet.

## Fehlerbehebung

- **"Application not found"**: Ueberpruefen Sie, ob die Application ID genau uebereinstimmt. Sie finden sie unter **Applications** im Vonage-Dashboard.
- **Keine eingehenden Anrufe**: Stellen Sie sicher, dass die Telefonnummer mit der richtigen Anwendung verknuepft ist (Schritt 4).
- **Private-Key-Fehler**: Fuegen Sie den vollstaendigen PEM-Inhalt einschliesslich der Zeilen `-----BEGIN PRIVATE KEY-----` und `-----END PRIVATE KEY-----` ein.
- **Internationales Nummernformat**: Vonage erfordert das E.164-Format. Fuegen Sie das `+` und die Laendervorwahl hinzu.
