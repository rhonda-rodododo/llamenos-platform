import { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { validateBody, validateQuery } from '../middleware/validate'
import { listReportsQuerySchema, createReportBodySchema, reportMessageBodySchema, assignReportBodySchema, updateReportBodySchema } from '../schemas/reports'
import { paginationSchema } from '../schemas/common'
import { audit } from '../services/audit'
import { KIND_MESSAGE_NEW, KIND_CONVERSATION_ASSIGNED } from '@shared/nostr-events'
import { publishNostrEvent } from '../lib/nostr-events'
import { verifyReportAccess, isReport } from '../lib/report-access'

const reports = new Hono<AppEnv>()

// List reports — reporters see only their own, users with reports:read-all see everything
reports.get('/', validateQuery(listReportsQuerySchema), async (c) => {
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const query = c.get('validatedQuery') as z.infer<typeof listReportsQuerySchema>

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

  const data = await res.json()
  return c.json(data)
})

// Create a new report (requires reports:create)
reports.post('/', requirePermission('reports:create'), validateBody(createReportBodySchema), async (c) => {
  const pubkey = c.get('pubkey')
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const body = c.get('validatedBody') as z.infer<typeof createReportBodySchema>

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
  })

  await audit(dos.records, 'reportCreated', pubkey, {
    conversationId: conversation.id,
    category: body.category,
  })

  return c.json({ id: conversation.id, ...conversationData })
})

// Get a single report
reports.get('/:id', async (c) => {
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
})

// Get report messages
reports.get('/:id/messages', validateQuery(paginationSchema), async (c) => {
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

  const query = c.get('validatedQuery') as z.infer<typeof paginationSchema>
  const limit = Math.min(query.limit, 200)

  const msgRes = await dos.conversations.fetch(new Request(`http://do/conversations/${id}/messages?limit=${limit}&page=${query.page}`))
  return new Response(msgRes.body, msgRes)
})

// Send a message in a report thread
reports.post('/:id/messages', validateBody(reportMessageBodySchema), async (c) => {
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

  const body = c.get('validatedBody') as z.infer<typeof reportMessageBodySchema>

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
  })

  return c.json(msg)
})

// Assign a volunteer to a report (requires reports:assign)
reports.post('/:id/assign', requirePermission('reports:assign'), validateBody(assignReportBodySchema), async (c) => {
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const body = c.get('validatedBody') as z.infer<typeof assignReportBodySchema>
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
  })

  return new Response(res.body, res)
})

// Update report status (requires reports:update)
reports.patch('/:id', requirePermission('reports:update'), validateBody(updateReportBodySchema), async (c) => {
  const id = c.req.param('id')
  const pubkey = c.get('pubkey')
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const body = c.get('validatedBody') as z.infer<typeof updateReportBodySchema>

  const res = await dos.conversations.fetch(new Request(`http://do/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))

  if (!res.ok) {
    return c.json({ error: 'Failed to update report' }, 500)
  }

  await audit(dos.records, 'reportUpdated', pubkey, { reportId: id, ...body })
  return new Response(res.body, res)
})

// Get report categories (from settings) — deprecated, use /types instead
reports.get('/categories', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const res = await dos.settings.fetch(new Request('http://do/settings/report-categories'))
  if (!res.ok) {
    return c.json({ categories: [] })
  }
  return new Response(res.body, res)
})

// Get report types (authenticated — available to all users who can create reports)
reports.get('/types', async (c) => {
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
})

// Get files attached to a report
reports.get('/:id/files', async (c) => {
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
})

export default reports
