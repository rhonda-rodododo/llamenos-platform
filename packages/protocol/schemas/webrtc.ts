import { z } from 'zod'

// --- Response schemas ---

export const webrtcTokenResponseSchema = z.object({
  token: z.string(),
  identity: z.string(),
  roomName: z.string().optional(),
})
