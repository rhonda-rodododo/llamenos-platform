import { Hono } from 'hono'
import { z } from 'zod'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { listNotesQuerySchema, createNoteBodySchema, updateNoteBodySchema, createReplyBodySchema, noteResponseSchema } from '@protocol/schemas/notes'
import { okResponseSchema, paginatedMeta } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const notes = new Hono<AppEnv>()
// Require at least notes:read-own to access any notes endpoint
notes.use('*', requirePermission('notes:read-own'))

notes.get('/',
  describeRoute({
    tags: ['Notes'],
    summary: 'List notes for the authenticated user (or all if admin)',
    responses: {
      200: {
        description: 'Paginated list of notes',
        content: {
          'application/json': {
            schema: resolver(z.object({
              notes: z.array(noteResponseSchema),
              ...paginatedMeta,
            })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('query', listNotesQuerySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const canReadAll = checkPermission(permissions, 'notes:read-all')
    const query = c.req.valid('query')

    const params = new URLSearchParams()
    if (query.callId) params.set('callId', query.callId)
    if (query.conversationId) params.set('conversationId', query.conversationId)
    if (query.contactHash) params.set('contactHash', query.contactHash)
    if (!canReadAll) params.set('author', pubkey)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))
    return dos.records.fetch(new Request(`http://do/notes?${params}`))
  },
)

notes.post('/',
  describeRoute({
    tags: ['Notes'],
    summary: 'Create a new encrypted note',
    responses: {
      201: {
        description: 'Note created',
        content: {
          'application/json': {
            schema: resolver(noteResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('notes:create'),
  validator('json', createNoteBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const res = await dos.records.fetch(new Request('http://do/notes', {
      method: 'POST',
      body: JSON.stringify({ ...body, authorPubkey: pubkey }),
    }))
    if (res.ok) {
      await audit(dos.records, 'noteCreated', pubkey, { callId: body.callId, conversationId: body.conversationId })

      // Auto-create interaction linking note to case (Epic 323)
      // createNoteBodySchema uses z.looseObject, so extra fields pass through
      const looseBody = body as Record<string, unknown>
      const caseId = looseBody.caseId as string | undefined
      const interactionTypeHash = looseBody.interactionTypeHash as string | undefined
      if (caseId && interactionTypeHash) {
        const noteData = await res.clone().json() as { id: string }
        dos.caseManager.fetch(new Request(
          `http://do/records/${caseId}/interactions`,
          {
            method: 'POST',
            headers: { 'x-pubkey': pubkey },
            body: JSON.stringify({
              interactionType: 'note',
              sourceId: noteData.id,
              interactionTypeHash,
            }),
          },
        )).catch((e) => { console.error('[notes] Failed to create case interaction:', e) })
      }
    }
    return res
  },
)

notes.patch('/:id',
  describeRoute({
    tags: ['Notes'],
    summary: 'Update an existing note',
    responses: {
      200: {
        description: 'Note updated',
        content: {
          'application/json': {
            schema: resolver(noteResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('notes:update-own'),
  validator('json', updateNoteBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const res = await dos.records.fetch(new Request(`http://do/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...body, authorPubkey: pubkey }),
    }))
    if (res.ok) await audit(dos.records, 'noteEdited', pubkey, { noteId: id })
    return res
  },
)

// --- Note Replies (Epic 123) ---

notes.get('/:id/replies',
  describeRoute({
    tags: ['Notes'],
    summary: 'List replies for a note',
    responses: {
      200: {
        description: 'List of replies',
        content: {
          'application/json': {
            schema: resolver(z.object({
              replies: z.array(noteResponseSchema),
            })),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const id = c.req.param('id')
    return dos.records.fetch(new Request(`http://do/notes/${id}/replies`))
  },
)

notes.post('/:id/replies',
  describeRoute({
    tags: ['Notes'],
    summary: 'Create a reply to a note',
    responses: {
      201: {
        description: 'Reply created',
        content: {
          'application/json': {
            schema: resolver(noteResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('notes:reply'),
  validator('json', createReplyBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const res = await dos.records.fetch(new Request(`http://do/notes/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ ...body, authorPubkey: pubkey }),
    }))
    if (res.ok) await audit(dos.records, 'noteReplyCreated', pubkey, { noteId: id })
    return res
  },
)

export default notes
