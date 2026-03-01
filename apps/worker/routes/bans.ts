import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { isValidE164 } from '../lib/helpers'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const bans = new Hono<AppEnv>()

// Any authenticated user with bans:report can report/ban
bans.post('/', requirePermission('bans:report'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { phone: string; reason: string }
  if (!isValidE164(body.phone)) {
    return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
  }
  const res = await dos.records.fetch(new Request('http://do/bans', {
    method: 'POST',
    body: JSON.stringify({ ...body, bannedBy: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'numberBanned', pubkey, { phone: body.phone })
  return res
})

bans.get('/', requirePermission('bans:read'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.records.fetch(new Request('http://do/bans'))
})

bans.post('/bulk', requirePermission('bans:bulk-create'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { phones: string[]; reason: string }
  const invalidPhones = body.phones.filter(p => !isValidE164(p))
  if (invalidPhones.length > 0) {
    return c.json({ error: `Invalid phone number(s): ${invalidPhones[0]}. Use E.164 format (e.g. +12125551234)` }, 400)
  }
  const res = await dos.records.fetch(new Request('http://do/bans/bulk', {
    method: 'POST',
    body: JSON.stringify({ ...body, bannedBy: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'numberBanned', pubkey, { count: body.phones.length, bulk: true })
  return res
})

bans.delete('/:phone', requirePermission('bans:delete'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const phone = decodeURIComponent(c.req.param('phone'))
  const res = await dos.records.fetch(new Request(`http://do/bans/${encodeURIComponent(phone)}`, { method: 'DELETE' }))
  if (res.ok) await audit(dos.records, 'numberUnbanned', pubkey, {})
  return res
})

export default bans
