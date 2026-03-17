import { z } from 'zod'

// --- Response schemas ---

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['ok', 'failing'])),
  details: z.record(z.string(), z.string()).optional(),
  version: z.string().optional(),
  uptime: z.number().optional(),
})

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
})

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['ok', 'failing'])),
  details: z.record(z.string(), z.string()).optional(),
  version: z.string().optional(),
})
