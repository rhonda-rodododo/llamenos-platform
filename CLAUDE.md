# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Llámenos is a secure crisis response hotline app. Callers dial a phone number; calls are routed to on-shift volunteers via parallel ringing. Volunteers log notes in the app. Admins manage shifts, volunteers, and ban lists. The app must protect volunteer and caller identity against well-funded adversaries (nation states, right-wing groups, private hacking firms).

**Status: Pre-production.** No legacy fallbacks or data migrations needed. No production SDLC yet.

## Multi-Platform Architecture

Monorepo containing all platforms, shared crypto, and protocol definitions:

| Directory | Purpose |
|-----------|---------|
| `apps/desktop/` | Tauri v2 desktop shell (Rust) |
| `apps/worker/` | Bun HTTP server (Hono + PostgreSQL; directory name retained — rename is separate epic) |
| `apps/ios/` | Native SwiftUI iOS client |
| `apps/android/` | Native Kotlin/Compose Android client |
| `packages/crypto/` | Shared Rust crypto crate (native + WASM + UniFFI) |
| `packages/shared/` | Cross-boundary TypeScript types and config |
| `packages/protocol/` | JSON Schema definitions + codegen (TS/Swift/Kotlin) |
| `packages/i18n/` | Localization files + iOS/Android string codegen |

All platforms implement the same protocol: `docs/protocol/PROTOCOL.md`

## Tech Stack

- **Runtime/Package Manager**: Bun (monorepo with `workspaces`)
- **Desktop**: Tauri v2 + Vite + TanStack Router + shadcn/ui — native Rust backend with webview frontend
- **iOS**: Native SwiftUI (iOS 17+, `@Observable`, SPM)
- **Android**: Native Kotlin 2.3/Compose (minSdk 26, Material 3, Hilt DI + KSP, AGP 9.1, Gradle 9.4)
- **Backend**: Bun + PostgreSQL (self-hosted), Cloudflare Workers (marketing site only)
- **Shared Crypto**: `packages/crypto/` Rust crate — single auditable implementation for all platforms (native, WASM, UniFFI)
- **Protocol**: `packages/protocol/` JSON Schema → codegen (TypeScript, Swift, Kotlin via quicktype-core)
- **Telephony**: Twilio via a `TelephonyAdapter` interface (designed for future provider swaps, e.g. SIP trunks)
- **Auth**: Nostr keypairs (BIP-340 Schnorr signatures) + WebAuthn session tokens for multi-device support
- **i18n**: `packages/i18n/` — 13 locales + codegen for iOS `.strings` and Android `strings.xml`
- **Deployment**: Docker Compose / Helm (VPS self-hosted), Cloudflare Tunnels for ingress. EU/GDPR-compatible.
- **Testing**: E2E via Playwright (desktop), XCUITest (iOS), Compose UI tests (Android); Rust tests via `cargo test`
- **Desktop Security**: Tauri Stronghold (encrypted vault), isolation pattern, CSP, single-instance

## Architecture Roles

| Role | Can See | Can Do |
|------|---------|--------|
| **Caller** | Nothing (GSM phone) | Call the hotline number |
| **User with Volunteer role** | Own notes only | Answer calls, write notes during shift |
| **Admin** | All notes, audit logs, active calls, billing data | Manage volunteers, shifts, ban lists, spam mitigation settings |

## Security Requirements

These are non-negotiable architectural constraints, not guidelines:

- **E2EE / zero-knowledge**: The server should not be able to read call notes, transcripts, or PII. Encrypt at rest minimum; E2EE where feasible.
- **User identity protection**: Personal info (name, phone) visible only to admins, never to other users or callers.
- **Call spam mitigation**: Real-time ban lists, optional CAPTCHA-like voice bot detection (randomized digit input), network-level rate limiting. Admins toggle these in real-time.
- **Audit logging**: Every call answered, every note created — visible to admins only.
- **GDPR compliance**: EU parent org, data handling must comply.

## Directory Structure

```
apps/
  desktop/            # Tauri v2 desktop shell (Rust)
    src/lib.rs        # Tauri setup (plugins, tray, IPC handlers)
    src/crypto.rs     # IPC command wrappers delegating to packages/crypto
    Cargo.toml        # Dependencies including packages/crypto path dep
    tauri.conf.json   # Tauri config (CSP, window, bundle, plugins)
    capabilities/     # Tauri capability permissions
  worker/             # Bun HTTP server (Hono + PostgreSQL; directory name retained — rename is separate epic)
    routes/           # Hono route handlers
    db/               # Drizzle ORM schemas + migrations (bun-jsonb custom type)
    services/         # Business logic service classes
    telephony/        # TelephonyAdapter interface + 5 adapters
    messaging/        # MessagingAdapter interface + SMS, WhatsApp, Signal adapters
    lib/              # Auth, crypto, webauthn utilities
    # (no wrangler.jsonc — see site/wrangler.jsonc for marketing site)
  ios/                # Native SwiftUI iOS client
    Sources/          # Swift source (App/, Services/, Views/, ViewModels/)
    Tests/            # XCTest + XCUITest
    Package.swift     # SPM config
  android/            # Native Kotlin/Compose Android client
    app/src/main/     # Kotlin source (crypto/, api/, ui/, di/, service/)
    gradle/           # Version catalog (libs.versions.toml)
packages/
  crypto/             # Shared Rust crypto crate (native + WASM + UniFFI)
    src/              # Rust source (ECIES, Schnorr, PBKDF2, HKDF, XChaCha20-Poly1305)
    scripts/          # Build scripts (build-mobile.sh for iOS/Android)
    Cargo.toml        # Crate config
  shared/             # Cross-boundary TypeScript types and config
    types.ts          # Shared types (CustomFieldDefinition, NotePayload, etc.)
    crypto-labels.ts  # Domain separation constants (re-exported from protocol)
  protocol/           # Cross-platform type codegen (Zod → quicktype)
    schemas/          # 80+ Zod schema files (source of truth for all types)
    tools/codegen.ts  # Zod → toJSONSchema() → quicktype → TS/Swift/Kotlin (with Kotlin default injection + Swift renaming)
    tools/schema-registry.ts  # Maps 85+ Zod schemas to named JSON Schemas
    openapi-snapshot.json     # OpenAPI spec snapshot (written by dev server on startup)
    generated/        # Auto-generated types — GITIGNORED (typescript/, swift/, kotlin/)
    crypto-labels.json # 28 domain separation constants (source of truth)
  i18n/               # Localization package
    locales/          # 13 locale JSON files (en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de)
    languages.ts      # Language config (codes, labels, Twilio voice IDs)
    tools/            # i18n-codegen.ts → iOS .strings + Android strings.xml + Kotlin I18n.kt
                      # validate-strings.ts → cross-platform string ref validator
src/
  client/             # Frontend SPA (Vite + React)
    routes/           # TanStack file-based routes
    components/       # App components + ui/ (shadcn primitives)
    lib/              # Client utilities (auth, platform, ws, i18n, hooks)
      platform.ts     # Platform abstraction — Tauri IPC to Rust CryptoState
tests/
  mocks/              # Tauri IPC mock layer for Playwright test builds
docs/
  protocol/PROTOCOL.md  # Cross-platform wire format, crypto, API, permission spec
  epics/              # Feature epic documents
```

**Path aliases** (tsconfig.json + vite.config.ts):
- `@/*` → `./src/client/*`
- `@worker/*` → `./apps/worker/*`
- `@shared/*` → `./packages/shared/*`
- `@protocol/*` → `./packages/protocol/*`
- `@llamenos/i18n` → `./packages/i18n/index.ts`

## Key Technical Patterns

- **TelephonyAdapter**: Abstract interface for 5 voice providers (Twilio, SignalWire, Vonage, Plivo, Asterisk). All telephony logic goes through this adapter — never call provider APIs directly from business logic.
- **MessagingAdapter**: Abstract interface for text messaging channels (SMS, WhatsApp, Signal). Inbound webhooks route to the conversation service.
- **Parallel ringing**: All on-shift, non-busy volunteers ring simultaneously. First pickup terminates other calls.
- **Shift routing**: Automated, recurring schedule with ring groups. Fallback group if no schedule is defined.
- **Blast service**: Handles message broadcast queues and delivery tracking. Manages batched delivery of bulk messages (SMS/WhatsApp/Signal) with per-recipient status tracking and retry logic (PostgreSQL-backed).
- **E2EE notes**: Per-note forward secrecy — unique random key per note, wrapped via ECIES for each reader. Dual-encrypted: one copy for volunteer, one for each admin (multi-admin envelopes).
- **E2EE messaging**: Per-message envelope encryption — random symmetric key, ECIES-wrapped for assigned volunteer + each admin. Server encrypts inbound on webhook receipt, discards plaintext immediately.
- **Platform abstraction**: `src/client/lib/platform.ts` is Tauri-only — all crypto calls route through Rust via IPC. The nsec NEVER enters the webview. Always import from `platform.ts`, never from `@tauri-apps/*` directly.
- **packages/crypto**: Shared Rust crypto crate (formerly separate `llamenos-core` repo). All crypto operations (ECIES, Schnorr, PBKDF2, HKDF, XChaCha20-Poly1305) implemented once in Rust, compiled to native (Tauri), WASM (browser), and UniFFI (mobile). Desktop links via `apps/desktop/Cargo.toml` path dep to `../../packages/crypto`.
- **Protocol codegen**: `packages/protocol/tools/codegen.ts` generates Swift Codable structs and Kotlin @Serializable data classes from Zod schemas (via `toJSONSchema()` + quicktype). Also generates crypto label constants from `crypto-labels.json`. Zod schemas in `packages/protocol/schemas/` are the single source of truth (moved from `apps/worker/schemas/`). Schema registry in `packages/protocol/tools/schema-registry.ts` maps 85+ Zod schemas to named types. Kotlin post-processor injects `@Serializable` defaults for `.optional().default()` fields. Swift post-processor strips convenience extensions, adds `Sendable`, renames 15 types that shadow builtins. Run `bun run codegen` after schema changes. Generated output is gitignored — codegen runs as a build prerequisite.
- **Key management**: PIN-encrypted keys stored in Tauri Store (desktop), iOS Keychain, or Android Keystore (EncryptedSharedPreferences). Rust CryptoState holds the nsec; UI only sees pubkey. Device linking via ephemeral ECDH provisioning rooms.
- **Tauri IPC mock for tests**: Playwright tests run in a regular browser. `PLAYWRIGHT_TEST=true` triggers Vite aliases that route `@tauri-apps/api/core` and `@tauri-apps/plugin-store` to JS mock implementations in `tests/mocks/`. The mock maintains a CryptoState that mirrors the Rust side.
- **Mobile crypto**: iOS uses UniFFI XCFramework from `packages/crypto/`, Android uses JNI `.so` files. Both wrap CryptoService as a singleton — `nsecHex` is private and never leaves the service layer.
- **Nostr relay real-time**: Ephemeral kind 20001 events via strfry (self-hosted) or Nosflare (CF). All event content encrypted with hub key. Generic tags (`["t", "llamenos:event"]`) — relay cannot distinguish event types.
- **Hub key distribution**: Random 32 bytes (`crypto.getRandomValues`), ECIES-wrapped individually per member via `LABEL_HUB_KEY_WRAP`. Rotation on member departure excludes departed member.
- **Client-side transcription**: WASM Whisper via `@huggingface/transformers` ONNX runtime. AudioWorklet ring buffer → Web Worker isolation. Audio never leaves the browser.
- **Reproducible builds**: `Dockerfile.build` with `SOURCE_DATE_EPOCH`, content-hashed filenames. `CHECKSUMS.txt` in GitHub Releases. SLSA provenance. Verification via `scripts/verify-build.sh`.
- **Hash-chained audit log**: SHA-256 chain with `previousEntryHash` + `entryHash` for tamper detection (Epic 77).
- **Domain separation**: All 28 crypto context constants defined in `packages/protocol/crypto-labels.json` (source of truth), generated to TS/Swift/Kotlin via codegen. NEVER use raw string literals for crypto contexts.

## Gotchas

- `@noble/ciphers` and `@noble/hashes` require `.js` extension in imports (e.g., `@noble/ciphers/chacha.js`)
- `schnorr` is a separate named export: `import { schnorr } from '@noble/curves/secp256k1.js'`
- Nostr pubkeys are x-only (32 bytes) — prepend `"02"` for ECDH compressed format
- `secp256k1.getSharedSecret()` returns 33 bytes; extract x-coord with `.slice(1, 33)`
- Nostr relay (strfry) is a core service, not optional — always runs with Docker Compose and Helm
- `SERVER_NOSTR_SECRET` must be exactly 64 hex chars; server derives its Nostr keypair via HKDF
- Hub key is random bytes, NOT derived from any identity key — see `hub-key-manager.ts`
- **Tauri-only desktop**: No browser/PWA fallback. `platform.ts` always routes through Tauri IPC. Use `PLAYWRIGHT_TEST=true` for test builds that mock the IPC layer.
- **packages/crypto path dep**: `apps/desktop/Cargo.toml` references `../../packages/crypto`. No external repo needed.
- **wrangler.jsonc**: Only exists at `site/wrangler.jsonc` (Cloudflare Pages, marketing site). No wrangler config in `apps/worker/` — the backend is Bun+PostgreSQL, not a Cloudflare Worker.
- **iOS UniFFI**: Build with `packages/crypto/scripts/build-mobile.sh ios`, copy XCFramework to `apps/ios/`. Stand-in mock types enabled via `#if !canImport(LlamenosCore)`.
- **Android JNI**: Build with `packages/crypto/scripts/build-mobile.sh android`, place `.so` files in `apps/android/app/src/main/jniLibs/`. Placeholder mock crypto active until native libs are linked.
- **Zod `.optional().default()` pattern**: Always use `.optional().default(value)` for fields with defaults in `packages/protocol/schemas/`. Never use bare `.default(value)` — it produces wrong JSON Schema output in Zod 4, breaking Kotlin/Swift codegen defaults. The Kotlin post-processor in `codegen.ts` reads `"default"` values from JSON Schema and injects them into generated `@Serializable` data classes.
- **Schemas moved to protocol**: All Zod schemas live in `packages/protocol/schemas/` (moved from `apps/worker/schemas/`). Worker routes import from `@protocol/schemas`. Old epic docs may reference the old path — the new path is canonical.

## Development Commands

### Local Backend Setup (REQUIRED for backend development and testing)

**Always use dev compose (backing services) + `bun run dev:server` (app with file watching):**

```bash
# 1. Start backing services (PostgreSQL, MinIO, strfry)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# 2. Start app locally (auto-reloads on code changes via --watch)
bun run dev:server

# 3. Run backend BDD tests
bun run test:backend:bdd
```

**NEVER use the production compose** (`deploy/docker/docker-compose.yml`) for local development or testing. It bundles the app into a Docker image that won't reflect code changes until rebuilt. The `docker-compose.test.yml` overlay is for CI only.

```bash
# iOS (runs locally on Mac M4)
bun run ios:status                       # Check Xcode, Rust, xcodegen status
bun run ios:setup                        # First-time: install Rust targets, xcodegen, xcbeautify
bun run ios:build                        # Build iOS app (auto-generates .xcodeproj)
bun run ios:test                         # Run unit tests (LlamenosTests)
bun run ios:uitest                       # Run XCUITests on simulator
bun run ios:xcframework                  # Build LlamenosCoreFFI XCFramework from Rust
bun run ios:all                          # xcframework + build + test + uitest
bun run crypto:test:mobile               # Rust crypto tests with mobile FFI

# Desktop (runs on Linux machine)
bun install                              # Install dependencies
bun run tauri:dev                        # Tauri desktop dev (Vite + Rust backend)
bun run tauri:build                      # Tauri desktop release build
bun run dev                              # Vite dev server (test builds only — no Rust backend)

# Backend (runs on Linux machine)
bun run dev:server                       # Bun HTTP server with file watching

# Build & Test (runs on Linux machine)
bun run build                            # Vite build → dist/client/
bun run typecheck                        # Type check (tsc --noEmit)
bun run test                             # Run all Playwright E2E tests (auto-builds with mocks)
bun run test:ui                          # Playwright UI mode
bun run test:build                       # Vite build with Tauri IPC mocks (for Playwright)

# Crypto (Rust — runs on either machine)
bun run crypto:test                      # cargo test on packages/crypto
bun run crypto:test:mobile               # cargo test with --features mobile (FFI tests)
bun run crypto:clippy                    # cargo clippy on packages/crypto
bun run crypto:fmt                       # cargo fmt --check on packages/crypto

# Codegen (runs on either machine)
bun run codegen                          # Generate TS/Swift/Kotlin types from Zod schemas (via quicktype)
bun run i18n:codegen                     # Generate iOS .strings + Android strings.xml + Kotlin I18n.kt
bun run i18n:validate                    # Check locale completeness
bun run i18n:validate:android            # Validate R.string.* refs match codegen output
bun run i18n:validate:ios                # Validate localized string refs in Swift
bun run i18n:validate:desktop            # Validate t('key') calls match en.json
bun run i18n:validate:all                # Run all three validators

# Unified Test Orchestration (runs on either machine)
bun run test:all                         # Codegen + build + test ALL available platforms
bun run test:changed                     # Only test platforms affected by git changes
bun run test:feature <name>              # Run tests matching a feature name across platforms
bun run test:desktop                     # Desktop: codegen → typecheck → playwright
bun run test:ios                         # iOS: codegen → xcodebuild → unit + UI tests
bun run test:android                     # Android: codegen → gradle unit + lint + androidTest
bun run test:worker                      # Worker: codegen → typecheck → integration tests
bun run test:crypto                      # Crypto: cargo test + clippy
bun run test:backend:bdd                 # Backend BDD against local backend (API-level)

# Deploy (runs on Linux machine)
bun run deploy                           # Deploy EVERYTHING (Worker + marketing site)
bun run deploy:api                       # Deploy Worker only
bun run deploy:site                      # Deploy marketing site only

# Android (runs on Linux machine)
bun run test:android                     # Unit tests + lint + build androidTest APK
bun run test:android:e2e                 # Cucumber BDD E2E on connected device/emulator

# Version Management
bun run version:bump <major|minor|patch> [description]     # Bump version across ALL platforms

# Utilities
bun run bootstrap-admin                  # Generate admin keypair
```

**Deployment rules — NEVER run `wrangler pages deploy` or `wrangler deploy` directly.** Always use `bun run deploy` or `bun run deploy:site` from the root. Running wrangler from the wrong directory will deploy the wrong artifact.

**Key config files**: `site/wrangler.jsonc` (Cloudflare Pages, marketing site only), `playwright.config.ts`, `.dev.vars` (Twilio creds + ADMIN_PUBKEY, gitignored)

## Claude Code Working Style

### Development Workflow

- **New feature**: `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:executing-plans`
- **Bug fix**: `superpowers:systematic-debugging`
- **Code complete**: `superpowers:verification-before-completion` + `superpowers:requesting-code-review`

Domain skills (e.g. `bdd-feature-development`, `protocol-schema-change`) are **reference material** used during plan execution — not primary workflow entry points.

`docs/epics/` contains historical planning documents for reference. New planning uses superpowers specs (`docs/superpowers/specs/`) and plans (`docs/superpowers/plans/`).

### Test Philosophy

1. Tests assert **behavior** (state changes, API responses, data persistence) — never assert UI element existence
2. Every test is **isolated** — per-test PostgreSQL schema, no shared state between tests
3. Tests must **pass immediately** — no `waitForTimeout()`, use DOM-native or Playwright `waitFor` only

### General Rules

- Implement features completely — no stubs, no shortcuts, no TODOs
- Edit files in place; never create copies. Git history is the backup
- Keep the file tree lean. Commit frequently
- No legacy fallbacks until the app is in production
- Use context7 MCP for library documentation lookups
- Clean up unused files when pivoting. Refactor proactively
- NEVER delete or regress functionality to fix type issues or get tests passing
