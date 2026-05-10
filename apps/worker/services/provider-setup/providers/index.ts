import { registerProvider } from '../registry'
import { twilioProvider } from './twilio'
import { telnyxProvider } from './telnyx'
import { signalwireProvider } from './signalwire'
import { vonageProvider } from './vonage'
import { plivoProvider } from './plivo'
import { bandwidthProvider } from './bandwidth'
import { asteriskProvider } from './asterisk'
import { freeswitchProvider } from './freeswitch'

/**
 * Register all 8 telephony provider implementations in the capability registry.
 */
export function registerAllProviders(): void {
  registerProvider(twilioProvider)
  registerProvider(telnyxProvider)
  registerProvider(signalwireProvider)
  registerProvider(vonageProvider)
  registerProvider(plivoProvider)
  registerProvider(bandwidthProvider)
  registerProvider(asteriskProvider)
  registerProvider(freeswitchProvider)
}

export {
  twilioProvider,
  telnyxProvider,
  signalwireProvider,
  vonageProvider,
  plivoProvider,
  bandwidthProvider,
  asteriskProvider,
  freeswitchProvider,
}
