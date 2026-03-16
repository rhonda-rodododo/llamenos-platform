import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { getDOs, getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { createVolunteerBodySchema, adminUpdateVolunteerBodySchema, volunteerResponseSchema } from '@protocol/schemas/volunteers'
import { okResponseSchema } from '@protocol/schemas/common'
import type { CaseRecord } from '@protocol/schemas/records'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const volunteers = new Hono<AppEnv>()
volunteers.use('*', requirePermission('volunteers:read'))

volunteers.get('/',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'List all volunteers',
    responses: {
      200: {
        description: 'List of volunteers',
        content: {
          'application/json': {
            schema: resolver(z.object({ volunteers: z.array(volunteerResponseSchema) })),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    return dos.identity.fetch(new Request('http://do/volunteers'))
  },
)

volunteers.get('/:targetPubkey',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'Get a single volunteer by pubkey',
    responses: {
      200: {
        description: 'Volunteer details',
        content: {
          'application/json': {
            schema: resolver(volunteerResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const targetPubkey = c.req.param('targetPubkey')
    return dos.identity.fetch(new Request(`http://do/volunteer/${targetPubkey}`))
  },
)

volunteers.post('/',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'Create a new volunteer',
    responses: {
      201: {
        description: 'Volunteer created',
        content: {
          'application/json': {
            schema: resolver(volunteerResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('volunteers:create'),
  validator('json', createVolunteerBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')

    const res = await dos.identity.fetch(new Request('http://do/volunteers', {
      method: 'POST',
      body: JSON.stringify({
        pubkey: body.pubkey,
        name: body.name,
        phone: body.phone,
        roles: body.roleIds || body.roles || ['role-volunteer'],
        encryptedSecretKey: body.encryptedSecretKey || '',
        // Epic 340: Volunteer profile extensions
        ...(body.specializations && { specializations: body.specializations }),
        ...(body.maxCaseAssignments !== undefined && { maxCaseAssignments: body.maxCaseAssignments }),
        ...(body.teamId && { teamId: body.teamId }),
        ...(body.supervisorPubkey && { supervisorPubkey: body.supervisorPubkey }),
      }),
    }))

    if (res.ok) {
      await audit(dos.records, 'volunteerAdded', pubkey, { target: body.pubkey, roles: body.roleIds || body.roles })
    }

    return res
  },
)

volunteers.patch('/:targetPubkey',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'Update a volunteer (admin)',
    responses: {
      200: {
        description: 'Volunteer updated',
        content: {
          'application/json': {
            schema: resolver(volunteerResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('volunteers:update'),
  validator('json', adminUpdateVolunteerBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const targetPubkey = c.req.param('targetPubkey')
    const body = c.req.valid('json')

    const res = await dos.identity.fetch(new Request(`http://do/admin/volunteers/${targetPubkey}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) {
      if (body.roles) await audit(dos.records, 'rolesChanged', pubkey, { target: targetPubkey, roles: body.roles })
      if (body.active === false) await audit(dos.records, 'volunteerDeactivated', pubkey, { target: targetPubkey })
      // Revoke all sessions when deactivating or changing roles
      if (body.active === false || body.roles) {
        await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' }))
      }
    }
    return res
  },
)

volunteers.delete('/:targetPubkey',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'Delete a volunteer',
    responses: {
      200: {
        description: 'Volunteer deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('volunteers:delete'),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const targetPubkey = c.req.param('targetPubkey')
    // Revoke all sessions before deletion — proceed even if this fails
    // (orphaned sessions will expire naturally via TTL)
    await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' })).catch(() => {})
    const res = await dos.identity.fetch(new Request(`http://do/volunteers/${targetPubkey}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'volunteerRemoved', pubkey, { target: targetPubkey })
    return res
  },
)

// ============================================================
// Volunteer Case Endpoints (Epic 340)
// ============================================================

/**
 * GET /volunteers/:pubkey/cases
 *
 * List case records assigned to a volunteer. Queries CaseDO using the
 * idx:assigned:{pubkey}: prefix index for efficient lookup. Uses the
 * global (non-hub-scoped) CaseManager — hub-scoped queries would need
 * a different approach.
 */
volunteers.get('/:targetPubkey/cases',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'List case records assigned to a volunteer',
    responses: {
      200: { description: 'Assigned records' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const targetPubkey = c.req.param('targetPubkey')

    // Verify volunteer exists
    const volRes = await dos.identity.fetch(new Request(`http://do/volunteer/${targetPubkey}`))
    if (!volRes.ok) return new Response(volRes.body, volRes)

    // Query CaseDO for records assigned to this volunteer
    const qs = new URLSearchParams({
      page: c.req.query('page') ?? '1',
      limit: c.req.query('limit') ?? '20',
      assignedTo: targetPubkey,
    })
    const entityTypeId = c.req.query('entityTypeId')
    if (entityTypeId) qs.set('entityTypeId', entityTypeId)

    const res = await dos.caseManager.fetch(new Request(`http://do/records?${qs}`))
    return new Response(res.body, res)
  },
)

/**
 * GET /volunteers/:pubkey/metrics
 *
 * Volunteer workload metrics: active case count, total cases handled,
 * and average resolution days. This avoids making the volunteer list
 * endpoint expensive by providing per-volunteer metrics on demand.
 */
volunteers.get('/:targetPubkey/metrics',
  describeRoute({
    tags: ['Volunteers'],
    summary: 'Get volunteer workload metrics',
    responses: {
      200: {
        description: 'Volunteer metrics',
        content: {
          'application/json': {
            schema: resolver(z.object({
              pubkey: z.string(),
              activeCaseCount: z.number(),
              totalCasesHandled: z.number(),
              averageResolutionDays: z.number().nullable(),
            })),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const targetPubkey = c.req.param('targetPubkey')

    // Verify volunteer exists
    const volRes = await dos.identity.fetch(new Request(`http://do/volunteer/${targetPubkey}`))
    if (!volRes.ok) return new Response(volRes.body, volRes)

    // Fetch all records assigned to this volunteer (use a high limit to get all)
    const qs = new URLSearchParams({
      page: '1',
      limit: '1000',
      assignedTo: targetPubkey,
    })
    const recordsRes = await dos.caseManager.fetch(new Request(`http://do/records?${qs}`))
    if (!recordsRes.ok) {
      return c.json({ pubkey: targetPubkey, activeCaseCount: 0, totalCasesHandled: 0, averageResolutionDays: null })
    }

    const { records } = await recordsRes.json() as { records: CaseRecord[] }
    const totalCasesHandled = records.length
    const closedRecords = records.filter(r => r.closedAt)
    const activeRecords = records.filter(r => !r.closedAt)

    // Calculate average resolution days for closed records
    let averageResolutionDays: number | null = null
    if (closedRecords.length > 0) {
      let totalDays = 0
      for (const record of closedRecords) {
        const created = new Date(record.createdAt).getTime()
        const closed = new Date(record.closedAt!).getTime()
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

export default volunteers
