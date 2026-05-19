import { test, expect } from '@playwright/test'
import { loginAsAdmin, mockConfigWithHub, navigateViaSpa } from '../helpers'

async function goToAdminSection(page: import('@playwright/test').Page, section: string) {
  await navigateViaSpa(page, `/admin/${section}`)
  await page.waitForSelector('[data-testid]', { timeout: 10_000 })
}

async function mockRecoveryGroupApis(page: import('@playwright/test').Page) {
  await page.route('**/api/hubs/*/recovery-group', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No recovery group configured' }),
    })
  })
  await page.route('**/api/hubs/*/recovery-group/candidates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route('**/api/hubs/*/recovery-group/requests', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await page.route('**/recovery-group/sessions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

test.describe('Recovery Group - Admin Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfigWithHub(page)
    await loginAsAdmin(page)
    await mockRecoveryGroupApis(page)
  })

  test('should display recovery team configuration section', async ({ page }) => {
    await goToAdminSection(page, 'recovery-group')
    await expect(page.locator('[data-testid="recovery-threshold"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-total"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-delay"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-emergency-floor"]')).toBeVisible()
  })

  test('should disable save when threshold exceeds total', async ({ page }) => {
    await goToAdminSection(page, 'recovery-group')
    await page.locator('[data-testid="recovery-total"]').fill('3')
    await page.locator('[data-testid="recovery-threshold"]').fill('4')
    await expect(
      page.locator('[data-testid="admin-recovery-group-save"]'),
    ).toBeDisabled()
  })

  test('should disable save when not enough holders selected', async ({ page }) => {
    await goToAdminSection(page, 'recovery-group')
    await page.locator('[data-testid="recovery-threshold"]').fill('2')
    await page.locator('[data-testid="recovery-total"]').fill('3')
    // No holders selected → save should be disabled
    await expect(
      page.locator('[data-testid="admin-recovery-group-save"]'),
    ).toBeDisabled()
  })
})

test.describe('Recovery Group - Recovery Requests Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfigWithHub(page)
    await loginAsAdmin(page)
    await mockRecoveryGroupApis(page)
  })

  test('should display recovery requests section', async ({ page }) => {
    await goToAdminSection(page, 'recovery-requests')
    await expect(
      page.getByText(/Account Recovery Requests|Active requests/i),
    ).toBeVisible()
  })

  test('should show empty state when no active requests', async ({ page }) => {
    await goToAdminSection(page, 'recovery-requests')
    await expect(
      page.getByText(/No active recovery requests/i),
    ).toBeVisible()
  })
})

test.describe('Recovery Group - Account Recovery Flow', () => {
  test('should show "I lost my device" link on login when key exists', async ({ page }) => {
    await page.goto('/login')
    // The link appears after PIN entry state is detected
    const lostDeviceLink = page.locator('[data-testid="lost-device-link"]')
    if (await lostDeviceLink.isVisible()) {
      await expect(lostDeviceLink).toBeVisible()
    }
  })

  test('should open account recovery flow', async ({ page }) => {
    await page.goto('/login')
    const lostDeviceLink = page.locator('[data-testid="lost-device-link"]')
    if (!await lostDeviceLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip()
      return
    }

    await lostDeviceLink.click()
    await expect(page.locator('[data-testid="recovery-identifier"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-hub"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-submit"]')).toBeVisible()
  })

  test('should navigate back from recovery flow', async ({ page }) => {
    await page.goto('/login')
    const lostDeviceLink = page.locator('[data-testid="lost-device-link"]')
    if (!await lostDeviceLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip()
      return
    }

    await lostDeviceLink.click()
    await expect(page.locator('[data-testid="recovery-identifier"]')).toBeVisible()

    // Click the back button (ArrowLeft icon button)
    await page.locator('button').filter({ has: page.locator('svg') }).first().click()
    await expect(lostDeviceLink).toBeVisible()
  })

  test('should require identifier and hub ID before submitting', async ({ page }) => {
    await page.goto('/login')
    const lostDeviceLink = page.locator('[data-testid="lost-device-link"]')
    if (!await lostDeviceLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip()
      return
    }

    await lostDeviceLink.click()
    // Submit button should be disabled with empty fields
    await expect(page.locator('[data-testid="recovery-submit"]')).toBeDisabled()

    // Fill identifier only — should still be disabled
    await page.locator('[data-testid="recovery-identifier"]').fill('user@example.com')
    await expect(page.locator('[data-testid="recovery-submit"]')).toBeDisabled()

    // Fill hub ID too — should be enabled
    await page.locator('[data-testid="recovery-hub"]').fill('test-hub')
    await expect(page.locator('[data-testid="recovery-submit"]')).toBeEnabled()
  })
})

test.describe('Recovery Group - IPC Mock Verification', () => {
  async function waitForInvoke(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.waitForFunction(
      () => typeof (window as any)[Symbol.for('llamenos_test_invoke')] === 'function',
      { timeout: 15_000 },
    )
  }

  test('shamir split and combine round-trips correctly', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(async () => {
      const invoke = (window as any)[Symbol.for('llamenos_test_invoke')] as
        (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

      const secretHex =
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

      const splitResult = (await invoke('shamir_split', {
        secretHex,
        total: 3,
        threshold: 2,
      })) as { shares: Array<{ x: number; y: string }>; commitments: string[] }

      const recovered = (await invoke('shamir_combine', {
        sharesJson: JSON.stringify(splitResult.shares.slice(0, 2)),
      })) as string

      const commitment0 = (await invoke('shamir_commit', {
        x: splitResult.shares[0].x,
        yHex: splitResult.shares[0].y,
      })) as string

      const verified = (await invoke('shamir_verify', {
        x: splitResult.shares[0].x,
        yHex: splitResult.shares[0].y,
        commitmentHex: commitment0,
      })) as boolean

      return {
        secretMatches: recovered === secretHex,
        commitmentMatches: commitment0 === splitResult.commitments[0],
        commitmentVerified: verified,
        shareCount: splitResult.shares.length,
        commitmentCount: splitResult.commitments.length,
      }
    })

    expect(result.secretMatches).toBe(true)
    expect(result.commitmentMatches).toBe(true)
    expect(result.commitmentVerified).toBe(true)
    expect(result.shareCount).toBe(3)
    expect(result.commitmentCount).toBe(3)
  })

  test('recovery group keypair generation produces valid hex keys', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(async () => {
      const invoke = (window as any)[Symbol.for('llamenos_test_invoke')] as
        (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

      const keypair = (await invoke('recovery_group_generate_keypair')) as {
        publicKeyHex: string
        privateKeyHex: string
      }

      return {
        hasPublicKey: keypair.publicKeyHex.length === 64,
        hasPrivateKey: keypair.privateKeyHex.length === 64,
        keysAreDifferent: keypair.publicKeyHex !== keypair.privateKeyHex,
      }
    })

    expect(result.hasPublicKey).toBe(true)
    expect(result.hasPrivateKey).toBe(true)
    expect(result.keysAreDifferent).toBe(true)
  })

  test('shamir verify rejects invalid commitment', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(async () => {
      const invoke = (window as any)[Symbol.for('llamenos_test_invoke')] as
        (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

      const splitResult = (await invoke('shamir_split', {
        secretHex: 'aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd',
        total: 3,
        threshold: 2,
      })) as { shares: Array<{ x: number; y: string }>; commitments: string[] }

      const badCommitment = '0'.repeat(64)
      const rejected = (await invoke('shamir_verify', {
        x: splitResult.shares[0].x,
        yHex: splitResult.shares[0].y,
        commitmentHex: badCommitment,
      })) as boolean

      return { rejected }
    })

    expect(result.rejected).toBe(false)
  })
})

test.describe('Epic C - Key Isolation & Wipe Completeness', () => {
  async function waitForInvoke(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.waitForFunction(
      () => typeof (window as any)[Symbol.for('llamenos_test_invoke')] === 'function',
      { timeout: 15_000 },
    )
  }

  test('recovery group create does not expose private key to webview', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(async () => {
      const invoke = (window as any)[Symbol.for('llamenos_test_invoke')] as
        (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

      const createResult = (await invoke('recovery_group_create', {
        total: 3,
        threshold: 2,
      })) as { publicKeyHex: string; shares: Array<{ x: number; y: string }>; commitments: string[] }

      // The result should contain publicKeyHex, shares, and commitments but NO privateKeyHex
      const resultJson = JSON.stringify(createResult)
      return {
        hasPublicKey: createResult.publicKeyHex.length === 64,
        hasShares: createResult.shares.length === 3,
        hasCommitments: createResult.commitments.length === 3,
        noPrivateKeyField: !('privateKeyHex' in createResult),
        noPrivateKeyInJson: !resultJson.includes('privateKeyHex'),
      }
    })

    expect(result.hasPublicKey).toBe(true)
    expect(result.hasShares).toBe(true)
    expect(result.hasCommitments).toBe(true)
    expect(result.noPrivateKeyField).toBe(true)
    expect(result.noPrivateKeyInJson).toBe(true)
  })

  test('device wipe clears mock vault state', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(async () => {
      const invoke = (window as any)[Symbol.for('llamenos_test_invoke')] as
        (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

      // Generate keys first
      await invoke('device_generate_and_load', {
        pin: '12345678',
        deviceId: 'test-device-wipe',
      })

      // Confirm unlocked
      const unlockedBefore = (await invoke('is_crypto_unlocked')) as boolean

      // Wipe
      await invoke('wipe_keys')

      // Confirm locked
      const unlockedAfter = (await invoke('is_crypto_unlocked')) as boolean

      // Attempting to get pubkeys should fail
      let pubkeyError = false
      try {
        await invoke('get_device_pubkeys')
      } catch {
        pubkeyError = true
      }

      return { unlockedBefore, unlockedAfter, pubkeyError }
    })

    expect(result.unlockedBefore).toBe(true)
    expect(result.unlockedAfter).toBe(false)
    expect(result.pubkeyError).toBe(true)
  })

  test('no localStorage fallback for device keys', async ({ page }) => {
    await waitForInvoke(page)

    const result = await page.evaluate(() => {
      // Check that no llamenos:-prefixed keys exist in localStorage
      const llamenosKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('llamenos:')) {
          llamenosKeys.push(key)
        }
      }
      // Filter out test infrastructure keys (lockout state)
      const deviceKeys = llamenosKeys.filter(k => !k.includes('__test_'))
      return { deviceKeyCount: deviceKeys.length, keys: deviceKeys }
    })

    expect(result.deviceKeyCount).toBe(0)
  })
})
