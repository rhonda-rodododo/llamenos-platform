import { AriClient } from './ari-client'
import { WebhookSender } from './webhook-sender'
import { CommandHandler } from './command-handler'
import type { BridgeConfig } from './types'

/** Load configuration from environment variables */
function loadConfig(): BridgeConfig {
  const ariUrl = process.env.ARI_URL ?? 'ws://localhost:8088/ari/events'
  const ariRestUrl = process.env.ARI_REST_URL ?? 'http://localhost:8088/ari'
  const ariUsername = process.env.ARI_USERNAME
  const ariPassword = process.env.ARI_PASSWORD
  const workerWebhookUrl = process.env.WORKER_WEBHOOK_URL
  const bridgeSecret = process.env.BRIDGE_SECRET
  const bridgePort = parseInt(process.env.BRIDGE_PORT ?? '3000', 10)
  const stasisApp = process.env.STASIS_APP ?? 'llamenos'

  if (!ariUsername) throw new Error('ARI_USERNAME is required')
  if (!ariPassword) throw new Error('ARI_PASSWORD is required')
  if (!workerWebhookUrl) throw new Error('WORKER_WEBHOOK_URL is required')
  if (!bridgeSecret) throw new Error('BRIDGE_SECRET is required')

  return {
    ariUrl,
    ariRestUrl,
    ariUsername,
    ariPassword,
    workerWebhookUrl,
    bridgeSecret,
    bridgePort,
    stasisApp,
  }
}

async function main(): Promise<void> {
  console.log('[bridge] Starting Asterisk ARI Bridge...')

  const config = loadConfig()

  // Initialize components
  const ari = new AriClient(config)
  const webhook = new WebhookSender(config)
  const handler = new CommandHandler(ari, webhook, config)

  // Set hotline number from env (optional — will be overridden by Worker config)
  if (process.env.HOTLINE_NUMBER) {
    handler.setHotlineNumber(process.env.HOTLINE_NUMBER)
  }

  // Register ARI event handler
  ari.onEvent((event) => {
    handler.handleEvent(event).catch(err => {
      console.error('[bridge] Event handler error:', err)
    })
  })

  // Start HTTP server for Worker commands
  const server = Bun.serve({
    port: config.bridgePort,
    hostname: '127.0.0.1', // Bind to localhost only — must not be internet-facing
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method

      // Health check
      if (path === '/health' && method === 'GET') {
        const status = handler.getStatus()
        return Response.json({
          status: 'ok',
          uptime: process.uptime(),
          ...status,
        })
      }

      // Status endpoint (detailed)
      if (path === '/status' && method === 'GET') {
        try {
          const ariInfo = await ari.getAsteriskInfo()
          const channels = await ari.listChannels()
          const bridges = await ari.listBridges()
          return Response.json({
            status: 'ok',
            bridge: handler.getStatus(),
            asterisk: ariInfo,
            channels: channels.length,
            bridges: bridges.length,
          })
        } catch (err) {
          return Response.json({
            status: 'error',
            error: String(err),
            bridge: handler.getStatus(),
          }, { status: 500 })
        }
      }

      // Command endpoint — receives commands from CF Worker
      if (path === '/command' && method === 'POST') {
        // Verify signature
        const signature = request.headers.get('X-Bridge-Signature') ?? ''
        const body = await request.clone().text()

        if (config.bridgeSecret) {
          const isValid = await webhook.verifySignature(url.toString(), body, signature)
          if (!isValid) {
            console.warn('[bridge] Invalid command signature')
            return new Response('Forbidden', { status: 403 })
          }
        }

        try {
          const data = JSON.parse(body) as Record<string, unknown>
          const result = await handler.handleHttpCommand(data)
          return Response.json(result, { status: result.ok ? 200 : 400 })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Ring volunteers endpoint — Worker calls this to initiate parallel ringing
      if (path === '/ring' && method === 'POST') {
        const signature = request.headers.get('X-Bridge-Signature') ?? ''
        const body = await request.clone().text()

        if (config.bridgeSecret) {
          const isValid = await webhook.verifySignature(url.toString(), body, signature)
          if (!isValid) {
            return new Response('Forbidden', { status: 403 })
          }
        }

        try {
          const data = JSON.parse(body) as {
            callSid: string
            callerNumber: string
            volunteers: Array<{ pubkey: string; phone: string }>
            callbackUrl: string
          }

          const channelIds: string[] = []

          for (const vol of data.volunteers) {
            // Convert phone number to SIP endpoint
            // Format: PJSIP/phone@trunk
            const endpoint = `PJSIP/${vol.phone}@trunk`

            try {
              const channel = await ari.originate({
                endpoint,
                callerId: data.callerNumber,
                timeout: 30,
                app: config.stasisApp,
                appArgs: `dialed,${data.callSid},${vol.pubkey}`,
              })
              channelIds.push(channel.id)

              // Track ringing state
              const parentCall = handler['calls'].get(data.callSid)
              if (parentCall) {
                parentCall.ringingChannels.push(channel.id)
              }
              handler['ringingMap'].set(channel.id, data.callSid)
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
        const signature = request.headers.get('X-Bridge-Signature') ?? ''
        const body = await request.clone().text()

        if (config.bridgeSecret) {
          const isValid = await webhook.verifySignature(url.toString(), body, signature)
          if (!isValid) {
            return new Response('Forbidden', { status: 403 })
          }
        }

        try {
          const data = JSON.parse(body) as { channelIds: string[]; exceptId?: string }
          for (const id of data.channelIds) {
            if (id !== data.exceptId) {
              try {
                await ari.hangupChannel(id)
              } catch { /* may already be gone */ }
            }
          }
          return Response.json({ ok: true })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      // Get recording audio
      if (path.startsWith('/recordings/') && method === 'GET') {
        const signature = request.headers.get('X-Bridge-Signature') ?? url.searchParams.get('sig') ?? ''
        // Allow either header or query param for signature (for simple GET requests)
        if (config.bridgeSecret && !signature) {
          return new Response('Forbidden', { status: 403 })
        }

        const name = path.replace('/recordings/', '')
        try {
          const audio = await ari.getRecordingFile(name)
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

      // Hangup endpoint — simple channel hangup
      if (path === '/hangup' && method === 'POST') {
        const signature = request.headers.get('X-Bridge-Signature') ?? ''
        const body = await request.clone().text()

        if (config.bridgeSecret) {
          const isValid = await webhook.verifySignature(url.toString(), body, signature)
          if (!isValid) {
            return new Response('Forbidden', { status: 403 })
          }
        }

        try {
          const data = JSON.parse(body) as { channelId: string }
          await ari.hangupChannel(data.channelId)
          return Response.json({ ok: true })
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 })
        }
      }

      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`[bridge] HTTP server listening on port ${config.bridgePort}`)

  // Connect to ARI WebSocket
  try {
    await ari.connect()
    console.log('[bridge] Connected to Asterisk ARI')
  } catch (err) {
    console.error('[bridge] Failed to connect to ARI:', err)
    console.log('[bridge] Will retry connection...')
  }

  // Verify ARI connectivity
  try {
    const info = await ari.getAsteriskInfo()
    console.log('[bridge] Asterisk info:', JSON.stringify(info).substring(0, 200))
  } catch (err) {
    console.warn('[bridge] Could not fetch Asterisk info (will retry on reconnect):', err)
  }

  console.log('[bridge] Asterisk ARI Bridge is running')
  console.log(`[bridge] Webhook target: ${config.workerWebhookUrl}`)
  console.log(`[bridge] ARI: ${config.ariUrl}`)
  console.log(`[bridge] Stasis app: ${config.stasisApp}`)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[bridge] Shutting down...')
    ari.disconnect()
    server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[bridge] Shutting down...')
    ari.disconnect()
    server.stop()
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[bridge] Fatal error:', err)
  process.exit(1)
})
