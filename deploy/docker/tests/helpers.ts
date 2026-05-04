import { type Page, type APIRequestContext, expect } from '@playwright/test'
import { TestIds } from './test-ids'

export const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'
export const TEST_PIN = '123456'

export const Timeouts = {
  NAVIGATION: 10000,
  API: 15000,
  ELEMENT: 10000,
  AUTH: 30000,
  UI_SETTLE: 500,
  ASYNC_SETTLE: 1500,
} as const

export { TestIds } from './test-ids'

/**
 * Enter a PIN into the PinInput component.
 */
export async function enterPin(page: Page, pin: string) {
  const firstDigit = page.locator('input[aria-label="PIN or passphrase"]')
  await firstDigit.waitFor({ state: 'visible', timeout: 10000 })
  await firstDigit.click()
  await page.keyboard.type(pin, { delay: 50 })
}

/**
 * Login as admin: navigates to login, enters PIN.
 * Since we can't preload encrypted key from Node.js (incompatible crypto),
 * we use the nsec recovery flow for initial login in tests.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Check if PIN input is available (stored key exists)
  const pinInput = page.locator('input[aria-label="PIN or passphrase"]')
  const hasPinInput = await pinInput.isVisible({ timeout: 3000 }).catch(() => false)

  if (hasPinInput) {
    await enterPin(page, TEST_PIN)
  } else {
    // No stored key — use nsec recovery flow
    // Look for recovery/nsec input toggle
    const recoveryBtn = page.getByRole('button', { name: /recover|nsec|secret key/i })
    const hasRecovery = await recoveryBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasRecovery) await recoveryBtn.click()

    const nsecInput = page.locator('input[type="password"], textarea').first()
    await nsecInput.waitFor({ state: 'visible', timeout: 5000 })
    await nsecInput.fill(ADMIN_NSEC)
    await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
  }

  // Wait for authenticated state
  await page.waitForURL(url => {
    const path = new URL(url).pathname
    return path === '/' || path === '/profile-setup'
  }, { timeout: Timeouts.AUTH })

  // Handle profile setup if needed
  if (page.url().includes('profile-setup')) {
    const completeBtn = page.getByRole('button', { name: /complete|continue|save/i })
    await completeBtn.waitFor({ state: 'visible', timeout: 5000 })
    await completeBtn.click()
    await page.waitForURL('/', { timeout: Timeouts.NAVIGATION })
  }

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: Timeouts.AUTH })
}

export async function navigateAfterLogin(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(Timeouts.ASYNC_SETTLE)
}

export function uniquePhone(): string {
  return `+1555${Date.now().toString().slice(-7)}`
}

export async function resetTestState(request: APIRequestContext) {
  const res = await request.post('/api/test-reset')
  if (!res.ok()) throw new Error(`test-reset failed: ${res.status()}`)
}
