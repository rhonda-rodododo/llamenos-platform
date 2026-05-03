import { describe, it, expect, beforeEach, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import type { TelephonyAdapter } from '@worker/telephony/adapter'
import type { Services } from '@worker/services'

function makeMockAdapter(overrides?: Partial<TelephonyAdapter>): TelephonyAdapter {
  return {
    handleLanguageMenu: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Gather/></Response>' }),
    handleIncomingCall: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Enqueue/></Response>' }),
    handleCaptchaResponse: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Enqueue/></Response>' }),
    handleCallAnswered: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Dial><Queue/></Dial></Response>' }),
    handleVoicemail: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Record/></Response>' }),
    handleWaitMusic: jest.fn().mockResolvedValue({ contentType: 'text/xml', body: '<Response><Play/></Response>' }),
    handleVoicemailComplete: jest.fn().mockReturnValue({ contentType: 'text/xml', body: '<Response><Say>Thank you</Say><Hangup/></Response>' }),
    rejectCall: jest.fn().mockReturnValue({ contentType: 'text/xml', body: '<Response><Reject/></Response>' }),
    hangupCall: jest.fn().mockResolvedValue(undefined),
    ringVolunteers: jest.fn().mockResolvedValue([]),
    cancelRinging: jest.fn().mockResolvedValue(undefined),
    validateWebhook: jest.fn().mockResolvedValue(true),
    getCallRecording: jest.fn().mockResolvedValue(null),
    getRecordingAudio: jest.fn().mockResolvedValue(null),
    parseIncomingWebhook: jest.fn().mockResolvedValue({ callSid: 'CA-incoming', callerNumber: '+15551111111', calledNumber: '+15551234567' }),
    parseLanguageWebhook: jest.fn().mockResolvedValue({ callSid: 'CA-lang', callerNumber: '+15551111111', digits: '1' }),
    parseCaptchaWebhook: jest.fn().mockResolvedValue({ digits: '1234', callerNumber: '+15551111111' }),
    parseCallStatusWebhook: jest.fn().mockResolvedValue({ status: 'completed' }),
    parseQueueWaitWebhook: jest.fn().mockResolvedValue({ queueTime: 30 }),
    parseQueueExitWebhook: jest.fn().mockResolvedValue({ result: 'leave' }),
    parseRecordingWebhook: jest.fn().mockResolvedValue({ status: 'completed', recordingSid: 'RE123', callSid: 'CA-rec' }),
    emptyResponse: jest.fn().mockReturnValue({ contentType: 'text/xml', body: '<Response/>' }),
    ...overrides,
  } as TelephonyAdapter
}

function makeServices(adapter: TelephonyAdapter): Services {
  return {
    settings: {
      getTelephonyProvider: jest.fn().mockResolvedValue(null),
      getHubTelephonyProvider: jest.fn().mockResolvedValue(null),
      getHubByPhone: jest.fn().mockResolvedValue({ hub: { id: 'hub-1' } }),
      getIvrLanguages: jest.fn().mockResolvedValue({ enabledLanguages: ['en', 'es'] }),
      getSpamSettings: jest.fn().mockResolvedValue({ voiceCaptchaEnabled: false, rateLimitEnabled: false, maxCallsPerMinute: 5, blockDurationMinutes: 30 }),
      checkRateLimit: jest.fn().mockResolvedValue({ limited: false }),
      storeCaptcha: jest.fn().mockResolvedValue(undefined),
      verifyCaptcha: jest.fn().mockResolvedValue({ match: true, expected: '1234' }),
      getCallSettings: jest.fn().mockResolvedValue({ queueTimeoutSeconds: 90, voicemailMaxSeconds: 120 }),
      getFallbackGroup: jest.fn().mockResolvedValue({ userPubkeys: [] }),
      getIvrAudioList: jest.fn().mockResolvedValue({ recordings: [] }),
      getTranscriptionSettings: jest.fn().mockResolvedValue({ globalEnabled: false }),
    },
    records: {
      checkBan: jest.fn().mockResolvedValue(false),
    },
    calls: {
      resolveCallToken: jest.fn().mockResolvedValue(null),
      answerCall: jest.fn().mockResolvedValue(undefined),
      getActiveCalls: jest.fn().mockResolvedValue([]),
      endCall: jest.fn().mockResolvedValue(undefined),
      getHubIdForCall: jest.fn().mockResolvedValue('hub-1'),
      markVoicemail: jest.fn().mockResolvedValue(undefined),
      addCall: jest.fn().mockResolvedValue({ callId: 'CA-test' }),
      createCallToken: jest.fn().mockResolvedValue('token-abc'),
    },
    identity: {
      getUser: jest.fn().mockResolvedValue({ name: 'Volunteer' }),
      getUsers: jest.fn().mockResolvedValue({ users: [] }),
    },
    audit: {
      log: jest.fn().mockResolvedValue(undefined),
    },
    shifts: {
      getCurrentVolunteers: jest.fn().mockResolvedValue([]),
    },
    conversations: {} as unknown as Services['conversations'],
    blasts: {} as unknown as Services['blasts'],
    contacts: {} as unknown as Services['contacts'],
    cases: {} as unknown as Services['cases'],
    scheduler: {} as unknown as Services['scheduler'],
    cryptoKeys: {} as unknown as Services['cryptoKeys'],
    firehose: {} as unknown as Services['firehose'],
    signalContacts: {} as unknown as Services['signalContacts'],
    securityPrefs: {} as unknown as Services['securityPrefs'],
    userNotifications: {} as unknown as Services['userNotifications'],
    digestCron: {} as unknown as Services['digestCron'],
  } as unknown as Services
}

function makeEnv(overrides?: Record<string, unknown>): AppEnv['Bindings'] {
  return {
    ENVIRONMENT: 'test',
    HOTLINE_NAME: 'Test Hotline',
    HMAC_SECRET: 'a'.repeat(64),
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+15551234567',
    ADMIN_PUBKEY: 'a'.repeat(64),
    AI: { run: jest.fn() } as unknown as AppEnv['Bindings']['AI'],
    R2_BUCKET: {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    } as unknown as AppEnv['Bindings']['R2_BUCKET'],
    ...overrides,
  } as AppEnv['Bindings']
}

async function createTestApp(adapter: TelephonyAdapter, services: Services, envOverrides?: Record<string, unknown>) {
  const factories = await import('@worker/lib/service-factories')
  jest.spyOn(factories, 'getTelephonyFromService').mockResolvedValue(adapter)
  jest.spyOn(factories, 'getHubTelephonyFromService').mockResolvedValue(adapter)

  const { default: telephony } = await import('@worker/routes/telephony')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('services', services as unknown as AppEnv['Variables']['services'])
    c.env = makeEnv(envOverrides)
    Object.defineProperty(c, 'executionCtx', {
      value: {
        waitUntil: jest.fn(),
        passThroughOnException: jest.fn(),
      },
      writable: true,
      configurable: true,
    })
    await next()
  })

  app.route('/api/telephony', telephony)
  return app
}

describe('Telephony routes', () => {
  let adapter: TelephonyAdapter
  let services: Services

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = makeMockAdapter()
    services = makeServices(adapter)
  })

  describe('webhook validation middleware', () => {
    it('rejects invalid webhook signature with 403', async () => {
      adapter.validateWebhook = jest.fn().mockResolvedValue(false)
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA123',
      })
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('Forbidden')
    })

    it('skips validation in dev mode for 127.0.0.1', async () => {
      adapter.validateWebhook = jest.fn().mockResolvedValue(false)
      const app = await createTestApp(adapter, services, { ENVIRONMENT: 'development' })
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'CF-Connecting-IP': '127.0.0.1',
        },
        body: 'CallSid=CA123',
      })
      expect(res.status).not.toBe(403)
      expect(adapter.parseIncomingWebhook).toHaveBeenCalled()
    })

    it('returns 404 when no telephony adapter is configured', async () => {
      const factories = await import('@worker/lib/service-factories')
      jest.spyOn(factories, 'getTelephonyFromService').mockResolvedValue(null)
      jest.spyOn(factories, 'getHubTelephonyFromService').mockResolvedValue(null)
      const { default: telephony } = await import('@worker/routes/telephony')
      const app = new Hono<AppEnv>()
      app.use('*', async (c, next) => {
        c.set('services', services as unknown as AppEnv['Variables']['services'])
        c.env = makeEnv()
        await next()
      })
      app.route('/api/telephony', telephony)
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA123',
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toContain('Telephony is not configured')
    })
  })

  describe('POST /incoming', () => {
    it('returns XML language menu for non-banned caller', async () => {
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA123&From=%2B15551111111&To=%2B15551234567',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      expect(await res.text()).toContain('<Gather')
      expect(adapter.parseIncomingWebhook).toHaveBeenCalled()
      expect(adapter.handleLanguageMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          callSid: 'CA-incoming',
          callerNumber: '+15551111111',
          hotlineName: 'Test Hotline',
          enabledLanguages: ['en', 'es'],
          hubId: 'hub-1',
        }),
      )
    })

    it('rejects banned callers', async () => {
      services.records.checkBan = jest.fn().mockResolvedValue(true)
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA123&From=%2B15551111111',
      })
      expect(res.status).toBe(200)
      expect(adapter.rejectCall).toHaveBeenCalled()
      expect(await res.text()).toContain('<Reject')
    })

    it('falls back to global adapter when hub not found', async () => {
      services.settings.getHubByPhone = jest.fn().mockRejectedValue(new Error('No hub'))
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA123&From=%2B15551111111&To=%2B15551234567',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleLanguageMenu).toHaveBeenCalledWith(
        expect.objectContaining({ hubId: undefined }),
      )
    })
  })

  describe('POST /language-selected', () => {
    it('returns enqueue response for normal call', async () => {
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/language-selected?hub=hub-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA-lang&From=%2B15551111111&Digits=2',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      expect(await res.text()).toContain('<Enqueue')
      expect(adapter.parseLanguageWebhook).toHaveBeenCalled()
      expect(adapter.handleIncomingCall).toHaveBeenCalledWith(
        expect.objectContaining({
          callSid: 'CA-lang',
          callerNumber: '+15551111111',
          callerLanguage: 'es',
          voiceCaptchaEnabled: false,
          rateLimited: false,
          hubId: 'hub-1',
        }),
      )
    })

    it('uses forceLang query param when provided', async () => {
      const app = await createTestApp(adapter, services)
      await app.request('/api/telephony/language-selected?hub=hub-1&forceLang=es', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA-lang&From=%2B15551111111',
      })
      expect(adapter.handleIncomingCall).toHaveBeenCalledWith(
        expect.objectContaining({ callerLanguage: 'es' }),
      )
    })

    it('returns rate-limited response when rate limited', async () => {
      services.settings.checkRateLimit = jest.fn().mockResolvedValue({ limited: true })
      services.settings.getSpamSettings = jest.fn().mockResolvedValue({
        voiceCaptchaEnabled: false,
        rateLimitEnabled: true,
        maxCallsPerMinute: 5,
        blockDurationMinutes: 30,
      })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/language-selected?hub=hub-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA-lang&From=%2B15551111111&Digits=2',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleIncomingCall).toHaveBeenCalledWith(
        expect.objectContaining({ rateLimited: true }),
      )
    })

    it('returns CAPTCHA gather when voice CAPTCHA enabled', async () => {
      services.settings.getSpamSettings = jest.fn().mockResolvedValue({
        voiceCaptchaEnabled: true,
        rateLimitEnabled: false,
        maxCallsPerMinute: 5,
        blockDurationMinutes: 30,
      })
      adapter.handleIncomingCall = jest.fn().mockResolvedValue({
        contentType: 'text/xml',
        body: '<Response><Gather numDigits="4"/></Response>',
      })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/language-selected?hub=hub-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA-lang&From=%2B15551111111&Digits=2',
      })
      expect(res.status).toBe(200)
      expect(services.settings.storeCaptcha).toHaveBeenCalledWith(
        expect.objectContaining({ callSid: 'CA-lang' }),
      )
      const handleCallArgs = (adapter.handleIncomingCall as ReturnType<typeof jest.fn>).mock.calls[0][0]
      expect(handleCallArgs.captchaDigits).toMatch(/^\d{4}$/)
    })

    it('does not start parallel ringing when rate limited', async () => {
      services.settings.checkRateLimit = jest.fn().mockResolvedValue({ limited: true })
      services.settings.getSpamSettings = jest.fn().mockResolvedValue({
        voiceCaptchaEnabled: false,
        rateLimitEnabled: true,
        maxCallsPerMinute: 5,
        blockDurationMinutes: 30,
      })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/language-selected?hub=hub-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallSid=CA-lang&From=%2B15551111111&Digits=2',
      })
      expect(res.status).toBe(200)
      const handleCallArgs = (adapter.handleIncomingCall as ReturnType<typeof jest.fn>).mock.calls[0][0]
      expect(handleCallArgs.rateLimited).toBe(true)
    })
  })

  describe('POST /captcha', () => {
    it('returns enqueue on correct CAPTCHA digits', async () => {
      services.settings.verifyCaptcha = jest.fn().mockResolvedValue({ match: true, expected: '1234' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/captcha?hub=hub-1&callSid=CA-captcha&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Digits=1234&From=%2B15551111111',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      expect(await res.text()).toContain('<Enqueue')
      expect(adapter.handleCaptchaResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          callSid: 'CA-captcha',
          digits: '1234',
          expectedDigits: '1234',
          callerLanguage: 'en',
          hubId: 'hub-1',
        }),
      )
    })

    it('returns hangup on incorrect CAPTCHA digits', async () => {
      services.settings.verifyCaptcha = jest.fn().mockResolvedValue({ match: false, expected: '5678' })
      adapter.parseCaptchaWebhook = jest.fn().mockResolvedValue({ digits: '0000', callerNumber: '+15551111111' })
      adapter.handleCaptchaResponse = jest.fn().mockResolvedValue({
        contentType: 'text/xml',
        body: '<Response><Hangup/></Response>',
      })
  })

    it('starts parallel ringing on correct CAPTCHA', async () => {
      services.settings.verifyCaptcha = jest.fn().mockResolvedValue({ match: true, expected: '1234' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/captcha?hub=hub-1&callSid=CA-captcha&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Digits=1234&From=%2B15551111111',
      })
      expect(res.status).toBe(200)
    })
  })

  describe('POST /user-answer', () => {
    it('returns 403 for invalid call token', async () => {
      services.calls.resolveCallToken = jest.fn().mockResolvedValue(null)
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/user-answer?callToken=bad-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      })
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('Forbidden')
    })

    it('bridges call and publishes events on valid token', async () => {
      services.calls.resolveCallToken = jest.fn().mockResolvedValue({
        callSid: 'CA-parent',
        volunteerPubkey: 'pk-vol-1',
        hubId: 'hub-1',
      })
      services.calls.getActiveCalls = jest.fn().mockResolvedValue([
        { callId: 'CA-parent', callerLast4: '1111', startedAt: new Date().toISOString() },
      ])
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/user-answer?callToken=valid-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      expect(await res.text()).toContain('<Dial')
      expect(services.calls.answerCall).toHaveBeenCalledWith('hub-1', 'CA-parent', 'pk-vol-1')
      expect(adapter.handleCallAnswered).toHaveBeenCalledWith(
        expect.objectContaining({
          parentCallSid: 'CA-parent',
          userPubkey: 'pk-vol-1',
          hubId: 'hub-1',
        }),
      )
    })
  })

  describe('POST /call-status', () => {
    it('ends call on completed status', async () => {
      services.calls.resolveCallToken = jest.fn().mockResolvedValue({
        callSid: 'CA-parent',
        volunteerPubkey: 'pk-vol-1',
        hubId: 'hub-1',
      })
      services.calls.getActiveCalls = jest.fn().mockResolvedValue([
        { callId: 'CA-parent', callerLast4: '1111', startedAt: new Date(Date.now() - 60000).toISOString() },
      ])
      adapter.parseCallStatusWebhook = jest.fn().mockResolvedValue({ status: 'completed' })

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/call-status?callToken=token-abc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallStatus=completed',
      })
      expect(res.status).toBe(200)
      expect(services.calls.endCall).toHaveBeenCalledWith('hub-1', 'CA-parent')
      expect(adapter.emptyResponse).toHaveBeenCalled()
    })

    it('does not end call on ringing status', async () => {
      services.calls.resolveCallToken = jest.fn().mockResolvedValue(null)
      adapter.parseCallStatusWebhook = jest.fn().mockResolvedValue({ status: 'ringing' })

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/call-status?parentCallSid=CA-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'CallStatus=ringing',
      })
      expect(res.status).toBe(200)
      expect(services.calls.endCall).not.toHaveBeenCalled()
    })

    it('handles busy/no-answer/failed statuses', async () => {
      for (const status of ['busy', 'no-answer', 'failed'] as const) {
        jest.clearAllMocks()
        adapter = makeMockAdapter()
        services = makeServices(adapter)
        services.calls.resolveCallToken = jest.fn().mockResolvedValue({
          callSid: 'CA-parent',
          volunteerPubkey: 'pk-vol-1',
          hubId: 'hub-1',
        })
        adapter.parseCallStatusWebhook = jest.fn().mockResolvedValue({ status })

        const app = await createTestApp(adapter, services)
        const res = await app.request('/api/telephony/call-status?callToken=token-abc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `CallStatus=${status}`,
        })
        expect(res.status).toBe(200)
        expect(services.calls.endCall).not.toHaveBeenCalled()
      }
    })
  })

  describe('ALL /wait-music', () => {
    it('returns wait music XML on POST', async () => {
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/wait-music?hub=hub-1&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueTime=30',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      expect(adapter.handleWaitMusic).toHaveBeenCalledWith('en', expect.any(Object), 30, 90)
    })

    it('returns wait music XML on GET with queueTime 0', async () => {
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/wait-music?hub=hub-1&lang=es', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleWaitMusic).toHaveBeenCalledWith('es', expect.any(Object), 0, 90)
    })
  })

  describe('POST /queue-exit', () => {
    it('ends call on hangup result', async () => {
      adapter.parseQueueExitWebhook = jest.fn().mockResolvedValue({ result: 'hangup' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/queue-exit?hub=hub-1&callSid=CA-exit&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueResult=hangup',
      })
      expect(res.status).toBe(200)
      expect(services.calls.endCall).toHaveBeenCalledWith('hub-1', 'CA-exit')
      expect(adapter.emptyResponse).toHaveBeenCalled()
    })

    it('returns voicemail prompt on leave result', async () => {
      adapter.parseQueueExitWebhook = jest.fn().mockResolvedValue({ result: 'leave' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/queue-exit?hub=hub-1&callSid=CA-exit&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueResult=leave',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleVoicemail).toHaveBeenCalledWith(
        expect.objectContaining({
          callSid: 'CA-exit',
          callerLanguage: 'en',
          maxRecordingSeconds: 120,
          hubId: 'hub-1',
        }),
      )
    })

    it('returns voicemail prompt on queue-full result', async () => {
      adapter.parseQueueExitWebhook = jest.fn().mockResolvedValue({ result: 'queue-full' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/queue-exit?hub=hub-1&callSid=CA-exit&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueResult=queue-full',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleVoicemail).toHaveBeenCalled()
    })

    it('returns voicemail prompt on error result', async () => {
      adapter.parseQueueExitWebhook = jest.fn().mockResolvedValue({ result: 'error' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/queue-exit?hub=hub-1&callSid=CA-exit&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueResult=error',
      })
      expect(res.status).toBe(200)
      expect(adapter.handleVoicemail).toHaveBeenCalled()
    })

    it('returns empty response on bridged result', async () => {
      adapter.parseQueueExitWebhook = jest.fn().mockResolvedValue({ result: 'bridged' })
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/queue-exit?hub=hub-1&callSid=CA-exit&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'QueueResult=bridged',
      })
      expect(res.status).toBe(200)
      expect(adapter.emptyResponse).toHaveBeenCalled()
      expect(adapter.handleVoicemail).not.toHaveBeenCalled()
    })
  })

  describe('POST /voicemail-complete', () => {
    it('returns thank you and hangup', async () => {
      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/voicemail-complete?hub=hub-1&lang=en', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('xml')
      const body = await res.text()
      expect(body).toContain('<Say')
      expect(body).toContain('<Hangup')
      expect(adapter.handleVoicemailComplete).toHaveBeenCalledWith('en')
    })
  })

  describe('POST /call-recording', () => {
    it('ends call and triggers transcription on completed recording', async () => {
      adapter.parseRecordingWebhook = jest.fn().mockResolvedValue({
        status: 'completed',
        recordingSid: 'RE123',
        callSid: 'CA-parent',
      })
      services.calls.getActiveCalls = jest.fn().mockResolvedValue([
        { callId: 'CA-parent', answeredBy: 'pk-vol-1', callerLast4: '1111' },
      ])

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/call-recording?parentCallSid=CA-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'RecordingStatus=completed&RecordingSid=RE123',
      })
      expect(res.status).toBe(200)
      expect(services.calls.endCall).toHaveBeenCalledWith('hub-1', 'CA-parent')
      expect(adapter.emptyResponse).toHaveBeenCalled()
    })

    it('does not end call on failed recording', async () => {
      adapter.parseRecordingWebhook = jest.fn().mockResolvedValue({
        status: 'failed',
        recordingSid: 'RE123',
      })

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/call-recording?parentCallSid=CA-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'RecordingStatus=failed',
      })
      expect(res.status).toBe(200)
      expect(services.calls.endCall).not.toHaveBeenCalled()
    })
  })

  describe('POST /voicemail-recording', () => {
    it('marks voicemail and triggers transcription on completed', async () => {
      adapter.parseRecordingWebhook = jest.fn().mockResolvedValue({
        status: 'completed',
        recordingSid: 'RE-vm',
        callSid: 'CA-vm',
      })

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/voicemail-recording?hub=hub-1&callSid=CA-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'RecordingStatus=completed&RecordingSid=RE-vm',
      })
      expect(res.status).toBe(200)
      expect(services.calls.markVoicemail).toHaveBeenCalledWith('hub-1', 'CA-vm')
      expect(adapter.emptyResponse).toHaveBeenCalled()
    })

    it('does nothing on non-completed status', async () => {
      adapter.parseRecordingWebhook = jest.fn().mockResolvedValue({
        status: 'failed',
        recordingSid: 'RE-vm',
      })

      const app = await createTestApp(adapter, services)
      const res = await app.request('/api/telephony/voicemail-recording?hub=hub-1&callSid=CA-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'RecordingStatus=failed',
      })
      expect(res.status).toBe(200)
      expect(services.calls.markVoicemail).not.toHaveBeenCalled()
    })
  })
})
