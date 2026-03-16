import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { createContactBodySchema, updateContactBodySchema, listContactsQuerySchema } from '@protocol/schemas/contacts-v2'
import {
  createRelationshipBodySchema,
  createAffinityGroupBodySchema,
  updateAffinityGroupBodySchema,
  addGroupMemberBodySchema,
} from '@protocol/schemas/contact-relationships'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const contactsV2 = new Hono<AppEnv>()

// =============================================
// Contact CRUD (list, lookup, search, create)
// =============================================

// List contacts (paginated, with blind index filters)
contactsV2.get('/',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'List contacts with E2EE profiles',
    responses: {
      200: { description: 'Paginated list of contacts' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  validator('query', listContactsQuerySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')
    const qs = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.contactTypeHash) qs.set('contactTypeHash', query.contactTypeHash)
    if (query.statusHash) qs.set('statusHash', query.statusHash)
    if (query.nameToken) qs.set('nameToken', query.nameToken)

    // Forward any additional blind index filters from the original query string
    const rawParams = new URL(c.req.url).searchParams
    for (const [key, value] of rawParams) {
      if (key.startsWith('field_') || (key.endsWith('Hash') && !qs.has(key))) {
        qs.set(key, value)
      }
    }

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts?${qs}`))
    return new Response(res.body, res)
  },
)

// Lookup by identifier hash (phone, Signal username, etc.)
contactsV2.get('/lookup/:identifierHash',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Lookup contact by identifier hash',
    responses: {
      200: { description: 'Contact or null' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const hash = c.req.param('identifierHash')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/lookup/${hash}`))
    return new Response(res.body, res)
  },
)

// Search by name trigrams
contactsV2.get('/search',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Search contacts by name trigrams',
    responses: {
      200: { description: 'Matching contacts' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const tokens = c.req.query('tokens')
    if (!tokens) return c.json({ contacts: [] })
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(
      new Request(`http://do/contacts/search?tokens=${encodeURIComponent(tokens)}`),
    )
    return new Response(res.body, res)
  },
)

// Create contact
contactsV2.post('/',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Create a new contact with encrypted profile',
    responses: {
      201: { description: 'Contact created' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:create'),
  validator('json', createContactBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request('http://do/contacts', {
      method: 'POST',
      body: JSON.stringify({ ...body, hubId: c.get('hubId') ?? body.hubId }),
    }))

    if (!res.ok) return new Response(res.body, res)

    const contact = await res.json() as { id: string }
    await audit(dos.records, 'contactCreated', c.get('pubkey'), { contactId: contact.id })
    return c.json(contact, 201)
  },
)

// =============================================
// Affinity Groups (must be registered BEFORE /:id to avoid capture)
// =============================================

// List all groups
contactsV2.get('/groups',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'List all affinity groups',
    responses: {
      200: { description: 'List of groups' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request('http://do/groups'))
    return new Response(res.body, res)
  },
)

// Create group
contactsV2.post('/groups',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Create an affinity group with members',
    responses: {
      201: { description: 'Group created' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', createAffinityGroupBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request('http://do/groups', {
      method: 'POST',
      headers: {
        'x-hub-id': c.get('hubId') ?? '',
        'x-pubkey': c.get('pubkey'),
      },
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    const group = await res.json() as { id: string }
    await audit(dos.records, 'groupCreated', c.get('pubkey'), {
      groupId: group.id,
      memberCount: body.members.length,
    })
    return c.json(group, 201)
  },
)

// Get group with members
contactsV2.get('/groups/:groupId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Get an affinity group with its members',
    responses: {
      200: { description: 'Group details with members' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/groups/${groupId}`))
    return new Response(res.body, res)
  },
)

// Update group
contactsV2.patch('/groups/:groupId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Update an affinity group',
    responses: {
      200: { description: 'Group updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', updateAffinityGroupBodySchema),
  async (c) => {
    const groupId = c.req.param('groupId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request(`http://do/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'groupUpdated', c.get('pubkey'), { groupId })
    return new Response(res.body, res)
  },
)

// Delete group
contactsV2.delete('/groups/:groupId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Delete an affinity group',
    responses: {
      200: { description: 'Group deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.contactDirectory.fetch(new Request(`http://do/groups/${groupId}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'groupDeleted', c.get('pubkey'), { groupId })
    return new Response(res.body, res)
  },
)

// Add member to group
contactsV2.post('/groups/:groupId/members',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Add a member to an affinity group',
    responses: {
      201: { description: 'Member added' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', addGroupMemberBodySchema),
  async (c) => {
    const groupId = c.req.param('groupId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request(`http://do/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'groupMemberAdded', c.get('pubkey'), {
      groupId,
      contactId: body.contactId,
    })
    const result = await res.json()
    return c.json(result, 201)
  },
)

// Remove member from group
contactsV2.delete('/groups/:groupId/members/:contactId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Remove a member from an affinity group',
    responses: {
      200: { description: 'Member removed' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const contactId = c.req.param('contactId')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.contactDirectory.fetch(
      new Request(`http://do/groups/${groupId}/members/${contactId}`, { method: 'DELETE' }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'groupMemberRemoved', c.get('pubkey'), { groupId, contactId })
    return new Response(res.body, res)
  },
)

// List members of a group
contactsV2.get('/groups/:groupId/members',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'List members of an affinity group',
    responses: {
      200: { description: 'List of members' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/groups/${groupId}/members`))
    return new Response(res.body, res)
  },
)

// =============================================
// Contact detail routes (/:id and sub-resources)
// Must come AFTER /groups to avoid /:id capturing "groups"
// =============================================

// Update contact
contactsV2.patch('/:id',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Update contact profile',
    responses: {
      200: { description: 'Contact updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:edit'),
  validator('json', updateContactBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'contactUpdated', c.get('pubkey'), { contactId: id })
    return new Response(res.body, res)
  },
)

// Delete contact
contactsV2.delete('/:id',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Delete a contact',
    responses: {
      200: { description: 'Contact deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:delete'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'contactDeleted', c.get('pubkey'), { contactId: id })
    return new Response(res.body, res)
  },
)

// Create a relationship between two contacts
contactsV2.post('/:id/relationships',
  describeRoute({
    tags: ['Contact Relationships'],
    summary: 'Create a relationship between two contacts',
    responses: {
      201: { description: 'Relationship created' },
      404: { description: 'Contact not found' },
      409: { description: 'Relationship already exists' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-relationships'),
  validator('json', createRelationshipBodySchema),
  async (c) => {
    const contactIdA = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${contactIdA}/relationships`, {
      method: 'POST',
      headers: {
        'x-hub-id': c.get('hubId') ?? '',
        'x-pubkey': c.get('pubkey'),
      },
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    const relationship = await res.json() as { id: string }
    await audit(dos.records, 'relationshipCreated', c.get('pubkey'), {
      relationshipId: relationship.id,
      contactIdA,
      contactIdB: body.contactIdB,
      relationshipType: body.relationshipType,
    })
    return c.json(relationship, 201)
  },
)

// Delete a relationship
contactsV2.delete('/:id/relationships/:relId',
  describeRoute({
    tags: ['Contact Relationships'],
    summary: 'Delete a relationship',
    responses: {
      200: { description: 'Relationship deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-relationships'),
  async (c) => {
    const contactId = c.req.param('id')
    const relId = c.req.param('relId')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${contactId}/relationships/${relId}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'relationshipDeleted', c.get('pubkey'), {
      relationshipId: relId,
      contactId,
    })
    return new Response(res.body, res)
  },
)

// List relationships for a contact (both directions)
contactsV2.get('/:id/relationships',
  describeRoute({
    tags: ['Contact Relationships'],
    summary: 'List all relationships for a contact',
    responses: {
      200: { description: 'List of relationships' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const contactId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${contactId}/relationships`))
    return new Response(res.body, res)
  },
)

// List groups a contact belongs to
contactsV2.get('/:id/groups',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'List groups a contact belongs to',
    responses: {
      200: { description: 'List of groups' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const contactId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${contactId}/groups`))
    return new Response(res.body, res)
  },
)

// Get single contact (MUST be last to avoid capturing literal paths)
contactsV2.get('/:id',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Get a single contact',
    responses: {
      200: { description: 'Contact details' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`))
    return new Response(res.body, res)
  },
)

export default contactsV2
