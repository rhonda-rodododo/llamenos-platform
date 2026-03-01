import { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { TelephonyProviderConfig } from '@shared/types'
import { getDOs } from '../lib/do-access'
import { generateWebRtcToken, isWebRtcConfigured } from '../telephony/webrtc-tokens'
import { generateSipParams, isSipConfigured } from '../telephony/sip-tokens'

const webrtc = new Hono<AppEnv>()

/**
 * GET /api/telephony/webrtc-token
 * Generate a provider-specific WebRTC access token for the authenticated volunteer.
 * Requires: provider config with webrtcEnabled=true and appropriate credentials.
 */
webrtc.get('/webrtc-token', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const volunteer = c.get('volunteer')

  // Check volunteer's call preference allows browser calls
  const callPref = volunteer.callPreference ?? 'phone'
  if (callPref === 'phone') {
    return c.json({ error: 'Call preference is set to phone only. Enable browser calling in settings.' }, 400)
  }

  // Get provider config
  const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
  if (!res.ok) {
    return c.json({ error: 'No telephony provider configured' }, 404)
  }
  const config = await res.json() as TelephonyProviderConfig | null
  if (!config || !isWebRtcConfigured(config)) {
    return c.json({ error: 'WebRTC is not configured for the current provider. Admin must enable it in settings.' }, 400)
  }

  try {
    // Use a sanitized identity (pubkey prefix — unique per volunteer)
    const identity = `vol_${pubkey.slice(0, 16)}`
    const result = await generateWebRtcToken(config, identity)
    return c.json({ token: result.token, provider: result.provider, identity })
  } catch (err) {
    console.error('[webrtc] Token generation failed:', err)
    return c.json({ error: 'Failed to generate WebRTC token' }, 500)
  }
})

/**
 * GET /api/telephony/sip-token
 * Generate standardized SIP connection parameters for mobile VoIP clients (Linphone SDK).
 * Returns provider-agnostic SIP config: domain, transport, credentials, ICE servers, encryption.
 */
webrtc.get('/sip-token', async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const volunteer = c.get('volunteer')

  // Check volunteer's call preference allows VoIP
  const callPref = volunteer.callPreference ?? 'phone'
  if (callPref === 'phone') {
    return c.json({ error: 'Call preference is set to phone only. Enable VoIP in settings.' }, 400)
  }

  // Get provider config
  const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
  if (!res.ok) {
    return c.json({ error: 'No telephony provider configured' }, 404)
  }
  const config = await res.json() as TelephonyProviderConfig | null
  if (!config || !isSipConfigured(config)) {
    return c.json({ error: 'SIP is not configured for the current provider.' }, 400)
  }

  try {
    const identity = `vol_${pubkey.slice(0, 16)}`
    const sipParams = generateSipParams(config, identity)
    return c.json(sipParams)
  } catch (err) {
    console.error('[sip] Token generation failed:', err)
    return c.json({ error: 'Failed to generate SIP parameters' }, 500)
  }
})

/**
 * GET /api/telephony/sip-status
 * Check whether SIP VoIP is available for the current provider.
 */
webrtc.get('/sip-status', async (c) => {
  const dos = getDOs(c.env)
  const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
  if (!res.ok) {
    return c.json({ available: false, provider: null })
  }
  const config = await res.json() as TelephonyProviderConfig | null
  return c.json({
    available: isSipConfigured(config),
    provider: config?.type ?? null,
  })
})

/**
 * GET /api/telephony/webrtc-status
 * Check whether WebRTC is available for the current provider.
 */
webrtc.get('/webrtc-status', async (c) => {
  const dos = getDOs(c.env)
  const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
  if (!res.ok) {
    return c.json({ available: false, provider: null })
  }
  const config = await res.json() as TelephonyProviderConfig | null
  return c.json({
    available: isWebRtcConfigured(config),
    provider: config?.type ?? null,
  })
})

export default webrtc
