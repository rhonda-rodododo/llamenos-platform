/**
 * Crypto tests — verify Tauri IPC crypto operations work.
 *
 * Tests that the Rust crypto backend (llamenos-core) responds correctly
 * via Tauri IPC commands. Uses window.__TAURI_INTERNALS__.invoke() directly
 * since browser.execute() can't resolve bare module specifiers.
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

describe('Native Crypto IPC', () => {
  it('should detect Tauri environment', async () => {
    const result = await browser.execute(() => {
      const internals = (window as any).__TAURI_INTERNALS__
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
        const invoke = (window as any).__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false, error: '__TAURI_INTERNALS__.invoke not available' }

        const keypair = await invoke('generate_keypair')
        return {
          success: true,
          // Rust KeyPair has: secret_key_hex, public_key, nsec, npub
          hasPublicKey: typeof keypair.public_key === 'string' && keypair.public_key.length === 64,
          hasNsec: typeof keypair.nsec === 'string' && keypair.nsec.startsWith('nsec1'),
          keys: Object.keys(keypair),
        }
      } catch (e: any) {
        return { success: false, error: String(e?.message || e) }
      }
    })

    if (!result.success) {
      console.error('generate_keypair error:', result.error)
    }
    expect(result).toHaveProperty('success', true)
    if (result.success) {
      expect(result.hasPublicKey).toBe(true)
      expect(result.hasNsec).toBe(true)
    }
  })

  it('should encrypt and decrypt via PIN-based key store', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = (window as any).__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false, error: '__TAURI_INTERNALS__.invoke not available' }

        const testPin = '123456'
        const testNsec = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'

        // Rust command is encrypt_with_pin, not pin_encrypt
        const encrypted = await invoke('encrypt_with_pin', {
          nsec: testNsec,
          pin: testPin,
        })

        // Rust command is decrypt_with_pin, not pin_decrypt
        const decrypted = await invoke('decrypt_with_pin', {
          data: encrypted,
          pin: testPin,
        })

        return { success: true, roundTrip: decrypted === testNsec }
      } catch (e: any) {
        return { success: false, error: String(e?.message || e) }
      }
    })

    if (!result.success) {
      console.error('PIN encrypt/decrypt error:', result.error)
    }
    expect(result).toHaveProperty('success', true)
    if (result.success) {
      expect(result.roundTrip).toBe(true)
    }
  })

  it('should validate nsec format', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = (window as any).__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false, error: '__TAURI_INTERNALS__.invoke not available' }

        const validNsec = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'
        const valid = await invoke('is_valid_nsec', { nsec: validNsec })
        const invalid = await invoke('is_valid_nsec', { nsec: 'not-an-nsec' })

        return { success: true, valid, invalid }
      } catch (e: any) {
        return { success: false, error: String(e?.message || e) }
      }
    })

    if (!result.success) {
      console.error('is_valid_nsec error:', result.error)
    }
    expect(result).toHaveProperty('success', true)
    if (result.success) {
      expect(result.valid).toBe(true)
      expect(result.invalid).toBe(false)
    }
  })

  it('should derive public key from nsec', async () => {
    const result = await browser.execute(async () => {
      try {
        const invoke = (window as any).__TAURI_INTERNALS__?.invoke
        if (!invoke) return { success: false, error: '__TAURI_INTERNALS__.invoke not available' }

        const kp = await invoke('generate_keypair')
        const derivedPubkey = await invoke('get_public_key', {
          secretKeyHex: kp.secret_key_hex,
        })

        return {
          success: true,
          pubkeyMatch: derivedPubkey === kp.public_key,
          pubkeyLength: derivedPubkey.length,
        }
      } catch (e: any) {
        return { success: false, error: String(e?.message || e) }
      }
    })

    if (!result.success) {
      console.error('get_public_key error:', result.error)
    }
    expect(result).toHaveProperty('success', true)
    if (result.success) {
      expect(result.pubkeyMatch).toBe(true)
      expect(result.pubkeyLength).toBe(64)
    }
  })
})
