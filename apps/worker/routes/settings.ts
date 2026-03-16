import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import {
  spamSettingsSchema,
  callSettingsSchema,
  messagingConfigSchema,
  telephonyProviderSchema,
  createRoleSchema,
  updateRoleSchema,
  webauthnSettingsSchema,
  transcriptionSettingsSchema,
  ivrLanguagesSchema,
  setupStateSchema,
  customFieldsBodySchema,
  createReportTypeBodySchema,
  updateReportTypeBodySchema,
  ttlOverridesBodySchema,
} from '@protocol/schemas/settings'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { validateExternalUrl } from '../lib/ssrf-guard'

const settings = new Hono<AppEnv>()

// --- Transcription settings: readable by all authenticated, writable by settings:manage ---
settings.get('/transcription',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get transcription settings',
    responses: {
      200: { description: 'Transcription settings' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/transcription'))
  },
)

settings.patch('/transcription',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update transcription settings',
    responses: {
      200: { description: 'Transcription settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-transcription'),
  validator('json', transcriptionSettingsSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/transcription', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'transcriptionToggled', pubkey, body as Record<string, unknown>)
    return res
  },
)

// --- Custom fields: readable by all authenticated (filtered by permissions), writable by admin ---
settings.get('/custom-fields',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get custom field definitions',
    responses: {
      200: { description: 'Custom field definitions' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const permissions = c.get('permissions')
    const canManageFields = checkPermission(permissions, 'settings:manage-fields')
    return dos.settings.fetch(new Request(`http://do/settings/custom-fields?role=${canManageFields ? 'admin' : 'volunteer'}`))
  },
)

settings.put('/custom-fields',
  describeRoute({
    tags: ['Settings'],
    summary: 'Replace custom field definitions',
    responses: {
      200: { description: 'Custom fields updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', customFieldsBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/custom-fields', {
      method: 'PUT',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'customFieldsUpdated', pubkey, {})
    return res
  },
)

// --- All remaining settings: require specific permissions ---
settings.get('/spam',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get spam mitigation settings',
    responses: {
      200: { description: 'Spam settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-spam'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/spam'))
  },
)

settings.patch('/spam',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update spam mitigation settings',
    responses: {
      200: { description: 'Spam settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-spam'),
  validator('json', spamSettingsSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/spam', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'spamMitigationToggled', pubkey, body as Record<string, unknown>)
    return res
  },
)

settings.get('/call',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get call settings',
    responses: {
      200: { description: 'Call settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/call'))
  },
)

settings.patch('/call',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update call settings',
    responses: {
      200: { description: 'Call settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', callSettingsSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/call', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'callSettingsUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

settings.get('/ivr-languages',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get IVR language settings',
    responses: {
      200: { description: 'IVR language settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/ivr-languages'))
  },
)

settings.patch('/ivr-languages',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update IVR language settings',
    responses: {
      200: { description: 'IVR language settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  validator('json', ivrLanguagesSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/ivr-languages', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'ivrLanguagesUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

settings.get('/webauthn',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get WebAuthn settings',
    responses: {
      200: { description: 'WebAuthn settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.identity.fetch(new Request('http://do/settings/webauthn'))
  },
)

settings.patch('/webauthn',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update WebAuthn settings',
    responses: {
      200: { description: 'WebAuthn settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', webauthnSettingsSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.identity.fetch(new Request('http://do/settings/webauthn', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'webauthnSettingsUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

// --- Telephony Provider settings ---
settings.get('/telephony-provider',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get telephony provider settings',
    responses: {
      200: { description: 'Telephony provider settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-telephony'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
  },
)

settings.patch('/telephony-provider',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update telephony provider settings',
    responses: {
      200: { description: 'Telephony provider settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-telephony'),
  validator('json', telephonyProviderSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'telephonyProviderChanged', pubkey, { type: body.type })
    return res
  },
)

settings.post('/telephony-provider/test',
  describeRoute({
    tags: ['Settings'],
    summary: 'Test telephony provider credentials',
    responses: {
      200: {
        description: 'Provider test result',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-telephony'),
  validator('json', telephonyProviderSchema),
  async (c) => {
    const body = c.req.valid('json')
    try {
      let testUrl: string
      let testHeaders: Record<string, string> = {}

      switch (body.type) {
        case 'twilio':
          testUrl = `https://api.twilio.com/2010-04-01/Accounts/${body.accountSid}.json`
          testHeaders['Authorization'] = 'Basic ' + btoa(`${body.accountSid}:${body.authToken}`)
          break
        case 'signalwire': {
          if (!body.signalwireSpace || !/^[a-zA-Z0-9_-]+$/.test(body.signalwireSpace)) {
            return Response.json({ ok: false, error: 'Invalid SignalWire space name' }, { status: 400 })
          }
          testUrl = `https://${body.signalwireSpace}.signalwire.com/api/relay/rest/phone_numbers`
          testHeaders['Authorization'] = 'Basic ' + btoa(`${body.accountSid}:${body.authToken}`)
          break
        }
        case 'vonage':
          testUrl = `https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(body.apiKey || '')}&api_secret=${encodeURIComponent(body.apiSecret || '')}`
          break
        case 'plivo':
          testUrl = `https://api.plivo.com/v1/Account/${encodeURIComponent(body.authId || '')}/`
          testHeaders['Authorization'] = 'Basic ' + btoa(`${body.authId}:${body.authToken}`)
          break
        case 'asterisk': {
          if (!body.ariUrl) {
            return Response.json({ ok: false, error: 'ARI URL is required' }, { status: 400 })
          }
          const ariError = validateExternalUrl(body.ariUrl, 'ARI URL')
          if (ariError) {
            return Response.json({ ok: false, error: ariError }, { status: 400 })
          }
          testUrl = `${body.ariUrl}/api/asterisk/info`
          testHeaders['Authorization'] = 'Basic ' + btoa(`${body.ariUsername}:${body.ariPassword}`)
          break
        }
        default:
          return Response.json({ ok: false, error: 'Unknown provider type' }, { status: 400 })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const testRes = await fetch(testUrl, { headers: testHeaders, signal: controller.signal })
        clearTimeout(timeout)
        if (testRes.ok) {
          return Response.json({ ok: true })
        }
        return Response.json({ ok: false, error: `Provider returned ${testRes.status}` }, { status: 400 })
      } finally {
        clearTimeout(timeout)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      return Response.json({ ok: false, error: message }, { status: 400 })
    }
  },
)

// --- Messaging config ---
settings.get('/messaging',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get messaging configuration',
    responses: {
      200: { description: 'Messaging configuration' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-messaging'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/messaging'))
  },
)

settings.patch('/messaging',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update messaging configuration',
    responses: {
      200: { description: 'Messaging configuration updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-messaging'),
  validator('json', messagingConfigSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/messaging', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'messagingConfigUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

// --- Setup state ---
settings.get('/setup',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get setup wizard state',
    responses: {
      200: { description: 'Setup state' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/setup'))
  },
)

settings.patch('/setup',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update setup wizard state',
    responses: {
      200: { description: 'Setup state updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', setupStateSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/setup', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'setupStateUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

settings.get('/ivr-audio',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get IVR audio prompts',
    responses: {
      200: { description: 'IVR audio prompt metadata' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/ivr-audio'))
  },
)

settings.put('/ivr-audio/:promptType/:language',
  describeRoute({
    tags: ['Settings'],
    summary: 'Upload IVR audio prompt',
    responses: {
      200: { description: 'Audio prompt uploaded' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const promptType = c.req.param('promptType')
    const language = c.req.param('language')
    const body = await c.req.arrayBuffer()
    const res = await dos.settings.fetch(new Request(`http://do/settings/ivr-audio/${promptType}/${language}`, {
      method: 'PUT',
      body,
    }))
    if (res.ok) await audit(dos.records, 'ivrAudioUploaded', pubkey, { promptType, language })
    return res
  },
)

settings.delete('/ivr-audio/:promptType/:language',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete IVR audio prompt',
    responses: {
      200: { description: 'Audio prompt deleted' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const promptType = c.req.param('promptType')
    const language = c.req.param('language')
    const res = await dos.settings.fetch(new Request(`http://do/settings/ivr-audio/${promptType}/${language}`, {
      method: 'DELETE',
    }))
    if (res.ok) await audit(dos.records, 'ivrAudioDeleted', pubkey, { promptType, language })
    return res
  },
)

// --- Report Types ---
settings.get('/report-types',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get report type definitions',
    responses: {
      200: { description: 'Report types' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/report-types'))
  },
)

settings.post('/report-types',
  describeRoute({
    tags: ['Settings'],
    summary: 'Create a report type',
    responses: {
      201: { description: 'Report type created' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', createReportTypeBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/report-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'reportTypeCreated', pubkey, { name: body.name })
    return res
  },
)

settings.patch('/report-types/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update a report type',
    responses: {
      200: { description: 'Report type updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', updateReportTypeBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request(`http://do/settings/report-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'reportTypeUpdated', pubkey, { reportTypeId: id })
    return res
  },
)

settings.delete('/report-types/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete a report type',
    responses: {
      200: { description: 'Report type deleted' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const res = await dos.settings.fetch(new Request(`http://do/settings/report-types/${id}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'reportTypeArchived', pubkey, { reportTypeId: id })
    return res
  },
)

// --- Roles (PBAC) ---
settings.get('/roles',
  describeRoute({
    tags: ['Settings'],
    summary: 'List all roles',
    responses: {
      200: { description: 'List of roles' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/roles'))
  },
)

settings.post('/roles',
  describeRoute({
    tags: ['Settings'],
    summary: 'Create a custom role',
    responses: {
      201: { description: 'Role created' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  validator('json', createRoleSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/roles', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'roleCreated', pubkey, { name: body.name })
    return res
  },
)

settings.patch('/roles/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update a role',
    responses: {
      200: { description: 'Role updated' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  validator('json', updateRoleSchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request(`http://do/settings/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'roleUpdated', pubkey, { roleId: id })
    return res
  },
)

settings.delete('/roles/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete a role',
    responses: {
      200: { description: 'Role deleted' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const res = await dos.settings.fetch(new Request(`http://do/settings/roles/${id}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'roleDeleted', pubkey, { roleId: id })
    return res
  },
)

// --- Permissions catalog ---
settings.get('/permissions',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get permissions catalog',
    responses: {
      200: { description: 'Permissions catalog' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  async (c) => {
    const { PERMISSION_CATALOG, getPermissionsByDomain } = await import('@shared/permissions')
    return c.json({
      permissions: PERMISSION_CATALOG,
      byDomain: getPermissionsByDomain(),
    })
  },
)

// --- Migration Status (Epic 286) ---
// Returns migration status for all 7 DOs in a single response
settings.get('/migrations',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get migration status for all Durable Objects',
    responses: {
      200: { description: 'Migration status per DO namespace' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  async (c) => {
    const dos = getDOs(c.env)

    const doNames: Array<{ label: string; stub: typeof dos.settings }> = [
      { label: 'settings', stub: dos.settings },
      { label: 'identity', stub: dos.identity },
      { label: 'records', stub: dos.records },
      { label: 'shifts', stub: dos.shifts },
      { label: 'calls', stub: dos.calls },
      { label: 'conversations', stub: dos.conversations },
      { label: 'blasts', stub: dos.blasts },
    ]

    const results = await Promise.all(
      doNames.map(async ({ label, stub }) => {
        try {
          const res = await stub.fetch(new Request('http://do/migrations/status'))
          if (res.ok) {
            const data = await res.json()
            return { namespace: label, ...data as Record<string, unknown> }
          }
          return { namespace: label, error: `HTTP ${res.status}` }
        } catch (err) {
          return { namespace: label, error: err instanceof Error ? err.message : 'Unknown error' }
        }
      }),
    )

    return c.json({ namespaces: results })
  },
)

// --- TTL Overrides (admin-configurable cleanup intervals) ---
settings.get('/ttl',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get TTL override settings',
    responses: {
      200: { description: 'TTL override settings' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.settings.fetch(new Request('http://do/settings/ttl'))
  },
)

settings.patch('/ttl',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update TTL override settings',
    responses: {
      200: { description: 'TTL overrides updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', ttlOverridesBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/ttl', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'ttlOverridesUpdated', pubkey, body as Record<string, unknown>)
    return res
  },
)

// --- Aggregated cleanup metrics from all DOs ---
settings.get('/cleanup-metrics',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get aggregated cleanup metrics',
    responses: {
      200: { description: 'Cleanup metrics from all DOs' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    const [settingsRes, identityRes, conversationRes] = await Promise.all([
      dos.settings.fetch(new Request('http://do/settings/cleanup-metrics')),
      dos.identity.fetch(new Request('http://do/identity/cleanup-metrics')),
      dos.conversations.fetch(new Request('http://do/conversations/cleanup-metrics')),
    ])
    const settingsMetrics = settingsRes.ok ? await settingsRes.json() : {}
    const identityMetrics = identityRes.ok ? await identityRes.json() : {}
    const conversationMetrics = conversationRes.ok ? await conversationRes.json() : {}
    return c.json({
      settings: settingsMetrics,
      identity: identityMetrics,
      conversation: conversationMetrics,
    })
  },
)

export default settings
