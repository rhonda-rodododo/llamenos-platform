import { z } from 'zod'

export const twilioCredentialsSchema = z.object({
  accountSid: z.string(),
  authToken: z.string(),
  apiKeySid: z.string().optional(),
  apiKeySecret: z.string().optional(),
})
export type TwilioCredentials = z.infer<typeof twilioCredentialsSchema>

export const telnyxCredentialsSchema = z.object({
  apiKey: z.string(),
  apiSecret: z.string().optional(),
})
export type TelnyxCredentials = z.infer<typeof telnyxCredentialsSchema>

export const signalWireCredentialsSchema = z.object({
  projectId: z.string(),
  apiToken: z.string(),
  spaceUrl: z.string().optional(),
})
export type SignalWireCredentials = z.infer<typeof signalWireCredentialsSchema>

export const vonageCredentialsSchema = z.object({
  apiKey: z.string(),
  apiSecret: z.string(),
  applicationId: z.string().optional(),
})
export type VonageCredentials = z.infer<typeof vonageCredentialsSchema>

export const plivoCredentialsSchema = z.object({
  authId: z.string(),
  authToken: z.string(),
})
export type PlivoCredentials = z.infer<typeof plivoCredentialsSchema>

export const bandwidthCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
  accountId: z.string(),
  applicationId: z.string().optional(),
})
export type BandwidthCredentials = z.infer<typeof bandwidthCredentialsSchema>

export const asteriskCredentialsSchema = z.object({
  ariUrl: z.string(),
  ariUsername: z.string(),
  ariPassword: z.string(),
})
export type AsteriskCredentials = z.infer<typeof asteriskCredentialsSchema>

export const freeSwitchCredentialsSchema = z.object({
  eslHost: z.string(),
  eslPort: z.number().int().optional().default(8021),
  eslPassword: z.string(),
  sipTrunkUrl: z.string().optional(),
})
export type FreeSwitchCredentials = z.infer<typeof freeSwitchCredentialsSchema>
