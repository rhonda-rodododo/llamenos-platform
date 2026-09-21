/**
 * #732 — getIvrVoiceCatalogForProvider: the provider-type → catalog lookup
 * that lets per-hub IVR language overrides be validated against "can the
 * active provider actually speak this?" without re-declaring the seven
 * catalogs built for #679 / PR #673.
 */
import { describe, it, expect } from 'vitest'
import { getIvrVoiceCatalogForProvider } from '@worker/telephony/ivr-voice-catalogs'
import { TWILIO_VOICES } from '@worker/telephony/twilio'
import { VONAGE_VOICES } from '@worker/telephony/vonage'
import { PLIVO_VOICES } from '@worker/telephony/plivo'
import { TELNYX_VOICES } from '@worker/telephony/telnyx'
import { BANDWIDTH_VOICES } from '@worker/telephony/bandwidth'
import { ASTERISK_VOICES } from '@worker/telephony/asterisk'
import { FREESWITCH_VOICES } from '@worker/telephony/freeswitch'

describe('getIvrVoiceCatalogForProvider', () => {
  it('resolves each of the eight declared provider types', () => {
    expect(getIvrVoiceCatalogForProvider('twilio')).toBe(TWILIO_VOICES)
    expect(getIvrVoiceCatalogForProvider('vonage')).toBe(VONAGE_VOICES)
    expect(getIvrVoiceCatalogForProvider('plivo')).toBe(PLIVO_VOICES)
    expect(getIvrVoiceCatalogForProvider('telnyx')).toBe(TELNYX_VOICES)
    expect(getIvrVoiceCatalogForProvider('bandwidth')).toBe(BANDWIDTH_VOICES)
    expect(getIvrVoiceCatalogForProvider('asterisk')).toBe(ASTERISK_VOICES)
    expect(getIvrVoiceCatalogForProvider('freeswitch')).toBe(FREESWITCH_VOICES)
  })

  it('resolves signalwire to the Twilio catalog (SignalWireAdapter extends TwilioAdapter)', () => {
    expect(getIvrVoiceCatalogForProvider('signalwire')).toBe(TWILIO_VOICES)
  })

  it('returns undefined for an unknown or missing provider type', () => {
    expect(getIvrVoiceCatalogForProvider('carrier-pigeon')).toBeUndefined()
    expect(getIvrVoiceCatalogForProvider(undefined)).toBeUndefined()
    expect(getIvrVoiceCatalogForProvider(null)).toBeUndefined()
  })
})
