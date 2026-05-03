/**
 * React context for the Nostr relay connection.
 *
 * Manages the RelayManager lifecycle: connects when authenticated,
 * disconnects on sign-out, and exposes relay state to the component tree.
 *
 * The relay authenticates via Rust CryptoState (nsec never in webview).
 * No getSecretKey callback is needed — NIP-42 auth uses platform.signNostrEvent().
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { RelayManager } from './relay'
import type { RelayState } from './types'

interface NostrContextValue {
  relay: RelayManager | null
  state: RelayState
}

const NostrContext = createContext<NostrContextValue>({
  relay: null,
  state: 'disconnected',
})

interface NostrProviderProps {
  children: ReactNode
  /** Relay WebSocket URL (from /api/config serverNostrPubkey presence) */
  relayUrl: string | undefined
  /** Server's Nostr pubkey for verifying authoritative events */
  serverPubkey: string | undefined
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /**
   * @deprecated Hub key now lives in Rust CryptoState — use platform.setHubKey().
   * Kept for backwards compat; ignored by RelayManager.
   */
  getHubKey?: () => Uint8Array | null
}

export function NostrProvider({
  children,
  relayUrl,
  serverPubkey,
  isAuthenticated,
}: NostrProviderProps) {
  const [state, setState] = useState<RelayState>('disconnected')
  const relayRef = useRef<RelayManager | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !relayUrl || !serverPubkey) {
      // Tear down if not authenticated or no relay configured
      if (relayRef.current) {
        relayRef.current.close()
        relayRef.current = null
        setState('disconnected')
      }
      return
    }

    // Build the relay URL — if the config gives a relative URL or just a path,
    // construct a full WebSocket URL from the current host.
    let wsUrl: string
    if (relayUrl.startsWith('ws://') || relayUrl.startsWith('wss://')) {
      wsUrl = relayUrl
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${protocol}//${window.location.host}${relayUrl}`
    }

    const manager = new RelayManager({
      relayUrl: wsUrl,
      serverPubkey,
      onStateChange: setState,
    })

    relayRef.current = manager
    manager.connect().catch((err) => {
      console.error('[nostr] Relay initial connection failed:', err)
    })

    // When the tab regains focus, check if the WebSocket is still alive.
    // Browsers may kill background WebSocket connections; reconnect immediately
    // rather than waiting for the exponential backoff timer.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && relayRef.current) {
        const currentState = relayRef.current.getState()
        if (currentState === 'disconnected') {
          relayRef.current.connect().catch((err) => {
            console.error('[nostr] Relay reconnection failed:', err)
          })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      manager.close()
      relayRef.current = null
      setState('disconnected')
    }
  }, [isAuthenticated, relayUrl, serverPubkey])

  return (
    <NostrContext.Provider value={{ relay: relayRef.current, state }}>
      {children}
    </NostrContext.Provider>
  )
}

/** Access the RelayManager instance (null when no relay is configured or disconnected) */
export function useRelay(): RelayManager | null {
  return useContext(NostrContext).relay
}

/** Current relay connection state */
export function useRelayState(): RelayState {
  return useContext(NostrContext).state
}
