import { describe, it, expect } from 'vitest'
import {
  MockTelephonyAdapter,
  MockTelephonyRefusedError,
  isMockTelephonyAllowed,
  mockTelephonyRefusalReason,
  assertMockTelephonyAllowed,
} from '@worker/telephony/mock'
import { getTelephonyFromService, getHubTelephonyFromService } from '@worker/lib/service-factories'
import type { Env } from '@worker/types'
import type { TelephonyProviderConfig } from '@shared/types'

const ALLOWED = { ENVIRONMENT: 'demo', DEMO_MODE: 'true', DEMO_MODE_CONFIRM: 'DESTROY_ALL_DATA' }

describe('mock telephony environment guard', () => {
  it.each(['development', 'staging', 'demo'])('is allowed in %s with DEMO_MODE confirmed', (environment) => {
    expect(isMockTelephonyAllowed({ ...ALLOWED, ENVIRONMENT: environment })).toBe(true)
    expect(() => assertMockTelephonyAllowed({ ...ALLOWED, ENVIRONMENT: environment })).not.toThrow()
  })

  it('refuses in production even with every other flag set', () => {
    for (const environment of ['production', 'Production', ' production ']) {
      const env = { ...ALLOWED, ENVIRONMENT: environment }
      expect(isMockTelephonyAllowed(env)).toBe(false)
      expect(mockTelephonyRefusalReason(env)).toBe('ENVIRONMENT=production')
      expect(() => new MockTelephonyAdapter(env, '+15555550100')).toThrow(MockTelephonyRefusedError)
    }
  })

  it('refuses when ENVIRONMENT is unset or unrecognised (fail closed)', () => {
    expect(isMockTelephonyAllowed({ ...ALLOWED, ENVIRONMENT: undefined })).toBe(false)
    expect(isMockTelephonyAllowed({ ...ALLOWED, ENVIRONMENT: 'prod' })).toBe(false)
    expect(isMockTelephonyAllowed({ ...ALLOWED, ENVIRONMENT: '' })).toBe(false)
  })

  it('refuses without DEMO_MODE=true', () => {
    expect(isMockTelephonyAllowed({ ...ALLOWED, DEMO_MODE: undefined })).toBe(false)
    expect(isMockTelephonyAllowed({ ...ALLOWED, DEMO_MODE: 'false' })).toBe(false)
    expect(isMockTelephonyAllowed({ ...ALLOWED, DEMO_MODE: '1' })).toBe(false)
  })

  it('refuses without the DEMO_MODE_CONFIRM two-factor value', () => {
    expect(isMockTelephonyAllowed({ ...ALLOWED, DEMO_MODE_CONFIRM: undefined })).toBe(false)
    expect(isMockTelephonyAllowed({ ...ALLOWED, DEMO_MODE_CONFIRM: 'yes' })).toBe(false)
  })
})

describe('MockTelephonyAdapter', () => {
  const adapter = new MockTelephonyAdapter(ALLOWED, '+15555550100')

  it('never validates an inbound webhook', async () => {
    expect(await adapter.validateWebhook(new Request('http://x/api/telephony/incoming', { method: 'POST' }))).toBe(false)
  })

  it('rings volunteers without any network call and records the action', async () => {
    const legs = await adapter.ringVolunteers({
      callSid: 'mock-call-1',
      callerNumber: '+15550001111',
      volunteers: [{ phone: '+15550002222', callToken: 't1' }, { phone: '+15550003333', callToken: 't2' }],
      callbackUrl: 'http://x',
    })
    expect(legs).toHaveLength(2)
    expect(adapter.actions).toContainEqual({ type: 'ring', callSid: 'mock-call-1', legs: 2 })
  })

  it('records hangup and cancel-ringing', async () => {
    await adapter.hangupCall('mock-call-1')
    await adapter.cancelRinging(['a', 'b'], 'a')
    expect(adapter.actions).toContainEqual({ type: 'hangup', callSid: 'mock-call-1' })
    expect(adapter.actions).toContainEqual({ type: 'cancel-ringing', callSids: ['a', 'b'], exceptSid: 'a' })
  })

  it('parses JSON webhook payloads and defaults the called number to its hotline', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ callSid: 'c1', callerNumber: '+15550001111' }) })
    expect(await adapter.parseIncomingWebhook(req)).toEqual({ callSid: 'c1', callerNumber: '+15550001111', calledNumber: '+15555550100' })
  })

  it('returns non-Twilio, JSON mock responses', () => {
    expect(adapter.rejectCall().contentType).toBe('application/json')
    expect(JSON.parse(adapter.emptyResponse().body)).toMatchObject({ mock: true })
  })
})

describe('adapter factory selects the mock per hub, and refuses it outside demo mode', () => {
  const mockConfig = { type: 'mock', phoneNumber: '+15555550100' } as unknown as TelephonyProviderConfig
  const settings = (hubConfig: TelephonyProviderConfig | null) => ({
    getHubTelephonyProvider: async () => hubConfig,
    getTelephonyProvider: async () => null,
  })
  const env = (over: Record<string, string>) => ({ ...over }) as unknown as Env

  it('returns a MockTelephonyAdapter for a hub configured with type mock in demo mode', async () => {
    const adapter = await getHubTelephonyFromService(env(ALLOWED), settings(mockConfig), 'hub-1')
    expect(adapter).toBeInstanceOf(MockTelephonyAdapter)
  })

  it('returns null (never a real provider fallback) in production with every other flag set', async () => {
    const withTwilioEnv = env({
      ...ALLOWED,
      ENVIRONMENT: 'production',
      TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_PHONE_NUMBER: '+15550009999',
    })
    expect(await getHubTelephonyFromService(withTwilioEnv, settings(mockConfig), 'hub-1')).toBeNull()
    expect(await getTelephonyFromService(withTwilioEnv, { getTelephonyProvider: async () => mockConfig })).toBeNull()
  })

  it('returns null without DEMO_MODE_CONFIRM', async () => {
    expect(await getHubTelephonyFromService(env({ ...ALLOWED, DEMO_MODE_CONFIRM: '' }), settings(mockConfig), 'hub-1')).toBeNull()
  })
})
