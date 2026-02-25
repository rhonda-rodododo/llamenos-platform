import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import type { EncryptedFileMetadata, RecipientEnvelope } from '@shared/types'
import { LABEL_FILE_KEY, LABEL_FILE_METADATA } from '@shared/crypto-labels'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

/**
 * ECIES key wrapping — wraps a symmetric file key for a given recipient public key.
 * Uses the same pattern as encryptForPublicKey but only for a 32-byte key.
 */
function wrapKeyForPubkey(
  fileKey: Uint8Array,
  recipientPubkeyHex: string,
): { encryptedFileKey: string; ephemeralPubkey: string } {
  const ephemeralSecret = randomBytes(32)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  // Nostr pubkeys are x-only (32 bytes). Prepend 02 for compressed format.
  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)

  // ECDH shared secret
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  // Derive symmetric key
  const label = utf8ToBytes(LABEL_FILE_KEY)
  const keyInput = new Uint8Array(label.length + sharedX.length)
  keyInput.set(label)
  keyInput.set(sharedX, label.length)
  const symmetricKey = sha256(keyInput)

  // Encrypt the file key
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(fileKey)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedFileKey: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
}

/**
 * Unwrap a symmetric file key using the recipient's secret key.
 */
export function unwrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  secretKey: Uint8Array,
): Uint8Array {
  const ephemeralPub = hexToBytes(ephemeralPubkeyHex)

  // ECDH shared secret
  const shared = secp256k1.getSharedSecret(secretKey, ephemeralPub)
  const sharedX = shared.slice(1, 33)

  // Derive symmetric key
  const label = utf8ToBytes(LABEL_FILE_KEY)
  const keyInput = new Uint8Array(label.length + sharedX.length)
  keyInput.set(label)
  keyInput.set(sharedX, label.length)
  const symmetricKey = sha256(keyInput)

  // Decrypt
  const data = hexToBytes(encryptedFileKeyHex)
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  return cipher.decrypt(ciphertext)
}

/**
 * Encrypt a file's metadata for a recipient (using same ECIES as messages).
 */
function encryptMetadataForPubkey(
  metadata: EncryptedFileMetadata,
  recipientPubkeyHex: string,
): { pubkey: string; encryptedContent: string; ephemeralPubkey: string } {
  const ephemeralSecret = randomBytes(32)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  const label = utf8ToBytes(LABEL_FILE_METADATA)
  const keyInput = new Uint8Array(label.length + sharedX.length)
  keyInput.set(label)
  keyInput.set(sharedX, label.length)
  const symmetricKey = sha256(keyInput)

  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const plaintext = utf8ToBytes(JSON.stringify(metadata))
  const ciphertext = cipher.encrypt(plaintext)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    pubkey: recipientPubkeyHex,
    encryptedContent: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
}

/**
 * Decrypt file metadata using the recipient's secret key.
 */
export function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
  secretKey: Uint8Array,
): EncryptedFileMetadata | null {
  try {
    const ephemeralPub = hexToBytes(ephemeralPubkeyHex)
    const shared = secp256k1.getSharedSecret(secretKey, ephemeralPub)
    const sharedX = shared.slice(1, 33)

    const label = utf8ToBytes(LABEL_FILE_METADATA)
    const keyInput = new Uint8Array(label.length + sharedX.length)
    keyInput.set(label)
    keyInput.set(sharedX, label.length)
    const symmetricKey = sha256(keyInput)

    const data = hexToBytes(encryptedContentHex)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(symmetricKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    return JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    return null
  }
}

export interface EncryptedFileUpload {
  encryptedContent: Uint8Array
  recipientEnvelopes: RecipientEnvelope[]
  encryptedMetadata: Array<{
    pubkey: string
    encryptedContent: string
    ephemeralPubkey: string
  }>
}

/**
 * Encrypt a file for multiple recipients.
 * Uses a single random symmetric key to encrypt the file content once,
 * then wraps that key for each recipient using ECIES.
 */
export async function encryptFile(
  file: File,
  recipientPubkeys: string[],
): Promise<EncryptedFileUpload> {
  const plaintextBytes = new Uint8Array(await file.arrayBuffer())

  // Compute checksum
  const hashBuffer = await crypto.subtle.digest('SHA-256', plaintextBytes)
  const checksum = bytesToHex(new Uint8Array(hashBuffer))

  const metadata: EncryptedFileMetadata = {
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    checksum,
  }

  // Generate random symmetric key for file content
  const fileKey = randomBytes(32)
  const fileNonce = randomBytes(24)
  const cipher = xchacha20poly1305(fileKey, fileNonce)
  const encryptedContent = cipher.encrypt(plaintextBytes)

  // Pack: nonce (24) + ciphertext
  const packed = new Uint8Array(fileNonce.length + encryptedContent.length)
  packed.set(fileNonce)
  packed.set(encryptedContent, fileNonce.length)

  // Wrap the file key for each recipient
  const recipientEnvelopes: RecipientEnvelope[] = recipientPubkeys.map(pubkey => ({
    pubkey,
    ...wrapKeyForPubkey(fileKey, pubkey),
  }))

  // Encrypt metadata for each recipient
  const encryptedMetadataList = recipientPubkeys.map(pubkey =>
    encryptMetadataForPubkey(metadata, pubkey)
  )

  return {
    encryptedContent: packed,
    recipientEnvelopes,
    encryptedMetadata: encryptedMetadataList,
  }
}

/**
 * Decrypt a file given the encrypted content, key envelope, and user's secret key.
 */
export async function decryptFile(
  encryptedContent: ArrayBuffer,
  envelope: RecipientEnvelope,
  secretKey: Uint8Array,
): Promise<{ blob: Blob; checksum: string }> {
  // Unwrap the file key
  const fileKey = unwrapFileKey(envelope.encryptedFileKey, envelope.ephemeralPubkey, secretKey)

  // Extract nonce and decrypt
  const data = new Uint8Array(encryptedContent)
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const cipher = xchacha20poly1305(fileKey, nonce)
  const plaintext = cipher.decrypt(ciphertext)

  // Compute checksum for verification
  const hashBuffer = await crypto.subtle.digest('SHA-256', plaintext.buffer as ArrayBuffer)
  const checksum = bytesToHex(new Uint8Array(hashBuffer))

  return {
    blob: new Blob([plaintext.buffer as ArrayBuffer]),
    checksum,
  }
}

/**
 * Re-wrap a file's symmetric key for a new recipient.
 * Admin decrypts the key with their secret, then re-encrypts for the new pubkey.
 */
export function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  adminSecretKey: Uint8Array,
  newRecipientPubkeyHex: string,
): RecipientEnvelope {
  // Decrypt with admin key
  const fileKey = unwrapFileKey(encryptedFileKeyHex, ephemeralPubkeyHex, adminSecretKey)

  // Re-encrypt for new recipient
  const { encryptedFileKey, ephemeralPubkey } = wrapKeyForPubkey(fileKey, newRecipientPubkeyHex)

  return {
    pubkey: newRecipientPubkeyHex,
    encryptedFileKey,
    ephemeralPubkey,
  }
}
