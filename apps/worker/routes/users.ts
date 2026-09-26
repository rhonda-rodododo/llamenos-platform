import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { createUserBodySchema, adminUpdateUserBodySchema, userResponseSchema, userListResponseSchema, userMetricsResponseSchema } from '@protocol/schemas/users'
import { recordListResponseSchema } from '@protocol/schemas/records'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { callerIsSuperAdmin, checkRoleGrant, resolveTargetHub } from '../lib/hub-scope'
import type { Context } from 'hono'

const users = new Hono<AppEnv>()

// Mounted twice (app.ts): unscoped at /api/users — server-level user
// administration, authorised by GLOBAL roles — and at /api/hubs/:hubId/users
// behind hubContext, where every handler is bounded to that hub's members
// (#1044) and role grants become that hub's assignment, never a global role
// (#1037).

/**
 * Inside a hub, resolve the target user as a member of that hub, or 404 — a
 * hub must not be able to read, edit or delete people who are not its members,
 * nor learn whether they exist. Outside a hub, the plain lookup.
 */
async function loadTarget(c: Context<AppEnv>, targetPubkey: string) {
  const services = c.get('services')
  const hubId = c.get('hubId')
  return hubId
    ? services.identity.getHubUser(targetPubkey, hubId, c.get('allRoles'))
    : services.identity.getUser(targetPubkey)
}

/**
 * True when changing the target account (deactivate / delete) would reach past
 * the hub in the path: they belong to another hub or hold a global role. Only a
 * super-admin may do that from inside a hub; a hub admin removes the person
 * from their own hub instead.
 */
async function affectsOtherHubs(c: Context<AppEnv>, targetPubkey: string, hubId: string): Promise<boolean> {
  const target = await c.get('services').identity.getUserInternal(targetPubkey)
  if (!target) return false
  return target.roles.length > 0 || (target.hubRoles ?? []).some(hr => hr.hubId !== hubId)
}

users.get('/',
  describeRoute({
    tags: ['Users'],
    summary: 'List users (members of the hub in the path; every user when unscoped)',
    responses: {
      200: {
        description: 'Users',
        content: { 'application/json': { schema: resolver(userListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('users:read'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')
    return c.json(hubId
      ? await services.identity.getHubUsers(hubId, c.get('allRoles'))
      : await services.identity.getUsers())
  },
)

users.get('/:targetPubkey',
  describeRoute({
    tags: ['Users'],
    summary: 'Get a user (a member of the hub in the path)',
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: resolver(userResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('users:read'),
  async (c) => c.json(await loadTarget(c, c.req.param('targetPubkey'))),
)

users.post('/',
  describeRoute({
    tags: ['Users'],
    summary: 'Create a new user',
    responses: {
      201: {
        description: 'User created',
        content: {
          'application/json': {
            schema: resolver(userResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('users:create'),
  validator('json', createUserBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const hubId = c.get('hubId')
    const roleIds = (body.roleIds?.length ? body.roleIds : undefined) || (body.roles?.length ? body.roles : undefined) || ['role-volunteer']

    const denied = checkRoleGrant(c, roleIds)
    if (denied) return c.json({ error: denied.error }, denied.status)

    const result = await services.identity.createUser({
      pubkey: body.pubkey,
      name: body.name,
      phone: body.phone,
      roleIds,
      // Inside a hub the roles are that hub's assignment — never global (#1037)
      hubId,
      encryptedSecretKey: body.encryptedSecretKey || '',
      // Epic 340: User profile extensions
      ...(body.specializations && { specializations: body.specializations }),
      ...(body.maxCaseAssignments !== undefined && { maxCaseAssignments: body.maxCaseAssignments }),
      ...(body.supervisorPubkey && { supervisorPubkey: body.supervisorPubkey }),
    })

    await audit(services.audit, 'userAdded', pubkey, { target: body.pubkey, roles: roleIds }, undefined, hubId ?? null)

    return c.json(result.volunteer, 201)
  },
)

users.patch('/:targetPubkey',
  describeRoute({
    tags: ['Users'],
    summary: 'Update a user (admin)',
    responses: {
      200: {
        description: 'User updated',
        content: {
          'application/json': {
            schema: resolver(userResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('users:update'),
  validator('json', adminUpdateUserBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const targetPubkey = c.req.param('targetPubkey')
    const body = c.req.valid('json')
    const { roles, ...profile } = body
    const hubId = c.get('hubId')

    await loadTarget(c, targetPubkey)

    if (roles) {
      const denied = checkRoleGrant(c, roles)
      if (denied) return c.json({ error: denied.error }, denied.status)
    }
    if (hubId && body.active === false && !callerIsSuperAdmin(c) && await affectsOtherHubs(c, targetPubkey, hubId)) {
      return c.json({
        error: 'This user belongs to other hubs — remove them from this hub (DELETE /api/hubs/:hubId/members/:pubkey) instead of deactivating the account',
      }, 409)
    }

    // Inside a hub, `roles` sets the user's assignment in THAT hub; outside,
    // their global roles (server-level administration).
    if (hubId && roles) {
      await services.identity.setHubRole({ pubkey: targetPubkey, hubId, roleIds: roles })
    }
    const result = await services.identity.updateUser(targetPubkey, hubId ? profile : body, true)
    const volunteer = hubId
      ? await services.identity.getHubUser(targetPubkey, hubId, c.get('allRoles'))
      : result.volunteer

    if (body.roles) await audit(services.audit, 'rolesChanged', pubkey, { target: targetPubkey, roles: body.roles }, undefined, hubId ?? null)
    if (body.active === false) await audit(services.audit, 'userDeactivated', pubkey, { target: targetPubkey }, undefined, hubId ?? null)
    // Revoke all sessions when deactivating or changing roles
    if (body.active === false || body.roles) {
      await services.identity.revokeAllSessions(targetPubkey)
    }

    return c.json(volunteer)
  },
)

users.delete('/:targetPubkey',
  describeRoute({
    tags: ['Users'],
    summary: 'Delete a user',
    responses: {
      200: {
        description: 'User deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('users:delete'),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const targetPubkey = c.req.param('targetPubkey')
    const hubId = c.get('hubId')

    await loadTarget(c, targetPubkey)
    if (hubId && !callerIsSuperAdmin(c) && await affectsOtherHubs(c, targetPubkey, hubId)) {
      return c.json({
        error: 'This user belongs to other hubs — remove them from this hub (DELETE /api/hubs/:hubId/members/:pubkey) instead of deleting the account',
      }, 409)
    }

    // Revoke all sessions before deletion — proceed even if this fails
    // (orphaned sessions will expire naturally via TTL)
    await services.identity.revokeAllSessions(targetPubkey).catch(() => {})
    await services.identity.deleteUser(targetPubkey)
    await audit(services.audit, 'userRemoved', pubkey, { target: targetPubkey }, undefined, hubId ?? null)
    return c.json({ ok: true })
  },
)

// ============================================================
// User Case Endpoints (Epic 340)
// ============================================================

/**
 * GET /users/:pubkey/cases
 *
 * List case records assigned to a user via CasesService.
 */
users.get('/:targetPubkey/cases',
  describeRoute({
    tags: ['Users'],
    summary: 'List case records assigned to a user',
    responses: {
      200: {
        description: 'Assigned records',
        content: { 'application/json': { schema: resolver(recordListResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('users:read-cases'),
  async (c) => {
    const services = c.get('services')
    const targetPubkey = c.req.param('targetPubkey')

    // Verify user exists (and, inside a hub, is a member of it)
    try {
      await loadTarget(c, targetPubkey)
    } catch {
      return c.json({ error: 'User not found' }, 404)
    }

    const page = parseInt(c.req.query('page') ?? '1', 10)
    const limit = parseInt(c.req.query('limit') ?? '20', 10)
    const entityTypeId = c.req.query('entityTypeId')

    const target = resolveTargetHub(c, c.req.query('hubId'), 'users:read-cases')
    if (!target.ok) return c.json({ error: target.error }, target.status)
    const hubId = target.hubId ?? ''

    const result = await services.cases.list({
      hubId,
      page,
      limit,
      assignedTo: targetPubkey,
      entityTypeId,
    })

    return c.json(result)
  },
)

/**
 * GET /users/:pubkey/metrics
 *
 * User workload metrics: active case count, total cases handled,
 * and average resolution days.
 */
users.get('/:targetPubkey/metrics',
  describeRoute({
    tags: ['Users'],
    summary: 'Get user workload metrics',
    responses: {
      200: {
        description: 'User metrics',
        content: {
          'application/json': {
            schema: resolver(userMetricsResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('users:read-metrics'),
  async (c) => {
    const services = c.get('services')
    const targetPubkey = c.req.param('targetPubkey')

    // Verify user exists (and, inside a hub, is a member of it)
    try {
      await loadTarget(c, targetPubkey)
    } catch {
      return c.json({ error: 'User not found' }, 404)
    }

    const target = resolveTargetHub(c, c.req.query('hubId'), 'users:read-metrics')
    if (!target.ok) return c.json({ error: target.error }, target.status)
    const hubId = target.hubId ?? ''

    // Get all records assigned to this user
    const result = await services.cases.list({
      hubId,
      page: 1,
      limit: 1000,
      assignedTo: targetPubkey,
    })

    const records = result.records
    const totalCasesHandled = records.length
    const closedRecords = records.filter(r => r.closedAt)
    const activeRecords = records.filter(r => !r.closedAt)

    // Calculate average resolution days for closed records
    let averageResolutionDays: number | null = null
    if (closedRecords.length > 0) {
      let totalDays = 0
      for (const record of closedRecords) {
        const created = new Date(record.createdAt).getTime()
        const closed = record.closedAt ? new Date(record.closedAt).getTime() : created
        totalDays += (closed - created) / (1000 * 60 * 60 * 24)
      }
      averageResolutionDays = Math.round((totalDays / closedRecords.length) * 10) / 10
    }

    return c.json({
      pubkey: targetPubkey,
      activeCaseCount: activeRecords.length,
      totalCasesHandled,
      averageResolutionDays,
    })
  },
)

export default users
