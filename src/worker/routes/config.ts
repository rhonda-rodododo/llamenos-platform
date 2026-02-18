import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import type { EnabledChannels, SetupState } from '../../shared/types'

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
  try {
    const setupRes = await dos.settings.fetch(new Request('http://do/settings/setup'))
    if (setupRes.ok) {
      const setupState = await setupRes.json() as SetupState
      setupCompleted = setupState.setupCompleted
    }
  } catch { /* default to true */ }

  return c.json({
    hotlineName: c.env.HOTLINE_NAME || 'Hotline',
    hotlineNumber,
    channels,
    setupCompleted,
    adminPubkey: c.env.ADMIN_PUBKEY,
  })
})

export default config
