import { z } from 'zod'

// --- Response schemas ---

export const tagResponseSchema = z.object({
  id: z.string(),
  hubId: z.string(),
  name: z.string(),
  encryptedLabel: z.string(),
  color: z.string(),
  encryptedCategory: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export type TagResponse = z.infer<typeof tagResponseSchema>

export const tagListResponseSchema = z.object({
  tags: z.array(tagResponseSchema),
})

export const tagDeleteResponseSchema = z.object({
  removedFromContacts: z.number(),
})

// --- Input schemas ---

export const createTagBodySchema = z.looseObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  encryptedLabel: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6b7280'),
  encryptedCategory: z.string().optional(),
})

export type CreateTagBody = z.infer<typeof createTagBodySchema>

export const updateTagBodySchema = z.looseObject({
  encryptedLabel: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  encryptedCategory: z.string().nullable().optional(),
})

export type UpdateTagBody = z.infer<typeof updateTagBodySchema>
