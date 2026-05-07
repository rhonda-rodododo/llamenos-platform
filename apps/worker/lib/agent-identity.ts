/**
 * Agent identity management — generate and unseal Nostr keypairs for
 * automated agents (firehose inference agents).
 *
 * Agent nsecs are sealed using a deploy-level secret key via HKDF + AES-256-GCM.
 * The agentId is used as HKDF salt for key isolation between agents.
 */
import { symmetricEncrypt, symmetricDecrypt, ed25519PubkeyFromSeed, hkdfSha256 } from '@llamenos/crypto/ffi'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@shared/encoding'

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
  // Generate random Ed25519 seed
  const seedBytes = crypto.getRandomValues(new Uint8Array(32))
  const pubkeyBytes = ed25519PubkeyFromSeed(seedBytes)
  const pubkey = bytesToHex(pubkeyBytes)
  const seedHex = bytesToHex(seedBytes)

  // Derive per-agent seal key via HKDF
  const sealKeyBytes = hexToBytes(sealKey)
  const derivedKey = hkdfSha256(
    sealKeyBytes,
    utf8ToBytes(agentId),
    utf8ToBytes(sealLabel),
    32,
  )

  // Encrypt seed with AES-256-GCM (symmetricEncrypt handles nonce internally)
  const sealed = symmetricEncrypt(derivedKey, utf8ToBytes(seedHex), new Uint8Array(0))
  const encryptedNsec = bytesToHex(sealed)

  // Zero seed from memory
  seedBytes.fill(0)

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
  const derivedKey = hkdfSha256(
    sealKeyBytes,
    utf8ToBytes(agentId),
    utf8ToBytes(sealLabel),
    32,
  )

  const combined = hexToBytes(encryptedNsec)
  const decrypted = symmetricDecrypt(derivedKey, combined, new Uint8Array(0))
  return new TextDecoder().decode(decrypted)
}
