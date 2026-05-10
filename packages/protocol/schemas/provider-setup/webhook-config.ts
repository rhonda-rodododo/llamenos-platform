import { z } from 'zod'

export const webhookConfigStateSchema = z.object({
  voiceIncoming: z.string().optional(),
  voiceStatus: z.string().optional(),
  sms: z.string().optional(),
  configured: z.boolean(),
})
export type WebhookConfigState = z.infer<typeof webhookConfigStateSchema>
