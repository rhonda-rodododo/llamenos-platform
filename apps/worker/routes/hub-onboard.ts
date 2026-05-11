import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { requireHubPermission } from '../middleware/hub'
import { checkRateLimit } from '../lib/helpers'
import { authErrors } from '../openapi/helpers'
import {
  hubOnboardingStateSchema,
  hubSetupStatusSchema,
  hubUsageSchema,
  hubQuotaSchema,
  channelConfigSchema,
} from '@protocol/schemas/provider-setup'
import { okResponseSchema } from '@protocol/schemas/common'
import { ProviderApiError } from '../services/provider-setup/types'

const hubOnboardRoute = new Hono<AppEnv>()

// ── Start Onboarding ───────────────────────────────────────────────────────
hubOnboardRoute.post('/:hubId/onboard',
  requireHubPermission('hubs:configure'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Start or resume hub onboarding',
    responses: {
      200: {
        description: 'Onboarding state',
        content: {
          'application/json': {
            schema: resolver(z.object({ onboarding: hubOnboardingStateSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', z.object({
    templateId: z.string().optional(),
  }).optional()),
  async (c) => {
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const hubId = c.req.param('hubId')
    const body = c.req.valid('json') || {}

    const limited = await checkRateLimit(services.settings, `hub-onboard-start:${pubkey}`, 10)
    if (limited) {
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    const onboarding = await services.hubOnboard.startOnboarding(hubId, body.templateId)
    return c.json({ onboarding })
  },
)

// ── Get Onboarding Status ──────────────────────────────────────────────────
hubOnboardRoute.get('/:hubId/onboard/status',
  requireHubPermission('telephony:view-providers'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Get onboarding progress',
    responses: {
      200: {
        description: 'Onboarding state',
        content: {
          'application/json': {
            schema: resolver(z.object({ onboarding: hubOnboardingStateSchema.nullable() })),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const onboarding = await services.hubOnboard.getOnboardingStatus(hubId)
    return c.json({ onboarding })
  },
)

// ── Complete Step ──────────────────────────────────────────────────────────
hubOnboardRoute.put('/:hubId/onboard/step',
  requireHubPermission('hubs:configure'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Complete an onboarding step',
    responses: {
      200: {
        description: 'Updated onboarding state',
        content: {
          'application/json': {
            schema: resolver(z.object({ onboarding: hubOnboardingStateSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', z.object({
    step: z.string(),
    data: z.object({
      channelConfig: channelConfigSchema.optional(),
    }).optional(),
  })),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const body = c.req.valid('json')

    try {
      const onboarding = await services.hubOnboard.completeStep(hubId, body.step, body.data)
      return c.json({ onboarding })
    } catch (err) {
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 404)
      }
      throw err
    }
  },
)

// ── Get Provider Status ────────────────────────────────────────────────────
hubOnboardRoute.get('/:hubId/provider-status',
  requireHubPermission('telephony:view-providers'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Get hub provider setup status',
    responses: {
      200: {
        description: 'Setup status',
        content: {
          'application/json': {
            schema: resolver(z.object({ status: hubSetupStatusSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const status = await services.hubOnboard.getHubSetupStatus(hubId)
    return c.json({ status })
  },
)

// ── Get Usage ──────────────────────────────────────────────────────────────
hubOnboardRoute.get('/:hubId/usage',
  requireHubPermission('telephony:view-providers'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Get hub usage stats',
    responses: {
      200: {
        description: 'Usage stats',
        content: {
          'application/json': {
            schema: resolver(z.object({ usage: hubUsageSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const usage = await services.hubOnboard.getHubUsage(hubId)
    return c.json({ usage })
  },
)

// ── Set Quotas ─────────────────────────────────────────────────────────────
hubOnboardRoute.put('/:hubId/quotas',
  requireHubPermission('system:manage-instance'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Set hub quotas',
    responses: {
      200: {
        description: 'Quotas updated',
        content: {
          'application/json': {
            schema: resolver(z.object({ quotas: hubQuotaSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', hubQuotaSchema),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const body = c.req.valid('json')

    const quotas = await services.settings.updateHubQuotas(hubId, body)
    return c.json({ quotas })
  },
)

// ── Update Channels ────────────────────────────────────────────────────────
hubOnboardRoute.put('/:hubId/channels',
  requireHubPermission('hubs:configure'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Enable or disable channels',
    responses: {
      200: {
        description: 'Channel config updated',
        content: {
          'application/json': {
            schema: resolver(z.object({ channels: channelConfigSchema })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', z.object({
    channel: z.string(),
    enabled: z.boolean(),
  })),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const body = c.req.valid('json')

    const channels = body.enabled
      ? await services.hubOnboard.enableChannel(hubId, body.channel)
      : await services.hubOnboard.disableChannel(hubId, body.channel)

    return c.json({ channels })
  },
)

// ── Provision Sub-Account ──────────────────────────────────────────────────
hubOnboardRoute.post('/:hubId/sub-account',
  requireHubPermission('hubs:configure'),
  describeRoute({
    tags: ['Hub Onboarding'],
    summary: 'Auto-provision a sub-account',
    responses: {
      200: {
        description: 'Sub-account provisioned',
        content: {
          'application/json': {
            schema: resolver(z.object({ subAccountId: z.string() })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', z.object({
    masterConfigId: z.string(),
  })),
  async (c) => {
    const services = c.get('services')
    const hubId = c.req.param('hubId')
    const body = c.req.valid('json')

    const result = await services.hubOnboard.provisionSubAccount(hubId, body.masterConfigId)
    return c.json(result)
  },
)

export default hubOnboardRoute
