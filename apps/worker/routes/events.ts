import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import {
  createEventBodySchema,
  updateEventBodySchema,
  listEventsQuerySchema,
  linkRecordToEventBodySchema,
  linkReportToEventBodySchema,
} from '@protocol/schemas/events'
import type { Event } from '@protocol/schemas/events'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { KIND_RECORD_CREATED, KIND_RECORD_UPDATED } from '@shared/nostr-events'
import { publishNostrEvent } from '../lib/nostr-events'

const events = new Hono<AppEnv>()

// --- List events (paginated, with filters) ---
events.get('/',
  describeRoute({
    tags: ['Events'],
    summary: 'List events with pagination and filters',
    responses: {
      200: { description: 'Paginated list of events' },
      ...authErrors,
    },
  }),
  validator('query', listEventsQuerySchema),
  requirePermission('events:read'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')

    const qs = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.eventTypeHash) qs.set('eventTypeHash', query.eventTypeHash)
    if (query.statusHash) qs.set('statusHash', query.statusHash)
    if (query.parentEventId) qs.set('parentEventId', query.parentEventId)
    if (query.startAfter) qs.set('startAfter', query.startAfter)
    if (query.startBefore) qs.set('startBefore', query.startBefore)

    // Forward blind index filters from the original query string
    const rawParams = new URL(c.req.url).searchParams
    for (const [key, value] of rawParams) {
      if (key.startsWith('field_') || (key.endsWith('Hash') && !qs.has(key))) {
        qs.set(key, value)
      }
    }

    const res = await dos.caseManager.fetch(new Request(`http://do/events?${qs}`))
    return new Response(res.body, res)
  },
)

// --- Get single event ---
events.get('/:id',
  describeRoute({
    tags: ['Events'],
    summary: 'Get a single event',
    responses: {
      200: { description: 'Event details' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:read'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}`))
    return new Response(res.body, res)
  },
)

// --- Create event ---
events.post('/',
  describeRoute({
    tags: ['Events'],
    summary: 'Create a new event',
    responses: {
      201: { description: 'Event created' },
      ...authErrors,
    },
  }),
  requirePermission('events:create'),
  validator('json', createEventBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Generate case number if entity type has numbering enabled
    let caseNumber: string | undefined
    const settingsRes = await dos.settings.fetch(
      new Request(`http://do/settings/cms/entity-types/${body.entityTypeId}`),
    )
    if (settingsRes.ok) {
      const entityType = await settingsRes.json() as { numberPrefix?: string; numberingEnabled?: boolean }
      if (entityType.numberingEnabled && entityType.numberPrefix) {
        const nextRes = await dos.settings.fetch(
          new Request(`http://do/settings/cms/case-number/next`, {
            method: 'POST',
            body: JSON.stringify({ entityTypeId: body.entityTypeId }),
          }),
        )
        if (nextRes.ok) {
          const { caseNumber: num } = await nextRes.json() as { caseNumber: string }
          caseNumber = num
        }
      }
    }

    const res = await dos.caseManager.fetch(new Request('http://do/events', {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        hubId: c.get('hubId') ?? '',
        createdBy: pubkey,
        caseNumber,
      }),
    }))

    if (!res.ok) return new Response(res.body, res)

    const event = await res.json() as Event

    // Publish Nostr event (events use the same kinds as records)
    publishNostrEvent(c.env, KIND_RECORD_CREATED, {
      type: 'event:created',
      eventId: event.id,
      entityTypeId: event.entityTypeId,
      caseNumber: event.caseNumber,
    }).catch((e) => { console.error('[events] Failed to publish event:', e) })

    await audit(dos.records, 'eventCreated', pubkey, {
      eventId: event.id,
      entityTypeId: event.entityTypeId,
      caseNumber: event.caseNumber,
    })

    return c.json(event, 201)
  },
)

// --- Update event ---
events.patch('/:id',
  describeRoute({
    tags: ['Events'],
    summary: 'Update an event',
    responses: {
      200: { description: 'Event updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:update'),
  validator('json', updateEventBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))

    if (!res.ok) return new Response(res.body, res)

    publishNostrEvent(c.env, KIND_RECORD_UPDATED, {
      type: 'event:updated',
      eventId: id,
    }).catch((e) => { console.error('[events] Failed to publish event:', e) })

    await audit(dos.records, 'eventUpdated', pubkey, { eventId: id })

    return new Response(res.body, res)
  },
)

// --- Delete event ---
events.delete('/:id',
  describeRoute({
    tags: ['Events'],
    summary: 'Delete an event',
    responses: {
      200: { description: 'Event deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:delete'),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'eventDeleted', pubkey, { eventId: id })

    return new Response(res.body, res)
  },
)

// --- List sub-events ---
events.get('/:id/subevents',
  describeRoute({
    tags: ['Events'],
    summary: 'List sub-events of an event',
    responses: {
      200: { description: 'Sub-events list' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:read'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/subevents`))
    return new Response(res.body, res)
  },
)

// --- Link record to event ---
events.post('/:id/records',
  describeRoute({
    tags: ['Events'],
    summary: 'Link a record to an event',
    responses: {
      201: { description: 'Record linked to event' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:link'),
  validator('json', linkRecordToEventBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/records`, {
      method: 'POST',
      body: JSON.stringify({ recordId: body.recordId, linkedBy: pubkey }),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'recordLinkedToEvent', pubkey, {
      eventId: id,
      recordId: body.recordId,
    })

    return new Response(res.body, { status: 201, headers: res.headers })
  },
)

// --- Unlink record from event ---
events.delete('/:id/records/:recordId',
  describeRoute({
    tags: ['Events'],
    summary: 'Unlink a record from an event',
    responses: {
      200: { description: 'Record unlinked from event' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:link'),
  async (c) => {
    const id = c.req.param('id')
    const recordId = c.req.param('recordId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/records/${recordId}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'recordUnlinkedFromEvent', pubkey, {
      eventId: id,
      recordId,
    })

    return new Response(res.body, res)
  },
)

// --- List records linked to event ---
events.get('/:id/records',
  describeRoute({
    tags: ['Events'],
    summary: 'List records linked to an event',
    responses: {
      200: { description: 'Linked records' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:read'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/records`))
    return new Response(res.body, res)
  },
)

// --- Link report to event ---
events.post('/:id/reports',
  describeRoute({
    tags: ['Events'],
    summary: 'Link a report to an event',
    responses: {
      201: { description: 'Report linked to event' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:link'),
  validator('json', linkReportToEventBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/reports`, {
      method: 'POST',
      body: JSON.stringify({ reportId: body.reportId, linkedBy: pubkey }),
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'reportLinkedToEvent', pubkey, {
      eventId: id,
      reportId: body.reportId,
    })

    return new Response(res.body, { status: 201, headers: res.headers })
  },
)

// --- Unlink report from event ---
events.delete('/:id/reports/:reportId',
  describeRoute({
    tags: ['Events'],
    summary: 'Unlink a report from an event',
    responses: {
      200: { description: 'Report unlinked from event' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:link'),
  async (c) => {
    const id = c.req.param('id')
    const reportId = c.req.param('reportId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/reports/${reportId}`, {
      method: 'DELETE',
    }))

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'reportUnlinkedFromEvent', pubkey, {
      eventId: id,
      reportId,
    })

    return new Response(res.body, res)
  },
)

// --- List reports linked to event ---
events.get('/:id/reports',
  describeRoute({
    tags: ['Events'],
    summary: 'List reports linked to an event',
    responses: {
      200: { description: 'Linked reports' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('events:read'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(new Request(`http://do/events/${id}/reports`))
    return new Response(res.body, res)
  },
)

export default events
