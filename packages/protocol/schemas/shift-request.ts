import { z } from 'zod/v4'

const requestTypeSchema = z.enum(['join', 'leave'])
const requestStatusSchema = z.enum(['pending', 'approved', 'denied'])

export const shiftJoinRequestResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  shiftId: z.string(),
  userPubkey: z.string(),
  type: requestTypeSchema,
  status: requestStatusSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const shiftJoinRequestListResponseSchema = z.object({
  requests: z.array(shiftJoinRequestResponseSchema),
})

export const createShiftJoinRequestBodySchema = z.object({
  shiftId: z.string(),
  type: requestTypeSchema,
})

export const reviewShiftJoinRequestBodySchema = z.object({
  status: z.enum(['approved', 'denied']),
})
