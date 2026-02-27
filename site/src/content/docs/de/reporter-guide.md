---
title: Anleitung fuer Berichterstatter
description: Wie Sie verschluesselte Berichte einreichen und deren Status verfolgen.
---

Als Berichterstatter koennen Sie verschluesselte Berichte an Ihre Organisation ueber die Llamenos-Plattform einreichen. Berichte sind Ende-zu-Ende-verschluesselt -- der Server sieht niemals den Inhalt Ihres Berichts.

## Erste Schritte

Ihr Administrator wird Ihnen eines der folgenden bereitstellen:
- Einen **nsec** (Nostr-Geheimschluessel) -- eine Zeichenkette, die mit `nsec1` beginnt
- Einen **Einladungslink** -- eine einmalige URL, die Anmeldedaten fuer Sie erstellt

**Halten Sie Ihren nsec privat.** Er ist Ihre Identitaet und Anmeldeberechtigung. Speichern Sie ihn in einem Passwort-Manager.

## Anmeldung

1. Oeffnen Sie die App in Ihrem Browser
2. Fuegen Sie Ihren `nsec` in das Anmeldefeld ein
3. Ihre Identitaet wird kryptografisch verifiziert -- Ihr Geheimschluessel verlaesst niemals Ihren Browser

Nach der ersten Anmeldung koennen Sie einen WebAuthn-Passkey in den Einstellungen registrieren, um zukuenftige Anmeldungen zu erleichtern.

## Einen Bericht einreichen

1. Klicken Sie auf **Neuer Bericht** auf der Berichtsseite
2. Geben Sie einen **Titel** fuer Ihren Bericht ein (dies hilft Administratoren bei der Triage -- er wird im Klartext gespeichert)
3. Waehlen Sie eine **Kategorie**, falls Ihr Administrator Berichtskategorien definiert hat
4. Schreiben Sie den **Berichtsinhalt** in das Textfeld -- dieser wird vor dem Verlassen Ihres Browsers verschluesselt
5. Fuellen Sie optional **benutzerdefinierte Felder** aus, die Ihr Administrator konfiguriert hat
6. Haengen Sie optional **Dateien an** -- Dateien werden client-seitig vor dem Upload verschluesselt
7. Klicken Sie auf **Absenden**

Ihr Bericht erscheint in Ihrer Berichtsliste mit dem Status "Offen".

## Berichtsverschluesselung

- Der Berichtstext und die Werte benutzerdefinierter Felder werden mit ECIES (secp256k1 + XChaCha20-Poly1305) verschluesselt
- Dateianhänge werden separat mit dem gleichen Verfahren verschluesselt
- Nur Sie und der Administrator koennen den Inhalt entschluesseln
- Der Server speichert nur Chiffretext -- selbst bei einer Kompromittierung der Datenbank ist Ihr Berichtsinhalt sicher

## Ihre Berichte verfolgen

Ihre Berichtsseite zeigt alle eingereichten Berichte mit:
- **Titel** und **Kategorie**
- **Status** -- Offen, Beansprucht (ein Administrator bearbeitet ihn) oder Geloest
- **Datum** der Einreichung

Klicken Sie auf einen Bericht, um den vollstaendigen Verlauf einschliesslich aller Administratorantworten anzuzeigen.

## Auf Administratoren antworten

Wenn ein Administrator auf Ihren Bericht antwortet, erscheint die Antwort im Berichtsverlauf. Sie koennen zurueckschreiben -- alle Nachrichten im Verlauf sind verschluesselt.

## Was Sie nicht tun koennen

Als Berichterstatter ist Ihr Zugang zum Schutz der Privatsphaere aller eingeschraenkt:
- Sie **koennen** Ihre eigenen Berichte und die Hilfe-Seite einsehen
- Sie **koennen nicht** Berichte anderer Berichterstatter, Anrufprotokolle, Freiwilligen-Informationen oder Admin-Einstellungen einsehen
- Sie **koennen nicht** Anrufe entgegennehmen oder auf SMS/WhatsApp/Signal-Konversationen antworten

## Tipps

- Verwenden Sie beschreibende Titel -- sie helfen Administratoren bei der Triage, ohne den vollstaendigen Inhalt entschluesseln zu muessen
- Haengen Sie relevante Dateien (Screenshots, Dokumente) an, wenn sie Ihren Bericht unterstuetzen
- Schauen Sie regelmaessig nach Administratorantworten -- Sie sehen Statusaenderungen in Ihrer Berichtsliste
- Nutzen Sie die Hilfe-Seite fuer FAQ und Anleitungen
