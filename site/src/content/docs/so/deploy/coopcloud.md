---
title: "Soo saar: Co-op Cloud"
description: Soo saar Llamenos sidii Co-op Cloud recipe oo loogu talagalay kooxaha martigelinta iskaashi-ka.
---

Halkan waxaa ku qoran habka lagu soo saaro Llamenos sidii [Co-op Cloud](https://coopcloud.tech) recipe. Co-op Cloud waxay isticmaashaa Docker Swarm iyada oo Traefik uu ka dhigo TLS termination iyo `abra` CLI si loo maareeyo apps si isku mid ah — waxay u habboon tahay tech co-ops iyo kooxaha martigelinta yaryar.

Recipe-ga waxaa lagu maareeyaa [repo gaar ah](https://github.com/rhonda-rodododo/llamenos-template).

## Shuruudaha hore

- Server leh [Docker Swarm](https://docs.docker.com/engine/swarm/) oo la bilaabay iyo [Traefik](https://doc.traefik.io/traefik/) oo u shaqeeya sidii reverse proxy
- [`abra` CLI](https://docs.coopcloud.tech/abra/install/) oo ku rakiban mashiinkaaga
- Magac domain oo DNS uu u jeediyo IP-ga server-ka
- Helitaanka SSH ee server-ka

Haddii aad cusub tahay Co-op Cloud, raac [hagga Co-op Cloud setup](https://docs.coopcloud.tech/intro/) marka hore.

## Bilow degdeg ah

```bash
# Ku dar server-ka (haddii aanu horey u jirin)
abra server add hotline.example.com

# Clone recipe-ga (abra waxay ka eegaysaa recipes-ka ~/.abra/recipes/)
git clone https://github.com/rhonda-rodododo/llamenos-template.git \
  ~/.abra/recipes/llamenos

# Abuur app cusub oo Llamenos ah
abra app new llamenos --server hotline.example.com --domain hotline.example.com

# Abuur dhammaan sirta
abra app secret generate -a hotline.example.com

# Soo saar
abra app deploy hotline.example.com
```

Booqo `https://hotline.example.com` oo raac setup wizard si aad u abuurto akoonkaaga admin.

## Adeegyada aasaasiga ah

Recipe-ga waxay soo saartaa shan adeeg:

| Adeeg | Image | Ujeeddo |
|---------|-------|---------|
| **web** | `nginx:1.27-alpine` | Reverse proxy iyada oo leh Traefik labels |
| **app** | `ghcr.io/rhonda-rodododo/llamenos-platform` | Server-ka codsiga Bun |
| **db** | `postgres:17-alpine` | Xogta PostgreSQL |
| **RustFS** | `RustFS/RustFS` | Kaydinta faylasha ee la midka ah S3 |
| **relay** | `dockurr/WebSocket relay` | WebSocket relay dhacdooyinka waqti-dhabta ah |

## Sirta

Dhammaan sirta waxaa loo maareeyaa via Docker Swarm secrets (la tixgeliyay, aan la beddeli karin):

| Sir | Nooca | Sharaxaad |
|--------|------|-------------|
| `hmac_secret` | hex (64 xaraf) | Fure saxiixa HMAC ee tokens-ka xilliga |
| `server_WebSocket` | hex (64 xaraf) | Fure aqoonta WebSocket ee server-ka |
| `db_password` | alnum (32 xaraf) | Furaha PostgreSQL |
| `RustFS_access` | alnum (20 xaraf) | Fure helitaanka RustFS |
| `RustFS_secret` | alnum (40 xaraf) | Fure sirta ah ee RustFS |

Abuur dhammaan sirta hal mar:

```bash
abra app secret generate -a hotline.example.com
```

Si aad u beddesho sir gaar ah:

```bash
# 1. Kic version-ka config-kaaga app-ka
abra app config hotline.example.com
# Beddel SECRET_HMAC_SECRET_VERSION=v2

# 2. Abuur sir cusub
abra app secret generate hotline.example.com hmac_secret

# 3. Dib u soo saar
abra app deploy hotline.example.com
```

## Configuration

Tafatir config-ka app-ka:

```bash
abra app config hotline.example.com
```

Goobaha muhiimka ah:

```env
DOMAIN=hotline.example.com
LETS_ENCRYPT_ENV=production

# Magaca muujinta ee lagu arko app-ka
HOTLINE_NAME=My Hotline

# Bixiyaha telephony (tafatir kadib setup wizard)
# PBX_TYPE=twilio
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=

# Ama SignalWire
# PBX_TYPE=signalwire
# SIGNALWIRE_PROJECT_ID=
# SIGNALWIRE_AUTH_TOKEN=
# SIGNALWIRE_PHONE_NUMBER=
# SIGNALWIRE_SPACE_URL=

# Version-ka sirta (kic si aad u beddesho)
SECRET_HMAC_SECRET_VERSION=v1
SECRET_SERVER_NOSTR_VERSION=v1
SECRET_DB_PASSWORD_VERSION=v1
SECRET_STORAGE_ACCESS_VERSION=v1
SECRET_STORAGE_SECRET_VERSION=v1
```

## Soo galida ugu horreysa

Kadib soo saarista, fur domain-kaaga browser-ka oo raac setup wizard:

1. **Abuur akoonkaaga admin** — deji magac muujin iyo PIN-kaaga
2. **Magac bixi hotline-kaaga** — deji magaca muujinta ee lagu arko app-ka
3. **Dooro kanaalada** — fur Voice, SMS, WhatsApp, Signal, iyo/ama Reports
4. **Tafatir bixiyeyaasha** — geli aqoonsiga kanaal kasta oo la furay
5. **Dib u eeg oo dhammeystir**

## Tafatir webhooks

U jeedi webhooks-ka bixiyahaaga telephony domain-kaaga:

- **Voice (soo galaya)**: `https://hotline.example.com/api/telephony/incoming`
- **Voice (xaaladda)**: `https://hotline.example.com/api/telephony/status`
- **SMS**: `https://hotline.example.com/api/messaging/sms/webhook`
- **WhatsApp**: `https://hotline.example.com/api/messaging/whatsapp/webhook`
- **Signal**: Tafatir bridge si uu u gudbiyo `https://hotline.example.com/api/messaging/signal/webhook`

Eeg hagga bixiyaha gaarka ah: [Twilio](/docs/en/deploy/providers/twilio), [SignalWire](/docs/en/deploy/providers/signalwire), [Vonage](/docs/en/deploy/providers/vonage), [Plivo](/docs/en/deploy/providers/plivo).

## Ikhtiyaar: Fur Signal sidecar

Farriimaha Signal (eeg [Signal setup](/docs/en/deploy/providers/signal)):

```bash
abra app config hotline.example.com
```

Deji:

```env
COMPOSE_FILE=compose.yml:compose.signal.yml
SECRET_SIGNAL_NOTIFIER_TOKEN_VERSION=v1
```

Abuur sir dheeraad ah oo dib u soo saar:

```bash
abra app secret generate hotline.example.com signal_notifier_token
abra app deploy hotline.example.com
```

## Ikhtiyaar: Fur SIP bridge

Telephony SIP oo gacanta lagu hayo via Asterisk, FreeSWITCH, ama Kamailio:

```bash
abra app config hotline.example.com
```

Deji:

```env
COMPOSE_FILE=compose.yml:compose.telephony.yml
PBX_TYPE=asterisk
SECRET_ARI_PASSWORD_VERSION=v1
SECRET_BRIDGE_SECRET_VERSION=v1
```

Abuur sirta dheeraadka ah oo dib u soo saar:

```bash
abra app secret generate hotline.example.com ari_password bridge_secret
abra app deploy hotline.example.com
```

## Ikhtiyaar: Fur transcription

Kudar transcription overlay (waxay u baahan tahay 4 GB+ RAM):

```bash
abra app config hotline.example.com
```

Deji:

```env
COMPOSE_FILE=compose.yml:compose.transcription.yml
WHISPER_MODEL=Systran/faster-whisper-base
WHISPER_DEVICE=cpu
```

Kadib dib u soo saar:

```bash
abra app deploy hotline.example.com
```

Isticmaal `WHISPER_DEVICE=cuda` haddii server-kaagu leeyahay GPU.

## Cusbooneysiinta

```bash
abra app upgrade hotline.example.com
```

Tani waxay soo jiidataa version-ka recipe ugu dambeeya oo dib u soo saartaa. Xogta waxaa lagu kaydiyaa Docker volumes oo way ka badbaadataa cusbooneysiinta.

## Kaydka xogta

### Isdhexgalka backupbot

Recipe-ga waxay ku jirto labels-ka [backupbot](https://docs.coopcloud.tech/backupbot/) si loo kaydiyo PostgreSQL iyo RustFS si otomaatig ah. Haddii server-kaagu uu ku shaqeeyo backupbot, kaydka xogtuu si otomaatig ah u dhacayaa.

### Kayd gacan ku ah

Isticmaal script-ka kaydka ee ku jira:

```bash
# Ka soo jeeda directory-ga recipe-ga
./pg_backup.sh <stack-name>
./pg_backup.sh <stack-name> /backups    # directory gaar ah, 7-maalmood oo joogtayn
```

Ama kaydi si toos ah:

```bash
# PostgreSQL
docker exec $(docker ps -q -f name=<stack-name>_db) \
  pg_dump -U llamenos llamenos | gzip > backup-$(date +%Y%m%d).sql.gz

# RustFS (kaydinta faylasha)
docker run --rm \
  -v <stack-name>_RustFS-data:/data \
  -v /backups:/backups \
  alpine tar czf /backups/RustFS-$(date +%Y%m%d).tar.gz /data
```

Soo celi PostgreSQL:

```bash
gunzip -c backup-20260101.sql.gz | \
  docker exec -i $(docker ps -q -f name=<stack-name>_db) \
  psql -U llamenos llamenos
```

## Kormeerka

### Hubinta caafimaadka

Dhammaan adeegyadu waxay leeyihiin Docker health checks. Hubi xaaladda:

```bash
abra app ps hotline.example.com
```

App-ku waxay soo bandhigaysaa endpoints-ka caafimaadka:

```bash
curl https://hotline.example.com/health/ready
# {"status":"ok"}
curl https://hotline.example.com/health/live
# {"status":"ok"}
```

### Log-yada

```bash
# Dhammaan adeegyada
abra app logs hotline.example.com

# Adeeg gaar ah
abra app logs hotline.example.com app

# Raac log-yada waqti-dhabta ah
abra app logs -f hotline.example.com app

# Raac dhammaan adeegyada
abra app logs -f hotline.example.com
```

## Tixraaca amarka abra

| Amarka | Sharaxaad |
|---------|-------------|
| `abra app ps hotline.example.com` | Muuji containers-ka shaqeeya iyo caafimaadka |
| `abra app logs [-f] hotline.example.com [service]` | Eeg (oo raac) log-yada |
| `abra app config hotline.example.com` | Tafatir config-ka app-ka (furaya `$EDITOR`) |
| `abra app secret ls hotline.example.com` | Liis sirta iyo version-yadooda |
| `abra app secret generate hotline.example.com [name]` | Abuur hal ama dhammaan sirta |
| `abra app deploy hotline.example.com` | Soo saar (ama dib u soo saar) app-ka |
| `abra app upgrade hotline.example.com` | Soo jiid recipe ugu dambeeya oo dib u soo saar |
| `abra app undeploy hotline.example.com` | Jooji oo ka saar app-ka (xogta way badbaadataa) |
| `abra app run hotline.example.com app -- bun run ...` | Ordi amar hal mar ku jira container-ka app-ka |

## Qaab-dhismeedka adeegyada

![Co-op Cloud Architecture](/diagrams/coopcloud-architecture.svg)

## Xalinta dhibaatooyinka

### App ma bilaabmayo

```bash
abra app logs hotline.example.com app
abra app ps hotline.example.com
```

Hubi in dhammaan sirta la abuuray:

```bash
abra app secret ls hotline.example.com
```

Sirta maqan waxay u muuqanayaan version madhan. Abuur:

```bash
abra app secret generate hotline.example.com
```

### Dhibaatooyinka shahaadada

Traefik waxay maareysaa TLS. Hubi log-yada Traefik server-kaaga:

```bash
docker service logs traefik
```

Hubi in DNS-ga domain-kaagu uu u jeediyo server-ka iyo in alaabada 80/443 ay furan yihiin.

### Dhibaatooyinka isku xirka xogta

Hubi in container-ka app-ku uu gaari karo PostgreSQL:

```bash
abra app run hotline.example.com app -- \
  bun -e "const { sql } = await import('bun'); await sql\`SELECT 1\`; console.log('ok')"
```

### Beddelka sirta

Haddii sir la qabsado:

1. Kic version-ka config-ka app-ka: `abra app config hotline.example.com`
   (tusaale, beddel `SECRET_HMAC_SECRET_VERSION=v2`)
2. Abuur sir cusub: `abra app secret generate hotline.example.com hmac_secret`
3. Dib u soo saar: `abra app deploy hotline.example.com`

### WebSocket relay ma isku xirayo

Dhacdooyinka waqti-dhabta ah waxay u baahan yihiin WebSocket relay. Haddii aad aragto khaladaad WebSocket:

```bash
abra app logs hotline.example.com relay
abra app ps hotline.example.com
```

Xaqiiji in Nginx config uu u gudbiyo `/WebSocket` relay container-ka ee alaabada 7777.

## Tallaabooyinka xiga

- [Hagga Admin](/docs/en/guides/?audience=operator) — tafatir hotline-ka
- [Guud ahaan Self-Hosting](/docs/en/deploy/self-hosting) — isbarbardhig xulashooyinka soo saarista
- [Soo saarista Docker Compose](/docs/en/deploy/docker) — xulasho kale oo hal-server ah
- [Recipe repository](https://github.com/rhonda-rodododo/llamenos-template) — isbitaalka Co-op Cloud recipe
- [Co-op Cloud documentation](https://docs.coopcloud.tech/) — wax badan oo ku saabsan platform-ka
