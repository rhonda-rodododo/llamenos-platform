# Hybrid Testing Approach

This document describes the hybrid testing strategy for the Llamenos project: **BDD for backend API contracts, traditional E2E for UI**.

## Rationale

After running full BDD across all platforms for several months, we identified significant overhead:

| Problem | Impact |
|---------|--------|
| **187 feature files**, ~1,090 scenarios, 236 step files, ~59k lines | Massive maintenance burden |
| Gherkin abstraction adds indirection for simple UI assertions | Slower to write, harder to debug |
| Android Cucumber tests had silent-pass logic (`GenericSteps.kt`: 543 lines of try/catch swallowing failures) | Tests could not actually fail — gave false confidence |
| Only 29 of 187 feature files copied to Android build | 3% scenario coverage on mobile |
| Step definitions drift from UI implementation | Frequent breakage, cascading fixes |

**The insight**: BDD excels at specifying *behavioral contracts* (API permissions, auth flows, E2EE guarantees) but adds overhead for *UI verification* (element visible, text correct, button clickable).

## Strategy

### What stays BDD

Backend API contract tests that specify cross-functional behavior:

- **Authentication & authorization** — login, logout, role-based access, device linking
- **E2EE guarantees** — note encryption, key rotation, envelope validation
- **Call routing logic** — parallel ringing, shift matching, fallback groups
- **Audit logging** — every action tracked, tamper-evident chain
- **Multi-hub isolation** — users in multiple hubs see correct data

These tests live in `packages/test-specs/features/` and run via `playwright-bdd` in the `bdd` and `backend-bdd` Playwright projects.

### What moved to traditional E2E

UI-focused tests that assert element visibility, navigation, and layout:

- **Desktop** — `tests/traditional/*.spec.ts` using raw Playwright `test`/`expect`
- **Android** — `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/*.kt` using JUnit4 + Compose UI test
- **iOS** — (future) XCUITest with Page Object pattern

## Directory Structure

```
tests/
  traditional/              # Desktop traditional tests
    auth.spec.ts            # PIN login, invalid PIN
    call-lifecycle.spec.ts  # Dashboard cards, call history
    README.md
  traditional-fixtures.ts   # Shared workerHub fixture (BDD + traditional)
  steps/
    fixtures.ts             # BDD fixtures (imports workerHub from traditional-fixtures)
    ...
  pages/
    index.ts                # Page Object Model (Navigation, LoginPage, DashboardPage, ...)

apps/android/app/src/androidTest/
  java/org/llamenos/hotline/
    traditional/            # Android traditional tests
      TestHelpers.kt        # BaseUiTest with hub isolation
      AuthTest.kt
      DashboardTest.kt
      HubManagementTest.kt
      README.md
```

## Running Tests

### Desktop

```bash
# Traditional tests only
bunx playwright test --project=traditional

# All desktop tests (bootstrap + chromium + bdd + traditional)
bunx playwright test --project=bootstrap --project=chromium --project=bdd --project=traditional

# Backend BDD only
bunx playwright test --project=backend-bdd
```

### Android

```bash
# From apps/android/
./gradlew connectedDebugAndroidTest

# Compile only
./gradlew compileDebugAndroidTestKotlin
```

## Patterns

### Desktop (Playwright)

```typescript
import { test, expect } from "../traditional-fixtures";
import { LoginPage } from "../pages";

test("admin login shows dashboard", async ({ page, workerHub }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.enterNsec(workerHub.adminNsec);
  await login.submit();
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
});
```

Rules:
- Import `test` from `../traditional-fixtures` to get `workerHub` fixture
- Use Page Object methods from `tests/pages/index.ts`
- Always use `data-testid` selectors
- No `waitForTimeout` — deterministic assertions only

### Android (Compose UI)

```kotlin
class AuthTest : BaseUiTest() {

  @Test
  fun adminLoginWithPin_showsDashboard() {
    navigateToMainScreen()
    composeRule.onNodeWithTag("dashboard-title").assertIsDisplayed()
  }
}
```

Rules:
- Extend `BaseUiTest` for hub isolation and helpers
- Use `.assertIsDisplayed()` directly — no try/catch swallowing
- Reuse existing test tags (e.g., `"pin-pad"`, `"dashboard-title"`)

## Migration Status

| Platform | Status | Notes |
|----------|--------|-------|
| Desktop | **Migrated** | `traditional` project active, pilot tests passing |
| Android | **Migrated** | Cucumber removed, traditional tests in place |
| iOS | **Pending** | XCUITest with Page Object pattern (future work) |
| Backend BDD | **Retained** | API contract tests unchanged |

## FAQ

**Q: Why not keep BDD for everything?**
A: BDD's Gherkin layer is valuable when non-technical stakeholders review scenarios. For UI tests that only engineers write and maintain, the abstraction adds overhead without benefit. The hybrid approach keeps BDD where it shines (contracts) and uses direct tests where it doesn't (UI).

**Q: Will we delete the BDD feature files?**
A: No. Backend BDD tests remain the source of truth for API behavior. Only UI-focused scenarios are being superseded by traditional tests. Over time, redundant UI BDD scenarios may be deprecated platform-by-platform.

**Q: What about Cucumber-Android specifically?**
A: It was removed entirely. The `cucumber-android` dependency, `CucumberHiltRunner`, all 70+ step definition files, and the `copyFeatureFiles` Gradle task were deleted. The silent-pass bug in `GenericSteps.kt` made the tests unable to fail, rendering them worse than useless.

**Q: How do we prevent drift between traditional tests and UI changes?**
A: Same discipline as BDD — update tests when UI changes. Traditional tests are actually *easier* to update because there's no indirection through Gherkin → step definition → page object. The test code is the test code.

## References

- `tests/traditional/README.md` — Desktop traditional test docs
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/README.md` — Android traditional test docs
- `docs/superpowers/plans/2026-05-08-hybrid-bdd-traditional-migration.md` — Full migration plan
