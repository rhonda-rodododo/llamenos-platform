import { z } from 'zod'
import { pubkeySchema } from './common'

// --- Response schemas ---

export const shiftResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.number()),
  volunteerPubkeys: z.array(z.string()),
  createdAt: z.string(),
})

export const myStatusResponseSchema = z.object({
  onShift: z.boolean(),
  currentShift: z.object({ name: z.string(), startTime: z.string(), endTime: z.string() }).nullable(),
  nextShift: z.object({ name: z.string(), startTime: z.string(), endTime: z.string(), day: z.number() }).nullable(),
})

// --- Input schemas ---

export const createShiftBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.number().int().min(0).max(6)),
  volunteerPubkeys: z.array(pubkeySchema),
})

export const updateShiftBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  volunteerPubkeys: z.array(pubkeySchema).optional(),
})

export const fallbackGroupSchema = z.looseObject({
  volunteerPubkeys: z.array(pubkeySchema),
})
