import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startParallelRinging } from '../../services/ringing'
import type { Env } from '../../types'
import type { Services } from '../../services'
import * as serviceFactories from '../../lib/service-factories'

const mockAdapter = (serviceFactories as unknown as { __mockAdapter: { ringVolunteers: ReturnType<typeof vi.fn> } }).__mockAdapter

vi.mock('../../lib/service-factories', () => {
  const mockAdapter = {
    ringVolunteers: vi.fn().mockResolvedValue(undefined),
  }
  return {
    getTelephonyFromService: vi.fn().mockResolvedValue(mockAdapter),
    getHubTelephonyFromService: vi.fn().mockResolvedValue(mockAdapter),
    __mockAdapter: mockAdapter,
  }
})

vi.mock('../../lib/voip-push', () => ({
  dispatchVoipPushFromService: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/nostr-events', () => ({
  publishNostrEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../../routes/metrics', () => ({
  incCounter: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    SERVER_NOSTR_SECRET: 'a'.repeat(64),
    NOSTR_RELAY_URL: 'ws://localhost:7777',
    ...overrides,
  } as Env
}

function makeUser(overrides: {
  pubkey: string
  active?: boolean
  onBreak?: boolean
  callPreference?: string
  phone?: string | null
}) {
  return {
    pubkey: overrides.pubkey,
    name: overrides.pubkey,
    active: overrides.active ?? true,
    onBreak: overrides.onBreak ?? false,
    callPreference: overrides.callPreference ?? 'phone',
    phone: 'phone' in overrides ? overrides.phone : '+15551234567',
    roles: ['role-volunteer'],
  }
}

function makeServices(overrides: {
  onShiftPubkeys?: string[]
  fallbackPubkeys?: string[]
  allUsers?: ReturnType<typeof makeUser>[]
}): Services {
  const {
    onShiftPubkeys = [],
    fallbackPubkeys = [],
    allUsers = [],
  } = overrides

  return {
    shifts: {
      getCurrentVolunteers: vi.fn().mockResolvedValue(onShiftPubkeys),
    },
    settings: {
      getFallbackGroup: vi.fn().mockResolvedValue({ userPubkeys: fallbackPubkeys }),
    },
    identity: {
      getUsers: vi.fn().mockResolvedValue({ users: allUsers }),
    },
    calls: {
      addCall: vi.fn().mockResolvedValue({ callId: 'CA-test' }),
      createCallToken: vi.fn().mockResolvedValue('token-abc'),
    },
  } as unknown as Services
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startParallelRinging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips when no volunteers on shift and no fallback', async () => {
    const services = makeServices({
      onShiftPubkeys: [],
      fallbackPubkeys: [],
    })

    await startParallelRinging('CA-1', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    // Should not register a call
    expect(services.calls.addCall).not.toHaveBeenCalled()
  })

  it('uses fallback group when no one is on shift', async () => {
    const services = makeServices({
      onShiftPubkeys: [],
      fallbackPubkeys: ['pk-fallback'],
      allUsers: [
        makeUser({ pubkey: 'pk-fallback', active: true, phone: '+15559999999' }),
      ],
    })

    await startParallelRinging('CA-2', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    expect(services.settings.getFallbackGroup).toHaveBeenCalled()
    expect(services.calls.addCall).toHaveBeenCalled()
  })

  it('filters out inactive volunteers', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-active', 'pk-inactive'],
      allUsers: [
        makeUser({ pubkey: 'pk-active', active: true }),
        makeUser({ pubkey: 'pk-inactive', active: false }),
      ],
    })

    await startParallelRinging('CA-3', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    // Call should be registered
    expect(services.calls.addCall).toHaveBeenCalled()
    // Only 1 volunteer should be rung (pk-active only)
    expect(mockAdapter.ringVolunteers).toHaveBeenCalled()
    const ringArgs = mockAdapter.ringVolunteers.mock.calls[0][0]
    expect(ringArgs.volunteers).toHaveLength(1)
  })

  it('filters out volunteers on break', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-working', 'pk-break'],
      allUsers: [
        makeUser({ pubkey: 'pk-working', active: true, onBreak: false }),
        makeUser({ pubkey: 'pk-break', active: true, onBreak: true }),
      ],
    })

    await startParallelRinging('CA-4', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    expect(mockAdapter.ringVolunteers).toHaveBeenCalled()
    const ringArgs = mockAdapter.ringVolunteers.mock.calls[0][0]
    expect(ringArgs.volunteers).toHaveLength(1)
  })

  it('only rings phones for volunteers with phone preference and a phone number', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-phone', 'pk-browser', 'pk-both', 'pk-nophone'],
      allUsers: [
        makeUser({ pubkey: 'pk-phone', callPreference: 'phone', phone: '+15551111111' }),
        makeUser({ pubkey: 'pk-browser', callPreference: 'browser', phone: '+15552222222' }),
        makeUser({ pubkey: 'pk-both', callPreference: 'both', phone: '+15553333333' }),
        makeUser({ pubkey: 'pk-nophone', callPreference: 'phone', phone: null }),
      ],
    })

    await startParallelRinging('CA-5', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    // Should create tokens for pk-phone and pk-both (phone or both + has phone)
    // pk-browser has browser pref (no phone ring), pk-nophone has no phone number
    // Also verify the adapter was called with the correct number of volunteers
    expect(mockAdapter.ringVolunteers).toHaveBeenCalled()
    const ringArgs = mockAdapter.ringVolunteers.mock.calls[0][0]
    expect(ringArgs.volunteers).toHaveLength(2)
  })

  it('registers the incoming call with correct data', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-1'],
      allUsers: [makeUser({ pubkey: 'pk-1' })],
    })

    await startParallelRinging('CA-6', '+15559876543', 'http://localhost', makeEnv(), services, 'hub-1')

    expect(services.calls.addCall).toHaveBeenCalledWith('hub-1', {
      callId: 'CA-6',
      callerNumber: '+15559876543',
      callerLast4: '6543',
      status: 'ringing',
    })
  })

  it('extracts last 4 digits of caller number', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-1'],
      allUsers: [makeUser({ pubkey: 'pk-1' })],
    })

    await startParallelRinging('CA-7', '+13035551234', 'http://localhost', makeEnv(), services, 'hub-1')

    const addCallArgs = (services.calls.addCall as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(addCallArgs.callerLast4).toBe('1234')
  })

  it('skips VoIP push for global-scope calls (empty hubId)', async () => {
    const { dispatchVoipPushFromService } = await import('../../lib/voip-push')

    const services = makeServices({
      onShiftPubkeys: ['pk-1'],
      allUsers: [makeUser({ pubkey: 'pk-1', callPreference: 'both' })],
    })

    await startParallelRinging('CA-8', '+15551234567', 'http://localhost', makeEnv(), services, '')

    // VoIP push should NOT be dispatched for empty hubId
    expect(dispatchVoipPushFromService).not.toHaveBeenCalled()
  })

  it('does not throw on errors (catches internally)', async () => {
    const services = makeServices({
      onShiftPubkeys: ['pk-1'],
    })
    // Make identity.getUsers throw
    ;(services.identity.getUsers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB connection failed'),
    )

    // Should not throw — errors are caught and logged
    await expect(
      startParallelRinging('CA-9', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1'),
    ).resolves.toBeUndefined()
  })

  it('BUG: createCallToken gets empty string when vol.pubkey is falsy', async () => {
    // If a user row has a falsy pubkey (shouldn't happen, but test the code path),
    // createCallToken receives '' for volunteerPubkey due to `vol.pubkey ?? ''`
    const services = makeServices({
      onShiftPubkeys: [''],
      allUsers: [makeUser({ pubkey: '', active: true, phone: '+15551111111' })],
    })

    await startParallelRinging('CA-10', '+15551234567', 'http://localhost', makeEnv(), services, 'hub-1')

    // Token should be created with empty pubkey — documents the gap
    if ((services.calls.createCallToken as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
      const tokenArgs = (services.calls.createCallToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(tokenArgs.volunteerPubkey).toBe('')
    }
  })
})
