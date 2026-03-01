/**
 * Two-tier ECIES push payload encryption (Epic 86).
 *
 * Wake tier: encrypted with device-specific wake key — decryptable without PIN.
 * Full tier: encrypted with volunteer's Nostr pubkey — decryptable only after PIN unlock.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_PUSH_WAKE, LABEL_PUSH_FULL } from '@shared/crypto-labels'
import type { WakePayload, FullPushPayload } from '../types'

/**
 * ECIES encrypt a payload for a single recipient pubkey with domain separation.
 */
function eciesEncrypt(plaintext: string, recipientPubkeyHex: string, label: string): string {
  const ephemeralSecret = new Uint8Array(32)
  crypto.getRandomValues(ephemeralSecret)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  // Recipient pubkey is x-only (32 bytes) — add 02 prefix for compressed
  const recipientCompressed = hexToBytes(
    recipientPubkeyHex.length === 64 ? '02' + recipientPubkeyHex : recipientPubkeyHex,
  )
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  // Domain-separated key derivation: SHA256(label || sharedX)
  const labelBytes = utf8ToBytes(label)
  const keyInput = new Uint8Array(labelBytes.length + sharedX.length)
  keyInput.set(labelBytes)
  keyInput.set(sharedX, labelBytes.length)
  const symmetricKey = sha256(keyInput)

  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))

  // Pack: ephemeralPubkey(33) + nonce(24) + ciphertext
  const packed = new Uint8Array(33 + nonce.length + ciphertext.length)
  packed.set(ephemeralPublicKey)
  packed.set(nonce, 33)
  packed.set(ciphertext, 33 + nonce.length)

  return bytesToHex(packed)
}

/**
 * Encrypt wake-tier push payload for a specific device.
 * Uses the device's wake key — accessible without user's PIN.
 */
export function encryptWakePayload(payload: WakePayload, deviceWakeKeyPublic: string): string {
  return eciesEncrypt(JSON.stringify(payload), deviceWakeKeyPublic, LABEL_PUSH_WAKE)
}

/**
 * Encrypt full-tier push payload for a volunteer's Nostr identity.
 * Requires the volunteer's nsec (PIN unlock) to decrypt.
 */
export function encryptFullPayload(payload: FullPushPayload, volunteerPubkey: string): string {
  return eciesEncrypt(JSON.stringify(payload), volunteerPubkey, LABEL_PUSH_FULL)
}
