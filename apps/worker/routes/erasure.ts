import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { okResponseSchema } from '@protocol/schemas/common'
import {
  erasureRequestResponseSchema,
  erasureRequestListResponseSchema,
  createSelfErasureBodySchema,
  createEmergencySelfErasureBodySchema,
  adminErasureBodySchema,
  deviceWipeBodySchema,
  reEncryptionJobListResponseSchema,
} from '@protocol/schemas/erasure'
import { authErrors } from '../openapi/helpers'
import { audit } from '../services/audit'
import { getConnectionManager } from '../lib/ws-manager'

const erasure = new Hono<AppEnv>()

// --- Self-service routes ---

erasure.get(
  '/me',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Check own erasure request status',
    responses: {
      200: {
        description: 'Erasure request status',
        content: {
          'application/json': {
            schema: resolver(erasureRequestResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:request-self'),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const request = await services.erasure.getMyRequest(pubkey)
    if (!request) {
      return c.json({ request: null })
    }
    return c.json({
      request: {
        id: request.id,
        userId: request.userId,
        status: request.status,
        requestedBy: request.requestedBy,
        requestedAt: request.requestedAt?.toISOString() ?? '',
        executeAt: request.executeAt?.toISOString() ?? '',
        executedAt: request.executedAt?.toISOString() ?? null,
        justification: request.justification,
        emergencyOverride: request.emergencyOverride,
        coApproverPubkey: request.coApproverPubkey,
        cancelledAt: request.cancelledAt?.toISOString() ?? null,
      },
    })
  },
)

erasure.post(
  '/me',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Request own account erasure',
    responses: {
      200: {
        description: 'Erasure request created',
        content: {
          'application/json': {
            schema: resolver(erasureRequestResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:request-self'),
  validator('json', createSelfErasureBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')

    const request = await services.erasure.createSelfRequest(
      pubkey,
      hubId ?? '',
      body.justification,
    )

    await audit(
      services.audit,
      'erasureRequested',
      pubkey,
      { requestId: request.id },
      undefined,
      hubId ?? undefined,
    )

    return c.json({
      request: {
        id: request.id,
        userId: request.userId,
        status: request.status,
        requestedBy: request.requestedBy,
        requestedAt: request.requestedAt?.toISOString() ?? '',
        executeAt: request.executeAt?.toISOString() ?? '',
        executedAt: null,
        justification: request.justification,
        emergencyOverride: request.emergencyOverride,
        coApproverPubkey: request.coApproverPubkey,
        cancelledAt: null,
      },
    })
  },
)

erasure.post(
  '/me/emergency',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Request emergency account erasure with co-approver',
    responses: {
      200: {
        description: 'Emergency erasure request created',
        content: {
          'application/json': {
            schema: resolver(erasureRequestResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:request-self'),
  validator('json', createEmergencySelfErasureBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')

    const request = await services.erasure.createSelfRequest(
      pubkey,
      hubId ?? '',
      body.justification,
      {
        coApproverPubkey: body.coApproverPubkey,
        coApproverSignature: body.coApproverSignature,
        timestamp: body.timestamp,
      },
    )

    await audit(
      services.audit,
      'erasureEmergencyRequested',
      pubkey,
      {
        requestId: request.id,
        coApproverPubkey: body.coApproverPubkey,
      },
      undefined,
      hubId ?? undefined,
    )

    return c.json({
      request: {
        id: request.id,
        userId: request.userId,
        status: request.status,
        requestedBy: request.requestedBy,
        requestedAt: request.requestedAt?.toISOString() ?? '',
        executeAt: request.executeAt?.toISOString() ?? '',
        executedAt: null,
        justification: request.justification,
        emergencyOverride: request.emergencyOverride,
        coApproverPubkey: request.coApproverPubkey,
        cancelledAt: null,
      },
    })
  },
)

erasure.delete(
  '/me',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Cancel pending self-erasure request',
    responses: {
      200: {
        description: 'Erasure request cancelled',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:request-self'),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    await services.erasure.cancelSelfRequest(pubkey)
    await audit(services.audit, 'erasureCancelled', pubkey, {})
    return c.json({ ok: true })
  },
)

// --- Admin routes ---

erasure.get(
  '/requests',
  describeRoute({
    tags: ['Erasure'],
    summary: 'List all erasure requests',
    responses: {
      200: {
        description: 'Erasure requests list',
        content: {
          'application/json': {
            schema: resolver(erasureRequestListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:admin'),
  async (c) => {
    const services = c.get('services')
    const status = c.req.query('status')
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
    const offset = Number(c.req.query('offset') ?? 0)

    const { requests, total } = await services.erasure.listRequests({
      status,
      limit,
      offset,
    })

    return c.json({
      requests: requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        requestedBy: r.requestedBy,
        requestedAt: r.requestedAt?.toISOString() ?? '',
        executeAt: r.executeAt?.toISOString() ?? '',
        executedAt: r.executedAt?.toISOString() ?? null,
        justification: r.justification,
        emergencyOverride: r.emergencyOverride,
        coApproverPubkey: r.coApproverPubkey,
        cancelledAt: r.cancelledAt?.toISOString() ?? null,
      })),
      total,
    })
  },
)

erasure.post(
  '/:userId',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Execute immediate erasure for a user (admin)',
    responses: {
      200: {
        description: 'Erasure executed',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:admin'),
  validator('json', adminErasureBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const targetUserId = c.req.param('userId')
    const body = c.req.valid('json')

    const { reEncryptionJobIds } = await services.erasure.executeErasure(
      targetUserId,
      pubkey,
      body.justification,
      services.audit,
    )

    const wsManager = getConnectionManager()
    if (wsManager) {
      const wipePayload = JSON.stringify({
        type: 'device:wipe',
        targetUserId,
        reason: 'admin-erasure',
        timestamp: new Date().toISOString(),
      })
      wsManager.sendToUser(targetUserId, wipePayload)
      wsManager.terminateUser(targetUserId)
    }

    return c.json({
      ok: true,
      reEncryptionJobIds,
    })
  },
)

erasure.post(
  '/:userId/wipe-device/:devicePubkey',
  describeRoute({
    tags: ['Erasure'],
    summary: 'Remote wipe a specific device',
    responses: {
      200: {
        description: 'Wipe command sent',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:admin'),
  validator('json', deviceWipeBodySchema),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const targetUserId = c.req.param('userId')
    const targetDevicePubkey = c.req.param('devicePubkey')

    const wsManager = getConnectionManager()
    if (wsManager) {
      const wipePayload = JSON.stringify({
        type: 'device:wipe',
        targetDevicePubkey,
        reason: 'device-revocation',
        timestamp: new Date().toISOString(),
      })
      wsManager.sendToUser(targetUserId, wipePayload)
    }

    await audit(services.audit, 'deviceWipeSent', pubkey, {
      targetUserId,
      targetDevicePubkey,
    })

    return c.json({ ok: true })
  },
)

erasure.get(
  '/re-encryption-jobs',
  describeRoute({
    tags: ['Erasure'],
    summary: 'List re-encryption jobs',
    responses: {
      200: {
        description: 'Re-encryption jobs list',
        content: {
          'application/json': {
            schema: resolver(reEncryptionJobListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('erasure:admin'),
  async (c) => {
    const services = c.get('services')
    const userId = c.req.query('userId')
    const jobs = await services.erasure.listReEncryptionJobs(
      userId ?? undefined,
    )

    return c.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        userId: j.userId,
        hubId: j.hubId,
        status: j.status,
        totalEnvelopes: j.totalEnvelopes,
        processedEnvelopes: j.processedEnvelopes,
        startedAt: j.startedAt?.toISOString() ?? null,
        completedAt: j.completedAt?.toISOString() ?? null,
        createdAt: j.createdAt?.toISOString() ?? '',
      })),
    })
  },
)

export default erasure
