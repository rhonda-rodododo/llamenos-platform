import { getApiUrl } from '../api-config'
import { netFetch } from '../net'
import { request } from './client'
import type { RecoveryGroupInfo } from '@protocol/schemas'

// ── Recovery Group ─────────────────────────────────────────────────────

export interface RecoverySessionInfo {
  sessionId: string
  hubId: string
  userPubkey: string
  newDevicePubkey: string
  signalVerified: boolean
  status: 'pending' | 'verified' | 'active' | 'completed' | 'expired' | 'cancelled'
  expiresAt: string
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  emergencyOverride: {
    justification: string
    approverPubkey: string
    approverSignature: string
  } | null
  createdAt: string
  contributionCount: number
  threshold: number
  contributions: Array<{
    contributorPubkey: string
    encryptedShare: string
    contributorSignature: string
    contributedAt: string
  }>
}

export interface RecoveryGroupEnrollBody {
  hubId: string
  threshold: number
  totalShares: number
  groupPublicKey: string
  shareEnvelopes: Array<{ holderPubkey: string; envelope: string }>
  shareCommitments: string[]
  duressCommitments?: (string | null)[]
  sigchainLinkHash: string
  delayHours?: number
  emergencyFloorHours?: number
  rotate?: boolean
}

export async function getRecoveryGroup(hubId: string): Promise<RecoveryGroupInfo | null> {
  try {
    return await request<RecoveryGroupInfo>(`/hubs/${hubId}/recovery-group`)
  } catch {
    return null
  }
}

export async function enrollRecoveryGroup(body: RecoveryGroupEnrollBody): Promise<void> {
  await request('/recovery-group/enroll', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getRecoverySessions(hubId: string): Promise<RecoverySessionInfo[]> {
  return request<RecoverySessionInfo[]>(`/recovery-group/sessions?hubId=${hubId}`)
}

export async function getRecoverySession(sessionId: string): Promise<RecoverySessionInfo> {
  return request<RecoverySessionInfo>(`/recovery-group/session/${sessionId}`)
}

export async function contributeShare(
  sessionId: string,
  encryptedShare: string,
  contributorSignature: string,
): Promise<{ ok: boolean; status: string; contributionCount: number }> {
  return request(`/recovery-group/session/${sessionId}/contribute`, {
    method: 'POST',
    body: JSON.stringify({ encryptedShare, contributorSignature }),
  })
}

export async function cancelRecoverySession(sessionId: string): Promise<void> {
  await request(`/recovery-group/session/${sessionId}/cancel`, { method: 'POST' })
}

export async function initiateRecovery(
  hubId: string,
  userIdentifier: string,
  newDevicePubkey: string,
): Promise<{ sessionId: string; verificationSent: boolean }> {
  const res = await netFetch(getApiUrl('/recovery-group/initiate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hubId, userIdentifier, newDevicePubkey }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function verifyRecoveryCode(
  sessionId: string,
  verificationCode: string,
): Promise<{ ok: boolean; expiresAt: string }> {
  const res = await netFetch(getApiUrl('/recovery-group/initiate/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, verificationCode }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Verification failed' }))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface RecoveryGroupCandidate {
  pubkey: string
  displayName: string
  encryptionPubkey: string
  deviceVerified: boolean
  lastSeen: string | null
}

export async function getRecoveryGroupCandidates(
  hubId: string,
): Promise<RecoveryGroupCandidate[]> {
  try {
    return await request<RecoveryGroupCandidate[]>(
      `/hubs/${hubId}/recovery-group/candidates`,
    )
  } catch {
    return []
  }
}
