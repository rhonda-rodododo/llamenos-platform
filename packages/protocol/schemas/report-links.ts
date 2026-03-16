import { z } from 'zod'
import { recipientEnvelopeSchema } from './common'

// --- Report-Case Link (stored in CaseDO) ---

export const reportCaseLinkSchema = z.object({
  reportId: z.string(),              // Conversation ID (report)
  caseId: z.uuid(),         // Record ID (case)
  linkedAt: z.string(),              // ISO 8601
  linkedBy: z.string(),              // Pubkey of person who linked
  encryptedNotes: z.string().optional(),  // E2EE notes on why linked
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export type ReportCaseLink = z.infer<typeof reportCaseLinkSchema>

// --- Link report to case body (from record side: POST /records/:id/reports) ---

export const linkReportToCaseBodySchema = z.object({
  reportId: z.string().min(1),
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export type LinkReportToCaseBody = z.infer<typeof linkReportToCaseBodySchema>

// --- Link case to report body (from report side: POST /reports/:id/records) ---

export const linkCaseToReportBodySchema = z.object({
  caseId: z.uuid(),
  encryptedNotes: z.string().optional(),
  notesEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})

export type LinkCaseToReportBody = z.infer<typeof linkCaseToReportBodySchema>

// --- Response schemas for OpenAPI ---

export const reportCaseLinkListResponseSchema = z.object({
  reports: z.array(reportCaseLinkSchema),
  total: z.number(),
})

export const casesForReportListResponseSchema = z.object({
  records: z.array(reportCaseLinkSchema),
  total: z.number(),
})
