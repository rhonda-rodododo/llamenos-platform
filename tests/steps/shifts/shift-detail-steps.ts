/**
 * Shift detail step definitions.
 * Matches steps from: packages/test-specs/features/admin/shift-management.feature
 *
 * Desktop: Shifts are managed inline (edit form in-page), not via a detail screen.
 * "Tap a shift card" opens the edit form; "back button" cancels it.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { listShiftsViaApi, createShiftViaApi } from '../../api-helpers'
import { waitForApiAndUi } from '../../pages/index'

When('I tap a shift card', async ({ page, backendRequest: request, workerHub }) => {
  // Ensure at least one shift exists so the tap has something to click.
  const existingShifts = await listShiftsViaApi(request, workerHub).catch(() => [])
  if (existingShifts.length === 0) {
    await createShiftViaApi(request, { name: `Auto-seeded Shift ${Date.now()}`, hubId: workerHub })
    // Hard navigation to /shifts to bypass React Query's staleTime cache.
    // Soft navigation (goToDashboard + goToShifts) keeps the QueryClient alive, so the
    // recently-cached empty shifts list is returned without a refetch (staleTime: 2 min).
    await page.goto('/shifts')
    await page.waitForLoadState('domcontentloaded')
    await waitForApiAndUi(page)
  }
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD).first()
  await expect(shiftCard).toBeVisible({ timeout: Timeouts.ELEMENT })
  // Desktop: click the edit button on the shift card to open the inline edit form
  const editBtn = shiftCard.getByTestId(TestIds.SHIFT_EDIT_BTN)
  await editBtn.click()
  // Wait for the edit form to appear
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift detail screen', async ({ page }) => {
  // Desktop: the shift edit form is the "detail screen"
  await expect(page.getByTestId(TestIds.SHIFT_FORM)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the shift info card', async ({ page }) => {
  // Desktop: shift form contains shift info (name, times)
  await expect(page.getByTestId(TestIds.SHIFT_NAME_INPUT)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the volunteer assignment section', async ({ page }) => {
  // Desktop: UserMultiSelect combobox in the shift form
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  await expect(combobox).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I tap a volunteer assignment card', async ({ page }) => {
  // Desktop: volunteer assignment is via UserMultiSelect combobox, not cards
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  await expect(combobox).toBeVisible({ timeout: Timeouts.ELEMENT })

  // Count currently selected badges before toggling
  const badgesBefore = await combobox.locator('[role="button"]').count()
  await page.evaluate((count) => {
    (window as Record<string, unknown>).__test_badge_count_before = count
  }, badgesBefore)

  // Open the dropdown and click the first volunteer
  await combobox.click()
  const firstOption = page.locator('[cmdk-item]').first()
  await expect(firstOption).toBeVisible({ timeout: Timeouts.ELEMENT })
  await firstOption.click()
})

Then('the volunteer assignment should toggle', async ({ page }) => {
  // Desktop: verify the badge count changed (volunteer added or removed)
  const form = page.getByTestId(TestIds.SHIFT_FORM)
  const combobox = form.getByRole('combobox')
  const badgesBefore = (await page.evaluate(() =>
    (window as Record<string, unknown>).__test_badge_count_before,
  )) as number
  const badgesAfter = await combobox.locator('[role="button"]').count()
  expect(badgesAfter).not.toBe(badgesBefore)
})

When('I tap the back button on the shift detail', async ({ page }) => {
  // Desktop: "back" means cancel the edit form
  const cancelBtn = page.getByTestId(TestIds.FORM_CANCEL_BTN)
  await expect(cancelBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await cancelBtn.click()
})
