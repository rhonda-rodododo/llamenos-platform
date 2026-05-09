import { expect } from '@playwright/test'
import { test } from '../desktop-e2e-fixtures'
import { Navigation, VolunteerPage } from '../pages'
import { loginAsAdmin, Timeouts, uniquePhone } from '../helpers'
import { TestIds } from '../test-ids'

test.describe('Volunteer Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('volunteer list page loads', async ({ page }) => {
    await Navigation.goToVolunteers(page)
    await expect(page.getByTestId(TestIds.VOLUNTEER_LIST)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('can add a new volunteer', async ({ page }) => {
    await Navigation.goToVolunteers(page)
    
    const name = `Test Volunteer ${Date.now()}`
    const phone = uniquePhone()
    
    await VolunteerPage.openAddForm(page)
    await VolunteerPage.addVolunteer(page, name, phone)
    await VolunteerPage.dismissNsecCard(page)
    await expect(VolunteerPage.getRow(page, name)).toBeVisible({ timeout: Timeouts.ELEMENT })
  })

  test('volunteer appears in list after creation', async ({ page }) => {
    await Navigation.goToVolunteers(page)
    
    const name = `E2E Volunteer ${Date.now()}`
    const phone = uniquePhone()
    
    await VolunteerPage.openAddForm(page)
    await VolunteerPage.addVolunteer(page, name, phone)
    await VolunteerPage.dismissNsecCard(page)
    const row = VolunteerPage.getRow(page, name)
    await expect(row).toBeVisible({ timeout: Timeouts.ELEMENT })
  })
})
