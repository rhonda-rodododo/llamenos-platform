import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'

export const a2pBrandStatusSchema = z.enum([
  'not_submitted',
  'pending',
  'approved',
  'rejected',
  'suspended',
])
export type A2pBrandStatus = z.infer<typeof a2pBrandStatusSchema>

export const a2pCampaignStatusSchema = z.enum([
  'not_submitted',
  'pending',
  'approved',
  'rejected',
  'suspended',
])
export type A2pCampaignStatus = z.infer<typeof a2pCampaignStatusSchema>

export const a2pRegistrationStateSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  providerType: telephonyProviderTypeSchema,
  brandStatus: a2pBrandStatusSchema,
  campaignStatus: a2pCampaignStatusSchema,
  submittedAt: z.string().optional(),
  approvedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type A2pRegistrationState = z.infer<typeof a2pRegistrationStateSchema>
