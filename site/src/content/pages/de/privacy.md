---
title: Datenschutzrichtlinie
subtitle: Was Llamenos sammelt, wie es geschutzt ist und welche Rechte Sie als Nutzer haben.
---

**Datum des Inkrafttretens: 18. Mai 2026**

Llamenos ist Open-Source-Software fur die Krisenreaktion. Diese Richtlinie gilt fur die Llamenos iOS-App und die Backend-Dienste, die von Ihrem Hub-Administrator betrieben werden. Sie gilt nicht fur Hubs, die von Dritten betrieben werden.

---

## Was Wir Sammeln

### Konto- und Identitatsdaten

- **Offentlicher Schlussel des Gerats** — ein kryptografischer Bezeichner, der fur Ihr Gerat einzigartig ist. Nie ausserhalb Ihres Hubs geteilt.
- **Push-Benachrichtigungs-Token** — nur verwendet, um Anrufbenachrichtigungen zu liefern. Wird periodisch erneuert.
- **Rolle und Hub-Mitgliedschaft** — welchen Hubs Sie angehoren und Ihre zugewiesene Rolle (Ehrenamtlicher, Administrator).
- **Geratemetadaten** — Geratmodell, Betriebssystemversion und App-Version.

### Aktivitatsdaten

- **Anrufmetadaten** — Zeitstempel, Anrufdauern, welcher Ehrenamtlicher antwortete. Nicht der Inhalt von Anrufen.
- **Dienstaufzeichnungen** — fur welche Dienste Sie eingeteilt waren und ob Sie aktiv waren.
- **Audit-Protokoll-Eintrage** — im der App durchgefuhrte Aktionen. Nur fur Administratoren sichtbar.
- **Sicherheitsereignisse** — Geratregistrierungen, Widerrufe, Sitzungsaktivitat und Kontoaenderungen.

### Von Ihnen erstellte Inhalte — Ende-zu-Ende-verschlusselt

- **Anrufnotizen und Transkriptionen** — schriftliche Notizen und browsergenerierte Transkriptionen.
- **Berichte und Falldokumentationen** — strukturierte Berichte, benutzerdefinierte Felder, Dateianhange und Fallhistorie.
- **Kontaktdatensatze** — Kontaktdaten des Anrufers, falls aufgezeichnet.
- **Nachrichten** — eingehende Textnachrichten, die zu Ihrem Hub weitergeleitet werden.

**Der Server speichert diesen Inhalt nur als Chiffretext.** Er kann nicht vom Serverbetreiber, Hosting-Anbieter oder Llamenos gelesen werden.

### Broadcast-/Abonnentendaten

Abonnenten-Telefonnummern werden als gehashte Bezeichner gespeichert — nicht als Klartexttelefonnummern. Beim Senden einer Massennachricht verarbeitet der Server den Inhalt momentan als Klartext fur die Lieferung. Der Inhalt wird nach der Lieferung nicht gespeichert.

### Daten von Wiederherstellungsgruppen

Wenn Sie eine Wiederherstellungsgruppe konfigurieren, speichert der Server verschlusselte Anteilsfragmente (jedes Fragment zum Gerat eines bestimmten Anteilshalters verschlusselt — der Server kann sie nicht lesen). Der Server kann Ihren Wiederherstellungsschlussel nicht rekonstruieren.

---

## Wie Wir Daten Verwenden

- **Zum Betrieb der App** — Anrufe weiterleiten, Notizen ermoglichen, Dienste verwalten.
- **Fur die Sicherheit** — Missbrauch erkennen, Sperrlisten pflegen, Ratenbegrenzen.
- **Fur Audits** — Administratoren Audit-Protokolle der App-Aktivitat bereitstellen (kein Inhalt).
- **Fur die Wiederherstellung** — verschlusselte Fragmente speichern, damit Wiederherstellungsgruppen Nutzern helfen konnen.

Wir verwenden Ihre Daten nicht fur Werbung. Wir verkaufen oder teilen Ihre Daten nicht mit Dritten fur kommerzielle Zwecke.

---

## Ende-zu-Ende-Verschlusselung

Alle Noteninhalte, Transkriptionen, Berichte, Kontaktdatensatze und eingehende Nachrichten sind Ende-zu-Ende-verschlusselt.

| Datentyp | Server kann lesen? | Unter Vorladung erhaltlich |
|----------|-------------------|--------------------------|
| Anrufnotizen | Nein | Nur Chiffretext |
| Transkriptionen | Nein | Nur Chiffretext |
| Berichte | Nein | Nur Chiffretext |
| Falldokumentationen | Nein | Nur Chiffretext |
| Eingehende Nachrichten | Nein | Nur Chiffretext |
| Wiederherstellungsfragmente | Nein | Nur Chiffretext |
| Ausgehende Massennachrichten | **Ja, momentan wahrend der Lieferung** | Ja (Klartext zum Sendezeitpunkt) |
| Anrufmetadaten | Ja | Ja |
| Ihr offentlicher Gerateschlussel | Ja | Ja |
| Sicherheitsereignisse | Ja | Ja |

---

## Datenspeicherung

### Von Ihnen erstellte Inhalte

Aufbewahrt bis Sie oder ein Administrator sie explizit loschen oder Ihr Hub geschlossen wird.

### Massennachrichten

Inhalt wird nach der Lieferung nicht gespeichert. Nur Lieferstatus-Datensatze werden aufbewahrt.

### Anrufmetadaten und Audit-Protokolle

Aufbewahrt gemas der Konfiguration Ihres Hub-Administrators.

### Wiederherstellungsfragmente

Aufbewahrt bis Sie Ihre Wiederherstellungsgruppen-Konfiguration loschen oder Ihr Konto geloscht wird.

### Push-Tokens

Entfernt, wenn Sie sich abmelden oder die App deinstallieren.

---

## Kontolóschung

Sie haben das Recht, die dauerhafte Loschung Ihres Kontos zu beantragen.

### Was die Loschung bewirkt

1. **Schlussel zuerst vernichtet**: Ihre Gerateverschlusselungsschlussel werden sofort vernichtet.
2. **Kontodatensatze geloscht**: Ihr Kontodatensatz, Geratregistrierungen, Push-Tokens und Rollenzuweisungen werden entfernt.
3. **Audit-Eintrage krypto-vernichtet**: Der Verschlusselungsschlussel fur Ihre Audit-Protokoll-Eintrage wird vernichtet.
4. **Verschlusselter Inhalt neu eingepackt**: Von Ihnen verfasste Notizen und Berichte werden fur verbleibende autorisierte Leser neu verschlusselt.

### Loschung durch den Nutzer

Verfugbar uber die Kontoeinstellungen auf allen Plattformen. Es gibt standardmaßig eine Verzogerung (vom Hub-Administrator konfiguriert, mindestens 24 Stunden, maximal 7 Tage). Sie konnen wahrend dieser Zeit abbrechen.

### Notfall-Loschung

Ein Mitgenehmiger kann die Notfall-Loschung genehmigen, was die Verzogerung auf mindestens 4 Stunden reduziert.

---

## Drittanbieter-Dienste

Llamenos integriert sich mit Telefonieanbietern fur die Anrufweiterleitung.

**Was Telefoniezwecke erhalten**: Die Telefonnummer des Anrufers, Dauer und Zeitstempel. Keine Notizen, Transkriptionen oder von Ihnen erstellte Inhalte.

**Was Messaging-Anbieter fur Massennachrichten erhalten**: Nachrichteninhalt (SMS, WhatsApp, RCS) — der Anbieter muss Klartext empfangen, um zustellen zu konnen. Fur Signal-Broadcasts wird der Inhalt Ende-zu-Ende-verschlusselt geliefert.

---

## Ihre Rechte nach der DSGVO

Llamenos wird von einer EU-ansassigen Organisation entwickelt. Wenn Sie im Europaischen Wirtschaftsraum sind:

- **Auskunftsrecht** — Kopie der personlichen Daten anfordern
- **Recht auf Berichtigung** — ungenaue Daten korrigieren
- **Recht auf Loschung** — dauerhafte Loschung Ihres Kontos und aller Daten beantragen
- **Recht auf Dateniibertragbarkeit** — Daten in maschinenlesbarem Format erhalten
- **Widerspruchsrecht** — gegen Verarbeitung basierend auf berechtigten Interessen widersprechen
- **Recht auf Einschrankung** — Einschrankung der Verarbeitung beantragen
- **Recht auf Widerruf** — Einwilligung jederzeit widerrufen

Zur Ausubung dieser Rechte wenden Sie sich an Ihren Hub-Administrator oder schreiben Sie uns an [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com).

---

## Datenschutz von Kindern

Llamenos richtet sich nicht an Kinder unter 13 Jahren oder unter 16 Jahren in der EU.

---

## Anderungen dieser Richtlinie

Wir werden alle Anderungen auf dieser Seite veroffentlichen und das Datum des Inkrafttretens aktualisieren.

---

## Kontakt

**Datenschutzanfragen:** [privacy@llamenos-platform.com](mailto:privacy@llamenos-platform.com)

**Fehlerberichte und Sicherheitsmitteilungen:** [github.com/rhonda-rodododo/llamenos-platform/issues](https://github.com/rhonda-rodododo/llamenos-platform/issues)

Llamenos ist Open Source: [github.com/rhonda-rodododo/llamenos-platform](https://github.com/rhonda-rodododo/llamenos-platform)
