# Playwright Test Infrastructure Improvements

## Status: Analysis Complete — Ready for Implementation

This document identifies pattern-level improvements for the Playwright test infrastructure. These are candidates for a follow-up PR after the hybrid BDD-to-traditional migration is complete.

---

## 1. Split Monolithic `tests/pages/index.ts` into Cohesive Modules

**Current Problem:**
`tests/pages/index.ts` is 553 lines containing Navigation helpers, VolunteerPage, ShiftPage, BanListPage, NotesPage, CallHistoryPage, Dialogs, LoginPage, DashboardPage, and Forms all in one file. This violates single responsibility and creates merge conflicts.

**Proposed Solution:**
Split into page-specific modules:
```
tests/pages/
  index.ts          # Re-exports only (barrel file)
  navigation.ts     # Navigation helpers
  login.ts          # LoginPage
  dashboard.ts      # DashboardPage
  volunteers.ts     # VolunteerPage
  shifts.ts         # ShiftPage
  calls.ts          # CallHistoryPage
  notes.ts          # NotesPage
  bans.ts           # BanListPage
  dialogs.ts        # Dialog helpers
  forms.ts          # Form helpers
```

**Effort:** Medium (1-2 hours, mostly mechanical)
**Files Affected:** `tests/pages/index.ts` → split into 10 files; update all imports in `tests/steps/**/*.ts`, `tests/traditional/*.ts`

---

## 2. Audit and Prune Stale Test IDs

**Current Problem:**
`tests/test-ids.ts` has 393 lines with IDs like `DASHBOARD_QUICK_ACTIONS` that don't exist in the actual UI. The dashboard.tsx has no `data-testid="dashboard-quick-actions"`. This causes false confidence — tests reference IDs that will never match anything.

**Proposed Solution:**
1. Write a script that scans `src/client/` for all `data-testid` attributes
2. Compare against `tests/test-ids.ts` exports
3. Flag test IDs that exist in tests but not in UI (stale)
4. Flag test IDs that exist in UI but not in tests (missing coverage)
5. Remove stale IDs, add missing ones

**Effort:** Small (script + cleanup, 1 hour)
**Files Affected:** `tests/test-ids.ts`, `src/client/**/*.tsx` (for missing IDs)

---

## 3. Simplify `loginAsAdmin()` Helper

**Current Problem:**
`loginAsAdmin()` in `tests/helpers.ts` is ~200 lines with multiple fallback paths:
- Try storage state from `tests/storage/admin.json`
- Check if keys are stale
- Fall back to `ADMIN_SEED`
- Call `deviceImportAndLoad` via `__TEST_PLATFORM`
- Handle mobile viewport

It also spams `[TEST] Bootstrap admin keys stale...` to console on every test.

**Proposed Solution:**
1. Extract the auth flow into a dedicated `tests/auth-helper.ts`
2. Separate concerns: `bootstrapAdmin()` (one-time setup) vs `loginAsAdmin()` (fast path)
3. Cache the authenticated state and reuse across tests in the same worker
4. Remove console.log spam — use Playwright's built-in logging if needed

**Effort:** Medium (refactoring, 2-3 hours)
**Files Affected:** `tests/helpers.ts`, new `tests/auth-helper.ts`, all test files using `loginAsAdmin`

---

## 4. Unify BDD and Traditional Test Patterns

**Current Problem:**
BDD tests use step definitions that call page objects. Traditional tests call page objects directly. But the patterns differ:
- BDD: `Navigation.goToDashboard(page)` then assertions in step defs
- Traditional: Same navigation but mixed with direct `expect()` calls

Some BDD step definitions duplicate logic that's already in page objects.

**Proposed Solution:**
1. Make page objects the single source of truth for ALL UI interactions
2. BDD step definitions should be thin wrappers around page objects
3. Traditional tests should use page objects exclusively (no direct `page.getByTestId()`)
4. Add a lint rule or code review checklist to enforce this

**Effort:** Medium (refactoring step definitions, 3-4 hours)
**Files Affected:** `tests/steps/**/*.ts`, `tests/traditional/*.ts`, `tests/pages/*.ts`

---

## 5. Add Test ID Validation to CI

**Current Problem:**
No automated check prevents developers from adding test IDs to tests that don't exist in the UI, or removing test IDs from UI that tests depend on.

**Proposed Solution:**
Add a CI step that:
1. Builds the app with `PLAYWRIGHT_TEST=true`
2. Extracts all `data-testid` attributes from the built HTML/JS
3. Extracts all `TestIds.*` references from test files
4. Fails the build if there's a mismatch

**Effort:** Medium (script + CI integration, 2-3 hours)
**Files Affected:** `.github/workflows/ci.yml`, new `scripts/validate-test-ids.ts`

---

## 6. Improve Fixture Type Safety

**Current Problem:**
`tests/traditional-fixtures.ts` has an empty first type parameter:
```typescript
export const test = base.extend<{}, { workerHub: string }>({
```

This is a workaround because `workerHub` is worker-scoped. The type is confusing.

**Proposed Solution:**
1. Add explicit fixture types:
```typescript
interface TraditionalFixtures {
  // scenario-scoped fixtures here
}
interface WorkerFixtures {
  workerHub: string
}
export const test = base.extend<TraditionalFixtures, WorkerFixtures>({
```

2. Document why worker-scoped fixtures need the empty first parameter

**Effort:** Small (1 hour)
**Files Affected:** `tests/traditional-fixtures.ts`, `tests/steps/fixtures.ts`

---

## 7. Add Visual Regression Testing

**Current Problem:**
Tests assert element visibility and text but don't catch visual regressions (CSS changes, layout shifts, theme breakage).

**Proposed Solution:**
Add Playwright's built-in screenshot comparison:
```typescript
test('dashboard looks correct', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page).toHaveScreenshot('dashboard.png')
})
```

Start with 5-10 critical screens (login, dashboard, notes, settings).

**Effort:** Medium (setup + baseline screenshots, 2-3 hours)
**Files Affected:** `playwright.config.ts` (update snapshot settings), new test files

---

## 8. Parallelize Traditional Tests Further

**Current Problem:**
Traditional tests depend on `bootstrap` project but then run with `workers=1` in some cases. The `workerHub` fixture is worker-scoped but tests could be more parallel.

**Proposed Solution:**
1. Make `workerHub` scenario-scoped instead of worker-scoped (slower but more isolated)
2. OR: shard traditional tests across more workers
3. Profile test execution time and optimize slow tests

**Effort:** Small-Medium (configuration change, 1-2 hours)
**Files Affected:** `playwright.config.ts`, `tests/traditional-fixtures.ts`

---

## 9. Extract API Helpers into Typed Module

**Current Problem:**
`tests/api-helpers.ts` likely has untyped or loosely typed API helpers. Type safety would catch API contract changes early.

**Proposed Solution:**
1. Generate types from the OpenAPI spec or Zod schemas
2. Type all API helper functions
3. Add response validation using Zod

**Effort:** Medium (type generation + refactoring, 3-4 hours)
**Files Affected:** `tests/api-helpers.ts`, type generation script

---

## 10. Add Test Performance Monitoring

**Current Problem:**
No visibility into which tests are slow or flaky over time.

**Proposed Solution:**
1. Use Playwright's built-in test duration reporting
2. Add a script that parses test results and flags tests >10s or with high retry rates
3. Track trends in CI (optional: upload to a simple dashboard)

**Effort:** Small (script, 1-2 hours)
**Files Affected:** New `scripts/analyze-test-performance.ts`, CI workflow

---

## Priority Ranking

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| P1 | Split `tests/pages/index.ts` | Medium | High — maintainability |
| P1 | Audit stale test IDs | Small | High — prevents false positives |
| P2 | Simplify `loginAsAdmin()` | Medium | Medium — test speed |
| P2 | Unify BDD/traditional patterns | Medium | Medium — consistency |
| P2 | Add test ID validation to CI | Medium | High — prevents regressions |
| P3 | Improve fixture type safety | Small | Low — developer experience |
| P3 | Visual regression testing | Medium | Medium — catches UI bugs |
| P3 | Parallelize traditional tests | Small | Medium — faster CI |
| P4 | Extract typed API helpers | Medium | Medium — type safety |
| P4 | Test performance monitoring | Small | Low — visibility |

---

## Recommended Next Steps

1. **Immediate (this week):** Implement P1 items (split pages, audit test IDs)
2. **Short-term (next sprint):** Implement P2 items (simplify auth, unify patterns, CI validation)
3. **Medium-term:** P3 items (visual regression, parallelization)
4. **Backlog:** P4 items (typed APIs, performance monitoring)
