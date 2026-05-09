import { expect } from '@playwright/test'
import { test } from '../traditional-fixtures'
import { Navigation, ShiftPage } from '../pages'
import { loginAsAdmin, Timeouts } from '../helpers'
import { TestIds } from '../test-ids'

test.describe('Shift Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('shift list page loads', async ({ page }) => {
    await Navigation.goToShifts(page)
    await expect(page.getByTestId(TestIds.SHIFT_LIST)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('can create a new shift', async ({ page }) => {
    await Navigation.goToShifts(page)
    
    const name = `E2E Shift ${Date.now()}`
    
    await ShiftPage.openCreateForm(page)
    await ShiftPage.createShift(page, name)
    await expect(ShiftPage.getCard(page, name)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('fallback group card is visible', async ({ page }) => {
    await Navigation.goToShifts(page)
    await expect(ShiftPage.getFallbackCard(page)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })
})
