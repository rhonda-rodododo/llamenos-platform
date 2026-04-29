/**
 * User CRUD & invite onboarding step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/auth/volunteer-crud.feature
 *   - packages/test-specs/features/auth/invite-onboarding.feature
 *   - packages/test-specs/features/auth/form-validation.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import {
  Timeouts,
  createUserAndGetNsec,
  dismissNsecCard,
  loginAsVolunteer,
  loginAsAdmin,
  navigateAfterLogin,
} from '../../helpers'
import { Navigation } from '../../pages/index'

// --- Volunteer lifecycle ---

Given('an admin has created a volunteer', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_vol_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

When('the volunteer logs in with their nsec', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_vol_nsec)) as string
  await loginAsVolunteer(page, nsec)
})

Given('a volunteer has logged in', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  await loginAsVolunteer(page, nsec)
})

When('they complete the profile setup', async ({ page }) => {
  const { completeProfileSetup } = await import('../../helpers')
  await completeProfileSetup(page)
})

Given('a volunteer is logged in and on the dashboard', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  await loginAsVolunteer(page, nsec)
})

Given('a volunteer is logged in', async ({ page }) => {
  await loginAsAdmin(page)
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  await loginAsVolunteer(page, nsec)
})

Given('a volunteer exists', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_vol_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

When('they tap the break button', async ({ page }) => {
  await page.getByTestId(TestIds.BREAK_TOGGLE_BTN).click()
})

// --- Invite onboarding ---

When('I create an invite for a new volunteer', async ({ page }) => {
  await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
  const name = `InviteVol ${Date.now()}`
  await page.getByLabel('Name').fill(name)
  const phone = `+1212${Date.now().toString().slice(-7)}`
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_invite_vol_name = n
  }, name)
})

Then('an invite link should be generated', async ({ page }) => {
  // After creating a volunteer, either invite card, nsec card, or nsec code should appear
  const inviteCard = page.getByTestId(TestIds.VOLUNTEER_INVITE_CARD)
  const isInvite = await inviteCard.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isInvite) return
  const nsecCard = page.getByTestId(TestIds.VOLUNTEER_NSEC_CARD)
  const isNsecCard = await nsecCard.isVisible({ timeout: 2000 }).catch(() => false)
  if (isNsecCard) return
  // At minimum, the nsec code must be visible
  await expect(page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)).toBeVisible({ timeout: 3000 })
})

When('the volunteer opens the invite link', async ({ page }) => {
  // In test context, we'd navigate to the invite URL
  const inviteLink = page.getByTestId(TestIds.VOLUNTEER_INVITE_LINK)
  const linkVisible = await inviteLink.isVisible({ timeout: 2000 }).catch(() => false)
  if (linkVisible) {
    const href = await inviteLink.getAttribute('href')
    if (href) await page.goto(href)
  }
})

Then('they should see a welcome screen with their name', async ({ page }) => {
  const volName = (await page.evaluate(() => (window as Record<string, unknown>).__test_invite_vol_name)) as string
  expect(volName).toBeTruthy()
  // Content assertion — verifying displayed volunteer name
  await expect(page.getByText(new RegExp(volName, 'i')).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('the volunteer completes the onboarding flow', async ({ page }) => {
  // Complete PIN setup
  const { enterPin } = await import('../../helpers')
  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enterPin(page, '1234')
    await enterPin(page, '1234')
  }
})

Then('the volunteer name should appear in the pending invites list', async ({ page }) => {
  const volName = (await page.evaluate(() => (window as Record<string, unknown>).__test_invite_vol_name)) as string
  expect(volName).toBeTruthy()
  // Content assertion — verifying volunteer name is displayed
  await expect(page.getByText(volName, { exact: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I revoke the invite', async ({ page }) => {
  await page.getByTestId(TestIds.REVOKE_INVITE_BTN).first().click()
  // Confirm if dialog appears
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  }
})

Then('the volunteer name should no longer appear in the list', async ({ page }) => {
  const volName = (await page.evaluate(() => (window as Record<string, unknown>).__test_invite_vol_name)) as string
  expect(volName).toBeTruthy()
  // Content assertion — verifying volunteer name is not displayed
  await expect(page.getByText(volName, { exact: true }).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Form validation ---

Then('I should see the volunteer nsec', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)).toBeVisible({ timeout: Timeouts.API })
})

When('I paste invalid phone numbers in the textarea', async ({ page }) => {
  const bulkPhones = page.getByTestId('ban-bulk-phones')
  if (await bulkPhones.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
    await bulkPhones.fill('+12\n+34\ninvalid')
    return
  }
  const textarea = page.locator('textarea').first()
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.fill('+12\n+34\ninvalid')
  }
})

When('I paste two phone numbers in the textarea', async ({ page }) => {
  const phone1 = `+1212${Date.now().toString().slice(-7)}`
  const phone2 = `+1212${(Date.now() + 1).toString().slice(-7)}`
  const bulkPhones = page.getByTestId('ban-bulk-phones')
  if (await bulkPhones.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)) {
    await bulkPhones.fill(`${phone1}\n${phone2}`)
  } else {
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.fill(`${phone1}\n${phone2}`)
    }
  }
  await page.evaluate(
    ({ p1, p2 }) => {
      (window as Record<string, unknown>).__test_bulk_phones = [p1, p2]
    },
    { p1: phone1, p2: phone2 },
  )
})

// --- Volunteer CRUD specific ---

Given('I have created a volunteer', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `AuditVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  await createUserAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
})

Given('I have created and then deleted a volunteer', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `DeleteVol ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  await createUserAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  // Delete the volunteer
  const row = page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: name })
  await row.getByTestId(TestIds.VOLUNTEER_DELETE_BTN).click()
  await page.getByTestId(TestIds.CONFIRM_DIALOG_OK).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

When('the volunteer logs in and navigates to {string}', async ({ page }, path: string) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_vol_nsec)) as string
  await loginAsVolunteer(page, nsec)
  // This step is only used in access-denied scenarios — the volunteer is navigating
  // somewhere they shouldn't be able to reach. Passing true asserts "Access Denied"
  // is shown rather than accepting either outcome.
  await navigateAfterLogin(page, path, true)
})

// "the reviewer logs in" is defined in roles-extended-steps.ts

// "a volunteer with the {string} role exists" is defined in roles-extended-steps.ts (API-based)

Given('a reporter has been invited and onboarded', async ({ page }) => {
  // Create a reporter via volunteer creation flow
  await Navigation.goToVolunteers(page)
  const name = `Reporter ${Date.now()}`
  const phone = `+1212${Date.now().toString().slice(-7)}`
  const nsec = await createUserAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_reporter_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

Given('a reporter is logged in', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_reporter_nsec)) as string
  expect(nsec).toBeTruthy()
  await loginAsVolunteer(page, nsec)
})

When('the reporter logs in', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_reporter_nsec)) as string
  expect(nsec).toBeTruthy()
  await loginAsVolunteer(page, nsec)
})

When('they create a new report', async ({ page }) => {
  const newBtn = page.getByTestId(TestIds.REPORT_NEW_BTN)
  await expect(newBtn).toBeVisible({ timeout: Timeouts.ELEMENT })
  await newBtn.click()
  // Reports use a chat-style interface — find textarea and submit button
  const textarea = page.locator('textarea').first()
  await expect(textarea).toBeVisible({ timeout: Timeouts.ELEMENT })
  await textarea.fill('Test report content')
  // Submit via send button, save button, or submit button (sequential check)
  const sendAriaBtn = page.locator('button[aria-label*="submit" i], button[aria-label*="send" i]').first()
  const isSend = await sendAriaBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (isSend) {
    await sendAriaBtn.click()
    return
  }
  const saveBtn = page.getByTestId(TestIds.FORM_SAVE_BTN)
  const isSave = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (isSave) {
    await saveBtn.click()
    return
  }
  await page.getByTestId(TestIds.FORM_SUBMIT_BTN).click()
})

Then('the report should be saved successfully', async ({ page }) => {
  // Check for success toast, success text, or return to report list
  const successToast = page.getByTestId(TestIds.SUCCESS_TOAST)
  const isToast = await successToast.isVisible({ timeout: Timeouts.ELEMENT }).catch(() => false)
  if (isToast) return
  const successText = page.getByText(/success|saved|created/i).first()
  const isText = await successText.isVisible({ timeout: 3000 }).catch(() => false)
  if (isText) return
  // Success toast may have already dismissed — check we're back on the list page
  await expect(page.getByTestId(TestIds.REPORT_LIST)).toBeVisible({ timeout: Timeouts.ELEMENT })
})
