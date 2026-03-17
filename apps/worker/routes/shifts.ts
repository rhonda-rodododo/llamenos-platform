import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { createShiftBodySchema, updateShiftBodySchema, fallbackGroupSchema, shiftResponseSchema, myStatusResponseSchema, shiftListResponseSchema } from '@protocol/schemas/shifts'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const shifts = new Hono<AppEnv>()

// All authenticated users can check their shift status
shifts.get('/my-status',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Get current user shift status',
    responses: {
      200: {
        description: 'Shift status for the current user',
        content: {
          'application/json': {
            schema: resolver(myStatusResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId') ?? ''
    const result = await services.shifts.getMyStatus(hubId, pubkey)
    return c.json(result)
  },
)

// --- Permission-gated routes ---

shifts.get('/fallback',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Get fallback ring group',
    responses: {
      200: {
        description: 'Fallback group configuration',
        content: {
          'application/json': {
            schema: resolver(fallbackGroupSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('shifts:manage-fallback'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getFallbackGroup()
    return c.json(result)
  },
)

shifts.put('/fallback',
  describeRoute({
    tags: ['Shifts'],
    summary: 'Update fallback ring group',
    responses: {
      200: {
        description: 'Fallback group updated',
        content: {
          'application/json': {
            schema: resolver(fallbackGroupSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('shifts:manage-fallback'),
  validator('json', fallbackGroupSchema),
  async (c) => {
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.settings.setFallbackGroup(body)
    return c.json(result)
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
            schema: resolver(shiftListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('shifts:read'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const shiftList = await services.shifts.list(hubId)
    return c.json({ shifts: shiftList })
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId') ?? ''
    const body = c.req.valid('json')
    const shift = await services.shifts.create(hubId, body)
    await audit(services.audit, 'shiftCreated', pubkey)
    return c.json({ shift }, 201)
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId') ?? ''
    const id = c.req.param('id')
    if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
    const body = c.req.valid('json')
    const shift = await services.shifts.update(hubId, id, body)
    await audit(services.audit, 'shiftEdited', pubkey, { shiftId: id })
    return c.json({ shift })
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
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId') ?? ''
    const id = c.req.param('id')
    if (id === 'fallback') return c.json({ error: 'Not Found' }, 404)
    const result = await services.shifts.delete(hubId, id)
    await audit(services.audit, 'shiftDeleted', pubkey, { shiftId: id })
    return c.json(result)
  },
)

export default shifts
