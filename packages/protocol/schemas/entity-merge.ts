import { z } from 'zod'

export const mergeRecordsBodySchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
})

export const mergeRecordsResponseSchema = z.object({
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedAt: z.iso.datetime(),
  relinkedContacts: z.number().int(),
  relinkedInteractions: z.number().int(),
  relinkedEvidence: z.number().int(),
})

export type MergeRecordsBody = z.infer<typeof mergeRecordsBodySchema>
export type MergeRecordsResponse = z.infer<typeof mergeRecordsResponseSchema>
