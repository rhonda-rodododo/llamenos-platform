# BDD-Driven Workflow Overhaul — Implementation Plan

> **Path placeholders:** `<project-slug>` = Claude Code's per-project directory name under `~/.claude/projects/` (the checkout path with `/` replaced by `-`).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the entire development workflow around shared BDD specs as behavioral contracts, with phased execution that prevents collision between concurrent agents.

**Architecture:** Shared Gherkin feature files define behavior. Backend BDD runs specs against Docker Compose (API-level, no UI). Each client platform implements step definitions to pass the same shared scenarios. Development phases are sequential: API+specs first, then parallel client work.

**Tech Stack:** playwright-bdd, Gherkin, Docker Compose (Node.js backend), Playwright (desktop + backend BDD), XCUITest (iOS), Cucumber (Android)

---

## Task 1: Reorganize Shared BDD Feature Files

Restructure `packages/test-specs/features/` from per-screen organization to behavior-focused tiers.

**Files:**
- Modify: `packages/test-specs/features/` (move + consolidate files)
- Modify: `packages/test-specs/README.md`
- Modify: `packages/test-specs/STEP_VOCABULARY.md`

**Step 1: Create new directory structure**

```bash
cd packages/test-specs/features
mkdir -p core admin security platform/desktop platform/ios platform/android
```

**Step 2: Consolidate core behavioral features**

Move and merge existing features into `core/`:

| New File | Sources (merge into one) |
|----------|------------------------|
| `core/call-routing.feature` | `calls/call-history.feature` + `calls/call-note-link.feature` + `calls/call-date-filter.feature` + new scenarios from `backend/telephony-adapter.feature` + `backend/shift-routing.feature` |
| `core/messaging-flow.feature` | `conversations/conversation-list.feature` + `conversations/conversation-filters.feature` + `conversations/conversation-assign.feature` + `conversations/conversation-e2ee.feature` + `conversations/conversation-notes.feature` + `messaging/conversations-full.feature` + `backend/conversation-routing.feature` |
| `core/note-encryption.feature` | `notes/note-create.feature` + `notes/note-list.feature` + `notes/note-detail.feature` + `notes/note-edit.feature` + `notes/note-thread.feature` + `notes/notes-custom-fields.feature` + `notes/notes-search.feature` + `backend/note-encryption.feature` |
| `core/auth-login.feature` | `auth/login.feature` + `auth/onboarding.feature` + `auth/pin-setup.feature` + `auth/pin-unlock.feature` + `auth/pin-lockout.feature` + `auth/key-import.feature` + `auth/invite-onboarding.feature` + `auth/form-validation.feature` + `auth/panic-wipe.feature` + `backend/auth-verification.feature` + `backend/permission-system.feature` |
| `core/volunteer-lifecycle.feature` | New — extract from `admin/volunteer-profile.feature` + `admin/access-control.feature` + `admin/roles.feature` |
| `core/reports.feature` | `reports/report-list.feature` + `reports/report-detail.feature` + `reports/report-create.feature` + `reports/report-claim.feature` + `reports/report-close.feature` |
| `core/contacts.feature` | `contacts/contacts-list.feature` + `contacts/contact-timeline.feature` |

Move to `admin/`:

| New File | Sources |
|----------|---------|
| `admin/shift-management.feature` | `shifts/shift-list.feature` + `shifts/clock-in-out.feature` + `shifts/shift-detail.feature` + `shifts/shift-scheduling.feature` |
| `admin/ban-management.feature` | `bans/ban-management.feature` (keep as-is) |
| `admin/audit-log.feature` | `admin/audit-log.feature` + `backend/audit-chain.feature` |
| `admin/blast-campaign.feature` | `messaging/blasts.feature` |
| `admin/settings.feature` | `admin/admin-settings.feature` + relevant scenarios from `settings/` |
| `admin/custom-fields.feature` | `notes/custom-fields-admin.feature` |

Move to `security/`:

| New File | Sources |
|----------|---------|
| `security/crypto-interop.feature` | `crypto/crypto-interop.feature` + `crypto/keypair-generation.feature` + `crypto/pin-encryption.feature` + `crypto/auth-tokens.feature` |
| `security/e2ee-roundtrip.feature` | New — extract encryption roundtrip scenarios from `backend/note-encryption.feature` |
| `security/session-management.feature` | New — WebAuthn, session TTL, revocation |
| `security/network-security.feature` | `security/https-enforcement.feature` + `security/relay-url-validation.feature` + `security/sas-verification.feature` |

Move to `platform/`:

| New File | Sources |
|----------|---------|
| `platform/desktop/updater.feature` | New (desktop-only) |
| `platform/desktop/stronghold.feature` | New (desktop-only) |
| `platform/ios/keychain.feature` | New (iOS-only) |
| `platform/ios/biometrics.feature` | New (iOS-only) |
| `platform/android/keystore.feature` | New (Android-only) |
| All `desktop/*.feature` files | Move to `platform/desktop/` |

**Step 3: Rewrite each consolidated feature file**

Every scenario must test BEHAVIOR, not UI existence. Transform pattern:

```gherkin
# BAD (old — UI existence check)
Scenario: Dashboard displays call count
  Given I am logged in as an admin
  When I navigate to the "Dashboard" tab
  Then I should see the "calls-today" element

# GOOD (new — behavioral verification)
@backend @desktop @ios @android
Scenario: Dashboard reflects actual call count
  Given I am logged in as an admin
  And 3 calls were completed today
  When I view the dashboard
  Then the calls today count shows "3"
```

For EVERY scenario, ensure:
- Tags specify which platforms run it (`@backend @desktop @ios @android`)
- `@backend` scenarios use ONLY API assertions (no UI)
- Given/When/Then verify state changes, not element visibility
- Edge cases and error paths are covered, not just happy paths

**Step 4: Delete files that are being consolidated**

Remove old directories after all scenarios are migrated:
```bash
# After verification that all scenarios are in new locations
rm -rf features/dashboard/ features/navigation/ features/help/
# Keep auth/, notes/, etc. as empty dirs get cleaned by git
```

**Step 5: Delete zero-value tests**

```bash
rm packages/test-specs/features/help/help-screen.feature
rm packages/test-specs/features/navigation/bottom-navigation.feature
```

Also delete from desktop:
- `tests/capture-screenshots.spec.ts`
- `tests/admin-system.spec.ts` (mock-only test)

Also delete from iOS:
- `apps/ios/Tests/UI/ScreenshotAuditTests.swift`

**Step 6: Update README.md**

Rewrite `packages/test-specs/README.md` to document the new tier structure, tagging conventions, and the rule that every scenario must test behavior not UI existence.

**Step 7: Update STEP_VOCABULARY.md**

Add backend-specific steps:

```gherkin
## Backend Steps (API-level, no UI)

Given the server is reset
Given {int} volunteers are on shift
Given {string} is on the ban list
Given {int} calls were completed today
When a call arrives from {string}
When volunteer {int} answers the call
When an SMS arrives from {string} with body {string}
Then the call status is {string}
Then the call is rejected
Then no volunteers receive a ring
Then a conversation is created
Then the message delivery status is {string}
```

**Step 8: Update validate-coverage.ts**

Update `packages/test-specs/tools/validate-coverage.ts` to reflect the new directory structure.

**Step 9: Commit**

```bash
git add packages/test-specs/ tests/capture-screenshots.spec.ts tests/admin-system.spec.ts apps/ios/Tests/UI/ScreenshotAuditTests.swift
git commit -m "refactor: reorganize BDD specs into behavior-focused tiers

Consolidate 94 feature files from per-screen to per-behavior organization:
- core/ (7 files): call routing, messaging, notes, auth, volunteers, reports, contacts
- admin/ (6 files): shifts, bans, audit, blasts, settings, custom fields
- security/ (4 files): crypto interop, E2EE roundtrip, sessions, network
- platform/ (desktop/ios/android): platform-specific only

Delete 6 zero-value tests (screenshots, help screen, nav smoke, mocked admin).
Rewrite all scenarios to test behavior, not UI element existence.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Add Backend BDD Step Definitions

Create Playwright step definitions that hit the API directly for `@backend` scenarios.

**Files:**
- Create: `tests/steps/backend/call-routing.steps.ts`
- Create: `tests/steps/backend/messaging.steps.ts`
- Create: `tests/steps/backend/notes.steps.ts`
- Create: `tests/steps/backend/auth.steps.ts`
- Create: `tests/steps/backend/admin.steps.ts`
- Create: `tests/steps/backend/security.steps.ts`
- Create: `tests/steps/backend/common.steps.ts`

**Step 1: Create common backend step definitions**

`tests/steps/backend/common.steps.ts` — shared Given steps that set up server state:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  simulateEndCall,
  simulateVoicemail,
  simulateIncomingMessage,
  simulateDeliveryStatus,
  uniqueCallerNumber,
} from '../../simulation-helpers'
import {
  apiGet,
  apiPost,
  createVolunteerViaApi,
  createShiftViaApi,
  createBanViaApi,
  listNotesViaApi,
  listBansViaApi,
  getMeViaApi,
} from '../../api-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
const TEST_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'

// Shared state between steps in a scenario
let scenarioState: {
  volunteers: Array<{ pubkey: string; name: string }>
  callId?: string
  callStatus?: string
  conversationId?: string
  messageId?: string
  lastApiResponse?: { status: number; data: unknown }
}

Given('the server is reset', async ({ request }: { request: APIRequestContext }) => {
  const res = await request.post(`${BASE_URL}/api/test-reset`, {
    headers: { 'X-Test-Secret': TEST_SECRET },
  })
  expect(res.ok()).toBeTruthy()
  scenarioState = { volunteers: [] }
})

Given('{int} volunteers are on shift', async ({ request }: { request: APIRequestContext }, count: number) => {
  // Create volunteers and a shift covering current time
  for (let i = 0; i < count; i++) {
    const vol = await createVolunteerViaApi(request, {
      name: `TestVol${i}-${Date.now()}`,
    })
    scenarioState.volunteers.push(vol)
  }
  // Create a shift covering all days, all hours, with these volunteers
  const pubkeys = scenarioState.volunteers.map(v => v.pubkey)
  await createShiftViaApi(request, {
    name: `TestShift-${Date.now()}`,
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 1, 2, 3, 4, 5, 6],
    volunteerPubkeys: pubkeys,
  })
})

Given('{string} is on the ban list', async ({ request }: { request: APIRequestContext }, phone: string) => {
  await createBanViaApi(request, { phone, reason: 'test ban' })
})
```

**Step 2: Create call routing backend steps**

`tests/steps/backend/call-routing.steps.ts`:

```typescript
When('a call arrives from {string}', async ({ request }, callerNumber: string) => {
  const result = await simulateIncomingCall(request, { callerNumber })
  scenarioState.callId = result.callId
  scenarioState.callStatus = result.status
})

When('volunteer {int} answers the call', async ({ request }, index: number) => {
  const vol = scenarioState.volunteers[index - 1] // 1-indexed in Gherkin
  const result = await simulateAnswerCall(request, scenarioState.callId!, vol.pubkey)
  scenarioState.callStatus = result.status
})

Then('the call status is {string}', async ({}, expectedStatus: string) => {
  expect(scenarioState.callStatus).toBe(expectedStatus)
})

Then('the call is rejected', async ({}) => {
  // A rejected call means no callId was returned or status indicates rejection
  expect(scenarioState.callStatus).toMatch(/rejected|banned/)
})

Then('all {int} volunteers receive a ring notification', async ({ request }, count: number) => {
  // Verify via active calls endpoint
  const { data } = await apiGet(request, '/api/calls/active')
  const activeCalls = data as Array<{ callId: string; ringing: string[] }>
  const call = activeCalls.find(c => c.callId === scenarioState.callId)
  expect(call).toBeDefined()
  expect(call!.ringing.length).toBe(count)
})

Then('volunteer {int} ring is terminated', async ({ request }, index: number) => {
  const vol = scenarioState.volunteers[index - 1]
  const { data } = await apiGet(request, '/api/calls/active')
  const activeCalls = data as Array<{ ringing: string[] }>
  // Volunteer should NOT be in any active call's ringing list
  const stillRinging = activeCalls.some(c => c.ringing?.includes(vol.pubkey))
  expect(stillRinging).toBe(false)
})
```

**Step 3: Create messaging backend steps**

`tests/steps/backend/messaging.steps.ts` — similar pattern using `simulateIncomingMessage`, `simulateDeliveryStatus`, and API verification of conversation state.

**Step 4: Create notes backend steps**

`tests/steps/backend/notes.steps.ts` — create encrypted notes via API, verify list, verify threading, verify multi-admin decryption.

**Step 5: Create auth backend steps**

`tests/steps/backend/auth.steps.ts` — test Schnorr login (valid/expired/tampered), permission denial (403), bootstrap (one-shot).

**Step 6: Create admin backend steps**

`tests/steps/backend/admin.steps.ts` — volunteer CRUD, shift management, ban list, audit log hash chain integrity.

**Step 7: Create security backend steps**

`tests/steps/backend/security.steps.ts` — crypto test vector validation (reuse existing `crypto-interop.spec.ts` logic), E2EE roundtrip, domain separation enforcement.

**Step 8: Run backend steps to verify they compile**

```bash
bunx tsc --noEmit
```

**Step 9: Commit**

```bash
git add tests/steps/backend/
git commit -m "feat: add backend BDD step definitions for API-level testing

7 step definition files covering call routing, messaging, notes,
auth, admin operations, and security — all hitting the API directly
via the simulation framework and API helpers. No UI involved.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Wire Backend BDD into Playwright Config and Test Orchestrator

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json` (add `test:backend:bdd` script)
- Create: `scripts/test-backend-bdd.sh`
- Modify: `scripts/test-orchestrator.sh`
- Modify: `scripts/lib/platform-detect.sh`

**Step 1: Add backend-bdd project to Playwright config**

Modify `playwright.config.ts` to add a separate project for `@backend` tagged scenarios:

```typescript
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Desktop BDD — excludes @backend
const desktopBddTestDir = defineBddConfig({
  features: "packages/test-specs/features/**/*.feature",
  steps: "tests/steps/**/*.ts",
  outputDir: ".features-gen",
  featuresRoot: "packages/test-specs/features",
  tags: "@desktop and not @backend",
});

// Backend BDD — only @backend scenarios, no UI needed
const backendBddTestDir = defineBddConfig({
  features: "packages/test-specs/features/**/*.feature",
  steps: "tests/steps/backend/**/*.ts",
  outputDir: ".features-gen-backend",
  featuresRoot: "packages/test-specs/features",
  tags: "@backend",
});
```

Add the backend-bdd project:

```typescript
{
  name: "backend-bdd",
  testDir: backendBddTestDir,
  use: {
    // No browser needed — API-only tests
    baseURL: process.env.TEST_HUB_URL || "http://localhost:3000",
  },
  dependencies: ["setup"],
},
```

**Step 2: Add test:backend:bdd script to package.json**

Add to scripts:
```json
"test:backend:bdd": "scripts/test-backend-bdd.sh"
```

**Step 3: Create test-backend-bdd.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/test-reporter.sh"

cd "$PROJECT_ROOT"

# Ensure Docker backend is running
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo -e "${YELLOW}Docker backend not running. Starting...${RESET}"
  bun run test:docker:up
  # Wait for health
  timeout 120 bash -c 'until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done'
fi

echo -e "${BOLD}Running backend BDD tests...${RESET}"
PLAYWRIGHT_TEST=true TEST_HUB_URL=http://localhost:3000 \
  bunx playwright test --project=backend-bdd

echo -e "${GREEN}Backend BDD: PASS${RESET}"
```

Make executable: `chmod +x scripts/test-backend-bdd.sh`

**Step 4: Add backend-bdd to test orchestrator**

In `scripts/test-orchestrator.sh`, the orchestrator uses `detect_platforms` to find available platforms. Update `scripts/lib/platform-detect.sh` to include `backend-bdd` as a detectable platform, and create `scripts/test-backend-bdd.sh` so the orchestrator finds it.

**Step 5: Run backend BDD to verify wiring**

```bash
bun run test:docker:up
bun run test:backend:bdd
```

Expected: backend BDD scenarios pass against Docker Compose backend.

**Step 6: Commit**

```bash
git add playwright.config.ts package.json scripts/test-backend-bdd.sh scripts/lib/platform-detect.sh scripts/test-orchestrator.sh
git commit -m "feat: wire backend BDD into Playwright config and test orchestrator

Add backend-bdd Playwright project for @backend-tagged scenarios.
Backend steps hit API directly via simulation framework — no browser needed.
Integrated into test:all orchestrator and available as bun run test:backend:bdd.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update Desktop Step Definitions for New Feature Structure

The desktop BDD step definitions in `tests/steps/` need updating to match the reorganized feature files.

**Files:**
- Modify: `tests/steps/` — update imports and step phrases to match consolidated features
- Modify: `.features-gen/` — regenerated automatically by playwright-bdd

**Step 1: Audit existing step files against new feature files**

For each new consolidated feature file in `core/`, `admin/`, `security/`:
- Check which Given/When/Then phrases are used
- Verify matching step definitions exist in `tests/steps/`
- Add missing step definitions for new behavioral scenarios

**Step 2: Remove step definitions for deleted features**

Any step defs that only served the deleted zero-value tests (help screen, bottom navigation, screenshot capture) — remove them.

**Step 3: Add behavioral assertion steps**

New step definitions for behavioral assertions (not UI existence):

```typescript
// tests/steps/common/behavioral.steps.ts
Then('the calls today count shows {string}', async ({ page }, expected: string) => {
  const count = page.getByTestId('calls-today-count')
  await expect(count).toHaveText(expected, { timeout: 10_000 })
})

Then('the call history shows {int} active call(s)', async ({ page }, count: number) => {
  await page.getByTestId('call-history-tab').click()
  const items = page.getByTestId('call-history-item')
  await expect(items).toHaveCount(count, { timeout: 10_000 })
})
```

**Step 4: Run desktop BDD to verify**

```bash
PLAYWRIGHT_TEST=true bunx playwright test --project=bdd
```

**Step 5: Commit**

```bash
git add tests/steps/
git commit -m "refactor: update desktop step definitions for reorganized BDD specs

Match step definitions to consolidated feature files. Remove steps for
deleted tests. Add behavioral assertion steps that verify state changes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update Epic Authoring Skill

**Files:**
- Modify: `.claude/skills/epic-authoring/SKILL.md`

**Step 1: Add BDD-First Feature Epic template**

After the existing "Cross-Platform Feature Epics" domain template (line ~168), add:

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

**Step 2: Update Acceptance Criteria template**

Replace the existing AC section template with:

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
| `packages/test-specs/features/core/X.feature` | New/Modified | Scenarios for {feature} |
| `tests/steps/backend/X.steps.ts` | New | Backend step definitions |
| `tests/steps/X.steps.ts` | Phase 2 | Desktop step definitions |
```

**Step 3: Add items 9-12 to Deep Self-Review**

After item 8 ("Review Checklist Summary"), add:

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
- Use Scenario Outline for parametrized cases (don't copy-paste scenarios)

### 11. Verify Phase Separation

- Phase 1 files (apps/worker/, packages/i18n/, packages/test-specs/, tests/steps/backend/)
  do NOT overlap with Phase 2 files (src/client/, apps/ios/, apps/android/)
- If they overlap, restructure the epic to separate concerns

### 12. Verify Backend BDD Feasibility

For each @backend scenario:
- Can it be verified using the simulation framework + API helpers?
- Does the needed API endpoint exist, or does the epic create it?
- Is the test data setup realistic (not dependent on UI flow)?
```

**Step 4: Update Batch Workflow section**

Replace the existing "Batch Workflow" section (line ~176) with:

```markdown
## Batch Workflow: Phased Implementation

When the user proposes multiple features:

1. **Write ALL epics** — sequential, one at a time, with BDD scenarios in each
2. **Deep self-review ALL epics** — including items 9-12 (test coverage verification)
3. **Phase 1 for ALL features**: API + locales + shared BDD specs (sequential commits)
   - One commit per feature's backend + specs
   - Gate: `bun run test:backend:bdd` passes after each commit
4. **Phase 2 for ALL features**: Client implementation (parallel per-client)
   - Agent 1: Desktop (src/client/, tests/steps/)
   - Agent 2: iOS (apps/ios/)
   - Agent 3: Android (apps/android/)
   - Gate: `bun run test:changed` per platform
5. **Phase 3**: Integration gate (`bun run test:all`)
```

**Step 5: Commit**

```bash
git add .claude/skills/epic-authoring/SKILL.md
git commit -m "refactor: update epic-authoring skill for BDD-first workflow

Add BDD-First Feature Epic template as default. Update AC template to
map criteria 1:1 to Gherkin scenarios. Add self-review items 9-12 for
test coverage, scenario quality, phase separation, and backend BDD
feasibility. Replace batch workflow with phased implementation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Replace multi-platform-test-recovery with bdd-feature-development

**Files:**
- Delete: `.claude/skills/multi-platform-test-recovery/SKILL.md`
- Create: `.claude/skills/bdd-feature-development/SKILL.md`

**Step 1: Create the new skill**

Write `.claude/skills/bdd-feature-development/SKILL.md`:

```markdown
---
name: bdd-feature-development
description: >
  Guide BDD-driven feature development in the Llamenos monorepo. Use this skill when
  implementing features using the phased workflow (API+specs → parallel clients → integration),
  writing shared Gherkin specs, creating backend BDD step definitions, debugging test failures
  in the BDD pipeline, or when the user mentions "BDD", "feature file", "Gherkin", "step
  definition", "shared spec", "backend BDD", "test:backend:bdd", "phased implementation",
  "behavioral test", or describes wanting to write tests before implementation. Also use
  when tests fail after feature implementation — this replaces multi-platform-test-recovery
  with a proactive, test-first approach. Use when the user says "tests broke", "fix tests",
  "write tests first", "add test coverage", or "E2E testing".
---

# BDD-Driven Feature Development for Llamenos

Features are developed in 3 phases. Shared BDD specs are the behavioral contract
between phases. Tests are written BEFORE implementation, not after.

## The 3-Phase Workflow

### Phase 1: API + Locales + Shared BDD Specs (single agent)

**Touches:** `apps/worker/`, `packages/i18n/`, `packages/test-specs/`, `tests/steps/backend/`
**Does NOT touch:** `src/client/`, `apps/ios/`, `apps/android/`

1. Implement backend routes/DO methods
2. Add i18n strings (all 13 locales)
3. Write shared .feature files in `packages/test-specs/features/`
4. Write backend step definitions in `tests/steps/backend/`
5. **Gate**: `bun run test:backend:bdd` passes

### Phase 2: Client Implementation (parallel agents)

**Each agent touches ONLY its platform directory:**
- Desktop: `src/client/`, `tests/steps/` (NOT `tests/steps/backend/`)
- iOS: `apps/ios/`
- Android: `apps/android/`

Each agent:
1. Implements UI to support the feature
2. Writes platform step definitions for the shared .feature scenarios
3. **Gate**: Platform BDD passes

### Phase 3: Integration Gate

```bash
bun run test:all
```

All green → merge. Red → fix in the failing platform only.

## Writing Shared BDD Specs

### Directory Structure

```
packages/test-specs/features/
  core/           # Shared across all platforms + backend
  admin/          # Admin operations
  security/       # Security-specific
  platform/       # Platform-specific ONLY (desktop/, ios/, android/)
```

### Tagging Rules

```gherkin
@backend                    # API-level test (no UI)
@desktop @ios @android      # Runs on all client platforms
@desktop                    # Desktop-only
@smoke                      # Fast CI subset
@regression                 # Full suite
```

- Scenarios in `core/` and `admin/` MUST have `@backend` + platform tags
- Scenarios in `platform/` have only their platform tag
- Backend scenarios are the minimum bar — if backend BDD passes, the API is correct

### Scenario Quality Rules

**Test BEHAVIOR, not UI elements:**

```gherkin
# BAD — tests UI existence
Then I should see the "calls-today" element
Then I should see the "Save" button

# GOOD — tests behavior
Then the calls today count shows "3"
Then the note is saved with text "Crisis report filed"
Then the call status changes to "in-progress"
```

**Include error paths:**

```gherkin
Scenario: Expired auth token is rejected
  Given I have an auth token from 10 minutes ago
  When I call GET /api/calls/active
  Then the response status is 401

Scenario: Non-admin cannot access audit log
  Given I am logged in as a volunteer
  When I call GET /api/audit
  Then the response status is 403
```

**Use Scenario Outline for parametrized tests:**

```gherkin
Scenario Outline: Message arrives via <channel>
  When a <channel> message arrives from "+15551234567" with body "Help"
  Then a conversation is created
  And the conversation channel is "<channel>"

  Examples:
    | channel   |
    | sms       |
    | whatsapp  |
    | signal    |
```

## Backend Step Definitions

Backend steps use the simulation framework + API helpers. No browser, no UI.

**Key imports:**
```typescript
import { simulateIncomingCall, simulateAnswerCall, ... } from '../../simulation-helpers'
import { apiGet, apiPost, createVolunteerViaApi, ... } from '../../api-helpers'
```

**Pattern:**
- `Given` steps set up server state (create volunteers, shifts, bans)
- `When` steps trigger actions (simulate calls, API requests)
- `Then` steps verify state via API (GET endpoints, check responses)

**Shared scenario state:**
Each step file maintains a `scenarioState` object for passing data between steps
(callId, conversationId, volunteer pubkeys, etc.).

## Platform Step Definitions

### Desktop (Playwright)

Step files: `tests/steps/{domain}.steps.ts`

```typescript
Then('the calls today count shows {string}', async ({ page }, expected) => {
  const count = page.getByTestId('calls-today-count')
  await expect(count).toHaveText(expected, { timeout: 10_000 })
})
```

### iOS (XCUITest)

Test methods mirror Gherkin scenario titles:
```swift
func testDashboardReflectsActualCallCount() {
  given("3 calls were completed today") {
    simulateIncomingCall(callerNumber: uniqueNumber())
    // ... answer and end 3 calls
  }
  then("the calls today count shows 3") {
    let count = find("calls-today-count")
    XCTAssertEqual(count.label, "3")
  }
}
```

### Android (Cucumber)

Step files: `apps/android/app/src/androidTest/java/.../steps/{domain}/`

```kotlin
@Then("the calls today count shows {string}")
fun callsCountShows(expected: String) {
  onNodeWithTag("calls-today-count")
    .assertTextEquals(expected)
}
```

## When Tests Fail

### During Phase 1 (backend BDD)
- The API implementation is wrong → fix the backend code
- The test scenario is wrong → fix the scenario (update AC in epic too)

### During Phase 2 (client implementation)
- Step definition has wrong selector → update the selector
- UI doesn't support the scenario → implement the missing UI behavior
- Scenario is platform-incompatible → add platform-specific tag

### After Merge (regression)
1. Identify which phase the failure belongs to (backend vs client)
2. Check if the scenario is still valid (does the AC still apply?)
3. If scenario valid → fix implementation or step definition
4. If scenario obsolete → update scenario AND the AC it maps to
5. NEVER delete a scenario without updating the corresponding AC

## Running Tests

```bash
# Backend BDD only (fast, no UI)
bun run test:backend:bdd

# Desktop BDD
PLAYWRIGHT_TEST=true bunx playwright test --project=bdd

# All platforms
bun run test:all

# Only affected platforms
bun run test:changed
```
```

**Step 2: Delete old skill**

```bash
rm .claude/skills/multi-platform-test-recovery/SKILL.md
rmdir .claude/skills/multi-platform-test-recovery/
```

**Step 3: Commit**

```bash
git add .claude/skills/
git commit -m "refactor: replace multi-platform-test-recovery with bdd-feature-development

New skill covers: 3-phase workflow, writing shared Gherkin specs,
backend BDD step definitions, scenario quality rules, platform step
definition patterns, and test failure diagnosis. Proactive test-first
approach replaces reactive test-recovery stance.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update test-orchestration Skill

**Files:**
- Modify: `.claude/skills/test-orchestration/SKILL.md`

**Step 1: Add Backend BDD section**

After the "Platform: Desktop (Playwright)" section, add:

```markdown
## Platform: Backend BDD

Backend BDD runs shared Gherkin specs tagged `@backend` against the Docker Compose
backend. No browser needed — tests hit the API directly via Playwright's APIRequestContext.

### Prerequisites
- Docker Compose backend running: `bun run test:docker:up`
- Health check: `curl http://localhost:3000/api/health`

### Running

```bash
# Full backend BDD suite
bun run test:backend:bdd

# Specific feature
PLAYWRIGHT_TEST=true bunx playwright test --project=backend-bdd --grep "call routing"
```

### What It Tests
- API correctness (CRUD operations, permission enforcement, auth validation)
- Call/message simulation (routing, parallel ring, voicemail, conversation threading)
- Encryption roundtrips (note encryption, multi-admin envelopes)
- Audit log integrity (hash chain, filtering)
- Error paths (expired tokens, banned callers, permission denial)

### Step Definitions
- Location: `tests/steps/backend/`
- Pattern: Given (setup state via API) → When (trigger action) → Then (verify via API)
- Uses: `tests/simulation-helpers.ts` and `tests/api-helpers.ts`
```

**Step 2: Update infrastructure map**

Update the ASCII diagram to include backend-bdd as a platform.

**Step 3: Add shared BDD spec info**

Add a section documenting the `packages/test-specs/features/` structure and tagging.

**Step 4: Commit**

```bash
git add .claude/skills/test-orchestration/SKILL.md
git commit -m "docs: add backend BDD and shared spec docs to test-orchestration skill

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Update cross-platform-feature-port Skill

**Files:**
- Modify: `.claude/skills/cross-platform-feature-port/SKILL.md`

**Step 1: Add BDD-as-contract section**

Replace the current "Step 1: Understand the Source Feature" with:

```markdown
### Step 1: Read the BDD Spec (the Behavioral Contract)

When porting a feature, the shared `.feature` file IS the specification:

1. **Read the feature file**: `packages/test-specs/features/core/{feature}.feature`
2. **Understand every scenario**: Each one defines a behavior the target platform must support
3. **Check tags**: Which scenarios apply to your target platform?
4. **Read backend steps**: `tests/steps/backend/{feature}.steps.ts` — how does the API verify it?

You do NOT need to "understand the source platform's implementation." The Gherkin
scenarios define WHAT the feature does. Your job is to implement step definitions
that make those scenarios pass on the target platform.
```

**Step 2: Update porting workflow**

Replace Step 4 (Platform Implementation) with a BDD-driven version:

```markdown
### Step 4: Write Step Definitions First

For each scenario in the feature file:

1. Write the step definition stub (Given/When/Then)
2. Run it — verify it fails (Red)
3. Implement the minimum UI/logic to make it pass (Green)
4. Refactor if needed

This is Red-Green-Refactor applied to cross-platform porting.
```

**Step 3: Commit**

```bash
git add .claude/skills/cross-platform-feature-port/SKILL.md
git commit -m "refactor: update cross-platform-feature-port for BDD-as-contract

Shared .feature files are now the spec. Porting means writing step
definitions that pass existing scenarios, not understanding source code.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Update backend-api-development Skill

**Files:**
- Modify: `.claude/skills/backend-api-development/SKILL.md`

**Step 1: Add Backend BDD Testing section**

Add after existing content:

```markdown
## Backend BDD Testing

Every new API endpoint or DO method MUST have corresponding BDD coverage:

1. **Write Gherkin scenario** in `packages/test-specs/features/` with `@backend` tag
2. **Write step definition** in `tests/steps/backend/` using simulation helpers + API helpers
3. **Run**: `bun run test:backend:bdd`

### Example: Adding a new endpoint

```gherkin
# packages/test-specs/features/core/volunteer-lifecycle.feature
@backend
Scenario: Deactivating a volunteer revokes all sessions
  Given a volunteer "alice" exists with an active session
  When an admin deactivates volunteer "alice"
  Then alice's session is revoked
  And alice cannot access protected endpoints
```

```typescript
// tests/steps/backend/admin.steps.ts
When('an admin deactivates volunteer {string}', async ({ request }, name) => {
  const vol = scenarioState.volunteers.find(v => v.name === name)
  await apiPatch(request, `/api/volunteers/${vol.pubkey}`, { active: false })
})
```

### Simulation Framework Reference

| Endpoint | Use For |
|----------|---------|
| `POST /api/test-simulate/incoming-call` | Test call routing without Twilio |
| `POST /api/test-simulate/incoming-message` | Test conversation creation without SMS |
| `POST /api/test-reset` | Clean state between scenarios |

Step definitions should use the typed helpers from `tests/simulation-helpers.ts`
and `tests/api-helpers.ts`, not raw HTTP calls.
```

**Step 2: Commit**

```bash
git add .claude/skills/backend-api-development/SKILL.md
git commit -m "docs: add backend BDD testing section to backend-api-development skill

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Rewrite "Claude Code Working Style" section**

Replace lines 241-259 with:

```markdown
## Claude Code Working Style

### Feature Development: 3-Phase BDD Workflow

**Every feature follows this sequence. No exceptions.**

1. **Epic authoring** — with BDD scenarios mapped 1:1 to acceptance criteria
2. **Phase 1: API + Locales + Shared BDD Specs** (single agent)
   - Backend routes/DO methods (`apps/worker/`)
   - i18n strings (`packages/i18n/locales/`)
   - Shared `.feature` files (`packages/test-specs/features/`)
   - Backend step definitions (`tests/steps/backend/`)
   - **Gate**: `bun run test:backend:bdd` passes
3. **Phase 2: Client Implementation** (parallel agents, non-overlapping dirs)
   - Agent 1: Desktop (`src/client/`, `tests/steps/`)
   - Agent 2: iOS (`apps/ios/`)
   - Agent 3: Android (`apps/android/`)
   - Each implements UI + step definitions to pass shared BDD scenarios
4. **Phase 3: Integration Gate** — `bun run test:all`

### Test Philosophy

- **Tests are the spec.** BDD scenarios define what the feature does. Implementation makes them pass.
- **Behavior, not UI.** Every scenario tests state changes, API responses, data persistence — never "element exists."
- **Backend BDD is the minimum bar.** If backend BDD passes, the API is correct. Client tests verify the UI reflects it.
- If a design change breaks a scenario that's still valid → update the step implementation (selectors, navigation)
- If a scenario is obsolete → update the scenario AND the AC it maps to

### Pre-Commit Verification

```bash
bun run test:changed   # Fast: only affected platforms
bun run test:all       # Thorough: all platforms including backend BDD
```

### General Rules

- Implement features completely — no stubs, no shortcuts, no TODOs
- **Every feature includes tests.** Written in Phase 1 (specs) and Phase 2 (step definitions)
- Edit files in place; never create copies. Git history is the backup
- Keep the file tree lean. Commit frequently
- No legacy fallbacks until the app is in production
- Use `docs/epics/` for planning. Track in `docs/NEXT_BACKLOG.md` / `docs/COMPLETED_BACKLOG.md`
- Use context7 MCP for library documentation lookups
- Clean up unused files when pivoting. Refactor proactively
- NEVER delete or regress functionality to fix type issues or get tests passing
```

**Step 2: Add test:backend:bdd to Development Commands**

In the Unified Test Orchestration section, add:

```bash
bun run test:backend:bdd             # Backend BDD against Docker Compose (API-level)
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "refactor: rewrite CLAUDE.md workflow for BDD-first phased development

Replace linear workflow with 3-phase BDD: API+specs → parallel clients →
integration gate. Update test philosophy: behavior not UI, tests are the spec.
Add test:backend:bdd to commands.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Update MEMORY.md

**Files:**
- Modify: `~/.claude/projects/<project-slug>/memory/MEMORY.md`

**Step 1: Update Cardinal Rule**

Replace lines 3-5 with:

```markdown
## CARDINAL RULE: Tests Are The Spec

**BDD scenarios define what features do. Implementation makes them pass.**
- If a design change breaks a scenario that's still valid → update the step implementation (selectors, navigation), NOT the scenario
- If a scenario is obsolete (feature was intentionally replaced) → update the scenario AND the AC it maps to
- NEVER implement without writing the BDD scenario first (Phase 1)
- NEVER delete a scenario without updating the corresponding acceptance criterion
```

**Step 2: Update Feature Development Workflow**

Replace lines 83-109 with:

```markdown
## Feature Development Workflow (BDD-First Phased)

### Epic Phase
- Write epics with ACs mapped 1:1 to Gherkin scenarios
- Self-review includes test coverage verification (items 9-12)

### Phase 1: API + Locales + Shared BDD Specs (single agent)
- Backend routes/DO methods in apps/worker/
- i18n strings in packages/i18n/locales/
- Shared .feature files in packages/test-specs/features/
- Backend step definitions in tests/steps/backend/
- GATE: bun run test:backend:bdd passes

### Phase 2: Client Implementation (parallel agents, non-overlapping)
- Agent 1: Desktop (src/client/, tests/steps/)
- Agent 2: iOS (apps/ios/)
- Agent 3: Android (apps/android/)
- GATE: bun run test:changed per platform

### Phase 3: Integration Gate
- bun run test:all

### Parallel Work Strategy
- Phase 1 is SEQUENTIAL (API routes may depend on each other)
- Phase 2 is PARALLEL per-client (zero file overlap)
- DON'T create worktrees per-feature — creates merge conflicts
- DO run Phase 2 agents in parallel since directories don't overlap
```

**Step 3: Update Pre-Commit Verification**

Update to include backend BDD:

```markdown
## Pre-Commit Verification Checklist

- `bun run test:all` — all platforms including backend BDD
- `bun run test:changed` — only affected platforms (faster)
- `bun run test:backend:bdd` — backend BDD only (fastest for API changes)
```

**Step 4: Trim MEMORY.md to stay under 200 lines**

Move detailed content (Android build env, iOS simulator details, etc.) to separate topic files if needed. Keep MEMORY.md as a concise index.

**Step 5: Commit**

```bash
git add ~/.claude/projects/<project-slug>/memory/MEMORY.md
git commit -m "refactor: update MEMORY.md for BDD-first phased workflow

Update cardinal rule: tests are the spec. Replace waterfall workflow
with 3-phase BDD. Update pre-commit checklist.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Update Android Feature File Copy and iOS Test Structure

**Files:**
- Modify: `apps/android/app/build.gradle.kts` (if path changed)
- Modify: `apps/ios/Tests/` structure documentation

**Step 1: Verify Android copyFeatureFiles still works**

The Gradle task copies from `packages/test-specs/features/` to `src/androidTest/assets/features/`.
Since we reorganized the feature directory structure, verify the copy task picks up the new subdirectories.

```bash
cd apps/android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
./gradlew copyFeatureFiles
ls -R app/src/androidTest/assets/features/
```

The task uses a recursive copy, so the new `core/`, `admin/`, `security/`, `platform/` dirs should be picked up automatically. Verify and fix if needed.

**Step 2: Update Android CucumberHiltRunner tag filter**

Current: `tags = "@android and not @wip"`

This should still work since core features will have `@android` tags. Verify no scenarios were accidentally untagged during reorganization.

**Step 3: Document iOS test structure changes**

iOS doesn't use Cucumber — it uses XCUITest with test methods named after scenarios. Document the mapping in `packages/test-specs/README.md` for the new structure.

**Step 4: Commit**

```bash
git add apps/android/ packages/test-specs/README.md
git commit -m "chore: verify Android/iOS compatibility with reorganized BDD specs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Self-Review and Integration Test

**Step 1: Run full codegen check**

```bash
bun run codegen:check
bun run i18n:validate:all
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```

**Step 3: Run backend BDD**

```bash
bun run test:docker:up
bun run test:backend:bdd
```

**Step 4: Run desktop BDD**

```bash
PLAYWRIGHT_TEST=true bunx playwright test --project=bdd
```

**Step 5: Run full suite**

```bash
bun run test:all
```

**Step 6: Review all changed files**

```bash
git diff --stat HEAD~12  # Review all changes in this task sequence
```

Verify:
- No feature file scenarios were lost in reorganization
- All step definitions compile
- Backend BDD passes
- Desktop BDD passes
- No regressions in existing tests

**Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address self-review findings from BDD workflow overhaul

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Execution Summary

| Task | Description | Est. Scope | Dependencies |
|------|-------------|-----------|--------------|
| 1 | Reorganize feature files | Large (94 files) | None |
| 2 | Backend BDD step definitions | Large (7 files) | Task 1 |
| 3 | Wire into Playwright + orchestrator | Medium (5 files) | Task 2 |
| 4 | Update desktop step definitions | Medium | Task 1 |
| 5 | Update epic-authoring skill | Small (1 file) | None |
| 6 | Create bdd-feature-development skill | Medium (1 file) | None |
| 7 | Update test-orchestration skill | Small (1 file) | Task 3 |
| 8 | Update cross-platform-feature-port | Small (1 file) | None |
| 9 | Update backend-api-development | Small (1 file) | None |
| 10 | Update CLAUDE.md | Small (1 file) | None |
| 11 | Update MEMORY.md | Small (1 file) | None |
| 12 | Verify Android/iOS compatibility | Small | Task 1 |
| 13 | Self-review + integration test | Medium | All above |

**Parallel execution groups:**
- Tasks 5, 6, 8, 9, 10, 11 can run in parallel (independent skill/doc updates)
- Tasks 1 → 2 → 3 → 4 are sequential (each builds on previous)
- Task 7 depends on Task 3
- Task 12 depends on Task 1
- Task 13 depends on all
