import { z } from 'zod'

// --- Response schemas ---

export const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  permissions: z.array(z.string()),
  isDefault: z.boolean().optional(),
  isSystem: z.boolean().optional(),
  description: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const customFieldResponseSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea', 'file']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  order: z.number().optional(),
  context: z.string().optional(),
  visibleToVolunteers: z.boolean().optional(),
})

export const reportTypeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  fields: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

// --- Input schemas ---

export const customFieldsBodySchema = z.looseObject({
  fields: z.array(z.looseObject({
    name: z.string().min(1).max(200),
    label: z.string().min(1).max(200),
    type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea', 'file']),
    required: z.boolean().optional(),
    options: z.array(z.string().max(200)).optional(),
    order: z.number().int().optional(),
    context: z.string().optional(),
    visibleToVolunteers: z.boolean().optional(),
  })),
})

export const createReportTypeBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  fields: z.array(z.string()).optional(),
})

export const updateReportTypeBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  fields: z.array(z.string()).optional(),
  isArchived: z.boolean().optional(),
})

export const ttlOverridesBodySchema = z.record(z.string(), z.number().int().min(0))

export const setupCompleteBodySchema = z.looseObject({
  demoMode: z.boolean().optional(),
})

export const spamSettingsSchema = z.looseObject({
  voiceCaptchaEnabled: z.boolean().optional(),
  rateLimitEnabled: z.boolean().optional(),
  maxCallsPerMinute: z.number().int().min(1).max(100).optional(),
  blockDurationMinutes: z.number().int().min(1).max(1440).optional(),
})

export const callSettingsSchema = z.looseObject({
  queueTimeoutSeconds: z.number().int().min(30).max(300).optional(),
  voicemailMaxSeconds: z.number().int().min(30).max(300).optional(),
})

export const messagingConfigSchema = z.looseObject({
  enabledChannels: z.array(z.enum(['sms', 'whatsapp', 'signal', 'rcs'])).optional(),
  autoAssignEnabled: z.boolean().optional(),
  maxConcurrentPerVolunteer: z.number().int().min(1).max(20).optional(),
  inactivityTimeout: z.number().int().min(5).max(1440).optional(),
  welcomeMessage: z.string().max(500).optional(),
  awayMessage: z.string().max(500).optional(),
})

export const telephonyProviderSchema = z.looseObject({
  type: z.enum(['twilio', 'signalwire', 'vonage', 'plivo', 'asterisk']),
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  apiKeySid: z.string().optional(),
  apiKeySecret: z.string().optional(),
  phoneNumber: z.string().regex(/^\+\d{7,15}$/).optional(),
  twimlAppSid: z.string().optional(),
  projectId: z.string().optional(),
  spaceUrl: z.url().optional(),
  applicationId: z.string().optional(),
  ariUrl: z.url().optional(),
  ariUsername: z.string().optional(),
  ariPassword: z.string().optional(),
  // Allow extra provider-specific fields
  signalwireSpace: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  authId: z.string().optional(),
})

export const createRoleSchema = z.looseObject({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  permissions: z.array(z.string()),
  description: z.string().min(1).max(500),
})

export const updateRoleSchema = z.looseObject({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
})

export const webauthnSettingsSchema = z.looseObject({
  requireForAdmins: z.boolean().optional(),
  requireForVolunteers: z.boolean().optional(),
})

export const transcriptionSettingsSchema = z.looseObject({
  globalEnabled: z.boolean().optional(),
  allowVolunteerOptOut: z.boolean().optional(),
})

export const ivrLanguagesSchema = z.looseObject({
  languages: z.array(z.string()).optional(),
})

export const setupStateSchema = z.looseObject({
  completed: z.boolean().optional(),
  step: z.string().optional(),
})
