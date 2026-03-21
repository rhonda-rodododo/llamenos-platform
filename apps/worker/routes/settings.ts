import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
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
  roleResponseSchema,
  reportTypeResponseSchema,
  customFieldsListResponseSchema,
  roleListResponseSchema,
  reportTypeListResponseSchema,
  ivrAudioPromptsResponseSchema,
  successResponseSchema,
  permissionsCatalogResponseSchema,
  migrationStatusResponseSchema,
  cleanupMetricsResponseSchema,
  ttlOverridesResponseSchema,
} from '@protocol/schemas/settings'
import {
  geocodingConfigSchema,
  geocodingConfigAdminSchema,
  geocodingTestResponseSchema,
} from '@protocol/schemas/geocoding'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { invalidateRolesCache } from '../services/settings'
import { validateExternalUrl } from '../lib/ssrf-guard'

const settings = new Hono<AppEnv>()

// --- Transcription settings: readable by all authenticated, writable by settings:manage ---
settings.get('/transcription',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get transcription settings',
    responses: {
      200: {
        description: 'Transcription settings',
        content: {
          'application/json': {
            schema: resolver(transcriptionSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getTranscriptionSettings()
    return c.json(result)
  },
)

settings.patch('/transcription',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update transcription settings',
    responses: {
      200: {
        description: 'Transcription settings updated',
        content: {
          'application/json': {
            schema: resolver(transcriptionSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-transcription'),
  validator('json', transcriptionSettingsSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateTranscriptionSettings(body)
    await audit(services.audit, 'transcriptionToggled', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

// --- Custom fields: readable by all authenticated (filtered by permissions), writable by admin ---
settings.get('/custom-fields',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get custom field definitions',
    responses: {
      200: {
        description: 'Custom field definitions',
        content: {
          'application/json': {
            schema: resolver(customFieldsListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const permissions = c.get('permissions')
    const canManageFields = checkPermission(permissions, 'settings:manage-fields')
    const services = c.get('services')
    const result = await services.settings.getCustomFields(canManageFields ? 'admin' : 'volunteer')
    return c.json(result)
  },
)

settings.put('/custom-fields',
  describeRoute({
    tags: ['Settings'],
    summary: 'Replace custom field definitions',
    responses: {
      200: {
        description: 'Custom fields updated',
        content: {
          'application/json': {
            schema: resolver(customFieldsListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', customFieldsBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateCustomFields(body as unknown as Parameters<typeof services.settings.updateCustomFields>[0])
    await audit(services.audit, 'customFieldsUpdated', pubkey, {})
    return c.json(result)
  },
)

// --- All remaining settings: require specific permissions ---
settings.get('/spam',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get spam mitigation settings',
    responses: {
      200: {
        description: 'Spam settings',
        content: {
          'application/json': {
            schema: resolver(spamSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-spam'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getSpamSettings()
    return c.json(result)
  },
)

settings.patch('/spam',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update spam mitigation settings',
    responses: {
      200: {
        description: 'Spam settings updated',
        content: {
          'application/json': {
            schema: resolver(spamSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-spam'),
  validator('json', spamSettingsSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateSpamSettings(body)
    await audit(services.audit, 'spamMitigationToggled', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

settings.get('/call',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get call settings',
    responses: {
      200: {
        description: 'Call settings',
        content: {
          'application/json': {
            schema: resolver(callSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-calls'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getCallSettings()
    return c.json(result)
  },
)

settings.patch('/call',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update call settings',
    responses: {
      200: {
        description: 'Call settings updated',
        content: {
          'application/json': {
            schema: resolver(callSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-calls'),
  validator('json', callSettingsSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateCallSettings(body)
    await audit(services.audit, 'callSettingsUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

settings.get('/ivr-languages',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get IVR language settings',
    responses: {
      200: {
        description: 'IVR language settings',
        content: {
          'application/json': {
            schema: resolver(ivrLanguagesSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getIvrLanguages()
    return c.json(result)
  },
)

settings.patch('/ivr-languages',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update IVR language settings',
    responses: {
      200: {
        description: 'IVR language settings updated',
        content: {
          'application/json': {
            schema: resolver(ivrLanguagesSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  validator('json', ivrLanguagesSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateIvrLanguages(body as Parameters<typeof services.settings.updateIvrLanguages>[0])
    await audit(services.audit, 'ivrLanguagesUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

settings.get('/webauthn',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get WebAuthn settings',
    responses: {
      200: {
        description: 'WebAuthn settings',
        content: {
          'application/json': {
            schema: resolver(webauthnSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-webauthn'),
  async (c) => {
    const services = c.get('services')
    const result = await services.identity.getWebAuthnSettings()
    return c.json(result)
  },
)

settings.patch('/webauthn',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update WebAuthn settings',
    responses: {
      200: {
        description: 'WebAuthn settings updated',
        content: {
          'application/json': {
            schema: resolver(webauthnSettingsSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-webauthn'),
  validator('json', webauthnSettingsSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.identity.updateWebAuthnSettings(body)
    await audit(services.audit, 'webauthnSettingsUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

// --- Telephony Provider settings ---
settings.get('/telephony-provider',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get telephony provider settings',
    responses: {
      200: {
        description: 'Telephony provider settings',
        content: {
          'application/json': {
            schema: resolver(telephonyProviderSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-telephony'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getTelephonyProvider()
    return c.json(result)
  },
)

settings.patch('/telephony-provider',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update telephony provider settings',
    responses: {
      200: {
        description: 'Telephony provider settings updated',
        content: {
          'application/json': {
            schema: resolver(telephonyProviderSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-telephony'),
  validator('json', telephonyProviderSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateTelephonyProvider(body as Parameters<typeof services.settings.updateTelephonyProvider>[0])
    await audit(services.audit, 'telephonyProviderChanged', pubkey, { type: body.type })
    return c.json(result)
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
          // HIGH-W5: encodeURIComponent prevents SSRF via crafted accountSid (schema regex also guards)
          testUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(body.accountSid ?? '')}.json`
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
      200: {
        description: 'Messaging configuration',
        content: {
          'application/json': {
            schema: resolver(messagingConfigSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-messaging'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getMessagingConfig()
    return c.json(result)
  },
)

settings.patch('/messaging',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update messaging configuration',
    responses: {
      200: {
        description: 'Messaging configuration updated',
        content: {
          'application/json': {
            schema: resolver(messagingConfigSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-messaging'),
  validator('json', messagingConfigSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateMessagingConfig(body)
    await audit(services.audit, 'messagingConfigUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

// --- Setup state ---
settings.get('/setup',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get setup wizard state',
    responses: {
      200: {
        description: 'Setup state',
        content: {
          'application/json': {
            schema: resolver(setupStateSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-setup'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getSetupState()
    return c.json(result)
  },
)

settings.patch('/setup',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update setup wizard state',
    responses: {
      200: {
        description: 'Setup state updated',
        content: {
          'application/json': {
            schema: resolver(setupStateSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-setup'),
  validator('json', setupStateSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateSetupState(body as Record<string, unknown> as Parameters<typeof services.settings.updateSetupState>[0])
    await audit(services.audit, 'setupStateUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

settings.get('/ivr-audio',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get IVR audio prompts',
    responses: {
      200: {
        description: 'IVR audio prompt metadata',
        content: {
          'application/json': {
            schema: resolver(ivrAudioPromptsResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getIvrAudioList()
    return c.json(result)
  },
)

settings.put('/ivr-audio/:promptType/:language',
  describeRoute({
    tags: ['Settings'],
    summary: 'Upload IVR audio prompt',
    responses: {
      200: {
        description: 'Audio prompt uploaded',
        content: {
          'application/json': {
            schema: resolver(successResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const pubkey = c.get('pubkey')
    const promptType = c.req.param('promptType')
    const language = c.req.param('language')
    const body = await c.req.arrayBuffer()
    const services = c.get('services')
    // Convert to base64 for storage
    const bytes = new Uint8Array(body)
    const audioBase64 = btoa(String.fromCharCode(...bytes))
    const result = await services.settings.uploadIvrAudio(promptType, language, audioBase64, body.byteLength)
    await audit(services.audit, 'ivrAudioUploaded', pubkey, { promptType, language })
    return c.json(result)
  },
)

settings.delete('/ivr-audio/:promptType/:language',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete IVR audio prompt',
    responses: {
      200: {
        description: 'Audio prompt deleted',
        content: {
          'application/json': {
            schema: resolver(successResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ivr'),
  async (c) => {
    const pubkey = c.get('pubkey')
    const promptType = c.req.param('promptType')
    const language = c.req.param('language')
    const services = c.get('services')
    const result = await services.settings.deleteIvrAudio(promptType, language)
    await audit(services.audit, 'ivrAudioDeleted', pubkey, { promptType, language })
    return c.json(result)
  },
)

// --- Report Types ---
settings.get('/report-types',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get report type definitions',
    responses: {
      200: {
        description: 'Report types',
        content: {
          'application/json': {
            schema: resolver(reportTypeListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getReportTypes()
    return c.json(result)
  },
)

settings.post('/report-types',
  describeRoute({
    tags: ['Settings'],
    summary: 'Create a report type',
    responses: {
      201: {
        description: 'Report type created',
        content: {
          'application/json': {
            schema: resolver(reportTypeResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', createReportTypeBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.createReportType(body as Record<string, unknown> as Parameters<typeof services.settings.createReportType>[0])
    await audit(services.audit, 'reportTypeCreated', pubkey, { name: body.name })
    return c.json(result, 201)
  },
)

settings.patch('/report-types/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update a report type',
    responses: {
      200: {
        description: 'Report type updated',
        content: {
          'application/json': {
            schema: resolver(reportTypeResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  validator('json', updateReportTypeBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateReportType(id, body as Record<string, unknown> as Parameters<typeof services.settings.updateReportType>[1])
    await audit(services.audit, 'reportTypeUpdated', pubkey, { reportTypeId: id })
    return c.json(result)
  },
)

settings.delete('/report-types/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete a report type',
    responses: {
      200: {
        description: 'Report type deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-fields'),
  async (c) => {
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.archiveReportType(id)
    await audit(services.audit, 'reportTypeArchived', pubkey, { reportTypeId: id })
    return c.json(result)
  },
)

// --- Roles (PBAC) ---
settings.get('/roles',
  describeRoute({
    tags: ['Settings'],
    summary: 'List all roles',
    responses: {
      200: {
        description: 'List of roles',
        content: {
          'application/json': {
            schema: resolver(roleListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:view-roles'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getRoles()
    return c.json(result)
  },
)

settings.post('/roles',
  describeRoute({
    tags: ['Settings'],
    summary: 'Create a custom role',
    responses: {
      201: {
        description: 'Role created',
        content: {
          'application/json': {
            schema: resolver(roleResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  validator('json', createRoleSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.createRole(body)
    invalidateRolesCache()
    await audit(services.audit, 'roleCreated', pubkey, { name: body.name })
    return c.json(result, 201)
  },
)

settings.patch('/roles/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update a role',
    responses: {
      200: {
        description: 'Role updated',
        content: {
          'application/json': {
            schema: resolver(roleResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  validator('json', updateRoleSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateRole(id, body)
    invalidateRolesCache()
    await audit(services.audit, 'roleUpdated', pubkey, { roleId: id })
    return c.json(result)
  },
)

settings.delete('/roles/:id',
  describeRoute({
    tags: ['Settings'],
    summary: 'Delete a role',
    responses: {
      200: {
        description: 'Role deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  async (c) => {
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.deleteRole(id)
    invalidateRolesCache()
    await audit(services.audit, 'roleDeleted', pubkey, { roleId: id })
    return c.json(result)
  },
)

// --- Permissions catalog ---
settings.get('/permissions',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get permissions catalog',
    responses: {
      200: {
        description: 'Permissions catalog',
        content: {
          'application/json': {
            schema: resolver(permissionsCatalogResponseSchema),
          },
        },
      },
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
      200: {
        description: 'Migration status per DO namespace',
        content: {
          'application/json': {
            schema: resolver(migrationStatusResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  async (c) => {
    // Migration status is a DO-specific concept — return empty for service-based deployments
    return c.json({ namespaces: [], note: 'Service-based deployment — no DO migrations' })
  },
)

// --- TTL Overrides (admin-configurable cleanup intervals) ---
settings.get('/ttl',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get TTL override settings',
    responses: {
      200: {
        description: 'TTL override settings',
        content: {
          'application/json': {
            schema: resolver(ttlOverridesResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ttl'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getTTLOverrides()
    return c.json(result)
  },
)

settings.patch('/ttl',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update TTL override settings',
    responses: {
      200: {
        description: 'TTL overrides updated',
        content: {
          'application/json': {
            schema: resolver(ttlOverridesResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-ttl'),
  validator('json', ttlOverridesBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateTTLOverrides(body as Record<string, unknown>)
    await audit(services.audit, 'ttlOverridesUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  },
)

// --- Aggregated cleanup metrics from all DOs ---
settings.get('/cleanup-metrics',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get aggregated cleanup metrics',
    responses: {
      200: {
        description: 'Cleanup metrics from all DOs',
        content: {
          'application/json': {
            schema: resolver(cleanupMetricsResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const services = c.get('services')
    const settingsMetrics = await services.settings.getCleanupMetrics()
    return c.json({
      settings: settingsMetrics,
      identity: {},
      conversation: {},
    })
  },
)

// --- Geocoding config: readable by authenticated users, writable by settings:manage ---
settings.get('/geocoding',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get geocoding configuration (API key omitted)',
    responses: {
      200: { description: 'Geocoding config', content: { 'application/json': { schema: resolver(geocodingConfigSchema) } } },
      ...authErrors,
    },
  }),
  async (c) => {
    const config = await c.get('services').settings.getGeocodingConfig()
    return c.json(config)
  },
)

settings.put('/geocoding',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update geocoding configuration (admin only)',
    responses: {
      200: { description: 'Config updated', content: { 'application/json': { schema: resolver(geocodingConfigSchema) } } },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', geocodingConfigAdminSchema),
  async (c) => {
    const body = c.req.valid('json')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    await services.settings.updateGeocodingConfig(body)
    await audit(services.audit, 'settings.geocoding.updated', pubkey, { provider: body.provider, enabled: body.enabled })
    return c.json({ provider: body.provider, countries: body.countries, enabled: body.enabled })
  },
)

settings.get('/geocoding/test',
  describeRoute({
    tags: ['Settings'],
    summary: 'Test geocoding connectivity (admin only)',
    responses: {
      200: { description: 'Test result', content: { 'application/json': { schema: resolver(geocodingTestResponseSchema) } } },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const config = await c.get('services').settings.getGeocodingConfigAdmin()
    const { createGeocodingAdapter } = await import('../geocoding/factory')
    const adapter = createGeocodingAdapter(config)
    const start = Date.now()
    try {
      await adapter.autocomplete('test', { limit: 1 })
      return c.json({ ok: true, latency: Date.now() - start })
    } catch {
      return c.json({ ok: false, latency: Date.now() - start })
    }
  },
)

export default settings
