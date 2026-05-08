/**
 * React context for the WebSocket relay connection.
 *
 * Manages the RelayConnection lifecycle: connects when authenticated,
 * disconnects on sign-out, and exposes relay state to the component tree.
 *
 * Authentication uses Ed25519 challenge-response via Rust CryptoState.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { RelayConnection } from './connection'
import type { RelayState } from './types'

interface RelayContextValue {
  relay: RelayConnection | null
  state: RelayState
}

const RelayContext = createContext<RelayContextValue>({
  relay: null,
  state: 'disconnected',
})

interface RelayProviderProps {
  children: ReactNode
  /** WebSocket relay URL (from /api/config) */
  relayUrl: string | undefined
  /** Server's Ed25519 pubkey for verifying event signatures */
  serverPubkey: string | undefined
  /** Device signing pubkey (Ed25519 hex) */
  devicePubkey: string | undefined
  /** Whether the user is authenticated */
  isAuthenticated: boolean
}

export function RelayProvider({
  children,
  relayUrl,
  serverPubkey,
  devicePubkey,
  isAuthenticated,
}: RelayProviderProps) {
  const [state, setState] = useState<RelayState>('disconnected')
  const relayRef = useRef<RelayConnection | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !relayUrl || !serverPubkey || !devicePubkey) {
      if (relayRef.current) {
        relayRef.current.close()
        relayRef.current = null
        setState('disconnected')
      }
      return
    }

    // Build the relay URL — if relative, construct full WebSocket URL
    let wsUrl: string
    if (relayUrl.startsWith('ws://') || relayUrl.startsWith('wss://')) {
      wsUrl = relayUrl
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${protocol}//${window.location.host}${relayUrl}`
    }

    const connection = new RelayConnection({
      relayUrl: wsUrl,
      serverPubkey,
      devicePubkey,
      onStateChange: setState,
    })

    relayRef.current = connection
    connection.connect().catch((err) => {
      console.error('[relay] Initial connection failed:', err)
    })

    // Reconnect on tab focus (browsers may kill background WebSocket)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && relayRef.current) {
        if (relayRef.current.getState() === 'disconnected') {
          relayRef.current.connect().catch((err) => {
            console.error('[relay] Reconnection failed:', err)
          })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      connection.close()
      relayRef.current = null
      setState('disconnected')
    }
  }, [isAuthenticated, relayUrl, serverPubkey, devicePubkey])

  return (
    <RelayContext.Provider value={{ relay: relayRef.current, state }}>
      {children}
    </RelayContext.Provider>
  )
}

/** Access the RelayConnection instance (null when not configured/connected) */
export function useRelay(): RelayConnection | null {
  return useContext(RelayContext).relay
}

/** Current relay connection state */
export function useRelayState(): RelayState {
  return useContext(RelayContext).state
}
