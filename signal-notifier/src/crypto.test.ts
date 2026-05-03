import { describe, expect, test } from 'vitest'
import { deriveKey, encrypt, decrypt, generateSalt } from './crypto'

describe('store crypto', () => {
  const secret = 'my-test-secret-for-signal-notifier'
  const salt = generateSalt(secret)
  const key = deriveKey(secret, salt)

  test('deriveKey produces a 32-byte key', () => {
    const len = key.length
    expect(len).toBe(32)
  })

  test('encrypt + decrypt roundtrip', () => {
    const plaintext = '+15551234567'
    const ciphertext = encrypt(plaintext, key)
    expect(ciphertext).not.toBe(plaintext)
    expect(ciphertext.length).toBeGreaterThan(plaintext.length)

    const decrypted = decrypt(ciphertext, key)
    expect(decrypted).toBe(plaintext)
  })

  test('decrypt returns null for tampered ciphertext', () => {
    const plaintext = '+15551234567'
    const ciphertext = encrypt(plaintext, key)
    const tampered = ciphertext.slice(0, -4) + 'abcd'
    expect(decrypt(tampered, key)).toBeNull()
  })

  test('decrypt returns null for wrong key', () => {
    const plaintext = '+15551234567'
    const ciphertext = encrypt(plaintext, key)
    const wrongKey = deriveKey('wrong-secret', generateSalt('wrong-secret'))
    expect(decrypt(ciphertext, wrongKey)).toBeNull()
  })

  test('generateSalt is deterministic for same secret', () => {
    const salt1 = generateSalt(secret)
    const salt2 = generateSalt(secret)
    expect(salt1).toBe(salt2)
  })

  test('generateSalt produces different salts for different secrets', () => {
    const salt1 = generateSalt('secret-a')
    const salt2 = generateSalt('secret-b')
    expect(salt1).not.toBe(salt2)
  })
})
