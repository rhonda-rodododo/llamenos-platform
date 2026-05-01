---
title: Self-Hosting Overview
description: Deploy Llamenos on your own infrastructure with Docker Compose, Kubernetes, or Co-op Cloud.
---

Llamenos is designed to run on your own infrastructure. Self-hosting gives you full control over data residency, network isolation, and infrastructure choices — critical for organizations protecting against well-funded adversaries.

## Deployment options

| Option | Best for | Complexity | Scaling |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Single-server, recommended start | Low | Single node |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Multi-service orchestration | Medium | Horizontal (multi-replica) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Co-op hosting collectives | Low | Single node (Swarm) |

## Docker Compose files

Docker Compose uses a layered approach:

| File | Purpose |
|------|---------|
| `deploy/docker/docker-compose.yml` | Base configuration — all services, networks, volumes |
| `deploy/docker/docker-compose.production.yml` | Production overlay — TLS via Let's Encrypt, log rotation, resource limits, strict CSP |
| `deploy/docker/docker-compose.dev.yml` | Development overlay — file watching, exposed ports |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — deterministic test environment |

For **local development**, use the dev overlay. For **production**, stack the production overlay:

```bash
# Local (backing services only + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Production
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

Or use the setup script:

```bash
./scripts/docker-setup.sh                                     # local
./scripts/docker-setup.sh --domain hotline.org --email a@b   # production
```

## Core services

All deployment targets run these core services:

| Component | Purpose |
|-----------|---------|
| **Bun application** | Hono API server + static file serving |
| **PostgreSQL** | Primary database |
| **RustFS** | S3-compatible blob storage (voicemail, attachments, exports) |
| **strfry** | Nostr relay for real-time events (always required) |
| **Caddy** | Reverse proxy + automatic TLS (Docker Compose) |

## Optional services

| Component | Profile | Purpose |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Zero-knowledge Signal notification sidecar (port 3100) |
| **sip-bridge** | `telephony` | SIP bridge for Asterisk/FreeSWITCH/Kamailio (PBX_TYPE selects backend) |
| **Ollama/vLLM** | `inference` | LLM inference for message extraction |
| **Prometheus + Grafana** | `monitoring` | Metrics and alerting |

## What you need

### Minimum requirements

- A Linux server (2 CPU cores, 2 GB RAM minimum)
- Docker and Docker Compose v2 (or a Kubernetes cluster for Helm)
- A domain name pointing to your server
- `openssl` (for generating secrets)
- At least one communication channel configured

### Optional components

- **Transcription** — client-side WASM Whisper; no additional server component needed
- **SIP bridge** — for self-hosted PBX (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** — for Signal messaging

## Cloudflare Tunnels (alternative ingress)

Instead of exposing ports 80/443 directly, you can use [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) for ingress. This hides your server IP and provides DDoS protection:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Configure the tunnel to forward to `http://localhost:3000`.

## Security considerations

Self-hosting gives you more control but also more responsibility:

- **Data at rest**: PostgreSQL data is stored unencrypted by default. Use full-disk encryption (LUKS, dm-crypt) on your server. Call notes, transcriptions, and messages are E2EE — the server never sees plaintext.
- **Network security**: Use a firewall. Only ports 80/443 should be publicly accessible.
- **Secrets**: Never put secrets in Docker Compose files or version control. Use `.env` files (gitignored) or Docker/Kubernetes secrets.
- **Updates**: Pull new images regularly. Watch the changelog for security fixes.
- **Backups**: Back up the PostgreSQL database and RustFS storage regularly.

## Ansible playbooks

The `deploy/ansible/` directory contains preflight and smoke-check playbooks:

```bash
# Pre-deployment system verification
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Post-deployment smoke check
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Next steps

- [Docker Compose Deployment](/docs/en/deploy/docker) — single-server guide
- [Kubernetes Deployment](/docs/en/deploy/kubernetes) — Helm chart
- [Co-op Cloud Deployment](/docs/en/deploy/coopcloud) — cooperative hosting
- [Telephony Providers](/docs/en/deploy/providers/) — configure voice providers
