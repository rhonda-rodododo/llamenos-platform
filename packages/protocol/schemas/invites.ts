import { z } from 'zod'
import { pubkeySchema } from './common'

// --- Response schemas ---

export const inviteResponseSchema = z.object({
  code: z.uuid(),
  name: z.string(),
  phone: z.string().optional(),
  roleIds: z.array(z.string()),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable().optional(),
  usedBy: z.string().nullable().optional(),
})

export const inviteValidationResponseSchema = z.object({
  valid: z.boolean(),
  error: z.enum(['not_found', 'already_used', 'expired']).optional(),
  name: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
})

// --- Input schemas ---

export const redeemInviteBodySchema = z.looseObject({
  code: z.uuid(),
  pubkey: pubkeySchema,
  timestamp: z.number(),
  token: z.string().min(1),
})

export const createInviteBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  phone: z.string().max(20),
  roleIds: z.array(z.string()).min(1),
})
