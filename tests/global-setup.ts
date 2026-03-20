import type { FullConfig } from '@playwright/test'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'
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

const AUTH_PREFIX = 'llamenos:auth:'
const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'

function makeBootstrapToken(nsec: string, method: string, path: string) {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  const skBytes = decoded.data as Uint8Array
  const pubkey = getPublicKey(skBytes)
  const timestamp = Date.now()
  const message = `${AUTH_PREFIX}${pubkey}:${timestamp}:${method}:${path}`
  const messageHash = sha256(utf8ToBytes(message))
  const sig = schnorr.sign(messageHash, hexToBytes(bytesToHex(skBytes)))
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
  const body = makeBootstrapToken(ADMIN_NSEC, 'POST', path)
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
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`)
      if (res.ok) {
        await resetTestState(BACKEND_URL)
        await bootstrapAdmin(BACKEND_URL)
        return
      }
    } catch {
      // Server not ready yet — retry
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(
    `Backend not ready after 10 attempts. Is the server running at ${BACKEND_URL}?`
  )
}
