---
title: Achitekti
description: Apèsi sou achitekti sistèm nan — depo yo, fliks done, kouch chifraj ak kominikasyon an tan reyèl.
---

Paj sa a eksplike kijan Llamenos strukturé, kijan done yo sikile nan sistèm nan, ak kote chifraj aplike.

## Estrikti depo yo

Llamenos divize sou twa depo ki pataje yon protokòl komen ak yon nwayo kriptografik :

```
llamenos              llamenos-core           llamenos-mobile
(Desktop + API)       (Crypto pataje)         (Aplikasyon mobil)
+--------------+      +--------------+        +--------------+
| Tauri v2     |      | Rust crate   |        | React Native |
| Vite + React |      | - Native lib |        | iOS + Android|
| CF Workers   |      | - WASM pkg   |        | UniFFI bind  |
| Durable Objs |      | - UniFFI     |        |              |
+--------------+      +--------------+        +--------------+
       |                  ^      ^                   |
       |  path dep        |      |    UniFFI         |
       +------------------+      +-------------------+
```

- **llamenos** — Aplikasyon biwo a (Tauri v2 ak yon webview Vite + React), backend Cloudflare Worker a, ak backend Node.js pwòp tèt ou a. Sa a se depo prensipal la.
- **llamenos-core** — Yon crate Rust pataje ki aplike tout operasyon kriptografik yo : chifraj anvlòp ECIES, siyati Schnorr, derivasyon kle PBKDF2, HKDF, ak XChaCha20-Poly1305. Konpile nan kòd natif (pou Tauri), WASM (pou navigatè), ak liaisons UniFFI (pou mobil).
- **llamenos-mobile** — Aplikasyon mobil React Native pou iOS ak Android. Itilize liaisons UniFFI pou rele menm kòd Rust kriptografik la.

Twa platfòm yo aplike menm protokòl fil ki defini nan `docs/protocol/PROTOCOL.md`.

## Fliks done

### Apèl k ap antre

```
Moun k ap rele (telefòn)
    |
    v
Founisè telefoni (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | Webhook HTTP
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Verifye ShiftManagerDO pou vòlontè ki nan sèvis
    |                | Kòmanse sonnen an paralèl pou tout vòlontè disponib
    |                v
    |           Founisè telefoni (apèl sòtan pou telefòn vòlontè yo)
    |
    | Premye vòlontè ki reponn
    v
CallRouterDO  -->  Konekte moun k ap rele a ak vòlontè a
    |
    | Apèl fini
    v
Kliyan (navigatè/aplikasyon vòlontè a)
    |
    | Chifre nòt la ak kle inik pa nòt
    | Vlope kle a via ECIES pou tèt li + chak administratè
    v
Worker API  -->  RecordsDO  (estoke nòt chifre + kle vlope yo)
```

### Mesaj k ap antre (SMS / WhatsApp / Signal)

```
Kontak (SMS / WhatsApp / Signal)
    |
    | Webhook founisè
    v
Worker API  -->  ConversationDO
    |                |
    |                | Chifre kontni mesaj la imedyatman
    |                | Vlope kle simetrik via ECIES pou vòlontè asine + admin yo
    |                | Efase tèks klè a
    |                v
    |           Relè Nostr (evènman hub chifre notifye kliyan an liy)
    |
    v
Kliyan (navigatè/aplikasyon vòlontè a)
    |
    | Dechifre mesaj la ak kle prive pwòp li
    | Konpoze repons, chifre sòtan
    v
Worker API  -->  ConversationDO  -->  Founisè mesaj (voye repons)
```

## Durable Objects

Backend la itilize sis Cloudflare Durable Objects (oswa ekvalan PostgreSQL yo pou deplwaman pwòp tèt ou a) :

| Durable Object | Responsablite |
|---|---|
| **IdentityDO** | Jere idantite vòlontè yo, kle piblik yo, non afichaj yo, ak kalifikasyon WebAuthn. Jere kreyasyon ak rachat envitasyon yo. |
| **SettingsDO** | Estoke konfigirasyon liy dèd la : non, chanèl aktive, kalifikasyon founisè, chan nòt pèsonalize, paramèt atenyasyon spam, drapo fonksyonalite. |
| **RecordsDO** | Estoke nòt apèl chifre, rapò chifre, ak metadata atachman fichye. Jere rechèch nòt (sou metadata chifre). |
| **ShiftManagerDO** | Jere orè vire wouk rekiran, gwoup sonn, ak afektasyon vire wouk vòlontè. Detèmine kiyès ki nan sèvis a nenpòt moman. |
| **CallRouterDO** | Òkestre routaj apèl an tan reyèl : sonn an paralèl, tèminasyon premye decrochaj, estati poz, swivi apèl aktif. Jenere repons TwiML/founisè. |
| **ConversationDO** | Jere konvèsasyon mesaj an fil atravè SMS, WhatsApp, ak Signal. Jere chifraj mesaj nan entegrasyon, afektasyon konvèsasyon, ak repons sòtan. |

Tout DO yo aksesib kòm singleton via `idFromName()` ak route entènman lè l sèvi ak yon `DORouter` lejè (metòd + korespondan modèl chemen).

## Matris chifraj

| Done | Chifre ? | Algoritm | Kiyès ki ka dechifre |
|---|---|---|---|
| Nòt apèl | Wi (E2EE) | XChaCha20-Poly1305 + anvlòp ECIES | Otè nòt + tout admin yo |
| Chan pèsonalize nòt | Wi (E2EE) | Menm jan ak nòt yo | Otè nòt + tout admin yo |
| Rapò | Wi (E2EE) | Menm jan ak nòt yo | Otè rapò + tout admin yo |
| Atachman rapò | Wi (E2EE) | XChaCha20-Poly1305 (an fliks) | Otè rapò + tout admin yo |
| Kontni mesaj | Wi (E2EE) | XChaCha20-Poly1305 + anvlòp ECIES | Vòlontè asine + tout admin yo |
| Transkripsyon | Wi (nan repo) | XChaCha20-Poly1305 | Kreyatè transkripsyon + tout admin yo |
| Evènman hub (Nostr) | Wi (simetrik) | XChaCha20-Poly1305 ak kle hub | Tout manm hub aktyèl yo |
| nsec vòlontè | Wi (nan repo) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Vòlontè sèlman |
| Antre jounal odit | Non (pwoteje entegrite) | Chenn hash SHA-256 | Admin yo (li), sistèm (ekri) |
| Nimewo telefòn moun k ap rele | Non (sèlman sèvè) | N/A | Sèvè + admin yo |
| Nimewo telefòn vòlontè yo | Estoke nan IdentityDO | N/A | Admin yo sèlman |

### Konfidansyalite pèsistan pa nòt

Chak nòt oswa mesaj resevwa yon kle simetrik aléatwa inik. Kle sa a vlope via ECIES (kle efemè secp256k1 + HKDF + XChaCha20-Poly1305) endividyèlman pou chak lektè otorize. Konpwomèt kle yon nòt pa révèle anyen sou lòt nòt yo. Pa gen kle simetrik ki dire lontan pou chifraj kontni.

### Yerachi kle yo

```
nsec vòlontè (BIP-340 Schnorr / secp256k1)
    |
    +-- Derive npub (kle piblik x-only, 32 bytes)
    |
    +-- Itilize pou akò kle ECIES (prefiks 02 pou fòm konprese)
    |
    +-- Siyen evènman Nostr (siyati Schnorr)

Kle hub (32 bytes aléatwa, PA derive nan okenn idantite)
    |
    +-- Chifre evènman hub Nostr an tan reyèl
    |
    +-- Vlope ECIES pa manm via LABEL_HUB_KEY_WRAP
    |
    +-- Woulete lè yon manm pati

Kle pa nòt (32 bytes aléatwa)
    |
    +-- Chifre kontni nòt via XChaCha20-Poly1305
    |
    +-- Vlope ECIES pa lektè (vòlontè + chak admin)
    |
    +-- Paka reutilize ant nòt yo
```

## Kominikasyon an tan reyèl

Mizajou an tan reyèl (nouvo apèl, mesaj, chanjman vire wouk, prezans) koule atravè yon relè Nostr :

- **Pwòp tèt ou** : relè strfry k ap kouri akote aplikasyon an nan Docker/Kubernetes
- **Cloudflare** : Nosflare (relè baze sou Cloudflare Workers)

Tout evènman yo efemè (kind 20001) ak chifre ak kle hub la. Evènman yo itilize tag jenerik (`["t", "llamenos:event"]`) pou relè a pa ka distenge tip evènman. Chan kontni an genyen tèks chifre XChaCha20-Poly1305.

### Fliks evènman

```
Kliyan A (aksyon vòlontè)
    |
    | Chifre kontni evènman ak kle hub
    | Siyen kòm evènman Nostr (Schnorr)
    v
Relè Nostr (strfry / Nosflare)
    |
    | Difize bay abòne yo
    v
Kliyan B, C, D...
    |
    | Verifye siyati Schnorr
    | Dechifre kontni ak kle hub
    v
Mete ajou eta UI lokal
```

Relè a wè blòb chifre ak siyati valid men pa ka li kontni evènman oswa detèmine ki aksyon k ap fèt.

## Kouch sekirite

### Kouch transpò

- Tout kominikasyon kliyan-sèvè via HTTPS (TLS 1.3)
- Koneksyon WebSocket nan relè Nostr via WSS
- Politik Sekirite Kontni (CSP) limite sous skrip, koneksyon, ak ansèt frame
- Modèl izolasyon Tauri separe IPC de webview la

### Kouch aplikasyon

- Otantifikasyon via pè kle Nostr (siyati BIP-340 Schnorr)
- Jeton sesyon WebAuthn pou konfò miltidispozitif
- Kontwòl aksè baze sou wòl (moun k ap rele, vòlontè, rapòtè, admin)
- 25 konstant separasyon domèn kriptografik defini nan `crypto-labels.ts` anpeche atak atravè protokòl

### Chifraj nan repo

- Nòt apèl, rapò, mesaj, ak transkripsyon chifre anvan estokaj
- Kle sekrè vòlontè yo chifre ak kle derive PIN (PBKDF2)
- Tauri Stronghold bay estokaj koffreyò chifre sou biwo
- Entegrite jounal odit pwoteje via chenn hash SHA-256

### Verifikasyon build

- Build repwodiksib via `Dockerfile.build` ak `SOURCE_DATE_EPOCH`
- Non fichye hashe pa kontni pou resous frontend
- `CHECKSUMS.txt` pibliye ak GitHub Releases
- Atestasyon provenance SLSA
- Script verifikasyon : `scripts/verify-build.sh`

## Diferans ant platfòm yo

| Fonksyonalite | Biwo (Tauri) | Mobil (React Native) | Navigatè (Cloudflare) |
|---|---|---|---|
| Backend crypto | Rust natif (via IPC) | Rust natif (via UniFFI) | WASM (llamenos-core) |
| Estokaj kle | Tauri Stronghold (chifre) | Secure Enclave / Keystore | localStorage navigatè (chifre PIN) |
| Transkripsyon | Whisper kote kliyan (WASM) | Pa disponib | Whisper kote kliyan (WASM) |
| Mizajou otomatik | Tauri updater | App Store / Play Store | Otomatik (CF Workers) |
| Notifikasyon push | OS natif (notifikasyon Tauri) | OS natif (FCM/APNS) | Notifikasyon navigatè |
| Sipò dekonekte | Limite (bezwen API) | Limite (bezwen API) | Limite (bezwen API) |
