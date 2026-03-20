import type { FullConfig } from '@playwright/test'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'

const BACKEND_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
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
 * then bootstrap the admin user if not already created.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`)
      if (res.ok) {
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
