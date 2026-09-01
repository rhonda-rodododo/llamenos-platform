---
title: አርክቴክቸር
description: የስርዓት አርክቴክቸር አጠቃላይ እይታ — ማጠራቀሚያዎች፣ የመረጃ ፍሰት፣ የማመስጠን ንብርታሮች፣ እና በጊዜ-እውነታ መገናኛ።
---

ይህ ገጽ Llamenos እንዴት እንደተዋቀረ፣ መረጃ በስርዓቱ ውስጥ እንዴት እንደሚፈስ፣ እና encryption የት እንደሚተገበር ይ объясняет።

## የማጠራቀሚያ መዋቅር

Llamenos በሦስት repositories መካከል የተከፋፈለ ነው፣ እነሱም ተመሳሳይ protocol እና cryptographic core ያጋራሉ፦

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

- **llamenos** — ዴስክቶፕ መተግበሪያ (Tauri v2 ከVite + React webview ጋር)፣ Cloudflare Worker backend፣ እና ራስ-አስተናጋጅ Node.js backend። ይህ ዋናው repository ነው።
- **llamenos-core** — ለሁሉም cryptographic ክዋኔዎች የተጋራ Rust crate፦ ECIES envelope encryption፣ Schnorr ፊርማዎች፣ PBKDF2 key derivation፣ HKDF፣ እና XChaCha20-Poly1305። ወደ native code (ለTauri)፣ WASM (ለbrowser)፣ እና UniFFI bindings (ለmobile) ይተረጎማል።
- **llamenos-platform** — ለiOS እና Android React Native ሞባይል መተግበሪያ። ተመሳሳይ Rust crypto codeን በUniFFI bindings በኩል ይጠቀማል።

ሦስቱም መድረኮች በ`docs/protocol/PROTOCOL.md` ውስጥ የተገለጸውን ተመሳሳይ wire protocol ያረጋግጣሉ።

## የመረጃ ፍሰት

### ገቢ ጥሪ

```
Caller (phone)
    |
    v
Telephony Provider (Twilio / SignalWire / Vonage / Plivo / Asterisk)
    |
    | HTTP webhook
    v
Worker API  -->  CallRouterDO
    |                |
    |                | Checks ShiftManagerDO for on-shift volunteers
    |                | Initiates parallel ring to all available volunteers
    |                v
    |           Telephony Provider (outbound calls to volunteer phones)
    |
    | First volunteer answers
    v
CallRouterDO  -->  Connects caller and volunteer
    |
    | Call ends
    v
Client (volunteer's browser/app)
    |
    | Encrypts note with per-note key
    | Wraps key via ECIES for self + each admin
    v
Worker API  -->  RecordsDO  (stores encrypted note + wrapped keys)
```

### ገቢ መልእክት (SMS / WhatsApp / Signal)

```
Contact (SMS / WhatsApp / Signal)
    |
    | Provider webhook
    v
Worker API  -->  ConversationDO
    |                |
    |                | Encrypts message content immediately
    |                | Wraps symmetric key via ECIES for assigned volunteer + admins
    |                | Discards plaintext
    |                v
    |           WebSocket relay (encrypted hub event notifies online clients)
    |
    v
Client (volunteer's browser/app)
    |
    | Decrypts message with own private key
    | Composes reply, encrypts outbound
    v
Worker API  -->  ConversationDO  -->  Messaging Provider (sends reply)
```

## Durable Objects

Backend ስድስት Cloudflare Durable Objects (ወይም ራስ-አስተናጋጅ deployments ውስጥ የእነሱ PostgreSQL ተመሳሳዮች) ይጠቀማል፦

| Durable Object | ኃላፊነት |
|---|---|
| **IdentityDO** | የበጎ ፈቃደኛ ማንነቶችን፣ public keys፣ display names፣ እና WebAuthn credentials ያስተዳድራል። Invite ፍጠር እና redemption ይይዛል። |
| **SettingsDO** | Hotline configuration ያከማቻል፦ ስም፣ የተንቀሳቀሱ ሰርጦች፣ አቅራቢ መረጃዎች፣ ብጁ note fields፣ spam mitigation ቅንጅቶች፣ feature flags። |
| **RecordsDO** | የተመሰጠሩ ጥሪ notes፣ የተመሰጠሩ reports፣ እና ፋይል አባሪ metadata ያከማቻል። Note search (ከተመሰጠረ metadata በላይ) ይይዛል። |
| **ShiftManagerDO** | ተደጋጋሚ shift መርሐ ግብሮችን፣ ring groups፣ የበጎ ፈቃደኛ shift assignments ያስተዳድራል። በማንኛውም ጊዜ ማን በፊት ለፊት እንደሚሰራ ይወስናል። |
| **CallRouterDO** | በጊዜ-እውነታ ጥሪ routing ያስተዳድራል፦ parallel ringing፣ first-pickup termination፣ break ሁኔታ፣ active call tracking። TwiML/provider responses ያመነጫል። |
| **ConversationDO** | በSMS፣ WhatsApp፣ እና Signal ላይ threaded messaging conversations ያስተዳድራል። Message encryption on ingest፣ conversation assignment፣ እና outbound replies ይይዛል። |

ሁሉም DOs በ`idFromName()` እንደ singletons ይደረሳሉ እና internally በlightweight `DORouter` (method + path pattern matching) በኩል ይላካሉ።

## Encryption matrix

| Data | የተመሰጠረ? | Algorithm | ማን ሊያጠፋ ይችላል |
|---|---|---|---|
| Call notes | አዎ (E2EE) | XChaCha20-Poly1305 + ECIES envelope | Note author + ሁሉም admins |
| Note custom fields | አዎ (E2EE) | Notes ጋር ተመሳሳይ | Note author + ሁሉም admins |
| Reports | አዎ (E2EE) | Notes ጋር ተመሳሳይ | Report author + ሁሉም admins |
| Report attachments | አዎ (E2EE) | XChaCha20-Poly1305 (streamed) | Report author + ሁሉም admins |
| Message content | አዎ (E2EE) | XChaCha20-Poly1305 + ECIES envelope | የተመደበ በጎ ፈቃደኛ + ሁሉም admins |
| Transcripts | አዎ (at-rest) | XChaCha20-Poly1305 | Transcript creator + ሁሉም admins |
| Hub events (WebSocket) | አዎ (symmetric) | XChaCha20-Poly1305 ከhub key ጋር | ሁሉም current hub members |
| Volunteer nsec | አዎ (at-rest) | PBKDF2 + XChaCha20-Poly1305 (PIN) | በጎ ፈቃደኛ ብቻ |
| Audit log entries | አይ (integrity-protected) | SHA-256 hash chain | Admins (read)፣ system (write) |
| Caller phone numbers | አይ (server-side only) | N/A | Server + admins |
| Volunteer phone numbers | በIdentityDO ውስጥ ይቆማል | N/A | Admins ብቻ |

### Per-note forward secrecy

እያንዳንዱ note ወይም መልእክት ትክክለኛ random symmetric key ያገኛል። ያ key በECIES (secp256k1 ephemeral key + HKDF + XChaCha20-Poly1305) ለእያንዳንዱ authorized reader ብቻ ይጠቅልላል። አንድ note key ከተበላሸ ሌሎች notes ምንም አይጎዱም። ለcontent encryption ረጅም-lived symmetric keys የሉም።

### Key hierarchy

```
Volunteer nsec (BIP-340 Schnorr / secp256k1)
    |
    +-- Derives npub (x-only public key, 32 bytes)
    |
    +-- Used for ECIES key agreement (prepend 02 for compressed form)
    |
    +-- Signs WebSocket events (Schnorr signature)

Hub key (random 32 bytes, NOT derived from any identity)
    |
    +-- Encrypts real-time WebSocket hub events
    |
    +-- ECIES-wrapped per member via LABEL_HUB_KEY_WRAP
    |
    +-- Rotated on member departure

Per-note key (random 32 bytes)
    |
    +-- Encrypts note content via XChaCha20-Poly1305
    |
    +-- ECIES-wrapped per reader (volunteer + each admin)
    |
    +-- Never reused across notes
```

## በጊዜ-እውነታ መገናኛ

በጊዜ-እውነታ ዝማኔዎች (አዲስ ጥሪዎች፣ መልእክቶች፣ shift ለውጦች፣ presence) WebSocket relay በኩል ይፈሳሉ፦

- **ራስ-አስተናጋጅ**: WebSocket relay ከapp ጋር በDocker/Kubernetes ውስጥ
- **Cloudflare**: Nosflare (Cloudflare Workers-based relay)

ሁሉም ክስተቶች ephemeral (kind 20001) ናቸው እና ከhub key ጋር የተመሰጠሩ ናቸው። ክስተቶች generic tags (`["t", "llamenos:event"]`) ይጠቀማሉ — relay ክስተት አይነቶችን መለየት አይችልም። Content field XChaCha20-Poly1305 ciphertext ይዟል።

### Event flow

```
Client A (volunteer action)
    |
    | Encrypt event content with hub key
    | Sign as WebSocket event (Schnorr)
    v
WebSocket relay
    |
    | Broadcast to subscribers
    v
Client B, C, D...
    |
    | Verify Schnorr signature
    | Decrypt content with hub key
    v
Update local UI state
```

Relay የተመሰጠረ blobs እና ትክክለኛ ፊርማዎችን ያያል ግን event contentን ማንበብ ወይም የትኛው actions እንደሚከናወኑ መለየት አይችልም።

## የደህንነት ንብርታሮች

### Transport layer

- ሁሉም client-server communication በHTTPS (TLS 1.3)
- WebSocket ግንኙነቶች ወደ WebSocket relay በWSS
- Content Security Policy (CSP) script sources፣ connections፣ እና frame ancestors ይገድባል
- Tauri isolation pattern IPC ከwebview ይለያል

### Application layer

- Authentication በWebSocket keypairs (BIP-340 Schnorr ፊርማዎች)
- WebAuthn session tokens ለmulti-device ተመን
- Role-based access control (caller፣ volunteer፣ reporter፣ admin)
- በ`crypto-labels.ts` ውስጥ የተገለጹ ሁሉም 25 cryptographic domain separation constants cross-protocol attacks ይከላከላሉ

### At-rest encryption

- ጥሪ notes፣ reports፣ መልእክቶች፣ እና transcripts ከማከማቻ በፊት የተመሰጠሩ ናቸው
- Volunteer secret keys በPIN-derived keys (PBKDF2) የተመሰጠሩ ናቸው
- Tauri Stronghold በdesktop ላይ encrypted vault storage ይሰጣል
- Audit log integrity በSHA-256 hash chain የተጠበቀ ነው

### Build verification

- Reproducible builds በ`Dockerfile.build` ከ`SOURCE_DATE_EPOCH` ጋር
- Content-hashed filenames ለfrontend assets
- `CHECKSUMS.txt` ከGitHub Releases ጋር የተቀመጠ
- SLSA provenance attestations
- Verification script: `scripts/verify-build.sh`

## መድረክ ልዩነቶች

| ባህሪ | Desktop (Tauri) | Mobile (React Native) | Browser (Cloudflare) |
|---|---|---|---|
| Crypto backend | Native Rust (via IPC) | Native Rust (via UniFFI) | WASM (llamenos-core) |
| Key storage | Tauri Stronghold (encrypted) | Secure Enclave / Keystore | Browser localStorage (PIN-encrypted) |
| Transcription | Client-side Whisper (WASM) | የለም | Client-side Whisper (WASM) |
| Auto-update | Tauri updater | App Store / Play Store | Automatic (CF Workers) |
| Push notifications | OS-native (Tauri notification) | OS-native (FCM/APNS) | Browser notifications |
| Offline support | Limited (needs API) | Limited (needs API) | Limited (needs API) |
