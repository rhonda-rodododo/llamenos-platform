import { describe, it, expect } from 'vitest'
import { aesGcmEncrypt, aesGcmDecrypt } from './platform'

describe('aesGcmEncrypt / aesGcmDecrypt roundtrip', () => {
  it('encrypts and decrypts plaintext', async () => {
    const keyHex = '0'.repeat(64) // 32 bytes = 256 bits
    const plaintext = 'Hello, world!'

    const encrypted = await aesGcmEncrypt(plaintext, keyHex)
    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(0)

    const decrypted = await aesGcmDecrypt(encrypted, keyHex)
    expect(decrypted).toBe(plaintext)
  })

  it('handles unicode content', async () => {
    const keyHex = 'f'.repeat(64)
    const plaintext = 'Unicode: 🎉 ñ 中文'

    const encrypted = await aesGcmEncrypt(plaintext, keyHex)
    const decrypted = await aesGcmDecrypt(encrypted, keyHex)
    expect(decrypted).toBe(plaintext)
  })

  it('handles empty string', async () => {
    const keyHex = 'a'.repeat(64)
    const plaintext = ''

    const encrypted = await aesGcmEncrypt(plaintext, keyHex)
    const decrypted = await aesGcmDecrypt(encrypted, keyHex)
    expect(decrypted).toBe('')
  })

  it('produces different ciphertexts for same plaintext (IV randomness)', async () => {
    const keyHex = 'b'.repeat(64)
    const plaintext = 'Same text'

    const encrypted1 = await aesGcmEncrypt(plaintext, keyHex)
    const encrypted2 = await aesGcmEncrypt(plaintext, keyHex)

    expect(encrypted1).not.toBe(encrypted2)
  })

  it('fails decryption with wrong key', async () => {
    const keyHex = 'c'.repeat(64)
    const wrongKey = 'd'.repeat(64)
    const plaintext = 'Secret'

    const encrypted = await aesGcmEncrypt(plaintext, keyHex)
    await expect(aesGcmDecrypt(encrypted, wrongKey)).rejects.toThrow()
  })

  it('fails decryption with tampered ciphertext', async () => {
    const keyHex = 'e'.repeat(64)
    const plaintext = 'Secret'

    const encrypted = await aesGcmEncrypt(plaintext, keyHex)
    const tampered = encrypted.slice(0, -2) + 'ff'

    await expect(aesGcmDecrypt(tampered, keyHex)).rejects.toThrow()
  })
})
