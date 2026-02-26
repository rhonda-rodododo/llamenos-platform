/**
 * Crypto tests — verify Tauri IPC crypto operations work.
 *
 * Tests that the Rust crypto backend (llamenos-core) responds correctly
 * via Tauri IPC commands. The platform.ts module routes to Rust on desktop.
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

describe('Native Crypto IPC', () => {
  it('should detect Tauri environment', async () => {
    const isTauri = await browser.execute(() => {
      return typeof (window as Record<string, unknown>).__TAURI__ !== 'undefined'
    })
    expect(isTauri).toBe(true)
  })

  it('should generate a keypair via Rust IPC', async () => {
    const result = await browser.execute(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const keypair = await invoke<{ pubkey: string; nsec: string }>('generate_keypair')
        return {
          success: true,
          hasPubkey: typeof keypair.pubkey === 'string' && keypair.pubkey.length === 64,
          hasNsec: typeof keypair.nsec === 'string' && keypair.nsec.startsWith('nsec1'),
        }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.hasPubkey).toBe(true)
      expect(result.hasNsec).toBe(true)
    }
  })

  it('should encrypt and decrypt via PIN-based key store', async () => {
    const result = await browser.execute(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')

        // Encrypt some test data with a PIN
        const testPin = '123456'
        const testNsec = 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh'

        const encrypted = await invoke<string>('pin_encrypt', {
          plaintext: testNsec,
          pin: testPin,
        })

        // Decrypt it back
        const decrypted = await invoke<string>('pin_decrypt', {
          ciphertext: encrypted,
          pin: testPin,
        })

        return { success: true, roundTrip: decrypted === testNsec }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.roundTrip).toBe(true)
    }
  })

  it('should perform ECIES encrypt/decrypt roundtrip', async () => {
    const result = await browser.execute(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')

        // Generate a keypair for ECIES
        const kp = await invoke<{ pubkey: string; nsec: string }>('generate_keypair')

        // Encrypt a message to this pubkey
        const plaintext = 'Hello from Tauri E2E test'
        const encrypted = await invoke<string>('ecies_encrypt', {
          recipientPubkey: kp.pubkey,
          plaintext,
          label: 'llamenos:test',
        })

        // Decrypt using the secret key
        const decrypted = await invoke<string>('ecies_decrypt', {
          nsec: kp.nsec,
          ciphertext: encrypted,
          label: 'llamenos:test',
        })

        return { success: true, roundTrip: decrypted === plaintext }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.roundTrip).toBe(true)
    }
  })

  it('should sign and verify Schnorr signatures', async () => {
    const result = await browser.execute(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')

        const kp = await invoke<{ pubkey: string; nsec: string }>('generate_keypair')
        const message = 'test message for signing'

        const signature = await invoke<string>('schnorr_sign', {
          nsec: kp.nsec,
          message,
        })

        const valid = await invoke<boolean>('schnorr_verify', {
          pubkey: kp.pubkey,
          message,
          signature,
        })

        return { success: true, validSignature: valid, sigLength: signature.length }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.validSignature).toBe(true)
      expect(result.sigLength).toBe(128) // 64 bytes hex-encoded
    }
  })
})
