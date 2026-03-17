import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import type { AppEnv } from '../types'
import { deriveServerKeypair } from '../lib/nostr-publisher'
import { CURRENT_API_VERSION, MIN_API_VERSION } from '../lib/api-versions'
import type { EnabledChannels, Hub, SetupState } from '@shared/types'
import { configResponseSchema, configVerifyResponseSchema } from '@protocol/schemas/config'
import { publicErrors } from '../openapi/helpers'

const config = new Hono<AppEnv>()

config.get('/',
  describeRoute({
    tags: ['Config'],
    summary: 'Get public application configuration',
    responses: {
      200: {
        description: 'Application configuration',
        content: {
          'application/json': {
            schema: resolver(configResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')

    // Fetch enabled channels to include in config
    const channels = await services.settings.getEnabledChannels(c.env)

    // Get phone number from telephony provider config or env
    let hotlineNumber = c.env.TWILIO_PHONE_NUMBER || ''
    try {
      const prov = await services.settings.getTelephonyProvider()
      if (prov?.phoneNumber) hotlineNumber = prov.phoneNumber
    } catch { /* ignore */ }

    // Fetch setup state
    let setupCompleted = true
    let demoMode = false
    const envDemoMode = c.env.DEMO_MODE === 'true'
    try {
      const setupState = await services.settings.getSetupState()
      setupCompleted = setupState.setupCompleted
      demoMode = envDemoMode || ((setupState as SetupState & { demoMode?: boolean }).demoMode ?? false)
    } catch {
      // If env var forces demo mode, still set it even on fetch failure
      demoMode = envDemoMode
    }

    // Check if bootstrap is needed (no admin exists)
    let needsBootstrap = false
    try {
      const { hasAdmin } = await services.identity.hasAdmin()
      needsBootstrap = !hasAdmin
    } catch { /* default to false */ }

    // Fetch active hubs
    let hubs: Hub[] = []
    let defaultHubId: string | undefined
    try {
      const hubsData = await services.settings.getHubs()
      hubs = hubsData.hubs.filter(h => h.status === 'active')
      if (hubs.length === 1) {
        defaultHubId = hubs[0].id
      }
    } catch { /* default to empty */ }

    // Derive server Nostr pubkey for client event verification (Epic 76.1)
    // NOTE: serverEventKeyHex moved to authenticated /api/auth/me endpoint (Epic 258 C2)
    const serverNostrPubkey = c.env.SERVER_NOSTR_SECRET
      ? deriveServerKeypair(c.env.SERVER_NOSTR_SECRET).pubkey
      : undefined

    // Client-facing relay URL:
    // - Explicit env var takes priority (any deployment)
    // - /nostr fallback only for self-hosted (NOSTR_RELAY_URL set = strfry behind Caddy)
    // - CF deployments use NOSFLARE service binding (server-side only, no client WebSocket)
    const nostrRelayUrl = c.env.NOSTR_RELAY_PUBLIC_URL
      || (c.env.NOSTR_RELAY_URL ? '/nostr' : undefined)

    return c.json({
      hotlineName: c.env.HOTLINE_NAME || 'Hotline',
      hotlineNumber,
      channels,
      setupCompleted,
      demoMode,
      demoResetSchedule: envDemoMode ? (c.env.DEMO_RESET_CRON || null) : null,
      needsBootstrap,
      hubs,
      defaultHubId,
      serverNostrPubkey,
      nostrRelayUrl,
      apiVersion: CURRENT_API_VERSION,
      minApiVersion: MIN_API_VERSION,
      // GlitchTip/Sentry DSN for client-side crash reporting (opt-in, privacy-first)
      ...(c.env.GLITCHTIP_DSN ? { sentryDsn: c.env.GLITCHTIP_DSN } : {}),
    })
  })

// Build verification endpoint (Epic 79: Reproducible Builds)
// Informational only — trust anchor is CHECKSUMS.txt in GitHub Releases
config.get('/verify',
  describeRoute({
    tags: ['Config'],
    summary: 'Get build verification info',
    responses: {
      200: {
        description: 'Build verification metadata',
        content: {
          'application/json': {
            schema: resolver(configVerifyResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      version: __BUILD_VERSION__,
      commit: __BUILD_COMMIT__,
      buildTime: __BUILD_TIME__,
      verificationUrl: 'https://github.com/rhonda-rodododo/llamenos/releases',
      trustAnchor: 'GitHub Release checksums + SLSA provenance',
    })
  })

export default config
