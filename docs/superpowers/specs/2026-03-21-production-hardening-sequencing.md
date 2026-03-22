---
title: Production Hardening & Overhaul Sequencing
date: 2026-03-21
status: approved
---

# Production Hardening & Overhaul Sequencing

## Goal

Harden the Llamenos codebase in all directions for production stability and readiness for new features. No merges to `main` — all work lands on the `desktop` branch (which will become a new repo).

---

## Actual State as of 2026-03-21

### Track 2 — Architectural Overhaul: **COMPLETE**

All seven 2026-03-19 overhaul plans were already substantially implemented before this sequencing spec was written. The following are confirmed done in the codebase:

- `backend-dead-code-cleanup` — dead code removed
- `api-surface-simplification` — CRUD surface clean
- `codegen-pipeline-overhaul` — TS codegen output removed; `z.infer<>` is canonical
- `workflow-reform` — skill files + CLAUDE.md updated
- `user-pbac-alignment` — volunteer→user rename complete across all layers
- `type-system-unification` — `& {}` patterns eliminated
- `test-infrastructure-overhaul` — test isolation clean

No further work required on Track 2.

### Recent Security Commits Already Applied

The following security findings were fixed directly on `desktop` before Track 1 agents run:

- `9a28418` — desktop Tauri IPC hardening (nsec/secretKeyHex removed from IPC boundary)
- `3fd49a4` — hub from call record, opaque call tokens for callbacks (CRIT-W1/W2)

Track 1 agents must read their respective plans carefully and skip items already addressed by these commits.

---

## Track 1: Security Remediation (Parallel Agents)

**Status: Pending — needs to run.**

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
| 2nd | `sec/worker` | `2026-03-21-security-worker-hub` | HIGH-W1 (serverEventKeyHex — implement `settings:manage` gate, flag for human review), HIGH-H5 (add `hubId` to `WakePayload` in `types/infra.ts`). Note: CRIT-W1/W2 already committed (3fd49a4) — skip. |
| 3rd | `sec/desktop` | `2026-03-21-security-desktop-tauri` | CSP hardening, Stronghold PIN counter migration, dead command cleanup from isolation allowlist. Note: nsec IPC boundary fix already committed (9a28418) — skip. |
| 4th | `sec/mobile` | `2026-03-21-security-mobile-ios-android` | Plaintext push log removal, crash reporter fallback hardening. Note: Tasks 7 & 8 (hub switch race conditions) already fixed — skip. Wake label mismatch already resolved (`llamenos:push-wake` is consistent everywhere) — skip. |
| 5th | `sec/cicd` | `2026-03-21-security-cicd-supply-chain` | Docker digest pins in `Dockerfile` + compose files, Dependabot Docker ecosystem entry, Helm/Ansible image refs, `load-test.yml` lockfile flag. Note: CRIT-CI1 and MED-CI3 already fixed — skip. |

> **HIGH-W1 review gate:** The `sec-worker` agent implements the `settings:manage` permission gate for `serverEventKeyHex` as specified in the plan and marks the commit clearly with `[REVIEW-NEEDED: HIGH-W1]`. **Human review of this decision must occur before Track 1's final gate is run.** Do not proceed to the final BDD suite until the human has confirmed or revised the approach.

> **Multi-hub axiom constraint:** No security fix may gate incoming call or notification handling on active hub state. Any user can be a member of multiple hubs simultaneously and must receive calls/notifications from ALL member hubs regardless of which hub is currently active in the UI. Active hub is a browsing-context-only concept.

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

## Phase 2: New Feature & Polish Specs (after Track 1 complete)

Ten new specs written 2026-03-21, covering genuine gaps found during exhaustive codebase audit. Each spec needs an implementation plan written before execution.

### Group A — Hardening / Infrastructure (no feature dependencies)

These can be implemented independently and in parallel where possible.

| # | Spec | Summary |
|---|------|---------|
| A1 | `2026-03-21-hardening-final` | Hub key routing fix (use hubId to select correct hub key); CI codegen:check gate; delete generated/typescript/; env var startup validation; multi-hub axiom documented in CLAUDE.md + PROTOCOL.md |
| A2 | `2026-03-21-code-quality` | Offline queue plaintext race condition fix; 280 empty catch blocks; CORS_ALLOWED_ORIGINS env var; Asterisk webhook URL fix; type assertion audit |
| A3 | `2026-03-21-ios-polish` | Deep link navigation; semaphore → async/await; hardcoded keypair → XCTEST_VOLUNTEER_SECRET env var; print() → Logger |
| A4 | `2026-03-21-events-architecture` | Fix Android events (wrong API, empty envelopes); add Desktop event API functions; consolidate around /events |

### Group B — CMS Completions (depend on existing CMS infrastructure)

These build on the existing CMS system and can run in parallel within the group.

| # | Spec | Summary |
|---|------|---------|
| B1 | `2026-03-21-cms-smart-assignment` | Specialization scoring fix; auto-assignment wired to record creation; user profile fields (maxCaseAssignments, specializations) |
| B2 | `2026-03-21-cms-automation` | Contact notification client API + trigger; case assignment push dispatch; report-to-case conversion endpoint |
| B3 | `2026-03-21-cms-field-types` | Location field rendering on all platforms + geocoding; file field on iOS + Android |
| B4 | `2026-03-21-cms-contact-management` | Contact CRUD on mobile; relationships/groups write API; contact merge + case merge endpoints |
| B5 | `2026-03-21-cms-advanced-ui` | Evidence custody chain UI; ReportTypeFieldsEditor; cross-hub case visibility (super-admin allHubs) |

### Group C — Cross-Hub Network (largest scope, depends on A1)

| # | Spec | Summary |
|---|------|---------|
| C1 | `2026-03-21-cross-hub-network-capabilities` | Architecture docs + PROTOCOL.md update; cross-hub ban propagation; user suspension suggestions; multi-hub SIP registration; mutual aid fallback ring groups; network emergency broadcast; cross-hub audit |

### Ordering within Phase 2

- A1 (hardening-final) must land first — it establishes the multi-hub axiom documentation and hub key routing fix that other features depend on
- A2, A3, A4 can run concurrently with A1 (no conflicts)
- B1–B5 can run concurrently (they touch different CMS subsystems)
- C1 should start after A1 is complete (multi-hub axiom docs must exist before implementing cross-hub features)

---

## Branch Strategy

- All work targets `desktop` branch (no merges to `main`)
- Track 1 agents: each gets an isolated worktree, merges back into `desktop` in merge order
- Phase 2: implementation plans will specify worktree or direct commit strategy per spec

The `desktop` branch will become a new repository — `main` is not a target.

---

## Out of Scope

- Merging to `main`
- Minor code stubs (location picker UI, SSL pin placeholders) — tracked in code comments
