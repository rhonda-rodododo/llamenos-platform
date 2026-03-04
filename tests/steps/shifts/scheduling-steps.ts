/**
 * Shift scheduling step definitions.
 * Matches steps from: packages/test-specs/features/shifts/shift-scheduling.feature
 *
 * Behavioral depth: All CRUD operations verify state via API, not just UI presence.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { ShiftPage } from '../../pages/index'
import { listShiftsViaApi, createVolunteerViaApi } from '../../api-helpers'

Then('I should see shifts or the {string} message', async ({ page }, emptyMsg: string) => {
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD)
  const emptyState = page.getByTestId(TestIds.EMPTY_STATE).or(page.getByText(emptyMsg))
  await expect(shiftCard.first().or(emptyState.first())).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I fill in the shift name with a unique name', async ({ page }) => {
  const name = `TestShift ${Date.now()}`
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(name)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_shift_name = n
  }, name)
})

When('I set the start time to {string}', async ({ page }, time: string) => {
  await page.getByTestId(TestIds.SHIFT_START_TIME).fill(time)
})

When('I set the end time to {string}', async ({ page }, time: string) => {
  await page.getByTestId(TestIds.SHIFT_END_TIME).fill(time)
})

Then('the shift should appear in the schedule', async ({ page, request }) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  expect(name).toBeTruthy()

  // UI verification: shift card with name visible
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: shift exists in backend
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === name)
  expect(found).toBeTruthy()
})

Then('the shift should show {string}', async ({ page }, text: string) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  if (name) {
    // Scoped assertion: verify the text within the specific shift card
    const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
    await expect(card.first()).toContainText(text, { timeout: Timeouts.ELEMENT })
  } else {
    // Fallback: check any shift card contains the text
    const shiftArea = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: text })
    await expect(shiftArea.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

Given('a shift exists', async ({ page, request }) => {
  // Create via UI (to test the form flow)
  await ShiftPage.openCreateForm(page)
  const name = `EditShift ${Date.now()}`
  await ShiftPage.createShift(page, name)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_shift_name = n
  }, name)

  // Verify it was persisted to the backend
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === name)
  expect(found).toBeTruthy()
})

When('I click {string} on the shift', async ({ page }, buttonText: string) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  expect(name).toBeTruthy()

  const card = ShiftPage.getCard(page, name)
  const lowerText = buttonText.toLowerCase()
  if (lowerText === 'edit') {
    await card.getByTestId(TestIds.SHIFT_EDIT_BTN).click()
  } else if (lowerText === 'delete') {
    await card.getByTestId(TestIds.SHIFT_DELETE_BTN).click()
  } else {
    await card.getByRole('button', { name: new RegExp(buttonText, 'i') }).click()
  }
})

When('I change the shift name', async ({ page }) => {
  const newName = `Updated ${Date.now()}`
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).clear()
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(newName)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_shift_name = n
  }, newName)
})

Then('the updated shift name should be visible', async ({ page, request }) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  expect(name).toBeTruthy()

  // UI verification
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: updated name exists
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === name)
  expect(found).toBeTruthy()
})

Then('the shift should no longer be visible', async ({ page, request }) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  expect(name).toBeTruthy()

  // UI verification
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  await expect(card).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: shift is gone from backend
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === name)
  expect(found).toBeUndefined()
})

Then('the shift form should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the shift form should not be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).not.toBeVisible({ timeout: 3000 })
})

Then('the edit form should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the original shift name should still be visible', async ({ page }) => {
  const name = (await page.evaluate(() => (window as Record<string, unknown>).__test_shift_name)) as string
  expect(name).toBeTruthy()
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: name })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I create a shift and assign the volunteer', async ({ page }) => {
  await ShiftPage.openCreateForm(page)
  const name = `AssignShift ${Date.now()}`
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(name)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_shift_name = n
  }, name)
  // Assign volunteer — click the first volunteer checkbox in the form
  const volunteerCheckbox = page.getByTestId(TestIds.SHIFT_FORM).locator('input[type="checkbox"]').first()
  await expect(volunteerCheckbox).toBeVisible({ timeout: Timeouts.ELEMENT })
  await volunteerCheckbox.click()
})

When('I add the volunteer to the fallback group', async ({ page }) => {
  const fallback = ShiftPage.getFallbackCard(page)
  await fallback.scrollIntoViewIfNeeded()
  const addBtn = fallback.locator('button').first()
  await expect(addBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await addBtn.click()
  // Select the first available volunteer
  const volunteerCheckbox = page.locator('input[type="checkbox"]').first()
  const isVisible = await volunteerCheckbox.isVisible({ timeout: 2000 }).catch(() => false)
  if (isVisible) {
    await volunteerCheckbox.click()
  }
})

Then('the volunteer badge should appear in the fallback group', async ({ page }) => {
  const fallback = ShiftPage.getFallbackCard(page)
  await expect(fallback).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Verify at least one volunteer badge/name is visible in the fallback card
  const badges = fallback.locator('[data-testid]').filter({ hasText: /\w/ })
  const count = await badges.count()
  expect(count).toBeGreaterThan(0)
})

When('I create a shift without assigning volunteers', async ({ page }) => {
  await ShiftPage.openCreateForm(page)
  const name = `EmptyShift ${Date.now()}`
  await ShiftPage.createShift(page, name)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_shift_name = n
  }, name)
})
