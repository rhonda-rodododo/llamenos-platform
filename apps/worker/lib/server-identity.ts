/**
 * Server identity — Ed25519 keypair derived deterministically from SERVER_SECRET.
 *
 * Uses HKDF-SHA256 with registered domain separation labels to derive a 32-byte
 * Ed25519 signing seed. The server pubkey is the identity that clients verify
 * server-signed messages against.
 */
import { hkdfSha256, ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_SERVER_SIGNING_KEY, LABEL_SERVER_SIGNING_INFO } from '@shared/crypto-labels'

export interface ServerKeypair {
  secretKey: Uint8Array
  pubkeyHex: string
}

/**
 * Derive the server's Ed25519 signing keypair from the SERVER_SECRET env var.
 *
 * The secret is deterministic given the same SERVER_SECRET, allowing multiple
 * server instances to derive the same identity without key distribution.
 */
export function deriveServerKeypair(serverSecret: string): ServerKeypair {
  const ikm = hexToBytes(serverSecret)
  const salt = utf8ToBytes(LABEL_SERVER_SIGNING_KEY)
  const info = utf8ToBytes(LABEL_SERVER_SIGNING_INFO)

  const secretKey = hkdfSha256(ikm, salt, info, 32)
  const pubkey = ed25519PubkeyFromSeed(secretKey)

  return {
    secretKey,
    pubkeyHex: bytesToHex(pubkey),
  }
}
