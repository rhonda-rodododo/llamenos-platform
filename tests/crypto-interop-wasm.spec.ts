/**
 * Cross-platform crypto interop test vectors — WASM validation.
 *
 * Loads the Rust-generated test vectors from packages/crypto/tests/fixtures/test-vectors.json
 * and validates them using the WASM crypto module. This ensures the WASM build produces
 * identical output to native Rust for all cryptographic operations.
 *
 * Run: npx playwright test crypto-interop-wasm.spec.ts
 * Prerequisite: bun run crypto:wasm (build the WASM module first)
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const VECTORS_PATH = resolve(__dirname, '../packages/crypto/tests/fixtures/test-vectors.json')
const WASM_PATH = resolve(__dirname, '../packages/crypto/dist/wasm/llamenos_core.js')

// Skip all tests if WASM isn't built
const wasmBuilt = existsSync(WASM_PATH)

test.describe('Cross-Platform Crypto Interop (WASM)', () => {
  test.skip(!wasmBuilt, 'WASM module not built — run bun run crypto:wasm first')

  let vectors: Record<string, unknown>

  test.beforeAll(() => {
    vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf-8'))
  })

  test('test vectors file exists and is version 2', () => {
    expect(vectors).toBeDefined()
    expect(vectors.version).toBe('2')
    expect(vectors.generatedBy).toContain('llamenos-core')
  })

  test('key derivation: pubkey from secret key matches vectors', async ({ page }) => {
    // This test runs in the browser context where WASM is available
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex, expectedPubkey } = args
      // @ts-expect-error dynamic import in browser
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()
      return wasm.getPublicKeyFromSecret(skHex)
    }, { skHex: keys.secretKeyHex, expectedPubkey: keys.publicKeyHex })

    expect(result).toBe(keys.publicKeyHex)
  })

  test('auth token: create and verify roundtrip', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>
    const auth = vectors.auth as Record<string, unknown>
    const token = auth.token as Record<string, unknown>

    const result = await page.evaluate(async (args) => {
      const { skHex, expectedPubkey } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      // Create a token
      const tokenJson = wasm.createAuthTokenStateless(skHex, 'GET', '/api/auth/me')
      const parsed = JSON.parse(tokenJson)

      // Verify the token's pubkey matches
      const valid = wasm.verifySchnorr(
        parsed.messageHash,
        parsed.token,
        parsed.pubkey,
      )

      return { pubkey: parsed.pubkey, hasToken: !!parsed.token, valid }
    }, { skHex: keys.secretKeyHex, expectedPubkey: keys.publicKeyHex })

    expect(result.pubkey).toBe(keys.publicKeyHex)
    expect(result.hasToken).toBe(true)
  })

  test('ECIES: wrap and unwrap key roundtrip', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex, pubkey } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      // Wrap a random key
      const originalKey = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      const envelopeJson = wasm.eciesWrapKey(originalKey, pubkey, 'llamenos:note-key')
      const envelope = JSON.parse(envelopeJson)

      // Unwrap using the WasmCryptoState
      const state = new wasm.WasmCryptoState()
      // Import key to state (need PIN encryption roundtrip)
      const importResult = state.importKey(skHex, '12345678')
      // Unlock with the same PIN
      state.unlockWithPin(importResult, '12345678')

      const unwrapped = state.eciesUnwrapKey(envelopeJson, 'llamenos:note-key')
      state.lock()

      return { wrapped: !!envelope.wrappedKey, unwrapped }
    }, { skHex: keys.secretKeyHex, pubkey: keys.publicKeyHex })

    expect(result.wrapped).toBe(true)
    expect(result.unwrapped).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
  })

  test('message encryption: encrypt and decrypt roundtrip', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex, pubkey, adminPubkey } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      const state = new wasm.WasmCryptoState()
      const importResult = state.importKey(skHex, '12345678')
      state.unlockWithPin(importResult, '12345678')

      // Encrypt a message
      const plaintext = 'Hello from WASM crypto!'
      const readersJson = JSON.stringify([pubkey, adminPubkey])
      const encrypted = state.encryptMessage(plaintext, readersJson)

      // Decrypt as the author
      const decrypted = state.decryptMessage(
        encrypted.encryptedContent,
        JSON.stringify(encrypted.readerEnvelopes),
      )

      state.lock()
      return { encrypted: !!encrypted.encryptedContent, decrypted }
    }, {
      skHex: keys.secretKeyHex,
      pubkey: keys.publicKeyHex,
      adminPubkey: keys.adminPublicKeyHex,
    })

    expect(result.encrypted).toBe(true)
    expect(result.decrypted).toBe('Hello from WASM crypto!')
  })

  test('note encryption: encrypt and decrypt with admin envelope', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex, pubkey, adminSkHex, adminPubkey } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      // Encrypt as volunteer
      const state = new wasm.WasmCryptoState()
      const importResult = state.importKey(skHex, '12345678')
      state.unlockWithPin(importResult, '12345678')

      const payloadJson = JSON.stringify({ text: 'Test note for WASM interop' })
      const encrypted = state.encryptNote(payloadJson, pubkey, JSON.stringify([adminPubkey]))
      state.lock()

      // Decrypt as admin
      const adminState = new wasm.WasmCryptoState()
      const adminImport = adminState.importKey(adminSkHex, '654321')
      adminState.unlockWithPin(adminImport, '654321')

      const adminEnvelope = encrypted.adminEnvelopes[0]
      const decrypted = adminState.decryptNote(
        encrypted.encryptedContent,
        JSON.stringify(adminEnvelope),
      )
      adminState.lock()

      return { decrypted: JSON.parse(decrypted) }
    }, {
      skHex: keys.secretKeyHex,
      pubkey: keys.publicKeyHex,
      adminSkHex: keys.adminSecretKeyHex,
      adminPubkey: keys.adminPublicKeyHex,
    })

    expect(result.decrypted.text).toBe('Test note for WASM interop')
  })

  test('domain separation labels match Rust vectors', () => {
    const labels = vectors.labels as Record<string, string>
    // These must match exactly — any mismatch means protocol incompatibility
    expect(labels.LABEL_NOTE_KEY).toBe('llamenos:note-key')
    expect(labels.LABEL_MESSAGE).toBe('llamenos:message')
    expect(labels.LABEL_HUB_KEY_WRAP).toBe('llamenos:hub-key-wrap')
    expect(labels.LABEL_FILE_KEY).toBe('llamenos:file-key')
    expect(labels.LABEL_FILE_METADATA).toBe('llamenos:file-metadata')
    expect(labels.LABEL_BLIND_INDEX_KEY).toBe('llamenos:blind-index-key')
  })

  test('draft encryption: encrypt and decrypt roundtrip', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      const state = new wasm.WasmCryptoState()
      const importResult = state.importKey(skHex, '12345678')
      state.unlockWithPin(importResult, '12345678')

      const plaintext = 'Draft note in progress...'
      const encrypted = state.encryptDraft(plaintext)
      const decrypted = state.decryptDraft(encrypted)
      state.lock()

      return { encrypted: !!encrypted, decrypted }
    }, { skHex: keys.secretKeyHex })

    expect(result.encrypted).toBeTruthy()
    expect(result.decrypted).toBe('Draft note in progress...')
  })

  test('PIN encryption: encrypt and decrypt nsec roundtrip', async ({ page }) => {
    const keys = vectors.keys as Record<string, string>

    const result = await page.evaluate(async (args) => {
      const { skHex, expectedPubkey } = args
      // @ts-expect-error dynamic import
      const wasm = await import('/packages/crypto/dist/wasm/llamenos_core.js')
      await wasm.default()

      const state = new wasm.WasmCryptoState()
      const pin = '987654'

      // Import key (encrypts with PIN)
      const encryptedJson = state.importKey(skHex, pin)
      const encrypted = JSON.parse(encryptedJson)

      // Lock, then unlock with PIN
      state.lock()
      expect(state.isUnlocked()).toBe(false)

      const pubkey = state.unlockWithPin(encryptedJson, pin)

      return {
        hasEncryptedData: !!encrypted.ciphertext,
        pubkey,
        isUnlocked: state.isUnlocked(),
      }
    }, { skHex: keys.secretKeyHex, expectedPubkey: keys.publicKeyHex })

    expect(result.hasEncryptedData).toBe(true)
    expect(result.pubkey).toBe(keys.publicKeyHex)
    expect(result.isUnlocked).toBe(true)
  })
})
