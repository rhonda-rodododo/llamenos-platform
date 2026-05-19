/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Page, type APIRequestContext, expect } from '@playwright/test'
import { TestIds } from './test-ids'

export const ADMIN_SEED = 'f54a5851e9372b87810a8e60cdd2e7cfd80b6e31c7af18188f7db106ceda8be7'
/** @deprecated Use ADMIN_SEED */
export const ADMIN_NSEC = ADMIN_SEED
export const TEST_PIN = '12345678'

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
  /** Time to wait for auth-related operations (includes PBKDF2 600K iterations).
   *  CI containers have limited CPU which makes PBKDF2 significantly slower. */
  AUTH: 55000,
} as const

// Re-export TestIds for convenience
export { TestIds, navTestIdMap } from './test-ids'

// Re-export page object utilities
export * from './pages/index'

/**
 * Enter a PIN into the PinInput component.
 * The PinInput is a single password input field.
 *
 * Uses clear + type() instead of fill() to ensure React processes each keystroke
 * and updates component state before we press Enter. With fill(), React may not
 * have committed the state update by the time Enter fires, causing the
 * handleKeyDown closure to see the old (empty) value and skip onComplete.
 *
 * After typing, we verify the input value matches expectations before pressing
 * Enter to trigger onComplete.
 */
export async function enterPin(page: Page, pin: string) {
  const pinInput = page.getByTestId('pin-input').locator('input')
  await pinInput.waitFor({ state: 'visible', timeout: 10000 })
  await pinInput.clear()
  await pinInput.pressSequentially(pin, { delay: 10 })
  // Verify React state has caught up before pressing Enter
  await expect(pinInput).toHaveValue(pin, { timeout: 5000 })
  await pinInput.press('Enter')
}

/**
 * Navigate to a URL after the user has already logged in.
 * If already authenticated (sidebar visible), does SPA navigation directly.
 * Otherwise, re-authenticates via PIN entry first.
 *
 * @param expectAccessDenied - Pass true when the destination is a restricted page
 *   that should render "Access Denied" for the current user (no page-title testid).
 *   By default, the helper asserts that page-title is visible — which catches bugs
 *   where a page silently renders an access-denied response it shouldn't.
 */
export async function navigateAfterLogin(page: Page, url: string, expectAccessDenied = false): Promise<void> {
  // Check if we're already authenticated (sidebar visible)
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const isAuthenticated = await sidebar.isVisible({ timeout: 1000 }).catch(() => false)

  if (!isAuthenticated) {
    // Need to re-authenticate — full page load clears in-memory keyManager
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const pinInput = page.getByTestId('pin-input').locator('input')
    const pinVisible = await pinInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (pinVisible) {
      await enterPin(page, TEST_PIN)
    }

    // Wait for the authenticated layout
    await sidebar.waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  }

  // Wait for ConfigProvider to set the active hub — prevents race condition where
  // page components fire data-fetching useEffects before activeHubId is set.
  // In CI with Docker backend, getConfig() takes longer, making this race likely.
  await page.waitForFunction(() => {
    const getHub = (window as any).__TEST_GET_ACTIVE_HUB
    return getHub ? !!getHub() : false
  }, { timeout: Timeouts.AUTH }).catch(() => {
    // If __TEST_GET_ACTIVE_HUB isn't available, continue — will work locally
  })

  // SPA navigation via TanStack Router (no page reload, keeps auth state)
  const parsed = new URL(url, 'http://localhost')
  const searchParams = Object.fromEntries(parsed.searchParams.entries())

  // Wait for the router to be available (may take a moment after login in CI)
  await page.waitForFunction(() => !!(window as any).__TEST_ROUTER, { timeout: 10000 })

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

  // Wait for route component to mount.
  if (expectAccessDenied) {
    // Restricted page — assert "Access Denied" is shown (no page-title testid on these pages).
    await expect(page.getByText('Access Denied', { exact: true })).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    // Normal page — assert a heading is visible. Admin section pages use
    // 'admin-section-heading' instead of 'page-title', so check both.
    await expect(
      page.getByTestId(TestIds.PAGE_TITLE).or(page.getByTestId('admin-section-heading'))
    ).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
}

/**
 * Navigate via SPA without asserting page-title or access-denied.
 * Useful for steps that navigate to a page and then assert the result
 * in a subsequent step (e.g., volunteer navigating to a restricted page).
 */
export async function navigateViaSpa(page: Page, url: string): Promise<void> {
  // Check if we're already authenticated (sidebar visible)
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const isAuthenticated = await sidebar.isVisible({ timeout: 1000 }).catch(() => false)

  if (!isAuthenticated) {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const pinInput = page.getByTestId('pin-input').locator('input')
    const pinVisible = await pinInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (pinVisible) {
      await enterPin(page, TEST_PIN)
    }

    await sidebar.waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  }

  // Wait for ConfigProvider to set the active hub — prevents race condition where
  // page components fire data-fetching useEffects before activeHubId is set.
  // In CI with Docker backend, getConfig() takes longer, making this race likely.
  await page.waitForFunction(() => {
    const getHub = (window as any).__TEST_GET_ACTIVE_HUB
    return getHub ? !!getHub() : false
  }, { timeout: Timeouts.AUTH }).catch(() => {
    // If __TEST_GET_ACTIVE_HUB isn't available, continue — will work locally
  })

  // SPA navigation via TanStack Router
  const parsed = new URL(url, 'http://localhost')
  const searchParams = Object.fromEntries(parsed.searchParams.entries())

  // Wait for the router to be available (may take a moment after login in CI)
  await page.waitForFunction(() => !!(window as any).__TEST_ROUTER, { timeout: 10000 })

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

  // Wait briefly for route component to mount without asserting specific content
  await page.waitForLoadState('domcontentloaded')
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
  const pinInput = page.getByTestId('pin-input').locator('input')
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
 * Login as admin: imports the legacy secp256k1 nsec via the IPC mock,
 * persists to store, then enters PIN to unlock. Uses Schnorr auth
 * (backward-compatible with the bootstrap flow).
 */
export async function loginAsAdmin(page: Page) {
  // Always use ADMIN_SEED deterministic keys. The bootstrap project saves
  // admin.json with random keys generated during UI bootstrap, but resetTestState()
  // in bootstrap's afterAll re-seeds admin from ADMIN_PUBKEY (= ADMIN_SEED's pubkey).
  // Attempting admin.json first poisons the browser with 401 responses from the stale
  // keys — those delayed 401s trigger onAuthExpired AFTER the ADMIN_SEED fallback
  // succeeds, causing mid-test auth loss and redirect to /login.
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Reset PIN lockout counter to prevent accumulation across serial tests.
  await page.evaluate(() => {
    localStorage.removeItem('__test_pin_lockout_state')
    sessionStorage.clear()
    localStorage.clear()
  })
  await page.context().clearCookies()
  await page.evaluate(async () => {
    const dbs = await window.indexedDB.databases?.().catch(() => [] as Array<{ name?: string }>) ?? []
    for (const db of dbs) {
      if (db.name) window.indexedDB.deleteDatabase(db.name)
    }
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })

  const secretHex = ADMIN_SEED
  await page.evaluate(async ({ secretHex, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const encrypted = await platform.deviceImportAndLoad(secretHex, pin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, pin)
    await platform.lockCrypto()
  }, { secretHex, pin: TEST_PIN })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await enterPin(page, TEST_PIN)

  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })
  // Ensure hub context is ready before asserting page content — prevents race
  // where components fetch data before ConfigProvider sets activeHubId.
  await page.waitForFunction(() => {
    const getHub = (window as any).__TEST_GET_ACTIVE_HUB
    return getHub ? !!getHub() : false
  }, { timeout: 15000 }).catch(() => {})
  // Wait for the authenticated layout — use longer timeout for CI (PBKDF2 + Docker overhead)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
  // Wait for admin section in sidebar or hamburger button (mobile) — confirms getMe() completed.
  const viewport = page.viewportSize()
  const isMobile = viewport ? viewport.width < 768 : false
  if (isMobile) {
    await page.getByRole('button', { name: /open menu/i }).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  } else {
    await page.getByTestId(TestIds.NAV_ADMIN_SECTION).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  }
  // Ensure network has settled so subsequent navigation doesn't race with auth API calls
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}

/**
 * Login as user (volunteer): imports key material via IPC mock,
 * persists to store, then enters PIN to unlock.
 *
 * Accepts a raw Ed25519 signing seed hex string (as returned by createUserViaApi).
 */
export async function loginAsVolunteer(page: Page, seedHex: string) {
  const secretHex = seedHex

  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('llamenos:llamenos-encrypted-device-keys')
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    localStorage.removeItem('llamenos-encrypted-key')
    // Reset PIN lockout counter to prevent accumulation across serial tests
    localStorage.removeItem('__test_pin_lockout_state')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for __TEST_PLATFORM to be loaded
  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })

  // Import Ed25519 seed (volunteers created via API use Ed25519, not legacy secp256k1)
  await page.evaluate(async ({ secretHex, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const encrypted = await platform.deviceImportAndLoad(secretHex, pin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, pin)
    await platform.lockCrypto()
  }, { secretHex, pin: TEST_PIN })

  // Reload to trigger PIN screen
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await enterPin(page, TEST_PIN)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })
  // Ensure hub context is ready before asserting page content — prevents race
  // where components fetch data before ConfigProvider sets activeHubId.
  await page.waitForFunction(() => {
    const getHub = (window as any).__TEST_GET_ACTIVE_HUB
    return getHub ? !!getHub() : false
  }, { timeout: 15000 }).catch(() => {})

  // New users land on /profile-setup — detect and handle
  const profileSetupBtn = page.getByRole('button', { name: /complete setup/i })
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const landedOnProfileSetup = await Promise.race([
    profileSetupBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
    sidebar.waitFor({ state: 'visible', timeout: 5000 }).then(() => false),
  ]).catch(() => false)

  if (landedOnProfileSetup) {
    await completeProfileSetup(page)
  }

  // Wait for the authenticated layout to be visible
  await page.getByTestId(TestIds.NAV_SIDEBAR).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
}

export async function logout(page: Page) {
  await page.getByTestId(TestIds.LOGOUT_BTN).click()
}

/**
 * Create a volunteer via UI and return the raw Ed25519 seed hex for login.
 *
 * The displayed nsec (bech32 "nsec1...") is only for user display. Internally,
 * the volunteer was created with an Ed25519 keypair. We return the raw seedHex
 * so that `loginAsVolunteer` uses `deviceImportAndLoad` (Ed25519), not
 * `legacyImportNsec` (secp256k1), which would derive a different pubkey and
 * break auth.
 *
 * The seedHex is stored in `window.__last_vol_seed_hex` by users.tsx after
 * calling generateEphemeralKeypair().
 */
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

  // Try to get the raw Ed25519 seedHex from window state (set by users.tsx).
  // If available, return it so loginAsVolunteer uses deviceImportAndLoad (Ed25519).
  // If not available (e.g., pre-test reload), fall back to bech32 nsec from DOM.
  const seedHex = await page.evaluate(
    () => (window as Record<string, unknown>).__last_vol_seed_hex as string | undefined,
  )
  if (seedHex && /^[0-9a-f]{64}$/.test(seedHex)) {
    return seedHex
  }

  const nsec = await nsecCode.textContent()
  if (!nsec) throw new Error('Failed to get nsec')
  return nsec
}

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
  // Use 212 (NYC) area code — 555 numbers fail libphonenumber-js validation
  const suffix = Date.now().toString().slice(-7)
  return `+1212${suffix}`
}

/**
 * Fill in the call ID field in the new note form.
 * Handles both modes: Input (when no recent calls) and Select (when recent calls exist).
 * In Select mode, selects the "Enter manually" option then fills the manual input.
 */
export async function fillCallId(page: Page, callId: string): Promise<void> {
  const callIdInput = page.getByTestId('note-call-id')
  const callIdSelect = page.getByTestId('call-id-select')
  const isInput = await callIdInput.isVisible({ timeout: 3000 }).catch(() => false)
  if (isInput) {
    await callIdInput.fill(callId)
    return
  }
  // Select mode: choose "Enter manually" then fill
  const isSelect = await callIdSelect.isVisible({ timeout: 2000 }).catch(() => false)
  if (isSelect) {
    await callIdSelect.click()
    await page.getByRole('option', { name: /enter manually/i }).click()
    await callIdInput.fill(callId)
    return
  }
  // Last resort: try the input by id
  await page.locator('#call-id').fill(callId)
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

/**
 * Mock /api/config to include a hub, ensuring currentHubId is set in ConfigProvider.
 * Must be called BEFORE loginAsAdmin() since login loads the page which fetches config.
 * Tests that depend on hub-scoped routes (hub-communications, etc.) need this.
 */
export async function mockConfigWithHub(page: Page, hubId = 'test-hub-1'): Promise<void> {
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hotlineName: 'Test Hotline',
        hotlineNumber: '+15551234567',
        channels: { voice: true, sms: true, whatsapp: false, signal: true, rcs: false, telegram: false, reports: true },
        setupCompleted: true,
        demoMode: false,
        demoResetSchedule: null,
        needsBootstrap: false,
        hubs: [{ id: hubId, name: 'Test Hub', slug: 'test-hub', description: '', status: 'active', createdBy: 'test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
        defaultHubId: hubId,
        serverPubkey: 'bfaca2c5f99ed9d65db5f522a68820c458ae9ccfe00327c64bc66ccde06e5703',
        wsRelayUrl: '/ws',
        apiVersion: 1,
        minApiVersion: 1,
      }),
    })
  })
}
