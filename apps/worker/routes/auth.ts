import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { hashIP } from '../lib/crypto'
import { isValidE164, checkRateLimit } from '../lib/helpers'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { checkPermission } from '../middleware/permission-guard'
import { loginBodySchema, bootstrapBodySchema, profileUpdateBodySchema, availabilityBodySchema, transcriptionToggleBodySchema } from '@protocol/schemas/auth'
import { loginResponseSchema, meResponseSchema } from '@protocol/schemas/auth'
import { okResponseSchema } from '@protocol/schemas/common'
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
    const services = c.get('services')

    // Rate limit login attempts by IP (skip in development for testing)
    if (c.env.ENVIRONMENT !== 'development') {
      const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
      const limited = await checkRateLimit(services.settings, `auth:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 10)
      if (limited) {
        return c.json({ error: 'Too many login attempts. Try again later.' }, 429)
      }
    }

    const body = c.req.valid('json')

    // Verify Schnorr signature before returning any user information
    const url = new URL(c.req.url)
    const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, url.pathname)
    if (!isValid) return c.json({ error: 'Invalid credentials' }, 401)

    try {
      const volunteer = await services.identity.getUser(body.pubkey)
      return c.json({ ok: true, roles: volunteer.roles })
    } catch {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
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
    const services = c.get('services')

    // Rate limit by IP
    if (c.env.ENVIRONMENT !== 'development') {
      const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
      const limited = await checkRateLimit(services.settings, `bootstrap:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
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
    const { hasAdmin } = await services.identity.hasAdmin()
    if (hasAdmin) {
      return c.json({ error: 'Admin already exists' }, 403)
    }

    // Create the admin
    await services.identity.bootstrapAdmin(body.pubkey)

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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const user = c.get('user')
    const permissions = c.get('permissions')
    const allRoles = c.get('allRoles')

    const { credentials: webauthnCreds } = await services.identity.getWebAuthnCredentials(pubkey)
    const webauthnSettings = await services.identity.getWebAuthnSettings()

    const isAdmin = checkPermission(permissions, 'settings:manage')
    const webauthnRequired = isAdmin ? webauthnSettings.requireForAdmins : webauthnSettings.requireForVolunteers

    const primaryRole = getPrimaryRole(user.roles, allRoles)

    // Derive server event key for client-side decryption of encrypted relay events (Epic 252)
    // Moved here from /api/config to keep it behind authentication (Epic 258 C2)
    const serverEventKeyHex = c.env.SERVER_NOSTR_SECRET
      ? bytesToHex(deriveServerEventKey(c.env.SERVER_NOSTR_SECRET))
      : undefined

    return c.json({
      pubkey: user.pubkey,
      roles: user.roles,
      permissions,
      primaryRole: primaryRole ? { id: primaryRole.id, name: primaryRole.name, slug: primaryRole.slug } : null,
      name: user.name,
      transcriptionEnabled: user.transcriptionEnabled,
      spokenLanguages: user.spokenLanguages || ['en'],
      uiLanguage: user.uiLanguage || 'en',
      profileCompleted: user.profileCompleted ?? true,
      onBreak: user.onBreak ?? false,
      callPreference: user.callPreference ?? 'phone',
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const authHeader = c.req.header('Authorization') || ''
    // Revoke the session token if using session-based auth
    if (authHeader.startsWith('Session ')) {
      const token = authHeader.slice(8).trim()
      await services.identity.revokeSession(token)
    }
    await audit(services.audit, 'logout', pubkey)
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    if (body.phone && !isValidE164(body.phone)) {
      return c.json({ error: 'Invalid phone number. Use E.164 format (e.g. +12125551234)' }, 400)
    }
    await services.identity.updateUser(pubkey, body, false)
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    await services.identity.updateUser(pubkey, { onBreak: body.onBreak }, false)
    await audit(services.audit, body.onBreak ? 'volunteerOnBreak' : 'volunteerAvailable', pubkey)
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const body = c.req.valid('json')
    // If volunteer is trying to disable, check if admin allows opt-out
    if (!body.enabled && !checkPermission(permissions, 'settings:manage-transcription')) {
      const transSettings = await services.settings.getTranscriptionSettings()
      if (!transSettings.allowVolunteerOptOut) {
        return c.json({ error: 'Transcription opt-out is not allowed' }, 403)
      }
    }
    await services.identity.updateUser(pubkey, { transcriptionEnabled: body.enabled }, false)
    await audit(services.audit, 'transcriptionToggled', pubkey, { enabled: body.enabled })
    return c.json({ ok: true })
  },
)

export default auth
