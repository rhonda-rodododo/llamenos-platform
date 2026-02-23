import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const settings = new Hono<AppEnv>()

// --- Transcription settings: readable by all authenticated, writable by settings:manage ---
settings.get('/transcription', async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/transcription'))
})

settings.patch('/transcription', requirePermission('settings:manage-transcription'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/transcription', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'transcriptionToggled', pubkey, body as Record<string, unknown>)
  return res
})

// --- Custom fields: readable by all authenticated (filtered by permissions), writable by admin ---
settings.get('/custom-fields', async (c) => {
  const dos = getDOs(c.env)
  const permissions = c.get('permissions')
  const canManageFields = checkPermission(permissions, 'settings:manage-fields')
  return dos.settings.fetch(new Request(`http://do/settings/custom-fields?role=${canManageFields ? 'admin' : 'volunteer'}`))
})

settings.put('/custom-fields', requirePermission('settings:manage-fields'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/custom-fields', {
    method: 'PUT',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'customFieldsUpdated', pubkey, {})
  return res
})

// --- All remaining settings: require specific permissions ---
settings.get('/spam', requirePermission('settings:manage-spam'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/spam'))
})

settings.patch('/spam', requirePermission('settings:manage-spam'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/spam', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'spamMitigationToggled', pubkey, body as Record<string, unknown>)
  return res
})

settings.get('/call', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/call'))
})

settings.patch('/call', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/call', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'callSettingsUpdated', pubkey, body as Record<string, unknown>)
  return res
})

settings.get('/ivr-languages', requirePermission('settings:manage-ivr'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/ivr-languages'))
})

settings.patch('/ivr-languages', requirePermission('settings:manage-ivr'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/ivr-languages', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'ivrLanguagesUpdated', pubkey, body as Record<string, unknown>)
  return res
})

settings.get('/webauthn', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  return dos.identity.fetch(new Request('http://do/settings/webauthn'))
})

settings.patch('/webauthn', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.identity.fetch(new Request('http://do/settings/webauthn', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'webauthnSettingsUpdated', pubkey, body as Record<string, unknown>)
  return res
})

// --- Telephony Provider settings ---
settings.get('/telephony-provider', requirePermission('settings:manage-telephony'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
})

settings.patch('/telephony-provider', requirePermission('settings:manage-telephony'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'telephonyProviderChanged', pubkey, { type: (body as { type?: string }).type })
  return res
})

settings.post('/telephony-provider/test', requirePermission('settings:manage-telephony'), async (c) => {
  const body = await c.req.json() as { type: string; accountSid?: string; authToken?: string; phoneNumber?: string; signalwireSpace?: string; apiKey?: string; apiSecret?: string; applicationId?: string; authId?: string; ariUrl?: string; ariUsername?: string; ariPassword?: string }
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
        let ariParsed: URL
        try { ariParsed = new URL(body.ariUrl) } catch {
          return Response.json({ ok: false, error: 'Invalid ARI URL' }, { status: 400 })
        }
        const hostname = ariParsed.hostname
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
            hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.startsWith('192.168.') ||
            hostname === '169.254.169.254' || hostname === '0.0.0.0') {
          return Response.json({ ok: false, error: 'ARI URL must not point to internal/loopback addresses' }, { status: 400 })
        }
        if (ariParsed.protocol !== 'https:' && ariParsed.protocol !== 'http:') {
          return Response.json({ ok: false, error: 'ARI URL must use HTTPS' }, { status: 400 })
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
})

// --- Messaging config ---
settings.get('/messaging', requirePermission('settings:manage-messaging'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/messaging'))
})

settings.patch('/messaging', requirePermission('settings:manage-messaging'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/messaging', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'messagingConfigUpdated', pubkey, body as Record<string, unknown>)
  return res
})

// --- Setup state ---
settings.get('/setup', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/setup'))
})

settings.patch('/setup', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/setup', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'setupStateUpdated', pubkey, body as Record<string, unknown>)
  return res
})

settings.get('/ivr-audio', requirePermission('settings:manage-ivr'), async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/ivr-audio'))
})

settings.put('/ivr-audio/:promptType/:language', requirePermission('settings:manage-ivr'), async (c) => {
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
})

settings.delete('/ivr-audio/:promptType/:language', requirePermission('settings:manage-ivr'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const promptType = c.req.param('promptType')
  const language = c.req.param('language')
  const res = await dos.settings.fetch(new Request(`http://do/settings/ivr-audio/${promptType}/${language}`, {
    method: 'DELETE',
  }))
  if (res.ok) await audit(dos.records, 'ivrAudioDeleted', pubkey, { promptType, language })
  return res
})

// --- Roles (PBAC) ---
settings.get('/roles', async (c) => {
  const dos = getDOs(c.env)
  return dos.settings.fetch(new Request('http://do/settings/roles'))
})

settings.post('/roles', requirePermission('system:manage-roles'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/roles', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'roleCreated', pubkey, { name: (body as { name?: string }).name })
  return res
})

settings.patch('/roles/:id', requirePermission('system:manage-roles'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request(`http://do/settings/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'roleUpdated', pubkey, { roleId: id })
  return res
})

settings.delete('/roles/:id', requirePermission('system:manage-roles'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  const res = await dos.settings.fetch(new Request(`http://do/settings/roles/${id}`, { method: 'DELETE' }))
  if (res.ok) await audit(dos.records, 'roleDeleted', pubkey, { roleId: id })
  return res
})

// --- Permissions catalog ---
settings.get('/permissions', requirePermission('system:manage-roles'), async (c) => {
  const { PERMISSION_CATALOG, getPermissionsByDomain } = await import('../../shared/permissions')
  return c.json({
    permissions: PERMISSION_CATALOG,
    byDomain: getPermissionsByDomain(),
  })
})

export default settings
