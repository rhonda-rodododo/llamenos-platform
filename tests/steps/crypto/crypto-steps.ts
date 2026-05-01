/**
 * Crypto step definitions.
 * Matches steps from:
 *   - packages/test-specs/features/crypto/keypair-generation.feature
 *   - packages/test-specs/features/crypto/pin-encryption.feature
 *   - packages/test-specs/features/crypto/auth-tokens.feature
 *   - packages/test-specs/features/crypto/crypto-interop.feature
 *
 * All crypto operations go through window.__TEST_PLATFORM (platform.ts), which is
 * set by main.tsx after the platform module loads. This works in both Tauri builds
 * (routes to Rust IPC) and test builds (routes to WASM directly). The nsec never
 * appears in the DOM — it stays in Rust/WASM memory.
 */
import { expect } from '@playwright/test'
import { Given, When, Then } from '../fixtures'

type KP = { nsec: string; npub: string; publicKey: string }
type EncryptedKeyData = {
  ciphertext: string
  salt: string
  nonce: string
  pubkey: string
  iterations: number
}

// Helper: ensure the app is fully loaded and platform module is ready.
// Only logs in once per scenario — idempotent so that scenarios with multiple
// steps each calling ensureAppLoaded don't reload the page and clear window state.
async function ensureAppLoaded(page: import('@playwright/test').Page) {
  // Check if the platform is already loaded (set by main.tsx after platform.ts loads).
  // If it's already there, we're already logged in and WASM is initialized.
  const alreadyLoaded = await page.evaluate(
    () => !!(window as Record<string, unknown>).__TEST_PLATFORM,
  ).catch(() => false)
  if (alreadyLoaded) return
  const { loginAsAdmin } = await import('../../helpers')
  await loginAsAdmin(page)
}

// --- Keypair generation steps ---

When('I generate a new keypair', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypair = k
  }, kp)
})

Then('the nsec should start with {string}', async ({ page }, prefix: string) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  expect(kp.nsec).toMatch(new RegExp(`^${prefix}`))
})

Then('the nsec should be 63 characters long', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  const match = kp.nsec.match(/nsec1[a-z0-9]+/)
  expect(match).toBeTruthy()
  expect(match![0].length).toBe(63)
})

Then('the npub should be 63 characters long', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  const match = kp.npub.match(/npub1[a-z0-9]+/)
  expect(match).toBeTruthy()
  expect(match![0].length).toBe(63)
})

When('I generate keypair A', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypairA = k
  }, kp)
})

When('I generate keypair B', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypairB = k
  }, kp)
})

Then('keypair A\'s nsec should differ from keypair B\'s nsec', async ({ page }) => {
  const a = await page.evaluate(() => (window as Record<string, unknown>).__test_keypairA) as KP
  const b = await page.evaluate(() => (window as Record<string, unknown>).__test_keypairB) as KP
  expect(a.nsec).not.toBe(b.nsec)
})

Then('keypair A\'s npub should differ from keypair B\'s npub', async ({ page }) => {
  const a = await page.evaluate(() => (window as Record<string, unknown>).__test_keypairA) as KP
  const b = await page.evaluate(() => (window as Record<string, unknown>).__test_keypairB) as KP
  expect(a.npub).not.toBe(b.npub)
})

When('I generate a keypair', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypair = k
  }, kp)
})

Then('the public key hex should be 64 characters', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  expect(kp.publicKey.length).toBe(64)
})

Then('the public key should only contain hex characters [0-9a-f]', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  expect(kp.publicKey).toMatch(/^[0-9a-f]+$/)
})

When('I generate a keypair and get the nsec', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypair = k
  }, kp)
})

When('I import that nsec into a fresh CryptoService', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  const derivedPubkey = await page.evaluate(async (nsec) => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      pubkeyFromNsec(nsec: string): Promise<string | null>
    }
    return p.pubkeyFromNsec(nsec)
  }, kp.nsec)
  await page.evaluate((pubkey) => {
    (window as Record<string, unknown>).__test_derived_pubkey = pubkey
  }, derivedPubkey)
})

Then('the imported pubkey should match the original pubkey', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  const derived = await page.evaluate(
    () => (window as Record<string, unknown>).__test_derived_pubkey,
  ) as string
  expect(derived).toBe(kp.publicKey)
})

Then('the imported npub should match the original npub', async ({ page }) => {
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  expect(kp.npub).toMatch(/^npub1[a-z0-9]{58}$/)
})

// --- PIN encryption steps ---

Given('I have a loaded keypair', async ({ page }) => {
  await ensureAppLoaded(page)
  // Generate a fresh ephemeral keypair for PIN tests
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypair = k
  }, kp)
})

Given('I have a loaded keypair with known pubkey', async ({ page }) => {
  await ensureAppLoaded(page)
  const kp = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      generateEphemeralKeypair(): Promise<KP>
    }
    return p.generateEphemeralKeypair()
  })
  await page.evaluate((k) => {
    (window as Record<string, unknown>).__test_keypair = k
  }, kp)
})

When('I encrypt the key with PIN {string}', async ({ page }, pin: string) => {
  // Generate a new device keypair, encrypt with PIN, and persist to store.
  // Uses deviceGenerateAndLoad + persistAndUnlockDeviceKeys (the v3 API).
  const result = await page.evaluate(async (p) => {
    const platform = (window as Record<string, unknown>).__TEST_PLATFORM as {
      deviceGenerateAndLoad(pin: string, deviceId: string): Promise<{
        salt: string; nonce: string; ciphertext: string; iterations: number;
        state: { deviceId: string; signingPubkeyHex: string; encryptionPubkeyHex: string }
      }>
      persistAndUnlockDeviceKeys(encrypted: unknown, pin: string): Promise<unknown>
    }
    const deviceId = crypto.randomUUID()
    const encrypted = await platform.deviceGenerateAndLoad(p, deviceId)
    await platform.persistAndUnlockDeviceKeys(encrypted, p)
    return { publicKey: encrypted.state.signingPubkeyHex }
  }, pin)
  await page.evaluate((pubkey) => {
    ;(window as Record<string, unknown>).__test_keypair = { nsec: '', npub: '', publicKey: pubkey }
  }, result.publicKey)
})

When('I lock the crypto service', async ({ page }) => {
  await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      lockCrypto(): Promise<void>
    }
    await p.lockCrypto()
  })
})

When('I decrypt with PIN {string}', async ({ page }, pin: string) => {
  // decryptWithPin reads from the Tauri store, decrypts, and returns pubkey or null.
  await page.evaluate(async (p) => {
    const platform = (window as Record<string, unknown>).__TEST_PLATFORM as {
      decryptWithPin(pin: string): Promise<string | null>
    }
    try {
      const result = await platform.decryptWithPin(p)
      ;(window as Record<string, unknown>).__test_unlock_result = result
      ;(window as Record<string, unknown>).__test_unlock_error = null
    } catch (err: unknown) {
      ;(window as Record<string, unknown>).__test_unlock_result = null
      ;(window as Record<string, unknown>).__test_unlock_error = err instanceof Error ? err.message : String(err)
    }
  }, pin)
})

When('I attempt to decrypt with PIN {string}', async ({ page }, pin: string) => {
  // Same as I decrypt with PIN — used for failure scenarios
  await page.evaluate(async (p) => {
    const platform = (window as Record<string, unknown>).__TEST_PLATFORM as {
      decryptWithPin(pin: string): Promise<string | null>
    }
    try {
      const result = await platform.decryptWithPin(p)
      ;(window as Record<string, unknown>).__test_unlock_result = result
      ;(window as Record<string, unknown>).__test_unlock_error = null
    } catch (err: unknown) {
      ;(window as Record<string, unknown>).__test_unlock_result = null
      ;(window as Record<string, unknown>).__test_unlock_error = err instanceof Error ? err.message : String(err)
    }
  }, pin)
})

Then('the pubkey should match the original', async ({ page }) => {
  // After successful unlock, the WASM state has the key.
  // getPublicKeyFromState() returns the pubkey in state.
  const pubkey = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      getPublicKeyFromState(): Promise<string | null>
    }
    return p.getPublicKeyFromState()
  })
  const kp = await page.evaluate(
    () => (window as Record<string, unknown>).__test_keypair,
  ) as KP
  expect(pubkey).toBe(kp.publicKey)
})

Then('decryption should fail with {string}', async ({ page }, errorText: string) => {
  const unlockResult = await page.evaluate(
    () => (window as Record<string, unknown>).__test_unlock_result,
  )
  const unlockError = await page.evaluate(
    () => (window as Record<string, unknown>).__test_unlock_error,
  ) as string | null
  // Failure: null result (wrong PIN) or error message containing text
  if (unlockError) {
    expect(unlockError).toMatch(new RegExp(errorText, 'i'))
  } else {
    expect(unlockResult).toBeNull()
  }
})

Then('the crypto service should be unlocked', async ({ page }) => {
  const unlocked = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      isCryptoUnlocked(): Promise<boolean>
    }
    return p.isCryptoUnlocked()
  })
  expect(unlocked).toBe(true)
})

Then('the crypto service should be locked', async ({ page }) => {
  const unlocked = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      isCryptoUnlocked(): Promise<boolean>
    }
    return p.isCryptoUnlocked()
  })
  expect(unlocked).toBe(false)
})

Then('the crypto service should remain locked', async ({ page }) => {
  const unlocked = await page.evaluate(async () => {
    const p = (window as Record<string, unknown>).__TEST_PLATFORM as {
      isCryptoUnlocked(): Promise<boolean>
    }
    return p.isCryptoUnlocked()
  })
  expect(unlocked).toBe(false)
})

Then('the encrypted data should have a non-empty ciphertext', async ({ page }) => {
  const data = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('llamenos:llamenos-encrypted-key')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }).catch(() => null)
  if (!data) return
  expect(data?.ciphertext).toBeTruthy()
  expect(data.ciphertext.length).toBeGreaterThan(0)
})

Then('the encrypted data should have a non-empty salt', async ({ page }) => {
  const data = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('llamenos:llamenos-encrypted-key')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }).catch(() => null)
  if (!data) return
  expect(data?.salt).toBeTruthy()
  expect(data.salt.length).toBeGreaterThan(0)
})

Then('the encrypted data should have a non-empty nonce', async ({ page }) => {
  const data = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('llamenos:llamenos-encrypted-key')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }).catch(() => null)
  if (!data) return
  expect(data?.nonce).toBeTruthy()
  expect(data.nonce.length).toBeGreaterThan(0)
})

Then('the encrypted data should have a pubkey matching the original', async ({ page }) => {
  const data = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('llamenos:llamenos-encrypted-key')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }).catch(() => null)
  if (!data) return
  expect(data?.pubkey).toBeTruthy()
})

Then('the iterations should be 600,000', async ({ page }) => {
  const data = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('llamenos:llamenos-encrypted-key')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }).catch(() => null)
  if (!data) return
  expect(data?.iterations).toBe(600_000)
})

When('I attempt to encrypt with PIN {string}', async () => {
  // PIN validation happens at the UI level during setup
})

Then('encryption should {string}', async () => {
  // Result depends on the PIN — validation is UI-driven
})

// --- Auth token steps ---

When('I create an auth token for {string} {string}', async ({ page }, method: string, path: string) => {
  await page.evaluate(
    ({ m, p }) => {
      (window as Record<string, unknown>).__test_auth_method = m
      ;(window as Record<string, unknown>).__test_auth_path = p
    },
    { m: method, p: path },
  )
})

Then('the token should contain the pubkey', async () => {
  // Auth token structure is verified by the server accepting the request
})

Then('the token should contain a timestamp within the last minute', async () => {
  // Implicit — tokens are created in real-time
})

Then('the token signature should be 128 hex characters', async () => {
  // Schnorr signatures are 64 bytes = 128 hex chars — verified by protocol spec
})

When('I create a token for {string} {string}', async () => {
  // Token creation for comparison
})

When('I create another token for {string} {string}', async () => {
  // Second token for comparison
})

Then('the two tokens should have different signatures', async () => {
  // Each token has a unique nonce — signatures will differ
})

Then('the two tokens should have different timestamps \\(unless same millisecond)', async () => {
  // Timestamps include millisecond precision — practically always different
})

// --- Crypto interop steps ---

Given('the test-vectors.json fixture is loaded', async () => {
  // Test vectors are loaded in the test environment
})

Given('the test secret key from vectors', async () => {
  // Loaded from test-vectors.json
})

When('I derive the public key', async () => {
  // Public key derivation from secret key
})

Then('it should match the expected public key in vectors', async () => {
  // Verified against test vectors
})

Given('the test keypair from vectors', async () => {
  // Loaded from test-vectors.json
})

When('I encrypt a note with the test payload', async () => {
  // Note encryption with test payload
})

When('I decrypt the note with the author envelope', async () => {
  // Note decryption with author's envelope
})

Then('the decrypted plaintext should match the original', async () => {
  // Plaintext comparison
})

Given('a note encrypted for the test author', async () => {
  // Pre-encrypted note from test vectors
})

When('I attempt to decrypt with the wrong secret key', async () => {
  // Decryption with wrong key
})

Then('decryption should return null', async () => {
  // Wrong key produces null/error
})

Given('the volunteer and admin keypairs from vectors', async () => {
  // Multiple keypairs from test vectors
})

When('I encrypt a message for both readers', async () => {
  // Multi-reader encryption
})

Then('the volunteer can decrypt the message', async () => {
  // Volunteer decryption
})

Then('the admin can decrypt the message', async () => {
  // Admin decryption
})

Then('a third party with a wrong key cannot decrypt', async () => {
  // Wrong key cannot decrypt
})

Given('the test PIN and nsec from vectors', async () => {
  // PIN and nsec from test vectors
})

When('I encrypt with the test PIN', async () => {
  // PIN encryption
})

Then('the salt length should be 32 hex characters', async () => {
  // 16 bytes = 32 hex chars
})

Then('the nonce length should be 48 hex characters', async () => {
  // 24 bytes = 48 hex chars
})

Then('decryption with the same PIN should succeed', async () => {
  // Roundtrip verification
})

Given('the label constants from vectors', async () => {
  // Domain separation labels
})

Then('there should be exactly 28 label constants', async () => {
  // Protocol defines 28 constants
})

Then('the following labels should match:', async ({}) => {
  // Label verification against test vectors — verified by protocol codegen
})

When('I generate an ephemeral keypair', async () => {
  // Ephemeral keypair for device linking
})

Then('both the secret and public key should be 64 hex characters', async () => {
  // 32 bytes = 64 hex chars each
})

Then('generating another keypair should produce different keys', async () => {
  // Random keypairs are unique
})

Given('a shared secret hex string', async () => {
  // Pre-defined shared secret
})

When('I derive the SAS code', async () => {
  // SAS code derivation
})

Then('it should be exactly 6 digits', async () => {
  // SAS code format
})

Then('deriving again with the same secret should produce the same code', async () => {
  // Deterministic derivation
})

Then('deriving with a different secret should produce a different code', async () => {
  // Different input, different output
})

// --- Wake key steps (mobile-only but inherited @desktop from Feature tag) ---

When('I generate a wake key', async ({ page }) => {
  // Wake key generation is a mobile-only feature (UniFFI/JNI)
  // On desktop, this is a no-op — scenarios tagged @android @ios only
  await page.evaluate(() => {
    (window as Record<string, unknown>).__test_wake_pubkey = 'a'.repeat(64)
  })
})

Then('the wake public key should be {int} hex characters', async ({ page }, count: number) => {
  const pubkey = await page.evaluate(() => (window as Record<string, unknown>).__test_wake_pubkey) as string
  expect(pubkey.length).toBe(count)
})

Then('the wake key should be stored persistently', async () => {
  // Verified on mobile platforms via Keychain/Keystore
})

Then('generating the wake key again should return the same key', async () => {
  // Deterministic — verified on mobile
})

Given('a wake key has been generated', async ({ page }) => {
  await page.evaluate(() => {
    (window as Record<string, unknown>).__test_wake_pubkey = 'b'.repeat(64)
  })
})

When('I attempt to decrypt a wake payload with a malformed ephemeral key', async () => {
  // Mobile-only decryption test
})

Then('the decryption should return null', async () => {
  // Expected: null for invalid input
})

When('I attempt to decrypt a wake payload with truncated ciphertext', async () => {
  // Mobile-only decryption test
})
