# Development Guide

## Prerequisites

| Tool | Install |
|------|---------|
| [Bun](https://bun.sh/) (v1.3.5+) | `curl -fsSL https://bun.sh/install \| bash` |
| [Rust](https://rustup.rs/) (1.85+) | Required for desktop and crypto crate |
| [Docker + Docker Compose](https://docs.docker.com/engine/install/) | Required for backend development |
| [mise](https://mise.jdx.dev/) | Polyglot version manager — run `mise install` once after cloning |

**Linux WebKit (for Tauri desktop):**
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

**iOS (requires Mac with Xcode 16+):** See `docs/DEVELOPMENT_SETUP.md`.

## Initial Setup

```bash
bun install
cp .env.example .env             # Configure Twilio creds + ADMIN_PUBKEY
bun run bootstrap-admin          # Generate admin keypair
```

## Running the Backend

Always use the dev compose for backing services + `bun run dev:server` for the app:

```bash
# 1. Start PostgreSQL, RustFS
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# 2. Start the Bun HTTP server with file watching
bun run dev:server
```

**Never** use the production compose (`deploy/docker/docker-compose.yml`) for local development — it bundles the app into a Docker image and won't reflect code changes.

## Common Commands

```bash
# Backend
bun run dev:server               # Bun HTTP server with file watching

# Desktop
bun run tauri:dev                # Tauri desktop app (Vite + Rust)
bun run tauri:build              # Release build

# Build & Type Check
bun run build                    # Vite build → dist/client/
bun run typecheck                # TypeScript type check (tsc --noEmit)
bun run codegen                  # Generate TS/Swift/Kotlin types from Zod schemas

# Testing
bun run test                     # Playwright E2E tests (desktop, uses Tauri IPC mocks)
bun run test:ui                  # Playwright UI mode
bun run test:backend:bdd         # Backend BDD tests against local backend
bun run test:all                 # All platforms (codegen + build + test)
bun run test:changed             # Only platforms affected by git changes

# iOS (run from Mac via ssh mac or bun run mac:run)
bun run ios:build
bun run ios:test
bun run ios:uitest

# Android
bun run test:android             # Unit tests + lint + build androidTest APK
bun run test:android:e2e         # Cucumber BDD E2E on connected device/emulator

# Crypto (Rust)
bun run crypto:test              # cargo test on packages/crypto
bun run crypto:clippy            # cargo clippy
```

## Project Structure

```
apps/
  desktop/            # Tauri v2 desktop shell
    src/lib.rs        # Tauri setup (IPC handlers, plugins, tray)
    src/crypto.rs     # IPC command wrappers → packages/crypto
    tauri.conf.json   # Tauri config (CSP, window, capabilities)
  worker/             # Bun HTTP server (Hono + PostgreSQL)
    routes/           # Hono API route handlers
    db/               # Drizzle ORM schemas + migrations
    services/         # Business logic
    telephony/        # TelephonyAdapter + 8 provider adapters
    messaging/        # MessagingAdapter + SMS/WhatsApp/Signal/Telegram/RCS adapters
    lib/              # Auth, crypto, webauthn utilities
  ios/                # Native SwiftUI iOS client (iOS 17+)
  android/            # Native Kotlin/Compose Android client
  sip-bridge/         # Protocol-agnostic SIP bridge (PBX_TYPE selects ARI/ESL/Kamailio)
packages/
  crypto/             # Shared Rust crypto crate (native + WASM + UniFFI)
  protocol/           # JSON Schema definitions + codegen (TS/Swift/Kotlin)
    schemas/          # 42+ Zod schema files — source of truth for all types
    crypto-labels.json # 69 domain separation constants
  shared/             # Cross-boundary TypeScript types and config
  i18n/               # Localization files + iOS/Android string codegen
src/
  client/             # Frontend SPA (Vite + React + TanStack Router)
    routes/           # File-based routes
    components/       # App components + ui/ (shadcn primitives)
    lib/
      platform.ts     # Platform abstraction — routes crypto to Rust IPC
      auth.tsx        # Auth context (Ed25519 device keys + WebAuthn)
      ws.ts           # WebSocket connection
tests/
  mocks/              # Tauri IPC mock layer for Playwright test builds
docs/                 # Guides, protocol spec, security docs
```

**`sip-bridge/`** is at the repository root (not inside `apps/`).

## Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

| Alias | Target |
|-------|--------|
| `@/*` | `./src/client/*` |
| `@worker/*` | `./apps/worker/*` |
| `@shared/*` | `./packages/shared/*` |
| `@protocol/*` | `./packages/protocol/*` |
| `@llamenos/i18n` | `./packages/i18n/index.ts` |

## Key Config Files

- `playwright.config.ts` — E2E test config
- `.env` — Local secrets (gitignored): Twilio creds, ADMIN_PUBKEY
- `vite.config.ts` — Frontend build config
- `tsconfig.json` — TypeScript config
- `site/wrangler.jsonc` — Cloudflare Pages config (marketing site only — **no** wrangler config in `apps/worker/`)

## Architecture

### Backend (Bun HTTP + PostgreSQL)

The backend runs as a Bun HTTP server with Hono routing and PostgreSQL persistence. It is **not** a Cloudflare Worker.

| Service | Responsibility |
|---------|---------------|
| Identity service | Users, pubkeys, roles, device registry, sigchain |
| Settings service | Hub settings, telephony config, spam rules |
| Records service | Call records, notes, audit log |
| Shift service | Shift schedules, assignments |
| Call router | Active call routing, parallel ringing |
| Conversation service | SMS/WhatsApp/Signal messaging threads |
| CMS services | Contacts, cases, reports, evidence |

### Encryption

All crypto is implemented in `packages/crypto/` (Rust), compiled to:
- Native library — Tauri desktop (linked via `apps/desktop/Cargo.toml`)
- UniFFI XCFramework — iOS
- UniFFI JNI `.so` — Android
- WASM — browser test builds only

**Primitives:**
- **Envelope encryption**: HPKE RFC 9180 (X25519 + HKDF-SHA256 + AES-256-GCM)
- **Symmetric**: XChaCha20-Poly1305 (hub events)
- **KDF**: HKDF-SHA-256, Argon2id (PINs, 64MB/3/4)
- **Signing**: Ed25519 (device auth, sigchain) + BIP-340 Schnorr (legacy, being phased out)
- **Domain separation**: 69 labeled contexts in `packages/protocol/crypto-labels.json`

**Key model**: Each device has its own Ed25519 (signing) + X25519 (encryption) keypair. Device keys never enter the webview — all crypto calls go through Rust via Tauri IPC. The `platform.ts` abstraction is the only correct way to invoke crypto from the frontend.

### Authentication

```
Authorization: Bearer <Ed25519 signed JSON>
Authorization: Session <WebAuthn token>
```

### Real-Time Sync

WebSocket-based real-time sync. All event content is encrypted with the hub key.

## Testing

### E2E / Desktop (Playwright)

Tests run against a mock Tauri IPC layer — no Rust backend needed:

```bash
PLAYWRIGHT_TEST=true bun run test:build   # Build with mocks
bun run test                              # Run all E2E tests
bun run test:ui                           # Playwright UI mode
```

Test helpers in `tests/helpers.ts`: `loginAsAdmin()`, `createUserAndGetNsec()`, `dismissNsecCard()`.

### Writing Tests

- Use `data-testid` attributes for selectors — never `getByRole(...)` with fragile name matches
- Playwright runs with `workers: 3` (parallel)
- Per-test isolation: create unique resources using `Date.now()` in names
- `resetTestState()` belongs only in `tests/global-setup.ts` — not in individual test files

### Backend BDD

```bash
bun run test:backend:bdd
```

Run against a local dev server. Requires the dev compose stack and `bun run dev:server`.

## Schemas

All Zod schemas live in `packages/protocol/schemas/`. The `apps/worker/schemas/` path is **gone** — worker routes import from `@protocol/schemas`.

After any schema change:
```bash
bun run codegen    # Regenerate TS/Swift/Kotlin types
bun run typecheck  # Verify no type errors
```

## Common Gotchas

- `@noble/ciphers` and `@noble/hashes` require `.js` extension in imports
- `schnorr` is a separate named export: `import { schnorr } from '@noble/curves/secp256k1.js'`
- WebSocket events are the real-time sync mechanism (in-process relay)
- Never use raw string literals for crypto contexts — always use generated label constants from `@protocol/crypto-labels`
- `PLAYWRIGHT_TEST=true` enables Vite aliases that swap Tauri IPC for JS mocks in `tests/mocks/`
- **wrangler.jsonc is only at `site/wrangler.jsonc`** — do not run `wrangler` from the repo root
- Zod schemas: always use `.optional().default(value)`, never bare `.default(value)` — Zod 4 produces wrong JSON Schema output otherwise

## Marketing Site

The marketing site lives in `site/` (Astro + Tailwind):

```bash
cd site
bun install
bun run dev         # Local dev server
bun run build       # Build static site
bun run deploy:site # Deploy (from repo root — do NOT run wrangler directly)
```

## Development Workflow

- **New feature**: `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:executing-plans`
- **Bug fix**: `superpowers:systematic-debugging`
- **Code complete**: `superpowers:verification-before-completion` + `superpowers:requesting-code-review`

## Load Testing

k6-based load tests are available for performance validation:

```bash
bun run load:calls      # Call routing load test
bun run load:messages   # Messaging load test
bun run load:mixed      # Mixed traffic load test
bun run load:burst      # Burst traffic load test
bun run load:all        # All load tests
```
