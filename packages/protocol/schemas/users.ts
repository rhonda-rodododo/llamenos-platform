import { z } from 'zod'
import { pubkeySchema } from './common'
import { messagingChannelTypeSchema } from './settings'

// --- Response schemas ---

export const userResponseSchema = z.object({
  pubkey: pubkeySchema,
  name: z.string(),
  roles: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
  transcriptionEnabled: z.boolean().optional(),
  spokenLanguages: z.array(z.string()).optional(),
  uiLanguage: z.string().optional(),
  profileCompleted: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.enum(['phone', 'browser', 'both']).optional(),
  // Epic 340: User profile extensions
  specializations: z.array(z.string()).optional(),
  maxCaseAssignments: z.number().optional(),
  teamId: z.string().optional(),
  supervisorPubkey: z.string().optional(),
})

export const userAdminResponseSchema = userResponseSchema.extend({
  phone: z.string(),
  messagingEnabled: z.boolean().optional(),
  supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional(),
})

export type User = z.infer<typeof userAdminResponseSchema>

// --- List/wrapper response schemas ---

export const userListResponseSchema = z.object({
  users: z.array(userResponseSchema),
})

export const userMetricsResponseSchema = z.object({
  pubkey: z.string(),
  activeCaseCount: z.number(),
  totalCasesHandled: z.number(),
  averageResolutionDays: z.number().nullable(),
})

// --- Input schemas ---

export const createUserBodySchema = z.looseObject({
  pubkey: pubkeySchema,
  name: z.string().min(1).max(200),
  phone: z.string().max(20),
  roleIds: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  encryptedSecretKey: z.string().optional(),
  // Epic 340: User profile extensions
  specializations: z.array(z.string().max(100)).optional(),
  maxCaseAssignments: z.number().int().min(0).optional(),
  teamId: z.string().max(100).optional(),
  supervisorPubkey: pubkeySchema.optional(),
})

export const updateUserBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  spokenLanguages: z.array(z.string().max(5)).optional(),
  uiLanguage: z.string().max(5).optional(),
  profileCompleted: z.boolean().optional(),
  transcriptionEnabled: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.enum(['phone', 'browser', 'both']).optional(),
  // Epic 340: Users can self-update specializations
  specializations: z.array(z.string().max(100)).optional(),
})

export const adminUpdateUserBodySchema = updateUserBodySchema.extend({
  roles: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
  supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional(),
  // Epic 340: Admin-only profile fields
  maxCaseAssignments: z.number().int().min(0).optional(),
  teamId: z.string().max(100).optional(),
  supervisorPubkey: pubkeySchema.optional(),
})
