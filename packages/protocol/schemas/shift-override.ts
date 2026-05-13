import { z } from 'zod/v4'
import { pubkeySchema } from './common'

const overrideTypeSchema = z.enum(['cancel', 'substitute'])

export const shiftOverrideResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  shiftId: z.string().nullable(),
  date: z.string(),
  type: overrideTypeSchema,
  userPubkeys: z.array(z.string()).nullable(),
  encryptedNote: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export const shiftOverrideListResponseSchema = z.object({
  overrides: z.array(shiftOverrideResponseSchema),
})

export const createShiftOverrideBodySchema = z.object({
  id: z.string().uuid(),
  shiftId: z.string().nullable().optional().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: overrideTypeSchema,
  userPubkeys: z.array(pubkeySchema).nullable().optional().default(null),
  encryptedNote: z.string().nullable().optional().default(null),
})

export const overrideQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
