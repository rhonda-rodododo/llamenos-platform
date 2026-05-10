import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'
import { messagingProviderTypeSchema } from './provider-types'

export const hubProvisioningConfigSchema = z.looseObject({
  hubId: z.string(),
  telephonyProvider: telephonyProviderTypeSchema.optional(),
  messagingProviders: z.array(messagingProviderTypeSchema).optional(),
  phoneNumber: z.string().optional(),
  autoConfigure: z.boolean().optional().default(true),
})
export type HubProvisioningConfig = z.infer<typeof hubProvisioningConfigSchema>

export const setupWizardStateSchema = z.object({
  hubId: z.string(),
  currentStep: z.string(),
  completedSteps: z.array(z.string()),
  telephonyConfigured: z.boolean(),
  messagingConfigured: z.boolean(),
  webhooksConfigured: z.boolean(),
  signalConfigured: z.boolean().optional(),
  a2pConfigured: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SetupWizardState = z.infer<typeof setupWizardStateSchema>
