# Test Infrastructure Overhaul

**Date:** 2026-03-19
**Status:** Approved for implementation
**Priority:** P0 — blocks all reliable CI

---

## Problem Statement

The test suite is a liability. After any refactor, engineers spend days fixing tests before they can ship. The cause is not a lack of tests — it is that the tests are architecturally broken in ways that make them flaky, slow, vacuous, and mutually interfering.

### Root causes

**1. No per-test isolation.** All tests share one database instance. The `@resets-state` tag and `bdd-serial` project are duct tape over this gap. Serial execution degrades parallelism. Global resets cause race conditions between workers.

**2. 202 `waitForTimeout` calls.** `navigateAfterLogin` burns 1500ms on every navigation (`Timeouts.ASYNC_SETTLE`). `enterPin` burns 100ms per digit plus 500ms after Enter. Every `@resets-state` scenario also incurs a `waitForTimeout(Timeouts.UI_SETTLE)` chain. The test suite's wall-clock time is dominated by sleeps, not actual assertions.

**3. Module-level mutable state.** Step files in `tests/steps/admin/admin-flow-steps.ts` (lines 19–22) declare `let lastVolunteerName`, `let lastVolunteerPubkey`, `let lastShiftName`, `let lastPhone` at module scope. When Playwright spawns multiple workers that load the same module, they share this state. A volunteer created in worker 1 can silently overwrite the name that worker 2 is about to assert on. The backend step files are equally compromised — `tests/steps/backend/shared-state.ts` exports a single mutable `shared` object consumed by every backend scenario.

**4. Over-engineered Playwright config.** Seven projects exist where four would do. `bdd-serial` only exists because isolation is broken. `setup` is a project because the author didn't know about `globalSetup`. `mobile-chromium` runs a single file. `bootstrap` has a forced dependency on `chromium` completing first — this is a design smell, not a deliberate choice.

**5. Tests that cannot fail.** `tests/epic-24-27.spec.ts` checks that headings exist. Empty-body step definitions in `tests/steps/admin/desktop-admin-steps.ts` (lines 143–149, 168–170, 266–268, 295–296, 362–366) always pass. `tests/report-types.spec.ts:100–115` is a conditional assertion that passes regardless of whether the badge exists. `tests/records-architecture.spec.ts:250–271` asserts only that an `h1` heading is visible — not that the page content is correct.

**6. Multiple selector registries.** Three sources of truth exist for test IDs:
- `tests/test-ids.ts` — the correct registry (TestIds constants)
- `buttonTestIdMap` in `tests/steps/common/interaction-steps.ts:16–46` — a second mapping of button labels to test IDs
- `sectionTestIdMap` in `tests/steps/common/interaction-steps.ts:183–197` — a third mapping for section names

`LOGOUT_BTN` is mapped in both `interaction-steps.ts:31–32` and `assertion-steps.ts:12–14`. Any rename requires touching three files.

**7. Fragile selectors.** Production-breaking CSS class selectors and position-based selectors appear throughout:
- `tests/steps/admin/desktop-admin-steps.ts:208` — `.cursor-pointer`
- `tests/steps/common/interaction-steps.ts:212` — `.cursor-pointer`
- `tests/report-types.spec.ts:109` — `button[type="button"]` + `.text-\\[10px\\]`
- `tests/steps/crypto/crypto-steps.ts:173` — `#nsec` (DOM ID, not data-testid)
- `tests/records-architecture.spec.ts:195` — `[data-testid="custom-fields"] h3` (positional descendant)
- `tests/steps/admin/desktop-admin-steps.ts:85` — `[data-settings-section]` (private attribute)
- `tests/steps/common/interaction-steps.ts:294` — `.text-destructive` (CSS utility class)

---

## Required Changes

### 1. Test Isolation: Hub-per-Worker

**Primary approach: hub-per-worker isolation.**

The system is already multi-tenant via hubs. Each Playwright worker creates its own hub at test start. All test data — volunteers, shifts, bans, notes, calls, reports — is created within that hub. Workers never share a hub, so they never share data. No reset is needed between scenarios within a worker because each scenario creates unique resources (via `Date.now()` naming).

#### Implementation

**Global setup (`tests/global-setup.ts`):**
```
- Continue to seed the admin keypair once
- Do NOT reset the database (no more /api/test-reset in globalSetup)
- Export nothing scenario-specific
```

**Per-worker fixture (`tests/fixtures.ts`):**

Add a `workerHub` fixture scoped to `'worker'`. On first use per worker process:
1. Call `POST /api/hubs` authenticated as admin to create a new hub with a generated name (e.g., `test-hub-${workerIndex}-${Date.now()}`)
2. Store the hub ID in worker-scoped fixture state
3. Expose it as `hubId` to all scenarios in that worker

All API calls and navigations within that worker use this `hubId`. The hub is not deleted after the worker exits — stale test hubs accumulate in the database and can be purged periodically with a cleanup script.

**Hub context injection:**

The browser-side app already has hub context via `setActiveHub(id)` in `src/client/lib/api.ts` (line 212). This module-level function updates `activeHubId`, which is used by the `hp()` helper to prefix all hub-scoped API paths. The function is not currently exposed to the test layer.

**Required change (small, one-file):** In `src/client/main.tsx` (or the test entry point), add:
```typescript
if (import.meta.env.VITE_PLAYWRIGHT_TEST) {
  import('@/lib/api').then(({ setActiveHub, getActiveHub }) => {
    Object.assign(window, { __setActiveHub: setActiveHub, __getActiveHub: getActiveHub })
  })
}
```

The `Before` fixture for each scenario then calls:
```typescript
await page.evaluate((id) => (window as any).__setActiveHub(id), workerHubId)
```

This ensures all API calls from the page use the worker's hub. No URL changes, no localStorage, no header injection — just the existing module-level state.

**Consequence: `@resets-state` tag is deleted.** Any scenario that currently relies on a clean slate must instead create its own isolated data within its worker's hub.

**Consequence: `bdd-serial` project is deleted.** Serial execution was only needed because `@resets-state` scenarios couldn't run in parallel. With hub isolation, every scenario runs in its own data sandbox.

#### Alternative: PostgreSQL schema-per-worker

Each worker gets its own `search_path` prefix (`test_w0_`, `test_w1_`, etc.). The server selects the schema based on a `X-Test-Worker` header. This is architecturally cleaner but requires:
- Schema provisioning logic in the server
- Schema-aware Drizzle/SQL queries
- More complex teardown

**Recommendation: hub-per-worker.** It uses the production multi-tenant architecture as-is. It requires no server-side changes beyond ensuring the hub creation API accepts a test-generated name. It matches how real hubs are isolated in production.

---

### 2. Backend BDD: Hub Isolation

The backend BDD suite (`backend-bdd` project) runs serially today (`fullyParallel: false`) because all scenarios share one hub. With hub-per-worker isolation:

- Each backend worker creates a hub via `Before` hook (using `request.post('/api/hubs', ...)`)
- Scenarios within a worker share that hub's context
- `workers` in the `backend-bdd` project can be set to `3` (same as desktop)
- `fullyParallel: true` in the `backend-bdd` project

The module-level state objects in backend step files (`let state: EntitySchemaState`, etc.) must also be eliminated — see Section 5.

---

### 3. Playwright Config: 7 → 4 Projects

**Current:** `setup`, `chromium`, `bootstrap`, `mobile-chromium`, `bdd`, `bdd-serial`, `backend-bdd`

**Target:** `chromium`, `bdd`, `backend-bdd`, plus `globalSetup`

#### Changes

**`setup` project → `globalSetup` config option**

`playwright.config.ts` currently uses `setup` as a project with `testMatch: /global-setup\.ts/`. Replace with:
```ts
globalSetup: './tests/global-setup.ts',
```
This runs once before any worker, not as a test project. No `dependencies: ['setup']` needed anywhere.

**`bdd-serial` project → deleted**

Remove entirely. Hub isolation makes it obsolete. Any test tagged `@resets-state` must be refactored to not require global state resets (see Section 4 on wait patterns and state management).

**`mobile-chromium` project → merged into `chromium`**

`tests/responsive.spec.ts` is the only file matched by `mobile-chromium`. Instead, add at the top of `responsive.spec.ts`:
```ts
test.use({ ...devices['Pixel 7'] })
```
Delete the `mobile-chromium` project. The responsive tests run as part of `chromium`.

**`bootstrap` project → deleted or merged**

`tests/bootstrap.spec.ts` depends on `chromium` completing first because it expects specific volunteers/data to exist. This is a design flaw. Bootstrap tests should create their own data. Refactor `bootstrap.spec.ts` to create the data it needs inside the test using the worker hub, then remove the `dependencies: ['chromium']` constraint. After refactor, merge bootstrap into the `chromium` project's `testIgnore` removal.

**Result: `playwright.config.ts` has 3 named projects + `globalSetup`:**
```ts
globalSetup: './tests/global-setup.ts',
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] }, ... },
  { name: 'bdd', ... },
  { name: 'backend-bdd', ... },
]
```

---

### 4. Wait Pattern Reform: Delete All 202 `waitForTimeout` Calls

**Rule: Zero `waitForTimeout` in any test file. No exceptions.**

Every `waitForTimeout` is a bet that the UI will settle within N milliseconds. It is always wrong in at least one direction: either too short (flaky) or too long (slow). Playwright's built-in retry engine eliminates the need for guessing.

#### Replacement patterns

| Old pattern | Replacement |
|---|---|
| `await page.waitForTimeout(1500)` after navigation | `await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible()` |
| `await page.waitForTimeout(Timeouts.ASYNC_SETTLE)` | `await expect(specificElement).toBeVisible()` |
| `await page.waitForTimeout(Timeouts.UI_SETTLE)` | `await expect(targetState).toBeVisible()` or remove entirely |
| `await page.waitForTimeout(300)` after expand | `await expect(expandedContent).toBeVisible()` |
| `await page.waitForTimeout(2000)` to check for contacts | `await expect(page.getByTestId(TestIds.CONTACT_ROW).first().or(emptyState)).toBeVisible()` |

#### Specific fixes required

**`tests/helpers.ts:102` — `enterPin`:**

Current:
```ts
for (const digit of pin) {
  await page.keyboard.type(digit)
  await page.waitForTimeout(100)
}
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
```

Replace: type all digits at once using `locator.fill()` on the first input — the PinInput component should handle the complete value, or use `page.keyboard.type(pin)` without per-digit delays. After pressing Enter, wait for the unlock state indicator:
```ts
await firstDigit.fill('')
await page.keyboard.type(pin)
await page.keyboard.press('Enter')
await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
```

If the PinInput component only accepts one digit per input and does not support `fill()`, add a `data-testid="pin-complete"` or `data-testid="pin-unlocking"` indicator to the component that becomes visible when all digits are entered, then wait for that instead.

**`tests/helpers.ts:152` — `navigateAfterLogin`:**

Current:
```ts
await page.waitForURL(u => u.toString().includes(parsed.pathname), { timeout: Timeouts.NAVIGATION })
await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
```

Replace the trailing sleep with a wait for the route's primary element:
```ts
await page.waitForURL(u => u.toString().includes(parsed.pathname), { timeout: Timeouts.NAVIGATION })
await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
```

Callers that need something more specific than `PAGE_TITLE` should wait for that specific element after `navigateAfterLogin` returns. `navigateAfterLogin` itself should not impose a one-size-fits-all sleep.

**`tests/helpers.ts:259` — `loginAsVolunteer`:**

```ts
await page.waitForTimeout(Timeouts.UI_SETTLE)
```
Replace with:
```ts
await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).toBeVisible({ timeout: Timeouts.AUTH })
```
(The existing `NAV_SIDEBAR.waitFor()` on line 257 already does this — the subsequent UI_SETTLE sleep is redundant and must be deleted.)

**`tests/steps/admin/desktop-admin-steps.ts` — 9 occurrences of `waitForTimeout(Timeouts.ASYNC_SETTLE)`:**

Each occurrence follows a navigation click. Replace each with a wait for the page title or a route-specific element:
- Line 105: after `Hub Settings` click → `await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible()`
- Line 154: after `Call History` click → `await expect(page.getByTestId(TestIds.CALL_LIST).or(page.getByTestId(TestIds.EMPTY_STATE))).toBeVisible()`
- Line 190, 232, 254, 282, 287, 299, 324: same pattern — identify the primary element for that route and wait for it

**`tests/steps/common/interaction-steps.ts:453`** — `they navigate to the {string} page`:

```ts
await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
```
Replace with:
```ts
await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
```

**`tests/records-architecture.spec.ts:95`** — after sending a reply:

```ts
await page.waitForTimeout(1500)
```
Replace with:
```ts
await expect(page.getByTestId(TestIds.NOTE_REPLY_BTN).first()).toContainText(/1 repl/i, { timeout: Timeouts.API })
```

**`tests/records-architecture.spec.ts:121`** and **line 156** — similar pattern. In each case, find the state indicator that proves the operation completed and assert on it directly.

**`tests/report-types.spec.ts:105`** — `await page.waitForTimeout(2000)`:
Replace with:
```ts
const firstBadge = page.locator('...').first()
await expect(firstBadge.or(page.getByTestId(TestIds.EMPTY_STATE))).toBeVisible({ timeout: Timeouts.ELEMENT })
```

#### Remove `Timeouts.ASYNC_SETTLE` and `Timeouts.UI_SETTLE` from the exported constants

Once all usages are eliminated, remove `ASYNC_SETTLE` and `UI_SETTLE` from `tests/helpers.ts:15–28`. Their existence invites future misuse. Retain `NAVIGATION`, `API`, `ELEMENT`, and `AUTH` — these are legitimate timeout bounds, not sleep durations.

---

### 5. Module-Level State Elimination

**Rule: Zero module-level mutable `let` variables in step files.**

Scenario state must be scenario-scoped. The correct place for cross-step state within a scenario is the World object (playwright-bdd fixture) or a `Before`/`After` hook that initializes a scenario-local object.

#### Desktop step files

**`tests/steps/admin/admin-flow-steps.ts:19–22`:**
```ts
let lastVolunteerName = ''
let lastVolunteerPubkey = ''
let lastShiftName = ''
let lastPhone = ''
```

These must move into the World fixture. playwright-bdd supports custom World via `createBdd({ ... })`. Add scenario-scoped state:
```ts
// In tests/fixtures.ts — extend the World type
export type AdminWorld = {
  lastVolunteerName: string
  lastVolunteerPubkey: string
  lastShiftName: string
  lastPhone: string
}
```
Access via `world.lastVolunteerName` in step definitions. The World is re-created for every scenario, so there is no cross-scenario pollution.

Alternatively, if World extension is not currently used, a simpler approach is to declare the state in the `Before` hook using a closure:
```ts
// Use a Map keyed by scenario ID — but this is more complex
```
The World approach is cleaner. Use it.

#### Backend step files

`tests/steps/backend/shared-state.ts` exports a mutable `shared` object. Its `resetSharedState()` function is called from `Before` hooks in individual step files. This works for serial execution but breaks with `fullyParallel: true` because all workers share the same module instance.

The fix: make `shared` scenario-scoped using the playwright-bdd World or a `Before` hook that creates a new object per scenario and passes it via closure or parameter injection. Since playwright-bdd steps receive `world` as the first argument, the state belongs on `world`.

All 30+ backend step files that currently declare `let state: SomeState` at module scope must be refactored to declare state in a `Before` hook and store it on `world` or a scenario-local closure.

This is the most labor-intensive part of the overhaul. Prioritize:
1. `tests/steps/backend/shared-state.ts` — affects every backend scenario
2. `tests/steps/backend/call-actions.steps.ts:22–25` — `lastCallerNumber`, `banCountBefore`
3. `tests/steps/backend/relay.steps.ts:32–33` — `lastCapturedEvent`, `serverPubkey`
4. All other files with module-level `let` state

---

### 6. Selector Standards

**Rule: `tests/test-ids.ts` (the `TestIds` object) is the only selector registry.**

#### Delete `buttonTestIdMap` from `interaction-steps.ts`

`interaction-steps.ts:16–46` duplicates mappings that already exist in `TestIds`. The `clickByTextOrTestId` function uses this map to resolve button labels to test IDs. Instead, the generic step `When('I click {string}')` should use `TestIds` directly via a lookup, or the feature files should use more specific steps that already target the correct `data-testid`.

The long-term fix: feature file steps should be specific enough that they call `page.getByTestId(TestIds.VOLUNTEER_ADD_BTN)` directly, not `page.getByRole('button', { name: 'Add Volunteer' })`. The generic `I click {string}` step is a shortcut that produces fragile tests. Replace callers of the generic step with specific steps, then remove `buttonTestIdMap`.

**Transitional approach** (acceptable if the full replacement is out of scope for this epic): remove `buttonTestIdMap` and make `clickByTextOrTestId` fall through to `page.getByRole('button', { name: text })` directly. This removes the duplicated registry while keeping the generic step working for BDD parameterization.

#### Delete `sectionTestIdMap` from `interaction-steps.ts`

`sectionTestIdMap:183–197` maps section names to test IDs. These IDs should be in `TestIds`. Add the missing entries to `TestIds`:
```ts
SETTINGS_CUSTOM_FIELDS: 'custom-fields',
SETTINGS_TELEPHONY: 'telephony',
SETTINGS_TRANSCRIPTION: 'transcription',
SETTINGS_SPAM: 'spam-section',
SETTINGS_KEY_BACKUP: 'key-backup',
SETTINGS_LINKED_DEVICES: 'linked-devices',
SETTINGS_PROFILE: 'profile',
SETTINGS_THEME: 'theme',
SETTINGS_LANGUAGE: 'language',
SETTINGS_NOTIFICATIONS: 'notifications',
SETTINGS_PASSKEYS: 'passkeys',
```
Then delete `sectionTestIdMap` and update `I expand the {string} section` to look up `TestIds` directly.

#### Forbidden selector patterns

The following patterns are banned from all test files:

| Banned | Reason | Replacement |
|---|---|---|
| `.cursor-pointer` | CSS utility class, breaks on theme change | Add `data-testid` to the trigger element |
| `.text-destructive` | CSS utility class | Use `getByTestId(TestIds.ERROR_MESSAGE)` or `getByRole('alert')` |
| `.text-\\[10px\\]` | Tailwind arbitrary value | Add `data-testid` to the badge element |
| `button[type="button"]` | Matches every button | Use `data-testid` |
| `locator('button').nth(1)` | Position-based, breaks on reorder | Add `data-testid` to the specific button |
| `[data-slot="card-header"]` | Internal shadcn attribute, may change | Add `data-testid` to the card header |
| `[data-settings-section]` | Private implementation attribute | Use `data-testid` via `TestIds` |
| `#nsec` | DOM ID selector | Add `data-testid="nsec-input"` to the component; add `TestIds.NSEC_INPUT` |
| `#cms-toggle` | DOM ID selector | Add `data-testid` and `TestIds` entry |
| `#report-types` | DOM ID selector | Add `data-testid` and `TestIds` entry |
| `#call-id` | DOM ID selector | Already has `TestIds.NOTE_CALL_ID` — use it |

Any time a selector requires digging into DOM structure or CSS classes to find an element, the correct fix is to add a `data-testid` attribute to the element in the component and add a constant to `TestIds`.

#### The `LOGOUT_BTN` duplication

`interaction-steps.ts:31–32` and `assertion-steps.ts:12–14` both map `'Log Out'` and `'Logout'` to `TestIds.LOGOUT_BTN`. Consolidate by removing the mapping from `assertion-steps.ts` and having it import `buttonTestIdMap` from `interaction-steps.ts` (or, after `buttonTestIdMap` is deleted, use `TestIds.LOGOUT_BTN` directly).

---

### 7. Tests to Delete

**Rule: A test must be able to FAIL. If a test cannot produce a meaningful failure that indicates something broke, delete it. Tests that only assert element existence, trivially-true math, or always-passing conditions are noise, not signal.**

#### Delete `tests/epic-24-27.spec.ts` entirely

This file is named after internal epic numbers, not feature behaviors. All tests in it are heading-existence or dialog-existence checks. Any real behavioral regression in Epic 24–27 features would not be caught by these tests. The behaviors they purport to cover are already covered (or should be covered) by the BDD feature files in `packages/test-specs/features/`.

Specific problems per test:
- `sidebar shows shift status indicator` — checks that text matching `/until|next shift|no shifts assigned/i` exists somewhere in `nav`. Passes even if the feature is broken but some other text matches.
- `dashboard shows calls today metric` — checks that "calls today" text exists. Not a behavioral test.
- `command palette opens with Ctrl+K` — this is an acceptable test, but it belongs in a BDD feature file, not a file named `epic-24-27.spec.ts`.
- `voice prompts card shows prompt types` — asserts `getByText('Greeting').first()` is visible. Not meaningful.
- `settings toggle shows confirmation dialog` — this is a real behavioral test. Keep the behavior, but move it to the appropriate BDD feature file with proper `data-testid` selectors instead of positional `.last()` locators.

**Action:** Delete `tests/epic-24-27.spec.ts`. Migrate the two real behavioral tests (confirmation dialog behavior) to `packages/test-specs/features/desktop/settings/` as BDD scenarios with proper selectors.

#### Delete empty-body step definitions in `tests/steps/admin/desktop-admin-steps.ts`

These steps always pass regardless of application state:

- Line 143–145: `Given('a call with a recording exists', async () => { // Test data precondition })` — empty body
- Line 147–149: `Given('a call without a recording exists', async () => { // Test data precondition })` — empty body
- Line 168–170: `Then('the call entry should not show a recording badge', async ({ page }) => { // No recording badge should be visible })` — empty body, asserts nothing
- Line 266–268: `Given('multiple hubs exist', async () => { // Precondition })` — empty body
- Line 295–296: `When('I switch to a specific hub', async ({ page }) => { // Select first available hub })` — empty body
- Line 362–366: `Then('both channels should be marked as selected', ...) { // Verify selected state }` + `Then('other channels should not be selected', ...)` + `Then('the channel should be deselected', ...)` — all empty

**Action:** For each empty step, either:
1. **Implement it** — write the actual assertion or data setup that makes the step meaningful, or
2. **Delete the step and its matching Gherkin line** from the feature file — if the behavior cannot be tested, the scenario should not exist

"Precondition" steps that create test data must actually create the data via API (`page.request.post(...)`) or the data setup fixture. Empty precondition steps are silent lies that allow the following steps to fail on missing data without a clear error.

#### Rewrite `tests/report-types.spec.ts:100–115`

```ts
test('report card shows report type badge', async ({ page }) => {
  await page.waitForTimeout(2000)
  const badges = page.locator('button[type="button"]').first().locator('.text-\\[10px\\]')
  if (await badges.count() > 0) {
    const badgeText = await badges.first().textContent()
    expect(badgeText?.trim().length).toBeGreaterThan(0)
  }
})
```

This test:
- Burns 2000ms unconditionally
- Uses two banned selectors (`button[type="button"]` and `.text-\\[10px\\]`)
- Has a conditional assertion that passes trivially when `badges.count() === 0`

**Action:** The preceding test (`creating report with selected type works`) already creates a report with a type. This test should:
1. Assert the report created in the previous step has a visible type badge with `data-testid="report-type-badge"`
2. Add `data-testid="report-type-badge"` to the badge element in the component
3. Assert `await expect(page.getByTestId('report-type-badge').first()).toBeVisible()`

If this test cannot be made deterministic (because it depends on the previous serial test), consider merging it into the `creating report with selected type works` test or converting the entire `report-types.spec.ts` to BDD scenarios.

#### Rewrite `tests/records-architecture.spec.ts:250–271`

```ts
test('reports page only shows reports, not conversations', ...)
test('conversations page only shows conversations, not reports', ...)
```

Both tests assert only that an `h1` heading is visible. They do not verify data isolation between reports and conversations. A regression that showed conversation data on the reports page would not be caught.

**Action:** Implement actual data isolation verification:
1. Create a report via API
2. Create a conversation via API (or skip if conversations require real telephony)
3. Navigate to `/reports` — assert that `REPORT_CARD` is visible and `CONVERSATION_ITEM` is not
4. Navigate to `/conversations` — assert the reverse

If real data isolation testing requires telephony infrastructure not available in the test environment, delete these tests — they currently provide zero isolation signal.

---

### 8. Additional Files to Audit Post-Overhaul

These files were not the focus of this spec but contain patterns that should be addressed in a follow-on pass:

- `tests/steps/backend/relay.steps.ts:32–33` — `lastCapturedEvent`, `serverPubkey` at module scope
- `tests/steps/common/assertion-steps.ts` — second `buttonTestIdMap`-equivalent (lines 12–15 and 136–137)
- `tests/records-architecture.spec.ts:95,121,156` — remaining `waitForTimeout` after reply sends
- `tests/steps/calls/call-steps.ts:125–126` — `dateInputs.first()` and `dateInputs.nth(1)` position-based
- `tests/steps/crypto/crypto-steps.ts:173,252` — `#nsec` DOM ID selector (must add `TestIds.NSEC_INPUT`)
- `tests/steps/admin/desktop-admin-steps.ts:208` — `.cursor-pointer` click to expand settings section

---

## Success Criteria

All of the following must be true before this overhaul is considered complete:

| Criterion | Current | Target |
|---|---|---|
| `waitForTimeout` occurrences | 202 | 0 |
| Playwright projects | 7 | 3 (+ `globalSetup`) |
| `bdd-serial` project | exists | deleted |
| `@resets-state` tag | 15+ uses | 0 uses, tag deleted |
| Test isolation | shared DB | hub-per-worker |
| Module-level mutable `let` in step files | 30+ | 0 |
| Selector registries | 3 | 1 (`TestIds`) |
| `buttonTestIdMap` | exists | deleted |
| `sectionTestIdMap` | exists | deleted |
| `epic-24-27.spec.ts` | exists | deleted |
| Empty-body step definitions | 6+ | 0 |
| CSS class selectors in tests | 6+ | 0 |
| Position-based selectors (`nth`, `first()` on ambiguous sets) | many | 0 |
| DOM ID selectors (`#nsec`, `#cms-toggle`, etc.) | 4+ | 0 |
| CI wall-clock time (3 workers) | unknown (dominated by sleeps) | target < 2 minutes |
| `bootstrap` project forced dependency on `chromium` | exists | removed (bootstrap creates own data) |
| Backend BDD parallel | `fullyParallel: false` | `fullyParallel: true`, workers: 3 |

---

## Implementation Order

These changes have dependencies. Implement in this order:

1. **Hub-per-worker isolation** — unblocks all parallel work. Implement the `workerHub` fixture first.
2. **Delete `bdd-serial` and `@resets-state`** — only possible after isolation is in place.
3. **Playwright config simplification** — straightforward once serial project is gone.
4. **`waitForTimeout` elimination** — can proceed in parallel with isolation work; no dependency.
5. **Module-level state elimination** — parallel safe, no dependency on isolation.
6. **Selector consolidation** — delete `buttonTestIdMap`, `sectionTestIdMap`; add missing `TestIds` entries; fix CSS selectors.
7. **Delete vacuous tests** — final cleanup.

---

## What Not to Do

- Do not add more `waitForTimeout` calls to "fix" flaky tests. Find the underlying race condition.
- Do not create a new selector map anywhere. If a selector is missing from `TestIds`, add it to `TestIds`.
- Do not mark a test `test.skip()` to get CI passing. Either fix the underlying issue or delete the test.
- Do not soften an assertion from `toBeVisible()` to a conditional `if (await el.isVisible())` to avoid flakiness. A conditional is the same as no assertion.
- Do not add the `@wip` tag to hide broken scenarios. Fix them or delete them.
- Do not create new `@resets-state` scenarios. All new scenarios must be self-contained within their worker's hub.
