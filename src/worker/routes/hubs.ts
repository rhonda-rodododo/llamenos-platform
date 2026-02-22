import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { getDOs } from '../lib/do-access'
import type { Hub } from '../../shared/types'

const routes = new Hono<AppEnv>()

// List hubs (filtered by user's membership, super admin sees all)
routes.get('/', async (c) => {
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
})

// Create hub (super admin only)
routes.post('/', requirePermission('system:manage-hubs'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { name: string; slug?: string; description?: string; phoneNumber?: string }

  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)

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
})

// Get hub details
routes.get('/:hubId', async (c) => {
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
})

// Update hub
routes.patch('/:hubId', requirePermission('system:manage-hubs'), async (c) => {
  const hubId = c.req.param('hubId')
  const dos = getDOs(c.env)
  const body = await c.req.json() as Partial<Hub>

  const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))

  if (!res.ok) return c.json({ error: 'Failed to update hub' }, 500)
  const result = await res.json()
  return c.json(result)
})

// Add member to hub
routes.post('/:hubId/members', requirePermission('volunteers:manage-roles'), async (c) => {
  const hubId = c.req.param('hubId')
  const dos = getDOs(c.env)
  const body = await c.req.json() as { pubkey: string; roleIds: string[] }

  if (!body.pubkey || !body.roleIds?.length) {
    return c.json({ error: 'pubkey and roleIds required' }, 400)
  }

  const res = await dos.identity.fetch(new Request('http://do/identity/hub-role', {
    method: 'POST',
    body: JSON.stringify({ pubkey: body.pubkey, hubId, roleIds: body.roleIds }),
  }))

  if (!res.ok) return c.json({ error: 'Failed to add member' }, 500)
  return c.json(await res.json())
})

// Remove member from hub
routes.delete('/:hubId/members/:pubkey', requirePermission('volunteers:manage-roles'), async (c) => {
  const hubId = c.req.param('hubId')
  const pubkey = c.req.param('pubkey')
  const dos = getDOs(c.env)

  const res = await dos.identity.fetch(new Request('http://do/identity/hub-role', {
    method: 'DELETE',
    body: JSON.stringify({ pubkey, hubId }),
  }))

  if (!res.ok) return c.json({ error: 'Failed to remove member' }, 500)
  return c.json({ ok: true })
})

export default routes
