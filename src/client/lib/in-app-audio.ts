import type { TelephonyProviderType } from '@shared/types'

/**
 * Providers whose calls can be answered with audio inside the app.
 *
 * Only Twilio and SignalWire have a browser-audio client integration
 * (`@twilio/voice-sdk`, see `webrtc.ts`) and a token minter on the server
 * (`apps/worker/telephony/webrtc-tokens.ts`). Every other provider still
 * rings volunteers' phones (PSTN parallel ringing), but the app cannot carry
 * the call audio.
 *
 * Keep in sync with the server's WebRTC token support until in-app audio for
 * all providers is routed through the SIP bridge.
 */
const IN_APP_AUDIO_PROVIDERS: ReadonlySet<string> = new Set<TelephonyProviderType>(['twilio', 'signalwire'])

export function supportsInAppAudio(provider: string | null | undefined): boolean {
  return provider != null && IN_APP_AUDIO_PROVIDERS.has(provider)
}
