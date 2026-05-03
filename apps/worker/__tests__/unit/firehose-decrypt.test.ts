/**
 * Firehose encrypt → decrypt roundtrip tests.
 *
 * Verifies that:
 * 1. Window key path: observer encrypts with window key → agent decrypts
 * 2. Legacy envelope path: encryptMessageForStorage → agent decryptEnvelope
 * 3. Version byte is correctly handled in ECIES wrapping
 * 4. Label consistency between encrypt and decrypt sides
 */
import { describe, it, expect } from 'bun:test'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import {
  encryptMessageForStorage,
  eciesWrapKeyForRecipient,
} from '@worker/lib/crypto'
import { LABEL_FIREHOSE_BUFFER_ENCRYPT, LABEL_MESSAGE } from '@shared/crypto-labels'

/** Generate a test secp256k1 keypair (nsec + x-only pubkey). */
function generateTestKeypair() {
  const nsecBytes = new Uint8Array(32)
  crypto.getRandomValues(nsecBytes)
  const fullPub = secp256k1.getPublicKey(nsecBytes, true) // 33-byte compressed
  const xOnlyPubHex = bytesToHex(fullPub.slice(1)) // 32-byte x-only
  return { nsecBytes, xOnlyPubHex }
}

/** ECIES unseal: derive shared secret → HKDF → unwrap key. */
function eciesUnseal(
  wrappedKeyHex: string,
  ephemeralPubHex: string,
  nsecBytes: Uint8Array,
  label: string,
): Uint8Array {
  const ephemeralPubBytes = hexToBytes(ephemeralPubHex)
  const sharedPoint = secp256k1.getSharedSecret(nsecBytes, ephemeralPubBytes)
  const sharedX = sharedPoint.slice(1, 33)

  const symKey = hkdf(sha256, sharedX, new Uint8Array(0), utf8ToBytes(label), 32)

  const wrappedKeyBytes = hexToBytes(wrappedKeyHex)
  // Format: version(1) + nonce(24) + ciphertext
  const keyNonce = wrappedKeyBytes.slice(1, 25)
  const keyCiphertext = wrappedKeyBytes.slice(25)
  const keyCipher = xchacha20poly1305(symKey, keyNonce)
  return keyCipher.decrypt(keyCiphertext)
}

/** Decrypt XChaCha20-Poly1305 content: nonce(24) + ciphertext. */
function decryptContent(encryptedHex: string, key: Uint8Array): string {
  const bytes = hexToBytes(encryptedHex)
  const nonce = bytes.slice(0, 24)
  const ciphertext = bytes.slice(24)
  const cipher = xchacha20poly1305(key, nonce)
  return new TextDecoder().decode(cipher.decrypt(ciphertext))
}

describe('firehose decrypt roundtrip', () => {
  describe('window key path', () => {
    it('encrypts and decrypts a message using a window key', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const plaintext = 'Police arresting people at 5th and Main'

      // --- Observer side: create window key, encrypt message ---

      // 1. Generate window key
      const windowKeyBytes = new Uint8Array(32)
      crypto.getRandomValues(windowKeyBytes)

      // 2. ECIES-wrap window key for agent
      const { wrappedKey, ephemeralPubkey } = eciesWrapKeyForRecipient(
        windowKeyBytes,
        xOnlyPubHex,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      // 3. Encrypt message with window key
      const nonce = new Uint8Array(24)
      crypto.getRandomValues(nonce)
      const cipher = xchacha20poly1305(windowKeyBytes, nonce)
      const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))
      const packed = new Uint8Array(nonce.length + ciphertext.length)
      packed.set(nonce)
      packed.set(ciphertext, nonce.length)
      const encryptedContent = bytesToHex(packed)

      // --- Agent side: unseal window key, decrypt message ---

      // 4. Unseal window key
      const unsealedKey = eciesUnseal(
        wrappedKey,
        ephemeralPubkey,
        nsecBytes,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      // 5. Decrypt message
      const decrypted = decryptContent(encryptedContent, unsealedKey)

      expect(decrypted).toBe(plaintext)
    })

    it('window key is reusable across multiple messages', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const messages = [
        'First message in window',
        'Second message in window',
        'Third message — unicode: ¡Auxilio! 🚨',
      ]

      const windowKeyBytes = new Uint8Array(32)
      crypto.getRandomValues(windowKeyBytes)

      const { wrappedKey, ephemeralPubkey } = eciesWrapKeyForRecipient(
        windowKeyBytes,
        xOnlyPubHex,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      // Encrypt all messages with same window key
      const encryptedMessages = messages.map((msg) => {
        const nonce = new Uint8Array(24)
        crypto.getRandomValues(nonce)
        const cipher = xchacha20poly1305(windowKeyBytes, nonce)
        const ct = cipher.encrypt(utf8ToBytes(msg))
        const packed = new Uint8Array(nonce.length + ct.length)
        packed.set(nonce)
        packed.set(ct, nonce.length)
        return bytesToHex(packed)
      })

      // Unseal window key once
      const unsealedKey = eciesUnseal(wrappedKey, ephemeralPubkey, nsecBytes, LABEL_FIREHOSE_BUFFER_ENCRYPT)

      // Decrypt each message
      const decryptedMessages = encryptedMessages.map((enc) => decryptContent(enc, unsealedKey))

      expect(decryptedMessages).toEqual(messages)
    })
  })

  describe('legacy envelope path', () => {
    it('encrypts with LABEL_FIREHOSE_BUFFER_ENCRYPT and decrypts correctly', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const plaintext = 'Legacy envelope message content'

      // Encrypt using encryptMessageForStorage with firehose label
      const { encryptedContent, readerEnvelopes } = encryptMessageForStorage(
        plaintext,
        [xOnlyPubHex],
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      expect(readerEnvelopes).toHaveLength(1)
      const envelope = readerEnvelopes[0]
      expect(envelope.pubkey).toBe(xOnlyPubHex)

      // Unseal the per-message key using firehose label
      const messageKey = eciesUnseal(
        envelope.wrappedKey,
        envelope.ephemeralPubkey,
        nsecBytes,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      // Decrypt content
      const decrypted = decryptContent(encryptedContent, messageKey)
      expect(decrypted).toBe(plaintext)
    })

    it('fails to decrypt when labels mismatch', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const plaintext = 'This should fail with wrong label'

      // Encrypt with LABEL_MESSAGE (the old broken behavior)
      const { readerEnvelopes } = encryptMessageForStorage(
        plaintext,
        [xOnlyPubHex],
        LABEL_MESSAGE,
      )

      const envelope = readerEnvelopes[0]

      // Try to decrypt with LABEL_FIREHOSE_BUFFER_ENCRYPT — should fail
      expect(() => {
        eciesUnseal(
          envelope.wrappedKey,
          envelope.ephemeralPubkey,
          nsecBytes,
          LABEL_FIREHOSE_BUFFER_ENCRYPT,
        )
      }).toThrow()
    })
  })

  describe('version byte handling', () => {
    it('wrappedKey starts with version byte 0x02', () => {
      const { xOnlyPubHex } = generateTestKeypair()
      const testKey = new Uint8Array(32)
      crypto.getRandomValues(testKey)

      const { wrappedKey } = eciesWrapKeyForRecipient(
        testKey,
        xOnlyPubHex,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      const wrappedBytes = hexToBytes(wrappedKey)
      expect(wrappedBytes[0]).toBe(0x02) // ECIES_VERSION_V2
    })

    it('reading nonce from offset 0 (skipping version byte) fails', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const testKey = new Uint8Array(32)
      crypto.getRandomValues(testKey)

      const { wrappedKey, ephemeralPubkey } = eciesWrapKeyForRecipient(
        testKey,
        xOnlyPubHex,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      // Derive shared secret correctly
      const ephemeralPubBytes = hexToBytes(ephemeralPubkey)
      const sharedPoint = secp256k1.getSharedSecret(nsecBytes, ephemeralPubBytes)
      const sharedX = sharedPoint.slice(1, 33)
      const symKey = hkdf(sha256, sharedX, new Uint8Array(0), utf8ToBytes(LABEL_FIREHOSE_BUFFER_ENCRYPT), 32)

      const wrappedBytes = hexToBytes(wrappedKey)

      // WRONG: read nonce from offset 0 (includes version byte)
      const badNonce = wrappedBytes.slice(0, 24)
      const badCiphertext = wrappedBytes.slice(24)
      const badCipher = xchacha20poly1305(symKey, badNonce)
      expect(() => badCipher.decrypt(badCiphertext)).toThrow()
    })

    it('reading nonce from offset 1 (correct) succeeds', () => {
      const { nsecBytes, xOnlyPubHex } = generateTestKeypair()
      const testKey = new Uint8Array(32)
      crypto.getRandomValues(testKey)

      const { wrappedKey, ephemeralPubkey } = eciesWrapKeyForRecipient(
        testKey,
        xOnlyPubHex,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      const unsealedKey = eciesUnseal(
        wrappedKey,
        ephemeralPubkey,
        nsecBytes,
        LABEL_FIREHOSE_BUFFER_ENCRYPT,
      )

      expect(bytesToHex(unsealedKey)).toBe(bytesToHex(testKey))
    })
  })
})
