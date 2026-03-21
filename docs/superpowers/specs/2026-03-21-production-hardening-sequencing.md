---
title: Production Hardening & Overhaul Sequencing
date: 2026-03-21
status: approved
---

# Production Hardening & Overhaul Sequencing

## Goal

Harden the Llamenos codebase in all directions for production stability and readiness for new features. No merges to `main` — all work lands on the `desktop` branch (which will become a new repo). Two parallel tracks run concurrently: security remediation and architectural overhaul.

## Overall Structure

Two tracks, both targeting the `desktop` branch:

- **Track 1 — Security:** Five existing security plans dispatched as parallel subagents in isolated git worktrees. Merges back into `desktop` in defined order after each agent's verification gate passes.
- **Track 2 — Overhaul:** Seven existing overhaul plans executed sequentially in the main worktree. Each plan commits before the next begins.

**Concurrency constraint:** Both tracks may run concurrently for steps 1–4 of Track 2. However, **Track 2 Step 5 (`user-pbac-alignment`) must not begin until all five Track 1 worktrees have merged back into `desktop`** — both tracks modify `apps/worker/routes/auth.ts`, `apps/worker/middleware/auth.ts`, and `apps/worker/lib/auth.ts`.

---

## Track 1: Security Remediation (Parallel Agents)

Five plans dispatched simultaneously, each in an isolated git worktree branched from `desktop`.

### Worktree naming convention

```bash
git worktree add ../llamenos-sec-crypto -b sec/crypto
git worktree add ../llamenos-sec-worker -b sec/worker
git worktree add ../llamenos-sec-desktop -b sec/desktop
git worktree add ../llamenos-sec-mobile -b sec/mobile
git worktree add ../llamenos-sec-cicd -b sec/cicd
```

Each agent works in its own directory. On completion, the branch is merged into `desktop` in the order below.

### Agents & merge order

| Merge order | Branch | Plan | Key remaining work |
|------------|--------|------|--------------------|
| 1st | `sec/crypto` | `2026-03-21-security-crypto-rust-crate` | HIGH-C4 (doc comment + `debug_assert` on `xonly_to_compressed`), MED-C items, test vectors |
| 2nd | `sec/worker` | `2026-03-21-security-worker-hub` | HIGH-W1 (serverEventKeyHex — implement `settings:manage` gate, flag for human review), HIGH-H5 (add `hubId` to `WakePayload` in `types/infra.ts`) |
| 3rd | `sec/desktop` | `2026-03-21-security-desktop-tauri` | CSP hardening, Stronghold PIN counter migration, dead command cleanup from isolation allowlist. Note: nsec IPC boundary fix already committed (9a28418) — desktop agent reads the plan carefully and skips already-done items. |
| 4th | `sec/mobile` | `2026-03-21-security-mobile-ios-android` | Plaintext push log removal, crash reporter fallback hardening. Note: Tasks 7 & 8 (hub switch race conditions) already fixed — skip. Wake label mismatch already resolved (`llamenos:push-wake` is consistent everywhere) — skip. |
| 5th | `sec/cicd` | `2026-03-21-security-cicd-supply-chain` | Docker digest pins in `Dockerfile` + compose files, Dependabot Docker ecosystem entry, Helm/Ansible image refs, `load-test.yml` lockfile flag. Note: CRIT-CI1 and MED-CI3 already fixed — skip. |

> **HIGH-W1 review gate:** The `sec-worker` agent implements the `settings:manage` permission gate for `serverEventKeyHex` as specified in the plan and marks the commit clearly with `[REVIEW-NEEDED: HIGH-W1]`. **Human review of this decision must occur before Track 1's final gate is run.** Do not proceed to the final BDD suite until the human has confirmed or revised the approach.

### Per-agent verification gate (before merging back to `desktop`)

| Agent | Commands |
|-------|----------|
| All agents | `bun run typecheck && bun run build` |
| `sec-crypto` | additionally: `cargo test --manifest-path packages/crypto/Cargo.toml --features mobile` |
| `sec-desktop` | additionally: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| `sec-worker` | additionally: `bun run test:backend:bdd` |
| `sec-mobile` | additionally: `./gradlew testDebugUnitTest && ./gradlew lintDebug` (iOS tested at Track 1 final gate via `ssh mac` — cannot run in agent worktree) |
| `sec-cicd` | no additional tests (YAML-only changes) |

### Track 1 final gate (all 5 merged + HIGH-W1 reviewed, run once)

- Human sign-off on HIGH-W1 (`serverEventKeyHex` scoping) confirmed
- `bun run test:backend:bdd`
- `bun run test` (Playwright E2E)
- `bun run test:android` (unit + lint)
- Android Cucumber E2E — **requires connected device or running emulator**
- iOS XCTest + XCUITest (via `ssh mac`)

All suites must be green before Track 1 is declared complete.

---

## Track 2: Architectural Overhaul (Sequential)

Seven existing plans executed in strict dependency order, committing to `desktop` after each step. Steps 1–4 may run while Track 1 agents are working. **Step 5 must wait for all Track 1 merges.**

| Step | Plan | Rationale |
|------|------|-----------|
| 1 | `2026-03-19-backend-dead-code-cleanup` | Remove DO-era dead code — clears false signals for agents working the rename |
| 2 | `2026-03-19-api-surface-simplification` | CRUD factory works best on a clean surface, before the rename touches all route files |
| 3 | `2026-03-19-codegen-pipeline-overhaul` | Remove TS codegen output; makes `z.infer<>` canonical before type unification |
| 4 | `2026-03-19-workflow-reform` | Update skill files + CLAUDE.md — zero risk, done before agents run the rename |
| 5 ⚠️ | `2026-03-19-user-pbac-alignment` | **Wait for all Track 1 merges.** Rename volunteer→user across all layers |
| 6 | `2026-03-19-type-system-unification` | Eliminate `& {}` patterns; benefits from rename being complete |
| 7 | `2026-03-19-test-infrastructure-overhaul` | Test isolation cleanup last — benefits from all prior changes being stable |

Task counts in each plan are approximate (±1 due to counting methodology) — do not use them to verify completion. Use the plan's own checklist.

### Per-step verification gate

- Steps 1–4: `bun run typecheck && bun run build` — must pass before committing and starting next plan
- Steps 5–7: additionally `bun run test:backend:bdd` — these touch the API surface

---

## Branch & Worktree Strategy

- All work targets `desktop` branch (no merges to `main`)
- Track 1 agents: each gets an isolated worktree (see naming convention above), merges back into `desktop` in merge order
- Track 2: commits directly to `desktop` sequentially

The `desktop` branch will become a new repository — `main` is not a target.

---

## Out of scope

- Merging to `main`
- The geocoding plan (2026-03-21) — already substantially committed, checkboxes only
- Minor code stubs (location picker UI, file attachment on mobile, SSL pin placeholders) — tracked in code comments, not part of this effort
