---
title: Dokumentation
description: Erfahren Sie, wie Sie Llamenos bereitstellen, konfigurieren und verwenden.
guidesHeading: Anleitungen
guides:
  - title: Erste Schritte
    description: Voraussetzungen, Installation, Einrichtungsassistent und erstes Deployment.
    href: /docs/deploy
  - title: Selbst-Hosting
    description: Stellen Sie auf Ihrer eigenen Infrastruktur mit Docker Compose oder Kubernetes bereit.
    href: /docs/deploy/self-hosting
  - title: "Bereitstellung: Docker Compose"
    description: Selbst gehostete Bereitstellung auf einem einzelnen Server mit automatischem HTTPS.
    href: /docs/deploy/docker
  - title: "Bereitstellung: Kubernetes (Helm)"
    description: Stellen Sie auf Kubernetes mit dem offiziellen Helm-Chart bereit.
    href: /docs/deploy/kubernetes
  - title: Administratorhandbuch
    description: Verwalten Sie Freiwillige, Schichten, Kanaele, Konversationen, Berichte, Sperrlisten und Einstellungen.
    href: /docs/admin-guide
  - title: Handbuch fuer Freiwillige
    description: Anmelden, Anrufe entgegennehmen, Nachrichten beantworten, Notizen schreiben und Transkription nutzen.
    href: /docs/volunteer-guide
  - title: Anleitung fuer Berichterstatter
    description: Senden Sie verschluesselte Berichte und verfolgen Sie deren Status.
    href: /docs/reporter-guide
  - title: Mobile-App-Anleitung
    description: Installieren und richten Sie die Llamenos Mobile-App auf iOS und Android ein.
    href: /docs/mobile-guide
  - title: Telefonieanbieter
    description: Vergleichen Sie die unterstuetzten Telefonieanbieter und waehlen Sie den besten fuer Ihre Hotline.
    href: /docs/deploy/providers
  - title: "Einrichtung: SMS"
    description: Aktivieren Sie eingehende und ausgehende SMS-Nachrichten ueber Ihren Telefonieanbieter.
    href: /docs/deploy/providers/sms
  - title: "Einrichtung: WhatsApp"
    description: Verbinden Sie WhatsApp Business ueber die Meta Cloud API.
    href: /docs/deploy/providers/whatsapp
  - title: "Einrichtung: Signal"
    description: Richten Sie den Signal-Kanal ueber die signal-cli-Bridge ein.
    href: /docs/deploy/providers/signal
  - title: "Einrichtung: Twilio"
    description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Twilio als Telefonieanbieter.
    href: /docs/deploy/providers/twilio
  - title: "Einrichtung: SignalWire"
    description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von SignalWire als Telefonieanbieter.
    href: /docs/deploy/providers/signalwire
  - title: "Einrichtung: Vonage"
    description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Vonage als Telefonieanbieter.
    href: /docs/deploy/providers/vonage
  - title: "Einrichtung: Plivo"
    description: Schritt-fuer-Schritt-Anleitung zur Konfiguration von Plivo als Telefonieanbieter.
    href: /docs/deploy/providers/plivo
  - title: "Einrichtung: Asterisk (selbst gehostet)"
    description: Stellen Sie Asterisk mit der ARI-Bridge fuer maximale Privatsphaere und Kontrolle bereit.
    href: /docs/deploy/providers/asterisk
  - title: WebRTC-Browseranrufe
    description: Aktivieren Sie die Anrufannahme im Browser fuer Freiwillige ueber WebRTC.
    href: /docs/deploy/providers/webrtc
  - title: Architektur
    description: Ueberblick ueber die Systemarchitektur, Datenfluss, Verschluesselung und Echtzeitkommunikation.
    href: /docs/reference/architecture
  - title: Fehlerbehebung
    description: Loesungen fuer haeufige Probleme mit Bereitstellung, Apps, Telefonie und Kryptografie.
    href: /docs/reference/troubleshooting
  - title: Sicherheitsmodell
    description: Verstehen Sie, was verschluesselt ist, was nicht, und das Bedrohungsmodell.
    href: /security
---

## Architekturuebersicht

Llamenos ist eine Single-Page-Anwendung (SPA), die auf **Cloudflare Workers** oder auf Ihrer eigenen Infrastruktur ueber **Docker Compose / Kubernetes** laufen kann. Sie unterstuetzt Sprachanrufe, SMS, WhatsApp und Signal -- alles an diensthabende Freiwillige ueber eine einheitliche Oberflaeche geroutet.

| Komponente | Cloudflare | Selbst gehostet |
|---|---|---|
| Frontend | Vite + React + TanStack Router | Gleich |
| Backend | Cloudflare Workers + 6 Durable Objects | Node.js + PostgreSQL |
| Speicher | R2 | MinIO (S3-kompatibel) |
| Sprache | Twilio, SignalWire, Vonage, Plivo oder Asterisk | Gleich |
| Nachrichten | SMS, WhatsApp Business, Signal | Gleich |
| Authentifizierung | Nostr-Schluessel (BIP-340 Schnorr) + WebAuthn | Gleich |
| Verschluesselung | ECIES (secp256k1 + XChaCha20-Poly1305) | Gleich |
| Transkription | Client-seitiges Whisper (WASM) | Client-seitiges Whisper (WASM) |
| i18n | i18next (13 Sprachen) | Gleich |

## Rollen

| Rolle | Kann sehen | Kann tun |
|---|---|---|
| **Anrufer** | Nichts (Telefon/SMS/WhatsApp/Signal) | Die Hotline anrufen oder Nachrichten senden |
| **Freiwilliger** | Eigene Notizen, zugewiesene Konversationen | Anrufe entgegennehmen, Notizen schreiben, Nachrichten beantworten |
| **Berichterstatter** | Nur eigene Berichte | Verschluesselte Berichte mit Anhaengen einreichen |
| **Administrator** | Alle Notizen, Berichte, Konversationen, Auditprotokolle | Freiwillige, Schichten, Kanaele, Sperren und Einstellungen verwalten |
