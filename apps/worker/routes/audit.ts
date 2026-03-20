import { listAuditQuerySchema, auditListResponseSchema } from '@protocol/schemas/audit'
import { createEntityRouter } from '../lib/entity-router'

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

export default auditListRouter
