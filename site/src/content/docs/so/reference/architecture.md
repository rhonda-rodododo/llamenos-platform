---
title: Qaab-dhismeedka
 description: Guud ahaan qaab-dhismeedka nidaamka — kaydka, dhaqanka xogta, lakabada fureynta, iyo isgaarsiinta waqti-dhabta ah.
---

Bogganani waxay sharxaysaa sida Llamenos uu u qaabeysan yahay, sida xogtu ugu dhex dhacdo nidaamka, iyo meesha encryption-ka lagu dabaqo.

## Qaab-dhismeedka kaydka

Llamenos waxay u qaybsantahay saddex kayd oo wadaaga protocol iyo core cryptographic:

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

- **llamenos** — Codsiga desktop-ka (Tauri v2 iyada oo leh Vite + React webview), backend-ka Cloudflare Worker, iyo backend-ka self-hosted Node.js. Tani waa kaydka ugu weyn.
- **llamenos-core** — Crate Rust oo la wadaago oo dhammaan ficillada cryptographic-ka ku dhaqma: ECIES envelope encryption, saxiixyada Schnorr, key derivation PBKDF2, HKDF, iyo XChaCha20-Poly1305. U compilation gudaha native code (Tauri), WASM (browser), iyo UniFFI bindings (mobile).
- **llamenos-platform** — Codsiga mobile React Native ee iOS iyo Android. Waxay isticmaashaa UniFFI bindings si ay u yeeshaan ficillada Rust crypto isla.

Dhammaan saddexda platform waxay dhaqmaan protocol isku mid ah oo lagu qeexay `docs/protocol/PROTOCOL.md`.

## Dhaqanka xogta

### Call soo galaya

```
Caller (taleefan)
    |
    v
Bixiye Telephony (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Hubiyaa ShiftManagerDO ee isbitaallada shift-ka ku jira
    |                | Bilaabida dhawaaq kala duwan ee dhammaan isbitaallada diyaarka ah
    |                v
    |           Bixiye Telephony (calls-ka dibadda ee taleefanada isbitaallada)
    |
    | Isbitaalka ugu horreeya ee jawaaba
    v
CallRouterDO  -->  Isku xir caller iyo isbitaale
    |
    | Call-ku wuu dhacayaa
    v
Client (browser/app-ka isbitaalka)
    |
    | Furee xusuusin iyada oo la isticmaalayo fure per-note
    | Duubo fure via ECIES nafsiga + admin kasta
    v
Worker API  -->  RecordsDO  (kaydiya xusuusinta fureeran + furaha duuban)
```

### Fariimaha soo galaya (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Furee macluumaadka fariinta si toos ah
    |                | Duubo fure symmetric via ECIES ee isbitaalka loo xilsaarnay + admins
    |                | Tuur plaintext-ka
    |                v
    |           WebSocket relay (dhacdo hub fureeran oo digniinaya clients-ka online)
    |
    v
Client (browser/app-ka isbitaalka)
    |
    | Furee fariinta iyada oo la isticmaalayo fure sirtaada
    | Samee jawaab, furee outbound
    v
Worker API  -->  ConversationDO  -->  Bixiye Messaging (dir jawaab)
```

## Durable Objects

Backend-ku waxay isticmaashaa lix Cloudflare Durable Objects (ama kuwa PostgreSQL ee la midka ah ee soo saarista gacanta):

| Durable Object | Mas'uuliyadda |
|---|---|
| **IdentityDO** | Maareynta aqoonta isbitaallada, furaha dadweynaha, magacyada muujinta, iyo aqoonsiyada WebAuthn. Maareynta abuurista iyo dib u qaadista martiqaadka. |
| **SettingsDO** | Kaydinta tafatirka hotline-ka: magaca, kanaalada furan, aqoonsiga bixiyaha, fields-ka xusuusinta gaarka ah, goobaha yareynta spam, calaamadaha features-ka. |
| **RecordsDO** | Kaydinta xusuusinta call-ka fureeran, warbixinnada fureeran, iyo metadata-ga lifaaqayaasha faylasha. Maareynta raadinta xusuusinaha (metadata-ga fureeran). |
| **ShiftManagerDO** | Maareynta jadwalada shift-ka ee soo noqnoqda, kooxaha dhawaaqaya, xilsaarnada shift-ka isbitaallada. Go'aaminta kuwa shift-ka ku jira waqti kasta. |
| **CallRouterDO** | Maareynta isku xirka call-ka waqti-dhabta ah: dhawaaq kala duwan, joojinta ugu horreeya, xaaladda nasashada, raadinta call-ka firfircoon. Abuurista jawaabaha TwiML/bixiyaha. |
| **ConversationDO** | Maareynta wada hadallada fariimaha ee SMS, WhatsApp, iyo Signal. Maareynta fureynta fariimaha marka la soo geliyo, xilsaarnada wada hadalka, iyo jawaabaha dibadda. |

Dhammaan DO-yada waxaa laga helo sida singletons via `idFromName()` oo loo gudbiyo gudaha iyada oo la isticmaalayo `DORouter` fudud (hab + qaabka waddada).

## Matrix-ga fureynta

| Xogta | Fureeran? | Algorithm | Yaa furi kara |
|---|---|---|---|
| Xusuusinaha call-ka | Haa (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Qofka qoray + dhammaan admins |
| Fields-ka xusuusinta gaarka ah | Haa (E2EE) | Isla sida xusuusinaha | Qofka qoray + dhammaan admins |
| Warbixinnada | Haa (E2EE) | Isla sida xusuusinaha | Qofka qoray + dhammaan admins |
| Lifaaqayaasha warbixinnada | Haa (E2EE) | XChaCha20-Poly1305 (streamed) | Qofka qoray + dhammaan admins |
| Macluumaadka fariimaha | Haa (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Isbitaalka loo xilsaarnay + dhammaan admins |
| Qoraallada | Haa (marka la kaydiyo) | XChaCha20-Poly1305 | Abuuraha qoraalka + dhammaan admins |
| Dhacdooyinka hub-ka (WebSocket) | Haa (symmetric) | XChaCha20-Poly1305 iyada oo la isticmaalayo hub key | Dhammaan xubnaha hub-ka hadda jira |
| Volunteer nsec | Haa (marka la kaydiyo) | PBKDF2 + XChaCha20-Poly1305 (PIN) | Isbitaalka keliya |
| Diiwaannada baaritaanka | Maya (ilaalinta integrity) | Hash chain SHA-256 | Admins (akhri), nidaamka (qor) |
| Lambarrada taleefanka ee wiciyayaasha | Maya (dhinaca server-ka keliya) | N/A | Server + admins |
| Lambarrada taleefanka ee isbitaallada | Kaydsan IdentityDO | N/A | Admins keliya |

### Forward secrecy per-note

Xusuusin kasta ama fariin waxay heshaa fure symmetric oo keliya oo random ah. Fure-kaas waxaa duuban via ECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) si gaar ah qof kasta oo la oggolay. Haddii fure xusuusin la qabsado, waxba ma muujinayo kuwa kale. Ma jiraan furaha symmetric ee dheer jira ee loogu talagalay fureynta macluumaadka.

### Lakabka furaha

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Soo saar npub (x-only public key, 32 bytes)
    |
    +-- Loo isticmaalaa isku xirka ECIES (ku dar 02 qaabka compressed)
    |
    +-- Saxiixa dhacdooyinka WebSocket (saxiixa Schnorr)

Hub key (32 bytes random, MA aha mid ka soo jeeda aqoonta)
    |
    +-- Furee dhacdooyinka WebSocket hub-ka waqti-dhabta ah
    |
    +-- Duuban via ECIES per xubin iyada oo la isticmaalayo LABEL_HUB_KEY_WRAP
    |
    +-- Beddel marka xubin ka tagto

Per-note key (32 bytes random)
    |
    +-- Furee macluumaadka xusuusinaha via XChaCha20-Poly1305
    |
    +-- Duuban via ECIES per akhriye (isbitaale + admin kasta)
    |
    +-- Marnaba loo isticmaali maayo labo xusuusin
```

## Isgaarsiinta waqti-dhabta ah

Cusbooneysiinta waqti-dhabta ah (calls cusub, fariimaha, isbeddelada shift-ka, diyaar garowga) waxay marayaan WebSocket relay:

- **Self-hosted**: WebSocket relay relay oo ku shaqeeya app-ka gudaha Docker/Kubernetes
- **Cloudflare**: Nosflare (relay ku salaysan Cloudflare Workers)

Dhammaan dhacdooyinku waa kuwa dhaca (nooca 20001) oo fureeran iyada oo la isticmaalayo hub key. Dhacdooyinku waxay isticmaalaan tags-ka guud (`["t", "llamenos:event"]`) si relay-ka aanu kala saari karin noocyada dhacdooyinka. Field-ka content waxay ku jirtaa ciphertext XChaCha20-Poly1305.

### Dhaqanka dhacdooyinka

```
Client A (ficil isbitaale)
    |
    | Furee macluumaadka dhacdo iyada oo la isticmaalayo hub key
    | Saxiix sida dhacdo WebSocket (Schnorr)
    v
WebSocket relay (WebSocket relay / Nosflare)
    |
    | U gudbi kuwa isdiiwaangeliyay
    v
Client B, C, D...
    |
    | Xaqiiji saxiixa Schnorr
    | Furee macluumaadka iyada oo la isticmaalayo hub key
    v
Cusbooneysii xaaladda UI-ga goobta
```

Relay-gu waxay arkaa blobs fureeran iyo saxiixyo sax ah laakiin ma akhriyan karaan macluumaadka dhacdooyinka ama go'aamin ficillada la sameynayo.

## Lakabada amniga

### Lakabada gaadhsiinta

- Dhammaan isgaarsiinta client-server iyada oo loo marayo HTTPS (TLS 1.3)
- Isku xirka WebSocket ilaa WebSocket relay iyada oo loo marayo WSS
- Content Security Policy (CSP) waxay xaddidayaa isbitaallada script-ka, isku xirka, iyo asxaabta frame
- Tauri isolation pattern waxay kala saartaa IPC webview-ka

### Lakabada codsiga

- Xaqiijin via keypairs WebSocket (saxiixyada BIP-340 Schnorr)
- Token-ka xilliga WebAuthn si loo fududeeyo qalab badan
- Xakamaynta helitaanka ku salaysan door-ka (caller, isbitaale, warbixiye, admin)
- Dhammaan 25 constants-ka domain separation ee lagu qeexay `crypto-labels.ts` waxay ka hortagayaan weerarada cross-protocol

### Fureynta marka la kaydiyo

- Xusuusinaha call-ka, warbixinnada, fariimaha, iyo qoraallada waxaa loo fureeyaa kahor inta aan la kaydin
- Furaha sirta ee isbitaallada waxaa loo fureeyaa iyada oo la isticmaalayo furaha laga soo saaro PIN (PBKDF2)
- Tauri Stronghold waxay bixisaa kaydinta vault-ka fureeran desktop-ka
- Integrity-ga log-ka baaritaanka waxaa ilaaliya hash chain SHA-256

### Xaqiijinta dhismaha

- Dhismayaal la soo celceli karo via `Dockerfile.build` iyada oo leh `SOURCE_DATE_EPOCH`
- Magacyada faylasha ee hash-ku salaysan ee hantida frontend
- `CHECKSUMS.txt` oo la daabacayo GitHub Releases
- SLSA provenance attestations
- Script-ka xaqiijinta: `scripts/verify-build.sh`

## Kala duwanaanshaha platform-yada

| Feature | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|---|---|---|---|
| Backend crypto | Native Rust (via IPC) | Native Rust (via UniFFI) | WASM (llamenos-core) |
| Kaydinta furaha | Tauri Stronghold (fureeran) | Secure Enclave / Keystore | Browser localStorage (PIN-fureeran) |
| Qoraalka | Client-side Whisper (WASM) | Ma heli karo | Client-side Whisper (WASM) |
| Cusbooneysiinta otomaatig ah | Tauri updater | App Store / Play Store | Otomatig (CF Workers) |
| Digniinada push | OS-native (Tauri notification) | OS-native (FCM/APNS) | Digniinada browser-ka |
| Taageerada offline | Xaddidan (waxay u baahan tahay API) | Xaddidan (waxay u baahan tahay API) | Xaddidan (waxay u baahan tahay API) |
