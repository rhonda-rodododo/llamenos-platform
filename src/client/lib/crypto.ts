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

function deriveEncryptionKey(secretKey: Uint8Array, context: string): Uint8Array {
  const salt = utf8ToBytes('llamenos:hkdf-salt:v1')
  return hkdf(sha256, secretKey, salt, utf8ToBytes(`llamenos:${context}`), 32)
}

// --- ECIES Key Wrapping (shared with file-crypto.ts pattern) ---

export interface NoteEnvelope {
  encryptedNoteKey: string  // hex: nonce(24) + ciphertext(48 = 32 key + 16 tag)
  ephemeralPubkey: string   // hex: compressed 33-byte pubkey
}

function wrapKeyForPubkey(
  noteKey: Uint8Array,
  recipientPubkeyHex: string,
): NoteEnvelope {
  const ephemeralSecret = randomBytes(32)
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralSecret, true)

  const recipientCompressed = hexToBytes('02' + recipientPubkeyHex)
  const shared = secp256k1.getSharedSecret(ephemeralSecret, recipientCompressed)
  const sharedX = shared.slice(1, 33)

  const context = utf8ToBytes('llamenos:note-key')
  const keyInput = new Uint8Array(context.length + sharedX.length)
  keyInput.set(context)
  keyInput.set(sharedX, context.length)
  const symmetricKey = sha256(keyInput)

  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(noteKey)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedNoteKey: bytesToHex(packed),
    ephemeralPubkey: bytesToHex(ephemeralPublicKey),
  }
}

function unwrapNoteKey(
  envelope: NoteEnvelope,
  secretKey: Uint8Array,
): Uint8Array {
  const ephemeralPub = hexToBytes(envelope.ephemeralPubkey)
  const shared = secp256k1.getSharedSecret(secretKey, ephemeralPub)
  const sharedX = shared.slice(1, 33)

  const context = utf8ToBytes('llamenos:note-key')
  const keyInput = new Uint8Array(context.length + sharedX.length)
  keyInput.set(context)
  keyInput.set(sharedX, context.length)
  const symmetricKey = sha256(keyInput)

  const data = hexToBytes(envelope.encryptedNoteKey)
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  return cipher.decrypt(ciphertext)
}

// --- Per-Note Ephemeral Key Encryption (V2 — forward secrecy) ---

export interface EncryptedNoteV2 {
  encryptedContent: string     // hex: nonce(24) + ciphertext
  authorEnvelope: NoteEnvelope // note key wrapped for the author
  adminEnvelope: NoteEnvelope  // note key wrapped for the admin
}

/**
 * Encrypt a note with a random per-note key, wrapped for both author and admin.
 * Provides forward secrecy: compromising the identity key doesn't reveal past notes.
 */
export function encryptNoteV2(
  payload: NotePayload,
  authorPubkey: string,
  adminPubkey: string,
): EncryptedNoteV2 {
  // Generate random per-note symmetric key
  const noteKey = randomBytes(32)
  const nonce = randomBytes(24)
  const jsonString = JSON.stringify(payload)
  const cipher = xchacha20poly1305(noteKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(jsonString))

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)

  return {
    encryptedContent: bytesToHex(packed),
    authorEnvelope: wrapKeyForPubkey(noteKey, authorPubkey),
    adminEnvelope: wrapKeyForPubkey(noteKey, adminPubkey),
  }
}

/**
 * Decrypt a V2 note using the appropriate envelope for the current user.
 */
export function decryptNoteV2(
  encryptedContent: string,
  envelope: NoteEnvelope,
  secretKey: Uint8Array,
): NotePayload | null {
  try {
    const noteKey = unwrapNoteKey(envelope, secretKey)
    const data = hexToBytes(encryptedContent)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(noteKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const decoded = new TextDecoder().decode(plaintext)
    try {
      const parsed = JSON.parse(decoded)
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return parsed as NotePayload
      }
    } catch {
      // Not JSON
    }
    return { text: decoded }
  } catch {
    return null
  }
}

// --- Legacy V1 Encryption (kept for backward compatibility) ---

/** @deprecated Use encryptNoteV2 for new notes */
export function encryptNote(payload: NotePayload, secretKey: Uint8Array): string {
  const key = deriveEncryptionKey(secretKey, 'notes')
  const nonce = randomBytes(24)
  const jsonString = JSON.stringify(payload)
  const data = utf8ToBytes(jsonString)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(data)

  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

/** @deprecated Use decryptNoteV2 for V2 notes, falls back to this for legacy */
export function decryptNote(packed: string, secretKey: Uint8Array): NotePayload | null {
  try {
    const key = deriveEncryptionKey(secretKey, 'notes')
    const data = hexToBytes(packed)
    const nonce = data.slice(0, 24)
    const ciphertext = data.slice(24)
    const cipher = xchacha20poly1305(key, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const decoded = new TextDecoder().decode(plaintext)
    try {
      const parsed = JSON.parse(decoded)
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return parsed as NotePayload
      }
    } catch {
      // Not JSON — legacy plain text note
    }
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
