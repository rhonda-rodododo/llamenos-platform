import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import type { FileRecord, FileKeyEnvelope } from '@shared/types'
import { getDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { withRetry, isRetryableError } from '../lib/retry'
import { getCircuitBreaker } from '../lib/circuit-breaker'
import { incCounter } from './metrics'
import { shareFileBodySchema } from '@protocol/schemas/files'
import { authErrors } from '../openapi/helpers'

const files = new Hono<AppEnv>()

// Download encrypted file content
files.get('/:id/content',
  describeRoute({
    tags: ['Files'],
    summary: 'Download encrypted file content',
    responses: {
      ...authErrors,
      200: { description: 'Encrypted file binary content' },
      400: { description: 'File upload not complete' },
      403: { description: 'Forbidden' },
      404: { description: 'File not found' },
    },
  }),
  async (c) => {
    const fileId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getDOs(c.env)

    // Get file record to verify access
    const recordRes = await dos.conversations.fetch(new Request(`http://do/files/${fileId}`))
    if (!recordRes.ok) {
      return c.json({ error: 'File not found' }, 404)
    }

    const fileRecord = await recordRes.json() as FileRecord
    if (fileRecord.status !== 'complete') {
      return c.json({ error: 'File upload not complete' }, 400)
    }

    // Verify the requester has an envelope (is an authorized recipient)
    const hasAccess = checkPermission(permissions, 'files:download-all') ||
      fileRecord.uploadedBy === pubkey ||
      fileRecord.recipientEnvelopes.some(e => e.pubkey === pubkey)

    if (!hasAccess) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const storageBreaker = getCircuitBreaker({
      name: 'blob:r2',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    })
    const obj = await storageBreaker.execute(() =>
      withRetry(
        () => c.env.R2_BUCKET.get(`files/${fileId}/content`),
        {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          isRetryable: isRetryableError,
          onRetry: (attempt, error) => {
            console.warn(`[files] R2 get retry ${attempt} for ${fileId}:`, error)
            incCounter('llamenos_retry_attempts_total', { service: 'blob', operation: 'get' })
          },
        },
      )
    )
    if (!obj) {
      return c.json({ error: 'File content not found' }, 404)
    }

    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(obj.size),
        'Cache-Control': 'private, no-cache',
      },
    })
  })

// Get file envelopes (recipient key wrappers)
files.get('/:id/envelopes',
  describeRoute({
    tags: ['Files'],
    summary: 'Get file key envelopes',
    responses: {
      ...authErrors,
      200: { description: 'File key envelopes for authorized recipients' },
      403: { description: 'Forbidden' },
      404: { description: 'File not found' },
    },
  }),
  async (c) => {
    const fileId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getDOs(c.env)

    const recordRes = await dos.conversations.fetch(new Request(`http://do/files/${fileId}`))
    if (!recordRes.ok) {
      return c.json({ error: 'File not found' }, 404)
    }

    const fileRecord = await recordRes.json() as FileRecord

    const hasAccess = checkPermission(permissions, 'files:download-all') ||
      fileRecord.uploadedBy === pubkey ||
      fileRecord.recipientEnvelopes.some(e => e.pubkey === pubkey)

    if (!hasAccess) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Return only the envelope for the requesting user (or all for users with download-all)
    if (checkPermission(permissions, 'files:download-all')) {
      return c.json({ envelopes: fileRecord.recipientEnvelopes })
    }

    const myEnvelope = fileRecord.recipientEnvelopes.find(e => e.pubkey === pubkey)
    return c.json({ envelopes: myEnvelope ? [myEnvelope] : [] })
  })

// Get encrypted file metadata
files.get('/:id/metadata',
  describeRoute({
    tags: ['Files'],
    summary: 'Get encrypted file metadata',
    responses: {
      ...authErrors,
      200: { description: 'Encrypted metadata for authorized recipients' },
      403: { description: 'Forbidden' },
      404: { description: 'File not found' },
    },
  }),
  async (c) => {
    const fileId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const dos = getDOs(c.env)

    const recordRes = await dos.conversations.fetch(new Request(`http://do/files/${fileId}`))
    if (!recordRes.ok) {
      return c.json({ error: 'File not found' }, 404)
    }

    const fileRecord = await recordRes.json() as FileRecord

    const hasAccess = checkPermission(permissions, 'files:download-all') ||
      fileRecord.uploadedBy === pubkey ||
      fileRecord.recipientEnvelopes.some(e => e.pubkey === pubkey)

    if (!hasAccess) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Return only the metadata blob for the requesting user (or all for users with download-all)
    if (checkPermission(permissions, 'files:download-all')) {
      return c.json({ metadata: fileRecord.encryptedMetadata })
    }

    const myMeta = fileRecord.encryptedMetadata.find(m => m.pubkey === pubkey)
    return c.json({ metadata: myMeta ? [myMeta] : [] })
  })

// Share file with a new recipient (requires files:share — admin re-encrypts the file key for a volunteer)
files.post('/:id/share', requirePermission('files:share'),
  describeRoute({
    tags: ['Files'],
    summary: 'Share file with a new recipient',
    responses: {
      200: { description: 'File shared successfully' },
      500: { description: 'Failed to share file' },
      ...authErrors,
    },
  }),
  validator('json', shareFileBodySchema),
  async (c) => {
    const fileId = c.req.param('id')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const dos = getDOs(c.env)

    // Add the new envelope to the file record
    const res = await dos.conversations.fetch(new Request(`http://do/files/${fileId}/share`, {
      method: 'POST',
      body: JSON.stringify({
        envelope: body.envelope,
        encryptedMetadata: body.encryptedMetadata,
      }),
    }))

    if (!res.ok) {
      return c.json({ error: 'Failed to share file' }, 500)
    }

    await audit(dos.records, 'fileShared', pubkey, { fileId, sharedWith: body.envelope.pubkey })

    return c.json({ ok: true })
  })

export default files
