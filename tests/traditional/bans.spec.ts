import { expect } from '@playwright/test'
import { test } from '../traditional-fixtures'
import { Navigation, BanListPage } from '../pages'
import { loginAsAdmin, Timeouts, uniquePhone } from '../helpers'
import { TestIds } from '../test-ids'

test.describe('Ban List Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('ban list page loads', async ({ page }) => {
    await Navigation.goToBanList(page)
    await page.waitForLoadState('networkidle')
    const list = page.getByTestId(TestIds.BAN_LIST)
    const empty = page.getByTestId('empty-state')
    await expect(list.or(empty)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('can add a ban', async ({ page }) => {
    await Navigation.goToBanList(page)
    
    const phone = uniquePhone()
    const reason = 'Test ban reason'
    
    await BanListPage.openAddForm(page)
    await BanListPage.addBan(page, phone, reason)
    await expect(BanListPage.getRow(page, phone)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })
})
