---
title: "استقرار: Docker Compose"
description: Llámenos را روی سرور خود با Docker Compose مستقر کنید.
---

این راهنما شما را در استقرار Llámenos با Docker Compose روی یک سرور راهنمایی می‌کند. شما یک خط تلفن کاملاً کاربردی با HTTPS خودکار، پایگاه داده PostgreSQL، ذخیره‌سازی اشیاء، رله WebSocket و رونویسی اختیاری خواهید داشت — همه توسط Docker Compose مدیریت می‌شوند.

## پیش‌نیازها

- یک سرور لینوکس (Ubuntu 22.04+، Debian 12+ یا مشابه)
- [Docker Engine](https://docs.docker.com/engine/install/) v24+ با Docker Compose v2
- `openssl` (از قبل روی بیشتر سیستم‌ها نصب شده است)
- یک نام دامنه با DNS指向 آدرس IP سرور شما

## شروع سریع (محلی)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

به **http://localhost:8000** مراجعه کرده و جادوگر راه‌اندازی را دنبال کنید.

## استقرار تولید

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

اسکریپت راه‌اندازی:
1. رازهای تصادفی قوی تولید می‌کند (رمز پایگاه داده، کلید HMAC، اعتبارنامه ذخیره‌سازی، راز رله WebSocket)
2. آنها را در `deploy/docker/.env` می‌نویسد
3. همه سرویس‌ها را با استفاده از روکش تولید می‌سازد و شروع می‌کند
4. منتظر می‌ماند تا برنامه سالم شود

روکش تولید (`docker-compose.production.yml`) اضافه می‌کند:
- **خاتمه TLS** از طریق Let's Encrypt (Caddy)
- **چرخش لاگ** برای همه سرویس‌ها (حداکثر ۱۰ مگابایت، ۵ فایل)
- **محدودیت منابع** (۱ گیگابایت حافظه برای برنامه)
- **CSP سختگیرانه** — فقط اتصالات WebSocket `wss://`

به `https://hotline.yourorg.com` مراجعه کرده و جادوگر راه‌اندازی را دنبال کنید.

### راه‌اندازی دستی

```bash
cd deploy/docker
cp .env.example .env
```

`.env` را ویرایش کرده و رازهای مورد نیاز را پر کنید:

```bash
# رازهای هگز (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# رمزهای عبور (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # از bun run bootstrap-admin
```

با روکش تولید شروع کنید:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## فایل‌های Docker Compose

| فایل | هدف |
|---|---|
| `deploy/docker/docker-compose.yml` | پیکربندی پایه — همه سرویس‌ها، شبکه‌ها، حجم‌ها |
| `deploy/docker/docker-compose.production.yml` | روکش تولید — Caddyfile TLS، چرخش لاگ، محدودیت منابع |
| `deploy/docker/docker-compose.dev.yml` | روکش توسعه — نمایش پورت برنامه، نظارت بر فایل |
| `deploy/docker/docker-compose.ci.yml` | روکش CI — محیط تست قطعی |

**توسعه محلی** از روکش توسعه استفاده می‌کند. **تولید** روکش تولید را روی پایه قرار می‌دهد.

## سرویس‌های اصلی

| سرویس | هدف | پورت |
|---|---|---|
| **app** | برنامه Llámenos (Bun + Hono) | ۳۰۰۰ (داخلی) |
| **postgres** | پایگاه داده PostgreSQL | ۵۴۳۲ (داخلی) |
| **caddy** | پروکسی معکوس + TLS خودکار | ۸۰۰۰ (محلی)، ۸۰/۴۴۳ (تولید) |
| **RustFS** | ذخیره‌سازی فایل سازگار با S3 | ۹۰۰۰ (داخلی) |
| **رله WebSocket** | رله WebSocket برای رویدادهای بلادرنگ | ۷۷۷۷ (داخلی) |

## پروفایل‌های اختیاری

سرویس‌های اختیاری را با `--profile` شروع کنید:

```bash
# سایدکار پیام‌رسانی Signal
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# پل SIP Asterisk/FreeSWITCH/Kamailio (PBX_TYPE بک‌اند را انتخاب می‌کند)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# استنتاج Ollama/vLLM برای استخراج پیام
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# نظارت Prometheus + Grafana
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## پل SIP

سرویس `sip-bridge` Llámenos را به یک PBX میزبانی شخصی متصل می‌کند. `PBX_TYPE` را در `.env` تنظیم کنید تا بک‌اند را انتخاب کنید:

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

همچنین مورد نیاز: `ARI_PASSWORD` و `BRIDGE_SECRET`.

## سایدکار Signal notifier

سرویس `signal-notifier` روی پورت ۳۱۰۰ اجرا می‌شود. این سرویس مخاطبین Signal را از طریق شناسه‌های HMAC-hashed شناسایی می‌کند — هرگز شماره تلفن‌های متن ساده را ذخیره نمی‌کند. پیکربندی:

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # باید در برنامه و سایدکار یکسان باشد
```

## بررسی‌های سلامت

برنامه ارائه می‌دهد:
- `GET /health/ready` — آماده وقتی DB متصل و مهاجرت‌ها اعمال شده باشند
- `GET /health/live` — بررسی زنده بودن

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## تأیید استقرار

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## پیکربندی webhook

webhookهای ارائه‌دهنده تلفنی خود را به دامنه خود指向 کنید:

| Webhook | URL |
|---|---|
| صدا (ورودی) | `https://hotline.yourorg.com/api/telephony/incoming` |
| صدا (وضعیت) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | ارسال به `https://hotline.yourorg.com/api/messaging/signal/webhook` |

## به‌روزرسانی

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

داده‌ها در حجم‌های Docker (`postgres-data`، `RustFS-data` و غیره) در طول راه‌اندازی مجدد و بازسازی حفظ می‌شوند.

## پشتیبان‌گیری

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

بازیابی:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### پشتیبان‌گیری خودکار (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## لاگ‌ها

```bash
cd deploy/docker

# همه سرویس‌ها
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# سرویس خاص
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# آخرین ۱۰۰ خط
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## عیب‌یابی

### برنامه شروع نمی‌شود

```bash
docker compose logs app
docker compose config   # تأیید بارگذاری .env
docker compose ps       # بررسی سلامت سرویس
```

### مشکلات گواهینامه

Caddy برای چالش‌های ACME به پورت‌های ۸۰ و ۴۴۳ باز نیاز دارد:

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## معماری سرویس

![معماری Docker](/diagrams/docker-architecture.svg)

## مراحل بعدی

- [استقرار Kubernetes](/docs/en/deploy/kubernetes) — مقیاس‌سازی افقی با Helm
- [استقرار Co-op Cloud](/docs/en/deploy/coopcloud) — میزبانی تعاونی
- [ارائه‌دهندگان تلفنی](/docs/en/deploy/providers/) — پیکربندی ارائه‌دهندگان صوتی
