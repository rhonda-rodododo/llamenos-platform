import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { checkPermission } from '../middleware/permission-guard'

const calls = new Hono<AppEnv>()

calls.get('/active', async (c) => {
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

calls.get('/today-count', async (c) => {
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

// Diagnostic endpoint
calls.get('/debug', requirePermission('calls:debug'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.calls.fetch(new Request('http://do/calls/debug'))
  return res
})

export default calls
