import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_TRANSCRIPTION, HMAC_PHONE_PREFIX, HMAC_IP_PREFIX } from '@shared/crypto-labels'

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
  const label = utf8ToBytes(LABEL_TRANSCRIPTION)
  const keyInput = new Uint8Array(label.length + sharedX.length)
  keyInput.set(label)
  keyInput.set(sharedX, label.length)
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
 * Uses HMAC-SHA256 with a server secret to prevent precomputation attacks.
 */
export function hashPhone(phone: string, secret: string): string {
  const key = hexToBytes(secret)
  const input = utf8ToBytes(`${HMAC_PHONE_PREFIX}${phone}`)
  return bytesToHex(hmac(sha256, key, input))
}

/**
 * Hash an IP address for storage in audit logs.
 * Uses HMAC-SHA256 with a server secret, truncated to 96 bits.
 */
export function hashIP(ip: string, secret: string): string {
  const key = hexToBytes(secret)
  const input = utf8ToBytes(`${HMAC_IP_PREFIX}${ip}`)
  return bytesToHex(hmac(sha256, key, input)).slice(0, 24)
}
