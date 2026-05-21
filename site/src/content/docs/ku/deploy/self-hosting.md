---
title: Kurteya Xweser-Sazkirinê
description: Llamenos li ser înfrastruktura xwe ya xwe bi Docker Compose, Kubernetes, an Co-op Cloud saz bikin.
---

Llamenos hatiye sêwirandin ku li ser înfrastruktura xwe ya xwe bixebite. Xweser-sazkirin kontrola tevahî li ser cihê daneyan, îzolasyona torê, û hilbijartinên înfrastrukturê dide -- ji bo saziyên ku li dijî dijminên bi darê xurt tê parastin girîng e.

## Vebijarkên sazkirinê

| Vebijark | Herî Baş Ji Bo | Tevlîhevî | Pêşveçûn |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Serverek-tak, destpêka tê pêşniyaz kirin | Kêm | Giredanek-tak |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Orkestrasyona karûbarên pirjimar | Navîn | Horizontal (pir-replîka) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Komên mêvandariya kooperatîf | Kêm | Giredanek-tak (Swarm) |

## Pelên Docker Compose

Docker Compose rêyek pêçayî bikar tîne:

| Pel | Armanc |
|------|---------|
| `deploy/docker/docker-compose.yml` | Mîhenga bingehîn -- hemû karûbar, tor, volume |
| `deploy/docker/docker-compose.production.yml` | Overlay-a hilberînê -- TLS bi navgîniya Let's Encrypt, rojanebûna log, sînorên çavkanî, CSP-ê tund |
| `deploy/docker/docker-compose.dev.yml` | Overlay-a pêşvebirinê -- şopandina pel, portên eşkere |
| `deploy/docker/docker-compose.ci.yml` | Overlay-a CI -- jîngeha testê ya diyarkirî |

Ji bo **pêşvebirinê ya herêmî**, overlay-a pêşvebirinê bikar bînin. Ji bo **hilberînê**, overlay-a hilberînê zêde bikin:

```bash
# Herêmî (tenê karûbarên piştgirî + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Hilberîn
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

An jî skrîpta sazkirinê bikar bînin:

```bash
./scripts/docker-setup.sh                                     # herêmî
./scripts/docker-setup.sh --domain hotline.org --email a@b   # hilberîn
```

## Karûbarên bingehîn

Hemû armancên sazkirinê van karûbarên bingehîn dimeşînin:

| Komponent | Armanc |
|-----------|---------|
| **Bun application** | Hono API server + xizmetkirina pelên statîk |
| **PostgreSQL** | Danegeha bingehîn |
| **RustFS** | Storage-a blob-ê ya S3-hevgirtî (peyama dengî, pêvek, derxistin) |
| **WebSocket relay** | WebSocket relay ji bo bûyerên dem-rast (her dem pêwîst e) |
| **Caddy** | Proxy-ê berevajî + TLS-ya otomatîk (Docker Compose) |

## Karûbarên bijarte

| Komponent | Profîl | Armanc |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Sidecar-a hişyariya Signal-a zero-knowledge (port 3100) |
| **sip-bridge** | `telephony` | SIP bridge ji bo Asterisk/FreeSWITCH/Kamailio (PBX_TYPE backend hilbijêre) |
| **Ollama/vLLM** | `inference` | LLM inference ji bo derxistina peyamê |
| **Prometheus + Grafana** | `monitoring` | Metrîk û hişyarî |

## Tiştên ku hûn hewce ne

### Pêwîstiyên kêmtirîn

- Serverek Linux (kêmtirîn 2 core CPU, 2 GB RAM)
- Docker û Docker Compose v2 (an clusterek Kubernetes ji bo Helm)
- Navê domainek ku ber bi servera we tê
- `openssl` (ji bo çêkirina sirên)
- Kêmtirîn kanalek ragihandinê hatiye mîhengkirin

### Komponentên bijarte

- **Transkripsiyon** -- Whisper-a aliyê xerîdar WASM; tu komponenta serverê ya zêdetir pêwîst nîne
- **SIP bridge** -- ji bo PBX-a xweser (Asterisk/FreeSWITCH/Kamailio)
- **Signal bridge** -- ji bo peyamên Signal

## Cloudflare Tunnels (ingress-a alternatîf)

Li şûna eşkerekirina rasterast a portên 80/443, hûn dikarin [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) ji bo ingress bikar bînin. Ev IP-ya servera we vedişêre û parastina DDoS peyda dike:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Tunnel saz bikin da ku ber bi `http://localhost:3000` ve were şandin.

## Lihevkirinên ewlehiyê

Xweser-sazkirin kontrola zêdetir dide we lê her wiha berpirsiyariya zêdetir:

- **Daneyên li ser dîsk**: Daneyên PostgreSQL bi xweber ne şîfrekirî ne. Şîfrekirina dîska tevahî (LUKS, dm-crypt) li ser servera xwe bikar bînin. Nîşok, transkripsiyon, û peyam E2EE ne -- server tu carî plaintext nabîne.
- **Ewlehiya torê**: Firewall bikar bînin. Tenê portên 80/443 divê gihîştî bin.
- **Sir**: Tu carî sirên di pelên Docker Compose de an jî di kontrola guhertoyê de nekin. Pelên `.env` (gitignored) an jî sirên Docker/Kubernetes bikar bînin.
- **Nûvekirin**: Bi rêkûpêk wêneyên nû bikişînin. Ji bo çareseriyên ewlehiyê guhertoya dawî bişopînin.
- **Backup**: Danegeha PostgreSQL û storage-a RustFS bi rêkûpêk backup bikin.

## Playbookên Ansible

Peldanka `deploy/ansible/` playbookên preflight û smoke-check dihewîne:

```bash
# Verastkirina pergala berî-sazkirinê
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Smoke check piştî-sazkirinê
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Gavên din

- [Sazkirina Docker Compose](/docs/en/deploy/docker) -- rêbera serverek-tak
- [Sazkirina Kubernetes](/docs/en/deploy/kubernetes) -- chart-a Helm
- [Sazkirina Co-op Cloud](/docs/en/deploy/coopcloud) -- mêvandariya kooperatîf
- [Pêşkêşkarên Telefoniyê](/docs/en/deploy/providers/) -- pêşkêşkarên dengê mîheng bikin
