---
title: Bilowga
description: Hawlgeli khadkaaga gurmadka Llámenos daqiiqooyin gudahood.
---

Samee khad gurmad ah oo Llámenos ah oo si maxalli ah ama server-ka uga shaqeeya. Docker oo keliya ayaa loo baahan yahay — ma jiro Node.js, Bun, ama runtimes kale oo loo baahan yahay host-ka.

## Sida ay u shaqeyso

Marka qof u waco lambarka khadkaaga gurmadka, Llámenos wuxuu u mariyaa wicitaanka dhammaan isticmaalayaasha shifta ah isla mar. Isticmaalaha ugu horreeya ee ka jawaaba ayaa la xiraya, kuwa kalena dhawaqtii way joogsataa. Ka dib marka wicitaanku dhammaado, isticmaaluhu wuxuu kaydin karaa qoraallo sir ah oo ku saabsan wada hadalka.

![Marinta Wicitaanka](/diagrams/call-routing.svg)

Isla marintu waxay khuseysaa SMS, WhatsApp, Signal, iyo kanaalada kale ee farriiminta — waxay ka soo baxaan aragtida **Wada Hadalada** oo midaysan.

## Waxyaabaha loo baahan yahay

- [Docker](https://docs.docker.com/get-docker/) oo leh Docker Compose v2
- `openssl` (si horudhac ah ugu rakiban nidaamyada Linux iyo macOS badankood)
- Git

## Bilow degdeg ah

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
./scripts/docker-setup.sh
```

Tani waxay abuurtaa dhammaan sirta loo baahan yahay, waxay dhisaysaa abka, waxayna bilaabaysaa adeegyada. Marka la dhammaystiro, booqo **http://localhost:8000** oo raac qalabka dejinta:

1. **Abuur akoonkaaga maamulka** — deji magac muujin ah iyo PIN-kaaga
2. **Ku magacaw khadkaaga gurmadka** — deji magaca muujinta ee lagu muujiyay abka
3. **Dooro kanaalada** — shid Codka, SMS, WhatsApp, Signal, iyo/ama Warbixinada
4. **Qaabee bixiyeyaasha** — gali aqoonsiyaha kanaal kasta oo la shiday
5. **Dib-u-eegis oo dhammaystir**

### Isku day habka tusaalaha (demo)

Si aad u sahamiso xog tusaale oon horay loo buuxiyay:

```bash
./scripts/docker-setup.sh --demo
```

## Hawlgalka wax-soo-saarka

Server leh domain dhab ah iyo TLS toos ah:

```bash
./scripts/docker-setup.sh --domain hotline.yourorg.com --email admin@yourorg.com
```

Caddy si toos ah ayuu u bixiyaa shahaadada Let's Encrypt TLS. Hubi in port-yada 80 iyo 443 ay furan yihiin. Calanka `--domain` wuxuu hawlgeliyayaa daboolka Docker Compose wax-soo-saarka, kaas oo ku dara TLS, wareejinta log-ga, iyo xaddidaadda kheyraadka.

Ka eeg [tilmaanta hawlgalka Docker Compose](/docs/en/deploy/docker) faahfaahin buuxda oo ku saabsan adaynta server-ka, kaydka, la socodka, iyo adeegyada ikhtiyaariga ah.

## Adeegyada aasaasiga ah

Dejinta Docker waxay bilaabaysaa adeegyadan aasaasiga ah:

| Adeegga | Ujeeddo | Port |
|---|---|---|
| **app** | Abka Llámenos (Bun) | 3000 (gudaha) |
| **postgres** | Kaydka xogta PostgreSQL | 5432 (gudaha) |
| **caddy** | Reverse proxy + TLS toos ah | 8000 (maxalli), 80/443 (wax-soo-saar) |
| **RustFS** | Kaydka faylka S3-compatible | 9000 (gudaha) |
| **WebSocket relay** | WebSocket relay ee dhacdooyinka wakhtiga-dhabta ah | 7777 (gudaha) |

Profiles-ka ikhtiyaariga ah waxay ku daraan: signal-notifier sidecar, sip-bridge (Asterisk/FreeSWITCH/Kamailio), Ollama/vLLM inference, Prometheus monitoring.

## Baaritaannada caafimaadka

Abku wuxuu soo bandhigaa laba dhammaad oo caafimaad oo ay isticmaalaan hubinta caafimaadka Docker iyo kubernetes probes:

- `GET /health/ready` — wuxuu soo celiyaa 200 marka abka uu diyaar yahay inuu u adeego taraafikada (DB ku xiran, migrations la dabaqay)
- `GET /health/live` — wuxuu soo celiyaa 200 marka geeddi-socodka abku nool yahay

## Qaabee webhooks-ka

Ka dib hawlgalka, u jeedi webhooks-ka bixiyahaaga telefoonada xiriiriyahaaga hawlgalka:

| Webhook | URL |
|---|---|
| Codka (soo-gala) | `https://your-domain/api/telephony/incoming` |
| Codka (heerka) | `https://your-domain/api/telephony/status` |
| SMS | `https://your-domain/api/messaging/sms/webhook` |
| WhatsApp | `https://your-domain/api/messaging/whatsapp/webhook` |
| Signal | Hor u gudbi `https://your-domain/api/messaging/signal/webhook` |

Dejinta bixiye-gaar ah: [Twilio](/docs/en/deploy/providers/twilio), [SignalWire](/docs/en/deploy/providers/signalwire), [Vonage](/docs/en/deploy/providers/vonage), [Plivo](/docs/en/deploy/providers/plivo), [Asterisk](/docs/en/deploy/providers/asterisk), [SMS](/docs/en/deploy/providers/sms), [WhatsApp](/docs/en/deploy/providers/whatsapp), [Signal](/docs/en/deploy/providers/signal).

## Tallaabooyinka xiga

- [Hawlgalka Docker Compose](/docs/en/deploy/docker) — tilmaanta hawlgalka wax-soo-saarka buuxda oo leh kayd iyo la socod
- [Hawlgalka Kubernetes](/docs/en/deploy/kubernetes) — ku hawlgali Helm
- [Hawlgalka Co-op Cloud](/docs/en/deploy/coopcloud) — ku hawlgali kooxaha martigelinta iskaashiga ah
- [Bixiyeyaasha Telefoonada](/docs/en/deploy/providers/) — isbarbar dhig bixiyeyaasha codka
- [Dulmarka Is-hawlgabka](/docs/en/deploy/self-hosting) — isbarbar dhig dhammaan ikhtiyaarada hawlgalka
