---
title: Mobile-App-Anleitung
description: Installieren und richten Sie die Llamenos Mobile-App auf iOS und Android ein.
---

Die Llamenos Mobile-App ermoeglicht es Freiwilligen, Anrufe entgegenzunehmen, auf Nachrichten zu antworten und verschluesselte Notizen von ihrem Telefon aus zu schreiben. Sie ist mit React Native gebaut und teilt denselben Rust-Kryptokern wie die Desktop-App.

## Was ist die Mobile-App?

Die Mobile-App ist ein Begleiter zur Desktop-Anwendung. Sie verbindet sich mit demselben Llamenos-Backend (Cloudflare Workers oder selbst gehostet) und verwendet dasselbe Protokoll, sodass Freiwillige nahtlos zwischen Desktop und Mobile wechseln koennen.

Die Mobile-App befindet sich in einem separaten Repository (`llamenos-mobile`), teilt aber:

- **llamenos-core** -- Dasselbe Rust-Crate fuer alle kryptografischen Operationen, kompiliert via UniFFI fuer iOS und Android
- **Protokoll** -- Dasselbe Wire-Format, dieselben API-Endpunkte und dasselbe Verschluesselungsschema
- **Backend** -- Derselbe Cloudflare Worker oder selbst gehostete Server

## Herunterladen und installieren

### Android

Die Mobile-App wird derzeit als APK zum Sideloading verteilt:

1. Laden Sie die neueste `.apk`-Datei von der [GitHub Releases](https://github.com/rhonda-rodododo/llamenos-mobile/releases/latest)-Seite herunter
2. Gehen Sie auf Ihrem Android-Geraet zu **Einstellungen > Sicherheit** und aktivieren Sie **Aus unbekannten Quellen installieren** (oder aktivieren Sie es pro App, wenn Sie dazu aufgefordert werden)
3. Oeffnen Sie die heruntergeladene APK und tippen Sie auf **Installieren**
4. Nach der Installation oeffnen Sie Llamenos aus Ihrer App-Schublade

Die Verteilung ueber App Store und Play Store ist fuer eine zukuenftige Version geplant.

### iOS

iOS-Builds sind als TestFlight-Beta-Releases verfuegbar:

1. Installieren Sie [TestFlight](https://apps.apple.com/app/testflight/id899247664) aus dem App Store
2. Bitten Sie Ihren Administrator um den TestFlight-Einladungslink
3. Oeffnen Sie den Link auf Ihrem iOS-Geraet, um dem Beta beizutreten
4. Installieren Sie Llamenos aus TestFlight

Die Verteilung ueber den App Store ist fuer eine zukuenftige Version geplant.

## Ersteinrichtung

Die Mobile-App wird eingerichtet, indem sie mit einem bestehenden Desktop-Konto verknuepft wird. Dies stellt sicher, dass dieselbe kryptografische Identitaet geraeteubergreifend verwendet wird, ohne den geheimen Schluessel jemals im Klartext zu uebertragen.

### Geraetebereitstellung (QR-Scan)

1. Oeffnen Sie die Llamenos Desktop-App und gehen Sie zu **Einstellungen > Geraete**
2. Klicken Sie auf **Neues Geraet verknuepfen** -- dies generiert einen QR-Code mit einem einmaligen Bereitstellungstoken
3. Oeffnen Sie die Llamenos Mobile-App und tippen Sie auf **Geraet verknuepfen**
4. Scannen Sie den QR-Code mit der Kamera Ihres Telefons
5. Die Apps fuehren einen ephemeren ECDH-Schluesselaustausch durch, um Ihr verschluesseltes Schluesselmaterial sicher zu uebertragen
6. Legen Sie eine PIN in der Mobile-App fest, um Ihren lokalen Schluesselspeicher zu schuetzen
7. Die Mobile-App ist jetzt verknuepft und einsatzbereit

Der Bereitstellungsprozess uebertraegt Ihren nsec niemals im Klartext. Die Desktop-App umhuellt das Schluesselmaterial mit dem ephemeren gemeinsamen Geheimnis, und die Mobile-App enthuellt es lokal.

### Manuelle Einrichtung (nsec-Eingabe)

Wenn Sie keinen QR-Code scannen koennen, koennen Sie Ihren nsec direkt eingeben:

1. Oeffnen Sie die Mobile-App und tippen Sie auf **nsec manuell eingeben**
2. Fuegen Sie Ihren `nsec1...`-Schluessel ein
3. Legen Sie eine PIN zum Schutz des lokalen Speichers fest
4. Die App leitet Ihren oeffentlichen Schluessel ab und registriert sich beim Backend

Diese Methode erfordert den direkten Umgang mit Ihrem nsec, verwenden Sie sie daher nur, wenn die Geraeteverknuepfung nicht moeglich ist. Verwenden Sie einen Passwort-Manager, um den nsec einzufuegen, anstatt ihn einzutippen.

## Funktionsvergleich

| Funktion | Desktop | Mobile |
|---|---|---|
| Eingehende Anrufe entgegennehmen | Ja | Ja |
| Verschluesselte Notizen schreiben | Ja | Ja |
| Benutzerdefinierte Notizfelder | Ja | Ja |
| Auf Nachrichten antworten (SMS, WhatsApp, Signal) | Ja | Ja |
| Konversationen anzeigen | Ja | Ja |
| Schichtstatus und Pausen | Ja | Ja |
| Client-seitige Transkription | Ja (WASM Whisper) | Nein |
| Notizsuche | Ja | Ja |
| Befehlspalette | Ja (Ctrl+K) | Nein |
| Tastenkuerzel | Ja | Nein |
| Admin-Einstellungen | Ja (vollstaendig) | Ja (eingeschraenkt) |
| Freiwillige verwalten | Ja | Nur Ansicht |
| Audit-Logs anzeigen | Ja | Ja |
| WebRTC-Browseranrufe | Ja | Nein (verwendet natives Telefon) |
| Push-Benachrichtigungen | OS-Benachrichtigungen | Natives Push (FCM/APNS) |
| Auto-Update | Tauri Updater | App Store / TestFlight |
| Dateianbhaenge (Berichte) | Ja | Ja |

## Einschraenkungen

- **Keine client-seitige Transkription** -- Das WASM Whisper-Modell erfordert erhebliche Speicher- und CPU-Ressourcen, die auf Mobilgeraeten unpraktisch sind. Anruftranskription ist nur auf dem Desktop verfuegbar.
- **Reduzierte Krypto-Leistung** -- Obwohl die Mobile-App denselben Rust-Kryptokern ueber UniFFI verwendet, koennen Operationen auf aelteren Geraeten im Vergleich zur nativen Desktop-Leistung langsamer sein.
- **Eingeschraenkte Admin-Funktionen** -- Einige Admin-Operationen (Massen-Freiwilligenverwaltung, detaillierte Einstellungskonfiguration) sind nur in der Desktop-App verfuegbar. Die Mobile-App bietet Nur-Lese-Ansichten fuer die meisten Admin-Bildschirme.
- **Keine WebRTC-Anrufe** -- Mobile Freiwillige empfangen Anrufe auf ihrer Telefonnummer ueber den Telefonieanbieter, nicht ueber den Browser. WebRTC-In-App-Anrufe sind nur auf dem Desktop verfuegbar.
- **Akku und Konnektivitaet** -- Die App benoetigt eine dauerhafte Verbindung, um Echtzeit-Updates zu empfangen. Der Hintergrundmodus kann durch das OS-Energiemanagement eingeschraenkt sein. Halten Sie die App waehrend der Schichten im Vordergrund fuer zuverlaessige Benachrichtigungen.

## Fehlerbehebung der Mobile-App

### Bereitstellung schlaegt mit "Ungueltiger QR-Code" fehl

- Stellen Sie sicher, dass der QR-Code kuerzlich generiert wurde (Bereitstellungstokens laufen nach 5 Minuten ab)
- Generieren Sie einen neuen QR-Code in der Desktop-App und versuchen Sie es erneut
- Stellen Sie sicher, dass beide Geraete mit dem Internet verbunden sind

### Push-Benachrichtigungen kommen nicht an

- Ueberpruefen Sie, ob Benachrichtigungen fuer Llamenos in Ihren Geraeteeinstellungen aktiviert sind
- Auf Android: Gehen Sie zu **Einstellungen > Apps > Llamenos > Benachrichtigungen** und aktivieren Sie alle Kanaele
- Auf iOS: Gehen Sie zu **Einstellungen > Mitteilungen > Llamenos** und aktivieren Sie **Mitteilungen erlauben**
- Stellen Sie sicher, dass Sie sich nicht im Bitte-nicht-stoeren-Modus befinden
- Ueberpruefen Sie, ob Ihre Schicht aktiv ist und Sie nicht in der Pause sind

### App stuerzt beim Start ab

- Stellen Sie sicher, dass Sie die neueste Version der App verwenden
- Leeren Sie den App-Cache: **Einstellungen > Apps > Llamenos > Speicher > Cache leeren**
- Wenn das Problem weiterhin besteht, deinstallieren und reinstallieren Sie (Sie muessen das Geraet neu verknuepfen)

### Alte Notizen nach Neuinstallation nicht entschluesselbar

- Die Neuinstallation der App entfernt lokales Schluesselmaterial
- Verknuepfen Sie das Geraet ueber QR-Code von Ihrer Desktop-App neu, um den Zugang wiederherzustellen
- Notizen, die vor der Neuinstallation verschluesselt wurden, sind zugaenglich, sobald das Geraet mit derselben Identitaet neu verknuepft ist

### Langsame Leistung auf aelteren Geraeten

- Schliessen Sie andere Apps, um Speicher freizugeben
- Deaktivieren Sie Animationen in den App-Einstellungen, falls verfuegbar
- Erwaegen Sie die Verwendung der Desktop-App fuer umfangreiche Operationen wie Massen-Notizpruefung
