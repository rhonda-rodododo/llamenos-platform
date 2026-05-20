---
title: "Hawlgeli: Docker Compose"
description: Ku hawlgeli Llámenos server-kaaga gaarka ah iyadoo la isticmaalayo Docker Compose.
---

Tilmaantani waxay kugu hagaysaa hawlgalka Llámenos iyadoo la isticmaalayo Docker Compose hal server. Waxaad heli doontaa khad gurmad oo gabi ahaanba shaqeeya oo leh HTTPS toos ah, PostgreSQL database, kaydinta shayga, WebSocket relay, iyo qoraal-qaadista ikhtiyaariga ah — dhammaantoodna waxaa maamula Docker Compose.

## Waxyaabaha loo baahan yahay

- Server Linux ah (Ubuntu 22.04+, Debian 12+, ama la mid ah)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ oo leh Docker Compose v2
- `openssl` (si horudhac ah ugu rakiban nidaamyada badankood)
- Magac domain ah oo leh DNS ku tilmaamaya IP-ga server-kaaga

## Bilow degdeg ah (maxalli)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Booqo **http://localhost:8000** oo raac qalabka dejinta.

## Hawlgalka wax-soo-saarka

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Qoraalka dejinta:
1. Wuxuu soo saaraa sirta xooggan oo random ah (dammaanadda database-ka, furaha HMAC, aqoonsiyaha kaydinta, sirta WebSocket relay)
2. Wuxuu u qoraa `deploy/docker/.env`
3. Wuxuu dhisaa oo bilaabaa dhammaan adeegyada iyadoo la isticmaalayo daboolka wax-soo-saarka
4. Wuxuu sugaa ilaa abku caafimaad qabo

Daboolka wax-soo-saarka (`docker-compose.production.yml`) wuxuu ku daraa:
- **Dhamaadka TLS** iyada oo loo marayo Let's Encrypt (Caddy)
- **Wareejinta log-ga** dhammaan adeegyada (ugu badnaan 10 MB, 5 fayl)
- **Xaddidaadda kheyraadka** (1 GB xusuusta abka)
- **CSP adag** — oo keliya xiriirrada `wss://` WebSocket

Booqo `https://hotline.yourorg.com` oo raac qalabka dejinta.

### Dejinta gacanta

```bash
cd deploy/docker
cp .env.example .env
```

Tafatir `.env` oo buuxi sirta loo baahan yahay:

```bash
# Sirta hex (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Dammaanadaha (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # ka yimid bun run bootstrap-admin
```

Ku bilow daboolka wax-soo-saarka:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Faylasha Docker Compose

| Faylka | Ujeeddo |
|---|---|
| `deploy/docker/docker-compose.yml` | Qaabeynta asaasiga — dhammaan adeegyada, shabakadaha, mugga |
| `deploy/docker/docker-compose.production.yml` | Daboolka wax-soo-saarka — TLS Caddyfile, wareejinta log-ga, xaddidaadda kheyraadka |
| `deploy/docker/docker-compose.dev.yml` | Daboolka horumarinta — wuxuu soo bandhigayaa port-ka abka, daawashada faylka |
| `deploy/docker/docker-compose.ci.yml` | Daboolka CI — deegaan tijaabo oo go'aamiye ah |

**Horumarinta maxalliga ah** waxay isticmaashaa daboolka horumarinta. **Wax-soo-saarka** wuxuu saaraa daboolka wax-soo-saarka korka asaaska.

## Adeegyada aasaasiga ah

| Adeegga | Ujeeddo | Port |
|---|---|---|
| **app** | Abka Llámenos (Bun + Hono) | 3000 (gudaha) |
| **postgres** | Kaydka xogta PostgreSQL | 5432 (gudaha) |
| **caddy** | Reverse proxy + TLS toos ah | 8000 (maxalli), 80/443 (wax-soo-saar) |
| **RustFS** | Kaydka faylka S3-compatible | 9000 (gudaha) |
| **WebSocket relay** | WebSocket relay ee dhacdooyinka wakhtiga-dhabta ah | 7777 (gudaha) |

## Profiles-ka ikhtiyaariga ah

Ku bilow adeegyada ikhtiyaariga ah `--profile`:

```bash
# Signal messaging sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP bridge (PBX_TYPE wuxuu doortaa backend-ka)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM inference soo-saarka farriinta
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana monitoring
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## Buundada SIP

Adeegga `sip-bridge` wuxuu ku xiraa Llámenos PBX is-hawlgabeysan. Ku deji `PBX_TYPE` `.env` si aad u doorato backend-ka:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Sidoo kale loo baahan yahay: `ARI_PASSWORD` iyo `BRIDGE_SECRET`.

## Signal notifier sidecar

Adeegga `signal-notifier` wuxuu ku shaqeeyaa port 3100. Wuxuu xalliyaa xiriirrada Signal iyada oo loo marayo aqoonsiyeyaasha HMAC-lahasheeyay — marna kuma kaydiyo lambarrada taleefannada qoraalka cad. Qaabee:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # waa inay ku mid tahay abka iyo sidecar-ka
```

## Baaritaannada caafimaadka

Abku wuxuu soo bandhigaa:
- `GET /health/ready` — diyaar marka DB ku xiran tahay oo migrations la dabaqay
- `GET /health/live` — baaritaan noolaansho

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Xaqiiji hawlgalka

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Qaabee webhooks-ka

U jeedi webhooks-ka bixiyahaaga telefoonada domain-kaaga:

| Webhook | URL |
|---|---|
| Codka (soo-gala) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Codka (heerka) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Hor u gudbi `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## Cusboonaysiinta

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Xogta waxay ku sii jirtaa mugga Docker (`postgres-data`, `RustFS-data`, iwm) dib-u-bilowga iyo dib-u-dhismayaasha.

## Kaydka

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > kayd-$(date +%Y%m%d).sql
```

Soo celi:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < kayd-20250101.sql
```

### Kaydka tooska ah (cron)

```bash
# /etc/cron.d/llamenos-kayd
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Log-yada

```bash
cd deploy/docker

# Dhammaan adeegyada
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Adeeg gaar ah
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# 100 sadar ee ugu dambeeyay
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Cillad-xallinta

### Abku ma bilaabmayo

```bash
docker compose logs app
docker compose config   # xaqiiji .env la soo dajiyay
docker compose ps       # hubi caafimaadka adeegga
```

### Arrimaha shahaadada

Caddy wuxuu u baahan yahay port-yada 80 iyo 443 inay furan yihiin ACME challenges:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Qaab-dhismeedka adeegga

![Qaab-dhismeedka Docker](/diagrams/docker-architecture.svg)

## Tallaabooyinka xiga

- [Hawlgalka Kubernetes](/docs/en/deploy/kubernetes) — baaxadaynta tooska ah ee Helm
- [Hawlgalka Co-op Cloud](/docs/en/deploy/coopcloud) — martigelinta iskaashiga ah
- [Bixiyeyaasha Telefoonada](/docs/en/deploy/providers/) — qaabee bixiyeyaasha codka
