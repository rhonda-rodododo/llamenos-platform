import { z } from 'zod'

/**
 * Notify contacts request body.
 *
 * The client resolves recipients and renders messages (because it has
 * the decryption keys for E2EE contact profiles). The server acts as
 * a dumb pipe -- dispatching pre-rendered messages via MessagingAdapter.
 */
export const notifyContactsBodySchema = z.object({
  statusLabel: z.string().min(1),
  caseNumber: z.string().optional(),
  recipients: z.array(z.object({
    identifier: z.string().min(1),
    channel: z.enum(['sms', 'signal', 'whatsapp']),
    message: z.string().min(1).max(1600), // SMS segment limit
  })).min(1).max(100),
})

export type NotifyContactsBody = z.infer<typeof notifyContactsBodySchema>

/** Per-recipient dispatch result */
export const notificationResultItemSchema = z.object({
  identifier: z.string(),
  channel: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
})

export type NotificationResultItem = z.infer<typeof notificationResultItemSchema>

/** Aggregate dispatch response */
export const notifyContactsResponseSchema = z.object({
  recordId: z.string(),
  notified: z.number(),
  skipped: z.number(),
  results: z.array(notificationResultItemSchema),
})

export type NotifyContactsResponse = z.infer<typeof notifyContactsResponseSchema>
