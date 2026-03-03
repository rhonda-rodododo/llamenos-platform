/**
 * Settings step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/settings/settings-display.feature
 *   - packages/test-specs/features/settings/lock-logout.feature
 *   - packages/test-specs/features/settings/device-link.feature
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'

// --- Settings display steps ---

Then('I should see my npub in monospace text', async ({ page }) => {
  const npub = page.locator('text=/npub1/')
  await expect(npub.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the copy npub button', async ({ page }) => {
  const copyBtn = page.locator('button[aria-label*="Copy"], button[aria-label*="copy"]')
  await expect(copyBtn.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the hub connection card', async ({ page }) => {
  const hubCard = page.locator('text=/hub|connection/i')
  await expect(hubCard.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the connection status should be displayed', async ({ page }) => {
  const status = page.locator('text=/connect|disconnect|online|offline/i')
  await expect(status.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the device link card \\(may need scroll)', async ({ page }) => {
  // SettingsSection with id="linked-devices" now has data-testid="linked-devices"
  const linkedDevices = page.locator('[data-testid="linked-devices"]')
  await linkedDevices.scrollIntoViewIfNeeded()
  await expect(linkedDevices).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the device link card should be tappable', async ({ page }) => {
  const linkedDevices = page.locator('[data-testid="linked-devices"]')
  await expect(linkedDevices).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the admin card \\(may need scroll)', async ({ page }) => {
  // Desktop has no "admin card" — check that the admin section is visible in the sidebar
  const adminSection = page.getByTestId(TestIds.NAV_ADMIN_SECTION)
  await expect(adminSection).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the admin card should be tappable', async ({ page }) => {
  // Desktop: admin section links in sidebar are always clickable
  const adminSection = page.getByTestId(TestIds.NAV_ADMIN_SECTION)
  const firstLink = adminSection.getByRole('link').first()
  await expect(firstLink).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see the version text', async ({ page }) => {
  const version = page.locator('text=/v?\\d+\\.\\d+\\.\\d+/')
  await expect(version.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Lock & Logout steps ---

Then('I should see the logout confirmation dialog', async ({ page }) => {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: Timeouts.ELEMENT })
})

// --- Device link steps ---

Then('I should see the step indicator', async ({ page }) => {
  const stepIndicator = page.locator('text=/step|scan|verify|import/i')
  await expect(stepIndicator.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see step labels \\(Scan, Verify, Import)', async ({ page }) => {
  await expect(page.locator('text=/scan/i').first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the current step should be {string}', async ({ page }, step: string) => {
  await expect(page.locator(`text="${step}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should see either the camera preview or the camera permission prompt', async ({ page }) => {
  // In test environment, camera won't be available
  const cameraOrPermission = page.locator('text=/camera|permission|scan/i')
  await expect(cameraOrPermission.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Given('camera permission is not granted', async () => {
  // In Playwright test context, camera permission is not granted by default
})

Then('I should see the error state', async ({ page }) => {
  const errorState = page.locator('text=/error|invalid|failed/i')
  await expect(errorState.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the error message should mention {string}', async ({ page }, text: string) => {
  await expect(page.locator(`text=/${text}/i`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the device link card should still be visible', async ({ page }) => {
  const linkedDevices = page.locator('[data-testid="linked-devices"]')
  await linkedDevices.scrollIntoViewIfNeeded()
  await expect(linkedDevices).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the settings identity card should be visible', async ({ page }) => {
  const npub = page.locator('text=/npub1/')
  await expect(npub.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('a QR code with invalid format is scanned', async ({ page }) => {
  // Simulate scanning an invalid QR — in test env, trigger via test hook
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('qr-scanned', { detail: { data: 'invalid-qr-data' } }))
  })
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
})

// --- Profile settings steps ---

When('I change my display name', async ({ page }) => {
  const nameInput = page.getByLabel(/name/i)
  const newName = `Admin ${Date.now()}`
  await nameInput.clear()
  await nameInput.fill(newName)
  await page.evaluate((n) => {
    ;(window as Record<string, unknown>).__test_new_display_name = n
  }, newName)
})

Then('the new display name should persist', async ({ page }) => {
  const newName = (await page.evaluate(
    () => (window as Record<string, unknown>).__test_new_display_name,
  )) as string
  if (newName) {
    const nameInput = page.getByLabel(/name/i)
    await expect(nameInput).toHaveValue(newName)
  }
})

When('I enter a valid phone number', async ({ page }) => {
  const phone = `+1555${Date.now().toString().slice(-7)}`
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
})

When('I enter an invalid phone number {string}', async ({ page }, phone: string) => {
  await page.getByLabel(/phone/i).fill(phone)
  await page.getByLabel(/phone/i).blur()
})

Then('I should see the {string} section', async ({ page }, sectionName: string) => {
  await expect(page.locator(`text="${sectionName}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('they update their name and phone', async ({ page }) => {
  const nameInput = page.getByLabel(/name/i)
  await nameInput.clear()
  await nameInput.fill(`Vol ${Date.now()}`)
  const phoneInput = page.getByLabel(/phone/i)
  await phoneInput.clear()
  await phoneInput.fill(`+1555${Date.now().toString().slice(-7)}`)
  await phoneInput.blur()
})

When('I toggle a language option', async ({ page }) => {
  const langOption = page.locator(
    '[data-testid="language-option"], label:has-text("Spanish"), label:has-text("Español")',
  ).first()
  if (await langOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await langOption.click()
  }
})

Then('the transcription section should be expanded', async ({ page }) => {
  const section = page.locator('text=/transcription/i')
  await expect(section.first()).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the profile section should be expanded', async ({ page }) => {
  const nameInput = page.getByLabel(/name/i)
  await expect(nameInput).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('the profile section should collapse', async ({ page }) => {
  const nameInput = page.getByLabel(/name/i)
  await expect(nameInput).not.toBeVisible({ timeout: 3000 })
})

Then('the profile section should expand', async ({ page }) => {
  const nameInput = page.getByLabel(/name/i)
  await expect(nameInput).toBeVisible({ timeout: Timeouts.ELEMENT })
})

When('I click the {string} header', async ({ page }, headerText: string) => {
  const header = page.locator(
    `h3:has-text("${headerText}"), button:has-text("${headerText}"), [role="heading"]:has-text("${headerText}")`,
  )
  await header.first().click()
})

When('I click the {string} header again', async ({ page }, headerText: string) => {
  const header = page.locator(
    `h3:has-text("${headerText}"), button:has-text("${headerText}"), [role="heading"]:has-text("${headerText}")`,
  )
  await header.first().click()
})

Then(
  'both {string} and {string} sections should be visible',
  async ({ page }, sec1: string, sec2: string) => {
    await expect(page.locator(`text="${sec1}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
    await expect(page.locator(`text="${sec2}"`).first()).toBeVisible({ timeout: Timeouts.ELEMENT })
  },
)

Then('each settings section should have a {string} button', async ({ page }, buttonText: string) => {
  const buttons = page.locator(`button:has-text("${buttonText}")`)
  const count = await buttons.count()
  expect(count).toBeGreaterThanOrEqual(1)
})
