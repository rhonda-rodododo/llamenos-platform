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

## Production Readiness & Quality (Epics 211-214) — IN PROGRESS

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

## Desktop BDD Behavioral Recovery (Epics 247-251) — IN PROGRESS

Recover the ~400 behavioral tests lost in the Epic 232 BDD migration. Original .spec.ts files had 5,833 lines of deep behavioral tests (API verification, CRUD cycles, permission enforcement, serial state chains). Current step definitions are ~80% presence-only checks. Recovery uses BDD approach: expand feature files + rewrite step definitions.

### Admin & Infrastructure
- [ ] **[Epic 247: Admin CRUD Behavioral Recovery](epics/epic-247-desktop-bdd-admin-crud.md)** — Volunteer, ban, shift CRUD with API verification. API helpers foundation.
- [ ] **[Epic 248: Notes & Custom Fields Behavioral Recovery](epics/epic-248-desktop-bdd-notes-custom-fields.md)** — Note create/edit/save/verify, custom field CRUD + badge display, call ID grouping.

### RBAC & Permissions
- [ ] **[Epic 249: RBAC & Permissions Behavioral Recovery](epics/epic-249-desktop-bdd-rbac-permissions.md)** — Role CRUD via API, cross-role permission enforcement (admin/volunteer/reporter/custom), multi-role union, wildcard permissions.

### Reports, Conversations & Audit
- [ ] **[Epic 250: Reports, Conversations & Audit Behavioral Recovery](epics/epic-250-desktop-bdd-reports-conversations-audit.md)** — Report lifecycle (create→claim→close→filter), reporter role onboarding, audit log filtering/search, conversation assign/close/reopen.

### Settings & Auth Guards
- [ ] **[Epic 251: Settings, Auth Guards & Desktop Flows](epics/epic-251-desktop-bdd-settings-auth-guards.md)** — Settings/theme/language persistence, auth guard enforcement, volunteer navigation restrictions, admin settings sections.

**Dependency order:** 247 (API helpers) → (248 | 249 | 250 | 251) in parallel

## iOS Feature Parity (Epics 240-246) — IN PROGRESS

Catch iOS up to Android feature set with native SwiftUI design. BDD-first: write XCUITest specs, then implement features to pass them. Tests hit live Docker API.

### Infrastructure
- [ ] **[Epic 240: iOS Docker Test Infrastructure](epics/epic-240-ios-docker-test-infra.md)** — Connect XCUITests to live Docker Compose API backend (`--test-hub-url`, `resetServerState()`, identity registration)

### Core Features
- [x] **[Epic 241: iOS Reports](epics/epic-241-ios-reports.md)** — Full reports CRUD (create, list, detail, claim, close) with E2EE envelope encryption
- [x] **[Epic 242: iOS Help Screen](epics/epic-242-ios-help-screen.md)** — Security overview, role-based guides, FAQ with DisclosureGroup sections

### Admin Features
- [ ] **[Epic 243: iOS Contacts & Timeline](epics/epic-243-ios-contacts-timeline.md)** — Admin-only contacts list with per-contact interaction timeline
- [ ] **[Epic 244: iOS Admin Custom Fields](epics/epic-244-ios-admin-custom-fields.md)** — Custom fields management tab in admin panel (CRUD with field type picker)
- [ ] **[Epic 245: iOS Blasts](epics/epic-245-ios-blasts.md)** — Admin broadcast messaging (compose, send/schedule to subscribers)

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

## Tooling & Test Orchestration Overhaul (Epics 265-268) — IN PROGRESS

i18n alignment, codegen validation, BDD test orchestration, and Android tooling upgrade. Mac M4 now fully self-contained for all platforms.

**Dependency order:** 265 → 266 → 267 (268 can parallel with 266/267 after 265)

### i18n & Codegen
- [x] **[Epic 265: i18n Android String Alignment](epics/epic-265-i18n-android-string-alignment.md)** — Fixed 328 missing R.string refs (327 added to en.json, 1 Kotlin ref corrected), all 13 locales at 1562 keys
- [x] **[Epic 266: i18n Codegen Validation Enhancement](epics/epic-266-i18n-codegen-validation-enhancement.md)** — CI validators for Android/iOS/desktop string refs, generated Kotlin I18n constants (1761 keys)

### Test Orchestration
- [x] **[Epic 267: BDD Test Orchestration Overhaul](epics/epic-267-bdd-test-orchestration-overhaul.md)** — Unified codegen→build→test pipeline, cross-platform scripts, test:all/test:changed/test:feature commands

### Android Tooling
- [x] **[Epic 268: Android Tooling Upgrade](epics/epic-268-android-tooling-upgrade.md)** — AGP 9.1, Gradle 9.4, Kotlin 2.3, Compose BOM 2026.02, kapt→KSP, compileSdk 36

## Low Priority (Post-Launch)
- [x] Add call recording playback in notes view (on-demand fetch from telephony provider)
- [x] Marketing site + docs at llamenos-hotline.com (Astro + Cloudflare Pages)
