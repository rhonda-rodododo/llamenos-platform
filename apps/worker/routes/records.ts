import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv, User } from '../types'
import { getMessagingAdapterFromService } from '../lib/service-factories'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import {
  createRecordBodySchema,
  updateRecordBodySchema,
  listRecordsQuerySchema,
  linkContactBodySchema,
  assignBodySchema,
  unassignBodySchema,
  recordSchema,
  recordListResponseSchema,
  recordContactSchema,
  recordContactListResponseSchema,
  envelopeRecipientsResponseSchema,
  suggestAssigneesResponseSchema,
  recordsByContactResponseSchema,
} from '@protocol/schemas/records'
import type { CaseRecord } from '@protocol/schemas/records'
import { createInteractionBodySchema, listInteractionsQuerySchema, caseInteractionSchema, interactionListResponseSchema, sourceInteractionLookupResponseSchema } from '@protocol/schemas/interactions'
import { linkReportToCaseBodySchema, reportCaseLinkSchema, reportCaseLinkListResponseSchema } from '@protocol/schemas/report-links'
import { notifyContactsBodySchema } from '@protocol/schemas/notifications'
import type { NotifyContactsResponse, NotificationResultItem } from '@protocol/schemas/notifications'
import { notifyContactsResponseSchema } from '@protocol/schemas/notifications'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { KIND_RECORD_CREATED, KIND_RECORD_UPDATED, KIND_RECORD_ASSIGNED } from '@shared/nostr-events'
import { publishNostrEvent } from '../lib/nostr-events'
import { resolvePermissions } from '@shared/permissions'
import { determineEnvelopeRecipients } from '../lib/envelope-recipients'
import type { HubMemberInfo } from '../lib/envelope-recipients'
import type { Services } from '../services'

const records = new Hono<AppEnv>()

// --- Helper: determine the caller's access level from permissions ---
function getAccessLevel(permissions: string[]): 'all' | 'assigned' | 'own' | null {
  if (checkPermission(permissions, 'cases:read-all')) return 'all'
  if (checkPermission(permissions, 'cases:read-assigned')) return 'assigned'
  if (checkPermission(permissions, 'cases:read-own')) return 'own'
  return null
}

/**
 * Resolve hub members with their role slugs and permissions
 * for envelope recipient determination.
 */
async function resolveHubMembers(services: Services): Promise<HubMemberInfo[]> {
  // Get all role definitions
  const { roles: roleDefs } = await services.settings.getRoles()

  // Get all users (hub members)
  const { users: allUsers } = await services.identity.getUsers()

  return allUsers
    .filter(v => v.active)
    .map(v => {
      const resolvedPerms = resolvePermissions(v.roles, roleDefs as import('@shared/permissions').Role[])
      const roleSlugs = v.roles
        .map(roleId => roleDefs.find(r => r.id === roleId)?.slug)
        .filter((s): s is string => !!s)
      return {
        pubkey: v.pubkey,
        roles: roleSlugs,
        permissions: resolvedPerms,
      }
    })
}

// --- List records (paginated, with filters) ---
records.get('/',
  describeRoute({
    tags: ['Records'],
    summary: 'List case records with pagination and filters',
    responses: {
      200: {
        description: 'Paginated list of records',
        content: {
          'application/json': {
            schema: resolver(recordListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('query', listRecordsQuerySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const query = c.req.valid('query')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const listInput: Parameters<typeof services.cases.list>[0] = {
      hubId,
      page: query.page,
      limit: query.limit,
      entityTypeId: query.entityTypeId,
      parentRecordId: query.parentRecordId,
    }

    // Scoped read: non-admin users filter by assignment
    if (accessLevel !== 'all') {
      listInput.assignedTo = pubkey
    } else if (query.assignedTo) {
      listInput.assignedTo = query.assignedTo
    }

    const result = await services.cases.list(listInput)
    return c.json(result)
  },
)

// --- Lookup by case number ---
// NOTE: Must be defined BEFORE /:id to avoid Hono matching "by-number" as an id param
records.get('/by-number/:number',
  describeRoute({
    tags: ['Records'],
    summary: 'Lookup record by case number',
    responses: {
      200: {
        description: 'Record details',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const number = c.req.param('number')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const record = await services.cases.getByNumber(number)

    // If user can only see assigned records, verify assignment
    if (accessLevel !== 'all') {
      const pubkey = c.get('pubkey')
      if (!record.assignedTo.includes(pubkey) && record.createdBy !== pubkey) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    return c.json(record)
  },
)

// --- Envelope recipients for a record ---
records.get('/envelope-recipients',
  describeRoute({
    tags: ['Records'],
    summary: 'Get envelope recipient pubkeys for a new record (by entity type)',
    responses: {
      200: {
        description: 'Envelope recipients per tier',
        content: {
          'application/json': {
            schema: resolver(envelopeRecipientsResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const permissions = c.get('permissions')
    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const entityTypeId = c.req.query('entityTypeId')
    if (!entityTypeId) {
      return c.json({ error: 'entityTypeId query parameter required' }, 400)
    }

    const services = c.get('services')

    // Fetch entity type definition
    const entityType = await services.settings.getEntityTypeById(entityTypeId)

    // Resolve hub members with permissions
    const hubMembers = await resolveHubMembers(services)

    // assignedTo from query (for existing records) or empty for new records
    const assignedToParam = c.req.query('assignedTo')
    const assignedTo = assignedToParam ? assignedToParam.split(',') : []

    const recipients = determineEnvelopeRecipients(entityType, assignedTo, hubMembers)
    return c.json(recipients)
  },
)

// --- List active records linked to a contact (Epic 326 — screen pop) ---
// Must be defined BEFORE /:id to avoid Hono matching "by-contact" as an id param
records.get('/by-contact/:contactId',
  describeRoute({
    tags: ['Records'],
    summary: 'List active (non-closed) records linked to a contact',
    responses: {
      200: {
        description: 'Active records for the contact',
        content: {
          'application/json': {
            schema: resolver(recordsByContactResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const contactId = c.req.param('contactId')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const result = await services.cases.listByContact(contactId)
    return c.json(result)
  },
)

// --- Lookup by source entity ID (must be defined BEFORE /:id to avoid Hono matching "interactions" as an id param) ---
records.get('/interactions/by-source/:sourceId',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Check if a source entity is linked to a case',
    responses: {
      200: {
        description: 'Source link status',
        content: {
          'application/json': {
            schema: resolver(sourceInteractionLookupResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const sourceId = c.req.param('sourceId')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const result = await services.cases.getBySource(sourceId)
    return c.json(result)
  },
)

// --- Get single record ---
records.get('/:id',
  describeRoute({
    tags: ['Records'],
    summary: 'Get a single record',
    responses: {
      200: {
        description: 'Record details',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const record = await services.cases.get(id)

    // Non-admin users can only see records assigned to them or created by them
    if (accessLevel !== 'all') {
      if (!record.assignedTo.includes(pubkey) && record.createdBy !== pubkey) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    return c.json(record)
  },
)

// --- Envelope recipients for an existing record ---
records.get('/:id/envelope-recipients',
  describeRoute({
    tags: ['Records'],
    summary: 'Get envelope recipient pubkeys for an existing record',
    responses: {
      200: {
        description: 'Envelope recipients per tier',
        content: {
          'application/json': {
            schema: resolver(envelopeRecipientsResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const id = c.req.param('id')
    const permissions = c.get('permissions')
    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')

    // Fetch record to get entityTypeId and assignedTo
    const record = await services.cases.get(id)
    if (!record.entityTypeId) {
      return c.json({ error: 'Record has no entity type' }, 400)
    }

    // Fetch entity type definition
    const entityType = await services.settings.getEntityTypeById(record.entityTypeId)

    // Resolve hub members with permissions
    const hubMembers = await resolveHubMembers(services)

    const recipients = determineEnvelopeRecipients(entityType, record.assignedTo, hubMembers)
    return c.json(recipients)
  },
)

// --- Create record ---
records.post('/',
  describeRoute({
    tags: ['Records'],
    summary: 'Create a new case record',
    responses: {
      201: {
        description: 'Record created',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:create'),
  validator('json', createRecordBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    // Generate case number if entity type has numbering enabled
    let caseNumber: string | undefined
    try {
      const entityType = await services.settings.getEntityTypeById(body.entityTypeId)
      if (entityType.numberingEnabled && entityType.numberPrefix) {
        const result = await services.settings.generateCaseNumber({
          prefix: entityType.numberPrefix,
          hubId: c.get('hubId') ?? '',
        })
        caseNumber = result.number
      }
    } catch {
      // Entity type not found — proceed without case number
    }

    const record = await services.cases.create({
      ...body,
      hubId: c.get('hubId') ?? '',
      createdBy: pubkey,
      caseNumber,
    })

    // Publish Nostr event
    publishNostrEvent(c.env, KIND_RECORD_CREATED, {
      type: 'record:created',
      recordId: record.id,
      entityTypeId: record.entityTypeId,
      caseNumber: record.caseNumber,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(services.audit, 'recordCreated', pubkey, {
      recordId: record.id,
      entityTypeId: record.entityTypeId,
      caseNumber: record.caseNumber,
    })

    return c.json(record, 201)
  },
)

// --- Update record ---
records.patch('/:id',
  describeRoute({
    tags: ['Records'],
    summary: 'Update a case record',
    responses: {
      200: {
        description: 'Record updated',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('json', updateRecordBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const services = c.get('services')

    // Check update permissions — cases:update for any, cases:update-own for own
    const canUpdateAll = checkPermission(permissions, 'cases:update')
    const canUpdateOwn = checkPermission(permissions, 'cases:update-own')

    if (!canUpdateAll && !canUpdateOwn) {
      return c.json({ error: 'Forbidden', required: 'cases:update-own' }, 403)
    }

    // If only own update, verify ownership or assignment
    if (!canUpdateAll) {
      const existing = await services.cases.get(id)
      if (existing.createdBy !== pubkey && !existing.assignedTo.includes(pubkey)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = c.req.valid('json')
    const updated = await services.cases.update(id, { ...body, authorPubkey: pubkey })

    // Publish update event
    publishNostrEvent(c.env, KIND_RECORD_UPDATED, {
      type: 'record:updated',
      recordId: id,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(services.audit, 'recordUpdated', pubkey, { recordId: id })

    return c.json(updated)
  },
)

// --- Delete record ---
records.delete('/:id',
  describeRoute({
    tags: ['Records'],
    summary: 'Delete a case record',
    responses: {
      200: {
        description: 'Record deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:delete'),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.cases.delete(id)

    await audit(services.audit, 'recordDeleted', pubkey, { recordId: id })

    return c.json({ ok: true })
  },
)

// --- Link contact to record ---
records.post('/:id/contacts',
  describeRoute({
    tags: ['Records'],
    summary: 'Link a contact to a record with a role',
    responses: {
      201: {
        description: 'Contact linked',
        content: {
          'application/json': {
            schema: resolver(recordContactSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  validator('json', linkContactBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.linkContact(id, body.contactId, body.role, pubkey)

    await audit(services.audit, 'recordContactLinked', pubkey, {
      recordId: id,
      contactId: body.contactId,
      role: body.role,
    })

    return c.json(result, 201)
  },
)

// --- Unlink contact from record ---
records.delete('/:id/contacts/:contactId',
  describeRoute({
    tags: ['Records'],
    summary: 'Unlink a contact from a record',
    responses: {
      200: {
        description: 'Contact unlinked',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  async (c) => {
    const id = c.req.param('id')
    const contactId = c.req.param('contactId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.cases.unlinkContact(id, contactId)

    await audit(services.audit, 'recordContactUnlinked', pubkey, {
      recordId: id,
      contactId,
    })

    return c.json({ ok: true })
  },
)

// --- List contacts linked to a record ---
records.get('/:id/contacts',
  describeRoute({
    tags: ['Records'],
    summary: 'List contacts linked to a record',
    responses: {
      200: {
        description: 'Linked contacts',
        content: {
          'application/json': {
            schema: resolver(recordContactListResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const id = c.req.param('id')
    const permissions = c.get('permissions')

    const canRead = checkPermission(permissions, 'cases:read-all')
      || checkPermission(permissions, 'cases:read-assigned')
      || checkPermission(permissions, 'cases:read-own')

    if (!canRead) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const contacts = await services.cases.listContacts(id)
    return c.json({ contacts })
  },
)

// --- Suggest assignees (Epic 342) ---
records.get('/:id/suggest-assignees',
  describeRoute({
    tags: ['Records'],
    summary: 'Get ranked volunteer suggestions for case assignment',
    responses: {
      200: {
        description: 'Assignment suggestions',
        content: {
          'application/json': {
            schema: resolver(suggestAssigneesResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''

    // 1. Get the record to check entity type and current assignments
    const record = await services.cases.get(id)

    // 2. Get on-shift volunteers
    const onShiftPubkeys = await services.shifts.getCurrentVolunteers(hubId)

    // 3. Get all user profiles
    const { users: allUsers } = await services.identity.getUsers()

    const onShiftSet = new Set(onShiftPubkeys)
    const alreadyAssigned = new Set(record.assignedTo)

    // 4. Score each eligible volunteer
    const suggestions: Array<{
      pubkey: string
      score: number
      reasons: string[]
      activeCaseCount: number
      maxCases: number
    }> = []

    for (const vol of allUsers) {
      if (!vol.active) continue
      if (vol.onBreak) continue
      if (!onShiftSet.has(vol.pubkey)) continue
      if (alreadyAssigned.has(vol.pubkey)) continue

      // Get workload
      const { count: activeCaseCount } = await services.cases.countByAssignment(vol.pubkey)

      const maxCases = vol.maxCaseAssignments ?? 0
      if (maxCases > 0 && activeCaseCount >= maxCases) continue

      let score = 50 // Base score
      const reasons: string[] = ['On shift']

      // Workload score: lower workload = higher score (0-30 points)
      const effectiveMax = maxCases > 0 ? maxCases : 20
      const utilization = activeCaseCount / effectiveMax
      score += Math.round((1 - utilization) * 30)
      reasons.push(`${activeCaseCount}/${effectiveMax} cases`)

      // Language match (0-15 points)
      const languageNeed = c.req.query('language')
      if (languageNeed && vol.spokenLanguages?.includes(languageNeed)) {
        score += 15
        reasons.push(`Speaks ${languageNeed}`)
      }

      // Specialization match (0-10 points)
      if (vol.specializations?.length) {
        score += 5
        reasons.push('Has specializations')
      }

      suggestions.push({
        pubkey: vol.pubkey,
        score,
        reasons,
        activeCaseCount,
        maxCases: effectiveMax,
      })
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score)

    return c.json({ suggestions })
  },
)

// --- Assign volunteers ---
records.post('/:id/assign',
  describeRoute({
    tags: ['Records'],
    summary: 'Assign volunteers to a record',
    responses: {
      200: {
        description: 'Volunteers assigned',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  validator('json', assignBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.assign(id, body.pubkeys)

    // Publish assignment event
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:assigned',
      recordId: id,
      pubkeys: body.pubkeys,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(services.audit, 'recordAssigned', pubkey, {
      recordId: id,
      assignedPubkeys: body.pubkeys,
    })

    return c.json(result)
  },
)

// --- Unassign volunteer ---
records.post('/:id/unassign',
  describeRoute({
    tags: ['Records'],
    summary: 'Unassign a volunteer from a record',
    responses: {
      200: {
        description: 'Volunteer unassigned',
        content: {
          'application/json': {
            schema: resolver(recordSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  validator('json', unassignBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.unassign(id, body.pubkey)

    // Publish assignment change event
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:unassigned',
      recordId: id,
      pubkey: body.pubkey,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(services.audit, 'recordUnassigned', pubkey, {
      recordId: id,
      unassignedPubkey: body.pubkey,
    })

    return c.json(result)
  },
)

// ============================================================
// Interaction Routes (Epic 323)
// ============================================================

// --- List interactions for a case ---
records.get('/:id/interactions',
  describeRoute({
    tags: ['Interactions'],
    summary: 'List interactions for a case (chronological timeline)',
    responses: {
      200: {
        description: 'Paginated list of interactions',
        content: {
          'application/json': {
            schema: resolver(interactionListResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('query', listInteractionsQuerySchema),
  async (c) => {
    const id = c.req.param('id')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const query = c.req.valid('query')

    const result = await services.cases.listInteractions({
      caseId: id,
      page: query.page,
      limit: query.limit,
      interactionTypeHash: query.interactionTypeHash,
      after: query.after,
      before: query.before,
    })

    return c.json(result)
  },
)

// --- Create interaction on a case ---
records.post('/:id/interactions',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Create an interaction on a case',
    responses: {
      201: {
        description: 'Interaction created',
        content: {
          'application/json': {
            schema: resolver(caseInteractionSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('json', createInteractionBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const services = c.get('services')

    // Check update permissions
    const canUpdateAll = checkPermission(permissions, 'cases:update')
    const canUpdateOwn = checkPermission(permissions, 'cases:update-own')

    if (!canUpdateAll && !canUpdateOwn) {
      return c.json({ error: 'Forbidden', required: 'cases:update-own' }, 403)
    }

    // If only own update, verify ownership or assignment
    if (!canUpdateAll) {
      const existing = await services.cases.get(id)
      if (existing.createdBy !== pubkey && !existing.assignedTo.includes(pubkey)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = c.req.valid('json')
    const interaction = await services.cases.createInteraction(id, pubkey, body)

    await audit(services.audit, 'interactionCreated', pubkey, {
      caseId: id,
      interactionType: body.interactionType,
    })

    return c.json(interaction, 201)
  },
)

// --- Delete interaction ---
records.delete('/:id/interactions/:interactionId',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Delete an interaction from a case',
    responses: {
      200: {
        description: 'Interaction deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:update'),
  async (c) => {
    const id = c.req.param('id')
    const interactionId = c.req.param('interactionId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.cases.deleteInteraction(id, interactionId)

    await audit(services.audit, 'interactionDeleted', pubkey, {
      caseId: id,
      interactionId,
    })

    return c.json({ ok: true })
  },
)

// ============================================================
// Report-Case Link Routes (Epic 324)
// ============================================================

// --- Link report to record ---
records.post('/:id/reports',
  describeRoute({
    tags: ['Records'],
    summary: 'Link a report to a case record',
    responses: {
      201: {
        description: 'Report linked',
        content: {
          'application/json': {
            schema: resolver(reportCaseLinkSchema),
          },
        },
      },
      409: { description: 'Already linked' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  validator('json', linkReportToCaseBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.linkReportCase(id, body.reportId, pubkey)

    await audit(services.audit, 'reportLinkedToCase', pubkey, {
      caseId: id,
      reportId: body.reportId,
    })

    return c.json(result, 201)
  },
)

// --- Unlink report from record ---
records.delete('/:id/reports/:reportId',
  describeRoute({
    tags: ['Records'],
    summary: 'Unlink a report from a case record',
    responses: {
      200: {
        description: 'Report unlinked',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  async (c) => {
    const id = c.req.param('id')
    const reportId = c.req.param('reportId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.cases.unlinkReportCase(id, reportId)

    await audit(services.audit, 'reportUnlinkedFromCase', pubkey, {
      caseId: id,
      reportId,
    })

    return c.json({ ok: true })
  },
)

// --- List reports linked to a record ---
records.get('/:id/reports',
  describeRoute({
    tags: ['Records'],
    summary: 'List reports linked to a case record',
    responses: {
      200: {
        description: 'Linked reports',
        content: {
          'application/json': {
            schema: resolver(reportCaseLinkListResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const permissions = c.get('permissions')

    const canRead = checkPermission(permissions, 'cases:read-all')
      || checkPermission(permissions, 'cases:read-assigned')
      || checkPermission(permissions, 'cases:read-own')

    if (!canRead) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.cases.listCaseReports(id)
    return c.json(result)
  },
)

// ============================================================
// Notification Routes (Epic 327)
// ============================================================

/**
 * POST /records/:id/notify-contacts
 *
 * Dispatch notifications to support contacts for a record.
 * The client resolves recipients and renders messages (E2EE constraint --
 * the server cannot decrypt contact profiles). The server dispatches
 * pre-rendered messages via the appropriate MessagingAdapter.
 *
 * Requires cases:update permission.
 *
 * NOTE: getMessagingAdapter still uses DO stubs internally — this will be
 * migrated when MessagingAdapter is refactored to use services.
 */
records.post('/:id/notify-contacts',
  describeRoute({
    tags: ['Records', 'Notifications'],
    summary: 'Send notifications to support contacts for a record',
    responses: {
      200: {
        description: 'Notification dispatch results',
        content: {
          'application/json': {
            schema: resolver(notifyContactsResponseSchema),
          },
        },
      },
      ...authErrors,
      404: { description: 'Record not found' },
    },
  }),
  requirePermission('cases:update'),
  validator('json', notifyContactsBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    // Verify record exists (throws ServiceError 404 if not)
    await services.cases.get(id)

    const results: NotificationResultItem[] = []

    for (const recipient of body.recipients) {
      try {
        const adapter = await getMessagingAdapterFromService(recipient.channel, services.settings, c.env.HMAC_SECRET)
        const sendResult = await adapter.sendMessage({
          recipientIdentifier: recipient.identifier,
          body: recipient.message,
          conversationId: `notify-${id}-${Date.now()}`,
        })
        results.push({
          identifier: recipient.identifier,
          channel: recipient.channel,
          success: sendResult.success,
          error: sendResult.error,
        })
      } catch (err) {
        results.push({
          identifier: recipient.identifier,
          channel: recipient.channel,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const notified = results.filter(r => r.success).length
    const skipped = results.filter(r => !r.success).length

    const response: NotifyContactsResponse = {
      recordId: id,
      notified,
      skipped,
      results,
    }

    await audit(services.audit, 'contactsNotified', pubkey, {
      recordId: id,
      notified,
      skipped,
    })

    return c.json(response)
  },
)

export default records
