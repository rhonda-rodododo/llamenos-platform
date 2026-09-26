import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { checkRateLimit } from '../lib/helpers'
import { hashIP, getClientIp } from '../lib/crypto'
import { verifyAuthToken } from '../lib/auth'
import { auth as authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/permission-guard'
import { redeemInviteBodySchema, createInviteBodySchema, inviteResponseSchema, inviteValidationResponseSchema, inviteListResponseSchema } from '@protocol/schemas/invites'
import { okResponseSchema } from '@protocol/schemas/common'
import { publicErrors, authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { permissionGranted, resolvePermissions, type Role } from '@shared/permissions'
import { checkRoleGrant } from '../lib/hub-scope'

const invites = new Hono<AppEnv>()

// --- Public routes (no auth) ---

invites.get('/validate/:code',
  describeRoute({
    tags: ['Invites'],
    summary: 'Validate an invite code',
    responses: {
      200: {
        description: 'Invite validation result',
        content: {
          'application/json': {
            schema: resolver(inviteValidationResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const code = c.req.param('code')
    // Rate limit invite validation to prevent enumeration
    const clientIp = getClientIp(c.req.raw)
    const limited = await checkRateLimit(services.settings, `invite-validate:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
    if (limited) return c.json({ error: 'Too many requests' }, 429)
    const result = await services.identity.validateInvite(code)
    return c.json(result)
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
    const services = c.get('services')
    const body = c.req.valid('json')

    // Verify Ed25519 auth token signature
    const inviteUrl = new URL(c.req.url)
    const isValid = await verifyAuthToken({ pubkey: body.pubkey, timestamp: body.timestamp, token: body.token }, c.req.method, inviteUrl.pathname)
    if (!isValid) {
      return c.json({ error: 'Authentication failed' }, 401)
    }

    // Rate limit redemption attempts
    const clientIp = getClientIp(c.req.raw)
    const limited = await checkRateLimit(services.settings, `invite-redeem:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 5)
    if (limited) return c.json({ error: 'Too many requests' }, 429)

    const result = await services.identity.redeemInvite({ code: body.code, pubkey: body.pubkey })
    return c.json(result)
  },
)

// --- Invite management (list / create / revoke) ---
//
// Invites are issued PER HUB (#1037): `/api/hubs/:hubId/invites` admits the
// invitee to that hub only, and redemption grants the invite's roles as a role
// assignment in that hub — never a global role. The same router is mounted
// unscoped at `/api/invites`, where it spans every hub (every invitee's name
// and phone), so there it is super-admin only and may issue only global
// super-admin invites.

/** True when every role grants the global wildcard — the only authority a hubless invite may carry. */
function onlySuperAdminRoles(roleIds: readonly string[], allRoles: Role[]): boolean {
  return roleIds.length > 0 && roleIds.every(id => permissionGranted(resolvePermissions([id], allRoles), '*'))
}

function inviteManagementRoutes(): Hono<AppEnv> {
  const management = new Hono<AppEnv>()

  management.get('/',
    describeRoute({
      tags: ['Invites'],
      summary: 'List unredeemed invites (for the hub in the path)',
      responses: {
        200: {
          description: 'Invites',
          content: {
            'application/json': {
              schema: resolver(inviteListResponseSchema),
            },
          },
        },
        ...authErrors,
      },
    }),
    requirePermission('invites:read'),
    async (c) => {
      const services = c.get('services')
      return c.json(await services.identity.getInvites(c.get('hubId')))
    },
  )

  management.post('/',
    describeRoute({
      tags: ['Invites'],
      summary: 'Create a new invite (admits the invitee to the hub in the path)',
      responses: {
        201: {
          description: 'Invite created',
          content: {
            'application/json': {
              schema: resolver(inviteResponseSchema),
            },
          },
        },
        ...authErrors,
      },
    }),
    requirePermission('invites:create'),
    validator('json', createInviteBodySchema),
    async (c) => {
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const body = c.req.valid('json')
      const hubId = c.get('hubId') ?? null

      if (!hubId && !onlySuperAdminRoles(body.roleIds, c.get('allRoles'))) {
        return c.json({
          error: 'Invites that grant hub roles are issued per hub: POST /api/hubs/:hubId/invites',
        }, 400)
      }

      // The creator must already hold every permission they grant (prevents privilege escalation)
      const denied = checkRoleGrant(c, body.roleIds)
      if (denied) return c.json({ error: denied.error }, denied.status)

      const result = await services.identity.createInvite({ ...body, createdBy: pubkey, hubId })
      await audit(services.audit, 'inviteCreated', pubkey, { name: body.name }, undefined, hubId)
      return c.json(result, 201)
    },
  )

  management.delete('/:code',
    describeRoute({
      tags: ['Invites'],
      summary: 'Revoke an invite (issued for the hub in the path)',
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
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const code = c.req.param('code')
      const hubId = c.get('hubId')
      await services.identity.revokeInvite(code, hubId)
      await audit(services.audit, 'inviteRevoked', pubkey, { code }, undefined, hubId ?? null)
      return c.json({ ok: true })
    },
  )

  return management
}

// Unscoped management spans every hub: authenticate, then super-admin only.
invites.use('/', authMiddleware, requirePermission('*'))
invites.use('/:code', authMiddleware, requirePermission('*'))
invites.route('/', inviteManagementRoutes())

/** Hub-scoped invite management — mounted at /api/hubs/:hubId/invites behind hubContext. */
export const hubInvitesRoutes = inviteManagementRoutes()

export default invites
