---
title: Architektur
description: Ueberblick ueber die Systemarchitektur -- Repositories, Datenfluss, Verschluesselungsschichten und Echtzeitkommunikation.
---

Diese Seite erklaert, wie Llamenos aufgebaut ist, wie Daten durch das System fliessen und wo Verschluesselung angewendet wird.

## Repository-Struktur

Llamenos ist auf drei Repositories aufgeteilt, die ein gemeinsames Protokoll und einen kryptografischen Kern teilen:

```
llamenos              llamenos-core           llamenos-mobile
(Desktop + API)       (Shared Crypto)         (Mobile App)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** -- Die Desktop-Anwendung (Tauri v2 mit Vite + React Webview), das Cloudflare Worker-Backend und das selbst gehostete Node.js-Backend. Dies ist das primaere Repository.
- **llamenos-core** -- Ein gemeinsames Rust-Crate, das alle kryptografischen Operationen implementiert: ECIES-Envelope-Verschluesselung, Schnorr-Signaturen, PBKDF2-Schluesselableitung, HKDF und XChaCha20-Poly1305. Kompiliert zu nativem Code (Tauri), WASM (Browser) und UniFFI-Bindings (Mobile).
- **llamenos-mobile** -- Die React Native Mobile-Anwendung fuer iOS und Android. Verwendet UniFFI-Bindings, um denselben Rust-Kryptocode aufzurufen.

Alle drei Plattformen implementieren dasselbe Wire-Protokoll, definiert in `docs/protocol/PROTOCOL.md`.

## Datenfluss

### Eingehender Anruf

```
Anrufer (Telefon)
    |
    v
Telefonieanbieter (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP Webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Prueft ShiftManagerDO fuer diensthabende Freiwillige
    |                | Initiiert paralleles Klingeln bei allen verfuegbaren Freiwilligen
    |                v
    |           Telefonieanbieter (ausgehende Anrufe an Freiwilligen-Telefone)
    |
    | Erster Freiwilliger nimmt ab
    v
CallRouterDO  -->  Verbindet Anrufer und Freiwilligen
    |
    | Anruf beendet
    v
Client (Browser/App des Freiwilligen)
    |
    | Verschluesselt Notiz mit Pro-Notiz-Schluessel
    | Umhuellt Schluessel via ECIES fuer sich selbst + jeden Admin
    v
Worker API  -->  RecordsDO  (speichert verschluesselte Notiz + umhuellte Schluessel)
```

### Eingehende Nachricht (SMS / WhatsApp / Signal)

```
Kontakt (SMS / WhatsApp / Signal)
    |
    | Anbieter-Webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Verschluesselt Nachrichteninhalt sofort
    |                | Umhuellt symmetrischen Schluessel via ECIES fuer zugewiesenen Freiwilligen + Admins
    |                | Verwirft Klartext
    |                v
    |           Nostr-Relay (verschluesseltes Hub-Event benachrichtigt Online-Clients)
    |
    v
Client (Browser/App des Freiwilligen)
    |
    | Entschluesselt Nachricht mit eigenem privaten Schluessel
    | Verfasst Antwort, verschluesselt Ausgang
    v
Worker API  -->  ConversationDO  -->  Nachrichtenanbieter (sendet Antwort)
```

## Durable Objects

Das Backend verwendet sechs Cloudflare Durable Objects (oder deren PostgreSQL-Aequivalente fuer selbst gehostete Bereitstellungen):

| Durable Object | Verantwortlichkeit |
|---|---|
| **IdentityDO** | Verwaltet Freiwilligen-Identitaeten, oeffentliche Schluessel, Anzeigenamen und WebAuthn-Anmeldedaten. Behandelt Einladungserstellung und -einloesung. |
| **SettingsDO** | Speichert Hotline-Konfiguration: Name, aktivierte Kanaele, Anbieter-Anmeldedaten, benutzerdefinierte Notizfelder, Spam-Mitigations-Einstellungen, Feature-Flags. |
| **RecordsDO** | Speichert verschluesselte Anrufnotizen, verschluesselte Berichte und Dateianhang-Metadaten. Behandelt Notizsuche (ueber verschluesselte Metadaten). |
| **ShiftManagerDO** | Verwaltet wiederkehrende Schichtplaene, Klingelgruppen und Freiwilligen-Schichtzuweisungen. Bestimmt, wer zu einem bestimmten Zeitpunkt im Dienst ist. |
| **CallRouterDO** | Orchestriert Echtzeit-Anrufweiterleitung: paralleles Klingeln, Erstabnahme-Terminierung, Pausenstatus, aktive Anrufverfolgung. Generiert TwiML/Anbieter-Antworten. |
| **ConversationDO** | Verwaltet Konversationen mit Verlauf ueber SMS, WhatsApp und Signal. Behandelt Nachrichtenverschluesselung bei der Aufnahme, Konversationszuweisung und ausgehende Antworten. |

Alle DOs werden als Singletons ueber `idFromName()` aufgerufen und intern ueber einen leichtgewichtigen `DORouter` (Methode + Pfadmuster-Matching) geroutet.

## Verschluesselungsmatrix

| Daten | Verschluesselt? | Algorithmus | Wer kann entschluesseln |
|---|---|---|---|
| Anrufnotizen | Ja (E2EE) | XChaCha20-Poly1305 + ECIES-Envelope | Notizautor + alle Admins |
| Benutzerdefinierte Notizfelder | Ja (E2EE) | Wie Notizen | Notizautor + alle Admins |
| Berichte | Ja (E2EE) | Wie Notizen | Berichtsautor + alle Admins |
| Berichtsanhaenge | Ja (E2EE) | XChaCha20-Poly1305 (gestreamt) | Berichtsautor + alle Admins |
| Nachrichteninhalt | Ja (E2EE) | XChaCha20-Poly1305 + ECIES-Envelope | Zugewiesener Freiwilliger + alle Admins |
| Transkripte | Ja (Ruhezustand) | XChaCha20-Poly1305 | Transkript-Ersteller + alle Admins |
| Hub-Events (Nostr) | Ja (symmetrisch) | XChaCha20-Poly1305 mit Hub-Schluessel | Alle aktuellen Hub-Mitglieder |
| Freiwilligen-nsec | Ja (Ruhezustand) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Nur der Freiwillige |
| Audit-Log-Eintraege | Nein (integritaetsgeschuetzt) | SHA-256-Hash-Kette | Admins (lesen), System (schreiben) |
| Anrufer-Telefonnummern | Nein (nur serverseitig) | N/A | Server + Admins |
| Freiwilligen-Telefonnummern | Im IdentityDO gespeichert | N/A | Nur Admins |

### Forward Secrecy pro Notiz

Jede Notiz oder Nachricht erhaelt einen einzigartigen zufaelligen symmetrischen Schluessel. Dieser Schluessel wird via ECIES (ephemerer secp256k1-Schluessel + HKDF + XChaCha20-Poly1305) individuell fuer jeden autorisierten Leser umhuellt. Die Kompromittierung eines Notizschluessels verraet nichts ueber andere Notizen. Es gibt keine langlebigen symmetrischen Schluessel fuer die Inhaltsverschluesselung.

### Schluesselhierarchie

```
Freiwilligen-nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Leitet npub ab (x-only oeffentlicher Schluessel, 32 Bytes)
    |
    +-- Verwendet fuer ECIES-Schluesselvereinbarung (02 fuer komprimiertes Format voranstellen)
    |
    +-- Signiert Nostr-Events (Schnorr-Signatur)

Hub-Schluessel (zufaellige 32 Bytes, NICHT von einer Identitaet abgeleitet)
    |
    +-- Verschluesselt Echtzeit-Nostr-Hub-Events
    |
    +-- ECIES-umhuellt pro Mitglied via LABEL_HUB_KEY_WRAP
    |
    +-- Rotiert beim Austritt eines Mitglieds

Pro-Notiz-Schluessel (zufaellige 32 Bytes)
    |
    +-- Verschluesselt Notizinhalt via XChaCha20-Poly1305
    |
    +-- ECIES-umhuellt pro Leser (Freiwilliger + jeder Admin)
    |
    +-- Wird niemals zwischen Notizen wiederverwendet
```

## Echtzeitkommunikation

Echtzeit-Updates (neue Anrufe, Nachrichten, Schichtaenderungen, Praesenz) fliessen ueber ein Nostr-Relay:

- **Selbst gehostet**: strfry-Relay laeuft neben der App in Docker/Kubernetes
- **Cloudflare**: Nosflare (Cloudflare Workers-basiertes Relay)

Alle Events sind ephemer (Kind 20001) und mit dem Hub-Schluessel verschluesselt. Events verwenden generische Tags (`["t", "llamenos:event"]`), sodass das Relay keine Event-Typen unterscheiden kann. Das Inhaltsfeld enthaelt XChaCha20-Poly1305-Chiffretext.

### Event-Fluss

```
Client A (Freiwilligen-Aktion)
    |
    | Verschluesselt Event-Inhalt mit Hub-Schluessel
    | Signiert als Nostr-Event (Schnorr)
    v
Nostr-Relay (strfry / Nosflare)
    |
    | Sendet an Abonnenten
    v
Client B, C, D...
    |
    | Verifiziert Schnorr-Signatur
    | Entschluesselt Inhalt mit Hub-Schluessel
    v
Aktualisiert lokalen UI-Zustand
```

Das Relay sieht verschluesselte Blobs und gueltige Signaturen, kann aber weder Event-Inhalte lesen noch bestimmen, welche Aktionen ausgefuehrt werden.

## Sicherheitsschichten

### Transportschicht

- Gesamte Client-Server-Kommunikation ueber HTTPS (TLS 1.3)
- WebSocket-Verbindungen zum Nostr-Relay ueber WSS
- Content Security Policy (CSP) schraenkt Skriptquellen, Verbindungen und Frame-Vorfahren ein
- Tauri-Isolationsmuster trennt IPC von der Webview

### Anwendungsschicht

- Authentifizierung ueber Nostr-Schluesselpaare (BIP-340 Schnorr-Signaturen)
- WebAuthn-Session-Tokens fuer Multi-Geraete-Komfort
- Rollenbasierte Zugriffskontrolle (Anrufer, Freiwilliger, Berichterstatter, Admin)
- Alle 25 kryptografischen Domain-Separation-Konstanten definiert in `crypto-labels.ts` verhindern Cross-Protocol-Angriffe

### Verschluesselung im Ruhezustand

- Anrufnotizen, Berichte, Nachrichten und Transkripte vor der Speicherung verschluesselt
- Geheime Schluessel der Freiwilligen mit PIN-abgeleiteten Schluesseln verschluesselt (PBKDF2)
- Tauri Stronghold bietet verschluesselte Tresor-Speicherung auf dem Desktop
- Audit-Log-Integritaet durch SHA-256-Hash-Kette geschuetzt

### Build-Verifizierung

- Reproduzierbare Builds ueber `Dockerfile.build` mit `SOURCE_DATE_EPOCH`
- Inhaltsgehashte Dateinamen fuer Frontend-Assets
- `CHECKSUMS.txt` veroeffentlicht mit GitHub Releases
- SLSA-Provenienz-Attestierungen
- Verifizierungsskript: `scripts/verify-build.sh`

## Plattformunterschiede

| Funktion | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|---|---|---|---|
| Krypto-Backend | Natives Rust (ueber IPC) | Natives Rust (ueber UniFFI) | WASM (llamenos-core) |
| Schluesselspeicher | Tauri Stronghold (verschluesselt) | Secure Enclave / Keystore | Browser localStorage (PIN-verschluesselt) |
| Transkription | Client-seitiges Whisper (WASM) | Nicht verfuegbar | Client-seitiges Whisper (WASM) |
| Auto-Update | Tauri Updater | App Store / Play Store | Automatisch (CF Workers) |
| Push-Benachrichtigungen | OS-nativ (Tauri Notification) | OS-nativ (FCM/APNS) | Browser-Benachrichtigungen |
| Offline-Unterstuetzung | Eingeschraenkt (benoetigt API) | Eingeschraenkt (benoetigt API) | Eingeschraenkt (benoetigt API) |
