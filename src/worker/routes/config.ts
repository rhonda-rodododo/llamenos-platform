import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import type { EnabledChannels } from '../../shared/types'

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

  return c.json({
    hotlineName: c.env.HOTLINE_NAME || 'Hotline',
    hotlineNumber,
    channels,
  })
})

export default config
