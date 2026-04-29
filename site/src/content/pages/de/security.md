---
title: Sicherheit und Datenschutz
subtitle: Was geschuetzt ist, was sichtbar ist und was unter Vorladung erlangt werden kann -- organisiert nach den Funktionen, die Sie nutzen.
---

## Wenn Ihr Hosting-Anbieter eine Vorladung erhaelt

| Sie KOENNEN bereitstellen | Sie KOENNEN NICHT bereitstellen |
|---------------------------|-------------------------------|
| Anruf-/Nachrichtenmetadaten (Zeiten, Dauer) | Notizinhalt, Transkripte, Berichtsinhalte |
| Verschluesselte Datenbank-Blobs | Namen der Freiwilligen (Ende-zu-Ende-verschluesselt) |
| Welche Freiwilligen wann aktiv waren | Kontaktverzeichniseintraege (Ende-zu-Ende-verschluesselt) |
| | Nachrichteninhalt (bei Eingang verschluesselt, als Chiffretext gespeichert) |
| | Entschluesselungsschluessel (geschuetzt durch Ihre PIN, Ihr Identitaetsanbieter-Konto und optional Ihren Hardware-Sicherheitsschluessel) |
| | Pro-Notiz-Verschluesselungsschluessel (ephemer — nach Umhuellung zerstoert) |
| | Ihr HMAC-Geheimnis zur Umkehrung von Telefon-Hashes |

**Der Server speichert Daten, die er nicht lesen kann.** Metadaten (wann, wie lange, welche Konten) sind sichtbar. Inhalte (was gesagt wurde, was geschrieben wurde, wer Ihre Kontakte sind) sind es nicht.

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

**Transkription**: Die Transkription erfolgt vollstaendig in Ihrem Browser mit geraeteinterner KI. **Audio verlaesst Ihr Geraet nie.** Nur das verschluesselte Transkript wird gespeichert.

### Textnachrichten

| Kanal | Anbieterzugriff | Serverspeicher | Hinweise |
|-------|-----------------|----------------|----------|
| SMS | Ihr Telefonieanbieter liest alle Nachrichten | **Verschluesselt** | Anbieter behaelt Originalnachrichten |
| WhatsApp | Meta liest alle Nachrichten | **Verschluesselt** | Anbieter behaelt Originalnachrichten |
| Signal | Signal-Netzwerk ist E2EE, aber die Bridge entschluesselt bei Eingang | **Verschluesselt** | Besser als SMS, nicht Zero-Knowledge |

**Nachrichten werden in dem Moment verschluesselt, in dem sie auf Ihrem Server ankommen.** Der Server speichert nur Chiffretext. Ihr Telefonie- oder Messaging-Anbieter kann die Originalnachricht noch haben — das ist eine Einschraenkung dieser Plattformen, nicht etwas, das wir aendern koennen.

**Vorladung an den Messaging-Anbieter**: Der SMS-Anbieter hat den vollstaendigen Nachrichteninhalt. Meta hat WhatsApp-Inhalte. Signal-Nachrichten sind E2EE bis zur Bridge, aber die Bridge (auf Ihrem Server) entschluesselt vor der Neuverschluesselung zur Speicherung. In allen Faellen hat **Ihr Server nur Chiffretext** — der Hosting-Anbieter kann den Nachrichteninhalt nicht lesen.

### Notizen, Transkripte und Berichte

Alle von Freiwilligen verfassten Inhalte sind Ende-zu-Ende-verschluesselt:

- Jede Notiz verwendet einen **einzigartigen Zufallsschluessel** (Forward Secrecy — die Kompromittierung einer Notiz kompromittiert nicht andere)
- Schluessel werden separat fuer den Freiwilligen und jeden Administrator umhuellt
- Der Server speichert nur Chiffretext
- Entschluesselung erfolgt im Browser
- **Benutzerdefinierte Felder, Berichtsinhalte und Dateianhang sind alle einzeln verschluesselt**

**Geraetebeschlagnahmung**: Ohne Ihre PIN **und** Zugang zu Ihrem Identitaetsanbieter-Konto erhalten Angreifer einen verschluesselten Blob, der rechnerisch nicht entschluesselbar ist. Wenn Sie auch einen Hardware-Sicherheitsschluessel verwenden, schuetzen **drei unabhaengige Faktoren** Ihre Daten.

---

## Datenschutz der Freiwilligen-Telefonnummer

Wenn Freiwillige Anrufe auf ihren persoenlichen Telefonen erhalten, sind ihre Nummern gegenueber Ihrem Telefonieanbieter exponiert.

| Szenario | Telefonnummer sichtbar fuer |
|----------|----------------------------|
| PSTN-Anruf zum Telefon des Freiwilligen | Telefonieanbieter, Mobilfunkbetreiber |
| Browser-zu-Browser (WebRTC) | Niemand (Audio bleibt im Browser) |
| Selbst gehosteter Asterisk + SIP-Telefon | Nur Ihr Asterisk-Server |

**Zum Schutz von Freiwilligen-Telefonnummern**: Verwenden Sie browserbasierte Anrufe (WebRTC) oder stellen Sie SIP-Telefone bereit, die mit selbst gehostetem Asterisk verbunden sind.

---

## Kuerzlich ausgeliefert

Diese Verbesserungen sind heute verfuegbar:

| Funktion | Datenschutzvorteil |
|----------|-------------------|
| Verschluesselte Nachrichtenspeicherung | SMS-, WhatsApp- und Signal-Nachrichten werden als Chiffretext auf Ihrem Server gespeichert |
| Geraeteinterne Transkription | Audio verlaesst nie Ihren Browser — wird vollstaendig auf Ihrem Geraet verarbeitet |
| Mehrfaktor-Schluesselschutz | Ihre Verschluesselungsschluessel sind durch Ihre PIN, Ihren Identitaetsanbieter und optional einen Hardware-Sicherheitsschluessel geschuetzt |
| Hardware-Sicherheitsschluessel | Physische Schluessel fuegen einen dritten Faktor hinzu, der nicht aus der Ferne kompromittiert werden kann |
| Reproduzierbare Builds | Vergleich von bereitgestelltem Code mit oeffentlichem Quellcode |
| Verschluesseltes Kontaktverzeichnis | Kontakteintraege, Beziehungen und Notizen sind Ende-zu-Ende-verschluesselt |

## Noch geplant

| Funktion | Datenschutzvorteil |
|----------|-------------------|
| Native Anrufempfangs-Apps | Keine persoenlichen Telefonnummern exponiert |

---

## Zusammenfassungstabelle

| Datentyp | Verschluesselt | Fuer Server sichtbar | Unter Vorladung erhaltbar |
|----------|----------------|---------------------|--------------------------|
| Anrufnotizen | Ja (E2EE) | Nein | Nur Chiffretext |
| Transkripte | Ja (E2EE) | Nein | Nur Chiffretext |
| Berichte | Ja (E2EE) | Nein | Nur Chiffretext |
| Dateianhang | Ja (E2EE) | Nein | Nur Chiffretext |
| Kontakteintraege | Ja (E2EE) | Nein | Nur Chiffretext |
| Freiwilligen-Identitaeten | Ja (E2EE) | Nein | Nur Chiffretext |
| Team-/Rollenmetadaten | Ja (verschluesselt) | Nein | Nur Chiffretext |
| Benutzerdefinierte Felddefinitionen | Ja (verschluesselt) | Nein | Nur Chiffretext |
| SMS-/WhatsApp-/Signal-Inhalte | Ja (auf Ihrem Server) | Nein | Chiffretext von Ihrem Server; Anbieter kann Original haben |
| Anrufmetadaten | Nein | Ja | Ja |
| Anrufer-Telefon-Hashes | HMAC-gehasht | Nur Hash | Hash (nicht umkehrbar ohne Ihr Geheimnis) |

---

## Fuer Sicherheitspruefer

Technische Dokumentation:

- [Protokollspezifikation](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/protocol/llamenos-protocol.md)
- [Bedrohungsmodell](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/THREAT_MODEL.md)
- [Datenklassifizierung](https://github.com/rhonda-rodododo/llamenos/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Sicherheitsaudits](https://github.com/rhonda-rodododo/llamenos/tree/main/docs/security)
- [API-Dokumentation](/api/docs)

Llamenos ist Open Source: [github.com/rhonda-rodododo/llamenos](https://github.com/rhonda-rodododo/llamenos)
