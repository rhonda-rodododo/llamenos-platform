# Next Backlog

## High Priority (Pre-Launch)
- [x] Set up Cloudflare Tunnel for local dev with telephony webhooks (`scripts/dev-tunnel.sh`)
- [x] Configure production wrangler secrets (TWILIO_*, ADMIN_PUBKEY) — deployed and running
- [ ] Test full call flow end-to-end: incoming call -> CAPTCHA -> parallel ring -> answer -> notes -> hang up *(requires real phone + telephony account)*

## Security Audit Findings (2026-02-12, Round 4)

### Fixed (committed ddc95ec)
- [x] **CRITICAL**: Vonage webhook validation was `return true` — now HMAC-SHA256
- [x] **CRITICAL**: Caller phone hash leaked in spam report WS response
- [x] **HIGH**: Mass assignment — volunteer self-update now restricted to safe fields allowlist
- [x] **HIGH**: SSRF in provider test — ARI URL validation, internal IP blocking, fetch timeout
- [x] **HIGH**: ~~WebSocket flooding~~ — WebSocket removed; Nostr relay rate limiting replaces
- [x] **HIGH**: ~~WebSocket prototype pollution~~ — WebSocket removed; no longer applicable
- [x] **HIGH**: Weak KDF — upgraded SHA-256 concat to HKDF-SHA256 for note encryption
- [x] **HIGH**: Security headers — COOP, no-referrer, expanded CSP and Permissions-Policy

### Fixed (Round 4 medium, 6d3deac)
- [x] Session token revocation: logout API + server-side session delete
- [x] WebSocket call authorization: verify call state + volunteer ownership for answer/hangup/spam
- [x] Invite code rate limit: reduced from 10 to 5 per minute
- [x] Custom field label/option length validation: 200 char max
- [x] Presence broadcast: volunteers get `{ hasAvailable }` only, admins get full counts
- [ ] Encrypt/hash note metadata (callId, authorPubkey) to prevent correlation analysis — *trade-off: breaks server-side filtering/grouping; notes content is already E2EE*

## Security Audit Findings (2026-02-17, Round 5 — Epic 53)

### Fixed — CRITICAL
- [x] Login endpoint did not verify Schnorr signature — anyone knowing pubkey could enumerate roles
- [x] CAPTCHA expected digits stored in URL query params — attacker could see/modify; bypasses CAPTCHA
- [x] `Math.random()` used for CAPTCHA generation — predictable, not CSPRNG

### Fixed — HIGH
- [x] Invite redemption accepted arbitrary pubkey — no proof of private key ownership
- [x] Upload chunk/status endpoints had no ownership check
- [x] Sessions not revoked on volunteer deactivation/deletion
- [x] Plaintext nsec in onboarding backup — now encrypted with PBKDF2 + XChaCha20-Poly1305
- [x] HKDF called without salt for note encryption — added fixed application salt
- [x] Static PBKDF2 salt for recovery key derivation — now per-backup random salt
- [x] TwiML XML injection via HOTLINE_NAME — added `escapeXml()` function

### Fixed — MEDIUM
- [x] No rate limiting on WebAuthn login flow — added IP-based 10/min
- [x] CORS missing `Vary: Origin` header — cache poisoning risk
- [x] Reporter role could create/edit call notes — added role guard
- [x] WebAuthn userVerification "preferred" → "required"
- [x] IP hash truncated to 64 bits — increased to 96 bits
- [x] Asterisk webhook validation used `===` (non-constant-time) — now XOR comparison
- [x] Asterisk webhook had no timestamp replay protection — added 5-min window
- [x] Asterisk bridge bound to 0.0.0.0 — bound to 127.0.0.1

### Low / Future
- [x] Add auto-lock/panic-wipe mechanism for device seizure scenarios (triple-Escape trigger)
- [x] SRI hashes for PWA service worker cached assets (`sri-workbox-plugin.ts`)
- [x] Consider re-auth step-up for sensitive actions — PIN challenge dialog for phone unmask
- [ ] Auth token nonce-based replay protection *(accepted trade-off: mitigated by HTTPS + Schnorr + 5-min window + method/path binding)*

## Security Audit Findings (2026-02-23, Round 6)

Full report: [`docs/security/SECURITY_AUDIT_2026-02-R6.md`](security/SECURITY_AUDIT_2026-02-R6.md)
Threat model: [`docs/security/THREAT_MODEL.md`](security/THREAT_MODEL.md)
Deployment guide: [`docs/security/DEPLOYMENT_HARDENING.md`](security/DEPLOYMENT_HARDENING.md)

### Critical — Epic 64
- [x] ~~**C-1**: Caller phone number broadcast to ALL volunteers~~ — VERIFIED NOT VULNERABLE (already hashed + redacted server-side)
- [x] **C-2**: `codeql-action` uses mutable `@v3` tag — pinned to SHA
- [x] **C-3**: `git-cliff` binary downloaded without SHA256 verification — checksum added

### High — Epic 64
- [x] **H-1**: V1 legacy encryption still callable (no forward secrecy) — removed `encryptNote` export
- [x] **H-2**: Dev reset endpoints rely solely on `ENVIRONMENT` var — added `DEV_RESET_SECRET` secondary gate
- [x] **H-3**: Hub telephony provider config stored without validation — validation added
- [x] **H-4**: Demo nsec values compiled into all production bundles — dynamic import, code-split chunk
- [x] **H-5**: Docker Stage 3 resolves deps without lockfile — switched to bun with `--frozen-lockfile`
- [x] **H-6**: Asterisk `ARI_PASSWORD` has no required override in compose — added `:?` required syntax

### Medium — Epic 65
- [x] **M-1**: SSRF blocklist incomplete (IPv6, CGNAT, mapped addresses) — expanded blocklist with proper CIDR matching
- [x] **M-2**: `/calls/active` and `/calls/today-count` missing permission guards — added
- [x] **M-3**: `isAdmin` query param on internal DO API — replaced with dedicated `/admin/volunteers/:pubkey` DO route
- [x] **M-4**: Missing security headers in Worker — added CORP and X-Permitted-Cross-Domain-Policies
- [x] **M-5**: Phone hashing with bare SHA-256 — upgraded hashPhone/hashIP to HMAC-SHA256 with HMAC_SECRET env var, threaded through all adapters/routes/DOs
- [x] **M-6**: Backup filename leaks pubkey fragment — now uses random suffix
- [x] **M-7**: File metadata ECIES uses wrong context string — fixed to `llamenos:file-metadata`
- [x] **M-8**: No JS dependency vulnerability scanning in CI — added `bun audit --audit-level=high` job gating releases
- [x] **M-9**: Floating Docker base image tags — pinned all images to SHA256 digests (Dockerfile, compose, Helm)
- [x] **M-10**: Helm NetworkPolicy missing PostgreSQL egress rule — added conditional TCP egress for postgres.port

### Low — Epic 67
- [x] **L-1**: `adminPubkey` in public config — moved to authenticated `/api/auth/me` response
- [x] **L-2**: Phone numbers unmasked in invite list and delete dialogs — applied `maskedPhone()` pattern
- [x] **L-3**: `keyPair.secretKey` propagated through React state — removed from auth context, all consumers use `keyManager.getSecretKey()` at point of use
- [x] **L-4**: Schnorr tokens not bound to request path — tokens now include method+path in signed message
- [x] **L-5**: Rate limiter off-by-one (`>` vs `>=`) — fixed
- [x] **L-6**: Shift time format not validated — added HH:MM regex validation
- [x] **L-7**: Document CSP `style-src 'unsafe-inline'` trade-off — added explanatory comment
- [x] **L-8**: Reduce Playwright trace artifact retention to 1 day — done
- [x] **L-9**: Add panic-wipe mechanism for device seizure (triple-Escape trigger + full wipe)
- [x] **L-10**: SRI hashes for service worker cached assets (Vite closeBundle plugin)

## Deployment Hardening Tooling — Epic 66
- [x] Ansible playbook for VPS hardening (SSH, firewall, kernel, Docker, fail2ban)
- [x] Ansible playbook for application deployment (docker-compose, secrets, health check)
- [x] Ansible playbook for updates and rollbacks
- [x] Ansible playbook for encrypted backups
- [x] OpenTofu module for Hetzner VPS provisioning (optional)
- [x] Quick start guide for first-time operators (`docs/QUICKSTART.md`)
- [x] Operator runbook (secret rotation, incident response, backup recovery) (`docs/RUNBOOK.md`)
- [x] Updated DEPLOYMENT_HARDENING.md with Ansible tooling cross-references

## Multi-Provider Telephony (Epics 32–36) — COMPLETE
- [x] Epic 32: Provider Configuration System (admin UI, API, DO storage, connection test)
- [x] Epic 33: Cloud Provider Adapters (SignalWire extends TwilioAdapter, Vonage, Plivo)
- [x] Epic 34: WebRTC Volunteer Calling (in-browser call answer, provider-specific SDKs)
- [x] Epic 35: Asterisk ARI Adapter (self-hosted SIP, ARI bridge service)
- [x] Epic 36: Telephony Documentation (provider comparison, setup guides, in-app help)

## Multi-Channel Messaging & Reporter Role (Epics 42–47) — COMPLETE
- [x] Epic 42: Messaging Architecture & Threaded Conversations
- [x] Epic 43: Admin Setup Wizard
- [x] Epic 44: SMS Channel
- [x] Epic 45: WhatsApp Business Channel
- [x] Epic 46: Signal Channel
- [x] Epic 47: Reporter Role & Encrypted File Uploads
- [x] In-App Guidance: Help page, FAQ, Getting Started checklist, command palette integration

## Multi-Platform Deployment (Epic 55) — COMPLETE
- [x] Platform abstraction layer (`src/platform/`) — interfaces for StorageApi, BlobStorage, TranscriptionService
- [x] Node.js DurableObject shim with PostgreSQL-backed storage (postgres.js, advisory locks)
- [x] WebSocketPair polyfill for Node.js (EventEmitter-based connected shim sockets)
- [x] Refactored Env interface with structural typing (DOStub, DONamespace, BlobStorage, TranscriptionService)
- [x] esbuild Node.js build with `cloudflare:workers` → `src/platform/index.ts` alias
- [x] Docker infrastructure (Dockerfile, docker-compose.yml with PostgreSQL, Caddyfile, .env.example)
- [x] Helm chart for Kubernetes (app, PostgreSQL, MinIO, Whisper, optional Asterisk/Signal)
- [x] CI/CD GitHub Actions workflow for Docker image builds (GHCR)
- [x] Health check endpoint (`/api/health`)
- [x] PostgreSQL replaces SQLite — enables multi-replica RollingUpdate in Kubernetes

## Demo Mode (Epic 58) — COMPLETE
- [x] Epic 58: Demo mode — setup wizard opt-in, client-side seeding, one-click demo login, demo banner

## Storage Migrations (Epic 59) — COMPLETE
- [x] Epic 59: Unified data migration framework — migrations written against StorageApi, run on both CF DOs and PostgreSQL, version tracking per namespace, automatic execution at startup/first access

## UI Polish (Epics 56–57) — COMPLETE
- [x] Epic 56: Page consistency & visual refinement (conversations heading, reports empty state, volunteer phone display, login file picker, dashboard stat cards)
- [x] Epic 57: Admin UX improvements (audit log filtering, admin settings status summaries)

## Permission-Based Access Control & Multi-Hub (Epics 60–63)
- [x] Epic 60: Permission-Based Access Control — dynamic roles, permission catalog, multi-role users, role manager UI
- [x] Epic 61: Multi-Hub Architecture — hub isolation, per-hub DOs, hub-scoped roles, hub switcher UI, hub management admin page, telephony/messaging/WebSocket hub routing
- [x] Epic 62: Message Blasts — subscriber management, broadcast messaging, scheduled sends, opt-in/opt-out compliance
- [x] Epic 63: RCS Channel — Google RBM API adapter, rich cards, suggested replies, SMS fallback

## Zero-Knowledge Architecture (Epics 74–79)

Full E2EE transformation to Signal-level privacy. Clean rewrite — no migration, no feature flags (pre-production).

Architecture overview: [`docs/architecture/E2EE_ARCHITECTURE.md`](architecture/E2EE_ARCHITECTURE.md)

**Dependency graph:** 76.0 → 76.1 / 76.2 → 76 → 74 / 75 / 77 → 78 / 79

### Pre-Implementation Foundations — COMPLETE
- [x] **[Epic 76.0: Security Foundations](epics/epic-76.0-security-foundations.md)** — Domain separation label audit, provisioning SAS verification fix, crypto-labels.ts
- [x] **[Epic 76.1: Worker-Relay Communication](epics/epic-76.1-worker-relay-communication.md)** — NostrPublisher interface, CF/Node implementations, server keypair, relay infrastructure
- [x] **[Epic 76.2: Key Architecture Redesign](epics/epic-76.2-key-architecture-redesign.md)** — Hub key = random 32 bytes ECIES-wrapped per member, multi-admin envelopes, hub key manager

### Foundation Layer — COMPLETE
- [x] **[Epic 76: Nostr Relay Real-Time Sync](epics/epic-76-nostr-relay-sync.md)** — Complete WS removal, Nostr-only real-time broadcasts, ephemeral kind 20001 events

### Data Encryption Layer — COMPLETE
- [x] **[Epic 74: E2EE Messaging Storage](epics/epic-74-e2ee-messaging-storage.md)** — Envelope encryption: per-message random key, ECIES envelopes for volunteer + admin
- [x] **[Epic 77: Metadata Encryption](epics/epic-77-metadata-encryption.md)** — Per-record DO storage keys, encrypted call history, hash-chained audit log

### Client Privacy Layer
- [ ] **[Epic 75: Native Call-Receiving Clients](epics/epic-75-native-call-clients.md)** — Tauri desktop (macOS/Windows), React Native mobile (iOS/Android). Separate repos. *In progress — scaffolding complete.*
- [x] **[Epic 78: Client-Side Transcription](epics/epic-78-client-side-transcription.md)** — @huggingface/transformers ONNX Whisper in browser, AudioWorklet ring buffer, Web Worker isolation, settings UI, auto-save encrypted transcript on hangup

### Desktop Security & Native Crypto
- [x] **[Epic 80: Desktop Security Hardening](epics/epic-80-desktop-security.md)** — Tauri isolation pattern, Stronghold PBKDF2, CSP hardening, IPC allowlist, CryptoState memory protection, reproducible builds, single instance
- [~] **[Epic 81: Native Crypto Migration](epics/epic-81-native-crypto.md)** — Phases 1-5 complete (platform abstraction, all route/component crypto migrated to platform.ts). Phases 6-7 (WASM build for browser, cross-platform test vectors) deferred to post-launch.

### Trust Verification — COMPLETE
- [x] **[Epic 79: Reproducible Builds](epics/epic-79-reproducible-builds.md)** — Deterministic build config, Dockerfile.build, verify-build.sh, CHECKSUMS.txt in GitHub Releases, SLSA provenance

## Multi-Platform Native Clients (Epics 82–90)

Desktop (Tauri v2) and mobile (React Native/Expo 55) clients. Ordered by dependency:

### Desktop Verification & Distribution
- [x] **[Epic 82: Desktop Route Verification](epics/epic-82-desktop-route-verification.md)** — Fixed Tauri capabilities, CSP hardening, platform.ts PIN encrypt/decrypt flow
- [x] **[Epic 87: Desktop Auto-Updater & Distribution](epics/epic-87-desktop-auto-updater.md)** — Ed25519 signed updates, CI builds (macOS/Windows/Linux), Apple notarization, GitHub Releases manifest, self-hosted endpoint support

### Mobile Foundation & Auth
- [x] **[Epic 83: Mobile Foundation](epics/epic-83-mobile-foundation.md)** — Full crypto layer, auth flow, NativeWind 4, Zustand/MMKV, React Query, Nostr relay, i18n, tab navigator

### Mobile Core Screens
- [x] **[Epic 84: Mobile Core Screens](epics/epic-84-mobile-core-screens.md)** — Dashboard, calls, notes (E2EE), shifts, settings, call screen with note editor
- [x] **[Epic 85: Mobile Admin & Messaging](epics/epic-85-mobile-admin-messaging.md)** — Admin screens (volunteers, bans, audit, settings), threaded E2EE messaging, role guards

### Mobile Platform Features
- [x] **[Epic 86: Mobile Push Notifications](epics/epic-86-mobile-push-notifications.md)** — APNs/FCM via Expo Notifications, two-tier encryption (wake key + pubkey), notification categories, iOS CallKit evaluation
- [x] **[Epic 89: Mobile UI Polish & Accessibility](epics/epic-89-mobile-ui-polish.md)** — Dark mode, haptic feedback, VoiceOver/TalkBack a11y, loading skeletons, error boundaries, offline handling, 13 locale verification

### Native VoIP Calling
- [x] **[Epic 91: Native VoIP Calling](epics/epic-91-native-voip-calling.md)** — Linphone SDK Expo Module, provider-agnostic SIP, CallKit (iOS) + ConnectionService (Android), VoIP push, SRTP/ZRTP encryption, all 5 telephony providers

### Cross-Platform Testing & Native Crypto
- [x] **[Epic 88: Desktop & Mobile E2E Tests](epics/epic-88-platform-e2e-tests.md)** — WebdriverIO + tauri-driver for desktop, Detox for mobile, CI integration
- [x] **[Epic 90: UniFFI Bindings for llamenos-core](epics/epic-90-uniffi-bindings.md)** — `#[uniffi::export]` annotations, Swift/Kotlin bindings, React Native native module, mobile crypto migration from JS to Rust

## Release Pipeline & Distribution (Epics 96–99) — COMPLETE
- [x] **[Epic 96: llamenos-core CI/CD Pipeline](epics/epic-96-core-ci.md)** — cargo test + clippy on every push/PR, tagged releases with native libs + WASM + UniFFI bindings
- [x] **[Epic 97: Desktop Release Pipeline](epics/epic-97-desktop-release.md)** — tauri-release.yml on v* tags, Flatpak build, updater feature flag, version sync from tag
- [x] **[Epic 98: Download Experience](epics/epic-98-download-experience.md)** — /download page with OS detection, platform cards, i18n (13 langs), hero CTA update
- [x] **[Epic 99: Human Setup Guide](epics/epic-99-human-setup.md)** — HUMAN_INSTRUCTIONS.md with signing keys, certificates, secrets checklist

## Multi-Platform Completion & Release Readiness (Epics 100-110) — COMPLETE
- [x] **[Epic 100: llamenos-core Mobile Build](epics/epic-100-core-mobile-build.md)** — build-mobile.sh, CI release workflow, rust-toolchain.toml with mobile targets
- [x] **[Epic 101: Mobile Native Integration](epics/epic-101-mobile-native-integration.md)** — iOS podspec, download-core-libs.sh, vendored XCFramework setup
- [x] **[Epic 102: Mobile Build Pipeline](epics/epic-102-mobile-build-pipeline.md)** — mobile-build.yml CI, APK + iOS sim .app on tags, eas.json
- [x] **[Epic 103: Mobile Feature Completion](epics/epic-103-mobile-feature-completion.md)** — 5 admin settings sections, 14+ API client methods, volunteer CRUD wired
- [x] **[Epic 104: Mobile E2E Expansion](epics/epic-104-mobile-e2e-expansion.md)** — 6 new Detox test files, expanded auth/notes, CI fixes
- [x] **[Epic 105: Cross-Platform Crypto](epics/epic-105-cross-platform-crypto.md)** — Rust interop tests, JSON test vectors, Playwright consumer, label sync (28 labels)
- [x] **[Epic 106: Mobile UX Refinements](epics/epic-106-mobile-ux-refinements.md)** — Deep links, keyboard handling, skeletons, accessibility, haptic pull-to-refresh
- [x] **[Epic 107: Security Hardening](epics/epic-107-security-hardening.md)** — Jailbreak/root detection, HTTPS enforcement, emulator detection
- [x] **[Epic 108: Version Sync & Tooling](epics/epic-108-version-sync-tooling.md)** — bump-version.ts rewrite, sync-versions.sh, dev-setup.sh (all repos)
- [x] **[Epic 109: Desktop Polish](epics/epic-109-desktop-polish.md)** — Version sync to 0.18.0, tray menu enhancements
- [x] **[Epic 110: Documentation](epics/epic-110-documentation.md)** — CONTRIBUTING.md, ARCHITECTURE.md, build guides, HUMAN_INSTRUCTIONS mobile sections

## Low Priority (Post-Launch)
- [x] Add call recording playback in notes view (on-demand fetch from telephony provider)
- [x] Marketing site + docs at llamenos-hotline.com (Astro + Cloudflare Pages)
