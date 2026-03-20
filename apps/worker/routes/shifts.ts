import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { createShiftBodySchema, updateShiftBodySchema, fallbackGroupSchema, shiftResponseSchema, myStatusResponseSchema, shiftListResponseSchema } from '@protocol/schemas/shifts'
import { okResponseSchema } from '@protocol/schemas/common'
import { authErrors } from '../openapi/helpers'
import { createEntityRouter } from '../lib/entity-router'

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

// --- CRUD via entity-router factory ---

const shiftCrudRouter = createEntityRouter({
  tag: 'Shifts',
  domain: 'shifts',
  service: 'shifts',
  listResponseSchema: shiftListResponseSchema,
  itemResponseSchema: shiftResponseSchema,
  createBodySchema: createShiftBodySchema,
  updateBodySchema: updateShiftBodySchema,
  deleteResponseSchema: okResponseSchema,
  hubScoped: true,
  disableGet: true,
  auditEvents: {
    created: 'shiftCreated',
    updated: 'shiftEdited',
    deleted: 'shiftDeleted',
  },
})
shifts.route('/', shiftCrudRouter)

export default shifts
