import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv, WebAuthnCredential } from '../types'
import { getDOs } from '../lib/do-access'
import { hashIP } from '../lib/crypto'
import { isValidE164, checkRateLimit } from '../lib/helpers'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { checkPermission } from '../middleware/permission-guard'
import { loginBodySchema, bootstrapBodySchema, profileUpdateBodySchema, availabilityBodySchema, transcriptionToggleBodySchema } from '../schemas/auth'
import { loginResponseSchema, meResponseSchema, okResponseSchema } from '../schemas/responses'
import { publicErrors, authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { getPrimaryRole } from '@shared/permissions'
import { deriveServerEventKey } from '../lib/hub-event-crypto'
import { bytesToHex } from '@noble/hashes/utils.js'

const auth = new Hono<AppEnv>()

// --- Login (no auth) ---
auth.post('/login',
  describeRoute({
    tags: ['Auth'],
    summary: 'Authenticate with Schnorr signature',
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: resolver(loginResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  validator('json', loginBodySchema),
  async (c) => {
    const dos = getDOs(c.env)

    // Rate limit login attempts by IP (skip in development for testing)
    if (c.env.ENVIRONMENT !== 'development') {
      const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
      const limited = await checkRateLimit(dos.settings, `auth:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 10)
      if (limited) {
        return c.json({ error: 'Too many login attempts. Try again later.' }, 429)
      }
    }

    const body = c.req.valid('json')

    // Verify Schnorr signature before returning any user information
    const url = new URL(c.req.url)
    const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, url.pathname)
    if (!isValid) return c.json({ error: 'Invalid credentials' }, 401)

    const res = await dos.identity.fetch(new Request(`http://do/volunteer/${body.pubkey}`))
    if (!res.ok) return c.json({ error: 'Invalid credentials' }, 401)
    const volunteer = await res.json() as { roles: string[] }
    return c.json({ ok: true, roles: volunteer.roles })
  },
)

// --- Bootstrap (no auth — one-shot admin registration) ---
auth.post('/bootstrap',
  describeRoute({
    tags: ['Auth'],
    summary: 'One-shot admin bootstrap registration',
    responses: {
      200: {
        description: 'Bootstrap successful',
        content: {
          'application/json': {
            schema: resolver(loginResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  validator('json', bootstrapBodySchema),
  async (c) => {
    const dos = getDOs(c.env)

    // Rate limit by IP
    if (c.env.ENVIRONMENT !== 'development') {
      const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
      const limited = await checkRateLimit(dos.settings, `bootstrap:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
      if (limited) {
        return c.json({ error: 'Too many attempts. Try again later.' }, 429)
      }
    }

    const body = c.req.valid('json')

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
  },
)

// --- Authenticated routes ---
auth.use('/me', authMiddleware)
auth.use('/me/*', authMiddleware)

auth.get('/me',
  describeRoute({
    tags: ['Auth'],
    summary: 'Get current user profile and permissions',
    responses: {
      200: {
        description: 'Current user profile',
        content: {
          'application/json': {
            schema: resolver(meResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
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

    // Derive server event key for client-side decryption of encrypted relay events (Epic 252)
    // Moved here from /api/config to keep it behind authentication (Epic 258 C2)
    const serverEventKeyHex = c.env.SERVER_NOSTR_SECRET
      ? bytesToHex(deriveServerEventKey(c.env.SERVER_NOSTR_SECRET))
      : undefined

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
      // H17: Removed adminPubkey (signing key identity) — only decryption pubkey needed
      adminDecryptionPubkey: c.env.ADMIN_DECRYPTION_PUBKEY || c.env.ADMIN_PUBKEY,
      serverEventKeyHex,
    })
  },
)

auth.post('/me/logout',
  describeRoute({
    tags: ['Auth'],
    summary: 'Logout and revoke session token',
    responses: {
      200: {
        description: 'Logged out',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
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
  },
)

auth.patch('/me/profile',
  describeRoute({
    tags: ['Auth'],
    summary: 'Update own profile',
    responses: {
      200: {
        description: 'Profile updated',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', profileUpdateBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    if (body.phone && !isValidE164(body.phone)) {
      return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
    }
    await dos.identity.fetch(new Request(`http://do/volunteers/${pubkey}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    return c.json({ ok: true })
  },
)

auth.patch('/me/availability',
  describeRoute({
    tags: ['Auth'],
    summary: 'Update availability (on break / available)',
    responses: {
      200: {
        description: 'Availability updated',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', availabilityBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    await dos.identity.fetch(new Request(`http://do/volunteers/${pubkey}`, {
      method: 'PATCH',
      body: JSON.stringify({ onBreak: body.onBreak }),
    }))
    await audit(dos.records, body.onBreak ? 'volunteerOnBreak' : 'volunteerAvailable', pubkey)
    return c.json({ ok: true })
  },
)

auth.patch('/me/transcription',
  describeRoute({
    tags: ['Auth'],
    summary: 'Toggle transcription preference',
    responses: {
      200: {
        description: 'Transcription preference updated',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', transcriptionToggleBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const body = c.req.valid('json')
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
  },
)

export default auth
