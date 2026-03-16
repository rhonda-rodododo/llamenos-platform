import { z } from 'zod'

/** Hex-encoded 32-byte Nostr public key (x-only, 64 hex chars) */
export const pubkeySchema = z.string().regex(/^[0-9a-f]{64}$/, 'Must be a 64-character hex string')

/** Hex-encoded ECIES ephemeral public key — compressed SEC1 (33 bytes, 66 hex) or x-only (32 bytes, 64 hex) */
export const eciesPubkeySchema = z.string().regex(/^[0-9a-f]{64,66}$/, 'Must be a 64 or 66-character hex string')

/** UUID v4 */
export const uuidSchema = z.uuid()

/** E.164 phone number */
export const e164PhoneSchema = z.string().regex(/^\+\d{7,15}$/, 'Must be E.164 format (+XXXXXXXXXXX)')

/** Pagination parameters — bounded and defaulted */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

/** Cursor-based pagination */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

/** ISO 8601 date string */
export const isoDateSchema = z.iso.datetime().or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
)

/** Standard error response envelope */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
  requestId: z.string().optional(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/** Paginated response metadata — used across domains */
export const paginatedMeta = {
  total: z.number(),
  page: z.number(),
  limit: z.number(),
}

/** Generic success response */
export const okResponseSchema = z.object({ ok: z.boolean() })

/** ECIES recipient envelope — used across notes, messages, files */
export const recipientEnvelopeSchema = z.looseObject({
  pubkey: pubkeySchema,
  wrappedKey: z.string().min(1),
  ephemeralPubkey: eciesPubkeySchema,
})

/** Key envelope — used for note author copies (no pubkey) */
export const keyEnvelopeSchema = z.looseObject({
  wrappedKey: z.string().min(1),
  ephemeralPubkey: eciesPubkeySchema,
})

/** File key envelope — used for file uploads */
export const fileKeyEnvelopeSchema = z.looseObject({
  pubkey: pubkeySchema,
  encryptedFileKey: z.string().min(1),
  ephemeralPubkey: eciesPubkeySchema,
})

/** Encrypted metadata entry — used for file uploads */
export const encryptedMetadataEntrySchema = z.looseObject({
  pubkey: z.string().min(1),
  encryptedContent: z.string().min(1),
  ephemeralPubkey: eciesPubkeySchema,
})

// --- Inferred types (canonical source of truth for envelope types) ---

/** Unified ECIES-wrapped symmetric key for one recipient. */
export type RecipientEnvelope = z.infer<typeof recipientEnvelopeSchema>

/** Key envelope — note author copies (no pubkey). @deprecated Use RecipientEnvelope. */
export type KeyEnvelope = z.infer<typeof keyEnvelopeSchema>

/** @deprecated Use RecipientEnvelope instead. */
export type RecipientKeyEnvelope = RecipientEnvelope

/** ECIES-wrapped file encryption key for one recipient. */
export type FileKeyEnvelope = z.infer<typeof fileKeyEnvelopeSchema>
