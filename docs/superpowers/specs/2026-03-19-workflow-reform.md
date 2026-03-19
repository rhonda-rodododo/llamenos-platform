# Workflow Reform: Skills, CLAUDE.md, and Development Patterns

**Date**: 2026-03-19
**Status**: Draft — awaiting workflow agent review findings
**Priority**: Phase 0 — must execute before all other overhaul work

---

## Problem Statement

The project has 15 custom skills in `.claude/skills/`. Several are actively giving Claude wrong instructions:

- `platform-abstraction-development` triggers on "adding new Durable Objects" — DOs were removed
- `backend-api-development` guides toward "DO methods" and "DORouter" — dead architecture
- `bdd-feature-development` was written for the old epic-first workflow — may guide toward test debt
- `test-orchestration` may reference outdated test infrastructure
- `release-deployment` references "wrangler" for backend deployment — wrangler is now marketing-site only

CLAUDE.md has ~260 lines describing a 3-phase BDD workflow, epic-authoring process, and custom skill trigger patterns. This guidance competes with superpowers workflows and creates confusion about which to follow.

The result: Claude gets conflicting instructions, self-corrects in loops, and adds as much complexity as it removes.

---

## Goal

**Claude Code should operate exclusively on superpowers workflows** (brainstorming → writing-plans → executing-plans → verification → code-review) for all new feature work, with domain skills serving only as **supplementary reference material** — not as primary workflow guides.

---

## Skills Audit

### DELETE — Actively harmful (reference obsolete architecture)

| Skill | Why Delete |
|-------|-----------|
| `platform-abstraction-development` | Explicitly triggers on "adding new Durable Objects", "DORouter", "createDONamespace" — DO architecture was removed |
| `backend-api-development` | Triggers on "DO method", "DORouter" — guides toward removed patterns; conflicts with Bun+PostgreSQL backend reality |

### UPDATE — Reference correct but guidance may be stale

| Skill | What to Update |
|-------|---------------|
| `bdd-feature-development` | Remove "Phase 1: API + specs" epic gating. Guide toward behavioral tests only, not implementation tests. Remove DO-aware backend setup. **Also rewrite the trigger description frontmatter itself** — it currently describes a "phased workflow (API+specs -> parallel clients -> integration)". An implementer who only rewrites the body but leaves the trigger will keep routing feature work through the old workflow. The trigger must be rewritten to remove all phased-workflow language. |
| `test-orchestration` | Update to reflect current test infrastructure (no DO-based backends in tests). |
| `release-deployment` | Remove wrangler as backend deploy mechanism. Backend is Bun+PostgreSQL via Docker/Helm. Wrangler is marketing site only. |
| `epic-authoring` | Demote from primary workflow to "optional planning document" — superpowers brainstorming+plans replaces this. **The trigger frontmatter currently says "it's the backbone of this project's development workflow" — this must be changed to position it as an optional supplement to superpowers brainstorming, not a primary entry point.** |

### KEEP — Domain-specific, architecture-neutral, still accurate

| Skill | Why Keep |
|-------|---------|
| `e2ee-envelope-operations` | Crypto implementation details — unchanged, security-critical |
| `tauri-ipc-development` | Tauri IPC chain — unchanged, Tauri still used |
| `telephony-messaging-adapters` | Provider abstraction — unchanged, still relevant |
| `nostr-realtime-events` | Nostr relay patterns — unchanged, still relevant |
| `i18n-string-workflow` | i18n codegen — unchanged, still relevant |
| `cross-platform-feature-port` | Platform porting guide — still accurate |
| `dependency-upgrade` | Upgrade guidance — still accurate |
| `security-audit-pipeline` | Security process — still accurate |

### UPDATE (MINOR) — Mostly accurate but needs a targeted fix

| Skill | What to Update |
|-------|---------------|
| `protocol-schema-change` | Update to note that the TypeScript codegen step should be removed; keep Swift/Kotlin codegen guidance intact. |

---

## CLAUDE.md Overhaul

### Sections to Remove

1. **Feature Development: 3-Phase BDD Workflow** — the custom phase-gating workflow (Epic authoring → Phase 1 API+specs → Phase 2 parallel agents → Phase 3 integration). Replaced by superpowers brainstorming → writing-plans → executing-plans.

2. **DO-related guidance** — any mention of Durable Objects, DORouter, `idFromName()`, DO singletons, `wrangler.jsonc` for backend configuration.

3. **Custom skill trigger descriptions** — the long list of "Use `epic-authoring` when..." patterns. Superpowers decides which skills to use via its own skill discovery.

4. **`apps/worker/` references as backend** — CLAUDE.md needs to clearly document what this directory actually is (Bun+PostgreSQL HTTP server). **Do NOT rename `apps/worker/` to `apps/server/` in this reform.** The `@worker/*` tsconfig alias, wrangler.jsonc paths, and dozens of imports depend on the current directory name. Update descriptions only. Directory rename is a separate epic.

5. **Durable Objects section in architecture table** — 7 DO singletons table needs to be replaced with the actual current backend architecture.

6. **Multi-machine workflow** — the Mac M4 + Linux 192.168.50.95 section is operational state, not architecture guidance. Move to a separate `docs/DEVELOPMENT_SETUP.md`.

### Sections to Rewrite

**Backend Architecture** — Change from CF Workers + 7 DOs to:
```
apps/worker/          # Bun HTTP server (directory name retained — rename is a separate epic)
  routes/             # Hono route handlers
  db/                 # Drizzle ORM schemas + migrations
  services/           # Business logic
  telephony/          # TelephonyAdapter interface + providers
  messaging/          # MessagingAdapter interface + providers
  lib/                # Auth, crypto, utilities
```

**Development Workflow** — Simplify to:
1. New feature → `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:executing-plans`
2. Bug fix → `superpowers:systematic-debugging`
3. Code complete → `superpowers:verification-before-completion` + `superpowers:requesting-code-review`

**Test Philosophy** — Simplify to 3 rules:
1. Tests assert **behavior** (state changes, API responses) — never assert UI element existence
2. Every test is **isolated** — per-test PostgreSQL schema, no shared state
3. Tests must **pass immediately** — no `waitForTimeout()`, use DOM-native waiting only

### Sections to Keep (minimal edits)

- Tech Stack table
- Security Requirements
- Directory Structure
- Key Technical Patterns (crypto, protocol codegen, Tauri IPC mock, mobile crypto, Nostr)
- Gotchas
- Development Commands (update to remove DO/wrangler-backend references)

---

## settings.json Changes

Current enabled plugins:
```json
{
  "frontend-design@claude-plugins-official": true,
  "context7@claude-plugins-official": true,
  "playwright@claude-plugins-official": true,
  "code-review@claude-plugins-official": true,
  "terraform@claude-plugins-official": true
}
```

`terraform` appears to be a leftover from a different project. Remove it unless actively used. **Before removing: verify whether Terraform is actually used by checking for `.tf` files in the project. If no Terraform files exist anywhere in the repo, remove the plugin. If `.tf` files are found, keep it.**

No hooks to remove — settings.json is clean.

---

## Memory File Updates

The following memory entries in `~/.claude/projects/-home-rikki-projects-llamenos/memory/` reference obsolete patterns and need updating:

- `MEMORY.md` — the `## Feature Development Workflow (CRITICAL — follow exactly)` section must be **replaced** with: "Feature development uses superpowers brainstorming → writing-plans → executing-plans. No custom phased BDD workflow."
- `MEMORY.md` references `docs/plans/2026-03-14-case-management-*.md` — these are plan docs from the old workflow, should reference new superpowers specs
- `Multi-Platform Architecture` memory references `apps/worker/` — update description to reflect Bun+PostgreSQL server (but do NOT update the path itself until the directory rename epic is complete)

---

## Implementation Steps

### Step 1: Delete harmful skills (5 minutes)
```bash
rm -rf .claude/skills/platform-abstraction-development/
rm -rf .claude/skills/backend-api-development/
```

### Step 2: Update stale skills (30 minutes each)

For each skill in the UPDATE list: read current content, strip DO references, update to current architecture, rewrite trigger descriptions to be superpowers-compatible.

**Important for `bdd-feature-development`**: rewrite both the trigger frontmatter and the body. The trigger description must not retain any "phased workflow" language.

**Important for `epic-authoring`**: the trigger frontmatter must be rephrased to position the skill as an optional supplement to superpowers brainstorming, not a primary workflow entry point.

**Do NOT rename `apps/worker/` to `apps/server/` in this reform.** The `@worker/*` tsconfig alias, wrangler.jsonc paths, and dozens of imports depend on it. Update text descriptions only. Directory rename is a separate epic.

### Step 3: Rewrite CLAUDE.md (~2 hours)

Produce a new CLAUDE.md that:
- Has accurate architecture description (Bun+PostgreSQL, not CF Workers)
- Has the simplified 3-rule test philosophy
- Uses superpowers workflow as the canonical development process
- Retains all gotchas, tech stack, security requirements, key patterns
- Is ~40% shorter than the current version (remove operational runbook content)
- References `apps/worker/` by its current directory name with an accurate description (Bun HTTP server, not CF Worker)

### Step 4: Update settings.json

Check for `.tf` files in the project. If none exist, remove `terraform@claude-plugins-official`. If `.tf` files are found, retain the plugin.

### Step 5: Update memory files

Replace the `## Feature Development Workflow (CRITICAL — follow exactly)` section in MEMORY.md with: "Feature development uses superpowers brainstorming → writing-plans → executing-plans. No custom phased BDD workflow."

Remove or update any other stale memory entries referencing the 3-phase BDD workflow as canonical process.

### Step 6: Commit

Single commit: "chore: workflow reform — align Claude guidance with current architecture"

---

## Success Criteria

- [ ] `platform-abstraction-development` and `backend-api-development` skills deleted
- [ ] `bdd-feature-development` updated with no DO references, behavioral-test-only guidance, **and trigger frontmatter rewritten to remove all phased-workflow language**
- [ ] `epic-authoring` trigger frontmatter repositioned as optional supplement, not primary workflow
- [ ] `protocol-schema-change` updated to note TypeScript codegen step removal (Swift/Kotlin guidance retained)
- [ ] CLAUDE.md has zero references to Durable Objects (except in the "removed in epic X" historical note)
- [ ] CLAUDE.md describes superpowers as the primary development workflow
- [ ] CLAUDE.md describes `apps/worker/` with accurate description (Bun+PostgreSQL HTTP server) — **directory NOT renamed in this epic**
- [ ] `terraform` plugin removed from settings.json if no `.tf` files exist in the repo
- [ ] `## Feature Development Workflow (CRITICAL — follow exactly)` section in MEMORY.md replaced with single-line superpowers reference
- [ ] All other memory entries referencing old architecture updated
