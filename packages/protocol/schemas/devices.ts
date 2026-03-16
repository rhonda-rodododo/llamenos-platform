import { z } from 'zod'

// --- Input schemas ---

export const registerDeviceBodySchema = z.looseObject({
  platform: z.enum(['ios', 'android']),
  pushToken: z.string().min(1, 'pushToken is required'),
  wakeKeyPublic: z.string().regex(/^0[23][0-9a-f]{64}$/i, 'Must be 33-byte compressed secp256k1 pubkey in hex'),
})

export const voipTokenBodySchema = z.looseObject({
  platform: z.enum(['ios', 'android']),
  voipToken: z.string().min(1, 'voipToken is required'),
})

// --- Response schemas ---

export const deviceResponseSchema = z.object({
  platform: z.enum(['ios', 'android']),
  pushToken: z.string(),
  wakeKeyPublic: z.string(),
  registeredAt: z.string(),
  lastSeenAt: z.string(),
})
