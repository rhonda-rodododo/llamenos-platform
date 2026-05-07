/**
 * Vitest unit test setup — polyfills for the Node/Bun test environment.
 *
 * WebSocket: The global WebSocket API was not consistently available in Bun
 * before 1.3.7. We polyfill it from the `ws` npm package so that
 * ConnectionManager and relay tests work in all CI environments.
 */

import { WebSocket } from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket
}
