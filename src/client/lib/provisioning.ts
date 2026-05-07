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
import { bytesToHex, hexToBytes, utf8ToBytes } from '@shared/encoding'
import {
  x25519GetPublicKey,
  x25519SharedSecret,
  hkdfSha256,
  aesGcmEncryptRaw,
  aesGcmDecryptRaw,
} from './platform'
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
async function deriveProvisioningKey(sharedSecretHex: string): Promise<string> {
  const saltHex = bytesToHex(utf8ToBytes(LABEL_PROVISIONING_SALT))
  const infoHex = bytesToHex(utf8ToBytes(LABEL_DEVICE_PROVISION))
  return hkdfSha256(sharedSecretHex, saltHex, infoHex, 32)
}

// --- SAS Verification ---

/**
 * Derive a 6-digit Short Authentication String from the X25519 shared secret.
 * Both devices compute this independently — if codes match, no MITM is present.
 * Returns formatted "XXX XXX" string for display.
 */
export async function computeProvisioningSAS(sharedSecretHex: string): Promise<string> {
  const saltHex = bytesToHex(utf8ToBytes(SAS_SALT))
  const infoHex = bytesToHex(utf8ToBytes(SAS_INFO))
  const sasBytesHex = await hkdfSha256(sharedSecretHex, saltHex, infoHex, 4)
  const sasBytes = hexToBytes(sasBytesHex)
  const num = ((sasBytes[0] << 24) | (sasBytes[1] << 16) | (sasBytes[2] << 8) | sasBytes[3]) >>> 0
  const code = (num % 1_000_000).toString().padStart(6, '0')
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/**
 * Compute the X25519 shared secret from our secret key and their public key.
 * Returns hex-encoded 32-byte shared secret.
 */
async function computeSharedSecretHex(ourSecretKeyHex: string, theirPubkeyHex: string): Promise<string> {
  return x25519SharedSecret(ourSecretKeyHex, theirPubkeyHex)
}

/**
 * Compute SAS code for the new device side.
 * Called after receiving the primary device's pubkey from the provisioning room.
 */
export async function computeSASForNewDevice(
  ephemeralSecret: Uint8Array,
  primaryPubkeyHex: string,
): Promise<string> {
  const shared = await computeSharedSecretHex(bytesToHex(ephemeralSecret), primaryPubkeyHex)
  return computeProvisioningSAS(shared)
}

/**
 * Compute SAS code for the primary device side.
 * Called after fetching the new device's ephemeral pubkey from the provisioning room.
 */
export async function computeSASForPrimaryDevice(
  primarySecretKey: Uint8Array,
  ephemeralPubkeyHex: string,
): Promise<string> {
  const shared = await computeSharedSecretHex(bytesToHex(primarySecretKey), ephemeralPubkeyHex)
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
  const ephemeralPubkeyHex = await x25519GetPublicKey(bytesToHex(ephemeralSecret))

  const res = await fetch('/api/provision/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ephemeralPubkey: ephemeralPubkeyHex }),
  })
  if (!res.ok) throw new Error('Failed to create provisioning room')
  const data = await res.json() as { roomId: string; token: string }

  return {
    roomId: data.roomId,
    token: data.token,
    ephemeralSecret,
    ephemeralPubkey: ephemeralPubkeyHex,
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

export async function decryptProvisionedNsec(
  encryptedNsec: string,
  primaryPubkeyHex: string,
  ephemeralSecret: Uint8Array,
): Promise<string> {
  // X25519 shared secret
  const sharedHex = await computeSharedSecretHex(bytesToHex(ephemeralSecret), primaryPubkeyHex)
  const symmetricKeyHex = await deriveProvisioningKey(sharedHex)

  // Decrypt: nonce(12) + ciphertext + tag(16)
  const nonceHex = encryptedNsec.slice(0, 24) // 12 bytes = 24 hex chars
  const ciphertextHex = encryptedNsec.slice(24)
  const aadHex = bytesToHex(utf8ToBytes(LABEL_DEVICE_PROVISION))
  const plaintextHex = await aesGcmDecryptRaw(symmetricKeyHex, nonceHex, ciphertextHex, aadHex)
  return new TextDecoder().decode(hexToBytes(plaintextHex))
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

export async function encryptNsecForDevice(
  nsec: string,
  ephemeralPubkeyHex: string,
  primarySecretKey: Uint8Array,
): Promise<string> {
  // X25519 shared secret
  const sharedHex = await computeSharedSecretHex(bytesToHex(primarySecretKey), ephemeralPubkeyHex)
  const symmetricKeyHex = await deriveProvisioningKey(sharedHex)

  // Encrypt nsec with AES-256-GCM
  const nonce = randomBytes(12)
  const nonceHex = bytesToHex(nonce)
  const plaintextHex = bytesToHex(utf8ToBytes(nsec))
  const aadHex = bytesToHex(utf8ToBytes(LABEL_DEVICE_PROVISION))
  const ciphertextHex = await aesGcmEncryptRaw(symmetricKeyHex, nonceHex, plaintextHex, aadHex)

  // Pack: nonce(12) + ciphertext + tag(16)
  return nonceHex + ciphertextHex
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
