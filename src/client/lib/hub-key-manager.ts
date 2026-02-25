/**
 * Hub Key Manager
 *
 * Hub-wide symmetric encryption key management. Each hub has a random 32-byte
 * key that is ECIES-wrapped individually for each member who needs it.
 *
 * Key lifecycle:
 *   1. Admin generates hub key via generateHubKey()
 *   2. Key is wrapped for each member via wrapHubKeyForMember()
 *   3. Members fetch their wrapped key from GET /api/hub/key
 *   4. Members unwrap with their secret key via unwrapHubKey()
 *   5. Hub key encrypts/decrypts hub-scoped data via encryptForHub()/decryptFromHub()
 *   6. On rotation, admin generates new key + re-wraps for all members
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { eciesWrapKey, eciesUnwrapKey, type KeyEnvelope, type RecipientKeyEnvelope } from './crypto'
import { LABEL_HUB_KEY_WRAP } from '@shared/crypto-labels'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

/**
 * Generate a random 32-byte hub key.
 * This is NOT derived from any user key — it's pure random.
 */
export function generateHubKey(): Uint8Array {
  return randomBytes(32)
}

/**
 * Wrap a hub key for a specific member using ECIES.
 * Uses LABEL_HUB_KEY_WRAP domain separation to prevent cross-context attacks.
 */
export function wrapHubKeyForMember(
  hubKey: Uint8Array,
  memberPubkeyHex: string,
): RecipientKeyEnvelope {
  return {
    pubkey: memberPubkeyHex,
    ...eciesWrapKey(hubKey, memberPubkeyHex, LABEL_HUB_KEY_WRAP),
  }
}

/**
 * Wrap a hub key for multiple members at once.
 * Returns an array of RecipientKeyEnvelopes.
 */
export function wrapHubKeyForMembers(
  hubKey: Uint8Array,
  memberPubkeys: string[],
): RecipientKeyEnvelope[] {
  return memberPubkeys.map(pk => wrapHubKeyForMember(hubKey, pk))
}

/**
 * Unwrap a hub key from an ECIES envelope using the member's secret key.
 */
export function unwrapHubKey(
  envelope: KeyEnvelope,
  secretKey: Uint8Array,
): Uint8Array {
  return eciesUnwrapKey(envelope, secretKey, LABEL_HUB_KEY_WRAP)
}

/**
 * Encrypt arbitrary data with the hub key using XChaCha20-Poly1305.
 * Returns hex: nonce(24) + ciphertext.
 */
export function encryptForHub(
  plaintext: string,
  hubKey: Uint8Array,
): string {
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(hubKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

/**
 * Decrypt hub-encrypted data using the hub key.
 * Returns null on decryption failure (wrong key, corrupted data, etc.).
 */
export function decryptFromHub(
  packed: string,
  hubKey: Uint8Array,
): string | null {
  try {
    const data = hexToBytes(packed)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(hubKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

/**
 * Rotate the hub key: generate a new key and wrap it for all current members.
 * Returns the new key and all member envelopes.
 *
 * The caller is responsible for:
 * 1. Re-encrypting any hub-scoped data with the new key
 * 2. Storing the new envelopes server-side
 * 3. Distributing via GET /api/hub/key
 */
export function rotateHubKey(
  memberPubkeys: string[],
): { hubKey: Uint8Array; envelopes: RecipientKeyEnvelope[] } {
  const hubKey = generateHubKey()
  const envelopes = wrapHubKeyForMembers(hubKey, memberPubkeys)
  return { hubKey, envelopes }
}
