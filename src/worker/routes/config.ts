import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { deriveServerKeypair } from '../lib/nostr-publisher'
import type { EnabledChannels, Hub, SetupState } from '../../shared/types'

const config = new Hono<AppEnv>()

config.get('/', async (c) => {
  const dos = getDOs(c.env)

  // Fetch enabled channels to include in config
  const channelsRes = await dos.settings.fetch(new Request('http://do/settings/enabled-channels'))
  const channels = await channelsRes.json() as EnabledChannels

  // Get phone number from telephony provider config or env
  let hotlineNumber = c.env.TWILIO_PHONE_NUMBER || ''
  try {
    const provRes = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
    if (provRes.ok) {
      const prov = await provRes.json() as { phoneNumber?: string } | null
      if (prov?.phoneNumber) hotlineNumber = prov.phoneNumber
    }
  } catch { /* ignore */ }

  // Fetch setup state
  let setupCompleted = true
  let demoMode = false
  const envDemoMode = c.env.DEMO_MODE === 'true'
  try {
    const setupRes = await dos.settings.fetch(new Request('http://do/settings/setup'))
    if (setupRes.ok) {
      const setupState = await setupRes.json() as SetupState & { demoMode?: boolean }
      setupCompleted = setupState.setupCompleted
      demoMode = envDemoMode || (setupState.demoMode ?? false)
    }
  } catch {
    // If env var forces demo mode, still set it even on fetch failure
    demoMode = envDemoMode
  }

  // Check if bootstrap is needed (no admin exists)
  let needsBootstrap = false
  try {
    const adminCheckRes = await dos.identity.fetch(new Request('http://do/has-admin'))
    const { hasAdmin } = await adminCheckRes.json() as { hasAdmin: boolean }
    needsBootstrap = !hasAdmin
  } catch { /* default to false */ }

  // Fetch active hubs
  let hubs: Hub[] = []
  let defaultHubId: string | undefined
  try {
    const hubsRes = await dos.settings.fetch(new Request('http://do/settings/hubs'))
    if (hubsRes.ok) {
      const hubsData = await hubsRes.json() as { hubs: Hub[] }
      hubs = hubsData.hubs.filter(h => h.status === 'active')
      if (hubs.length === 1) {
        defaultHubId = hubs[0].id
      }
    }
  } catch { /* default to empty */ }

  // Derive server Nostr pubkey for client event verification (Epic 76.1)
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
  })
})

// Build verification endpoint (Epic 79: Reproducible Builds)
// Informational only — trust anchor is CHECKSUMS.txt in GitHub Releases
config.get('/verify', (c) => {
  return c.json({
    version: __BUILD_VERSION__,
    commit: __BUILD_COMMIT__,
    buildTime: __BUILD_TIME__,
    verificationUrl: 'https://github.com/rhonda-rodododo/llamenos/releases',
    trustAnchor: 'GitHub Release checksums + SLSA provenance',
  })
})

export default config
