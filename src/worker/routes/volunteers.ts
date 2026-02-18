import { Hono } from 'hono'
import type { AppEnv, UserRole } from '../types'
import { getDOs } from '../lib/do-access'
import { isValidE164 } from '../lib/helpers'
import { adminGuard } from '../middleware/admin-guard'
import { audit } from '../services/audit'

const volunteers = new Hono<AppEnv>()
volunteers.use('*', adminGuard)

volunteers.get('/', async (c) => {
  const dos = getDOs(c.env)
  return dos.identity.fetch(new Request('http://do/volunteers'))
})

volunteers.post('/', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { name: string; phone: string; role: UserRole; pubkey?: string }

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
      role: body.role,
      encryptedSecretKey: '',
    }),
  }))

  if (res.ok) {
    await audit(dos.records, 'volunteerAdded', pubkey, { target: newPubkey, role: body.role })
  }

  return res
})

volunteers.patch('/:targetPubkey', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const targetPubkey = c.req.param('targetPubkey')
  const body = await c.req.json()
  const res = await dos.identity.fetch(new Request(`http://do/volunteers/${targetPubkey}?admin=true`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) {
    const data = body as Record<string, unknown>
    if (data.role) await audit(dos.records, data.role === 'admin' ? 'adminPromoted' : 'adminDemoted', pubkey, { target: targetPubkey })
    // Revoke all sessions when deactivating or changing role
    if (data.active === false || data.role) {
      await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' }))
    }
  }
  return res
})

volunteers.delete('/:targetPubkey', async (c) => {
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
