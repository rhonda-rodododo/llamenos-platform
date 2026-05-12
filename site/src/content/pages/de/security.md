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
| Signal | Signal-Netzwerk ist E2EE; die Bridge verschluesselt bei Eingang neu | **Verschluesselt** | Bevorzugte Route wenn verfuegbar |

**Signal-priorisierte Zustellung**: Wenn ein Empfaenger Signal hat, werden Nachrichten automatisch ueber Signal geroutet — Ihr Telefonieanbieter sieht den Inhalt nie. Fuer SMS wird standardmaessig nur eine generische "Sie haben eine neue Nachricht"-Benachrichtigung gesendet (ohne Nachrichteninhalt), sodass die Protokolle Ihres Anbieters keinen sensiblen Inhalt enthalten.

**Nachrichten werden in dem Moment verschluesselt, in dem sie auf Ihrem Server ankommen.** Der Server speichert nur Chiffretext. Ihr Telefonie- oder Messaging-Anbieter kann die Originalnachricht noch haben — das ist eine Einschraenkung dieser Plattformen, nicht etwas, das wir aendern koennen.

**Vorladung an den Messaging-Anbieter**: SMS-Anbieter haben den vollstaendigen Nachrichteninhalt nur wenn Sie den Vollinhalts-SMS-Modus explizit aktivieren. Im Standard-Nur-Benachrichtigungsmodus enthalten SMS-Nachrichtenkoerper keinen Nachrichteninhalt. Meta hat WhatsApp-Inhalte. Signal-Nachrichten sind E2EE bis zur Bridge, aber die Bridge (auf Ihrem Server) entschluesselt vor der Neuverschluesselung zur Speicherung. In allen Faellen hat **Ihr Server nur Chiffretext** — der Hosting-Anbieter kann den Nachrichteninhalt nicht lesen.

### Notizen, Transkripte und Berichte

Alle von Freiwilligen verfassten Inhalte sind Ende-zu-Ende-verschluesselt:

- Jede Notiz verwendet einen **einzigartigen Zufallsschluessel** (Forward Secrecy — die Kompromittierung einer Notiz kompromittiert nicht andere)
- Schluessel werden separat fuer den Freiwilligen und jeden Administrator umhuellt
- Der Server speichert nur Chiffretext
- Entschluesselung erfolgt auf Ihrem Geraet, in einer sicheren Schicht, die Schluessel nie der Benutzeroberflaeche aussetzt
- **Benutzerdefinierte Felder, Berichtsinhalte und Dateianhang sind alle einzeln verschluesselt**

**Geraetebeschlagnahmung**: Ohne Ihre PIN **und** Zugang zu Ihrem Identitaetsanbieter-Konto erhalten Angreifer einen durch Argon2id geschuetzten verschluesselten Blob — eine speicherintensive Schluesselableitungsfunktion, die Brute-Force-Angriffe mit spezialisierter Hardware (GPUs, ASICs) um Groessenordnungen teurer macht als herkoemmliche Ansaetze. Wenn Sie auch einen Hardware-Sicherheitsschluessel verwenden, schuetzen **drei unabhaengige Faktoren** Ihre Daten.

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
| Argon2id-Schluesselschutz | Ihre Geraeteschluessel sind durch eine speicherintensive Funktion geschuetzt, die Brute-Force-Angriffe mit GPUs und spezialisierter Hardware widersteht |
| Signal-priorisierte Nachrichtenweiterleitung | Nachrichten werden automatisch ueber Signal geleitet wenn verfuegbar — Inhalte bleiben aus SMS-Anbieter-Protokollen |
| SMS-Nur-Benachrichtigungsmodus | SMS-Empfaenger sehen nur "Sie haben eine neue Nachricht" — kein sensibler Inhalt in Anbieter-Protokollen |
| Verkehrsanalyse-Resistenz | Echtzeit-Ereignisgroessen werden aufgefuellt, damit Beobachter kurze nicht von langen Nachrichten unterscheiden koennen |
| Keine Klartext-Telefonnummern in der Datenbank | Anrufernummern werden als irreversible Hashes gespeichert — Ihre Datenbank enthaelt nie die tatsaechliche Telefonnummer |
| Hub-spezifische Verschluesselung mit Vorwaertsgeheimnis | Echtzeit-Ereignisse jedes Hubs werden mit Schluesseln verschluesselt die alle 24 Stunden rotieren — alte Schluessel koennen neue Ereignisse nicht entschluesseln |
| Kryptographie in Rust auf allen Plattformen | Desktop, iOS und Android nutzen dieselbe gepruefte Rust-Kryptographiebibliothek — Schluessel gelangen nie in JavaScript-, Swift- oder Kotlin-Code |
| Eingeschraenkter Relay-Zugang | Ihr WebSocket-Relay akzeptiert nur Ereignisse von Ihrem Server — kein Dritter kann gefaelschte Benachrichtigungen einschleusen |
| Verschluesselte Nachrichtenspeicherung | SMS-, WhatsApp- und Signal-Nachrichten werden als Chiffretext auf Ihrem Server gespeichert |
| Geraeteinterne Transkription | Audio verlaesst nie Ihren Browser — wird vollstaendig auf Ihrem Geraet verarbeitet |
| Mehrfaktor-Schluesselschutz | Ihre Verschluesselungsschluessel sind durch Ihre PIN, Ihren Identitaetsanbieter und optional einen Hardware-Sicherheitsschluessel geschuetzt |
| Hardware-Sicherheitsschluessel | Physische Schluessel fuegen einen dritten Faktor hinzu, der nicht aus der Ferne kompromittiert werden kann |
| Reproduzierbare Builds | Vergleich von bereitgestelltem Code mit oeffentlichem Quellcode |
| Verschluesseltes Kontaktverzeichnis | Kontakteintraege, Beziehungen und Notizen sind Ende-zu-Ende-verschluesselt |

## Noch geplant

| Funktion | Datenschutzvorteil | Status |
|----------|-------------------|--------|
| Native call-receiving apps | No personal phone numbers exposed | In development |
| Certificate pinning for relay and API | Prevents MITM on real-time connections | Scaffolding complete; pins pending first deployment |
| SFrame voice encryption | Per-frame encryption for call audio | Key derivation complete; per-frame encryption planned |

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

- [Protokollspezifikation](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/llamenos-protocol.md)
- [Bedrohungsmodell](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Datenklassifizierung](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Security Gaps and Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Sicherheitsaudits](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API-Dokumentation](/api/docs)

Llamenos ist Open Source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
