import { z } from 'zod'
import { e164PhoneSchema } from './common'

// --- Response schemas ---

export const banResponseSchema = z.object({
  phone: z.string(),
  reason: z.string(),
  bannedBy: z.string(),
  bannedAt: z.string(),
})

export type BanEntry = z.infer<typeof banResponseSchema>

// --- List/wrapper response schemas ---

export const banListResponseSchema = z.object({
  bans: z.array(banResponseSchema),
})

export const bulkBanResponseSchema = z.object({
  count: z.number(),
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

export const platformBanResponseSchema = z.object({
  id: z.string(),
  phoneHash: z.string(),
  reason: z.string().nullable(),
  bannedBy: z.string().nullable(),
  bannedAt: z.string(),
})

export type PlatformBan = z.infer<typeof platformBanResponseSchema>

export const platformBanListResponseSchema = z.object({
  bans: z.array(platformBanResponseSchema),
  total: z.number(),
})

export const createPlatformBanBodySchema = z.looseObject({
  phone: e164PhoneSchema,
  reason: z.string().max(500).optional(),
})

export const bulkPlatformBanBodySchema = z.looseObject({
  phones: z.array(e164PhoneSchema).min(1).max(500),
  reason: z.string().max(500).optional(),
})

export const promoteBanBodySchema = z.looseObject({
  banId: z.string().min(1),
})

export const searchBansQuerySchema = z.object({
  phone: e164PhoneSchema,
})

export const searchBansResponseSchema = z.object({
  bans: z.array(
    z.object({
      id: z.string(),
      hubId: z.string().nullable(),
      phoneHash: z.string(),
      reason: z.string().nullable(),
      bannedBy: z.string().nullable(),
      bannedAt: z.string(),
    }),
  ),
})
