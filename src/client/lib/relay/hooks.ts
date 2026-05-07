/**
 * React hooks for WebSocket relay subscriptions.
 */

import { useEffect, useRef } from 'react'
import { useRelay, useRelayState } from './context'
import type { RelayEventHandler } from './types'

/**
 * Subscribe to relay events for a specific hub.
 *
 * Automatically manages subscription lifecycle: subscribes when the relay
 * is connected, unsubscribes on unmount or when deps change.
 *
 * @param hubId - Hub to subscribe to (from config)
 * @param kinds - Event kinds to listen for
 * @param handler - Callback receiving (kind, decrypted content, hubId)
 * @param enabled - Set to false to disable the subscription (default: true)
 */
export function useRelaySubscription(
  hubId: string | undefined,
  kinds: number[],
  handler: RelayEventHandler,
  enabled = true,
): void {
  const relay = useRelay()
  const state = useRelayState()
  // Keep handler ref stable to avoid resubscribing on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!relay || !hubId || !enabled || state !== 'connected') return

    const subId = relay.subscribe(hubId, kinds, (kind, content, hub) => {
      handlerRef.current(kind, content, hub)
    })

    return () => {
      relay.unsubscribe(subId)
    }
    // Resubscribe when relay instance, hub, kinds, or enabled state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay, hubId, kinds.join(','), enabled, state])
}
