---
title: Self-Hosting Overview
description: Deploy Llamenos on your own infrastructure with Docker Compose or Kubernetes.
---

Llamenos can run on Cloudflare Workers **or** on your own infrastructure. Self-hosting gives you full control over data residency, network isolation, and infrastructure choices — important for organizations that can't use third-party cloud platforms or need to meet strict compliance requirements.

## Deployment options

| Option | Best for | Complexity | Scaling |
|--------|----------|------------|---------|
| [Cloudflare Workers](/docs/getting-started) | Easiest start, global edge | Low | Automatic |
| [Docker Compose](/docs/deploy-docker) | Single-server self-hosting | Medium | Single node |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Multi-service orchestration | Higher | Horizontal (multi-replica) |

## Architecture differences

Both deployment targets run the **exact same application code**. The difference is in the infrastructure layer:

| Component | Cloudflare | Self-Hosted |
|-----------|------------|-------------|
| **Backend runtime** | Cloudflare Workers | Node.js (via Hono) |
| **Data storage** | Durable Objects (KV) | PostgreSQL |
| **Blob storage** | R2 | MinIO (S3-compatible) |
| **Transcription** | Workers AI (Whisper) | faster-whisper container |
| **Static files** | Workers Assets | Caddy / Hono serveStatic |
| **WebSocket** | Hibernatable WebSockets | ws package (persistent) |
| **TLS termination** | Cloudflare edge | Caddy (automatic HTTPS) |
| **Cost** | Usage-based (free tier available) | Your server costs |

## What you need

### Minimum requirements

- A Linux server (2 CPU cores, 2 GB RAM minimum)
- Docker and Docker Compose v2 (or a Kubernetes cluster for Helm)
- A domain name pointing to your server
- An admin keypair (generated with `bun run bootstrap-admin`)
- At least one communication channel (voice provider, SMS, etc.)

### Optional components

- **Whisper transcription** — requires 4 GB+ RAM (CPU) or a GPU for faster processing
- **Asterisk** — for self-hosted SIP telephony (see [Asterisk setup](/docs/setup-asterisk))
- **Signal bridge** — for Signal messaging (see [Signal setup](/docs/setup-signal))

## Quick comparison

**Choose Docker Compose if:**
- You're running on a single server or VPS
- You want the simplest possible self-hosted setup
- You're comfortable with Docker basics

**Choose Kubernetes (Helm) if:**
- You already have a K8s cluster
- You need horizontal scaling (multiple replicas)
- You want to integrate with existing K8s tooling (cert-manager, external-secrets, etc.)

## Security considerations

Self-hosting gives you more control but also more responsibility:

- **Data at rest**: PostgreSQL data is stored unencrypted by default. Use full-disk encryption (LUKS, dm-crypt) on your server, or enable PostgreSQL TDE if available. Note that call notes and transcriptions are already E2EE — the server never sees plaintext.
- **Network security**: Use a firewall to restrict access. Only ports 80/443 should be publicly accessible.
- **Secrets**: Never put secrets in Docker Compose files or version control. Use `.env` files (excluded from images) or Docker/Kubernetes secrets.
- **Updates**: Pull new images regularly. Watch the [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) for security fixes.
- **Backups**: Back up the PostgreSQL database and MinIO storage regularly. See the backup section in each deployment guide.

## Next steps

- [Docker Compose deployment](/docs/deploy-docker) — get running in 10 minutes
- [Kubernetes deployment](/docs/deploy-kubernetes) — deploy with Helm
- [Getting Started](/docs/getting-started) — Cloudflare Workers deployment
