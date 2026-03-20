/**
 * Admin flow step definitions.
 * Matches steps from: packages/test-specs/features/desktop/admin/admin-flow.feature
 * Covers admin navigation, volunteer CRUD, shift CRUD, ban management,
 * call history, settings, and language switching.
 *
 * Behavioral depth: All CRUD operations verify state changes via API.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { TestIds, uniquePhone, Timeouts } from '../../helpers'
import {
  listVolunteersViaApi,
  listShiftsViaApi,
  listBansViaApi,
} from '../../api-helpers'

// --- Volunteer CRUD ---

When('I add a new volunteer with a unique name and phone', async ({ page, adminWorld }) => {
  const phone = uniquePhone()
  adminWorld.lastUserName = `Vol ${Date.now()}`
  adminWorld.lastPhone = phone
  await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
  await page.getByLabel('Name').fill(adminWorld.lastUserName)
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
})

Then('I should see the generated nsec', async ({ page }) => {
  const nsecCode = page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)
  await expect(nsecCode).toBeVisible({ timeout: 15000 })
  // Verify the nsec looks valid (starts with nsec1)
  const nsecText = await nsecCode.textContent()
  expect(nsecText).toBeTruthy()
  expect(nsecText!.startsWith('nsec1')).toBe(true)
})

When('I close the nsec card', async ({ page }) => {
  await page.getByTestId(TestIds.DISMISS_NSEC).click()
  await expect(page.getByTestId(TestIds.DISMISS_NSEC)).not.toBeVisible({ timeout: 5000 })
})

Then('the volunteer should appear in the list', async ({ page, request, adminWorld }) => {
  // UI verification
  const row = page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: adminWorld.lastUserName })
  await expect(row.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: volunteer exists in backend
  const volunteers = await listVolunteersViaApi(request)
  const found = volunteers.find(v => v.name === adminWorld.lastUserName)
  expect(found).toBeTruthy()
  adminWorld.lastUserPubkey = found!.pubkey
})

When('I delete the volunteer', async ({ page, adminWorld }) => {
  const volRow = page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: adminWorld.lastUserName })
  await volRow.getByTestId(TestIds.VOLUNTEER_DELETE_BTN).click()
  await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 })
})

Then('the volunteer should be removed from the list', async ({ page, request, adminWorld }) => {
  // UI verification
  const row = page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: adminWorld.lastUserName })
  await expect(row).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: volunteer is gone
  const volunteers = await listVolunteersViaApi(request)
  const found = volunteers.find(v => v.name === adminWorld.lastUserName)
  expect(found).toBeUndefined()
})

// --- Shift CRUD ---

When('I create a new shift with a unique name', async ({ page, request, adminWorld }) => {
  adminWorld.lastShiftName = `Shift ${Date.now()}`
  await page.getByTestId(TestIds.SHIFT_CREATE_BTN).click()
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(adminWorld.lastShiftName)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()

  // Wait for UI confirmation
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: shift was created in backend
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === adminWorld.lastShiftName)
  expect(found).toBeTruthy()
})

Then('the shift should appear in the list', async ({ page, adminWorld }) => {
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I edit the shift with a new name', async ({ page, adminWorld }) => {
  const updatedName = `Updated ${Date.now()}`
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await shiftCard.getByTestId(TestIds.SHIFT_EDIT_BTN).click()
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).clear()
  await page.getByTestId(TestIds.SHIFT_NAME_INPUT).fill(updatedName)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  adminWorld.lastShiftName = updatedName
})

Then('the updated shift name should appear', async ({ page, request, adminWorld }) => {
  // UI verification
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await expect(card.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: updated name persisted
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === adminWorld.lastShiftName)
  expect(found).toBeTruthy()
})

When('I delete the shift', async ({ page, adminWorld }) => {
  const shiftCard = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await shiftCard.getByTestId(TestIds.SHIFT_DELETE_BTN).click()
})

Then('the shift should no longer appear', async ({ page, request, adminWorld }) => {
  // UI verification
  const card = page.getByTestId(TestIds.SHIFT_CARD).filter({ hasText: adminWorld.lastShiftName })
  await expect(card).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification: shift is gone
  const shifts = await listShiftsViaApi(request)
  const found = shifts.find(s => s.name === adminWorld.lastShiftName)
  expect(found).toBeUndefined()
})

// --- Ban management ---

When('I ban a unique phone number with reason {string}', async ({ page, adminWorld }, reason: string) => {
  adminWorld.lastPhone = uniquePhone()
  await page.getByTestId(TestIds.BAN_ADD_BTN).click()
  await page.getByLabel('Phone Number').fill(adminWorld.lastPhone)
  await page.getByLabel('Phone Number').blur()
  await page.getByLabel('Reason').fill(reason)
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
})

Then('the banned phone number should appear', async ({ page, request, adminWorld }) => {
  // UI verification
  const row = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: adminWorld.lastPhone })
  await expect(row.first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === adminWorld.lastPhone)
  expect(found).toBeTruthy()
})

When('I remove the ban for that phone number', async ({ page, adminWorld }) => {
  const banRow = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: adminWorld.lastPhone })
  await expect(banRow.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  await banRow.getByTestId(TestIds.BAN_REMOVE_BTN).click()
  await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 })
})

Then('the phone number should no longer appear', async ({ page, request, adminWorld }) => {
  // UI verification
  const row = page.getByTestId(TestIds.BAN_ROW).filter({ hasText: adminWorld.lastPhone })
  await expect(row).not.toBeVisible({ timeout: Timeouts.ELEMENT })

  // API verification
  const bans = await listBansViaApi(request)
  const found = bans.find(b => b.phone === adminWorld.lastPhone)
  expect(found).toBeUndefined()
})

// --- Phone validation ---

When('I try to add a volunteer with an invalid phone number', async ({ page }) => {
  await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
  await page.getByLabel('Name').fill('Bad Phone')
  await page.getByLabel('Phone Number').fill('+12')
  await page.getByLabel('Phone Number').blur()
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
})

Then('I should see an invalid phone error', async ({ page }) => {
  await expect(page.getByText(/invalid phone/i)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Call history ---

When('I search for a phone number in call history', async ({ page }) => {
  await page.getByTestId(TestIds.CALL_SEARCH).fill('+1234567890')
  await page.getByTestId(TestIds.CALL_SEARCH_BTN).click()
})

Then('I should see the clear filters button', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CALL_CLEAR_FILTERS)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click the clear filters button', async ({ page }) => {
  await page.getByTestId(TestIds.CALL_CLEAR_FILTERS).click()
})

Then('the clear filters button should not be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.CALL_CLEAR_FILTERS)).not.toBeVisible({ timeout: 5000 })
})

// --- Settings toggles ---

Then('I should see at least one toggle switch', async ({ page }) => {
  // Hub settings sections are collapsible — expand any collapsed sections to reveal switches
  const sections = page.locator('[data-testid][data-settings-section]')
  const sectionCount = await sections.count()
  for (let i = 0; i < sectionCount; i++) {
    const section = sections.nth(i)
    const isExpanded = await section.locator('[data-state="open"]').isVisible({ timeout: 500 }).catch(() => false)
    if (!isExpanded) {
      // Click the trigger element using data-testid pattern "{id}-trigger"
      const sectionTestId = await section.getAttribute('data-testid')
      if (sectionTestId) {
        await section.getByTestId(`${sectionTestId}-trigger`).click().catch(() => {})
      }
    }
  }
  const switches = page.getByRole('switch')
  await expect(switches.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  const count = await switches.count()
  expect(count).toBeGreaterThan(0)
})

// --- Language switching ---

When('I switch the language to Espanol', async ({ page }) => {
  await page.getByRole('combobox', { name: /switch to/i }).click()
  await page.getByRole('option', { name: /español/i }).click()
})

When('I switch the language back to English', async ({ page }) => {
  await page.getByRole('combobox', { name: /cambiar a/i }).click()
  await page.getByRole('option', { name: /english/i }).click()
})

// --- Settings summaries ---

Then('the telephony provider card should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.TELEPHONY_PROVIDER)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the transcription card should be visible', async ({ page }) => {
  await expect(page.getByTestId(TestIds.TRANSCRIPTION_SECTION)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('at least one status summary should be visible', async ({ page }) => {
  const statusCount = await page
    .getByText(
      /(Enabled|Disabled|Not configured|Not required|languages|fields|None|CAPTCHA|Default|Customized)/i,
    )
    .count()
  expect(statusCount).toBeGreaterThan(0)
})
