import { z } from 'zod/v4'

export const availabilityBlockResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  userPubkey: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  encryptedReason: z.string().nullable(),
  createdAt: z.string(),
})

export const availabilityBlockListResponseSchema = z.object({
  blocks: z.array(availabilityBlockResponseSchema),
})

export const createAvailabilityBlockBodySchema = z.object({
  id: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  encryptedReason: z.string().nullable().optional().default(null),
})
