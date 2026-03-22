/**
 * Common authentication step definitions shared across features.
 * Reuses existing helpers from tests/helpers.ts.
 */
import { expect } from '@playwright/test'
import { Given, When } from '../fixtures'
import {
  loginAsAdmin,
  loginAsVolunteer,
  enterPin,
  ADMIN_NSEC,
  TEST_PIN,
  Timeouts,
  TestIds,
} from '../../helpers'

Given('the app is freshly installed', async ({ page }) => {
  // Clear all storage to simulate a fresh install
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})

Given('no identity exists on the device', async ({ page }) => {
  // Ensure no encrypted key exists in storage
  await page.evaluate(() => {
    localStorage.removeItem('llamenos:llamenos-encrypted-key')
    localStorage.removeItem('llamenos-encrypted-key')
    localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-key')
  })
})

Given('an identity exists with PIN {string}', async ({ page }, pin: string) => {
  // Pre-load the admin key encrypted with the given PIN
  // This simulates a returning user who has already set up their identity
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  // Use the standard preloadEncryptedKey flow via loginAsAdmin helper logic
  // but we just need the key loaded, not fully logged in
  const { xchacha20poly1305 } = await import('@noble/ciphers/chacha.js')
  const { utf8ToBytes } = await import('@noble/ciphers/utils.js')
  const { bytesToHex } = await import('@noble/hashes/utils.js')
  const { getPublicKey, nip19 } = await import('nostr-tools')

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
  const ciphertext = cipher.encrypt(utf8ToBytes(ADMIN_NSEC))

  const decoded = nip19.decode(ADMIN_NSEC)
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

  // platform.ts non-Tauri getStore() uses 'llamenos:' prefix
  await page.evaluate(
    (value) => { localStorage.setItem('llamenos:llamenos-encrypted-key', value) },
    JSON.stringify(data),
  )
})

Given('I am logged in', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am logged in as an admin', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am authenticated', async ({ page }) => {
  await loginAsAdmin(page)
})

Given('I am authenticated and on the dashboard', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Given('I am authenticated and on the main screen', async ({ page }) => {
  await loginAsAdmin(page)
  await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
})

Given('I am on the login screen', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
})

Given('I have a stored identity with PIN {string}', async ({ page }, pin: string) => {
  // Pre-load an encrypted key for the given PIN
  // Normalize to 6 digits (app uses 6-digit PINs; feature files may use 4-digit for readability)
  const normalizedPin = pin.padEnd(6, '0')

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  const { xchacha20poly1305 } = await import('@noble/ciphers/chacha.js')
  const { utf8ToBytes } = await import('@noble/ciphers/utils.js')
  const { bytesToHex } = await import('@noble/hashes/utils.js')
  const { getPublicKey, nip19 } = await import('nostr-tools')

  const encoder = new TextEncoder()
  const pinBytes = encoder.encode(normalizedPin)
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
  const ciphertext = cipher.encrypt(utf8ToBytes(ADMIN_NSEC))

  const decoded = nip19.decode(ADMIN_NSEC)
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

  // platform.ts non-Tauri getStore() uses 'llamenos:' prefix
  await page.evaluate(
    (value) => { localStorage.setItem('llamenos:llamenos-encrypted-key', value) },
    JSON.stringify(data),
  )
})

Given('the app is restarted', async ({ page }) => {
  // Reload the page to simulate an app restart
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
})

When('the app launches', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
})

When('I enter PIN {string}', async ({ page }, pin: string) => {
  // Normalize to 6 digits (app uses 6-digit PINs; feature files may use 4-digit for readability)
  const normalizedPin = pin.padEnd(6, '0')
  await enterPin(page, normalizedPin)
})
