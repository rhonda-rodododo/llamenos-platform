import { Hono } from 'hono'
import type { AppEnv, UserRole } from '../types'
import { getDOs } from '../lib/do-access'
import { isValidE164, checkRateLimit } from '../lib/helpers'
import { hashIP } from '../lib/crypto'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { adminGuard } from '../middleware/admin-guard'
import { audit } from '../services/audit'

const invites = new Hono<AppEnv>()

// --- Public routes (no auth) ---

invites.get('/validate/:code', async (c) => {
  const dos = getDOs(c.env)
  const code = c.req.param('code')
  // Rate limit invite validation to prevent enumeration
  const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
  const limited = await checkRateLimit(dos.settings, `invite-validate:${hashIP(clientIp)}`, 5)
  if (limited) return c.json({ error: 'Too many requests' }, 429)
  return dos.identity.fetch(new Request(`http://do/invites/validate/${code}`))
})

invites.post('/redeem', async (c) => {
  const dos = getDOs(c.env)
  const body = await c.req.json() as { code: string; pubkey: string; timestamp: number; token: string }

  // Require proof of private key possession via Schnorr signature
  if (!body.pubkey || !body.timestamp || !body.token) {
    return c.json({ error: 'Signature proof required' }, 400)
  }
  const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token })
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Rate limit redemption attempts
  const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
  const limited = await checkRateLimit(dos.settings, `invite-redeem:${hashIP(clientIp)}`, 5)
  if (limited) return c.json({ error: 'Too many requests' }, 429)

  return dos.identity.fetch(new Request('http://do/invites/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: body.code, pubkey: body.pubkey }),
  }))
})

// --- Admin routes ---
invites.use('/', authMiddleware, adminGuard)
invites.use('/:code', authMiddleware, adminGuard)

invites.get('/', async (c) => {
  const dos = getDOs(c.env)
  return dos.identity.fetch(new Request('http://do/invites'))
})

invites.post('/', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { name: string; phone: string; role: UserRole }
  if (body.phone && !isValidE164(body.phone)) {
    return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
  }
  const res = await dos.identity.fetch(new Request('http://do/invites', {
    method: 'POST',
    body: JSON.stringify({ ...body, createdBy: pubkey }),
  }))
  if (res.ok) await audit(dos.records, 'inviteCreated', pubkey, { name: body.name })
  return res
})

invites.delete('/:code', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const code = c.req.param('code')
  const res = await dos.identity.fetch(new Request(`http://do/invites/${code}`, { method: 'DELETE' }))
  if (res.ok) await audit(dos.records, 'inviteRevoked', pubkey, { code })
  return res
})

export default invites
