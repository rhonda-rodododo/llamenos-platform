---
title: Apèsi Otojere
description: Depoze Llamenos sou pwòp enfrastriktirè ou a ak Docker Compose oswa Kubernetes.
---

Llamenos ka kouri sou Cloudflare Workers **oswa** sou pwòp enfrastriktirè ou a. Otojere ba ou kontwòl konplè sou rezidans done, izolasyon rezo, ak chwa enfrastriktirè — enpòtan pou òganizasyon ki pa ka itilize platfòm nwaj tiyès oswa ki bezwen satisfè egzijans konformite estrik.

## Opsyon depoze

| Opsyon | Pi bon pou | Konpleksite | Eskalad |
|--------|----------|------------|---------|
| [Cloudflare Workers](/docs/getting-started) | Kòmansman pi fasil, bò mondyal | Ba | Otomatik |
| [Docker Compose](/docs/deploy-docker) | Otojere sèvè sèl | Mwayen | Nod sèl |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Òkestrasyon miltisèvis | Pi wo | Orizontal (miltiplik replik) |

## Diferans achitekti

Tou de sib depoze yo kouri **menm kòd aplikasyon egzak la**. Diferans lan se nan kouch enfrastriktirè a:

| Konpozant | Cloudflare | Otojere |
|-----------|------------|-------------|
| **Ekzekisyon backend** | Cloudflare Workers | Node.js (via Hono) |
| **Depo done** | Durable Objects (KV) | PostgreSQL |
| **Depo blob** | R2 | RustFS (konpatib S3) |
| **Trankskripsyon** | Whisper bò kliyan (WASM) | Whisper bò kliyan (WASM) |
| **Fichye estatik** | Workers Assets | Caddy / Hono serveStatic |
| **Evènman an tan reyèl** | Relè Nostr (Nosflare) | Relè Nostr (strfry) |
| **Tèminasyon TLS** | Bò Cloudflare | Caddy (HTTPS otomatik) |
| **Kòut** | Baze sou itilizasyon (nivo gratis disponib) | Kòut sèvè ou yo |

## Sa ou bezwen

### Egzijans minimòm

- Yon sèvè Linux (2 kè CPU, 2 Go RAM minimòm)
- Docker ak Docker Compose v2 (oswa yon klastè Kubernetes pou Helm)
- Yon non domèn ki pwen sou sèvè ou a
- Yon pè kle admin (jenere ak `bun run bootstrap-admin`)
- Omwen yon chanèl kominikasyon (founisè vwa, SMS, elatriye)

### Konpozant opsyonèl

- **Trankskripsyon Whisper** — bezwen 4 Go+ RAM (CPU) oswa yon GPU pou tretman pi vit
- **Asterisk** — pou telefoni SIP otojere (gade [konfigirasyon Asterisk](/docs/setup-asterisk))
- **Pon Signal** — pou mesaj Signal (gade [konfigirasyon Signal](/docs/setup-signal))

## Konparezon rapid

**Chwazi Docker Compose si:**
- Ou ap kouri sou yon sèvè sèl oswa VPS
- Ou vle konfigirasyon otojere pi senp posib
- Ou alèz ak baz Docker

**Chwazi Kubernetes (Helm) si:**
- Ou deja gen yon klastè K8s
- Ou bezwen eskalad orizontal (miltiplik replik)
- Ou vle entegre ak zouti K8s egzistan (cert-manager, external-secrets, elatriye)

## Konsiderasyon sekirite

Otojere ba ou plis kontwòl men tou plis responsablite:

- **Done an repo**: Done PostgreSQL estoke san chifman pa default. Itilize chifman disque entegral (LUKS, dm-crypt) sou sèvè ou a, oswa aktive PostgreSQL TDE si disponib. Remake ke nòt apèl ak trankskripsyon deja E2EE — sèvè a pa janm wè tèks klè.
- **Sekirite rezo**: Itilize yon firewall pou restriksyon aksè. Sèlman pò 80/443 ta dwe aksesib piblikman.
- **Sekrè**: Pa janm mete sekrè nan fichye Docker Compose oswa kontwòl vèsyon. Itilize fichye `.env` (ekskli soti nan imaj) oswa sekrè Docker/Kubernetes.
- **Mizajou**: Tire nouvo imaj regilyèman. Gade [jounal chanjman](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) pou kòrèksyon sekirite.
- **Backup**: Fè backup baz done PostgreSQL ak depo RustFS regilyèman. Gade seksyon backup nan chak gid depoze.

## Etap pwochen yo

- [Depoze Docker Compose](/docs/deploy-docker) — kouri nan 10 minit
- [Depoze Kubernetes](/docs/deploy-kubernetes) — depoze ak Helm
- [Kòmanse](/docs/getting-started) — depoze Cloudflare Workers
