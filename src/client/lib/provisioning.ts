/**
 * Device provisioning protocol — Signal-style QR device linking.
 *
 * New Device:
 *   1. Generate ephemeral secp256k1 keypair
 *   2. Create provisioning room (POST /api/provision/rooms)
 *   3. Display QR containing { roomId, token }
 *   4. Poll room until primary sends encrypted nsec
 *   5. ECDH(eSK, primaryPK) → decrypt nsec
 *   6. Import nsec with user-chosen PIN
 *
 * Primary Device (authenticated):
 *   1. Scan QR / enter code → get { roomId, token }
 *   2. Fetch room → get new device's ephemeral pubkey
 *   3. ECDH(primarySK, ePK) → encrypt nsec
 *   4. POST encrypted payload to room
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_DEVICE_PROVISION, SAS_SALT, SAS_INFO } from '@shared/crypto-labels'

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

function deriveSharedKey(sharedX: Uint8Array): Uint8Array {
  const label = utf8ToBytes(LABEL_DEVICE_PROVISION)
  const keyInput = new Uint8Array(label.length + sharedX.length)
  keyInput.set(label)
  keyInput.set(sharedX, label.length)
  return sha256(keyInput)
}

// --- SAS Verification ---

/**
 * Derive a 6-digit Short Authentication String from the ECDH shared secret.
 * Both devices compute this independently — if codes match, no MITM is present.
 * Returns formatted "XXX XXX" string for display.
 */
export function computeProvisioningSAS(sharedX: Uint8Array): string {
  const sasBytes = hkdf(sha256, sharedX, utf8ToBytes(SAS_SALT), utf8ToBytes(SAS_INFO), 4)
  const num = ((sasBytes[0] << 24) | (sasBytes[1] << 16) | (sasBytes[2] << 8) | sasBytes[3]) >>> 0
  const code = (num % 1_000_000).toString().padStart(6, '0')
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/**
 * Compute the ECDH shared secret x-coordinate from an ephemeral/primary keypair.
 * Shared between both sides of provisioning for SAS computation.
 */
function computeSharedX(ourSecretKey: Uint8Array, theirPubkeyHex: string): Uint8Array {
  // theirPubkeyHex may be x-only (32 bytes/64 hex) or compressed (33 bytes/66 hex)
  const theirPub = theirPubkeyHex.length === 64
    ? hexToBytes('02' + theirPubkeyHex)
    : hexToBytes(theirPubkeyHex)
  const shared = secp256k1.getSharedSecret(ourSecretKey, theirPub)
  return shared.slice(1, 33)
}

/**
 * Compute SAS code for the new device side.
 * Called after receiving the primary device's pubkey from the provisioning room.
 */
export function computeSASForNewDevice(
  ephemeralSecret: Uint8Array,
  primaryPubkeyHex: string,
): string {
  const sharedX = computeSharedX(ephemeralSecret, primaryPubkeyHex)
  return computeProvisioningSAS(sharedX)
}

/**
 * Compute SAS code for the primary device side.
 * Called after fetching the new device's ephemeral pubkey from the provisioning room.
 */
export function computeSASForPrimaryDevice(
  primarySecretKey: Uint8Array,
  ephemeralPubkeyHex: string,
): string {
  const sharedX = computeSharedX(primarySecretKey, ephemeralPubkeyHex)
  return computeProvisioningSAS(sharedX)
}

// --- New Device Side ---

export interface ProvisioningSession {
  roomId: string
  token: string
  ephemeralSecret: Uint8Array
  ephemeralPubkey: string // hex, compressed 33-byte
}

export async function createProvisioningRoom(): Promise<ProvisioningSession> {
  const ephemeralSecret = randomBytes(32)
  const ephemeralPubkey = secp256k1.getPublicKey(ephemeralSecret, true)

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
  // ECDH with primary device's pubkey
  const primaryCompressed = hexToBytes('02' + primaryPubkeyHex)
  const shared = secp256k1.getSharedSecret(ephemeralSecret, primaryCompressed)
  const sharedX = shared.slice(1, 33)
  const symmetricKey = deriveSharedKey(sharedX)

  // Decrypt: nonce(24) + ciphertext
  const data = hexToBytes(encryptedNsec)
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
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
  // ECDH with new device's ephemeral pubkey
  const ephemeralPub = hexToBytes(ephemeralPubkeyHex)
  const shared = secp256k1.getSharedSecret(primarySecretKey, ephemeralPub)
  const sharedX = shared.slice(1, 33)
  const symmetricKey = deriveSharedKey(sharedX)

  // Encrypt nsec
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(symmetricKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(nsec))

  // Pack: nonce(24) + ciphertext
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
