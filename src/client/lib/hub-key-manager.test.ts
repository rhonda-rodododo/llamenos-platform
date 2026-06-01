import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock platform.ts — hub key crypto now delegates to Rust IPC
vi.mock('./platform', () => {
  // In-memory mock hub key for roundtrip testing
  let storedHubKey: Uint8Array | null = null

  return {
    hpkeUnwrapAndSetHubKey: vi.fn(async () => {
      storedHubKey = new Uint8Array(32)
      crypto.getRandomValues(storedHubKey)
    }),
    generateHubKeyInState: vi.fn(async () => {
      storedHubKey = new Uint8Array(32)
      crypto.getRandomValues(storedHubKey)
    }),
    wrapHubKeyForMember: vi.fn(async () => ({
      v: 3,
      labelId: 3,
      enc: 'mock-enc',
      ct: 'mock-ct',
    })),
    encryptHubField: vi.fn(async (plaintext: string, _label: string) => {
      // Simple mock: base64-encode for roundtrip testing
      return btoa(plaintext)
    }),
    decryptHubField: vi.fn(async (ciphertextHex: string, _label: string) => {
      try {
        return atob(ciphertextHex)
      } catch {
        return null
      }
    }),
  }
})

import { generateHubKey, encryptForHub, decryptFromHub, wrapHubKeyForMember, wrapHubKeyForMembers, rotateHubKey } from './hub-key-manager'
import { generateHubKeyInState, wrapHubKeyForMember as platformWrap } from './platform'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateHubKey', () => {
  it('delegates to Rust CryptoState', async () => {
    await generateHubKey()
    expect(generateHubKeyInState).toHaveBeenCalledOnce()
  })
})

describe('encryptForHub / decryptFromHub', () => {
  it('delegates encryption and decryption to Rust IPC', async () => {
    const plaintext = 'Hello, hub world!'
    const label = 'llamenos:hub-event'
    const encrypted = await encryptForHub(plaintext, label)
    expect(encrypted).toBeTruthy()
    const decrypted = await decryptFromHub(encrypted, label)
    expect(decrypted).toBe(plaintext)
  })
})

describe('wrapHubKeyForMember', () => {
  it('returns a RecipientEnvelope with pubkey', async () => {
    const pubkey = 'aa'.repeat(32)
    const envelope = await wrapHubKeyForMember(pubkey)
    expect(envelope.pubkey).toBe(pubkey)
    expect(platformWrap).toHaveBeenCalledWith(pubkey, 'llamenos:hub-key-wrap', '')
  })
})

describe('wrapHubKeyForMembers', () => {
  it('wraps for each member', async () => {
    const pubkeys = ['aa'.repeat(32), 'bb'.repeat(32)]
    const envelopes = await wrapHubKeyForMembers(pubkeys)
    expect(envelopes).toHaveLength(2)
    expect(envelopes[0].pubkey).toBe(pubkeys[0])
    expect(envelopes[1].pubkey).toBe(pubkeys[1])
  })
})

describe('rotateHubKey', () => {
  it('generates new key and wraps for all members', async () => {
    const pubkeys = ['aa'.repeat(32), 'bb'.repeat(32)]
    const result = await rotateHubKey(pubkeys)
    expect(generateHubKeyInState).toHaveBeenCalledOnce()
    expect(result.envelopes).toHaveLength(2)
  })
})
