import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import {
  listAuditQuerySchema,
  auditListResponseSchema,
  auditVerifyQuerySchema,
  auditVerifyResponseSchema,
} from '@protocol/schemas/audit'
import { createEntityRouter } from '../lib/entity-router'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { authErrors } from '../openapi/helpers'

const auditListRouter = createEntityRouter({
  tag: 'Audit',
  domain: 'audit',
  service: 'audit',
  listResponseSchema: auditListResponseSchema,
  itemResponseSchema: auditListResponseSchema,
  listQuerySchema: listAuditQuerySchema,
  hubScoped: true,
  disableGet: true,
  disableDelete: true,
  methods: {
    list: 'list',
  },
})

// ---------------------------------------------------------------------------
// Additional audit endpoints (outside entity-router CRUD)
// ---------------------------------------------------------------------------

const auditExtra = new Hono<AppEnv>()

auditExtra.get(
  '/verify',
  describeRoute({
    tags: ['Audit'],
    summary: 'Verify audit log hash chain integrity',
    description:
      'Walks the hash chain in chronological order and verifies each entry\'s hash and linkage. ' +
      'Supports pagination via limit/offset for large chains.',
    responses: {
      200: {
        description: 'Chain verification result',
        content: { 'application/json': { schema: resolver(auditVerifyResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', auditVerifyQuerySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    const { limit, offset } = c.req.valid('query')

    const result = await services.audit.verifyChain(hubId ?? undefined, {
      limit,
      offset,
    })

    return c.json(result)
  },
)

// Mount verify BEFORE the entity router so /verify is matched before /:id
const audit = new Hono<AppEnv>()
audit.route('/', auditExtra)
audit.route('/', auditListRouter)

export default audit
