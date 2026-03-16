import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv, Volunteer } from '../types'
import { getDOs, getScopedDOs, getMessagingAdapter } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import {
  createRecordBodySchema,
  updateRecordBodySchema,
  listRecordsQuerySchema,
  linkContactBodySchema,
  assignBodySchema,
  unassignBodySchema,
} from '@protocol/schemas/records'
import type { CaseRecord } from '@protocol/schemas/records'
import { createInteractionBodySchema, listInteractionsQuerySchema } from '@protocol/schemas/interactions'
import { linkReportToCaseBodySchema } from '@protocol/schemas/report-links'
import { notifyContactsBodySchema } from '@protocol/schemas/notifications'
import type { NotifyContactsResponse, NotificationResultItem } from '@protocol/schemas/notifications'
import type { EntityTypeDefinition } from '@protocol/schemas/entity-schema'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { KIND_RECORD_CREATED, KIND_RECORD_UPDATED, KIND_RECORD_ASSIGNED } from '@shared/nostr-events'
import { publishNostrEvent } from '../lib/nostr-events'
import { resolvePermissions } from '@shared/permissions'
import { determineEnvelopeRecipients } from '../lib/envelope-recipients'
import type { HubMemberInfo } from '../lib/envelope-recipients'

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
async function resolveHubMembers(
  env: AppEnv['Bindings'],
  hubId: string | undefined,
): Promise<HubMemberInfo[]> {
  const dos = getScopedDOs(env, hubId)
  const globalDOs = getDOs(env)

  // Get all role definitions
  const rolesRes = await globalDOs.settings.fetch(new Request('http://do/settings/roles'))
  const { roles: roleDefs } = await rolesRes.json() as { roles: Array<{ id: string; slug: string; permissions: string[] }> }

  // Get all volunteers (hub members)
  const volRes = await globalDOs.identity.fetch(new Request('http://do/volunteers'))
  const { volunteers } = await volRes.json() as { volunteers: Volunteer[] }

  return volunteers
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
      200: { description: 'Paginated list of records' },
      ...authErrors,
    },
  }),
  validator('query', listRecordsQuerySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const qs = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.entityTypeId) qs.set('entityTypeId', query.entityTypeId)
    if (query.parentRecordId) qs.set('parentRecordId', query.parentRecordId)

    // Scoped read: cases:read-own and cases:read-assigned both filter by pubkey
    // at the DO level (using the assignment index). The difference:
    //   - read-own: only records assigned to or created by self
    //   - read-assigned: records assigned to self or teammates with same roles
    // Both set assignedTo=pubkey to leverage the DO prefix scan index.
    if (accessLevel !== 'all') {
      qs.set('assignedTo', pubkey)
    } else if (query.assignedTo) {
      // Admin can explicitly filter by assignment
      qs.set('assignedTo', query.assignedTo)
    }

    // Forward blind index filters from the original query string
    const rawParams = new URL(c.req.url).searchParams
    for (const [key, value] of rawParams) {
      if (key.startsWith('field_') || (key.endsWith('Hash') && !qs.has(key))) {
        qs.set(key, value)
      }
    }

    const res = await dos.caseManager.fetch(new Request(`http://do/records?${qs}`))
    return new Response(res.body, res)
  },
)

// --- Lookup by case number ---
// NOTE: Must be defined BEFORE /:id to avoid Hono matching "by-number" as an id param
records.get('/by-number/:number',
  describeRoute({
    tags: ['Records'],
    summary: 'Lookup record by case number',
    responses: {
      200: { description: 'Record details' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/records/by-number/${encodeURIComponent(number)}`))
    if (!res.ok) return new Response(res.body, res)

    // If user can only see assigned records, verify assignment
    const record = await res.json() as CaseRecord
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
      200: { description: 'Envelope recipients per tier' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Fetch entity type definition
    const etRes = await dos.settings.fetch(
      new Request(`http://do/settings/entity-types/${entityTypeId}`),
    )
    if (!etRes.ok) return c.json({ error: 'Entity type not found' }, 404)
    const entityType = await etRes.json() as EntityTypeDefinition

    // Resolve hub members with permissions
    const hubMembers = await resolveHubMembers(c.env, c.get('hubId'))

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
      200: { description: 'Active records for the contact' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/by-contact/${contactId}`),
    )
    return new Response(res.body, res)
  },
)

// --- Lookup by source entity ID (must be defined BEFORE /:id to avoid Hono matching "interactions" as an id param) ---
records.get('/interactions/by-source/:sourceId',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Check if a source entity is linked to a case',
    responses: {
      200: { description: 'Source link status' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/interactions/by-source/${encodeURIComponent(sourceId)}`),
    )
    return new Response(res.body, res)
  },
)

// --- Get single record ---
records.get('/:id',
  describeRoute({
    tags: ['Records'],
    summary: 'Get a single record',
    responses: {
      200: { description: 'Record details' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
    if (!res.ok) return new Response(res.body, res)

    const record = await res.json() as CaseRecord

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
      200: { description: 'Envelope recipients per tier' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Fetch record to get entityTypeId and assignedTo
    const recordRes = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
    if (!recordRes.ok) return c.json({ error: 'Record not found' }, 404)
    const record = await recordRes.json() as CaseRecord

    // Fetch entity type definition
    const etRes = await dos.settings.fetch(
      new Request(`http://do/settings/entity-types/${record.entityTypeId}`),
    )
    if (!etRes.ok) return c.json({ error: 'Entity type not found' }, 404)
    const entityType = await etRes.json() as EntityTypeDefinition

    // Resolve hub members with permissions
    const hubMembers = await resolveHubMembers(c.env, c.get('hubId'))

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
      201: { description: 'Record created' },
      ...authErrors,
    },
  }),
  requirePermission('cases:create'),
  validator('json', createRecordBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Generate case number if entity type has numbering enabled
    let caseNumber: string | undefined
    const settingsRes = await dos.settings.fetch(
      new Request(`http://do/settings/entity-types/${body.entityTypeId}`),
    )
    if (settingsRes.ok) {
      const entityType = await settingsRes.json() as { numberPrefix?: string; numberingEnabled?: boolean }
      if (entityType.numberingEnabled && entityType.numberPrefix) {
        // Get next number from settings (SettingsDO route: POST /settings/case-number)
        const nextRes = await dos.settings.fetch(
          new Request(`http://do/settings/case-number`, {
            method: 'POST',
            body: JSON.stringify({ prefix: entityType.numberPrefix }),
          }),
        )
        if (nextRes.ok) {
          const { number: num } = await nextRes.json() as { number: string }
          caseNumber = num
        }
      }
    }

    const res = await dos.caseManager.fetch(new Request('http://do/records', {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        hubId: c.get('hubId') ?? '',
        createdBy: pubkey,
        caseNumber,
      }),
    }))

    if (!res.ok) return new Response(res.body, res)

    const record = await res.json() as CaseRecord

    // Publish Nostr event
    publishNostrEvent(c.env, KIND_RECORD_CREATED, {
      type: 'record:created',
      recordId: record.id,
      entityTypeId: record.entityTypeId,
      caseNumber: record.caseNumber,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(dos.records, 'recordCreated', pubkey, {
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
      200: { description: 'Record updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('json', updateRecordBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Check update permissions — cases:update for any, cases:update-own for own
    const canUpdateAll = checkPermission(permissions, 'cases:update')
    const canUpdateOwn = checkPermission(permissions, 'cases:update-own')

    if (!canUpdateAll && !canUpdateOwn) {
      return c.json({ error: 'Forbidden', required: 'cases:update-own' }, 403)
    }

    // If only own update, verify ownership or assignment
    if (!canUpdateAll) {
      const getRes = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
      if (!getRes.ok) return new Response(getRes.body, getRes)

      const existing = await getRes.json() as CaseRecord
      if (existing.createdBy !== pubkey && !existing.assignedTo.includes(pubkey)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}`, {
      method: 'PATCH',
      headers: { 'x-pubkey': pubkey },
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    // Publish update event
    publishNostrEvent(c.env, KIND_RECORD_UPDATED, {
      type: 'record:updated',
      recordId: id,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(dos.records, 'recordUpdated', pubkey, { recordId: id })

    return new Response(res.body, res)
  },
)

// --- Delete record ---
records.delete('/:id',
  describeRoute({
    tags: ['Records'],
    summary: 'Delete a case record',
    responses: {
      200: { description: 'Record deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:delete'),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'recordDeleted', pubkey, { recordId: id })

    return new Response(res.body, res)
  },
)

// --- Link contact to record ---
records.post('/:id/contacts',
  describeRoute({
    tags: ['Records'],
    summary: 'Link a contact to a record with a role',
    responses: {
      201: { description: 'Contact linked' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  validator('json', linkContactBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ ...body, addedBy: pubkey }),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'recordContactLinked', pubkey, {
      recordId: id,
      contactId: body.contactId,
      role: body.role,
    })

    return new Response(res.body, { status: 201, headers: res.headers })
  },
)

// --- Unlink contact from record ---
records.delete('/:id/contacts/:contactId',
  describeRoute({
    tags: ['Records'],
    summary: 'Unlink a contact from a record',
    responses: {
      200: { description: 'Contact unlinked' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  async (c) => {
    const id = c.req.param('id')
    const contactId = c.req.param('contactId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}/contacts/${contactId}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'recordContactUnlinked', pubkey, {
      recordId: id,
      contactId,
    })

    return new Response(res.body, res)
  },
)

// --- List contacts linked to a record ---
records.get('/:id/contacts',
  describeRoute({
    tags: ['Records'],
    summary: 'List contacts linked to a record',
    responses: {
      200: { description: 'Linked contacts' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}/contacts`))
    return new Response(res.body, res)
  },
)

// --- Suggest assignees (Epic 342) ---
records.get('/:id/suggest-assignees',
  describeRoute({
    tags: ['Records'],
    summary: 'Get ranked volunteer suggestions for case assignment',
    responses: {
      200: { description: 'Assignment suggestions' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // 1. Get the record to check entity type and current assignments
    const recordRes = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
    if (!recordRes.ok) return new Response(recordRes.body, recordRes)
    const record = await recordRes.json() as {
      entityTypeId: string
      assignedTo: string[]
      languageNeed?: string
    }

    // 2. Get on-shift volunteers
    const shiftRes = await dos.shifts.fetch(new Request('http://do/current-volunteers'))
    const { pubkeys: onShiftPubkeys } = shiftRes.ok
      ? await shiftRes.json() as { pubkeys: string[] }
      : { pubkeys: [] as string[] }

    // 3. Get all volunteer profiles
    const volRes = await dos.identity.fetch(new Request('http://do/volunteers'))
    const { volunteers } = volRes.ok
      ? await volRes.json() as { volunteers: Array<{
          pubkey: string
          active: boolean
          onBreak: boolean
          spokenLanguages?: string[]
          specializations?: string[]
          maxCaseAssignments?: number
        }> }
      : { volunteers: [] as Array<{ pubkey: string; active: boolean; onBreak: boolean; spokenLanguages?: string[]; specializations?: string[]; maxCaseAssignments?: number }> }

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

    for (const vol of volunteers) {
      if (!vol.active) continue
      if (vol.onBreak) continue
      if (!onShiftSet.has(vol.pubkey)) continue
      if (alreadyAssigned.has(vol.pubkey)) continue

      // Get workload
      const countRes = await dos.caseManager.fetch(
        new Request(`http://do/records/count-by-assignment/${vol.pubkey}`),
      )
      const { count: activeCaseCount } = countRes.ok
        ? await countRes.json() as { count: number }
        : { count: 0 }

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
      const languageNeed = record.languageNeed ?? c.req.query('language')
      if (languageNeed && vol.spokenLanguages?.includes(languageNeed)) {
        score += 15
        reasons.push(`Speaks ${languageNeed}`)
      }

      // Specialization match (0-10 points)
      // Map entity type categories to specialization tags
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
      200: { description: 'Volunteers assigned' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  validator('json', assignBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    // Publish assignment event
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:assigned',
      recordId: id,
      pubkeys: body.pubkeys,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(dos.records, 'recordAssigned', pubkey, {
      recordId: id,
      assignedPubkeys: body.pubkeys,
    })

    return new Response(res.body, res)
  },
)

// --- Unassign volunteer ---
records.post('/:id/unassign',
  describeRoute({
    tags: ['Records'],
    summary: 'Unassign a volunteer from a record',
    responses: {
      200: { description: 'Volunteer unassigned' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:assign'),
  validator('json', unassignBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/records/${id}/unassign`, {
      method: 'POST',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    // Publish assignment change event
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:unassigned',
      recordId: id,
      pubkey: body.pubkey,
    }).catch((e) => { console.error('[records] Failed to publish event:', e) })

    await audit(dos.records, 'recordUnassigned', pubkey, {
      recordId: id,
      unassignedPubkey: body.pubkey,
    })

    return new Response(res.body, res)
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
      200: { description: 'Paginated list of interactions' },
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

    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')

    const qs = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.interactionTypeHash) qs.set('interactionTypeHash', query.interactionTypeHash)
    if (query.after) qs.set('after', query.after)
    if (query.before) qs.set('before', query.before)

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/interactions?${qs}`),
    )
    return new Response(res.body, res)
  },
)

// --- Create interaction on a case ---
records.post('/:id/interactions',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Create an interaction on a case',
    responses: {
      201: { description: 'Interaction created' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('json', createInteractionBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Check update permissions
    const canUpdateAll = checkPermission(permissions, 'cases:update')
    const canUpdateOwn = checkPermission(permissions, 'cases:update-own')

    if (!canUpdateAll && !canUpdateOwn) {
      return c.json({ error: 'Forbidden', required: 'cases:update-own' }, 403)
    }

    // If only own update, verify ownership or assignment
    if (!canUpdateAll) {
      const getRes = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
      if (!getRes.ok) return new Response(getRes.body, getRes)

      const existing = await getRes.json() as CaseRecord
      if (existing.createdBy !== pubkey && !existing.assignedTo.includes(pubkey)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = c.req.valid('json')
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/interactions`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify(body),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'interactionCreated', pubkey, {
      caseId: id,
      interactionType: body.interactionType,
    })

    return new Response(res.body, { status: 201, headers: res.headers })
  },
)

// --- Delete interaction ---
records.delete('/:id/interactions/:interactionId',
  describeRoute({
    tags: ['Interactions'],
    summary: 'Delete an interaction from a case',
    responses: {
      200: { description: 'Interaction deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:update'),
  async (c) => {
    const id = c.req.param('id')
    const interactionId = c.req.param('interactionId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/interactions/${interactionId}`, {
        method: 'DELETE',
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'interactionDeleted', pubkey, {
      caseId: id,
      interactionId,
    })

    return new Response(res.body, res)
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
      201: { description: 'Report linked' },
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
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify(body),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'reportLinkedToCase', pubkey, {
      caseId: id,
      reportId: body.reportId,
    })

    return new Response(res.body, { ...res, status: 201 })
  },
)

// --- Unlink report from record ---
records.delete('/:id/reports/:reportId',
  describeRoute({
    tags: ['Records'],
    summary: 'Unlink a report from a case record',
    responses: {
      200: { description: 'Report unlinked' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  async (c) => {
    const id = c.req.param('id')
    const reportId = c.req.param('reportId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports/${reportId}`, { method: 'DELETE' }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'reportUnlinkedFromCase', pubkey, {
      caseId: id,
      reportId,
    })

    return new Response(res.body, res)
  },
)

// --- List reports linked to a record ---
records.get('/:id/reports',
  describeRoute({
    tags: ['Records'],
    summary: 'List reports linked to a case record',
    responses: {
      200: { description: 'Linked reports' },
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
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${id}/reports`),
    )
    return new Response(res.body, res)
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
 */
records.post('/:id/notify-contacts',
  describeRoute({
    tags: ['Records', 'Notifications'],
    summary: 'Send notifications to support contacts for a record',
    responses: {
      200: { description: 'Notification dispatch results' },
      ...authErrors,
      404: { description: 'Record not found' },
    },
  }),
  requirePermission('cases:update'),
  validator('json', notifyContactsBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Verify record exists
    const recordRes = await dos.caseManager.fetch(new Request(`http://do/records/${id}`))
    if (!recordRes.ok) {
      return c.json({ error: 'Record not found' }, 404)
    }

    const results: NotificationResultItem[] = []

    for (const recipient of body.recipients) {
      try {
        const adapter = await getMessagingAdapter(recipient.channel, dos, c.env.HMAC_SECRET)
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

    await audit(dos.records, 'contactsNotified', pubkey, {
      recordId: id,
      notified,
      skipped,
    })

    return c.json(response)
  },
)

export default records
