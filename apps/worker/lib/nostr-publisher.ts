/**
 * Nostr event publisher — platform-agnostic interface for publishing
 * server-signed events to a Nostr relay.
 *
 * CF deployment: service binding HTTP POST to Nosflare relay worker
 * Node deployment: persistent WebSocket to strfry relay
 *
 * The publisher handles event signing with the server keypair.
 * Callers provide EventTemplates; the publisher signs and publishes.
 */

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import type { EventTemplate, VerifiedEvent } from 'nostr-tools/core'
import { hexToBytes } from '@noble/hashes/utils.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_SERVER_NOSTR_KEY, LABEL_SERVER_NOSTR_KEY_INFO } from '@shared/crypto-labels'
import { KIND_NIP42_AUTH } from '@shared/nostr-events'
import { withRetry, isRetryableError, RetryableError } from './retry'
import { getCircuitBreaker } from './circuit-breaker'
import { createLogger } from './logger'

const logger = createLogger('nostr-publisher')

/**
 * Outbox interface for persistent event storage.
 * Matches EventOutbox from src/platform/bun/storage/outbox.ts.
 */
export interface NostrEventOutbox {
  enqueue(eventJson: Record<string, unknown>): Promise<void>
  markDelivered(id: number): Promise<void>
  markFailed(id: number, attempts: number): Promise<void>
}

/**
 * NostrPublisher interface — all platform implementations must satisfy this.
 */
export interface NostrPublisher {
  /** Sign and publish an event template to the relay */
  publish(template: EventTemplate): Promise<void>

  /** Get the server's public key (hex, x-only 32 bytes) */
  readonly serverPubkey: string

  /** Graceful shutdown (close connections, flush queues) */
  close(): void
}

/**
 * Derive the server Nostr keypair from SERVER_NOSTR_SECRET using HKDF.
 *
 * This is deterministic — same secret always produces the same keypair.
 * The secret should be a 32-byte hex string generated once per deployment
 * (e.g., `openssl rand -hex 32`).
 *
 * Returns { secretKey, pubkey } where pubkey is hex x-only (32 bytes).
 */
export function deriveServerKeypair(serverSecret: string): { secretKey: Uint8Array; pubkey: string } {
  const secretBytes = hexToBytes(serverSecret)
  const secretKey = hkdf(
    sha256,
    secretBytes,
    utf8ToBytes(LABEL_SERVER_NOSTR_KEY),
    utf8ToBytes(LABEL_SERVER_NOSTR_KEY_INFO),
    32,
  )
  const pubkey = getPublicKey(secretKey)
  return { secretKey, pubkey }
}

/**
 * Sign an event template with the server keypair.
 * Returns a fully signed VerifiedEvent ready for relay submission.
 */
export function signServerEvent(template: EventTemplate, secretKey: Uint8Array): VerifiedEvent {
  return finalizeEvent(template, secretKey)
}

/**
 * Cloudflare NostrPublisher — publishes events via service binding
 * HTTP POST to the Nosflare relay worker.
 *
 * The service binding is an internal RPC call within the CF account,
 * so latency is <10ms with no TLS overhead.
 */
export class CFNostrPublisher implements NostrPublisher {
  readonly serverPubkey: string
  private readonly secretKey: Uint8Array

  constructor(
    private readonly relayBinding: { fetch(request: Request): Promise<Response> },
    serverSecret: string,
  ) {
    const keypair = deriveServerKeypair(serverSecret)
    this.secretKey = keypair.secretKey
    this.serverPubkey = keypair.pubkey
  }

  async publish(template: EventTemplate): Promise<void> {
    const event = signServerEvent(template, this.secretKey)

    const breaker = getCircuitBreaker({
      name: 'nostr:relay',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    })

    await breaker.execute(() =>
      withRetry(
        async () => {
          const res = await this.relayBinding.fetch(new Request('http://relay/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }))

          if (!res.ok) {
            const text = await res.text().catch(() => 'unknown error')
            const status = res.status
            if (status === 429 || status >= 500) {
              throw new RetryableError(`Relay rejected event (kind=${template.kind}): ${text}`, status)
            }
            throw new Error(`Relay rejected event (kind=${template.kind}): ${text}`)
          }
        },
        {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          isRetryable: isRetryableError,
          onRetry: (attempt, error) => {
            logger.warn(`Relay publish retry ${attempt}`, { kind: template.kind, error })
          },
        },
      )
    )
  }

  close(): void {
    // No persistent connection to close for CF service binding
  }
}

/**
 * Node.js NostrPublisher — maintains a persistent WebSocket connection
 * to a strfry (or any NIP-01 compliant) relay.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Event queue for events published during reconnection
 * - NIP-42 authentication on connect
 * - Graceful shutdown
 */
export class NodeNostrPublisher implements NostrPublisher {
  readonly serverPubkey: string
  private readonly secretKey: Uint8Array
  private ws: WebSocket | null = null
  private authenticated = false
  private connecting = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingEvents: VerifiedEvent[] = []
  private pendingPublishes = new Map<string, { resolve: () => void; reject: (err: Error) => void }>()
  private publishTimeout = 10_000
  private closed = false
  private outbox: NostrEventOutbox | null = null

  constructor(
    private readonly relayUrl: string,
    serverSecret: string,
  ) {
    const keypair = deriveServerKeypair(serverSecret)
    this.secretKey = keypair.secretKey
    this.serverPubkey = keypair.pubkey
  }

  /**
   * Attach a persistent outbox for durable event delivery.
   * When set, events are persisted to PostgreSQL before WebSocket delivery,
   * ensuring no events are lost during relay disconnections.
   */
  setOutbox(outbox: NostrEventOutbox): void {
    this.outbox = outbox
  }

  /**
   * Connect to the relay. Called automatically on first publish,
   * or can be called explicitly for eager connection.
   */
  async connect(): Promise<void> {
    if (this.closed || this.connecting) return
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.connecting = true

    try {
      const ws = new WebSocket(this.relayUrl)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error(`WebSocket connection timeout to ${this.relayUrl}`))
        }, 10_000)

        ws.addEventListener('open', () => {
          clearTimeout(timeout)
          this.ws = ws
          this.reconnectAttempts = 0
          this.setupListeners(ws)
          resolve()
        })

        ws.addEventListener('error', (e) => {
          clearTimeout(timeout)
          reject(new Error(`WebSocket connection error: ${e}`))
        })
      })
    } catch (err) {
      this.scheduleReconnect()
      throw err
    } finally {
      this.connecting = false
    }
  }

  async publish(template: EventTemplate): Promise<void> {
    const event = signServerEvent(template, this.secretKey)

    // With outbox: persist first, then attempt delivery
    if (this.outbox) {
      // Spread into a plain object to satisfy Record<string, unknown> without `as` cast
      const eventRecord: Record<string, unknown> = { ...event }
      await this.outbox.enqueue(eventRecord)

      // Attempt immediate delivery if connected
      if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
        // Fire-and-forget — outbox poller will retry on failure
        this.sendAndAwaitOk(event).catch(() => {
          // Event is safe in the outbox — poller will retry
        })
      } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          this.connect().catch((err) => {
            logger.error('Failed to connect', err)
          })
      }
      return
    }

    // Without outbox: original behavior (in-memory queue)
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      return this.sendAndAwaitOk(event)
    }

    // Queue and ensure connection
    this.pendingEvents.push(event)
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          this.connect().catch((err) => {
            logger.error('Failed to connect', err)
          })
    }
  }

  /**
   * Deliver a pre-signed event directly via WebSocket.
   * Used by the outbox poller to retry events without re-signing.
   * Throws if not connected or delivery fails.
   */
  async deliverSignedEvent(eventJson: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      // Trigger reconnect if needed
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch(() => {})
      }
      throw new Error('WebSocket not connected — event will be retried by outbox poller')
    }

    const eventId = eventJson.id as string | undefined
    if (!eventId || typeof eventId !== 'string') {
      throw new Error(`Cannot deliver event without valid id (got ${typeof eventJson.id}). Event keys: ${Object.keys(eventJson).join(',')}`)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPublishes.delete(eventId)
        reject(new Error(`Relay did not acknowledge event ${eventId} within ${this.publishTimeout}ms`))
      }, this.publishTimeout)

      this.pendingPublishes.set(eventId, {
        resolve: () => { clearTimeout(timer); resolve() },
        reject: (err) => { clearTimeout(timer); reject(err) },
      })

      this.ws!.send(JSON.stringify(['EVENT', eventJson]))
    })
  }

  private sendAndAwaitOk(event: VerifiedEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPublishes.delete(event.id)
        reject(new Error(`Relay did not acknowledge event ${event.id} within ${this.publishTimeout}ms`))
      }, this.publishTimeout)

      this.pendingPublishes.set(event.id, {
        resolve: () => { clearTimeout(timer); resolve() },
        reject: (err) => { clearTimeout(timer); reject(err) },
      })

      this.ws!.send(JSON.stringify(['EVENT', event]))
    })
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    for (const pending of this.pendingPublishes.values()) {
      pending.reject(new Error('Publisher closed'))
    }
    this.pendingPublishes.clear()
    this.pendingEvents = []
  }

  private setupListeners(ws: WebSocket): void {
    ws.addEventListener('message', (msg) => {
      try {
        const data = JSON.parse(typeof msg.data === 'string' ? msg.data : '')
        if (Array.isArray(data)) {
          if (data[0] === 'AUTH') {
            this.handleNIP42Auth(data[1] as string)
          } else if (data[0] === 'OK') {
            const eventId = data[1] as string
            const accepted = data[2] as boolean
            const message = data[3] as string
            const pending = this.pendingPublishes.get(eventId)
            if (pending) {
              this.pendingPublishes.delete(eventId)
              if (accepted) {
                pending.resolve()
              } else {
                pending.reject(new Error(`Relay rejected event ${eventId}: ${message}`))
              }
            } else if (!accepted) {
              logger.warn(`Event ${eventId} rejected: ${message}`)
            }
          } else if (data[0] === 'NOTICE') {
            logger.warn(`Relay notice: ${data[1]}`)
          }
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.addEventListener('close', () => {
      this.authenticated = false
      this.ws = null
      if (!this.closed) {
        for (const pending of this.pendingPublishes.values()) {
          pending.reject(new Error('WebSocket closed'))
        }
        this.pendingPublishes.clear()
        this.scheduleReconnect()
      }
    })

    ws.addEventListener('error', (err) => {
      logger.error('WebSocket error', err)
    })

    // If no AUTH challenge arrives within 2s, assume open relay
    setTimeout(() => {
      if (!this.authenticated && this.ws === ws) {
        this.authenticated = true
        this.flushPendingEvents()
      }
    }, 2000)
  }

  private handleNIP42Auth(challenge: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const authEvent = finalizeEvent({
      kind: KIND_NIP42_AUTH,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['relay', this.relayUrl],
        ['challenge', challenge],
      ],
      content: '',
    }, this.secretKey)

    this.ws.send(JSON.stringify(['AUTH', authEvent]))
    this.authenticated = true
    this.flushPendingEvents()
  }

  private flushPendingEvents(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()!
        this.sendAndAwaitOk(event).catch((err) => {
        logger.error(`Flushed event ${event.id} rejected`, err)
      })
    }
  }

  private static readonly MAX_RECONNECT_ATTEMPTS = 10

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return

    this.reconnectAttempts++

    // When outbox is present, events are safe in PostgreSQL — never give up reconnecting.
    // Without outbox, cap reconnect attempts to avoid infinite retry with in-memory queue.
    if (!this.outbox && this.reconnectAttempts > NodeNostrPublisher.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Max reconnect attempts (${NodeNostrPublisher.MAX_RECONNECT_ATTEMPTS}) reached, giving up`)
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => {
        logger.error('Reconnect failed', err)
      })
    }, delay)
  }
}

/**
 * No-op publisher for deployments without a relay configured.
 * Events are silently dropped. Used when SERVER_NOSTR_SECRET is not set.
 */
export class NoopNostrPublisher implements NostrPublisher {
  readonly serverPubkey = ''

  async publish(_template: EventTemplate): Promise<void> {
    // No relay configured — silently drop events
  }

  close(): void {
    // Nothing to close
  }
}

/**
 * Create the appropriate NostrPublisher for the current platform.
 *
 * CF: Uses NOSFLARE service binding
 * Node: Uses NOSTR_RELAY_URL WebSocket
 * Neither: Returns NoopNostrPublisher
 */
export function createNostrPublisher(env: {
  NOSFLARE?: { fetch(request: Request): Promise<Response> }
  SERVER_NOSTR_SECRET?: string
  NOSTR_RELAY_URL?: string
}): NostrPublisher {
  if (!env.SERVER_NOSTR_SECRET) {
    return new NoopNostrPublisher()
  }

  // CF deployment: service binding to Nosflare relay
  if (env.NOSFLARE) {
    return new CFNostrPublisher(env.NOSFLARE, env.SERVER_NOSTR_SECRET)
  }

  // Node deployment: persistent WebSocket to strfry
  if (env.NOSTR_RELAY_URL) {
    return new NodeNostrPublisher(env.NOSTR_RELAY_URL, env.SERVER_NOSTR_SECRET)
  }

  return new NoopNostrPublisher()
}
