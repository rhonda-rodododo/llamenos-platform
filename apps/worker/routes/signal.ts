/**
 * Signal-specific admin routes for identity trust management
 * and message queue monitoring.
 *
 * All routes require admin permissions.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { SignalIdentityService } from '../messaging/signal/identity'
import { SignalMessageQueue } from '../messaging/signal/queue'
import { getDb } from '../db'
import { audit } from '../services/audit'

const signal = new Hono<AppEnv>()

// --- Identity Trust Management ---

signal.get('/identities', requirePermission('settings:manage-messaging'),
  async (c) => {
    const hubId = c.req.query('hub') || ''
    const db = getDb()
    const identityService = new SignalIdentityService(db)
    const identities = await identityService.getIdentities(hubId)
    return c.json({ identities })
  })

signal.get('/identities/untrusted', requirePermission('settings:manage-messaging'),
  async (c) => {
    const hubId = c.req.query('hub') || ''
    const db = getDb()
    const identityService = new SignalIdentityService(db)
    const identities = await identityService.getUntrustedIdentities(hubId)
    return c.json({ identities })
  })

signal.post('/identities/trust', requirePermission('settings:manage-messaging'),
  async (c) => {
    const body = await c.req.json<{ uuid: string; trustLevel: string; hubId?: string }>()
    const { uuid, trustLevel, hubId } = body
    const user = c.get('user')

    if (!uuid || !trustLevel) {
      return c.json({ error: 'uuid and trustLevel are required' }, 400)
    }

    const validLevels = ['UNTRUSTED', 'TRUSTED_UNVERIFIED', 'TRUSTED_VERIFIED']
    if (!validLevels.includes(trustLevel)) {
      return c.json({ error: `trustLevel must be one of: ${validLevels.join(', ')}` }, 400)
    }

    const services = c.get('services')
    const db = getDb()
    const identityService = new SignalIdentityService(db)

    const success = await identityService.setTrustLevel({
      hubId: hubId || '',
      uuid,
      trustLevel: trustLevel as 'UNTRUSTED' | 'TRUSTED_UNVERIFIED' | 'TRUSTED_VERIFIED',
      verifierPubkey: user.pubkey,
    })

    if (success) {
      await audit(services.audit, 'signalIdentityTrustChanged', user.pubkey, {
        uuid: uuid.slice(0, 8),
        trustLevel,
      })
    }

    return c.json({ success })
  })

// --- Message Queue Monitoring ---

signal.get('/queue/stats', requirePermission('settings:manage-messaging'),
  async (c) => {
    const hubId = c.req.query('hub') || undefined
    const db = getDb()
    const queue = new SignalMessageQueue(db)
    const stats = await queue.getStats(hubId)
    return c.json(stats)
  })

signal.get('/queue/dead-letters', requirePermission('settings:manage-messaging'),
  async (c) => {
    const hubId = c.req.query('hub') || undefined
    const db = getDb()
    const queue = new SignalMessageQueue(db)
    const deadLetters = await queue.getDeadLetters(hubId)
    return c.json({ deadLetters })
  })

signal.post('/queue/retry/:id', requirePermission('settings:manage-messaging'),
  async (c) => {
    const messageId = c.req.param('id')
    const services = c.get('services')
    const db = getDb()
    const queue = new SignalMessageQueue(db)
    const success = await queue.retryDeadLetter(messageId)

    if (success) {
      const user = c.get('user')
      await audit(services.audit, 'signalQueueMessageRetried', user.pubkey, { messageId })
    }

    return c.json({ success })
  })

export default signal
