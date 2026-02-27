---
title: Pangkalahatang-tanaw ng Self-Hosting
description: I-deploy ang Llamenos sa iyong sariling infrastructure gamit ang Docker Compose o Kubernetes.
---

Maaaring patakbuhin ang Llamenos sa Cloudflare Workers **o** sa iyong sariling infrastructure. Ang self-hosting ay nagbibigay sa iyo ng buong kontrol sa kung saan nakaimbak ang data, network isolation, at mga pagpili sa infrastructure — mahalaga para sa mga organisasyong hindi makagamit ng third-party cloud platforms o kailangang sumunod sa mahigpit na mga kinakailangan sa compliance.

## Mga opsyon sa deployment

| Opsyon | Pinakamainam para sa | Complexity | Scaling |
|--------|---------------------|------------|---------|
| [Cloudflare Workers](/docs/getting-started) | Pinakamadaling pagsisimula, global edge | Mababa | Awtomatiko |
| [Docker Compose](/docs/deploy-docker) | Single-server self-hosting | Katamtaman | Single node |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Multi-service orchestration | Mas mataas | Horizontal (multi-replica) |

## Mga pagkakaiba sa arkitektura

Parehong deployment target ay nagpapatakbo ng **eksaktong parehong application code**. Ang pagkakaiba ay nasa infrastructure layer:

| Bahagi | Cloudflare | Self-Hosted |
|--------|------------|-------------|
| **Backend runtime** | Cloudflare Workers | Node.js (sa pamamagitan ng Hono) |
| **Data storage** | Durable Objects (KV) | PostgreSQL |
| **Blob storage** | R2 | MinIO (S3-compatible) |
| **Transcription** | Client-side Whisper (WASM) | Client-side Whisper (WASM) |
| **Static files** | Workers Assets | Caddy / Hono serveStatic |
| **Real-time events** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **TLS termination** | Cloudflare edge | Caddy (automatic HTTPS) |
| **Gastos** | Batay sa paggamit (may libreng tier) | Gastos sa iyong server |

## Ano ang kailangan mo

### Minimum na mga kinakailangan

- Isang Linux server (minimum 2 CPU cores, 2 GB RAM)
- Docker at Docker Compose v2 (o Kubernetes cluster para sa Helm)
- Isang domain name na nakaturo sa iyong server
- Isang admin keypair (ginawa gamit ang `bun run bootstrap-admin`)
- Hindi bababa sa isang communication channel (voice provider, SMS, atbp.)

### Mga opsyonal na bahagi

- **Whisper transcription** — nangangailangan ng 4 GB+ RAM (CPU) o GPU para sa mas mabilis na pagproseso
- **Asterisk** — para sa self-hosted SIP telephony (tingnan ang [Asterisk setup](/docs/setup-asterisk))
- **Signal bridge** — para sa Signal messaging (tingnan ang [Signal setup](/docs/setup-signal))

## Mabilisang paghahambing

**Pumili ng Docker Compose kung:**
- Nagpapatakbo ka sa isang server o VPS
- Gusto mo ang pinaka-simpleng self-hosted setup
- Komportable ka sa mga Docker basics

**Pumili ng Kubernetes (Helm) kung:**
- Mayroon ka nang K8s cluster
- Kailangan mo ng horizontal scaling (maraming replica)
- Gusto mong mag-integrate sa umiiral na K8s tooling (cert-manager, external-secrets, atbp.)

## Mga konsiderasyon sa seguridad

Ang self-hosting ay nagbibigay ng mas maraming kontrol pero mas marami ring responsibilidad:

- **Data at rest**: Ang PostgreSQL data ay naka-store nang hindi naka-encrypt bilang default. Gumamit ng full-disk encryption (LUKS, dm-crypt) sa iyong server, o i-enable ang PostgreSQL TDE kung available. Tandaan na ang mga call note at transcription ay naka-E2EE na — hindi kailanman nakikita ng server ang plaintext.
- **Network security**: Gumamit ng firewall para limitahan ang access. Tanging port 80/443 lang ang dapat na publicly accessible.
- **Mga secret**: Huwag kailanman ilagay ang mga secret sa Docker Compose files o version control. Gumamit ng `.env` files (hindi kasama sa mga image) o Docker/Kubernetes secrets.
- **Mga update**: Regular na mag-pull ng bagong mga image. Bantayan ang [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) para sa mga security fix.
- **Mga backup**: Regular na i-backup ang PostgreSQL database at MinIO storage. Tingnan ang backup section sa bawat deployment guide.

## Mga susunod na hakbang

- [Docker Compose deployment](/docs/deploy-docker) — magsimula sa loob ng 10 minuto
- [Kubernetes deployment](/docs/deploy-kubernetes) — i-deploy gamit ang Helm
- [Pagsisimula](/docs/getting-started) — Cloudflare Workers deployment
