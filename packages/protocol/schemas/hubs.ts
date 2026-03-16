import { z } from 'zod'
import { pubkeySchema } from './common'

// --- Response schemas ---

export const hubResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  phoneNumber: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const hubMemberResponseSchema = z.object({
  pubkey: pubkeySchema,
  name: z.string(),
  roles: z.array(z.string()),
  joinedAt: z.string().optional(),
})

// --- Input schemas ---

export const createHubBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
})

export const updateHubBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const addHubMemberBodySchema = z.looseObject({
  pubkey: pubkeySchema,
  roleIds: z.array(z.string()).min(1, 'At least one role required'),
})

export const hubKeyEnvelopesBodySchema = z.looseObject({
  envelopes: z.array(z.object({
    pubkey: pubkeySchema,
    wrappedKey: z.string().min(1),
    ephemeralPubkey: pubkeySchema,
  })).min(1, 'At least one envelope required'),
})
