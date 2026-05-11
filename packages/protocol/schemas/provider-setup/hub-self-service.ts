import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'

export const channelTypeSchema = z.enum([
  'voice',
  'sms',
  'email',
  'signal',
  'whatsapp',
  'telegram',
  'rcs',
])
export type ChannelType = z.infer<typeof channelTypeSchema>

export const channelConfigSchema = z.looseObject({
  voice: z.boolean().optional().default(false),
  sms: z.boolean().optional().default(false),
  email: z.boolean().optional().default(false),
  signal: z.boolean().optional().default(false),
  whatsapp: z.boolean().optional().default(false),
  telegram: z.boolean().optional().default(false),
  rcs: z.boolean().optional().default(false),
})
export type ChannelConfig = z.infer<typeof channelConfigSchema>

export const hubQuotaSchema = z.looseObject({
  maxPhoneNumbers: z.number().int().min(0).optional().default(5),
  maxSmsPerMonth: z.number().int().min(0).optional().default(1000),
  maxCallsPerMonth: z.number().int().min(0).optional().default(500),
  maxSignalMessagesPerMonth: z.number().int().min(0).optional().default(500),
  maxWhatsAppMessagesPerMonth: z.number().int().min(0).optional().default(500),
  maxSubAccounts: z.number().int().min(0).optional().default(0),
})
export type HubQuota = z.infer<typeof hubQuotaSchema>

export const hubUsageSchema = z.looseObject({
  phoneNumbers: z.number().int().min(0).optional().default(0),
  smsSent: z.number().int().min(0).optional().default(0),
  callsReceived: z.number().int().min(0).optional().default(0),
  signalMessagesSent: z.number().int().min(0).optional().default(0),
  whatsAppMessagesSent: z.number().int().min(0).optional().default(0),
  month: z.string().optional(),
  year: z.number().int().optional(),
})
export type HubUsage = z.infer<typeof hubUsageSchema>

export const hubProviderSettingsSchema = z.looseObject({
  providerType: telephonyProviderTypeSchema.optional(),
  channels: channelConfigSchema.optional().default({}),
  quotas: hubQuotaSchema.optional().default({}),
  usage: z.array(hubUsageSchema).optional().default([]),
  providerSetupComplete: z.boolean().optional().default(false),
  subAccountEnabled: z.boolean().optional().default(false),
  subAccountConfigId: z.string().optional(),
})
export type HubProviderSettings = z.infer<typeof hubProviderSettingsSchema>

export const providerTemplateSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  providerType: telephonyProviderTypeSchema,
  defaultChannels: z.array(channelTypeSchema).optional().default([]),
  credentialHints: z.object({}).passthrough().optional().default({}),
  recommendedSettings: z.object({}).passthrough().optional().default({}),
  allowSubAccounts: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type ProviderTemplate = z.infer<typeof providerTemplateSchema>

export const hubOnboardingStateSchema = z.looseObject({
  hubId: z.string(),
  templateId: z.string().optional(),
  currentStep: z.string().optional().default('template_selection'),
  completedSteps: z.array(z.string()).optional().default([]),
  channelConfig: channelConfigSchema.optional().default({}),
  isComplete: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type HubOnboardingState = z.infer<typeof hubOnboardingStateSchema>

export const hubSetupStatusSchema = z.looseObject({
  hubId: z.string(),
  providerConnected: z.boolean(),
  providerType: telephonyProviderTypeSchema.optional(),
  numbersProvisioned: z.number().int(),
  channelsConfigured: z.array(channelTypeSchema),
  channelsPending: z.array(channelTypeSchema),
  a2pStatus: z.string().optional(),
  onboardingComplete: z.boolean(),
})
export type HubSetupStatus = z.infer<typeof hubSetupStatusSchema>
