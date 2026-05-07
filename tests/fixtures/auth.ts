/**
 * Per-role Playwright auth fixtures.
 *
 * Each role fixture provides an authenticated `page` via cached storageState
 * (localStorage + cookies from the bootstrap project). PIN entry happens per-test
 * for full isolation — no shared state between tests.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/auth'
 *   test('admin does something', async ({ adminPage }) => { ... })
 *   test('volunteer sees limited nav', async ({ volunteerPage }) => { ... })
 */

import { type BrowserContext, type Page, test as base } from '@playwright/test'
import { enterPin, TEST_PIN, Timeouts, completeProfileSetup } from '../helpers'
import { TestIds } from '../test-ids'

const STORAGE_DIR = 'tests/storage'

/** Storage state file paths for each role */
export const STORAGE_PATHS = {
  admin: `${STORAGE_DIR}/admin.json`,
  'hub-admin': `${STORAGE_DIR}/hub-admin.json`,
  volunteer: `${STORAGE_DIR}/volunteer.json`,
  reviewer: `${STORAGE_DIR}/reviewer.json`,
  reporter: `${STORAGE_DIR}/reporter.json`,
} as const

export type RoleName = keyof typeof STORAGE_PATHS

/**
 * Create an authenticated page for a role.
 * Loads cached storageState → navigates to / → enters PIN → waits for dashboard.
 * Each call creates a NEW browser context — full test isolation.
 */
async function createAuthenticatedPage(
  browser: import('@playwright/test').Browser,
  role: RoleName
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: STORAGE_PATHS[role],
  })
  const page = await context.newPage()

  // Block the token refresh endpoint initially to prevent restoreSession from getting
  // an access token before we can enter the PIN. This ensures the app stays on the
  // login page with the PIN form visible instead of auto-redirecting to dashboard.
  let refreshBlocked = true
  await page.route('**/api/auth/token/refresh', async (route) => {
    if (refreshBlocked) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"error":"blocked-during-setup"}',
      })
    } else {
      await route.continue()
    }
  })

  // Navigate to app
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const pinInput = page.getByTestId(TestIds.PIN_INPUT).locator('input')
  const pageTitle = page.getByTestId(TestIds.PAGE_TITLE)
  const profileSetupBtn = page.getByRole('button', { name: /complete setup/i })

  // With refresh blocked, the app should show the login/PIN screen
  const firstState = await Promise.race([
    pinInput.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'pin' as const),
    pageTitle.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'dashboard' as const),
    profileSetupBtn.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'profile' as const),
  ])

  // Unblock refresh so the PIN unlock flow can call refreshToken and getUserInfo
  refreshBlocked = false

  if (firstState === 'pin') {
    await enterPin(page, TEST_PIN)
    // After PIN: PBKDF2 runs, then navigates to dashboard or profile-setup
    const afterPin = await Promise.race([
      pageTitle.waitFor({ state: 'visible', timeout: Timeouts.AUTH }).then(() => 'dashboard' as const),
      profileSetupBtn.waitFor({ state: 'visible', timeout: Timeouts.AUTH }).then(() => 'profile' as const),
    ])
    if (afterPin === 'profile') {
      await completeProfileSetup(page)
    }
  } else if (firstState === 'profile') {
    await completeProfileSetup(page)
  }

  // Clean up the route handler
  await page.unroute('**/api/auth/token/refresh')

  // Wait for the sidebar to confirm full auth is complete
  await page.getByTestId(TestIds.NAV_SIDEBAR).waitFor({ state: 'visible', timeout: Timeouts.AUTH })

  return { context, page }
}

/**
 * Extended Playwright test with per-role authenticated page fixtures.
 * Each fixture creates a FRESH browser context per test — full isolation.
 */
export const test = base.extend<{
  adminPage: Page
  adminContext: BrowserContext
  hubAdminPage: Page
  hubAdminContext: BrowserContext
  volunteerPage: Page
  volunteerContext: BrowserContext
  reviewerPage: Page
  reviewerContext: BrowserContext
  reporterPage: Page
  reporterContext: BrowserContext
}>({
  adminPage: async ({ browser }, use) => {
    const { context, page } = await createAuthenticatedPage(browser, 'admin')
    await use(page)
    await context.close()
  },
  adminContext: async ({ browser }, use) => {
    const { context } = await createAuthenticatedPage(browser, 'admin')
    await use(context)
    await context.close()
  },
  hubAdminPage: async ({ browser }, use) => {
    const { context, page } = await createAuthenticatedPage(browser, 'hub-admin')
    await use(page)
    await context.close()
  },
  hubAdminContext: async ({ browser }, use) => {
    const { context } = await createAuthenticatedPage(browser, 'hub-admin')
    await use(context)
    await context.close()
  },
  volunteerPage: async ({ browser }, use) => {
    const { context, page } = await createAuthenticatedPage(browser, 'volunteer')
    await use(page)
    await context.close()
  },
  volunteerContext: async ({ browser }, use) => {
    const { context } = await createAuthenticatedPage(browser, 'volunteer')
    await use(context)
    await context.close()
  },
  reviewerPage: async ({ browser }, use) => {
    const { context, page } = await createAuthenticatedPage(browser, 'reviewer')
    await use(page)
    await context.close()
  },
  reviewerContext: async ({ browser }, use) => {
    const { context } = await createAuthenticatedPage(browser, 'reviewer')
    await use(context)
    await context.close()
  },
  reporterPage: async ({ browser }, use) => {
    const { context, page } = await createAuthenticatedPage(browser, 'reporter')
    await use(page)
    await context.close()
  },
  reporterContext: async ({ browser }, use) => {
    const { context } = await createAuthenticatedPage(browser, 'reporter')
    await use(context)
    await context.close()
  },
})

export { expect, type Page, type BrowserContext } from '@playwright/test'
