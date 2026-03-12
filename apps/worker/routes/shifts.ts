import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { createShiftBodySchema, updateShiftBodySchema, fallbackGroupSchema } from '../schemas/shifts'
import { shiftResponseSchema, okResponseSchema } from '../schemas/responses'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const shifts = new Hono<AppEnv>()

// All authenticated users can check their shift status
shifts.get('/my-status',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Get current user shift status',
    responses: {
      200: { description: 'Shift status for the current user' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    return dos.shifts.fetch(new Request(`http://do/my-status?pubkey=${pubkey}`))
  },
)

// --- Permission-gated routes ---

shifts.get('/fallback',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Get fallback ring group',
    responses: {
      200: { description: 'Fallback group configuration' },
      ...authErrors,
    },
  }),
  requirePermission('shifts:manage-fallback'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    return dos.settings.fetch(new Request('http://do/fallback'))
  },
)

shifts.put('/fallback',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Update fallback ring group',
    responses: {
      200: { description: 'Fallback group updated' },
      ...authErrors,
    },
  }),
  requirePermission('shifts:manage-fallback'),
  validator('json', fallbackGroupSchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    return dos.settings.fetch(new Request('http://do/fallback', {
      method: 'PUT',
      body: JSON.stringify(body),
    }))
  },
)

shifts.get('/',
  describeRoute({
    tags: ['Shifts'],
    summary: 'List all shifts',
    responses: {
      200: {
        description: 'List of shifts',
        content: {
          'application/json': {
            schema: resolver(z.object({ shifts: z.array(shiftResponseSchema) })),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('shifts:read'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    return dos.shifts.fetch(new Request('http://do/shifts'))
  },
)

shifts.post('/',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Create a new shift',
    responses: {
      201: {
        description: 'Shift created',
        content: {
          'application/json': {
            schema: resolver(shiftResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('shifts:create'),
  validator('json', createShiftBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const res = await dos.shifts.fetch(new Request('http://do/shifts', {
      method: 'POST',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'shiftCreated', pubkey)
    return res
  },
)

shifts.patch('/:id',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Update a shift',
    responses: {
      200: {
        description: 'Shift updated',
        content: {
          'application/json': {
            schema: resolver(shiftResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('shifts:update'),
  validator('json', updateShiftBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
    const body = c.req.valid('json')
    const res = await dos.shifts.fetch(new Request(`http://do/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (res.ok) await audit(dos.records, 'shiftEdited', pubkey, { shiftId: id })
    return res
  },
)

shifts.delete('/:id',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Delete a shift',
    responses: {
      200: {
        description: 'Shift deleted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('shifts:delete'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const pubkey = c.get('pubkey')
    const id = c.req.param('id')
    if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
    const res = await dos.shifts.fetch(new Request(`http://do/shifts/${id}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'shiftDeleted', pubkey, { shiftId: id })
    return res
  },
)

export default shifts
