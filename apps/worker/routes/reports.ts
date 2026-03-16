import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { listReportsQuerySchema, createReportBodySchema, reportMessageBodySchema, assignReportBodySchema, updateReportBodySchema } from '@protocol/schemas/reports'
import { paginationSchema } from '@protocol/schemas/common'
import { conversationResponseSchema, messageResponseSchema } from '@protocol/schemas/conversations'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { KIND_MESSAGE_NEW, KIND_CONVERSATION_ASSIGNED } from '@shared/nostr-events'
import { publishNostrEvent } from '../lib/nostr-events'
import { verifyReportAccess, isReport } from '../lib/report-access'
import { linkCaseToReportBodySchema } from '@protocol/schemas/report-links'

const reports = new Hono<AppEnv>()

// List reports — reporters see only their own, users with reports:read-all see everything
reports.get('/',
  describeRoute({
    tags: ['Reports'],
    summary: 'List reports',
    responses: {
      200: { description: 'Paginated list of reports' },
      ...authErrors,
    },
  }),
  validator('query', listReportsQuerySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')

    const limit = Math.min(query.limit, 100)

    const qs = new URLSearchParams({
      type: 'report',
      page: String(query.page),
      limit: String(limit),
    })
    if (query.status) qs.set('status', query.status)
    if (query.category) qs.set('category', query.category)

    const canReadAll = checkPermission(permissions, 'reports:read-all')
    const canReadAssigned = checkPermission(permissions, 'reports:read-assigned')

    // If user can only read their own reports (reporter)
    if (!canReadAll && !canReadAssigned) {
      qs.set('authorPubkey', pubkey)
    }

    const res = await dos.conversations.fetch(new Request(`http://do/conversations?${qs}`))
    if (!res.ok) {
      return c.json({ error: 'Failed to fetch reports' }, 500)
    }

    const data = await res.json() as { conversations: Array<{ metadata?: { reportTypeId?: string; conversionStatus?: string } }>; total: number }

    // Triage queue filtering: only reports whose report type allows case conversion
    if (query.conversionEnabled) {
      const rtRes = await dos.settings.fetch(new Request('http://do/settings/cms-report-types'))
      if (rtRes.ok) {
        const rtData = await rtRes.json() as { reportTypes: Array<{ id: string; allowCaseConversion: boolean }> }
        const conversionTypeIds = new Set(
          rtData.reportTypes.filter(rt => rt.allowCaseConversion).map(rt => rt.id),
        )
        data.conversations = data.conversations.filter(
          c => c.metadata?.reportTypeId && conversionTypeIds.has(c.metadata.reportTypeId),
        )
        data.total = data.conversations.length
      }
    }

    // Filter by conversion status if specified
    if (query.conversionStatus) {
      data.conversations = data.conversations.filter(
        c => c.metadata?.conversionStatus === query.conversionStatus,
      )
      data.total = data.conversations.length
    }

    return c.json(data)
  },
)

// Create a new report (requires reports:create)
reports.post('/',
  describeRoute({
    tags: ['Reports'],
    summary: 'Create a new report',
    responses: {
      201: {
        description: 'Report created',
        content: {
          'application/json': {
            schema: resolver(conversationResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('reports:create'),
  validator('json', createReportBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Create the conversation with report metadata
    const conversationData = {
      channelType: 'web',
      contactIdentifierHash: pubkey,  // Reporter is the "contact"
      status: 'waiting',
      metadata: {
        type: 'report',
        reportTitle: body.title,
        reportCategory: body.category,
        reportTypeId: body.reportTypeId,
      },
    }

    const convRes = await dos.conversations.fetch(new Request('http://do/conversations', {
      method: 'POST',
      body: JSON.stringify(conversationData),
    }))

    if (!convRes.ok) {
      return c.json({ error: 'Failed to create report' }, 500)
    }

    const conversation = await convRes.json() as { id: string }

    // Add the initial message
    const msgRes = await dos.conversations.fetch(new Request(`http://do/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        direction: 'inbound',
        authorPubkey: pubkey,
        encryptedContent: body.encryptedContent,
        readerEnvelopes: body.readerEnvelopes,
      }),
    }))

    if (!msgRes.ok) {
      return c.json({ error: 'Failed to add report message' }, 500)
    }

    // Publish report event to Nostr relay
    publishNostrEvent(c.env, KIND_MESSAGE_NEW, {
      type: 'report:new',
      conversationId: conversation.id,
      category: body.category,
    }).catch((e) => { console.error('[reports] Failed to publish event:', e) })

    await audit(dos.records, 'reportCreated', pubkey, {
      conversationId: conversation.id,
      category: body.category,
    })

    return c.json({ id: conversation.id, ...conversationData })
  },
)

// Get report categories (from settings) — deprecated, use /types instead
// NOTE: Must be defined BEFORE /:id to avoid Hono matching "categories" as an id param
reports.get('/categories',
  describeRoute({
    tags: ['Reports'],
    summary: 'Get report categories (deprecated)',
    responses: {
      200: { description: 'Report categories' },
      ...authErrors,
    },
  }),
  requirePermission('reports:create'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.settings.fetch(new Request('http://do/settings/report-categories'))
    if (!res.ok) {
      return c.json({ categories: [] })
    }
    return new Response(res.body, res)
  },
)

// Get report types (authenticated — available to all users who can create reports)
// NOTE: Must be defined BEFORE /:id to avoid Hono matching "types" as an id param
reports.get('/types',
  describeRoute({
    tags: ['Reports'],
    summary: 'Get report types',
    responses: {
      200: { description: 'Report types' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.settings.fetch(new Request('http://do/settings/report-types'))
    if (!res.ok) {
      return c.json({ reportTypes: [] })
    }
    const data = await res.json() as { reportTypes: import('@shared/types').ReportType[] }
    // Filter out archived types for non-admin callers
    const permissions = c.get('permissions')
    const isAdmin = checkPermission(permissions, 'settings:manage-fields')
    if (!isAdmin) {
      data.reportTypes = data.reportTypes.filter(rt => !rt.isArchived)
    }
    return c.json(data)
  },
)

// Get a single report
reports.get('/:id',
  describeRoute({
    tags: ['Reports'],
    summary: 'Get a single report',
    responses: {
      200: {
        description: 'Report details',
        content: {
          'application/json': {
            schema: resolver(conversationResponseSchema),
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
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
    if (!res.ok) {
      return c.json({ error: 'Report not found' }, 404)
    }

    const report = await res.json() as { contactIdentifierHash: string; assignedTo?: string; metadata?: { type?: string } }

    if (!isReport(report)) {
      return c.json({ error: 'Not a report' }, 404)
    }

    if (!verifyReportAccess(report, pubkey, permissions)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return c.json(report)
  },
)

// Get report messages
reports.get('/:id/messages',
  describeRoute({
    tags: ['Reports'],
    summary: 'List messages in a report',
    responses: {
      200: {
        description: 'Paginated report messages',
        content: {
          'application/json': {
            schema: resolver(messageResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('query', paginationSchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Verify access
    const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
    if (!convRes.ok) {
      return c.json({ error: 'Report not found' }, 404)
    }

    const report = await convRes.json() as { contactIdentifierHash: string; assignedTo?: string; metadata?: { type?: string } }

    if (!isReport(report)) {
      return c.json({ error: 'Not a report' }, 404)
    }

    if (!verifyReportAccess(report, pubkey, permissions)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const query = c.req.valid('query')
    const limit = Math.min(query.limit, 200)

    const msgRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/messages?limit=${limit}&page=${query.page}`))
    return new Response(msgRes.body, msgRes)
  },
)

// Send a message in a report thread
reports.post('/:id/messages',
  describeRoute({
    tags: ['Reports'],
    summary: 'Send a message in a report thread',
    responses: {
      200: {
        description: 'Message sent',
        content: {
          'application/json': {
            schema: resolver(messageResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  validator('json', reportMessageBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Verify access
    const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
    if (!convRes.ok) {
      return c.json({ error: 'Report not found' }, 404)
    }

    const report = await convRes.json() as { contactIdentifierHash: string; assignedTo?: string; metadata?: { type?: string } }

    if (!isReport(report)) {
      return c.json({ error: 'Not a report' }, 404)
    }

    const canSendAny = checkPermission(permissions, 'reports:send-message')
    const canSendOwn = checkPermission(permissions, 'reports:send-message-own')

    // Check if user can send messages in this report
    if (!canSendAny) {
      if (canSendOwn && report.contactIdentifierHash === pubkey) {
        // Reporter can reply to own report
      } else if (report.assignedTo === pubkey) {
        // Assigned volunteer can reply
      } else {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }

    const body = c.req.valid('json')

    const isReporter = report.contactIdentifierHash === pubkey
    const direction = isReporter ? 'inbound' : 'outbound'

    const msgRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        direction,
        authorPubkey: pubkey,
        encryptedContent: body.encryptedContent,
        readerEnvelopes: body.readerEnvelopes,
        hasAttachments: (body.attachmentIds?.length ?? 0) > 0,
        attachmentIds: body.attachmentIds,
      }),
    }))

    if (!msgRes.ok) {
      return c.json({ error: 'Failed to send message' }, 500)
    }

    const msg = await msgRes.json()

    // Publish message event to Nostr relay
    publishNostrEvent(c.env, KIND_MESSAGE_NEW, {
      type: 'message:new',
      conversationId: id,
    }).catch((e) => { console.error('[reports] Failed to publish event:', e) })

    return c.json(msg)
  },
)

// Assign a volunteer to a report (requires reports:assign)
reports.post('/:id/assign',
  describeRoute({
    tags: ['Reports'],
    summary: 'Assign a volunteer to a report',
    responses: {
      200: { description: 'Report assigned' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('reports:assign'),
  validator('json', assignReportBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedTo: body.assignedTo, status: 'active' }),
    }))

    if (!res.ok) {
      return c.json({ error: 'Failed to assign report' }, 500)
    }

    await audit(dos.records, 'reportAssigned', pubkey, { reportId: id, assignedTo: body.assignedTo })

    // Publish assignment event to Nostr relay
    publishNostrEvent(c.env, KIND_CONVERSATION_ASSIGNED, {
      type: 'conversation:assigned',
      conversationId: id,
      assignedTo: body.assignedTo,
    }).catch((e) => { console.error('[reports] Failed to publish event:', e) })

    return new Response(res.body, res)
  },
)

// Update report status (requires reports:update)
reports.patch('/:id',
  describeRoute({
    tags: ['Reports'],
    summary: 'Update report status',
    responses: {
      200: { description: 'Report updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('reports:update'),
  validator('json', updateReportBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Build the update payload — conversionStatus goes into metadata
    const patchBody: Record<string, unknown> = {}
    if (body.status) patchBody.status = body.status
    if (body.conversionStatus) {
      patchBody.metadata = { conversionStatus: body.conversionStatus }
    }

    const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    }))

    if (!res.ok) {
      return c.json({ error: 'Failed to update report' }, 500)
    }

    await audit(dos.records, 'reportUpdated', pubkey, { reportId: id, ...body })
    return new Response(res.body, res)
  },
)

// Get files attached to a report
reports.get('/:id/files',
  describeRoute({
    tags: ['Reports'],
    summary: 'Get files attached to a report',
    responses: {
      200: { description: 'Report files' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    // Verify access
    const convRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`))
    if (!convRes.ok) {
      return c.json({ error: 'Report not found' }, 404)
    }

    const report = await convRes.json() as { contactIdentifierHash: string; assignedTo?: string; metadata?: { type?: string } }

    if (!isReport(report)) {
      return c.json({ error: 'Not a report' }, 404)
    }

    if (!verifyReportAccess(report, pubkey, permissions)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const filesRes = await dos.conversations.fetch(new Request(`http://do/files?conversationId=${id}`))
    if (!filesRes.ok) {
      return c.json({ files: [] })
    }

    return new Response(filesRes.body, filesRes)
  },
)

// ============================================================
// Report-Case Link Routes — Reverse Direction (Epic 324)
// ============================================================

// --- List cases linked to a report ---
reports.get('/:id/records',
  describeRoute({
    tags: ['Reports'],
    summary: 'List case records linked to a report',
    responses: {
      200: { description: 'Linked case records' },
      ...authErrors,
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

    const reportId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/reports/${reportId}/records`),
    )
    return new Response(res.body, res)
  },
)

// --- Link case to report (reverse direction entry point) ---
reports.post('/:id/records',
  describeRoute({
    tags: ['Reports'],
    summary: 'Link a case record to a report',
    responses: {
      201: { description: 'Case linked to report' },
      409: { description: 'Already linked' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  validator('json', linkCaseToReportBodySchema),
  async (c) => {
    const reportId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    // Delegate to the canonical CaseDO handler (same storage, from record side)
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${body.caseId}/reports`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify({
          reportId,
          encryptedNotes: body.encryptedNotes,
          notesEnvelopes: body.notesEnvelopes,
        }),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'caseLinkedToReport', pubkey, {
      reportId,
      caseId: body.caseId,
    })

    return new Response(res.body, { ...res, status: 201 })
  },
)

// --- Unlink case from report (reverse direction) ---
reports.delete('/:id/records/:caseId',
  describeRoute({
    tags: ['Reports'],
    summary: 'Unlink a case record from a report',
    responses: {
      200: { description: 'Case unlinked from report' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:link'),
  async (c) => {
    const reportId = c.req.param('id')
    const caseId = c.req.param('caseId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/reports/${reportId}`, { method: 'DELETE' }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'caseUnlinkedFromReport', pubkey, {
      reportId,
      caseId,
    })

    return new Response(res.body, res)
  },
)

export default reports
