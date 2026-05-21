---
title: በራስዎ ማስተናገድ አጠቃላይ እይታ
description: ላሜኖስን በራስዎ መሰረታዊ ገደብ ላይ ከDocker Compose፣ Kubernetes፣ ወይም Co-op Cloud ያስተናግዱ።
---

ላሜኖስ በራስዎ መሰረታዊ ገደብ ላይ ለማስኬድ የተነደፈ ነው። በራስዎ ማስተናገድ ስለ መረጃ መኖር፣ የኔትዎርክ ማገልገል፣ እና መሰረታዊ ገደብ ምርጫዎች ሙሉ ቁጥጥር ይሰጥዎታል — ለደንበኞች እንዲሁም ለበጎ አድራጊዎች ራስን ለመጠበቅ ወሳኝ ነው።

## የመተግበርያ አማራጮች

| አማራጭ | ለምን ጥሩ ነው | ውስብስብነት | ማስተፋጽም |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | አንድ-ሰርቨር፣ የሚመከር መነሻ | ዝቅተኛ | አንድ node |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | ብዙ-አገልግሎት orchestration | መካከለኛ | አግድሚያዊ (ብዙ-replica) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | ትብብር ማስተናገድ ተባባሪዎች | ዝቅተኛ | አንድ node (Swarm) |

## Docker Compose ፋይሎች

Docker Compose የተደረደረ አቀራረብ ይጠቀማል፦

| ፋይል | ዓላማ |
|------|---------|
| `deploy/docker/docker-compose.yml` | መሰረታዊ ውቅር — ሁሉም አገልግሎቶች፣ ኔትዎርኮች፣ ኮሎሞች |
| `deploy/docker/docker-compose.production.yml` | የምርት overlay — TLS በLet's Encrypt፣ የመዝገብ ተመላላሽ፣ የመረጃ ገደቦች፣ ጠባብ CSP |
| `deploy/docker/docker-compose.dev.yml` | የልማት overlay — የፋይል መቆጣጠሪያ፣ የተጋለጡ ፖርቶች |
| `deploy/docker/docker-compose.ci.yml` | CI overlay — የተወሰነ የሙከራ አካባቢ |

**አካባቢ ልማት** ለልማት overlay ይጠቀሙ። **ምርት** የምርት overlay ን በመሰረታዊው ላይ ይጨምራል፦

```bash
# አካባቢ (backing services ብቻ + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# ምርት
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

ወይም የማዋቀሪያ ጭብጥ ይጠቀሙ፦

```bash
./scripts/docker-setup.sh                                     # አካባቢ
./scripts/docker-setup.sh --domain hotline.org --email a@b   # ምርት
```

## ማዕከላዊ አገልግሎቶች

ሁሉም የመተግበርያ ግቦች እነዚህን ማዕከላዊ አገልግሎቶች ያስኬዳሉ፦

| ክፍል | ዓላማ |
|-----------|---------|
| **Bun መተግበሪያ** | Hono API ሰርቨር + የእጅ ፋይል አገልግሎት |
| **PostgreSQL** | ዋና ዳታቤዝ |
| **RustFS** | S3-ተኳሃኝ blob ማከማቻ (voicemail፣ ትዛዞች፣ ወደ ውጭ መላኪያዎች) |
| **WebSocket relay** | የበጊዜ ለውጥ ክስተቶች WebSocket relay (ሁልጊዜ አስፈላጊ ነው) |
| **Caddy** | የገለልተኛ ፕሮክሲ + ራስ-ሰር TLS (Docker Compose) |

## አማራጭ አገልግሎቶች

| ክፍል | ፕሮፋይል | ዓላማ |
|-----------|---------|---------|
| **signal-notifier** | `signal` | ዜሮ-እውቀት Signal ማሳወቂያ sidecar (ፖርት 3100) |
| **sip-bridge** | `telephony` | SIP bridge ለAsterisk/FreeSWITCH/Kamailio (PBX_TYPE የኋላ-ገጽ ይመርጣል) |
| **Ollama/vLLM** | `inference` | ለመልእክት ማውጣት LLM inference |
| **Prometheus + Grafana** | `monitoring` | መለኪያዎች እና ማንቂያዎች |

## ያስፈልግዎታል

### ዝቅተኛ መስፈርቶች

- Linux ሰርቨር (አነስተኛ 2 CPU cores፣ 2 GB RAM)
- Docker እና Docker Compose v2 (ወይም Helm ለKubernetes ክላስተር)
- ወደ ሰርቨርዎ የሚያመለክት ዶሜን ስም
- `openssl` (ሚስጥራት ለማመንጫ)
- ቢያንስ አንድ የግንኙነት ሰርጥ ተዋቅሯል

### አማራጭ ክፍሎች

- **Transcription** — በክላይንት-ጎን WASM Whisper; ተጨማሪ የሰርቨር ክፍል አያስፈልግም
- **SIP bridge** — ለራስ-ማስተናገድ PBX (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** — ለSignal መልእክት ሰጪ

## Cloudflare Tunnels (አማራጭ ingress)

ፖርት 80/443 በቀጥታ ማጋለጥ በምትኩ፣ ingress ለመጠቀም [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) መጠቀም ይችላሉ። ይህ የሰርቨር IPዎን ይሰውራል እና DDoS ጥበቃ ይሰጣል፦

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Tunnel ወደ `http://localhost:3000` እንዲያስተላልፍ ያዋቅሩት።

## የደህነንት ምክንያቶች

በራስዎ ማስተናገድ ተጨማሪ ቁጥጥር ይሰጥዎታል ግን እንዲሁም ተጨማሪ ኃላፊነት ይኖርዎታል፦

- **የመረጃ ጥበቃ**: የPostgreSQL መረጃ በነባሪው ያልተመሰጠነ ነው። በሰርቨርዎ ላይ ሙሉ-ዲስክ መመሰጠን (LUKS፣ dm-crypt) ይጠቀሙ። የጥሪ ዝብድቦች፣ transcriptions፣ እና መልእክቶች E2EE ናቸው — ሰርቨር ከቶ plaintext አያይም።
- **የኔትዎርክ ደህነንት**: Firewall ይጠቀሙ። ፖርት 80/443 ብቻ በስዋላዊነት መድረስ አለባቸው።
- **ሚስጥራት**: ሚስጥራትን በDocker Compose ፋይሎች ውስጥ ወይም በስሪት ቁጥጥር ውስጥ ከቶ አይስቀሉ። `.env` ፋይሎች (gitignored) ወይም Docker/Kubernetes secrets ይጠቀሙ።
- **Updates**: አዲስ ምስሎችን በየጊዜው ይይዙ። ለደህነንት ማስተካከያዎች changelog ን ይከተሉ።
- **ተተኪዎች**: PostgreSQL ዳታቤዝን እና RustFS ማከማቻውን በየጊዜው ይተኩ።

## Ansible playbooks

የ`deploy/ansible/` ዳይሬክቶሪ preflight እና smoke-check playbooks ይ containsል፦

```bash
# ከመተግበር በፊት የስርዓት ማረጋገጫ
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# ከመተግበር በኋላ smoke check
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## ቀጣይ ደረጃዎች

- [Docker Compose መተግበርያ](/docs/en/deploy/docker) — አንድ-ሰርቨር መመሪያ
- [Kubernetes መተግበርያ](/docs/en/deploy/kubernetes) — Helm chart
- [Co-op Cloud መተግበርያ](/docs/en/deploy/coopcloud) — ትብብር ማስተናገድ
- [Telephony Providers](/docs/en/deploy/providers/) — የድምፅ አቅራቢዎችን ያዋቅሩ
