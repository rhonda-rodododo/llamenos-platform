import { z } from 'zod'

// --- Retention categories ---

export const retentionCategorySchema = z.enum([
  'call_records',
  'notes',
  'messages',
  'audit_log',
])

export type RetentionCategory = z.infer<typeof retentionCategorySchema>

// --- Retention setting ---

export const retentionSettingSchema = z.object({
  hubId: z.string(),
  category: retentionCategorySchema,
  retentionDays: z.number().int().min(30).max(3650),
  updatedAt: z.string(),
  updatedBy: z.string(),
})

export type RetentionSetting = z.infer<typeof retentionSettingSchema>

// --- Update retention body ---

export const updateRetentionBodySchema = z.object({
  settings: z.array(
    z.object({
      category: retentionCategorySchema,
      retentionDays: z.number().int().min(30).max(3650),
    }),
  ).min(1).max(4),
})

// --- Platform floor ---

export const retentionPlatformFloorSchema = z.object({
  category: retentionCategorySchema,
  minRetentionDays: z.number().int().min(1).max(3650),
  updatedAt: z.string(),
  updatedBy: z.string(),
})

export type RetentionPlatformFloor = z.infer<typeof retentionPlatformFloorSchema>

// --- Update platform floors body ---

export const updateRetentionFloorsBodySchema = z.object({
  floors: z.array(
    z.object({
      category: retentionCategorySchema,
      minRetentionDays: z.number().int().min(1).max(3650),
    }),
  ).min(1).max(4),
})

// --- Response schemas ---

export const retentionSettingsResponseSchema = z.object({
  settings: z.array(retentionSettingSchema),
})

export const retentionFloorsResponseSchema = z.object({
  floors: z.array(retentionPlatformFloorSchema),
})
