import { type Page, type APIRequestContext, expect } from '@playwright/test'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { getPublicKey, nip19 } from 'nostr-tools'

export const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'
export const TEST_PIN = '123456'

/**
 * Pre-compute an encrypted key blob in Node.js (Playwright runtime) and inject
 * it into the browser's localStorage. Uses the same PBKDF2 + XChaCha20-Poly1305
 * format as key-store.ts so the app can decrypt it with the test PIN.
 */
async function preloadEncryptedKey(page: Page, nsec: string, pin: string): Promise<void> {
  const encoder = new TextEncoder()
  const pinBytes = encoder.encode(pin)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey('raw', pinBytes, 'PBKDF2', false, ['deriveBits'])
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
    keyMaterial,
    256,
  )
  const kek = new Uint8Array(derivedBits)

  const nonce = crypto.getRandomValues(new Uint8Array(24))
  const cipher = xchacha20poly1305(kek, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(nsec))

  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  const pubkey = getPublicKey(decoded.data)
  const hashInput = encoder.encode(`llamenos:keyid:${pubkey}`)
  const pubkeyHashBuf = await crypto.subtle.digest('SHA-256', hashInput)
  const pubkeyHash = bytesToHex(new Uint8Array(pubkeyHashBuf)).slice(0, 16)

  const data = {
    salt: bytesToHex(salt),
    iterations: 600_000,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    pubkey: pubkeyHash,
  }

  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'llamenos-encrypted-key', value: JSON.stringify(data) },
  )
}

/**
 * Enter a PIN into the PinInput component.
 * Uses keyboard typing since the component auto-advances focus on each digit.
 */
export async function enterPin(page: Page, pin: string) {
  // Focus the first PIN digit input
  const firstDigit = page.locator('input[aria-label="PIN digit 1"]')
  await firstDigit.waitFor({ state: 'visible', timeout: 10000 })
  await firstDigit.click()
  // Type each digit — PinInput handles focus advance automatically
  await page.keyboard.type(pin, { delay: 50 })
}

/**
 * Navigate to a URL after the user has already logged in.
 * Full page loads clear the in-memory keyManager, so this logs in first,
 * waits for the authenticated layout to fully render (sidebar visible),
 * then uses TanStack Router's navigate() for SPA navigation to the target.
 */
export async function navigateAfterLogin(page: Page, url: string): Promise<void> {
  // Always start from /login to get a clean auth flow
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  const pinVisible = await pinInput.isVisible({ timeout: 5000 }).catch(() => false)

  if (pinVisible) {
    await enterPin(page, TEST_PIN)
  }

  // Wait for the authenticated layout — sidebar nav link confirms auth is fully settled
  await page.getByRole('link', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 15000 })

  // Now use router.navigate for SPA navigation (no page reload)
  const parsed = new URL(url, 'http://localhost')
  const path = parsed.pathname + parsed.search
  await page.evaluate((p) => {
    const router = (window as any).__TEST_ROUTER
    if (router) router.navigate({ to: p })
  }, path)
  await page.waitForURL(u => u.toString().includes(parsed.pathname), { timeout: 10000 })
  // Wait for the route component to render
  await page.waitForTimeout(500)
}

/**
 * Re-enter PIN after a page.reload() when user is already authenticated.
 * The reload clears keyManager, so the encrypted key in localStorage triggers
 * the PIN screen. After entering PIN the app redirects to /.
 * If currentPath is provided, the helper then navigates back to that path
 * via the sidebar or page.goto as appropriate.
 */
export async function reenterPinAfterReload(page: Page): Promise<void> {
  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  const pinVisible = await pinInput.isVisible({ timeout: 3000 }).catch(() => false)

  if (pinVisible) {
    await enterPin(page, TEST_PIN)
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 15000 })
  }
}

/**
 * Login as admin: pre-loads encrypted key into localStorage, then enters PIN.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await preloadEncryptedKey(page, ADMIN_NSEC, TEST_PIN)
  await page.reload()
  await enterPin(page, TEST_PIN)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
}

/**
 * Login as volunteer: pre-loads encrypted key into localStorage, then enters PIN.
 */
export async function loginAsVolunteer(page: Page, nsec: string) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await preloadEncryptedKey(page, nsec, TEST_PIN)
  await page.reload()
  await enterPin(page, TEST_PIN)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(500)
}

/**
 * Login using direct nsec entry (recovery path).
 * Useful for first-time login tests when no stored key exists.
 */
export async function loginWithNsec(page: Page, nsec: string) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await page.locator('#nsec').fill(nsec)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 })
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
}

export async function createVolunteerAndGetNsec(page: Page, name: string, phone: string): Promise<string> {
  await page.getByRole('link', { name: 'Volunteers' }).click()
  await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

  await page.getByRole('button', { name: /add volunteer/i }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByRole('button', { name: /save/i }).click()

  await expect(page.locator('code').first()).toBeVisible({ timeout: 15000 })
  const nsec = await page.locator('code').first().textContent()
  if (!nsec) throw new Error('Failed to get nsec')
  return nsec
}

export async function completeProfileSetup(page: Page) {
  if (page.url().includes('profile-setup')) {
    await page.getByRole('button', { name: /complete setup/i }).click()
    await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: 15000 })
  }
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })
}

export function uniquePhone(): string {
  const suffix = Date.now().toString().slice(-7)
  return `+1555${suffix}`
}

export async function resetTestState(request: APIRequestContext) {
  await request.post('/api/test-reset')
}
