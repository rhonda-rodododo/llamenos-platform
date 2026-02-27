---
title: Uebersicht Selbst-Hosting
description: Stellen Sie Llamenos auf Ihrer eigenen Infrastruktur mit Docker Compose oder Kubernetes bereit.
---

Llamenos kann auf Cloudflare Workers **oder** auf Ihrer eigenen Infrastruktur laufen. Selbst-Hosting gibt Ihnen die volle Kontrolle ueber Datenresidenz, Netzwerkisolation und Infrastrukturentscheidungen -- wichtig fuer Organisationen, die keine Cloud-Plattformen von Drittanbietern nutzen koennen oder strenge Compliance-Anforderungen erfuellen muessen.

## Bereitstellungsoptionen

| Option | Am besten fuer | Komplexitaet | Skalierung |
|--------|----------------|--------------|------------|
| [Cloudflare Workers](/docs/getting-started) | Einfachster Start, globale Edge | Niedrig | Automatisch |
| [Docker Compose](/docs/deploy-docker) | Einzelserver-Selbst-Hosting | Mittel | Einzelner Knoten |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Multi-Service-Orchestrierung | Hoeher | Horizontal (Multi-Replikat) |

## Architekturunterschiede

Beide Bereitstellungsziele fuehren den **exakt gleichen Anwendungscode** aus. Der Unterschied liegt in der Infrastrukturschicht:

| Komponente | Cloudflare | Selbst gehostet |
|------------|------------|-----------------|
| **Backend-Runtime** | Cloudflare Workers | Node.js (ueber Hono) |
| **Datenspeicher** | Durable Objects (KV) | PostgreSQL |
| **Blob-Speicher** | R2 | MinIO (S3-kompatibel) |
| **Transkription** | Client-seitiges Whisper (WASM) | Client-seitiges Whisper (WASM) |
| **Statische Dateien** | Workers Assets | Caddy / Hono serveStatic |
| **Echtzeit-Events** | Nostr-Relay (Nosflare) | Nostr-Relay (strfry) |
| **TLS-Terminierung** | Cloudflare Edge | Caddy (automatisches HTTPS) |
| **Kosten** | Nutzungsbasiert (kostenloses Kontingent verfuegbar) | Ihre Serverkosten |

## Was Sie benoetigen

### Mindestanforderungen

- Ein Linux-Server (2 CPU-Kerne, mindestens 2 GB RAM)
- Docker und Docker Compose v2 (oder ein Kubernetes-Cluster fuer Helm)
- Ein Domainname, der auf Ihren Server verweist
- Ein Admin-Schluesselpaar (generiert mit `bun run bootstrap-admin`)
- Mindestens ein Kommunikationskanal (Sprachanbieter, SMS, etc.)

### Optionale Komponenten

- **Whisper-Transkription** -- erfordert 4 GB+ RAM (CPU) oder eine GPU fuer schnellere Verarbeitung
- **Asterisk** -- fuer selbst gehostete SIP-Telefonie (siehe [Asterisk-Einrichtung](/docs/setup-asterisk))
- **Signal-Bridge** -- fuer Signal-Nachrichten (siehe [Signal-Einrichtung](/docs/setup-signal))

## Schnellvergleich

**Waehlen Sie Docker Compose, wenn:**
- Sie auf einem einzelnen Server oder VPS laufen
- Sie das einfachstmoegliche selbst gehostete Setup wuenschen
- Sie mit Docker-Grundlagen vertraut sind

**Waehlen Sie Kubernetes (Helm), wenn:**
- Sie bereits einen K8s-Cluster haben
- Sie horizontale Skalierung benoetigen (mehrere Replikate)
- Sie mit vorhandenem K8s-Tooling integrieren moechten (cert-manager, external-secrets, etc.)

## Sicherheitsueberlegungen

Selbst-Hosting gibt Ihnen mehr Kontrolle, aber auch mehr Verantwortung:

- **Daten im Ruhezustand**: PostgreSQL-Daten werden standardmaessig unverschluesselt gespeichert. Verwenden Sie Festplattenverschluesselung (LUKS, dm-crypt) auf Ihrem Server, oder aktivieren Sie PostgreSQL TDE, falls verfuegbar. Beachten Sie, dass Anrufnotizen und Transkriptionen bereits E2EE sind -- der Server sieht niemals Klartext.
- **Netzwerksicherheit**: Verwenden Sie eine Firewall, um den Zugriff einzuschraenken. Nur die Ports 80/443 sollten oeffentlich zugaenglich sein.
- **Secrets**: Legen Sie Secrets niemals in Docker Compose-Dateien oder Versionskontrolle ab. Verwenden Sie `.env`-Dateien (von Images ausgeschlossen) oder Docker/Kubernetes-Secrets.
- **Aktualisierungen**: Laden Sie regelmaessig neue Images herunter. Beobachten Sie das [Changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) fuer Sicherheitskorrekturen.
- **Backups**: Sichern Sie die PostgreSQL-Datenbank und den MinIO-Speicher regelmaessig. Siehe den Backup-Abschnitt in jeder Bereitstellungsanleitung.

## Naechste Schritte

- [Docker Compose-Bereitstellung](/docs/deploy-docker) -- in 10 Minuten einsatzbereit
- [Kubernetes-Bereitstellung](/docs/deploy-kubernetes) -- mit Helm bereitstellen
- [Erste Schritte](/docs/getting-started) -- Cloudflare Workers-Bereitstellung
