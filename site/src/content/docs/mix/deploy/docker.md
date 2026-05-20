---
title: "Kunu'i: Docker Compose"
description: Ke desplegar Llámenos nuu servidor propio nuu Docker Compose.
---

Yaa guía le acompaña nuu desplegar Llámenos nuu Docker Compose nuu iin servidor único. Tendrá iin línea caliente completamente funcional nuu HTTPS automático, base datos PostgreSQL, almacenamiento objetos, relé WebSocket, ni transcripción opcional — todo gestionado por Docker Compose.

## Requisitos previos

- Iin servidor Linux (Ubuntu 22.04+, Debian 12+, a similar)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ nuu Docker Compose v2
- `openssl` (preinstalado nuu mayoría sistemas)
- Iin nombre dominio nuu DNS apuntando a IP servidor

## Inicio rápido (local)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Visite **http://localhost:8000** ni siga asistente configuración.

## Despliegue producción

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Script configuración:
1. Genera secretos aleatorios fuertes (contraseña base datos, llave HMAC, credenciales almacenamiento, secreto relé WebSocket)
2. Los escribe a `deploy/docker/.env`
3. Construye ni inicia todos servicios nuu superposición producción
4. Espera a ke aplicación se vuelva saludable

Superposición producción (`docker-compose.production.yml`) añade:
- **Terminación TLS** vía Let's Encrypt (Caddy)
- **Rotación logs** nuu todos servicios (10 MB máx, 5 archivos)
- **Límites recursos** (1 GB memoria nuu aplicación)
- **CSP estricto** — solo conexiones WebSocket `wss://`

Visite `https://hotline.yourorg.com` ni siga asistente configuración.

### Configuración manual

```bash
cd deploy/docker
cp .env.example .env
```

Edite `.env` ni llene secretos requeridos:

```bash
# Secretos hex (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Contraseñas (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # de bun run bootstrap-admin
```

Inicie nuu superposición producción:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Archivos Docker Compose

| Archivo | Propósito |
|------|---------|
| `deploy/docker/docker-compose.yml` | Configuración base — todos servicios, redes, volúmenes |
| `deploy/docker/docker-compose.production.yml` | Superposición producción — TLS Caddyfile, rotación logs, límites recursos |
| `deploy/docker/docker-compose.dev.yml` | Superposición desarrollo — expone puerto aplicación, observación archivos |
| `deploy/docker/docker-compose.ci.yml` | Superposición CI — ambiente pruebas determinista |

**Desarrollo local** usa superposición dev. **Producción** apila superposición producción encima base.

## Servicios núcleo

| Servicio | Propósito | Puerto |
|---------|---------|------|
| **app** | Aplicación Llámenos (Bun + Hono) | 3000 (interno) |
| **postgres** | Base datos PostgreSQL | 5432 (interno) |
| **caddy** | Proxy inverso + TLS automático | 8000 (local), 80/443 (producción) |
| **RustFS** | Almacenamiento archivos compatible S3 | 9000 (interno) |
| **relé WebSocket** | Relé WebSocket nuu eventos tiempo real | 7777 (interno) |

## Perfiles opcionales

Inicie servicios opcionales nuu `--profile`:

```bash
# Sidecar mensajería Signal
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP bridge (PBX_TYPE selecciona backend)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Inferencia Ollama/vLLM nuu extracción mensajes
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Monitoreo Prometheus + Grafana
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP bridge

Servicio `sip-bridge` conecta Llámenos a PBX autoalojado. Ke establecer `PBX_TYPE` nuu `.env` nuu seleccionar backend:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

También requerido: `ARI_PASSWORD` ni `BRIDGE_SECRET`.

## Signal notifier sidecar

Servicio `signal-notifier` corre nuu puerto 3100. Resuelve contactos Signal vía identificadores hasheados HMAC — nunca almacena números telefónicos nuu texto plano. Configure:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # debe coincidir nuu aplicación ni sidecar
```

## Verificaciones salud

Aplicación expone:
- `GET /health/ready` — listo nuu BD conectada ni migraciones aplicadas
- `GET /health/live` — verificación vida

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Verificar despliegue

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Ke configurar webhooks

Apunte webhooks proveedor telefonía a dominio:

| Webhook | URL |
|---------|-----|
| Voz (entrante) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Voz (estado) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | Reenviar a `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## Actualizando

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Datos persisten nuu volúmenes Docker (`postgres-data`, `RustFS-data`, etc.) nuu reinicios ni reconstrucciones.

## Respaldos

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Restaurar:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Respaldos automatizados (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Logs

```bash
cd deploy/docker

# Todos servicios
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Servicio específico
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# Últimas 100 líneas
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Ke kunche'e problemas

### Aplicación no inicia

```bash
docker compose logs app
docker compose config   # verificar .env cargado
docker compose ps       # verificar salud servicio
```

### Problemas certificado

Caddy necesita puertos 80 ni 443 abiertos nuu desafíos ACME:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Arquitectura servicio

![Arquitectura Docker](/diagrams/docker-architecture.svg)

## Siguientes pasos

- [Despliegue Kubernetes](/docs/en/deploy/kubernetes) — escalado horizontal nuu Helm
- [Despliegue Co-op Cloud](/docs/en/deploy/coopcloud) — hospedaje cooperativo
- [Proveedores Telefonía](/docs/en/deploy/providers/) — configurar proveedores voz
