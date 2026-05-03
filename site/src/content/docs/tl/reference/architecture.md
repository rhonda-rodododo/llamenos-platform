---
title: Arkitektura
description: Pangkalahatang-ideya ng arkitektura ng sistema — mga repositoryo, daloy ng datos, mga layer ng encryption, at real-time na komunikasyon.
---

Ipinapaliwanag ng pahinang ito kung paano nakaayos ang Llamenos, kung paano dumadaan ang datos sa sistema, at kung saan inilalapat ang encryption.

## Estruktura ng repositoryo

Nahahati ang Llamenos sa tatlong repositoryo na nagbabahagi ng isang karaniwang protokol at cryptographic na core:

```
llamenos              llamenos-core           llamenos-platform
(Desktop + API)       (Shared Crypto)         (Mobile App)
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

- **llamenos** — Ang desktop na aplikasyon (Tauri v2 na may Vite + React webview), ang Cloudflare Worker backend, at ang self-hosted na Node.js backend. Ito ang pangunahing repositoryo.
- **llamenos-core** — Isang shared na Rust crate na nagpapatupad ng lahat ng cryptographic na operasyon: ECIES envelope encryption, Schnorr signatures, PBKDF2 key derivation, HKDF, at XChaCha20-Poly1305. Kino-compile sa native code (para sa Tauri), WASM (para sa browser), at UniFFI bindings (para sa mobile).
- **llamenos-platform** — Ang React Native mobile application para sa iOS at Android. Gumagamit ng UniFFI bindings para tumawag sa parehong Rust crypto code.

Ipinapatupad ng lahat ng tatlong platform ang parehong wire protocol na tinukoy sa `docs/protocol/PROTOCOL.md`.

## Daloy ng datos

### Papasok na tawag

```
Caller (telepono)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Sinusuri ang ShiftManagerDO para sa mga on-shift na boluntaryo
    |                | Nagpasimula ng parallel ring sa lahat ng available na boluntaryo
    |                v
    |           Telephony Provider (papalabas na mga tawag sa mga telepono ng boluntaryo)
    |
    | Unang sumasagot na boluntaryo
    v
CallRouterDO  -->  Kinokonekta ang caller at boluntaryo
    |
    | Natapos ang tawag
    v
Client (browser/app ng boluntaryo)
    |
    | Ine-encrypt ang tala gamit ang per-note key
    | Bina-wrap ang key sa pamamagitan ng ECIES para sa sarili + bawat admin
    v
Worker API  -->  RecordsDO  (nag-iimbak ng encrypted na tala + wrapped keys)
```

### Papasok na mensahe (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Agad na ine-encrypt ang nilalaman ng mensahe
    |                | Bina-wrap ang symmetric key sa pamamagitan ng ECIES para sa assigned na boluntaryo + mga admin
    |                | Itinatatapon ang plaintext
    |                v
    |           Nostr relay (encrypted hub event na nagaabiso sa mga online na client)
    |
    v
Client (browser/app ng boluntaryo)
    |
    | Dine-decrypt ang mensahe gamit ang sariling pribadong key
    | Gumagawa ng tugon, ine-encrypt ang palabas
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (nagpapadala ng tugon)
```

## Mga Durable Object

Gumagamit ang backend ng anim na Cloudflare Durable Objects (o ang kanilang mga katumbas na PostgreSQL para sa mga self-hosted na deployment):

| Durable Object | Responsibilidad |
|---|---|
| **IdentityDO** | Pinamamahalaan ang mga identity ng boluntaryo, mga pampublikong key, mga display name, at mga WebAuthn credential. Humahawak ng paggawa at pagtubos ng invite. |
| **SettingsDO** | Nag-iimbak ng configuration ng hotline: pangalan, mga enabled na channel, mga credential ng provider, mga custom na field ng tala, mga setting ng spam mitigation, mga feature flag. |
| **RecordsDO** | Nag-iimbak ng mga encrypted na tala ng tawag, mga encrypted na ulat, at metadata ng file attachment. Humahawak ng paghahanap ng tala (sa encrypted na metadata). |
| **ShiftManagerDO** | Pinamamahalaan ang mga recurring na iskedyul ng shift, mga ring group, mga assignment ng shift ng boluntaryo. Tinutukoy kung sino ang on-shift sa anumang oras. |
| **CallRouterDO** | Nag-o-orchestrate ng real-time na pag-ruta ng tawag: parallel ringing, first-pickup termination, break status, active na pagsubaybay ng tawag. Nagge-generate ng mga tugon ng TwiML/provider. |
| **ConversationDO** | Pinamamahalaan ang mga naka-thread na messaging conversation sa SMS, WhatsApp, at Signal. Humahawak ng encryption ng mensahe sa ingestion, pagtatalaga ng conversation, at mga palabas na tugon. |

Ang lahat ng DO ay ina-access bilang mga singleton sa pamamagitan ng `idFromName()` at internal na niru-ruta gamit ang isang magaang na `DORouter` (method + path pattern matching).

## Matrix ng encryption

| Data | Naka-encrypt? | Algorithm | Sino ang maaaring mag-decrypt |
|---|---|---|---|
| Mga tala ng tawag | Oo (E2EE) | XChaCha20-Poly1305 + ECIES envelope | May-akda ng tala + lahat ng admin |
| Mga custom na field ng tala | Oo (E2EE) | Kapareho ng mga tala | May-akda ng tala + lahat ng admin |
| Mga ulat | Oo (E2EE) | Kapareho ng mga tala | May-akda ng ulat + lahat ng admin |
| Mga attachment ng ulat | Oo (E2EE) | XChaCha20-Poly1305 (streamed) | May-akda ng ulat + lahat ng admin |
| Nilalaman ng mensahe | Oo (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Assigned na boluntaryo + lahat ng admin |
| Mga transcript | Oo (at-rest) | XChaCha20-Poly1305 | Tagalikha ng transcript + lahat ng admin |
| Mga hub event (Nostr) | Oo (symmetric) | XChaCha20-Poly1305 gamit ang hub key | Lahat ng kasalukuyang miyembro ng hub |
| nsec ng boluntaryo | Oo (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Boluntaryo lamang |
| Mga entry ng audit log | Hindi (protektado ang integridad) | SHA-256 hash chain | Mga admin (basahin), sistema (sumulat) |
| Mga numero ng telepono ng caller | Hindi (server-side lamang) | N/A | Server + mga admin |
| Mga numero ng telepono ng boluntaryo | Nakaimbak sa IdentityDO | N/A | Mga admin lamang |

### Per-note forward secrecy

Ang bawat tala o mensahe ay nakakakuha ng natatanging random symmetric key. Ang key na iyon ay bina-wrap sa pamamagitan ng ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) nang isa-isa para sa bawat authorized na mambabasa. Ang pakikompromiso ng key ng isang tala ay walang isinisiwalat tungkol sa ibang mga tala. Walang matagal na symmetric key para sa pag-encrypt ng nilalaman.

### Hierarchy ng key

```
nsec ng Boluntaryo (BIP-340 Schnorr / secp256k1)
    |
    +-- Nagmamula ng npub (x-only public key, 32 bytes)
    |
    +-- Ginagamit para sa ECIES key agreement (magdagdag ng 02 para sa compressed na form)
    |
    +-- Naglagda ng mga Nostr event (Schnorr signature)

Hub key (random na 32 bytes, HINDI nagmumula sa anumang identity key)
    |
    +-- Ine-encrypt ang real-time na Nostr hub event
    |
    +-- ECIES-wrapped bawat miyembro sa pamamagitan ng LABEL_HUB_KEY_WRAP
    |
    +-- Inuulit sa pag-alis ng miyembro

Per-note key (random na 32 bytes)
    |
    +-- Ine-encrypt ang nilalaman ng tala sa pamamagitan ng XChaCha20-Poly1305
    |
    +-- ECIES-wrapped bawat mambabasa (boluntaryo + bawat admin)
    |
    +-- Hindi kailanman ginagamit muli sa iba pang mga tala
```

## Real-time na komunikasyon

Ang mga real-time na update (mga bagong tawag, mensahe, pagbabago ng shift, presensya) ay dumadaan sa isang Nostr relay:

- **Self-hosted**: strfry relay na tumatakbo kasabay ng app sa Docker/Kubernetes
- **Cloudflare**: Nosflare (Cloudflare Workers-based relay)

Ang lahat ng event ay ephemeral (kind 20001) at naka-encrypt gamit ang hub key. Gumagamit ang mga event ng mga generic na tag (`["t", "llamenos:event"]`) kaya hindi matukoy ng relay ang mga uri ng event. Ang field ng nilalaman ay naglalaman ng XChaCha20-Poly1305 ciphertext.

### Daloy ng event

```
Client A (aksyon ng boluntaryo)
    |
    | Ine-encrypt ang nilalaman ng event gamit ang hub key
    | Lumagda bilang Nostr event (Schnorr)
    v
Nostr relay (strfry / Nosflare)
    |
    | Ibinabahagi sa mga subscriber
    v
Client B, C, D...
    |
    | Bine-verify ang Schnorr signature
    | Dine-decrypt ang nilalaman gamit ang hub key
    v
I-update ang lokal na estado ng UI
```

Nakikita ng relay ang mga encrypted blob at wastong mga lagda ngunit hindi mabasa ang nilalaman ng event o matukoy kung anong mga aksyon ang isinasagawa.

## Mga layer ng seguridad

### Layer ng transport

- Lahat ng komunikasyon ng client-server sa HTTPS (TLS 1.3)
- Mga koneksyon ng WebSocket sa Nostr relay sa WSS
- Nililimitahan ng Content Security Policy (CSP) ang mga pinagmulan ng script, mga koneksyon, at mga ninuno ng frame
- Hinahating-isa ng pattern ng Tauri isolation ang IPC mula sa webview

### Layer ng application

- Authentication sa pamamagitan ng mga Nostr keypair (BIP-340 Schnorr signatures)
- Mga WebAuthn session token para sa kaginhawaan ng multi-device
- Role-based na access control (caller, boluntaryo, reporter, admin)
- Ang lahat ng 25 cryptographic domain separation constant na tinukoy sa `crypto-labels.ts` ay pumipigil sa mga cross-protocol attack

### At-rest na encryption

- Mga tala ng tawag, mga ulat, mga mensahe, at mga transcript na naka-encrypt bago iimbak
- Mga secret key ng boluntaryo na naka-encrypt gamit ang mga key na nagmumula sa PIN (PBKDF2)
- Nagbibigay ang Tauri Stronghold ng encrypted na vault storage sa desktop
- Protektado ang integridad ng audit log sa pamamagitan ng SHA-256 hash chain

### Pag-verify ng build

- Mga reproducible build sa pamamagitan ng `Dockerfile.build` na may `SOURCE_DATE_EPOCH`
- Mga content-hashed na filename para sa mga asset ng frontend
- Nai-publish na `CHECKSUMS.txt` kasama ang Mga GitHub Release
- Mga SLSA provenance attestation
- Script ng pag-verify: `scripts/verify-build.sh`

## Mga pagkakaiba ng platform

| Feature | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|---|---|---|---|
| Crypto backend | Native Rust (sa pamamagitan ng IPC) | Native Rust (sa pamamagitan ng UniFFI) | WASM (llamenos-core) |
| Imbakan ng key | Tauri Stronghold (naka-encrypt) | Secure Enclave / Keystore | Browser localStorage (PIN-encrypted) |
| Transcription | Client-side Whisper (WASM) | Hindi available | Client-side Whisper (WASM) |
| Auto-update | Tauri updater | App Store / Play Store | Awtomatiko (CF Workers) |
| Mga push notification | OS-native (Tauri notification) | OS-native (FCM/APNS) | Mga notification ng browser |
| Suporta sa offline | Limitado (kailangan ng API) | Limitado (kailangan ng API) | Limitado (kailangan ng API) |
