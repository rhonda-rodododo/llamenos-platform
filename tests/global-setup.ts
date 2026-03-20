import type { FullConfig } from '@playwright/test'

const BACKEND_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

/**
 * Global setup: verify backend is reachable before running tests.
 * Hits GET /api/config (no auth, no side effects) as a health check.
 * Retries up to 10 times with 2-second delays.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`)
      if (res.ok) return
    } catch {
      // Server not ready yet — retry
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(
    `Backend not ready after 10 attempts. Is the server running at ${BACKEND_URL}?`
  )
}
