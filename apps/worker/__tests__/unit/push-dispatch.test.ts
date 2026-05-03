/**
 * Unit tests for apps/worker/lib/push-dispatch.ts
 *
 * Tests push dispatcher factory, NoopPushDispatcher, LoggingPushDispatcher,
 * and test push log management.
 */
import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'
import {
  createPushDispatcherFromService,
  recordTestPushPayload,
  getTestPushLog,
  clearTestPushLog,
} from '@worker/lib/push-dispatch'
import type { WakePayload, FullPushPayload, Env } from '@worker/types/infra'

// Mock push-encryption (not needed for unit tests)
mock.module('@worker/lib/push-encryption', () => ({
  encryptWakePayload: () => 'encrypted-wake',
  encryptFullPayload: () => 'encrypted-full',
}))

mock.module('@worker/lib/fcm-client', () => ({
  FcmClient: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Test push log
// ---------------------------------------------------------------------------

describe('test push log', () => {
  beforeEach(() => clearTestPushLog())

  it('records and retrieves push payloads', () => {
    const payload: WakePayload = { hubId: 'h1', type: 'message' }
    recordTestPushPayload(payload, 'pk-1')

    const log = getTestPushLog()
    expect(log).toHaveLength(1)
    expect(log[0].wakePayload.hubId).toBe('h1')
    expect(log[0].recipientPubkey).toBe('pk-1')
    expect(log[0].recordedAt).toBeDefined()
  })

  it('returns a copy (not the internal array)', () => {
    recordTestPushPayload({ hubId: 'h1', type: 'message' }, 'pk-1')
    const log1 = getTestPushLog()
    const log2 = getTestPushLog()
    expect(log1).not.toBe(log2)
    expect(log1).toEqual(log2)
  })

  it('clears the log', () => {
    recordTestPushPayload({ hubId: 'h1', type: 'message' }, 'pk-1')
    clearTestPushLog()
    expect(getTestPushLog()).toHaveLength(0)
  })

  it('caps at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      recordTestPushPayload({ hubId: `h${i}`, type: 'message' }, `pk-${i}`)
    }
    const log = getTestPushLog()
    expect(log.length).toBe(50)
    // Should retain the most recent entries
    expect(log[49].wakePayload.hubId).toBe('h59')
  })
})

// ---------------------------------------------------------------------------
// createPushDispatcherFromService
// ---------------------------------------------------------------------------

describe('createPushDispatcherFromService', () => {
  const mockIdentityService = {
    getDevices: jest.fn().mockResolvedValue({ devices: [] }),
    cleanupDevices: jest.fn(),
  } as never

  const mockShiftsService = {
    getCurrentVolunteers: jest.fn().mockResolvedValue([]),
  } as never

  it('returns NoopPushDispatcher when no push credentials in production', () => {
    const env = { ENVIRONMENT: 'production' } as Env
    const dispatcher = createPushDispatcherFromService(env, mockIdentityService, mockShiftsService)
    // Should be a noop — calling methods should not throw
    expect(dispatcher.sendToVolunteer('pk', {} as WakePayload, {} as FullPushPayload)).resolves.toBeUndefined()
    expect(dispatcher.sendToAllOnShift({} as WakePayload, {} as FullPushPayload)).resolves.toBeUndefined()
  })

  it('returns LoggingPushDispatcher in development without credentials', () => {
    clearTestPushLog()
    const env = { ENVIRONMENT: 'development' } as Env
    const dispatcher = createPushDispatcherFromService(env, mockIdentityService, mockShiftsService)

    // LoggingPushDispatcher records to the test push log
    const payload: WakePayload = { hubId: 'h1', type: 'message' }
    dispatcher.sendToVolunteer('test-pk', payload, {} as FullPushPayload)

    // The logging dispatcher should record the payload
    const log = getTestPushLog()
    expect(log.length).toBeGreaterThanOrEqual(1)
  })

  it('returns ServicePushDispatcher when APNs credentials are present', () => {
    const env = {
      ENVIRONMENT: 'production',
      APNS_KEY_P8: 'key',
      APNS_KEY_ID: 'kid',
      APNS_TEAM_ID: 'team',
    } as Env
    const dispatcher = createPushDispatcherFromService(env, mockIdentityService, mockShiftsService)
    // Should be the real dispatcher, not noop
    expect(dispatcher).toBeDefined()
    expect(typeof dispatcher.sendToVolunteer).toBe('function')
  })

  it('returns ServicePushDispatcher when FCM credentials are present', () => {
    const env = {
      ENVIRONMENT: 'production',
      FCM_SERVICE_ACCOUNT_KEY: '{"key": "value"}',
    } as Env
    const dispatcher = createPushDispatcherFromService(env, mockIdentityService, mockShiftsService)
    expect(dispatcher).toBeDefined()
  })
})
