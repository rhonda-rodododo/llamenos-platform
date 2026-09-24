/**
 * WebRTC call handling for in-browser calling.
 *
 * This module provides a provider-agnostic interface for WebRTC calls.
 * Each telephony provider (Twilio, SignalWire, Vonage, Plivo) has its own
 * client SDK. This module abstracts over them, using dynamic imports to
 * load only the needed SDK.
 *
 * The actual media handling is done by the provider's SDK — this module
 * manages lifecycle (init, accept, hangup, mute) and exposes events.
 */

import { getWebRtcToken } from './api'

export type WebRtcState = 'idle' | 'initializing' | 'ready' | 'ringing' | 'connected' | 'error'

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
    const { token, provider } = await getWebRtcToken()

    switch (provider) {
      case 'twilio':
      case 'signalwire':
        await initTwilioWebRtc(token)
        break
      case 'vonage':
      case 'plivo':
        // Vonage/Plivo use their own SDKs — for now we handle
        // calls via the WebSocket notification path (answer triggers
        // server-side bridging). Full browser audio will be added
        // when provider SDKs are available.
        console.debug(`[webrtc] ${provider} WebRTC: using WebSocket notification mode`)
        setState('ready')
        break
      default:
        throw new Error(`WebRTC not supported for provider: ${provider}`)
    }
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
  try {
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
  } catch (err) {
    // If @twilio/voice-sdk is not installed, fall back to WebSocket mode
    console.warn('[webrtc] Twilio Voice SDK not available, using WebSocket notification mode:', err)
    setState('ready')
  }
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
