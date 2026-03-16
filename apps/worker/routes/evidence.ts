import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, requireAnyPermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import {
  uploadEvidenceBodySchema,
  logCustodyEventBodySchema,
  verifyIntegrityBodySchema,
  listEvidenceQuerySchema,
} from '@protocol/schemas/evidence'
import type { EvidenceMetadata } from '@protocol/schemas/evidence'
import { authErrors, notFoundError } from '../openapi/helpers'

const evidence = new Hono<AppEnv>()

// ============================================================
// Evidence routes mounted under /records/:id/evidence
// ============================================================

// --- Upload evidence metadata to a case record ---
// The actual file is uploaded to R2 via the existing file upload route.
// This route creates the evidence metadata and initial custody entry,
// and optionally auto-creates a file_upload interaction on the case timeline.
evidence.post('/records/:id/evidence',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Upload evidence to a case record',
    responses: {
      201: { description: 'Evidence metadata created with initial custody entry' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:upload'),
  validator('json', uploadEvidenceBodySchema),
  async (c) => {
    const caseId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/evidence`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify({
          fileId: body.fileId,
          filename: body.filename,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
          classification: body.classification,
          integrityHash: body.integrityHash,
          source: body.source,
          sourceDescription: body.sourceDescription,
          encryptedDescription: body.encryptedDescription,
          descriptionEnvelopes: body.descriptionEnvelopes,
        }),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    const created = await res.json() as EvidenceMetadata

    // Auto-create a file_upload interaction on the case timeline
    await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/interactions`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify({
          interactionType: 'file_upload',
          sourceId: created.id,
          interactionTypeHash: body.interactionTypeHash ?? '',
        }),
      }),
    )

    await audit(dos.records, 'evidenceUploaded', pubkey, {
      caseId,
      evidenceId: created.id,
      classification: body.classification,
    })

    return c.json(created, 201)
  },
)

// --- List evidence for a case ---
evidence.get('/records/:id/evidence',
  describeRoute({
    tags: ['Evidence'],
    summary: 'List evidence for a case record',
    responses: {
      200: { description: 'Paginated list of evidence' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requireAnyPermission('evidence:download', 'evidence:upload', 'evidence:manage-custody'),
  validator('query', listEvidenceQuerySchema),
  async (c) => {
    const caseId = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')

    const qs = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.classification) qs.set('classification', query.classification)

    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/${caseId}/evidence?${qs}`),
    )
    return new Response(res.body, res)
  },
)

// ============================================================
// Evidence-specific routes (by evidence ID)
// ============================================================

// --- Get single evidence metadata ---
evidence.get('/evidence/:evidenceId',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Get single evidence metadata',
    responses: {
      200: { description: 'Evidence metadata' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requireAnyPermission('evidence:download', 'evidence:manage-custody'),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}`),
    )
    return new Response(res.body, res)
  },
)

// --- Get custody chain for evidence ---
evidence.get('/evidence/:evidenceId/custody',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Get chain of custody for evidence',
    responses: {
      200: { description: 'Chronological custody chain' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:manage-custody'),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const dos = getScopedDOs(c.env, c.get('hubId'))

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/custody`),
    )
    return new Response(res.body, res)
  },
)

// --- Log evidence access (called when evidence is viewed/downloaded/shared) ---
evidence.post('/evidence/:evidenceId/access',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Log evidence access event (view, download, share)',
    responses: {
      201: { description: 'Custody entry created' },
      ...authErrors,
    },
  }),
  requirePermission('evidence:download'),
  validator('json', logCustodyEventBodySchema),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/custody`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify({
          action: body.action,
          integrityHash: body.integrityHash,
          userAgent: c.req.header('user-agent'),
          notes: body.notes,
        }),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    await audit(dos.records, 'evidenceAccessed', pubkey, {
      evidenceId,
      action: body.action,
    })

    return new Response(res.body, { status: 201, headers: res.headers })
  },
)

// --- Verify evidence integrity ---
evidence.post('/evidence/:evidenceId/verify',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Verify evidence integrity (compare current hash to stored hash)',
    responses: {
      200: { description: 'Verification result' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:download'),
  validator('json', verifyIntegrityBodySchema),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const pubkey = c.get('pubkey')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')

    const res = await dos.caseManager.fetch(
      new Request(`http://do/evidence/${evidenceId}/verify`, {
        method: 'POST',
        headers: { 'x-pubkey': pubkey },
        body: JSON.stringify(body),
      }),
    )

    if (!res.ok) return new Response(res.body, res)

    const result = await res.json() as { valid: boolean; originalHash: string; currentHash: string }

    await audit(dos.records, 'evidenceIntegrityVerified', pubkey, {
      evidenceId,
      valid: result.valid,
    })

    return c.json(result)
  },
)

export default evidence
