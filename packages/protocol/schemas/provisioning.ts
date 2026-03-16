import { z } from 'zod'

// --- Input schemas ---

export const createRoomBodySchema = z.object({
  ephemeralPubkey: z.string().min(60, 'Invalid ephemeral pubkey'),
})

export const roomPayloadBodySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  encryptedNsec: z.string().min(1, 'Encrypted nsec is required'),
  primaryPubkey: z.string().min(1, 'Primary pubkey is required'),
})

// --- Response schemas ---

export const provisionRoomResponseSchema = z.object({
  roomId: z.string(),
  token: z.string(),
})

export const provisionRoomStatusResponseSchema = z.object({
  status: z.enum(['waiting', 'ready', 'expired']),
  ephemeralPubkey: z.string().optional(),
  encryptedNsec: z.string().optional(),
  primaryPubkey: z.string().optional(),
})
