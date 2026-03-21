import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { createHubBodySchema, updateHubBodySchema, addHubMemberBodySchema, hubKeyEnvelopesBodySchema, hubResponseSchema, hubListResponseSchema, hubDetailResponseSchema, hubKeyEnvelopeResponseSchema } from '@protocol/schemas/hubs'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import type { Hub } from '@shared/types'
import { ServiceError } from '../services/settings'
import { audit } from '../services/audit'

const routes = new Hono<AppEnv>()

// Hub routes are not migrated to the entity-router factory — access control
// and hub construction logic cannot be expressed in factory config. Hub
// creation uses inline crypto.randomUUID() + slug generation; GET / and
// GET /:hubId have non-standard access control checks (isSuperAdmin OR
// hasHubAccess) that cannot be expressed via the factory's single domain prefix.

// List hubs (filtered by user's membership, super admin sees all)
routes.get('/',
  describeRoute({
    tags: ['Hubs'],
    summary: 'List hubs visible to the current user',
    responses: {
      200: {
        description: 'List of hubs',
        content: {
          'application/json': {
            schema: resolver(hubListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('hubs:read'),
  async (c) => {
    const services = c.get('services')
    const user = c.get('user')
    const permissions = c.get('permissions')

    const { hubs } = await services.settings.getHubs()

    // Super admin sees all
    if (checkPermission(permissions, '*')) {
      return c.json({ hubs: hubs.filter(h => h.status === 'active') })
    }

    // Others see only their hubs
    const userHubIds = new Set((user.hubRoles || []).map(hr => hr.hubId))
    return c.json({ hubs: hubs.filter(h => h.status === 'active' && userHubIds.has(h.id)) })
  },
)

// Create hub (super admin only)
routes.post('/',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Create a new hub',
    responses: {
      201: {
        description: 'Hub created',
        content: {
          'application/json': {
            schema: resolver(hubDetailResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-hubs'),
  validator('json', createHubBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
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

    try {
      await services.settings.createHub(hub)
    } catch (err) {
      if (err instanceof ServiceError) {
        return c.json({ error: err.message }, err.status as 400 | 409 | 500)
      }
      const message = err instanceof Error ? err.message : 'Failed to create hub'
      return c.json({ error: message }, 500)
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
      200: {
        description: 'Hub details',
        content: {
          'application/json': {
            schema: resolver(hubDetailResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('hubs:read'),
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')
    const user = c.get('user')
    const permissions = c.get('permissions')

    try {
      const { hub } = await services.settings.getHub(hubId)

      // Check access
      const isSuperAdmin = checkPermission(permissions, '*')
      const hasHubAccess = (user.hubRoles || []).some(hr => hr.hubId === hubId)
      if (!isSuperAdmin && !hasHubAccess) {
        return c.json({ error: 'Access denied' }, 403)
      }

      return c.json({ hub })
    } catch {
      return c.json({ error: 'Hub not found' }, 404)
    }
  },
)

// Update hub
routes.patch('/:hubId',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Update a hub',
    responses: {
      200: {
        description: 'Hub updated',
        content: {
          'application/json': {
            schema: resolver(hubResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('system:manage-hubs'),
  validator('json', updateHubBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')
    const body = c.req.valid('json')

    try {
      const result = await services.settings.updateHub(hubId, body)
      return c.json(result)
    } catch {
      return c.json({ error: 'Failed to update hub' }, 500)
    }
  },
)

// Add member to hub
routes.post('/:hubId/members',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Add a member to a hub',
    responses: {
      200: {
        description: 'Member added',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('hubs:manage-members'),
  validator('json', addHubMemberBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')
    const body = c.req.valid('json')

    const pubkey = c.get('pubkey')
    try {
      const result = await services.identity.setHubRole({
        pubkey: body.pubkey,
        hubId,
        roleIds: body.roleIds,
      })
      await audit(services.audit, 'userAdded', pubkey, { target: body.pubkey, roles: body.roleIds }, undefined, hubId)
      return c.json(result)
    } catch {
      return c.json({ error: 'Failed to add member' }, 500)
    }
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
  requirePermission('hubs:manage-members'),
  async (c) => {
    const hubId = c.req.param('hubId')
    const targetPubkey = c.req.param('pubkey')
    const actorPubkey = c.get('pubkey')
    const services = c.get('services')

    try {
      await services.identity.removeHubRole({ pubkey: targetPubkey, hubId })
      await audit(services.audit, 'userRemoved', actorPubkey, { target: targetPubkey }, undefined, hubId)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Failed to remove member' }, 500)
    }
  },
)

// Delete hub (super admin only — permanent, cascades all hub data)
routes.delete('/:hubId',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Permanently delete a hub and all its data',
    responses: {
      200: {
        description: 'Hub deleted',
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
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')

    try {
      await services.settings.deleteHub(hubId)
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof ServiceError) {
        return c.json({ error: err.message }, err.status as 404 | 500)
      }
      const message = err instanceof Error ? err.message : 'Failed to delete hub'
      return c.json({ error: message }, 500)
    }
  },
)

// --- Hub Key Management ---

// Get my hub key envelope (any hub member)
routes.get('/:hubId/key',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Get hub key envelope for current user',
    responses: {
      200: {
        description: 'Hub key envelope',
        content: {
          'application/json': {
            schema: resolver(hubKeyEnvelopeResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    try {
      const { envelopes } = await services.settings.getHubKeyEnvelopes(hubId)

      // Return only the envelope for this user
      const myEnvelope = envelopes.find(e => e.pubkey === pubkey)
      if (!myEnvelope) return c.json({ error: 'No key envelope for this user' }, 404)

      return c.json({ envelope: myEnvelope })
    } catch {
      return c.json({ error: 'Hub not found' }, 404)
    }
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
  requirePermission('hubs:manage-keys'),
  validator('json', hubKeyEnvelopesBodySchema),
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')
    const body = c.req.valid('json')

    try {
      await services.settings.setHubKeyEnvelopes(hubId, body)
      return c.json({ ok: true })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      const message = err instanceof Error ? err.message : 'Failed to set hub key'
      return c.json({ error: message }, status as 404 | 500)
    }
  },
)

export default routes
