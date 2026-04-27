/**
 * Agent identity management — generate and unseal Nostr keypairs for
 * automated agents (firehose inference agents).
 *
 * Agent nsecs are sealed using a deploy-level secret key via HKDF + XChaCha20-Poly1305.
 * The agentId is used as HKDF salt for key isolation between agents.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { schnorr } from '@noble/curves/secp256k1.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/**
 * Generate a random Nostr keypair for an agent, sealing the nsec under a
 * deploy-level secret key.
 *
 * @param agentId   Stable identifier for this agent instance (e.g. connection UUID)
 * @param sealKey   Hex-encoded 32-byte deploy secret (FIREHOSE_AGENT_SEAL_KEY)
 * @param sealLabel Domain separation constant (from crypto-labels.ts)
 * @returns pubkey (hex x-only) and encryptedNsec (hex nonce || ciphertext)
 */
export function generateAgentKeypair(
  agentId: string,
  sealKey: string,
  sealLabel: string,
): { pubkey: string; encryptedNsec: string } {
  // Generate random keypair
  const nsecBytes = schnorr.utils.randomSecretKey()
  const pubkeyBytes = schnorr.getPublicKey(nsecBytes)
  const pubkey = bytesToHex(pubkeyBytes)
  const nsecHex = bytesToHex(nsecBytes)

  // Derive per-agent seal key via HKDF
  const sealKeyBytes = hexToBytes(sealKey)
  const derivedKey = hkdf(
    sha256,
    sealKeyBytes,
    new TextEncoder().encode(agentId),
    new TextEncoder().encode(sealLabel),
    32,
  )

  // Encrypt nsec with XChaCha20-Poly1305
  const nonce = crypto.getRandomValues(new Uint8Array(24))
  const cipher = xchacha20poly1305(derivedKey, nonce)
  const sealed = cipher.encrypt(new TextEncoder().encode(nsecHex))

  // Encode as hex: nonce || ciphertext
  const encryptedNsec = bytesToHex(nonce) + bytesToHex(sealed)

  // Zero nsec from memory
  nsecBytes.fill(0)

  return { pubkey, encryptedNsec }
}

/**
 * Unseal an agent nsec that was previously sealed with generateAgentKeypair.
 *
 * @param agentId        Must match the agentId used during sealing
 * @param encryptedNsec  Hex-encoded nonce || ciphertext blob
 * @param sealKey        Hex-encoded 32-byte deploy secret
 * @param sealLabel      Must match the sealLabel used during sealing
 * @returns Hex-encoded nsec (32 bytes)
 * @throws If authentication tag verification fails
 */
export function unsealAgentNsec(
  agentId: string,
  encryptedNsec: string,
  sealKey: string,
  sealLabel: string,
): string {
  const sealKeyBytes = hexToBytes(sealKey)
  const derivedKey = hkdf(
    sha256,
    sealKeyBytes,
    new TextEncoder().encode(agentId),
    new TextEncoder().encode(sealLabel),
    32,
  )

  const combined = hexToBytes(encryptedNsec)
  const nonce = combined.slice(0, 24)
  const ciphertext = combined.slice(24)

  const cipher = xchacha20poly1305(derivedKey, nonce)
  const decrypted = cipher.decrypt(ciphertext)
  return new TextDecoder().decode(decrypted)
}
