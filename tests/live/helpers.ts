import Twilio from 'twilio'
import { expect, type Page, type APIRequestContext } from '@playwright/test'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { getPublicKey, nip19 } from 'nostr-tools'

// Re-export helpers that don't depend on ADMIN_NSEC
export { enterPin } from '../helpers'

const STAGING_PIN = '123456'

// Environment config — loaded from .env.live or process.env
function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}. Set it in .env.live or environment.`)
  return val
}

export function getLiveConfig() {
  return {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
    hotlineNumber: requireEnv('TWILIO_PHONE_NUMBER'),
    testCallerNumber: requireEnv('TWILIO_TEST_CALLER'),
    testSecret: requireEnv('E2E_TEST_SECRET'),
    adminNsec: requireEnv('STAGING_ADMIN_NSEC'),
    baseURL: process.env.LIVE_BASE_URL || 'https://demo-next.llamenos-hotline.com',
  }
}

export function createTwilioClient() {
  const { accountSid, authToken } = getLiveConfig()
  return Twilio(accountSid, authToken)
}

/**
 * Pre-compute an encrypted key blob and inject it into localStorage.
 * Same PBKDF2 + XChaCha20-Poly1305 format as key-store.ts.
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

  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'llamenos-encrypted-key', value: JSON.stringify(data) },
  )
}

/**
 * Login as the staging admin using the nsec from STAGING_ADMIN_NSEC env var.
 */
export async function loginAsAdmin(page: Page) {
  const { adminNsec } = getLiveConfig()
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await preloadEncryptedKey(page, adminNsec, STAGING_PIN)
  await page.reload()

  // Enter PIN
  const firstDigit = page.locator('input[aria-label="PIN digit 1"]')
  await firstDigit.waitFor({ state: 'visible', timeout: 10000 })
  await firstDigit.click()
  await page.keyboard.type(STAGING_PIN, { delay: 50 })

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })
}

interface CallHotlineOptions {
  /** DTMF digits to send after connecting (e.g., 'wwwwwwwwww2' = wait 5s then press 2) */
  sendDigits?: string
  /** Timeout in seconds before Twilio stops ringing (default: 60) */
  timeout?: number
  /** Status callback URL — if provided, Twilio POSTs status events here */
  statusCallback?: string
}

/**
 * Initiate an outbound call from the test caller number to the hotline.
 * Returns the Call SID for status polling.
 */
export async function callHotline(options: CallHotlineOptions = {}) {
  const client = createTwilioClient()
  const config = getLiveConfig()

  const call = await client.calls.create({
    to: config.hotlineNumber,
    from: config.testCallerNumber,
    url: `${config.baseURL}/api/telephony/incoming`,
    timeout: options.timeout ?? 60,
    ...(options.sendDigits ? { sendDigits: options.sendDigits } : {}),
    ...(options.statusCallback ? {
      statusCallback: options.statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    } : {}),
  })

  return {
    sid: call.sid,
    status: call.status,
  }
}

/**
 * Send an SMS from the test caller number to the hotline number.
 */
export async function sendSMS(body: string) {
  const client = createTwilioClient()
  const config = getLiveConfig()

  const message = await client.messages.create({
    to: config.hotlineNumber,
    from: config.testCallerNumber,
    body,
  })

  return {
    sid: message.sid,
    status: message.status,
  }
}

type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled'

/**
 * Poll Twilio API until a call reaches the expected status.
 */
export async function waitForCallStatus(
  sid: string,
  targetStatus: CallStatus | CallStatus[],
  timeoutMs = 60_000,
): Promise<string> {
  const client = createTwilioClient()
  const targets = Array.isArray(targetStatus) ? targetStatus : [targetStatus]
  const start = Date.now()
  const pollInterval = 2_000

  while (Date.now() - start < timeoutMs) {
    const call = await client.calls(sid).fetch()
    if (targets.includes(call.status as CallStatus)) {
      return call.status
    }
    if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status) &&
        !targets.some(t => ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(t))) {
      throw new Error(`Call ${sid} reached terminal status '${call.status}' while waiting for ${targets.join('|')}`)
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }

  const call = await client.calls(sid).fetch()
  if (targets.includes(call.status as CallStatus)) {
    return call.status
  }
  throw new Error(`Timed out waiting for call ${sid} to reach status ${targets.join('|')} (current: ${call.status})`)
}

/**
 * Hang up a call via the Twilio API.
 */
export async function hangUp(sid: string) {
  const client = createTwilioClient()
  await client.calls(sid).update({ status: 'completed' })
}

/**
 * Light reset: clears call records, shifts, conversations — preserves admin account and settings.
 */
export async function resetStaging(request: APIRequestContext) {
  const config = getLiveConfig()
  const res = await request.post('/api/test-reset-records', {
    headers: {
      'X-Test-Secret': config.testSecret,
    },
  })
  if (!res.ok()) {
    throw new Error(`Failed to reset staging records: ${res.status()} ${await res.text()}`)
  }
}

/**
 * Wait a fixed number of milliseconds.
 */
export function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
