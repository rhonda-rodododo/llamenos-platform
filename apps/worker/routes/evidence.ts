import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission, requireAnyPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import {
  uploadEvidenceBodySchema,
  logCustodyEventBodySchema,
  verifyIntegrityBodySchema,
  listEvidenceQuerySchema,
  evidenceMetadataSchema,
  evidenceListResponseSchema,
  custodyChainResponseSchema,
  custodyEntrySchema,
  verifyIntegrityResponseSchema,
} from '@protocol/schemas/evidence'
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
      201: {
        description: 'Evidence metadata created with initial custody entry',
        content: {
          'application/json': {
            schema: resolver(evidenceMetadataSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:upload'),
  validator('json', uploadEvidenceBodySchema),
  async (c) => {
    const caseId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const created = await services.cases.createEvidence(caseId, pubkey, {
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
    })

    // Auto-create a file_upload interaction on the case timeline
    await services.cases.createInteraction(caseId, pubkey, {
      interactionType: 'file_upload',
      sourceId: created.id,
      interactionTypeHash: body.interactionTypeHash ?? '',
    }).catch(() => {
      // Non-fatal: interaction creation failure shouldn't block evidence upload
    })

    await audit(services.audit, 'evidenceUploaded', pubkey, {
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
      200: {
        description: 'Paginated list of evidence',
        content: {
          'application/json': {
            schema: resolver(evidenceListResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requireAnyPermission('evidence:download', 'evidence:upload', 'evidence:manage-custody'),
  validator('query', listEvidenceQuerySchema),
  async (c) => {
    const caseId = c.req.param('id')
    const services = c.get('services')
    const query = c.req.valid('query')

    const result = await services.cases.listEvidence(caseId, {
      page: query.page,
      limit: query.limit,
      classification: query.classification,
    })

    return c.json(result)
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
      200: {
        description: 'Evidence metadata',
        content: {
          'application/json': {
            schema: resolver(evidenceMetadataSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requireAnyPermission('evidence:download', 'evidence:manage-custody'),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const services = c.get('services')
    const ev = await services.cases.getEvidence(evidenceId)
    return c.json(ev)
  },
)

// --- Get custody chain for evidence ---
evidence.get('/evidence/:evidenceId/custody',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Get chain of custody for evidence',
    responses: {
      200: {
        description: 'Chronological custody chain',
        content: {
          'application/json': {
            schema: resolver(custodyChainResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:manage-custody'),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const services = c.get('services')
    const result = await services.cases.listCustodyEntries(evidenceId)
    return c.json(result)
  },
)

// --- Log evidence access (called when evidence is viewed/downloaded/shared) ---
evidence.post('/evidence/:evidenceId/access',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Log evidence access event (view, download, share)',
    responses: {
      201: {
        description: 'Custody entry created',
        content: {
          'application/json': {
            schema: resolver(custodyEntrySchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('evidence:download'),
  validator('json', logCustodyEventBodySchema),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const entry = await services.cases.createCustodyEntry(evidenceId, pubkey, {
      action: body.action,
      integrityHash: body.integrityHash,
      userAgent: c.req.header('user-agent'),
      notes: body.notes,
    })

    await audit(services.audit, 'evidenceAccessed', pubkey, {
      evidenceId,
      action: body.action,
    })

    return c.json(entry, 201)
  },
)

// --- Verify evidence integrity ---
evidence.post('/evidence/:evidenceId/verify',
  describeRoute({
    tags: ['Evidence'],
    summary: 'Verify evidence integrity (compare current hash to stored hash)',
    responses: {
      200: {
        description: 'Verification result',
        content: {
          'application/json': {
            schema: resolver(verifyIntegrityResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('evidence:download'),
  validator('json', verifyIntegrityBodySchema),
  async (c) => {
    const evidenceId = c.req.param('evidenceId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.verifyEvidence(
      evidenceId,
      body.currentHash,
      pubkey,
    )

    await audit(services.audit, 'evidenceIntegrityVerified', pubkey, {
      evidenceId,
      valid: result.valid,
    })

    return c.json(result)
  },
)

export default evidence
