import { describe, it, expect } from 'bun:test'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { encryptWakePayload, encryptFullPayload } from '@worker/lib/push-encryption'
import { LABEL_PUSH_WAKE, LABEL_PUSH_FULL } from '@shared/crypto-labels'
import type { WakePayload, FullPushPayload } from '@worker/types/infra'

/**
 * Decrypt an ECIES-encrypted hex payload using recipient's private key and domain label.
 */
function eciesDecrypt(encryptedHex: string, recipientSecretHex: string, label: string): string {
  const packed = hexToBytes(encryptedHex)
  const ephemeralPubkey = packed.slice(0, 33)
  const nonce = packed.slice(33, 57)
  const ciphertext = packed.slice(57)

  const shared = secp256k1.getSharedSecret(hexToBytes(recipientSecretHex), ephemeralPubkey)
  const sharedX = shared.slice(1, 33)

  const labelBytes = utf8ToBytes(label)
  const keyInput = new Uint8Array(labelBytes.length + sharedX.length)
  keyInput.set(labelBytes)
  keyInput.set(sharedX, labelBytes.length)
  const symmetricKey = sha256(keyInput)

  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const plaintext = cipher.decrypt(ciphertext)
  return new TextDecoder().decode(plaintext)
}

describe('Push Encryption', () => {
  // Generate a test keypair
  const secretKeyBytes = hexToBytes('a'.repeat(64)) // deterministic 32-byte secret
  const secretKey = 'a'.repeat(64)
  const publicKey = bytesToHex(secp256k1.getPublicKey(secretKeyBytes, true)).slice(2) // x-only (remove 02 prefix)

  const wakePayload: WakePayload = {
    hubId: 'hub-123',
    type: 'message',
    conversationId: 'conv-456',
  }

  const fullPayload: FullPushPayload = {
    hubId: 'hub-123',
    type: 'message',
    conversationId: 'conv-456',
    previewText: 'Hello there',
    senderLast4: '1234',
  }

  it('encrypts and decrypts wake-tier payload round-trip', () => {
    const encrypted = encryptWakePayload(wakePayload, publicKey)
    const decrypted = eciesDecrypt(encrypted, secretKey, LABEL_PUSH_WAKE)

    expect(JSON.parse(decrypted)).toEqual(wakePayload)
  })

  it('encrypts and decrypts full-tier payload round-trip', () => {
    const encrypted = encryptFullPayload(fullPayload, publicKey)
    const decrypted = eciesDecrypt(encrypted, secretKey, LABEL_PUSH_FULL)

    expect(JSON.parse(decrypted)).toEqual(fullPayload)
  })

  it('uses domain separation — wake label cannot decrypt full payload', () => {
    const encrypted = encryptFullPayload(fullPayload, publicKey)

    // Attempting to decrypt with wrong label should throw (auth tag mismatch)
    expect(() => eciesDecrypt(encrypted, secretKey, LABEL_PUSH_WAKE)).toThrow()
  })

  it('produces different ciphertext on each call (randomized ephemeral key)', () => {
    const enc1 = encryptWakePayload(wakePayload, publicKey)
    const enc2 = encryptWakePayload(wakePayload, publicKey)

    expect(enc1).not.toBe(enc2)
  })

  it('cross-tier isolation — full-tier cannot be decrypted with wake label', () => {
    const wakeEncrypted = encryptWakePayload(wakePayload, publicKey)
    const fullEncrypted = encryptFullPayload(fullPayload, publicKey)

    // Each can only be decrypted with its own label
    expect(() => eciesDecrypt(wakeEncrypted, secretKey, LABEL_PUSH_FULL)).toThrow()
    expect(() => eciesDecrypt(fullEncrypted, secretKey, LABEL_PUSH_WAKE)).toThrow()

    // Correct labels work
    expect(JSON.parse(eciesDecrypt(wakeEncrypted, secretKey, LABEL_PUSH_WAKE))).toEqual(wakePayload)
    expect(JSON.parse(eciesDecrypt(fullEncrypted, secretKey, LABEL_PUSH_FULL))).toEqual(fullPayload)
  })
})
