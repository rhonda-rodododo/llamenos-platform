/**
 * Nostr relay connection manager for Llamenos.
 *
 * Handles:
 * - WebSocket connection to the Nostr relay
 * - NIP-42 authentication (via Rust CryptoState — nsec never in webview)
 * - Subscription management
 * - Reconnection with exponential backoff + jitter
 * - Event deduplication and validation
 */

import { verifyEvent } from 'nostr-tools/pure'
import type { Event as NostrEvent } from 'nostr-tools/core'
import { signNostrEvent, decryptHubEvent, decryptServerEvent } from '../platform'
import { EventDeduplicator, validateLlamenosEvent, parseLlamenosContent } from './events'
import type { LlamenosEvent, RelayState, NostrEventHandler } from './types'

export interface RelayManagerOptions {
  relayUrl: string
  serverPubkey: string
  /** @deprecated Hub key now lives in Rust CryptoState — use platform.setHubKey() */
  getHubKey?: () => Uint8Array | null
  onStateChange?: (state: RelayState) => void
}

interface Subscription {
  id: string
  hubId: string
  kinds: number[]
  handler: NostrEventHandler
}

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000
const MAX_RECONNECT_ATTEMPTS = 20

/** NIP-42 authentication state */
export type AuthState = 'unauthenticated' | 'authenticating' | 'authenticated'

export class RelayManager {
  private ws: WebSocket | null = null
  private state: RelayState = 'disconnected'
  private serverPubkey: string
  private relayUrl: string
  private onStateChange?: (state: RelayState) => void
  private subscriptions = new Map<string, Subscription>()
  private pendingSubscriptions: Subscription[] = []
  private deduplicator = new EventDeduplicator()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private authState: AuthState = 'unauthenticated'
  /** The event ID of the most recent NIP-42 auth event, used to match relay OK */
  private pendingAuthEventId: string | null = null
  /** Tracks the timestamp of the last received event per hub for replay on reconnect */
  private lastEventTimestamp = new Map<string, number>()
  /** Timestamp when the connection was lost — used to request missed events */
  private disconnectedAt: number | null = null

  constructor(options: RelayManagerOptions) {
    this.relayUrl = options.relayUrl
    this.serverPubkey = options.serverPubkey
    this.onStateChange = options.onStateChange
  }

  /** Current connection state */
  getState(): RelayState {
    return this.state
  }

  /** Server's Nostr pubkey for verifying authoritative events */
  getServerPubkey(): string {
    return this.serverPubkey
  }

  /** Connect to the relay */
  async connect(): Promise<void> {
    if (this.destroyed) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.setState('connecting')

    try {
      const ws = new WebSocket(this.relayUrl)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('WebSocket connection timeout'))
        }, 10_000)

        ws.addEventListener('open', () => {
          clearTimeout(timeout)
          this.ws = ws
          this.reconnectAttempts = 0
          this.setupListeners(ws)
          // Clear disconnectedAt after subscriptions are flushed (they use it for since filter)
          // The flushPendingSubscriptions() call happens after auth, so disconnectedAt is still
          // available when building the since filter
          resolve()
        })

        ws.addEventListener('error', () => {
          clearTimeout(timeout)
          reject(new Error('WebSocket connection error'))
        })
      })
    } catch (err) {
      this.setState('disconnected')
      this.scheduleReconnect()
      throw err
    }
  }

  /**
   * Subscribe to hub events. Returns a subscription ID for cleanup.
   * Synchronous return — no async leak in useEffect cleanup.
   */
  subscribe(hubId: string, kinds: number[], handler: NostrEventHandler): string {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      hubId,
      kinds,
      handler,
    }

    this.subscriptions.set(sub.id, sub)

    if (this.ws?.readyState === WebSocket.OPEN && this.authState === 'authenticated') {
      this.sendSubscription(sub)
    } else {
      this.pendingSubscriptions.push(sub)
    }

    return sub.id
  }

  /** Unsubscribe by subscription ID */
  unsubscribe(subId: string): void {
    const sub = this.subscriptions.get(subId)
    if (!sub) return

    this.subscriptions.delete(subId)
    this.pendingSubscriptions = this.pendingSubscriptions.filter(s => s.id !== subId)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['CLOSE', subId]))
    }
  }

  /** Publish a signed event to the relay */
  async publish(event: NostrEvent): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Relay not connected')
    }
    this.ws.send(JSON.stringify(['EVENT', event]))
  }

  /** Graceful shutdown */
  close(): void {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    for (const sub of this.subscriptions.values()) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify(['CLOSE', sub.id])) } catch {}
      }
    }
    this.subscriptions.clear()
    this.pendingSubscriptions = []
    this.deduplicator.destroy()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('disconnected')
  }

  private setState(state: RelayState): void {
    this.state = state
    this.onStateChange?.(state)
  }

  private setupListeners(ws: WebSocket): void {
    ws.addEventListener('message', (msg) => {
      try {
        const data = JSON.parse(typeof msg.data === 'string' ? msg.data : '')
        if (!Array.isArray(data) || data.length === 0) return

        switch (data[0]) {
          case 'AUTH':
            this.handleAuth(data[1] as string)
            break
          case 'EVENT':
            this.handleEvent(data[1] as string, data[2] as NostrEvent)
            break
          case 'OK': {
            const okEventId = data[1] as string
            const okAccepted = data[2] as boolean
            const okMessage = data[3] as string | undefined

            // Check if this OK is for our pending NIP-42 auth event
            if (this.pendingAuthEventId && okEventId === this.pendingAuthEventId) {
              this.pendingAuthEventId = null
              if (okAccepted) {
                this.authState = 'authenticated'
                this.setState('connected')
                this.flushPendingSubscriptions()
              } else {
                this.authState = 'unauthenticated'
                console.error(`[nostr] Relay rejected NIP-42 auth: ${okMessage}`)
                this.scheduleReconnect()
              }
              break
            }

            // Regular event OK
            if (!okAccepted) {
              console.warn(`[nostr] Event ${okEventId} rejected: ${okMessage}`)
            }
            break
          }
          case 'EOSE':
            // End of stored events for subscription
            break
          case 'CLOSED':
            // Subscription closed by relay: [CLOSED, subId, reason]
            if (typeof data[2] === 'string' && data[2].startsWith('auth-required:')) {
              // Re-authenticate
              this.authState = 'unauthenticated'
              this.setState('authenticating')
            }
            break
          case 'NOTICE':
            console.warn(`[nostr] Relay notice: ${data[1]}`)
            break
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.addEventListener('close', () => {
      this.ws = null
      this.authState = 'unauthenticated'
      this.pendingAuthEventId = null
      this.disconnectedAt = Date.now()
      this.setState('disconnected')
      if (!this.destroyed) {
        this.scheduleReconnect()
      }
    })

    ws.addEventListener('error', () => {
      // Error event fires before close, so just log
    })

    // If no AUTH challenge arrives within 2s, assume open relay
    const authTimer = setTimeout(() => {
      if (this.authState === 'unauthenticated' && this.ws === ws && !this.destroyed) {
        this.authState = 'authenticated'
        this.setState('connected')
        this.flushPendingSubscriptions()
      }
    }, 2000)

    // Store reference so close() can cancel it
    ws.addEventListener('close', () => clearTimeout(authTimer), { once: true })
  }

  private async handleAuth(challenge: string): Promise<void> {
    this.authState = 'authenticating'
    this.setState('authenticating')

    try {
      // Sign NIP-42 auth event via Rust CryptoState (nsec never enters webview)
      const authEvent = await signNostrEvent(
        22242,
        Math.floor(Date.now() / 1000),
        [
          ['relay', this.relayUrl],
          ['challenge', challenge],
        ],
        '',
      )

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.pendingAuthEventId = authEvent.id
        this.ws.send(JSON.stringify(['AUTH', authEvent]))
        // Events/subscriptions are buffered until relay confirms auth via OK
      }
    } catch {
      this.authState = 'unauthenticated'
      console.error('[nostr] Cannot authenticate: key manager locked or IPC error')
    }
  }

  private async handleEvent(_subId: string, event: NostrEvent): Promise<void> {
    // Validate signature and structure
    if (!verifyEvent(event)) return
    if (!validateLlamenosEvent(event)) return

    // Deduplication
    if (!this.deduplicator.isNew(event)) return

    // Verify publisher identity — reject events not from the server
    if (event.pubkey !== this.serverPubkey) return

    // Decrypt content via Rust CryptoState (H2 — key never enters JS)
    // Try epoch-keyed server event key first, then hub key
    const epochTag = event.tags.find(t => t[0] === 'epoch')
    let decrypted: string | null = null

    if (epochTag) {
      const epoch = parseInt(epochTag[1], 10)
      if (!isNaN(epoch)) {
        decrypted = await decryptServerEvent(event.content, epoch)
      }
    }

    // Fall back to hub key decryption for events without epoch tag
    if (!decrypted) {
      decrypted = await decryptHubEvent(event.content)
    }

    const content = parseLlamenosContent(decrypted)
    if (!content) return

    // Route to all matching subscribers
    const hubId = event.tags.find(t => t[0] === 'd')?.[1]
    if (!hubId) return

    // Track the latest event timestamp per hub for replay on reconnect
    const prevTs = this.lastEventTimestamp.get(hubId) ?? 0
    if (event.created_at > prevTs) {
      this.lastEventTimestamp.set(hubId, event.created_at)
    }

    for (const sub of this.subscriptions.values()) {
      if (sub.hubId === hubId && sub.kinds.includes(event.kind)) {
        try {
          sub.handler(event, content)
        } catch (err) {
          console.error('[nostr] Handler error:', err)
        }
      }
    }
  }

  private sendSubscription(sub: Subscription): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // Build the filter with optional `since` for replay of missed events
    const filter: Record<string, unknown> = {
      kinds: sub.kinds,
      '#d': [sub.hubId],
      '#t': ['llamenos:event'],
    }

    // On reconnect, request events since the last received timestamp for this hub
    // to catch up on events missed during disconnection
    const lastTs = this.lastEventTimestamp.get(sub.hubId)
    if (lastTs) {
      // Subtract 1 second to ensure we don't miss events at the boundary
      filter.since = lastTs - 1
    } else if (this.disconnectedAt) {
      // If we have no events yet but know when we disconnected, use that
      filter.since = Math.floor(this.disconnectedAt / 1000) - 1
    }

    this.ws.send(JSON.stringify(['REQ', sub.id, filter]))
  }

  private flushPendingSubscriptions(): void {
    const pending = [...this.pendingSubscriptions]
    this.pendingSubscriptions = []
    for (const sub of pending) {
      this.sendSubscription(sub)
    }
    // Also re-send all active subscriptions on reconnect
    for (const sub of this.subscriptions.values()) {
      if (!pending.includes(sub)) {
        this.sendSubscription(sub)
      }
    }
    // Clear disconnectedAt after all subscriptions have been sent with the since filter
    this.disconnectedAt = null
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    )
    const jitter = Math.random() * 500

    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => {
        // scheduleReconnect will be called from the close handler
      })
    }, delay + jitter)
  }
}
