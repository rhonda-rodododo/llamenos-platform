import { z } from 'zod'
import { pubkeySchema } from './common'
import { messagingChannelTypeSchema } from './settings'

// --- Response schemas ---

export const volunteerResponseSchema = z.object({
  pubkey: pubkeySchema,
  name: z.string(),
  phone: z.string().optional(),
  roles: z.array(z.string()),
  active: z.boolean(),
  transcriptionEnabled: z.boolean().optional(),
  spokenLanguages: z.array(z.string()).optional(),
  uiLanguage: z.string().optional(),
  profileCompleted: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.string().optional(),
  // Epic 340: Volunteer profile extensions
  specializations: z.array(z.string()).optional(),
  maxCaseAssignments: z.number().optional(),
  teamId: z.string().optional(),
  supervisorPubkey: z.string().optional(),
})

// --- Input schemas ---

export const createVolunteerBodySchema = z.looseObject({
  pubkey: pubkeySchema,
  name: z.string().min(1).max(200),
  phone: z.string().max(20),
  roleIds: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  encryptedSecretKey: z.string().optional(),
  // Epic 340: Volunteer profile extensions
  specializations: z.array(z.string().max(100)).optional(),
  maxCaseAssignments: z.number().int().min(0).optional(),
  teamId: z.string().max(100).optional(),
  supervisorPubkey: pubkeySchema.optional(),
})

export const updateVolunteerBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  spokenLanguages: z.array(z.string().max(5)).optional(),
  uiLanguage: z.string().max(5).optional(),
  profileCompleted: z.boolean().optional(),
  transcriptionEnabled: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.enum(['phone', 'browser', 'both']).optional(),
  // Epic 340: Volunteers can self-update specializations
  specializations: z.array(z.string().max(100)).optional(),
})

export const adminUpdateVolunteerBodySchema = updateVolunteerBodySchema.extend({
  roles: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
  supportedMessagingChannels: z.array(messagingChannelTypeSchema).optional(),
  // Epic 340: Admin-only profile fields
  maxCaseAssignments: z.number().int().min(0).optional(),
  teamId: z.string().max(100).optional(),
  supervisorPubkey: pubkeySchema.optional(),
})
