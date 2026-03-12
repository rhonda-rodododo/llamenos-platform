import WebSocket from 'ws'

export interface CapturedEvent {
  id: string
  kind: number
  content: string
  tags: string[][]
  created_at: number
  pubkey: string
  sig: string
}

/**
 * Subscribes to the Nostr relay and captures events for BDD test assertions.
 *
 * Usage:
 *   const capture = await RelayCapture.connect('ws://localhost:7777')
 *   // ... trigger action that publishes an event ...
 *   const events = await capture.waitForEvents({ kind: 1000, count: 1, timeoutMs: 5000 })
 *   expect(events[0].content).toContain('call:ring')
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
  private subscriptionId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  private constructor(ws: WebSocket) {
    this.ws = ws
  }

  static async connect(relayUrl: string): Promise<RelayCapture> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error(`Relay connection timeout: ${relayUrl}`))
      }, 10_000)

      ws.on('open', () => {
        clearTimeout(timeout)
        const capture = new RelayCapture(ws)
        capture.subscribe()
        capture.listen()
        resolve(capture)
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  private subscribe(): void {
    const req = JSON.stringify([
      'REQ',
      this.subscriptionId,
      {
        kinds: [1000, 1001, 1002, 1010, 1011, 20000, 20001],
        '#t': ['llamenos:event'],
      },
    ])
    this.ws.send(req)
  }

  private listen(): void {
    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (!Array.isArray(data)) return

        if (data[0] === 'EVENT' && data[1] === this.subscriptionId) {
          const event = data[2] as CapturedEvent
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

    // Check if we already have enough matching events
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

  /** Close the subscription and WebSocket connection */
  close(): void {
    try {
      this.ws.send(JSON.stringify(['CLOSE', this.subscriptionId]))
    } catch {
      // Ignore if already closed
    }
    this.ws.close()
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
    }
    this.waiters = []
  }
}
