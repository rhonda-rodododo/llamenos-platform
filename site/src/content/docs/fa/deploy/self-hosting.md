---
title: نمای کلی میزبانی شخصی
description: Llámenos را در زیرساخت شخصی خود با Docker Compose، Kubernetes یا Co-op Cloud مستقر کنید.
---

Llámenos برای اجرا روی زیرساخت شخصی شما طراحی شده است. میزبانی شخصی کنترل کامل بر محل سکونت داده، جداسازی شبکه و انتخاب‌های زیرساخت را به شما می‌دهد — برای سازمان‌هایی که از خود در برابر دشمنان مجهز محافظت می‌کنند حیاتی است.

## گزینه‌های استقرار

| گزینه | بهترین برای | پیچیدگی | مقیاس‌پذیری |
|---|---|---|---|
| [Docker Compose](/docs/en/deploy/docker) | تک سرور، شروع توصیه شده | کم | تک گره |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | هماهنگ‌سازی چند سرویسی | متوسط | افقی (چند تکرار) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | مجموعه‌های میزبانی تعاونی | کم | تک گره (Swarm) |

## فایل‌های Docker Compose

Docker Compose از یک رویکرد لایه‌ای استفاده می‌کند:

| فایل | هدف |
|---|---|
| `deploy/docker/docker-compose.yml` | پیکربندی پایه — همه سرویس‌ها، شبکه‌ها، حجم‌ها |
| `deploy/docker/docker-compose.production.yml` | روکش تولید — TLS از طریق Let's Encrypt، چرخش لاگ، محدودیت منابع، CSP سختگیرانه |
| `deploy/docker/docker-compose.dev.yml` | روکش توسعه — نظارت بر فایل، پورت‌های نمایش داده شده |
| `deploy/docker/docker-compose.ci.yml` | روکش CI — محیط تست قطعی |

برای **توسعه محلی**، از روکش توسعه استفاده کنید. برای **تولید**، روکش تولید را روی هم قرار دهید:

```bash
# محلی (فقط سرویس‌های پشتیبان + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# تولید
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

یا از اسکریپت راه‌اندازی استفاده کنید:

```bash
./scripts/docker-setup.sh                                     # محلی
./scripts/docker-setup.sh --domain hotline.org --email a@b   # تولید
```

## سرویس‌های اصلی

همه اهداف استقرار این سرویس‌های اصلی را اجرا می‌کنند:

| مؤلفه | هدف |
|---|---|
| **برنامه Bun** | سرور API Hono + سرویس فایل ایستا |
| **PostgreSQL** | پایگاه داده اصلی |
| **RustFS** | ذخیره‌سازی باینری سازگار با S3 (پیام صوتی، پیوست‌ها، صادرات) |
| **رله WebSocket** | رله WebSocket برای رویدادهای بلادرنگ (همیشه مورد نیاز) |
| **Caddy** | پروکسی معکوس + TLS خودکار (Docker Compose) |

## سرویس‌های اختیاری

| مؤلفه | پروفایل | هدف |
|---|---|---|
| **signal-notifier** | `signal` | سایدکار اعلان Signal ناآگاهانه (پورت ۳۱۰۰) |
| **sip-bridge** | `telephony` | پل SIP برای Asterisk/FreeSWITCH/Kamailio (PBX_TYPE بک‌اند را انتخاب می‌کند) |
| **Ollama/vLLM** | `inference` | استنتاج LLM برای استخراج پیام |
| **Prometheus + Grafana** | `monitoring` | معیارها و هشداردهی |

## آنچه نیاز دارید

### حداقل نیازمندی‌ها

- یک سرور لینوکس (۲ هسته CPU، حداقل ۲ گیگابایت RAM)
- Docker و Docker Compose v2 (یا یک خوشه Kubernetes برای Helm)
- یک نام دامنه指向 سرور شما
- `openssl` (برای تولید رازها)
- حداقل یک کانال ارتباطی پیکربندی شده

### مؤلفه‌های اختیاری

- **رونویسی** — Whisper سمت کلاینت WASM؛ هیچ مؤلفه سرور اضافی لازم نیست
- **پل SIP** — برای PBX میزبانی شخصی (Asterisk/FreeSWITCH/Kamailio)
- **پل Signal** — برای پیام‌رسانی Signal

## تونل‌های Cloudflare (ورودی جایگزین)

به جای نمایش مستقیم پورت‌های ۸۰/۴۴۳، می‌توانید از [تونل‌های Cloudflare](https://www.cloudflare.com/products/tunnel/) برای ورودی استفاده کنید. این کار آدرس IP سرور شما را پنهان می‌کند و محافظت DDoS را فراهم می‌کند:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

تونل را برای ارسال به `http://localhost:3000` پیکربندی کنید.

## ملاحظات امنیتی

میزبانی شخصی کنترل بیشتری به شما می‌دهد اما مسئولیت بیشتری نیز دارد:

- **داده در حالت سکون**: داده‌های PostgreSQL به طور پیش‌فرض رمزنگاری نشده ذخیره می‌شوند. از رمزنگاری تمام دیسک (LUKS، dm-crypt) روی سرور خود استفاده کنید. یادداشت‌های تماس، رونوشت‌ها و پیام‌ها E2EE هستند — سرور هرگز متن ساده را نمی‌بیند.
- **امنیت شبکه**: از فایروال استفاده کنید. فقط پورت‌های ۸۰/۴۴۳ باید به صورت عمومی قابل دسترسی باشند.
- **رازها**: هرگز رازها را در فایل‌های Docker Compose یا کنترل نسخه قرار ندهید. از فایل‌های `.env` (gitignored) یا رازهای Docker/Kubernetes استفاده کنید.
- **به‌روزرسانی‌ها**: تصاویر جدید را به طور منظم دریافت کنید. تغییرات را برای رفع‌های امنیتی دنبال کنید.
- **پشتیبان‌گیری**: به طور منظم از پایگاه داده PostgreSQL و ذخیره‌سازی RustFS پشتیبان‌گیری کنید.

## کتاب‌های آموزش Ansible

دایرکتوری `deploy/ansible/` شامل کتاب‌های آموزشی پیش از استقرار و بررسی دود است:

```bash
# تأیید سیستم قبل از استقرار
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# بررسی دود پس از استقرار
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## مراحل بعدی

- [استقرار Docker Compose](/docs/en/deploy/docker) — راهنمای تک سرور
- [استقرار Kubernetes](/docs/en/deploy/kubernetes) — نمودار Helm
- [استقرار Co-op Cloud](/docs/en/deploy/coopcloud) — میزبانی تعاونی
- [ارائه‌دهندگان تلفنی](/docs/en/deploy/providers/) — پیکربندی ارائه‌دهندگان صوتی
