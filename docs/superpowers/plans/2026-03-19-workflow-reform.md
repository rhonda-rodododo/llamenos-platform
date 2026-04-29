# Workflow Reform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all DO-era and 3-phase-BDD guidance from skills, CLAUDE.md, and memory files so Claude operates exclusively on superpowers workflows.
**Architecture:** Five skill files rewritten in place, CLAUDE.md condensed by ~40% with accurate Bun+PostgreSQL backend description, memory MEMORY.md `## Feature Development Workflow` section replaced with a single-line superpowers reference.
**Tech Stack:** Plain Markdown edits — no build system, no codegen.

---

### Task 1: Update `bdd-feature-development` skill

**Files:**
- Modify: `.claude/skills/bdd-feature-development/SKILL.md`

- [ ] Replace the frontmatter `description` block. Current text starts with `"Guide BDD-driven feature development... using the phased workflow (API+specs -> parallel clients -> integration)"`. Replace with:
  ```yaml
  description: >
    Guide BDD test writing for the Llamenos monorepo. Use this skill when writing Gherkin
    feature files, creating backend or desktop step definitions, debugging test failures,
    or when the user mentions "BDD", "feature file", "Gherkin", "step definition",
    "backend BDD", "test:backend:bdd", "behavioral test", "write tests first",
    "add test coverage", "tests broke", "fix tests", or "E2E testing". This skill
    supplements superpowers brainstorming and plan execution — it does not replace them.
    Use it for BDD-specific implementation detail, not as a workflow entry point.
  ```
- [ ] Remove the entire `## The 3-Phase Workflow` section (lines 22–57 in current file including `### Phase 1`, `### Phase 2`, `### Phase 3`).
- [ ] Remove the `## When Tests Fail` subsections that reference `During Phase 1` and `During Phase 2` framing. Replace with a flat section:
  ```markdown
  ## When Tests Fail

  1. **Backend BDD failures** — the API implementation is wrong → fix the backend code. If the scenario itself is wrong → fix the scenario.
  2. **Desktop step failures** — wrong selector → update selector. UI doesn't reflect behavior → implement the missing behavior.
  3. **After merge (regression)** — check if the scenario is still valid. If yes → fix the implementation. If obsolete → update the scenario AND the AC it maps to. NEVER delete a scenario without updating the corresponding AC.
  ```
- [ ] Remove the `## Running Tests` section's `### Backend BDD Setup` subsection that references `bun run dev:node` and replace the single `dev:node` reference with `dev:server`:
  ```bash
  # 2. Start app locally (auto-reloads on code changes)
  bun run dev:server
  ```
- [ ] Commit: `git commit -m "chore(skills): rewrite bdd-feature-development — remove phased workflow, fix dev:server command"`

---

### Task 2: Update `epic-authoring` skill

**Files:**
- Modify: `.claude/skills/epic-authoring/SKILL.md`

- [ ] Replace the frontmatter `description` block. Current text ends with `"it's the backbone of this project's development workflow with 275+ epics written."` Replace the entire description with:
  ```yaml
  description: >
    Write epic planning documents for the Llamenos monorepo. Use this skill when creating
    epic files in docs/epics/, decomposing audit findings into work items, or when the user
    mentions "epic", "write an epic", "create epics", "implementation plan", "break it down",
    "roadmap", "scope out", "spec out", "design doc", or describes a batch of work that needs
    structured decomposition. Also use when updating NEXT_BACKLOG.md or COMPLETED_BACKLOG.md.
    This skill is an optional supplement to superpowers brainstorming — use it when the user
    explicitly wants epic documents, not as the primary entry point for feature planning.
  ```
- [ ] Remove the `### BDD-First Feature Epics (DEFAULT for all new features)` subsection under `## Domain Templates` (lines 180–199 in current file) — this subsection encodes the 3-phase phased workflow. Replace it with a short note:
  ```markdown
  ### Feature Epics

  Structure by platform layer:
  1. **Shared** (protocol schema, i18n strings)
  2. **Backend** (`apps/worker/` routes, services)
  3. **Desktop** (React components, platform.ts)
  4. **iOS** (SwiftUI views, services)
  5. **Android** (Compose screens, repositories)

  Include BDD scenarios in acceptance criteria but do not impose phase-gating order —
  implementation sequence is determined by the executing plan, not the epic.
  ```
- [ ] Remove the `## Batch Workflow: Phased Implementation` section (lines 207–220 in current file). This section describes the old 3-phase approach. Remove it entirely.
- [ ] In the `### Deep Self-Review` section, remove item `### 11. Verify Phase Separation` (lines 314–317) which references "Phase 1 files" and "Phase 2 files". Remove it and renumber remaining items.
- [ ] Remove item `### 12. Verify Backend BDD Feasibility` (lines 319–325) and renumber.
- [ ] In the `### Cross-Platform Feature Epics` domain template, change the step `2. **Backend** (worker endpoints, DO methods)` to `2. **Backend** (worker routes, service methods)`.
- [ ] Commit: `git commit -m "chore(skills): rewrite epic-authoring — demote from primary workflow, remove 3-phase BDD structure"`

---

### Task 3: Update `test-orchestration` skill

**Files:**
- Modify: `.claude/skills/test-orchestration/SKILL.md`

- [ ] In the `## Platform: Desktop (Playwright)` section, find the prerequisites line `Backend (for full E2E): dev compose + \`bun run dev:node\` (see "Local Backend Setup" below)`. Change `dev:node` to `dev:server`.
- [ ] In the `## Platform: Backend BDD` section, find the `### Prerequisites — Dev Compose + Local App` code block. Change:
  ```bash
  # 2. Start app locally (auto-reloads on code changes via --watch)
  bun run dev:node
  ```
  to:
  ```bash
  # 2. Start app locally (auto-reloads on code changes via --watch)
  bun run dev:server
  ```
- [ ] In the same section, change the inline description `Always use dev compose (backing services) + \`bun run dev:node\` (app with file watching):` to use `dev:server`.
- [ ] In `## Local Backend Setup`, change both occurrences of `bun run dev:node` to `bun run dev:server`. There are two: one in the main code block and one in the `Stop app: Ctrl+C (or bun run dev:node:stop)` comment. Update the comment to `(or bun run dev:server:stop)` or simply remove the parenthetical.
- [ ] Remove the `## Platform: Worker` subsection's comment `Worker tests use Vitest and don't require external services (Durable Object stubs).` — replace with `Worker tests use Vitest and don't require external services.`
- [ ] In `## Platform: Worker`, remove the debugging note `- \`wrangler dev\` can take a while to start — "Broken pipe" errors are transient noise` since wrangler is marketing-site only. Replace with: `- Worker integration tests run directly via Vitest — no wrangler needed.`
- [ ] Commit: `git commit -m "chore(skills): update test-orchestration — fix dev:server command, remove wrangler/DO references"`

---

### Task 4: Update `release-deployment` skill

**Files:**
- Modify: `.claude/skills/release-deployment/SKILL.md`

- [ ] In the `## Primary: Docker Compose (deploy/docker/)` services table, find the `postgres` row which currently reads `DO storage (kv_store + alarms)` in the Purpose column. Replace that cell with `Primary database (Drizzle ORM, Bun SQL)`.

  Current row:
  ```
  | postgres | postgres:16 | DO storage (kv_store + alarms) | internal |
  ```
  Replace with:
  ```
  | postgres | postgres:16 | Primary database (Drizzle ORM, Bun SQL) | internal |
  ```
- [ ] Commit: `git commit -m "chore(skills): fix release-deployment — correct postgres purpose description"`

---

### Task 5: Update `protocol-schema-change` skill

**Files:**
- Modify: `.claude/skills/protocol-schema-change/SKILL.md`

- [ ] In the `## Architecture` code block at the top, change `schemas/              # 30+ Zod schema files (SOURCE OF TRUTH)` to `schemas/              # 80+ Zod schema files (SOURCE OF TRUTH)`.
- [ ] Remove the `### TypeScript Post-Processor` section from `## Codegen Pipeline Details` (current lines 145–147):
  ```markdown
  ### TypeScript Post-Processor

  Minimal — adds header comment. quicktype's `just-types: 'true'` mode generates clean interfaces.
  ```
  Remove this section entirely — TypeScript consumers use `z.infer<typeof Schema>` directly, not generated types.
- [ ] In `### Step 5: Update Platform Consumers`, remove the `**Desktop (TypeScript)**` bullet that describes importing generated types:
  ```markdown
  **Desktop (TypeScript)** — imports generated types or Zod schemas:
  - Update components, hooks, platform.ts crypto operations
  ```
  Replace with:
  ```markdown
  **Desktop/Worker (TypeScript)** — uses `z.infer<typeof Schema>` directly from `@protocol/schemas`:
  - Update route handlers, components, hooks, platform.ts crypto operations
  - No generated TypeScript types — import Zod schemas and infer types at compile time
  ```
- [ ] In the `## Architecture` code block, remove the line `typescript/types.ts        # ~78 KB TypeScript interfaces` from the `generated/` listing since TypeScript consumers no longer use generated types. Remove:
  ```
      typescript/types.ts        # ~78 KB TypeScript interfaces
      typescript/crypto-labels.ts
  ```
  Keep the swift/ and kotlin/ entries.
- [ ] Commit: `git commit -m "chore(skills): update protocol-schema-change — remove TS codegen step, update schema count to 80+"`

---

### Task 6: Rewrite CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

The current file is 309 lines. Target is approximately 185 lines (~40% reduction).

- [ ] **Section: Multi-Platform Architecture table** — update the `apps/worker/` row from `Cloudflare Worker backend` to `Bun HTTP server (Hono + PostgreSQL; directory name retained — rename is separate epic)`.

- [ ] **Section: Tech Stack** — update the `Deployment` line. Current: `Cloudflare (Workers, DOs, Tunnels), billed to EU/GDPR-compatible account`. Replace with: `Docker Compose / Helm (VPS self-hosted), Cloudflare Tunnels for ingress. EU/GDPR-compatible.`

- [ ] **Section: Directory Structure** — replace the `worker/` subtree block. Current:
  ```
    worker/             # Cloudflare Worker backend
      durable-objects/  # 7 DOs: IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO, BlastDO
      telephony/        # TelephonyAdapter interface + 5 adapters
      messaging/        # MessagingAdapter interface + SMS, WhatsApp, Signal adapters
      lib/              # Server utilities (auth, crypto, webauthn, do-router)
      wrangler.jsonc    # Worker + DO bindings config
  ```
  Replace with:
  ```
    worker/             # Bun HTTP server (Hono + PostgreSQL; directory name retained — rename is separate epic)
      routes/           # Hono route handlers
      db/               # Drizzle ORM schemas + migrations (bun-jsonb custom type)
      services/         # Business logic service classes
      telephony/        # TelephonyAdapter interface + 5 adapters
      messaging/        # MessagingAdapter interface + SMS, WhatsApp, Signal adapters
      lib/              # Auth, crypto, webauthn utilities
      wrangler.jsonc    # Marketing site only (Cloudflare Pages)
  ```

- [ ] **Section: Directory Structure** — update the `schemas/` comment from `30+ Zod schema files` to `80+ Zod schema files`.

- [ ] **Section: Key Technical Patterns** — remove the two bullet points for `Durable Objects` and `BlastDO`. Current text:
  ```
  - **Durable Objects**: Seven singletons accessed via `idFromName()` — IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO, BlastDO. Routed via `DORouter` (lightweight method+path router).
  - **BlastDO**: Handles message broadcast queues and delivery tracking. Manages batched delivery of bulk messages (SMS/WhatsApp/Signal) with per-recipient status tracking and retry logic.
  ```
  Replace with:
  ```
  - **Blast service**: Handles message broadcast queues and delivery tracking. Manages batched delivery of bulk messages (SMS/WhatsApp/Signal) with per-recipient status tracking and retry logic (PostgreSQL-backed).
  ```

- [ ] **Section: Key Technical Patterns** — update the `MessagingAdapter` bullet. Current: `Inbound webhooks route to ConversationDO.` Replace with: `Inbound webhooks route to the conversation service.`

- [ ] **Section: Key Technical Patterns** — update the `Protocol codegen` bullet. Change `30+ Zod schema files` to `80+ Zod schema files`. Also note that TypeScript consumers use `z.infer<>` directly — no generated TS types. Find: `generates TypeScript interfaces, Swift Codable structs, and Kotlin @Serializable data classes` and replace with: `generates Swift Codable structs and Kotlin @Serializable data classes` (TypeScript uses z.infer directly from Zod schemas).

- [ ] **Section: Gotchas** — remove the `Worker config` gotcha that refers to DO bindings:
  ```
  - **Worker config**: `wrangler.jsonc` lives at `apps/worker/wrangler.jsonc`. All wrangler commands use `--config apps/worker/wrangler.jsonc`.
  ```
  Replace with:
  ```
  - **wrangler.jsonc**: Used for marketing site (Cloudflare Pages) deployment only. Backend is Bun+PostgreSQL, not a Cloudflare Worker.
  ```

- [ ] **Create `docs/DEVELOPMENT_SETUP.md`** before removing the multi-machine section — this preserves the operational content the spec says to *move*, not delete. The new file should contain:
  ```markdown
  # Development Setup

  ## Multi-Machine Workflow

  **Mac M4** (`ssh mac`, 192.168.50.243, user `rhonda`) — iOS builds, XCUITest, UniFFI XCFramework, simulator testing.
  **Linux** (192.168.50.95) — Desktop, backend, Android E2E. Coordinate via git push/pull on the `desktop` branch.

  ### Mac M4 specifics
  - macOS 26.2 (Tahoe), Xcode 26.2, iOS Simulator 26.2
  - Passwordless SSH via `~/.ssh/id_ed25519`
  - SSH PATH init required: `eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null; export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"`
  - Available simulators: iPhone 17 series, iPhone 16e (NO iPhone 16 — Xcode 26.2)
  - `swift build` does NOT work for iOS-only SPM packages — use `xcodebuild`
  ```
  Commit alongside the CLAUDE.md change.

- [ ] **Section: Development Commands** — remove the `### Multi-Machine Workflow` section entirely (lines 184–208 in current file). This is operational state, not architecture guidance.

- [ ] **Section: Development Commands** — in `# Backend (runs on Linux machine)`, replace:
  ```bash
  bun run dev:worker                       # Wrangler dev server (Worker + DOs)
  ```
  with:
  ```bash
  bun run dev:server                       # Bun HTTP server with file watching
  ```

- [ ] **Section: Development Commands** — at the bottom, update the key config files note. Current: `**Key config files**: \`apps/worker/wrangler.jsonc\` (Worker + DO bindings), \`playwright.config.ts\`, \`.dev.vars\` (Twilio creds + ADMIN_PUBKEY, gitignored)`. Replace with: `**Key config files**: \`apps/worker/wrangler.jsonc\` (marketing site/CF Pages only), \`playwright.config.ts\`, \`.dev.vars\` (Twilio creds + ADMIN_PUBKEY, gitignored)`.

- [ ] **Section: Claude Code Working Style** — replace the entire `### Feature Development: 3-Phase BDD Workflow` subsection and its content. Current text occupies lines 265–281. Replace the whole `## Claude Code Working Style` section with:

  ```markdown
  ## Claude Code Working Style

  ### Development Workflow

  - **New feature**: `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:executing-plans`
  - **Bug fix**: `superpowers:systematic-debugging`
  - **Code complete**: `superpowers:verification-before-completion` + `superpowers:requesting-code-review`

  Domain skills (e.g. `bdd-feature-development`, `protocol-schema-change`) are **reference material** used during plan execution — not primary workflow entry points.

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
  ```

- [ ] Verify the final line count is roughly 185 lines (±15). Run `wc -l CLAUDE.md` and confirm significant reduction from 309.
- [ ] Commit: `git commit -m "chore: rewrite CLAUDE.md — accurate backend architecture, superpowers workflow, ~40% shorter"`

---

### Task 7: Update settings.json

**Files:**
- Modify: `.claude/settings.json`

- [ ] `.tf` files exist at `deploy/opentofu/` (verified: `providers.tf`, `main.tf`, `variables.tf`, `outputs.tf`, plus module files). Keep `terraform@claude-plugins-official: true` — no change needed.
- [ ] No action required. Skip to next task.

---

### Task 8: Update memory MEMORY.md

**Files:**
- Modify: `~/.claude/projects/-home-rikki-projects-llamenos/memory/MEMORY.md`

- [ ] Find and remove the entire `## Feature Development Workflow (CRITICAL — follow exactly)` section (lines 86–121 in current file), which includes the three Phase subsections and the `### Epic File Quality Requirements` block.

- [ ] Find and remove the `## Planning Workflow` section (lines 123–127 in current file):
  ```markdown
  ## Planning Workflow

  - **Epic files contain the plan context** — they should be self-contained enough to drive autonomous execution
  - **Plan mode is just for logistics** — use it only when you need to coordinate execution order, not for detailed planning
  - Don't over-use plan mode when epic files already have the detail
  ```

- [ ] Insert a new `## Development Workflow` section after `## Multi-Platform Architecture` (after line 84):
  ```markdown
  ## Development Workflow

  Feature development uses superpowers brainstorming → writing-plans → executing-plans. No custom phased BDD workflow.
  ```

- [ ] In the `## Multi-Platform Architecture` section, update the description of `apps/worker`. Find: `apps/worker` in the monorepo list bullet. Current: no explicit description — it's implied by other entries. The `## Case Management System` section mentions `Hono route ordering matters` which confirms Hono is already the router. No change needed to the architecture section itself since it doesn't currently describe `apps/worker` as a CF Worker.

- [ ] In the `## CI/CD Notes` section, remove the stale note: `- \`wrangler dev\` can take a while to start in CI; workerd "Broken pipe" errors are transient noise, not test failures`. This references the old wrangler-backed test infrastructure.

- [ ] Commit: `git commit -m "chore(memory): replace 3-phase BDD workflow section with superpowers workflow reference"`

---

### Task 9: Final verification

**Files:** None modified

- [ ] Run `grep -c "Durable Object\|DORouter\|idFromName\|durable-objects" ~/projects/llamenos/CLAUDE.md` — expect 0 or 1 (the spec allows a single historical note like "DOs removed in Epic 357–358"). Fail only if count ≥ 2.
- [ ] Run `grep -r "phased workflow\|Phase 1\|Phase 2\|Phase 3" ~/projects/llamenos/.claude/skills/bdd-feature-development/SKILL.md` — expect zero matches.
- [ ] Run `grep "backbone of this project" ~/projects/llamenos/.claude/skills/epic-authoring/SKILL.md` — expect zero matches.
- [ ] Run `grep "dev:node" ~/projects/llamenos/.claude/skills/test-orchestration/SKILL.md` — expect zero matches.
- [ ] Run `grep "DO storage" ~/projects/llamenos/.claude/skills/release-deployment/SKILL.md` — expect zero matches.
- [ ] Run `grep "TypeScript Post-Processor" ~/projects/llamenos/.claude/skills/protocol-schema-change/SKILL.md` — expect zero matches.
- [ ] Run `grep "Feature Development Workflow (CRITICAL" ~/.claude/projects/-home-rikki-projects-llamenos/memory/MEMORY.md` — expect zero matches.
- [ ] Confirm `wc -l ~/projects/llamenos/CLAUDE.md` reports ≤200 lines.
- [ ] Commit: `git commit -m "chore: workflow reform verification complete"` (only if any last-minute fixes were made; skip if nothing changed)
