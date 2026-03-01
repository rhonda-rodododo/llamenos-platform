import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const notes = new Hono<AppEnv>()
// Require at least notes:read-own to access any notes endpoint
notes.use('*', requirePermission('notes:read-own'))

notes.get('/', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const canReadAll = checkPermission(permissions, 'notes:read-all')
  const callId = c.req.query('callId')
  const conversationId = c.req.query('conversationId')
  const contactHash = c.req.query('contactHash')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'
  const params = new URLSearchParams()
  if (callId) params.set('callId', callId)
  if (conversationId) params.set('conversationId', conversationId)
  if (contactHash) params.set('contactHash', contactHash)
  if (!canReadAll) params.set('author', pubkey)
  params.set('page', page)
  params.set('limit', limit)
  return dos.records.fetch(new Request(`http://do/notes?${params}`))
})

notes.post('/', requirePermission('notes:create'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as {
    callId?: string
    conversationId?: string
    contactHash?: string
    encryptedContent: string
    authorEnvelope?: import('@shared/types').KeyEnvelope
    adminEnvelopes?: import('@shared/types').RecipientEnvelope[]
  }
  if (!body.callId && !body.conversationId) {
    return c.json({ error: 'callId or conversationId required' }, 400)
  }
  const res = await dos.records.fetch(new Request('http://do/notes', {
    method: 'POST',
    body: JSON.stringify({ ...body, authorPubkey: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'noteCreated', pubkey, { callId: body.callId, conversationId: body.conversationId })
  return res
})

notes.patch('/:id', requirePermission('notes:update-own'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  const body = await c.req.json() as {
    encryptedContent: string
    authorEnvelope?: import('@shared/types').KeyEnvelope
    adminEnvelopes?: import('@shared/types').RecipientEnvelope[]
  }
  const res = await dos.records.fetch(new Request(`http://do/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, authorPubkey: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'noteEdited', pubkey, { noteId: id })
  return res
})

// --- Note Replies (Epic 123) ---

notes.get('/:id/replies', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const id = c.req.param('id')
  return dos.records.fetch(new Request(`http://do/notes/${id}/replies`))
})

notes.post('/:id/replies', requirePermission('notes:reply'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  const body = await c.req.json() as {
    encryptedContent: string
    readerEnvelopes: import('@shared/types').RecipientEnvelope[]
  }
  const res = await dos.records.fetch(new Request(`http://do/notes/${id}/replies`, {
    method: 'POST',
    body: JSON.stringify({ ...body, authorPubkey: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'noteReplyCreated', pubkey, { noteId: id })
  return res
})

export default notes
