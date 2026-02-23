---
title: "Deploy: Docker Compose"
description: Deploy Llamenos on your own server with Docker Compose.
---

This guide walks you through deploying Llamenos with Docker Compose on a single server. You'll have a fully functional hotline with automatic HTTPS, PostgreSQL database, object storage, and optional transcription — all managed by Docker Compose.

## Prerequisites

- A Linux server (Ubuntu 22.04+, Debian 12+, or similar)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ with Docker Compose v2
- A domain name with DNS pointing to your server's IP
- [Bun](https://bun.sh/) installed locally (for generating the admin keypair)

## 1. Clone the repository

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
```

## 2. Generate the admin keypair

You need a Nostr keypair for the admin account. Run this on your local machine (or the server if Bun is installed):

```bash
bun install
bun run bootstrap-admin
```

Save the **nsec** (your admin login credential) securely. Copy the **hex public key** — you'll need it in the next step.

## 3. Configure environment

```bash
cd deploy/docker
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
ADMIN_PUBKEY=your_hex_public_key_from_step_2
DOMAIN=hotline.yourdomain.com

# PostgreSQL password (generate a strong one)
PG_PASSWORD=$(openssl rand -base64 24)

# Hotline display name (shown in IVR prompts)
HOTLINE_NAME=Your Hotline

# Voice provider (optional — can configure via admin UI)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# MinIO credentials (change from defaults!)
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key-min-8-chars
```

> **Important**: Set strong, unique passwords for `PG_PASSWORD`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY`.

## 4. Configure your domain

Edit the `Caddyfile` to set your domain:

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

Caddy automatically obtains and renews Let's Encrypt TLS certificates for your domain. Make sure ports 80 and 443 are open in your firewall.

## 5. Start the services

```bash
docker compose up -d
```

This starts four core services:

| Service | Purpose | Port |
|---------|---------|------|
| **app** | Llamenos application | 3000 (internal) |
| **postgres** | PostgreSQL database | 5432 (internal) |
| **caddy** | Reverse proxy + TLS | 80, 443 |
| **minio** | File/recording storage | 9000, 9001 (internal) |

Check that everything is running:

```bash
docker compose ps
docker compose logs app --tail 50
```

Verify the health endpoint:

```bash
curl https://hotline.yourdomain.com/api/health
# → {"status":"ok"}
```

## 6. First login

Open `https://hotline.yourdomain.com` in your browser. Log in with the admin nsec from step 2. The setup wizard will guide you through:

1. **Naming your hotline** — display name for the app
2. **Choosing channels** — enable Voice, SMS, WhatsApp, Signal, and/or Reports
3. **Configuring providers** — enter credentials for each channel
4. **Review and finish**

## 7. Configure webhooks

Point your telephony provider's webhooks to your domain. See the provider-specific guides for details:

- **Voice** (all providers): `https://hotline.yourdomain.com/telephony/incoming`
- **SMS**: `https://hotline.yourdomain.com/api/messaging/sms/webhook`
- **WhatsApp**: `https://hotline.yourdomain.com/api/messaging/whatsapp/webhook`
- **Signal**: Configure bridge to forward to `https://hotline.yourdomain.com/api/messaging/signal/webhook`

## Optional: Enable transcription

The Whisper transcription service requires additional RAM (4 GB+). Enable it with the `transcription` profile:

```bash
docker compose --profile transcription up -d
```

This starts a `faster-whisper-server` container using the `base` model on CPU. For faster transcription:

- **Use a larger model**: Edit `docker-compose.yml` and change `WHISPER__MODEL` to `Systran/faster-whisper-small` or `Systran/faster-whisper-medium`
- **Use GPU acceleration**: Change `WHISPER__DEVICE` to `cuda` and add GPU resources to the whisper service

## Optional: Enable Asterisk

For self-hosted SIP telephony (see [Asterisk setup](/docs/setup-asterisk)):

```bash
# Set the bridge shared secret
echo "BRIDGE_SECRET=$(openssl rand -hex 32)" >> .env

docker compose --profile asterisk up -d
```

## Optional: Enable Signal

For Signal messaging (see [Signal setup](/docs/setup-signal)):

```bash
docker compose --profile signal up -d
```

You'll need to register the Signal number via the signal-cli container. See the [Signal setup guide](/docs/setup-signal) for instructions.

## Updating

Pull the latest images and restart:

```bash
docker compose pull
docker compose up -d
```

Your data is persisted in Docker volumes (`postgres-data`, `minio-data`, etc.) and survives container restarts and image updates.

## Backups

### PostgreSQL

Use `pg_dump` for database backups:

```bash
docker compose exec postgres pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

To restore:

```bash
docker compose exec -T postgres psql -U llamenos llamenos < backup-20250101.sql
```

### MinIO storage

MinIO stores uploaded files, recordings, and attachments:

```bash
# Using the MinIO client (mc)
docker compose exec minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker compose exec minio mc mirror local/llamenos /tmp/minio-backup
docker compose cp minio:/tmp/minio-backup ./minio-backup-$(date +%Y%m%d)
```

### Automated backups

For production, set up a cron job:

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /path/to/llamenos/deploy/docker && docker compose exec -T postgres pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz 2>&1 | logger -t llamenos-backup
```

## Monitoring

### Health checks

The app exposes a health endpoint at `/api/health`. Docker Compose has built-in health checks. Monitor externally with any HTTP uptime checker.

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app

# Last 100 lines
docker compose logs --tail 100 app
```

### Resource usage

```bash
docker stats
```

## Troubleshooting

### App won't start

```bash
# Check logs for errors
docker compose logs app

# Verify .env is loaded
docker compose config

# Check PostgreSQL is healthy
docker compose ps postgres
docker compose logs postgres
```

### Certificate issues

Caddy needs ports 80 and 443 open for ACME challenges. Verify with:

```bash
# Check Caddy logs
docker compose logs caddy

# Verify ports are accessible
curl -I http://hotline.yourdomain.com
```

### MinIO connection errors

Ensure the MinIO service is healthy before the app starts:

```bash
docker compose ps minio
docker compose logs minio
```

## Service architecture

```
                    ┌─────────────┐
   Internet ───────►│    Caddy     │ :80/:443
                    │  (TLS, proxy)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    App      │ :3000
                    │  (Node.js)  │
                    └──┬──┬──┬───┘
                       │  │  │
          ┌────────────▼┐ │ ┌▼────────┐
          │  PostgreSQL  │ │ │ Whisper  │ (optional)
          │    :5432     │ │ │  :8080   │
          └──────────────┘ │ └──────────┘
                    ┌──────▼──────┐
                    │    MinIO    │
                    │    :9000    │
                    └─────────────┘
```

## Next steps

- [Admin Guide](/docs/admin-guide) — configure the hotline
- [Self-Hosting Overview](/docs/self-hosting) — compare deployment options
- [Kubernetes Deployment](/docs/deploy-kubernetes) — migrate to Helm
