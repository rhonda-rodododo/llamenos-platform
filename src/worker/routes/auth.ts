import { Hono } from 'hono'
import type { AppEnv, WebAuthnCredential } from '../types'
import { getDOs } from '../lib/do-access'
import { hashIP } from '../lib/crypto'
import { isValidE164, checkRateLimit } from '../lib/helpers'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { checkPermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { getPrimaryRole } from '../../shared/permissions'

const auth = new Hono<AppEnv>()

// --- Login (no auth) ---
auth.post('/login', async (c) => {
  const dos = getDOs(c.env)

  // Rate limit login attempts by IP (skip in development for testing)
  if (c.env.ENVIRONMENT !== 'development') {
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `auth:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 10)
    if (limited) {
      return c.json({ error: 'Too many login attempts. Try again later.' }, 429)
    }
  }

  const body = await c.req.json() as { pubkey: string; timestamp: number; token: string }
  // Verify Schnorr signature before returning any user information
  if (!body.pubkey || !body.timestamp || !body.token) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  const url = new URL(c.req.url)
  const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, url.pathname)
  if (!isValid) return c.json({ error: 'Invalid credentials' }, 401)

  const res = await dos.identity.fetch(new Request(`http://do/volunteer/${body.pubkey}`))
  if (!res.ok) return c.json({ error: 'Invalid credentials' }, 401)
  const volunteer = await res.json() as { roles: string[] }
  return c.json({ ok: true, roles: volunteer.roles })
})

// --- Bootstrap (no auth — one-shot admin registration) ---
auth.post('/bootstrap', async (c) => {
  const dos = getDOs(c.env)

  // Rate limit by IP
  if (c.env.ENVIRONMENT !== 'development') {
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `bootstrap:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
    if (limited) {
      return c.json({ error: 'Too many attempts. Try again later.' }, 429)
    }
  }

  const body = await c.req.json() as { pubkey: string; timestamp: number; token: string }
  if (!body.pubkey || !body.timestamp || !body.token) {
    return c.json({ error: 'Invalid request' }, 400)
  }

  // Verify Schnorr signature — proves caller owns the private key
  const bootstrapUrl = new URL(c.req.url)
  const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, bootstrapUrl.pathname)
  if (!isValid) return c.json({ error: 'Invalid signature' }, 401)

  // Check if admin already exists
  const checkRes = await dos.identity.fetch(new Request('http://do/has-admin'))
  const { hasAdmin } = await checkRes.json() as { hasAdmin: boolean }
  if (hasAdmin) {
    return c.json({ error: 'Admin already exists' }, 403)
  }

  // Create the admin
  const bootstrapRes = await dos.identity.fetch(new Request('http://do/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ pubkey: body.pubkey }),
  }))
  if (!bootstrapRes.ok) {
    return c.json({ error: 'Bootstrap failed' }, 500)
  }

  return c.json({ ok: true, roles: ['role-super-admin'] })
})

// --- Authenticated routes ---
auth.use('/me', authMiddleware)
auth.use('/me/*', authMiddleware)

auth.get('/me', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const volunteer = c.get('volunteer')
  const permissions = c.get('permissions')
  const allRoles = c.get('allRoles')

  const credsRes = await dos.identity.fetch(new Request(`http://do/webauthn/credentials?pubkey=${pubkey}`))
  const { credentials: webauthnCreds } = await credsRes.json() as { credentials: WebAuthnCredential[] }
  const settingsRes = await dos.identity.fetch(new Request('http://do/settings/webauthn'))
  const webauthnSettings = await settingsRes.json() as { requireForAdmins: boolean; requireForVolunteers: boolean }

  const isAdmin = checkPermission(permissions, 'settings:manage')
  const webauthnRequired = isAdmin ? webauthnSettings.requireForAdmins : webauthnSettings.requireForVolunteers

  const primaryRole = getPrimaryRole(volunteer.roles, allRoles)

  return c.json({
    pubkey: volunteer.pubkey,
    roles: volunteer.roles,
    permissions,
    primaryRole: primaryRole ? { id: primaryRole.id, name: primaryRole.name, slug: primaryRole.slug } : null,
    name: volunteer.name,
    transcriptionEnabled: volunteer.transcriptionEnabled,
    spokenLanguages: volunteer.spokenLanguages || ['en'],
    uiLanguage: volunteer.uiLanguage || 'en',
    profileCompleted: volunteer.profileCompleted ?? true,
    onBreak: volunteer.onBreak ?? false,
    callPreference: volunteer.callPreference ?? 'phone',
    webauthnRequired,
    webauthnRegistered: webauthnCreds.length > 0,
    adminPubkey: c.env.ADMIN_PUBKEY,
    adminDecryptionPubkey: c.env.ADMIN_DECRYPTION_PUBKEY || c.env.ADMIN_PUBKEY,
  })
})

auth.post('/me/logout', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const authHeader = c.req.header('Authorization') || ''
  // Revoke the session token if using session-based auth
  if (authHeader.startsWith('Session ')) {
    const token = authHeader.slice(8).trim()
    await dos.identity.fetch(new Request(`http://do/sessions/revoke/${token}`, { method: 'DELETE' }))
  }
  await audit(dos.records, 'logout', pubkey)
  return c.json({ ok: true })
})

auth.patch('/me/profile', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { name?: string; phone?: string; spokenLanguages?: string[]; uiLanguage?: string; profileCompleted?: boolean; callPreference?: 'phone' | 'browser' | 'both' }
  if (body.phone && !isValidE164(body.phone)) {
    return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
  }
  await dos.identity.fetch(new Request(`http://do/volunteers/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  return c.json({ ok: true })
})

auth.patch('/me/availability', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json() as { onBreak: boolean }
  await dos.identity.fetch(new Request(`http://do/volunteers/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify({ onBreak: body.onBreak }),
  }))
  await audit(dos.records, body.onBreak ? 'volunteerOnBreak' : 'volunteerAvailable', pubkey)
  return c.json({ ok: true })
})

auth.patch('/me/transcription', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const permissions = c.get('permissions')
  const body = await c.req.json() as { enabled: boolean }
  // If volunteer is trying to disable, check if admin allows opt-out
  if (!body.enabled && !checkPermission(permissions, 'settings:manage-transcription')) {
    const transRes = await dos.settings.fetch(new Request('http://do/settings/transcription'))
    const transSettings = await transRes.json() as { globalEnabled: boolean; allowVolunteerOptOut: boolean }
    if (!transSettings.allowVolunteerOptOut) {
      return c.json({ error: 'Transcription opt-out is not allowed' }, 403)
    }
  }
  await dos.identity.fetch(new Request(`http://do/volunteers/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify({ transcriptionEnabled: body.enabled }),
  }))
  await audit(dos.records, 'transcriptionToggled', pubkey, { enabled: body.enabled })
  return c.json({ ok: true })
})

export default auth
