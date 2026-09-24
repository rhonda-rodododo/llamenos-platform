/**
 * Unit tests for apps/worker/lib/voip-push.ts
 *
 * Tests VoIP push dispatch logic, early exits, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Env } from '@worker/types/infra'

// Mock external modules
vi.mock('@fivesheepco/cloudflare-apns2', () => ({
  ApnsClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
  Notification: vi.fn(),
  PushType: { voip: 'voip' },
  Priority: { immediate: 10 },
}))

const mockNtfySend = vi.hoisted(() => vi.fn())

vi.mock('@worker/lib/ntfy-client', () => ({
  createNtfyClient: vi.fn(() => ({ send: mockNtfySend })),
}))

vi.mock('@worker/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

import { dispatchVoipPushFromService } from '@worker/lib/voip-push'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetVoipTokens = vi.fn()
const mockCleanupVoipTokens = vi.fn().mockResolvedValue({ removed: 1 })

function makeIdentityService(devices: Array<{ platform: string; voipToken: string; pubkey?: string }> = []) {
  mockGetVoipTokens.mockResolvedValue({ devices: devices.map(d => ({ pubkey: 'pk-1', ...d })) })
  return { getVoipTokens: mockGetVoipTokens, cleanupVoipTokens: mockCleanupVoipTokens } as never
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    APNS_KEY_P8: 'key',
    APNS_KEY_ID: 'kid',
    APNS_TEAM_ID: 'team',
    NTFY_URL: 'http://ntfy:80',
    ...overrides,
  } as Env
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatchVoipPushFromService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNtfySend.mockResolvedValue(true)
  })

  it('returns early for empty volunteer list', async () => {
    const identity = makeIdentityService()

    await dispatchVoipPushFromService(
      [],
      'call-1',
      'Caller',
      'hub-1',
      makeEnv(),
      identity,
    )

    expect(mockGetVoipTokens).not.toHaveBeenCalled()
  })

  it('returns early when no push credentials configured', async () => {
    const identity = makeIdentityService()

    await dispatchVoipPushFromService(
      ['pk-1'],
      'call-1',
      'Caller',
      'hub-1',
      { ENVIRONMENT: 'production' } as Env,  // No APNs or ntfy
      identity,
    )

    expect(mockGetVoipTokens).not.toHaveBeenCalled()
  })

  it('returns early when no devices have VoIP tokens', async () => {
    const identity = makeIdentityService([])

    await dispatchVoipPushFromService(
      ['pk-1'],
      'call-1',
      'Caller',
      'hub-1',
      makeEnv(),
      identity,
    )

    // Should have checked for tokens
    expect(mockGetVoipTokens).toHaveBeenCalledWith(['pk-1'])
  })

  it('dispatches to iOS and Android devices', async () => {
    const devices = [
      { platform: 'ios', voipToken: 'ios-token' },
      { platform: 'android', voipToken: 'android-token' },
    ]
    const identity = makeIdentityService(devices)

    // Should not throw
    await dispatchVoipPushFromService(
      ['pk-1', 'pk-2'],
      'call-1',
      'Caller',
      'hub-1',
      makeEnv(),
      identity,
    )

    expect(mockGetVoipTokens).toHaveBeenCalledWith(['pk-1', 'pk-2'])
  })

  it('uses Promise.allSettled (does not reject on individual failure)', async () => {
    // Even if one push fails, the others should complete
    const devices = [
      { platform: 'ios', voipToken: 'ios-token' },
      { platform: 'android', voipToken: 'android-token' },
    ]
    const identity = makeIdentityService(devices)

    // Should not throw even if underlying push fails
    await expect(
      dispatchVoipPushFromService(
        ['pk-1'],
        'call-1',
        'Caller',
        'hub-1',
        makeEnv(),
        identity,
      ),
    ).resolves.toBeUndefined()
  })

  // #960 — NtfyClient refuses endpoints off the operator's relay (returns false).
  // A VoIP token stored before registration-time validation must be dropped
  // rather than retried on every incoming call.
  it('drops an Android VoIP token the relay refuses, keeping the rest', async () => {
    mockNtfySend.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const identity = makeIdentityService([
      { platform: 'android', voipToken: 'off-origin-endpoint', pubkey: 'pk-1' },
      { platform: 'android', voipToken: 'on-origin-endpoint', pubkey: 'pk-2' },
    ])

    await dispatchVoipPushFromService(['pk-1', 'pk-2'], 'call-1', 'Caller', 'hub-1', makeEnv(), identity)

    expect(mockCleanupVoipTokens).toHaveBeenCalledTimes(1)
    expect(mockCleanupVoipTokens).toHaveBeenCalledWith('pk-1', ['off-origin-endpoint'])
  })

  it('keeps the VoIP token on a transient send failure', async () => {
    mockNtfySend.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const identity = makeIdentityService([{ platform: 'android', voipToken: 'endpoint', pubkey: 'pk-1' }])

    await dispatchVoipPushFromService(['pk-1'], 'call-1', 'Caller', 'hub-1', makeEnv(), identity)

    expect(mockCleanupVoipTokens).not.toHaveBeenCalled()
  })
})
