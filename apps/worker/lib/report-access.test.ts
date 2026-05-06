/**
 * Unit tests for report access control.
 *
 * Covers: verifyReportAccess (three-tier), isReport.
 */

import { describe, it, expect } from 'vitest'
import { verifyReportAccess, isReport } from './report-access'

// ---------------------------------------------------------------------------
// verifyReportAccess
// ---------------------------------------------------------------------------

describe('verifyReportAccess', () => {
  const report = {
    contactIdentifierHash: 'caller123',
    assignedTo: 'volunteer456',
  }

  it('grants access for reports:read-all permission', () => {
    expect(verifyReportAccess(report, 'anyone', ['reports:read-all'])).toBe(true)
  })

  it('grants access when reports:read-assigned and report is assigned to user', () => {
    expect(verifyReportAccess(report, 'volunteer456', ['reports:read-assigned'])).toBe(true)
  })

  it('denies access when reports:read-assigned but report assigned to someone else', () => {
    expect(verifyReportAccess(report, 'other-user', ['reports:read-assigned'])).toBe(false)
  })

  it('grants access when contactIdentifierHash matches pubkey (own report)', () => {
    const ownReport = { contactIdentifierHash: 'mykey', assignedTo: null }
    expect(verifyReportAccess(ownReport, 'mykey', [])).toBe(true)
  })

  it('denies access when no permissions and contactIdentifierHash does not match', () => {
    expect(verifyReportAccess(report, 'stranger', [])).toBe(false)
  })

  it('reports:read-all overrides all other conditions', () => {
    const restricted = { contactIdentifierHash: 'other', assignedTo: null }
    expect(verifyReportAccess(restricted, 'admin', ['reports:read-all'])).toBe(true)
  })

  it('multiple permissions work: read-all + read-assigned', () => {
    expect(verifyReportAccess(report, 'anyone', ['reports:read-all', 'reports:read-assigned'])).toBe(true)
  })

  it('denies with empty permissions and non-matching hash', () => {
    expect(verifyReportAccess(report, 'unknown', [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isReport
// ---------------------------------------------------------------------------

describe('isReport', () => {
  it('returns true when metadata.type is "report"', () => {
    expect(isReport({ contactIdentifierHash: 'x', metadata: { type: 'report' } })).toBe(true)
  })

  it('returns false when metadata.type is something else', () => {
    expect(isReport({ contactIdentifierHash: 'x', metadata: { type: 'call' } })).toBe(false)
  })

  it('returns false when metadata is undefined', () => {
    expect(isReport({ contactIdentifierHash: 'x', metadata: undefined })).toBe(false)
  })

  it('returns false when metadata has no type field', () => {
    expect(isReport({ contactIdentifierHash: 'x', metadata: {} })).toBe(false)
  })

  it('handles double-serialized JSONB (string metadata)', () => {
    const stringMeta = JSON.stringify({ type: 'report' })
    expect(isReport({ contactIdentifierHash: 'x', metadata: stringMeta })).toBe(true)
  })

  it('returns false for invalid JSON string metadata', () => {
    expect(isReport({ contactIdentifierHash: 'x', metadata: 'not json' })).toBe(false)
  })

  it('handles double-serialized non-report type', () => {
    const stringMeta = JSON.stringify({ type: 'note' })
    expect(isReport({ contactIdentifierHash: 'x', metadata: stringMeta })).toBe(false)
  })
})
