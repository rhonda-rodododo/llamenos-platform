import { z } from 'zod'
import { pubkeySchema } from './common'

// --- Response schemas ---

export const shiftResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.number()),
  userPubkeys: z.array(z.string()),
  createdAt: z.string(),
})

export type Shift = z.infer<typeof shiftResponseSchema>

export const myStatusResponseSchema = z.object({
  onShift: z.boolean(),
  currentShift: z.object({ name: z.string(), startTime: z.string(), endTime: z.string() }).nullable(),
  nextShift: z.object({ name: z.string(), startTime: z.string(), endTime: z.string(), day: z.number() }).nullable(),
})

export type ShiftStatus = z.infer<typeof myStatusResponseSchema>

// --- List/wrapper response schemas ---

export const shiftListResponseSchema = z.object({
  shifts: z.array(shiftResponseSchema),
})

// --- Input schemas ---

export const createShiftBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.number().int().min(0).max(6)),
  userPubkeys: z.array(pubkeySchema),
})

export const updateShiftBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  userPubkeys: z.array(pubkeySchema).optional(),
})

export const fallbackGroupSchema = z.looseObject({
  userPubkeys: z.array(pubkeySchema),
})
