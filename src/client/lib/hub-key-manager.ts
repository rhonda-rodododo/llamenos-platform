/**
 * Hub Key Manager
 *
 * Hub-wide symmetric encryption key management. Each hub has a random 32-byte
 * key that is ECIES-wrapped individually for each member who needs it.
 *
 * ECIES wrap/unwrap operations delegate to Rust via platform.ts.
 * Symmetric hub encrypt/decrypt stays in JS (hub key is shared symmetric, not identity-secret).
 *
 * Key lifecycle:
 *   1. Admin generates hub key via generateHubKey()
 *   2. Key is wrapped for each member via wrapHubKeyForMember() (Rust ECIES)
 *   3. Members fetch their wrapped key from GET /api/hub/key
 *   4. Members unwrap with CryptoState via unwrapHubKey() (Rust ECIES)
 *   5. Hub key encrypts/decrypts hub-scoped data via encryptForHub()/decryptFromHub() (JS)
 *   6. On rotation, admin generates new key + re-wraps for all members
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import {
  unwrapHubKey as platformUnwrapHubKey,
  eciesWrapKey,
} from './platform'
import type { KeyEnvelope, RecipientKeyEnvelope } from './platform'
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
 * Wrap a hub key for a specific member using ECIES via Rust.
 * Uses LABEL_HUB_KEY_WRAP domain separation to prevent cross-context attacks.
 * No nsec involved — uses ephemeral keys for wrapping.
 */
export async function wrapHubKeyForMember(
  hubKey: Uint8Array,
  memberPubkeyHex: string,
): Promise<RecipientKeyEnvelope> {
  const hubKeyHex = bytesToHex(hubKey)
  const envelope = await eciesWrapKey(hubKeyHex, memberPubkeyHex, LABEL_HUB_KEY_WRAP)
  return {
    pubkey: memberPubkeyHex,
    ...envelope,
  }
}

/**
 * Wrap a hub key for multiple members at once.
 * Returns an array of RecipientKeyEnvelopes.
 */
export async function wrapHubKeyForMembers(
  hubKey: Uint8Array,
  memberPubkeys: string[],
): Promise<RecipientKeyEnvelope[]> {
  return Promise.all(memberPubkeys.map(pk => wrapHubKeyForMember(hubKey, pk)))
}

/**
 * Unwrap a hub key from an ECIES envelope using CryptoState (nsec stays in Rust).
 * Returns the hub key as bytes.
 */
export async function unwrapHubKey(
  envelope: KeyEnvelope,
): Promise<Uint8Array> {
  const hex = await platformUnwrapHubKey(envelope)
  return hexToBytes(hex)
}

/**
 * Encrypt arbitrary data with the hub key using XChaCha20-Poly1305.
 * Returns hex: nonce(24) + ciphertext.
 * Hub key is shared symmetric — stays in JS.
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
 * Hub key is shared symmetric — stays in JS.
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
export async function rotateHubKey(
  memberPubkeys: string[],
): Promise<{ hubKey: Uint8Array; envelopes: RecipientKeyEnvelope[] }> {
  const hubKey = generateHubKey()
  const envelopes = await wrapHubKeyForMembers(hubKey, memberPubkeys)
  return { hubKey, envelopes }
}
