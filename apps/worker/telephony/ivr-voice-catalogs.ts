/**
 * Provider type → IVR voice catalog registry (#732).
 *
 * `ivr-menu.ts` builds a menu from an already-known {@link IvrVoiceCatalog};
 * it deliberately has no idea which provider is active. This module is the
 * one place that maps a stored `TelephonyProviderConfig.type` string back to
 * the catalog declared alongside that provider's adapter (#679 / PR #673),
 * so a hub's IVR language override can be validated against "can the active
 * provider actually speak this?" without re-declaring the seven catalogs.
 */
import { ASTERISK_VOICES } from './asterisk'
import { BANDWIDTH_VOICES } from './bandwidth'
import { FREESWITCH_VOICES } from './freeswitch'
import type { IvrVoiceCatalog } from './ivr-menu'
import { PLIVO_VOICES } from './plivo'
import { TELNYX_VOICES } from './telnyx'
import { TWILIO_VOICES } from './twilio'
import { VONAGE_VOICES } from './vonage'

/**
 * SignalWire's adapter extends {@link TwilioAdapter} unchanged — same TwiML
 * `<Say language>` codes — so it shares Twilio's catalog rather than
 * declaring a duplicate.
 */
const IVR_VOICE_CATALOGS_BY_PROVIDER: Readonly<Record<string, IvrVoiceCatalog<unknown>>> = {
  twilio: TWILIO_VOICES,
  signalwire: TWILIO_VOICES,
  vonage: VONAGE_VOICES,
  plivo: PLIVO_VOICES,
  telnyx: TELNYX_VOICES,
  bandwidth: BANDWIDTH_VOICES,
  asterisk: ASTERISK_VOICES,
  freeswitch: FREESWITCH_VOICES,
}

/**
 * Look up the voice catalog for a stored provider type. Returns `undefined`
 * for an unknown/unconfigured provider — callers should treat that as "no
 * provider-speakability constraint can be checked yet", not as a rejection.
 */
export function getIvrVoiceCatalogForProvider(
  providerType: string | null | undefined,
): IvrVoiceCatalog<unknown> | undefined {
  if (!providerType) return undefined
  return IVR_VOICE_CATALOGS_BY_PROVIDER[providerType]
}
