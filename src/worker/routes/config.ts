import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
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
  try {
    const setupRes = await dos.settings.fetch(new Request('http://do/settings/setup'))
    if (setupRes.ok) {
      const setupState = await setupRes.json() as SetupState & { demoMode?: boolean }
      setupCompleted = setupState.setupCompleted
      demoMode = setupState.demoMode ?? false
    }
  } catch { /* default to true */ }

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

  return c.json({
    hotlineName: c.env.HOTLINE_NAME || 'Hotline',
    hotlineNumber,
    channels,
    setupCompleted,
    adminPubkey: c.env.ADMIN_PUBKEY,
    demoMode,
    needsBootstrap,
    hubs,
    defaultHubId,
  })
})

export default config
