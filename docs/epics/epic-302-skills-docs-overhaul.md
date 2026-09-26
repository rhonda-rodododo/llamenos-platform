# Epic 302: Skills & Documentation Overhaul for BDD-First Workflow

> **Path placeholders:** `<project-slug>` = Claude Code's per-project directory name under `~/.claude/projects/` (the checkout path with `/` replaced by `-`).

**Status**: COMPLETE
**Priority**: High
**Depends on**: None (can run parallel with Epic 301)
**Blocks**: Epic 303
**Branch**: `desktop`

## Summary

Update 5 skills, CLAUDE.md, and MEMORY.md to codify the BDD-first phased development workflow. Replace the `multi-platform-test-recovery` skill with `bdd-feature-development`. Update `epic-authoring` to map acceptance criteria 1:1 to Gherkin scenarios. Rewrite the CLAUDE.md working style section for the 3-phase workflow. Touches 8 files, all documentation/instructions — zero code changes.

## Problem Statement

The current instruction set was built for a waterfall-adjacent workflow: write all epics → review → implement → write tests. This leads to:

1. **Tests written as afterthought.** The `epic-authoring` skill has no mention of BDD scenarios or feature files. Acceptance criteria are checkbox items with no binding to test scenarios.

2. **No phased execution guidance.** CLAUDE.md says "every feature must include tests" but doesn't specify WHEN tests are written relative to implementation, or HOW to sequence API/client work to avoid collisions.

3. **Reactive test stance.** `multi-platform-test-recovery` skill (294 lines) is entirely about fixing broken tests after the fact — 30% selector fragility, 20% state interference, etc. No guidance on writing tests first.

4. **Cardinal rule contradicts test-first.** MEMORY.md says "NEVER revert improvements to fix tests" — correct for UI selectors, but needs nuance: if a scenario is still valid, the test spec is right and the implementation needs fixing.

5. **No mention of backend BDD anywhere.** The simulation framework is documented but not connected to a testing discipline.

Skills analysis:
- **Update**: `epic-authoring`, `test-orchestration`, `cross-platform-feature-port`, `backend-api-development`
- **Replace**: `multi-platform-test-recovery` → `bdd-feature-development`
- **No change needed**: `security-audit-pipeline`, `i18n-string-workflow`, `protocol-schema-change`, `dependency-upgrade`, `e2ee-envelope-operations`, `nostr-realtime-events`, `platform-abstraction-development`, `release-deployment`, `tauri-ipc-development`, `telephony-messaging-adapters`

## Implementation

**Execution**: All tasks are independent and can run in parallel.

### Task 1: Update `epic-authoring` Skill

**File**: `.claude/skills/epic-authoring/SKILL.md`

**Changes:**

1. **Add BDD-First Feature Epic template** after the "Cross-Platform Feature Epics" domain template (~line 168):

```markdown
### BDD-First Feature Epics (DEFAULT for all new features)

Structure epics to produce BDD specs as the first deliverable:

#### Phase 1: API + Specs (single agent)
- Backend routes/DO methods
- i18n strings (all locales)
- Shared .feature file(s) in `packages/test-specs/features/`
- Backend step definitions in `tests/steps/backend/`
- **Gate**: `bun run test:backend:bdd` passes

#### Phase 2: Client Implementation (parallel agents)
- Desktop: UI + step definitions in `tests/steps/`
- iOS: Views + XCUITest step implementations
- Android: Screens + Cucumber step definitions
- **Gate**: `bun run test:changed` passes per platform

#### Phase 3: Integration
- **Gate**: `bun run test:all` passes
```

2. **Replace Acceptance Criteria template** (lines 88-93):

```markdown
## Acceptance Criteria & Test Scenarios

- [ ] {Criterion description}
  → `{feature-file-path}: "{Scenario title}"`
- [ ] {Criterion description}
  → `{feature-file-path}: "{Scenario title}"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/X.feature` | New/Modified | {description} |
| `tests/steps/backend/X.steps.ts` | New | Backend step defs |
```

3. **Add self-review items 9-12** after item 8 (line ~258):

```markdown
### 9. Verify Test Scenario Coverage

For every acceptance criterion:
- Does it map to at least one Gherkin scenario?
- Does the scenario test BEHAVIOR (state change, data persistence, API response)?
- NOT: "I should see the X element" (that's a UI existence check, not behavior)

### 10. Verify Scenario Quality

Each scenario must:
- Have a @backend tag if it can be verified without UI
- Have platform tags (@desktop @ios @android) for UI verification scenarios
- Include at least one edge case or error path per feature file
- Use Scenario Outline for parametrized cases

### 11. Verify Phase Separation

Phase 1 files (apps/worker/, packages/i18n/, packages/test-specs/, tests/steps/backend/)
must NOT overlap with Phase 2 files (src/client/, apps/ios/, apps/android/).

### 12. Verify Backend BDD Feasibility

For each @backend scenario:
- Can it be verified using the simulation framework + API helpers?
- Does the needed API endpoint exist, or does the epic create it?
```

4. **Replace Batch Workflow section** (lines 176-184):

```markdown
## Batch Workflow: Phased Implementation

When the user proposes multiple features:

1. **Write ALL epics** — sequential, with BDD scenarios mapped to ACs in each
2. **Deep self-review ALL epics** — including items 9-12 (test coverage)
3. **Phase 1 for ALL features**: API + locales + shared BDD specs (sequential commits)
   - One commit per feature's backend + specs
   - Gate: `bun run test:backend:bdd` passes after each commit
4. **Phase 2 for ALL features**: Client implementation (parallel per-client)
   - Agent 1: Desktop (src/client/, tests/steps/)
   - Agent 2: iOS (apps/ios/)
   - Agent 3: Android (apps/android/)
5. **Phase 3**: Integration gate (`bun run test:all`)
```

### Task 2: Replace `multi-platform-test-recovery` with `bdd-feature-development`

**Delete**: `.claude/skills/multi-platform-test-recovery/SKILL.md`
**Create**: `.claude/skills/bdd-feature-development/SKILL.md`

The new skill covers:
- The 3-phase workflow (API+specs → parallel clients → integration gate)
- Writing shared Gherkin specs (scenario quality, tagging rules, Scenario Outline)
- Backend step definitions (simulation framework + API helpers pattern)
- Platform step definition patterns (Playwright, XCUITest, Cucumber)
- When to use `@backend` vs `@desktop @ios @android` tags
- Test failure diagnosis (proactive, not reactive)
- Running tests: `bun run test:backend:bdd`, `bun run test:changed`, `bun run test:all`

Full content specified in `docs/plans/2026-03-08-bdd-workflow-overhaul.md` Task 6.

### Task 3: Update `test-orchestration` Skill

**File**: `.claude/skills/test-orchestration/SKILL.md`

Add "Platform: Backend BDD" section after "Platform: Desktop (Playwright)":
- Prerequisites: Docker Compose backend running
- Running: `bun run test:backend:bdd`
- What it tests: API correctness, simulation, encryption roundtrips, audit integrity, error paths
- Step definition location: `tests/steps/backend/`

Update the infrastructure map diagram to include `backend-bdd`.

Add "Shared BDD Spec Structure" section documenting `packages/test-specs/features/` tiers and tagging.

### Task 4: Update `cross-platform-feature-port` Skill

**File**: `.claude/skills/cross-platform-feature-port/SKILL.md`

Replace "Step 1: Understand the Source Feature" with "Step 1: Read the BDD Spec":
- The shared `.feature` file IS the specification
- Read every scenario and its tags
- Read backend steps to understand API verification
- You don't need to understand the source platform's implementation

Replace "Step 4: Platform Implementation" with BDD-driven porting:
- Write step definition stubs first (Given/When/Then)
- Run to verify they fail (Red)
- Implement minimum UI/logic to pass (Green)
- Refactor

### Task 5: Update `backend-api-development` Skill

**File**: `.claude/skills/backend-api-development/SKILL.md`

Add "Backend BDD Testing" section:
- Every new endpoint MUST have BDD coverage with `@backend` tag
- Write Gherkin scenario in `packages/test-specs/features/`
- Write step definition in `tests/steps/backend/` using simulation helpers
- Run: `bun run test:backend:bdd`
- Simulation framework reference table

### Task 6: Rewrite CLAUDE.md Working Style

**File**: `CLAUDE.md` (lines 241-259)

Replace with:
- 3-Phase BDD Workflow section (API+specs → parallel clients → integration gate)
- Test Philosophy (tests are the spec, behavior not UI, backend BDD is minimum bar)
- Pre-Commit Verification (includes `bun run test:backend:bdd`)
- General Rules (existing, slightly reworded)

Add `bun run test:backend:bdd` to the Development Commands section.

### Task 7: Update MEMORY.md

**File**: `~/.claude/projects/<project-slug>/memory/MEMORY.md`

1. Replace Cardinal Rule (lines 3-5) with "Tests Are The Spec" rule
2. Replace Feature Development Workflow (lines 83-109) with phased BDD workflow
3. Update Pre-Commit Verification to include backend BDD
4. Trim to stay under 200 lines — move Android build env, iOS simulator details, and i18n patterns to separate topic files in the memory directory

## Files to Create

| File | Purpose |
|------|---------|
| `.claude/skills/bdd-feature-development/SKILL.md` | New skill replacing multi-platform-test-recovery |

## Files to Modify

| File | Change |
|------|--------|
| `.claude/skills/epic-authoring/SKILL.md` | Add BDD template, AC mapping, self-review items 9-12, phased batch workflow |
| `.claude/skills/test-orchestration/SKILL.md` | Add backend BDD platform section, shared spec docs |
| `.claude/skills/cross-platform-feature-port/SKILL.md` | BDD-as-contract, Red-Green porting |
| `.claude/skills/backend-api-development/SKILL.md` | Add backend BDD testing section |
| `CLAUDE.md` | Rewrite working style for phased workflow, add test:backend:bdd command |
| `memory/MEMORY.md` | Update cardinal rule, workflow, pre-commit checklist |

## Files to Delete

| File | Reason |
|------|--------|
| `.claude/skills/multi-platform-test-recovery/SKILL.md` | Replaced by bdd-feature-development |

## Testing

No code changes — all documentation/instruction files. Verify by:
- Reading each updated skill to confirm internal consistency
- Checking that CLAUDE.md and MEMORY.md don't contradict the skills
- Confirming the new bdd-feature-development skill covers all use cases from the old multi-platform-test-recovery skill

## Acceptance Criteria & Test Scenarios

- [ ] `epic-authoring` skill includes BDD-First template as default for new features
  → Skill file contains "BDD-First Feature Epics" section
- [ ] `epic-authoring` acceptance criteria template maps ACs to Gherkin scenarios
  → Template shows `→ feature-file-path: "Scenario title"` pattern
- [ ] Self-review checklist includes items 9-12 (test coverage, quality, phase separation, backend BDD)
  → Skill file contains items 9 through 12
- [ ] `multi-platform-test-recovery` deleted, `bdd-feature-development` created
  → Old file gone, new file exists with 3-phase workflow content
- [ ] `test-orchestration` documents backend BDD platform
  → Skill file contains "Platform: Backend BDD" section
- [ ] `cross-platform-feature-port` uses BDD-as-contract
  → "Step 1: Read the BDD Spec" replaces "Step 1: Understand the Source Feature"
- [ ] `backend-api-development` includes backend BDD testing section
  → Skill file contains "Backend BDD Testing" section
- [ ] CLAUDE.md working style describes 3-phase workflow
  → Contains "Phase 1: API + Locales + Shared BDD Specs" etc.
- [ ] MEMORY.md cardinal rule is "Tests Are The Spec"
  → Line 3-5 updated
- [ ] No contradictions between skills, CLAUDE.md, and MEMORY.md
  → Manual review confirms consistency
- [ ] Backlog files updated

## Risk Assessment

- **Low risk**: All changes are documentation — no code, no tests, no builds. Worst case is unclear instructions that get refined in practice.
- **Low risk**: Deleting `multi-platform-test-recovery` — the diagnostic patterns (selector fragility, state interference, etc.) are still useful. The new skill should incorporate the platform-specific debugging tips from the old one.
