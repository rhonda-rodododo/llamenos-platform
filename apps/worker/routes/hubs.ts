import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { createHubBodySchema, updateHubBodySchema, addHubMemberBodySchema, hubKeyEnvelopesBodySchema } from '../schemas/hubs'
import { okResponseSchema } from '../schemas/responses'
import { authErrors, notFoundError } from '../openapi/helpers'
import { getDOs } from '../lib/do-access'
import type { Hub } from '@shared/types'

const routes = new Hono<AppEnv>()

// List hubs (filtered by user's membership, super admin sees all)
routes.get('/',
  describeRoute({
    tags: ['Hubs'],
    summary: 'List hubs visible to the current user',
    responses: {
      200: { description: 'List of hubs' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const volunteer = c.get('volunteer')
    const permissions = c.get('permissions')

    const res = await dos.settings.fetch(new Request('http://do/settings/hubs'))
    if (!res.ok) return c.json({ hubs: [] })
    const { hubs } = await res.json() as { hubs: Hub[] }

    // Super admin sees all
    if (checkPermission(permissions, '*')) {
      return c.json({ hubs: hubs.filter(h => h.status === 'active') })
    }

    // Others see only their hubs
    const userHubIds = new Set((volunteer.hubRoles || []).map(hr => hr.hubId))
    return c.json({ hubs: hubs.filter(h => h.status === 'active' && userHubIds.has(h.id)) })
  },
)

// Create hub (super admin only)
routes.post('/',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Create a new hub',
    responses: {
      201: { description: 'Hub created' },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-hubs'),
  validator('json', createHubBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const hub: Hub = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      slug: body.slug?.trim() || body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: body.description?.trim(),
      status: 'active',
      phoneNumber: body.phoneNumber?.trim(),
      createdBy: pubkey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const res = await dos.settings.fetch(new Request('http://do/settings/hubs', {
      method: 'POST',
      body: JSON.stringify(hub),
    }))

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create hub' }))
      return c.json(err, 500)
    }

    return c.json({ hub })
  },
)

// Get hub details
routes.get('/:hubId',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Get hub details',
    responses: {
      200: { description: 'Hub details' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const hubId = c.req.param('hubId')
    const dos = getDOs(c.env)
    const volunteer = c.get('volunteer')
    const permissions = c.get('permissions')

    const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}`))
    if (!res.ok) return c.json({ error: 'Hub not found' }, 404)

    const { hub } = await res.json() as { hub: Hub }

    // Check access
    const isSuperAdmin = checkPermission(permissions, '*')
    const hasHubAccess = (volunteer.hubRoles || []).some(hr => hr.hubId === hubId)
    if (!isSuperAdmin && !hasHubAccess) {
      return c.json({ error: 'Access denied' }, 403)
    }

    return c.json({ hub })
  },
)

// Update hub
routes.patch('/:hubId',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Update a hub',
    responses: {
      200: { description: 'Hub updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('system:manage-hubs'),
  validator('json', updateHubBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const dos = getDOs(c.env)
    const body = c.req.valid('json')

    const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return c.json({ error: 'Failed to update hub' }, 500)
    const result = await res.json()
    return c.json(result)
  },
)

// Add member to hub
routes.post('/:hubId/members',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Add a member to a hub',
    responses: {
      200: { description: 'Member added' },
      ...authErrors,
    },
  }),
  requirePermission('volunteers:manage-roles'),
  validator('json', addHubMemberBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const dos = getDOs(c.env)
    const body = c.req.valid('json')

    const res = await dos.identity.fetch(new Request('http://do/identity/hub-role', {
      method: 'POST',
      body: JSON.stringify({ pubkey: body.pubkey, hubId, roleIds: body.roleIds }),
    }))

    if (!res.ok) return c.json({ error: 'Failed to add member' }, 500)
    return c.json(await res.json())
  },
)

// Remove member from hub
routes.delete('/:hubId/members/:pubkey',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Remove a member from a hub',
    responses: {
      200: {
        description: 'Member removed',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('volunteers:manage-roles'),
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.req.param('pubkey')
    const dos = getDOs(c.env)

    const res = await dos.identity.fetch(new Request('http://do/identity/hub-role', {
      method: 'DELETE',
      body: JSON.stringify({ pubkey, hubId }),
    }))

    if (!res.ok) return c.json({ error: 'Failed to remove member' }, 500)
    return c.json({ ok: true })
  },
)

// --- Hub Key Management ---

// Get my hub key envelope (any hub member)
routes.get('/:hubId/key',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Get hub key envelope for current user',
    responses: {
      200: { description: 'Hub key envelope' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.get('pubkey')
    const dos = getDOs(c.env)

    const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}/key`))
    if (!res.ok) return c.json({ error: 'Hub not found' }, 404)

    const { envelopes } = await res.json() as {
      envelopes: { pubkey: string; wrappedKey: string; ephemeralPubkey: string }[]
    }

    // Return only the envelope for this user
    const myEnvelope = envelopes.find(e => e.pubkey === pubkey)
    if (!myEnvelope) return c.json({ error: 'No key envelope for this user' }, 404)

    return c.json({ envelope: myEnvelope })
  },
)

// Set hub key envelopes (admin only — distributes wrapped hub key to all members)
routes.put('/:hubId/key',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Set hub key envelopes for all members',
    responses: {
      200: {
        description: 'Hub key envelopes set',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('system:manage-hubs'),
  validator('json', hubKeyEnvelopesBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const dos = getDOs(c.env)
    const body = c.req.valid('json')

    const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}/key`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }))

    if (!res.ok) {
      const err = await res.text()
      return c.json({ error: err }, res.status as 404 | 500)
    }

    return c.json({ ok: true })
  },
)

export default routes
