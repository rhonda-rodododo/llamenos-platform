/**
 * React hooks for WebSocket relay subscriptions.
 */

import { useEffect, useRef } from 'react'
import { useRelay, useRelayState } from './context'
import type { RelayEventHandler } from './types'

/**
 * Subscribe to relay events for a set of hubs (one relay subscription per hub).
 *
 * Automatically manages subscription lifecycle: subscribes when the relay
 * is connected, unsubscribes on unmount or when deps change.
 *
 * Multi-hub axiom: anything that must be received regardless of what the user
 * is browsing (incoming calls, conversation events) subscribes to EVERY member
 * hub with this hook, never to the active hub only.
 *
 * @param hubIds - Hubs to subscribe to; order and duplicates are irrelevant
 * @param kinds - Event kinds to listen for
 * @param handler - Callback receiving (kind, decrypted content, hubId of the originating hub)
 * @param enabled - Set to false to disable the subscription (default: true)
 */
export function useRelaySubscriptions(
  hubIds: readonly string[],
  kinds: number[],
  handler: RelayEventHandler,
  enabled = true,
): void {
  const relay = useRelay()
  const state = useRelayState()
  // Keep handler ref stable to avoid resubscribing on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const hubKey = [...new Set(hubIds)].sort().join(',')

  useEffect(() => {
    if (!relay || !hubKey || !enabled || state !== 'connected') return

    const subIds = hubKey.split(',').map(hubId =>
      relay.subscribe(hubId, kinds, (kind, content, hub) => {
        handlerRef.current(kind, content, hub)
      }),
    )

    return () => {
      for (const subId of subIds) relay.unsubscribe(subId)
    }
    // Resubscribe when relay instance, hub set, kinds, or enabled state changes
  }, [relay, hubKey, kinds.join(','), enabled, state])
}

/**
 * Subscribe to relay events for a single hub. See {@link useRelaySubscriptions}
 * for the multi-hub form.
 */
export function useRelaySubscription(
  hubId: string | undefined,
  kinds: number[],
  handler: RelayEventHandler,
  enabled = true,
): void {
  useRelaySubscriptions(hubId ? [hubId] : [], kinds, handler, enabled)
}
