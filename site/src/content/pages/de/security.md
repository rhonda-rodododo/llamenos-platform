---
title: Sicherheit und Datenschutz
subtitle: Was geschuetzt ist, was sichtbar ist und was unter Vorladung erlangt werden kann -- organisiert nach den Funktionen, die Sie nutzen.
---

## Wenn Ihr Hosting-Anbieter eine Vorladung erhalt

| Sie KONNEN bereitstellen | Sie KONNEN NICHT bereitstellen |
|--------------------------|-------------------------------|
| Anruf-/Nachrichten-Metadaten (Zeiten, Dauern) | Notizeninhalt, Transkriptionen, Berichtsinhalte |
| Verschlusselte Datenbankblobs | Ehrenamtliche Namen (Ende-zu-Ende-verschlusselt) |
| Welche Ehrenamtlichen-Konten wann aktiv waren | Kontaktverzeichnis-Eintrage (Ende-zu-Ende-verschlusselt) |
| Massenversand-Lieferdatensatze | Nachrichteninhalt (bei Ankunft verschlusselt, als Chiffretext gespeichert) |
| | Entschlusselungsschlussel (durch Ihre PIN, Ihren Identitatsanbieter und optional Ihren Hardware-Sicherheitsschlussel geschutzt) |
| | Verschlusselungsschlussel pro Notiz (ephemer -- nach Umhullung vernichtet) |
| | Ihr HMAC-Geheimnis zum Umkehren von Telefonnummer-Hashes |
| | Inhalt der Wiederherstellungsfragmente (verschlusselt, Server kann nicht lesen) |

**Der Server speichert Daten, die er nicht lesen kann.** Metadaten (wann, wie lange, welche Konten) sind sichtbar. Inhalte (was gesagt wurde, was geschrieben wurde, wer Ihre Kontakte sind) nicht.

---

## Nach Funktion

Ihre Datenschutzbelastung hangt davon ab, welche Kanale Sie aktivieren:

### Sprachanrufe

| Wenn Sie verwenden... | Dritte konnen zugreifen | Server kann zugreifen | Ende-zu-Ende-verschlusselter Inhalt |
|-----------------------|------------------------|----------------------|-------------------------------------|
| Twilio/SignalWire/Vonage/Plivo | Audioanruf (live), Anrufaufzeichnungen | Anruf-Metadaten | Notizen, Transkriptionen |
| Selbst gehostetes Asterisk | Nichts (Sie kontrollieren es) | Anruf-Metadaten | Notizen, Transkriptionen |
| Browser-zu-Browser (WebRTC) | Nichts | Anruf-Metadaten | Notizen, Transkriptionen |

**Vorladung des Telefonieanbieters**: Sie haben Anrufdetaildatensatze (Zeiten, Nummern, Dauern). Sie haben KEINE Anrufnotizen oder Transkriptionen. Aufzeichnung ist standardmaßig deaktiviert.

**Transkription**: Die Transkription erfolgt vollstandig in Ihrem Browser mittels lokaler KI. **Audio verlasst Ihr Gerat niemals.**

### Textnachrichten (eins zu eins)

| Kanal | Anbieterzugriff | Server-Speicherung | Hinweise |
|-------|----------------|-------------------|---------|
| SMS | Ihr Telefondienstanbieter liest alle Nachrichten | **Verschlusselt** | Anbieter behallt Originalnachrichten |
| WhatsApp | Meta liest alle Nachrichten | **Verschlusselt** | Anbieter behallt Originalnachrichten |
| Signal | Signal-Netzwerk ist E2EE; Bridge re-verschlusselt bei Ankunft | **Verschlusselt** | Bevorzugte Route wenn verfugbar |

**Signal-Priorisierungs-Routing**: Wenn ein Empfanger Signal hat, werden Nachrichten automatisch uber Signal geleitet. Fur SMS wird standardmaßig nur eine generische Benachrichtigung gesendet (kein Nachrichtentext).

**Nachrichten werden verschlusselt, sobald sie Ihren Server erreichen.** Der Server speichert nur Chiffretext.

### Massen- und Broadcast-Nachrichten

Administratoren konnen Massenachrichten an Abonnenten uber SMS, WhatsApp, Signal oder RCS senden.

**Wichtig: ausgehende Massenachrichten sind NICHT Ende-zu-Ende-verschlusselt auf dem Server.** Um eine Nachricht an SMS- oder WhatsApp-Abonnenten zu liefern, muss der Server den Klartext-Inhalt momentan verarbeiten und an den Nachrichtenanbieter weiterleiten.

| Kanal | Server-Zugriff beim Senden | Anbieterzugriff | Nach Lieferung |
|-------|---------------------------|----------------|---------------|
| SMS-Massen | Klartext (momentan, fur Lieferung) | Vollstandiger Inhalt | Anbieter behallt |
| WhatsApp-Massen | Klartext (momentan, fur Lieferung) | Vollstandiger Inhalt (Meta) | Anbieter behallt |
| Signal-Massen | Klartext (momentan, fur Lieferung) | E2EE uber Signal-Netzwerk | Nicht vom Anbieter behalten |
| RCS-Massen | Klartext (momentan, fur Lieferung) | Google kann Inhalt sehen | Anbieter behallt |

**Was das bedeutet**: Massenachrichten sollten keine sensiblen Anruferinformationen enthalten. Verwenden Sie sie fur Ankundigungen und Hinweise -- nicht fur Falldetails.

Abonnenten-Telefonnummern werden als gehashte Bezeichner gespeichert -- Ihre Datenbank enthalt niemals eine Abonnentenliste im Klartext.

### Notizen, Transkriptionen und Berichte

Alle von Ehrenamtlichen verfassten Inhalte sind Ende-zu-Ende-verschlusselt:

- Jede Notiz verwendet einen **einzigartigen Zufallsschlussel** (Vorwartssicherheit -- das Kompromittieren einer Notiz kompromittiert keine anderen)
- Schlussel werden separat fur den Ehrenamtlichen und jeden Administrator umhullt
- Der Server speichert nur Chiffretext
- Entschlusselung erfolgt auf Ihrem Gerat, in einer sicheren Schicht die niemals Schlussel zur Benutzeroberflache freigibt
- **Benutzerdefinierte Felder, Berichtsinhalte und Dateianhange sind alle einzeln verschlusselt**

**Fallakten und Entitats-Daten**: Folgen demselben Verschlusselungsmodell -- jedes Element mit einem einzigartigen Schlussel verschlusselt.

**Geratebeschlagnahme**: Ohne Ihre PIN **und** Zugang zu Ihrem Identitatsanbieter-Konto erhalten Angreifer einen durch Argon2id geschutzten verschlusselten Blob. Mit einem Hardware-Sicherheitsschlussel schutzen **drei unabhangige Faktoren** Ihre Daten.

---

## Ihre Gerate

### Gerate anzeigen und widerrufen

Die App fuhrt eine Liste jedes Gerats, mit dem Sie sich angemeldet haben. Sie konnen diese Liste ansehen und jedes Gerat widerrufen, das Sie nicht erkennen.

**Wenn Sie ein Gerat widerrufen:**
- Dieses Gerat wird sofort vom Zugriff auf Ihr Konto gesperrt
- Ihre Verschlusselungsschlussel werden rotiert, sodass das widerrufene Gerat zukunftige Inhalte nicht entschlusseln kann
- Der Widerruf wird in der Sicherheitsgeschichte Ihres Kontos festgehalten

### SAS-Emoji-Verifizierung

Fur Organisationen mit hohen Sicherheitsanforderungen konnen Administratoren die Identitat eines Gerats mittels SAS-Verifizierung (Short Authentication String) prufen -- angezeigt als Folge von 7 Emojis.

**Wie es funktioniert:**
1. Der Administrator und der Geratebesitzer vergleichen ihre Emoji-Sequenzen (personlich, telefonisch oder uber einen vertrauenswurdigen Kanal)
2. Wenn die Emojis ubereinstimmen, wird das Gerat als dem registrierten Eigentumer gehorend bestatigt
3. Die Verifizierung wird festgehalten -- Administratoren konnen sehen, welche Gerate verifiziert wurden

Dies schutzt gegen einen Angreifer, der ein gefalsches Gerat unter dem Konto einer anderen Person registriert hat.

---

## Kontol oschung

### Selbst-initiierte Loschung

Sie konnen die dauerhafte Loschung Ihres Kontos und aller damit verbundenen Daten beantragen. Standardmaßig gibt es eine Verzogerung (vom Hub-Administrator konfiguriert, typischerweise 72 Stunden) bevor die Loschung abgeschlossen wird -- das gibt Ihnen Zeit zum Abbrechen, falls die Anfrage unter Zwang gestellt wurde.

**Was geloscht wird:**
- Ihre Gerateschlussel (alle verschlusselten Inhalte werden dauerhaft unlesbar, auch aus Backups)
- Ihr Kontodatensatz, Rollenzuweisungen und Diensthistorie
- Ihre Push-Benachrichtigungs-Tokens

**Was mit Ihren verschlusselten Inhalten passiert**: Notizen und Berichte, die Sie verfasst haben, werden fur verbleibende autorisierte Leser neu verschlusselt. Ihre Kopie des Entschlusselungsschlussels wird vernichtet.

**Audit-Protokolle**: Ihre Audit-Protokoll-Eintrage werden "krypto-vernichtet" -- der benutzerspezifische Verschlusselungsschlussel wird vernichtet, was Ihre Eintrage unlesbar macht. Die Hash-Kette bleibt intakt.

### Notfall-Loschung

Wenn Sie glauben, Ihr Konto steht unter unmittelbarer Bedrohung, konnen Sie eine Notfall-Loschung mit einem Mitgenehmiger beantragen -- reduziert die Verzogerung auf mindestens 4 Stunden. Das 4-Stunden-Minimum existiert zum Schutz vor erzwungener Loschung.

---

## Wiederherstellungsgruppen

Wenn Sie alle Ihre Gerate verlieren, wurden Sie normalerweise den Zugang zu all Ihren verschlusselten Daten verlieren. Wiederherstellungsgruppen losen dieses Problem.

### Wie Wiederherstellung funktioniert

Sie designieren eine Gruppe vertrauenswurdiger Kontakte (typischerweise 3-5 Personen) als Ihre Wiederherstellungsgruppe. Jeder Kontakt halt ein "Fragment" eines Wiederherstellungsschlussels.

**Um Ihr Konto wiederherzustellen:**
1. Sie registrieren ein neues Gerat und initiieren eine Wiederherstellungsanfrage
2. Ihre Wiederherstellungskontakte erhalten eine Benachrichtigung
3. Nach einer konfigurierbaren Verzogerung genehmigt eine Mindestanzahl von Kontakten (z.B. 2 von 3) die Anfrage
4. Jeder genehmigende Kontakt sendet sein Fragment, direkt zu Ihrem neuen Gerat verschlusselt
5. Ihr neues Gerat kombiniert die Fragmente, um den Wiederherstellungsschlussel zu rekonstruieren

**Was der Server sehen kann**: Der Server leitet verschlusselte Fragmente zwischen Geraten weiter. Er kann die Fragmente nicht lesen und den Wiederherstellungsschlussel nicht allein rekonstruieren.

### Sicherheitseigenschaften von Wiederherstellungsgruppen

- **Schwellensicherheit**: Fragmente unterhalb des Schwellenwerts offenbaren nichts uber das Geheimnis
- **Keine Serverbeteiligung am Geheimnis**: Fragmente werden direkt zum offentlichen Schlussel Ihres neuen Gerats verschlusselt
- **Hub-Umfang**: Die Wiederherstellung stellt Ihren Zugang zu einem bestimmten Hub wieder her
- **Verzogerung mit Abbruchmoglichkeit**: Sie konnen eine Wiederherstellungsanfrage wahrend der Verzogerungszeit abbrechen
- **Signal-Verifizierung**: Wiederherstellungsanfragen werden uber Signal verifiziert

---

## Datenschutz der Telefonnummern von Ehrenamtlichen

Wenn Ehrenamtliche Anrufe auf ihren personlichen Telefonen empfangen, werden ihre Nummern Ihrem Telefondienstanbieter offengelegt.

| Szenario | Telefonnummer sichtbar fur |
|----------|--------------------------|
| PSTN-Anruf zum Telefon des Ehrenamtlichen | Telefondienstanbieter, Mobilfunkanbieter |
| Browser-zu-Browser (WebRTC) | Niemand (Audio bleibt im Browser) |
| Selbst gehostetes Asterisk + SIP-Telefon | Nur Ihr Asterisk-Server |

**Zum Schutz von Ehrenamtlichen-Telefonnummern**: Verwenden Sie browserbasierte Anrufe (WebRTC) oder stellen Sie SIP-Telefone bereit, die mit selbst gehostetem Asterisk verbunden sind.

---

## Kurzlich ausgeliefert

Diese Verbesserungen sind heute verfugbar:

| Funktion | Datenschutz-Vorteil |
|---------|---------------------|
| Gerateverwaltung | Jedes angemeldete Gerat anzeigen und widerrufen; Widerruf lost Schlussselrotation aus |
| SAS-Emoji-Gerateverifizierung | Administratoren konnen Gerate personlich mit einem kryptografischen Fingerabdruck aus 7 Emojis verifizieren |
| Kontoloschung mit Verzogerung | Loschung beantragen; konfigurierbare Verzogerung ermoglicht Abbruch bei Zwang |
| Notfall-Loschung | Schnelle co-genehmigte Loschung mit Minimum von 4 Stunden |
| Krypto-Vernichtung bei Loschung | Verschlusselungsschlussel werden zuerst vernichtet, Inhalte dauerhaft unlesbar |
| Wiederherstellungsgruppen (Shamir) | Vertrauenswurdige Kontakte designieren, die bei Verlust aller Gerate helfen konnen |
| Massennachrichten mit ehrlicher Offenlegung | Administratoren konnen Massennachrichten senden; Server verarbeitet Klartext momentan fur Lieferung |
| Abonnenten-Hashing | Abonnenten-Telefonnummern als gehashte Bezeichner gespeichert |
| Argon2id-Schlussselschutz | Gerateschlussel durch speicherresistente Funktion geschutzt |
| Signal-Priorisierungs-Routing | Nachrichten automatisch uber Signal geleitet wenn verfugbar |
| SMS-Nur-Benachrichtigungs-Modus | SMS-Empfanger sehen nur "Sie haben eine neue Nachricht" |
| Verkehrsanalyse-Resistenz | Ereignisgroßen werden aufgefullt um Unterscheidung zu erschweren |
| Keine Klartextnummern in Datenbank | Anrufernummern als irreversible Hashes gespeichert |
| Hub-Verschlusselung mit Vorwartssicherheit | Schlussel alle 24 Stunden rotiert |
| Kryptografie in Rust auf allen Plattformen | Gleiche geprufte Rust-Kryptografiebibliothek auf Desktop, iOS und Android |
| Eingeschrankter Relay-Zugriff | WebSocket-Relay akzeptiert Ereignisse nur von Ihrem Server |
| Verschlusselte Nachrichtenspeicherung | SMS, WhatsApp und Signal als Chiffretext gespeichert |
| Gerattranskription | Audio verlasst Ihr Gerat niemals |
| Multifaktor-Schlussselschutz | PIN, Identitatsanbieter und optional Hardware-Sicherheitsschlussel |
| Hardware-Sicherheitsschlussel | Dritter Faktor, der nicht fernkompromittiert werden kann |
| Reproduzierbare Builds | Verifizieren Sie, dass der bereitgestellte Code mit dem offentlichen Quellcode ubereinstimmt |
| Verschlusseltes Kontaktverzeichnis | Kontaktdatensatze, Beziehungen und Notizen Ende-zu-Ende-verschlusselt |

## Noch geplant

| Funktion | Datenschutz-Vorteil | Status |
|---------|---------------------|--------|
| Native Anruf-Empfangs-Apps | Keine personlichen Telefonnummern exponiert | In Entwicklung |
| Zertifikat-Pinning (mobil) | Schutz gegen TLS-Abfangung durch rogue CA | Struktur vollstandig; Pins ausstehend |
| SFrame-Sprachmediaverschlusselung | Ende-zu-Ende-verschlusselte Sprachanrufe | Schlusselableitung vollstandig; Frame-Verschlusselung geplant |

---

## Zusammenfassungstabelle

| Datentyp | Verschlusselt | Sichtbar fur Server | Unter Vorladung erhaltlich |
|----------|--------------|--------------------|-----------------------------|
| Anrufnotizen | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Transkriptionen | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Berichte | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Fallakten / Entitats-Daten | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Dateianhange | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Kontaktdatensatze | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Ehrenamtliche Identitaten | Ja (Ende-zu-Ende) | Nein | Nur Chiffretext |
| Team-/Rollen-Metadaten | Ja (verschlusselt) | Nein | Nur Chiffretext |
| Benutzerdefinierte Felddefinitionen | Ja (verschlusselt) | Nein | Nur Chiffretext |
| Eingehender SMS/WhatsApp/Signal-Inhalt | Ja (auf Ihrem Server) | Nein | Chiffretext vom Server; Anbieter hat moglicherweise Original |
| Ausgehende Massennachrichten | **Nein -- Klartext wahrend Lieferung** | **Ja, momentan** | Ja (Klartext zum Sendezeitpunkt) |
| Wiederherstellungsfragmente | Ja (Ende-zu-Ende zum Gerat) | Nein | Nur Chiffretext |
| Echtzeit-Ereignisse | Ja (pro Hub, rotierende Schlussel) | Nein | Nur Chiffretext |
| Anruf-Metadaten | Nein | Ja | Ja |
| Massenlieferungs-Datensatze | Nein | Ja | Ja |
| Anrufer-Telefonnummer-Hashes | HMAC-Hash | Nur Hash | Hash (ohne Ihr Geheimnis nicht umkehrbar) |
| Abonnenten-Telefonnummer-Hashes | HMAC-Hash | Nur Hash | Hash (ohne Ihr Geheimnis nicht umkehrbar) |
| User-Agent-Strings | SHA-256-Hash | Nur Hash | Hash (nicht umkehrbar) |

---

## Fur Sicherheitsprufer

Technische Dokumentation:

- [Protokollspezifikation](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/protocol/PROTOCOL.md)
- [Bedrohungsmodell](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/THREAT_MODEL.md)
- [Datenklassifizierung](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/DATA_CLASSIFICATION.md)
- [Sicherheitslucken und Roadmap](https://github.com/rhonda-rodododo/llamenos-platform/blob/main/docs/security/SECURITY_GAPS_AND_ROADMAP.md)
- [Sicherheitspruberichte](https://github.com/rhonda-rodododo/llamenos-platform/tree/main/docs/security)
- [API-Dokumentation](/api/docs)

Llamenos ist Open Source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
