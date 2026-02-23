import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { FileRecord, UploadInit } from '../../shared/types'
import { getDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const uploads = new Hono<AppEnv>()
uploads.use('*', requirePermission('files:upload'))

// Initialize an upload — returns uploadId and chunk upload URLs
uploads.post('/init', async (c) => {
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as UploadInit
  const dos = getDOs(c.env)

  if (!body.totalSize || !body.totalChunks || !body.conversationId) {
    return c.json({ error: 'Missing required fields: totalSize, totalChunks, conversationId' }, 400)
  }

  if (body.totalChunks > 10000) {
    return c.json({ error: 'Too many chunks (max 10000)' }, 400)
  }

  const uploadId = crypto.randomUUID()

  const fileRecord: FileRecord = {
    id: uploadId,
    conversationId: body.conversationId,
    uploadedBy: pubkey,
    recipientEnvelopes: body.recipientEnvelopes || [],
    encryptedMetadata: body.encryptedMetadata || [],
    totalSize: body.totalSize,
    totalChunks: body.totalChunks,
    status: 'uploading',
    completedChunks: 0,
    createdAt: new Date().toISOString(),
  }

  // Store file record in ConversationDO
  const res = await dos.conversations.fetch(new Request('http://do/files', {
    method: 'POST',
    body: JSON.stringify(fileRecord),
  }))

  if (!res.ok) {
    return c.json({ error: 'Failed to initialize upload' }, 500)
  }

  await audit(dos.records, 'fileUploadStarted', pubkey, {
    uploadId,
    conversationId: body.conversationId,
    totalSize: body.totalSize,
    totalChunks: body.totalChunks,
  })

  return c.json({ uploadId, totalChunks: body.totalChunks })
})

// Upload a chunk
uploads.put('/:id/chunks/:chunkIndex', async (c) => {
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const uploadId = c.req.param('id')
  const chunkIndex = parseInt(c.req.param('chunkIndex'), 10)

  if (isNaN(chunkIndex) || chunkIndex < 0) {
    return c.json({ error: 'Invalid chunk index' }, 400)
  }

  // Verify ownership before accepting chunk
  const dos = getDOs(c.env)
  const ownerRes = await dos.conversations.fetch(new Request(`http://do/files/${uploadId}`))
  if (!ownerRes.ok) {
    return c.json({ error: 'Upload not found' }, 404)
  }
  const fileRecord = await ownerRes.json() as FileRecord
  if (fileRecord.uploadedBy !== pubkey && !checkPermission(permissions, 'files:download-all')) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Store chunk directly in R2
  const body = await c.req.arrayBuffer()
  if (!body || body.byteLength === 0) {
    return c.json({ error: 'Empty chunk' }, 400)
  }

  const r2Key = `files/${uploadId}/chunk-${String(chunkIndex).padStart(6, '0')}`
  await c.env.R2_BUCKET.put(r2Key, body)

  // Update completion count in ConversationDO
  const res = await dos.conversations.fetch(new Request(`http://do/files/${uploadId}/chunk-complete`, {
    method: 'POST',
    body: JSON.stringify({ chunkIndex }),
  }))

  if (!res.ok) {
    return c.json({ error: 'Failed to record chunk' }, 500)
  }

  const result = await res.json() as { completedChunks: number; totalChunks: number }
  return c.json({ chunkIndex, completedChunks: result.completedChunks, totalChunks: result.totalChunks })
})

// Complete an upload — assembles chunks
uploads.post('/:id/complete', async (c) => {
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const uploadId = c.req.param('id')
  const dos = getDOs(c.env)

  // Verify all chunks are uploaded
  const statusRes = await dos.conversations.fetch(new Request(`http://do/files/${uploadId}`))
  if (!statusRes.ok) {
    return c.json({ error: 'Upload not found' }, 404)
  }

  const fileRecord = await statusRes.json() as FileRecord

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

  await c.env.R2_BUCKET.put(`files/${uploadId}/content`, assembled)

  // Store envelopes and metadata in R2
  await c.env.R2_BUCKET.put(`files/${uploadId}/envelopes`, JSON.stringify(fileRecord.recipientEnvelopes))
  await c.env.R2_BUCKET.put(`files/${uploadId}/metadata`, JSON.stringify(fileRecord.encryptedMetadata))

  // Clean up individual chunks
  for (let i = 0; i < fileRecord.totalChunks; i++) {
    const r2Key = `files/${uploadId}/chunk-${String(i).padStart(6, '0')}`
    await c.env.R2_BUCKET.delete(r2Key)
  }

  // Mark file as complete
  const completeRes = await dos.conversations.fetch(new Request(`http://do/files/${uploadId}/complete`, {
    method: 'POST',
  }))

  if (!completeRes.ok) {
    return c.json({ error: 'Failed to complete upload' }, 500)
  }

  await audit(dos.records, 'fileUploadCompleted', pubkey, { uploadId })

  return c.json({ fileId: uploadId, status: 'complete' })
})

// Get upload status (for resume)
uploads.get('/:id/status', async (c) => {
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const uploadId = c.req.param('id')
  const dos = getDOs(c.env)

  const res = await dos.conversations.fetch(new Request(`http://do/files/${uploadId}`))
  if (!res.ok) {
    return c.json({ error: 'Upload not found' }, 404)
  }

  const fileRecord = await res.json() as FileRecord
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
})

export default uploads
