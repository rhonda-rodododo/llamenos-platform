import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState, enterPin, TEST_PIN, navigateAfterLogin } from './helpers'

test.describe('Telephony Provider Settings', () => {
  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Hub Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()
  })

  test('telephony provider section is visible and collapsed by default', async ({ page }) => {
    await expect(page.getByText('Telephony Provider').first()).toBeVisible()
  })

  test('shows env fallback message when no provider configured', async ({ page }) => {
    // Expand the Telephony Provider section
    await page.getByText('Telephony Provider').first().click()
    await expect(page.getByText(/using environment variable defaults/i)).toBeVisible()
  })

  test('provider dropdown shows all providers', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    const select = page.locator('select').first()
    await expect(select).toBeVisible()

    // Should have all 5 options
    const options = select.locator('option')
    await expect(options).toHaveCount(5)
    await expect(options.nth(0)).toHaveText('Twilio')
    await expect(options.nth(1)).toHaveText('SignalWire')
    await expect(options.nth(2)).toHaveText('Vonage')
    await expect(options.nth(3)).toHaveText('Plivo')
    await expect(options.nth(4)).toHaveText('Asterisk (Self-Hosted)')
  })

  test('changing provider updates credential form fields', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    // Default is Twilio — should show Account SID and Auth Token
    await expect(page.getByText('Account SID')).toBeVisible()
    await expect(page.getByText('Auth Token').first()).toBeVisible()
    // Should NOT show SignalWire Space
    await expect(page.getByText('SignalWire Space', { exact: true })).not.toBeVisible()

    // Switch to SignalWire
    const select = page.locator('select').first()
    await select.selectOption('signalwire')
    // Should show SignalWire Space field
    await expect(page.getByText('SignalWire Space', { exact: true })).toBeVisible()
    // Should still show Account SID and Auth Token (shared with Twilio)
    await expect(page.getByText('Account SID')).toBeVisible()

    // Switch to Vonage
    await select.selectOption('vonage')
    // Should show Vonage-specific fields
    await expect(page.getByText('API Key')).toBeVisible()
    await expect(page.getByText('API Secret')).toBeVisible()
    await expect(page.getByText('Application ID')).toBeVisible()
    // Should NOT show Twilio fields
    await expect(page.getByText('Account SID')).not.toBeVisible()
    // Vonage is now implemented — no warning
    await expect(page.getByText(/not yet implemented/i)).not.toBeVisible()

    // Switch to Plivo
    await select.selectOption('plivo')
    await expect(page.getByText('Auth ID')).toBeVisible()
    // Plivo is now implemented — no warning
    await expect(page.getByText(/not yet implemented/i)).not.toBeVisible()

    // Switch to Asterisk
    await select.selectOption('asterisk')
    await expect(page.getByText('ARI URL')).toBeVisible()
    await expect(page.getByText('ARI Username')).toBeVisible()
    await expect(page.getByText('ARI Password')).toBeVisible()
    await expect(page.getByText('Bridge Callback URL')).toBeVisible()
    // Asterisk is now implemented — no warning
    await expect(page.getByText(/not yet implemented/i)).not.toBeVisible()
  })

  test('save button disabled when phone number is empty', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    const saveButton = page.getByRole('button', { name: /save provider/i })
    await expect(saveButton).toBeDisabled()
  })

  test('admin can save Twilio provider config', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    // Fill in Twilio credentials
    await page.locator('input[type="tel"]').fill('+15551234567')
    await page.getByPlaceholder('AC...').fill('AC1234567890abcdef')
    // Auth token is type=password, use label
    const authTokenInput = page.locator('input[type="password"]').first()
    await authTokenInput.fill('test-auth-token-123')

    // Save
    const saveButton = page.getByRole('button', { name: /save provider/i })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    // Should show success toast
    await expect(page.getByText(/telephony provider saved/i)).toBeVisible({ timeout: 5000 })

    // Should now show "Current provider: Twilio" instead of env fallback
    await expect(page.getByText(/current provider.*twilio/i)).toBeVisible()
  })

  test('saved provider config persists after page reload', async ({ page }) => {
    // First save a config
    await page.getByText('Telephony Provider').first().click()
    await page.locator('input[type="tel"]').fill('+15559876543')
    await page.getByPlaceholder('AC...').fill('AC9876543210abcdef')
    const authTokenInput = page.locator('input[type="password"]').first()
    await authTokenInput.fill('test-auth-token-456')

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

    // Should show current provider
    await expect(page.getByText(/current provider/i)).toBeVisible()

    // The phone number should be pre-filled (formatted by react-phone-number-input)
    await expect(page.locator('input[type="tel"]')).toHaveValue(/555\s*987\s*6543/)
    // Account SID should be pre-filled
    await expect(page.getByPlaceholder('AC...')).toHaveValue('AC9876543210abcdef')
  })

  test('admin can save SignalWire provider config', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    // Switch to SignalWire
    const select = page.locator('select').first()
    await select.selectOption('signalwire')

    // Fill in SignalWire credentials
    await page.locator('input[type="tel"]').fill('+15551112222')
    await page.getByPlaceholder('AC...').fill('SW-project-id-123')
    const authTokenInput = page.locator('input[type="password"]').first()
    await authTokenInput.fill('sw-auth-token-789')
    await page.getByPlaceholder('myspace').fill('myhotline')

    // Save
    await page.getByRole('button', { name: /save provider/i }).click()
    await expect(page.getByText(/telephony provider saved/i)).toBeVisible({ timeout: 5000 })

    // Should show current provider as SignalWire
    await expect(page.getByText(/current provider.*signalwire/i)).toBeVisible()
  })

  test('test connection button works (will fail with fake creds)', async ({ page }) => {
    await page.getByText('Telephony Provider').first().click()

    // Fill minimal Twilio creds
    await page.locator('input[type="tel"]').fill('+15551234567')
    await page.getByPlaceholder('AC...').fill('ACfake123')
    const authTokenInput = page.locator('input[type="password"]').first()
    await authTokenInput.fill('fake-token')

    // Click Test Connection
    const testButton = page.getByRole('button', { name: /test connection/i })
    await testButton.click()

    // Should show "Testing..." while in progress
    await expect(page.getByText(/testing\.\.\./i)).toBeVisible()

    // Should show failure (since creds are fake)
    await expect(page.getByText(/connection failed/i)).toBeVisible({ timeout: 10000 })
  })

  test('deep link to telephony-provider section auto-expands it', async ({ page }) => {
    await navigateAfterLogin(page, '/admin/settings?section=telephony-provider')
    await expect(page.getByRole('heading', { name: 'Hub Settings', exact: true })).toBeVisible()

    // The section should be expanded — we should see the provider dropdown
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5000 })
  })
})
