---
title: Dulmarka Is-hawlgabka
description: Ku hawlgali Llámenos kaabayaashaaga gaarka ah iyadoo la isticmaalayo Docker Compose, Kubernetes, ama Co-op Cloud.
---

Llámenos waxaa loogu talagalay inuu ku shaqeeyo kaabayaashaaga gaarka ah. Is-hawlgabku wuxuu ku siinayaa kontorool buuxda oo ku saabsan deganaanshaha xogta, goonida shabakadda, iyo doorashooyinka kaabayaasha — oo muhiim u ah ururrada ilaalinaya ka soo horjeeda cadawga si fiican u maalgeliyay.

## Ikhtiyaarada hawlgalka

| Ikhtiyaarka | Ugu wanaagsan | Kakanta | Baaxadaynta |
|---|---|---|---|
| [Docker Compose](/docs/en/deploy/docker) | Hal-server, bilawga lagu taliyay | Hoos | Hal node |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Isku-duubka adeegyada badan | Dhexdhexaad | Toos ah (nuqulo badan) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Kooxaha martigelinta iskaashiga ah | Hoos | Hal node (Swarm) |

## Faylasha Docker Compose

Docker Compose wuxuu isticmaalaa hab lakab leh:

| Faylka | Ujeeddo |
|---|---|
| `deploy/docker/docker-compose.yml` | Qaabeynta asaasiga — dhammaan adeegyada, shabakadaha, mugga |
| `deploy/docker/docker-compose.production.yml` | Daboolka wax-soo-saarka — TLS iyada oo loo marayo Let's Encrypt, wareejinta log-ga, xaddidaadda kheyraadka, CSP adag |
| `deploy/docker/docker-compose.dev.yml` | Daboolka horumarinta — daawashada faylka, port-yada la soo bandhigay |
| `deploy/docker/docker-compose.ci.yml` | Daboolka CI — deegaan tijaabo oo go'aamiye ah |

**Horumarinta maxalliga ah**, isticmaal daboolka horumarinta. **Wax-soo-saarka**, saar daboolka wax-soo-saarka:

```bash
# Maxalli (adeegyada taageerada oo keliya + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Wax-soo-saar
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

Ama isticmaal qoraalka dejinta:

```bash
./scripts/docker-setup.sh                                     # maxalli
./scripts/docker-setup.sh --domain hotline.org --email a@b   # wax-soo-saar
```

## Adeegyada aasaasiga ah

Dhammaan bartilmaameedyada hawlgalka waxay wadaan adeegyadan aasaasiga ah:

| Qaybta | Ujeeddo |
|---|---|
| **Bun application** | Hono API server + u adeegista faylasha taagan |
| **PostgreSQL** | Kaydka xogta aasaasiga ah |
| **RustFS** | Kaydka blob S3-compatible (farriimaha codka, lifaaqyada, dhoofinta) |
| **WebSocket relay** | WebSocket relay ee dhacdooyinka wakhtiga-dhabta ah (had iyo jeer loo baahan yahay) |
| **Caddy** | Reverse proxy + TLS toos ah (Docker Compose) |

## Adeegyada ikhtiyaariga ah

| Qaybta | Profile | Ujeeddo |
|---|---|---|
| **signal-notifier** | `signal` | Signal notification sidecar eber-aqoon (port 3100) |
| **sip-bridge** | `telephony` | Buundada SIP Asterisk/FreeSWITCH/Kamailio (PBX_TYPE wuxuu doortaa backend-ka) |
| **Ollama/vLLM** | `inference` | Soo-saarka LLM soo-saarka farriinta |
| **Prometheus + Grafana** | `monitoring` | Cabbirada iyo digniinta |

## Waxa aad u baahan tahay

### Shuruudaha ugu yar

- Server Linux ah (2 CPU core, 2 GB RAM ugu yar)
- Docker iyo Docker Compose v2 (ama cluster Kubernetes Helm)
- Magac domain ah oo tilmaamaya server-kaaga
- `openssl` (soo-saarista sirta)
- Ugu yaraan hal kanaal isgaadhsiineed oo la qaabeyay

### Qaybaha ikhtiyaariga ah

- **Qoraal-qaadista** — WASM Whisper dhinaca macmiilka; ma jiro qayb server oo dheeri ah oo loo baahan yahay
- **Buundada SIP** — PBX is-hawlgab (Asterisk/FreeSWITCH/Kamailio)
- **Buundada Signal** — farriiminta Signal

## Cloudflare Tunnels (ingress beddel ah)

Halkii aad si toos ah u soo bandhigi lahayd port-yada 80/443, waxaad isticmaali kartaa [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) ingress-ka. Tani waxay qarisaa IP-ga server-kaaga waxayna bixisaa ilaalinta DDoS:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Qaabee tunnel-ka inuu u gudbiyo `http://localhost:3000`.

## Tixgelinta amniga

Is-hawlgabku wuxuu ku siinayaa kontorool dheeri ah laakiin sidoo kale mas'uuliyad dheeri ah:

- **Xogta inta la kaydinayo**: Xogta PostgreSQL waxaa loo kaydiyaa iyada oo aan la sirin sida caadiga ah. Isticmaal sirta saxanka-buuxa (LUKS, dm-crypt) server-kaaga. Qoraallada wicitaanka, qoraal-qaadista, iyo farriimaha waa E2EE — server-ku marna ma arko qoraal cad.
- **Amniga shabakadda**: Isticmaal dab-damiya. Oo keliya port-yada 80/443 waa inay ahaadaan kuwa dadweynaha loo heli karo.
- **Sirta**: Marna gelin sirta faylasha Docker Compose ama kontoroola noocyada. Isticmaal faylasha `.env` (gitignored) ama sirta Docker/Kubernetes.
- **Cusboonaysiinta**: Si joogto ah u soo jiid sawirrada cusub. Daawado changelog-ka sixidda amniga.
- **Kaydka**: Kaydi kaydka xogta PostgreSQL iyo kaydka RustFS si joogto ah.

## Heesaha Ansible

Buugga `deploy/ansible/` wuxuu ka kooban yahay heeso hubinta ka-hor-hawlgalka iyo ka-dib-hawlgalka (smoke-check):

```bash
# Xaqiijinta nidaamka ka hor hawlgalka
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Hubiska ka dib hawlgalka
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Tallaabooyinka xiga

- [Hawlgalka Docker Compose](/docs/en/deploy/docker) — tilmaanta hal-server
- [Hawlgalka Kubernetes](/docs/en/deploy/kubernetes) — jaantuska Helm
- [Hawlgalka Co-op Cloud](/docs/en/deploy/coopcloud) — martigelinta iskaashiga ah
- [Bixiyeyaasha Telefoonada](/docs/en/deploy/providers/) — qaabee bixiyeyaasha codka
