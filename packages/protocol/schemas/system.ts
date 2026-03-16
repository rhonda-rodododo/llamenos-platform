import { z } from 'zod'

// --- Response schemas ---

export const systemStatusResponseSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  uptime: z.number().optional(),
  environment: z.string().optional(),
})
