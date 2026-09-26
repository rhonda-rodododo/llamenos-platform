/**
 * WebRTC call handling for in-browser calling.
 *
 * In-app audio is available for Twilio and SignalWire only (see
 * `in-app-audio.ts`). For every other provider calls still ring volunteers'
 * phones, but the app cannot carry the audio — `initWebRtc` reports that as
 * the `unsupported` state instead of pretending to be ready.
 *
 * The actual media handling is done by the provider's SDK — this module
 * manages lifecycle (init, accept, hangup, mute) and exposes events.
 */

import { getWebRtcStatus, getWebRtcToken } from './api'
import { supportsInAppAudio } from './in-app-audio'

export type WebRtcState = 'idle' | 'initializing' | 'ready' | 'ringing' | 'connected' | 'error' | 'unsupported'

type StateChangeHandler = (state: WebRtcState, error?: string) => void

let currentState: WebRtcState = 'idle'
const stateHandlers = new Set<StateChangeHandler>()
let twilioDevice: TwilioDevice | null = null
let activeConnection: TwilioConnection | null = null

// Twilio Voice SDK types (minimal interface we need)
interface TwilioDevice {
  register: () => Promise<void>
  unregister: () => Promise<void>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  destroy: () => void
  state: string
}

interface TwilioConnection {
  accept: () => void
  reject: () => void
  disconnect: () => void
  mute: (muted?: boolean) => void
  isMuted: () => boolean
  on: (event: string, handler: (...args: unknown[]) => void) => void
  parameters: Record<string, string>
  status: () => string
}

function setState(state: WebRtcState, error?: string) {
  currentState = state
  stateHandlers.forEach(h => h(state, error))
}

export function onStateChange(handler: StateChangeHandler): () => void {
  stateHandlers.add(handler)
  return () => stateHandlers.delete(handler)
}

export function getState(): WebRtcState {
  return currentState
}

/**
 * Initialize WebRTC client for the current provider.
 * Requests a token from the server and sets up the provider SDK.
 */
export async function initWebRtc(): Promise<void> {
  if (currentState === 'ready' || currentState === 'initializing') return

  setState('initializing')

  try {
    // Ask which provider is configured BEFORE requesting a token: providers
    // without in-app audio have no token minter (the request would fail) or,
    // for Vonage/Plivo, a token we have no client SDK to use.
    const { provider } = await getWebRtcStatus()
    if (provider && !supportsInAppAudio(provider)) {
      // Calls ring the volunteer's phone. Say so instead of claiming to be
      // ready with nothing to answer with.
      console.debug(`[webrtc] ${provider} has no in-app audio; calls ring the phone only`)
      setState('unsupported')
      return
    }

    const { token } = await getWebRtcToken()
    await initTwilioWebRtc(token)
  } catch (err) {
    console.error('[webrtc] Init failed:', err)
    setState('error', err instanceof Error ? err.message : 'WebRTC initialization failed')
  }
}

/**
 * Initialize Twilio/SignalWire Voice SDK.
 * Uses dynamic import to load the SDK only when needed.
 */
async function initTwilioWebRtc(token: string): Promise<void> {
  // Dynamic import — only loads when WebRTC is actually used.
  // Uses a variable to prevent TypeScript from resolving at compile time.
  const sdkModule = '@twilio/voice-sdk'
  const { Device } = await import(/* @vite-ignore */ sdkModule) as {
    Device: new (token: string, opts: Record<string, unknown>) => TwilioDevice & { register: () => Promise<void> }
  }
  const device = new Device(token, {
    closeProtection: true,
    codecPreferences: ['opus', 'pcmu'],
  })

  device.on('registered', () => {
    console.debug('[webrtc] Twilio Device registered')
    setState('ready')
  })

  device.on('error', (...args: unknown[]) => {
    const error = args[0] as { message?: string } | undefined
    console.error('[webrtc] Twilio Device error:', error)
    setState('error', error?.message || 'Device error')
  })

  device.on('incoming', (...args: unknown[]) => {
    const conn = args[0] as TwilioConnection
    console.debug('[webrtc] Incoming call via WebRTC')
    activeConnection = conn
    setState('ringing')

    conn.on('accept', () => {
      setState('connected')
    })

    conn.on('disconnect', () => {
      activeConnection = null
      setState('ready')
    })

    conn.on('reject', () => {
      activeConnection = null
      setState('ready')
    })
  })

  device.on('unregistered', () => {
    console.debug('[webrtc] Twilio Device unregistered')
    setState('idle')
  })

  twilioDevice = device
  await device.register()
}

/**
 * Accept an incoming WebRTC call.
 */
export function acceptCall(): void {
  if (activeConnection) {
    activeConnection.accept()
    setState('connected')
  }
}

/**
 * Reject/decline an incoming WebRTC call.
 */
export function rejectCall(): void {
  if (activeConnection) {
    activeConnection.reject()
    activeConnection = null
    setState('ready')
  }
}

/**
 * Hang up the current WebRTC call.
 */
export function hangupCall(): void {
  if (activeConnection) {
    activeConnection.disconnect()
    activeConnection = null
    setState('ready')
  }
}

/**
 * Toggle mute on the current WebRTC call.
 */
export function toggleMute(): boolean {
  if (!activeConnection) return false
  const muted = !activeConnection.isMuted()
  activeConnection.mute(muted)
  return muted
}

/**
 * Check if the current call is muted.
 */
export function isMuted(): boolean {
  return activeConnection?.isMuted() ?? false
}

/**
 * Clean up WebRTC resources.
 */
export function destroyWebRtc(): void {
  if (activeConnection) {
    activeConnection.disconnect()
    activeConnection = null
  }
  if (twilioDevice) {
    twilioDevice.destroy()
    twilioDevice = null
  }
  setState('idle')
}

/**
 * Check if WebRTC is currently connected (in a call).
 */
export function isConnected(): boolean {
  return currentState === 'connected'
}

/**
 * Check if there's an incoming WebRTC call waiting.
 */
export function hasIncomingCall(): boolean {
  return currentState === 'ringing' && activeConnection !== null
}
