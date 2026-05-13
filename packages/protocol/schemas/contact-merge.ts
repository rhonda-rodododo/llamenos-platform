import { z } from 'zod'

export const mergeContactsBodySchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedEncryptedSummary: z.string(),
  mergedSummaryEnvelopes: z.array(z.object({
    recipientPubkey: z.string(),
    encryptedKey: z.string(),
  })),
  mergedBlindIndexes: z.object({
    identifierHashes: z.array(z.string()).optional().default([]),
    tagHashes: z.array(z.string()).optional().default([]),
    contactTypeHash: z.string().optional(),
  }),
  mergedTrigramTokens: z.array(z.string()).optional().default([]),
  mergedNameHash: z.string().optional(),
})

export const mergeContactsResponseSchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedAt: z.iso.datetime(),
})

export type MergeContactsBody = z.infer<typeof mergeContactsBodySchema>
export type MergeContactsResponse = z.infer<typeof mergeContactsResponseSchema>
