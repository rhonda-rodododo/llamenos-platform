import { z } from 'zod'
import { e164PhoneSchema } from './common'

// --- Response schemas ---

export const banResponseSchema = z.object({
  phone: z.string(),
  reason: z.string(),
  bannedBy: z.string(),
  bannedAt: z.string(),
})

// --- Input schemas ---

export const createBanBodySchema = z.looseObject({
  phone: e164PhoneSchema,
  reason: z.string().max(500).optional(),
})

export const bulkBanBodySchema = z.looseObject({
  phones: z.array(e164PhoneSchema).min(1).max(500),
  reason: z.string().max(500).optional(),
})
