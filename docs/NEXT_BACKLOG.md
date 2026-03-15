# Next Backlog

## BDD Workflow Overhaul (Epics 301-303) ✅ COMPLETED
- [x] **Epic 301**: BDD Spec Reorganization + Backend BDD Suite — reorganize 94 feature files into behavior-focused tiers, rewrite 34 shallow tests, create backend BDD suite, wire into orchestrator
- [x] **Epic 302**: Skills & Documentation Overhaul — update 5 skills + CLAUDE.md + MEMORY.md for BDD-first phased workflow, replace multi-platform-test-recovery with bdd-feature-development
- [x] **Epic 303**: Integration Verification — full test suite validation, platform compatibility checks, dry-run phased workflow

## i18n Overhaul (Epics 274-275) ✅ COMPLETED
- [x] **Epic 274**: Canonicalize en.json source of truth — removed 52 duplicates, standardized camelCase, codegen converts camelCase→snake_case
- [x] **Epic 275**: Align mobile i18n references — updated all iOS/Android string keys to match codegen output

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

## Security Audit Findings (2026-03-04, Round 7)

### Fixed — Epics 252-256
- [x] **[Epic 252: Nostr Hub-Key Encryption](epics/epic-252-nostr-hub-key-encryption.md)** — Encrypt all Nostr relay events with XChaCha20-Poly1305 via HKDF(SERVER_NOSTR_SECRET), expose serverEventKeyHex to authenticated clients
- [x] **[Epic 253: Invite Role Authorization](epics/epic-253-invite-role-authorization.md)** — Validate that invite creators have all permissions in assigned roles (prevent privilege escalation)
- [x] **[Epic 254: Remove Auth Token Fallback](epics/epic-254-remove-auth-token-fallback.md)** — Remove unbound Schnorr token acceptance; require method+path binding
- [x] **[Epic 255: Encrypt Contact Identifiers](epics/epic-255-encrypt-contact-identifiers.md)** — Encrypt phone/email at rest in ConversationDO with HKDF+XChaCha20-Poly1305, lazy migration for legacy plaintext
- [x] **[Epic 256: Fix BlastDO HMAC Keys](epics/epic-256-blast-hmac-key-fix.md)** — Use HMAC_SECRET instead of public constant for preference tokens and subscriber hashing

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

## CI Hardening, Test Vectors, Docs & Quality (Epics 111-118)
- [x] **[Epic 111: CI Security Hardening](epics/epic-111-ci-security-hardening.md)** — Pin actions to SHA, standardize Bun 1.3.5, PR triggers, dependabot
- [x] **[Epic 112: Comprehensive Crypto Test Vectors](epics/epic-112-crypto-test-vectors.md)** — Expanded to 14 operation categories + adversarial vectors, 24 JS interop tests, critical Schnorr prehash bug fixed
- [x] **[Epic 113: Mobile Crypto Interop](epics/epic-113-mobile-crypto-interop.md)** — 23 Jest unit tests validating mobile JS crypto against Rust vectors
- [x] **[Epic 114: Docs Site — Mobile & Missing Pages](epics/epic-114-docs-mobile-pages.md)** — Mobile guide, architecture overview, troubleshooting (3 new docs + route pages)
- [x] **[Epic 115: Docs Site — i18n Completion](epics/epic-115-docs-i18n.md)** — 132 translation files: 21 docs + 2 pages × 12 languages
- [x] **[Epic 116: Cross-Repo CI Integration](epics/epic-116-cross-repo-ci.md)** — repository_dispatch from llamenos-core to downstream repos on main push
- [x] **[Epic 117: Adversarial Crypto Tests](epics/epic-117-adversarial-crypto.md)** — 10 new Rust adversarial tests + 7 JS adversarial interop tests
- [x] **[Epic 118: Docs Site — API Reference](epics/epic-118-api-reference.md)** — Complete 1680-line REST API reference + CHANGELOG.md

## Unified Records Architecture (Epics 119-124) — COMPLETE
- [x] **[Epic 119: Records Domain Consolidation](epics/epic-119-records-domain-consolidation.md)** — Fix report type filtering bug (CRITICAL), extract shared ConversationThread, DRY up utilities
- [x] **[Epic 120: Unified Envelope Types](epics/epic-120-unified-envelope-types.md)** — Single `RecipientEnvelope` type for notes + messages, standardize naming
- [x] **[Epic 121: Custom Fields Generalization](epics/epic-121-custom-fields-generalization.md)** — Report custom fields UI, file attachment field type, shared components
- [x] **[Epic 122: Conversation Storage Scaling](epics/epic-122-conversation-storage-scaling.md)** — Per-record keys, BlastDO extraction, pagination, auto-migration
- [x] **[Epic 123: Conversation Notes](epics/epic-123-conversation-notes.md)** — Attach E2EE notes to conversations/reports, NoteEditor/NoteCard shared components
- [x] **[Epic 124: Records E2E Tests](epics/epic-124-records-e2e-tests.md)** — 13+ new E2E tests: report isolation, shared thread, custom fields, conversation notes, blast DO, pagination

## Mobile Records Architecture (Epics 125-128) — COMPLETE
- [x] **[Epic 125: Mobile Note Threading](epics/epic-125-mobile-note-threading.md)** — Update types/API to match desktop, add reply button + thread expansion + encrypted reply sending
- [x] **[Epic 126: Mobile Contacts Page](epics/epic-126-mobile-contacts-page.md)** — Admin-only contacts list + unified timeline detail in admin stack
- [x] **[Epic 127: Mobile Conversation Notes](epics/epic-127-mobile-conversation-notes.md)** — Note form modal from conversation thread, custom field context filtering
- [x] **[Epic 128: Mobile Records i18n & Detox Tests](epics/epic-128-mobile-records-tests.md)** — Translation keys for 13 locales, Detox E2E tests for all new features

## Monorepo Restructuring & Native Mobile (Epics 200-210)

### Foundation (Batch 1) — COMPLETE
- [x] **[Epic 200: Monorepo Foundation](epics/epic-200-monorepo-foundation.md)** — Directory restructure, import alias migration, config updates
- [x] **[Epic 201: Absorb llamenos-core](epics/epic-201-absorb-llamenos-core.md)** — git subtree add, path dep update, CI cleanup

### Packages & CI (Batch 2) — COMPLETE
- [x] **[Epic 202: Protocol Schema & Codegen](epics/epic-202-protocol-schema-codegen.md)** — JSON Schema definitions, quicktype-core codegen for TS/Swift/Kotlin
- [x] **[Epic 203: Workers Restructuring](epics/epic-203-workers-restructuring.md)** — Worker package boundary, wrangler config move
- [x] **[Epic 204: CI/CD Consolidation](epics/epic-204-cicd-consolidation.md)** — crypto-tests job, ci-status gate
- [x] **[Epic 205: i18n Package Extraction](epics/epic-205-i18n-package-extraction.md)** — Locale package with mobile codegen

### Native Mobile Foundation (Batch 3) — COMPLETE
- [x] **[Epic 206: iOS Client Foundation](epics/epic-206-ios-client-foundation.md)** — SwiftUI app with crypto, keychain, auth flow
- [x] **[Epic 207: Android Client Foundation](epics/epic-207-android-client-foundation.md)** — Kotlin/Compose app with crypto, keystore, auth flow

### Feature Parity & Release (Batch 4) — COMPLETE
- [x] **[Epic 208: Feature Parity Phase 1](epics/epic-208-feature-parity-p1.md)** — Dashboard, notes (E2EE), shifts, push notifications
- [x] **[Epic 209: Feature Parity Phase 2](epics/epic-209-feature-parity-p2.md)** — Voice calls, conversations, admin, device linking
- [x] **[Epic 210: Release Prep](epics/epic-210-release-prep.md)** — Store listings, signing, CI/CD, docs update

## Production Readiness & Quality (Epics 211-214) — COMPLETE

### Testing & CI
- [x] **[Epic 211: Mobile CI Testing Pipeline](epics/epic-211-mobile-ci-testing.md)** — Android + iOS build/test jobs in ci.yml, ci-status gate update
- [x] **[Epic 212: Test Coverage Enhancement](epics/epic-212-test-coverage-enhancement.md)** — 74 Android unit tests (AuthViewModel, Models, Shifts, RetryInterceptor), KeyValueStore testability refactor

### Hardening & Crypto
- [x] **[Epic 213: Production Hardening](epics/epic-213-production-hardening.md)** — RetryInterceptor with exponential backoff, NetworkMonitor + OfflineBanner, CrashReporter with local storage
- [x] **[Epic 214: Mobile Crypto Integration](epics/epic-214-mobile-crypto-integration.md)** — UniFFI linking for real Rust crypto on iOS and Android (replace stand-ins)

### Documentation
- [x] **[Epic 215: Documentation Update](epics/epic-215-documentation-update.md)** — CLAUDE.md monorepo structure, mobile dev/test commands, working style updates

## Testing Infrastructure (Epics 216+)

### Playwright Restoration
- [x] **[Epic 216: Playwright Test Restoration](epics/epic-216-playwright-test-restoration.md)** — Restore 361 E2E tests (361 passed, 5 skipped) on desktop branch

## Cross-Platform BDD E2E Test Suite (Epics 218-222) — COMPLETE

Shared Gherkin specs in `packages/test-specs/` driving Android (Compose UI Test) and iOS (XCUITest) E2E tests. Uses Gherkin-as-Specification approach with CI validation.

### Framework — COMPLETE
- [x] **[Epic 218: Cross-Platform BDD Test Framework](epics/epic-218-bdd-test-framework.md)** — `packages/test-specs/` structure, Gherkin conventions, CI validation script, `TestNavigationHelper` extraction

### Mobile E2E Specs & Implementation — COMPLETE
- [x] **[Epic 219: Auth Flow BDD Specs](epics/epic-219-auth-flow-bdd.md)** — 5 feature files (login, onboarding, PIN setup/unlock, key import), 24 scenarios
- [x] **[Epic 220: Core Features BDD Specs](epics/epic-220-core-features-bdd.md)** — 10 feature files (dashboard, notes, conversations, shifts, navigation), 34 scenarios
- [x] **[Epic 221: Admin, Settings & Access Control BDD Specs](epics/epic-221-admin-settings-bdd.md)** — 6 feature files (settings, lock/logout, device link, admin nav/tabs, access control), 27 scenarios
- [x] **[Epic 222: Crypto Interop E2E Verification](epics/epic-222-crypto-e2e-verification.md)** — 4 feature files (keypair gen, PIN encryption, auth tokens, crypto interop with test vectors), 21 scenarios

**Total: 25 feature files, 102 scenarios, 106 @Test methods** (up from 31 existing tests)

## Cross-Platform BDD Runner Integration (Epics 223-227) — COMPLETE

Refactor all three platforms to use real BDD runners driven by shared `.feature` files. Android uses cucumber-android, Desktop uses playwright-bdd, iOS uses Gherkin-as-Specification with XCTContext.

### Abstraction Layer
- [x] **[Epic 223: Cross-Platform BDD Specification Framework](epics/epic-223-cross-platform-bdd-abstraction.md)** — Platform tag system, shared step vocabulary, multi-platform validate-coverage.ts

### Platform Migrations
- [x] **[Epic 224: Android Cucumber-Android Migration](epics/epic-224-android-cucumber-migration.md)** — cucumber-android 7.18.1 + Hilt, step definitions replace test classes
- [x] **[Epic 225: Desktop BDD Feature Specifications](epics/epic-225-desktop-bdd-feature-specs.md)** — 48 feature files (23 cross-platform + 7 desktop-only), 260 desktop scenarios
- [x] **[Epic 226: Playwright-BDD Integration](epics/epic-226-playwright-bdd-integration.md)** — playwright-bdd v8.4.2, 26 step files, 607 step definitions, 224 BDD tests

### iOS Preparation
- [x] **[Epic 227: iOS BDD E2E Foundation](epics/epic-227-ios-bdd-e2e-foundation.md)** — XCUITest with BDD naming, XCTContext.runActivity for Given/When/Then, validate-coverage.ts extension

**Dependency order:** 223 → (224 | 225 | 226) → 227

## Android BDD Feature Implementation (Epics 228-230) — COMPLETE

Implement Android step definitions and UI to fully cover all BDD feature file scenarios.

### Step Definitions
- [x] **[Epic 228: Android BDD Step Definitions](epics/epic-228-android-bdd-step-definitions.md)** — 498 step definitions across 26 step classes covering all @android feature scenarios (12 new files, 7 modified)

### UI Implementation
- [x] **Epic 229: Android Admin Panel Expansion** — Conversation actions (search, assign, close/reopen), admin shift scheduling CRUD tab, volunteer CRUD, audit log filters, ban list, custom fields, invites
- [x] **Epic 230: Android Settings & Polish** — Collapsible settings sections, profile editing, theme picker, blasts screen, demo mode login buttons + banner, panic wipe hardware key trigger, all BDD step stubs replaced

**Dependency order:** 228 → (229 | 230)

## E2E Test Coverage Consolidation (Epics 231-234) — COMPLETE

DRY up the cross-platform BDD test suite: consolidate shared specs, migrate desktop from .spec.ts to BDD, add Worker backend tests, expand iOS coverage.

### Shared & Desktop
- [x] **[Epic 231: Shared BDD Spec Consolidation](epics/epic-231-shared-bdd-spec-consolidation.md)** — Promote 5 Android-only features to shared, expand roles (+19), messaging (+9), device-link (+4), help (+4), multi-hub (+1) scenarios, tag audit
- [x] **[Epic 232: Desktop Spec-to-BDD Migration](epics/epic-232-desktop-spec-to-bdd-migration.md)** — Delete 31 redundant .spec.ts files, create 13 new step definition files + 4 new feature files, keep 7 infrastructure specs

### Backend
- [x] **[Epic 233: Worker Backend Test Suite](epics/epic-233-worker-backend-test-suite.md)** — Vitest unit tests (295 passing), 8 backend BDD feature files, 6 integration test stubs, CI workflow updated

### iOS
- [x] **[Epic 234: iOS BDD Test Expansion](epics/epic-234-ios-bdd-test-expansion.md)** — 126 test methods across 10 test files, crypto interop with test vectors, BDD-aligned UI tests

**Dependency order:** 231 ✓ → 232 ✓ | 233 ✓ | 234 (unblocked)

## Production Deployment & Node.js Primacy (Epics 235-237)

Architecture audit (2026-03-03) identified that Node.js + PostgreSQL is the real production path, but CF Workers is still treated as primary in docs/tests. Also, the Mac M4 unblocks iOS builds.

### Node.js E2E & Documentation — COMPLETE
- [x] **[Epic 235: Node.js Platform E2E Test Parity](epics/epic-235-nodejs-e2e-test-parity.md)** — 79 Node.js integration tests (PostgreSQL storage, alarm poller, WebSocket shim, MinIO, migrations), playwright.docker.config.ts, e2e-node + integration-node CI jobs
- [x] **[Epic 236: Node.js Production Deployment Primacy & Infrastructure Hardening](epics/epic-236-production-deployment-primacy.md)** — Health endpoint with dependency checks (/health, /health/live, /health/ready), Helm MinIO→StatefulSet + HPA + PDB + ServiceMonitor (chart 0.2.0), Docker Compose rate limiting + JSON logging + first-run.sh, Ansible MinIO backup + restore test playbook, OpenTofu admin_ssh_cidrs variable, Prometheus /metrics endpoint, structured JSON logger, `bun run dev:node` local dev server, PRODUCTION_CHECKLIST.md

### iOS Build Pipeline (Mac M4) — COMPLETE
- [x] **[Epic 237: iOS Build Pipeline on Local Mac M4](epics/epic-237-ios-mac-m4-build-pipeline.md)** — scripts/ios-build.sh (status/setup/sync/build/test/xcframework/uitest/all), npm scripts
- [x] **[Epic 214-iOS: Link UniFFI XCFramework](epics/epic-214-mobile-crypto-integration.md)** — Package.swift binary target, CryptoService rewritten with real Rust FFI (10 functions), LlamenosCoreExtensions Codable conformance
- [x] **[Epic 227: iOS BDD E2E Foundation](epics/epic-227-ios-bdd-e2e-foundation.md)** — BaseUITest with BDD helpers (given/when/then/and), launch modes, navigation utilities, PIN helpers
- [x] **[Epic 234: iOS BDD Test Expansion](epics/epic-234-ios-bdd-test-expansion.md)** — 126 test methods across 10 test files (up from 76), DashboardUITests (12), SettingsUITests (16), SecurityUITests (5), 17 crypto interop tests with test vectors

**Dependency order:** 237 ✓ → 214-iOS ✓ → 227 ✓ → 234 ✓ | 235 ✓ | 236 ✓

## Desktop BDD Behavioral Recovery (Epics 247-251) — COMPLETE

Recover the ~400 behavioral tests lost in the Epic 232 BDD migration. Original .spec.ts files had 5,833 lines of deep behavioral tests (API verification, CRUD cycles, permission enforcement, serial state chains). Current step definitions are ~80% presence-only checks. Recovery uses BDD approach: expand feature files + rewrite step definitions.

### Admin & Infrastructure
- [x] **[Epic 247: Admin CRUD Behavioral Recovery](epics/epic-247-desktop-bdd-admin-crud.md)** — Volunteer, ban, shift CRUD with API verification. API helpers foundation.
- [x] **[Epic 248: Notes & Custom Fields Behavioral Recovery](epics/epic-248-desktop-bdd-notes-custom-fields.md)** — Note create/edit/save/verify, custom field CRUD + badge display, call ID grouping.

### RBAC & Permissions
- [x] **[Epic 249: RBAC & Permissions Behavioral Recovery](epics/epic-249-desktop-bdd-rbac-permissions.md)** — Role CRUD via API, cross-role permission enforcement (admin/volunteer/reporter/custom), multi-role union, wildcard permissions.

### Reports, Conversations & Audit
- [x] **[Epic 250: Reports, Conversations & Audit Behavioral Recovery](epics/epic-250-desktop-bdd-reports-conversations-audit.md)** — Report lifecycle (create→claim→close→filter), reporter role onboarding, audit log filtering/search, conversation assign/close/reopen.

### Settings & Auth Guards
- [x] **[Epic 251: Settings, Auth Guards & Desktop Flows](epics/epic-251-desktop-bdd-settings-auth-guards.md)** — Settings/theme/language persistence, auth guard enforcement, volunteer navigation restrictions, admin settings sections.

**Dependency order:** 247 (API helpers) → (248 | 249 | 250 | 251) in parallel

## iOS Feature Parity (Epics 240-246) — COMPLETE

Catch iOS up to Android feature set with native SwiftUI design. BDD-first: write XCUITest specs, then implement features to pass them. Tests hit live Docker API.

### Infrastructure
- [x] **[Epic 240: iOS Docker Test Infrastructure](epics/epic-240-ios-docker-test-infra.md)** — Connect XCUITests to live Docker Compose API backend (`--test-hub-url`, `resetServerState()`, identity registration)

### Core Features
- [x] **[Epic 241: iOS Reports](epics/epic-241-ios-reports.md)** — Full reports CRUD (create, list, detail, claim, close) with E2EE envelope encryption
- [x] **[Epic 242: iOS Help Screen](epics/epic-242-ios-help-screen.md)** — Security overview, role-based guides, FAQ with DisclosureGroup sections

### Admin Features
- [x] **[Epic 243: iOS Contacts & Timeline](epics/epic-243-ios-contacts-timeline.md)** — Admin-only contacts list with per-contact interaction timeline
- [x] **[Epic 244: iOS Admin Custom Fields](epics/epic-244-ios-admin-custom-fields.md)** — Custom fields management tab in admin panel (CRUD with field type picker)
- [x] **[Epic 245: iOS Blasts](epics/epic-245-ios-blasts.md)** — Admin broadcast messaging (compose, send/schedule to subscribers)

### Security
- [x] **[Epic 246: iOS Panic Wipe](epics/epic-246-ios-panic-wipe.md)** — Emergency data deletion in Settings with two-step confirmation

**Dependency order:** 240 → (241 | 242 | 243 | 244 | 245 | 246)

## Security Audit Findings (2026-03-05, Round 8)

63 findings (8 Critical, 22 High, 33 Medium). All platforms audited.

**Dependency order:** 264 → 263 → 259 → 258 → 257 → 262 → 260 → 261

### CI/CD & Supply Chain
- [x] **[Epic 264: CI/CD & Supply Chain Hardening](epics/epic-264.md)** — macOS keychain password, pin GitHub Actions + Docker images, bun audit threshold, Ansible SSH defaults

### Protocol & Schema
- [x] **[Epic 263: Protocol & Schema Hardening](epics/epic-263.md)** — Remove legacy auth fallback, NotePayload maxLength, hub slug pattern, blast mediaUrl HTTPS, i18n codegen escaping

### Crypto
- [x] **[Epic 259: Rust Crypto & KDF Hardening](epics/epic-259.md)** — BIP-340 interop, sk_bytes zeroization, ECIES HKDF v2 migration (breaking wire format), PBKDF2 32-byte salt, plaintext zeroization

### Worker
- [x] **[Epic 258: Worker Critical & High Security Fixes](epics/epic-258.md)** — serverEventKeyHex behind auth, DEMO_MODE=false production, webhook hostname bypass, rate limit validation, Vonage replay, bootstrap race
- [x] **[Epic 262: Worker Medium Security Fixes](epics/epic-262.md)** — Contact migration, provisioning rate limit, debug/setup gating, CORS allowlist, blast rate enforcement, upload size caps

### Desktop
- [x] **[Epic 257: Desktop Tauri & Frontend Security Hardening](epics/epic-257.md)** — Updater pubkey, remove stateless IPC, one-time provisioning token, PIN lockout in Rust, returnTo validation

### Mobile
- [x] **[Epic 260: iOS Security Hardening](epics/epic-260.md)** — Biometric unlock, SAS gate, URL validation, persistent PIN lockout (Keychain), cert pinning, screenshot protection
- [x] **[Epic 261: Android Security Hardening](epics/epic-261.md)** — Hard-fail crypto, PIN brute-force, deep link validation, StrongBox, cert pinning, ProGuard narrowing

## Tooling & Test Orchestration Overhaul (Epics 265-268) — COMPLETE

i18n alignment, codegen validation, BDD test orchestration, and Android tooling upgrade. Mac M4 now fully self-contained for all platforms.

**Dependency order:** 265 → 266 → 267 (268 can parallel with 266/267 after 265)

### i18n & Codegen
- [x] **[Epic 265: i18n Android String Alignment](epics/epic-265-i18n-android-string-alignment.md)** — Fixed 328 missing R.string refs (327 added to en.json, 1 Kotlin ref corrected), all 13 locales at 1562 keys
- [x] **[Epic 266: i18n Codegen Validation Enhancement](epics/epic-266-i18n-codegen-validation-enhancement.md)** — CI validators for Android/iOS/desktop string refs, generated Kotlin I18n constants (1761 keys)

### Test Orchestration
- [x] **[Epic 267: BDD Test Orchestration Overhaul](epics/epic-267-bdd-test-orchestration-overhaul.md)** — Unified codegen→build→test pipeline, cross-platform scripts, test:all/test:changed/test:feature commands

### Android Tooling
- [x] **[Epic 268: Android Tooling Upgrade](epics/epic-268-android-tooling-upgrade.md)** — AGP 9.1, Gradle 9.4, Kotlin 2.3, Compose BOM 2026.02, kapt→KSP, compileSdk 36

## iOS UX Overhaul — "Quiet Authority" Design System (Epics 269-273) — COMPLETE

Full visual and UX overhaul of the native iOS app. 5 epics covering design system foundation, auth flow, dashboard, feature screens, settings, and test updates.

**Dependency order:** 269 (foundation) → (270 | 271 | 272 | 273) in parallel

### Design System Foundation
- [x] **Epic 269: Design System Foundation** — BrandColors.swift (15 semantic colors + Asset Catalog), DM Sans typography, shared components (BrandCard, StatusDot, BadgeView, CopyableField, Banner, EmptyState, Avatar, StepIndicator), UINavigationBar + LoadingOverlay brand tinting

### Auth Flow
- [x] **Epic 270: Auth Flow Redesign** — LoginView with custom logo + encrypted tagline, async hub URL validation with connectivity check, PINPadView haptic refinement, ImportKeyView security note

### Dashboard & Tabs
- [x] **Epic 271: Dashboard & Tab Bar Overhaul** — Quick action cards (Calls, Notes, Help), shift status card, branded tab bar

### Feature Screens
- [x] **Epic 272: Feature Screens Polish** — Reports, Blasts, Contacts views with BrandCard styling, dashboard quick action accessibility identifiers

### Settings & Admin
- [x] **Epic 273: Settings, Admin & Shared Polish** — SettingsView split into navigation hub + AccountSettingsView + PreferencesSettingsView, PanicWipe multi-step friction gate (type "WIPE" + alert), admin cards, help accordions, device link brand styling

### Test Updates
- [x] **XCUITest Updates** — All 118 XCUITests updated for restructured navigation (settings sub-pages, hub URL validation bypass, PanicWipe friction gate), 98 unit tests passing

## Production Readiness & Long-Term Lifecycle (Epics 276-300)

Design doc: [`docs/plans/2026-03-08-production-readiness-design.md`](plans/2026-03-08-production-readiness-design.md)

### Track 1: Ansible Fleet Deployment — COMPLETE
- [x] **[Epic 276: Multi-Host Ansible Inventory & Service Discovery](epics/epic-276-multi-host-inventory.md)** — matrix-docker-ansible-deploy style, per-service toggles, multi-host service discovery
- [x] **[Epic 277: Backup Orchestration for Distributed Deployments](epics/epic-277-backup-orchestration.md)** — Per-service backup roles, cross-host aggregation, strfry/MinIO/config backup, restore playbook
- [x] **[Epic 278: Observability Stack via Ansible](epics/epic-278-observability-stack.md)** — Prometheus + Grafana + Loki (full) or health-poll + ntfy (lightweight), pre-built dashboards
- [x] **[Epic 279: Auto-Healing & Zero-Touch Operations](epics/epic-279-auto-healing.md)** — Container watchdog, stale data cleanup, NTP drift detection, disk management
- [x] **[Epic 280: Rolling Updates with Rollback](epics/epic-280-rolling-updates.md)** — Health-gated updates, dependency-ordered multi-host, version history, automatic rollback

### Track 2: Backend Resilience & Scale — COMPLETE
- [x] **[Epic 281: DO Storage Pagination & Scalability](epics/epic-281-do-storage-pagination.md)** — Shard large storage keys, cursor-based pagination, bounds checking
- [x] **[Epic 282: Retry Logic & Circuit Breakers](epics/epic-282-retry-circuit-breakers.md)** — Exponential backoff, circuit breaker per service, graceful degradation
- [x] **[Epic 283: Input Validation with Zod](epics/epic-283-input-validation-zod.md)** — Schema validation on all REST endpoints, Hono middleware
- [x] **[Epic 284: Structured Error Handling & Observability](epics/epic-284-structured-error-handling.md)** — Correlation IDs, DO alarm error handling, error counters, auth failure logging
- [x] **[Epic 285: Storage Cleanup & TTL](epics/epic-285-storage-cleanup-ttl.md)** — TTL for ephemeral data, periodic cleanup alarms, conversation archival

### Track 3: Data Migrations & Schema Evolution — COMPLETE
- [x] **[Epic 286: Online Data Migration Framework](epics/epic-286-online-data-migration-framework.md)** — Progress tracking, rollback support, admin visibility, CLI tooling, production guards
- [x] **[Epic 287: Multi-Report-Type System](epics/epic-287-multi-report-type-system.md)** — Per-report-type custom fields, admin CRUD, schema migration, cross-platform

### Track 4: Client Resilience & Lifecycle — COMPLETE
- [x] **[Epic 288: API Version Negotiation & Backwards Compatibility](epics/epic-288-api-version-negotiation.md)** — X-API-Version headers, forced update flow, graceful degradation
- [x] **[Epic 289: Desktop Auto-Update (Tauri Updater)](epics/epic-289-desktop-auto-update.md)** — GitHub Releases + self-hosted manifest, Ed25519 signing, background checks
- [x] **[Epic 290: Mobile App Distribution & Update Management](epics/epic-290-mobile-app-distribution.md)** — TestFlight + Play Store + F-Droid + direct APK, version check on launch
- [x] **[Epic 291: Client-Side Transcription on Mobile](epics/epic-291-mobile-transcription.md)** — iOS Speech framework, Android SpeechRecognizer, on-device only
- [x] **[Epic 292: Offline Resilience & Sync](epics/epic-292-offline-resilience.md)** — Offline operation queue, replay on reconnect, Nostr event replay
- [x] **[Epic 293: Client Crash Reporting & Diagnostics](epics/epic-293-crash-reporting.md)** — GlitchTip (self-hosted Sentry), all 3 platforms, PII stripping, source maps

### Track 5: Operational Sustainability — COMPLETE
- [x] **[Epic 294: Operator Alerting & Notification](epics/epic-294-operator-alerting-notification.md)** — ntfy/Gotify/email/webhook, state-based deduplication, 7 health checks
- [x] **[Epic 295: Admin System Health Dashboard](epics/epic-295-admin-system-health-dashboard.md)** — In-app system tab, real-time health, call metrics, storage, backup status
- [x] **[Epic 296: Load Testing & Capacity Planning](epics/epic-296-load-testing-capacity-planning.md)** — k6 scripts, 4 scenarios, capacity planning doc
- [x] **[Epic 297: Security Update Automation](epics/epic-297-security-update-automation.md)** — Trivy scanning, bun/cargo audit CI, automated OS updates
- [x] **[Epic 298: Disaster Recovery Runbook & Drills](epics/epic-298-disaster-recovery-drills.md)** — Automated DR test playbook, 5 scenarios, quarterly drills
- [x] **[Epic 299: Operator Handbook & Onboarding](epics/epic-299-operator-handbook-onboarding.md)** — Consolidated handbook, troubleshooting trees, quick reference card
- [x] **[Epic 300: Mobile Admin Feature Parity](epics/epic-300-mobile-admin-feature-parity.md)** — 4-phase mobile admin features (custom fields, report categories, recording playback, settings)

**Dependency order:**
- Track 1: 276 → 277 → 278 → 279 → 280
- Track 2: 283 → 284 → 281 → 282 → 285
- Track 3: 286 → 287
- Track 4: 288 → (289 | 290) → 291 → 292 → 293
- Track 5: 278 → 294 → 295 → 296 → 297 → 298 → 299 → 300

## Nostr Relay & Call Actions (Epics 305-310) ✅ COMPLETED
- [x] **[Epic 305: OpenAPI Spec + Scalar Docs](epics/epic-305-openapi-spec-scalar-docs.md)** — hono-openapi + Scalar UI at /api/docs, 158 documented paths, 25 tags, Zod v4 domain schemas, 5 BDD scenarios
- [x] **[Epic 306: Nostr Relay Event Delivery Fixes](epics/epic-306-nostr-relay-event-delivery-fixes.md)** — NodeNostrPublisher rejection handling, mobile kind filters, Android/iOS event type string alignment
- [x] **[Epic 307: Real-Time Event Delivery BDD Coverage](epics/epic-307-realtime-event-delivery-bdd-coverage.md)** — RelayCapture test helper, 9 BDD scenarios for all event kinds + encryption + tags + signatures
- [x] **[Epic 308: In-Call Quick Actions — Ban & Notes](epics/epic-308-call-action-buttons-ban-notes.md)** — POST /api/calls/:callId/ban server-side endpoint, client API fix, i18n strings, 5 BDD scenarios
- [x] **[Epic 309: Relay Event Decryption — All Platforms](epics/epic-309-relay-event-decryption.md)** — Wire serverEventKeyHex into desktop/iOS/Android relay decryption, add decrypt_server_event_hex Rust FFI
- [x] **[Epic 310: Nostr Publisher Reliability & Cleanup](epics/epic-310-nostr-publisher-reliability-cleanup.md)** — Async publishNostrEvent, messaging router encryption fix, flush OK tracking, reconnect cap, orphaned constants, skill docs, strfry hardening

## Cross-Platform Security & Quality (Epics 311+) ✅ COMPLETED
- [x] **[Epic 311: Mobile Admin Envelope Encryption & Blasts Authorization](epics/epic-311-mobile-admin-envelope-encryption-blasts-auth.md)** — Wire adminDecryptionPubkey into iOS/Android encryption, add requirePermission to 14 blast endpoints, Zod validation for 10 endpoints
- [x] **Follow-up fixes**: Add requirePermission to GET /conversations/stats and GET /reports/categories, Zod validator for POST /calls/:callId/ban

## Test Infrastructure (Epics 312-314, 333-334) ✅ COMPLETED
- [x] **[Epic 312: Permission Matrix BDD Flakiness](epics/epic-312-permission-matrix-bdd-flakiness.md)** — Was caused by concurrent test suites; backend BDD passes 432/432 when run in isolation
- [x] **[Epic 313: Worker Integration Test Fixtures](epics/epic-313-worker-integration-test-fixtures.md)** — Fixed 5 stale fixtures: pubkey validation, rate limit key, fallback body key, ECIES pubkey, conversation reopen behavior. 61/61 pass
- [x] **[Epic 314: Desktop BDD Step/UI Alignment](epics/epic-314-desktop-bdd-step-alignment.md)** — Phase 1 complete: 78→71 failures (-7), 232→236 passes (+4). Fixed i18n nav mapping, section expansion, custom fields, device link, WebRTC/RCS, reports, ban validation. All feature groups pass individually (0 per-group failures). Remaining 71 are serial state issues (→ Epic 333).
- [x] **[Epic 333: BDD Serial Execution Isolation](epics/epic-333-bdd-serial-execution-isolation.md)** — Obsoleted by Epic 336 which delivered the full solution (Before hooks, @resets-state, step collision fixes). 282 passed, 0 failures in full serial run.
- [x] **[Epic 334: Parallel BDD Execution with CMS Hub Isolation](epics/epic-334-parallel-bdd-execution.md)** — 3x speedup achieved: 281 passed, 0 failed, 3 skipped in 16.1 min (down from 47.5 min serial). fullyParallel: true with @resets-state isolation.

## Case Management System (Epics 315-332) — COMPLETED

Template-driven entity/relationship schema engine with SugarCRM-level flexibility,
E2EE case records with blind index search, configurable contact directory, event tracking,
telephony-CRM integration (screen pop, auto-linking), and 13 pre-built templates for
social services organizations (legal observer, jail support, street medic, immigration,
bail fund, DV crisis, anti-trafficking, hate crime, copwatch, tenant organizing, mutual aid,
missing persons, and general hotline).

Reference documents: `docs/plans/2026-03-14-case-management-*.md` (6 documents, ~3000 lines)

**Remaining work:** Desktop BDD step definitions (Epic 334), mobile views (iOS/Android).

### Phase 1: Infrastructure (sequential)
- [x] **[Epic 315: Entity Schema Engine](epics/epic-315-entity-schema-engine.md)** — EntityTypeDefinition, RelationshipTypeDefinition, EnumDefinition, EntityFieldDefinition storage in SettingsDO, CRUD API, 12 new crypto labels, ~30 new permissions
- [x] **[Epic 316: Blind Index Infrastructure](epics/epic-316-blind-index-infrastructure.md)** — Hub-key-derived HMAC blind indexes for server-side filtering, epoch bucketing for dates, trigram tokenization for names, Rust implementation in packages/crypto
- [x] **[Epic 317: Template System & Catalog](epics/epic-317-template-system-catalog.md)** — Template loading, validation, application, composition, update detection, 13 pre-built JSON templates in packages/protocol/templates/

### Phase 2: Core Entities + RBAC (mostly sequential)
- [x] **[Epic 318: Contact Entity & E2EE Profiles](epics/epic-318-contact-entity-e2ee-profiles.md)** — New ContactDirectoryDO (per-hub), encrypted contact profiles with configurable identifiers, blind index lookup/dedup, trigram name search
- [x] **[Epic 319: Record Entity & Core CRUD](epics/epic-319-record-entity-core-crud.md)** — New CaseDO (per-hub), generic record storage for any entity type, 3-tier E2EE (summary/fields/PII), case numbering, contact M:N linking with roles, assignment management
- [x] **[Epic 320: Event Entity & Linking](epics/epic-320-event-entity-linking.md)** — Events with time/location/sub-events, configurable location precision, record-event and report-event M:N linking
- [x] **[Epic 321: CMS Permissions & RBAC](epics/epic-321-cms-permissions-rbac.md)** — Entity-type-level access control, 3-tier envelope recipient logic, template-suggested role creation

### Phase 3: Relationships, Interactions, UI (parallelizable after Phase 2)
- [x] **[Epic 322: Contact Relationships & Support Networks](epics/epic-322-contact-relationships-networks.md)** — ContactRelationship model, affinity groups, support contact graph, relationship types (attorney, family, interpreter)
- [x] **[Epic 323: Case Interactions & Timeline](epics/epic-323-case-interactions-timeline.md)** — Link existing notes/calls/conversations to cases, inline interactions, unified chronological timeline
- [x] **[Epic 324: Report-Record-Event Linking](epics/epic-324-report-record-event-linking.md)** — M:N between existing reports and case records, evidence association
- [x] **[Epic 325: Evidence & Chain of Custody](epics/epic-325-evidence-chain-of-custody.md)** — Case file attachments with integrity hashes, custody chain metadata, access logging
- [x] **[Epic 329: Desktop Schema Editor & Template Browser](epics/epic-329-desktop-schema-editor.md)** — Admin UI for entity type/field/enum editing, template browser with apply wizard

### Phase 4: Integration & Desktop UI (parallelizable)
- [x] **[Epic 326: Telephony-CRM: Screen Pop & Auto-Link](epics/epic-326-telephony-crm-screen-pop.md)** — Caller identification via contact hash, case history on ring screen, auto-link notes to cases
- [x] **[Epic 327: Support Contact Notifications](epics/epic-327-support-contact-notifications.md)** — Case status updates via Signal/SMS/WhatsApp to support contacts
- [x] **[Epic 328: Cross-Hub Case Visibility](epics/epic-328-cross-hub-visibility.md)** — Opt-in super-admin access, cross-hub contact correlation, selective envelope sharing
- [x] **[Epic 330: Desktop Case Management UI](epics/epic-330-desktop-case-management-ui.md)** — Schema-driven record list/detail/create, assignment, status management, bulk operations
- [x] **[Epic 331: Desktop Contact Directory](epics/epic-331-desktop-contact-directory.md)** — Contact list with trigram search, profile viewer, relationship graph, affinity groups, merge tool
- [x] **[Epic 332: Desktop Case Timeline & Evidence Viewer](epics/epic-332-desktop-case-timeline-evidence.md)** — Chronological interaction timeline, evidence gallery, chain of custody display

## CMS Completion & Polish (Epics 335-343)

CMS backend + desktop UI complete (Epics 315-332). Remaining work: test execution, template-defined report types, report triage/case conversion, smart assignment, translations, docs, mobile views (including field report submission with audio input).

### Completed
- [x] **[Epic 336: BDD Serial Execution Fixes](epics/epic-336-bdd-serial-execution-fixes.md)** — Before hook @resets-state, step collision fixes, data seeding helpers. 282 passed, 0 failures in full serial run
- [x] **[Epic 340: Volunteer Profiles with Case Workload](epics/epic-340-volunteer-profiles-case-workload.md)** — Specializations, case workload tracking, Cases tab on volunteer profile, workload dashboard widget
- [x] **[Epic 341: Hub Context & Multi-Hub UX](epics/epic-341-hub-context-and-multi-hub-ux.md)** — HubSwitcher component, hub context on all CMS API calls, key-based remount on hub change
- [x] **[Epic 343: Template-Defined Report Types](epics/epic-343-template-defined-report-types.md)** — ReportTypeDefinition schema, SettingsDO CRUD, template engine extension, API routes. jail-support template v1.2.0 with `lo_arrest_report` (allowCaseConversion, mobileOptimized, supportAudioInput) and `lo_misconduct_report`. **6/6 backend BDD pass.**

### In Progress
- [ ] **[Epic 335: Desktop BDD CMS Test Execution & Fixes](epics/epic-335-desktop-bdd-cms-test-execution.md)** — 89/99 BDD pass (90%). Events route, E2EE contact directory, template label fix done. [Remaining TODOs](epics/epic-335-remaining-todos.md) being fixed.
- [ ] **[Epic 342: Smart Case Assignment & Report-to-Case Conversion](epics/epic-342-case-assignment-routing.md)** — Part 1 done (suggest-assignees API, ranked UI, auto-assign). Part 2 (report triage/conversion) unblocked by Epic 343.
- [ ] **[Epic 338: Template Translations & Locale Completeness](epics/epic-338-template-translations-locale-completeness.md)** — 61 keys × 12 locales added (ES/FR/PT translated). Template i18n mappings, codegen validation, RTL testing still needed

### Remaining
- [ ] **[Epic 339: CMS Documentation & Operator Guide](epics/epic-339-cms-documentation-operator-guide.md)** — HelpTooltip component, operator handbook CMS section, template authoring guide, API narrative docs
- [ ] **[Epic 337: Mobile Case Management Views](epics/epic-337-mobile-jail-support-views.md)** — Template-driven iOS (SwiftUI) + Android (Compose) CMS views: CaseList, CaseSummary, QuickStatus, DateCalendar, AddComment, **SubmitReport** (freeform textarea + audio input + media attach), MyReports. Field report submission is the highest-priority mobile CMS use case.

**Dependency order:** 342 Part 2 (triage/conversion, now unblocked) → 337 (mobile report submission). 335 TODOs and 339 are independent.

## Low Priority (Post-Launch)
- [x] Add call recording playback in notes view (on-demand fetch from telephony provider)
- [x] Marketing site + docs at llamenos-hotline.com (Astro + Cloudflare Pages)
