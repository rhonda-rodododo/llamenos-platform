/**
 * Agent identity management — generate and unseal Ed25519 keypairs for
 * automated agents (firehose inference agents).
 *
 * Agent private keys are sealed using a deploy-level secret key via HKDF + AES-256-GCM.
 * The agentId is used as HKDF salt for key isolation between agents.
 */
import { gcm } from '@noble/ciphers/aes.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/**
 * Generate a random Ed25519 keypair for an agent, sealing the private key
 * under a deploy-level secret key.
 *
 * @param agentId   Stable identifier for this agent instance (e.g. connection UUID)
 * @param sealKey   Hex-encoded 32-byte deploy secret (FIREHOSE_AGENT_SEAL_KEY)
 * @param sealLabel Domain separation constant (from crypto-labels.ts)
 * @returns pubkey (hex, 32 bytes) and sealedAgentKey (hex nonce || ciphertext)
 */
export function generateAgentKeypair(
  agentId: string,
  sealKey: string,
  sealLabel: string,
): { pubkey: string; sealedAgentKey: string } {
  // Generate random Ed25519 keypair
  const agentSecretKey = ed25519.utils.randomSecretKey()
  const pubkeyBytes = ed25519.getPublicKey(agentSecretKey)
  const pubkey = bytesToHex(pubkeyBytes)
  const agentSecretKeyHex = bytesToHex(agentSecretKey)

  // Derive per-agent seal key via HKDF
  const sealKeyBytes = hexToBytes(sealKey)
  const derivedKey = hkdf(
    sha256,
    sealKeyBytes,
    new TextEncoder().encode(agentId),
    new TextEncoder().encode(sealLabel),
    32,
  )

  // Seal the Ed25519 secret key (hex) with AES-256-GCM
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cipher = gcm(derivedKey, nonce)
  const sealed = cipher.encrypt(new TextEncoder().encode(agentSecretKeyHex))

  // Encode as hex: nonce || ciphertext
  const sealedAgentKey = bytesToHex(nonce) + bytesToHex(sealed)

  // Zero the raw secret key from memory
  agentSecretKey.fill(0)

  return { pubkey, sealedAgentKey }
}

/**
 * Unseal an agent Ed25519 secret key that was previously sealed with generateAgentKeypair.
 *
 * @param agentId        Must match the agentId used during sealing
 * @param sealedAgentKey  Hex-encoded nonce || ciphertext blob
 * @param sealKey        Hex-encoded 32-byte deploy secret
 * @param sealLabel      Must match the sealLabel used during sealing
 * @returns Hex-encoded Ed25519 secret key (32 bytes)
 * @throws If authentication tag verification fails
 */
export function unsealAgentKey(
  agentId: string,
  sealedAgentKey: string,
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

  const combined = hexToBytes(sealedAgentKey)
  const nonce = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const cipher = gcm(derivedKey, nonce)
  const decrypted = cipher.decrypt(ciphertext)
  return new TextDecoder().decode(decrypted)
}
