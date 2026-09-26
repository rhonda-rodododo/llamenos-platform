import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  verifyAllAuditChains,
  stopAuditChainVerifyWorker,
  AUDIT_CHAIN_BROKEN_EVENT,
} from '../../lib/audit-chain-verify-worker'
import type { AuditService, ChainVerificationResult } from '../../services/audit'
import type { IdentityService } from '../../services/identity'

const VALID: ChainVerificationResult = { valid: true, totalEntries: 3, checkedEntries: 3 }
const BROKEN: ChainVerificationResult = {
  valid: false,
  totalEntries: 3,
  checkedEntries: 1,
  firstBrokenEntry: {
    id: 'entry-2',
    seqIndex: 1,
    expected: 'a'.repeat(64),
    actual: 'b'.repeat(64),
    reason: 'previousEntryHash mismatch',
  },
}

function setup(results: Record<string, ChainVerificationResult>) {
  const auditService = {
    listChainHubIds: vi.fn(async () => Object.keys(results).map((k) => (k === 'platform' ? null : k))),
    verifyFullChain: vi.fn(async (hubId: string | undefined) => results[hubId ?? 'platform']),
  }
  const identityService = { emitSecurityEvent: vi.fn(async () => {}) }
  return {
    auditService,
    identityService,
    opts: {
      auditService: auditService as unknown as AuditService,
      identityService: identityService as unknown as IdentityService,
    },
  }
}

describe('verifyAllAuditChains', () => {
  beforeEach(() => stopAuditChainVerifyWorker()) // clears the reported-break memory

  it('raises no event when every chain verifies', async () => {
    const { opts, identityService } = setup({ 'hub-1': VALID, platform: VALID })

    expect(await verifyAllAuditChains(opts)).toBe(0)
    expect(identityService.emitSecurityEvent).not.toHaveBeenCalled()
  })

  it('raises a security event naming the hub and broken entry for a failed chain only', async () => {
    const { opts, identityService } = setup({ 'hub-1': VALID, 'hub-2': BROKEN })

    expect(await verifyAllAuditChains(opts)).toBe(1)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledTimes(1)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledWith(
      null,
      AUDIT_CHAIN_BROKEN_EVENT,
      null,
      expect.objectContaining({
        hubId: 'hub-2',
        entryId: 'entry-2',
        seqIndex: 1,
        reason: 'previousEntryHash mismatch',
      }),
    )
  })

  it('covers the platform chain (null hub id)', async () => {
    const { opts, identityService } = setup({ platform: BROKEN })

    await verifyAllAuditChains(opts)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledWith(
      null,
      AUDIT_CHAIN_BROKEN_EVENT,
      null,
      expect.objectContaining({ hubId: null }),
    )
  })

  it('does not re-report the same break on the next run, but reports a new one', async () => {
    const { opts, identityService, auditService } = setup({ 'hub-1': BROKEN })

    await verifyAllAuditChains(opts)
    await verifyAllAuditChains(opts)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledTimes(1)

    auditService.verifyFullChain.mockResolvedValueOnce({
      ...BROKEN,
      firstBrokenEntry: { ...BROKEN.firstBrokenEntry!, id: 'entry-9' },
    })
    await verifyAllAuditChains(opts)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledTimes(2)
  })

  it('still counts the failure and keeps checking other chains when the event cannot be recorded', async () => {
    const { opts, identityService, auditService } = setup({ 'hub-1': BROKEN, 'hub-2': VALID })
    identityService.emitSecurityEvent.mockRejectedValueOnce(new Error('db down'))

    expect(await verifyAllAuditChains(opts)).toBe(1)
    expect(auditService.verifyFullChain).toHaveBeenCalledTimes(2)

    // The failed emit must not be remembered as reported — the next run retries it.
    await verifyAllAuditChains(opts)
    expect(identityService.emitSecurityEvent).toHaveBeenCalledTimes(2)
  })
})
