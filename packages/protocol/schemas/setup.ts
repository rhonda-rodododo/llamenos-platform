import { z } from 'zod'

// --- Response schemas ---

export const setupStateResponseSchema = z.looseObject({
  setupCompleted: z.boolean(),
  demoMode: z.boolean().optional(),
})

export const connectionTestResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
})

// --- Input schemas ---

export const testSignalBodySchema = z.object({
  bridgeUrl: z.string().min(1, 'Bridge URL is required'),
  bridgeApiKey: z.string().optional(),
})

export const testWhatsAppBodySchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone Number ID is required'),
  accessToken: z.string().min(1, 'Access Token is required'),
})
