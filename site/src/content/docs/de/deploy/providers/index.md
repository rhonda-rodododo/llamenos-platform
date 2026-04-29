---
title: Telefonieanbieter
description: Vergleichen Sie die unterstuetzten Telefonieanbieter und waehlen Sie den besten fuer Ihre Hotline.
---

Llamenos unterstuetzt mehrere Telefonieanbieter ueber seine **TelephonyAdapter**-Schnittstelle. Sie koennen den Anbieter jederzeit ueber die Admin-Einstellungen wechseln, ohne Anwendungscode zu aendern.

## Unterstuetzte Anbieter

| Anbieter | Typ | Preismodell | WebRTC-Unterstuetzung | Einrichtungsschwierigkeit | Ideal fuer |
|---|---|---|---|---|---|
| **Twilio** | Cloud | Pro Minute | Ja | Einfach | Schneller Einstieg |
| **SignalWire** | Cloud | Pro Minute (guenstiger) | Ja | Einfach | Kostenbewusste Organisationen |
| **Vonage** | Cloud | Pro Minute | Ja | Mittel | Internationale Abdeckung |
| **Plivo** | Cloud | Pro Minute | Ja | Mittel | Guenstige Cloud-Option |
| **Asterisk** | Selbst gehostet | Nur SIP-Trunk-Kosten | Ja (SIP.js) | Schwer | Maximale Privatsphaere, Deployment im grossen Massstab |

## Preisvergleich

Ungefaehre Kosten pro Minute fuer Sprachanrufe in den USA (Preise variieren nach Region und Volumen):

| Anbieter | Eingehend | Ausgehend | Telefonnummer | Gratisangebot |
|---|---|---|---|---|
| Twilio | $0.0085 | $0.014 | $1.15/Monat | Testguthaben |
| SignalWire | $0.005 | $0.009 | $1.00/Monat | Testguthaben |
| Vonage | $0.0049 | $0.0139 | $1.00/Monat | Kostenloses Guthaben |
| Plivo | $0.0055 | $0.010 | $0.80/Monat | Testguthaben |
| Asterisk | SIP-Trunk-Tarif | SIP-Trunk-Tarif | Vom SIP-Anbieter | N/A |

Alle Cloud-Anbieter rechnen pro Minute mit sekundengenauer Abrechnung ab. Die Kosten fuer Asterisk haengen von Ihrem SIP-Trunk-Anbieter und dem Server-Hosting ab.

## Funktionsmatrix

| Funktion | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Anrufaufzeichnung | Ja | Ja | Ja | Ja | Ja |
| Live-Transkription | Ja | Ja | Ja | Ja | Ja (ueber Bridge) |
| Sprach-CAPTCHA | Ja | Ja | Ja | Ja | Ja |
| Voicemail | Ja | Ja | Ja | Ja | Ja |
| WebRTC-Browseranrufe | Ja | Ja | Ja | Ja | Ja (SIP.js) |
| Webhook-Validierung | Ja | Ja | Ja | Ja | Benutzerdefiniert (HMAC) |
| Paralleles Klingeln | Ja | Ja | Ja | Ja | Ja |
| Warteschlange / Wartemusik | Ja | Ja | Ja | Ja | Ja |

## Konfiguration

1. Navigieren Sie zu **Einstellungen** in der Admin-Seitenleiste
2. Oeffnen Sie den Abschnitt **Telefonieanbieter**
3. Waehlen Sie Ihren Anbieter aus dem Dropdown-Menue
4. Geben Sie die erforderlichen Zugangsdaten ein (jeder Anbieter hat unterschiedliche Felder)
5. Setzen Sie Ihre Hotline-Telefonnummer im E.164-Format (z.B. `+15551234567`)
6. Klicken Sie auf **Speichern**
7. Konfigurieren Sie Webhooks in der Konsole Ihres Anbieters, damit sie auf Ihre Llamenos-Instanz verweisen

Siehe die einzelnen Einrichtungsanleitungen fuer Schritt-fuer-Schritt-Anweisungen:

- [Einrichtung: Twilio](/docs/deploy/providers/twilio)
- [Einrichtung: SignalWire](/docs/deploy/providers/signalwire)
- [Einrichtung: Vonage](/docs/deploy/providers/vonage)
- [Einrichtung: Plivo](/docs/deploy/providers/plivo)
- [Einrichtung: Asterisk (selbst gehostet)](/docs/deploy/providers/asterisk)
- [WebRTC-Browseranrufe](/docs/deploy/providers/webrtc)
