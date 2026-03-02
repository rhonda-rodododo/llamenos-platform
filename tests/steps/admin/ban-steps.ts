/**
 * Ban management step definitions.
 * Matches steps from: packages/test-specs/features/bans/ban-management.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { BanListPage } from '../../pages/index'

Then('I should see bans or the {string} message', async ({ page }, emptyMsg: string) => {
  const banRow = page.getByTestId(TestIds.BAN_ROW)
  const emptyState = page.locator(`text="${emptyMsg}"`)
  const anyContent = page.locator(`[data-testid="${TestIds.BAN_ROW}"], text="${emptyMsg}"`)
  await expect(anyContent.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in the phone number', async ({ page }) => {
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
  await page.evaluate((p) => {
    (window as Record<string, unknown>).__test_ban_phone = p
  }, phone)
})

When('I fill in the phone number with {string}', async ({ page }, phone: string) => {
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
})

Then('the phone number should appear in the ban list', async ({ page }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  if (phone) {
    await expect(page.locator(`text="${phone}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

When('I add a ban with reason {string}', async ({ page }, reason: string) => {
  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill(reason)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await page.evaluate((p) => {
    (window as Record<string, unknown>).__test_ban_phone = p
  }, phone)
})

Then('the ban entry should contain the current year', async ({ page }) => {
  const year = new Date().getFullYear().toString()
  await expect(page.locator(`text=/${year}/`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a ban exists', async ({ page }) => {
  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Test ban')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.locator(`text="${phone}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })
  await page.evaluate((p) => {
    (window as Record<string, unknown>).__test_ban_phone = p
  }, phone)
})

When('I click {string} on the ban', async ({ page }, buttonText: string) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  const row = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone })
  await row.getByRole('button', { name: new RegExp(buttonText, 'i') }).click()
})

When('I click {string} in the dialog', async ({ page }, buttonText: string) => {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(buttonText, 'i') }).click()
})

Then('the dialog should close', async ({ page }) => {
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the ban should no longer appear in the list', async ({ page }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  if (phone) {
    await expect(page.locator(`text="${phone}"`)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the ban should still appear in the list', async ({ page }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  if (phone) {
    await expect(page.locator(`text="${phone}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Then('the phone number input should be visible', async ({ page }) => {
  await expect(page.getByLabel(/phone/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the phone number input should not be visible', async ({ page }) => {
  await expect(page.getByLabel(/phone/i)).not.toBeVisible({ timeout: 3000 })
})

When('I add two bans with different phone numbers', async ({ page }) => {
  const phone1 = `+1555${Date.now().toString().slice(-7)}`
  const phone2 = `+1555${(Date.now() + 1).toString().slice(-7)}`

  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  await page.getByLabel(/phone/i).fill(phone1)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Reason 1')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.locator(`text="${phone1}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })

  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  await page.getByLabel(/phone/i).fill(phone2)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Reason 2')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(page.locator(`text="${phone2}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })

  await page.evaluate(
    ({ p1, p2 }) => {
      (window as Record<string, unknown>).__test_ban_phones = [p1, p2]
    },
    { p1: phone1, p2: phone2 },
  )
})

Then('both phone numbers should appear in the ban list', async ({ page }) => {
  const phones = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phones)) as string[]
  if (phones) {
    for (const phone of phones) {
      await expect(page.locator(`text="${phone}"`)).toBeVisible({ timeout: Timeouts.ELEMENT })
    }
  }
})

Then('both ban reasons should be visible', async ({ page }) => {
  // Reasons are displayed alongside each ban
  await expect(page.locator('text="Reason 1"')).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(page.locator('text="Reason 2"')).toBeVisible({ timeout: Timeouts.ELEMENT })
})
