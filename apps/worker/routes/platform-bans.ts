import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { isValidE164 } from '../lib/helpers'
import { requirePermission } from '../middleware/permission-guard'
import { okResponseSchema } from '@protocol/schemas/common'
import {
  createPlatformBanBodySchema,
  bulkPlatformBanBodySchema,
  platformBanListResponseSchema,
  searchBansResponseSchema,
  promoteBanBodySchema,
} from '@protocol/schemas/bans'
import { authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { hashPhone } from '../lib/crypto'

const platformBans = new Hono<AppEnv>()

platformBans.get(
  '/',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'List platform-scoped bans',
    responses: {
      200: {
        description: 'Platform bans list',
        content: {
          'application/json': {
            schema: resolver(platformBanListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:read-platform'),
  async (c) => {
    const services = c.get('services')
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 50) || 50, 200))
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0)

    const { bans: rows, total } = await services.records.listPlatformBans(limit, offset)

    return c.json({
      bans: rows.map((b) => ({
        id: b.id,
        phoneHash: b.phone,
        reason: b.reason,
        bannedBy: b.bannedBy,
        bannedAt: b.bannedAt?.toISOString() ?? '',
      })),
      total,
    })
  },
)

platformBans.post(
  '/',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'Create a platform-scoped ban',
    responses: {
      200: {
        description: 'Ban created',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:create-platform'),
  validator('json', createPlatformBanBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    if (!isValidE164(body.phone)) {
      return c.json(
        { error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' },
        400,
      )
    }
    const phoneHash = hashPhone(body.phone, c.env.HMAC_SECRET)
    // HIGH-W3: Never store plaintext phone — only masked last-4 for admin display
    const phoneMasked = body.phone.length >= 4 ? `***${body.phone.slice(-4)}` : '***'
    await services.records.addBan({
      phone: phoneHash,
      phoneDisplay: phoneMasked,
      reason: body.reason ?? '',
      bannedBy: pubkey,
    })
    await audit(
      services.audit,
      'platformBanCreated',
      pubkey,
      { phoneHash },
    )
    return c.json({ ok: true })
  },
)

platformBans.post(
  '/bulk',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'Bulk import platform-scoped bans',
    responses: {
      200: {
        description: 'Bans imported',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:create-platform'),
  validator('json', bulkPlatformBanBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const invalidPhones = body.phones.filter((p: string) => !isValidE164(p))
    if (invalidPhones.length > 0) {
      return c.json(
        {
          error: `Invalid phone number(s): ${invalidPhones[0]}. Use E.164 format`,
        },
        400,
      )
    }
    // HIGH-W3: Never store plaintext phone — only masked last-4 for admin display
    const entries = body.phones.map((p: string) => ({
      phoneHash: hashPhone(p, c.env.HMAC_SECRET),
      phoneDisplay: p.length >= 4 ? `***${p.slice(-4)}` : '***',
    }))
    const added = await services.records.bulkAddBans(
      entries,
      body.reason ?? '',
      pubkey,
    )
    await audit(services.audit, 'platformBanBulkImport', pubkey, {
      count: body.phones.length,
    })
    return c.json({ ok: true, count: added })
  },
)

platformBans.delete(
  '/:id',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'Remove a platform-scoped ban',
    responses: {
      200: {
        description: 'Ban removed',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:delete-platform'),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')

    const deleted = await services.records.deletePlatformBan(id)
    if (!deleted) {
      return c.json({ error: 'Platform ban not found' }, 404)
    }

    await audit(services.audit, 'platformBanRemoved', pubkey, {
      banId: id,
    })
    return c.json({ ok: true })
  },
)

platformBans.get(
  '/search',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'Search all bans by phone number',
    responses: {
      200: {
        description: 'Search results',
        content: {
          'application/json': {
            schema: resolver(searchBansResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:read-platform'),
  async (c) => {
    const services = c.get('services')
    const phone = c.req.query('phone')
    if (!phone || !isValidE164(phone)) {
      return c.json(
        { error: 'Invalid phone parameter. Use E.164 format.' },
        400,
      )
    }
    const phoneHash = hashPhone(phone, c.env.HMAC_SECRET)

    const rows = await services.records.searchBansByPhone(phoneHash)

    return c.json({
      bans: rows.map((b) => ({
        id: b.id,
        hubId: b.hubId,
        phoneHash: b.phone,
        reason: b.reason,
        bannedBy: b.bannedBy,
        bannedAt: b.bannedAt?.toISOString() ?? '',
      })),
    })
  },
)

platformBans.post(
  '/promote',
  describeRoute({
    tags: ['Platform Bans'],
    summary: 'Promote a hub-scoped ban to platform scope',
    responses: {
      200: {
        description: 'Ban promoted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('bans:create-platform'),
  validator('json', promoteBanBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const sourceBan = await services.records.getBanById(body.banId)

    if (!sourceBan) {
      return c.json({ error: 'Source ban not found' }, 404)
    }
    if (!sourceBan.hubId) {
      return c.json({ error: 'Ban is already platform-scoped' }, 409)
    }

    await services.records.addBan({
      phone: sourceBan.phone,
      phoneDisplay: sourceBan.phoneDisplay ?? '',
      reason: sourceBan.reason ?? '',
      bannedBy: pubkey,
    })

    await audit(services.audit, 'platformBanPromoted', pubkey, {
      sourceHubId: sourceBan.hubId,
      sourceBanId: sourceBan.id,
    })

    return c.json({ ok: true })
  },
)

export default platformBans
