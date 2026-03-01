import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const shifts = new Hono<AppEnv>()

// All authenticated users can check their shift status
shifts.get('/my-status', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  return dos.shifts.fetch(new Request(`http://do/my-status?pubkey=${pubkey}`))
})

// --- Permission-gated routes ---

shifts.get('/fallback', requirePermission('shifts:manage-fallback'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.settings.fetch(new Request('http://do/fallback'))
})

shifts.put('/fallback', requirePermission('shifts:manage-fallback'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.settings.fetch(new Request('http://do/fallback', {
    method: 'PUT',
    body: JSON.stringify(await c.req.json()),
  }))
})

shifts.get('/', requirePermission('shifts:read'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.shifts.fetch(new Request('http://do/shifts'))
})

shifts.post('/', requirePermission('shifts:create'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const res = await dos.shifts.fetch(new Request('http://do/shifts', {
    method: 'POST',
    body: JSON.stringify(await c.req.json()),
  }))
  if (res.ok) await audit(dos.records, 'shiftCreated', pubkey)
  return res
})

shifts.patch('/:id', requirePermission('shifts:update'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
  const res = await dos.shifts.fetch(new Request(`http://do/shifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(await c.req.json()),
  }))
  if (res.ok) await audit(dos.records, 'shiftEdited', pubkey, { shiftId: id })
  return res
})

shifts.delete('/:id', requirePermission('shifts:delete'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
  const res = await dos.shifts.fetch(new Request(`http://do/shifts/${id}`, { method: 'DELETE' }))
  if (res.ok) await audit(dos.records, 'shiftDeleted', pubkey, { shiftId: id })
  return res
})

export default shifts
