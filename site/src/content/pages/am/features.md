---
title: ባህሪያት
subtitle: አንድ የአደጋ ጊዜ ምላሽ መድረክ የሚያስፈልገው ሁሉ — 8 የስልክ አቅራቢዎች፣ 5 የመልእክት ሰርጦች፣ HPKE encryption (RFC 9180)፣ እና አንድ የተጋራ Rust crypto crate ከሦስት ተደራሽ መተግበሪያዎች ጋር። በBun + PostgreSQL ላይ ራስ-ሆስት፣ GDPR-ተኳላ።
---

## የደህንነት አርክቴክቸር

ላሜኖስ ከመጀመሪያው ጀምሮ ደዋዮችን እና ፍቃደኞችን ከብዙ ሃብት ያላቸው ጠላቶች — መንግስታት፣ የቀኝ-ክንፍ ቡድኖች፣ እና የግል የመረጃ ድርጅቶች — ለመጠበቅ ተዘጋጅቷል። እያንዳንዱ የመስታወት ቁልፍ ውሳኔ አላማዊ፣ የተመዘገበ፣ እና የሚታይ ነው።

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — በMLS (Messaging Layer Security) እና TLS 1.3 የሚጠቀምበት ተመሳሳይ የሃይብሪድ encryption ደረጃ። የቀድሞውን ECIES (secp256k1) ሙሉ ለሙሉ ተካ። RFC 9180 ቅድመ-የተገለጸ፣ የተመረመረ መዋቅር ይሰጣል ምክንያቱም ከአድ-ሆክ ፍጥረት ፋንታ።

**በማስታወሻ መሰረት የወደፊት ሚስጥራዊነት** — እያንዳንዱ ማስታወሻ ብቸኛ የዘየለ ቁልፍ ይጠቀማል፣ ከዚያ ያ ቁልፍ ለእያንዳንዱ የተፈቀደ አንባቢ (ፍቃደኛው እና እያንዳንዱ አስተዳዳሪ) በእርሱ ብቻ HPKE-የተጠቅለለ ነው። አንድ አንባቢ የግል ቁልፍ ቢበላሽ፣ ከማብላሊያ በፊት የተጻፉ ማስታወሻዎች ምንም አይጎዱም። የቁልፍ ደረጃ፦ Per-User Key (PUK) → items_key → በማስታወሻ ይዘት ቁልፍ፣ ከተከታታይ ዝምድነት ጋር።

**ድርብ-የተመሰጠሩ ማስታወሻዎች** — እያንዳንዱ ማስታወሻ ሁለት ጊዜ የተመሰጠረ ነው፦ አንድ ጊዜ ለጻፈው ፍቃደኛ HPKE-የተጠቅለለ፣ አንድ ጊዜ ለእያንዳንዱ አስተዳዳሪ። ሁለቱም በነጻ መተርጐም ይችላሉ። ሌላ ማንም — አገልጋዩን ጨምሮ — ሲፈርቴክስትን ሊያነበብ አይችልም።

**57 የዶሜን መለያ መለያዎች** — እያንዳንዱ የመስታወት ቁልፍ ክዋኔ ብቸኛ የሆነ የምርመራ ሐረግ ይጠቀማል (የአልብረችት መከላከል)። ሁለት ክዋኔዎች የቁልፍ derivation መንገድ አያጋሩም፣ cross-protocol ጥቃቶችን ለመከላከል። መለያዎች በ`packages/protocol/crypto-labels.json` ውስጥ የተገለጹ እና ወደ TypeScript፣ Swift፣ እና Kotlin በcodegen ይመረጃሉ። በመስታወት ቁልፍ ምርመራዎች ውስጥ ያልተረጋገጡ ሐረጎች በፍጹም አይጠቀሙም።

**በመሳሪያ Ed25519/X25519 ቁልፎች** — ተጠቃሚዎች በመሳሪያ ቁልፎች አላቸው (አንድ የማንነት ቁልፍ አይደለም)። አዲስ መሳሪያዎች በappend-only፣ hash-chained፣ Ed25519-signed sigchain ይፈቀዳሉ። የመሳሪያ አገናኝ ephemeral ECDH provisioning rooms ይጠቀማል፣ ከ5 ደቂቃዎች በኋላ ያብቃሉ።

**PIN-የተመሰጠረ ቁልፍ ማከማቻ** — የመሳሪያ የግል ቁልፎች በ600,000 PBKDF2 iterations + XChaCha20-Poly1305 ከማከማቻ በፊት የተመሰጠሩ ናቸው። ነጭ ቁልፉ በin-memory closure ውስጥ ብቻ ይኖራል፣ በlock ላይ zeroed። በፍጹም sessionStorage፣ IndexedDB፣ ወይም ዲስክ ላይ ነጭ አይደርስም።

**መድረክ-ተኮር ደህንነታዊ ማከማቻ** — ዴስክቶፕ፦ Tauri Stronghold የተመሰጠረ vault። iOS፦ iOS Keychain። Android፦ Android Keystore በEncryptedSharedPreferences በኩል።

**በመሳሪያ ላይ ትራንስክሪፕሽን ብቻ** — የጥሪ ትራንስክሪፕሽን WASM Whisper (`@huggingface/transformers` ONNX runtime) በብራውዘር ውስጥ ሙሉ በሙሉ ይሰራል። ድምፅ በAudioWorklet ring buffer → Web Worker pipeline በኩል በአካባቢ ይሰራል። ድምፅ ለሰርቨር በፍጹም አይደርስም — እንኳን በተመሰጠረ መልኩ።

**SFrame ድምፅ E2EE** — የተመሰጠሩ የሚዲያ ሰርጦች SFrame (RFC 9605) ከቁልፍ derivation ጋር ወደ ተጋራው Rust crypto crate ተዋህኗል።

**ተጋራ Rust crypto crate** — በ`packages/crypto/` ውስጥ አንድ የተመረመረ ተግባር ወደ ሦስት ግቦች ይተረጎማል፦ native (Tauri desktop)፣ WASM (browser በ`@tauri-apps/api` በኩል)፣ እና UniFFI (iOS XCFramework + Android JNI)። ሦስት የተለያዩ ተግባሮች የሚለያዩ አይደሉም።

**Hash-chained ኦዲት ሎግ** — እያንዳንዱ የተመለሰ ጥሪ፣ የተፈጠረ ማስታወሻ፣ የተላከ መልእክት፣ የተቀየረ ቅንብር፣ እና የአስተዳዳሪ ተግባር በSHA-256 chaining (`previousEntryHash` + `entryHash`) ለtamper detection ይመዘገባል። አስተዳዳሪዎች የሰንሰለቱን ኢንቲግሪቲ ማረጋገጥ ይችላሉ።

**የሚደገሙ ግንባቾች** — `Dockerfile.build` ከ`SOURCE_DATE_EPOCH` ጋር፣ content-hashed filenames። SLSA provenance፣ SBOM፣ እና cosign signing በእያንዳንዱ release ላይ። ማንኛውም ግንባት በ`CHECKSUMS.txt` በGitHub Releases ውስጥ በ`scripts/verify-build.sh` በኩል byte-for-byte ሊረጋገጥ ይችላል።

---

## Telephony — 8 አቅራቢዎች

**ከብዙ መድረኮች እርስዎን ወደ አንድ አቅራቢ የሚቆለፉ ምክንያት ሳይሆን**፣ ላሜኖስ `TelephonyAdapter` በተባለ በአጠቃላይ 8 ሙሉ ተግባራት ያሉትን በይነገጽ ያስተዋውቃል። አቅራቢውን በአስተዳዳሪ UI በኩል ይቀይሩ — ኮድ ለውጥ አያስፈልግም፣ downtime የለም።

### የክላውድ አቅራቢዎች (6)

- **Twilio** — ሙሉ WebRTC፣ programmable voice፣ SIP trunking
- **SignalWire** — Twilio-compatible API፣ ዝቅተኛ ዋጋ፣ WebRTC ድጋፍ
- **Vonage** (Nexmo) — የአውሮፓ ውሂብ መኖሪያ አማራጭ
- **Plivo** — ዋጋ-በቂ፣ ዓለም አቀፍ ሽፋን
- **Telnyx** — ተወዳዳሪ ዋጋ፣ Mission Control Portal integration
- **Bandwidth** — የድርጅት-ደረጃ፣ የአሜሪካ carrier-grade አስተማማኝነት

### ራስ-ሆስት SIP (2)

- **Asterisk** — በARI (Asterisk REST Interface)። ሙሉ ጥሪ ቁጥጥር፣ IVR፣ መቅዳት።
- **FreeSWITCH** — በESL (Event Socket Library)። ከፍተኛ አፈፃፀም፣ conference-capable።

ሁለቱም `SipBridgeAdapter` መሠረት class ከ`PBX_TYPE` env var ጋር backend መምረጥ። Kamailio በSIP proxy layer ደግፍ አለው። **የጥሪ መዝገቦች ሀብዎን አይለቁም።**

### የጥሪ Routing

**Parallel ringing** — ደዋይ ሲደውል፣ በስራ ላይ ያሉ፣ ንቁ ሁሉም ፍቃደኞች በአንድ ጊዜ ይደውላሉ። መጀመሪያው መልስ የሚሰጠው ያሸንፋል፤ ሌሎች ወዲያውኑ ይቆማሉ። በተከታታይ hunting ምክንያት ጥሪዎች አይጠፉም።

**በሺፍት የተመሠረተ መርሐ ግብር** — ተደጋጋሚ ሺፍቶችን በተወሰኑ ቀናት እና የጊዜ ክልሎች ይፍጠሩ። ፍቃደኞችን ይመድቡ። ስርዓቱ ጥሪዎችን በአውቶማቲክ ወደ በስራ ላይ ያሉት ያስተላልፋል። Fallback ring group ከምንም መርሐ ግብር ካልተወሰነ።

**በእጥረት ያለ music queue** — ሁሉም ፍቃደኞች ከቢዙ፣ ደዋዮች configurable hold music ያለው queue ውስጥ ይገባሉ። Timeout ተስተካክሏል (30–300 ሰከንዶች)። በምላሽ absence ላይ ወደ voicemail ይወርዳል።

**Voicemail fallback** — ደዋዮች voicemail መተው ይችላሉ (እስከ 5 ደቂቃዎች)። Voicemails በመሳሪያ ላይ Whisper ትራንስክሪፕት ይደረጋሉ እና ለአስተዳዳሪ review የተመሰጠሩ ናቸው።

**WebRTC browser calling** — ፍቃደኞች ጥሪዎችን በብራውዘር ውስጥ በቀጥታ ያለ ስልክ ይመልሳሉ። Provider-specific WebRTC token generation ለTwilio፣ SignalWire፣ Vonage፣ እና Plivo።

**Spam mitigation** — Voice CAPTCHA (randomized 4-digit keypad input)፣ sliding-window rate limiting በስልክ ቁጥር፣ እና በጊዜ-እውነታ ban lists። አስተዳዳሪዎች እያንዳንዱን ቁጥጥር በነጻ ሳያስጀምሩ ያብሩ ወይም ያጥፉ። Custom IVR prompts ከTTS fallback ጋር።

---

## Messaging — 5 ሰርጦች

ሁሉም ሰርጦች የተጋራ የተመሰጠረ conversation model ያጋራሉ። እያንዳንዱ ገቢ መልእክት በwebhook receipt ላይ HPKE-የተመሰጠረ ነው፤ ሰርቨሩ plaintext ወዲያውኑ ያጠፋል።

### Signal

የሚገኝው ከTwilio ውጭ ተጨማሪ integration። Signal adapter የሚከተሉትን ያካትታል፦

- ሙሉ ላክ/መቀበል ከdelivery receipts ጋር
- Read receipts እና typing indicators
- Reactions እና reply threading
- Registration እና linking በsignal-cli-rest-api bridge በኩል
- Identity trust verification እና safety number management
- Retry queue ከexponential backoff ጋር
- Failover ወደ alternative transport በbridge failure ላይ
- Voice message transcription በመሳሪያ ላይ Whisper በኩል
- Health monitoring ከgraceful degradation ጋር

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Template message ድጋፍ ለ24-ሰዓት window compliance
- Media messages፦ images፣ documents፣ audio፣ video
- Webhook signature verification
- Read receipts እና delivery status

### SMS

- ገቢ እና ወጪ በTwilio፣ SignalWire፣ Vonage፣ ወይም Plivo በኩል
- Auto-response ከconfigurable welcome messages በእያንዳንዱ ቋንቋ
- MMS ድጋፍ የት እንደሚገኝ
- Webhook signature verification በእያንዳንዱ አቅራቢ

### Telegram

- Telegram Bot API
- Media ድጋፍ፦ photos፣ documents፣ voice messages
- Inline keyboards እና reply markup
- Webhook ወይም polling mode

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Rich cards፣ suggested actions፣ እና carousels
- Delivery እና read receipts
- Fallback ወደ SMS የት እንደሆነ RCS አይገኝም

### Blast/Broadcast

PostgreSQL-backed delivery queue ለbulk messaging፦

- Per-channel rate limiting (provider limits ያከብራል)
- Scheduled sends ከtimezone ድጋፍ ጋር
- Per-recipient status tracking (queued፣ sent፣ delivered፣ failed)
- Retry logic ከdead-letter queue ጋር
- Batched delivery ከconfigurable batch sizes ጋር
- Admin dashboard delivery progress በጊዜ-እውነታ እየሳየ

---

## ብዙ-መድረክ — ሦስት Native መተግበሪያዎች፣ አንድ Crypto Crate

ብዙ መድረኮች ከቀንሩ native wrapper ጋር web app ይልካሉ። ላሜኖስ ሦስት ሙሉ native መተግበሪያዎች ይልካል፣ እነሱም አንድ የተመረመረ Rust crypto ተግባር ያጋራሉ።

### ዴስክቶፕ (Tauri v2)

- Windows፣ macOS፣ Linux native binaries
- Tauri Stronghold የተመሰጠረ vault ለቁልፍ ማከማቻ
- Native system tray ከገቢ ጥሪ indicator ጋር
- Auto-updates በTauri updater በኩል
- Single-instance enforcement
- Isolation pattern + Content Security Policy
- ሁሉም የመስታወት ቁልፍ ክዋኔዎች Rust IPC በኩል ያልፋሉ — የግል ቁልፎች በፍጹም webview አይገቡም
- PLAYWRIGHT_TEST ግንባት mode ለE2E testing ከmock IPC layer ጋር

### iOS (SwiftUI)

- Native SwiftUI፣ iOS 17+ ከ`@Observable`
- ቁልፎች በiOS Keychain ውስጥ
- Rust crypto በUniFFI XCFramework በኩል (`LlamenosCoreFFI`)
- XCTest + XCUITest ለunit እና integration testing
- Push notifications በAPNs ከተመሰጠረ payloads ጋር
- Multi-hub፦ background handlers በንቁ hub state ላይ በፍጹም አይገደቡ

### Android (Kotlin/Compose)

- Native Kotlin 2.3 ከJetpack Compose፣ Material 3
- minSdk 26፣ AGP 9.1፣ Gradle 9.4
- ቁልፎች በAndroid Keystore በEncryptedSharedPreferences በኩል
- Rust crypto በJNI shared library (`.so` ፋይሎች ከተመሳሳይ Rust crate)
- Hilt dependency injection + KSP annotation processing
- Compose UI tests + Cucumber BDD E2E tests
- Multi-hub፦ per-hub ViewModel reload፣ hub key caching፣ WebSocket routing

### ተጋራ Rust Crypto Crate

`packages/crypto/` የሚከተሉትን ያስተናግዳል፦

- HPKE (RFC 9180)፦ X25519-HKDF-SHA256-AES256-GCM
- Ed25519 ፊርማዎች (BIP-340 Schnorr ለWebSocket compatibility)
- X25519 key agreement
- PBKDF2 key derivation (600K iterations)
- HKDF (RFC 5869)
- XChaCha20-Poly1305 authenticated encryption
- SFrame (RFC 9605) voice E2EE
- MLS (Messaging Layer Security) በOpenMLS በኩል — በ`mls` feature flag በኋላ
- UniFFI scaffolding ለiOS/Android bindings
- WASM compilation ለbrowser use

---

## የጉዳይ አስተዳደር

ላሜኖስ ለማንኛውም ተወሳሳይ አጠቃላይ አገልግሎት hardcoded አይደለም። ሁሉም በtemplate-driven ነው።

**Template-driven entity system** — አስተዳዳሪዎች entity አይነቶችን (contacts፣ cases፣ reports፣ events)፣ ብጁ መስኮች (text፣ number፣ select፣ checkbox፣ textarea፣ date፣ file)፣ እና report አይነቶች በሀብ ይወስናሉ። Templates ሁሉንም ቅጾች እና views ይነድፋሉ። አዲስ workflow ለማዋቀር ኮድ ለውጥ አያስፈልግም።

**Custom report አይነቶች** — Templates `reportTypes[]` ከper-type ብጁ መስኮች፣ `allowCaseConversion`፣ እና `mobileOptimized` flags ይወስናሉ። Report አይነቶች ከentity አይነቶች ሙሉ በሙሉ የተለያዩ ናቸው።

**Blind-index የተመሰጠረ ፍለጋ** — መዝገቦች የተመሰጠሩ ሲሆኑ፣ ግን HMAC-indexed መስኮች server-side ፍለጋን ያስችላሉ ያለ plaintext exposure። Indexes በሀብ scoped ናቸው እና በፍጹም hub ድንበሮች አያቋርጡም።

**Contacts እና ግንኙነቶች** — ሙሉ contact directory ከrelationship graph ጋር። Contacts ከcases፣ events፣ እና evidence ጋር ያገናኙ። ግንኙነቶች typed ናቸው (ለምሳሌ፣ "is witness to"፣ "is legal observer of") እና በtemplate configurable ናቸው።

**Evidence management** — ፋይሎችን ከcases ጋር ያያይዙ። ፋይሎች ከupload በፊት የተመሰጠሩ ናቸው (HPKE-wrapped በእያንዳንዱ የተፈቀደ አንባቢ)። Evidence chain of custody በኦዲት trail ውስጥ ይመዘገባል።

**RBAC** — Role-based access control፦ ፍቃደኛ (የራሱ ማስታወሻዎች ብቻ)፣ አስተዳዳሪ (ሁሉም ውሂብ)፣ ሪፖርተር (submissions ብቻ)። ብጁ ሚናዎች በtemplate። አስተዳዳሪዎች ፍቃደኛ-ብቻ ማስታወሻዎች ሊያዩ አይችሉም።

**Multi-hub** — አንድ ላሜኖስ ጭነት ብዙ የተለያዩ hubs (ድርጅቶች፣ መስመሮች፣ ወይም አጠቃላይ አገልግሎቶች) ያገለግላል። ማንኛውም ተጠቃሚ በተመሳሳይ ጊዜ ከብዙ hubs አባል ሊሆን ይችላል። ከሁሉም member hubs ገቢ ጥሪዎች፣ ማሳወቂያዎች፣ እና relay ክስተቶች ሁልጊዜ ንቁ ናቸው — የትኛው hub በአሁኑ ጊዜ እንደሚታይ አይገደቡም።

---

## Authentication እና Key Management

**WebSocket keypairs** — ተጠቃሚዎች WebSocket-compatible Ed25519 keypairs ከauthentication ጋር ይጠቀማሉ። BIP-340 Schnorr signature verification። ምንም passwords፣ ምንም email addresses ለauthentication አያስፈልጉም።

**WebAuthn passkeys** — አማራጭ passkey ድጋፍ ለmulti-device login። Hardware security key ወይም platform biometric ይመዝገቡ፣ ከዚያ PIN ሳይጠቀሙ ይግቡ።

**User sigchain** — Append-only፣ hash-chained device authorization records። እያንዳንዱ record በauthorizing device Ed25519 key የተፈረመ ነው። ለየትኛው መሳሪያ ለየትኛው ተጠቃሚ የተፈቀደ መሆኑን cryptographic history ይሰጣል።

**Cascading PUK rotation** — Per-User Key (PUK) → items_key → በማስታወሻ ይዘት ቁልፍ። መሳሪያ ሲሰረዝ ወይም ተጠቃሚ PIN ሲቀይር፣ ተጽዕኖ የተደረሰባቸው ቁልፎች በዝምድነት ይቀየራሉ — records በbatch operation ሳይሆን በaccess ሲደረሱባቸው ብቻ እንደገና የተመሰጠሩ ናቸው።

**Device provisioning** — አዲስ መሳሪያዎችን ያለ የግል ቁልፍ exposure ያገናኙ። QR code ያስሱ ወይም አጭር provisioning code ያስገቡ። Ephemeral ECDH key exchange ይጠቀማል። Provisioning rooms ከ5 ደቂቃዎች በኋላ ያብቃሉ።

**Recovery keys** — በonboarding ወቅት፣ Base32-formatted recovery key (128-bit entropy) ይፈጠራል። Mandatory የተመሰጠረ backup download ከመቀጠል በፊት። ይህ ብቸኛው recovery መንገድ ነው — በንድፍ አስተዳዳሪ recovery የለም።

**Auto-lock** — Key manager በidle timeout ወይም browser tab ሲደበቅ በአውቶማቲክ ይቆለፋል። Configurable idle duration። PIN እንደገኛ ለመክፈት ያስፈልጋል።

**Session model** — ሁለት-ደረጃ፦ "authenticated but locked" (session token ብቻ፣ read-only views) ከ"authenticated and unlocked" (PIN ተገብቷል፣ ሙሉ crypto access)። 8-ሰዓት session tokens ከidle timeout warnings ጋር።

---

## በጊዜ-እውነታ መሠረተ ልማት

**WebSocket relay** — ራስ-ሆስት WebSocket relay relay (ወይም Nosflare በCloudflare ላይ) ለበጊዜ-እውነታ ክስተት ስርጭት። ሁሉም ክስተት ይዘት በhub key የተመሰጠረ ነው። Generic tags (`["t", "llamenos:event"]`) relay-level metadata inference ስለክስተት አይነቶች ይከላከላሉ።

**Hub key** — Random 32 bytes (`crypto.getRandomValues`)፣ HPKE-wrapped በእያንዳንዱ hub member በ`LABEL_HUB_KEY_WRAP`። በmember departure ላይ ይቀየራል — የተሰረዙ members የወደፊት ክስተቶች መተርጐም አይችሉም።

**WebSocket** — በጊዜ-እውነታ ጥሪ ሁኔታ፣ ፍቃደኛ presence፣ conversation updates፣ እና አስተዳዳሪ monitoring በWebSocket። Reconnects ከexponential backoff ጋር።

**WebSocket real-time sync** — Ephemeral kind 20001 ክስተቶች ለcross-device እና cross-hub state synchronization። ይዘት የተመሰጠረ ነው፤ relay ክስተት አይነቶችን መለየት አይችልም።

---

## Admin እና Volunteer Experience

**Setup wizard** — Guided multi-step setup በመጀመሪያ አስተዳዳሪ login ላይ። ሰርጦች ይምረጡ፣ አቅራቢዎች ያዋቅሩ፣ hotline ስም ይስጡ። መጀመሪያ hub keypair ይፈጠራል እና hub key ለመጀመሪያ አስተዳዳሪ ይከፋፈላል።

**Getting Started checklist** — Dashboard widget setup progress ይከታተላል፦ channel configuration፣ volunteer onboarding፣ shift creation።

**በጊዜ-እውነታ monitoring** — ንቁ ጥሪዎች፣ queued ደዋዮች፣ conversations፣ እና ፍቃደኛ ሁኔታ በWebSocket በኩል በጊዜ-እውነታ ይዘመናሉ።

**Command palette** — Ctrl+K (ወይም Cmd+K) ለአፍጥን navigation፣ ፍለጋ፣ quick note creation፣ እና theme switching። Admin-only commands በሚና filtered ናቸው።

**Volunteer presence** — አስተዳዳሪዎች በጊዜ-እውነታ online/offline/on-break ቆጠራዎችን ያያሉ። ፍቃደኞች break switch ያብሩ incoming ጥሪዎችን ሳይለቁ ለማቆም።

**Keyboard shortcuts** — `?` ይጫኑ ሁሉንም shortcuts። Pages ያስሱ፣ command palette ይክፈቱ፣ common actions ያለ ማውስ።

**Dark/light themes** — System-following፣ dark፣ ወይም light። በsession persisted።

**GDPR data export** — ማስታወሻዎችን ከGDPR-compliant የተመሰጠረ ፋይል (`.enc`) ያውጡ። መጀመሪያ author ብቻ መተርጐም ይችላል።

---

## Internationalization

**13 ቋንቋዎች ተገንብተዋል** — English፣ Spanish (Español)፣ Chinese (中文)፣ Tagalog፣ Vietnamese (Tiếng Việt)፣ Arabic (العربية, RTL)፣ French (Français)፣ Haitian Creole (Kreyòl Ayisyen)፣ Korean (한국어)፣ Russian (Русский)፣ Hindi (हिन्दी)፣ Portuguese (Português)፣ German (Deutsch)።

**Codegen pipeline** — በJSON locale ፋይሎች ውስጥ አንድ source of truth iOS `.strings`፣ Android `strings.xml`፣ እና Kotlin `I18n.kt` ይፈጥራል — ምንም manual sync። በ`bun run i18n:validate:all` የተረጋገጠ።

**RTL ድጋፍ** — Arabic layout በRTL mode በትክክል ይሳያል ከmirrored navigation፣ adjusted text alignment፣ እና bidirectional text handling ጋር።

**ብጁ IVR prompts በእያንዳንዱ ቋንቋ** — ለየትኛው ቋንቋ ደዋዮችዎ እንደሚጠቀሙት voice prompts ይቅዱ። ከrecording absence ላይ ወደ text-to-speech ይወርዳል።

---

## Deployment

### Docker Compose (አንድ Server)

- ሙሉ stack፦ Bun HTTP server፣ PostgreSQL፣ RustFS (object storage)፣ WebSocket relay (WebSocket relay)
- አማራጭ profiles፦ `--profile signal` (signal-cli sidecar)፣ `--profile telephony` (Kamailio + CoTURN)፣ `--profile inference` (LLM firehose agent)፣ `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` ለአካባቢ ልማት ከfile watching ጋር
- `docker-compose.production.yml` overlay ለproduction hardening

### Kubernetes (Helm)

- Production Helm chart ከconfigurable replicas ጋር
- Health probes፦ `/health/ready` እና `/health/live`
- Prometheus ServiceMonitor ለmetrics scraping
- Caddyfile.production ከHSTS፣ CSP፣ እና security headers ጋር
- Ansible preflight + smoke-check playbooks ለpre-deployment validation

### Co-op Cloud

- Recipe ለCo-op Cloud deployments
- ለworker co-ops እና ማህበረሰብ ድርጅቶች የራሳቸውን መሠረተ ልማት የሚያስተዳድሩ

### Cloudflare Tunnels

- Ingress በCloudflare Tunnels በኩል — ምንም open inbound ports አያስፈልጉም
- ከNAT በኋላ ራስ-ሆስት servers ጋር ተኳላ
- EU/GDPR-compatible data residency ከEU-hosted VPS ጋር በማጣመር

### GDPR Compliance

- ውሂብ በእርስዎ servers ላይ ብቻ (ወይም EU-based VPS)
- Right to erasure፦ አስተዳዳሪ caller records፣ ማስታወሻዎች፣ እና logs ሊያጠራ ይችላል
- GDPR-compliant የተመሰጠረ data export
- ምንም third-party analytics ወይም tracking በመተግበሪያው ራሱ ላይ

---

## Signal Notification Sidecar

`signal-notifier/` በport 3100 ላይ እንደ ተለየ ሂደት ይሰራል። እሱ **zero-knowledge** ነው፦ contacts በHMAC-hashed identifiers በኩል ይፈታሉ — sidecar በፍጹም plaintext ስልክ ቁጥሮች አያከማችም። ተጋራ `SIGNAL_NOTIFIER_BEARER_TOKEN` መተግበሪያውን ወደ sidecar ያረጋግጣል።

---

## Protocol እና Codegen

ሁሉም አይነቶች ከአንድ source of truth ይፈሳሉ፦

- **Zod schemas** በ`packages/protocol/schemas/` ውስጥ ሁሉንም API እና wire አይነቶች ይወስናሉ
- **Codegen** (`bun run codegen`) Swift Codable structs፣ Kotlin `@Serializable` data classes፣ እና OpenAPI snapshot ይፈጥራል
- **Crypto labels** በ`packages/protocol/crypto-labels.json` (57 constants) ወደ TypeScript፣ Swift፣ እና Kotlin ይመረጃሉ — በcrypto ኮድ ውስጥ ምንም raw strings
- **i18n codegen** (`bun run i18n:codegen`) iOS `.strings`፣ Android `strings.xml`፣ እና Kotlin `I18n.kt` ከJSON locale ፋይሎች ይፈጥራል

ይህ ማለት schema ወይም protocol ለውጥ በአውቶማቲክ ወደ ሁሉም ሦስት መድረኮች ይተላለፋል።
