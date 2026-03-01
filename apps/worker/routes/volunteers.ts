import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { isValidE164 } from '../lib/helpers'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const volunteers = new Hono<AppEnv>()
volunteers.use('*', requirePermission('volunteers:read'))

volunteers.get('/', async (c) => {
  const dos = getDOs(c.env)
  return dos.identity.fetch(new Request('http://do/volunteers'))
})

volunteers.post('/', requirePermission('volunteers:create'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { name: string; phone: string; roleIds: string[]; pubkey?: string }

  if (body.phone && !isValidE164(body.phone)) {
    return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
  }

  const newPubkey = body.pubkey
  if (!newPubkey) {
    return c.json({ error: 'pubkey is required — generate keypair client-side' }, 400)
  }

  const res = await dos.identity.fetch(new Request('http://do/volunteers', {
    method: 'POST',
    body: JSON.stringify({
      pubkey: newPubkey,
      name: body.name,
      phone: body.phone,
      roles: body.roleIds || ['role-volunteer'],
      encryptedSecretKey: '',
    }),
  }))

  if (res.ok) {
    await audit(dos.records, 'volunteerAdded', pubkey, { target: newPubkey, roles: body.roleIds })
  }

  return res
})

volunteers.patch('/:targetPubkey', requirePermission('volunteers:update'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const targetPubkey = c.req.param('targetPubkey')
  const body = await c.req.json()
  const res = await dos.identity.fetch(new Request(`http://do/admin/volunteers/${targetPubkey}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) {
    const data = body as Record<string, unknown>
    if (data.roles) await audit(dos.records, 'rolesChanged', pubkey, { target: targetPubkey, roles: data.roles })
    // Revoke all sessions when deactivating or changing roles
    if (data.active === false || data.roles) {
      await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' }))
    }
  }
  return res
})

volunteers.delete('/:targetPubkey', requirePermission('volunteers:delete'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const targetPubkey = c.req.param('targetPubkey')
  // Revoke all sessions before deletion
  await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' }))
  const res = await dos.identity.fetch(new Request(`http://do/volunteers/${targetPubkey}`, { method: 'DELETE' }))
  if (res.ok) await audit(dos.records, 'volunteerRemoved', pubkey, { target: targetPubkey })
  return res
})

export default volunteers
