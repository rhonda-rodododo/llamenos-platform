import { describe, it, expect, beforeEach } from 'vitest'
import { CommandHandler } from './command-handler'
import type { BridgeClient, BridgeEvent } from './bridge-client'
import type { WebhookSender } from './webhook-sender'
import type { BridgeConfig, BridgeCommand } from './types'

// ---- Mock BridgeClient ----

function createMockClient(): BridgeClient & {
  calls: Array<{ method: string; args: unknown[] }>
} {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const track = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return Promise.resolve()
  }

  return {
    calls,
    connect: track('connect') as BridgeClient['connect'],
    disconnect: () => calls.push({ method: 'disconnect', args: [] }),
    isConnected: () => true,
    onEvent: () => {},
    offEvent: () => {},
    originate: (async (params: unknown) => {
      calls.push({ method: 'originate', args: [params] })
      return { id: `ch-${Date.now()}` }
    }) as BridgeClient['originate'],
    hangup: track('hangup') as BridgeClient['hangup'],
    answer: track('answer') as BridgeClient['answer'],
    bridge: (async (...args: unknown[]) => {
      calls.push({ method: 'bridge', args })
      return `bridge-${Date.now()}`
    }) as BridgeClient['bridge'],
    destroyBridge: track('destroyBridge') as BridgeClient['destroyBridge'],
    playMedia: (async (...args: unknown[]) => {
      calls.push({ method: 'playMedia', args })
      return `pb-${Date.now()}`
    }) as BridgeClient['playMedia'],
    stopPlayback: track('stopPlayback') as BridgeClient['stopPlayback'],
    startMoh: track('startMoh') as BridgeClient['startMoh'],
    stopMoh: track('stopMoh') as BridgeClient['stopMoh'],
    recordChannel: track('recordChannel') as BridgeClient['recordChannel'],
    recordBridge: track('recordBridge') as BridgeClient['recordBridge'],
    stopRecording: track('stopRecording') as BridgeClient['stopRecording'],
    getRecordingFile: (async () => null) as BridgeClient['getRecordingFile'],
    deleteRecording: track('deleteRecording') as BridgeClient['deleteRecording'],
    setChannelVar: track('setChannelVar') as BridgeClient['setChannelVar'],
    getChannelVar: (async () => '') as BridgeClient['getChannelVar'],
    healthCheck: (async () => ({
      ok: true,
      latencyMs: 5,
    })) as BridgeClient['healthCheck'],
    listChannels: (async () => []) as BridgeClient['listChannels'],
    listBridges: (async () => []) as BridgeClient['listBridges'],
  }
}

// ---- Mock WebhookSender ----

function createMockWebhook(
  responseCommands?: BridgeCommand[] | null
): WebhookSender & { sentWebhooks: Array<{ path: string; payload: unknown }> } {
  const sentWebhooks: Array<{ path: string; payload: unknown }> = []
  return {
    sentWebhooks,
    sendWebhookForCommands: async (path: string, payload: unknown) => {
      sentWebhooks.push({ path, payload })
      return responseCommands ?? null
    },
    sendWebhook: async () => new Response('OK', { status: 200 }),
    verifySignature: () => true,
  } as unknown as WebhookSender & { sentWebhooks: Array<{ path: string; payload: unknown }> }
}

const baseConfig: BridgeConfig = {
  pbxType: 'asterisk',
  ariUrl: '',
  ariRestUrl: '',
  ariUsername: '',
  ariPassword: '',
  eslHost: '',
  eslPort: 8021,
  eslPassword: '',
  kamailioJsonrpcUrl: '',
  workerWebhookUrl: 'http://worker:3000',
  bridgeSecret: 'test-secret',
  bridgePort: 3000,
  bridgeHost: '0.0.0.0',
  stasisApp: 'llamenos',
  connectionTimeoutMs: 300000,
}

describe('CommandHandler', () => {
  let client: ReturnType<typeof createMockClient>
  let webhook: ReturnType<typeof createMockWebhook>
  let handler: CommandHandler

  beforeEach(() => {
    client = createMockClient()
    webhook = createMockWebhook()
    handler = new CommandHandler(client, webhook, baseConfig)
    handler.setHotlineNumber('+15551234567')
  })

  // ================================================================
  // Gather digit buffering
  // ================================================================

  describe('gather digit buffering', () => {
    it('collects DTMF digits up to numDigits and sends result', async () => {
      // Create an incoming call
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-1',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Execute a gather command
      await handler.executeCommands([
        {
          action: 'gather',
          channelId: 'ch-1',
          numDigits: 3,
          timeout: 10,
          callbackPath: '/api/telephony/language',
          callbackParams: { hubId: 'hub-1' },
        },
      ])

      // Send DTMF digits one at a time
      await handler.handleEvent({
        type: 'dtmf_received',
        channelId: 'ch-1',
        digit: '1',
        durationMs: 100,
        timestamp: new Date().toISOString(),
      })

      // Not enough digits yet — no webhook sent beyond the initial incoming
      expect(webhook.sentWebhooks.length).toBe(1) // only the incoming webhook

      await handler.handleEvent({
        type: 'dtmf_received',
        channelId: 'ch-1',
        digit: '2',
        durationMs: 100,
        timestamp: new Date().toISOString(),
      })

      expect(webhook.sentWebhooks.length).toBe(1) // still waiting

      await handler.handleEvent({
        type: 'dtmf_received',
        channelId: 'ch-1',
        digit: '3',
        durationMs: 100,
        timestamp: new Date().toISOString(),
      })

      // Now we should have the gather result webhook
      expect(webhook.sentWebhooks.length).toBe(2)
      const gatherWebhook = webhook.sentWebhooks[1]
      expect(gatherWebhook.path).toBe('/api/telephony/language')
      expect((gatherWebhook.payload as { digits: string }).digits).toBe('123')
    })

    it('does not send gather result for digits without active gather', async () => {
      // Create call
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-2',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Send DTMF without a gather — should be ignored
      await handler.handleEvent({
        type: 'dtmf_received',
        channelId: 'ch-2',
        digit: '5',
        durationMs: 100,
        timestamp: new Date().toISOString(),
      })

      // Only the incoming webhook, no gather result
      expect(webhook.sentWebhooks.length).toBe(1)
    })
  })

  // ================================================================
  // Tier 5 recording guard in execBridge
  // ================================================================

  describe('Tier 5 SFrame recording guard', () => {
    it('blocks recording for sframe mode calls', async () => {
      // Create an SFrame call (enters via sframe dialplan context)
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-sframe',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: ['sframe'],
        timestamp: new Date().toISOString(),
      })

      // Create a volunteer channel
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-vol',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: ['dialed', 'ch-sframe', 'pubkey123'],
        timestamp: new Date().toISOString(),
      })

      // Try to bridge with recording enabled
      await handler.executeCommands([
        {
          action: 'bridge',
          callerChannelId: 'ch-sframe',
          volunteerChannelId: 'ch-vol',
          record: true,
          recordingCallbackPath: '/api/telephony/recording',
        },
      ])

      // Bridge should be created
      const bridgeCalls = client.calls.filter((c) => c.method === 'bridge')
      expect(bridgeCalls.length).toBe(1)

      // But recording should NOT be started (SFrame guard blocks it)
      const recordCalls = client.calls.filter((c) => c.method === 'recordBridge')
      expect(recordCalls.length).toBe(0)
    })

    it('allows recording for pstn mode calls', async () => {
      // Create a PSTN call (no sframe arg)
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-pstn',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Create a volunteer channel (originated by us)
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-vol2',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: ['dialed', 'ch-pstn', 'pubkey456'],
        timestamp: new Date().toISOString(),
      })

      // Bridge with recording
      await handler.executeCommands([
        {
          action: 'bridge',
          callerChannelId: 'ch-pstn',
          volunteerChannelId: 'ch-vol2',
          record: true,
          recordingCallbackPath: '/api/telephony/recording',
        },
      ])

      // Both bridge and recording should happen
      const bridgeCalls = client.calls.filter((c) => c.method === 'bridge')
      expect(bridgeCalls.length).toBe(1)

      const recordCalls = client.calls.filter((c) => c.method === 'recordBridge')
      expect(recordCalls.length).toBe(1)
    })
  })

  // ================================================================
  // Cleanup on hangup
  // ================================================================

  describe('cleanup on hangup', () => {
    it('removes call state and sends status webhook on hangup', async () => {
      // Create a call
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-cleanup',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Verify call is tracked
      const statusBefore = handler.getStatus()
      expect(statusBefore.activeCalls).toBe(1)

      // Hang up
      await handler.handleEvent({
        type: 'channel_hangup',
        channelId: 'ch-cleanup',
        cause: 16, // NORMAL_CLEARING
        causeText: 'Normal Clearing',
        timestamp: new Date().toISOString(),
      })

      // Call should be cleaned up
      const statusAfter = handler.getStatus()
      expect(statusAfter.activeCalls).toBe(0)
    })

    it('clears gather timeout on hangup', async () => {
      // Create a call
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-gather-cleanup',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Start a gather
      await handler.executeCommands([
        {
          action: 'gather',
          channelId: 'ch-gather-cleanup',
          numDigits: 1,
          timeout: 30,
          callbackPath: '/api/telephony/language',
        },
      ])

      // Hang up while gather is active — should not throw
      await handler.handleEvent({
        type: 'channel_hangup',
        channelId: 'ch-gather-cleanup',
        cause: 16,
        causeText: 'Normal Clearing',
        timestamp: new Date().toISOString(),
      })

      expect(handler.getStatus().activeCalls).toBe(0)
    })

    it('clears queue state on hangup and sends queue-exit webhook', async () => {
      // Use a webhook mock that returns a queue command
      const queueWebhook = createMockWebhook([
        {
          action: 'queue',
          channelId: 'ch-queue',
          musicOnHold: 'default',
          exitCallbackPath: '/api/telephony/queue-exit',
        },
      ])
      const queueHandler = new CommandHandler(client, queueWebhook, baseConfig)
      queueHandler.setHotlineNumber('+15551234567')

      // Create a call — the incoming webhook response will queue it
      await queueHandler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-queue',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      expect(queueHandler.getStatus().activeQueues).toBe(1)

      // Hang up — should send queue-exit webhook with 'hangup' result
      await queueHandler.handleEvent({
        type: 'channel_hangup',
        channelId: 'ch-queue',
        cause: 16,
        causeText: 'Normal Clearing',
        timestamp: new Date().toISOString(),
      })

      expect(queueHandler.getStatus().activeCalls).toBe(0)
      expect(queueHandler.getStatus().activeQueues).toBe(0)

      // Check that queue-exit webhook was sent
      const exitWebhook = queueWebhook.sentWebhooks.find(
        (w) => w.path === '/api/telephony/queue-exit'
      )
      expect(exitWebhook).toBeTruthy()
      expect((exitWebhook!.payload as { queueResult: string }).queueResult).toBe('hangup')

      queueHandler.dispose()
    })

    it('cancels ringing channels when caller hangs up', async () => {
      // Create a caller
      await handler.handleEvent({
        type: 'channel_create',
        channelId: 'ch-caller',
        callerNumber: '+15559876543',
        calledNumber: '+15551234567',
        args: [],
        timestamp: new Date().toISOString(),
      })

      // Simulate ringing volunteers by executing a ring command
      await handler.executeCommands([
        {
          action: 'ring',
          endpoint: 'PJSIP/100@trunk',
          callerId: '+15559876543',
          timeout: 30,
          answerCallbackPath: '/api/telephony/volunteer-answer',
          answerCallbackParams: { parentCallSid: 'ch-caller', pubkey: 'pk1' },
          statusCallbackPath: '/api/telephony/call-status',
        },
      ])

      // Caller hangs up — should trigger cleanup of ringing channels
      await handler.handleEvent({
        type: 'channel_hangup',
        channelId: 'ch-caller',
        cause: 16,
        causeText: 'Normal Clearing',
        timestamp: new Date().toISOString(),
      })

      expect(handler.getStatus().activeCalls).toBe(0)
      expect(handler.getStatus().ringingChannels).toBe(0)
    })
  })

  // ================================================================
  // dispose
  // ================================================================

  describe('dispose', () => {
    it('cleans up background timers', () => {
      // Should not throw
      handler.dispose()
    })
  })
})
