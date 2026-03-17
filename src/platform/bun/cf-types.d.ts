/**
 * Type declarations that replace @cloudflare/workers-types for Bun builds.
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
   * WebSocketPair — not used in the Bun build
   * (WebSocket handling uses Bun's native WebSocket).
   */
  class WebSocketPair {
    0: WebSocket
    1: WebSocket
  }
}
