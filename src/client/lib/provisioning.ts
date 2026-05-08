/**
 * Device provisioning protocol — Signal-style QR device linking.
 *
 * New Device:
 *   1. Generate ephemeral X25519 keypair
 *   2. Create provisioning room (POST /api/provision/rooms)
 *   3. Display QR containing { roomId, token }
 *   4. Poll room until primary sends encrypted nsec
 *   5. X25519(eSK, primaryPK) → HKDF → AES-256-GCM decrypt nsec
 *   6. Import nsec with user-chosen PIN
 *
 * Primary Device (authenticated):
 *   1. Scan QR / enter code → get { roomId, token }
 *   2. Fetch room → get new device's ephemeral pubkey
 *   3. X25519(primarySK, ePK) → HKDF → AES-256-GCM encrypt nsec
 *   4. POST encrypted payload to room
 *
 * Wire format: hex(nonce_12 + ciphertext + tag_16)
 * SAS format: "XXX XXX" (6 digits, space-separated)
 */
import { x25519 } from '@noble/curves/ed25519.js'
import { gcm } from '@noble/ciphers/aes.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_DEVICE_PROVISION, LABEL_PROVISIONING_SALT, SAS_SALT, SAS_INFO } from '@shared/crypto-labels'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

/**
 * Derive the symmetric key for provisioning using HKDF-SHA256.
 * Matches Rust derive_provisioning_key: salt=LABEL_PROVISIONING_SALT, info=LABEL_DEVICE_PROVISION.
 */
function deriveProvisioningKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, utf8ToBytes(LABEL_PROVISIONING_SALT), utf8ToBytes(LABEL_DEVICE_PROVISION), 32)
}

// --- SAS Verification ---

/**
 * Derive a 6-digit Short Authentication String from the X25519 shared secret.
 * Both devices compute this independently — if codes match, no MITM is present.
 * Returns formatted "XXX XXX" string for display.
 */
export function computeProvisioningSAS(sharedSecret: Uint8Array): string {
  const sasBytes = hkdf(sha256, sharedSecret, utf8ToBytes(SAS_SALT), utf8ToBytes(SAS_INFO), 4)
  const num = ((sasBytes[0] << 24) | (sasBytes[1] << 16) | (sasBytes[2] << 8) | sasBytes[3]) >>> 0
  const code = (num % 1_000_000).toString().padStart(6, '0')
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/**
 * Compute the X25519 shared secret from our secret key and their public key.
 * Returns 32-byte shared secret.
 */
function computeSharedSecret(ourSecretKey: Uint8Array, theirPubkeyHex: string): Uint8Array {
  return x25519.getSharedSecret(ourSecretKey, hexToBytes(theirPubkeyHex))
}

/**
 * Compute SAS code for the new device side.
 * Called after receiving the primary device's pubkey from the provisioning room.
 */
export function computeSASForNewDevice(
  ephemeralSecret: Uint8Array,
  primaryPubkeyHex: string,
): string {
  const shared = computeSharedSecret(ephemeralSecret, primaryPubkeyHex)
  return computeProvisioningSAS(shared)
}

/**
 * Compute SAS code for the primary device side.
 * Called after fetching the new device's ephemeral pubkey from the provisioning room.
 */
export function computeSASForPrimaryDevice(
  primarySecretKey: Uint8Array,
  ephemeralPubkeyHex: string,
): string {
  const shared = computeSharedSecret(primarySecretKey, ephemeralPubkeyHex)
  return computeProvisioningSAS(shared)
}

// --- New Device Side ---

export interface ProvisioningSession {
  roomId: string
  token: string
  ephemeralSecret: Uint8Array
  ephemeralPubkey: string // hex, 32-byte X25519 public key
}

export async function createProvisioningRoom(): Promise<ProvisioningSession> {
  const ephemeralSecret = randomBytes(32)
  const ephemeralPubkey = x25519.getPublicKey(ephemeralSecret)

  const res = await fetch('/api/provision/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ephemeralPubkey: bytesToHex(ephemeralPubkey) }),
  })
  if (!res.ok) throw new Error('Failed to create provisioning room')
  const data = await res.json() as { roomId: string; token: string }

  return {
    roomId: data.roomId,
    token: data.token,
    ephemeralSecret,
    ephemeralPubkey: bytesToHex(ephemeralPubkey),
  }
}

export interface ProvisioningRoomStatus {
  status: 'waiting' | 'ready' | 'expired'
  encryptedNsec?: string
  primaryPubkey?: string
}

export async function pollProvisioningRoom(
  roomId: string,
  token: string,
): Promise<ProvisioningRoomStatus> {
  const res = await fetch(`/api/provision/rooms/${roomId}?token=${token}`)
  if (!res.ok) {
    if (res.status === 404 || res.status === 410) return { status: 'expired' }
    throw new Error('Failed to poll room')
  }
  return await res.json() as ProvisioningRoomStatus
}

export function decryptProvisionedNsec(
  encryptedNsec: string,
  primaryPubkeyHex: string,
  ephemeralSecret: Uint8Array,
): string {
  // X25519 shared secret
  const shared = computeSharedSecret(ephemeralSecret, primaryPubkeyHex)
  const symmetricKey = deriveProvisioningKey(shared)

  // Decrypt: nonce(12) + ciphertext + tag(16)
  const data = hexToBytes(encryptedNsec)
  const nonce = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const aad = utf8ToBytes(LABEL_DEVICE_PROVISION)
  const cipher = gcm(symmetricKey, nonce, aad)
  const plaintext = cipher.decrypt(ciphertext)
  return new TextDecoder().decode(plaintext)
}

// --- Primary Device Side ---

export async function getProvisioningRoom(
  roomId: string,
  token: string,
): Promise<{ ephemeralPubkey: string; status: string }> {
  const res = await fetch(`/api/provision/rooms/${roomId}?token=${token}`)
  if (!res.ok) throw new Error('Room not found or expired')
  return await res.json() as { ephemeralPubkey: string; status: string }
}

export function encryptNsecForDevice(
  nsec: string,
  ephemeralPubkeyHex: string,
  primarySecretKey: Uint8Array,
): string {
  // X25519 shared secret
  const shared = computeSharedSecret(primarySecretKey, ephemeralPubkeyHex)
  const symmetricKey = deriveProvisioningKey(shared)

  // Encrypt nsec with AES-256-GCM
  const nonce = randomBytes(12)
  const aad = utf8ToBytes(LABEL_DEVICE_PROVISION)
  const cipher = gcm(symmetricKey, nonce, aad)
  const ciphertext = cipher.encrypt(utf8ToBytes(nsec))

  // Pack: nonce(12) + ciphertext + tag(16)
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

export async function sendProvisionedKey(
  roomId: string,
  token: string,
  encryptedNsec: string,
  primaryPubkey: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  const res = await fetch(`/api/provision/rooms/${roomId}/payload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ token, encryptedNsec, primaryPubkey }),
  })
  if (!res.ok) throw new Error('Failed to send provisioned key')
}

// --- QR Code Data ---

export interface ProvisioningQRData {
  r: string  // roomId
  t: string  // token
}

export function encodeProvisioningQR(roomId: string, token: string): string {
  return JSON.stringify({ r: roomId, t: token })
}

export function decodeProvisioningQR(data: string): ProvisioningQRData | null {
  try {
    const parsed = JSON.parse(data)
    if (parsed.r && parsed.t) return parsed as ProvisioningQRData
    return null
  } catch {
    return null
  }
}

// Short code: first 8 chars of roomId (for manual entry)
export function getShortCode(roomId: string): string {
  return roomId.slice(0, 8).toUpperCase()
}
