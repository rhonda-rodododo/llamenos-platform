import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState } from './helpers'

// Tests depend on each other's server-side state (bootstrap creates admin for later tests)
test.describe.configure({ mode: 'serial' })

test.describe('In-Browser Admin Bootstrap', () => {
  // =====================================================================
  // Test 1: Fresh deploy redirects to setup with bootstrap step
  // =====================================================================
  test('fresh deploy redirects unauthenticated user to /setup', async ({ page, request }) => {
    // Reset to a fresh state with no admin
    await request.post('/api/test-reset-no-admin')

    // Verify server state: config should show needsBootstrap
    const configRes = await request.get('/api/config')
    const config = await configRes.json()
    expect(config.needsBootstrap).toBe(true)

    // Clear any stored keys and do a full page load
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    // Navigate to root — should eventually redirect to /setup
    await page.goto('/')
    await page.waitForURL(url => url.pathname === '/setup' || url.pathname === '/login', { timeout: 15000 })

    // If we ended up on /login, the login page should show "go to setup" message
    if (page.url().includes('/login')) {
      // Bootstrap redirect on login page works — verify the message is shown
      await expect(page.getByText('No admin account configured yet')).toBeVisible({ timeout: 10000 })
      // Click through to setup
      await page.getByRole('link', { name: /go to setup/i }).click()
      await page.waitForURL('**/setup', { timeout: 10000 })
    }

    // Should show "Create Admin Account" bootstrap step
    await expect(page.getByText('Create Admin Account')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Welcome to your hotline')).toBeVisible()

    // A11y: language selector should be a radiogroup
    const langGroup = page.locator('[role="radiogroup"]')
    await expect(langGroup).toBeVisible()
    // English should be checked by default
    const engRadio = langGroup.locator('[role="radio"][aria-checked="true"]')
    await expect(engRadio).toBeVisible()
  })

  // =====================================================================
  // Test 2: Login page shows bootstrap redirect when needsBootstrap
  // =====================================================================
  test('login page shows "go to setup" when no admin exists', async ({ page, request }) => {
    // Ensure fresh state
    await request.post('/api/test-reset-no-admin')

    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()

    // Should show the bootstrap redirect message
    await expect(page.getByText('No admin account configured yet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: /go to setup/i })).toBeVisible()
  })

  // =====================================================================
  // Test 3: Full bootstrap flow — generate keypair, set PIN, backup, verify
  // =====================================================================
  test('complete bootstrap flow creates admin and advances to wizard', async ({ page, request }) => {
    // Fresh state
    await request.post('/api/test-reset-no-admin')

    await page.goto('/setup')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()

    // Wait for bootstrap step
    await expect(page.getByText('Create Admin Account')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Welcome to your hotline')).toBeVisible()

    // Step 1: Welcome — click Get Started
    await page.getByRole('button', { name: /get started/i }).click()

    // Step 2: PIN creation
    await expect(page.getByText('Create a PIN')).toBeVisible({ timeout: 5000 })
    const pinDigit1 = page.locator('input[aria-label="PIN digit 1"]')
    await pinDigit1.waitFor({ state: 'visible', timeout: 5000 })
    await pinDigit1.click()
    await page.keyboard.type('123456', { delay: 50 })

    // PIN confirmation
    await expect(page.getByText('Confirm your PIN')).toBeVisible({ timeout: 5000 })
    const confirmDigit1 = page.locator('input[aria-label="PIN digit 1"]')
    await confirmDigit1.click()
    await page.keyboard.type('123456', { delay: 50 })

    // Step 3: Generating + backup
    await expect(page.getByText('Save Your Recovery Key')).toBeVisible({ timeout: 15000 })

    // Recovery key should be shown
    const recoveryKey = await page.locator('[data-testid="recovery-key"]').textContent()
    expect(recoveryKey).toBeTruthy()
    expect(recoveryKey!.includes('-')).toBeTruthy()

    // Download backup
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /download encrypted backup/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('llamenos-backup-')

    // Acknowledge backup saved
    await page.getByText('I have saved my recovery key').click()

    // Click continue to setup
    await page.getByRole('button', { name: /continue to setup/i }).click()

    // Wait for bootstrap to complete and wizard to advance
    // Should advance to the normal setup wizard
    await expect(page.getByText('Setup Wizard')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Identity', { exact: true })).toBeVisible()

    // A11y: progress bar should have proper ARIA attributes
    const progressbar = page.locator('[role="progressbar"]')
    await expect(progressbar).toBeVisible()
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1')
    await expect(progressbar).toHaveAttribute('aria-valuemax', '6')

    // --- Hard refresh: should prompt for PIN re-entry ---
    await page.reload()
    // Key is stored in localStorage but locked after reload (in-memory closure cleared)
    await expect(page.getByRole('heading', { name: 'Enter your PIN' })).toBeVisible({ timeout: 10000 })

    // Enter the correct PIN
    const unlockDigit1 = page.locator('input[aria-label="PIN digit 1"]')
    await unlockDigit1.waitFor({ state: 'visible', timeout: 5000 })
    await unlockDigit1.click()
    await page.keyboard.type('123456', { delay: 50 })

    // Should advance back to the wizard after PIN entry
    await expect(page.getByText('Setup Wizard')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Identity', { exact: true })).toBeVisible()
  })

  // =====================================================================
  // Test 4: After bootstrap, needsBootstrap is false and login works normally
  // =====================================================================
  test('after bootstrap, login page works normally', async ({ page }) => {
    // Clear local storage (simulate different browser)
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()

    // Should NOT show the bootstrap redirect — admin now exists
    await expect(page.getByText('No admin account configured yet')).not.toBeVisible({ timeout: 5000 })

    // Should show the normal login page (recovery/nsec entry)
    await expect(page.getByText(/sign in to/i)).toBeVisible({ timeout: 5000 })
  })

  // =====================================================================
  // Test 5: Bootstrap endpoint rejects if admin already exists
  // =====================================================================
  test('bootstrap endpoint returns 403 when admin exists', async ({ request }) => {
    // Admin was created in test 3
    const res = await request.post('/api/auth/bootstrap', {
      data: {
        pubkey: 'deadbeef'.repeat(8),
        timestamp: Date.now(),
        token: 'fake',
      },
    })
    // Should be 401 (invalid signature) or 403 (admin exists)
    expect([401, 403]).toContain(res.status())
  })

  // =====================================================================
  // Test 6: Restore normal test state
  // =====================================================================
  test('restore normal test state', async ({ request }) => {
    await resetTestState(request)
    // Verify admin exists again
    const res = await request.get('/api/config')
    const config = await res.json()
    expect(config.needsBootstrap).toBe(false)
  })
})
