import { expect } from '@playwright/test'
import { test } from '../desktop-e2e-fixtures'
import { DashboardPage, Navigation, CallHistoryPage } from '../pages'
import { loginAsAdmin, Timeouts } from '../helpers'
import { TestIds } from '../test-ids'

test.describe('Call Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test.describe('Dashboard cards', () => {
    test('dashboard displays all status cards', async ({ page }) => {
      await Navigation.goToDashboard(page)
      await DashboardPage.assertCardsVisible(page)
    })

    test('dashboard shows shift status with clock button', async ({ page }) => {
      await Navigation.goToDashboard(page)
      await DashboardPage.assertShiftStatus(page, 'Off Shift', 'On Shift')
      await DashboardPage.assertClockButtonVisible(page)
    })

    test('dashboard shows numeric call count', async ({ page }) => {
      await Navigation.goToDashboard(page)
      await DashboardPage.assertCallsTodayNumeric(page)
    })

    test('dashboard shows admin navigation', async ({ page }) => {
      await Navigation.goToDashboard(page)
      await expect(page.getByTestId(TestIds.NAV_ADMIN_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
    })

    test('clock in button shows when off shift', async ({ page }) => {
      await Navigation.goToDashboard(page)
      await DashboardPage.ensureOffShift(page)
      await DashboardPage.assertClockButtonText(page, 'Clock In')
    })
  })

  test.describe('Call history page', () => {
    test('call history page loads', async ({ page }) => {
      await Navigation.goToCallHistory(page)
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    })

    test('call history search filters are visible', async ({ page }) => {
      await Navigation.goToCallHistory(page)
      await expect(page.getByTestId(TestIds.CALL_SEARCH)).toBeVisible({ timeout: Timeouts.ELEMENT })
      await expect(page.getByTestId(TestIds.CALL_SEARCH_BTN)).toBeVisible({ timeout: Timeouts.ELEMENT })
    })
  })
})
