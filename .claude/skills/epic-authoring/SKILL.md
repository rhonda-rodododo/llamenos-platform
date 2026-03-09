---
name: epic-authoring
description: >
  Write epic planning documents for the Llamenos monorepo. Use this skill whenever creating new
  epic files in docs/epics/, planning features, decomposing audit findings into work items,
  or when the user mentions "epic", "planning", "write an epic", "create epics", "implementation
  plan", "break it down", "break down into phases", "roadmap", "scope out", "spec out", "design
  doc", or describes a batch of work that needs structured decomposition. Also use when the user
  says "plan out" a feature, asks to "write up" an approach, wants to "scope" or "estimate" work,
  or lists multiple features/changes that need organizing into discrete units. Use when updating
  NEXT_BACKLOG.md or COMPLETED_BACKLOG.md with epic tracking. This skill applies to ALL epic types:
  features, security fixes, testing, infrastructure, i18n, design, tooling, and cross-platform work.
  If in doubt about whether to use this skill, use it — it's the backbone of this project's
  development workflow with 275+ epics written.
---

# Epic Authoring for Llamenos

This project has 275+ epics spanning security, iOS, Android, desktop, backend, crypto, i18n,
testing, and infrastructure. Every epic follows a consistent structure adapted to its domain.

## Before Writing

1. **Read the existing backlog**: `docs/NEXT_BACKLOG.md` and `docs/COMPLETED_BACKLOG.md`
2. **Check the latest epic number**: `ls docs/epics/ | sort -t- -k2 -n | tail -5`
3. **Read 1-2 recent epics** in the same domain for tone and depth calibration
4. **Understand dependencies**: Which existing epics does this block or depend on?

## Epic File Naming

`docs/epics/epic-{NUMBER}-{kebab-case-short-name}.md`

Example: `epic-276-ios-voip-calling.md`

## Required Structure

Every epic MUST have these sections in this order:

```markdown
# Epic {NUMBER}: {Title}

**Status**: PENDING
**Priority**: High | Medium | Low
**Depends on**: Epic {N} (or "None")
**Blocks**: Epic {N} (or "None")
**Branch**: `desktop`

## Summary

{1-3 sentences. What is being done and why. Include scope: file count, finding count,
platform coverage — whatever quantifies the work.}

## Problem Statement

{Why this work is needed. Reference concrete evidence: audit findings, bug reports,
missing coverage, user feedback, architectural gaps. Include file paths or metrics
that demonstrate the problem.}

## Implementation

{Domain-adaptive — see Domain Templates below}

## Files to Modify

| File | Action |
|------|--------|
| `path/to/file.ts` | Add validation for X |

{For large epics (10+ files), use three tables:}

### Files to Create
| File | Purpose |
|------|---------|

### Files to Modify
| File | Change |
|------|--------|

### Dependencies
| Package/Crate | Version | Why |
|---------------|---------|-----|

## Testing

{What tests must be written or updated. Be specific — name the test files,
describe the scenarios, specify which platforms need coverage.}

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
| `packages/test-specs/features/core/X.feature` | New/Modified | Scenarios for {feature} |
| `tests/steps/backend/X.steps.ts` | New | Backend step definitions |
| `tests/steps/X.steps.ts` | Phase 2 | Desktop step definitions |

## Risk Assessment

{Optional but recommended for large epics}
- **Low risk**: {mechanical changes, well-understood patterns}
- **Medium risk**: {new patterns, cross-platform coordination}
- **High risk**: {breaking changes, crypto wire format, data migration}
```

## Domain Templates

Adapt the Implementation section based on domain:

### Security Epics
Use finding-by-finding structure with severity tags. Each finding gets:
- **Finding ID and severity**: `### C2 (CRITICAL): serverEventKeyHex exposed`
- **Affected file(s)** with line numbers
- **Before/after code blocks** showing the exact fix
- **Cross-platform impact**: which clients need updates
- **Verification test**: specific negative-path test that proves the fix

```markdown
### C2 (CRITICAL): serverEventKeyHex in public config

**File**: `apps/worker/routes/config.ts:45`

**Before** (vulnerable):
\`\`\`typescript
return c.json({ ..., serverEventKeyHex })
\`\`\`

**After** (fixed):
\`\`\`typescript
// Moved to authenticated /api/auth/me response only
\`\`\`

**Platforms affected**: Desktop (platform.ts), iOS (APIService), Android (ApiClient)
**Test**: Verify unauthenticated GET /api/config does NOT contain serverEventKeyHex
```

### Design/UI Epics
Include visual references and token mappings:
- Color token tables (light/dark mode values)
- Component specifications with Swift/Kotlin/TSX signatures
- Before/after screenshots or mockup descriptions
- Accessibility requirements (testids, VoiceOver labels)

### Testing Epics
Structure by platform and phase:
- **Phase 1**: Infrastructure/helpers
- **Phase 2**: Test implementation (with method signatures)
- Coverage metrics table (before/after)
- Scope limitations section (what's explicitly excluded)

### i18n Epics
Include key mapping tables:
- Mismatch tables: `| Code uses | Codegen produces | Action |`
- Locale propagation checklist
- Codegen command sequence
- Validation command sequence

### Infrastructure/Tooling Epics
Include:
- Shell script pseudocode or architecture diagrams
- Flag/option contracts
- Metrics table (before/after developer experience)
- Migration path for breaking changes

### Cross-Platform Feature Epics
Structure by platform layer:
1. **Shared** (protocol schema, i18n strings)
2. **Backend** (worker endpoints, DO methods)
3. **Desktop** (React components, platform.ts)
4. **iOS** (SwiftUI views, services)
5. **Android** (Compose screens, repositories)

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

## Sequencing: Phase vs Task

- Use **"Phase N"** when steps have strict ordering (Phase 1 must complete before Phase 2)
- Use **"Task N"** or **numbered sections** when work is parallelizable
- State this explicitly: `**Execution**: Phases are sequential` or `**Execution**: Tasks 2-5 can run in parallel after Task 1`

## Batch Workflow: Phased Implementation

When the user proposes multiple features:

1. **Write ALL epics** — sequential, one at a time, with BDD scenarios in each
2. **Deep self-review ALL epics** — including items 9-12 (test coverage verification)
3. **Phase 1 for ALL features**: API + locales + shared BDD specs (sequential commits)
   - One commit per feature's backend + specs
   - Gate: `bun run test:backend:bdd` passes after each commit
4. **Phase 2 for ALL features**: Client implementation (parallel per-client)
   - Agent 1: Desktop (`src/client/`, `tests/steps/`)
   - Agent 2: iOS (`apps/ios/`)
   - Agent 3: Android (`apps/android/`)
   - Gate: `bun run test:changed` per platform
5. **Phase 3**: Integration gate (`bun run test:all`)

## After Writing Each Epic

1. **Update `docs/NEXT_BACKLOG.md`**: Add the epic to the appropriate section with checkbox
2. **Update dependency graph**: If this epic blocks or is blocked by others, note it in both files

## Deep Self-Review (MANDATORY after writing a batch)

After ALL epics in a batch are written, perform a comprehensive review. This is not a skim —
it's a deep technical review that catches architectural mistakes before implementation begins.

### 1. Verify File Paths Exist

For every file path in the epic, confirm it exists:

```bash
# Glob each path referenced in the epic
ls path/to/file.ts  # Does this file actually exist?
```

If a path doesn't exist, the epic is referencing the wrong file or making assumptions
about structure. Fix the epic before proceeding.

### 2. Read the Actual Code

For each file the epic modifies, **read the current source**. Verify:
- The line numbers and code snippets match reality
- The function signatures match what's actually there
- The patterns used (imports, error handling, types) match the codebase conventions
- No assumptions about code that was already refactored away

### 3. Research External Libraries and APIs

Use **context7 MCP** to look up current documentation for any library referenced in the epic:
- Cloudflare Workers/Durable Objects APIs
- Tauri v2 plugin APIs
- SwiftUI APIs (iOS 17+)
- Jetpack Compose APIs
- Any new dependency being introduced

This catches epics that reference deprecated APIs, wrong method signatures, or outdated patterns.

### 4. Research Best Practices

Use **web search** for:
- Security best practices (for security epics): OWASP, CWE references
- Platform-specific patterns: Apple HIG, Material Design guidelines
- Crypto standards: NIST recommendations, RFC references
- Testing patterns: platform-specific testing documentation

### 5. Cross-Reference Between Epics

When reviewing a batch, check:
- **Dependency consistency**: If Epic A says it blocks Epic B, does Epic B say it depends on Epic A?
- **No contradictions**: Do two epics modify the same file in incompatible ways?
- **No gaps**: Is there work needed between epics that neither covers?
- **Shared types/schemas**: If multiple epics touch protocol schemas, are they compatible?

### 6. Verify Acceptance Criteria

For each acceptance criterion:
- Is it independently testable? (Can you write a command that checks it?)
- Is it specific enough? ("Works correctly" is not testable; "Returns 401 for unauthenticated requests" is)
- Does it cover all platforms affected by the change?

### 7. Check Protocol and Crypto Compliance

For epics touching encrypted data or wire formats:
- Cross-reference with `docs/protocol/PROTOCOL.md`
- Verify domain separation labels exist in `packages/protocol/crypto-labels.json`
- Check that crypto operations use the right label constants (not raw strings)
- Verify backward compatibility strategy for wire format changes

### 8. Review Checklist Summary

After the deep review, fix all issues found by editing the epic files directly. Then summarize
what was changed.

### 9. Verify Test Scenario Coverage

For every acceptance criterion:
- Does it map to at least one Gherkin scenario?
- Does the scenario test BEHAVIOR (state change, data persistence, API response)?
- NOT: "I should see the X element" (that's a UI existence check, not behavior)

### 10. Verify Scenario Quality

Each scenario must:
- Have a `@backend` tag if it can be verified without UI
- Have platform tags (`@desktop` `@ios` `@android`) for UI verification scenarios
- Include at least one edge case or error path per feature file
- Use Scenario Outline for parametrized cases (don't copy-paste scenarios)

### 11. Verify Phase Separation

- Phase 1 files (`apps/worker/`, `packages/i18n/`, `packages/test-specs/`, `tests/steps/backend/`)
  do NOT overlap with Phase 2 files (`src/client/`, `apps/ios/`, `apps/android/`)
- If they overlap, restructure the epic to separate concerns

### 12. Verify Backend BDD Feasibility

For each `@backend` scenario:
- Can it be verified using the simulation framework + API helpers?
- Does the needed API endpoint exist, or does the epic create it?
- Is the test data setup realistic (not dependent on UI flow)?

### Review Summary

After the deep review, fix all issues and summarize:

```markdown
## Self-Review Fixes
- Epic 276: Fixed file path (was `src/auth.ts`, actual path is `src/client/lib/auth.ts`)
- Epic 277: Updated SwiftUI API — `NavigationView` deprecated, changed to `NavigationStack`
- Epic 278: Added missing dependency on Epic 276 (shared type change)
- Epic 279: Removed deprecated Cloudflare Workers API usage (checked via context7)
```

## After Completing an Epic

1. **Update `docs/COMPLETED_BACKLOG.md`**: Add implementation details (what was actually done, test counts, file counts)
2. **Update `docs/NEXT_BACKLOG.md`**: Check off the epic
3. **Commit backlog updates with the epic commit** — not separately

## Common Pitfalls

- **Don't write stubs**: Every task should have enough detail that an agent can execute it autonomously
- **Don't forget cross-platform**: A worker change usually needs desktop + iOS + Android client updates
- **Don't skip testing section**: Every epic needs test requirements, even refactoring epics
- **Don't use raw string literals for crypto**: Always reference `packages/protocol/crypto-labels.json` constants
- **Don't assume empty state**: If tests will run in parallel, design for concurrent resource creation
