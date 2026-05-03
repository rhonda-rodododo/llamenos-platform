/**
 * Tests for NIP-42 auth state machine (H4 fix).
 *
 * Validates three-state auth transitions:
 *   unauthenticated → authenticating → authenticated
 *   unauthenticated → authenticating → unauthenticated (on reject)
 *   unauthenticated → authenticated (open relay, 2s timeout)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer } from 'ws'
import { NodeNostrPublisher, type AuthState } from '@worker/lib/nostr-publisher'

const TEST_SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'

describe('NIP-42 Auth State Machine', () => {
  let wss: WebSocketServer
  let port: number
  let publisher: NodeNostrPublisher

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 })
    port = (wss.address() as { port: number }).port
  })

  afterEach(() => {
    publisher?.close()
    wss?.close()
  })

  it('starts in unauthenticated state', () => {
    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('unauthenticated')
  })

  it('transitions to authenticating when AUTH challenge received', async () => {
    // Mock relay that sends AUTH challenge but doesn't respond to auth event
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify(['AUTH', 'test-challenge-123']))
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()
    // Give time for the AUTH message to be processed
    await new Promise(r => setTimeout(r, 200))

    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticating')
  })

  it('transitions to authenticated when relay accepts auth via OK', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify(['AUTH', 'test-challenge']))
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg[0] === 'AUTH') {
          // Relay accepts the auth event
          ws.send(JSON.stringify(['OK', msg[1].id, true, '']))
        }
      })
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()
    await new Promise(r => setTimeout(r, 500))

    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticated')
  })

  it('stays unauthenticated when relay rejects auth via OK', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify(['AUTH', 'test-challenge']))
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg[0] === 'AUTH') {
          // Relay rejects the auth event
          ws.send(JSON.stringify(['OK', msg[1].id, false, 'auth-required: invalid key']))
        }
      })
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()
    await new Promise(r => setTimeout(r, 500))

    expect((publisher as unknown as { authState: AuthState }).authState).toBe('unauthenticated')
  })

  it('assumes open relay after 2s timeout with no AUTH challenge', async () => {
    // Mock relay that does NOT send an AUTH challenge
    wss.on('connection', () => {
      // Intentionally silent — no AUTH challenge
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()
    // Should be unauthenticated initially
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('unauthenticated')

    // After 2s, should assume open relay
    await new Promise(r => setTimeout(r, 2200))
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticated')
  })

  it('buffers events during authenticating state', async () => {
    const receivedEvents: unknown[] = []

    wss.on('connection', (ws) => {
      // Send AUTH challenge but delay the OK
      ws.send(JSON.stringify(['AUTH', 'delayed-challenge']))
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg[0] === 'AUTH') {
          // Delay OK by 500ms
          setTimeout(() => {
            ws.send(JSON.stringify(['OK', msg[1].id, true, '']))
          }, 500)
        } else if (msg[0] === 'EVENT') {
          receivedEvents.push(msg[1])
          ws.send(JSON.stringify(['OK', msg[1].id, true, '']))
        }
      })
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()
    await new Promise(r => setTimeout(r, 100))

    // Should be in authenticating state
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticating')

    // Publish an event — should be buffered
    publisher.publish({
      kind: 1000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'llamenos:event']],
      content: '{"type":"test"}',
    }).catch(() => {}) // Suppress unhandled rejection

    // No events should have been sent yet
    expect(receivedEvents).toHaveLength(0)

    // Wait for auth OK + event flush
    await new Promise(r => setTimeout(r, 1000))

    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticated')
    expect(receivedEvents).toHaveLength(1)
  }, 10_000)

  it('resets auth state on WebSocket close', async () => {
    let serverWs: import('ws').WebSocket | null = null
    const authCompleted = new Promise<void>((resolve) => {
      wss.on('connection', (ws) => {
        serverWs = ws
        ws.send(JSON.stringify(['AUTH', 'close-challenge']))
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          if (msg[0] === 'AUTH') {
            ws.send(JSON.stringify(['OK', msg[1].id, true, '']))
            // Small delay to let the client process the OK
            setTimeout(resolve, 100)
          }
        })
      })
    })

    publisher = new NodeNostrPublisher(`ws://localhost:${port}`, TEST_SECRET)
    await publisher.connect()

    // Wait for the full AUTH→OK exchange to complete
    await authCompleted
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('authenticated')

    // Prevent reconnect from interfering after close
    ;(publisher as unknown as { closed: boolean }).closed = true

    // Close from server side
    serverWs!.close()

    // Wait for close event
    await new Promise(r => setTimeout(r, 500))
    expect((publisher as unknown as { authState: AuthState }).authState).toBe('unauthenticated')
  })
})
