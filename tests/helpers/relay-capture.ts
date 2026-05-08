import WebSocket from 'ws'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_WS_CHALLENGE } from '@shared/crypto-labels'

/**
 * Captured event from the in-process WebSocket relay.
 * Matches the WsEventMessage schema from packages/protocol/schemas/ws-messages.ts.
 */
export interface CapturedEvent {
  type: 'event'
  v: number
  hubId: string
  kind: number
  payload: string
  epoch: number
  ts: number
  sig: string
}

/** All event kinds the relay tests care about */
const ALL_TEST_KINDS = [1000, 1001, 1002, 1010, 1011, 20000, 20001]

/**
 * Subscribes to the in-process WebSocket relay and captures events for BDD test assertions.
 *
 * Connects, performs Ed25519 challenge-response auth, subscribes to a hub,
 * and collects incoming events.
 *
 * Usage:
 *   const capture = await RelayCapture.connect('ws://localhost:3000/ws', {
 *     seedHex: ADMIN_SEED,
 *     hubId: 'test-hub-id',
 *   })
 *   // ... trigger action that publishes an event ...
 *   const events = await capture.waitForEvents({ kind: 1000, count: 1, timeoutMs: 5000 })
 *   capture.close()
 */
export class RelayCapture {
  private ws: WebSocket
  private events: CapturedEvent[] = []
  private waiters: Array<{
    filter: { kind?: number; count: number }
    resolve: (events: CapturedEvent[]) => void
    timer: ReturnType<typeof setTimeout>
  }> = []
  private hubId: string

  private constructor(ws: WebSocket, hubId: string) {
    this.ws = ws
    this.hubId = hubId
  }

  static async connect(
    relayUrl: string,
    opts: { seedHex: string; hubId?: string; kinds?: number[] },
  ): Promise<RelayCapture> {
    const { seedHex, hubId = 'global', kinds = ALL_TEST_KINDS } = opts

    const pubkey = bytesToHex(ed25519.getPublicKey(hexToBytes(seedHex)))

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error(`Relay connection timeout: ${relayUrl}`))
      }, 15_000)

      const capture = new RelayCapture(ws, hubId)

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())

          // Step 1: Receive challenge, send auth
          if (msg.type === 'challenge') {
            const nonce = msg.nonce as string
            const ts = Date.now()
            const signedMessage = `${LABEL_WS_CHALLENGE}:${pubkey}:${nonce}:${ts}`
            const sig = bytesToHex(ed25519.sign(utf8ToBytes(signedMessage), hexToBytes(seedHex)))
            ws.send(JSON.stringify({ type: 'auth', pubkey, nonce, ts, sig }))
            return
          }

          // Step 2: Receive authenticated, subscribe to hub(s)
          if (msg.type === 'authenticated') {
            ws.send(JSON.stringify({ type: 'subscribe', hubId, kinds }))
            // Also subscribe to 'global' for hub-agnostic events (messaging)
            if (hubId !== 'global') {
              ws.send(JSON.stringify({ type: 'subscribe', hubId: 'global', kinds }))
            }
            return
          }

          // Step 3: Subscription(s) confirmed — ready to capture after primary hub
          if (msg.type === 'subscribed' && msg.hubId === hubId) {
            clearTimeout(timeout)
            capture.listen()
            resolve(capture)
            return
          }

          // Auth/subscribe errors
          if (msg.type === 'error') {
            clearTimeout(timeout)
            reject(new Error(`Relay error: ${msg.code} — ${msg.message}`))
            return
          }
        } catch {
          // Ignore malformed messages during handshake
        }
      })
    })
  }

  private listen(): void {
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'event') {
          const event: CapturedEvent = msg as CapturedEvent
          this.events.push(event)
          this.checkWaiters()
        }
      } catch {
        // Ignore malformed messages
      }
    })
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

  /** Wait for N events matching a filter, with timeout */
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

  /** Get all captured events, optionally filtered by kind */
  getEvents(kind?: number): CapturedEvent[] {
    if (kind === undefined) return [...this.events]
    return this.events.filter((e) => e.kind === kind)
  }

  /** Clear captured events */
  clear(): void {
    this.events = []
  }

  /** Close the WebSocket connection */
  close(): void {
    this.ws.close()
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
    }
    this.waiters = []
  }
}
