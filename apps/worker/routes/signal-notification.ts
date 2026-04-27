/**
 * Signal notification API routes.
 *
 * GET    /api/signal-notification/contact         — get own contact (ciphertext + envelope)
 * PUT    /api/signal-notification/contact         — register / update contact
 * DELETE /api/signal-notification/contact         — unregister contact
 * GET    /api/signal-notification/hmac-key        — get per-user HMAC key
 * GET    /api/signal-notification/security-prefs  — get security prefs
 * PATCH  /api/signal-notification/security-prefs  — update security prefs
 * POST   /api/signal-notification/digest/run      — trigger digest (admin only)
 */
import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { authErrors } from '../openapi/helpers'
import {
  signalContactRegistrationSchema,
  securityPrefsPatchSchema,
} from '@protocol/schemas/signal-notification'
import { normalizeSignalIdentifier } from '../services/signal-identifier-normalize'
import { createLogger } from '../lib/logger'

const log = createLogger('routes.signal-notification')

const signalNotificationRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// GET /contact — retrieve own Signal contact record (encrypted)
// ---------------------------------------------------------------------------

signalNotificationRoutes.get('/contact',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Get own Signal contact registration',
    responses: {
      200: { description: 'Signal contact record (ciphertext + envelopes)' },
      404: { description: 'No Signal contact registered' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    const contact = await services.signalContacts.findByUser(pubkey)
    if (!contact) return c.json({ error: 'No Signal contact registered' }, 404)

    return c.json({
      identifierHash: contact.identifierHash,
      identifierCiphertext: contact.identifierCiphertext,
      identifierEnvelope: contact.identifierEnvelope,
      identifierType: contact.identifierType,
      verifiedAt: contact.verifiedAt?.toISOString() ?? null,
      updatedAt: contact.updatedAt.toISOString(),
    })
  }
)

// ---------------------------------------------------------------------------
// PUT /contact — register or update Signal contact
// ---------------------------------------------------------------------------

signalNotificationRoutes.put('/contact',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Register or update Signal contact',
    description:
      'The client hashes the Signal identifier locally using the per-user HMAC key ' +
      '(fetched from GET /hmac-key) and sends only the hash + encrypted ciphertext. ' +
      'The plaintext is sent separately to the sidecar POST /api/register endpoint ' +
      'via the app server proxy.',
    responses: {
      200: { description: 'Contact registered' },
      502: { description: 'Sidecar registration failed' },
      ...authErrors,
    },
  }),
  validator('json', signalContactRegistrationSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    // Store the encrypted contact in the main DB (zero-knowledge: no plaintext)
    await services.signalContacts.upsert({
      userPubkey: pubkey,
      identifierHash: body.identifierHash,
      identifierCiphertext: body.identifierCiphertext,
      identifierEnvelope: body.identifierEnvelope,
      identifierType: body.identifierType,
    })

    return c.json({ ok: true })
  }
)

// ---------------------------------------------------------------------------
// POST /contact/sidecar-register — proxy plaintext to sidecar (server-side only)
// This is called by the client AFTER PUT /contact to register the plaintext.
// We keep the plaintext route separate so the server's auth validates the user
// before forwarding to the sidecar.
// ---------------------------------------------------------------------------

signalNotificationRoutes.post('/contact/sidecar-register',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Register plaintext identifier with the sidecar (server-proxied)',
    description:
      'The client sends the plaintext Signal identifier here. The server validates ' +
      'the user owns this contact (checks hash matches), then proxies to the sidecar.',
    responses: {
      200: { description: 'Registered with sidecar' },
      502: { description: 'Sidecar unreachable' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    let body: { plaintextIdentifier: string; identifierType: 'phone' | 'username' }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    if (!body.plaintextIdentifier || !body.identifierType) {
      return c.json({ error: 'plaintextIdentifier and identifierType are required' }, 400)
    }
    if (body.identifierType !== 'phone' && body.identifierType !== 'username') {
      return c.json({ error: 'identifierType must be phone or username' }, 400)
    }

    // Verify the user has a registered contact to prevent unauthorized sidecar writes
    const contact = await services.signalContacts.findByUser(pubkey)
    if (!contact) {
      return c.json({ error: 'No Signal contact registered for this user' }, 400)
    }

    // Re-derive the hash to verify the plaintext matches what's stored
    const normalized = normalizeSignalIdentifier(body.plaintextIdentifier, body.identifierType)
    const expectedHash = services.signalContacts.hashIdentifierForUser(normalized, pubkey)
    if (expectedHash !== contact.identifierHash) {
      return c.json({ error: 'Plaintext does not match stored hash' }, 400)
    }

    const result = await services.userNotifications.registerWithSidecar(
      contact.identifierHash,
      body.plaintextIdentifier,
      body.identifierType
    )

    if (!result.ok) {
      log.warn('Sidecar registration failed', { userPubkey: pubkey, error: result.error })
      return c.json({ error: 'Sidecar registration failed', detail: result.error }, 502)
    }

    return c.json({ ok: true })
  }
)

// ---------------------------------------------------------------------------
// DELETE /contact — unregister Signal contact
// ---------------------------------------------------------------------------

signalNotificationRoutes.delete('/contact',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Unregister Signal contact',
    responses: {
      204: { description: 'Contact removed' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    // Fetch before deleting so we can unregister from sidecar
    const contact = await services.signalContacts.findByUser(pubkey)
    if (contact) {
      await services.userNotifications.unregisterFromSidecar(contact.identifierHash)
    }

    await services.signalContacts.deleteByUser(pubkey)
    return c.body(null, 204)
  }
)

// ---------------------------------------------------------------------------
// GET /hmac-key — return per-user HMAC key for client-side hashing
// ---------------------------------------------------------------------------

signalNotificationRoutes.get('/hmac-key',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Get per-user HMAC key for client-side identifier hashing',
    responses: {
      200: { description: 'HMAC key (hex)' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    const hmacKey = services.signalContacts.getPerUserHmacKey(pubkey)
    return c.json({ hmacKey })
  }
)

// ---------------------------------------------------------------------------
// GET /security-prefs — get security preferences
// ---------------------------------------------------------------------------

signalNotificationRoutes.get('/security-prefs',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Get security notification preferences',
    responses: {
      200: { description: 'Security preferences' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    const prefs = await services.securityPrefs.get(pubkey)
    return c.json({
      notificationChannel: prefs.notificationChannel,
      disappearingTimerDays: prefs.disappearingTimerDays,
      digestCadence: prefs.digestCadence,
      alertOnNewDevice: prefs.alertOnNewDevice,
      alertOnPasskeyChange: prefs.alertOnPasskeyChange,
      alertOnPinChange: prefs.alertOnPinChange,
      updatedAt: prefs.updatedAt.toISOString(),
    })
  }
)

// ---------------------------------------------------------------------------
// PATCH /security-prefs — update security preferences
// ---------------------------------------------------------------------------

signalNotificationRoutes.patch('/security-prefs',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Update security notification preferences',
    responses: {
      200: { description: 'Updated preferences' },
      ...authErrors,
    },
  }),
  validator('json', securityPrefsPatchSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const prefs = await services.securityPrefs.update(pubkey, body)
    return c.json({
      notificationChannel: prefs.notificationChannel,
      disappearingTimerDays: prefs.disappearingTimerDays,
      digestCadence: prefs.digestCadence,
      alertOnNewDevice: prefs.alertOnNewDevice,
      alertOnPasskeyChange: prefs.alertOnPasskeyChange,
      alertOnPinChange: prefs.alertOnPinChange,
      updatedAt: prefs.updatedAt.toISOString(),
    })
  }
)

// ---------------------------------------------------------------------------
// POST /digest/run — trigger a digest run (admin only)
// ---------------------------------------------------------------------------

signalNotificationRoutes.post('/digest/run',
  describeRoute({
    tags: ['Signal Notifications'],
    summary: 'Trigger a digest run (admin only)',
    responses: {
      200: { description: 'Digest results' },
      ...authErrors,
    },
  }),
  async (c) => {
    const permissions = c.get('permissions')
    if (!permissions.includes('system:admin')) {
      return c.json({ error: 'Admin access required' }, 403)
    }

    const services = c.get('services')
    let body: { cadence?: string }
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }

    const cadence = body.cadence === 'daily' ? 'daily' : 'weekly'
    const result = await services.digestCron.runDigests(cadence)
    return c.json(result)
  }
)

export default signalNotificationRoutes
