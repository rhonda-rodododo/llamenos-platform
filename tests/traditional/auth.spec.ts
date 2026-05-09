import { expect } from '@playwright/test'
import { test } from '../traditional-fixtures'
import { LoginPage, Navigation } from '../pages'
import { loginAsAdmin, loginAsVolunteer, enterPin, TEST_PIN, Timeouts } from '../helpers'
import { TestIds } from '../test-ids'
import { createUserViaApi } from '../api-helpers'

test.describe('Authentication', () => {
  test.describe('Admin PIN login', () => {
    test('admin can log in with PIN and see dashboard', async ({ page }) => {
      await LoginPage.goto(page)
      await loginAsAdmin(page)

      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
      await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).toBeVisible({ timeout: Timeouts.AUTH })
    })

    test('admin logout button is visible after login', async ({ page }) => {
      await loginAsAdmin(page)
      await LoginPage.assertLogoutVisible(page)
    })
  })

  test.describe('Volunteer login', () => {
    test('volunteer can log in and see dashboard', async ({ page, workerHub }) => {
      const { seedHex } = await createUserViaApi(page.request, {
        name: `Test Volunteer ${Date.now()}`,
        roleIds: ['role-volunteer'],
      })

      await LoginPage.goto(page)
      await loginAsVolunteer(page, seedHex)

      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
      await expect(page.getByTestId(TestIds.NAV_SIDEBAR)).toBeVisible({ timeout: Timeouts.AUTH })
    })
  })

  test.describe('Invalid PIN', () => {
    test('wrong PIN shows error on unlock screen', async ({ page }) => {
      await loginAsAdmin(page)
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      const pinInput = page.getByTestId('pin-input').locator('input')
      await pinInput.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
      await pinInput.fill('99999999')
      await pinInput.press('Enter')

      await expect(page.getByTestId(TestIds.ERROR_MESSAGE).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
    })
  })
})
