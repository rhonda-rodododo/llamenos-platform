import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import type { NotePayload } from '@shared/types'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

// --- Key Management ---

export interface KeyPair {
  secretKey: Uint8Array  // 32-byte private key
  publicKey: string      // hex-encoded public key
  nsec: string           // bech32-encoded private key (for user display)
  npub: string           // bech32-encoded public key (for user display)
}

export function generateKeyPair(): KeyPair {
  const secretKey = generateSecretKey()
  const publicKey = getPublicKey(secretKey)
  return {
    secretKey,
    publicKey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(publicKey),
  }
}

export function keyPairFromNsec(nsec: string): KeyPair | null {
  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null
    const secretKey = decoded.data
    const publicKey = getPublicKey(secretKey)
    return {
      secretKey,
      publicKey,
      nsec,
      npub: nip19.npubEncode(publicKey),
    }
  } catch {
    return null
  }
}

export function isValidNsec(nsec: string): boolean {
  try {
    const decoded = nip19.decode(nsec)
    return decoded.type === 'nsec'
  } catch {
    return false
  }
}

// --- Encryption ---
// Uses XChaCha20-Poly1305 for symmetric encryption of notes.
// The encryption key is derived from the volunteer's private key.
// Admin can also decrypt because they generated and stored the private key.

function deriveEncryptionKey(secretKey: Uint8Array, context: string): Uint8Array {
  // Derive a domain-separated key using HKDF-SHA256
  return hkdf(sha256, secretKey, undefined, utf8ToBytes(`llamenos:${context}`), 32)
}

export function encryptNote(payload: NotePayload, secretKey: Uint8Array): string {
  const key = deriveEncryptionKey(secretKey, 'notes')
  const nonce = randomBytes(24) // XChaCha20 uses 24-byte nonces
  const jsonString = JSON.stringify(payload)
  const data = utf8ToBytes(jsonString)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(data)

  // Pack as: nonce (24) + ciphertext (variable)
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

export function decryptNote(packed: string, secretKey: Uint8Array): NotePayload | null {
  try {
    const key = deriveEncryptionKey(secretKey, 'notes')
    const data = hexToBytes(packed)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(key, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const decoded = new TextDecoder().decode(plaintext)
    // Try parsing as NotePayload JSON
    try {
      const parsed = JSON.parse(decoded)
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return parsed as NotePayload
      }
    } catch {
      // Not JSON — legacy plain text note
    }
    // Legacy fallback: treat entire string as text
    return { text: decoded }
  } catch {
    return null
  }
}

// --- ECIES Transcription Decryption ---
// Decrypts server-encrypted transcriptions using ECDH with the volunteer's secret key
// and the ephemeral public key stored alongside the ciphertext.

export function decryptTranscription(
  packed: string,
  ephemeralPubkeyHex: string,
  secretKey: Uint8Array,
): string | null {
  try {
    // ephemeralPubkeyHex is already compressed (33 bytes / 66 hex chars)
    const ephemeralPub = hexToBytes(ephemeralPubkeyHex)

    // ECDH shared secret
    const shared = secp256k1.getSharedSecret(secretKey, ephemeralPub)
    const sharedX = shared.slice(1, 33)

    // Derive symmetric key with same domain separation as server
    const context = utf8ToBytes('llamenos:transcription')
    const keyInput = new Uint8Array(context.length + sharedX.length)
    keyInput.set(context)
    keyInput.set(sharedX, context.length)
    const symmetricKey = sha256(keyInput)

    // Unpack: nonce (24) + ciphertext
    const data = hexToBytes(packed)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)

    const cipher = xchacha20poly1305(symmetricKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

// --- ECIES Encryption (Client-Side) ---
// Matches the server-side encryptForPublicKey in worker/lib/crypto.ts.
// Used for encrypting outbound messages for specific recipients.

export function encryptForPublicKey(
  plaintext: string,
  recipientPubkeyHex: string,
): { encryptedContent: string; ephemeralPubkey: string } {
  // Generate ephemeral keypair
  const ephemeralSecret = randomBytes(32)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  // Nostr pubkeys are x-only (32 bytes). Prepend 02 for even-parity compressed format.
  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)

  // ECDH shared secret
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  // Derive symmetric key with domain separation (same as server)
  const context = utf8ToBytes('llamenos:transcription')
  const keyInput = new Uint8Array(context.length + sharedX.length)
  keyInput.set(context)
  keyInput.set(sharedX, context.length)
  const symmetricKey = sha256(keyInput)

  // Encrypt with XChaCha20-Poly1305
  const nonce = randomBytes(24)
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
}

// --- Draft Encryption ---
// Same as notes but with "drafts" domain separation for local draft auto-save

export function encryptDraft(plaintext: string, secretKey: Uint8Array): string {
  const key = deriveEncryptionKey(secretKey, 'drafts')
  const nonce = randomBytes(24)
  const data = utf8ToBytes(plaintext)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(data)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

export function decryptDraft(packed: string, secretKey: Uint8Array): string | null {
  try {
    const key = deriveEncryptionKey(secretKey, 'drafts')
    const data = hexToBytes(packed)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(key, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

// --- Export Encryption ---
// Encrypts a JSON export blob so it can only be read with the user's key

export function encryptExport(jsonString: string, secretKey: Uint8Array): Uint8Array {
  const key = deriveEncryptionKey(secretKey, 'export')
  const nonce = randomBytes(24)
  const data = utf8ToBytes(jsonString)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(data)

  // Pack as: nonce (24) + ciphertext
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return packed
}

// --- Session Token ---
// Create a signed challenge for API authentication

export function createAuthToken(secretKey: Uint8Array, timestamp: number): string {
  const publicKey = getPublicKey(secretKey)
  const message = `llamenos:auth:${publicKey}:${timestamp}`
  const messageHash = sha256(utf8ToBytes(message))
  // Sign with Schnorr (BIP-340) — proves possession of the secret key
  const signature = schnorr.sign(messageHash, secretKey)
  const token = bytesToHex(signature)
  return JSON.stringify({ pubkey: publicKey, timestamp, token })
}

// --- Key Storage ---
// Store encrypted in sessionStorage only (not localStorage for security)

const STORAGE_KEY = 'llamenos-session'

export function storeSession(nsec: string): void {
  sessionStorage.setItem(STORAGE_KEY, nsec)
}

export function getStoredSession(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
