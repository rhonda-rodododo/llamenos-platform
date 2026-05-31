/**
 * Device provisioning protocol — Signal-style QR device linking.
 *
 * ALL cryptographic operations happen in Rust via IPC. The webview NEVER sees
 * private key material (ephemeral secrets, signing seeds, device keys).
 *
 * New Device:
 *   1. provision_create_session → ephemeral X25519 pubkey (secret stays in Rust)
 *   2. Create provisioning room (POST /api/provision/rooms)
 *   3. Display QR containing { roomId, token }
 *   4. Poll room until primary sends encrypted payload
 *   5. provision_compute_sas → SAS code for verification display
 *   6. provision_decrypt_and_import → decrypt + PIN-encrypt + load into CryptoState
 *
 * Primary Device (authenticated):
 *   1. Scan QR / enter code → get { roomId, token }
 *   2. Fetch room → get new device's ephemeral pubkey
 *   3. provision_encrypt_for_device → ECDH + encrypt signing seed (in Rust)
 *   4. POST encrypted payload to room
 *
 * Wire format: hex(nonce_12 + ciphertext + tag_16)
 * SAS format: "XXX XXX" (6 digits, space-separated)
 */
import {
  provisionCreateSession,
  provisionComputeSas,
  provisionDecryptAndImport,
  provisionEncryptForDevice,
  persistAndUnlockDeviceKeys,
  type EncryptedDeviceKeys,
  type ProvisioningEncryptResult,
} from './platform'

// --- New Device Side ---

export interface ProvisioningSession {
  roomId: string
  token: string
  ephemeralPubkeyHex: string // X25519 public key (secret is in Rust CryptoState)
}

export async function createProvisioningRoom(): Promise<ProvisioningSession> {
  // Generate ephemeral keypair in Rust — secret stays in CryptoState
  const ephemeralPubkeyHex = await provisionCreateSession()

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
    ephemeralPubkeyHex,
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

/**
 * Compute the SAS code for the new device side (in Rust).
 * The ephemeral secret is stored in CryptoState — JS never sees it.
 */
export async function computeSASForNewDevice(
  primaryEncPubkeyHex: string,
): Promise<string> {
  return provisionComputeSas(primaryEncPubkeyHex)
}

/**
 * Decrypt the provisioned signing seed and import it as device keys.
 * The decrypted seed NEVER enters JavaScript — Rust handles decrypt → import.
 * Returns the encrypted device key blob for Stronghold persistence.
 */
export async function decryptAndImportProvisionedKey(
  encryptedHex: string,
  primaryEncPubkeyHex: string,
  pin: string,
): Promise<EncryptedDeviceKeys> {
  const deviceId = crypto.randomUUID()
  const encrypted = await provisionDecryptAndImport(
    encryptedHex,
    primaryEncPubkeyHex,
    pin,
    deviceId,
  )
  // Persist to Stronghold so the key survives page reloads
  await persistAndUnlockDeviceKeys(encrypted, pin)
  return encrypted
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

/**
 * Primary device: encrypt signing seed for the new device.
 * All crypto happens in Rust — the signing seed NEVER enters JavaScript.
 */
export async function encryptForDevice(
  ephemeralPubkeyHex: string,
): Promise<ProvisioningEncryptResult> {
  return provisionEncryptForDevice(ephemeralPubkeyHex)
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
