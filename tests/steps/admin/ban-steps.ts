/**
 * Ban management step definitions.
 * Matches steps from: packages/test-specs/features/bans/ban-management.feature
 *
 * Behavioral depth: All CRUD operations verify state via API, not just UI presence.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listBansViaApi } from '../../api-helpers'

Then('I should see bans or the {string} message', async ({ page }, _emptyMsg: string) => {
  const banRow = page.getByTestId(TestIds.BAN_ROW)
  const emptyState = page.getByTestId(TestIds.EMPTY_STATE)
  await expect(banRow.first().or(emptyState)).toBeVisible({ timeout: Timeouts.ELEMENT })
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

Then('the phone number should appear in the ban list', async ({ page, request }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  expect(phone).toBeTruthy()

  // UI verification
  await expect(
    page.getByTestId(TestIds.BAN_LIST).getByText(phone),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: ban exists in backend
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === phone)
  expect(found).toBeTruthy()
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
  const banRow = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: year })
  await expect(banRow.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('a ban exists', async ({ page, request }) => {
  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Test ban')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()

  // Wait for UI to show the ban
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })

  // Verify it was persisted to backend
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === phone)
  expect(found).toBeTruthy()

  await page.evaluate((p) => {
    (window as Record<string, unknown>).__test_ban_phone = p
  }, phone)
})

When('I click {string} on the ban', async ({ page }, buttonText: string) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  expect(phone).toBeTruthy()
  const row = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone })
  if (buttonText.toLowerCase() === 'remove' || buttonText.toLowerCase() === 'delete') {
    await row.getByTestId(TestIds.BAN_REMOVE_BTN).click()
  } else {
    await row.getByRole('button', { name: new RegExp(buttonText, 'i') }).click()
  }
})

When('I click {string} in the dialog', async ({ page }, buttonText: string) => {
  const lower = buttonText.toLowerCase()
  if (lower === 'confirm' || lower === 'ok' || lower === 'yes' || lower === 'unban') {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  } else if (lower === 'cancel') {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_CANCEL).click()
  } else {
    await page.getByTestId(TestIds.CONFIRM_DIALOG).getByRole('button', { name: new RegExp(buttonText, 'i') }).click()
  }
})

Then('the dialog should close', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CONFIRM_DIALOG)).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the ban should no longer appear in the list', async ({ page, request }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  expect(phone).toBeTruthy()

  // UI verification
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone }),
  ).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: ban is gone from backend
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === phone)
  expect(found).toBeUndefined()
})

Then('the ban should still appear in the list', async ({ page, request }) => {
  const phone = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phone)) as string
  expect(phone).toBeTruthy()

  // UI verification
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: ban still exists
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === phone)
  expect(found).toBeTruthy()
})

Then('the phone number input should be visible', async ({ page }) => {
  await expect(page.getByLabel(/phone/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the phone number input should not be visible', async ({ page }) => {
  await expect(page.getByLabel(/phone/i)).not.toBeVisible({ timeout: 3000 })
})

When('I add two bans with different phone numbers', async ({ page }) => {
  const phone1 = `+1555${Date.now().toString().slice(-7)}`
  // Small delay to ensure unique timestamp
  await page.waitForTimeout(10)
  const phone2 = `+1555${(Date.now() + 1).toString().slice(-7)}`

  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  await page.getByLabel(/phone/i).fill(phone1)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Reason 1')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone1 }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })

  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  await page.getByLabel(/phone/i).fill(phone2)
  await page.getByLabel(/phone/i).blur()
  await page.getByLabel(/reason/i).fill('Reason 2')
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone2 }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })

  await page.evaluate(
    ({ p1, p2 }) => {
      (window as Record<string, unknown>).__test_ban_phones = [p1, p2]
    },
    { p1: phone1, p2: phone2 },
  )
})

Then('both phone numbers should appear in the ban list', async ({ page, request }) => {
  const phones = (await page.evaluate(() => (window as Record<string, unknown>).__test_ban_phones)) as string[]
  expect(phones).toBeTruthy()
  expect(phones.length).toBe(2)

  // UI verification
  for (const phone of phones) {
    await expect(
      page.getByTestId(TestIds.BAN_ROW).filter({ hasText: phone }),
    ).toBeVisible({ timeout: Timeouts.ELEMENT })
  }

  // API verification
  const bans = await listBansViaApi(request)
  for (const phone of phones) {
    const found = bans.find(b => b.phone === phone)
    expect(found).toBeTruthy()
  }
})

Then('both ban reasons should be visible', async ({ page }) => {
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: 'Reason 1' }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })
  await expect(
    page.getByTestId(TestIds.BAN_ROW).filter({ hasText: 'Reason 2' }),
  ).toBeVisible({ timeout: Timeouts.ELEMENT })
})
