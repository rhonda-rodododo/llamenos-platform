import { z } from 'zod'

export const messagingProviderTypeSchema = z.enum([
  'sms',
  'whatsapp',
  'signal',
  'rcs',
])
export type MessagingProviderType = z.infer<typeof messagingProviderTypeSchema>

export const providerCapabilitySchema = z.enum([
  'oauth',
  'listNumbers',
  'provisionNumbers',
  'autoWebhooks',
  'sipTrunks',
  'a2p',
])
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>

export const providerStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'error',
])
export type ProviderStatus = z.infer<typeof providerStatusSchema>
