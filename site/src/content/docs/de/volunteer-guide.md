---
title: Handbuch fuer Freiwillige
description: Alles, was Sie als Freiwilliger wissen muessen -- Anmeldung, Anrufe entgegennehmen, Notizen schreiben und Transkription nutzen.
---

Dieses Handbuch behandelt alles, was Sie als Freiwilliger wissen muessen: Anmeldung, Anrufe entgegennehmen, Notizen schreiben und die Transkriptionsfunktion nutzen.

## Ihre Zugangsdaten erhalten

Ihr Administrator wird Ihnen eines der folgenden bereitstellen:

- Einen **nsec** (WebSocket-Geheimschluessel) -- eine Zeichenkette, die mit `nsec1` beginnt
- Einen **Einladungslink** -- eine Einmal-URL, die Ihre Zugangsdaten generiert

**Halten Sie Ihren nsec geheim.** Er ist Ihre Identitaet und Ihr Anmeldedaten. Jeder mit Ihrem nsec kann sich als Sie ausgeben. Speichern Sie ihn in einem Passwort-Manager.

## Anmeldung

1. Oeffnen Sie die Hotline-App in Ihrem Browser
2. Fuegen Sie Ihren `nsec` in das Anmeldefeld ein
3. Die App verifiziert Ihre Identitaet kryptografisch -- Ihr Geheimschluessel verlaesst niemals Ihren Browser

Nach der ersten Anmeldung werden Sie aufgefordert, Ihren Anzeigenamen und Ihre bevorzugte Sprache festzulegen.

### Passkey-Anmeldung (optional)

Wenn Ihr Administrator Passkeys aktiviert hat, koennen Sie einen Hardware-Schluessel oder ein biometrisches Merkmal unter **Einstellungen** registrieren. Dies ermoeglicht Ihnen die Anmeldung auf anderen Geraeten, ohne Ihren nsec einzugeben.

## Das Dashboard

Nach der Anmeldung sehen Sie das Dashboard mit:

- **Aktive Anrufe** -- derzeit bearbeitete Anrufe
- **Ihr Schichtstatus** -- in der Seitenleiste angezeigt (aktuelle Schicht oder naechste bevorstehende Schicht)
- **Online-Freiwillige** -- Anzahl der verfuegbaren Personen

## Anrufe entgegennehmen

Wenn waehrend Ihrer Schicht ein Anruf eingeht, werden Sie benachrichtigt ueber:

- Einen **Klingelton** im Browser (umschaltbar in den Einstellungen)
- Eine **Push-Benachrichtigung**, wenn Sie die Berechtigung erteilt haben
- Einen **blinkenden Tab-Titel**

Klicken Sie auf **Annehmen**, um den Anruf entgegenzunehmen. Ihr Telefon klingelt -- nehmen Sie ab, um sich mit dem Anrufer zu verbinden. Wenn ein anderer Freiwilliger zuerst abnimmt, hoert das Klingeln auf.

## Waehrend eines Anrufs

Waehrend eines Anrufs sehen Sie:

- Einen **Anruftimer**, der die Dauer anzeigt
- Ein **Notiz-Panel**, in dem Sie Notizen in Echtzeit schreiben koennen
- Eine Schaltflaeche **Spam melden**, um den Anrufer zu markieren

Notizen werden automatisch als verschluesselte Entwuerfe gespeichert. Sie koennen die Notiz auch manuell speichern.

## Notizen schreiben

Notizen werden in Ihrem Browser verschluesselt, bevor sie an den Server gesendet werden. Nur Sie und der Administrator koennen sie lesen.

Wenn Ihr Administrator benutzerdefinierte Felder konfiguriert hat (Text, Dropdown, Kontrollkaestchen usw.), erscheinen diese im Notizformular. Fuellen Sie sie nach Relevanz aus -- sie werden zusammen mit Ihrem Notiztext verschluesselt.

Navigieren Sie zu **Notizen** in der Seitenleiste, um Ihre vergangenen Notizen zu ueberpruefen, zu bearbeiten oder zu durchsuchen. Sie koennen Ihre Notizen als verschluesselte Datei exportieren.

## Transkription

Wenn die Transkription aktiviert ist (vom Administrator und nach Ihrer eigenen Praeferenz), werden Anrufe nach ihrem Ende automatisch transkribiert. Die Transkription erscheint neben Ihrer Notiz fuer diesen Anruf.

Sie koennen die Transkription unter **Einstellungen** ein- oder ausschalten. Wenn deaktiviert, werden Ihre Anrufe unabhaengig von der globalen Einstellung des Administrators nicht transkribiert.

Transkriptionen werden im Ruhezustand verschluesselt -- der Server verarbeitet das Audio voruebergehend und verschluesselt dann den resultierenden Text.

## Pause machen

Aktivieren Sie den **Pause**-Schalter in der Seitenleiste, um eingehende Anrufe zu pausieren, ohne Ihre Schicht zu verlassen. Anrufe werden Ihr Telefon waehrend der Pause nicht zum Klingeln bringen. Deaktivieren Sie ihn wieder, wenn Sie bereit sind.

## Tipps

- Verwenden Sie <kbd>Ctrl</kbd>+<kbd>K</kbd> (oder <kbd>Cmd</kbd>+<kbd>K</kbd> auf Mac), um die Befehlspalette fuer schnelle Navigation zu oeffnen
- Druecken Sie <kbd>?</kbd>, um alle Tastenkombinationen anzuzeigen
- Installieren Sie die App als PWA fuer ein natives App-Erlebnis und bessere Benachrichtigungen
- Lassen Sie Ihren Browser-Tab waehrend Ihrer Schicht fuer Echtzeit-Anrufbenachrichtigungen geoeffnet
