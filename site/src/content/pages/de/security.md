---
title: Sicherheit und Datenschutz
subtitle: Was geschuetzt ist, was sichtbar ist und was unter Vorladung erlangt werden kann -- organisiert nach den Funktionen, die Sie nutzen.
---

## Wenn Ihr Hosting-Anbieter eine Vorladung erhaelt

| Sie KOENNEN bereitstellen | Sie KOENNEN NICHT bereitstellen |
|---------------------------|-------------------------------|
| Anruf-/Nachrichtenmetadaten (Zeiten, Dauer) | Notizinhalt, Transkripte, Berichtsinhalte |
| Verschluesselte Datenbank-Blobs | Entschluesselungsschluessel (auf Ihren Geraeten gespeichert) |
| Welche Freiwilligen wann aktiv waren | Pro-Notiz-Verschluesselungsschluessel (ephemer) |
| SMS/WhatsApp-Nachrichteninhalte | Ihr HMAC-Geheimnis zur Umkehrung von Telefon-Hashes |

**Der Server speichert Daten, die er nicht lesen kann.** Metadaten (wann, wie lange, wer) sind sichtbar. Inhalte (was gesagt wurde, was geschrieben wurde) sind es nicht.

---

## Nach Funktion

Ihre Datenschutzexposition haengt davon ab, welche Kanaele Sie aktivieren:

### Sprachanrufe

| Wenn Sie verwenden... | Dritte koennen zugreifen | Server kann zugreifen | E2EE-Inhalte |
|-----------------------|-------------------------|----------------------|--------------|
| Twilio/SignalWire/Vonage/Plivo | Anrufaudio (live), Aufzeichnungen | Anrufmetadaten | Notizen, Transkripte |
| Selbst gehosteter Asterisk | Nichts (Sie kontrollieren es) | Anrufmetadaten | Notizen, Transkripte |
| Browser-zu-Browser (WebRTC) | Nichts | Anrufmetadaten | Notizen, Transkripte |

**Vorladung an den Telefonieanbieter**: Sie haben Anrufdetailsaetze (Zeiten, Telefonnummern, Dauer). Sie haben KEINE Anrufnotizen oder Transkripte. Aufnahme ist standardmaessig deaktiviert.

**Transkriptionsfenster**: Waehrend der ca. 30 Sekunden Transkription wird Audio von Cloudflare Workers AI verarbeitet. Nach der Transkription wird nur verschluesselter Text gespeichert.

### Textnachrichten

| Kanal | Anbieterzugriff | Serverspeicher | Hinweise |
|-------|-----------------|----------------|----------|
| SMS | Ihr Telefonieanbieter liest alle Nachrichten | Klartext | Inhaerente SMS-Einschraenkung |
| WhatsApp | Meta liest alle Nachrichten | Klartext | WhatsApp Business API-Anforderung |
| Signal | Signal-Netzwerk ist E2EE, aber die signal-cli-Bridge entschluesselt | Klartext | Besser als SMS, nicht Zero-Knowledge |

**Vorladung an den Messaging-Anbieter**: Der SMS-Anbieter hat den vollstaendigen Nachrichteninhalt. Meta hat WhatsApp-Inhalte. Signal-Nachrichten sind E2EE bis zur Bridge, aber die Bridge (auf Ihrem Server) hat Klartext.

**Zukuenftige Verbesserung**: Wir erforschen E2EE-Nachrichtenspeicherung, bei der der Server nur Chiffretext speichert. Siehe [Was geplant ist](#was-geplant-ist).

### Notizen, Transkripte und Berichte

Alle von Freiwilligen verfassten Inhalte sind Ende-zu-Ende-verschluesselt:

- Jede Notiz verwendet einen einzigartigen Zufallsschluessel (Forward Secrecy)
- Schluessel werden separat fuer den Freiwilligen und den Administrator umhuellt
- Der Server speichert nur Chiffretext
- Entschluesselung erfolgt im Browser

**Geraetebeschlagnahmung**: Ohne Ihre PIN erhalten Angreifer einen verschluesselten Blob. Eine 6-stellige PIN mit 600K PBKDF2-Iterationen braucht Stunden fuer Brute-Force auf GPU-Hardware.

---

## Datenschutz der Freiwilligen-Telefonnummer

Wenn Freiwillige Anrufe auf ihren persoenlichen Telefonen erhalten, sind ihre Nummern gegenueber Ihrem Telefonieanbieter exponiert.

| Szenario | Telefonnummer sichtbar fuer |
|----------|----------------------------|
| PSTN-Anruf zum Telefon des Freiwilligen | Telefonieanbieter, Mobilfunkbetreiber |
| Browser-zu-Browser (WebRTC) | Niemand (Audio bleibt im Browser) |
| Selbst gehosteter Asterisk + SIP-Telefon | Nur Ihr Asterisk-Server |

**Zum Schutz von Freiwilligen-Telefonnummern**: Verwenden Sie browserbasierte Anrufe (WebRTC) oder stellen Sie SIP-Telefone bereit, die mit selbst gehostetem Asterisk verbunden sind.

**Zukuenftige Verbesserung**: Native Desktop- und Mobile-Apps zum Empfangen von Anrufen, ohne persoenliche Telefonnummern preiszugeben.

---

## Was geplant ist

Wir arbeiten an Verbesserungen zur Reduzierung von Vertrauensanforderungen:

| Funktion | Status | Datenschutzvorteil |
|----------|--------|-------------------|
| E2EE-Nachrichtenspeicherung | Geplant | SMS/WhatsApp/Signal als Chiffretext gespeichert |
| Client-seitige Transkription | Geplant | Audio verlaesst nie den Browser |
| Native Anrufempfangs-Apps | Geplant | Keine persoenlichen Telefonnummern exponiert |
| Reproduzierbare Builds | Geplant | Vergleich von bereitgestelltem Code mit Quellcode |
| Selbst gehostete Signal-Bridge | Verfuegbar | signal-cli auf eigener Infrastruktur betreiben |

---

## Zusammenfassungstabelle

| Datentyp | Verschluesselt | Fuer Server sichtbar | Unter Vorladung erhaltbar |
|----------|----------------|---------------------|--------------------------|
| Anrufnotizen | Ja (E2EE) | Nein | Nur Chiffretext |
| Transkripte | Ja (E2EE) | Nein | Nur Chiffretext |
| Berichte | Ja (E2EE) | Nein | Nur Chiffretext |
| Dateianbhaenge | Ja (E2EE) | Nein | Nur Chiffretext |
| Anrufmetadaten | Nein | Ja | Ja |
| Freiwilligen-Identitaeten | Im Ruhezustand verschluesselt | Nur Admin | Ja (mit Aufwand) |
| Anrufer-Telefon-Hashes | HMAC-gehasht | Nur Hash | Hash (nicht umkehrbar ohne Ihr Geheimnis) |
| SMS-Inhalte | Nein | Ja | Ja |
| WhatsApp-Inhalte | Nein | Ja | Ja (auch von Meta) |
| Signal-Inhalte | Nein | Ja | Ja (von Ihrem Server) |

---

## Fuer Sicherheitspruefer

Technische Dokumentation:

- [Protokollspezifikation](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Bedrohungsmodell](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Datenklassifizierung](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Sicherheitsaudits](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)

Llamenos ist Open Source: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
