import { z } from 'zod'

// --- Response schemas ---

export const webrtcTokenResponseSchema = z.object({
  token: z.string(),
  provider: z.string(),
  identity: z.string(),
  roomName: z.string().optional(),
})

export const sipTokenResponseSchema = z.object({
  domain: z.string(),
  transport: z.string(),
  username: z.string(),
  password: z.string(),
  iceServers: z.array(z.looseObject({ urls: z.array(z.string()) })).optional(),
  encryption: z.string().optional(),
})

export const telephonyStatusResponseSchema = z.object({
  available: z.boolean(),
  provider: z.string().nullable(),
})
