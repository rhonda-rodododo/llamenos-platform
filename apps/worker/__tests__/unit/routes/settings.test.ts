import { describe, it, expect, beforeEach, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import settingsRoute from '@worker/routes/settings'

function createTestApp(opts: {
  permissions?: string[]
  pubkey?: string
  services?: Record<string, unknown>
} = {}) {
  const {
    permissions = ['*'],
    pubkey = 'test-pubkey-' + '0'.repeat(50),
    services = {},
  } = opts

  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) }

  const defaultServices = {
    settings: {
      getTranscriptionSettings: jest.fn().mockResolvedValue({ enabled: true, model: 'whisper' }),
      updateTranscriptionSettings: jest.fn().mockResolvedValue({ enabled: true, model: 'whisper' }),
      getCustomFields: jest.fn().mockResolvedValue([{ id: 'cf-1', name: 'Field 1' }]),
      updateCustomFields: jest.fn().mockResolvedValue([{ id: 'cf-1', name: 'Field 1' }]),
      getSpamSettings: jest.fn().mockResolvedValue({ voiceCaptchaEnabled: false }),
      updateSpamSettings: jest.fn().mockResolvedValue({ voiceCaptchaEnabled: false }),
      getCallSettings: jest.fn().mockResolvedValue({ queueTimeoutSeconds: 90 }),
      updateCallSettings: jest.fn().mockResolvedValue({ queueTimeoutSeconds: 90 }),
      getIvrLanguages: jest.fn().mockResolvedValue({ languages: ['en'] }),
      updateIvrLanguages: jest.fn().mockResolvedValue({ languages: ['en'] }),
      getTelephonyProvider: jest.fn().mockResolvedValue({ type: 'twilio', phoneNumber: '+1555000000' }),
      updateTelephonyProvider: jest.fn().mockResolvedValue({ type: 'twilio', phoneNumber: '+1555000000' }),
      getMessagingConfig: jest.fn().mockResolvedValue({ channels: ['sms'] }),
      updateMessagingConfig: jest.fn().mockResolvedValue({ channels: ['sms'] }),
      getSetupState: jest.fn().mockResolvedValue({ setupCompleted: true }),
      updateSetupState: jest.fn().mockResolvedValue({ setupCompleted: true }),
      getIvrAudioList: jest.fn().mockResolvedValue({ prompts: [] }),
      uploadIvrAudio: jest.fn().mockResolvedValue({ ok: true }),
      deleteIvrAudio: jest.fn().mockResolvedValue({ ok: true }),
      getReportTypes: jest.fn().mockResolvedValue([{ id: 'rt-1', name: 'Type 1' }]),
      createReportType: jest.fn().mockResolvedValue({ id: 'rt-1', name: 'Type 1' }),
      updateReportType: jest.fn().mockResolvedValue({ id: 'rt-1', name: 'Updated' }),
      archiveReportType: jest.fn().mockResolvedValue({ ok: true }),
      getRoles: jest.fn().mockResolvedValue([{ id: 'role-1', name: 'Admin' }]),
      createRole: jest.fn().mockResolvedValue({ id: 'role-1', name: 'Admin' }),
      updateRole: jest.fn().mockResolvedValue({ id: 'role-1', name: 'Admin' }),
      deleteRole: jest.fn().mockResolvedValue({ ok: true }),
      getTTLOverrides: jest.fn().mockResolvedValue({}),
      updateTTLOverrides: jest.fn().mockResolvedValue({}),
      getCleanupMetrics: jest.fn().mockResolvedValue({}),
      getGeocodingConfig: jest.fn().mockResolvedValue({ provider: 'google', countries: ['US'], enabled: true }),
      updateGeocodingConfig: jest.fn().mockResolvedValue({ provider: 'google', countries: ['US'], enabled: true }),
      getGeocodingConfigAdmin: jest.fn().mockResolvedValue({ provider: 'google', apiKey: 'secret', countries: ['US'], enabled: true }),
    },
    identity: {
      getWebAuthnSettings: jest.fn().mockResolvedValue({ enabled: true }),
      updateWebAuthnSettings: jest.fn().mockResolvedValue({ enabled: true }),
    },
    audit: mockAuditService,
  }

  const mergedServices: Record<string, unknown> = { ...defaultServices, ...services }
  for (const key of Object.keys(services)) {
    const svcVal = (services as Record<string, unknown>)[key]
    const defVal = (defaultServices as Record<string, unknown>)[key]
    if (typeof svcVal === 'object' && svcVal !== null && typeof defVal === 'object' && defVal !== null) {
      mergedServices[key] = { ...(defVal as Record<string, unknown>), ...(svcVal as Record<string, unknown>) }
    }
  }

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', mergedServices as unknown as AppEnv['Variables']['services'])
    c.set('allRoles', [])
    c.set('requestId', 'test-req-1')
    Object.defineProperty(c, 'executionCtx', {
      value: { waitUntil: jest.fn() },
      writable: true,
      configurable: true,
    })
    await next()
  })

  app.route('/', settingsRoute)
  return app
}

describe('settings route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('transcription', () => {
    it('GET /transcription returns settings for any authenticated user', async () => {
      const app = createTestApp()
      const res = await app.request('/transcription')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.enabled).toBe(true)
    })

    it('PATCH /transcription requires manage-transcription permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/transcription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      expect(res.status).toBe(403)
    })

    it('PATCH /transcription updates settings with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ enabled: false })
      const app = createTestApp({
        permissions: ['settings:manage-transcription'],
        services: { settings: { updateTranscriptionSettings: updateSpy } },
      })
      const res = await app.request('/transcription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    })
  })

  describe('custom-fields', () => {
    it('GET /custom-fields returns fields filtered by role', async () => {
      const getSpy = jest.fn().mockResolvedValue([{ id: 'cf-1' }])
      const app = createTestApp({
        permissions: ['settings:manage-fields'],
        services: { settings: { getCustomFields: getSpy } },
      })
      const res = await app.request('/custom-fields')
      expect(res.status).toBe(200)
      expect(getSpy).toHaveBeenCalledWith('admin')
    })

    it('GET /custom-fields passes volunteer filter without manage-fields', async () => {
      const getSpy = jest.fn().mockResolvedValue([{ id: 'cf-1' }])
      const app = createTestApp({
        permissions: ['settings:read'],
        services: { settings: { getCustomFields: getSpy } },
      })
      await app.request('/custom-fields')
      expect(getSpy).toHaveBeenCalledWith('volunteer')
    })

    it('PUT /custom-fields requires manage-fields permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/custom-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: 'cf-1', name: 'Test' }]),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('spam settings', () => {
    it('GET /spam requires manage-spam permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/spam')
      expect(res.status).toBe(403)
    })

    it('PATCH /spam updates settings with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ voiceCaptchaEnabled: true })
      const app = createTestApp({
        permissions: ['settings:manage-spam'],
        services: { settings: { updateSpamSettings: updateSpy } },
      })
      const res = await app.request('/spam', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceCaptchaEnabled: true }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ voiceCaptchaEnabled: true }))
    })
  })

  describe('call settings', () => {
    it('GET /call requires manage-calls permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/call')
      expect(res.status).toBe(403)
    })

    it('PATCH /call updates settings with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ queueTimeoutSeconds: 120 })
      const app = createTestApp({
        permissions: ['settings:manage-calls'],
        services: { settings: { updateCallSettings: updateSpy } },
      })
      const res = await app.request('/call', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueTimeoutSeconds: 120 }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ queueTimeoutSeconds: 120 }))
    })
  })

  describe('ivr-languages', () => {
    it('GET /ivr-languages requires manage-ivr permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/ivr-languages')
      expect(res.status).toBe(403)
    })

    it('PATCH /ivr-languages updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ languages: ['en', 'es'] })
      const app = createTestApp({
        permissions: ['settings:manage-ivr'],
        services: { settings: { updateIvrLanguages: updateSpy } },
      })
      const res = await app.request('/ivr-languages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languages: ['en', 'es'] }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('webauthn', () => {
    it('GET /webauthn requires manage-webauthn permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/webauthn')
      expect(res.status).toBe(403)
    })

    it('PATCH /webauthn updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ enabled: false })
      const app = createTestApp({
        permissions: ['settings:manage-webauthn'],
        services: { identity: { updateWebAuthnSettings: updateSpy } },
      })
      const res = await app.request('/webauthn', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    })
  })

  describe('telephony-provider', () => {
    it('GET /telephony-provider requires manage-telephony permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/telephony-provider')
      expect(res.status).toBe(403)
    })

    it('PATCH /telephony-provider updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ type: 'twilio' })
      const app = createTestApp({
        permissions: ['settings:manage-telephony'],
        services: { settings: { updateTelephonyProvider: updateSpy } },
      })
      const res = await app.request('/telephony-provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'twilio', accountSid: 'AC' + 'a'.repeat(32), authToken: 'token' }),
      })
      expect(res.status).toBe(200)
    })

    it('POST /telephony-provider/test requires manage-telephony permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/telephony-provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'twilio', accountSid: 'AC123', authToken: 'token' }),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('messaging', () => {
    it('GET /messaging requires manage-messaging permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/messaging')
      expect(res.status).toBe(403)
    })

    it('PATCH /messaging updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ channels: ['sms', 'whatsapp'] })
      const app = createTestApp({
        permissions: ['settings:manage-messaging'],
        services: { settings: { updateMessagingConfig: updateSpy } },
      })
      const res = await app.request('/messaging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: ['sms', 'whatsapp'] }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ channels: ['sms', 'whatsapp'] }))
    })
  })

  describe('setup', () => {
    it('GET /setup requires manage-setup permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/setup')
      expect(res.status).toBe(403)
    })

    it('PATCH /setup updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ setupCompleted: true })
      const app = createTestApp({
        permissions: ['settings:manage-setup'],
        services: { settings: { updateSetupState: updateSpy } },
      })
      const res = await app.request('/setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupCompleted: true }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('ivr-audio', () => {
    it('GET /ivr-audio requires manage-ivr permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/ivr-audio')
      expect(res.status).toBe(403)
    })

    it('PUT /ivr-audio/:promptType/:language uploads audio with permission', async () => {
      const uploadSpy = jest.fn().mockResolvedValue({ ok: true })
      const app = createTestApp({
        permissions: ['settings:manage-ivr'],
        services: { settings: { uploadIvrAudio: uploadSpy } },
      })
      const audioData = new Uint8Array([0x00, 0x01, 0x02, 0x03])
      const res = await app.request('/ivr-audio/greeting/en', {
        method: 'PUT',
        body: audioData,
      })
      expect(res.status).toBe(200)
      expect(uploadSpy).toHaveBeenCalledWith('greeting', 'en', expect.any(String), 4)
    })

    it('DELETE /ivr-audio/:promptType/:language removes audio with permission', async () => {
      const deleteSpy = jest.fn().mockResolvedValue({ ok: true })
      const app = createTestApp({
        permissions: ['settings:manage-ivr'],
        services: { settings: { deleteIvrAudio: deleteSpy } },
      })
      const res = await app.request('/ivr-audio/greeting/en', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deleteSpy).toHaveBeenCalledWith('greeting', 'en')
    })
  })

  describe('report-types', () => {
    it('GET /report-types requires settings:read', async () => {
      const app = createTestApp({ permissions: [] })
      const res = await app.request('/report-types')
      expect(res.status).toBe(403)
    })

    it('POST /report-types requires manage-fields permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/report-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Type' }),
      })
      expect(res.status).toBe(403)
    })

    it('POST /report-types creates with permission', async () => {
      const createSpy = jest.fn().mockResolvedValue({ id: 'rt-new', name: 'New Type' })
      const app = createTestApp({
        permissions: ['settings:manage-fields'],
        services: { settings: { createReportType: createSpy } },
      })
      const res = await app.request('/report-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Type' }),
      })
      expect(res.status).toBe(201)
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Type' }))
    })

    it('PATCH /report-types/:id updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ id: 'rt-1', name: 'Updated' })
      const app = createTestApp({
        permissions: ['settings:manage-fields'],
        services: { settings: { updateReportType: updateSpy } },
      })
      const res = await app.request('/report-types/rt-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith('rt-1', expect.any(Object))
    })

    it('DELETE /report-types/:id archives with permission', async () => {
      const archiveSpy = jest.fn().mockResolvedValue({ ok: true })
      const app = createTestApp({
        permissions: ['settings:manage-fields'],
        services: { settings: { archiveReportType: archiveSpy } },
      })
      const res = await app.request('/report-types/rt-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(archiveSpy).toHaveBeenCalledWith('rt-1')
    })
  })

  describe('roles', () => {
    it('GET /roles requires system:view-roles', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/roles')
      expect(res.status).toBe(403)
    })

    it('POST /roles requires system:manage-roles', async () => {
      const app = createTestApp({ permissions: ['system:view-roles'] })
      const res = await app.request('/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Role' }),
      })
      expect(res.status).toBe(403)
    })

    it('POST /roles creates with permission', async () => {
      const createSpy = jest.fn().mockResolvedValue({ id: 'role-new', name: 'New Role' })
      const app = createTestApp({
        permissions: ['system:manage-roles'],
        services: { settings: { createRole: createSpy } },
      })
      const res = await app.request('/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Role', slug: 'new-role', permissions: ['settings:read'], description: 'A new role' }),
      })
      expect(res.status).toBe(201)
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Role' }))
    })

    it('PATCH /roles/:id updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ id: 'role-1', name: 'Updated' })
      const app = createTestApp({
        permissions: ['system:manage-roles'],
        services: { settings: { updateRole: updateSpy } },
      })
      const res = await app.request('/roles/role-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith('role-1', expect.any(Object))
    })

    it('DELETE /roles/:id removes with permission', async () => {
      const deleteSpy = jest.fn().mockResolvedValue({ ok: true })
      const app = createTestApp({
        permissions: ['system:manage-roles'],
        services: { settings: { deleteRole: deleteSpy } },
      })
      const res = await app.request('/roles/role-1', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(deleteSpy).toHaveBeenCalledWith('role-1')
    })
  })

  describe('permissions catalog', () => {
    it('GET /permissions requires system:manage-roles', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/permissions')
      expect(res.status).toBe(403)
    })

    it('GET /permissions returns catalog with permission', async () => {
      const app = createTestApp({ permissions: ['system:manage-roles'] })
      const res = await app.request('/permissions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.permissions).toBeDefined()
      expect(body.byDomain).toBeDefined()
    })
  })

  describe('migrations', () => {
    it('GET /migrations requires system:manage-roles', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/migrations')
      expect(res.status).toBe(403)
    })

    it('GET /migrations returns service-based note', async () => {
      const app = createTestApp({ permissions: ['system:manage-roles'] })
      const res = await app.request('/migrations')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.namespaces).toEqual([])
      expect(body.note).toContain('Service-based deployment')
    })
  })

  describe('ttl overrides', () => {
    it('GET /ttl requires manage-ttl permission', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/ttl')
      expect(res.status).toBe(403)
    })

    it('PATCH /ttl updates with permission', async () => {
      const updateSpy = jest.fn().mockResolvedValue({ conversationTTL: 86400 })
      const app = createTestApp({
        permissions: ['settings:manage-ttl'],
        services: { settings: { updateTTLOverrides: updateSpy } },
      })
      const res = await app.request('/ttl', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationTTL: 86400 }),
      })
      expect(res.status).toBe(200)
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ conversationTTL: 86400 }))
    })
  })

  describe('cleanup-metrics', () => {
    it('GET /cleanup-metrics requires settings:manage', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/cleanup-metrics')
      expect(res.status).toBe(403)
    })

    it('GET /cleanup-metrics returns aggregated metrics', async () => {
      const app = createTestApp({
        permissions: ['settings:manage'],
        services: { settings: { getCleanupMetrics: jest.fn().mockResolvedValue({ deleted: 5 }) } },
      })
      const res = await app.request('/cleanup-metrics')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.settings).toEqual({ deleted: 5 })
    })
  })

  describe('geocoding', () => {
    it('GET /geocoding returns config for any authenticated user', async () => {
      const app = createTestApp()
      const res = await app.request('/geocoding')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.provider).toBe('google')
    })

    it('PUT /geocoding requires settings:manage', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/geocoding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', countries: ['US'], enabled: true }),
      })
      expect(res.status).toBe(403)
    })

    it('GET /geocoding/test requires settings:manage', async () => {
      const app = createTestApp({ permissions: ['settings:read'] })
      const res = await app.request('/geocoding/test')
      expect(res.status).toBe(403)
    })
  })
})
