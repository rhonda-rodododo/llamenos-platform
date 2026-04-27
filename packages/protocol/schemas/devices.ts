import { z } from 'zod'

// Hex-encoded Ed25519 public key (32 bytes = 64 hex chars)
const ed25519PubkeySchema = z.string().regex(/^[0-9a-f]{64}$/i, 'Must be 32-byte Ed25519 public key in hex')

// Hex-encoded X25519 public key (32 bytes = 64 hex chars)
const x25519PubkeySchema = z.string().regex(/^[0-9a-f]{64}$/i, 'Must be 32-byte X25519 public key in hex')

// --- Input schemas ---

export const registerDeviceBodySchema = z.looseObject({
  platform: z.enum(['ios', 'android']),
  pushToken: z.string().min(1, 'pushToken is required'),
  wakeKeyPublic: z.string().regex(/^0[23][0-9a-f]{64}$/i, 'Must be 33-byte compressed secp256k1 pubkey in hex'),
  /** Phase 6: Ed25519 signing public key for sigchain and HPKE operations. */
  ed25519Pubkey: ed25519PubkeySchema.optional(),
  /** Phase 6: X25519 key-agreement public key for PUK envelope decryption. */
  x25519Pubkey: x25519PubkeySchema.optional(),
})

export const voipTokenBodySchema = z.looseObject({
  platform: z.enum(['ios', 'android']),
  voipToken: z.string().min(1, 'voipToken is required'),
})

// --- Response schemas ---

export const deviceResponseSchema = z.object({
  id: z.string(),
  platform: z.string(),
  wakeKeyPublic: z.string().nullable(),
  /** Phase 6: Ed25519 signing public key (null for legacy devices). */
  ed25519Pubkey: z.string().nullable(),
  /** Phase 6: X25519 key-agreement public key (null for legacy devices). */
  x25519Pubkey: z.string().nullable(),
  registeredAt: z.string(),
  lastSeenAt: z.string().nullable(),
})

export const deviceListResponseSchema = z.object({
  devices: z.array(deviceResponseSchema),
})
