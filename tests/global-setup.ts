import type { FullConfig } from '@playwright/test'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'
const BACKEND_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

function loadDevVarsSecret(): string | undefined {
  return process.env.E2E_TEST_SECRET || process.env.DEV_RESET_SECRET || undefined
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

async function verifyAdminAccess(baseUrl: string): Promise<void> {
  const token = makeBootstrapToken(ADMIN_SEED, 'GET', '/api/auth/me')
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${JSON.stringify(token)}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Admin verification failed: ${res.status} ${text}`)
  }
}

async function ensureDefaultHub(baseUrl: string): Promise<void> {
  const secret = loadDevVarsSecret()
  if (!secret) return
  // Check if a hub already exists
  const configRes = await fetch(`${baseUrl}/api/config`)
  if (!configRes.ok) return
  const config = await configRes.json() as { hubs?: Array<{ id: string }> }
  if (config.hubs && config.hubs.length > 0) return
  // Create a default hub for tests that need currentHubId
  const res = await fetch(`${baseUrl}/api/test-create-hub`, {
    method: 'POST',
    headers: { 'X-Test-Secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Default Test Hub' }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`[global-setup] Hub creation failed (non-fatal): ${res.status} ${text}`)
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const maxAttempts = process.env.CI ? 30 : 10
  const retryDelayMs = process.env.CI ? 3000 : 2000

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`)
      if (res.ok) {
        await resetTestState(BACKEND_URL)
        await bootstrapAdmin(BACKEND_URL)
        await verifyAdminAccess(BACKEND_URL)
        await ensureDefaultHub(BACKEND_URL)
        return
      }
      if (i % 5 === 4) {
        console.log(`[global-setup] Backend returned ${res.status}, retrying... (${i + 1}/${maxAttempts})`)
      }
    } catch (err) {
      if (i % 5 === 4) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`[global-setup] Backend not reachable, retrying... (${i + 1}/${maxAttempts}) — ${msg}`)
      }
    }
    await new Promise(r => setTimeout(r, retryDelayMs))
  }
  throw new Error(
    `Backend not ready after ${maxAttempts} attempts (${(maxAttempts * retryDelayMs) / 1000}s). Is the server running at ${BACKEND_URL}?`
  )
}
