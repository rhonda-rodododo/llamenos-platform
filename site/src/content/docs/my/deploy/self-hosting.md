---
title: ကိုယ်တိုင်အိမ်ရှင် ခြုံငုံသုံးသပ်ချက်
description: Docker Compose၊ Kubernetes သို့မဟုတ် Co-op Cloud ဖြင့် သင့်ကိုယ်ပိုင်အခြေခံအဆောက်အအုံပေါ်တွင် Llamenos ကို ဖြန့်ကျက်ပါ။
---

Llamenos သည် သင့်ကိုယ်ပိုင်အခြေခံအဆောက်အအုံပေါ်တွင် လုပ်ဆောင်ရန် ဒီဇိုင်းထုတ်ထားပါသည်။ ကိုယ်တိုင်အိမ်ရှင်လုပ်ခြင်းသည် ဒေတာတည်ရှိရာ၊ ကွန်ရက်သီးသန့်ခွဲခြင်းနှင့် အခြေခံအဆောက်အအုံရွေးချယ်မှုများအပေါ် အပြည့်အဝထိန်းချုပ်ခွင့်ပေးပါသည် — ၎င်းသည် ခြိမ်းခြောက်မှုမြင့်မားသော ရန်ဘက်များမှ ကာကွယ်သည့် အဖွဲ့အစည်းများအတွက် အရေးကြီးပါသည်။

## ဖြန့်ကျက်ရွေးချယ်စရာများ

| ရွေးချယ်စရာ | အကောင်းဆုံးအတွက် | ရှုပ်ထွေးမှု | ချဲ့ထွင်ခြင်း |
|---|---|---|---|
| [Docker Compose](/docs/en/deploy/docker) | ဆာဗာတစ်လုံးတည်း၊ အကြံပြုထားသောအစ | နိမ့် | Node တစ်ခုတည်း |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | ဝန်ဆောင်မှုမျိုးစုံ စီမံခန့်ခွဲခြင်း | အလယ်အလတ် | အလျားလိုက် (replica မျိုးစုံ) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | သမဝါယမအိမ်ရှင်အဖွဲ့များ | နိမ့် | Node တစ်ခုတည်း (Swarm) |

## Docker Compose ဖိုင်များ

Docker Compose သည် အလွှာလိုက်နည်းလမ်းကို အသုံးပြုပါသည်-

| ဖိုင် | ရည်ရွယ်ချက် |
|---|---|
| `deploy/docker/docker-compose.yml` | အခြေခံပြင်ဆင်မှု — ဝန်ဆောင်မှုများ၊ ကွန်ရက်များ၊ volumes အားလုံး |
| `deploy/docker/docker-compose.production.yml` | အသားတင်အပေါ်လွှာ — Let's Encrypt မှတစ်ဆင့် TLS၊ log လှည့်ခြင်း၊ အရင်းအမြစ်ကန့်သတ်ချက်များ၊ တင်းကျပ်သော CSP |
| `deploy/docker/docker-compose.dev.yml` | ဖွံ့ဖြိုးတိုးတက်ရေးအပေါ်လွှာ — ဖိုင်စောင့်ကြည့်ခြင်း၊ ထုတ်ဖော်ထားသော port များ |
| `deploy/docker/docker-compose.ci.yml` | CI အပေါ်လွှာ — တိကျသေချာသော စမ်းသပ်မှုပတ်ဝန်းကျင် |

**ဒေသခံဖွံ့ဖြိုးတိုးတက်ရေး**အတွက် dev အပေါ်လွှာကိုသုံးပါ။ **အသားတင်**အတွက် အသားတင်အပေါ်လွှာကိုထပ်တင်ပါ-

```bash
# ဒေသခံ (backing ဝန်ဆောင်မှုများသာ + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# အသားတင်
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

သို့မဟုတ် သတ်မှတ်ခြင်း script ကိုသုံးပါ-

```bash
./scripts/docker-setup.sh                                     # ဒေသခံ
./scripts/docker-setup.sh --domain hotline.org --email a@b   # အသားတင်
```

## အဓိကဝန်ဆောင်မှုများ

ဖြန့်ကျက်ပစ်မှတ်အားလုံးသည် ဤအဓိကဝန်ဆောင်မှုများကို လုပ်ဆောင်ပါသည်-

| အစိတ်အပိုင်း | ရည်ရွယ်ချက် |
|---|---|
| **Bun အပလီကေးရှင်း** | Hono API ဆာဗာ + static ဖိုင်များဝန်ဆောင်မှုပေးခြင်း |
| **PostgreSQL** | အဓိကဒေတာဘေ့စ် |
| **RustFS** | S3-compatible blob သိုလှောင်မှု (အသံမေးလ်၊ ပူးတွဲဖိုင်များ၊ ထုတ်ယူမှုများ) |
| **WebSocket relay** | အချိန်နှင့်တပြေးညီဖြစ်ရပ်များအတွက် WebSocket relay (အမြဲလိုအပ်သည်) |
| **Caddy** | Reverse proxy + အလိုအလျောက် TLS (Docker Compose) |

## ထည့်သွင်းစရာဝန်ဆောင်မှုများ

| အစိတ်အပိုင်း | Profile | ရည်ရွယ်ချက် |
|---|---|---|
| **signal-notifier** | `signal` | Zero-knowledge Signal အကြောင်းကြားချက် sidecar (port 3100) |
| **sip-bridge** | `telephony` | Asterisk/FreeSWITCH/Kamailio အတွက် SIP တံတား (PBX_TYPE က backend ကိုရွေးချယ်သည်) |
| **Ollama/vLLM** | `inference` | မက်ဆေ့ချ်ထုတ်ယူခြင်းအတွက် LLM inference |
| **Prometheus + Grafana** | `monitoring` | မက်ထရစ်များနှင့် သတိပေးချက်များ |

## သင်လိုအပ်သည်များ

### အနည်းဆုံးလိုအပ်ချက်များ

- Linux ဆာဗာ (CPU core ၂ ခု၊ RAM အနည်းဆုံး 2 GB)
- Docker နှင့် Docker Compose v2 (သို့မဟုတ် Helm အတွက် Kubernetes cluster)
- သင့်ဆာဗာသို့ညွှန်ပြသော ဒိုမိန်းအမည်တစ်ခု
- `openssl` (လျှို့ဝှက်ချက်များထုတ်ပေးရန်အတွက်)
- အနည်းဆုံး ဆက်သွယ်ရေးချန်နယ်တစ်ခု ပြင်ဆင်ထားခြင်း

### ထည့်သွင်းစရာအစိတ်အပိုင်းများ

- **စာသားမှတ်တမ်းပြောင်းခြင်း** — client-side WASM Whisper; ထပ်ဆောင်းဆာဗာအစိတ်အပိုင်း မလိုအပ်ပါ
- **SIP တံတား** — ကိုယ်တိုင်အိမ်ရှင် PBX အတွက် (Asterisk/FreeSWITCH/Kamailio)
- **Signal တံတား** — Signal မက်ဆေ့ချ်ပို့ခြင်းအတွက်

## Cloudflare Tunnels (အခြားရွေးချယ်စရာ ingress)

port 80/443 ကိုတိုက်ရိုက်ထုတ်ဖော်မည့်အစား ingress အတွက် [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) ကိုသုံးနိုင်ပါသည်။ ၎င်းသည် သင့်ဆာဗာ IP ကိုဖုံးကွယ်ပြီး DDoS ကာကွယ်မှုပေးပါသည်-

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Tunnel ကို `http://localhost:3000` သို့ထပ်ဆင့်ပို့ရန် ပြင်ဆင်ပါ။

## လုံခြုံရေးဆိုင်ရာ ထည့်သွင်းစဉ်းစားချက်များ

ကိုယ်တိုင်အိမ်ရှင်လုပ်ခြင်းသည် သင့်အား ပိုမိုထိန်းချုပ်နိုင်စေသော်လည်း ပိုမိုတာဝန်ယူမှုလည်းပေးပါသည်-

- **အနားယူချိန်ဒေတာ**: PostgreSQL ဒေတာကို ပုံမှန်အားဖြင့် မကုဒ်ဝှက်ဘဲသိမ်းဆည်းပါသည်။ သင့်ဆာဗာတွင် full-disk encryption (LUKS, dm-crypt) ကိုသုံးပါ။ ခေါ်ဆိုမှုမှတ်စုများ၊ စာသားမှတ်တမ်းများနှင့် မက်ဆေ့ချ်များသည် E2EE ဖြစ်ပါသည် — ဆာဗာသည် ရိုးရိုးစာသားကိုဘယ်တော့မှမတွေ့ရပါ။
- **ကွန်ရက်လုံခြုံရေး**: Firewall ကိုသုံးပါ။ port 80/443 သာ လူထုသုံးခွင့်ရှိသင့်ပါသည်။
- **လျှို့ဝှက်ချက်များ**: လျှို့ဝှက်ချက်များကို Docker Compose ဖိုင်များ သို့မဟုတ် ဗားရှင်းထိန်းချုပ်မှုတွင် ဘယ်တော့မှမထည့်ပါ။ `.env` ဖိုင်များ (gitignored) သို့မဟုတ် Docker/Kubernetes secrets များကိုသုံးပါ။
- **အပ်ဒိတ်များ**: image အသစ်များကို ပုံမှန်ဆွဲယူပါ။ လုံခြုံရေးပြင်ဆင်မှုများအတွက် changelog ကိုစောင့်ကြည့်ပါ။
- **အရန်သိမ်းခြင်း**: PostgreSQL ဒေတာဘေ့စ်နှင့် RustFS သိုလှောင်မှုကို ပုံမှန်အရန်သိမ်းပါ။

## Ansible playbooks များ

`deploy/ansible/` လမ်းညွှန်တွင် ကြိုတင်စစ်ဆေးခြင်းနှင့် မီးခိုးစစ်ဆေး playbooks များပါဝင်ပါသည်-

```bash
# ဖြန့်ကျက်မတိုင်မီ စနစ်စစ်ဆေးခြင်း
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# ဖြန့်ကျက်ပြီးနောက် မီးခိုးစစ်ဆေးခြင်း
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## နောက်အဆင့်များ

- [Docker Compose ဖြန့်ကျက်ခြင်း](/docs/en/deploy/docker) — ဆာဗာတစ်လုံးတည်းလမ်းညွှန်
- [Kubernetes ဖြန့်ကျက်ခြင်း](/docs/en/deploy/kubernetes) — Helm chart
- [Co-op Cloud ဖြန့်ကျက်ခြင်း](/docs/en/deploy/coopcloud) — သမဝါယမအိမ်ရှင်
- [တယ်လီဖုန်းဝန်ဆောင်မှုပေးသူများ](/docs/en/deploy/providers/) — အသံဝန်ဆောင်မှုပေးသူများကို ပြင်ဆင်ပါ
