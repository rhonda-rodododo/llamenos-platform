---
title: "Deploy: Docker Compose"
description: I-deploy ang Llamenos sa iyong sariling server gamit ang Docker Compose.
---

Ang gabay na ito ay gagabay sa iyo sa pag-deploy ng Llamenos gamit ang Docker Compose sa isang server. Magkakaroon ka ng ganap na gumaganang hotline na may automatic HTTPS, PostgreSQL database, object storage, at opsyonal na transcription — lahat ay pinamamahalaan ng Docker Compose.

## Mga kinakailangan

- Isang Linux server (Ubuntu 22.04+, Debian 12+, o katulad)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ na may Docker Compose v2
- Isang domain name na nakaturo ang DNS sa IP ng iyong server
- [Bun](https://bun.sh/) na naka-install sa iyong lokal na machine (para sa paggawa ng admin keypair)

## 1. I-clone ang repository

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
```

## 2. Gumawa ng admin keypair

Kailangan mo ng Nostr keypair para sa admin account. Patakbuhin ito sa iyong lokal na machine (o sa server kung naka-install ang Bun):

```bash
bun install
bun run bootstrap-admin
```

I-save ang **nsec** (iyong admin login credential) nang ligtas. Kopyahin ang **hex public key** — kakailanganin mo ito sa susunod na hakbang.

## 3. I-configure ang environment

```bash
cd deploy/docker
cp .env.example .env
```

I-edit ang `.env` gamit ang iyong mga value:

```env
# Kinakailangan
ADMIN_PUBKEY=your_hex_public_key_from_step_2
DOMAIN=hotline.yourdomain.com

# PostgreSQL password (gumawa ng matibay na password)
PG_PASSWORD=$(openssl rand -base64 24)

# Pangalan ng hotline (ipinapakita sa IVR prompts)
HOTLINE_NAME=Your Hotline

# Voice provider (opsyonal — maaaring i-configure sa admin UI)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# MinIO credentials (palitan ang mga default!)
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key-min-8-chars
```

> **Mahalaga**: Magtakda ng matibay at natatanging mga password para sa `PG_PASSWORD`, `MINIO_ACCESS_KEY`, at `MINIO_SECRET_KEY`.

## 4. I-configure ang iyong domain

I-edit ang `Caddyfile` para itakda ang iyong domain:

```
hotline.yourdomain.com {
    reverse_proxy app:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
    }
}
```

Awtomatikong kinukuha at rine-renew ng Caddy ang Let's Encrypt TLS certificates para sa iyong domain. Siguraduhing bukas ang port 80 at 443 sa iyong firewall.

## 5. Simulan ang mga serbisyo

```bash
docker compose up -d
```

Magsisimula ito ng apat na pangunahing serbisyo:

| Serbisyo | Layunin | Port |
|----------|---------|------|
| **app** | Llamenos application | 3000 (internal) |
| **postgres** | PostgreSQL database | 5432 (internal) |
| **caddy** | Reverse proxy + TLS | 80, 443 |
| **minio** | File/recording storage | 9000, 9001 (internal) |

Suriin kung gumagana ang lahat:

```bash
docker compose ps
docker compose logs app --tail 50
```

I-verify ang health endpoint:

```bash
curl https://hotline.yourdomain.com/api/health
# → {"status":"ok"}
```

## 6. Unang pag-login

Buksan ang `https://hotline.yourdomain.com` sa iyong browser. Mag-login gamit ang admin nsec mula sa hakbang 2. Gagabayan ka ng setup wizard sa:

1. **Pagpangalan ng hotline** — display name para sa app
2. **Pagpili ng mga channel** — i-enable ang Voice, SMS, WhatsApp, Signal, at/o Reports
3. **Pag-configure ng mga provider** — ilagay ang mga credential para sa bawat channel
4. **Review at tapusin**

## 7. I-configure ang mga webhook

Ituro ang mga webhook ng iyong telephony provider sa iyong domain. Tingnan ang mga gabay na tiyak sa provider para sa mga detalye:

- **Voice** (lahat ng provider): `https://hotline.yourdomain.com/telephony/incoming`
- **SMS**: `https://hotline.yourdomain.com/api/messaging/sms/webhook`
- **WhatsApp**: `https://hotline.yourdomain.com/api/messaging/whatsapp/webhook`
- **Signal**: I-configure ang bridge para mag-forward sa `https://hotline.yourdomain.com/api/messaging/signal/webhook`

## Opsyonal: I-enable ang transcription

Ang Whisper transcription service ay nangangailangan ng karagdagang RAM (4 GB+). I-enable ito gamit ang `transcription` profile:

```bash
docker compose --profile transcription up -d
```

Magsisimula ito ng `faster-whisper-server` container gamit ang `base` model sa CPU. Para sa mas mabilis na transcription:

- **Gumamit ng mas malaking model**: I-edit ang `docker-compose.yml` at palitan ang `WHISPER__MODEL` ng `Systran/faster-whisper-small` o `Systran/faster-whisper-medium`
- **Gumamit ng GPU acceleration**: Palitan ang `WHISPER__DEVICE` ng `cuda` at magdagdag ng GPU resources sa whisper service

## Opsyonal: I-enable ang Asterisk

Para sa self-hosted SIP telephony (tingnan ang [Asterisk setup](/docs/deploy/providers/asterisk)):

```bash
# Itakda ang bridge shared secret
echo "BRIDGE_SECRET=$(openssl rand -hex 32)" >> .env

docker compose --profile asterisk up -d
```

## Opsyonal: I-enable ang Signal

Para sa Signal messaging (tingnan ang [Signal setup](/docs/deploy/providers/signal)):

```bash
docker compose --profile signal up -d
```

Kakailanganin mong i-register ang Signal number sa pamamagitan ng signal-cli container. Tingnan ang [Signal setup guide](/docs/deploy/providers/signal) para sa mga tagubilin.

## Pag-update

I-pull ang pinakabagong mga image at i-restart:

```bash
docker compose pull
docker compose up -d
```

Ang iyong data ay naka-persist sa Docker volumes (`postgres-data`, `minio-data`, atbp.) at mananatili sa container restarts at image updates.

## Mga backup

### PostgreSQL

Gamitin ang `pg_dump` para sa database backups:

```bash
docker compose exec postgres pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Para i-restore:

```bash
docker compose exec -T postgres psql -U llamenos llamenos < backup-20250101.sql
```

### MinIO storage

Iniimbak ng MinIO ang mga na-upload na file, recording, at attachment:

```bash
# Gamit ang MinIO client (mc)
docker compose exec minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker compose exec minio mc mirror local/llamenos /tmp/minio-backup
docker compose cp minio:/tmp/minio-backup ./minio-backup-$(date +%Y%m%d)
```

### Automated backups

Para sa production, mag-set up ng cron job:

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /path/to/llamenos/deploy/docker && docker compose exec -T postgres pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz 2>&1 | logger -t llamenos-backup
```

## Monitoring

### Health checks

Ang app ay nag-e-expose ng health endpoint sa `/api/health`. May built-in health checks ang Docker Compose. Mag-monitor sa labas gamit ang kahit anong HTTP uptime checker.

### Mga log

```bash
# Lahat ng serbisyo
docker compose logs -f

# Tiyak na serbisyo
docker compose logs -f app

# Huling 100 linya
docker compose logs --tail 100 app
```

### Paggamit ng resources

```bash
docker stats
```

## Troubleshooting

### Hindi magsimula ang app

```bash
# Tingnan ang mga error log
docker compose logs app

# I-verify na na-load ang .env
docker compose config

# Suriin kung healthy ang PostgreSQL
docker compose ps postgres
docker compose logs postgres
```

### Mga isyu sa certificate

Kailangan ng Caddy na bukas ang port 80 at 443 para sa ACME challenges. I-verify gamit ang:

```bash
# Tingnan ang Caddy logs
docker compose logs caddy

# I-verify na accessible ang mga port
curl -I http://hotline.yourdomain.com
```

### Mga MinIO connection error

Siguraduhing healthy ang MinIO service bago magsimula ang app:

```bash
docker compose ps minio
docker compose logs minio
```

## Arkitektura ng serbisyo

![Docker Architecture](/diagrams/docker-architecture.svg)

## Mga susunod na hakbang

- [Gabay para sa Admin](/docs/admin-guide) — i-configure ang hotline
- [Pangkalahatang-tanaw ng Self-Hosting](/docs/deploy/self-hosting) — ihambing ang mga opsyon sa deployment
- [Kubernetes Deployment](/docs/deploy/kubernetes) — lumipat sa Helm
