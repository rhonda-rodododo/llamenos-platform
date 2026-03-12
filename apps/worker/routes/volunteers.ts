import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { createVolunteerBodySchema, adminUpdateVolunteerBodySchema } from '../schemas/volunteers'
import { volunteerResponseSchema, okResponseSchema } from '../schemas/responses'
import { authErrors } from '../openapi/helpers'
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
    // Revoke all sessions before deletion
    await dos.identity.fetch(new Request(`http://do/sessions/revoke-all/${targetPubkey}`, { method: 'DELETE' }))
    const res = await dos.identity.fetch(new Request(`http://do/volunteers/${targetPubkey}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'volunteerRemoved', pubkey, { target: targetPubkey })
    return res
  },
)

export default volunteers
