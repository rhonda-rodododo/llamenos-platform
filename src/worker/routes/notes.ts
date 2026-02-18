import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { volunteerOrAdminGuard } from '../middleware/role-guard'
import { audit } from '../services/audit'

const notes = new Hono<AppEnv>()
// Only volunteers and admins can access call notes — reporters cannot
notes.use('*', volunteerOrAdminGuard)

notes.get('/', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const isAdmin = c.get('isAdmin')
  const callId = c.req.query('callId')
  const page = c.req.query('page') || '1'
  const limit = c.req.query('limit') || '50'
  const params = new URLSearchParams()
  if (callId) params.set('callId', callId)
  if (!isAdmin) params.set('author', pubkey)
  params.set('page', page)
  params.set('limit', limit)
  return dos.records.fetch(new Request(`http://do/notes?${params}`))
})

notes.post('/', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as {
    callId: string
    encryptedContent: string
    authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
    adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  }
  const res = await dos.records.fetch(new Request('http://do/notes', {
    method: 'POST',
    body: JSON.stringify({ ...body, authorPubkey: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'noteCreated', pubkey, { callId: body.callId })
  return res
})

notes.patch('/:id', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')
  const body = await c.req.json() as {
    encryptedContent: string
    authorEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
    adminEnvelope?: { encryptedNoteKey: string; ephemeralPubkey: string }
  }
  const res = await dos.records.fetch(new Request(`http://do/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, authorPubkey: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'noteEdited', pubkey, { noteId: id })
  return res
})

export default notes
