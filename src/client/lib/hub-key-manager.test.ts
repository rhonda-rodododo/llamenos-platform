import { describe, it, expect } from 'vitest'
import { generateHubKey, encryptForHub, decryptFromHub } from './hub-key-manager'

describe('generateHubKey', () => {
  it('produces 32-byte keys', () => {
    const key = generateHubKey()
    expect(key.length).toBe(32)
  })

  it('produces different keys on successive calls', () => {
    const key1 = generateHubKey()
    const key2 = generateHubKey()
    expect(key1).not.toEqual(key2)
  })

  it('produces keys with high entropy', () => {
    const key = generateHubKey()
    const zeros = key.filter(b => b === 0).length
    const maxZeros = 4
    expect(zeros).toBeLessThanOrEqual(maxZeros)
  })

  it('does not produce all-zero key', () => {
    const key = generateHubKey()
    const isAllZero = key.every(b => b === 0)
    expect(isAllZero).toBe(false)
  })
})

describe('encryptForHub / decryptFromHub roundtrip', () => {
  it('encrypts and decrypts plaintext', () => {
    const key = generateHubKey()
    const plaintext = 'Hello, hub world!'

    const encrypted = encryptForHub(plaintext, key)
    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(0)

    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('handles empty string', () => {
    const key = generateHubKey()
    const encrypted = encryptForHub('', key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe('')
  })

  it('handles unicode content', () => {
    const key = generateHubKey()
    const plaintext = 'Unicode: 🎉 ñ 中文 العربية'

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('handles large plaintext', () => {
    const key = generateHubKey()
    const plaintext = 'x'.repeat(10000)

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertexts for same plaintext (nonce randomness)', () => {
    const key = generateHubKey()
    const plaintext = 'Same text'

    const encrypted1 = encryptForHub(plaintext, key)
    const encrypted2 = encryptForHub(plaintext, key)

    expect(encrypted1).not.toBe(encrypted2)
  })

  it('fails decryption with wrong key', () => {
    const key1 = generateHubKey()
    const key2 = generateHubKey()
    const plaintext = 'Secret'

    const encrypted = encryptForHub(plaintext, key1)
    const decrypted = decryptFromHub(encrypted, key2)
    expect(decrypted).toBeNull()
  })

  it('fails decryption with corrupted ciphertext', () => {
    const key = generateHubKey()
    const plaintext = 'Secret'

    const encrypted = encryptForHub(plaintext, key)
    const corrupted = encrypted.slice(0, -2) + 'ff'

    const decrypted = decryptFromHub(corrupted, key)
    expect(decrypted).toBeNull()
  })

  it('fails decryption with truncated ciphertext', () => {
    const key = generateHubKey()
    const plaintext = 'Secret'

    const encrypted = encryptForHub(plaintext, key)
    const truncated = encrypted.slice(0, 24)

    const decrypted = decryptFromHub(truncated, key)
    expect(decrypted).toBeNull()
  })

  it('fails decryption with only nonce (no ciphertext)', () => {
    const key = generateHubKey()
    const encrypted = encryptForHub('x', key)
    const nonceOnly = encrypted.slice(0, 24)

    const decrypted = decryptFromHub(nonceOnly, key)
    expect(decrypted).toBeNull()
  })

  it('fails decryption with invalid hex', () => {
    const key = generateHubKey()
    const decrypted = decryptFromHub('not-hex!!!', key)
    expect(decrypted).toBeNull()
  })

  it('fails decryption with empty string', () => {
    const key = generateHubKey()
    const decrypted = decryptFromHub('', key)
    expect(decrypted).toBeNull()
  })

  it('handles plaintext with special characters', () => {
    const key = generateHubKey()
    const plaintext = '\x00\x01\x02\x03\xff\xfe\xfd\xfc'

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('handles multiline plaintext', () => {
    const key = generateHubKey()
    const plaintext = 'line1\nline2\nline3\r\nline4'

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })
})

describe('encryptForHub edge cases', () => {
  it('handles key with all zeros', () => {
    const key = new Uint8Array(32)
    const plaintext = 'test'

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('handles key with all 0xff', () => {
    const key = new Uint8Array(32).fill(0xff)
    const plaintext = 'test'

    const encrypted = encryptForHub(plaintext, key)
    const decrypted = decryptFromHub(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })
})
