/**
 * Crypto tests — verify Tauri IPC crypto operations work.
 *
 * Tests that the Rust crypto backend (llamenos-core) responds correctly
 * via Tauri IPC commands. Uses window.__TAURI_INTERNALS__.invoke() directly
 * since browser.execute() can't resolve bare module specifiers.
 *
 * Note: Tauri converts Rust snake_case args to camelCase for JS.
 * And serde(rename_all = "camelCase") on Rust structs means returned
 * fields are also camelCase (e.g., secretKeyHex, publicKey).
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

/** Rust `generate_keypair` / `key_pair_from_nsec` IPC response (camelCase via serde). */
interface KeyPair {
  secretKeyHex: string
  publicKey: string
  nsec: string
  npub: string
}

describe('Native Crypto IPC', () => {
  it('should detect Tauri environment', async () => {
    // Wait for Tauri internals to be injected — on Windows WebView2, the
    // preload script can lag behind the first test execution.
    await browser.waitUntil(
      async () => {
        const ready = await browser.execute(
          () => typeof window.__TAURI_INTERNALS__?.invoke === 'function',
        )
        return ready === true
      },
      { timeout: 10_000, timeoutMsg: '__TAURI_INTERNALS__ not available after 10s' },
    )

    const result = await browser.execute(() => {
      const internals = window.__TAURI_INTERNALS__
      return {
        hasInternals: typeof internals !== 'undefined',
        hasInvoke: typeof internals?.invoke === 'function',
        hasMetadata: typeof internals?.metadata === 'object',
      }
    })
    expect(result.hasInternals).toBe(true)
    expect(result.hasInvoke).toBe(true)
  })

  it('should generate a keypair via Rust IPC', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false as const, error: 'invoke not available' }

        const kp = await invoke('generate_keypair') as KeyPair
        // KeyPair fields (camelCase from serde): secretKeyHex, publicKey, nsec, npub
        return {
          success: true as const,
          hasPublicKey: typeof kp.publicKey === 'string' && kp.publicKey.length === 64,
          hasNsec: typeof kp.nsec === 'string' && kp.nsec.startsWith('nsec1'),
          hasNpub: typeof kp.npub === 'string' && kp.npub.startsWith('npub1'),
          hasSecretKeyHex: typeof kp.secretKeyHex === 'string' && kp.secretKeyHex.length === 64,
        }
      } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) }
      }
    })

    if (!result.success) throw new Error(`IPC failed: ${result.error}`)
    expect(result.hasPublicKey).toBe(true)
    expect(result.hasNsec).toBe(true)
    expect(result.hasNpub).toBe(true)
    expect(result.hasSecretKeyHex).toBe(true)
  })

  it('should validate nsec format', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false as const, error: 'invoke not available' }

        const valid = await invoke('is_valid_nsec', {
          nsec: 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh',
        }) as boolean
        const invalid = await invoke('is_valid_nsec', { nsec: 'not-an-nsec' }) as boolean

        return { success: true as const, valid, invalid }
      } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) }
      }
    })

    if (!result.success) throw new Error(`IPC failed: ${result.error}`)
    expect(result.valid).toBe(true)
    expect(result.invalid).toBe(false)
  })

  it('should derive public key from secret key', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false as const, error: 'invoke not available' }

        // Generate a keypair first
        const kp = await invoke('generate_keypair') as KeyPair
        // Derive public key from the secret key hex (camelCase arg)
        const derivedPubkey = await invoke('get_public_key', {
          secretKeyHex: kp.secretKeyHex,
        })

        return {
          success: true as const,
          pubkeyMatch: derivedPubkey === kp.publicKey,
          pubkeyLength: typeof derivedPubkey === 'string' ? derivedPubkey.length : -1,
        }
      } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) }
      }
    })

    if (!result.success) throw new Error(`IPC failed: ${result.error}`)
    expect(result.pubkeyMatch).toBe(true)
    expect(result.pubkeyLength).toBe(64)
  })

  it('should encrypt and decrypt with PIN', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = window.__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false as const, error: 'invoke not available' }

        const testPin = '12345678'
        const testNsec = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'

        // Need pubkey for encrypt_with_pin — derive from nsec
        const kp = await invoke('key_pair_from_nsec', { nsec: testNsec }) as KeyPair

        // Encrypt: args are nsec, pin, pubkeyHex (camelCase from Rust pubkey_hex)
        const encrypted = await invoke('encrypt_with_pin', {
          nsec: testNsec,
          pin: testPin,
          pubkeyHex: kp.publicKey,
        })

        // Decrypt: args are data (EncryptedKeyData), pin
        const decrypted = await invoke('decrypt_with_pin', {
          data: encrypted,
          pin: testPin,
        })

        return { success: true as const, roundTrip: decrypted === testNsec }
      } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) }
      }
    })

    if (!result.success) throw new Error(`IPC failed: ${result.error}`)
    expect(result.roundTrip).toBe(true)
  })
})
