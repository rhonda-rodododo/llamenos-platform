# Contributing to Llamenos

Llamenos is a monorepo containing the backend (Bun + PostgreSQL), Tauri desktop app,
iOS and Android clients, shared Rust crypto, and protocol codegen. Pick the area you
want to work on — you don't need to set up all platforms.

---

## Prerequisites

**All contributors:**
- [Bun](https://bun.sh/) 1.3.5+ (`curl -fsSL https://bun.sh/install | bash`)
- [Docker](https://docs.docker.com/get-docker/) (for local backing services)
- Git

**Desktop (Tauri) or Crypto (Rust):**
- [Rust](https://rustup.rs/) — toolchain version is managed by `rust-toolchain.toml` per workspace

**Android:**
- JDK 17 (Temurin recommended)
- Android SDK with NDK r27

**iOS (macOS only):**
- Xcode 16+
- `xcodegen` (`brew install xcodegen`)

### With mise (optional but recommended)

[mise](https://mise.jdx.dev/) is a polyglot version manager. If you use it:

```bash
mise install     # Installs Bun 1.3.5 and JDK 17 as declared in .mise.toml
```

Rust is managed by `rust-toolchain.toml` files in each workspace — mise respects these automatically.

---

## Quick Setup

```bash
git clone git@github.com:your-org/llamenos.git
cd llamenos
bun install
bash scripts/dev-setup.sh    # prerequisite check + troubleshooting hints
```

`dev-setup.sh` checks your toolchain and tells you exactly what's missing.

---

## Development Areas

### Backend

The backend is a Bun HTTP server (Hono + PostgreSQL) in `apps/worker/`.

```bash
# Start backing services (PostgreSQL, object storage, Nostr relay)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Start the backend with file watching
bun run dev:server            # runs at http://localhost:3000

# Run BDD tests
bun run test:backend:bdd
```

### Desktop (Tauri)

The desktop app is a Tauri v2 shell (`apps/desktop/`) with a React frontend (`src/client/`).
Rust 1.85.0 is required — `rustup` will install the right version from `apps/desktop/rust-toolchain.toml`.

```bash
bun run tauri:dev             # starts Vite + Tauri dev app
bun run typecheck             # TypeScript check
bun run test                  # Playwright E2E (uses Tauri IPC mocks — no Rust needed)
```

### iOS

iOS requires a Mac with Xcode 16+. All `ios:*` commands SSH to a configured Mac if you're on Linux.

```bash
bun run ios:status            # Check Xcode, Rust, xcodegen status
bun run ios:setup             # First-time: install Rust targets, xcodegen
bun run ios:build             # Build the iOS app
bun run ios:test              # Run unit tests
```

See `docs/ios/` for Mac SSH setup.

### Android

```bash
bun run android:sdk:setup     # First-time: install Android SDK + NDK
bun run test:android          # Unit tests + lint
bun run test:android:e2e      # Cucumber BDD E2E on device/emulator
```

### Crypto (Rust)

The shared crypto crate lives in `packages/crypto/`. The `packages/crypto/rust-toolchain.toml`
pins `stable` with additional targets for iOS, Android, and WASM.

```bash
bun run crypto:test           # cargo test
bun run crypto:clippy         # cargo clippy
bun run crypto:fmt            # cargo fmt --check
```

---

## Protocol Codegen

Zod schemas in `packages/protocol/schemas/` are the single source of truth for all
types across TypeScript, Swift, and Kotlin. Run codegen after any schema change:

```bash
bun run codegen               # generate TS/Swift/Kotlin types
bun run codegen:check         # CI check (fails if output is stale)
```

Regenerated output in `packages/protocol/generated/` is gitignored — always run codegen
before committing schema changes.

---

## Adding a New Crypto Operation

Cryptographic operations are implemented once in Rust (`packages/crypto/`) and compiled
to native (Tauri), WASM, and UniFFI (iOS/Android).

1. **Add a domain separation label** to `packages/protocol/crypto-labels.json`
2. Run `bun run codegen` to propagate the label to TS/Swift/Kotlin constants
3. **Implement in Rust** in the appropriate module under `packages/crypto/src/`
4. **Add tests** in the Rust module (`cargo test`)
5. **Add FFI wrapper** in `packages/crypto/src/lib.rs` if needed for mobile
6. **Update `src/client/lib/platform.ts`** (desktop Tauri IPC command)
7. **Update iOS crypto service** in `apps/ios/Sources/Services/CryptoService.swift`
8. **Update Android crypto service** in `apps/android/app/src/main/kotlin/*/crypto/`
9. Run `bun run crypto:test:mobile` to verify FFI bindings

All crypto uses HPKE (RFC 9180 X25519-HKDF-SHA256-AES256-GCM). Never use raw secp256k1 ECIES for new operations.

---

## Adding a New API Endpoint

1. **Add Zod schemas** in `packages/protocol/schemas/` — these generate types for all platforms
2. Run `bun run codegen`
3. **Add route handler** in `apps/worker/routes/`
4. **Add service method** in `apps/worker/services/`
5. **Add client method** in `src/client/lib/api.ts`
6. **Add BDD scenarios** in `tests/features/` (see `bdd-feature-development` skill)
7. **Add iOS/Android client calls** if the feature is needed on mobile

---

## Testing

| Platform | Command | Requirements |
|----------|---------|-------------|
| Backend BDD | `bun run test:backend:bdd` | Backend running (`bun run dev:server`) |
| Desktop E2E | `bun run test` | None (uses Tauri IPC mocks) |
| Typecheck | `bun run typecheck` | None |
| Crypto | `bun run crypto:test` | Rust toolchain |
| iOS unit | `bun run ios:test` | Mac + Xcode |
| Android unit | `bun run test:android` | JDK 17 + Android SDK |

Run `bun run test:all` to orchestrate across all available platforms.

---

## Code Standards

### TypeScript

- Strict mode everywhere — no `any`, no `as` type assertions
- Use `z.infer<typeof Schema>` for types, not manual interfaces that duplicate schemas
- All user-facing strings use `t()` (i18next) — run `bun run i18n:validate:desktop` to check
- Path aliases: `@/*` → `src/client/`, `@worker/*` → `apps/worker/`, `@protocol/*` → `packages/protocol/`

### Rust

- `cargo clippy -- -D warnings` must pass before committing
- All sensitive data implements the `Zeroize` trait
- Every new crypto operation needs a domain separation label from `packages/protocol/crypto-labels.json`
- Never use secp256k1 ECIES — use HPKE (RFC 9180) for all new key wrapping

### Tests

- Assertions test **behavior** (API responses, DB state) — not UI element existence
- Use `data-testid` attributes for Playwright selectors — never `getByRole('button', { name: /.../ })` for fragile matches
- Per-test DB isolation — each test creates its own hub/schema, no shared state
- No `waitForTimeout()` — use `waitFor()` with explicit conditions

---

## Commit Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(worker): add ban list pagination
fix(crypto): correct HKDF label for hub key wrap
docs: update contributing guide for monorepo
test(bdd): add scenario for volunteer shift overlap
```

Version bumps are managed by `knope` automatically — never manually edit `package.json`,
`Cargo.toml`, or platform version files for version bumps.

---

## Security Rules

- **Never commit secrets** — `.dev.vars`, `.env`, and all `.env.*` files are gitignored.
  A pre-commit hook blocks staging them. Even placeholder values look like secrets in git
  history, which is permanent.
- **No raw string literals for crypto contexts** — always use constants from
  `packages/protocol/crypto-labels.json` (generated to TS/Swift/Kotlin via codegen).
- **No secp256k1 ECIES** in new code — use HPKE.
- Private keys never enter the webview — all crypto operations route through Tauri IPC
  to Rust. Always import from `src/client/lib/platform.ts`, never from `@tauri-apps/*` directly.

---

## License

AGPL-3.0-or-later. All contributions must be compatible with this license.
