/**
 * Type declarations that replace @cloudflare/workers-types for Node.js builds.
 * These provide the minimal type surface our DO code actually uses.
 */

import type { StorageApi, DOContext } from '../types'

declare global {
  /**
   * DurableObjectState — matches the CF type but backed by our DOContext.
   * The DO constructor receives this as `ctx` parameter.
   */
  interface DurableObjectState extends DOContext {}

  /**
   * WebSocketPair — not used in the Node.js build
   * (WebSocket handling goes through the ws package).
   */
  class WebSocketPair {
    0: WebSocket
    1: WebSocket
  }
}
