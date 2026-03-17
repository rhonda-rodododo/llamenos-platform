import { z } from 'zod'

// --- Response schemas ---

export const metricsResponseSchema = z.object({
  uptime: z.object({
    seconds: z.number(),
    formatted: z.string(),
  }),
  requests: z.object({
    total: z.number(),
  }),
  errors: z.object({
    total: z.number(),
    byCategory: z.record(z.string(), z.number()),
  }),
  counters: z.record(z.string(), z.number()),
})
