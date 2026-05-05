# Plan: DX — mise Integration & Contributor Onboarding

**Date**: 2026-05-05  
**Spec**: `docs/superpowers/specs/2026-05-05-dx-mise-onboarding.md`  
**Branch**: `feat/dx-mise-onboarding`  

---

## Task 1: Create `.mise.toml`

**File**: `/.mise.toml` (root)

Content:
- `[tools]`: `bun = "1.3.5"`, `java = "temurin-17.0"`
- `[env]`: `ENVIRONMENT = "development"`
- `[tasks]`: setup, dev, dev:desktop, test, test:backend, typecheck, build, codegen, lint

No Rust pin — delegated to `apps/desktop/rust-toolchain.toml` and `packages/crypto/rust-toolchain.toml`.

---

## Task 2: Update `.gitignore`

Add `.mise.local.toml` to `.gitignore` if not already present.

---

## Task 3: Rewrite `CONTRIBUTING.md`

Full rewrite. New sections:
1. Prerequisites
2. Quick setup (mise path + manual path)
3. Development areas (Backend, Desktop, iOS, Android, Crypto — with commands for each)
4. Adding crypto operations (updated for monorepo paths + HPKE)
5. Adding API endpoints (updated for monorepo paths)
6. Testing guide (per platform)
7. Code standards (TS strict, Rust clippy, no `any`/`as`)
8. Commit conventions
9. Security rules
10. License (AGPL-3.0-or-later)

---

## Task 4: Update `README.md`

Targeted fixes:
1. Fix `bun run dev:worker` → `bun run dev:server` in Development section
2. Fix `cd ../llamenos-core && cargo test` → `bun run crypto:test`
3. Update Architecture section paths to match actual monorepo structure
4. Update Security model to reflect HPKE (not ECIES), Ed25519/X25519 (not nsec/npub bech32)
5. Update Quick Start Step 4 to use `bun run dev:server`
6. Add Prerequisites note: Rust only needed for desktop/crypto work
7. Add `scripts/dev-setup.sh` mention in Quick Start
8. Add "Contributing" section pointing to CONTRIBUTING.md

---

## Verification

After implementation:
- `cat .mise.toml` — confirm tool pins and tasks are present
- `mise run --list` (if mise installed) — confirm tasks show up
- `bun run dev:server` — confirm existing scripts still work (no regressions)
- `bun run typecheck` — no TypeScript errors from any changes
- Review CONTRIBUTING.md for accuracy against actual repo state
