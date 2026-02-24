import { Hono } from 'hono'
import type { AppEnv, CallRecord } from '../types'
import { getScopedDOs, getTelephony } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'

const calls = new Hono<AppEnv>()

calls.get('/active', requirePermission('calls:read-active'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const permissions = c.get('permissions')
  const canSeeFullInfo = checkPermission(permissions, 'calls:read-active-full')
  const res = await dos.calls.fetch(new Request('http://do/calls/active'))
  if (!canSeeFullInfo) {
    const data = await res.json() as { calls: Array<{ callerNumber: string; [key: string]: unknown }> }
    data.calls = data.calls.map(call => ({ ...call, callerNumber: '[redacted]' }))
    return c.json(data)
  }
  return res
})

calls.get('/today-count', requirePermission('calls:read-active'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.calls.fetch(new Request('http://do/calls/today-count'))
})

calls.get('/presence', requirePermission('calls:read-presence'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.calls.fetch(new Request('http://do/calls/presence'))
})

calls.get('/history', requirePermission('calls:read-history'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const params = new URLSearchParams()
  params.set('page', c.req.query('page') || '1')
  params.set('limit', c.req.query('limit') || '50')
  if (c.req.query('search')) params.set('search', c.req.query('search')!)
  if (c.req.query('dateFrom')) params.set('dateFrom', c.req.query('dateFrom')!)
  if (c.req.query('dateTo')) params.set('dateTo', c.req.query('dateTo')!)
  return dos.calls.fetch(new Request(`http://do/calls/history?${params}`))
})

// Recording playback — admin or answering volunteer
calls.get('/:callId/recording', async (c) => {
  const callId = c.req.param('callId')
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const permissions = c.get('permissions')
  const pubkey = c.get('pubkey')

  // Fetch the call record to verify permission and get recordingSid
  const callRes = await dos.calls.fetch(new Request(`http://do/calls/${callId}`))
  if (!callRes.ok) return c.json({ error: 'Call not found' }, 404)
  const { call } = await callRes.json() as { call: CallRecord }

  if (!call.recordingSid || !call.hasRecording) {
    return c.json({ error: 'No recording available for this call' }, 404)
  }

  // Permission check: admin (calls:read-recording) or the volunteer who answered
  const isAdmin = checkPermission(permissions, 'calls:read-recording')
  const isAnsweringVolunteer = call.answeredBy === pubkey
  if (!isAdmin && !isAnsweringVolunteer) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Fetch recording audio from the telephony provider on demand
  const adapter = await getTelephony(c.env, dos)
  if (!adapter) return c.json({ error: 'Telephony provider not configured' }, 503)

  const audio = await adapter.getRecordingAudio(call.recordingSid)
  if (!audio) return c.json({ error: 'Recording not available from provider' }, 404)

  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(audio.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
})

// Diagnostic endpoint
calls.get('/debug', requirePermission('calls:debug'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.calls.fetch(new Request('http://do/calls/debug'))
  return res
})

export default calls
