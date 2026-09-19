---
title: Taq Feature
subtitle: Konojel ri jun crisis response platform nrajo' — 8 telephony providers, 5 messaging channels, HPKE encryption (RFC 9180), chuqa' ka'i' native apps nik'oj jun ruk'u'x auditable Rust crypto crate. Self-hosted pa Bun + PostgreSQL, GDPR-compliant.
---

## Rutzil Ruch'ak'ik

Llámenos xtz'uk pa rutikirib'al richin nuchajij' callers chuqa' volunteers chi kiwäch well-funded taq adversaries — nation states, right-wing taq k'ayib'äl, chuqa' private intelligence taq k'ayib'äl. Junjun cryptographic decision intentional, documented, chuqa' auditable.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — Ri junam hybrid encryption standard rokisaxik pa MLS (Messaging Layer Security) chuqa' TLS 1.3. Xtz'ila' ri older ECIES (secp256k1) entirely. RFC 9180 nuya' jun formally specified, peer-reviewed construction rather than jun ad-hoc composition.

**Per-note forward secrecy** — Junjun note nrokisaj jun unique random key, chuqa' re' key xHPKE-wrapped separately richin junjun authorized reader (ri volunteer chuqa' junjun admin). Compromising jun reader's private key exposes nothing chi rij notes tz'ib'an chuwäch ri compromise. Ri key hierarchy: Per-User Key (PUK) → items_key → per-note content key, rik'in cascading lazy rotation.

**Dual-encrypted notes** — Junjun note xencrypt ka'i' times: once HPKE-wrapped richin ri volunteer ri xtz'ib'aj, once richin junjun admin. Ka'i' yetikïr nitz'akaj independently. Majun chik — including ri ruk'u'x samaj — yetikïr nik'ul ri plaintext.

**57 domain separation labels** — Junjun cryptographic operation nrokisaj jun unique context string (ri Albrecht defense). Majun ka'i' operations nik'oj jun key derivation path, preventing cross-protocol taq tzij. Labels e defined pa `packages/protocol/crypto-labels.json` chuqa' generated pa TypeScript, Swift, chuqa' Kotlin via codegen. Raw string literals majun xokisaj ta pa crypto contexts.

**Per-device Ed25519/X25519 keys** — Users k'o per-device keys (man jun single identity key). K'ak'a' devices e authorized via jun append-only, hash-chained, Ed25519-signed sigchain. Device linking nrokisaj ephemeral ECDH provisioning rooms ri expire chuwäch 5 minutes.

**PIN-encrypted key storage** — Device private keys e encrypted rik'in 600,000 PBKDF2 iterations + XChaCha20-Poly1305 chuwäch storage. Ri raw key samajin xa pa jun in-memory closure, zeroed pa lock. Majun xb'än pa sessionStorage, IndexedDB, o disk pa plaintext.

**Platform-native secure storage** — Desktop: Tauri Stronghold encrypted vault. iOS: iOS Keychain. Android: Android Keystore via EncryptedSharedPreferences.

**Client-side transcription only** — Call transcription nrokisaj WASM Whisper (`@huggingface/transformers` ONNX runtime) samajin entirely pa ri browser. Audio nisamäj locally via jun AudioWorklet ring buffer → Web Worker pipeline. Audio majun xb'än pa ri ruk'u'x samaj — man ch'aqa' ta pa encrypted ruwäch.

**SFrame voice E2EE** — Encrypted media channels rokisaxik SFrame (RFC 9605) rik'in key derivation integrated pa ri shared Rust crypto crate.

**Shared Rust crypto crate** — Jun single auditable implementation pa `packages/crypto/` compiled pa ka'i' targets: native (Tauri desktop), WASM (browser via `@tauri-apps/api`), chuqa' UniFFI (iOS XCFramework + Android JNI). Man ka'i' separate implementations ri yetikïr diverge.

**Hash-chained audit log** — Junjun call answered, note created, message sent, setting changed, chuqa' admin action xlog rik'in SHA-256 chaining (`previousEntryHash` + `entryHash`) richin tamper detection. Admins yetikïr nitz'akaj chain integrity.

**Reproducible builds** — `Dockerfile.build` rik'in `SOURCE_DATE_EPOCH`, content-hashed filenames. SLSA provenance, SBOM, chuqa' cosign signing pa junjun release. Jun ruk'u'x samaj build yatikïr nitz'akaj byte-for-byte against `CHECKSUMS.txt` pa GitHub Releases rokisaxik `scripts/verify-build.sh`.

---

## Telephony — 8 Providers

**Man junam ta ch'aqa' chik platforms ri nik'at chi awe pa jun provider**, Llámenos implements jun `TelephonyAdapter` interface rik'in 8 complete implementations. Najäl providers via admin UI — majun code changes, majun downtime.

### Cloud Providers (6)

- **Twilio** — Full WebRTC, programmable voice, SIP trunking
- **SignalWire** — Twilio-compatible API, lower cost, WebRTC support
- **Vonage** (Nexmo) — European data residency rucha'ik
- **Plivo** — Cost-effective, global coverage
- **Telnyx** — Competitive pricing, Mission Control Portal integration
- **Bandwidth** — Enterprise-grade, US carrier-grade reliability

### Self-Hosted SIP (2)

- **Asterisk** — Via ARI (Asterisk REST Interface). Full call control, IVR, recording.
- **FreeSWITCH** — Via ESL (Event Socket Library). High-performance, conference-capable.

Ka'i' nik'oj ri `SipBridgeAdapter` base class rik'in `PBX_TYPE` env var nucha' ri backend. Kamailio supported achi'el jun SIP proxy layer. **Majun call records b'ey pa awachib'al.**

### Call Routing

**Parallel ringing** — We jun caller dials in, junjun on-shift, non-busy volunteer b'ey simultaneously. Ri first pickup wins; ch'aqa' chik stop immediately. Majun taq tzij missed due pa sequential hunting.

**Shift-based scheduling** — Titz'uk recurring shifts rik'in specific taq q'ij chuqa' time ranges. Titz'ajij' volunteers. Ri system routes taq tzij automatically pa whoever on duty. Fallback ring group we majun schedule defined.

**Queue rik'in hold music** — We konojel volunteers e busy, callers ok pa jun queue rik'in configurable hold music. Timeout adjustable (30–300 seconds). Falls through pa voicemail pa majun answer.

**Voicemail fallback** — Callers yetikïr niya' jun voicemail (up pa 5 minutes). Voicemails e transcribed via client-side Whisper chuqa' encrypted richin admin review.

**WebRTC browser calling** — Volunteers answer taq tzij directly pa ri browser majun jun ch'ich'. Provider-specific WebRTC token generation richin Twilio, SignalWire, Vonage, chuqa' Plivo.

**Spam mitigation** — Voice CAPTCHA (randomized 4-digit keypad input), sliding-window rate limiting per phone number, chuqa' real-time ban lists. Admins toggle junjun control independently majun restarts. Custom IVR prompts rik'in TTS fallback.

---

## Messaging — 5 Channels

Konojel channels nik'oj jun unified encrypted conversation model. Junjun inbound message xHPKE-encrypted pa webhook receipt; ri ruk'u'x samaj xdiscard plaintext immediately.

### Signal

Ri most complete non-Twilio integration available. Ri Signal adapter includes:

- Full send/receive rik'in delivery receipts
- Read receipts chuqa' typing indicators
- Reactions chuqa' reply threading
- Registration chuqa' linking via signal-cli-rest-api bridge
- Identity trust verification chuqa' safety number management
- Retry queue rik'in exponential backoff
- Failover pa alternative transport pa bridge failure
- Voice message transcription via client-side Whisper
- Health monitoring rik'in graceful degradation

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Template message support richin 24-hour window compliance
- Media taq tzij: images, documents, audio, video
- Webhook signature verification
- Read receipts chuqa' delivery status

### SMS

- Inbound chuqa' outbound via Twilio, SignalWire, Vonage, o Plivo
- Auto-response rik'in configurable welcome messages per ch'ab'äl
- MMS support we available
- Webhook signature verification per provider

### Telegram

- Telegram Bot API
- Media support: photos, documents, voice taq tzij
- Inline keyboards chuqa' reply markup
- Webhook o polling ruwäch

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Rich cards, suggested actions, chuqa' carousels
- Delivery chuqa' read receipts
- Fallback pa SMS we RCS man available ta

### Blast/Broadcast

PostgreSQL-backed delivery queue richin bulk messaging:

- Per-channel rate limiting (respects provider limits)
- Scheduled sends rik'in timezone support
- Per-recipient status tracking (queued, sent, delivered, failed)
- Retry logic rik'in dead-letter queue
- Batched delivery rik'in configurable batch sizes
- Admin dashboard nuk'ut delivery progress pa k'ak'a' samajib'äl

---

## Multi-Platform — Ka'i' Native Apps, Jun Crypto Crate

Ch'aqa' chik platforms ship jun web app rik'in jun thin native wrapper. Llámenos ships ka'i' fully native applications ri nik'oj jun single auditable Rust crypto implementation.

### Desktop (Tauri v2)

- Windows, macOS, Linux native binaries
- Tauri Stronghold encrypted vault richin key storage
- Native system tray rik'in incoming tzij indicator
- Auto-updates via Tauri updater
- Single-instance enforcement
- Isolation pattern + Content Security Policy
- Konojel crypto operations b'ey through Rust IPC — private keys majun b'ey pa ri webview
- PLAYWRIGHT_TEST build ruwäch richin E2E testing rik'in mock IPC layer

### iOS (SwiftUI)

- Native SwiftUI, iOS 17+ rik'in `@Observable`
- Keys stored pa iOS Keychain
- Rust crypto via UniFFI XCFramework (`LlamenosCoreFFI`)
- XCTest + XCUITest richin unit chuqa' integration testing
- Push notifications via APNs rik'in encrypted payloads
- Multi-hub: background handlers majun xgate pa active hub state

### Android (Kotlin/Compose)

- Native Kotlin 2.3 rik'in Jetpack Compose, Material 3
- minSdk 26, AGP 9.1, Gradle 9.4
- Keys pa Android Keystore via EncryptedSharedPreferences
- Rust crypto via JNI shared library (`.so` files pa ri junam Rust crate)
- Hilt dependency injection + KSP annotation processing
- Compose UI tests + Cucumber BDD E2E tests
- Multi-hub: per-hub ViewModel reload, hub key caching, WebSocket routing

### Shared Rust Crypto Crate

`packages/crypto/` implements:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Ed25519 signatures (BIP-340 Schnorr richin WebSocket compatibility)
- X25519 key agreement
- PBKDF2 key derivation (600K iterations)
- HKDF (RFC 5869)
- XChaCha20-Poly1305 authenticated encryption
- SFrame (RFC 9605) voice E2EE
- MLS (Messaging Layer Security) via OpenMLS — behind `mls` feature flag
- UniFFI scaffolding richin iOS/Android bindings
- WASM compilation richin browser use

---

## Case Management

Llámenos man hardcoded ta pa jun specific use case. Konojel template-driven.

**Template-driven entity system** — Admins define entity types (contacts, cases, reports, events), custom fields (text, number, select, checkbox, textarea, date, file), chuqa' report types per hub. Templates drive konojel forms chuqa' views. Majun code changes rajowaxik richin ruchojmil jun k'ak'a' workflow.

**Custom report types** — Templates define `reportTypes[]` rik'in per-type custom fields, `allowCaseConversion`, chuqa' `mobileOptimized` flags. Report types fully distinct from entity types.

**Blind-index encrypted search** — Records e stored encrypted, pero HMAC-indexed fields enable server-side search majun exposing plaintext. Indexes e scoped per hub chuqa' majun cross hub boundaries.

**Contacts chuqa' relationships** — Full contact directory rik'in relationship graph. Titz'ajij' contacts pa cases, events, chuqa' evidence. Relationships e typed (achike, "is witness to", "is legal observer of") chuqa' configurable per template.

**Evidence management** — Titz'aqatisaj files pa cases. Files e encrypted chuwäch upload (HPKE-wrapped per authorized reader). Evidence chain of custody xlog pa ri audit trail.

**RBAC** — Role-based access control: Volunteer (xa notes), Admin (konojel tzij), Reporter (submissions xa). Custom roles per template. Admins man yetikïr ta nik'ul volunteer-only notes.

**Multi-hub** — Jun single Llámenos installation serves k'ïy independent hubs (k'ayib'äl, lines, o use cases). Jun rumaq user yatikïr k'o member pa k'ïy hubs simultaneously. Incoming taq tzij, notifications, chuqa' relay events from ALL member hubs e junanel active — man xgate ta pa which hub currently nuk'ut.

---

## Authentication & Key Management

**WebSocket keypairs** — Users authenticate rik'in WebSocket-compatible Ed25519 keypairs. BIP-340 Schnorr signature verification. Majun passwords, majun email addresses rajowaxik richin authentication.

**WebAuthn passkeys** — Optional passkey support richin multi-device login. Titz'ib'äx jun hardware security key o platform biometric, chuqa' sign in majun typing jun PIN.

**User sigchain** — Append-only, hash-chained device authorization records. Junjun record xsign rik'in ri authorizing device's Ed25519 key. Nuya' jun cryptographic history of which devices e authorized richin which user.

**Cascading PUK rotation** — Per-User Key (PUK) → items_key → per-note content key. We jun device xdeauthorized o jun user xjal ri PIN, affected keys rotate lazily — xa re-encrypting records achi'el e accessed, man pa jun batch operation.

**Device provisioning** — Titz'ajij' k'ak'a' devices majun exposing ri private key. Scan jun QR code o titaq jun short provisioning code. Nrokisaj ephemeral ECDH key exchange. Provisioning rooms expire chuwäch 5 minutes.

**Recovery keys** — Chuwäch onboarding, jun Base32-formatted recovery key (128-bit entropy) xtz'uk. Mandatory encrypted backup download chuwäch proceeding. Re' ri xa recovery path — majun admin recovery, by design.

**Auto-lock** — Ri key manager locks automatically pa idle timeout o we ri browser tab hidden. Configurable idle duration. Re-enter PIN richin unlock.

**Session model** — Two-tier: "authenticated pero locked" (session token xa, read-only views) vs "authenticated chuqa' unlocked" (PIN entered, full crypto access). 8-hour session tokens rik'in idle timeout warnings.

---

## K'ak'a' Samajib'äl Infrastructure

**WebSocket relay** — Self-hosted WebSocket relay (o Nosflare pa Cloudflare) richin k'ak'a' event distribution. Konojel event content encrypted rik'in ri hub key. Generic tags (`["t", "llamenos:event"]`) prevent relay-level metadata inference about event types.

**Hub key** — Random 32 bytes (`crypto.getRandomValues`), HPKE-wrapped individually per hub member via `LABEL_HUB_KEY_WRAP`. Rotated pa member departure — departed members man yetikïr ta nitz'akaj future events.

**WebSocket** — K'ak'a' call status, volunteer presence, conversation updates, chuqa' admin monitoring via WebSocket. Reconnects rik'in exponential backoff.

**WebSocket k'ak'a' sync** — Ephemeral kind 20001 events richin cross-device chuqa' cross-hub state synchronization. Content encrypted; relay man yetikïr ta distinguish event types.

---

## Admin & Volunteer Experience

**Setup wizard** — Guided multi-step setup pa rutikirib'al admin login. Tacha' channels, ruchojmil providers, tiya' hotline b'i'aj. Generates initial hub keypair chuqa' distributes hub key pa ri first admin.

**Getting Started checklist** — Dashboard widget tracking setup progress: channel ruchojmil, volunteer onboarding, shift creation.

**K'ak'a' monitoring** — Active taq tzij, queued callers, conversations, chuqa' volunteer status update pa k'ak'a' via WebSocket.

**Command palette** — Ctrl+K (o Cmd+K) richin instant navigation, search, quick note creation, chuqa' theme switching. Admin-only commands filtered by role.

**Volunteer presence** — Admins nik'ut k'ak'a' online/offline/on-break counts. Volunteers toggle jun break switch richin pause incoming taq tzij majun leaving ri shift.

**Keyboard shortcuts** — Tipitz' `?` richin konojel shortcuts. Navigate pages, open command palette, common actions majun ri mouse.

**Dark/light themes** — System-following, dark, o light. Persisted per session.

**GDPR data export** — Export notes achi'el jun GDPR-compliant encrypted file (`.enc`). Xa ri original author yetikïr nitz'akaj.

---

## Internationalization

**13 ch'ab'äl built in** — English, Spanish (Español), Chinese (中文), Tagalog, Vietnamese (Tiếng Việt), Arabic (العربية, RTL), French (Français), Haitian Creole (Kreyòl Ayisyen), Korean (한국어), Russian (Русский), Hindi (हिन्दी), Portuguese (Português), German (Deutsch).

**Codegen pipeline** — Jun single source of truth pa JSON locale files generates iOS `.strings`, Android `strings.xml`, chuqa' Kotlin `I18n.kt` — majun manual sync. Validated by `bun run i18n:validate:all`.

**RTL support** — Arabic layout renders correctly pa RTL ruwäch rik'in mirrored navigation, adjusted text alignment, chuqa' bidirectional text handling.

**Custom IVR prompts per ch'ab'äl** — Record voice prompts richin junjun ch'ab'äl rokisaxik aw callers. Falls back pa text-to-speech we majun recording k'o.

---

## Deployment

### Docker Compose (Ruk'u'x Samaj)

- Full stack: Bun HTTP server, PostgreSQL, RustFS (ruk'u'x k'ayib'äl), WebSocket relay
- Optional profiles: `--profile signal` (signal-cli sidecar), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (LLM firehose agent), `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` richin local development rik'in file watching
- `docker-compose.production.yml` overlay richin production hardening

### Kubernetes (Helm)

- Production Helm chart rik'in configurable replicas
- Health probes: `/health/ready` chuqa' `/health/live`
- Prometheus ServiceMonitor richin metrics scraping
- Caddyfile.production rik'in HSTS, CSP, chuqa' security headers
- Ansible preflight + smoke-check playbooks richin pre-deployment validation

### Co-op Cloud

- Recipe richin Co-op Cloud deployments
- Tz'uk richin worker co-ops chuqa' community k'ayib'äl ri nik'oj ri taq ruk'u'x samaj

### Cloudflare Tunnels

- Ingress via Cloudflare Tunnels — majun open inbound taq b'ey rajowaxik
- Compatible rik'in self-hosted taq ruk'u'x samaj behind NAT
- EU/GDPR-compatible data residency we combined rik'in EU-hosted VPS

### GDPR Compliance

- Data stored xa pa aw taq ruk'u'x samaj (o EU-based VPS)
- Right pa erasure: admin yetikïr purge caller records, notes, chuqa' logs
- GDPR-compliant encrypted data export
- Majun third-party analytics o tracking pa ri application itself

---

## Signal Notification Sidecar

`signal-notifier/` samajin pa b'ey 3100 achi'el jun separate process. **Zero-knowledge**: contacts e resolved via HMAC-hashed identifiers — ri sidecar majun xstore plaintext phone numbers. Shared `SIGNAL_NOTIFIER_BEARER_TOKEN` authenticates ri main app pa ri sidecar.

---

## Protocol & Codegen

Konojel types b'ey from jun single source of truth:

- **Zod schemas** pa `packages/protocol/schemas/` define konojel API chuqa' wire types
- **Codegen** (`bun run codegen`) generates Swift Codable structs, Kotlin `@Serializable` data classes, chuqa' jun OpenAPI snapshot
- **Crypto labels** pa `packages/protocol/crypto-labels.json` (57 constants) generate pa TypeScript, Swift, chuqa' Kotlin — majun raw strings pa crypto code
- **i18n codegen** (`bun run i18n:codegen`) generates iOS `.strings`, Android `strings.xml`, chuqa' Kotlin `I18n.kt` pa JSON locale files

Re' nuya' chi jun schema o protocol change ripples automatically pa ka'i' platforms.
