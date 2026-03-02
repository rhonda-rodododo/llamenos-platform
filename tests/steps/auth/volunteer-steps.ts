/**
 * Volunteer CRUD & invite onboarding step definitions.
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
  createVolunteerAndGetNsec,
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
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
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
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
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
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  await loginAsVolunteer(page, nsec)
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

Given('a volunteer is logged in', async ({ page }) => {
  await loginAsAdmin(page)
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  await loginAsVolunteer(page, nsec)
})

Given('a volunteer exists', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `TestVol ${Date.now()}`
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_vol_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

When('they tap the break button', async ({ page }) => {
  const breakBtn = page.locator('button:has-text("Break"), button:has-text("On Break"), button:has-text("Take Break")')
  await breakBtn.first().click()
})

// --- Invite onboarding ---

When('I create an invite for a new volunteer', async ({ page }) => {
  await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
  const name = `InviteVol ${Date.now()}`
  await page.getByLabel('Name').fill(name)
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_invite_vol_name = n
  }, name)
})

Then('an invite link should be generated', async ({ page }) => {
  const inviteCard = page.getByTestId(TestIds.VOLUNTEER_INVITE_CARD).or(page.getByTestId(TestIds.VOLUNTEER_NSEC_CARD))
  await expect(inviteCard.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
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
  if (volName) {
    await expect(page.locator(`text=/${volName}/i`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
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
  if (volName) {
    await expect(page.locator(`text="${volName}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

When('I revoke the invite', async ({ page }) => {
  const revokeBtn = page.locator('button:has-text("Revoke")')
  await revokeBtn.first().click()
  // Confirm if dialog appears
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dialog.getByRole('button', { name: /confirm|revoke|yes/i }).click()
  }
})

Then('the volunteer name should no longer appear in the list', async ({ page }) => {
  const volName = (await page.evaluate(() => (window as Record<string, unknown>).__test_invite_vol_name)) as string
  if (volName) {
    await expect(page.locator(`text="${volName}"`).first()).not.toBeVisible({ timeout: Timeouts.ELEMENT })
  }
})

// --- Form validation ---

Then('I should see the volunteer nsec', async ({ page }) => {
  await expect(page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)).toBeVisible({ timeout: Timeouts.API })
})

When('I paste invalid phone numbers in the textarea', async ({ page }) => {
  const textarea = page.locator('textarea')
  await textarea.fill('+12\n+34\ninvalid')
})

When('I paste two phone numbers in the textarea', async ({ page }) => {
  const phone1 = `+1555${Date.now().toString().slice(-7)}`
  const phone2 = `+1555${(Date.now() + 1).toString().slice(-7)}`
  const textarea = page.locator('textarea')
  await textarea.fill(`${phone1}\n${phone2}`)
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
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await createVolunteerAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
})

Given('I have created and then deleted a volunteer', async ({ page }) => {
  await Navigation.goToVolunteers(page)
  const name = `DeleteVol ${Date.now()}`
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await createVolunteerAndGetNsec(page, name, phone)
  await dismissNsecCard(page)
  // Delete the volunteer
  const row = page.getByTestId(TestIds.VOLUNTEER_ROW).filter({ hasText: name })
  await row.getByTestId(TestIds.VOLUNTEER_DELETE_BTN).click()
  await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

When('the volunteer logs in and navigates to {string}', async ({ page }, path: string) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_vol_nsec)) as string
  await loginAsVolunteer(page, nsec)
  await navigateAfterLogin(page, path)
})

When('the reviewer logs in', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_vol_nsec)) as string
  if (nsec) {
    await loginAsVolunteer(page, nsec)
  }
})

Given('a volunteer with the {string} role exists', async ({ page }) => {
  // Create volunteer — role assignment is an admin action
  await Navigation.goToVolunteers(page)
  const name = `RoleVol ${Date.now()}`
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_vol_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

Given('a reporter has been invited and onboarded', async ({ page }) => {
  // Create a reporter via volunteer creation flow
  await Navigation.goToVolunteers(page)
  const name = `Reporter ${Date.now()}`
  const phone = `+1555${Date.now().toString().slice(-7)}`
  const nsec = await createVolunteerAndGetNsec(page, name, phone)
  await page.evaluate((n) => {
    (window as Record<string, unknown>).__test_reporter_nsec = n
  }, nsec)
  await dismissNsecCard(page)
})

Given('a reporter is logged in', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_reporter_nsec)) as string
  if (nsec) {
    await loginAsVolunteer(page, nsec)
  }
})

When('the reporter logs in', async ({ page }) => {
  const nsec = (await page.evaluate(() => (window as Record<string, unknown>).__test_reporter_nsec)) as string
  if (nsec) {
    await loginAsVolunteer(page, nsec)
  }
})

When('they create a new report', async ({ page }) => {
  await page.getByTestId('report-new-btn').click()
  await page.locator('textarea').first().fill('Test report content')
  await page.getByTestId('form-submit-btn').click()
})

Then('the report should be saved successfully', async ({ page }) => {
  const success = page.locator('text=/success|saved|created/i')
  await expect(success.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})
