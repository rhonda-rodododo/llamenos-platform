import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'

const auditRoutes = new Hono<AppEnv>()
auditRoutes.use('*', requirePermission('audit:read'))

auditRoutes.get('/', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const params = new URLSearchParams()
  params.set('page', c.req.query('page') || '1')
  params.set('limit', c.req.query('limit') || '50')
  if (c.req.query('actorPubkey')) params.set('actorPubkey', c.req.query('actorPubkey')!)
  if (c.req.query('eventType')) params.set('eventType', c.req.query('eventType')!)
  if (c.req.query('dateFrom')) params.set('dateFrom', c.req.query('dateFrom')!)
  if (c.req.query('dateTo')) params.set('dateTo', c.req.query('dateTo')!)
  if (c.req.query('search')) params.set('search', c.req.query('search')!)
  return dos.records.fetch(new Request(`http://do/audit?${params}`))
})

export default auditRoutes
