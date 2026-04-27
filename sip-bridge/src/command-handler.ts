import type { BridgeClient, BridgeEvent } from './bridge-client'
import type { WebhookSender } from './webhook-sender'
import type {
  ActiveCall,
  BridgeCommand,
  BridgeConfig,
  RecordingCallbackEntry,
  WebhookPayload,
} from './types'
import { type CallMode, SframeModeDispatcher, parseStasisArgs } from './sframe-mode-dispatcher'

/** TTL for recording callbacks — entries older than this are pruned */
const RECORDING_CALLBACK_TTL_MS = 5 * 60 * 1000 // 5 minutes
/** Interval for the TTL sweep timer */
const RECORDING_CALLBACK_SWEEP_INTERVAL_MS = 60 * 1000 // 60 seconds

/**
 * CommandHandler — the central orchestrator that:
 * 1. Receives protocol-agnostic BridgeEvents and translates them into Worker webhooks
 * 2. Receives JSON commands from the Worker and executes them via BridgeClient
 * 3. Maintains call state for coordinating multi-step flows
 * 4. Enforces Tier 5 SFrame recording ban via SframeModeDispatcher
 */
export class CommandHandler {
  private readonly client: BridgeClient
  private readonly webhook: WebhookSender
  private readonly config: BridgeConfig
  private readonly sframeDispatcher = new SframeModeDispatcher()

  /** Active calls indexed by channel ID.
   *  Pruning: entries removed via cleanupCall() on channel_hangup. */
  private readonly calls = new Map<string, ActiveCall>()

  /** Map of queue name (= parentCallSid) → caller channel ID.
   *  Pruning: entries removed via cleanupCall(). */
  private readonly queues = new Map<string, string>()

  /** Map of bridge ID → { callerChannelId, volunteerChannelId }.
   *  Pruning: entries removed via cleanupCall() → cleanupBridge(). */
  private readonly bridges = new Map<string, { callerChannelId: string; volunteerChannelId: string }>()

  /** Map of recording name → callback info.
   *  Pruning: event-driven on recording_complete/recording_failed, TTL sweep every 60s,
   *  and bulk removal per-channel via cleanupCall(). */
  private readonly recordingCallbacks = new Map<string, RecordingCallbackEntry>()

  /** Map of volunteer channel ID → parent call SID (for ringing coordination).
   *  Pruning: entries removed via cleanupCall() and volunteer hangup path. */
  private readonly ringingMap = new Map<string, string>()

  /** Configured hotline number (for the calledNumber field) */
  private hotlineNumber = ''

  /** Handle for the recording callback TTL sweep interval */
  private readonly recordingCallbackSweepTimer: ReturnType<typeof setInterval>

  constructor(client: BridgeClient, webhook: WebhookSender, config: BridgeConfig) {
    this.client = client
    this.webhook = webhook
    this.config = config

    // Start periodic TTL sweep for stale recording callbacks
    this.recordingCallbackSweepTimer = setInterval(() => {
      this.pruneStaleRecordingCallbacks()
    }, RECORDING_CALLBACK_SWEEP_INTERVAL_MS)
  }

  /** Stop background timers (for graceful shutdown) */
  dispose(): void {
    clearInterval(this.recordingCallbackSweepTimer)
  }

  /** Set the hotline phone number (for webhook payloads) */
  setHotlineNumber(number: string): void {
    this.hotlineNumber = number
  }

  // ================================================================
  // Centralized Call Lifecycle Cleanup
  // ================================================================

  /**
   * cleanupCall — single function that tears down ALL state for a call.
   * Must be called unconditionally when a call ends (channel_hangup).
   * Clears: gather timeout, queue interval, recording callbacks, bridges,
   * ringing channels, and finally removes from the calls Map.
   */
  private cleanupCall(channelId: string): void {
    const call = this.calls.get(channelId)
    if (call) {
      // 1. Clear gather timeout timer
      if (call.activeGather?.timeoutTimer) {
        clearTimeout(call.activeGather.timeoutTimer)
        call.activeGather = undefined
      }

      // 2. Clear queue wait interval
      if (call.queue?.waitTimer) {
        clearInterval(call.queue.waitTimer)
        call.queue = undefined
      }

      // 3. Clean up bridge (hang up other leg, destroy bridge)
      this.cleanupBridge(channelId)

      // 4. Cancel all ringing channels spawned by this call
      this.cancelRingingForCall(channelId)

      // 5. Remove recording callbacks associated with this channel
      for (const [name, entry] of this.recordingCallbacks) {
        if (entry.channelId === channelId) {
          this.recordingCallbacks.delete(name)
        }
      }

      // 6. Remove from calls map
      this.calls.delete(channelId)
    }

    // 7. Remove from queues
    this.queues.delete(channelId)

    // 8. If this was a volunteer ringing channel, clean up ringing state
    const parentSid = this.ringingMap.get(channelId)
    if (parentSid) {
      this.ringingMap.delete(channelId)
      const parentCall = this.calls.get(parentSid)
      if (parentCall) {
        parentCall.ringingChannels = parentCall.ringingChannels.filter((id) => id !== channelId)
      }
    }
  }

  /** Prune recording callbacks older than RECORDING_CALLBACK_TTL_MS */
  private pruneStaleRecordingCallbacks(): void {
    const now = Date.now()
    let pruned = 0
    for (const [name, entry] of this.recordingCallbacks) {
      if (now - entry.createdAt > RECORDING_CALLBACK_TTL_MS) {
        this.recordingCallbacks.delete(name)
        pruned++
      }
    }
    if (pruned > 0) {
      console.log(`[handler] Pruned ${pruned} stale recording callback(s)`)
    }
  }

  // ================================================================
  // BridgeEvent Handler (protocol-agnostic)
  // ================================================================

  /** Process a protocol-agnostic BridgeEvent */
  async handleEvent(event: BridgeEvent): Promise<void> {
    switch (event.type) {
      case 'channel_create':
        await this.onChannelCreate(event)
        break
      case 'channel_answer':
        // Answer events are informational — we act on create and hangup
        break
      case 'channel_hangup':
        await this.onChannelHangup(event)
        break
      case 'dtmf_received':
        await this.onDtmfReceived(event)
        break
      case 'recording_complete':
        await this.onRecordingComplete(event)
        break
      case 'recording_failed':
        await this.onRecordingFailed(event)
        break
      case 'playback_finished':
        await this.onPlaybackFinished(event)
        break
    }
  }

  /** channel_create — new call entered the bridge application */
  private async onChannelCreate(event: BridgeEvent & { type: 'channel_create' }): Promise<void> {
    const args = event.args ?? []

    console.log(
      `[handler] channel_create id=${event.channelId} caller=${event.callerNumber} args=${args.join(',')}`
    )

    // Check if this is a volunteer outbound leg (originated by us for ringing)
    if (args[0] === 'dialed') {
      const parentCallSid = args[1]
      const pubkey = args[2]
      if (parentCallSid && pubkey) {
        await this.onVolunteerAnswered(event.channelId, parentCallSid, pubkey)
      }
      return
    }

    // Incoming call — parse args into a CallMode. The dialplan passes `sframe`
    // from the [volunteers-sframe] context; PSTN trunk contexts pass no args,
    // which defaults to mode='pstn'.
    const callMode = parseStasisArgs(args)

    // Answer the channel
    await this.client.answer(event.channelId)

    const call: ActiveCall = {
      channelId: event.channelId,
      callerNumber: event.callerNumber || 'unknown',
      calledNumber: event.calledNumber || this.hotlineNumber,
      startedAt: Date.now(),
      mode: callMode.mode,
      ringingChannels: [],
      dtmfBuffer: '',
    }
    this.calls.set(event.channelId, call)

    // Send incoming webhook to Worker
    const payload: WebhookPayload = {
      event: 'incoming',
      channelId: event.channelId,
      callerNumber: call.callerNumber,
      calledNumber: call.calledNumber,
    }

    const commands = await this.webhook.sendWebhookForCommands(
      '/api/telephony/incoming',
      payload
    )
    if (commands) {
      await this.executeCommands(commands)
    }
  }

  /** channel_hangup — channel destroyed */
  private async onChannelHangup(event: BridgeEvent & { type: 'channel_hangup' }): Promise<void> {
    console.log(
      `[handler] channel_hangup id=${event.channelId} cause=${event.cause} (${event.causeText})`
    )

    // Send call-status webhook for volunteer calls before cleanup
    const parentSid = this.ringingMap.get(event.channelId)
    if (parentSid) {
      const parentCall = this.calls.get(parentSid)
      const callerNumber = parentCall?.callerNumber ?? 'unknown'

      // Map Q.850 cause codes to call status
      let callStatus: 'completed' | 'busy' | 'no-answer' | 'failed' = 'completed'
      switch (event.cause) {
        case 17:
          callStatus = 'busy'
          break // User busy
        case 19:
          callStatus = 'no-answer'
          break // No answer
        case 21:
          callStatus = 'failed'
          break // Call rejected
        default:
          callStatus = 'completed'
      }

      const payload: WebhookPayload = {
        event: 'call-status',
        channelId: event.channelId,
        callerNumber,
        calledNumber: this.hotlineNumber,
        callStatus,
      }

      await this.webhook.sendWebhookForCommands(
        '/api/telephony/call-status',
        payload,
        { parentCallSid: parentSid }
      )
    }

    // If caller was in queue, send queue-exit webhook with 'hangup' result
    const call = this.calls.get(event.channelId)
    if (call?.queue) {
      await this.sendQueueExit(event.channelId, call, 'hangup')
    }

    // Unconditional cleanup
    this.cleanupCall(event.channelId)
  }

  /** DTMF digit received */
  private async onDtmfReceived(event: BridgeEvent & { type: 'dtmf_received' }): Promise<void> {
    console.log(`[handler] dtmf_received id=${event.channelId} digit=${event.digit}`)

    const call = this.calls.get(event.channelId)
    if (!call) return

    // If there's an active gather, add the digit to the buffer
    if (call.activeGather) {
      call.dtmfBuffer += event.digit

      // Check if we've collected enough digits
      if (call.dtmfBuffer.length >= call.activeGather.numDigits) {
        // Clear the timeout
        if (call.activeGather.timeoutTimer) {
          clearTimeout(call.activeGather.timeoutTimer)
        }

        const digits = call.dtmfBuffer
        const gather = call.activeGather
        call.dtmfBuffer = ''
        call.activeGather = undefined

        // Stop any playing prompt
        try {
          await this.client.stopPlayback(`gather-${event.channelId}`)
        } catch {
          /* playback may not exist */
        }

        // Send digits to Worker via callback
        await this.sendGatherResult(
          event.channelId,
          call,
          digits,
          gather.callbackPath,
          gather.callbackParams
        )
      }
    }
  }

  /** Recording completed */
  private async onRecordingComplete(
    event: BridgeEvent & { type: 'recording_complete' }
  ): Promise<void> {
    console.log(
      `[handler] recording_complete name=${event.recordingName} duration=${event.duration}`
    )

    const callback = this.recordingCallbacks.get(event.recordingName)
    if (callback) {
      const call = this.calls.get(callback.channelId)
      const payload: WebhookPayload = {
        event: 'call-recording',
        channelId: callback.channelId,
        callerNumber: call?.callerNumber ?? 'unknown',
        calledNumber: this.hotlineNumber,
        recordingStatus: 'completed',
        recordingName: event.recordingName,
      }
      await this.webhook.sendWebhookForCommands(callback.callbackPath, payload, callback.callbackParams)
      this.recordingCallbacks.delete(event.recordingName)
    }
  }

  /** Recording failed */
  private async onRecordingFailed(
    event: BridgeEvent & { type: 'recording_failed' }
  ): Promise<void> {
    console.log(`[handler] recording_failed name=${event.recordingName}`)

    const callback = this.recordingCallbacks.get(event.recordingName)
    if (callback) {
      const call = this.calls.get(callback.channelId)
      const payload: WebhookPayload = {
        event: 'call-recording',
        channelId: callback.channelId,
        callerNumber: call?.callerNumber ?? 'unknown',
        calledNumber: this.hotlineNumber,
        recordingStatus: 'failed',
        recordingName: event.recordingName,
      }
      await this.webhook.sendWebhookForCommands(callback.callbackPath, payload, callback.callbackParams)
      this.recordingCallbacks.delete(event.recordingName)
    }
  }

  /** Playback finished */
  private async onPlaybackFinished(
    event: BridgeEvent & { type: 'playback_finished' }
  ): Promise<void> {
    // If this was a gather prompt that finished without digits, handle timeout
    if (event.playbackId.startsWith('gather-')) {
      const channelId = event.playbackId.replace('gather-', '')
      const call = this.calls.get(channelId)
      if (call?.activeGather && call.dtmfBuffer.length === 0) {
        // Start the timeout timer for DTMF input after prompt finishes
        const gather = call.activeGather
        call.activeGather.timeoutTimer = setTimeout(async () => {
          // Timeout — send empty digits
          if (call.activeGather === gather) {
            call.activeGather = undefined
            call.dtmfBuffer = ''
            await this.sendGatherResult(
              channelId,
              call,
              '',
              gather.callbackPath,
              gather.callbackParams
            )
          }
        }, gather.timeout * 1000)
      }
    }
  }

  // ================================================================
  // Volunteer Ringing
  // ================================================================

  /** Called when a volunteer answers an outbound ringing call */
  private async onVolunteerAnswered(
    volunteerChannelId: string,
    parentCallSid: string,
    pubkey: string
  ): Promise<void> {
    console.log(
      `[handler] Volunteer answered channel=${volunteerChannelId} parent=${parentCallSid} pubkey=${pubkey}`
    )

    const parentCall = this.calls.get(parentCallSid)
    const payload: WebhookPayload = {
      event: 'volunteer-answer',
      channelId: volunteerChannelId,
      callerNumber: parentCall?.callerNumber ?? 'unknown',
      calledNumber: this.hotlineNumber,
    }

    const commands = await this.webhook.sendWebhookForCommands(
      '/api/telephony/volunteer-answer',
      payload,
      { parentCallSid, pubkey }
    )

    // Cancel ringing for other volunteers
    if (parentCall) {
      for (const ringChannelId of parentCall.ringingChannels) {
        if (ringChannelId !== volunteerChannelId) {
          try {
            await this.client.hangup(ringChannelId)
          } catch {
            /* may already be gone */
          }
        }
      }
      parentCall.ringingChannels = []
    }

    if (commands) {
      await this.executeCommands(commands)
    }
  }

  // ================================================================
  // Command Execution
  // ================================================================

  /** Execute a list of bridge commands received as JSON from the Worker */
  async executeCommands(commands: BridgeCommand[]): Promise<void> {
    for (const cmd of commands) {
      try {
        await this.executeCommand(cmd)
      } catch (err) {
        console.error(`[handler] Command failed:`, cmd.action, err)
      }
    }
  }

  /** Execute a single bridge command */
  private async executeCommand(cmd: BridgeCommand): Promise<void> {
    switch (cmd.action) {
      case 'playback':
        await this.execPlayback(cmd)
        break
      case 'gather':
        await this.execGather(cmd)
        break
      case 'bridge':
        await this.execBridge(cmd)
        break
      case 'hangup':
        await this.execHangup(cmd)
        break
      case 'record':
        await this.execRecord(cmd)
        break
      case 'ring':
        await this.execRing(cmd)
        break
      case 'queue':
        await this.execQueue(cmd)
        break
      case 'reject':
        await this.execReject(cmd)
        break
      case 'redirect':
        await this.execRedirect(cmd)
        break
    }
  }

  /** Play audio on a channel */
  private async execPlayback(cmd: PlaybackCommand): Promise<void> {
    if (cmd.text) {
      // TTS — use PBX-specific TTS engine or pre-rendered audio
      console.log(
        `[handler] TTS playback: "${cmd.text.substring(0, 50)}..." lang=${cmd.language}`
      )
      try {
        await this.client.playMedia(cmd.channelId, `sound:beep`)
      } catch (err) {
        console.warn(`[handler] TTS playback failed, channel may be gone:`, err)
      }
    } else {
      const media = cmd.media.startsWith('http') ? cmd.media : `sound:${cmd.media}`
      try {
        await this.client.playMedia(cmd.channelId, media)
      } catch (err) {
        console.warn(`[handler] Playback failed:`, err)
      }
    }
  }

  /** Gather DTMF digits */
  private async execGather(cmd: GatherCommand): Promise<void> {
    const call = this.calls.get(cmd.channelId)
    if (!call) return

    // Set up gather state
    call.dtmfBuffer = ''
    call.activeGather = {
      numDigits: cmd.numDigits,
      timeout: cmd.timeout,
      callbackPath: cmd.callbackPath,
      callbackParams: cmd.callbackParams,
    }

    // Play the prompt (if any)
    if (cmd.text || cmd.media) {
      const media = cmd.media
        ? cmd.media.startsWith('http')
          ? cmd.media
          : `sound:${cmd.media}`
        : 'sound:beep'
      try {
        await this.client.playMedia(cmd.channelId, media, `gather-${cmd.channelId}`)
      } catch (err) {
        console.warn(`[handler] Gather playback failed:`, err)
        // Start timeout even if playback fails
        call.activeGather.timeoutTimer = setTimeout(async () => {
          if (call.activeGather) {
            const gather = call.activeGather
            call.activeGather = undefined
            call.dtmfBuffer = ''
            await this.sendGatherResult(
              cmd.channelId,
              call,
              '',
              gather.callbackPath,
              gather.callbackParams
            )
          }
        }, cmd.timeout * 1000)
      }
    } else {
      // No prompt — just wait for digits
      call.activeGather.timeoutTimer = setTimeout(async () => {
        if (call.activeGather) {
          const gather = call.activeGather
          call.activeGather = undefined
          const digits = call.dtmfBuffer
          call.dtmfBuffer = ''
          await this.sendGatherResult(
            cmd.channelId,
            call,
            digits,
            gather.callbackPath,
            gather.callbackParams
          )
        }
      }, cmd.timeout * 1000)
    }
  }

  /** Bridge two channels — enforces SFrame recording ban */
  private async execBridge(cmd: BridgeCallCommand): Promise<void> {
    // Resolve the caller channel from the queue
    let callerChannelId = cmd.callerChannelId
    const queuedCallerId = this.queues.get(callerChannelId)
    if (queuedCallerId) {
      callerChannelId = queuedCallerId
    }

    console.log(
      `[handler] Bridging caller=${callerChannelId} volunteer=${cmd.volunteerChannelId}`
    )

    // Stop hold music on the caller
    const callerCall = this.calls.get(callerChannelId)
    if (callerCall?.queue?.waitTimer) {
      clearInterval(callerCall.queue.waitTimer)
      callerCall.queue = undefined
    }
    try {
      await this.client.stopMoh(callerChannelId)
    } catch {
      /* may not be on hold */
    }

    // Create bridge — use passthrough for SFrame E2EE calls
    const bridgeType = cmd.bridgeType ?? 'mixing'
    const bridgeId = await this.client.bridge(callerChannelId, cmd.volunteerChannelId, {
      type: bridgeType,
      record: false, // We handle recording separately below
    })

    // Track bridge state
    this.bridges.set(bridgeId, {
      callerChannelId,
      volunteerChannelId: cmd.volunteerChannelId,
    })

    if (callerCall) {
      callerCall.bridgeId = bridgeId
    }

    // Start recording if requested — enforcing Tier 5 SFrame recording ban
    if (cmd.record) {
      // Bridge recording inherits the caller's call mode. SFrame calls MUST NOT
      // be recorded; throwing aborts the recording attempt without tearing down
      // the bridge, keeping the volunteer-to-volunteer leg up.
      // If no ActiveCall is tracked (shouldn't happen for a just-bridged call),
      // default to mode='sframe' (fail-closed) — never accidentally record.
      const guardMode: CallMode = { mode: callerCall?.mode ?? 'sframe' }
      try {
        this.sframeDispatcher.assertRecordingAllowed(guardMode)
      } catch (err) {
        console.warn('[handler] Skipping bridge recording (Tier 5 SFrame):', err)
        return
      }

      const recordingName = `call-${callerChannelId}-${Date.now()}`
      try {
        await this.client.recordBridge(bridgeId, {
          name: recordingName,
          format: 'wav',
        })

        if (cmd.recordingCallbackPath) {
          this.recordingCallbacks.set(recordingName, {
            callbackPath: cmd.recordingCallbackPath,
            callbackParams: cmd.recordingCallbackParams ?? {},
            channelId: callerChannelId,
            createdAt: Date.now(),
          })
        }
      } catch (err) {
        console.error('[handler] Failed to start bridge recording:', err)
      }
    }
  }

  /** Hang up a channel */
  private async execHangup(cmd: HangupCommand): Promise<void> {
    console.log(`[handler] Hangup channel=${cmd.channelId}`)
    await this.client.hangup(cmd.channelId)
  }

  /** Record a channel — enforces Tier 5 SFrame recording ban */
  private async execRecord(cmd: RecordCommand): Promise<void> {
    console.log(`[handler] Recording channel=${cmd.channelId} name=${cmd.name}`)

    // Tier 5 voice E2EE guard — look up the call's mode and refuse to record
    // SFrame calls. Default to mode='pstn' for untracked channels so the
    // voicemail flow keeps working for PSTN callers.
    const callForGuard = this.calls.get(cmd.channelId)
    const guardMode: CallMode = { mode: callForGuard?.mode ?? 'pstn' }
    try {
      this.sframeDispatcher.assertRecordingAllowed(guardMode)
    } catch (err) {
      console.warn('[handler] Skipping channel recording (Tier 5 SFrame):', err)
      return
    }

    if (cmd.beep) {
      try {
        await this.client.playMedia(cmd.channelId, 'tone:1004/200')
      } catch {
        /* beep failed, continue anyway */
      }
    }

    try {
      await this.client.recordChannel(cmd.channelId, {
        name: cmd.name,
        format: 'wav',
        maxDurationSeconds: cmd.maxDuration,
        beep: false, // We already beeped
        terminateOn: '#',
      })

      this.recordingCallbacks.set(cmd.name, {
        callbackPath: cmd.callbackPath,
        callbackParams: cmd.callbackParams ?? {},
        channelId: cmd.channelId,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error('[handler] Failed to start recording:', err)
    }
  }

  /** Originate an outbound call (ring a volunteer) */
  private async execRing(cmd: RingCommand): Promise<void> {
    console.log(`[handler] Ringing ${cmd.endpoint} for call`)

    try {
      const channel = await this.client.originate({
        endpoint: cmd.endpoint,
        callerId: cmd.callerId,
        timeout: cmd.timeout,
        appArgs: `dialed,${cmd.answerCallbackParams?.parentCallSid ?? ''},${cmd.answerCallbackParams?.pubkey ?? ''}`,
      })

      // Track this as a ringing channel
      const parentSid = cmd.answerCallbackParams?.parentCallSid
      if (parentSid) {
        this.ringingMap.set(channel.id, parentSid)
        const parentCall = this.calls.get(parentSid)
        if (parentCall) {
          parentCall.ringingChannels.push(channel.id)
        }
      }

      console.log(`[handler] Originated channel=${channel.id} for ${cmd.endpoint}`)
    } catch (err) {
      console.error(`[handler] Failed to originate call to ${cmd.endpoint}:`, err)
    }
  }

  /** Place a caller in queue (hold with music) */
  private async execQueue(cmd: QueueCommand): Promise<void> {
    const call = this.calls.get(cmd.channelId)
    if (!call) return

    console.log(`[handler] Queuing channel=${cmd.channelId}`)

    // Register this channel as the queue for its callSid
    this.queues.set(cmd.channelId, cmd.channelId)

    // Start music on hold
    try {
      await this.client.startMoh(cmd.channelId, cmd.musicOnHold ?? 'default')
    } catch (err) {
      console.warn('[handler] Failed to start MOH:', err)
    }

    // Set up periodic wait callback
    const queueStartTime = Date.now()

    call.queue = {
      startedAt: queueStartTime,
      exitCallbackPath: cmd.exitCallbackPath,
      callbackParams: cmd.callbackParams,
    }

    if (cmd.waitCallbackPath) {
      call.queue.waitTimer = setInterval(async () => {
        const queueTime = Math.floor((Date.now() - queueStartTime) / 1000)

        const payload: WebhookPayload = {
          event: 'wait-music',
          channelId: cmd.channelId,
          callerNumber: call.callerNumber,
          calledNumber: this.hotlineNumber,
          queueTime,
        }

        try {
          const commands = await this.webhook.sendWebhookForCommands(
            cmd.waitCallbackPath!,
            payload,
            cmd.callbackParams
          )

          if (commands) {
            // Check for leave_queue redirect (means leave queue → voicemail)
            const leaveCmd = commands.find(
              (c) => c.action === 'redirect' && 'path' in c && c.path === '__leave_queue__'
            )
            if (leaveCmd) {
              this.cleanupCallQueue(cmd.channelId)
              await this.sendQueueExit(cmd.channelId, call, 'leave')
            }
          }
        } catch (err) {
          console.error('[handler] Wait callback failed:', err)
        }
      }, (cmd.waitCallbackInterval ?? 10) * 1000) as unknown as ReturnType<typeof setTimeout>
    }
  }

  /** Reject a call */
  private async execReject(cmd: RejectCommand): Promise<void> {
    console.log(`[handler] Rejecting channel=${cmd.channelId}`)
    await this.client.hangup(cmd.channelId)
  }

  /** Redirect — send a new webhook to the Worker */
  private async execRedirect(cmd: RedirectCommand): Promise<void> {
    if (cmd.path === '__leave_queue__') {
      // Handled by queue logic
      return
    }

    console.log(`[handler] Redirect channel=${cmd.channelId} to ${cmd.path}`)

    const call = this.calls.get(cmd.channelId)
    const payload: WebhookPayload = {
      event: 'incoming', // Generic event for redirects
      channelId: cmd.channelId,
      callerNumber: call?.callerNumber ?? 'unknown',
      calledNumber: this.hotlineNumber,
    }

    const commands = await this.webhook.sendWebhookForCommands(cmd.path, payload, cmd.params)
    if (commands) {
      await this.executeCommands(commands)
    }
  }

  // ================================================================
  // HTTP Command Handler (for commands received from Worker)
  // ================================================================

  /**
   * Handle an HTTP command from the Worker.
   * The Worker can send direct commands to control calls.
   */
  async handleHttpCommand(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const action = body.action as string
      if (!action) return { ok: false, error: 'Missing action' }

      switch (action) {
        case 'hangup': {
          const channelId = body.channelId as string
          if (!channelId) return { ok: false, error: 'Missing channelId' }
          await this.client.hangup(channelId)
          return { ok: true }
        }

        case 'ring': {
          const cmd = body as unknown as RingCommand
          await this.execRing(cmd)
          return { ok: true }
        }

        case 'cancelRinging': {
          const channelIds = body.channelIds as string[]
          const exceptId = body.exceptId as string | undefined
          if (!channelIds) return { ok: false, error: 'Missing channelIds' }
          for (const id of channelIds) {
            if (id !== exceptId) {
              try {
                await this.client.hangup(id)
              } catch {
                /* may already be gone */
              }
            }
          }
          return { ok: true }
        }

        case 'getRecordingAudio': {
          return { ok: false, error: 'Use GET /recordings/:name endpoint' }
        }

        case 'status': {
          return {
            ok: true,
            ...this.getStatus(),
          } as { ok: boolean }
        }

        default:
          return { ok: false, error: `Unknown action: ${action}` }
      }
    } catch (err) {
      console.error('[handler] HTTP command failed:', err)
      return { ok: false, error: String(err) }
    }
  }

  /** Get bridge status for monitoring */
  getStatus(): Record<string, unknown> {
    return {
      activeCalls: this.calls.size,
      activeQueues: this.queues.size,
      activeBridges: this.bridges.size,
      ringingChannels: this.ringingMap.size,
      pendingRecordings: this.recordingCallbacks.size,
    }
  }

  // ================================================================
  // Helper Methods
  // ================================================================

  /** Send gathered DTMF digits to the Worker */
  private async sendGatherResult(
    channelId: string,
    call: ActiveCall,
    digits: string,
    callbackPath: string,
    callbackParams?: Record<string, string>
  ): Promise<void> {
    const payload: WebhookPayload = {
      event: 'language-selected',
      channelId,
      callerNumber: call.callerNumber,
      calledNumber: this.hotlineNumber,
      digits,
    }

    const commands = await this.webhook.sendWebhookForCommands(
      callbackPath,
      payload,
      callbackParams
    )
    if (commands) {
      await this.executeCommands(commands)
    }
  }

  /** Send queue-exit webhook */
  private async sendQueueExit(
    channelId: string,
    call: ActiveCall,
    result: 'leave' | 'queue-full' | 'error' | 'bridged' | 'hangup'
  ): Promise<void> {
    const exitPath = call.queue?.exitCallbackPath
    if (!exitPath) return

    const payload: WebhookPayload = {
      event: 'queue-exit',
      channelId,
      callerNumber: call.callerNumber,
      calledNumber: this.hotlineNumber,
      queueResult: result,
    }

    const commands = await this.webhook.sendWebhookForCommands(
      exitPath,
      payload,
      call.queue?.callbackParams
    )
    if (commands) {
      await this.executeCommands(commands)
    }
  }

  /** Clean up queue state for a call (used by queue leave logic) */
  private cleanupCallQueue(channelId: string): void {
    const call = this.calls.get(channelId)
    if (call?.queue?.waitTimer) {
      clearInterval(call.queue.waitTimer)
      call.queue = undefined
    }
    this.queues.delete(channelId)
  }

  /** Clean up bridge state for a call */
  private cleanupBridge(channelId: string): void {
    for (const [bridgeId, state] of this.bridges) {
      if (state.callerChannelId === channelId || state.volunteerChannelId === channelId) {
        const otherChannel =
          state.callerChannelId === channelId
            ? state.volunteerChannelId
            : state.callerChannelId

        this.client.hangup(otherChannel).catch(() => {})
        this.client.destroyBridge(bridgeId).catch(() => {})
        this.bridges.delete(bridgeId)
        break
      }
    }
  }

  /** Cancel all ringing channels for a call */
  private cancelRingingForCall(channelId: string): void {
    const call = this.calls.get(channelId)
    if (!call) return

    for (const ringId of call.ringingChannels) {
      this.client.hangup(ringId).catch(() => {})
      this.ringingMap.delete(ringId)
    }
    call.ringingChannels = []
  }
}

// Re-export command types for use in executeCommand type narrowing
import type {
  PlaybackCommand,
  GatherCommand,
  BridgeCallCommand,
  HangupCommand,
  RecordCommand,
  RingCommand,
  QueueCommand,
  RejectCommand,
  RedirectCommand,
} from './types'
