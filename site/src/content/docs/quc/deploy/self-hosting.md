---
title: Rutz'etik Self-Hosting
description: Tich'ak Llamenos pa awachib'al rik'in Docker Compose, Kubernetes, o Co-op Cloud.
---

Llamenos tz'aqat richin samajin pa awachib'al. Self-hosting nuya' full control over data residency, network isolation, chuqa' infrastructure taq rucha'ik — critical richin taq k'ayib'äl nichajin chi kiwäch well-funded taq adversaries.

## Taq ruch'ak'ik rucha'ik

| Rucha'ik | Utziläj richin | Ruk'ayewal | Scaling |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Ruk'u'x samaj, nuchilab'ej rutikirib'al | Low | Ruk'u'x samaj |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Multi-service orchestration | Medium | Horizontal (multi-replica) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Co-op hosting collectives | Low | Ruk'u'x samaj (Swarm) |

## Docker Compose taq files

Docker Compose nrokisaj jun layered approach:

| File | Ruk'u'x samaj |
|------|---------|
| `deploy/docker/docker-compose.yml` | Base ruchojmil — konojel taq samaj, networks, volumes |
| `deploy/docker/docker-compose.production.yml` | Production overlay — TLS via Let's Encrypt, log rotation, resource limits, strict CSP |
| `deploy/docker/docker-compose.dev.yml` | Development overlay — file watching, exposed taq b'ey |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — deterministic test environment |

Richin **local development**, tokisäx ri dev overlay. Richin **production**, stack ri production overlay:

```bash
# Local (backing taq samaj xa + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Production
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

O tokisäx ri setup script:

```bash
./scripts/docker-setup.sh                                     # local
./scripts/docker-setup.sh --domain hotline.org --email a@b   # production
```

## Taq ruk'u'x samaj

Konojel taq ruch'ak'ik targets nik'oje' re' taq ruk'u'x samaj:

| Component | Ruk'u'x samaj |
|-----------|---------|
| **Bun application** | Hono API server + static file serving |
| **PostgreSQL** | Primary ruk'u'x tzij |
| **RustFS** | S3-compatible blob storage (voicemail, attachments, exports) |
| **WebSocket relay** | WebSocket relay richin k'ak'a' samajib'äl (junanel required) |
| **Caddy** | Reverse proxy + automatic TLS (Docker Compose) |

## Rucha'ik taq samaj

| Component | Profile | Ruk'u'x samaj |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Zero-knowledge Signal notification sidecar (b'ey 3100) |
| **sip-bridge** | `telephony` | SIP bridge richin Asterisk/FreeSWITCH/Kamailio (PBX_TYPE nucha' backend) |
| **Ollama/vLLM** | `inference` | LLM inference richin message extraction |
| **Prometheus + Grafana** | `monitoring` | Metrics chuqa' alerting |

## Achike nik'atzin

### Minimum taq k'ayewal

- Jun Linux ruk'u'x samaj (2 CPU cores, 2 GB RAM minimum)
- Docker chuqa' Docker Compose v2 (o jun Kubernetes cluster richin Helm)
- Jun ruk'u'x b'i'aj pointing pa awachib'al
- `openssl` (richin nitz'uk taq ewan taq tzij)
- Jun ch'ab'äl channel tz'aqat

### Rucha'ik taq components

- **Transcription** — client-side WASM Whisper; majun additional server component rajowaxik
- **SIP bridge** — richin self-hosted PBX (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** — richin Signal messaging

## Cloudflare Tunnels (alternative ingress)

Instead of exposing taq b'ey 80/443 directly, yatikïr nokisaj [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) richin ingress. Re' nuch'ajïx' awachib'al IP chuqa' nuya' DDoS protection:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Ruchojmil ri tunnel richin forward pa `http://localhost:3000`.

## Taq rutzijol rutzil

Self-hosting nuya' ch'aqa' control pero ch'aqa' responsibility:

- **Data at rest**: PostgreSQL data niyak unencrypted by default. Tokisäx full-disk encryption (LUKS, dm-crypt) pa awachib'al. Call notes, transcriptions, chuqa' taq tzij e E2EE — ri ruk'u'x samaj majun xk'ul plaintext.
- **Network rutzil**: Tokisäx jun firewall. Xa xe taq b'ey 80/443 k'o chi e publicly accessible.
- **Taq ewan taq tzij**: Majun ewan taq tzij pa Docker Compose files o version control. Tokisäx `.env` files (gitignored) o Docker/Kubernetes taq ewan taq tzij.
- **Taq rutz'ila'xik**: Tich'ak ch'aqa' chik taq images. Katz'eto' ri changelog richin security fixes.
- **Taq rutz'akuxik**: Tiya' rutz'akuxik ri PostgreSQL ruk'u'x tzij chuqa' RustFS storage regularly.

## Ansible playbooks

Ri `deploy/ansible/` cholaj nuk'ul preflight chuqa' smoke-check playbooks:

```bash
# Pre-deployment system verification
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Post-deployment smoke check
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Taq ruk'u'x samaj chik

- [Docker Compose Deployment](/docs/en/deploy/docker) — ruk'u'x samaj guide
- [Kubernetes Deployment](/docs/en/deploy/kubernetes) — Helm chart
- [Co-op Cloud Deployment](/docs/en/deploy/coopcloud) — cooperative hosting
- [Telephony Providers](/docs/en/deploy/providers/) — ruchojmil voice providers
