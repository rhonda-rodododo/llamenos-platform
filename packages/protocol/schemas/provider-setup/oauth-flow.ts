import { z } from 'zod'
import { telephonyProviderTypeSchema } from '@protocol/schemas/settings'

export const oauthFlowStatusSchema = z.enum([
  'pending',
  'callback_received',
  'token_exchanged',
  'failed',
  'expired',
])
export type OauthFlowStatus = z.infer<typeof oauthFlowStatusSchema>

export const oauthFlowStateSchema = z.object({
  id: z.string(),
  provider: telephonyProviderTypeSchema,
  status: oauthFlowStatusSchema,
  redirectUrl: z.string(),
  callbackScheme: z.string().optional(),
  error: z.string().optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
})
export type OauthFlowState = z.infer<typeof oauthFlowStateSchema>
