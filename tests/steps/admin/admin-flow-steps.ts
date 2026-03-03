/**
 * Admin flow step definitions.
 * Matches steps from: packages/test-specs/features/desktop/admin/admin-flow.feature
 * Covers admin navigation, volunteer CRUD, shift CRUD, ban management,
 * call history, settings, and language switching.
 */
import { expect } from '@playwright/test'
import { When, Then } from '../fixtures'
import { uniquePhone } from '../../helpers'

// --- State for cross-step data ---
let lastVolunteerName = ''
let lastShiftName = ''
let lastPhone = ''

// --- Volunteer CRUD ---

When('I add a new volunteer with a unique name and phone', async ({ page }) => {
  const phone = uniquePhone()
  lastVolunteerName = `Vol ${Date.now()}`
  lastPhone = phone
  await page.getByRole('button', { name: /add volunteer/i }).click()
  await page.getByLabel('Name').fill(lastVolunteerName)
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByRole('button', { name: /save/i }).click()
})

Then('I should see the generated nsec', async ({ page }) => {
  await expect(page.getByText(/nsec1/)).toBeVisible({ timeout: 15000 })
})

When('I close the nsec card', async ({ page }) => {
  await page.locator('button[data-slot="button"]').filter({ hasText: 'Close' }).click()
})

Then('the volunteer should appear in the list', async ({ page }) => {
  await expect(page.getByText(lastVolunteerName).first()).toBeVisible()
})

When('I delete the volunteer', async ({ page }) => {
  const volRow = page.locator('.divide-y > div').filter({ hasText: lastVolunteerName })
  await volRow.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

Then('the volunteer should be removed from the list', async ({ page }) => {
  await expect(page.locator('main').getByText(lastVolunteerName)).not.toBeVisible()
})

// --- Shift CRUD ---

When('I create a new shift with a unique name', async ({ page }) => {
  lastShiftName = `Shift ${Date.now()}`
  await page.getByRole('button', { name: /create shift/i }).click()
  const form = page.locator('form')
  await form.locator('input').first().fill(lastShiftName)
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText(lastShiftName)).toBeVisible()
})

Then('the shift should appear in the list', async ({ page }) => {
  await expect(page.getByText(lastShiftName)).toBeVisible()
})

When('I edit the shift with a new name', async ({ page }) => {
  const updatedName = `Updated ${Date.now()}`
  const shiftRow = page.locator('h3').filter({ hasText: lastShiftName }).locator('..').locator('..')
  await shiftRow.getByRole('button', { name: 'Edit' }).click()
  const editForm = page.locator('form')
  await editForm.locator('input').first().fill(updatedName)
  await page.getByRole('button', { name: /save/i }).click()
  lastShiftName = updatedName
})

Then('the updated shift name should appear', async ({ page }) => {
  await expect(page.getByText(lastShiftName)).toBeVisible()
})

When('I delete the shift', async ({ page }) => {
  const shiftRow = page.locator('h3').filter({ hasText: lastShiftName }).locator('..').locator('..')
  await shiftRow.getByRole('button', { name: 'Delete' }).click()
})

Then('the shift should no longer appear', async ({ page }) => {
  await expect(page.getByText(lastShiftName)).not.toBeVisible()
})

// --- Ban management ---

When('I ban a unique phone number with reason {string}', async ({ page }, reason: string) => {
  lastPhone = uniquePhone()
  await page.getByRole('button', { name: /ban number/i }).click()
  await page.getByLabel('Phone Number').fill(lastPhone)
  await page.getByLabel('Phone Number').blur()
  await page.getByLabel('Reason').fill(reason)
  await page.getByRole('button', { name: /save/i }).click()
})

Then('the banned phone number should appear', async ({ page }) => {
  await expect(page.getByText(lastPhone)).toBeVisible()
})

When('I remove the ban for that phone number', async ({ page }) => {
  await expect(page.getByText(lastPhone)).toBeVisible()
  const banRow = page.locator('.divide-y > div').filter({ hasText: lastPhone })
  await banRow.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /unban/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

Then('the phone number should no longer appear', async ({ page }) => {
  await expect(page.locator('main').getByText(lastPhone)).not.toBeVisible()
})

// --- Phone validation ---

When('I try to add a volunteer with an invalid phone number', async ({ page }) => {
  await page.getByRole('button', { name: /add volunteer/i }).click()
  await page.getByLabel('Name').fill('Bad Phone')
  await page.getByLabel('Phone Number').fill('+12')
  await page.getByLabel('Phone Number').blur()
  await page.getByRole('button', { name: /save/i }).click()
})

Then('I should see an invalid phone error', async ({ page }) => {
  await expect(page.getByText(/invalid phone/i)).toBeVisible()
})

// --- Call history ---

When('I search for a phone number in call history', async ({ page }) => {
  await page.getByPlaceholder(/search by phone/i).fill('+1234567890')
  await page.locator('button[aria-label="Search"]').click()
})

Then('I should see the clear filters button', async ({ page }) => {
  await expect(page.locator('button[aria-label="Clear filters"]')).toBeVisible()
})

When('I click the clear filters button', async ({ page }) => {
  await page.locator('button[aria-label="Clear filters"]').click()
})

Then('the clear filters button should not be visible', async ({ page }) => {
  await expect(page.locator('button[aria-label="Clear filters"]')).not.toBeVisible()
})

// --- Settings toggles ---

Then('I should see at least one toggle switch', async ({ page }) => {
  const switches = page.getByRole('switch')
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
  await page.waitForTimeout(1000)
  await expect(page.locator('#telephony-provider')).toBeVisible()
})

Then('the transcription card should be visible', async ({ page }) => {
  await expect(page.locator('#transcription')).toBeVisible()
})

Then('at least one status summary should be visible', async ({ page }) => {
  const statusCount = await page
    .locator('.text-xs.text-muted-foreground')
    .filter({
      hasText:
        /(Enabled|Disabled|Not configured|Not required|languages|fields|None|CAPTCHA|Default|Customized)/i,
    })
    .count()
  expect(statusCount).toBeGreaterThan(0)
})
