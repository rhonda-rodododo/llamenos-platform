import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { isValidE164 } from '../lib/helpers'
import { requirePermission } from '../middleware/permission-guard'
import { okResponseSchema } from '@protocol/schemas/common'
import { createBanBodySchema, bulkBanBodySchema, banListResponseSchema, bulkBanResponseSchema } from '@protocol/schemas/bans'
import { authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { createEntityRouter } from '../lib/entity-router'

const bans = new Hono<AppEnv>()

// GET / via factory
const banListRouter = createEntityRouter({
  tag: 'Bans',
  domain: 'bans',
  service: 'records',
  listResponseSchema: banListResponseSchema,
  itemResponseSchema: banListResponseSchema,
  hubScoped: true,
  disableGet: true,
  disableDelete: true,
  methods: {
    list: 'listBans',
  },
})
bans.route('/', banListRouter)

// Any authenticated user with bans:report can report/ban
bans.post('/',
  describeRoute({
    tags: ['Bans'],
    summary: 'Ban a phone number',
    responses: {
      200: {
        description: 'Number banned',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:report'),
  validator('json', createBanBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')
    if (!isValidE164(body.phone)) {
      return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
    }
    await services.records.addBan({
      hubId,
      phone: body.phone,
      reason: body.reason ?? '',
      bannedBy: pubkey,
    })
    await audit(services.audit, 'numberBanned', pubkey, { phone: body.phone })
    return c.json({ ok: true })
  },
)

bans.post('/bulk',
  describeRoute({
    tags: ['Bans'],
    summary: 'Bulk ban phone numbers',
    responses: {
      200: {
        description: 'Numbers banned',
        content: {
          'application/json': {
            schema: resolver(bulkBanResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:bulk-create'),
  validator('json', bulkBanBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')
    const invalidPhones = body.phones.filter(p => !isValidE164(p))
    if (invalidPhones.length > 0) {
      return c.json({ error: `Invalid phone number(s): ${invalidPhones[0]}. Use E.164 format (e.g. +12125551234)` }, 400)
    }
    const added = await services.records.bulkAddBans(body.phones, body.reason ?? '', pubkey, hubId)
    await audit(services.audit, 'numberBanned', pubkey, { count: body.phones.length, bulk: true })
    return c.json({ count: added })
  },
)

bans.delete('/:phone',
  describeRoute({
    tags: ['Bans'],
    summary: 'Unban a phone number',
    responses: {
      200: {
        description: 'Number unbanned',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:delete'),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId')
    const phone = decodeURIComponent(c.req.param('phone'))
    await services.records.removeBan(phone, hubId)
    await audit(services.audit, 'numberUnbanned', pubkey, {})
    return c.json({ ok: true })
  },
)

export default bans
