# Cross-Platform Test Plan — Admin Sidebar Port

**Date:** 2026-05-11  
**Parent Spec:** `2026-05-11-admin-sidebar-port-design.md`  
**Scope:** Desktop (Playwright), iOS (XCUITest), Android (Compose UI + Cucumber BDD)

## Testing Philosophy

1. **Behavior over UI:** Tests assert state changes, navigation, and permission boundaries — not just element existence
2. **Stable selectors:** Use `data-testid` and accessibility identifiers exclusively — no text-based selectors
3. **Permission coverage:** Test both positive (can see) and negative (cannot see) cases for each role
4. **Cross-platform parity:** Same behavioral scenarios tested on all platforms

## Test Matrix

| Scenario | Desktop | iOS | Android | Priority |
|----------|---------|-----|---------|----------|
| Hub admin sees correct groups | Playwright | XCUITest | Compose | P0 |
| Super admin sees platform group | Playwright | XCUITest | Compose | P0 |
| Volunteer cannot access admin | Playwright | XCUITest | Compose | P0 |
| Nav item selection works | Playwright | XCUITest | Compose | P0 |
| Mobile drawer/sheet works | Playwright | XCUITest | Compose | P0 |
| Deeplink to section | Playwright | XCUITest | Compose | P1 |
| Legacy route redirect | Playwright | N/A | N/A | P1 |
| Section save/cancel | Playwright | XCUITest | Compose | P1 |
| Advanced reveal toggle | Playwright | XCUITest | Compose | P2 |
| Permission change updates nav | Playwright | XCUITest | Compose | P2 |

## Desktop Tests (Playwright)

### Test Helpers

**tests/helpers/admin-settings.ts:**
```typescript
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

// Navigation
export async function gotoAdminSection(page: Page, slug: string) {
  await page.goto(`/admin/${slug}`)
  await expect(page.getByTestId('admin-section')).toHaveAttribute('data-section', slug)
}

export async function expectActiveNavItem(page: Page, slug: string) {
  const item = page.getByTestId(`admin-sidebar-item-${slug}`)
  await expect(item).toHaveAttribute('data-status', 'active')
}

export async function openMobileNav(page: Page) {
  await page.getByTestId('admin-sidebar-toggle').click()
  await expect(page.getByTestId('admin-sidebar-drawer')).toBeVisible()
}

export async function closeMobileNav(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('admin-sidebar-drawer')).not.toBeVisible()
}

// Visibility
export async function expectNavGroupVisible(page: Page, groupSlug: string) {
  await expect(page.getByTestId(`admin-sidebar-group-${groupSlug}`)).toBeVisible()
}

export async function expectNavGroupHidden(page: Page, groupSlug: string) {
  await expect(page.getByTestId(`admin-sidebar-group-${groupSlug}`)).not.toBeVisible()
}

export async function expectNavItemVisible(page: Page, itemSlug: string) {
  await expect(page.getByTestId(`admin-sidebar-item-${itemSlug}`)).toBeVisible()
}

export async function expectNavItemHidden(page: Page, itemSlug: string) {
  await expect(page.getByTestId(`admin-sidebar-item-${itemSlug}`)).not.toBeVisible()
}

// Section interactions
export async function revealAdvanced(page: Page, sectionSlug: string) {
  await page.getByTestId(`admin-advanced-reveal-${sectionSlug}`).click()
  await expect(page.getByTestId(`admin-advanced-panel-${sectionSlug}`)).toBeVisible()
}

export async function hideAdvanced(page: Page, sectionSlug: string) {
  await page.getByTestId(`admin-advanced-reveal-${sectionSlug}`).click()
  await expect(page.getByTestId(`admin-advanced-panel-${sectionSlug}`)).not.toBeVisible()
}

export async function saveSection(page: Page, sectionSlug: string) {
  await page.getByTestId(`admin-${sectionSlug}-save`).click()
  await expect(page.getByTestId(`admin-${sectionSlug}-save-success`)).toBeVisible({ timeout: 5000 })
}
```

### Test Specs

**tests/ui/admin-shell.spec.ts:**
```typescript
import { test } from '../fixtures/auth'
import {
  closeMobileNav,
  expectActiveNavItem,
  expectNavGroupHidden,
  expectNavGroupVisible,
  expectNavItemHidden,
  expectNavItemVisible,
  gotoAdminSection,
  openMobileNav,
} from '../helpers/admin-settings'

test.describe('admin shell', () => {
  test('hub admin sees this-hub groups, not platform', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin')
    await expectNavGroupVisible(hubAdminPage, 'general')
    await expectNavGroupVisible(hubAdminPage, 'people')
    await expectNavGroupVisible(hubAdminPage, 'intake')
    await expectNavGroupVisible(hubAdminPage, 'calls-voice')
    await expectNavGroupVisible(hubAdminPage, 'channels')
    await expectNavGroupVisible(hubAdminPage, 'operations')
    await expectNavGroupHidden(hubAdminPage, 'platform')
  })

  test('hub admin sees operations items', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin')
    await expectNavItemVisible(hubAdminPage, 'bans')
    await expectNavItemVisible(hubAdminPage, 'audit')
    await expectNavItemVisible(hubAdminPage, 'analytics')
    await expectNavItemVisible(hubAdminPage, 'health')
  })

  test('hub admin cannot see platform items', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin')
    await expectNavItemHidden(hubAdminPage, 'hubs')
    await expectNavItemHidden(hubAdminPage, 'platform-roles')
    await expectNavItemHidden(hubAdminPage, 'platform')
  })

  test('super-admin sees platform group', async ({ adminPage }) => {
    await adminPage.goto('/admin')
    await expectNavGroupVisible(adminPage, 'platform')
    await expectNavItemVisible(adminPage, 'hubs')
    await expectNavItemVisible(adminPage, 'platform-roles')
  })

  test('nav item click updates active state', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin')
    await hubAdminPage.getByTestId('admin-sidebar-item-teams').click()
    await expectActiveNavItem(hubAdminPage, 'teams')
  })

  test('deeplink loads correct section', async ({ hubAdminPage }) => {
    await gotoAdminSection(hubAdminPage, 'spam-protection')
    await expect(hubAdminPage.getByTestId('admin-section')).toHaveAttribute('data-section', 'spam-protection')
  })

  test('mobile drawer opens + closes', async ({ hubAdminPage }) => {
    await hubAdminPage.setViewportSize({ width: 375, height: 667 })
    await hubAdminPage.goto('/admin')
    await openMobileNav(hubAdminPage)
    await closeMobileNav(hubAdminPage)
  })

  test('legacy /admin/settings redirects', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin/settings')
    await expect(hubAdminPage).toHaveURL(/\/admin\/[a-z-]+/)
  })
})
```

**tests/ui/admin-nav-config.spec.ts:**
```typescript
import { test } from '../fixtures/auth'
import { adminNavConfig } from '@/components/admin-shell/admin-nav-config'
import { gotoAdminSection } from '../helpers/admin-settings'

test.describe('admin nav config', () => {
  for (const group of adminNavConfig.groups) {
    for (const item of group.items) {
      test(`route renders: ${item.slug}`, async ({ adminPage }) => {
        await gotoAdminSection(adminPage, item.slug)
        await expect(adminPage.getByTestId('admin-section')).toHaveAttribute('data-section', item.slug)
      })
    }
  }
})
```

**tests/ui/admin-permissions.spec.ts:**
```typescript
import { test } from '../fixtures/auth'
import { expectNavGroupVisible, expectNavGroupHidden } from '../helpers/admin-settings'

test.describe('admin permission boundaries', () => {
  test('volunteer cannot access admin', async ({ volunteerPage }) => {
    await volunteerPage.goto('/admin')
    await expect(volunteerPage).toHaveURL('/')  // Redirected away
  })

  test('reviewer cannot access admin', async ({ reviewerPage }) => {
    await reviewerPage.goto('/admin')
    await expect(reviewerPage).toHaveURL('/')
  })

  test('hub admin can access admin', async ({ hubAdminPage }) => {
    await hubAdminPage.goto('/admin')
    await expect(hubAdminPage.getByTestId('admin-shell')).toBeVisible()
  })
})
```

## iOS Tests (XCUITest)

### Test Helpers

**Tests/XCUITests/Helpers/AdminSidebarHelper.swift:**
```swift
import XCTest

enum AdminSidebarHelper {
    static func gotoAdmin(_ app: XCUIApplication) {
        app.tabBars.buttons["Settings"].tap()
        app.buttons["admin-navigate"].tap()
    }
    
    static func expectGroupVisible(_ app: XCUIApplication, groupSlug: String) {
        XCTAssertTrue(app.staticTexts["admin-sidebar-group-\(groupSlug)"].exists)
    }
    
    static func expectGroupHidden(_ app: XCUIApplication, groupSlug: String) {
        XCTAssertFalse(app.staticTexts["admin-sidebar-group-\(groupSlug)"].exists)
    }
    
    static func expectItemVisible(_ app: XCUIApplication, itemSlug: String) {
        XCTAssertTrue(app.buttons["admin-sidebar-item-\(itemSlug)"].exists)
    }
    
    static func expectItemHidden(_ app: XCUIApplication, itemSlug: String) {
        XCTAssertFalse(app.buttons["admin-sidebar-item-\(itemSlug)"].exists)
    }
    
    static func tapItem(_ app: XCUIApplication, itemSlug: String) {
        app.buttons["admin-sidebar-item-\(itemSlug)"].tap()
    }
    
    static func expectSectionLoaded(_ app: XCUIApplication, slug: String) {
        XCTAssertTrue(app.otherElements["admin-section-\(slug)"].waitForExistence(timeout: 5))
    }
}
```

### Test Specs

**Tests/XCUITests/AdminSidebarUITests.swift:**
```swift
import XCTest

class AdminSidebarUITests: XCTestCase {
    var app: XCUIApplication!
    
    override func setUp() {
        super.setUp()
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
    }
    
    func testHubAdminSeesCorrectGroups() {
        // Login as hub admin
        LoginHelper.loginAsHubAdmin(app)
        
        // Navigate to admin
        AdminSidebarHelper.gotoAdmin(app)
        
        // Verify groups
        AdminSidebarHelper.expectGroupVisible(app, groupSlug: "general")
        AdminSidebarHelper.expectGroupVisible(app, groupSlug: "people")
        AdminSidebarHelper.expectGroupVisible(app, groupSlug: "operations")
        AdminSidebarHelper.expectGroupHidden(app, groupSlug: "platform")
    }
    
    func testSuperAdminSeesPlatform() {
        LoginHelper.loginAsSuperAdmin(app)
        AdminSidebarHelper.gotoAdmin(app)
        
        AdminSidebarHelper.expectGroupVisible(app, groupSlug: "platform")
        AdminSidebarHelper.expectItemVisible(app, itemSlug: "hubs")
        AdminSidebarHelper.expectItemVisible(app, itemSlug: "platform-roles")
    }
    
    func testNavItemSelection() {
        LoginHelper.loginAsHubAdmin(app)
        AdminSidebarHelper.gotoAdmin(app)
        
        AdminSidebarHelper.tapItem(app, itemSlug: "teams")
        AdminSidebarHelper.expectSectionLoaded(app, slug: "teams")
    }
    
    func testVolunteerCannotAccessAdmin() {
        LoginHelper.loginAsVolunteer(app)
        
        // Verify Admin tab not visible
        XCTAssertFalse(app.tabBars.buttons["Admin"].exists)
    }
}
```

## Android Tests (Compose UI + Cucumber)

### Compose UI Tests

**apps/android/app/src/androidTest/kotlin/org/llamenos/hotline/ui/AdminSidebarTest.kt:**
```kotlin
package org.llamenos.hotline.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test

class AdminSidebarTest {
    @get:Rule
    val composeTestRule = createComposeRule()
    
    @Test
    fun hubAdminSeesOperationsNotPlatform() {
        // Set up hub admin auth state
        composeTestRule.setContent {
            AdminSidebar(
                authState = hubAdminAuth,
                onItemClick = {}
            )
        }
        
        // Verify groups
        composeTestRule.onNodeWithTag("admin-sidebar-group-general").assertIsDisplayed()
        composeTestRule.onNodeWithTag("admin-sidebar-group-operations").assertIsDisplayed()
        composeTestRule.onNodeWithTag("admin-sidebar-group-platform").assertDoesNotExist()
    }
    
    @Test
    fun superAdminSeesPlatform() {
        composeTestRule.setContent {
            AdminSidebar(
                authState = superAdminAuth,
                onItemClick = {}
            )
        }
        
        composeTestRule.onNodeWithTag("admin-sidebar-group-platform").assertIsDisplayed()
        composeTestRule.onNodeWithTag("admin-sidebar-item-hubs").assertIsDisplayed()
    }
    
    @Test
    fun drawerOpensAndCloses() {
        composeTestRule.setContent {
            AdminSettingsScreen(onNavigateBack = {})
        }
        
        // Open drawer
        composeTestRule.onNodeWithContentDescription("Open navigation menu").performClick()
        composeTestRule.onNodeWithTag("admin-sidebar").assertIsDisplayed()
        
        // Tap item
        composeTestRule.onNodeWithTag("admin-sidebar-item-call-settings").performClick()
        composeTestRule.onNodeWithTag("admin-sidebar").assertDoesNotExist()
    }
    
    @Test
    fun sectionSelectionWorks() {
        composeTestRule.setContent {
            AdminSettingsScreen(onNavigateBack = {})
        }
        
        composeTestRule.onNodeWithContentDescription("Open navigation menu").performClick()
        composeTestRule.onNodeWithTag("admin-sidebar-item-spam-protection").performClick()
        composeTestRule.onNodeWithTag("admin-section-spam-protection").assertIsDisplayed()
    }
}
```

### Cucumber BDD

**apps/android/app/src/androidTest/assets/features/admin-sidebar.feature:**
```gherkin
Feature: Admin Sidebar Navigation

  Background:
    Given the app is launched

  Scenario: Hub admin sees correct navigation groups
    Given I am logged in as a hub admin
    When I navigate to admin settings
    Then I should see the "General" group
    And I should see the "People" group
    And I should see the "Operations" group
    And I should not see the "Platform" group

  Scenario: Super admin sees platform group
    Given I am logged in as a super admin
    When I navigate to admin settings
    Then I should see the "Platform" group
    And I should see "Hubs" in the sidebar
    And I should see "Roles" in the sidebar

  Scenario: Navigate to settings section
    Given I am logged in as a hub admin
    And I am on admin settings
    When I open the navigation drawer
    And I tap "Call Settings"
    Then I should see the Call Settings screen

  Scenario: Volunteer cannot access admin
    Given I am logged in as a volunteer
    Then I should not see the "Admin" option in settings

  Scenario: Mobile drawer behavior
    Given I am logged in as a hub admin
    And I am on admin settings
    When I tap the menu button
    Then the navigation drawer should open
    When I tap "Spam Protection"
    Then the navigation drawer should close
    And I should see the Spam Protection screen
```

**apps/android/app/src/androidTest/kotlin/org/llamenos/hotline/e2e/steps/AdminSidebarSteps.kt:**
```kotlin
package org.llamenos.hotline.e2e.steps

import io.cucumber.java.en.*
import org.llamenos.hotline.e2e.screens.AdminSidebarScreen

class AdminSidebarSteps {
    @When("I navigate to admin settings")
    fun navigateToAdminSettings() {
        AdminSidebarScreen.navigateToSettings()
    }
    
    @Then("I should see the {string} group")
    fun seeGroup(groupName: String) {
        AdminSidebarScreen.verifyGroupVisible(groupName)
    }
    
    @Then("I should not see the {string} group")
    fun notSeeGroup(groupName: String) {
        AdminSidebarScreen.verifyGroupHidden(groupName)
    }
    
    @When("I open the navigation drawer")
    fun openDrawer() {
        AdminSidebarScreen.openDrawer()
    }
    
    @When("I tap {string}")
    fun tapItem(itemName: String) {
        AdminSidebarScreen.tapItem(itemName)
    }
    
    @Then("the navigation drawer should open")
    fun drawerOpen() {
        AdminSidebarScreen.verifyDrawerOpen()
    }
    
    @Then("the navigation drawer should close")
    fun drawerClose() {
        AdminSidebarScreen.verifyDrawerClosed()
    }
}
```

## Test Data Requirements

### Users Needed

| Role | Permissions | Use Case |
|------|-------------|----------|
| Super Admin | `*` | Platform group visibility |
| Hub Admin | `users:*`, `shifts:*`, `settings:*`, `audit:read`, `bans:*`, etc. | Operations group visibility |
| Reviewer | `notes:read-assigned`, `reports:read-all`, etc. | No admin access |
| Volunteer | `calls:answer`, `notes:create`, etc. | No admin access |

### Test Fixtures

**Desktop (Playwright):**
```typescript
// fixtures/auth.ts
export const test = base.extend({
  adminPage: async ({ page }, use) => {
    // Login as super admin
    await loginAsRole(page, 'role-super-admin')
    await use(page)
  },
  hubAdminPage: async ({ page }, use) => {
    await loginAsRole(page, 'role-hub-admin')
    await use(page)
  },
  volunteerPage: async ({ page }, use) => {
    await loginAsRole(page, 'role-volunteer')
    await use(page)
  },
})
```

## CI/CD Integration

### Desktop
```yaml
- name: Desktop E2E Tests
  run: bun run test:desktop
  env:
    PLAYWRIGHT_TEST: true
```

### iOS
```yaml
- name: iOS UI Tests
  run: bun run ios:uitest
```

### Android
```yaml
- name: Android UI Tests
  run: ./gradlew connectedAndroidTest
- name: Android BDD Tests
  run: ./gradlew connectedCheck
```

## Success Criteria

- [ ] Desktop: All Playwright tests pass
- [ ] iOS: All XCUITests pass on simulator
- [ ] Android: All Compose UI tests pass
- [ ] Android: All Cucumber BDD scenarios pass
- [ ] Cross-platform: Same scenarios covered on all platforms
- [ ] No flaky tests (run 3x in CI)
- [ ] Test coverage > 80% for admin shell components

## Regression Checklist

- [ ] Existing admin flows still work
- [ ] Settings can still be saved
- [ ] No console errors during tests
- [ ] Mobile responsive behavior correct
- [ ] Accessibility labels present

---

**Next:** Phase 7 integration spec
