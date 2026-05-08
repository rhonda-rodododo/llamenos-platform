/**
 * Hub Key Manager
 *
 * Hub-wide symmetric encryption key management. Each hub has a random 32-byte
 * key that is HPKE-wrapped individually for each member who needs it.
 *
 * HPKE wrap/unwrap operations delegate to Rust via platform.ts.
 * Symmetric hub encrypt/decrypt stays in JS (hub key is shared symmetric, not identity-secret).
 *
 * Key lifecycle:
 *   1. Admin generates hub key via generateHubKey()
 *   2. Key is wrapped for each member via wrapHubKeyForMember() (Rust HPKE)
 *   3. Members fetch their wrapped key from GET /api/hub/key
 *   4. Members unwrap with CryptoState via unwrapHubKey() (Rust HPKE)
 *   5. Hub key encrypts/decrypts hub-scoped data via encryptForHub()/decryptFromHub() (JS)
 *   6. On rotation, admin generates new key + re-wraps for all members
 */

import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import {
  unwrapHubKey as platformUnwrapHubKey,
  eciesWrapKey,
} from './platform'
import type { KeyEnvelope, RecipientEnvelope } from './platform'
import { LABEL_HUB_KEY_WRAP, LABEL_HUB_EVENT } from '@shared/crypto-labels'

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
 * Wrap a hub key for a specific member using HPKE via Rust.
 * Uses LABEL_HUB_KEY_WRAP domain separation to prevent cross-context attacks.
 */
export async function wrapHubKeyForMember(
  hubKey: Uint8Array,
  memberPubkeyHex: string,
): Promise<RecipientEnvelope> {
  const hubKeyHex = bytesToHex(hubKey)
  const envelope = await eciesWrapKey(hubKeyHex, memberPubkeyHex, LABEL_HUB_KEY_WRAP)
  return {
    pubkey: memberPubkeyHex,
    ...envelope,
  }
}

/**
 * Wrap a hub key for multiple members at once.
 * Returns an array of RecipientEnvelopes.
 */
export async function wrapHubKeyForMembers(
  hubKey: Uint8Array,
  memberPubkeys: string[],
): Promise<RecipientEnvelope[]> {
  return Promise.all(memberPubkeys.map(pk => wrapHubKeyForMember(hubKey, pk)))
}

/**
 * Unwrap a hub key from an HPKE envelope using CryptoState (device key stays in Rust).
 * Returns the hub key as bytes.
 */
export async function unwrapHubKey(
  envelope: KeyEnvelope,
): Promise<Uint8Array> {
  const hex = await platformUnwrapHubKey(envelope)
  return hexToBytes(hex)
}

/**
 * Encrypt arbitrary data with the hub key using AES-256-GCM.
 * Returns hex: nonce(12) + ciphertext + tag(16).
 * AAD = LABEL_HUB_EVENT bytes for domain separation.
 * Hub key is shared symmetric — stays in JS.
 */
export function encryptForHub(
  plaintext: string,
  hubKey: Uint8Array,
): string {
  const nonce = randomBytes(12)
  const aad = utf8ToBytes(LABEL_HUB_EVENT)
  const cipher = gcm(hubKey, nonce, aad)
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
    const nonce = data.slice(0, 12)
    const ciphertext = data.slice(12)
    const aad = utf8ToBytes(LABEL_HUB_EVENT)
    const cipher = gcm(hubKey, nonce, aad)
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
): Promise<{ hubKey: Uint8Array; envelopes: RecipientEnvelope[] }> {
  const hubKey = generateHubKey()
  const envelopes = await wrapHubKeyForMembers(hubKey, memberPubkeys)
  return { hubKey, envelopes }
}
