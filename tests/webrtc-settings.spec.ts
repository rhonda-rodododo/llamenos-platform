import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState, enterPin, TEST_PIN, navigateAfterLogin } from './helpers'

test.describe('WebRTC & Call Preference Settings', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // --- Volunteer Settings: Call Preference ---

  test('call preference section is visible in volunteer settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    // Click to expand the Call Preference section
    await page.getByText('Call Preference').first().click()
    await expect(page.getByText('Phone Only')).toBeVisible()
    await expect(page.getByText('Browser Only')).toBeVisible()
    await expect(page.getByText('Phone + Browser')).toBeVisible()
  })

  test('phone only is selected by default', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByText('Call Preference').first().click()

    // Phone Only should be the active option (has the indicator dot)
    const phoneOption = page.locator('button').filter({ hasText: 'Phone Only' })
    await expect(phoneOption).toHaveClass(/border-primary/)
  })

  test('browser and both options are disabled when WebRTC not configured', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByText('Call Preference').first().click()

    // WebRTC not configured message should be visible
    await expect(page.getByText(/browser calling is not available/i)).toBeVisible()

    // Browser and Both options should be disabled
    const browserOption = page.locator('button').filter({ hasText: 'Browser Only' })
    const bothOption = page.locator('button').filter({ hasText: 'Phone + Browser' })
    await expect(browserOption).toBeDisabled()
    await expect(bothOption).toBeDisabled()
  })

  test('deep link to call-preference section auto-expands it', async ({ page }) => {
    await navigateAfterLogin(page, '/settings?section=call-preference')
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible()

    // The section should be expanded — we should see the preference options
    await expect(page.getByText('Phone Only')).toBeVisible({ timeout: 5000 })
  })

  // --- Hub Settings: WebRTC Configuration ---

  test('WebRTC config section appears in telephony provider settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand the Telephony Provider section
    await page.getByText('Telephony Provider').first().click()

    // WebRTC Configuration section should be visible
    await expect(page.getByText('WebRTC Configuration')).toBeVisible()
  })

  test('WebRTC toggle enables API key fields for Twilio', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await page.getByText('Telephony Provider').first().click()

    // Initially, WebRTC fields should not be visible (toggle is off)
    await expect(page.getByText('API Key SID')).not.toBeVisible()

    // Enable WebRTC toggle
    const webrtcSection = page.locator('div').filter({ hasText: /WebRTC Configuration/ }).filter({ has: page.getByRole('switch') }).last()
    const toggle = webrtcSection.getByRole('switch')
    await toggle.click()

    // Now API Key fields should be visible
    await expect(page.getByText('API Key SID')).toBeVisible()
    await expect(page.getByText('API Key Secret')).toBeVisible()
    await expect(page.getByText('TwiML App SID')).toBeVisible()
  })

  test('WebRTC fields not shown for Asterisk provider', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await page.getByText('Telephony Provider').first().click()

    // Switch to Asterisk
    const select = page.locator('select').first()
    await select.selectOption('asterisk')

    // WebRTC Configuration should NOT be visible for Asterisk
    await expect(page.getByText('WebRTC Configuration')).not.toBeVisible()
  })

  test('WebRTC toggle shown for SignalWire provider', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await page.getByText('Telephony Provider').first().click()

    // Switch to SignalWire
    const select = page.locator('select').first()
    await select.selectOption('signalwire')

    // WebRTC Configuration should still be visible
    await expect(page.getByText('WebRTC Configuration')).toBeVisible()
  })

  test('WebRTC toggle shown for Vonage without extra fields', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await page.getByText('Telephony Provider').first().click()

    // Switch to Vonage
    const select = page.locator('select').first()
    await select.selectOption('vonage')

    // WebRTC Configuration should be visible
    await expect(page.getByText('WebRTC Configuration')).toBeVisible()

    // Enable WebRTC
    const webrtcSection = page.locator('div').filter({ hasText: /WebRTC Configuration/ }).filter({ has: page.getByRole('switch') }).last()
    const toggle = webrtcSection.getByRole('switch')
    await toggle.click()

    // Vonage doesn't need API Key SID — should NOT show Twilio-specific fields
    await expect(page.getByText('API Key SID')).not.toBeVisible()
    await expect(page.getByText('TwiML App SID')).not.toBeVisible()
  })

  test('WebRTC config persists with provider save', async ({ page }) => {
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await page.getByText('Telephony Provider').first().click()

    // Fill in basic Twilio credentials
    await page.getByPlaceholder('+12125551234').fill('+15551234567')
    await page.getByPlaceholder('AC...').fill('ACwebrtctest123')
    const authTokenInput = page.locator('input[type="password"]').first()
    await authTokenInput.fill('webrtc-auth-token')

    // Enable WebRTC and fill API Key fields
    const webrtcSection = page.locator('div').filter({ hasText: /WebRTC Configuration/ }).filter({ has: page.getByRole('switch') }).last()
    const toggle = webrtcSection.getByRole('switch')
    await toggle.click()

    await page.getByPlaceholder('SK...').fill('SKtestkey123')
    await page.getByPlaceholder('AP...').fill('APtestapp456')

    // Save
    await page.getByRole('button', { name: /save provider/i }).click()
    await expect(page.getByText(/telephony provider saved/i)).toBeVisible({ timeout: 5000 })

    // Reload the page — clears keyManager, PIN re-entry needed
    await page.reload()
    await enterPin(page, TEST_PIN)
    // PIN unlock redirects to dashboard — navigate back to Hub Settings
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // Expand the section
    await page.getByText('Telephony Provider').first().click()

    // Verify WebRTC fields are populated
    await expect(page.getByPlaceholder('SK...')).toHaveValue('SKtestkey123')
    await expect(page.getByPlaceholder('AP...')).toHaveValue('APtestapp456')
  })
})
