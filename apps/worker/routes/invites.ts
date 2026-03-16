import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { checkRateLimit } from '../lib/helpers'
import { hashIP } from '../lib/crypto'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/permission-guard'
import { redeemInviteBodySchema, createInviteBodySchema } from '@protocol/schemas/invites'
import { okResponseSchema } from '@protocol/schemas/common'
import { publicErrors, authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { permissionGranted, resolvePermissions } from '@shared/permissions'
import type { Role } from '@shared/permissions'

const invites = new Hono<AppEnv>()

// --- Public routes (no auth) ---

invites.get('/validate/:code',
  describeRoute({
    tags: ['Invites'],
    summary: 'Validate an invite code',
    responses: {
      200: { description: 'Invite validation result' },
      ...publicErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const code = c.req.param('code')
    // Rate limit invite validation to prevent enumeration
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `invite-validate:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
    if (limited) return c.json({ error: 'Too many requests' }, 429)
    return dos.identity.fetch(new Request(`http://do/invites/validate/${code}`))
  },
)

invites.post('/redeem',
  describeRoute({
    tags: ['Invites'],
    summary: 'Redeem an invite code to register',
    responses: {
      200: {
        description: 'Invite redeemed',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  validator('json', redeemInviteBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const body = c.req.valid('json')

    // Verify Schnorr signature
    const inviteUrl = new URL(c.req.url)
    const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, inviteUrl.pathname)
    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401)
    }

    // Rate limit redemption attempts
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `invite-redeem:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
    if (limited) return c.json({ error: 'Too many requests' }, 429)

    return dos.identity.fetch(new Request('http://do/invites/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: body.code, pubkey: body.pubkey }),
    }))
  },
)

// --- Authenticated routes (require invites permissions) ---
invites.use('/', authMiddleware, requirePermission('invites:read'))
invites.use('/:code', authMiddleware, requirePermission('invites:read'))

invites.get('/',
  describeRoute({
    tags: ['Invites'],
    summary: 'List all invites',
    responses: {
      200: { description: 'List of invites' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.identity.fetch(new Request('http://do/invites'))
  },
)

invites.post('/',
  describeRoute({
    tags: ['Invites'],
    summary: 'Create a new invite',
    responses: {
      201: { description: 'Invite created' },
      ...authErrors,
    },
  }),
  requirePermission('invites:create'),
  validator('json', createInviteBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    // Validate that the creator can grant all requested roles (prevent privilege escalation)
    if (body.roleIds && body.roleIds.length > 0) {
      const creatorPermissions = c.get('permissions') as string[]
      if (!permissionGranted(creatorPermissions, '*')) {
        const allRoles = c.get('allRoles') as Role[]
        for (const roleId of body.roleIds) {
          const role = allRoles.find(r => r.id === roleId)
          if (!role) {
            return c.json({ error: `Unknown role: ${roleId}` }, 400)
          }
          for (const perm of role.permissions) {
            if (!permissionGranted(creatorPermissions, perm)) {
              return c.json({ error: `Cannot grant role '${role.name}' — you lack permission '${perm}'` }, 403)
            }
          }
        }
      }
    }

    const res = await dos.identity.fetch(new Request('http://do/invites', {
      method: 'POST',
      body: JSON.stringify({ ...body, createdBy: pubkey }),
    }))
    if (res.ok) await audit(dos.records, 'inviteCreated', pubkey, { name: body.name })
    return res
  },
)

invites.delete('/:code',
  describeRoute({
    tags: ['Invites'],
    summary: 'Revoke an invite',
    responses: {
      200: {
        description: 'Invite revoked',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('invites:revoke'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const code = c.req.param('code')
    const res = await dos.identity.fetch(new Request(`http://do/invites/${code}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'inviteRevoked', pubkey, { code })
    return res
  },
)

export default invites
