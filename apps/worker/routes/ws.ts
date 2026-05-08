/**
 * WebSocket relay route — handles upgrade, challenge-response auth,
 * subscriptions, replay, and keepalive.
 *
 * This module exports the Bun WebSocket handler and the upgrade middleware.
 * The actual upgrade happens in the Bun server entry point (src/server/index.ts).
 */
import { ed25519Verify } from '@llamenos/crypto/ffi'
import { randomBytes } from '@llamenos/crypto/ffi'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_WS_CHALLENGE } from '@shared/crypto-labels'
import { wsClientMessageSchema } from '@protocol/schemas/ws-messages'
import type { ConnectionState } from '../lib/ws-manager'
import { getConnectionManager } from '../lib/ws-manager'
import { createLogger } from '../lib/logger'

const log = createLogger('ws')

/** Maximum client message size (64 KiB) */
const MAX_MESSAGE_SIZE = 64 * 1024

/** Auth timeout: 10 seconds after challenge sent */
const AUTH_TIMEOUT_MS = 10_000

/** Timestamp freshness window for auth (10 seconds) */
const AUTH_TIMESTAMP_WINDOW_MS = 10_000

export interface WsConnectionData {
  nonce: string
  nonceCreatedAt: number
  authenticated: boolean
  connState: ConnectionState | null
  authTimeout: ReturnType<typeof setTimeout> | null
  lookupUser: (pubkey: string) => Promise<{ hubs: string[] } | null>
}

/**
 * Generate a challenge nonce for a new connection.
 * Returns the nonce hex string and connection data.
 */
export function createConnectionData(
  lookupUser: (pubkey: string) => Promise<{ hubs: string[] } | null>,
): WsConnectionData {
  const nonce = bytesToHex(randomBytes(32))
  return {
    nonce,
    nonceCreatedAt: Date.now(),
    authenticated: false,
    connState: null,
    authTimeout: null,
    lookupUser,
  }
}

/**
 * Bun WebSocket handler for the relay.
 * Attach to `Bun.serve({ websocket: createWsHandler() })`.
 */
export function createWsHandler() {
  return {
    maxPayloadLength: MAX_MESSAGE_SIZE,
    idleTimeout: 120, // 2 minutes
    perMessageDeflate: false, // JSON is small, compression overhead not worth it

    open(ws: import('bun').ServerWebSocket<WsConnectionData>) {
      const data = ws.data
      // Send challenge immediately
      ws.sendText(JSON.stringify({ type: 'challenge', nonce: data.nonce }))

      // Set auth timeout — close if not authenticated in 10s
      data.authTimeout = setTimeout(() => {
        if (!data.authenticated) {
          log.debug('Auth timeout, closing connection')
          ws.close(4001, 'Auth timeout')
        }
      }, AUTH_TIMEOUT_MS)
    },

    message(ws: import('bun').ServerWebSocket<WsConnectionData>, message: string | Uint8Array) {
      const data = ws.data
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)

      // Parse message
      const parsed = wsClientMessageSchema.safeParse((() => {
        try { return JSON.parse(raw) } catch { return null }
      })())

      if (!parsed.success) {
        ws.sendText(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid message format' }))
        return
      }

      const msg = parsed.data

      // Handle auth message (before authenticated)
      if (msg.type === 'auth') {
        if (data.authenticated) {
          ws.sendText(JSON.stringify({ type: 'error', code: 'already_authenticated', message: 'Already authenticated' }))
          return
        }
        handleAuth(ws, data, msg).catch((err) => {
          log.error('Auth error', { error: err instanceof Error ? err.message : String(err) })
          ws.sendText(JSON.stringify({ type: 'error', code: 'auth_failed', message: 'Authentication failed' }))
          ws.close(4001, 'Auth failed')
        })
        return
      }

      // All other messages require authentication
      if (!data.authenticated || !data.connState) {
        ws.sendText(JSON.stringify({ type: 'error', code: 'not_authenticated', message: 'Authenticate first' }))
        return
      }

      const manager = getConnectionManager()
      if (!manager) {
        ws.sendText(JSON.stringify({ type: 'error', code: 'server_error', message: 'Server not ready' }))
        return
      }

      switch (msg.type) {
        case 'subscribe': {
          // Validate hub membership
          if (!data.connState.hubs.has(msg.hubId)) {
            ws.sendText(JSON.stringify({ type: 'error', code: 'not_member', message: `Not a member of hub ${msg.hubId}` }))
            return
          }
          manager.subscribe(data.connState.pubkey, msg.hubId, msg.kinds)
          ws.sendText(JSON.stringify({ type: 'subscribed', hubId: msg.hubId, kinds: msg.kinds }))
          break
        }

        case 'unsubscribe': {
          manager.unsubscribe(data.connState.pubkey, msg.hubId)
          ws.sendText(JSON.stringify({ type: 'unsubscribed', hubId: msg.hubId }))
          break
        }

        case 'replay': {
          if (!data.connState.hubs.has(msg.hubId)) {
            ws.sendText(JSON.stringify({ type: 'error', code: 'not_member', message: `Not a member of hub ${msg.hubId}` }))
            return
          }
          const ok = manager.replay(data.connState, msg.hubId, msg.since)
          if (!ok) {
            ws.sendText(JSON.stringify({ type: 'error', code: 'rate_limited', message: 'Replay rate limited' }))
          }
          break
        }

        case 'ping': {
          ws.sendText(JSON.stringify({ type: 'pong' }))
          break
        }
      }
    },

    close(ws: import('bun').ServerWebSocket<WsConnectionData>) {
      const data = ws.data
      if (data.authTimeout) {
        clearTimeout(data.authTimeout)
      }
      if (data.connState) {
        const manager = getConnectionManager()
        if (manager) {
          manager.unregister(data.connState)
        }
      }
    },
  }
}

async function handleAuth(
  ws: import('bun').ServerWebSocket<WsConnectionData>,
  data: WsConnectionData,
  msg: { pubkey: string; nonce: string; ts: number; sig: string },
): Promise<void> {
  // Verify nonce matches
  if (msg.nonce !== data.nonce) {
    ws.sendText(JSON.stringify({ type: 'error', code: 'auth_failed', message: 'Nonce mismatch' }))
    ws.close(4001, 'Auth failed')
    return
  }

  // Verify timestamp freshness
  const now = Date.now()
  if (Math.abs(now - msg.ts) > AUTH_TIMESTAMP_WINDOW_MS) {
    ws.sendText(JSON.stringify({ type: 'error', code: 'auth_failed', message: 'Timestamp expired' }))
    ws.close(4001, 'Auth failed')
    return
  }

  // Construct the signed message: "llamenos:ws-auth:{pubkey}:{nonce}:{timestamp}"
  const signedMessage = `${LABEL_WS_CHALLENGE}:${msg.pubkey}:${msg.nonce}:${msg.ts}`
  const messageBytes = utf8ToBytes(signedMessage)
  const sigBytes = hexToBytes(msg.sig)
  const pubkeyBytes = hexToBytes(msg.pubkey)

  // Verify Ed25519 signature
  const valid = ed25519Verify(pubkeyBytes, messageBytes, sigBytes)
  if (!valid) {
    ws.sendText(JSON.stringify({ type: 'error', code: 'auth_failed', message: 'Invalid signature' }))
    ws.close(4001, 'Auth failed')
    return
  }

  // Look up user and get hub memberships
  const user = await data.lookupUser(msg.pubkey)
  if (!user) {
    ws.sendText(JSON.stringify({ type: 'error', code: 'auth_failed', message: 'User not found' }))
    ws.close(4001, 'Auth failed')
    return
  }

  // Authentication successful
  if (data.authTimeout) {
    clearTimeout(data.authTimeout)
    data.authTimeout = null
  }
  data.authenticated = true

  const connState: ConnectionState = {
    pubkey: msg.pubkey,
    ws: ws as unknown as WebSocket,
    hubs: new Set(user.hubs),
    lastReplayAt: 0,
  }
  data.connState = connState

  const manager = getConnectionManager()
  if (manager) {
    manager.register(connState)
  }

  ws.sendText(JSON.stringify({ type: 'authenticated', hubs: user.hubs }))
  log.debug('Client authenticated', { pubkey: msg.pubkey, hubs: user.hubs.length })
}
