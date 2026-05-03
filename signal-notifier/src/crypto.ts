import { createCipheriv, createDecipheriv, randomBytes, createHmac, hkdfSync } from 'node:crypto'

const AES_KEY_SIZE = 32
const AES_IV_SIZE = 16
const AES_TAG_SIZE = 16

/**
 * Derive an AES-256 key from a secret string using HKDF-SHA256.
 */
export function deriveKey(secret: string, salt: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, salt, 'llamenos-signal-notifier-store', AES_KEY_SIZE))
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded ciphertext with IV and auth tag prepended.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(AES_IV_SIZE)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypt a base64-encoded ciphertext string using AES-256-GCM.
 * Returns the plaintext or null if decryption fails.
 */
export function decrypt(ciphertext: string, key: Buffer): string | null {
  try {
    const data = Buffer.from(ciphertext, 'base64')
    if (data.length < AES_IV_SIZE + AES_TAG_SIZE) return null
    const iv = data.subarray(0, AES_IV_SIZE)
    const tag = data.subarray(AES_IV_SIZE, AES_IV_SIZE + AES_TAG_SIZE)
    const encrypted = data.subarray(AES_IV_SIZE + AES_TAG_SIZE)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Generate a deterministic salt from the secret using HMAC-SHA256.
 * This ensures the salt is derived from the secret itself so we don't
 * need to store it separately, while still providing key separation.
 */
export function generateSalt(secret: string): string {
  return createHmac('sha256', secret).update('llamenos-store-salt').digest('hex').slice(0, 32)
}
