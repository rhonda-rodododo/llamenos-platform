/**
 * Wire format for client-reported security events (POST /api/security-events).
 *
 * The submission is UNAUTHENTICATED — a certificate pin mismatch happens
 * before the client can log in — so this schema is deliberately narrow and
 * strict: exactly the five fields the iOS `SecurityEventUploadItem` sends,
 * every string and array bounded, unknown keys rejected.
 */
import { z } from 'zod'

/** Only event types a client is allowed to self-report (never forge `login_failed` etc.). */
export const clientSecurityEventTypeSchema = z.literal('cert_pin_mismatch')

/** Max events accepted per request — matches the iOS client's batch size. */
export const MAX_CLIENT_SECURITY_EVENTS_PER_REQUEST = 20

/** Max SPKI hashes (expected + observed) per event. */
export const MAX_PIN_IDENTIFIERS_PER_EVENT = 16

export const clientSecurityEventItemSchema = z.strictObject({
  event_type: clientSecurityEventTypeSchema,
  /** ISO 8601 timestamp of when the client observed the event. */
  occurred_at: z.string().max(40).datetime({ offset: true }),
  app_version: z.string().min(1).max(64),
  os_version: z.string().min(1).max(128),
  /** Base64 SPKI SHA-256 hashes (44 chars each) — no hostnames, IPs or identifiers. */
  pin_identifiers: z
    .array(z.string().min(1).max(64).regex(/^[A-Za-z0-9+/_=-]+$/, 'Must be a base64 hash'))
    .min(1)
    .max(MAX_PIN_IDENTIFIERS_PER_EVENT),
})

export const submitClientSecurityEventsBodySchema = z.strictObject({
  events: z.array(clientSecurityEventItemSchema).min(1).max(MAX_CLIENT_SECURITY_EVENTS_PER_REQUEST),
})

export const submitClientSecurityEventsResponseSchema = z.object({
  accepted: z.number().int(),
})

export type ClientSecurityEventItem = z.infer<typeof clientSecurityEventItemSchema>
