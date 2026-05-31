import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'

export const ownedNumberSchema = z.object({
  id: z.string(),
  phoneNumber: z.string(),
  providerType: telephonyProviderTypeSchema,
  hubId: z.string().optional(),
  friendlyName: z.string().optional(),
  capabilities: z.array(z.string()),
  voiceUrl: z.string().optional(),
  statusUrl: z.string().optional(),
  smsUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type OwnedNumber = z.infer<typeof ownedNumberSchema>

export const availableNumberSchema = z.object({
  phoneNumber: z.string(),
  providerType: telephonyProviderTypeSchema,
  friendlyName: z.string().optional(),
  capabilities: z.array(z.string()),
  locality: z.string().optional(),
  region: z.string().optional(),
  monthlyPrice: z.string().optional(),
})
export type AvailableNumber = z.infer<typeof availableNumberSchema>

export const numberSearchQuerySchema = z.object({
  providerType: telephonyProviderTypeSchema,
  countryCode: z.string().optional().default('US'),
  areaCode: z.string().optional(),
  contains: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
})
export type NumberSearchQuery = z.infer<typeof numberSearchQuerySchema>

export const numberProvisionRequestSchema = z.object({
  phoneNumber: z.string(),
  providerType: telephonyProviderTypeSchema,
  friendlyName: z.string().optional(),
  hubId: z.string().optional(),
  autoConfigureWebhooks: z.boolean().optional().default(true),
})
export type NumberProvisionRequest = z.infer<typeof numberProvisionRequestSchema>
