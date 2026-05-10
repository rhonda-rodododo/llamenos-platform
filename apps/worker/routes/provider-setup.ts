import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { checkRateLimit } from '../lib/helpers'
import { authErrors, notFoundError } from '../openapi/helpers'
import {
  startOAuthRequestSchema,
  startOAuthResponseSchema,
  configureProviderRequestSchema,
  providerStatusResponseSchema,
  numberSearchQuerySchema,
  numberProvisionRequestSchema,
  oauthFlowStateSchema,
  ownedNumberSchema,
  availableNumberSchema,
} from '@protocol/schemas/provider-setup'
import { okResponseSchema } from '@protocol/schemas/common'
import { getProviderCapability } from '../services/provider-setup/registry'

// Per-provider OAuth metadata — authorization URLs, token URLs, and default scopes.
const PROVIDER_OAUTH_CONFIG: Record<string, {
  authorizationUrl: string
  tokenUrl: string
  defaultScopes: string[]
}> = {
  twilio: {
    authorizationUrl: 'https://login.twilio.com/authorize',
    tokenUrl: 'https://login.twilio.com/oauth2/token',
    defaultScopes: ['voice_data', 'messaging_data'],
  },
  signalwire: {
    authorizationUrl: 'https://oauth.signalwire.com/authorize',
    tokenUrl: 'https://oauth.signalwire.com/token',
    defaultScopes: ['full'],
  },
  telnyx: {
    authorizationUrl: 'https://api.telnyx.com/oauth2/authorize',
    tokenUrl: 'https://api.telnyx.com/oauth2/token',
    defaultScopes: ['phone_numbers:read', 'phone_numbers:write'],
  },
  vonage: {
    authorizationUrl: 'https://api.nexmo.com/oauth2/authorize',
    tokenUrl: 'https://api.nexmo.com/oauth2/token',
    defaultScopes: ['default'],
  },
  bandwidth: {
    authorizationUrl: 'https://accounts.bandwidth.com/oauth2/authorize',
    tokenUrl: 'https://accounts.bandwidth.com/oauth2/token',
    defaultScopes: ['phone_numbers:read', 'phone_numbers:write'],
  },
}

const OAuthCallbackBodySchema = z.looseObject({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
})

const ConfigureWebhooksRequestSchema = z.looseObject({
  provider: z.string(),
  numberId: z.string(),
  enableSms: z.boolean().optional().default(false),
  hubId: z.string().optional(),
})

const CreateSipTrunkRequestSchema = z.looseObject({
  provider: z.string(),
  domain: z.string(),
  hubId: z.string().optional(),
})

const TestConnectionRequestSchema = z.looseObject({
  provider: z.string(),
  hubId: z.string().optional(),
})

const ownedNumberListSchema = z.object({ numbers: z.array(ownedNumberSchema) })
const availableNumberListSchema = z.object({ numbers: z.array(availableNumberSchema) })

const providerSetup = new Hono<AppEnv>()

// ── OAuth Start ────────────────────────────────────────────────────────────
providerSetup.post('/oauth/start',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Start OAuth flow for a telephony provider',
    responses: {
      200: {
        description: 'OAuth redirect URL and state token',
        content: { 'application/json': { schema: resolver(startOAuthResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  validator('json', startOAuthRequestSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')

    const oauthConfig = PROVIDER_OAUTH_CONFIG[body.provider]
    if (!oauthConfig) {
      return c.json({ error: `Provider ${body.provider} does not support OAuth` }, 400)
    }

    const { stateId, expiresAt } = await services.providerSetup.createOAuthState({
      provider: body.provider,
      redirectUrl: body.redirectUrl,
      callbackScheme: body.redirectUrl,
    })

    const params = new URLSearchParams({
      response_type: 'code',
      state: stateId,
      scope: oauthConfig.defaultScopes.join(' '),
      redirect_uri: body.redirectUrl,
    })
    const authUrl = `${oauthConfig.authorizationUrl}?${params.toString()}`

    return c.json({
      authUrl,
      stateId,
      expiresAt: expiresAt.toISOString(),
    })
  },
)

// ── OAuth Callback ─────────────────────────────────────────────────────────
// No auth check — the state token IS proof of authorization
providerSetup.post('/oauth/callback',
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Handle OAuth callback (no auth — state token is proof)',
    responses: {
      302: { description: 'Redirect to client callback URL' },
      400: { description: 'Invalid state token' },
    },
  }),
  validator('json', OAuthCallbackBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const { code, state, error: oauthError } = body

    if (!state) {
      return c.json({ error: 'Missing state parameter' }, 400)
    }

    const services = c.get('services')
    const stateRow = await services.providerSetup.getOAuthState(state)

    if (!stateRow) {
      return c.json({ error: 'Unknown or expired state token' }, 400)
    }

    if (stateRow.status !== 'pending') {
      return c.json({ error: 'State token already used' }, 400)
    }

    if (new Date() > stateRow.expiresAt) {
      await services.providerSetup.failOAuthState(state)
      return c.json({ error: 'State token expired' }, 400)
    }

    // For non-HTTP redirect URLs (e.g. app:// deep links), return JSON instead of HTTP redirect.
    // Native clients read the redirectUrl field and open it via the OS deep link handler.
    const isHttpRedirect = stateRow.redirectUrl.startsWith('http://') || stateRow.redirectUrl.startsWith('https://')
    const oauthRedirect = (urlWithParams: string) =>
      isHttpRedirect ? c.redirect(urlWithParams) : c.json({ redirectUrl: urlWithParams }, 200)

    if (oauthError || !code) {
      await services.providerSetup.failOAuthState(state)
      const redirectUrl = `${stateRow.redirectUrl}?status=error&message=${encodeURIComponent(oauthError ?? 'Authorization denied')}`
      return oauthRedirect(redirectUrl)
    }

    const oauthConfig = PROVIDER_OAUTH_CONFIG[stateRow.provider]
    if (!oauthConfig) {
      await services.providerSetup.failOAuthState(state)
      const redirectUrl = `${stateRow.redirectUrl}?status=error&message=Provider+not+configured`
      return oauthRedirect(redirectUrl)
    }

    try {
      const tokenRes = await fetch(oauthConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: stateRow.redirectUrl,
        }),
      })

      if (!tokenRes.ok) {
        await services.providerSetup.failOAuthState(state)
        const redirectUrl = `${stateRow.redirectUrl}?status=error&message=${encodeURIComponent(`Token exchange failed: ${tokenRes.status}`)}`
        return oauthRedirect(redirectUrl)
      }

      const tokenData = await tokenRes.json() as Record<string, unknown>
      const credentials = {
        accessToken: String(tokenData.access_token ?? ''),
        refreshToken: String(tokenData.refresh_token ?? ''),
        tokenType: String(tokenData.token_type ?? ''),
        scope: String(tokenData.scope ?? ''),
      }

      const impl = getProviderCapability(stateRow.provider as Parameters<typeof getProviderCapability>[0])
      const capabilities = (impl?.capabilities ?? []) as string[]

      await services.providerSetup.completeOAuthState(state, credentials, capabilities, null)

      return oauthRedirect(`${stateRow.redirectUrl}?status=success`)
    } catch (err) {
      await services.providerSetup.failOAuthState(state)
      const message = err instanceof Error ? err.message : 'OAuth flow failed'
      return oauthRedirect(`${stateRow.redirectUrl}?status=error&message=${encodeURIComponent(message)}`)
    }
  },
)

// ── OAuth Status ───────────────────────────────────────────────────────────
providerSetup.get('/oauth/status/:state',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Get OAuth flow state',
    responses: {
      200: {
        description: 'OAuth flow state',
        content: { 'application/json': { schema: resolver(oauthFlowStateSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const stateId = c.req.param('state')
    const services = c.get('services')

    const stateRow = await services.providerSetup.getOAuthState(stateId)
    if (!stateRow) {
      return c.json({ error: 'State not found' }, 404)
    }

    return c.json({
      id: stateRow.id,
      provider: stateRow.provider,
      status: stateRow.status,
      redirectUrl: stateRow.redirectUrl,
      callbackScheme: stateRow.callbackScheme ?? undefined,
      error: stateRow.error ?? undefined,
      expiresAt: stateRow.expiresAt.toISOString(),
      createdAt: stateRow.createdAt.toISOString(),
    })
  },
)

// ── Configure Provider ─────────────────────────────────────────────────────
providerSetup.post('/configure',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Configure a telephony provider with credentials',
    responses: {
      200: {
        description: 'Provider configured',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  validator('json', configureProviderRequestSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const hubId = c.get('hubId')

    try {
      await services.providerSetup.configure(
        body.provider,
        body.credentials ?? {},
        hubId ?? body.hubId,
      )
      return c.json({ ok: true })
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

// ── Test Connection ────────────────────────────────────────────────────────
providerSetup.post('/test',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Test a stored provider connection',
    responses: {
      200: {
        description: 'Connection test result',
        content: {
          'application/json': {
            schema: resolver(z.object({
              connected: z.boolean(),
              latencyMs: z.number(),
              accountName: z.string().optional(),
              error: z.string().optional(),
              errorType: z.string().optional(),
            })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', TestConnectionRequestSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const hubId = c.get('hubId')

    const result = await services.providerSetup.testConnection(
      body.provider as Parameters<typeof services.providerSetup.testConnection>[0],
      hubId ?? body.hubId,
    )
    return c.json(result)
  },
)

// ── Provider Status ────────────────────────────────────────────────────────
providerSetup.get('/status/:provider',
  requirePermission('telephony:view-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Get provider configuration status',
    responses: {
      200: {
        description: 'Provider status',
        content: { 'application/json': { schema: resolver(providerStatusResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const provider = c.req.param('provider')
    const services = c.get('services')
    const hubId = c.get('hubId')

    const result = await services.providerSetup.getProviderStatus(
      provider as Parameters<typeof services.providerSetup.getProviderStatus>[0],
      hubId,
    )
    return c.json(result)
  },
)

// ── List Phone Numbers ─────────────────────────────────────────────────────
providerSetup.get('/phone-numbers',
  requirePermission('telephony:view-numbers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'List owned phone numbers for a provider',
    responses: {
      200: {
        description: 'Owned phone numbers',
        content: { 'application/json': { schema: resolver(ownedNumberListSchema) } },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const provider = c.req.query('provider')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? c.req.query('hubId')

    if (!provider) {
      return c.json({ error: 'provider query param required' }, 400)
    }

    try {
      const numbers = await services.providerSetup.listNumbers(
        provider as Parameters<typeof services.providerSetup.listNumbers>[0],
        hubId,
      )
      return c.json({ numbers })
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

// ── Search Available Numbers ───────────────────────────────────────────────
providerSetup.post('/phone-numbers/search',
  requirePermission('telephony:manage-numbers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Search available phone numbers (rate limit: 5/min)',
    responses: {
      200: {
        description: 'Available phone numbers',
        content: { 'application/json': { schema: resolver(availableNumberListSchema) } },
      },
      429: { description: 'Rate limit exceeded' },
      ...authErrors,
    },
  }),
  validator('json', numberSearchQuerySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')

    const limited = await checkRateLimit(services.settings, `provider-search:${pubkey}`, 5)
    if (limited) {
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    try {
      const numbers = await services.providerSetup.searchNumbers(
        body.providerType,
        body,
        hubId,
      )
      return c.json({ numbers })
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

// ── Provision Phone Number ─────────────────────────────────────────────────
providerSetup.post('/phone-numbers/provision',
  requirePermission('telephony:manage-numbers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Provision a phone number (rate limit: 1/min)',
    responses: {
      200: {
        description: 'Provisioned number',
        content: { 'application/json': { schema: resolver(ownedNumberSchema) } },
      },
      429: { description: 'Rate limit exceeded' },
      ...authErrors,
    },
  }),
  validator('json', numberProvisionRequestSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const hubId = c.get('hubId')
    const body = c.req.valid('json')

    const limited = await checkRateLimit(services.settings, `provider-provision:${pubkey}`, 1)
    if (limited) {
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    try {
      const number = await services.providerSetup.provisionNumber(
        body.providerType,
        body,
        hubId ?? body.hubId,
      )

      if (body.autoConfigureWebhooks) {
        try {
          await services.providerSetup.configureWebhooks(
            body.providerType,
            number.id,
            { hubId: hubId ?? body.hubId },
          )
        } catch {
          // Non-fatal: number provisioned, webhook config failed silently
        }
      }

      return c.json(number)
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

// ── Configure Webhooks ─────────────────────────────────────────────────────
providerSetup.post('/configure-webhooks',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Configure webhooks for a phone number',
    responses: {
      200: {
        description: 'Webhooks configured',
        content: { 'application/json': { schema: resolver(okResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  validator('json', ConfigureWebhooksRequestSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const hubId = c.get('hubId')

    try {
      await services.providerSetup.configureWebhooks(
        body.provider as Parameters<typeof services.providerSetup.configureWebhooks>[0],
        body.numberId,
        { enableSms: body.enableSms, hubId: hubId ?? body.hubId },
      )
      return c.json({ ok: true })
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

// ── Create SIP Trunk ───────────────────────────────────────────────────────
providerSetup.post('/create-sip-trunk',
  requirePermission('telephony:manage-providers'),
  describeRoute({
    tags: ['Provider Setup'],
    summary: 'Create a SIP trunk for a provider',
    responses: {
      200: {
        description: 'SIP trunk configuration',
        content: {
          'application/json': {
            schema: resolver(z.object({
              sipProvider: z.string(),
              sipUsername: z.string(),
              sipPassword: z.string(),
              trunkSid: z.string().optional(),
              connectionId: z.string().optional(),
            })),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', CreateSipTrunkRequestSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const hubId = c.get('hubId')

    try {
      const trunk = await services.providerSetup.createSipTrunk(
        body.provider as Parameters<typeof services.providerSetup.createSipTrunk>[0],
        body.domain,
        hubId ?? body.hubId,
      )
      return c.json(trunk)
    } catch (err) {
      const { ProviderApiError } = await import('../services/provider-setup/types')
      if (err instanceof ProviderApiError) {
        return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 500)
      }
      throw err
    }
  },
)

export default providerSetup
