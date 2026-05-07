/**
 * Captures WebSocket relay events for BDD test assertions.
 *
 * Connects to the in-process WebSocket relay at /ws, authenticates via
 * Ed25519 challenge-response, subscribes to hub event kinds, and collects
 * events for assertion by step definitions.
 *
 * Replaces the former Nostr/strfry-based capture that used NIP-01 protocol.
 */
import WebSocket from 'ws'
import { ed25519Sign, ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_WS_CHALLENGE } from '@shared/crypto-labels'

/** All event kinds the relay tests care about */
const ALL_RELAY_KINDS = [1000, 1001, 1002, 1010, 1011, 20000, 20001]

/**
 * A captured WebSocket relay event.
 *
 * Maps from WsEventMessage server format. The `tags` field provides
 * backward-compatible tag queries for step definitions that assert
 * on event metadata (e.g., "llamenos:event" tag, hub scope tag).
 */
export interface CapturedEvent {
  /** Event kind (1000 = call ring, 1001 = call update, etc.) */
  kind: number
  /** Encrypted payload (hex) or raw JSON string */
  payload: string
  /** Hub ID this event was published to */
  hubId: string
  /** Epoch used for key derivation */
  epoch: number
  /** Timestamp (ms since epoch) */
  ts: number
  /** Ed25519 signature hex */
  sig: string
  /** Protocol version */
  v: number

  // ── Legacy compatibility fields ──
  // Step definitions reference these from the old Nostr CapturedEvent format.
  // They are synthesized from the WS event fields.

  /** Synthesized event ID (hash of sig content) — unique per event */
  id: string
  /** Server pubkey (not carried in WS events — set after auth) */
  pubkey: string
  /** Raw content string (alias for payload — used by decryptEventContent) */
  content: string
  /**
   * Synthesized tags array for backward-compatible step assertions.
   * - ['t', 'llamenos:event'] — all relay events are tagged
   * - ['d', hubId] — hub scope
   * - ['epoch', epochStr] — epoch for key derivation
   */
  tags: string[][]
}

export class RelayCapture {
  private ws: WebSocket
  private events: CapturedEvent[] = []
  private waiters: Array<{
    filter: { kind?: number; count: number }
    resolve: (events: CapturedEvent[]) => void
    timer: ReturnType<typeof setTimeout>
  }> = []
  private hubId?: string
  private serverPubkey = ''

  private constructor(ws: WebSocket, hubId?: string) {
    this.ws = ws
    this.hubId = hubId
  }

  /**
   * Connect to the WebSocket relay, authenticate, and subscribe.
   *
   * @param relayUrl - Full WebSocket URL (e.g., ws://localhost:3000/ws)
   * @param hubId - Hub to subscribe to (undefined = 'global')
   * @param seedHex - Ed25519 seed hex for authentication
   */
  static async connect(
    relayUrl: string,
    hubId?: string,
    seedHex?: string,
  ): Promise<RelayCapture> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error(`Relay connection timeout: ${relayUrl}`))
      }, 10_000)

      const capture = new RelayCapture(ws, hubId)

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (!msg || typeof msg !== 'object') return

          // Phase 1: Challenge → authenticate
          if (msg.type === 'challenge' && seedHex) {
            const nonce = msg.nonce as string
            const ts = Date.now()
            const pubkey = bytesToHex(ed25519PubkeyFromSeed(hexToBytes(seedHex)))
            capture.serverPubkey = '' // Will be set from config later
            const signedMessage = `${LABEL_WS_CHALLENGE}:${pubkey}:${nonce}:${ts}`
            const sig = bytesToHex(ed25519Sign(hexToBytes(seedHex), utf8ToBytes(signedMessage)))

            ws.send(JSON.stringify({
              type: 'auth',
              pubkey,
              nonce,
              ts,
              sig,
            }))
            return
          }

          // Phase 2: Authenticated → subscribe
          if (msg.type === 'authenticated') {
            clearTimeout(timeout)
            const targetHub = hubId ?? 'global'
            ws.send(JSON.stringify({
              type: 'subscribe',
              hubId: targetHub,
              kinds: ALL_RELAY_KINDS,
            }))
            // Start listening for events
            capture.listen()
            resolve(capture)
            return
          }

          // Handle auth errors
          if (msg.type === 'error' && !capture.isListening) {
            clearTimeout(timeout)
            reject(new Error(`WS relay auth error: ${msg.code} — ${msg.message}`))
          }
        } catch {
          // Ignore malformed messages during handshake
        }
      })
    })
  }

  private isListening = false

  private listen(): void {
    this.isListening = true
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (!msg || typeof msg !== 'object') return

        if (msg.type === 'event') {
          const event = this.toCaputuredEvent(msg)
          this.events.push(event)
          this.checkWaiters()
        }
      } catch {
        // Ignore malformed messages
      }
    })
  }

  /** Convert a WsEventMessage to the CapturedEvent format. */
  private toCaputuredEvent(msg: {
    v: number
    hubId: string
    kind: number
    payload: string
    epoch: number
    ts: number
    sig: string
  }): CapturedEvent {
    // Synthesize a unique event ID from the signature
    const id = `${msg.v}:${msg.hubId}:${msg.kind}:${msg.epoch}:${msg.ts}`

    // Synthesize backward-compatible tags
    const tags: string[][] = [
      ['t', 'llamenos:event'],
      ['d', msg.hubId],
      ['epoch', String(msg.epoch)],
    ]

    return {
      kind: msg.kind,
      payload: msg.payload,
      hubId: msg.hubId,
      epoch: msg.epoch,
      ts: msg.ts,
      sig: msg.sig,
      v: msg.v,
      // Legacy compatibility
      id,
      pubkey: this.serverPubkey,
      content: msg.payload,
      tags,
    }
  }

  /** Set the server pubkey (retrieved from /api/config). */
  setServerPubkey(pubkey: string): void {
    this.serverPubkey = pubkey
    // Update existing events
    for (const event of this.events) {
      event.pubkey = pubkey
    }
  }

  /** Wait for N events matching a filter, with timeout. */
  async waitForEvents(opts: {
    kind?: number
    count?: number
    timeoutMs?: number
  }): Promise<CapturedEvent[]> {
    const count = opts.count ?? 1
    const timeoutMs = opts.timeoutMs ?? 5000

    const existing = this.getEvents(opts.kind)
    if (existing.length >= count) {
      return existing.slice(0, count)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer)
        if (idx >= 0) this.waiters.splice(idx, 1)
        const got = this.getEvents(opts.kind)
        reject(
          new Error(
            `Timeout waiting for ${count} event(s) of kind ${opts.kind ?? 'any'}. ` +
            `Got ${got.length} in ${timeoutMs}ms.`,
          ),
        )
      }, timeoutMs)

      this.waiters.push({
        filter: { kind: opts.kind, count },
        resolve,
        timer,
      })
    })
  }

  /** Get all captured events, optionally filtered by kind. */
  getEvents(kind?: number): CapturedEvent[] {
    if (kind === undefined) return [...this.events]
    return this.events.filter((e) => e.kind === kind)
  }

  /** Clear captured events. */
  clear(): void {
    this.events = []
  }

  /** Close the WebSocket connection. */
  close(): void {
    try {
      if (this.hubId) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', hubId: this.hubId }))
      }
    } catch {
      // Ignore if already closed
    }
    this.ws.close()
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
    }
    this.waiters = []
  }

  private checkWaiters(): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i]
      const matching = this.getEvents(waiter.filter.kind)
      if (matching.length >= waiter.filter.count) {
        clearTimeout(waiter.timer)
        this.waiters.splice(i, 1)
        waiter.resolve(matching.slice(0, waiter.filter.count))
      }
    }
  }
}
