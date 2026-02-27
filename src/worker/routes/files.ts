import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { FileRecord, FileKeyEnvelope } from '../../shared/types'
import { getDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'

const files = new Hono<AppEnv>()

// Download encrypted file content
files.get('/:id/content', async (c) => {
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

  const obj = await c.env.R2_BUCKET.get(`files/${fileId}/content`)
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
files.get('/:id/envelopes', async (c) => {
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
files.get('/:id/metadata', async (c) => {
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
files.post('/:id/share', requirePermission('files:share'), async (c) => {
  const fileId = c.req.param('id')
  const pubkey = c.get('pubkey')

  const body = await c.req.json() as {
    envelope: FileKeyEnvelope
    encryptedMetadata: { pubkey: string; encryptedContent: string; ephemeralPubkey: string }
  }

  if (!body.envelope?.pubkey || !body.envelope?.encryptedFileKey || !body.envelope?.ephemeralPubkey) {
    return c.json({ error: 'Invalid envelope' }, 400)
  }

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
