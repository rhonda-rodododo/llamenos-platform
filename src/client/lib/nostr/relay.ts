/**
 * Nostr relay connection manager for Llamenos.
 *
 * Handles:
 * - WebSocket connection to the Nostr relay
 * - NIP-42 authentication
 * - Subscription management
 * - Reconnection with exponential backoff + jitter
 * - Event deduplication and validation
 */

import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import type { Event as NostrEvent } from 'nostr-tools/core'
import { EventDeduplicator, validateLlamenosEvent, parseLlamenosContent } from './events'
import { decryptFromHub } from '../hub-key-manager'
import type { LlamenosEvent, RelayState, NostrEventHandler } from './types'

export interface RelayManagerOptions {
  relayUrl: string
  serverPubkey: string
  getSecretKey: () => Uint8Array | null
  getHubKey: () => Uint8Array | null
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

export class RelayManager {
  private ws: WebSocket | null = null
  private state: RelayState = 'disconnected'
  private serverPubkey: string
  private relayUrl: string
  private getSecretKey: () => Uint8Array | null
  private getHubKey: () => Uint8Array | null
  private onStateChange?: (state: RelayState) => void
  private subscriptions = new Map<string, Subscription>()
  private pendingSubscriptions: Subscription[] = []
  private deduplicator = new EventDeduplicator()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private authenticated = false

  constructor(options: RelayManagerOptions) {
    this.relayUrl = options.relayUrl
    this.serverPubkey = options.serverPubkey
    this.getSecretKey = options.getSecretKey
    this.getHubKey = options.getHubKey
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

    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
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
          case 'OK':
            // Event accepted/rejected: [OK, eventId, success, message]
            if (!data[2]) {
              console.warn(`[nostr] Event ${data[1]} rejected: ${data[3]}`)
            }
            break
          case 'EOSE':
            // End of stored events for subscription
            break
          case 'CLOSED':
            // Subscription closed by relay: [CLOSED, subId, reason]
            if (typeof data[2] === 'string' && data[2].startsWith('auth-required:')) {
              // Re-authenticate
              this.authenticated = false
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
      this.authenticated = false
      this.setState('disconnected')
      if (!this.destroyed) {
        this.scheduleReconnect()
      }
    })

    ws.addEventListener('error', () => {
      // Error event fires before close, so just log
    })

    // If no AUTH challenge arrives within 2s, assume open relay
    setTimeout(() => {
      if (!this.authenticated && this.ws === ws && !this.destroyed) {
        this.authenticated = true
        this.setState('connected')
        this.flushPendingSubscriptions()
      }
    }, 2000)
  }

  private handleAuth(challenge: string): void {
    this.setState('authenticating')
    const sk = this.getSecretKey()
    if (!sk) {
      console.error('[nostr] Cannot authenticate: key manager locked')
      return
    }

    const authEvent = finalizeEvent({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['relay', this.relayUrl],
        ['challenge', challenge],
      ],
      content: '',
    }, sk)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['AUTH', authEvent]))
      this.authenticated = true
      this.setState('connected')
      this.flushPendingSubscriptions()
    }
  }

  private handleEvent(_subId: string, event: NostrEvent): void {
    // Validate signature and structure
    if (!verifyEvent(event)) return
    if (!validateLlamenosEvent(event)) return

    // Deduplication
    if (!this.deduplicator.isNew(event)) return

    // Try to decrypt content with hub key
    const hubKey = this.getHubKey()
    let content: LlamenosEvent | null = null

    if (hubKey) {
      const decrypted = decryptFromHub(event.content, hubKey)
      content = parseLlamenosContent(decrypted)
    }

    if (!content) return

    // Route to all matching subscribers
    const hubId = event.tags.find(t => t[0] === 'd')?.[1]
    if (!hubId) return

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

    this.ws.send(JSON.stringify(['REQ', sub.id, {
      kinds: sub.kinds,
      '#d': [sub.hubId],
      '#t': ['llamenos:event'],
    }]))
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
