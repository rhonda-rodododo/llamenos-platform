---
title: "Belavkirin: Docker Compose"
description: Llamenos bi Docker Compose li ser servera xwe ya xwe belav bikin.
---

Ev rêber we bi riya belavkirina Llamenos bi Docker Compose li ser serverek yekane re rêve dibe. Hûnê xeta germê ya tevahî bi HTTPS-ya otomatîk, danegeha PostgreSQL, depoya objeyan, WebSocket relay, û transkripsiyona bixwece bidin destpêkirin — hemî ji hêla Docker Compose ve têne birêvebirin.

## Pêşdibistan

- Serverek Linux (Ubuntu 22.04+, Debian 12+, an hemanê)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ bi Docker Compose v2
- `openssl` (pêş-sazkirî li ser piraniya pergalan)
- Navê domainek bi DNS ku li IP-ya servera we nîşan dide

## Destpêkira lez (herêmî)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Biçin **http://localhost:8000** û sêrbaziya sazkirinê bişopînin.

## Belavkirina hilberînê

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Scripta sazkirinê:
1. Veşartiyên bihêz ên ketinî çêdike (pêborîna danegehê, kilîta HMAC, erkdanên depoyê, veşartiya WebSocket relay)
2. Wan di `deploy/docker/.env` de tomar dike
3. Bi riya overlaya hilberînê hemî karûbaran ava dike û dest pê dike
4. Li benda ku sepan bibe tendurist e

Overlaya hilberînê (`docker-compose.production.yml`) lê zêde dike:
- **Sîrkirina TLS** bi riya Let's Encrypt (Caddy)
- **Rotasyona têketinê** ji bo hemî karûbaran (herî zêde 10 MB, 5 pel)
- **Sînorkirinên çavkaniyan** (1 GB bîr ji bo sepana)
- **CSP ya tund** — tenê girêdanên WebSocket ên `wss://`

Biçin `https://hotline.yourorg.com` û sêrbaziya sazkirinê bişopînin.

### Sazkirina destan

```bash
cd deploy/docker
cp .env.example .env
```

`.env` biguherînin û veşartiyên pêwîst dagirin:

```bash
# Veşartiyên hex (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Pêborîn (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # ji bun run bootstrap-admin
```

Bi overlaya hilberînê dest pê bikin:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Pelên Docker Compose

| Pel | Mebest |
|------|---------|
| `deploy/docker/docker-compose.yml` | Sazkirina bingehîn — hemî karûbar, tor, tomar |
| `deploy/docker/docker-compose.production.yml` | Overlaya hilberînê — TLS Caddyfile, rotasyona têketinê, sînorkirinên çavkaniyan |
| `deploy/docker/docker-compose.dev.yml` | Overlaya pêşveçûnê — porta sepana eşkere dike, şopandina pelê |
| `deploy/docker/docker-compose.ci.yml` | Overlaya CI — jîngeha testê ya diyarkirî |

**Pêşveçûna herêmî** overlaya pêşveçûnê bikar tîne. **Hilberîn** overlaya hilberînê li ser bingehê digire:

```bash
# Herêmî (tenê karûbarên piştgirî + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Hilberîn
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

An jî scripta sazkirinê bikar bînin:

```bash
./scripts/docker-setup.sh                                     # herêmî
./scripts/docker-setup.sh --domain hotline.org --email a@b   # hilberîn
```

## Karûbarên bingehîn

| Karûbar | Mebest | Port |
|---------|--------|------|
| **app** | Sepana Llamenos (Bun + Hono) | 3000 (hundirîn) |
| **postgres** | Danegeha PostgreSQL | 5432 (hundirîn) |
| **caddy** | Proksiya berevajî + TLS-ya otomatîk | 8000 (herêmî), 80/443 (hilberîn) |
| **RustFS** | Depoya pelê ya lihevhatî bi S3 | 9000 (hundirîn) |
| **WebSocket relay** | WebSocket relay ji bo bûyerên bi-dem | 7777 (hundirîn) |

## Profîlên bixwece

Karûbarên bixwece bi `--profile` dest pê bikin:

```bash
# Signal messaging sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP bridge (PBX_TYPE backend hilbijêre)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM inference ji bo derxistina peyamê
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana çavdêriyê
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP bridge

Karûbara `sip-bridge` Llamenos bi PBX-yek xwe-sazkirî ve girêdide. `PBX_TYPE` di `.env` de mîheng bikin da ku backend hilbijêrin:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Her wiha hewce ne: `ARI_PASSWORD` û `BRIDGE_SECRET`.

## Signal notifier sidecar

Karûbara `signal-notifier` li ser port 3100 dixebite. Ew bi riya nasnavên HMAC-hash-kirî têkiliyan çareser dike — ew qet hejmarên telefonê yên textê ya pût tomar nake. Mîheng bikin:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # divê li her du app û sidecar de lihev bike
```

## Kontrolên tenduristiyê

Sepan eşkere dike:
- `GET /health/ready` — amade dema ku DB girêdayî ye û guhertinên hatine sepandin
- `GET /health/live` — kontrola zindî

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Belavkirinê piştrast bikin

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Webhookan mîheng bikin

Webhookên pêşkêşkerê telefoniya xwe bi domaina xwe birêve bidin:

| Webhook | URL |
|---------|-----|
| Deng (hundirîn) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Deng (statû) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Forward to `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## Nûvekirin

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Danê di tomarên Docker de (`postgres-data`, `RustFS-data`, hwd.) li ser jêgerandin û dîsa-avanîbûnan domîne.

## Backup

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Vegerandin:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Backupên otomatîk (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Têketin

```bash
cd deploy/docker

# Hemî karûbar
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Karûbarek taybet
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# 100 rêzên dawî
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Çareserkirina Probleman

### Sepan nade destpêkirin

```bash
docker compose logs app
docker compose config   # piştrast bike ku .env hatiye barkirin
docker compose ps       # tenduristiya karûbarê kontrol bike
```

### Pirsgirêkên sertîfîkayê

Caddy hewceyî portên 80 û 437 ye ji bo pevçûnên ACME:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Mîmarîya karûbarê

![Docker Architecture](/diagrams/docker-architecture.svg)

## Gavên pêşerojê

- [Belavkirina Kubernetes](/docs/en/deploy/kubernetes) — firehbûna afoxî bi Helm
- [Belavkirina Co-op Cloud](/docs/en/deploy/coopcloud) — hosting a hevkariyê
- [Pêşkêşkerên Telefoniyê](/docs/en/deploy/providers/) — pêşkêşkerên deng mîheng bikin
