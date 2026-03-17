import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import {
  contactSchema,
  contactListResponseSchema,
  contactLookupResponseSchema,
  contactSearchResponseSchema,
  createContactBodySchema,
  updateContactBodySchema,
  listContactsQuerySchema,
} from '@protocol/schemas/contacts-v2'
import {
  contactRelationshipSchema,
  contactRelationshipListResponseSchema,
  affinityGroupSchema,
  affinityGroupListResponseSchema,
  affinityGroupWithMembersResponseSchema,
  groupMemberSchema,
  groupMemberListResponseSchema,
  createRelationshipBodySchema,
  createAffinityGroupBodySchema,
  updateAffinityGroupBodySchema,
  addGroupMemberBodySchema,
} from '@protocol/schemas/contact-relationships'
import { okResponseSchema } from '@protocol/schemas/common'
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
      200: {
        description: 'Paginated list of contacts',
        content: { 'application/json': { schema: resolver(contactListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  validator('query', listContactsQuerySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const query = c.req.valid('query')

    const result = await services.contacts.list({
      hubId,
      page: query.page,
      limit: query.limit,
      contactTypeHash: query.contactTypeHash,
    })

    return c.json(result)
  },
)

// Lookup by identifier hash (phone, Signal username, etc.)
contactsV2.get('/lookup/:identifierHash',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Lookup contact by identifier hash',
    responses: {
      200: {
        description: 'Contact or null',
        content: { 'application/json': { schema: resolver(contactLookupResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const hash = c.req.param('identifierHash')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''

    const contact = await services.contacts.lookupByIdentifierHash(hubId, hash)
    return c.json({ contact })
  },
)

// Search by name trigrams
contactsV2.get('/search',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Search contacts by name trigrams',
    responses: {
      200: {
        description: 'Matching contacts',
        content: { 'application/json': { schema: resolver(contactSearchResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const tokens = c.req.query('tokens')
    if (!tokens) return c.json({ contacts: [] })

    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const tokenList = tokens.split(',').map(t => t.trim()).filter(Boolean)

    const contacts = await services.contacts.searchByTrigramTokens(hubId, tokenList)
    return c.json({ contacts })
  },
)

// Create contact
contactsV2.post('/',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Create a new contact with encrypted profile',
    responses: {
      201: {
        description: 'Contact created',
        content: { 'application/json': { schema: resolver(contactSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:create'),
  validator('json', createContactBodySchema),
  async (c) => {
    const services = c.get('services')
    const body = c.req.valid('json')

    const contact = await services.contacts.create({
      ...body,
      hubId: c.get('hubId') ?? body.hubId,
    })

    await audit(services.audit, 'contactCreated', c.get('pubkey'), { contactId: contact.id })
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
      200: {
        description: 'List of groups',
        content: { 'application/json': { schema: resolver(affinityGroupListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const groups = await services.contacts.listGroups(hubId)
    return c.json({ groups })
  },
)

// Create group
contactsV2.post('/groups',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Create an affinity group with members',
    responses: {
      201: {
        description: 'Group created',
        content: { 'application/json': { schema: resolver(affinityGroupSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', createAffinityGroupBodySchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const group = await services.contacts.createGroup(hubId, pubkey, body)

    await audit(services.audit, 'groupCreated', pubkey, {
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
      200: {
        description: 'Group details with members',
        content: { 'application/json': { schema: resolver(affinityGroupWithMembersResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const services = c.get('services')

    const [group, members] = await Promise.all([
      services.contacts.getGroup(groupId),
      services.contacts.listMembers(groupId),
    ])

    return c.json({ ...group, members })
  },
)

// Update group
contactsV2.patch('/groups/:groupId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Update an affinity group',
    responses: {
      200: {
        description: 'Group updated',
        content: { 'application/json': { schema: resolver(affinityGroupSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', updateAffinityGroupBodySchema),
  async (c) => {
    const groupId = c.req.param('groupId')
    const services = c.get('services')
    const body = c.req.valid('json')

    const updated = await services.contacts.updateGroup(groupId, body)

    await audit(services.audit, 'groupUpdated', c.get('pubkey'), { groupId })
    return c.json(updated)
  },
)

// Delete group
contactsV2.delete('/groups/:groupId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Delete an affinity group',
    responses: {
      200: {
        description: 'Group deleted',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const services = c.get('services')

    await services.contacts.deleteGroup(groupId)

    await audit(services.audit, 'groupDeleted', c.get('pubkey'), { groupId })
    return c.json({ ok: true })
  },
)

// Add member to group
contactsV2.post('/groups/:groupId/members',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Add a member to an affinity group',
    responses: {
      201: {
        description: 'Member added',
        content: { 'application/json': { schema: resolver(groupMemberSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  validator('json', addGroupMemberBodySchema),
  async (c) => {
    const groupId = c.req.param('groupId')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.contacts.addMember(groupId, body)

    await audit(services.audit, 'groupMemberAdded', c.get('pubkey'), {
      groupId,
      contactId: body.contactId,
    })
    return c.json(result, 201)
  },
)

// Remove member from group
contactsV2.delete('/groups/:groupId/members/:contactId',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'Remove a member from an affinity group',
    responses: {
      200: {
        description: 'Member removed',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-groups'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const contactId = c.req.param('contactId')
    const services = c.get('services')

    const result = await services.contacts.removeMember(groupId, contactId)

    await audit(services.audit, 'groupMemberRemoved', c.get('pubkey'), { groupId, contactId })
    return c.json(result)
  },
)

// List members of a group
contactsV2.get('/groups/:groupId/members',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'List members of an affinity group',
    responses: {
      200: {
        description: 'List of members',
        content: { 'application/json': { schema: resolver(groupMemberListResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const groupId = c.req.param('groupId')
    const services = c.get('services')
    const members = await services.contacts.listMembers(groupId)
    return c.json({ members })
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
      200: {
        description: 'Contact updated',
        content: { 'application/json': { schema: resolver(contactSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:edit'),
  validator('json', updateContactBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const body = c.req.valid('json')

    const updated = await services.contacts.update(id, body)

    await audit(services.audit, 'contactUpdated', c.get('pubkey'), { contactId: id })
    return c.json(updated)
  },
)

// Delete contact
contactsV2.delete('/:id',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Delete a contact',
    responses: {
      200: {
        description: 'Contact deleted',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:delete'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')

    await services.contacts.delete(id)

    await audit(services.audit, 'contactDeleted', c.get('pubkey'), { contactId: id })
    return c.json({ ok: true })
  },
)

// Create a relationship between two contacts
contactsV2.post('/:id/relationships',
  describeRoute({
    tags: ['Contact Relationships'],
    summary: 'Create a relationship between two contacts',
    responses: {
      201: {
        description: 'Relationship created',
        content: { 'application/json': { schema: resolver(contactRelationshipSchema) } },
      },
      404: { description: 'Contact not found' },
      409: { description: 'Relationship already exists' },
      ...authErrors,
    },
  }),
  requirePermission('contacts:manage-relationships'),
  validator('json', createRelationshipBodySchema),
  async (c) => {
    const contactIdA = c.req.param('id')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const relationship = await services.contacts.createRelationship(
      contactIdA,
      hubId,
      pubkey,
      body,
    )

    await audit(services.audit, 'relationshipCreated', pubkey, {
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
      200: {
        description: 'Relationship deleted',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:manage-relationships'),
  async (c) => {
    const contactId = c.req.param('id')
    const relId = c.req.param('relId')
    const services = c.get('services')

    await services.contacts.deleteRelationship(contactId, relId)

    await audit(services.audit, 'relationshipDeleted', c.get('pubkey'), {
      relationshipId: relId,
      contactId,
    })
    return c.json({ ok: true })
  },
)

// List relationships for a contact (both directions)
contactsV2.get('/:id/relationships',
  describeRoute({
    tags: ['Contact Relationships'],
    summary: 'List all relationships for a contact',
    responses: {
      200: {
        description: 'List of relationships',
        content: { 'application/json': { schema: resolver(contactRelationshipListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const contactId = c.req.param('id')
    const services = c.get('services')
    const relationships = await services.contacts.listRelationships(contactId)
    return c.json({ relationships })
  },
)

// List groups a contact belongs to
contactsV2.get('/:id/groups',
  describeRoute({
    tags: ['Affinity Groups'],
    summary: 'List groups a contact belongs to',
    responses: {
      200: {
        description: 'List of groups',
        content: { 'application/json': { schema: resolver(affinityGroupListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const contactId = c.req.param('id')
    const services = c.get('services')
    const groups = await services.contacts.listGroupsForContact(contactId)
    return c.json({ groups })
  },
)

// Get single contact (MUST be last to avoid capturing literal paths)
contactsV2.get('/:id',
  describeRoute({
    tags: ['Contact Directory'],
    summary: 'Get a single contact',
    responses: {
      200: {
        description: 'Contact details',
        content: { 'application/json': { schema: resolver(contactSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('contacts:view'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const contact = await services.contacts.get(id)
    return c.json(contact)
  },
)

export default contactsV2
