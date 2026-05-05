# DX: mise Integration & Contributor Onboarding

**Date**: 2026-05-05  
**Status**: Ready to implement  
**Scope**: Root config files, docs (README.md, CONTRIBUTING.md), `.mise.toml`  

---

## Problem Statement

New contributors to the Llamenos monorepo face a high-friction setup experience:

1. **No tool version pinning at dev time** — Rust 1.85.0 is pinned in `apps/desktop/rust-toolchain.toml`, but Bun is only pinned in CI (v1.3.5). A new developer might install any version of Bun and hit incompatibilities.
2. **Stale CONTRIBUTING.md** — still describes a three-repo model (`llamenos`, `llamenos-core`, `llamenos-mobile`) that was consolidated into this monorepo. New contributors clone the wrong thing or follow wrong steps.
3. **README.md references stale workflows** — `bun run dev:worker` doesn't exist (it's `bun run dev:server`), links to Cloudflare Workers deployment that is no longer the primary backend, and the architecture section references `src-tauri/` instead of `apps/desktop/`.
4. **No "first 5 minutes" path** — `scripts/dev-setup.sh` is excellent but undiscovered. There's no obvious entry point from README → setup → running tests.
5. **No mise.toml** — contributors who use mise (increasingly common in polyglot projects) have no version declarations to activate.

---

## Goals

1. **Zero ambiguity on tool versions** — a new contributor installs mise, runs `mise install`, and has exact versions of Bun and Java. Rust is handled by `rust-toolchain.toml` files (mise respects them).
2. **Useful mise tasks** — `mise run setup`, `mise run dev`, `mise run test` as discoverable entry points that delegate to existing `bun run` scripts.
3. **Accurate CONTRIBUTING.md** — describes the actual monorepo, correct commands, correct file paths.
4. **Welcoming README.md** — clear quick-start for end users AND a separate contributor path. Fix all stale references.

---

## 1. mise.toml Configuration

### 1.1 Tool pinning strategy

| Tool | Version | Rationale |
|------|---------|-----------|
| `bun` | `1.3.5` | Match CI (`bun-version: 1.3.5` in `.github/workflows/ci.yml`) |
| `java` | `temurin-17.0` | Android SDK requires JDK 17; Temurin is the standard OpenJDK |
| `rust` | not pinned | Delegated to `apps/desktop/rust-toolchain.toml` (1.85.0) and `packages/crypto/rust-toolchain.toml` (stable); mise respects these files automatically |
| `node` | not pinned | Bun is the runtime; no separate Node.js needed |

**Why not pin Rust in mise.toml?** Two workspace members require different Rust channels (desktop pins 1.85.0; crypto uses `stable` for broader target support). `rust-toolchain.toml` per workspace already handles this correctly and is respected by both rustup and mise. Adding a root-level pin would conflict.

### 1.2 Environment

No secrets in `.mise.toml`. The `[env]` section will only set non-secret development defaults:

```toml
[env]
ENVIRONMENT = "development"
```

Secrets (ADMIN_PUBKEY, telephony credentials, etc.) remain in `.dev.vars` per the existing pattern.

### 1.3 Tasks

mise tasks are **discovery helpers** — they do not replace `bun run` scripts. CI, existing contributors, and automation all continue to use `bun run`. Tasks wrap the most common workflows to reduce the "what command do I run?" friction for new contributors.

**Task inventory**:

| Task | Command | Purpose |
|------|---------|---------|
| `setup` | `scripts/dev-setup.sh` | Full prerequisite check + `bun install` |
| `dev` | starts docker services + `bun run dev:server` | One-command local dev |
| `dev:desktop` | `bun run tauri:dev` | Tauri desktop dev |
| `test` | `bun run test` | Playwright E2E |
| `test:backend` | `bun run test:backend:bdd` | Backend BDD tests |
| `typecheck` | `bun run typecheck` | TypeScript type check |
| `build` | `bun run build` | Vite build |
| `codegen` | `bun run codegen` | Protocol type codegen |
| `lint` | `bun run lint` | ESLint |

Tasks for platform-specific work (iOS, Android, crypto) are intentionally omitted — they have complex platform requirements and the `bun run ios:*` / `bun run test:android` scripts are already documented in CLAUDE.md.

### 1.4 .mise.local.toml (gitignored)

A `.gitignore` entry for `.mise.local.toml` allows developers to override tool versions locally without affecting the project. This file is already added to `.gitignore` pattern `.*.local.*`.

---

## 2. CONTRIBUTING.md Rewrite

The current CONTRIBUTING.md must be rewritten from scratch. Key changes:

### Current problems
- References 3 separate repos (consolidated 12+ months ago)
- References `llamenos-core/`, `llamenos-mobile/` paths that don't exist in this repo
- References `Detox` for mobile testing (replaced by Kotlin Compose tests + XCUITest)
- References `dev:worker` (Wrangler) as backend command
- References `src-tauri/` path (now `apps/desktop/`)
- References `@noble/curves/secp256k1` ECIES (replaced by HPKE in `packages/crypto/`)

### New content structure
1. **Prerequisites** — what you need before cloning
2. **Quick setup** — `mise install && bun install` or just `bun install` + `scripts/dev-setup.sh`
3. **Development areas** — pick your area (backend, desktop, iOS, Android, crypto) with a short path to running
4. **Adding features** — updated crypto operation checklist for monorepo paths
5. **Testing** — per-platform test commands
6. **Code standards** — TypeScript strict, Rust clippy, no `any`/`as`, `data-testid` selectors
7. **Commit conventions** — conventional commits
8. **Security** — never commit secrets
9. **License** — AGPL-3.0-or-later

---

## 3. README.md Updates

The README serves two audiences: **operators** (deploying the app) and **contributors** (developing it). Currently it only serves operators reasonably well.

### Specific fixes required

| Current (broken/stale) | Fixed |
|------------------------|-------|
| `bun run dev:worker` | `bun run dev:server` |
| `cd ../llamenos-core && cargo test` | `bun run crypto:test` |
| Architecture section shows `src-tauri/`, `src/worker/` | Update to actual monorepo structure |
| Quick Start says `cp .dev.vars.example .dev.vars` but Step 4 shows `bun run dev:worker` | Fix Step 4 to show `bun run dev:server` |
| Prerequisites: "Rust (for Tauri desktop builds)" | Make clear Rust is only needed for desktop/crypto work |
| No mention of `scripts/dev-setup.sh` | Add to Quick Start |
| No Contributing section | Add with link to CONTRIBUTING.md |

### New "Contributing" section in README

A short section pointing to CONTRIBUTING.md, with a 3-line quick path:

```bash
mise install          # or: see CONTRIBUTING.md for manual prerequisites
bun install
bun run dev:server    # backend
```

---

## 4. .dev.vars.example Audit

The existing `.dev.vars.example` is minimal (4 vars). It should be accurate. Current state is fine — no changes needed.

---

## Decisions to Review

### Decision 1: mise tasks supplement vs replace package.json scripts

**Chosen**: Supplement. mise tasks call `bun run <script>` or delegate to shell scripts.

**Why**: `bun run` is the canonical interface used by CI, existing contributors, and CLAUDE.md. Replacing it would require updating CI, CLAUDE.md, and all documentation in parallel, with no user-facing benefit. mise adds discoverability via `mise run --list` without breaking anything.

**Alternative**: Replace `bun run` scripts with mise tasks as the single source of truth. Rejected because it would require CI workflow changes and break existing contributor muscle memory.

### Decision 2: Rust pinning via mise vs rust-toolchain.toml

**Chosen**: Delegate to `rust-toolchain.toml` files. No `rust` entry in `.mise.toml`.

**Why**: Two sub-workspaces need different channels (1.85.0 for desktop, `stable` for crypto). `rust-toolchain.toml` is rustup's native mechanism and is automatically respected by mise. A single root-level Rust pin would require unifying these channels or using workspace-level mise overrides, adding complexity with no benefit.

**Alternative**: Pin `rust = "1.85.0"` in mise.toml and also keep rust-toolchain.toml. Rejected — redundant and confusing if they diverge.

### Decision 3: Scope of CONTRIBUTING.md rewrite

**Chosen**: Full rewrite to monorepo reality.

**Why**: The current CONTRIBUTING.md is dangerously stale — a contributor following it would clone repos that don't exist, run paths that don't work, and use crypto patterns that are now wrong (ECIES → HPKE). Incremental patches would miss the structural problem.

**Alternative**: Append a "MONOREPO NOTE: ignore the above, use these commands instead" section. Rejected — creates two competing sources of truth in one file.

### Decision 4: Java version (17 vs 21)

**Chosen**: `java = "temurin-17.0"` 

**Why**: Android Gradle Plugin 9.1.0 + Kotlin 2.3.0 officially supports JDK 17. JDK 21 should also work but 17 is the tested baseline. When the project upgrades to AGP 9.x+ with JDK 21 support confirmed, this can be bumped.

**Alternative**: `java = "temurin-21.0"`. Not chosen — no confirmed compatibility testing; potential Gradle/AGP issues.
