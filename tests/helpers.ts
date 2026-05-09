import { type Page, type APIRequestContext, expect } from '@playwright/test'
import { TestIds, navTestIdMap } from './test-ids'

export const ADMIN_SEED = 'f54a5851e9372b87810a8e60cdd2e7cfd80b6e31c7af18188f7db106ceda8be7'
export const ADMIN_NSEC = ADMIN_SEED
export const TEST_PIN = '12345678'

export const Timeouts = {
  NAVIGATION: 10000,
  API: 15000,
  ELEMENT: 10000,
  AUTH: 45000,
} as const

export { TestIds, navTestIdMap } from './test-ids'
export * from './pages/index'

export async function enterPin(page: Page, pin: string) {
  const pinInput = page.getByTestId('pin-input').locator('input')
  await pinInput.waitFor({ state: 'visible', timeout: 10000 })
  await pinInput.fill(pin)
  await pinInput.press('Enter')
}

export async function navigateAfterLogin(page: Page, url: string, expectAccessDenied = false): Promise<void> {
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

  if (expectAccessDenied) {
    await expect(page.getByText('Access Denied', { exact: true })).toBeVisible({ timeout: Timeouts.ELEMENT })
  } else {
    await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
  }
}

export async function reenterPinAfterReload(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  const pinInput = page.getByTestId('pin-input').locator('input')
  try {
    await pinInput.waitFor({ state: 'visible', timeout: Timeouts.ELEMENT })
    await enterPin(page, TEST_PIN)
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: Timeouts.AUTH })
  } catch {
  }
}



type StorageState = { origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> } | null

async function loadAdminStorageState(): Promise<StorageState> {
  try {
    const fs = await import('fs/promises')
    const content = await fs.readFile('tests/storage/admin.json', 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function clearAuthStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('llamenos:llamenos-encrypted-device-keys')
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    localStorage.removeItem('llamenos-encrypted-key')
  })
}

async function importAndUnlockAdminKey(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })
  await page.evaluate(async ({ secretHex, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const encrypted = await platform.deviceImportAndLoad(secretHex, pin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, pin)
    await platform.lockCrypto()
  }, { secretHex: ADMIN_SEED, pin: TEST_PIN })
}

async function waitForAuthenticated(page: Page): Promise<void> {
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
  const viewport = page.viewportSize()
  const isMobile = viewport ? viewport.width < 768 : false
  if (isMobile) {
    await page.getByRole('button', { name: /open menu/i }).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  } else {
    await page.getByTestId(TestIds.NAV_ADMIN_SECTION).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
  }
}

export async function loginAsAdmin(page: Page) {
  const storageState = await loadAdminStorageState()

  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  let usingLegacy = false

  if (storageState) {
    await page.evaluate((state) => {
      sessionStorage.clear()
      localStorage.clear()
      for (const origin of state.origins || []) {
        for (const item of origin.localStorage || []) {
          localStorage.setItem(item.name, item.value)
        }
      }
    }, storageState)

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await enterPin(page, TEST_PIN)

    if (page.url().includes('/login')) {
      usingLegacy = true
      await clearAuthStorage(page)
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
    }
  } else {
    usingLegacy = true
  }

  if (usingLegacy) {
    await clearAuthStorage(page)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await importAndUnlockAdminKey(page)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await enterPin(page, TEST_PIN)
  }

  await waitForAuthenticated(page)
}

export async function loginAsVolunteer(page: Page, seedHex: string) {
  await page.goto('/login')
  await clearAuthStorage(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForFunction(() => !!(window as any).__TEST_PLATFORM, { timeout: 10000 })

  await page.evaluate(async ({ secretHex, pin }) => {
    const platform = (window as any).__TEST_PLATFORM
    const encrypted = await platform.deviceImportAndLoad(secretHex, pin, crypto.randomUUID())
    await platform.persistAndUnlockDeviceKeys(encrypted, pin)
    await platform.lockCrypto()
  }, { secretHex: seedHex, pin: TEST_PIN })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await enterPin(page, TEST_PIN)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: Timeouts.AUTH })

  const profileSetupBtn = page.getByRole('button', { name: /complete setup/i })
  const sidebar = page.getByTestId(TestIds.NAV_SIDEBAR)
  const landedOnProfileSetup = await Promise.race([
    profileSetupBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
    sidebar.waitFor({ state: 'visible', timeout: 5000 }).then(() => false),
  ]).catch(() => false)

  if (landedOnProfileSetup) {
    await completeProfileSetup(page)
  }

  await page.getByTestId(TestIds.NAV_SIDEBAR).waitFor({ state: 'visible', timeout: Timeouts.AUTH })
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
  return `+1212${suffix}`
}

export async function fillCallId(page: Page, callId: string): Promise<void> {
  const callIdInput = page.getByTestId('note-call-id')
  const callIdSelect = page.getByTestId('call-id-select')
  const isInput = await callIdInput.isVisible({ timeout: 3000 }).catch(() => false)
  if (isInput) {
    await callIdInput.fill(callId)
    return
  }
  const isSelect = await callIdSelect.isVisible({ timeout: 2000 }).catch(() => false)
  if (isSelect) {
    await callIdSelect.click()
    await page.getByRole('option', { name: /enter manually/i }).click()
    await callIdInput.fill(callId)
    return
  }
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
