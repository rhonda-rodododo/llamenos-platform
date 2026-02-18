import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

/**
 * ECIES encryption for server-produced transcriptions.
 *
 * Uses an ephemeral keypair + ECDH with the recipient's secp256k1 pubkey
 * to derive a shared secret, then encrypts with XChaCha20-Poly1305.
 * The ephemeral private key is discarded immediately — the server cannot
 * decrypt after encryption.
 */
export function encryptForPublicKey(
  plaintext: string,
  recipientPubkeyHex: string,
): { encryptedContent: string; ephemeralPubkey: string } {
  // Generate ephemeral keypair
  const ephemeralSecret = new Uint8Array(32)
  crypto.getRandomValues(ephemeralSecret)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true) // compressed 33 bytes

  // Nostr pubkeys are x-only (32 bytes). Prepend 02 for even-parity compressed format.
  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)

  // ECDH shared secret
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33) // extract x-coordinate (32 bytes)

  // Derive symmetric key with domain separation
  const context = utf8ToBytes('llamenos:transcription')
  const keyInput = new Uint8Array(context.length + sharedX.length)
  keyInput.set(context)
  keyInput.set(sharedX, context.length)
  const symmetricKey = sha256(keyInput)

  // Encrypt with XChaCha20-Poly1305
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))

  // Pack: nonce (24) + ciphertext
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedContent: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
  // ephemeralSecret goes out of scope here — never stored
}

/**
 * Hash a phone number for storage (one-way — compare by re-hashing).
 * Uses SHA-256 with a domain separator to prevent rainbow table attacks.
 */
export function hashPhone(phone: string): string {
  const input = utf8ToBytes(`llamenos:phone:${phone}`)
  return bytesToHex(sha256(input))
}

/**
 * Hash an IP address for storage in audit logs.
 */
export function hashIP(ip: string): string {
  const input = utf8ToBytes(`llamenos:ip:${ip}`)
  return bytesToHex(sha256(input)).slice(0, 24) // Truncate to 24 hex chars (96-bit) for collision resistance
}
