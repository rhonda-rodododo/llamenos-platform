import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { listAuditQuerySchema } from '@protocol/schemas/audit'
import { authErrors } from '../openapi/helpers'

const auditRoutes = new Hono<AppEnv>()
auditRoutes.use('*', requirePermission('audit:read'))

auditRoutes.get('/',
  describeRoute({
    tags: ['Audit'],
    summary: 'List audit log entries',
    responses: {
      200: { description: 'Paginated audit entries' },
      ...authErrors,
    },
  }),
  validator('query', listAuditQuerySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))
    if (query.actorPubkey) params.set('actorPubkey', query.actorPubkey)
    if (query.eventType) params.set('eventType', query.eventType)
    if (query.dateFrom) params.set('dateFrom', query.dateFrom)
    if (query.dateTo) params.set('dateTo', query.dateTo)
    if (query.search) params.set('search', query.search)
    return dos.records.fetch(new Request(`http://do/audit?${params}`))
  },
)

export default auditRoutes
