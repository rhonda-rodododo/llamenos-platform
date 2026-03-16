import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { paginationSchema } from '@protocol/schemas/common'
import { authErrors } from '../openapi/helpers'

const contacts = new Hono<AppEnv>()
contacts.use('*', requirePermission('contacts:manage'))

// GET /contacts — list contacts with note counts
contacts.get('/',
  describeRoute({
    tags: ['Contacts'],
    summary: 'List contacts with aggregated counts',
    responses: {
      200: { description: 'Paginated list of contacts' },
      ...authErrors,
    },
  }),
  validator('query', paginationSchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) })

    // Get contact data from RecordsDO (notes with contactHash)
    const notesRes = await dos.records.fetch(new Request(`http://do/contacts?${params}`))
    if (!notesRes.ok) return notesRes

    const { contacts: noteContacts, total } = await notesRes.json() as {
      contacts: { contactHash: string; firstSeen: string; lastSeen: string; noteCount: number }[]
      total: number
    }

    // Enrich with conversation data from ConversationDO
    const convRes = await dos.conversations.fetch(new Request('http://do/contacts'))
    const convData = convRes.ok
      ? await convRes.json() as { contacts: Record<string, { last4?: string; conversationCount: number; reportCount: number; firstSeen: string; lastSeen: string }> }
      : { contacts: {} }

    // Merge data
    const merged = new Map<string, {
      contactHash: string; last4?: string; firstSeen: string; lastSeen: string
      callCount: number; conversationCount: number; noteCount: number; reportCount: number
    }>()

    for (const nc of noteContacts) {
      merged.set(nc.contactHash, {
        contactHash: nc.contactHash,
        firstSeen: nc.firstSeen,
        lastSeen: nc.lastSeen,
        callCount: 0,
        conversationCount: 0,
        noteCount: nc.noteCount,
        reportCount: 0,
      })
    }

    for (const [hash, cd] of Object.entries(convData.contacts)) {
      const existing = merged.get(hash)
      if (existing) {
        existing.last4 = cd.last4
        existing.conversationCount = cd.conversationCount
        existing.reportCount = cd.reportCount
        if (cd.firstSeen < existing.firstSeen) existing.firstSeen = cd.firstSeen
        if (cd.lastSeen > existing.lastSeen) existing.lastSeen = cd.lastSeen
      } else {
        merged.set(hash, {
          contactHash: hash,
          last4: cd.last4,
          firstSeen: cd.firstSeen,
          lastSeen: cd.lastSeen,
          callCount: 0,
          conversationCount: cd.conversationCount,
          noteCount: 0,
          reportCount: cd.reportCount,
        })
      }
    }

    const contacts = Array.from(merged.values())
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())

    return c.json({ contacts, total: Math.max(total, contacts.length) })
  },
)

// GET /contacts/:hash — unified timeline for a contact
contacts.get('/:hash',
  describeRoute({
    tags: ['Contacts'],
    summary: 'Get unified timeline for a contact',
    responses: {
      200: { description: 'Notes and conversations for the contact' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const hash = c.req.param('hash')

    // Parallel fetch from RecordsDO (notes) and ConversationDO (conversations)
    const [notesRes, convsRes] = await Promise.all([
      dos.records.fetch(new Request(`http://do/contacts/${hash}`)),
      dos.conversations.fetch(new Request(`http://do/contacts/${hash}`)),
    ])

    const notes = notesRes.ok
      ? (await notesRes.json() as { notes: unknown[] }).notes
      : []

    const conversations = convsRes.ok
      ? (await convsRes.json() as { conversations: unknown[] }).conversations
      : []

    return c.json({ notes, conversations })
  },
)

export default contacts
