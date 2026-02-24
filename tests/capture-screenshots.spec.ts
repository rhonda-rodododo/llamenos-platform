/**
 * Screenshot capture script for documentation.
 *
 * Captures screenshots of the application at mobile and desktop viewports
 * for use in the documentation site and README.
 *
 * Usage:
 *   1. Start the dev server: bun run dev:worker
 *   2. Run this script: bunx playwright test scripts/capture-screenshots.ts
 *
 * Screenshots are saved to site/public/screenshots/
 */

import { test, expect } from '@playwright/test'
import { type Page } from '@playwright/test'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { getPublicKey, nip19 } from 'nostr-tools'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test credentials (same as tests/helpers.ts)
const ADMIN_NSEC = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'
const TEST_PIN = '123456'

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
} as const

// Output directory
const SCREENSHOT_DIR = path.join(__dirname, '..', 'site', 'public', 'screenshots')

// Skip in CI - this test is only run manually for documentation
test.skip(({ }, testInfo) => !!process.env.CI, 'Screenshot capture only runs manually')

/**
 * Pre-compute an encrypted key blob and inject into localStorage.
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
 * Enter PIN into the PinInput component.
 */
async function enterPin(page: Page, pin: string): Promise<void> {
  const firstDigit = page.locator('input[aria-label="PIN digit 1"]')
  await firstDigit.waitFor({ state: 'visible', timeout: 10000 })
  await firstDigit.click()
  await page.keyboard.type(pin, { delay: 50 })
}

/**
 * Login as admin.
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await preloadEncryptedKey(page, ADMIN_NSEC, TEST_PIN)
  await page.reload()
  await enterPin(page, TEST_PIN)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 })
}

/**
 * Navigate using SPA router (no page reload).
 */
async function navigateTo(page: Page, pathname: string): Promise<void> {
  await page.evaluate((path) => {
    const router = (window as unknown as { __TEST_ROUTER?: { navigate: (opts: { to: string }) => void } }).__TEST_ROUTER
    if (router) {
      router.navigate({ to: path })
    }
  }, pathname)
  await page.waitForURL((u) => u.pathname === pathname, { timeout: 10000 })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}

/**
 * Take a screenshot at the specified viewport.
 */
async function captureScreen(
  page: Page,
  name: string,
  viewport: 'desktop' | 'mobile',
): Promise<void> {
  const vp = VIEWPORTS[viewport]
  await page.setViewportSize(vp)
  // Wait for any animations/transitions
  await page.waitForTimeout(500)

  const filename = `${name}-${viewport}.png`
  const filepath = path.join(SCREENSHOT_DIR, filename)

  await page.screenshot({
    path: filepath,
    fullPage: false,
  })

  console.log(`  ✓ Captured ${filename}`)
}

/**
 * Seed realistic test data for screenshots.
 */
async function seedTestData(page: Page): Promise<void> {
  // Create some volunteers via API
  const volunteers = [
    { name: 'Maria Santos', phone: '+15551234567' },
    { name: 'James Chen', phone: '+15559876543' },
    { name: 'Sarah Johnson', phone: '+15551112222' },
  ]

  for (const vol of volunteers) {
    try {
      await page.request.post('/api/volunteers', {
        data: {
          name: vol.name,
          phone: vol.phone,
          roleIds: ['role-volunteer'],
          // Generate a random pubkey for seeded volunteers
          pubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
        },
      })
    } catch {
      // Volunteer might already exist
    }
  }

  // Create some shifts
  const shifts = [
    { name: 'Morning Shift', startTime: '08:00', endTime: '14:00', days: [1, 2, 3, 4, 5] },
    { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', days: [1, 2, 3, 4, 5] },
    { name: 'Weekend Coverage', startTime: '10:00', endTime: '18:00', days: [0, 6] },
  ]

  for (const shift of shifts) {
    try {
      await page.request.post('/api/shifts', { data: shift })
    } catch {
      // Shift might already exist
    }
  }

  // Create some bans
  const bans = [
    { phone: '+15550001111', reason: 'Repeated prank calls' },
    { phone: '+15550002222', reason: 'Threatening language' },
  ]

  for (const ban of bans) {
    try {
      await page.request.post('/api/bans', { data: ban })
    } catch {
      // Ban might already exist
    }
  }
}

// Main test that captures all screenshots
test.describe('Screenshot Capture', () => {
  test.beforeAll(async () => {
    // Ensure output directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    }
  })

  test('capture all documentation screenshots', async ({ page }) => {
    console.log('\n📸 Capturing documentation screenshots...\n')

    // Login as admin
    console.log('🔐 Logging in as admin...')
    await loginAsAdmin(page)

    // Seed test data
    console.log('🌱 Seeding test data...')
    await seedTestData(page)

    // Wait for data to settle
    await page.waitForTimeout(1000)

    // === Dashboard ===
    console.log('\n📍 Dashboard')
    await navigateTo(page, '/')
    await page.waitForTimeout(500)
    await captureScreen(page, 'dashboard', 'desktop')
    await captureScreen(page, 'dashboard', 'mobile')

    // === Volunteers ===
    console.log('\n📍 Volunteers')
    await navigateTo(page, '/volunteers')
    await page.waitForSelector('[data-testid="volunteer-row"]', { timeout: 5000 }).catch(() => {})
    await captureScreen(page, 'volunteers', 'desktop')

    // === Shifts ===
    console.log('\n📍 Shifts')
    await navigateTo(page, '/shifts')
    await page.waitForTimeout(500)
    await captureScreen(page, 'shifts', 'desktop')

    // === Notes ===
    console.log('\n📍 Notes')
    await navigateTo(page, '/notes')
    await page.waitForTimeout(500)
    await captureScreen(page, 'notes', 'desktop')
    await captureScreen(page, 'notes', 'mobile')

    // === Conversations ===
    console.log('\n📍 Conversations')
    await navigateTo(page, '/conversations')
    await page.waitForTimeout(500)
    await captureScreen(page, 'conversations', 'desktop')
    await captureScreen(page, 'conversations', 'mobile')

    // === Call History ===
    console.log('\n📍 Call History')
    await navigateTo(page, '/calls')
    await page.waitForTimeout(500)
    await captureScreen(page, 'calls', 'desktop')

    // === Audit Log ===
    console.log('\n📍 Audit Log')
    await navigateTo(page, '/audit')
    await page.waitForTimeout(500)
    await captureScreen(page, 'audit', 'desktop')

    // === Ban List ===
    console.log('\n📍 Ban List')
    await navigateTo(page, '/bans')
    await page.waitForSelector('[data-testid="ban-row"]', { timeout: 5000 }).catch(() => {})
    await captureScreen(page, 'bans', 'desktop')

    // === Hub Settings ===
    console.log('\n📍 Hub Settings')
    await navigateTo(page, '/admin/settings')
    await page.waitForTimeout(500)
    await captureScreen(page, 'settings', 'desktop')

    // === Login Screen ===
    console.log('\n📍 Login Screen')
    // Clear session to show login
    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.removeItem('llamenos-encrypted-key')
    })
    await page.goto('/login')
    await page.waitForTimeout(500)
    await captureScreen(page, 'login', 'desktop')
    await captureScreen(page, 'login', 'mobile')

    console.log('\n✅ All screenshots captured successfully!')
    console.log(`📁 Output directory: ${SCREENSHOT_DIR}\n`)
  })
})
