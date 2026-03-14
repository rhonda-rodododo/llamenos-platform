/**
 * Before hooks for BDD scenario isolation.
 *
 * @resets-state: resets server state before the scenario runs.
 * Use on scenarios that mutate global settings (setup wizard,
 * demo mode toggle, CMS enable/disable).
 */
import { Before } from '../fixtures'

const TEST_RESET_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'
const BACKEND_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

Before({ tags: '@resets-state' }, async ({ page }) => {
  try {
    await page.request.post(`${BACKEND_URL}/api/test-reset`, {
      headers: { 'X-Test-Secret': TEST_RESET_SECRET },
    })
  } catch {
    // Server may not be ready — scenario will fail on its own if so
  }
})
