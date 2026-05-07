/**
 * Hub Key Manager
 *
 * Hub-wide symmetric encryption key management. Each hub has a random 32-byte
 * key that is HPKE-wrapped individually for each member who needs it.
 *
 * HPKE wrap/unwrap operations delegate to Rust via platform.ts.
 * Symmetric hub encrypt/decrypt also delegates to Rust via platform.ts IPC.
 *
 * Key lifecycle:
 *   1. Admin generates hub key via generateHubKey()
 *   2. Key is wrapped for each member via wrapHubKeyForMember() (Rust HPKE)
 *   3. Members fetch their wrapped key from GET /api/hub/key
 *   4. Members unwrap with CryptoState via unwrapHubKey() (Rust HPKE)
 *   5. Hub key encrypts/decrypts hub-scoped data via encryptForHub()/decryptFromHub() (Rust AES-GCM)
 *   6. On rotation, admin generates new key + re-wraps for all members
 */

import { bytesToHex, hexToBytes, utf8ToBytes } from '@shared/encoding'
import {
  unwrapHubKey as platformUnwrapHubKey,
  eciesWrapKey,
  aesGcmEncryptRaw,
  aesGcmDecryptRaw,
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
 * Hub key is shared symmetric — encryption routed through Rust IPC.
 */
export async function encryptForHub(
  plaintext: string,
  hubKey: Uint8Array,
): Promise<string> {
  const nonce = randomBytes(12)
  const nonceHex = bytesToHex(nonce)
  const keyHex = bytesToHex(hubKey)
  const plaintextHex = bytesToHex(utf8ToBytes(plaintext))
  const aadHex = bytesToHex(utf8ToBytes(LABEL_HUB_EVENT))

  const ciphertextHex = await aesGcmEncryptRaw(keyHex, nonceHex, plaintextHex, aadHex)

  return nonceHex + ciphertextHex
}

/**
 * Decrypt hub-encrypted data using the hub key.
 * Returns null on decryption failure (wrong key, corrupted data, etc.).
 * Hub key is shared symmetric — decryption routed through Rust IPC.
 */
export async function decryptFromHub(
  packed: string,
  hubKey: Uint8Array,
): Promise<string | null> {
  try {
    // nonce is first 24 hex chars (12 bytes), rest is ciphertext
    const nonceHex = packed.slice(0, 24)
    const ciphertextHex = packed.slice(24)
    const keyHex = bytesToHex(hubKey)
    const aadHex = bytesToHex(utf8ToBytes(LABEL_HUB_EVENT))

    const plaintextHex = await aesGcmDecryptRaw(keyHex, nonceHex, ciphertextHex, aadHex)
    return new TextDecoder().decode(hexToBytes(plaintextHex))
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
