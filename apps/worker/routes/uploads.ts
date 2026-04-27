import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import type { FileRecord } from '@shared/types'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { uploadInitBodySchema, uploadInitResponseSchema, chunkUploadResponseSchema, uploadCompleteResponseSchema, uploadStatusResponseSchema } from '@protocol/schemas/uploads'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { withRetry, isRetryableError } from '../lib/retry'
import { getCircuitBreaker } from '../lib/circuit-breaker'
import { incCounter } from './metrics'
import { createLogger } from '../lib/logger'

const logger = createLogger('routes.uploads')

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024  // 100 MB
const MAX_CHUNK_SIZE = 10 * 1024 * 1024    // 10 MB

const uploads = new Hono<AppEnv>()
uploads.use('*', requirePermission('files:upload'))

// Initialize an upload — returns uploadId and chunk upload URLs
uploads.post('/init',
  describeRoute({
    tags: ['Uploads'],
    summary: 'Initialize a chunked upload',
    responses: {
      200: {
        description: 'Upload initialized with uploadId',
        content: {
          'application/json': {
            schema: resolver(uploadInitResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', uploadInitBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json') as import('@shared/types').UploadInit

    if (body.totalSize > MAX_UPLOAD_SIZE) {
      return c.json({ error: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB)` }, 400)
    }

    const uploadId = crypto.randomUUID()

    // Store file record via service
    await services.conversations.createFile({
      id: uploadId,
      conversationId: body.conversationId,
      uploadedBy: pubkey,
      recipientEnvelopes: body.recipientEnvelopes || [],
      encryptedMetadata: body.encryptedMetadata || [],
      totalSize: body.totalSize,
      totalChunks: body.totalChunks,
    })

    await audit(services.audit, 'fileUploadStarted', pubkey, {
      uploadId,
      conversationId: body.conversationId,
      totalSize: body.totalSize,
      totalChunks: body.totalChunks,
    })

    return c.json({ uploadId, totalChunks: body.totalChunks })
  },
)

// Upload a chunk
uploads.put('/:id/chunks/:chunkIndex',
  describeRoute({
    tags: ['Uploads'],
    summary: 'Upload a single chunk',
    responses: {
      200: {
        description: 'Chunk uploaded',
        content: {
          'application/json': {
            schema: resolver(chunkUploadResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const uploadId = c.req.param('id')
    const chunkIndex = parseInt(c.req.param('chunkIndex'), 10)
    const services = c.get('services')

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return c.json({ error: 'Invalid chunk index' }, 400)
    }

    // Verify ownership before accepting chunk
    const fileRecord = await services.conversations.getFile(uploadId)
    if (fileRecord.uploadedBy !== pubkey && !checkPermission(permissions, 'files:download-all')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Store chunk directly in R2
    const body = await c.req.arrayBuffer()
    if (!body || body.byteLength === 0) {
      return c.json({ error: 'Empty chunk' }, 400)
    }

    if (body.byteLength > MAX_CHUNK_SIZE) {
      return c.json({ error: `Chunk too large (max ${MAX_CHUNK_SIZE / 1024 / 1024}MB)` }, 400)
    }

    const r2Key = `files/${uploadId}/chunk-${String(chunkIndex).padStart(6, '0')}`
    const storageBreaker = getCircuitBreaker({
      name: 'blob:r2',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    })
    await storageBreaker.execute(() =>
      withRetry(
        () => c.env.R2_BUCKET.put(r2Key, body),
        {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          isRetryable: isRetryableError,
          onRetry: (attempt, error) => {
            logger.warn(`R2 put retry ${attempt} for ${r2Key}`, { error })
            incCounter('llamenos_retry_attempts_total', { service: 'blob', operation: 'put' })
          },
        },
      )
    )

    // Update completion count via service
    const updated = await services.conversations.markChunkComplete(uploadId)

    return c.json({ chunkIndex, completedChunks: updated.completedChunks, totalChunks: updated.totalChunks })
  },
)

// Complete an upload — assembles chunks
uploads.post('/:id/complete',
  describeRoute({
    tags: ['Uploads'],
    summary: 'Complete a chunked upload',
    responses: {
      200: {
        description: 'Upload completed',
        content: {
          'application/json': {
            schema: resolver(uploadCompleteResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const uploadId = c.req.param('id')
    const services = c.get('services')

    // Verify all chunks are uploaded
    const fileRecord = await services.conversations.getFile(uploadId)

    if (fileRecord.uploadedBy !== pubkey && !checkPermission(permissions, 'files:download-all')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    if (fileRecord.completedChunks < fileRecord.totalChunks) {
      return c.json({
        error: 'Not all chunks uploaded',
        completedChunks: fileRecord.completedChunks,
        totalChunks: fileRecord.totalChunks,
      }, 400)
    }

    // Concatenate chunks into a single R2 object
    const chunks: Uint8Array[] = []
    for (let i = 0; i < fileRecord.totalChunks; i++) {
      const r2Key = `files/${uploadId}/chunk-${String(i).padStart(6, '0')}`
      const obj = await c.env.R2_BUCKET.get(r2Key)
      if (!obj) {
        return c.json({ error: `Missing chunk ${i}` }, 500)
      }
      chunks.push(new Uint8Array(await obj.arrayBuffer()))
    }

    // Write assembled file
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const assembled = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      assembled.set(chunk, offset)
      offset += chunk.length
    }

    const completeStorageBreaker = getCircuitBreaker({
      name: 'blob:r2',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    })

    await completeStorageBreaker.execute(() =>
      withRetry(
        () => c.env.R2_BUCKET.put(`files/${uploadId}/content`, assembled),
        {
          maxAttempts: 3,
          baseDelayMs: 300,
          maxDelayMs: 3000,
          isRetryable: isRetryableError,
          onRetry: (attempt, error) => {
            logger.warn(`R2 put content retry ${attempt}`, { error })
            incCounter('llamenos_retry_attempts_total', { service: 'blob', operation: 'put' })
          },
        },
      )
    )

    // Store envelopes and metadata in R2
    await withRetry(
      async () => {
        await c.env.R2_BUCKET.put(`files/${uploadId}/envelopes`, JSON.stringify(fileRecord.recipientEnvelopes))
        await c.env.R2_BUCKET.put(`files/${uploadId}/metadata`, JSON.stringify(fileRecord.encryptedMetadata))
      },
      {
        maxAttempts: 3,
        baseDelayMs: 200,
        maxDelayMs: 2000,
        isRetryable: isRetryableError,
        onRetry: (attempt) => {
            logger.warn(`R2 put envelopes/metadata retry ${attempt}`)
            incCounter('llamenos_retry_attempts_total', { service: 'blob', operation: 'put' })
        },
      },
    )

    // Clean up individual chunks
    for (let i = 0; i < fileRecord.totalChunks; i++) {
      const r2Key = `files/${uploadId}/chunk-${String(i).padStart(6, '0')}`
      await c.env.R2_BUCKET.delete(r2Key)
    }

    // Mark file as complete via service
    await services.conversations.markFileComplete(uploadId)

    await audit(services.audit, 'fileUploadCompleted', pubkey, { uploadId })

    return c.json({ fileId: uploadId, status: 'complete' })
  },
)

// Get upload status (for resume)
uploads.get('/:id/status',
  describeRoute({
    tags: ['Uploads'],
    summary: 'Get upload status for resume',
    responses: {
      200: {
        description: 'Upload status',
        content: {
          'application/json': {
            schema: resolver(uploadStatusResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const uploadId = c.req.param('id')
    const services = c.get('services')

    const fileRecord = await services.conversations.getFile(uploadId)

    // Only allow the uploader or users with download-all to check status
    if (fileRecord.uploadedBy !== pubkey && !checkPermission(permissions, 'files:download-all')) {
      return c.json({ error: 'Upload not found' }, 404)
    }
    return c.json({
      uploadId: fileRecord.id,
      status: fileRecord.status,
      completedChunks: fileRecord.completedChunks,
      totalChunks: fileRecord.totalChunks,
      totalSize: fileRecord.totalSize,
    })
  },
)

export default uploads
