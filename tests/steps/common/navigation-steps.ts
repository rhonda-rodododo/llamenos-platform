/**
 * Common navigation step definitions shared across features.
 * Uses page objects from tests/pages/index.ts.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { Navigation } from '../../pages/index'
import { TestIds } from '../../test-ids'
import { Timeouts, navigateAfterLogin } from '../../helpers'

// --- Parameterised navigation (covers most "navigate to X page" steps) ---

Given('I navigate to the {string} page', async ({ page }, pageName: string) => {
  const navMap: Record<string, (p: typeof page) => Promise<void>> = {
    Dashboard: (p) => Navigation.goToDashboard(p),
    Volunteers: (p) => Navigation.goToVolunteers(p),
    Shifts: (p) => Navigation.goToShifts(p),
    'Ban List': (p) => Navigation.goToBanList(p),
    Notes: (p) => Navigation.goToNotes(p),
    'Call History': (p) => Navigation.goToCallHistory(p),
    Calls: (p) => Navigation.goToCallHistory(p),
    'Audit Log': (p) => Navigation.goToAuditLog(p),
    Settings: (p) => Navigation.goToSettings(p),
    'Hub Settings': (p) => Navigation.goToHubSettings(p),
    Reports: (p) => Navigation.goToReports(p),
    Conversations: (p) => Navigation.goToConversations(p),
    Blasts: (p) => Navigation.goToBlasts(p),
    Contacts: (p) => Navigation.goToContacts(p),
  }
  const navFn = navMap[pageName]
  if (navFn) {
    await navFn(page)
  } else {
    // Fallback: click sidebar link by name
    await page.getByRole('link', { name: pageName }).click()
    await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
  }
})

// Note: "I navigate to the {string} page" is defined as Given above.
// playwright-bdd treats Given/When/Then as interchangeable for matching.

When('I navigate to {string}', async ({ page }, path: string) => {
  await navigateAfterLogin(page, path)
})

// --- Given navigation steps ---

Given('I am authenticated and on the note creation screen', async ({ page }) => {
  const { loginAsAdmin } = await import('../../helpers')
  await loginAsAdmin(page)
  await Navigation.goToNotes(page)
  await page.getByTestId(TestIds.NOTE_NEW_BTN).click()
  await expect(page.getByTestId(TestIds.NOTE_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I am authenticated and on the conversations screen', async ({ page }) => {
  const { loginAsAdmin } = await import('../../helpers')
  await loginAsAdmin(page)
  await Navigation.goToConversations(page)
})

Given('I am authenticated and on the shifts screen', async ({ page }) => {
  const { loginAsAdmin } = await import('../../helpers')
  await loginAsAdmin(page)
  await Navigation.goToShifts(page)
})

Given('I am on the settings screen', async ({ page }) => {
  await Navigation.goToSettings(page)
})

Given('I am on the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('I navigate to the device link screen from settings', async ({ page }) => {
  await Navigation.goToSettings(page)
  const linkCard = page.getByTestId(TestIds.LINK_DEVICE_CARD)
  await linkCard.scrollIntoViewIfNeeded()
  await linkCard.click()
})

Given('I have navigated to the admin panel', async ({ page }) => {
  await Navigation.goToSettings(page)
  const adminCard = page.locator('[data-testid="admin-card"]')
  await adminCard.scrollIntoViewIfNeeded()
  await adminCard.click()
  await expect(page.locator('h1', { hasText: /admin/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- When navigation steps ---

When('I tap the {string} tab', async ({ page }, tabName: string) => {
  // Try sidebar link, then tab role, then button
  const link = page.getByRole('link', { name: tabName })
  if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
    await link.click()
    return
  }
  const tab = page.getByRole('tab', { name: tabName })
  if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tab.click()
    return
  }
  await page.getByText(tabName, { exact: true }).first().click()
})

When('I navigate to the admin panel', async ({ page }) => {
  const adminCard = page.locator('[data-testid="admin-card"]')
  await adminCard.scrollIntoViewIfNeeded()
  await adminCard.click()
  await expect(page.locator('h1', { hasText: /admin/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I scroll to and tap the admin card', async ({ page }) => {
  const adminCard = page.locator('[data-testid="admin-card"]')
  await adminCard.scrollIntoViewIfNeeded()
  await adminCard.click()
})

When('I tap the back button', async ({ page }) => {
  const backBtn = page.locator('button[aria-label="Back"], [data-testid="back-btn"]')
  const backVisible = await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false)
  if (backVisible) {
    await backBtn.first().click()
  } else {
    await page.goBack()
  }
})

When('I visit the app root', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
})

When('I visit {string} without authentication', async ({ page }, path: string) => {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
})

When('I visit the login page', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
})

When('I check the API health endpoint', async ({ page }) => {
  const response = await page.request.get('/api/health')
  await page.evaluate((status) => {
    (window as Record<string, unknown>).__test_api_status = status
  }, response.status())
})

When('I check the API config endpoint', async ({ page }) => {
  const response = await page.request.get('/api/config')
  const body = await response.text()
  await page.evaluate((b) => {
    (window as Record<string, unknown>).__test_api_config = b
  }, body)
})

// --- Then navigation/page assertion steps ---

Then('the page title should contain {string}', async ({ page }, text: string) => {
  const title = await page.title()
  expect(title.toLowerCase()).toContain(text.toLowerCase())
})

Then('I should be redirected to the login page', async ({ page }) => {
  await page.waitForURL(/\/login/, { timeout: Timeouts.NAVIGATION })
})

Then('I should see the nsec input', async ({ page }) => {
  await expect(page.locator('#nsec, input[placeholder*="nsec"]')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see a validation error', async ({ page }) => {
  const errorEl = page.locator('[role="alert"], .text-destructive, [data-testid="error-message"], text=/invalid|error/i')
  await expect(errorEl.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the response should be successful', async ({ page }) => {
  const status = await page.evaluate(() => (window as Record<string, unknown>).__test_api_status)
  expect(status).toBe(200)
})

Then('the response should contain {string}', async ({ page }, text: string) => {
  const body = await page.evaluate(() => (window as Record<string, unknown>).__test_api_config) as string
  expect(body).toContain(text)
})

Then('I should see the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the notes screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shifts screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /shift/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the conversations screen', async ({ page }) => {
  await expect(page.locator('h1', { hasText: /conversations/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the settings screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should return to the settings screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should return to the notes list', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /call notes/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should return to the login screen', async ({ page }) => {
  await expect(page.locator('h1', { hasText: /sign in|llámenos/i })).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the bottom navigation should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the bottom navigation should not be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).not.toBeVisible()
})

// "I should be redirected to the dashboard" and "I should be redirected away from login"
// are defined in interaction-steps.ts
