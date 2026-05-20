---
title: "ဖြန့်ကျက်ခြင်း: Docker Compose"
description: သင့်ကိုယ်ပိုင်ဆာဗာတွင် Docker Compose ဖြင့် Llamenos ကို ဖြန့်ကျက်ပါ။
---

ဤလမ်းညွှန်သည် ဆာဗာတစ်လုံးတည်းတွင် Docker Compose ဖြင့် Llamenos ကို ဖြန့်ကျက်ရန် လမ်းညွှန်ပေးပါသည်။ သင်သည် အလိုအလျောက် HTTPS၊ PostgreSQL ဒေတာဘေ့စ်၊ object သိုလှောင်မှု၊ WebSocket relay နှင့် ထည့်သွင်းစရာ စာသားမှတ်တမ်းပြောင်းခြင်းပါရှိသော အပြည့်အဝအလုပ်လုပ်နိုင်သည့် ဟော့လိုင်းကို ရရှိပါမည် — အားလုံးကို Docker Compose ဖြင့် စီမံပါသည်။

## လိုအပ်ချက်များ

- Linux ဆာဗာ (Ubuntu 22.04+, Debian 12+, သို့မဟုတ် အလားတူ)
- Docker Compose v2 ပါရှိသော [Docker Engine](https://docs.docker.com/engine/install/) v24+
- `openssl` (စနစ်အများစုတွင် ကြိုတင်ထည့်သွင်းပြီးသား)
- သင့်ဆာဗာ၏ IP သို့ DNS ညွှန်ပြထားသော ဒိုမိန်းအမည်တစ်ခု

## အမြန်စတင်ခြင်း (ဒေသခံ)

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

**http://localhost:8000** သို့သွားရောက်ပြီး သတ်မှတ်ခြင်းဝီဇာကို လိုက်နာပါ။

## အသားတင်ဖြန့်ကျက်ခြင်း

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

သတ်မှတ်ခြင်း script သည်-
၁။ ခိုင်မာသော ကျပန်းလျှို့ဝှက်ချက်များ (ဒေတာဘေ့စ်စကားဝှက်၊ HMAC သော့၊ သိုလှောင်မှုအထောက်အထားများ၊ WebSocket relay လျှို့ဝှက်ချက်) ကို ထုတ်ပေးပါသည်
၂။ ၎င်းတို့ကို `deploy/docker/.env` သို့ ရေးပါသည်
၃။ အသားတင်အပေါ်လွှာကို အသုံးပြု၍ ဝန်ဆောင်မှုအားလုံးကို တည်ဆောက်ပြီး စတင်ပါသည်
၄။ အက်ပ် ကျန်းမာလာသည်အထိ စောင့်ပါသည်

အသားတင်အပေါ်လွှာ (`docker-compose.production.yml`) က အောက်ပါတို့ကို ပေါင်းထည့်ပါသည်-
- Let's Encrypt (Caddy) မှတစ်ဆင့် **TLS အဆုံးသတ်ခြင်း**
- ဝန်ဆောင်မှုအားလုံးအတွက် **Log လှည့်ခြင်း** (အများဆုံး 10 MB၊ ဖိုင် ၅ ဖိုင်)
- **အရင်းအမြစ်ကန့်သတ်ချက်များ** (အက်ပ်အတွက် မှတ်ဉာဏ် 1 GB)
- **တင်းကျပ်သော CSP** — `wss://` WebSocket ချိတ်ဆက်မှုများသာ

`https://hotline.yourorg.com` သို့သွားရောက်ပြီး သတ်မှတ်ခြင်းဝီဇာကို လိုက်နာပါ။

### ကိုယ်တိုင်သတ်မှတ်ခြင်း

```bash
cd deploy/docker
cp .env.example .env
```

`.env` ကိုတည်းဖြတ်ပြီး လိုအပ်သောလျှို့ဝှက်ချက်များကို ဖြည့်ပါ-

```bash
# Hex လျှို့ဝှက်ချက်များ (HMAC_SECRET, SERVER_SECRET):
openssl rand -hex 32

# စကားဝှက်များ (PG_PASSWORD, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY):
openssl rand -base64 24
```

```env
DOMAIN=hotline.yourorg.com
ACME_EMAIL=admin@yourorg.com
ADMIN_PUBKEY=your_hex_pubkey   # bun run bootstrap-admin မှရယူပါ
```

အသားတင်အပေါ်လွှာဖြင့် စတင်ပါ-

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## Docker Compose ဖိုင်များ

| ဖိုင် | ရည်ရွယ်ချက် |
|---|---|
| `deploy/docker/docker-compose.yml` | အခြေခံပြင်ဆင်မှု — ဝန်ဆောင်မှုများ၊ ကွန်ရက်များ၊ volumes အားလုံး |
| `deploy/docker/docker-compose.production.yml` | အသားတင်အပေါ်လွှာ — TLS Caddyfile, log လှည့်ခြင်း, အရင်းအမြစ်ကန့်သတ်ချက်များ |
| `deploy/docker/docker-compose.dev.yml` | ဖွံ့ဖြိုးတိုးတက်ရေးအပေါ်လွှာ — အက်ပ် port ကိုဖော်ထုတ်ခြင်း၊ ဖိုင်စောင့်ကြည့်ခြင်း |
| `deploy/docker/docker-compose.ci.yml` | CI အပေါ်လွှာ — တိကျသေချာသော စမ်းသပ်မှုပတ်ဝန်းကျင် |

**ဒေသခံဖွံ့ဖြိုးတိုးတက်ရေး**အတွက် dev အပေါ်လွှာကို အသုံးပြုပါ။ **အသားတင်**အတွက် အသားတင်အပေါ်လွှာကို အခြေခံအပေါ်တွင် ထပ်တင်ပါ။

## အဓိကဝန်ဆောင်မှုများ

| ဝန်ဆောင်မှု | ရည်ရွယ်ချက် | Port |
|---|---|---|
| **app** | Llamenos အပလီကေးရှင်း (Bun + Hono) | ၃၀၀၀ (အတွင်းပိုင်း) |
| **postgres** | PostgreSQL ဒေတာဘေ့စ် | ၅၄၃၂ (အတွင်းပိုင်း) |
| **caddy** | Reverse proxy + အလိုအလျောက် TLS | ၈၀၀၀ (ဒေသခံ), ၈၀/၄၄၃ (အသားတင်) |
| **RustFS** | S3-compatible ဖိုင်သိုလှောင်မှု | ၉၀၀၀ (အတွင်းပိုင်း) |
| **WebSocket relay** | အချိန်နှင့်တပြေးညီဖြစ်ရပ်များအတွက် WebSocket relay | ၇၇၇၇ (အတွင်းပိုင်း) |

## ထည့်သွင်းစရာ profile များ

`--profile` ဖြင့် ထည့်သွင်းစရာဝန်ဆောင်မှုများကို စတင်ပါ-

```bash
# Signal မက်ဆေ့ချ်ပို့ခြင်း sidecar
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile signal up -d

# Asterisk/FreeSWITCH/Kamailio SIP တံတား (PBX_TYPE က backend ကိုရွေးချယ်သည်)
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile telephony up -d

# Ollama/vLLM inference အတွက် မက်ဆေ့ချ်ထုတ်ယူခြင်း
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile inference up -d

# Prometheus + Grafana စောင့်ကြည့်ခြင်း
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile monitoring up -d
```

## SIP တံတား

`sip-bridge` ဝန်ဆောင်မှုသည် Llamenos ကို ကိုယ်တိုင်အိမ်ရှင် PBX နှင့် ချိတ်ဆက်ပါသည်။ backend ကိုရွေးချယ်ရန် `.env` တွင် `PBX_TYPE` ကိုသတ်မှတ်ပါ-

```env
PBX_TYPE=asterisk      # Asterisk ARI
# PBX_TYPE=freeswitch  # FreeSWITCH ESL
# PBX_TYPE=kamailio    # Kamailio
```

လိုအပ်သည်များ: `ARI_PASSWORD` နှင့် `BRIDGE_SECRET`။

## Signal notifier sidecar

`signal-notifier` ဝန်ဆောင်မှုသည် port 3100 တွင် လုပ်ဆောင်ပါသည်။ ၎င်းသည် Signal အဆက်အသွယ်များကို HMAC-hashed identifiers ဖြင့် ဖော်ထုတ်သည် — ၎င်းသည် ဖုန်းနံပါတ်များကို ရိုးရိုးစာသားအဖြစ် ဘယ်တော့မှ မသိမ်းဆည်းပါ။ ပြင်ဆင်ပါ-

```env
SIGNAL_NOTIFIER_BEARER_TOKEN=your_shared_token  # အက်ပ်နှင့် sidecar နှစ်ခုလုံးတွင် တူညီရမည်
```

## ကျန်းမာရေးစစ်ဆေးချက်များ

အက်ပ်က အောက်ပါတို့ကို ထုတ်ဖော်ပါသည်-
- `GET /health/ready` — DB ချိတ်ဆက်ပြီး migrations လုပ်ပြီးပါက အဆင်သင့်
- `GET /health/live` — အသက်ရှင်နေကြောင်း စစ်ဆေးချက်

```bash
curl https://hotline.yourorg.com/health/ready
# {"status":"ok"}
```

## ဖြန့်ကျက်မှုကို အတည်ပြုပါ

```bash
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs app --tail 50
curl https://hotline.yourorg.com/health/ready
```

## Webhook များကို ပြင်ဆင်ပါ

သင့်တယ်လီဖုန်းဝန်ဆောင်မှုပေးသူ၏ webhook များကို သင့်ဒိုမိုင်းသို့ ညွှန်ပြပါ-

| Webhook | URL |
|---|---|
| အသံ (ဝင်လာသော) | `https://hotline.yourorg.com/api/telephony/incoming` |
| အသံ (အခြေအနေ) | `https://hotline.yourorg.com/api/telephony/status` |
| SMS | `https://hotline.yourorg.com/api/messaging/sms/webhook` |
| WhatsApp | `https://hotline.yourorg.com/api/messaging/whatsapp/webhook` |
| Signal | `https://hotline.yourorg.com/api/messaging/signal/webhook` သို့ ထပ်ဆင့်ပို့ပါ |

## အပ်ဒိတ်လုပ်ခြင်း

```bash
cd deploy/docker
git -C ../.. pull
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

ဒေတာသည် Docker volumes (`postgres-data`, `RustFS-data` စသည်) တွင် ပြန်လည်စတင်ခြင်းနှင့် ပြန်လည်တည်ဆောက်ခြင်းများကြားတွင် ဆက်ရှိနေပါသည်။

## အရန်သိမ်းခြင်း

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec postgres \
  pg_dump -U llamenos llamenos > backup-$(date +%Y%m%d).sql
```

ပြန်လည်ထည့်သွင်းရန်:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U llamenos llamenos < backup-20250101.sql
```

### အလိုအလျောက်အရန်သိမ်းခြင်း (cron)

```bash
# /etc/cron.d/llamenos-backup
0 3 * * * root cd /opt/llamenos/deploy/docker && \
  docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  pg_dump -U llamenos llamenos | gzip > /backups/llamenos-$(date +\%Y\%m\%d).sql.gz
```

## Log များ

```bash
cd deploy/docker

# ဝန်ဆောင်မှုအားလုံး
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# သတ်မှတ်ထားသော ဝန်ဆောင်မှု
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f app

# နောက်ဆုံး ၁၀၀ ကြောင်း
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 app
```

## ပြဿနာဖြေရှင်းခြင်း

### အက်ပ်မစတင်နိုင်ခြင်း

```bash
docker compose logs app
docker compose config   # .env တင်ပြီးကြောင်း စစ်ဆေးပါ
docker compose ps       # ဝန်ဆောင်မှုကျန်းမာရေးကို စစ်ဆေးပါ
```

### လက်မှတ်ပြဿနာများ

Caddy သည် ACME challenge များအတွက် port 80 နှင့် 443 ဖွင့်ထားရန် လိုအပ်ပါသည်-

```bash
docker compose logs caddy
curl -I http://hotline.yourorg.com
```

## ဝန်ဆောင်မှုဗိသုကာ

![Docker Architecture](/diagrams/docker-architecture.svg)

## နောက်အဆင့်များ

- [Kubernetes ဖြန့်ကျက်ခြင်း](/docs/en/deploy/kubernetes) — Helm ဖြင့် အလျားလိုက်ချဲ့ခြင်း
- [Co-op Cloud ဖြန့်ကျက်ခြင်း](/docs/en/deploy/coopcloud) — သမဝါယမအိမ်ရှင်
- [တယ်လီဖုန်းဝန်ဆောင်မှုပေးသူများ](/docs/en/deploy/providers/) — အသံဝန်ဆောင်မှုပေးသူများကို ပြင်ဆင်ပါ
