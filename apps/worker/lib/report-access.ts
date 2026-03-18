import { checkPermission } from '../middleware/permission-guard'

interface ReportLike {
  contactIdentifierHash: string
  assignedTo?: string | null
  metadata?: { type?: string } | unknown
}

/**
 * Verify that a user has access to a report.
 * Returns true if allowed, false if forbidden.
 *
 * Three-tier access:
 * 1. reports:read-all — can see everything
 * 2. reports:read-assigned — can see reports assigned to them
 * 3. Own reports — contactIdentifierHash matches pubkey
 */
export function verifyReportAccess(
  report: ReportLike,
  pubkey: string,
  permissions: string[],
): boolean {
  if (checkPermission(permissions, 'reports:read-all')) return true
  if (checkPermission(permissions, 'reports:read-assigned') && report.assignedTo === pubkey) return true
  if (report.contactIdentifierHash === pubkey) return true
  return false
}

/** Verify that a conversation is actually a report. Returns false if not. */
export function isReport(report: ReportLike): boolean {
  let meta = report.metadata as { type?: string } | string | undefined
  // Drizzle bun-sql may double-serialize JSONB, returning a string
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) as { type?: string } } catch { return false }
  }
  return (meta as { type?: string })?.type === 'report'
}
