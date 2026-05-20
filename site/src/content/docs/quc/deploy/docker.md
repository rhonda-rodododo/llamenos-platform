---
title: "Tik'otob': Docker Compose"
description: Tikojo Llamenos pa ri aservidor ruk' Docker Compose.
---

Ri ruk'amonik re' kuk'ut chaw jawi' takotob' Llamenos ruk' Docker Compose pa jun servidor. Katik'tik' jun ruch'awib'al k'ojik ruk' HTTPS rub'anikil, PostgreSQL tanajib'al tzij, yakb'al wuj, WebSocket relay, chuqa' tzijtz'ib'axik — konojel e k'ayew ruk' Docker Compose.

## K'atz'ina taq jastaq

- Jun Linux servidor (Ubuntu 22.04+, Debian 12+, o je')
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ ruk' Docker Compose v2
- `openssl` (tik'oj pa sib'alaj taq runik'oj)
- Jun dominio ruk' DNS cho ri aservidor IP

## Tik'otob' aninaq (rokiyonel)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Tatz'eta **http://localhost:8000** chuqa' tatz'ekelaj ri wokisaxik runik'oj.

## Tik'otob' producción

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Ri script nik'oj:
1. Kuk'otob' nim raqän etz'apwach taq tzij (clave tanajib'al tzij, HMAC clave, retalib'al yakb'al, WebSocket relay etz'apwach)
2. Kutz'ib'aj pa `deploy/docker/.env`
3. Kuk'otob' chuqa' tik'otob' konojel taq patan ruk' ri producción overlay
4. Royoj chi k'a ri runik'oj k'ojik

Ri producción overlay (`docker-compose.production.yml`) kutz'aq:
- **TLS chupik** ruk' Let's Encrypt (Caddy)
- **Tzolik wuj** chi kij konojel taq patan (10 MB nim, 5 wuj)
- **Ruch'ijik okisaxel** (1 GB ch'obonic che ri runik'oj)
- **CSP nim** — xwi `wss://` WebSocket k'ayb'al

Tatz'eta `https://hotline.yourorg.com` chuqa' tatz'ekelaj ri wokisaxik runik'oj.

### Nik'oj ruk' aq'ab'

```bash
cd deploy/docker
cp .env.example .env
```

Tanik'aj `.env` chuqa' tachapij ri etz'apwach taq tzij:

```bash
# Hex etz'apwach (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Taq etz'apwach (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # pa bun run bootstrap-admin
```

Tik'otob' ruk' ri producción overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Docker Compose wuj

| Wuj | Patanik |
|-----|---------|
| `deploy/docker/docker-compose.yml` | Base nik'oj — konojel taq patan, taq k'ayb'al, taq yakb'al |
| `deploy/docker/docker-compose.production.yml` | Producción overlay — TLS Caddyfile, tzolik wuj, ruch'ijik okisaxel |
| `deploy/docker/docker-compose.dev.yml` | Desarrollo overlay — kuk'ut puerto app, okisaxik wuj |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — k'ojik test okisaxik |

**Rokiyonel desarrollo** kuk'ay ri dev overlay. **Producción** kuchap ri producción overlay pa ruwi' ri base.

## Core taq patan

| Patan | Patanik | Puerto |
|-------|---------|--------|
| **app** | Llamenos runik'oj (Bun + Hono) | 3000 (pa ranik'oj) |
| **postgres** | PostgreSQL tanajib'al tzij | 5432 (pa ranik'oj) |
| **caddy** | Tzalq'otz chib'äl + rub'anikil TLS | 8000 (rokiyonel), 80/443 (producción) |
| **RustFS** | S3-compatible wuj yakb'al | 9000 (pa ranik'oj) |
| **WebSocket relay** | WebSocket relay chike taq k'ak' tzij | 7777 (pa ranik'oj) |

## Taq patan e tacha'

Tik'otob' taq patan e tacha' ruk' `--profile`:

```bash
# Signal messaging sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP puerta (PBX_TYPE kucha' backend)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM ch'obonic chike tzij etzelaxik
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana okisaxik
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP puerta

Ri `sip-bridge` patan kuk'ay Llamenos ruk' jun tikojo tik'otob' PBX. Taya' `PBX_TYPE` pa `.env` chike tacha' ri backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Chuqa' k'atz'in: `ARI_PASSWORD` chuqa' `BRIDGE_SECRET`.

## Signal notifier sidecar

Ri `signal-notifier` patan tik'ayew pa puerto 3100. Kuch'ob' Signal taq k'ayb'al ruk' HMAC-etalaq taq retalib'al — man tiyak ta taq rajilab'al teléfono pa tzij. Tawokisaj:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # k'atz'in chikij pa app chuqa' sidecar
```

## Chajinik taq okisaxik

Ri runik'oj kuk'ut:
- `GET /health/ready` — k'oj toq DB k'ayew chuqa' migrations e b'an
- `GET /health/live` — k'as chajinik

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Tachajij ri tik'otob'

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Tawokisaj taq webhook

Tawokisaj ri ak'utunel telefonía webhooks cho ri adominio:

| Webhook | URL |
|---------|-----|
| Ch'ab'äl (okisan) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Ch'ab'äl (rajal) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Tak'ay cho `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## K'ak' taq rub'anikil

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Ri tzij k'as pa Docker taq yakb'al (`postgres-data`, `RustFS-data`, etc.) pa ronojel taq tik'otob' chuqa' b'anik.

## Yakb'al

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Tatzolin:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Yakb'al achi'el (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Taq wuj

```bash
cd deploy/docker

# Konojel taq patan
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Jun patan
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# Chrij 100 taq ruxak
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Ruchojmil taq jastaq

### Runik'oj man tik'otob' ta

```bash
docker compose logs app
docker compose config   # tachajij .env tz'aq
docker compose ps       # tachajij patan chajinik
```

### Taq ch'ayik ruk' certificado

Caddy k'atz'in puertos 80 chuqa' 443 chike ACME taq ch'ob'onik:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Ruchakul ri runik'oj

![Docker Arquitectura](/diagrams/docker-architecture.svg)

## Chi k'aj taq b'ey

- [Kubernetes Tik'otob'](/docs/en/deploy/kubernetes) — horizontal scaling ruk' Helm
- [Co-op Cloud Tik'otob'](/docs/en/deploy/coopcloud) — moloj okisaxik
- [K'utunela' Telefonía](/docs/en/deploy/providers/) — tawokisaj k'utunel ch'ab'äl
