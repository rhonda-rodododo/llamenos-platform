---
title: Features
subtitle: Everything a crisis response platform needs — 8 telephony providers, 5 messaging channels, HPKE encryption (RFC 9180), and three native apps sharing a single auditable Rust crypto crate. Self-hosted on Bun + PostgreSQL, GDPR-compliant.
---

## Security Architecture

Llámenos was designed from the start to protect callers and volunteers against well-funded adversaries — nation states, right-wing groups, and private intelligence firms. Every cryptographic decision is intentional, documented, and auditable.

**HPKE (RFC 9180) — X25519-HKDF-SHA256-AES256-GCM** — The same hybrid encryption standard used in MLS (Messaging Layer Security) and TLS 1.3. Replaced the older ECIES (secp256k1) entirely. RFC 9180 provides a formally specified, peer-reviewed construction rather than an ad-hoc composition.

**Per-note forward secrecy** — Every note uses a unique random key, then that key is HPKE-wrapped separately for each authorized reader (the volunteer and each admin). Compromising a reader's private key exposes nothing about notes written before the compromise. The key hierarchy: Per-User Key (PUK) → items_key → per-note content key, with cascading lazy rotation.

**Dual-encrypted notes** — Every note is encrypted twice: once HPKE-wrapped for the volunteer who wrote it, once for each admin. Both can decrypt independently. No one else — including the server — can read the plaintext.

**57 domain separation labels** — Every cryptographic operation uses a unique context string (the Albrecht defense). No two operations share a key derivation path, preventing cross-protocol attacks. Labels are defined in `packages/protocol/crypto-labels.json` and generated to TypeScript, Swift, and Kotlin via codegen. Raw string literals are never used in crypto contexts.

**Per-device Ed25519/X25519 keys** — Users have per-device keys (not a single identity key). New devices are authorized via an append-only, hash-chained, Ed25519-signed sigchain. Device linking uses ephemeral ECDH provisioning rooms that expire after 5 minutes.

**PIN-encrypted key storage** — Device private keys are encrypted with 600,000 PBKDF2 iterations + XChaCha20-Poly1305 before storage. The raw key lives only in an in-memory closure, zeroed on lock. It never touches sessionStorage, IndexedDB, or disk in plaintext.

**Platform-native secure storage** — Desktop: Tauri Stronghold encrypted vault. iOS: iOS Keychain. Android: Android Keystore via EncryptedSharedPreferences.

**Client-side transcription only** — Call transcription uses WASM Whisper (`@huggingface/transformers` ONNX runtime) running entirely in the browser. Audio is processed locally via an AudioWorklet ring buffer → Web Worker pipeline. Audio never reaches the server — not even in encrypted form.

**SFrame voice E2EE** — Encrypted media channels using SFrame (RFC 9605) with key derivation integrated into the shared Rust crypto crate.

**Shared Rust crypto crate** — A single auditable implementation in `packages/crypto/` compiled to three targets: native (Tauri desktop), WASM (browser via `@tauri-apps/api`), and UniFFI (iOS XCFramework + Android JNI). Not three separate implementations that can diverge.

**Hash-chained audit log** — Every call answered, note created, message sent, setting changed, and admin action is logged with SHA-256 chaining (`previousEntryHash` + `entryHash`) for tamper detection. Admins can verify chain integrity.

**Reproducible builds** — `Dockerfile.build` with `SOURCE_DATE_EPOCH`, content-hashed filenames. SLSA provenance, SBOM, and cosign signing on every release. Any build can be verified byte-for-byte against `CHECKSUMS.txt` in GitHub Releases using `scripts/verify-build.sh`.

---

## Telephony — 8 Providers

**Unlike most platforms that lock you into one provider**, Llámenos implements a `TelephonyAdapter` interface with 8 complete implementations. Switch providers via admin UI — no code changes, no downtime.

### Cloud Providers (6)

- **Twilio** — Full WebRTC, programmable voice, SIP trunking
- **SignalWire** — Twilio-compatible API, lower cost, WebRTC support
- **Vonage** (Nexmo) — European data residency option
- **Plivo** — Cost-effective, global coverage
- **Telnyx** — Competitive pricing, Mission Control Portal integration
- **Bandwidth** — Enterprise-grade, US carrier-grade reliability

### Self-Hosted SIP (2)

- **Asterisk** — Via ARI (Asterisk REST Interface). Full call control, IVR, recording.
- **FreeSWITCH** — Via ESL (Event Socket Library). High-performance, conference-capable.

Both use the `SipBridgeAdapter` base class with `PBX_TYPE` env var selecting the backend. Kamailio is supported as a SIP proxy layer. **No call records leave your server.**

### Call Routing

**Parallel ringing** — When a caller dials in, every on-shift, non-busy volunteer rings simultaneously. The first pickup wins; all others stop immediately. No calls missed due to sequential hunting.

**Shift-based scheduling** — Create recurring shifts with specific days and time ranges. Assign volunteers. The system routes calls automatically to whoever is on duty. Fallback ring group if no schedule is defined.

**Queue with hold music** — If all volunteers are busy, callers enter a queue with configurable hold music. Timeout is adjustable (30–300 seconds). Falls through to voicemail on no answer.

**Voicemail fallback** — Callers can leave a voicemail (up to 5 minutes). Voicemails are transcribed via client-side Whisper and encrypted for admin review.

**WebRTC browser calling** — Volunteers answer calls directly in the browser without a phone. Provider-specific WebRTC token generation for Twilio, SignalWire, Vonage, and Plivo.

**Spam mitigation** — Voice CAPTCHA (randomized 4-digit keypad input), sliding-window rate limiting per phone number, and real-time ban lists. Admins toggle each control independently without restarts. Custom IVR prompts with TTS fallback.

---

## Messaging — 5 Channels

All channels share a unified encrypted conversation model. Every inbound message is HPKE-encrypted on webhook receipt; the server discards plaintext immediately.

### Signal

The most complete non-Twilio integration available. The Signal adapter includes:

- Full send/receive with delivery receipts
- Read receipts and typing indicators
- Reactions and reply threading
- Registration and linking via signal-cli-rest-api bridge
- Identity trust verification and safety number management
- Retry queue with exponential backoff
- Failover to alternative transport on bridge failure
- Voice message transcription via client-side Whisper
- Health monitoring with graceful degradation

### WhatsApp Business

- Meta Cloud API (Graph API v21.0)
- Template message support for 24-hour window compliance
- Media messages: images, documents, audio, video
- Webhook signature verification
- Read receipts and delivery status

### SMS

- Inbound and outbound via Twilio, SignalWire, Vonage, or Plivo
- Auto-response with configurable welcome messages per language
- MMS support where available
- Webhook signature verification per provider

### Telegram

- Telegram Bot API
- Media support: photos, documents, voice messages
- Inline keyboards and reply markup
- Webhook or polling mode

### RCS (Rich Communication Services)

- Google RBM (Rich Business Messaging) API
- Rich cards, suggested actions, and carousels
- Delivery and read receipts
- Fallback to SMS where RCS is unavailable

### Blast/Broadcast

PostgreSQL-backed delivery queue for bulk messaging:

- Per-channel rate limiting (respects provider limits)
- Scheduled sends with timezone support
- Per-recipient status tracking (queued, sent, delivered, failed)
- Retry logic with dead-letter queue
- Batched delivery with configurable batch sizes
- Admin dashboard showing delivery progress in real time

---

## Multi-Platform — Three Native Apps, One Crypto Crate

Most platforms ship a web app with a thin native wrapper. Llámenos ships three fully native applications that share a single auditable Rust crypto implementation.

### Desktop (Tauri v2)

- Windows, macOS, Linux native binaries
- Tauri Stronghold encrypted vault for key storage
- Native system tray with incoming call indicator
- Auto-updates via Tauri updater
- Single-instance enforcement
- Isolation pattern + Content Security Policy
- All crypto operations route through Rust IPC — private keys never enter the webview
- PLAYWRIGHT_TEST build mode for E2E testing with mock IPC layer

### iOS (SwiftUI)

- Native SwiftUI, iOS 17+ with `@Observable`
- Keys stored in iOS Keychain
- Rust crypto via UniFFI XCFramework (`LlamenosCoreFFI`)
- XCTest + XCUITest for unit and integration testing
- Push notifications via APNs with encrypted payloads
- Multi-hub: background handlers never gate on active hub state

### Android (Kotlin/Compose)

- Native Kotlin 2.3 with Jetpack Compose, Material 3
- minSdk 26, AGP 9.1, Gradle 9.4
- Keys in Android Keystore via EncryptedSharedPreferences
- Rust crypto via JNI shared library (`.so` files from same Rust crate)
- Hilt dependency injection + KSP annotation processing
- Compose UI tests + Cucumber BDD E2E tests
- Multi-hub: per-hub ViewModel reload, hub key caching, WebSocket routing

### Shared Rust Crypto Crate

`packages/crypto/` implements:

- HPKE (RFC 9180): X25519-HKDF-SHA256-AES256-GCM
- Ed25519 signatures (BIP-340 Schnorr for Nostr compatibility)
- X25519 key agreement
- PBKDF2 key derivation (600K iterations)
- HKDF (RFC 5869)
- XChaCha20-Poly1305 authenticated encryption
- SFrame (RFC 9605) voice E2EE
- MLS (Messaging Layer Security) via OpenMLS — behind `mls` feature flag
- UniFFI scaffolding for iOS/Android bindings
- WASM compilation for browser use

---

## Case Management

Llámenos is not hardcoded to any specific use case. Everything is template-driven.

**Template-driven entity system** — Admins define entity types (contacts, cases, reports, events), custom fields (text, number, select, checkbox, textarea, date, file), and report types per hub. Templates drive all forms and views. No code changes needed to configure a new workflow.

**Custom report types** — Templates define `reportTypes[]` with per-type custom fields, `allowCaseConversion`, and `mobileOptimized` flags. Report types are fully distinct from entity types.

**Blind-index encrypted search** — Records are stored encrypted, but HMAC-indexed fields enable server-side search without exposing plaintext. Indexes are scoped per hub and never cross hub boundaries.

**Contacts and relationships** — Full contact directory with relationship graph. Link contacts to cases, events, and evidence. Relationships are typed (e.g., "is witness to", "is legal observer of") and configurable per template.

**Evidence management** — Attach files to cases. Files are encrypted before upload (HPKE-wrapped per authorized reader). Evidence chain of custody is logged in the audit trail.

**RBAC** — Role-based access control: Volunteer (own notes only), Admin (all data), Reporter (submissions only). Custom roles per template. Admins cannot see volunteer-only notes.

**Multi-hub** — A single Llámenos installation serves multiple independent hubs (organizations, lines, or use cases). Any user can be a member of multiple hubs simultaneously. Incoming calls, notifications, and relay events from ALL member hubs are always active — not gated on which hub is currently displayed.

---

## Authentication & Key Management

**Nostr keypairs** — Users authenticate with Nostr-compatible Ed25519 keypairs. BIP-340 Schnorr signature verification. No passwords, no email addresses required for authentication.

**WebAuthn passkeys** — Optional passkey support for multi-device login. Register a hardware security key or platform biometric, then sign in without typing a PIN.

**User sigchain** — Append-only, hash-chained device authorization records. Each record is signed with the authorizing device's Ed25519 key. Provides a cryptographic history of which devices are authorized for which user.

**Cascading PUK rotation** — Per-User Key (PUK) → items_key → per-note content key. When a device is deauthorized or a user changes their PIN, affected keys rotate lazily — only re-encrypting records as they are accessed, not in a batch operation.

**Device provisioning** — Link new devices without exposing the private key. Scan a QR code or enter a short provisioning code. Uses ephemeral ECDH key exchange. Provisioning rooms expire after 5 minutes.

**Recovery keys** — During onboarding, a Base32-formatted recovery key (128-bit entropy) is generated. Mandatory encrypted backup download before proceeding. This is the only recovery path — no admin recovery, by design.

**Auto-lock** — The key manager locks automatically on idle timeout or when the browser tab is hidden. Configurable idle duration. Re-enter PIN to unlock.

**Session model** — Two-tier: "authenticated but locked" (session token only, read-only views) vs "authenticated and unlocked" (PIN entered, full crypto access). 8-hour session tokens with idle timeout warnings.

---

## Real-Time Infrastructure

**Nostr relay** — Self-hosted strfry relay (or Nosflare on Cloudflare) for real-time event distribution. All event content is encrypted with the hub key. Generic tags (`["t", "llamenos:event"]`) prevent relay-level metadata inference about event types.

**Hub key** — Random 32 bytes (`crypto.getRandomValues`), HPKE-wrapped individually per hub member via `LABEL_HUB_KEY_WRAP`. Rotated on member departure — departed members cannot decrypt future events.

**WebSocket** — Real-time call status, volunteer presence, conversation updates, and admin monitoring via WebSocket. Reconnects with exponential backoff.

**Nostr real-time sync** — Ephemeral kind 20001 events for cross-device and cross-hub state synchronization. Content encrypted; relay cannot distinguish event types.

---

## Admin & Volunteer Experience

**Setup wizard** — Guided multi-step setup on first admin login. Choose channels, configure providers, set hotline name. Generates initial hub keypair and distributes hub key to the first admin.

**Getting Started checklist** — Dashboard widget tracking setup progress: channel configuration, volunteer onboarding, shift creation.

**Real-time monitoring** — Active calls, queued callers, conversations, and volunteer status update in real time via WebSocket.

**Command palette** — Ctrl+K (or Cmd+K) for instant navigation, search, quick note creation, and theme switching. Admin-only commands filtered by role.

**Volunteer presence** — Admins see real-time online/offline/on-break counts. Volunteers toggle a break switch to pause incoming calls without leaving their shift.

**Keyboard shortcuts** — Press `?` for all shortcuts. Navigate pages, open command palette, common actions without the mouse.

**Dark/light themes** — System-following, dark, or light. Persisted per session.

**GDPR data export** — Export notes as a GDPR-compliant encrypted file (`.enc`). Only the original author can decrypt.

---

## Internationalization

**13 languages built in** — English, Spanish (Español), Chinese (中文), Tagalog, Vietnamese (Tiếng Việt), Arabic (العربية, RTL), French (Français), Haitian Creole (Kreyòl Ayisyen), Korean (한국어), Russian (Русский), Hindi (हिन्दी), Portuguese (Português), German (Deutsch).

**Codegen pipeline** — A single source of truth in JSON locale files generates iOS `.strings`, Android `strings.xml`, and Kotlin `I18n.kt` — no manual sync. Validated by `bun run i18n:validate:all`.

**RTL support** — Arabic layout renders correctly in RTL mode with mirrored navigation, adjusted text alignment, and bidirectional text handling.

**Custom IVR prompts per language** — Record voice prompts for each language used by your callers. Falls back to text-to-speech when no recording exists.

---

## Deployment

### Docker Compose (Single Server)

- Full stack: Bun HTTP server, PostgreSQL, MinIO (object storage), strfry (Nostr relay)
- Optional profiles: `--profile signal` (signal-cli sidecar), `--profile telephony` (Kamailio + CoTURN), `--profile inference` (LLM firehose agent), `--profile monitoring` (Prometheus + Grafana)
- `docker-compose.dev.yml` for local development with file watching
- `docker-compose.production.yml` overlay for production hardening

### Kubernetes (Helm)

- Production Helm chart with configurable replicas
- Health probes: `/health/ready` and `/health/live`
- Prometheus ServiceMonitor for metrics scraping
- Caddyfile.production with HSTS, CSP, and security headers
- Ansible preflight + smoke-check playbooks for pre-deployment validation

### Co-op Cloud

- Recipe for Co-op Cloud deployments
- Built for worker co-ops and community organizations that run their own infrastructure

### Cloudflare Tunnels

- Ingress via Cloudflare Tunnels — no open inbound ports required
- Compatible with self-hosted servers behind NAT
- EU/GDPR-compatible data residency when combined with EU-hosted VPS

### GDPR Compliance

- Data stored only on your servers (or EU-based VPS)
- Right to erasure: admin can purge caller records, notes, and logs
- GDPR-compliant encrypted data export
- No third-party analytics or tracking on the application itself

---

## Signal Notification Sidecar

`signal-notifier/` runs on port 3100 as a separate process. It is **zero-knowledge**: contacts are resolved via HMAC-hashed identifiers — the sidecar never stores plaintext phone numbers. Shared `SIGNAL_NOTIFIER_BEARER_TOKEN` authenticates the main app to the sidecar.

---

## Protocol & Codegen

All types flow from a single source of truth:

- **Zod schemas** in `packages/protocol/schemas/` define all API and wire types
- **Codegen** (`bun run codegen`) generates Swift Codable structs, Kotlin `@Serializable` data classes, and an OpenAPI snapshot
- **Crypto labels** in `packages/protocol/crypto-labels.json` (57 constants) generate to TypeScript, Swift, and Kotlin — no raw strings in crypto code
- **i18n codegen** (`bun run i18n:codegen`) generates iOS `.strings`, Android `strings.xml`, and Kotlin `I18n.kt` from JSON locale files

This means a schema or protocol change ripples automatically to all three platforms.
