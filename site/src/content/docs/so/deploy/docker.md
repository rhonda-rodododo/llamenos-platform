---
title: "Deploy: Docker Compose"
description: Deploy Llamenos on your own server with Docker Compose.
---

Tilmaahan wuxuu kuu horseedaa sida loo dejiyo Llamenos iyadoo la isticmaalayo Docker Compose on a single server. Waxaad yeelan doontaa xotimo hotline oo shaqaysa oo dhamaystiran, iyadoo ku jira HTTPS is-dhaca, PostgreSQL xog ku meel gaar ah, kaydinta waxyaabaha, WebSocket relay, iyo tarjumaadda ikhtiyaarka ah — oo dhammaantood la maamulo by Docker Compose.

## Shuruudaha hore

- Linux server (Ubuntu 22.04+, Debian 12+, ama mid la mid ah)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ with Docker Compose v2
- `openssl` (pre-installed on most systems)
- Magac domain oo DNS u jeeddo server-kaaga IP

## Quick start (local)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Booqo **http://localhost:8000** oo raac setup wizard.

## Production deployment

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Setup script-ka:
1. Waxa uu soo saariyaa secrets xooggan oo random (database password, HMAC key, storage credentials, WebSocket relay secret)
2. Waxa uu qoriyaa `deploy/docker/.env`
3. Waxa uu dhisaa oo uu bilaabaa dhammaan adeegyada iyadoo la isticmaalayo production overlay
4. Waxa uu sugiyaa app-ka inuu noqdo caafimaad qaba

Production overlay-ka (`docker-compose.production.yml`) waxa uu ku darayaa:
- **TLS termination** via Let's Encrypt (Caddy)
- **Log rotation** for all services (10 MB max, 5 files)
- **Resource limits** (1 GB memory for the app)
- **Strict CSP** — only `wss://` WebSocket connections

Booqo `https://hotline.yourorg.com` oo raac setup wizard.

### Manual setup

```bash
cd deploy/docker
cp .env.example .env
```

Wax ka beddel `.env` oo buuxi secrets-ka loo baahan yahay:

```bash
# Hex secrets (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Passwords (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # from bun run bootstrap-admin
```

Bilow iyadoo la isticmaalayo production overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Docker Compose files

| File | Ujeeddo |
|------|---------|
| `deploy/docker/docker-compose.yml` | Base configuration — all services, networks, volumes |
| `deploy/docker/docker-compose.production.yml` | Production overlay — TLS Caddyfile, log rotation, resource limits |
| `deploy/docker/docker-compose.dev.yml` | Development overlay — exposes app port, file watching |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — deterministic test environment |

**Local development** waxay isticmaashaa dev overlay. **Production** waxay dhisaan production overlay-ka korkiisa base-ka.

## Core services

| Adeeg | Ujeeddo | Port |
|---------|---------|------|
| **app** | Llamenos application (Bun + Hono) | 3000 (internal) |
| **postgres** | PostgreSQL database | 5432 (internal) |
| **caddy** | Reverse proxy + automatic TLS | 8000 (local), 80/443 (production) |
| **RustFS** | S3-compatible file storage | 9000 (internal) |
| **WebSocket relay** | WebSocket relay for real-time events | 7777 (internal) |

## Optional profiles

Bilow adeegyada ikhtiyaarka ah iyadoo la isticmaalayo `--profile`:

```bash
# Signal messaging sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP bridge (PBX_TYPE selects backend)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM inference for message extraction
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana monitoring
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP bridge

Adeegga `sip-bridge` waxa uu isku xiraa Llamenos to a self-hosted PBX. Set `PBX_TYPE` in `.env` si aad u doorato backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Sidoo kale loo baahan yahay: `ARI_PASSWORD` and `BRIDGE_SECRET`.

## Signal notifier sidecar

Adeegga `signal-notifier` waxa uu shaqeeyaa port 3100. Waxa uu ku xalliyaa Signal contacts via HMAC-hashed identifiers — marnaba ma kaydsado plaintext phone numbers. Configure:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # must match in both app and sidecar
```

## Health checks

App-ka waxa uu soo bandhigayaa:
- `GET /health/ready` — ready when DB connected and migrations applied
- `GET /health/live` — alive check

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Verify deployment

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Configure webhooks

U jeedi webhooks-ka telephony provider-kaaga domain-kaaga:

| Webhook | URL |
|---------|-----|
| Voice (incoming) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Voice (status) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Forward to `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## Updating

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Data persists in Docker volumes (`postgres-data`, `RustFS-data`, etc.) across restarts and rebuilds.

## Backups

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Restore:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Automated backups (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Logs

```bash
cd deploy/docker

# All services
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# Last 100 lines
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Troubleshooting

### App won't start

```bash
docker compose logs app
docker compose config   # verify .env loaded
docker compose ps       # check service health
```

### Certificate issues

Caddy needs ports 80 and 443 open for ACME challenges:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Service architecture

![Docker Architecture](/diagrams/docker-architecture.svg)

## Next steps

- [Kubernetes Deployment](/docs/en/deploy/kubernetes) — horizontal scaling with Helm
- [Co-op Cloud Deployment](/docs/en/deploy/coopcloud) — cooperative hosting
- [Telephony Providers](/docs/en/deploy/providers/) — configure voice providers
