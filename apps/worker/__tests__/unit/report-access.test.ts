import { describe, it, expect } from 'vitest'
import { verifyReportAccess, isReport } from '@worker/lib/report-access'

// ---------------------------------------------------------------------------
// verifyReportAccess
// ---------------------------------------------------------------------------

describe('verifyReportAccess', () => {
  const report = {
    contactIdentifierHash: 'reporter-pubkey',
    assignedTo: 'volunteer-pubkey',
    metadata: { type: 'report' },
  }

  it('grants access to users with reports:read-all', () => {
    expect(verifyReportAccess(report, 'any-pubkey', ['reports:read-all'])).toBe(true)
  })

  it('grants access via wildcard (*)', () => {
    expect(verifyReportAccess(report, 'any-pubkey', ['*'])).toBe(true)
  })

  it('grants access to assigned volunteer with reports:read-assigned', () => {
    expect(verifyReportAccess(report, 'volunteer-pubkey', ['reports:read-assigned'])).toBe(true)
  })

  it('denies unassigned user with reports:read-assigned', () => {
    expect(verifyReportAccess(report, 'other-pubkey', ['reports:read-assigned'])).toBe(false)
  })

  it('grants access to the reporter via contactIdentifierHash', () => {
    expect(verifyReportAccess(report, 'reporter-pubkey', [])).toBe(true)
  })

  it('denies unrelated user with no special permissions', () => {
    expect(verifyReportAccess(report, 'random-pubkey', ['notes:create'])).toBe(false)
  })

  it('denies empty permissions and non-matching pubkey', () => {
    expect(verifyReportAccess(report, 'nobody', [])).toBe(false)
  })

  it('grants access when reporter is also assigned', () => {
    const selfAssigned = {
      contactIdentifierHash: 'dual-pubkey',
      assignedTo: 'dual-pubkey',
      metadata: { type: 'report' },
    }
    expect(verifyReportAccess(selfAssigned, 'dual-pubkey', [])).toBe(true)
  })

  it('reports:read-assigned does not grant access to unassigned report', () => {
    const unassigned = {
      contactIdentifierHash: 'someone-else',
      assignedTo: null,
      metadata: { type: 'report' },
    }
    expect(verifyReportAccess(unassigned, 'volunteer-pubkey', ['reports:read-assigned'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isReport
// ---------------------------------------------------------------------------

describe('isReport', () => {
  it('returns true when metadata.type === "report"', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: { type: 'report' } })).toBe(true)
  })

  it('returns false when metadata.type is something else', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: { type: 'conversation' } })).toBe(false)
  })

  it('returns false when metadata.type is missing', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: {} })).toBe(false)
  })

  it('returns false when metadata is null', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: null })).toBe(false)
  })

  it('returns false when metadata is undefined', () => {
    expect(isReport({ contactIdentifierHash: '' })).toBe(false)
  })

  it('handles double-serialized JSONB (string metadata)', () => {
    const json = JSON.stringify({ type: 'report' })
    expect(isReport({ contactIdentifierHash: '', metadata: json })).toBe(true)
  })

  it('returns false for double-serialized non-report JSONB', () => {
    const json = JSON.stringify({ type: 'call' })
    expect(isReport({ contactIdentifierHash: '', metadata: json })).toBe(false)
  })

  it('returns false for invalid JSON string metadata', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: 'not-json' })).toBe(false)
  })

  it('returns false for empty string metadata', () => {
    expect(isReport({ contactIdentifierHash: '', metadata: '' })).toBe(false)
  })
})
