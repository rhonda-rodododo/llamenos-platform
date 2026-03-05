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
| `apps/worker/` | Cloudflare Worker backend |
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
- **Android**: Native Kotlin/Compose (minSdk 26, Material 3, Hilt DI, Gradle version catalogs)
- **Backend**: Cloudflare Workers + Durable Objects (cloud) / Node.js + PostgreSQL (self-hosted)
- **Shared Crypto**: `packages/crypto/` Rust crate — single auditable implementation for all platforms (native, WASM, UniFFI)
- **Protocol**: `packages/protocol/` JSON Schema → codegen (TypeScript, Swift, Kotlin via quicktype-core)
- **Telephony**: Twilio via a `TelephonyAdapter` interface (designed for future provider swaps, e.g. SIP trunks)
- **Auth**: Nostr keypairs (BIP-340 Schnorr signatures) + WebAuthn session tokens for multi-device support
- **i18n**: `packages/i18n/` — 13 locales + codegen for iOS `.strings` and Android `strings.xml`
- **Deployment**: Cloudflare (Workers, DOs, Tunnels), billed to EU/GDPR-compatible account
- **Testing**: E2E via Playwright (desktop), XCUITest (iOS), Compose UI tests (Android); Rust tests via `cargo test`
- **Desktop Security**: Tauri Stronghold (encrypted vault), isolation pattern, CSP, single-instance

## Architecture Roles

| Role | Can See | Can Do |
|------|---------|--------|
| **Caller** | Nothing (GSM phone) | Call the hotline number |
| **Volunteer** | Own notes only | Answer calls, write notes during shift |
| **Admin** | All notes, audit logs, active calls, billing data | Manage volunteers, shifts, ban lists, spam mitigation settings |

## Security Requirements

These are non-negotiable architectural constraints, not guidelines:

- **E2EE / zero-knowledge**: The server should not be able to read call notes, transcripts, or PII. Encrypt at rest minimum; E2EE where feasible.
- **Volunteer identity protection**: Personal info (name, phone) visible only to admins, never to other volunteers or callers.
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
  worker/             # Cloudflare Worker backend
    durable-objects/  # 7 DOs: IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO, BlastDO
    telephony/        # TelephonyAdapter interface + 5 adapters
    messaging/        # MessagingAdapter interface + SMS, WhatsApp, Signal adapters
    lib/              # Server utilities (auth, crypto, webauthn, do-router)
    wrangler.jsonc    # Worker + DO bindings config
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
  protocol/           # JSON Schema definitions + multi-platform codegen
    schemas/          # 8 JSON Schema files (envelope, notes, files, telephony, etc.)
    tools/codegen.ts  # quicktype-core → TS/Swift/Kotlin type generation
    generated/        # Auto-generated types (typescript/, swift/, kotlin/)
    crypto-labels.json # 28 domain separation constants (source of truth)
  i18n/               # Localization package
    locales/          # 13 locale JSON files (en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de)
    languages.ts      # Language config (codes, labels, Twilio voice IDs)
    tools/            # i18n-codegen.ts → iOS .strings + Android strings.xml
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
- `@llamenos/i18n` → `./packages/i18n/index.ts`

## Key Technical Patterns

- **TelephonyAdapter**: Abstract interface for 5 voice providers (Twilio, SignalWire, Vonage, Plivo, Asterisk). All telephony logic goes through this adapter — never call provider APIs directly from business logic.
- **MessagingAdapter**: Abstract interface for text messaging channels (SMS, WhatsApp, Signal). Inbound webhooks route to ConversationDO.
- **Parallel ringing**: All on-shift, non-busy volunteers ring simultaneously. First pickup terminates other calls.
- **Shift routing**: Automated, recurring schedule with ring groups. Fallback group if no schedule is defined.
- **Durable Objects**: Seven singletons accessed via `idFromName()` — IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO, BlastDO. Routed via `DORouter` (lightweight method+path router).
- **BlastDO**: Handles message broadcast queues and delivery tracking. Manages batched delivery of bulk messages (SMS/WhatsApp/Signal) with per-recipient status tracking and retry logic.
- **E2EE notes**: Per-note forward secrecy — unique random key per note, wrapped via ECIES for each reader. Dual-encrypted: one copy for volunteer, one for each admin (multi-admin envelopes).
- **E2EE messaging**: Per-message envelope encryption — random symmetric key, ECIES-wrapped for assigned volunteer + each admin. Server encrypts inbound on webhook receipt, discards plaintext immediately.
- **Platform abstraction**: `src/client/lib/platform.ts` is Tauri-only — all crypto calls route through Rust via IPC. The nsec NEVER enters the webview. Always import from `platform.ts`, never from `@tauri-apps/*` directly.
- **packages/crypto**: Shared Rust crypto crate (formerly separate `llamenos-core` repo). All crypto operations (ECIES, Schnorr, PBKDF2, HKDF, XChaCha20-Poly1305) implemented once in Rust, compiled to native (Tauri), WASM (browser), and UniFFI (mobile). Desktop links via `apps/desktop/Cargo.toml` path dep to `../../packages/crypto`.
- **Protocol codegen**: `packages/protocol/tools/codegen.ts` generates TypeScript interfaces, Swift structs (Codable), and Kotlin data classes (kotlinx.serialization) from JSON Schema definitions. Also generates crypto label constants. Run `bun run codegen` after schema changes. CI validates with `bun run codegen:check`.
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
- **Worker config**: `wrangler.jsonc` lives at `apps/worker/wrangler.jsonc`. All wrangler commands use `--config apps/worker/wrangler.jsonc`.
- **iOS UniFFI**: Build with `packages/crypto/scripts/build-mobile.sh ios`, copy XCFramework to `apps/ios/`. Stand-in mock types enabled via `#if !canImport(LlamenosCore)`.
- **Android JNI**: Build with `packages/crypto/scripts/build-mobile.sh android`, place `.so` files in `apps/android/app/src/main/jniLibs/`. Placeholder mock crypto active until native libs are linked.

## Development Commands

### Multi-Machine Workflow

Development is split across two machines:
- **Mac M4** (this machine): iOS builds, XCUITests, Rust crypto, xcodegen
- **Linux** (192.168.50.95): Desktop (Tauri), backend (Workers), Android, Docker, Playwright E2E

Coordinate via git push/pull on the `desktop` branch.

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
bun run dev:worker                       # Wrangler dev server (Worker + DOs)

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
bun run codegen                          # Generate TS/Swift/Kotlin types from JSON Schemas
bun run codegen:check                    # Verify generated files are up-to-date (CI)
bun run i18n:codegen                     # Generate iOS .strings + Android strings.xml
bun run i18n:validate                    # Check locale completeness

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

**Deployment rules — NEVER run `wrangler pages deploy` or `wrangler deploy` directly.** Always use the root `package.json` scripts (`bun run deploy`, `bun run deploy:api`, `bun run deploy:site`). Running `wrangler pages deploy dist` from the wrong directory will deploy the Vite app build to Pages instead of the Astro site, breaking the marketing site with 404s.

**Key config files**: `apps/worker/wrangler.jsonc` (Worker + DO bindings), `playwright.config.ts`, `.dev.vars` (Twilio creds + ADMIN_PUBKEY, gitignored)

## Claude Code Working Style

- **Always run `bun run typecheck` and `bun run build` before committing and pushing.** Never push code that doesn't build. If typecheck or build fails, fix it before committing.
- **For Android changes**, also run `bun run test:android` (unit + lint + androidTest compilation) before committing. When a device is connected, also run `bun run test:android:e2e` for full Cucumber BDD E2E coverage. iOS (`swift build && swift test`) requires macOS — verified in CI.
- **Full E2E verification** means running ALL platforms: `bun run test` (Playwright desktop), `bun run test:android:e2e` (Android Cucumber on device), and `bun run test:worker:integration` (DO integration). Never consider E2E complete without Android.
- Implement features completely — no stubs, no shortcuts, no TODOs left behind.
- **Every feature or fix must include tests.** Desktop: Playwright E2E tests in `tests/`. Android: unit tests (`src/test/`) and UI tests (`src/androidTest/`). iOS: XCTest unit + UI tests in `Tests/`. A feature is not complete until its tests are written and passing.
- Edit files in place; never create copies. Git history is the backup. Commit regularly when work is complete, don't worry about accidentally committing unrelated changes.
- Keep the file tree lean. Use git commits frequently to checkpoint progress.
- No legacy fallbacks or migration code until this file notes the app is in production.
- Use `docs/epics/` for planning feature epics. Track backlog in `docs/NEXT_BACKLOG.md` and completed work in `docs/COMPLETED_BACKLOG.md` with every iteration
- Use context7 plugin to look up current docs for Twilio, Cloudflare Workers, TanStack, shadcn/ui, and other libraries before implementing.
- Use the feature-dev plugin for guided development of complex features.
- Use Playwright plugin for E2E test development and debugging.
- Clean up unused files/configs when pivoting. Keep code modular and DRY — refactor proactively.
- Update related documentation when requirements, architecture, or design changes occur.
- NEVER delete or regress functionality to fix type issues or get tests passing. Only remove features if explicitly asked or when replacing as part of new work.
- Use parallel agent execution where it makes sense to keep things moving.
