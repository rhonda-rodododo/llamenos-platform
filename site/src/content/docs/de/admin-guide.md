---
title: Administratorhandbuch
description: Verwalten Sie alles -- Freiwillige, Schichten, Anrufeinstellungen, Sperrlisten und benutzerdefinierte Felder.
---

Als Administrator verwalten Sie alles: Freiwillige, Schichten, Anrufeinstellungen, Sperrlisten und benutzerdefinierte Felder. Dieses Handbuch behandelt die wichtigsten Administrationsablaeufe.

## Anmeldung

Melden Sie sich mit dem `nsec` (Nostr-Geheimschluessel) an, der waehrend der [Einrichtung](/docs/deploy) generiert wurde. Die Anmeldeseite akzeptiert das nsec-Format (`nsec1...`). Ihr Browser signiert eine Challenge mit dem Schluessel -- das Geheimnis verlaesst niemals das Geraet.

Optional koennen Sie einen WebAuthn-Passkey in den Einstellungen registrieren, um sich auf weiteren Geraeten ohne Passwort anzumelden.

## Freiwillige verwalten

Navigieren Sie zu **Freiwillige** in der Seitenleiste, um:

- **Freiwilligen hinzufuegen** -- generiert ein neues Nostr-Schluesselpaar. Teilen Sie den nsec sicher mit dem Freiwilligen (er wird nur einmal angezeigt).
- **Einladungslink erstellen** -- generiert einen Einmal-Link, den ein Freiwilliger zur Selbstregistrierung verwenden kann.
- **Bearbeiten** -- Name, Telefonnummer und Rolle aktualisieren.
- **Entfernen** -- den Zugang eines Freiwilligen deaktivieren.

Telefonnummern der Freiwilligen sind nur fuer Administratoren sichtbar. Sie werden fuer die parallele Anrufweiterleitung verwendet, wenn der Freiwillige im Dienst ist.

## Schichten konfigurieren

Navigieren Sie zu **Schichten**, um wiederkehrende Zeitplaene zu erstellen:

1. Klicken Sie auf **Schicht hinzufuegen**
2. Legen Sie einen Namen fest, waehlen Sie Wochentage und setzen Sie Start-/Endzeiten
3. Weisen Sie Freiwillige ueber die durchsuchbare Mehrfachauswahl zu
4. Speichern -- das System leitet Anrufe automatisch an die Freiwilligen der aktiven Schicht weiter

Konfigurieren Sie eine **Fallback-Gruppe** am Ende der Schichtenseite. Diese Freiwilligen werden angerufen, wenn keine geplante Schicht aktiv ist.

## Sperrlisten

Navigieren Sie zu **Sperren**, um blockierte Telefonnummern zu verwalten:

- **Einzeleintrag** -- geben Sie eine Telefonnummer im E.164-Format ein (z.B. +15551234567)
- **Massenimport** -- fuegen Sie mehrere Nummern ein, eine pro Zeile
- **Entfernen** -- eine Nummer sofort entsperren

Sperren werden sofort wirksam. Gesperrte Anrufer hoeren eine Ablehnungsnachricht und werden getrennt.

## Anrufeinstellungen

Unter **Einstellungen** finden Sie mehrere Abschnitte:

### Spam-Schutz

- **Sprach-CAPTCHA** -- ein-/ausschalten. Wenn aktiviert, muessen Anrufer einen zufaelligen 4-stelligen Code eingeben.
- **Ratenbegrenzung** -- ein-/ausschalten. Begrenzt Anrufe pro Telefonnummer innerhalb eines gleitenden Zeitfensters.

### Transkription

- **Globaler Schalter** -- Whisper-Transkription fuer alle Anrufe aktivieren/deaktivieren.
- Einzelne Freiwillige koennen sich auch ueber ihre eigenen Einstellungen abmelden.

### Anrufeinstellungen

- **Warteschlangen-Timeout** -- wie lange Anrufer warten, bevor sie zur Voicemail weitergeleitet werden (30-300 Sekunden).
- **Maximale Voicemail-Dauer** -- maximale Aufnahmelaenge (30-300 Sekunden).

### Benutzerdefinierte Notizfelder

Definieren Sie strukturierte Felder, die im Notizformular erscheinen:

- Unterstuetzte Typen: Text, Zahl, Auswahl (Dropdown), Kontrollkaestchen, Textbereich
- Validierung konfigurieren: erforderlich, Min-/Max-Laenge, Min-/Max-Wert
- Sichtbarkeit steuern: waehlen Sie, welche Felder Freiwillige sehen und bearbeiten koennen
- Felder mit Auf-/Ab-Pfeilen neu anordnen
- Maximal 20 Felder, maximal 50 Optionen pro Auswahlfeld

Benutzerdefinierte Feldwerte werden zusammen mit dem Notizinhalt verschluesselt. Der Server sieht sie niemals.

### Sprachansagen

Nehmen Sie benutzerdefinierte IVR-Audioansagen fuer jede unterstuetzte Sprache auf. Das System verwendet Ihre Aufnahmen fuer Begruessung, CAPTCHA, Warteschlange und Voicemail-Ablaeufe. Wo keine Aufnahme vorhanden ist, wird auf Sprachsynthese zurueckgegriffen.

### WebAuthn-Richtlinie

Fordern Sie optional Passkeys fuer Administratoren, Freiwillige oder beide. Wenn erforderlich, muessen Benutzer einen Passkey registrieren, bevor sie die App verwenden koennen.

## Auditprotokoll

Die Seite **Auditprotokoll** zeigt eine chronologische Liste von Systemereignissen: Anmeldungen, Anrufannahmen, Notizerstellung, Einstellungsaenderungen und Administratoraktionen. Eintraege enthalten gehashte IP-Adressen und Laendermetadaten. Verwenden Sie die Seitennavigation, um den Verlauf zu durchsuchen.

## Anrufverlauf

Die Seite **Anrufe** zeigt alle Anrufe mit Status, Dauer und zugewiesenem Freiwilligen. Filtern Sie nach Datumsbereich oder suchen Sie nach Telefonnummer. Exportieren Sie Daten im DSGVO-konformen JSON-Format.
