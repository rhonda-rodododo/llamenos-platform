import type { FullConfig } from '@playwright/test'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const BACKEND_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

/**
 * Load E2E_TEST_SECRET from .dev.vars if not already set in the environment.
 * This lets the test reset work out-of-the-box for local dev without extra env setup.
 */
function loadDevVarsSecret(): string | undefined {
  // Check process env first (CI sets E2E_TEST_SECRET or DEV_RESET_SECRET)
  if (process.env.E2E_TEST_SECRET) return process.env.E2E_TEST_SECRET
  if (process.env.DEV_RESET_SECRET) return process.env.DEV_RESET_SECRET
  // Fall back to reading from .dev.vars (local dev — dev-bun.sh sets DEV_RESET_SECRET)
  try {
    const devVarsPath = resolve(process.cwd(), '.dev.vars')
    const content = readFileSync(devVarsPath, 'utf-8')
    const match = content.match(/^(?:E2E_TEST_SECRET|DEV_RESET_SECRET)=(.+)$/m)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

// Admin Ed25519 seed — must match tests/api-helpers.ts ADMIN_SEED
const ADMIN_SEED = 'f54a5851e9372b87810a8e60cdd2e7cfd80b6e31c7af18188f7db106ceda8be7'

function makeBootstrapToken(seedHex: string, method: string, path: string) {
  const seedBytes = hexToBytes(seedHex)
  const pubkey = bytesToHex(ed25519.getPublicKey(seedBytes))
  const timestamp = Date.now()
  const message = utf8ToBytes(`${LABEL_DEVICE_AUTH}:${pubkey}:${timestamp}:${method}:${path}`)
  const sig = ed25519.sign(message, seedBytes)
  return { pubkey, timestamp, token: bytesToHex(sig) }
}

/**
 * Reset all server state (test databases only).
 * Requires E2E_TEST_SECRET in .dev.vars (server side) and readable from .dev.vars or env.
 */
async function resetTestState(baseUrl: string): Promise<void> {
  const secret = loadDevVarsSecret()
  if (!secret) return // No secret configured — skip reset
  const res = await fetch(`${baseUrl}/api/test-reset`, {
    method: 'POST',
    headers: { 'X-Test-Secret': secret },
  })
  // 403 = server not configured with secret (skip gracefully)
  if (res.status === 403 || res.status === 404) return
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Test reset failed: ${res.status} ${text}`)
  }
}

/**
 * Bootstrap the admin user if not already created.
 * The bootstrap endpoint is a one-shot operation — if admin exists (403), skip silently.
 */
async function bootstrapAdmin(baseUrl: string): Promise<void> {
  const path = '/api/auth/bootstrap'
  const body = makeBootstrapToken(ADMIN_SEED, 'POST', path)
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // 200 = just created, 403 = already exists (both are fine)
  if (res.status !== 200 && res.status !== 403) {
    const text = await res.text()
    throw new Error(`Admin bootstrap failed: ${res.status} ${text}`)
  }
}

/**
 * Global setup: verify backend is reachable before running tests,
 * reset state (if E2E_TEST_SECRET is set), then bootstrap the admin user.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  // CI with Docker Compose can take 30-60s for the app to be ready.
  // 30 attempts × 3s = 90s max wait, which covers slow CI startups.
  const maxAttempts = process.env.CI ? 30 : 10
  const retryDelayMs = process.env.CI ? 3000 : 2000

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`)
      if (res.ok) {
        await resetTestState(BACKEND_URL)
        await bootstrapAdmin(BACKEND_URL)
        return
      }
      // Non-OK response (e.g. 503 during startup) — retry
      if (i % 5 === 4) {
        console.log(`[global-setup] Backend returned ${res.status}, retrying... (${i + 1}/${maxAttempts})`)
      }
    } catch {
      // Server not ready yet — retry
      if (i % 5 === 4) {
        console.log(`[global-setup] Backend not reachable, retrying... (${i + 1}/${maxAttempts})`)
      }
    }
    await new Promise(r => setTimeout(r, retryDelayMs))
  }
  throw new Error(
    `Backend not ready after ${maxAttempts} attempts (${(maxAttempts * retryDelayMs) / 1000}s). Is the server running at ${BACKEND_URL}?`
  )
}
