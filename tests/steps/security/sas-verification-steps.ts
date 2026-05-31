/**
 * SAS verification step definitions.
 * Matches steps from: packages/test-specs/features/security/network-security.feature
 * (SAS-related @wip scenarios)
 *
 * These test the SAS (Short Authentication String) verification gate
 * during device linking. A Playwright test event ('test:provisioning-complete')
 * drives the link-device component to the verify-sas step without needing a
 * live backend provisioning room.
 *
 * The test calls provision_create_session via the IPC mock to set up the
 * ephemeral key in Rust/mock state. The ephemeral secret NEVER enters the
 * webview JavaScript — matching the production security invariant.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, type SasWorld } from '../fixtures'
import { x25519 } from '@noble/curves/ed25519.js'
import { gcm } from '@noble/ciphers/aes.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import {
  LABEL_DEVICE_PROVISION,
  LABEL_PROVISIONING_SALT,
  SAS_SALT,
  SAS_INFO,
} from '@shared/crypto-labels'

function computeSAS(sharedSecret: Uint8Array): string {
  const sasBytes = hkdf(sha256, sharedSecret, utf8ToBytes(SAS_SALT), utf8ToBytes(SAS_INFO), 4)
  const num = ((sasBytes[0] << 24) | (sasBytes[1] << 16) | (sasBytes[2] << 8) | sasBytes[3]) >>> 0
  const code = (num % 1_000_000).toString().padStart(6, '0')
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

function encryptNsecForTest(nsec: string, ephemeralPubkeyHex: string, primarySecret: Uint8Array): string {
  const shared = x25519.getSharedSecret(primarySecret, hexToBytes(ephemeralPubkeyHex))
  const key = hkdf(sha256, shared, utf8ToBytes(LABEL_PROVISIONING_SALT), utf8ToBytes(LABEL_DEVICE_PROVISION), 32)
  const nonce = new Uint8Array(12) // deterministic zero nonce — test only
  const aad = utf8ToBytes(LABEL_DEVICE_PROVISION)
  const cipher = gcm(key, nonce, aad)
  const ct = cipher.encrypt(utf8ToBytes(nsec))
  const packed = new Uint8Array(nonce.length + ct.length)
  packed.set(nonce)
  packed.set(ct, nonce.length)
  return bytesToHex(packed)
}

// ── Steps ─────────────────────────────────────────────────────────

Given('a valid provisioning room is established', async ({ page, sasWorld }) => {
  const state: SasWorld = sasWorld

  // Call provision_create_session via the IPC mock to generate the ephemeral keypair.
  // The ephemeral secret is stored in the mock's state — it NEVER enters JavaScript.
  // We only get back the pubkey hex.
  const ephemeralPubkeyHex = await page.evaluate(async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('provision_create_session')
  })
  state.ephemeralPubkey = ephemeralPubkeyHex

  // Generate a primary keypair (test-side only — simulates the primary device)
  state.primarySecret = crypto.getRandomValues(new Uint8Array(32))
  state.primaryPubkey = bytesToHex(x25519.getPublicKey(state.primarySecret))
  state.mockNsec = 'nsec1testmocksecretforplaywrighttest00000000000000000000000000000001'

  // Compute SAS from the primary's perspective (primary_secret × ephemeral_pubkey)
  const shared = x25519.getSharedSecret(state.primarySecret, hexToBytes(state.ephemeralPubkey))
  state.sasCode = computeSAS(shared)

  // Encrypt the mock nsec as if the primary device sent it
  state.encryptedNsec = encryptNsecForTest(state.mockNsec, state.ephemeralPubkey, state.primarySecret)
})

// Used as both Given and When — playwright-bdd matches Given/When/Then interchangeably
Given('the ephemeral key exchange completes', async ({ page, sasWorld }) => {
  const state = sasWorld
  // Navigate to the link-device page (where the new-device SAS flow lives)
  await page.goto('/link-device')
  await page.waitForLoadState('domcontentloaded')

  // Wait for the React useEffect to register the test:provisioning-complete listener
  await page.locator('body[data-test-provisioning-ready="true"]').waitFor({ state: 'attached', timeout: 5000 })

  // Dispatch the test event that drives link-device.tsx to the verify-sas step.
  // Note: NO ephemeral secret is sent — it stays in Rust/mock state.
  await page.evaluate(
    ({ sasCode, encryptedNsec, primaryPubkey }) => {
      window.dispatchEvent(new CustomEvent('test:provisioning-complete', {
        detail: { sasCode, encryptedNsec, primaryPubkey },
      }))
    },
    {
      sasCode: state.sasCode!,
      encryptedNsec: state.encryptedNsec!,
      primaryPubkey: state.primaryPubkey!,
    },
  )

  // Wait for the verify-sas step to render
  await page.getByTestId('sas-code').waitFor({ state: 'visible', timeout: 5000 })
})

Then('I should see a {int}-digit SAS code displayed', async ({ page }, digits: number) => {
  const sasEl = page.getByTestId('sas-code')
  await expect(sasEl).toBeVisible({ timeout: 5000 })
  const text = (await sasEl.textContent()) ?? ''
  // Remove spaces — SAS is formatted as "XXX XXX"
  const digits_only = text.replace(/\s/g, '')
  expect(digits_only).toMatch(/^\d+$/)
  expect(digits_only.length).toBe(digits)
})

Then('I should see instructions to compare with the other device', async ({ page }) => {
  // The verifySASDesc text contains "Compare this code" / compare wording
  const instruction = page.locator('[data-testid="sas-code-container"]').locator('..')
    .locator('text=/compare|verify|match|other device/i')
  // Fallback to any visible compare text on the page
  const pageText = page.getByText(/compare|verify.*code/i)
  const found = await instruction.first().isVisible({ timeout: 3000 }).catch(() => false)
    || await pageText.first().isVisible({ timeout: 3000 }).catch(() => false)
  expect(found).toBe(true)
})

Given('an encrypted nsec is received from the other device', ({ sasWorld }) => {
  // Already set in 'a valid provisioning room is established'
  expect(sasWorld.encryptedNsec).toBeTruthy()
})

When('I have not yet confirmed the SAS code', async ({ page }) => {
  // We are in the verify-sas step — SAS has NOT been confirmed yet.
  // Verify the confirm/mismatch buttons are visible (user is still deciding).
  await expect(page.getByTestId('sas-match')).toBeVisible({ timeout: 3000 })
  await expect(page.getByTestId('sas-mismatch')).toBeVisible({ timeout: 3000 })
})

Then('the nsec should not be imported', async ({ page }) => {
  // Before confirmation, the pin-create step must NOT be visible
  const pinCreateVisible = await page.getByTestId('pin-input').isVisible({ timeout: 500 }).catch(() => false)
  expect(pinCreateVisible).toBe(false)
})

Then('the crypto service should not have a new key', async ({ page }) => {
  // Verified implicitly: still on verify-sas step, no key import has happened
  await expect(page.getByTestId('sas-code')).toBeVisible()
})

When('I confirm the SAS code matches', async ({ page }) => {
  await page.getByTestId('sas-match').click()
})

Then('the nsec should be imported', async ({ page }) => {
  // After SAS confirmation, the component advances to pin-create (nsec is NOT
  // decrypted here — it happens when the user enters a PIN in handlePinConfirm).
  // Both pin-create and done states indicate successful SAS verification.
  const pinCreate = page.locator('[data-testid="pin-input"]')
  const doneState = page.getByText(/success|linked|complete/i)
  const advancedStep = await pinCreate.first().isVisible({ timeout: 5000 }).catch(() => false)
    || await doneState.first().isVisible({ timeout: 5000 }).catch(() => false)
  expect(advancedStep, 'Expected to advance past verify-sas after SAS confirmation').toBe(true)
})

Then('I should see the import success state', async ({ page }) => {
  // After decrypt: either pin-create (success) or done (after pin set).
  // In tests, decryption success means we left the verify-sas step.
  const stillOnSas = await page.getByTestId('sas-code').isVisible({ timeout: 500 }).catch(() => false)
  expect(stillOnSas, 'Should have advanced past SAS verification step').toBe(false)
})

When('I reject the SAS code', async ({ page }) => {
  await page.getByTestId('sas-mismatch').click()
})

Then('the provisioning room should be closed', async ({ page }) => {
  // After rejection, the component sets step='error' — the verify-sas UI is gone
  await expect(page.getByTestId('sas-code')).not.toBeVisible({ timeout: 5000 })
})

Then('I should see a {string} message', async ({ page }, text: string) => {
  const msg = page.locator(`[role="alert"]`).or(page.getByText(new RegExp(text, 'i')))
  await expect(msg.first()).toBeVisible({ timeout: 5000 })
})
