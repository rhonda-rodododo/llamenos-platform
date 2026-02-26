/**
 * File encryption/decryption.
 *
 * ECIES operations (unwrap, decrypt metadata, rewrap) delegate to Rust via platform.ts.
 * Symmetric file content encryption stays in JS (random key, no nsec involved).
 * Metadata encryption for recipients stays in JS (ephemeral keys, no nsec).
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import type { EncryptedFileMetadata, RecipientEnvelope } from '@shared/types'
import { LABEL_FILE_KEY, LABEL_FILE_METADATA } from '@shared/crypto-labels'
import {
  unwrapFileKey as platformUnwrapFileKey,
  decryptFileMetadata as platformDecryptFileMetadata,
  rewrapFileKey as platformRewrapFileKey,
  eciesWrapKey,
} from './platform'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

/**
 * Unwrap a symmetric file key using CryptoState (nsec stays in Rust).
 * Returns the file key as hex string.
 */
export async function unwrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
): Promise<string> {
  return platformUnwrapFileKey({
    wrappedKey: encryptedFileKeyHex,
    ephemeralPubkey: ephemeralPubkeyHex,
  })
}

/**
 * Encrypt a file's metadata for a recipient (ECIES with LABEL_FILE_METADATA domain separation).
 * Uses ephemeral keys — no nsec involved, stays in JS.
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
 * Decrypt file metadata using CryptoState (nsec stays in Rust).
 */
export async function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
): Promise<EncryptedFileMetadata | null> {
  try {
    const json = await platformDecryptFileMetadata(encryptedContentHex, ephemeralPubkeyHex)
    return json ? JSON.parse(json) : null
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
 * then wraps that key for each recipient using ECIES via Rust.
 * No nsec involved — uses ephemeral keys for ECIES wrapping.
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

  // Wrap the file key for each recipient using ECIES via Rust (stateless — ephemeral key)
  const fileKeyHex = bytesToHex(fileKey)
  const recipientEnvelopes: RecipientEnvelope[] = await Promise.all(
    recipientPubkeys.map(async (pubkey) => {
      const { wrappedKey, ephemeralPubkey } = await eciesWrapKey(fileKeyHex, pubkey, LABEL_FILE_KEY)
      return { pubkey, encryptedFileKey: wrappedKey, ephemeralPubkey }
    })
  )

  // Encrypt metadata for each recipient (JS — ephemeral keys, no nsec)
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
 * Decrypt a file given the encrypted content and key envelope.
 * ECIES unwrap goes through CryptoState (Rust); symmetric decryption stays in JS.
 */
export async function decryptFile(
  encryptedContent: ArrayBuffer,
  envelope: RecipientEnvelope,
): Promise<{ blob: Blob; checksum: string }> {
  // Unwrap the file key via Rust CryptoState (returns hex)
  const fileKeyHex = await unwrapFileKey(envelope.encryptedFileKey, envelope.ephemeralPubkey)
  const fileKey = hexToBytes(fileKeyHex)

  // Extract nonce and decrypt (symmetric — stays in JS)
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
 * Re-wrap a file's symmetric key for a new recipient via CryptoState.
 * Admin's nsec stays in Rust — decrypts and re-encrypts in one IPC call.
 */
export async function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  newRecipientPubkeyHex: string,
): Promise<RecipientEnvelope> {
  const envelope = await platformRewrapFileKey(
    encryptedFileKeyHex,
    ephemeralPubkeyHex,
    newRecipientPubkeyHex,
  )
  return {
    pubkey: newRecipientPubkeyHex,
    encryptedFileKey: envelope.wrappedKey,
    ephemeralPubkey: envelope.ephemeralPubkey,
  }
}
