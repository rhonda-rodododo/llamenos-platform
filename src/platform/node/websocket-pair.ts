/**
 * WebSocketPair polyfill for Node.js.
 *
 * Creates two connected WebSocket-like objects that mirror messages
 * between them. This matches the CF Workers WebSocketPair behavior.
 *
 * In the CF pattern:
 *   const pair = new WebSocketPair()
 *   const [client, server] = Object.values(pair)
 *   ctx.acceptWebSocket(server, tags)
 *   return new Response(null, { status: 101, webSocket: client })
 *
 * On Node.js, the actual upgrade is handled by @hono/node-ws.
 * The client-side socket is the real WebSocket from the upgrade.
 * The server-side socket is a shim that forwards to the real one.
 */
import { EventEmitter } from 'node:events'

// Minimal WebSocket-compatible interface for the polyfill
class ShimWebSocket extends EventEmitter {
  readyState = 1 // OPEN
  private _pair: ShimWebSocket | null = null

  static readonly OPEN = 1
  static readonly CLOSED = 3

  _connect(other: ShimWebSocket) {
    this._pair = other
  }

  send(data: string | ArrayBuffer): void {
    if (this._pair && this._pair.readyState === 1) {
      // Deliver to the other side's message handlers
      this._pair.emit('message', { data })
      // Also trigger the onmessage handler if set
      if (this._pair.onmessage) {
        this._pair.onmessage({ data } as any)
      }
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3
    if (this._pair && this._pair.readyState !== 3) {
      this._pair.readyState = 3
      this._pair.emit('close', { code, reason })
      if (this._pair.onclose) {
        this._pair.onclose({ code, reason } as any)
      }
    }
    this.emit('close', { code, reason })
    if (this.onclose) {
      this.onclose({ code, reason } as any)
    }
  }

  // Event handler properties (WebSocket interface)
  onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onopen: ((ev: Event) => void) | null = null
}

/**
 * Polyfill for CF Workers' WebSocketPair.
 * Creates two connected ShimWebSocket objects.
 */
export class WebSocketPairPolyfill {
  0: ShimWebSocket
  1: ShimWebSocket

  constructor() {
    const a = new ShimWebSocket()
    const b = new ShimWebSocket()
    a._connect(b)
    b._connect(a)
    this[0] = a
    this[1] = b
  }
}

// Make it globally available for the Node.js build
if (typeof (globalThis as Record<string, unknown>).WebSocketPair === 'undefined') {
  ;(globalThis as Record<string, unknown>).WebSocketPair = WebSocketPairPolyfill
}
