import { z } from 'zod'

// ---------------------------------------------------------------------------
// Security preferences — per-user alert settings
// ---------------------------------------------------------------------------

export const digestCadenceSchema = z.enum(['off', 'daily', 'weekly'])
export type DigestCadence = z.infer<typeof digestCadenceSchema>

export const notificationChannelSchema = z.enum(['web_push', 'signal'])
export type NotificationChannel = z.infer<typeof notificationChannelSchema>

export const securityPrefsSchema = z.object({
  userPubkey: z.string(),
  notificationChannel: notificationChannelSchema,
  disappearingTimerDays: z.number().int().min(0).max(365),
  digestCadence: digestCadenceSchema,
  alertOnNewDevice: z.boolean(),
  alertOnPasskeyChange: z.boolean(),
  alertOnPinChange: z.boolean(),
  updatedAt: z.string().optional(),
})

export type SecurityPrefs = z.infer<typeof securityPrefsSchema>

export const securityPrefsPatchSchema = z.object({
  notificationChannel: notificationChannelSchema.optional(),
  disappearingTimerDays: z.number().int().min(0).max(365).optional(),
  digestCadence: digestCadenceSchema.optional(),
  alertOnNewDevice: z.boolean().optional(),
  alertOnPasskeyChange: z.boolean().optional(),
  alertOnPinChange: z.boolean().optional(),
})

export type SecurityPrefsPatch = z.infer<typeof securityPrefsPatchSchema>

// ---------------------------------------------------------------------------
// Signal contact registration — sent from the desktop client
// ---------------------------------------------------------------------------

export const signalContactRegistrationSchema = z.object({
  /** HMAC hash of the normalized Signal identifier (phone/username) */
  identifierHash: z.string().min(64).max(64),
  /** Encrypted Signal identifier (ECIES envelope, hex) */
  identifierCiphertext: z.string().min(1),
  /** Per-reader key envelopes wrapping the symmetric key */
  identifierEnvelope: z.array(
    z.object({
      recipientPubkey: z.string(),
      encryptedKey: z.string(),
    })
  ),
  /** Whether the identifier is a phone number (+E.164) or Signal username */
  identifierType: z.enum(['phone', 'username']),
})

export type SignalContactRegistration = z.infer<typeof signalContactRegistrationSchema>

// ---------------------------------------------------------------------------
// Notification payload — app server → signal-notifier sidecar
// ---------------------------------------------------------------------------

export const notificationPayloadSchema = z.object({
  identifierHash: z.string().min(64).max(64),
  message: z.string().min(1).max(2000),
  disappearingTimerSeconds: z.number().int().min(0).optional(),
})

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>

// ---------------------------------------------------------------------------
// Sidecar registration payload — app server → signal-notifier /register
// ---------------------------------------------------------------------------

export const notifierRegisterPayloadSchema = z.object({
  identifierHash: z.string().min(64).max(64),
  plaintextIdentifier: z.string().min(1),
  identifierType: z.enum(['phone', 'username']),
})

export type NotifierRegisterPayload = z.infer<typeof notifierRegisterPayloadSchema>

// ---------------------------------------------------------------------------
// HMAC key response — returned to the client so it can hash locally before sending
// ---------------------------------------------------------------------------

export const hmacKeyResponseSchema = z.object({
  hmacKey: z.string().min(1),
})

export type HmacKeyResponse = z.infer<typeof hmacKeyResponseSchema>
