---
title: "መተግበር: Docker Compose"
description: ላሜኖስን በDocker Compose በራስዎ ሰርቨር ላይ ያስተናግዱ።
---

ይህ መመሪያ ላሜኖስን በአንድ ሰርቨር ላይ ከDocker Compose ጋር ለመተግበር ያስተምርዎታል። ከራስ-ሰር HTTPS ጋር ሙሉ በሙሉ የሰራ ሞቃዲያን፣ PostgreSQL ዳታቤዝ፣ የኦብጅት ማከማቻ፣ WebSocket relay፣ እና አማራጭ transcription — ሁሉም በDocker Compose የሚተዳደሩ ይኖርዎታል።

## ቅድመ ሁኔታዎች

- Linux ሰርቨር (Ubuntu 22.04+፣ Debian 12+፣ ወይም ተመሳሳይ)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ ከDocker Compose v2 ጋር
- `openssl` (በአብዛኛው ስርዓቶች ላይ ቀድሞ ተጭኗል)
- DNS የሰርቨርዎን IP የሚያመለክት ዶሜን ስም

## ፈጣን መነሻ (አካባቢ)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

**http://localhost:8000** ይጎብኙ እና የማዋቀሪያ ዊዘርዱን ይከተሉ።

## የምርት መተግበርያ

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

የማዋቀሪያ ጭብጡ፦
1. ጠንካራ የዘፈቀደ ሚስጥራት ያመነጫል (የዳታቤዝ ይለፍቃል፣ HMAC key፣ የማከማቻ ማስረጃ፣ WebSocket relay ሚስጥር)
2. ወደ `deploy/docker/.env` ይጽፋል
3. በምርት overlay ሁሉንም አገልግሎቶች ይገነባል እና ያስጀምራል
4. መተግበሪያው ጤናማ እስኪሆን ይጠብቃል

የምርት overlay (`docker-compose.production.yml`) ይጨምራል፦
- **TLS ማስወገድ** በLet's Encrypt (Caddy) በኩል
- **የመዝገብ ተመላላሽ** ለሁሉም አገልግሎቶች (ከፍተኛ 10 MB፣ 5 ፋይሎች)
- **የመረጃ ገደቦች** (ለመተግበሪያው 1 GB ማህደረ ትውስታ)
- **ጠባብ CSP** — `wss://` WebSocket ግንኙነቶች ብቻ

`https://hotline.yourorg.com` ይጎብኙ እና የማዋቀሪያ ዊዘርዱን ይከተሉ።

### በእጅ ማዋቀር

```bash
cd deploy/docker
cp .env.example .env
```

`.env` ኢዲት ያድርጉ እና አስፈላጊ ሚስጥራትን ይሙሉ፦

```bash
# Hex ሚስጥራት (HMAC_SECRET፣ SERVER_SECRET):
openssl rand -hex 32

# የይለፍቃሎች (PG_PASSWORD፣ STORAGE_ACCESS_KEY፣ STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # ከbun run bootstrap-admin
```

ከምርት overlay ጋር ያስጀምሩ፦

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Docker Compose ፋይሎች

| ፋይል | ዓላማ |
|------|---------|
| `deploy/docker/docker-compose.yml` | መሰረታዊ ውቅር — ሁሉም አገልግሎቶች፣ ኔትዎርኮች፣ ኮሎሞች |
| `deploy/docker/docker-compose.production.yml` | የምርት overlay — TLS Caddyfile፣ የመዝገብ ተመላላሽ፣ የመረጃ ገደቦች |
| `deploy/docker/docker-compose.dev.yml` | የልማት overlay — የመተግበሪያ ፖርት ያጋራል፣ የፋይል መቆጣጠሪያ |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — የተወሰነ የሙከራ አካባቢ |

**አካባቢ ልማት** የልማት overlayን ይጠቀማል። **ምርት** የምርት overlayን በመሰረታዊው ላይ ይጨምራል።

## ማዕከላዊ አገልግሎቶች

| አገልግሎት | ዓላማ | ፖርት |
|---------|------|------|
| **app** | ላሜኖስ መተግበሪያ (Bun + Hono) | 3000 (የውስጥ) |
| **postgres** | PostgreSQL ዳታቤዝ | 5432 (የውስጥ) |
| **caddy** | የገለልተኛ ፕሮክሲ + ራስ-ሰር TLS | 8000 (አካባቢ)፣ 80/443 (ምርት) |
| **RustFS** | S3-ተኳሃኝ የፋይል ማከማቻ | 9000 (የውስጥ) |
| **WebSocket relay** | የበጊዜ ለውጥ ክስተቶች WebSocket relay | 7777 (የውስጥ) |

## አማራጭ ፕሮፋይሎች

ከ`--profile` ጋር አማራጭ አገልግሎቶችን ያስጀምሩ፦

```bash
# Signal መልእክት ሰጪ sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP bridge (PBX_TYPE የኋላ-ገጽ ይመርጣል)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM inference ለመልእክት ማውጣት
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana monitoring
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP bridge

የ`sip-bridge` አገልግሎት ላሜኖስን ከራስ-ማስተናገድ PBX ጋር ያገናኛል። ከ`.env` ውስጥ `PBX_TYPE` ያዘጋጁ የኋላ-ገጽ ለመምረጥ፦

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

እንዲሁም ጠቃሚ ነው፦ `ARI_PASSWORD` እና `BRIDGE_SECRET`።

## Signal notifier sidecar

የ`signal-notifier` አገልግሎት በፖርት 3100 ላይ ይሰራል። Signal ተደራዳሪዎችን በHMAC-hashed መለያዎች ያፈላል — ፍሬ ቁጥሮችን ከቶ አይሰቅልም። ያዋቅሩ፦

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # በመተግበሪያ እና sidecar ሁለቱም መስማማት አለበት
```

## የጤና ፍተሻዎች

መተግበሪያው ያጋራል፦
- `GET /health/ready` — DB ተገናኝ ሲሆን እና migrations ሲተገበሩ ዝግጁ ነው
- `GET /health/live` — የህይወት ፍተሻ

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## መተግበርያውን ያረጋግጡ

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Webhooks ያዋቅሩ

የትሊፎኒ አቅራቢዎን webhooks ወደ ዶሜንዎ ያቅኑ፦

| Webhook | URL |
|---------|-----|
| Voice (incoming) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Voice (status) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | ወደ `https://hotline.yourorg.com/api/messaging/signal/webhook` ያስተላልፉ |

## ማዘመን

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

የመረጃዎች በDocker volumes (`postgres-data`፣ `RustFS-data`፣ ወዘተ.) ውስጥ ይቆያል በአዳዲስ እና በመልሶ ግንባታዎች ድምር።

## ተተኪዎች

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

ማገገም፦

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### ራስ-ሰር ተተኪዎች (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## መዝገቦች

```bash
cd deploy/docker

# ሁሉም አገልግሎቶች
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# የተወሰነ አገልግሎት
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# የመጨረሻ 100 መስመሮች
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## ችግር መፍቻ

### መተግበሪያው አይጀምርም

```bash
docker compose logs app
docker compose config   # .env ጭኖ እንደሆነ ያረጋግጡ
docker compose ps       # የአገልግሎት ጤና ያረጋግጡ
```

### የሰርተፊኬት ችግሮች

Caddy ለACME ፈተናዎች ፖርት 80 እና 443 ያስፈልገዋል፦

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## የአገልግሎት ንድፍ

![Docker Architecture](/diagrams/docker-architecture.svg)

## ቀጣይ ደረጃዎች

- [Kubernetes መተግበርያ](/docs/en/deploy/kubernetes) — ከHelm ጋር አግድሚያዊ ስራዊዊነት
- [Co-op Cloud መተግበርያ](/docs/en/deploy/coopcloud) — ታዳሚ ማስተናገድ
- [Telephony Providers](/docs/en/deploy/providers/) — የድምፅ አቅራቢዎችን ያዋቅሩ
