---
title: Mîmarî
description: Kurteya mîmarîya pergala -- depo, rêya daneyê, astên şîfrekirinê, û ragihandina dem-rast.
---

Ev rûpel şirove dike ku Llamenos çawa hatiye avakirin, daneya çawa di nav pergala de diherike, û şîfrekirin li ku tê sepandin.

## Struktura depoyê

Llamenos li ser sê depoyan hatiye parvekirin ku protokolek hevbeş û çekirina kriptografîk a navendî parve dikin:

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

- **llamenos** -- Sepana desktop (Tauri v2 bi webview-ek Vite + React), backend-a Cloudflare Worker, û backend-a Node.js ya xweser. Ev depoya bingehîn e.
- **llamenos-core** -- Crate-k Rust-ê ya hevbeş ku hemû operasyonên kriptografîk pêk tîne: şîfrekirina envelope-a ECIES, îmazên Schnorr, derxistina kilîtê PBKDF2, HKDF, û XChaCha20-Poly1305. Ji bo koda native (ji bo Tauri), WASM (ji bo gerok), û bindings-a UniFFI (ji bo mobîl) tê berhevkirin.
- **llamenos-platform** -- Sepana mobîl a React Native ji bo iOS û Android. Ji bo gazîkirina heman koda kripto ya Rust-ê, bindings-a UniFFI bikar tîne.

Hemû sê platform protokola wire-ê ya heman ku di `docs/protocol/PROTOCOL.md` de hatiye diyarkirin pêk tînin.

## Rêya daneyê

### Bangê hatî

```
Banger (telefon)
    |
    v
Pêşkêşkarê Telefoniyê (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | ShiftManagerDO ji bo xwebexşên li ser şevê kontrol dike
    |                | Dengê parallel ji bo hemû xwebexşên berdest dest pê dike
    |                v
    |           Pêşkêşkarê Telefoniyê (bangên derketinê ber bi telefonên xwebexşan)
    |
    | Xwebexşê yekem bersiv dike
    v
CallRouterDO  -->  Banger û xwebexş girêdide
    |
    | Bang bi dawî dibe
    v
Xerîdar (gerok/sepa xwebexş)
    |
    | Nîşok bi kilîtek taybetî ya nîşokê şîfre dike
    | Kilît bi navgîniya ECIES ji bo xwe + her rêveber ve tê wrap kirin
    v
Worker API  -->  RecordsDO  (nîşoka şîfrekirî + kilîtên wrapped tomar dike)
```

### Peyama hatî (SMS / WhatsApp / Signal)

```
Têkiliyek (SMS / WhatsApp / Signal)
    |
    | Webhook-ê pêşkêşkar
    v
Worker API  -->  ConversationDO
    |                |
    |                | Naveroka peyamê bi rasterast şîfre dike
    |                | Kilîta simetrîk bi navgîniya ECIES ji bo xwebexşê hatiye erêkirin + rêveberan ve tê wrap kirin
    |                | Plaintext jê diavêje
    |                v
    |           WebSocket relay (bûyera hub-ê ya şîfrekirî xerîdarên online hişyar dike)
    |
    v
Xerîdar (gerok/sepa xwebexş)
    |
    | Bi koda xwe ya veşartî peyamê şîfre vedike
    | Bersivê amade dike, derketinê şîfre dike
    v
Worker API  -->  ConversationDO  -->  Pêşkêşkarê Peyaman (bersivê dişîne)
```

## Durable Objects

Backend şeş Cloudflare Durable Objects (an jî hevberên PostgreSQL-ê ji bo sazkirinên xweser) bikar tîne:

| Durable Object | Berpirsiyarî |
|---|---|
| **IdentityDO** | Nasnameyên xwebexşan, kilîtên giştî, navên xuyan, û nasnameyên WebAuthn-ê rêve dibe. Vexwarin û kêmkirinê çêdike. |
| **SettingsDO** | Mîhengê hotline: nav, kanalên çalak, nasnameyên pêşkêşkar, zeviyên nîşokên xweser, mîhengên spam mitigation, alamarên taybetmendiyê. |
| **RecordsDO** | Nîşokên bangên şîfrekirî, raporên şîfrekirî, û metadata-ya pêvekên pelê tomar dike. Lêgerîna nîşokan (li ser metadata-ya şîfrekirî) rêve dibe. |
| **ShiftManagerDO** | Bernameyên şevên dubare, komên dengê, erêkirinên şevên xwebexşan rêve dibe. Di her demekê de diyar dike ku kî li ser şevê ye. |
| **CallRouterDO** | Rêveberiya bangên dem-rast: dengê parallel, bi dawîbûna yekem-bersiv, statûya betilandinê, şopandina bangên çalak. Bersivên TwiML/pêşkêşkar çêdike. |
| **ConversationDO** | Dîalogên peyamên threaded li ser SMS, WhatsApp, û Signal rêve dibe. Şîfrekirina peyamê di dema ingest de, erêkirina dîalogê, û bersivên derketinê rêve dibe. |

Hemû DO bi navgîniya `idFromName()` wekî singleton têne gihiştin û bi navgîniya `DORouter`-ek sivik (rêbaza + parastina rêyê) hundurîn têne rêvebirin.

## Matrîksa şîfrekirinê

| Daneya | Şîfrekirî? | Algorîtm | Kî dikare veşêre |
|---|---|---|---|
| Nîşokên bangê | Erê (E2EE) | XChaCha20-Poly1305 + Envelope-a ECIES | Nivîskarê nîşokê + hemû rêveber |
| Zeviyên nîşokên xweser | Erê (E2EE) | Wekî nîşokan | Nivîskarê nîşokê + hemû rêveber |
| Rapor | Erê (E2EE) | Wekî nîşokan | Nivîskarê raporê + hemû rêveber |
| Pêvekên raporê | Erê (E2EE) | XChaCha20-Poly1305 (streamed) | Nivîskarê raporê + hemû rêveber |
| Naveroka peyamê | Erê (E2EE) | XChaCha20-Poly1305 + Envelope-a ECIES | Xwebexşê hatiye erêkirin + hemû rêveber |
| Transkripsiyon | Erê (li ser dîsk) | XChaCha20-Poly1305 | Çêkerê transkripsiyonê + hemû rêveber |
| Bûyerên hub (WebSocket) | Erê (simetrîk) | XChaCha20-Poly1305 bi kilîta hub | Hemû endamên heyî yên hub |
| Volunteer nsec | Erê (li ser dîsk) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Tenê xwebexş |
| Tomarên log-a kontrolê | Na (parastina bêyî-guhartin) | Zincîra hash-a SHA-256 | Rêveber (xwendin), pergala (nivîsîn) |
| Hejmarên telefonê yên banger | Na (tenê aliyê server) | N/A | Server + rêveber |
| Hejmarên telefonê yên xwebexş | Di IdentityDO de hatine tomar kirin | N/A | Tenê rêveber |

### Forward secrecy-ya nîşokê ya taybetî

Her nîşok an peyam kilîtek simetrîk a rasthatî ya taybetî digire. Ew kilît bi navgîniya ECIES (kilîta demkî ya secp256k1 + HKDF + XChaCha20-Poly1305) ji bo her xwendevanek erêkirî bi tenê tê wrap kirin. Tevlihevkirina kilîtek nîşokê tiştek li ser nîşokên din eşkere nake. Tu kilîtên simetrîkên dirêj-dem ji bo şîfrekirina naverokê tune ne.

### Hiyerarîya kilîtê

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- npub derdixe (kilîta giştî ya x-only, 32 byte)
    |
    +-- Ji bo peymana kilîtê ya ECIES tê bikar anîn (02 pêşve bike ji bo formaya compressed)
    |
    +-- Bûyerên WebSocket îmze dike (îmaza Schnorr)

Kilîta hub (32 byteyên rasthatî, NE ji nasnameyekê hatiye derxistin)
    |
    +-- Bûyerên hub-ê yên dem-rast şîfre dike
    |
    +-- Bi navgîniya LABEL_HUB_KEY_WRAP ji bo her endam bi ECIES ve tê wrap kirin
    |
    +-- Dema ku endamek derdikeve tê nûve kirin

Kilîta nîşokê ya taybetî (32 byteyên rasthatî)
    |
    +-- Naveroka nîşokê bi navgîniya XChaCha20-Poly1305 şîfre dike
    |
    +-- Bi navgîniya ECIES ji bo her xwendevan (xwebexş + her rêveber) ve tê wrap kirin
    |
    +-- Li ser nîşokên din tenê carekê tê bikar anîn
```

## Ragihandina dem-rast

Nûvekirinên dem-rast (bangên nû, peyam, guherînên şevê, berdestî) bi navgîniya WebSocket relay diherikin:

- **Xweser**: WebSocket relay relay li gel sepanê di Docker/Kubernetes de dixebite
- **Cloudflare**: Nosflare (relay-a li ser bingeha Cloudflare Workers)

Hemû bûyer demkî ne (cureyê 20001) û bi kilîta hub têne şîfre kirin. Bûyer tag-ên giştî (`["t", "llamenos:event"]`) bikar tînin da ku relay nikare cureyên bûyerê ji hev cuda bike. Zeviya naverokê ciphertext-a XChaCha20-Poly1305 dihewîne.

### Rêya bûyerê

```
Xerîdar A (kiryara xwebexş)
    |
    | Naveroka bûyerê bi kilîta hub şîfre dike
    | Wekî bûyera WebSocket îmze dike (Schnorr)
    v
WebSocket relay (WebSocket relay / Nosflare)
    |
    | Belavok ji bo aboneyan
    v
Xerîdar B, C, D...
    |
    | Îmaza Schnorr erê dike
    | Naverok bi kilîta hub şîfre vedike
    v
Statûya UI ya herêmî nûve dike
```

Relay blobên şîfrekirî û îmazên derbasdar dibîne lê nikare naveroka bûyerê bixwîne an jî kiryarên ku têne kirin diyar bike.

## Astên ewlehiyê

### Asta veguhastinê

- Hemû ragihandina xerîdar-server li ser HTTPS (TLS 1.3)
- Girêdanên WebSocket ber bi WebSocket relay li ser WSS
- Siyaseta Naveroka Ewle (CSP) çavkaniyên skrîptê, girêdan, û bav-kalên çarçove sînordar dike
- Parastina îzolasyona Tauri IPC ji webview ve cuda dike

### Asta serîlêdanê

- Erêkirin bi navgîniya keypair-ên WebSocket (îmazên BIP-340 Schnorr)
- Tokenên danişînê yên WebAuthn ji bo rahêjiya pir-amûrî
- Kontrola gihiştina li ser bingeha rol (banger, xwebexş, raporter, rêveber)
- Hemû 25 sabîtên cuda yên cuda yên kriptografîk di `crypto-labels.ts` de êrişên cross-protokolê asteng dikin

### Şîfrekirina li ser dîsk

- Nîşok, rapor, peyam, û transkripsiyon berî tomar kirinê têne şîfre kirin
- Kilîtên veşartî yên xwebexş bi kilîtên ku ji PIN hatine derxistin (PBKDF2) têne şîfre kirin
- Tauri Stronghold storage-a encrypted vault li ser desktop peyda dike
- Bêyî-guhartina log-a kontrolê bi navgîniya zincîra hash-a SHA-256 tê parastin

### Verastkirina avakirinê

- Avakirinên dubare bi navgîniya `Dockerfile.build` bi `SOURCE_DATE_EPOCH`
- Navên pelên bi hash-ê naverokê ji bo çavkaniyên frontend
- `CHECKSUMS.txt` bi GitHub Releases tê weşandin
- SLSA provenance attestations
- Skrîpta verastkirinê: `scripts/verify-build.sh`

## Cudahiyên platformê

| Taybetmendî | Desktop (Tauri) | Mobîl (React Native) | Gerok (Cloudflare) |
|---|---|---|---|
| Backend-a kripto | Native Rust (bi IPC) | Native Rust (bi UniFFI) | WASM (llamenos-core) |
| Storage-a kilîtê | Tauri Stronghold (şîfrekirî) | Secure Enclave / Keystore | Browser localStorage (şîfrekirî bi PIN) |
| Transkripsiyon | Whisper-a aliyê xerîdar (WASM) | Ne berdest | Whisper-a aliyê xerîdar (WASM) |
| Nûvekirina otomatîk | Nûvekerê Tauri | App Store / Play Store | Otomatîk (CF Workers) |
| Hişyariyên push | OS-native (hişyariya Tauri) | OS-native (FCM/APNS) | Hişyariyên gerok |
| Piştgirîya offline | Sînorkirî (API hewce dike) | Sînorkirî (API hewce dike) | Sînorkirî (API hewce dike) |
