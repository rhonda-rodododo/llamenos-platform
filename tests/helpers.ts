import { type Page, type APIRequestContext, expect } from '@playwright/test'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { getPublicKey, nip19 } from 'nostr-tools'
import { TestIds, navTestIdMap } from './test-ids'

export const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'
export const TEST_PIN = '123456'

/**
 * Default timeout values for common operations.
 * Centralized here for easy tuning during test optimization.
 */
export const Timeouts = {
  /** Time to wait for page navigation */
  NAVIGATION: 10000,
  /** Time to wait for API responses */
  API: 15000,
  /** Time to wait for elements to appear */
  ELEMENT: 10000,
  /** Time to wait for auth-related operations (includes PBKDF2 600K iterations) */
  AUTH: 45000,
} as const

// Re-export TestIds for convenience
export { TestIds, navTestIdMap } from './test-ids'

// Re-export page object utilities
export * from './pages/index'

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

  // Write to BOTH locations:
  // - Legacy localStorage key (in case any test helper reads it directly)
  // - Mock Tauri Store key (what platform.ts reads via mock Store)
  await page.evaluate(
    ({ legacyKey, storeKey, value }) => {
      localStorage.setItem(legacyKey, value)
      localStorage.setItem(storeKey, value)
    },
    {
      legacyKey: 'llamenos-encrypted-key',
      storeKey: 'tauri-store:keys.json:llamenos-encrypted-key',
      value: JSON.stringify(data),
    },
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
  // Type each digit — PinInput auto-advances focus on each keystroke
  for (const digit of pin) {
    await page.keyboard.type(digit)
  }
  // PinInput has 8 fields but minLength is 6 — if PIN is shorter than 8 digits,
  // press Enter to trigger onComplete (auto-complete only fires at exactly 8 digits)
  await page.keyboard.press('Enter')
  // Wait for onComplete callback to fire and unlock to process
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
}

/**
 * Navigate to a URL after the user has already logged in.
 * If already authenticated (sidebar visible), does SPA navigation directly.
 * Otherwise, re-authenticates via PIN entry first.
 */
export async function navigateAfterLogin(page: Page, url: string): Promise<void> {
  // Check if we're already authenticated (sidebar visible)
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const isAuthenticated = await sidebar.isVisible({ timeout: 1000 }).catch(() => false)

  if (!isAuthenticated) {
    // Need to re-authenticate — full page load clears in-memory keyManager
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const pinInput = page.locator('input[aria-label="PIN digit 1"]')
    const pinVisible = await pinInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (pinVisible) {
      await enterPin(page, TEST_PIN)
    }

    // Wait for the authenticated layout
    await sidebar.waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  }

  // SPA navigation via TanStack Router (no page reload, keeps auth state)
  const parsed = new URL(url, 'http://localhost')
  const searchParams = Object.fromEntries(parsed.searchParams.entries())
  await page.evaluate(({ pathname, search }) => {
    const router = (window as any).__TEST_ROUTER
    if (!router) return
    if (Object.keys(search).length > 0) {
      router.navigate({ to: pathname, search })
    } else {
      router.navigate({ to: pathname })
    }
  }, { pathname: parsed.pathname, search: searchParams })
  await page.waitForURL(u => u.toString().includes(parsed.pathname), { timeout: Timeouts.NAVIGATION })

  // Wait for route component to mount and render the page title
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
}

/**
 * Re-enter PIN after a page.reload() when user is already authenticated.
 * The reload clears keyManager, so the encrypted key in localStorage triggers
 * the PIN screen. After entering PIN the app redirects to /.
 * If currentPath is provided, the helper then navigates back to that path
 * via the sidebar or page.goto as appropriate.
 */
export async function reenterPinAfterReload(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  const pinInput = page.locator('input[aria-label="PIN digit 1"]')
  // Use waitFor to actually wait for the PIN input to render after reload.
  // isVisible() is an instant snapshot and returns false if DOM hasn't rendered yet.
  try {
    await pinInput.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
    await enterPin(page, TEST_PIN)
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: Timeouts.AUTH })
  } catch {
    // PIN screen didn't appear — may already be authenticated
  }
}

/**
 * Login as admin: uses the app's own platform layer to encrypt/store the key,
 * then enters PIN to unlock. Both encrypt and decrypt happen in the same browser
 * context, avoiding any Node.js-vs-browser crypto mismatch.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.clear()
    // Browser store uses 'llamenos:' prefix — clear the correct key
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    // Legacy/Tauri keys — clear for safety
    localStorage.removeItem('llamenos-encrypted-key')
    localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-key')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for __TEST_PLATFORM to be loaded (set asynchronously in main.tsx)
  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })

  // Use the app's own platform layer (which routes through the Tauri IPC mock)
  // to encrypt and store the key. This ensures encrypt and decrypt use the same
  // crypto implementation (browser-side @noble/ciphers).
  await page.evaluate(async ({ nsec, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const kp = await platform.keyPairFromNsec(nsec)
    if (!kp) throw new Error('Failed to parse admin nsec')
    await platform.encryptWithPin(nsec, pin, kp.publicKey)
    await platform.lockCrypto()
  }, { nsec: ADMIN_NSEC, pin: TEST_PIN })

  // Reload to trigger PIN screen — the encrypted key persists in localStorage
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await enterPin(page, TEST_PIN)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
  // Wait for admin section in sidebar — confirms getMe() completed and permissions are set.
  // Without this, the brief window between isKeyUnlocked=true (onUnlock fires synchronously)
  // and getMe() completing (async) can cause isAdmin=false on the first admin-only route.
  await expect(page.getByTestId(TestIds.NAV_ADMIN_SECTION)).toBeVisible({ timeout: Timeouts.AUTH })
}

/**
 * Login as user (volunteer): uses the app's own platform layer to encrypt/store the key,
 * then enters PIN to unlock. Both encrypt and decrypt happen in the same browser
 * context, avoiding any Node.js-vs-browser crypto mismatch.
 */
export async function loginAsVolunteer(page: Page, nsec: string) {
  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.clear()
    // Browser store uses 'llamenos:' prefix — clear the correct key
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    // Legacy/Tauri keys — clear for safety
    localStorage.removeItem('llamenos-encrypted-key')
    localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-key')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for __TEST_PLATFORM to be loaded
  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })

  // Encrypt and store via the browser's platform layer (same context as decrypt)
  await page.evaluate(async ({ nsec, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const kp = await platform.keyPairFromNsec(nsec)
    if (!kp) throw new Error('Failed to parse user nsec')
    await platform.encryptWithPin(nsec, pin, kp.publicKey)
    await platform.lockCrypto()
  }, { nsec, pin: TEST_PIN })

  // Reload to trigger PIN screen
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await enterPin(page, TEST_PIN)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })

  // New users land on /profile-setup — complete it to get to the main app
  if (page.url().includes('profile-setup')) {
    await completeProfileSetup(page)
  }

  // Wait for the authenticated layout to be visible
  await page.getByTestId(TestIds.NAV_SIDEBAR).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
}

/**
 * Login using direct nsec entry (recovery path).
 * Useful for first-time login tests when no stored key exists.
 */
export async function loginWithNsec(page: Page, nsec: string) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await page.getByTestId(TestIds.NSEC_INPUT).fill(nsec)
  await page.getByTestId(TestIds.LOGIN_SUBMIT_BTN).click()
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 })
}

export async function logout(page: Page) {
  await page.getByTestId(TestIds.LOGOUT_BTN).click()
}

export async function createUserAndGetNsec(page: Page, name: string, phone: string): Promise<string> {
  await page.getByTestId(TestIds.NAV_VOLUNTEERS).click()
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible()

  await page.getByTestId(TestIds.VOLUNTEER_ADD_BTN).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Phone Number').fill(phone)
  await page.getByLabel('Phone Number').blur()
  await page.getByTestId(TestIds.FORM_SAVE_BTN).click()

  const nsecCode = page.getByTestId(TestIds.VOLUNTEER_NSEC_CODE)
  await expect(nsecCode).toBeVisible({ timeout: Timeouts.API })
  const nsec = await nsecCode.textContent()
  if (!nsec) throw new Error('Failed to get nsec')
  return nsec
}

/** @deprecated Use createUserAndGetNsec instead */
export const createVolunteerAndGetNsec = createUserAndGetNsec

/** Dismiss the nsec card shown after volunteer creation. */
export async function dismissNsecCard(page: Page): Promise<void> {
  await page.getByTestId('dismiss-nsec').click()
  await expect(page.getByTestId('dismiss-nsec')).not.toBeVisible()
}

export async function completeProfileSetup(page: Page) {
  if (page.url().includes('profile-setup')) {
    const completeBtn = page.getByRole('button', { name: /complete setup/i })
    await completeBtn.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
    await completeBtn.click()
    await page.waitForURL(u => !u.toString().includes('profile-setup'), { timeout: Timeouts.AUTH })
  }
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
}

export function uniquePhone(): string {
  const suffix = Date.now().toString().slice(-7)
  return `+1555${suffix}`
}

const TEST_RESET_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'

export async function resetTestState(request: APIRequestContext) {
  const res = await request.post('/api/test-reset', {
    headers: { 'X-Test-Secret': TEST_RESET_SECRET },
  })
  if (!res.ok()) {
    throw new Error(`test-reset failed with status ${res.status()}: ${await res.text()}`)
  }
}
