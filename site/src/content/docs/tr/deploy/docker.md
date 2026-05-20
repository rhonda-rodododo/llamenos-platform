---
title: "Dağıtım: Docker Compose"
description: Llamenos'u kendi sunucunuzda Docker Compose ile dağıtın.
---

Bu kılavuz, tek bir sunucuda Docker Compose kullanarak Llamenos'u dağıtma sürecinde size yol gösterir. Otomatik HTTPS, PostgreSQL veritabanı, nesne depolama, WebSocket rölesi ve isteğe bağlı transkripsiyon ile tamamen işlevsel bir yardım hattına sahip olacaksınız — hepsi Docker Compose tarafından yönetilir.

## Ön koşullar

- Bir Linux sunucusu (Ubuntu 22.04+, Debian 12+ veya benzeri)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ ve Docker Compose v2
- `openssl` (çoğu sistemde önceden yüklenmiş)
- Sunucunuzun IP'sine işaret eden bir alan adı

## Hızlı başlangıç (yerel)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

**http://localhost:8000** adresini ziyaret edin ve kurulum sihirbazını takip edin.

## Üretim dağıtımı

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Kurulum betiği:
1. Güçlü rastgele gizli anahtarlar oluşturur (veritabanı parolası, HMAC anahtarı, depolama kimlik bilgileri, WebSocket rölesi gizli anahtarı)
2. Bunları `deploy/docker/.env` dosyasına yazar
3. Üretim katmanını kullanarak tüm hizmetleri derler ve başlatır
4. Uygulamanın sağlıklı olmasını bekler

Üretim katmanı (`docker-compose.production.yml`) şunları ekler:
- **TLS sonlandırma** Let's Encrypt aracılığıyla (Caddy)
- **Günlük döndürme** tüm hizmetler için (maksimum 10 MB, 5 dosya)
- **Kaynak limitleri** (uygulama için 1 GB bellek)
- **Katı CSP** — yalnızca `wss://` WebSocket bağlantıları

`https://hotline.yourorg.com` adresini ziyaret edin ve kurulum sihirbazını takip edin.

### Manuel kurulum

```bash
cd deploy/docker
cp .env.example .env
```

`.env` dosyasını düzenleyin ve gerekli gizli anahtarları doldurun:

```bash
# Onaltılık gizli anahtarlar (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# Parolalar (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # bun run bootstrap-admin komutundan
```

Üretim katmanıyla başlatın:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Docker Compose dosyaları

| Dosya | Amaç |
|------|---------|
| `deploy/docker/docker-compose.yml` | Temel yapılandırma — tüm hizmetler, ağlar, birimler |
| `deploy/docker/docker-compose.production.yml` | Üretim katmanı — TLS Caddyfile, günlük döndürme, kaynak limitleri |
| `deploy/docker/docker-compose.dev.yml` | Geliştirme katmanı — uygulama bağlantı noktası, dosya izleme |
| `deploy/docker/docker-compose.ci.yml` | CI katmanı — belirleyici test ortamı |

**Yerel geliştirme** geliştirme katmanını kullanır. **Üretim** üretim katmanını temel üzerine yığar.

## Temel hizmetler

| Hizmet | Amaç | Bağlantı Noktası |
|---------|---------|------|
| **app** | Llamenos uygulaması (Bun + Hono) | 3000 (dahili) |
| **postgres** | PostgreSQL veritabanı | 5432 (dahili) |
| **caddy** | Ters proxy + otomatik TLS | 8000 (yerel), 80/443 (üretim) |
| **RustFS** | S3-uyumlu dosya depolama | 9000 (dahili) |
| **WebSocket relay** | Gerçek zamanlı olaylar için WebSocket rölesi | 7777 (dahili) |

## İsteğe bağlı profiller

İsteğe bağlı hizmetleri `--profile` ile başlatın:

```bash
# Signal mesajlaşma yan hizmeti
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP köprüsü (PBX_TYPE arka ucu seçer)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Mesaj çıkarımı için Ollama/vLLM
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana izleme
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP köprüsü

`sip-bridge` hizmeti Llamenos'u kendi sunucunuzda barındırılan bir PBX'e bağlar. Arka ucu seçmek için `.env` dosyasında `PBX_TYPE` ayarlayın:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

Ayrıca gerekli: `ARI_PASSWORD` ve `BRIDGE_SECRET`.

## Signal bildirim yan hizmeti

`signal-notifier` hizmeti 3100 numaralı bağlantı noktasında çalışır. HMAC-hashlenmiş tanımlayıcılar aracılığıyla Signal kişilerini çözümler — düz metin telefon numaralarını asla saklamaz. Yapılandırma:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # hem uygulamada hem de yan hizmette eşleşmeli
```

## Sağlık kontrolleri

Uygulama şunları sunar:
- `GET /health/ready` — DB bağlı ve göçler uygulandığında hazır
- `GET /health/live` — canlılık kontrolü

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## Dağıtımı doğrulama

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Webhook'ları yapılandırma

Telefon sağlayıcınızın webhook'larını alan adınıza yönlendirin:

| Webhook | URL |
|---------|-----|
| Ses (gelen) | `https://hotline.yourorg.com/api/telephony/incoming` |
| Ses (durum) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | `https://hotline.yourorg.com/api/messaging/signal/webhook` adresine yönlendirin |

## Güncelleme

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Veriler, yeniden başlatmalarda ve yeniden derlemelerde Docker birimlerinde (`postgres-data`, `RustFS-data`, vb.) kalıcıdır.

## Yedeklemeler

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

Geri yükleme:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### Otomatik yedeklemeler (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Günlükler

```bash
cd deploy/docker

# Tüm hizmetler
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# Belirli hizmet
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# Son 100 satır
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## Sorun giderme

### Uygulama başlamıyor

```bash
docker compose logs app
docker compose config   # .env'in yüklendiğini doğrulayın
docker compose ps       # hizmet sağlığını kontrol edin
```

### Sertifika sorunları

Caddy, ACME zorlukları için 80 ve 443 numaralı bağlantı noktalarına ihtiyaç duyar:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## Hizmet mimarisi

![Docker Mimarisi](/diagrams/docker-architecture.svg)

## Sonraki adımlar

- [Kubernetes Dağıtımı](/docs/en/deploy/kubernetes) — Helm ile yatay ölçeklendirme
- [Co-op Cloud Dağıtımı](/docs/en/deploy/coopcloud) — kooperatif barındırma
- [Telefon Sağlayıcıları](/docs/en/deploy/providers/) — ses sağlayıcılarını yapılandırın
