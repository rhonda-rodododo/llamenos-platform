import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'

export const HUB_CHANNEL_TYPES = [
  'voice',
  'sms',
  'email',
  'signal',
  'whatsapp',
  'telegram',
  'rcs',
] as const

export const hubChannelTypeSchema = z.enum(HUB_CHANNEL_TYPES)
export type HubChannelType = z.infer<typeof hubChannelTypeSchema>

export const channelConfigSchema = z.object(
  Object.fromEntries(HUB_CHANNEL_TYPES.map((t) => [t, z.boolean().optional().default(false)]))
)
export type ChannelConfig = z.infer<typeof channelConfigSchema>

export const hubQuotaSchema = z.object({
  maxPhoneNumbers: z.number().int().min(0).optional().default(5),
  maxSmsPerMonth: z.number().int().min(0).optional().default(1000),
  maxCallsPerMonth: z.number().int().min(0).optional().default(500),
  maxSignalMessagesPerMonth: z.number().int().min(0).optional().default(500),
  maxWhatsAppMessagesPerMonth: z.number().int().min(0).optional().default(500),
  maxSubAccounts: z.number().int().min(0).optional().default(0),
})
export type HubQuota = z.infer<typeof hubQuotaSchema>

export const hubUsageSchema = z.object({
  phoneNumbers: z.number().int().min(0).optional().default(0),
  smsSent: z.number().int().min(0).optional().default(0),
  callsReceived: z.number().int().min(0).optional().default(0),
  signalMessagesSent: z.number().int().min(0).optional().default(0),
  whatsAppMessagesSent: z.number().int().min(0).optional().default(0),
  month: z.string().optional(),
  year: z.number().int().optional(),
})
export type HubUsage = z.infer<typeof hubUsageSchema>

export const hubProviderSettingsSchema = z.object({
  providerType: telephonyProviderTypeSchema.optional(),
  channels: channelConfigSchema.optional().default(
    Object.fromEntries(HUB_CHANNEL_TYPES.map((t) => [t, false])) as Record<HubChannelType, boolean>
  ),
  quotas: hubQuotaSchema.optional().default({
    maxPhoneNumbers: 5, maxSmsPerMonth: 1000, maxCallsPerMonth: 500, maxSignalMessagesPerMonth: 500, maxWhatsAppMessagesPerMonth: 500, maxSubAccounts: 0,
  }),
  usage: z.array(hubUsageSchema).optional().default([]),
  providerSetupComplete: z.boolean().optional().default(false),
  subAccountEnabled: z.boolean().optional().default(false),
  subAccountConfigId: z.string().optional(),
})
export type HubProviderSettings = z.infer<typeof hubProviderSettingsSchema>

export const providerTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  providerType: telephonyProviderTypeSchema,
  defaultChannels: z.array(hubChannelTypeSchema).optional().default([]),
  credentialHints: z.object({}).passthrough().optional().default({}),
  recommendedSettings: z.object({}).passthrough().optional().default({}),
  allowSubAccounts: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type ProviderTemplate = z.infer<typeof providerTemplateSchema>

export const createProviderTemplateSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  providerType: telephonyProviderTypeSchema,
  defaultChannels: z.array(hubChannelTypeSchema).optional(),
  credentialHints: z.object({}).passthrough().optional(),
  recommendedSettings: z.object({}).passthrough().optional(),
  allowSubAccounts: z.boolean().optional(),
})
export type CreateProviderTemplate = z.infer<typeof createProviderTemplateSchema>

export const updateProviderTemplateSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  providerType: telephonyProviderTypeSchema.optional(),
  defaultChannels: z.array(hubChannelTypeSchema).optional(),
  credentialHints: z.object({}).passthrough().optional(),
  recommendedSettings: z.object({}).passthrough().optional(),
  allowSubAccounts: z.boolean().optional(),
  isActive: z.boolean().optional(),
})
export type UpdateProviderTemplate = z.infer<typeof updateProviderTemplateSchema>

export const hubOnboardingStateSchema = z.object({
  hubId: z.string(),
  templateId: z.string().optional(),
  currentStep: z.string().optional().default('template_selection'),
  completedSteps: z.array(z.string()).optional().default([]),
  channelConfig: channelConfigSchema.optional().default(
    Object.fromEntries(HUB_CHANNEL_TYPES.map((t) => [t, false])) as Record<HubChannelType, boolean>
  ),
  isComplete: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type HubOnboardingState = z.infer<typeof hubOnboardingStateSchema>

export const hubSetupStatusSchema = z.object({
  hubId: z.string(),
  providerConnected: z.boolean(),
  providerType: telephonyProviderTypeSchema.optional(),
  numbersProvisioned: z.number().int(),
  channelsConfigured: z.array(hubChannelTypeSchema),
  channelsPending: z.array(hubChannelTypeSchema),
  a2pStatus: z.string().optional(),
  onboardingComplete: z.boolean(),
})
export type HubSetupStatus = z.infer<typeof hubSetupStatusSchema>
