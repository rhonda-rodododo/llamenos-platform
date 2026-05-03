import { describe, it, expect, jest } from 'bun:test'
import { Hono } from 'hono'
import calls from '@worker/routes/calls'
import type { AppEnv } from '@worker/types'

function createTestApp(opts: {
  permissions?: string[]
  hubId?: string
  pubkey?: string
  services?: Record<string, unknown>
  env?: AppEnv['Bindings']
} = {}) {
  const {
    permissions = ['*'],
    hubId = 'hub-1',
    pubkey = 'a'.repeat(64),
    services = {},
    env = {} as AppEnv['Bindings'],
  } = opts

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', services as unknown as AppEnv['Variables']['services'])
    c.set('allRoles', [])
    c.set('requestId', 'test-req-1')
    c.set('user', {
      pubkey,
      name: 'Test User',
      phone: '+1555000000',
      roles: ['role-volunteer'],
      active: true,
      createdAt: new Date().toISOString(),
      encryptedSecretKey: '',
      transcriptionEnabled: false,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: true,
      onBreak: false,
      callPreference: 'phone',
    })
    c.set('hubId', hubId)
    c.env = env
    await next()
  })

  app.route('/', calls)

  return { app, services }
}

function makeMockCallsService() {
  return {
    getActiveCalls: jest.fn().mockResolvedValue([]),
    getTodayCount: jest.fn().mockResolvedValue(5),
    getPresence: jest.fn().mockResolvedValue({ activeCalls: 0, availableVolunteers: 2, users: [] }),
    listCallHistory: jest.fn().mockResolvedValue({ calls: [], total: 0, hasMore: false }),
    getActiveCallById: jest.fn().mockResolvedValue(null),
    getActiveCallByCallId: jest.fn().mockResolvedValue(null),
    getCallRecord: jest.fn().mockResolvedValue(null),
    answerCall: jest.fn().mockResolvedValue({ callId: 'call-1', status: 'in-progress' }),
    endCall: jest.fn().mockResolvedValue({ callId: 'call-1', status: 'completed' }),
    reportSpam: jest.fn().mockResolvedValue({ ok: true }),
    debug: jest.fn().mockResolvedValue({ activeCount: 0, activeCalls: [] }),
  }
}

function makeMockContactsService() {
  return {
    lookupByIdentifierHash: jest.fn().mockResolvedValue(null),
    updateLastInteraction: jest.fn().mockResolvedValue(undefined),
  }
}

function makeMockCasesService() {
  return {
    listByContact: jest.fn().mockResolvedValue({ total: 0, records: [] }),
  }
}

function makeMockRecordsService() {
  return {
    addBan: jest.fn().mockResolvedValue(undefined),
  }
}

function makeMockAuditService() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  }
}

function makeMockSettingsService() {
  return {
    getTelephonyProvider: jest.fn().mockResolvedValue(null),
  }
}

function makeServices(overrides: Record<string, unknown> = {}) {
  return {
    calls: makeMockCallsService(),
    contacts: makeMockContactsService(),
    cases: makeMockCasesService(),
    records: makeMockRecordsService(),
    audit: makeMockAuditService(),
    settings: makeMockSettingsService(),
    ...overrides,
  }
}

describe('Calls Routes', () => {
  describe('GET /active', () => {
    it('returns active calls with full info when user has calls:read-active-full', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCalls.mockResolvedValue([
        { callId: 'call-1', callerNumber: '+15551234567', status: 'ringing' },
      ])

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-active', 'calls:read-active-full'],
        services,
      })

      const res = await app.request('/active')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.calls).toHaveLength(1)
      expect(body.calls[0].callerNumber).toBe('+15551234567')
      expect(callsSvc.getActiveCalls).toHaveBeenCalledWith('hub-1')
    })

    it('redacts callerNumber when user lacks calls:read-active-full', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCalls.mockResolvedValue([
        { callId: 'call-1', callerNumber: '+15551234567', status: 'ringing' },
      ])

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-active'],
        services,
      })

      const res = await app.request('/active')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.calls[0].callerNumber).toBe('[redacted]')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: ['other:perm'] })
      const res = await app.request('/active')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /today-count', () => {
    it('returns today\'s call count', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getTodayCount.mockResolvedValue(12)

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-active'],
        services,
      })

      const res = await app.request('/today-count')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.count).toBe(12)
      expect(callsSvc.getTodayCount).toHaveBeenCalledWith('hub-1')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/today-count')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /presence', () => {
    it('returns presence status', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getPresence.mockResolvedValue({
        activeCalls: 1,
        availableVolunteers: 2,
        users: [{ pubkey: 'pk1', status: 'available' }],
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-presence'],
        services,
      })

      const res = await app.request('/presence')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.activeCalls).toBe(1)
      expect(body.availableVolunteers).toBe(2)
      expect(callsSvc.getPresence).toHaveBeenCalledWith('hub-1')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: ['calls:read-active'] })
      const res = await app.request('/presence')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /history', () => {
    it('returns paginated call history', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.listCallHistory.mockResolvedValue({
        calls: [{ callId: 'c1' }],
        total: 1,
        hasMore: false,
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-history'],
        services,
      })

      const res = await app.request('/history?page=1&limit=10')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.calls).toHaveLength(1)
      expect(callsSvc.listCallHistory).toHaveBeenCalledWith('hub-1', {
        search: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 1,
        limit: 10,
      })
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/history')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /identify/:identifierHash', () => {
    it('returns contact and cases when found', async () => {
      const contactsSvc = makeMockContactsService()
      contactsSvc.lookupByIdentifierHash.mockResolvedValue({
        id: 'contact-1',
        interactionCount: 3,
      })

      const casesSvc = makeMockCasesService()
      casesSvc.listByContact.mockResolvedValue({
        total: 2,
        records: [
          { id: 'case-1', caseNumber: 'C001', statusHash: 'hash-open' },
          { id: 'case-2', caseNumber: 'C002', statusHash: 'hash-closed' },
        ],
      })

      const services = makeServices({ contacts: contactsSvc, cases: casesSvc })
      const { app } = createTestApp({
        permissions: ['calls:identify-caller'],
        services,
      })

      const res = await app.request('/identify/abc123')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.contact.id).toBe('contact-1')
      expect(body.activeCaseCount).toBe(2)
      expect(body.recentCases).toHaveLength(2)
      expect(contactsSvc.lookupByIdentifierHash).toHaveBeenCalledWith('hub-1', 'abc123')
    })

    it('returns empty result when contact not found', async () => {
      const contactsSvc = makeMockContactsService()
      contactsSvc.lookupByIdentifierHash.mockResolvedValue(null)

      const services = makeServices({ contacts: contactsSvc })
      const { app } = createTestApp({
        permissions: ['calls:identify-caller'],
        services,
      })

      const res = await app.request('/identify/unknown')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.contact).toBeNull()
      expect(body.activeCaseCount).toBe(0)
      expect(body.recentCases).toEqual([])
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/identify/abc123')
      expect(res.status).toBe(403)
    })
  })

  describe('POST /:callId/answer', () => {
    it('answers a call and returns the call object', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.answerCall.mockResolvedValue({ callId: 'call-1', status: 'in-progress' })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:answer'],
        services,
      })

      const res = await app.request('/call-1/answer', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.call.status).toBe('in-progress')
      expect(callsSvc.answerCall).toHaveBeenCalledWith('hub-1', 'call-1', 'a'.repeat(64))
    })

    it('returns 409 when call already answered', async () => {
      const callsSvc = makeMockCallsService()
      const err = new Error('Call already answered') as Error & { status: number }
      err.status = 409
      callsSvc.answerCall.mockRejectedValue(err)

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:answer'],
        services,
      })

      const res = await app.request('/call-1/answer', { method: 'POST' })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('Call already answered')
    })

    it('returns 500 on generic answer failure', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.answerCall.mockRejectedValue(new Error('DB failure'))

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:answer'],
        services,
      })

      const res = await app.request('/call-1/answer', { method: 'POST' })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe('Failed to answer call')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/call-1/answer', { method: 'POST' })
      expect(res.status).toBe(403)
    })
  })

  describe('POST /:callId/hangup', () => {
    it('hangs up a call when user is the one who answered', async () => {
      const callsSvc = makeMockCallsService()
      const pubkey = 'a'.repeat(64)
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        answeredBy: pubkey,
        status: 'in-progress',
      })
      callsSvc.endCall.mockResolvedValue({ callId: 'call-1', status: 'completed' })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:hangup'],
        pubkey,
        services,
      })

      const res = await app.request('/call-1/hangup', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.call.status).toBe('completed')
      expect(callsSvc.getActiveCallById).toHaveBeenCalledWith('hub-1', 'call-1')
      expect(callsSvc.endCall).toHaveBeenCalledWith('hub-1', 'call-1')
    })

    it('returns 404 when call not found', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue(null)

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:hangup'],
        services,
      })

      const res = await app.request('/call-1/hangup', { method: 'POST' })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Call not found')
    })

    it('returns 403 when user did not answer the call', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        answeredBy: 'b'.repeat(64),
        status: 'in-progress',
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:hangup'],
        pubkey: 'a'.repeat(64),
        services,
      })

      const res = await app.request('/call-1/hangup', { method: 'POST' })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe('Not your call')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/call-1/hangup', { method: 'POST' })
      expect(res.status).toBe(403)
    })
  })

  describe('POST /:callId/spam', () => {
    it('reports spam when user answered the call', async () => {
      const callsSvc = makeMockCallsService()
      const pubkey = 'a'.repeat(64)
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        answeredBy: pubkey,
        status: 'in-progress',
      })
      callsSvc.reportSpam.mockResolvedValue({ ok: true })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:report-spam'],
        pubkey,
        services,
      })

      const res = await app.request('/call-1/spam', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(callsSvc.reportSpam).toHaveBeenCalledWith('hub-1', 'call-1', pubkey)
    })

    it('returns 404 when call not found', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue(null)

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:report-spam'],
        services,
      })

      const res = await app.request('/call-1/spam', { method: 'POST' })
      expect(res.status).toBe(404)
    })

    it('returns 403 when user did not answer the call', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        answeredBy: 'b'.repeat(64),
        status: 'in-progress',
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:report-spam'],
        pubkey: 'a'.repeat(64),
        services,
      })

      const res = await app.request('/call-1/spam', { method: 'POST' })
      expect(res.status).toBe(403)
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/call-1/spam', { method: 'POST' })
      expect(res.status).toBe(403)
    })
  })

  describe('POST /:callId/ban', () => {
    it('bans caller and hangs up when user answered the call', async () => {
      const callsSvc = makeMockCallsService()
      const recordsSvc = makeMockRecordsService()
      const auditSvc = makeMockAuditService()
      const pubkey = 'a'.repeat(64)

      callsSvc.getActiveCallByCallId.mockResolvedValue({
        callId: 'call-1',
        answeredBy: pubkey,
        callerNumber: '+15551234567',
        hubId: 'hub-1',
      })
      callsSvc.endCall.mockResolvedValue({ callId: 'call-1', status: 'completed' })

      const services = makeServices({
        calls: callsSvc,
        records: recordsSvc,
        audit: auditSvc,
      })
      const { app } = createTestApp({
        permissions: ['bans:report'],
        pubkey,
        services,
      })

      const res = await app.request('/call-1/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Harassment' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.banned).toBe(true)
      expect(body.hungUp).toBe(true)
      expect(recordsSvc.addBan).toHaveBeenCalledWith({
        phone: '+15551234567',
        reason: 'Harassment',
        bannedBy: pubkey,
        hubId: 'hub-1',
      })
      expect(callsSvc.endCall).toHaveBeenCalledWith('hub-1', 'call-1')
    })

    it('uses default reason when body reason is empty', async () => {
      const callsSvc = makeMockCallsService()
      const recordsSvc = makeMockRecordsService()
      const pubkey = 'a'.repeat(64)

      callsSvc.getActiveCallByCallId.mockResolvedValue({
        callId: 'call-1',
        answeredBy: pubkey,
        callerNumber: '+15551234567',
        hubId: 'hub-1',
      })

      const services = makeServices({ calls: callsSvc, records: recordsSvc })
      const { app } = createTestApp({
        permissions: ['bans:report'],
        pubkey,
        services,
      })

      const res = await app.request('/call-1/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      expect(recordsSvc.addBan).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Banned during active call' }),
      )
    })

    it('returns 404 when call not found', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallByCallId.mockResolvedValue(null)

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['bans:report'],
        services,
      })

      const res = await app.request('/call-1/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Call not found')
    })

    it('returns 403 when user did not answer the call', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallByCallId.mockResolvedValue({
        callId: 'call-1',
        answeredBy: 'b'.repeat(64),
        callerNumber: '+15551234567',
        hubId: 'hub-1',
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['bans:report'],
        pubkey: 'a'.repeat(64),
        services,
      })

      const res = await app.request('/call-1/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe('Not your call')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/call-1/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('GET /:callId/recording', () => {
    it('returns 404 when no recording is available', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        recordingSid: null,
        hasRecording: false,
        answeredBy: 'a'.repeat(64),
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:read-recording'],
        pubkey: 'a'.repeat(64),
        services,
      })

      const res = await app.request('/call-1/recording')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('No recording available for this call')
    })

    it('returns 403 when user is neither admin nor answering volunteer', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        recordingSid: 'REC123',
        hasRecording: true,
        answeredBy: 'b'.repeat(64),
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: [],
        pubkey: 'a'.repeat(64),
        services,
      })

      const res = await app.request('/call-1/recording')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe('Forbidden')
    })

    it('allows answering volunteer without admin permission', async () => {
      const callsSvc = makeMockCallsService()
      const pubkey = 'a'.repeat(64)
      callsSvc.getActiveCallById.mockResolvedValue({
        callId: 'call-1',
        recordingSid: 'REC123',
        hasRecording: true,
        answeredBy: pubkey,
      })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: [],
        pubkey,
        services,
      })

      const res = await app.request('/call-1/recording')
      expect(res.status).not.toBe(403)
    })
  })

  describe('GET /debug', () => {
    it('returns debug info', async () => {
      const callsSvc = makeMockCallsService()
      callsSvc.debug.mockResolvedValue({ activeCount: 3, activeCalls: [] })

      const services = makeServices({ calls: callsSvc })
      const { app } = createTestApp({
        permissions: ['calls:debug'],
        services,
      })

      const res = await app.request('/debug')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.activeCount).toBe(3)
      expect(callsSvc.debug).toHaveBeenCalledWith('hub-1')
    })

    it('returns 403 when permission is missing', async () => {
      const { app } = createTestApp({ permissions: [] })
      const res = await app.request('/debug')
      expect(res.status).toBe(403)
    })
  })
})
