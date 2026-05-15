import { z } from 'zod'

// --- Response schemas ---

export const teamResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  encryptedName: z.string(),
  encryptedDescription: z.string().nullable(),
  createdBy: z.string(),
  memberCount: z.number(),
  contactCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type TeamResponse = z.infer<typeof teamResponseSchema>

export const teamListResponseSchema = z.object({
  teams: z.array(teamResponseSchema),
})

export const teamMemberResponseSchema = z.object({
  teamId: z.string(),
  userPubkey: z.string(),
  addedBy: z.string(),
  createdAt: z.string(),
})

export type TeamMemberResponse = z.infer<typeof teamMemberResponseSchema>

export const teamMemberListResponseSchema = z.object({
  members: z.array(teamMemberResponseSchema),
})

export const contactTeamAssignmentResponseSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  teamId: z.string(),
  hubId: z.string(),
  assignedBy: z.string(),
  createdAt: z.string(),
})

export type ContactTeamAssignmentResponse = z.infer<typeof contactTeamAssignmentResponseSchema>

export const contactTeamAssignmentListResponseSchema = z.object({
  assignments: z.array(contactTeamAssignmentResponseSchema),
})

// --- Input schemas ---

export const createTeamBodySchema = z.looseObject({
  id: z.string().uuid(),
  encryptedName: z.string().min(1),
  encryptedDescription: z.string().optional(),
})

export type CreateTeamBody = z.infer<typeof createTeamBodySchema>

export const updateTeamBodySchema = z.looseObject({
  encryptedName: z.string().min(1).optional(),
  encryptedDescription: z.string().nullable().optional(),
})

export type UpdateTeamBody = z.infer<typeof updateTeamBodySchema>

export const addTeamMembersBodySchema = z.looseObject({
  pubkeys: z.array(z.string()).min(1),
})

export const assignTeamContactsBodySchema = z.looseObject({
  contactIds: z.array(z.string()).min(1),
})
