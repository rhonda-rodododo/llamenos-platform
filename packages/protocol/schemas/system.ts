import { z } from 'zod'

// --- Response schemas ---

export const systemStatusResponseSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  uptime: z.number().optional(),
  environment: z.string().optional(),
})

export const serviceStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['ok', 'degraded', 'down']),
  details: z.string().optional(),
})

export type ServiceStatus = z.infer<typeof serviceStatusSchema>

export const systemHealthResponseSchema = z.object({
  server: z.object({
    status: z.enum(['ok', 'degraded', 'down']),
    uptime: z.number(),
    version: z.string(),
  }),
  services: z.array(serviceStatusSchema),
  calls: z.object({
    today: z.number(),
    active: z.number(),
    avgResponseSeconds: z.number(),
    missed: z.number(),
  }),
  storage: z.object({
    dbSize: z.string(),
    blobStorage: z.string(),
  }),
  backup: z.object({
    lastBackup: z.string().nullable(),
    backupSize: z.string(),
    lastVerify: z.string().nullable(),
  }),
  users: z.object({
    totalActive: z.number(),
    onlineNow: z.number(),
    onShift: z.number(),
    shiftCoverage: z.number(),
  }),
  timestamp: z.string(),
})

export type SystemHealth = z.infer<typeof systemHealthResponseSchema>
