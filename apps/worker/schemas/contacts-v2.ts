import { z } from 'zod'
import { recipientEnvelopeSchema, paginationSchema } from './common'

// --- Contact record (stored in ContactDirectoryDO) ---

export const contactSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  identifierHashes: z.array(z.string()),
  nameHash: z.string().optional(),
  trigramTokens: z.array(z.string()).optional(),
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  contactTypeHash: z.string().optional(),
  tagHashes: z.array(z.string()),
  statusHash: z.string().optional(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastInteractionAt: z.string(),
  caseCount: z.number(),
  noteCount: z.number(),
  interactionCount: z.number(),
})

export type Contact = z.infer<typeof contactSchema>

// --- Create contact body ---

export const createContactBodySchema = z.object({
  hubId: z.string(),
  identifierHashes: z.array(z.string()).min(1),
  nameHash: z.string().optional(),
  trigramTokens: z.array(z.string()).optional(),
  encryptedSummary: z.string().min(1),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  contactTypeHash: z.string().optional(),
  tagHashes: z.array(z.string()).optional(),
  statusHash: z.string().optional(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})

export type CreateContactBody = z.infer<typeof createContactBodySchema>

// --- Update contact body (partial) ---

export const updateContactBodySchema = createContactBodySchema.partial()

export type UpdateContactBody = z.infer<typeof updateContactBodySchema>

// --- List contacts query (pagination + blind index filters) ---

export const listContactsQuerySchema = paginationSchema.extend({
  contactTypeHash: z.string().optional(),
  statusHash: z.string().optional(),
  nameToken: z.string().optional(),
})

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>

// --- Encrypted payloads (client-side only, for reference/codegen) ---

/** Summary tier — visible to anyone with contacts:view */
export const contactSummarySchema = z.object({
  displayName: z.string(),
  contactType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export type ContactSummary = z.infer<typeof contactSummarySchema>

/** PII tier — visible only to those with contacts:view-pii */
export const contactPIISchema = z.object({
  legalName: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  identifiers: z.array(z.object({
    type: z.enum(['phone', 'signal', 'email', 'nickname', 'legal_name', 'custom']),
    value: z.string(),
    label: z.string().optional(),
    isPrimary: z.boolean().default(false),
  })),
  demographics: z.object({
    pronouns: z.string().optional(),
    language: z.string().optional(),
    age: z.number().optional(),
    race: z.string().optional(),
    gender: z.string().optional(),
    nationality: z.string().optional(),
  }).optional(),
  emergencyContacts: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string().optional(),
    signal: z.string().optional(),
  })).optional(),
  notes: z.string().optional(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(['signal', 'sms', 'whatsapp', 'phone', 'email']).optional(),
    preferredLanguage: z.string().optional(),
    doNotContact: z.boolean().optional(),
  }).optional(),
})

export type ContactPII = z.infer<typeof contactPIISchema>

// --- Response schemas for OpenAPI ---

export const contactListResponseSchema = z.object({
  contacts: z.array(contactSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
})

export const contactLookupResponseSchema = z.object({
  contact: contactSchema.nullable(),
})

export const contactSearchResponseSchema = z.object({
  contacts: z.array(contactSchema),
})
