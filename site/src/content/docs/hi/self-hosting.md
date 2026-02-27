---
title: Self-Hosting अवलोकन
description: Docker Compose या Kubernetes के साथ अपने बुनियादी ढांचे पर Llamenos deploy करें।
---

Llamenos Cloudflare Workers **या** आपके खुद के बुनियादी ढांचे पर चल सकता है। Self-hosting आपको data residency, network isolation, और infrastructure choices पर पूर्ण नियंत्रण देता है — उन संगठनों के लिए महत्वपूर्ण जो third-party cloud platforms उपयोग नहीं कर सकते या सख्त अनुपालन आवश्यकताओं को पूरा करने की जरूरत है।

## Deployment options

| विकल्प | सबसे अच्छा | जटिलता | Scaling |
|--------|----------|------------|---------|
| [Cloudflare Workers](/docs/getting-started) | सबसे आसान शुरुआत, global edge | कम | स्वचालित |
| [Docker Compose](/docs/deploy-docker) | Single-server self-hosting | मध्यम | Single node |
| [Kubernetes (Helm)](/docs/deploy-kubernetes) | Multi-service orchestration | अधिक | Horizontal (multi-replica) |

## Architecture अंतर

दोनों deployment targets **बिल्कुल समान एप्लिकेशन कोड** चलाते हैं। अंतर infrastructure layer में है:

| Component | Cloudflare | Self-Hosted |
|-----------|------------|-------------|
| **Backend runtime** | Cloudflare Workers | Node.js (Hono के माध्यम से) |
| **Data storage** | Durable Objects (KV) | PostgreSQL |
| **Blob storage** | R2 | MinIO (S3-compatible) |
| **Transcription** | Client-side Whisper (WASM) | Client-side Whisper (WASM) |
| **Static files** | Workers Assets | Caddy / Hono serveStatic |
| **Real-time events** | Nostr relay (Nosflare) | Nostr relay (strfry) |
| **TLS termination** | Cloudflare edge | Caddy (automatic HTTPS) |
| **लागत** | Usage-based (free tier उपलब्ध) | आपके server की लागत |

## आपको क्या चाहिए

### न्यूनतम आवश्यकताएं

- एक Linux सर्वर (2 CPU cores, 2 GB RAM न्यूनतम)
- Docker और Docker Compose v2 (या Helm के लिए Kubernetes cluster)
- आपके सर्वर की ओर इशारा करते domain name
- एक admin keypair (`bun run bootstrap-admin` से generated)
- कम से कम एक communication channel (voice provider, SMS, आदि)

### वैकल्पिक components

- **Whisper transcription** — 4 GB+ RAM (CPU) या तेज़ processing के लिए GPU की आवश्यकता
- **Asterisk** — self-hosted SIP telephony के लिए (देखें [Asterisk setup](/docs/setup-asterisk))
- **Signal bridge** — Signal messaging के लिए (देखें [Signal setup](/docs/setup-signal))

## त्वरित तुलना

**Docker Compose चुनें यदि:**
- आप single server या VPS पर चल रहे हैं
- आप सबसे सरल self-hosted setup चाहते हैं
- आप Docker basics से परिचित हैं

**Kubernetes (Helm) चुनें यदि:**
- आपके पास पहले से K8s cluster है
- आपको horizontal scaling (multiple replicas) की जरूरत है
- आप existing K8s tooling (cert-manager, external-secrets, आदि) के साथ integrate करना चाहते हैं

## सुरक्षा विचार

Self-hosting आपको अधिक नियंत्रण देता है लेकिन अधिक जिम्मेदारी भी:

- **Data at rest**: PostgreSQL data डिफ़ॉल्ट रूप से unencrypted रहता है। अपने सर्वर पर full-disk encryption (LUKS, dm-crypt) उपयोग करें, या उपलब्ध हो तो PostgreSQL TDE सक्षम करें। ध्यान दें कि call notes और transcriptions पहले से ही E2EE हैं — सर्वर कभी plaintext नहीं देखता।
- **Network security**: Access restrict करने के लिए firewall उपयोग करें। केवल ports 80/443 publicly accessible होने चाहिए।
- **Secrets**: Docker Compose files या version control में कभी secrets न डालें। `.env` files (images से excluded) या Docker/Kubernetes secrets उपयोग करें।
- **Updates**: नियमित रूप से नई images pull करें। Security fixes के लिए [changelog](https://github.com/your-org/llamenos/blob/main/CHANGELOG.md) देखें।
- **Backups**: नियमित रूप से PostgreSQL database और MinIO storage का backup लें। प्रत्येक deployment guide में backup section देखें।

## अगले चरण

- [Docker Compose deployment](/docs/deploy-docker) — 10 मिनट में चलना शुरू करें
- [Kubernetes deployment](/docs/deploy-kubernetes) — Helm के साथ deploy करें
- [Getting Started](/docs/getting-started) — Cloudflare Workers deployment
