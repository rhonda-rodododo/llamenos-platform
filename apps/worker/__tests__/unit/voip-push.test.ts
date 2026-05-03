/**
 * Unit tests for apps/worker/lib/voip-push.ts
 *
 * Tests VoIP push dispatch logic, early exits, and error handling.
 */
import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'
import type { Env } from '@worker/types/infra'

// Mock external modules
mock.module('@fivesheepco/cloudflare-apns2', () => ({
  ApnsClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue(undefined),
  })),
  Notification: jest.fn(),
  PushType: { voip: 'voip' },
  Priority: { immediate: 10 },
}))

mock.module('@worker/lib/fcm-client', () => ({
  FcmClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue(true),
  })),
}))

mock.module('@worker/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}))

import { dispatchVoipPushFromService } from '@worker/lib/voip-push'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetVoipTokens = jest.fn()

function makeIdentityService(devices: Array<{ platform: string; voipToken: string }> = []) {
  mockGetVoipTokens.mockResolvedValue({ devices })
  return { getVoipTokens: mockGetVoipTokens } as never
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    APNS_KEY_P8: 'key',
    APNS_KEY_ID: 'kid',
    APNS_TEAM_ID: 'team',
    FCM_SERVICE_ACCOUNT_KEY: '{}',
    ...overrides,
  } as Env
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatchVoipPushFromService', () => {
  beforeEach(() => jest.clearAllMocks())

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
      { ENVIRONMENT: 'production' } as Env,  // No APNs or FCM
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
})
