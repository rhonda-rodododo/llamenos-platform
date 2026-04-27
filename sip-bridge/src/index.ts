import type { BridgeConfig } from './types'
import { createBridgeClient } from './client-factory'
import { WebhookSender } from './webhook-sender'
import { CommandHandler } from './command-handler'

/** Load configuration from environment variables */
function loadConfig(): BridgeConfig {
  const pbxType = (process.env.PBX_TYPE ?? 'asterisk') as BridgeConfig['pbxType']

  // Shared config
  const workerWebhookUrl = process.env.WORKER_WEBHOOK_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  const bridgePort = parseInt(process.env.BRIDGE_PORT ?? '3000', 10)
  const bridgeHost = process.env.BRIDGE_HOST ?? '0.0.0.0' // Docker-compatible default
  const connectionTimeoutMs = parseInt(process.env.CONNECTION_TIMEOUT_MS ?? '300000', 10) // 5 min

  if (!workerWebhookUrl) throw new Error('WORKER_WEBHOOK_URL is required')
  if (!bridgeSecret) throw new Error('BRIDGE_SECRET is required')

  // ARI config (asterisk only — safe to read defaults even for other types)
  const ariUrl = process.env.ARI_URL ?? 'ws://localhost:8088/ari/events'
  const ariRestUrl = process.env.ARI_REST_URL ?? 'http://localhost:8088/ari'
  const ariUsername = process.env.ARI_USERNAME ?? ''
  const ariPassword = process.env.ARI_PASSWORD ?? ''
  const stasisApp = process.env.STASIS_APP ?? 'llamenos'

  // ESL config (freeswitch only)
  const eslHost = process.env.ESL_HOST ?? 'localhost'
  const eslPort = parseInt(process.env.ESL_PORT ?? '8021', 10)
  const eslPassword = process.env.ESL_PASSWORD ?? ''

  // Kamailio config
  const kamailioJsonrpcUrl = process.env.KAMAILIO_JSONRPC_URL ?? 'http://localhost:5060/jsonrpc'

  // Validate PBX-specific required vars
  if (pbxType === 'asterisk') {
    if (!ariUsername) throw new Error('ARI_USERNAME is required for asterisk PBX type')
    if (!ariPassword) throw new Error('ARI_PASSWORD is required for asterisk PBX type')
  }
  if (pbxType === 'freeswitch') {
    if (!eslPassword) throw new Error('ESL_PASSWORD is required for freeswitch PBX type')
  }

  return {
    pbxType,
    ariUrl,
    ariRestUrl,
    ariUsername,
    ariPassword,
    eslHost,
    eslPort,
    eslPassword,
    kamailioJsonrpcUrl,
    workerWebhookUrl,
    bridgeSecret,
    bridgePort,
    bridgeHost,
    stasisApp,
    sipProvider: process.env.SIP_PROVIDER,
    sipUsername: process.env.SIP_USERNAME,
    sipPassword: process.env.SIP_PASSWORD,
    connectionTimeoutMs,
  }
}

/**
 * Verify an incoming signed request from the Worker.
 * Extracts signature + timestamp from headers, delegates to WebhookSender.
 */
function verifyRequest(
  webhook: WebhookSender,
  request: Request,
  url: URL,
  body: string
): boolean {
  const signature = request.headers.get('X-Bridge-Signature') ?? ''
  const timestamp = request.headers.get('X-Bridge-Timestamp') ?? ''
  if (!signature || !timestamp) return false
  return webhook.verifySignature(url.toString(), body, timestamp, signature)
}

async function main(): Promise<void> {
  const config = loadConfig()
  console.log(`[bridge] Starting sip-bridge (PBX_TYPE=${config.pbxType})...`)

  // Initialize components
  const client = createBridgeClient(config)
  const webhook = new WebhookSender(config)
  const handler = new CommandHandler(client, webhook, config)

  // Set hotline number from env
  if (process.env.HOTLINE_NUMBER) {
    handler.setHotlineNumber(process.env.HOTLINE_NUMBER)
  }

  // Register bridge event handler
  client.onEvent((event) => {
    handler.handleEvent(event).catch((err) => {
      console.error('[bridge] Event handler error:', err)
    })
  })

  // Start HTTP server for Worker commands
  const server = Bun.serve({
    port: config.bridgePort,
    hostname: config.bridgeHost,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method

      // ---- Health check (unauthenticated) ----
      if (path === '/health' && method === 'GET') {
        try {
          const health = await client.healthCheck()
          return Response.json({
            status: health.ok ? 'ok' : 'degraded',
            pbxType: config.pbxType,
            connected: client.isConnected(),
            uptime: process.uptime(),
            ...handler.getStatus(),
            pbx: health.details,
            latencyMs: health.latencyMs,
          })
        } catch (err) {
          return Response.json(
            { status: 'error', error: String(err), ...handler.getStatus() },
            { status: 500 }
          )
        }
      }

      // ---- Status endpoint (detailed, unauthenticated) ----
      if (path === '/status' && method === 'GET') {
        try {
          const health = await client.healthCheck()
          const channels = await client.listChannels()
          const bridges = await client.listBridges()
          return Response.json({
            status: 'ok',
            pbxType: config.pbxType,
            bridge: handler.getStatus(),
            pbx: health.details,
            channels: channels.length,
            bridges: bridges.length,
          })
        } catch (err) {
          return Response.json(
            { status: 'error', error: String(err), bridge: handler.getStatus() },
            { status: 500 }
          )
        }
      }

      // ---- All POST endpoints require signature verification ----

      // Command endpoint
      if (path === '/command' && method === 'POST') {
        const body = await request.text()
        if (!verifyRequest(webhook, request, url, body)) {
          console.warn('[bridge] Invalid command signature')
          return new Response('Forbidden', { status: 403 })
        }

        try {
          const data = JSON.parse(body) as Record<string, unknown>
          const result = await handler.handleHttpCommand(data)
          return Response.json(result, { status: result.ok ? 200 : 400 })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Ring volunteers endpoint
      if (path === '/ring' && method === 'POST') {
        const body = await request.text()
        if (!verifyRequest(webhook, request, url, body)) {
          return new Response('Forbidden', { status: 403 })
        }

        try {
          const data = JSON.parse(body) as {
            callSid: string
            callerNumber: string
            volunteers: Array<{ pubkey: string; phone: string }>
          }

          const channelIds: string[] = []
          for (const vol of data.volunteers) {
            const endpoint = getEndpointForPbx(config.pbxType, vol.phone)
            try {
              const channel = await client.originate({
                endpoint,
                callerId: data.callerNumber,
                timeout: 30,
                appArgs: `dialed,${data.callSid},${vol.pubkey}`,
              })
              channelIds.push(channel.id)
            } catch (err) {
              console.error(`[bridge] Failed to ring ${vol.pubkey}:`, err)
            }
          }

          return Response.json({ ok: true, channelIds })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Cancel ringing endpoint
      if (path === '/cancel-ringing' && method === 'POST') {
        const body = await request.text()
        if (!verifyRequest(webhook, request, url, body)) {
          return new Response('Forbidden', { status: 403 })
        }

        try {
          const data = JSON.parse(body) as { channelIds: string[]; exceptId?: string }
          for (const id of data.channelIds) {
            if (id !== data.exceptId) {
              try {
                await client.hangup(id)
              } catch {
                /* may already be gone */
              }
            }
          }
          return Response.json({ ok: true })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Hangup endpoint
      if (path === '/hangup' && method === 'POST') {
        const body = await request.text()
        if (!verifyRequest(webhook, request, url, body)) {
          return new Response('Forbidden', { status: 403 })
        }

        try {
          const data = JSON.parse(body) as { channelId: string }
          await client.hangup(data.channelId)
          return Response.json({ ok: true })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Get recording audio
      if (path.startsWith('/recordings/') && method === 'GET') {
        // Accept signature from header or query param (for browser/curl convenience)
        const signature =
          request.headers.get('X-Bridge-Signature') ?? url.searchParams.get('sig') ?? ''
        const timestamp =
          request.headers.get('X-Bridge-Timestamp') ?? url.searchParams.get('ts') ?? ''

        // Strip sig/ts query params before verification
        const urlForSigning = new URL(url.toString())
        urlForSigning.searchParams.delete('sig')
        urlForSigning.searchParams.delete('ts')

        if (!signature || !timestamp) {
          return new Response('Forbidden', { status: 403 })
        }
        if (!webhook.verifySignature(urlForSigning.toString(), '', timestamp, signature)) {
          return new Response('Forbidden', { status: 403 })
        }

        const name = path.replace('/recordings/', '')
        try {
          const audio = await client.getRecordingFile(name)
          if (!audio) {
            return new Response('Not Found', { status: 404 })
          }
          return new Response(audio, {
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': String(audio.byteLength),
            },
          })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }

      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`[bridge] HTTP server listening on ${config.bridgeHost}:${config.bridgePort}`)

  // Connect to PBX
  try {
    await client.connect()
    console.log(`[bridge] Connected to ${config.pbxType}`)
  } catch (err) {
    console.error(`[bridge] Failed to connect to ${config.pbxType}:`, err)
    console.log('[bridge] Will retry connection...')
  }

  // Log startup info
  console.log(`[bridge] sip-bridge is running (PBX_TYPE=${config.pbxType})`)
  console.log(`[bridge] Webhook target: ${config.workerWebhookUrl}`)

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('[bridge] Shutting down...')
    handler.dispose()
    client.disconnect()
    server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

/**
 * Get the SIP endpoint format for a phone number based on PBX type.
 * This is used by the /ring endpoint to format the originate target.
 */
function getEndpointForPbx(pbxType: BridgeConfig['pbxType'], phone: string): string {
  switch (pbxType) {
    case 'asterisk':
      return `PJSIP/${phone}@trunk`
    case 'freeswitch':
      return `sofia/internal/${phone}@trunk`
    case 'kamailio':
      throw new Error('Kamailio is a SIP proxy — call origination is not supported')
  }
}

main().catch((err) => {
  console.error('[bridge] Fatal error:', err)
  process.exit(1)
})
