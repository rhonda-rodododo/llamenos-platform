---
title: Self-Hosting Overview
description: Deploy Llamenos on your own infrastructure with Docker Compose, Kubernetes, or Co-op Cloud.
---

Llamenos waxa uu u sameysan yahay inuu ku shaqeeyo infrastructure-kaagaaga. Self-hosting waxay kuu siisaa xakameeyn dhamaan data residency, network isolation, iyo doorashooyinka infrastructure — muhiim u ah ururada ilaalinaya dagaalka la dagaallamayo.

## Deployment options

| Ikhtiyaar | Ugu fiican | Complexity | Scaling |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Single-server, recommended start | Low | Single node |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Multi-service orchestration | Medium | Horizontal (multi-replica) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Co-op hosting collectives | Low | Single node (Swarm) |

## Docker Compose files

Docker Compose waxa uu isticmaalaa hab laabaan:

| File | Ujeeddo |
|------|---------|
| `deploy/docker/docker-compose.yml` | Base configuration — all services, networks, volumes |
| `deploy/docker/docker-compose.production.yml` | Production overlay — TLS via Let's Encrypt, log rotation, resource limits, strict CSP |
| `deploy/docker/docker-compose.dev.yml` | Development overlay — file watching, exposed ports |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — deterministic test environment |

**Local development**, isticmaal dev overlay. **Production**, stack production overlay:

```bash
# Local (backing services only + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Production
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

Ama isticmaal setup script:

```bash
./scripts/docker-setup.sh                                     # local
./scripts/docker-setup.sh --domain hotline.org --email a@b   # production
```

## Core services

Dhammaan deployment targets waxay ku shaqeynayaan core services-kaan:

| Qayb | Ujeeddo |
|-----------|---------|
| **Bun application** | Hono API server + static file serving |
| **PostgreSQL** | Primary database |
| **RustFS** | S3-compatible blob storage (voicemail, attachments, exports) |
| **WebSocket relay** | WebSocket relay for real-time events (always required) |
| **Caddy** | Reverse proxy + automatic TLS (Docker Compose) |

## Optional services

| Qayb | Profile | Ujeeddo |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Zero-knowledge Signal notification sidecar (port 3100) |
| **sip-bridge** | `telephony` | SIP bridge for Asterisk/FreeSWITCH/Kamailio (PBX_TYPE selects backend) |
| **Ollama/vLLM** | `inference` | LLM inference for message extraction |
| **Prometheus + Grafana** | `monitoring` | Metrics and alerting |

## What you need

### Minimum requirements

- Linux server (2 CPU cores, 2 GB RAM minimum)
- Docker and Docker Compose v2 (ama Kubernetes cluster for Helm)
- Magac domain pointing to your server
- `openssl` (for generating secrets)
- Ugu yaraan hal communication channel configured

### Optional components

- **Transcription** — client-side WASM Whisper; ma u baahnato additional server component
- **SIP bridge** — for self-hosted PBX (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** — for Signal messaging

## Cloudflare Tunnels (alternative ingress)

Beddelka ah exposing ports 80/443 directly, waxaad isticmaali kartaa [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) for ingress. Tani waxay qarinaysaa server IP-gaaga oo waxay bixisaa DDoS protection:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Configure tunnel-ka inuu u jeeddo `http://localhost:3000`.

## Security considerations

Self-hosting waxay kuu siisaa xakameyn badan laakiin mas'uuliyad badan:

- **Data at rest**: PostgreSQL data is stored unencrypted by default. Isticmaal full-disk encryption (LUKS, dm-crypt) on your server. Call notes, transcriptions, iyo messages are E2EE — server-ka marnaba ma arko plaintext.
- **Network security**: Isticmaal firewall. Ports 80/443 kaliya ayaa loo baahan yahay inay ahaadaan publicly accessible.
- **Secrets**: Never put secrets in Docker Compose files ama version control. Isticmaal `.env` files (gitignored) ama Docker/Kubernetes secrets.
- **Updates**: Pull new images regularly. Daawo changelog for security fixes.
- **Backups**: Backup PostgreSQL database and RustFS storage regularly.

## Ansible playbooks

`deploy/ansible/` directory waxa ku jira preflight iyo smoke-check playbooks:

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
